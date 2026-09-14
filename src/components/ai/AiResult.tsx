import { useEffect, useMemo, useState } from 'react'
import { Check, CircleHelp, Info, RefreshCw, TriangleAlert } from 'lucide-react'
import type { ValidatedReply } from '../../lib/ai/validate'
import type { AiController } from '../../lib/ai/useAI'
import { FALLBACK_MODEL } from '../../lib/ai/config'
import { useStore } from '../../lib/store'
import { Button } from '../ui'
import { useToast } from '../../lib/toast'
import { cx } from '../../lib/ui'
import { ProposalCard } from './ProposalCards'
import { NextStep, hasNextStep, type Handoff } from './NextStep'
import { ViewBlocks } from './ViewCards'

const undoLast = () => useStore.getState().undo()

const WORKING_LINES: Record<string, string[]> = {
  plan_week: ['Reading your deadlines', 'Finding the gaps', 'Laying out the week'],
  recover: ['Working out what is still reachable', 'Rebalancing', 'Writing the recovery plan'],
  breakdown: ['Sizing the work', 'Splitting it into sittings'],
  session: ['Shaping the session'],
  next: ['Checking what is most urgent'],
  capture: ['Reading what you wrote', 'Turning it into tasks'],
  ask: ['Reading your week'],
}

export function Working({ surface, onCancel }: { surface: string; onCancel?: () => void }) {
  const lines = WORKING_LINES[surface] ?? WORKING_LINES.ask
  const [i, setI] = useState(0)

  useEffect(() => {
    if (lines.length < 2) return
    const id = setInterval(() => setI((v) => Math.min(v + 1, lines.length - 1)), 2600)
    return () => clearInterval(id)
  }, [lines.length])

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="relative h-4 w-4 shrink-0" aria-hidden>
        <span className="absolute inset-0 rounded-full border-[1.5px] border-line" />
        <span className="absolute inset-0 rounded-full border-[1.5px] border-transparent border-t-ink animate-spin" />
      </span>
      <span className="text-[13px] text-ink-2" role="status" aria-live="polite">
        {lines[i]}…
      </span>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto text-[12px] text-ink-3 hover:text-ink transition-colors shrink-0"
        >
          Stop
        </button>
      )}
    </div>
  )
}

export function Failure({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[12px] border border-line bg-surface-2 p-3">
      <TriangleAlert size={15} className="mt-[2px] shrink-0 text-[var(--c-warn)]" />

      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink leading-snug">{message}</p>
        {!/nothing was changed/i.test(message) && (
          <p className="text-[12px] text-ink-3 mt-0.5">Nothing in your plan was changed.</p>
        )}
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry} className="shrink-0">
          <RefreshCw size={13} />
          Retry
        </Button>
      )}
    </div>
  )
}

export function AiResult({
  reply,
  ai,
  surface,
  onApplied,
  compact,
  handoff,
  onLeave,
}: {
  reply: ValidatedReply
  ai: AiController
  surface: string
  onApplied?: () => void
  compact?: boolean

  handoff?: boolean

  onLeave?: () => void
}) {
  const { toast } = useToast()

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(reply.proposals.filter((p) => !p.sensitive).map((p) => p.id)),
  )

  useEffect(() => {
    setSelected(new Set(reply.proposals.filter((p) => !p.sensitive).map((p) => p.id)))
  }, [reply])

  const landed = handoff ? ai.landed : null

  const chosen = useMemo(
    () => reply.proposals.filter((p) => selected.has(p.id)),
    [reply.proposals, selected],
  )

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const apply = () => {
    const ids = chosen.map((p) => p.id)
    const result = ai.apply(ids)

    if (!result.applied) {
      toast('Those items changed while this was open. Nothing was applied.')
      return
    }

    const staleIds = new Set(result.stale.map((p) => p.id))
    const following =
      !!handoff && hasNextStep(chosen.filter((p) => !staleIds.has(p.id)), result.created)

    if (result.stale.length) {
      toast(`${result.label} · ${result.stale.length} skipped because they changed while this was open`, {
        action: { label: 'Undo', run: () => undoLast() },
      })
    } else if (!following) {

      toast(result.label, { action: { label: 'Undo', run: () => undoLast() } })
    }
    onApplied?.()
  }

  const hasProposals = reply.proposals.length > 0

  const triedAndFailed =
    !hasProposals &&
    !reply.commands.length &&
    !reply.views.length &&
    reply.rejected.length > 0 &&
    reply.intent === 'plan'

  return (
    <div className="flex flex-col gap-3">

      {triedAndFailed ? (
        <div className="flex items-start gap-2.5 rounded-[12px] border border-line bg-surface-2 p-3">
          <TriangleAlert size={15} className="mt-[2px] shrink-0 text-[var(--c-warn)]" />
          <div className="min-w-0">
            <p className="text-[13px] text-ink leading-snug">
              It described a plan but didn’t produce one Nudge could use, so there’s nothing to apply.
            </p>
            <p className="text-[12px] text-ink-3 mt-0.5 leading-snug">
              Try again, or use Nudge’s built-in breakdown.
            </p>
          </div>
        </div>
      ) : (
        reply.message && (
          <p className={cx('text-ink leading-relaxed', compact ? 'text-[13px]' : 'text-[14px]')}>{reply.message}</p>
        )
      )}

      <ViewBlocks views={reply.views} ai={ai} />

      {reply.commands.length > 0 && (
        <ul className="flex flex-col gap-1">
          {reply.commands.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-[13px] text-ink">
              <span className="h-[15px] w-[15px] rounded-full bg-invert-bg text-invert-ink grid place-items-center shrink-0">
                <Check size={10} strokeWidth={3} />
              </span>
              {c.label}
            </li>
          ))}
        </ul>
      )}

      {reply.intent === 'question' && reply.question && (
        <div className="flex items-start gap-2.5 rounded-[12px] border border-line bg-surface-2 p-3">
          <CircleHelp size={15} className="mt-[2px] shrink-0 text-ink-3" />
          <p className="text-[13.5px] text-ink leading-snug">{reply.question}</p>
        </div>
      )}

      {reply.assumptions.length > 0 && (
        <div className="flex items-start gap-2 text-[12px] text-ink-2">
          <Info size={13} className="mt-[2px] shrink-0 text-ink-3" />
          <span className="leading-snug">Assumed: {reply.assumptions.join(' · ')}</span>
        </div>
      )}

      {hasProposals && (
        <>
          {reply.headline && (
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 -mb-1">
              {reply.headline}
            </h3>
          )}
          <div className="flex flex-col gap-2">
            {reply.proposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} checked={selected.has(p.id)} onToggle={() => toggle(p.id)} />
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="primary" onClick={apply} disabled={!chosen.length}>
              {chosen.length === reply.proposals.length
                ? `Apply ${reply.proposals.length === 1 ? 'change' : `all ${reply.proposals.length}`}`
                : `Apply ${chosen.length} of ${reply.proposals.length}`}
            </Button>
            <Button onClick={() => ai.dismiss(reply.proposals.map((p) => p.id))}>Dismiss</Button>
            <span className="ml-auto text-[11.5px] text-ink-3">Nothing changes until you apply.</span>
          </div>
        </>
      )}

      {landed && landed.applied.length > 0 && (
        <NextStep
          handoff={
            {
              applied: landed.applied,
              created: landed.created,
              onUndo: () => {
                undoLast()
                ai.clearLanded()
              },
            } satisfies Handoff
          }
          now={ai.now}
          onLeave={onLeave}
        />
      )}

      {reply.rejected.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-[11.5px] text-ink-3 hover:text-ink-2 transition-colors">
            {reply.rejected.length} suggestion{reply.rejected.length === 1 ? '' : 's'} discarded as unusable
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1 pl-1">
            {reply.rejected.map((r, i) => (
              <li key={i} className="text-[12px] text-ink-3 leading-snug">
                · Dropped {r.why}
              </li>
            ))}
          </ul>
        </details>
      )}

      {ai.via?.fallback && (
        <p className="text-[11px] text-ink-3">
          Answered by {FALLBACK_MODEL.replace('gemini-', 'Gemini ')} because the main model was busy.
        </p>
      )}

      {surface === 'ask' && !hasProposals && reply.intent === 'advice' && (
        <p className="text-[11.5px] text-ink-3">Advice only. Ask Nudge to create study blocks if you want a plan.</p>
      )}
    </div>
  )
}
