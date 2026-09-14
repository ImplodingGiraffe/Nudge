import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useStore } from '../store'
import type { Derived } from '../derive'
import { AiError, ask, userMessage } from './client'
import { aiAvailable, configVersion, keyStatus, readPrefs, subscribeConfig, type KeyStatus } from './config'
import { buildContext, describePending } from './context'
import { budgetFor, systemPrompt, thinkingFor, userTurn, type Surface } from './prompt'
import { schemaFor } from './schema'
import { parseReply, validateReply, type Proposal, type ValidatedReply } from './validate'
import { applyProposals, currentValidationState, type Created } from './apply'
import { runCommands } from './commands'
import { useCommandHost } from './commandHost'

export type AiStatus = 'idle' | 'thinking' | 'ready' | 'error'

export interface RunOptions {
  surface: Surface
  request?: string
  hint?: string
  focusAssignmentId?: string | null
  horizonDays?: number

  keepHistory?: boolean

  adjusting?: boolean
}

export interface AiState {
  status: AiStatus
  reply: ValidatedReply | null
  error: string | null

  via: { model: string; fallback: boolean; ms: number } | null

  surface: Surface | null
  history: { role: 'student' | 'nudge'; text: string }[]

  landed: { applied: Proposal[]; created: Created[] } | null
}

export function useAiConfig() {
  const version = useSyncExternalStore(subscribeConfig, configVersion, configVersion)
  return useMemo(
    () => ({
      version,
      available: aiAvailable(),
      status: keyStatus() as KeyStatus,
      prefs: readPrefs(),
    }),
    [version],
  )
}

export function useAI(derived: Derived, now: number) {
  const [state, setState] = useState<AiState>({
    status: 'idle',
    reply: null,
    error: null,
    via: null,
    surface: null,
    history: [],
    landed: null,
  })
  const abort = useRef<AbortController | null>(null)
  const config = useAiConfig()
  const host = useCommandHost()

  const commandsRun = useRef<string | null>(null)

  const lastRun = useRef<RunOptions | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const cancel = useCallback(() => {
    abort.current?.abort()
    abort.current = null
    setState((s) => (s.status === 'thinking' ? { ...s, status: s.reply ? 'ready' : 'idle' } : s))
  }, [])

  const reset = useCallback(() => {
    abort.current?.abort()
    abort.current = null
    setState({ status: 'idle', reply: null, error: null, via: null, surface: null, history: [], landed: null })
  }, [])

  const run = useCallback(
    async (opts: RunOptions): Promise<ValidatedReply | null> => {
      lastRun.current = opts
      if (!aiAvailable()) {
        setState((s) => ({ ...s, status: 'error', error: userMessage(new AiError('no-key', '')) }))
        return null
      }

      abort.current?.abort()
      const ctrl = new AbortController()
      abort.current = ctrl

      const priorHistory = opts.keepHistory ? state.history : []

      const drafts = state.reply?.proposals ?? []

      const refining = drafts.length > 0 && !!opts.adjusting
      const surface = refining && state.surface ? state.surface : opts.surface

      setState((s) => ({
        status: 'thinking',
        reply: opts.keepHistory ? s.reply : null,
        error: null,
        via: null,
        surface: s.surface,
        history: priorHistory,

        landed: null,
      }))

      const store = useStore.getState()

      const context = buildContext({
        now,
        settings: store.settings,
        courses: store.courses,
        assignments: store.assignments,
         focusNotes: store.focusNotes,
        blocks: store.blocks,
        plannerEvents: store.plannerEvents,
        scheduleOverrides: store.scheduleOverrides,
        ranked: derived.ranked,
        loads: derived.loads,
        calibration: derived.calibration,
        streak: derived.streak.current,
        studiedTodayMin: derived.studiedTodayMin,
        staleByCourse: derived.staleByCourse,
        todayIds: new Set(store.todayList.map((t) => t.assignmentId)),
        todayOrder: store.todayList.map((t) => t.assignmentId),
        horizonDays: opts.horizonDays,
        focusAssignmentId: opts.focusAssignmentId,

        nudges: derived.nudges.map((n) => ({
          id: n.id,
          text: n.text,

          assignmentId: n.action?.assignmentId ?? n.secondary?.assignmentId ?? null,
        })),
      })

      const courseCodes = store.courses.map((c) => c.code)
      const system = systemPrompt(store.settings)
      const baseTurn = userTurn({
        surface,
        context: context.text,
        request: opts.request,
        hint: opts.hint,
        history: priorHistory,
        pending: drafts.length ? describePending(drafts, store.courses, store.assignments) : undefined,
        adjusting: refining,
      })

      const attempt = async (turn: string) => {
        const result = await ask({
          system,
          input: turn,
          schema: schemaFor(courseCodes),
          maxOutputTokens: budgetFor(surface),
          thinkingLevel: thinkingFor(surface),
          signal: ctrl.signal,
          timeoutMs: surface === 'plan_week' || surface === 'recover' ? 60_000 : 40_000,
        })
        const validated = validateReply(
          parseReply(result.text),
          currentValidationState(now, derived.nudges.map((n) => ({ id: n.id, text: n.text }))),
        )
        return { result, validated }
      }

      try {
        let { result, validated } = await attempt(baseTurn)

        const allActionsRejected =
          !!validated &&
          validated.proposals.length === 0 &&

          validated.views.length === 0 &&
          validated.rejected.length > 0

        if (!validated || allActionsRejected) {
          const why = validated?.rejected.length
            ? validated.rejected.map((r) => `- ${r.type}: Nudge dropped ${r.why}`).join('\n')
            : '- The reply was not a single JSON object matching the schema.'
          const repairTurn = `${baseTurn}

## CORRECTION
Your previous reply could not be used. Every action in it was discarded:

${why}

Fix exactly those problems and reply again with only the JSON object. Copy ids character-for-character from the data above; dates are YYYY-MM-DD and times are HH:MM. If you cannot produce a usable entry, return intent "advice" with every list empty.`
          const second = await attempt(repairTurn)

          if (second.validated && (second.validated.proposals.length > 0 || !validated)) {
            result = second.result
            validated = second.validated
          }
        }

        if (!validated) {

          setState((s) => ({
            ...s,
            status: 'error',
            error: userMessage(new AiError('malformed', '')),
            via: null,
          }))
          return null
        }

        if (validated.commands.length && host) {
          const key = validated.commands.map((c) => c.id).join(',')
          if (commandsRun.current !== key) {
            commandsRun.current = key
            const { skipped } = runCommands(validated.commands, host)
            for (const s of skipped) validated.rejected.push({ type: 'command', why: `${s.command.label.toLowerCase()}: ${s.why}` })
            validated.commands = validated.commands.filter((c) => !skipped.some((s) => s.command.id === c.id))
          }
        }

        if (refining && !validated.views.length && state.reply?.views.length) {
          validated.views = state.reply.views
        }

        setState({
          status: 'ready',

          reply: validated,
          error: null,
          surface,
          landed: null,
          via: { model: result.model, fallback: result.usedFallback, ms: result.ms },
          history: [
            ...priorHistory,
            ...(opts.request ? [{ role: 'student' as const, text: opts.request }] : []),
            { role: 'nudge' as const, text: validated.message },
          ].slice(-8),
        })
        return validated
      } catch (e) {
        if (e instanceof AiError && e.kind === 'cancelled') {
          setState((s) => ({ ...s, status: s.reply ? 'ready' : 'idle', error: null }))
          return null
        }
        setState((s) => ({ ...s, status: 'error', error: userMessage(e), via: null }))
        return null
      } finally {
        if (abort.current === ctrl) abort.current = null
      }
    },

    [derived, host, now, state.history, state.reply, state.surface],
  )

  const retry = useCallback(
    () => (lastRun.current ? run(lastRun.current) : Promise.resolve(null)),
    [run],
  )

  const apply = useCallback(
    (ids: string[]) => {
      const chosen = (state.reply?.proposals ?? []).filter((p) => ids.includes(p.id))
      const result = applyProposals(
        chosen,
        currentValidationState(Date.now(), derived.nudges.map((n) => ({ id: n.id, text: n.text }))),
      )
      if (result.applied) {
        const staleIds = new Set(result.stale.map((p) => p.id))
        setState((s) => ({
          ...s,
          reply: s.reply
            ? { ...s.reply, proposals: s.reply.proposals.filter((p) => !ids.includes(p.id)) }
            : s.reply,
          landed: { applied: chosen.filter((p) => !staleIds.has(p.id)), created: result.created },
        }))
      }
      return result
    },
    [state.reply, derived.nudges],
  )

  const clearLanded = useCallback(() => setState((s) => ({ ...s, landed: null })), [])

  const dismiss = useCallback((ids: string[]) => {
    setState((s) =>
      s.reply ? { ...s, reply: { ...s.reply, proposals: s.reply.proposals.filter((p) => !ids.includes(p.id)) } } : s,
    )
  }, [])

  return { ...state, available: config.available, run, retry, cancel, reset, apply, dismiss, clearLanded, derived, now }
}

export type AiController = ReturnType<typeof useAI>
