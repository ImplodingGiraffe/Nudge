import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, CalendarRange, LifeBuoy, PenLine, Send, Timer, Zap } from 'lucide-react'
import type { Derived } from '../../lib/derive'
import type { Surface } from '../../lib/ai/prompt'
import { useAI } from '../../lib/ai/useAI'
import { useAiConfig } from '../../lib/ai/useAiConfig'
import { useStore } from '../../lib/store'
import { fmtDuration } from '../../lib/date'
import { useEvent } from '../../lib/hooks'
import { Button, Sheet } from '../ui'
import { cx } from '../../lib/ui'
import { AiResult, Failure, Working } from './AiResult'

interface Opener {
  id: string
  label: string
  icon: typeof Zap
  surface: Surface
  request?: string
  horizonDays?: number

  urgency: number
}

function useOpeners(derived: Derived, now: number): Opener[] {
  const blocks = useStore((s) => s.blocks)

  return useMemo(() => {
    const out: Opener[] = []
    const overdue = derived.ranked.filter((r) => r.hoursUntil < 0).length
    const behind = derived.ranked.filter((r) => r.verdict === 'behind').length
    const weekBlocks = blocks.filter((b) => {
      const s = +new Date(b.start)
      return s > now && s < now + 7 * 86_400_000
    }).length

    if (overdue > 0 || behind > 1) {
      out.push({
        id: 'recover',
        label: overdue > 0 ? `I fell behind: ${overdue} overdue` : 'I’m behind on a few things',
        icon: LifeBuoy,
        surface: 'recover',
        urgency: 100,
      })
    }

    out.push({
      id: 'plan',
      label: weekBlocks < 3 ? 'Plan my week' : 'Rebalance my week',
      icon: CalendarRange,
      surface: 'plan_week',
      horizonDays: 9,
      urgency: weekBlocks < 3 ? 80 : 40,
    })

    if (derived.ranked.length) {
      out.push({
        id: 'next',
        label: 'What should I do now?',
        icon: Zap,
        surface: 'next',
        horizonDays: 3,
        urgency: 70,
      })

      out.push({
        id: 'coming',
        label: 'What’s coming up?',
        icon: CalendarDays,
        surface: 'ask',
        request: 'What have I got coming up?',
        horizonDays: 9,
        urgency: weekBlocks + derived.ranked.length > 6 ? 75 : 50,
      })
    }

    out.push({
      id: 'session',
      label: 'I have 90 minutes',
      icon: Timer,
      surface: 'session',
      request: 'Plan a 90-minute study session.',
      horizonDays: 3,
      urgency: 30,
    })

    out.push({
      id: 'capture',
      label: derived.ranked.length ? 'Tell me what else is coming up' : 'Tell me what’s coming up',
      icon: PenLine,
      surface: 'capture',
      horizonDays: 21,
      urgency: derived.ranked.length < 3 ? 95 : 20,
    })

    return out.sort((a, b) => b.urgency - a.urgency)
  }, [derived.ranked, blocks, now])
}

export function AiPanel({
  open,
  onClose,
  derived,
  now,
  initial,
}: {
  open: boolean
  onClose: () => void
  derived: Derived
  now: number

  initial?: { surface: Surface; request?: string; horizonDays?: number } | null
}) {
  const ai = useAI(derived, now)
  const config = useAiConfig()
  const openers = useOpeners(derived, now)
  const run = useEvent(ai.run)
  const [text, setText] = useState('')
  const [surface, setSurface] = useState<Surface>('ask')

  const [pending, setPending] = useState<Surface | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const firedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!open) {
      firedFor.current = null
      setPending(null)
      return
    }
    if (!initial) return
    const key = `${initial.surface}:${initial.request ?? ''}`
    if (firedFor.current === key) return
    firedFor.current = key
    setSurface(initial.surface)
    void run({ surface: initial.surface, request: initial.request, horizonDays: initial.horizonDays })

  }, [open, initial, run])

  const send = (o?: Opener) => {
    if (o?.surface === 'capture' && !o.request) {
      setSurface('capture')
      setPending('capture')
      inputRef.current?.focus()
      return
    }
    const request = o ? o.request : text.trim()
    if (!o && !request) return
    const s = o?.surface ?? pending ?? 'ask'
    setPending(null)
    setSurface(s)
    if (!o) setText('')
    void ai.run({
      surface: s,
      request,
      horizonDays: o?.horizonDays,

      keepHistory: true,
      adjusting: !o,
    })
  }

  const capacityNote = useMemo(() => {
    const load = derived.todayLoad
    if (!load) return null
    const left = Math.max(0, load.capacityMin - load.doneMin)
    return `${fmtDuration(left)} of study time left today`
  }, [derived.todayLoad])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Plan with Nudge"
      description={capacityNote ?? undefined}
      size="lg"
      footer={
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder={
              pending === 'capture'
                ? 'e.g. chem test Friday, soccer Tue and Thu, history essay due the 20th'
                : ai.reply
                  ? 'Adjust the plan, for example: “move the Thursday block later”'

                  : 'Ask what’s coming up, or describe what you need…'
            }
            className={cx(
              'flex-1 min-w-0 resize-none bg-surface border border-line rounded-ctl px-3 py-2 text-[14px] text-ink',
              'placeholder:text-ink-3 max-h-28 leading-snug',
              'transition-[border-color,box-shadow] duration-150 hover:border-line-2',
              'focus:outline-none focus:border-ink focus:ring-2 focus:ring-[var(--c-tint-2)]',
            )}
          />
          <Button
            variant="primary"
            onClick={() => send()}
            disabled={!text.trim() || ai.status === 'thinking'}
            aria-label="Send"
            className="shrink-0"
          >
            <Send size={15} />
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">

        {(!ai.reply || ai.status === 'idle') && ai.status !== 'thinking' && (
          <div className="flex flex-col gap-2">
            {openers.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => send(o)}
                className={cx(
                  'w-full flex items-center gap-2.5 px-3 h-11 rounded-[11px] text-left transition-colors',
                  'bg-surface-2 border border-line hover:bg-tint text-[13.5px] font-medium text-ink',
                )}
              >
                <o.icon size={15} className="text-ink-3 shrink-0" />
                {o.label}
              </button>
            ))}
          </div>
        )}

        {ai.status === 'thinking' && <Working surface={surface} onCancel={ai.cancel} />}

        {ai.status === 'error' && ai.error && (
          <Failure message={ai.error} onRetry={config.available ? () => void ai.retry() : undefined} />
        )}

        {ai.reply && ai.status !== 'thinking' && (

          <AiResult reply={ai.reply} ai={ai} surface={surface} handoff onLeave={onClose} />
        )}

        {ai.reply && ai.status === 'ready' && (
          <button
            type="button"
            onClick={ai.reset}
            className="self-start text-[12px] text-ink-3 hover:text-ink transition-colors"
          >
            Start over
          </button>
        )}
      </div>
    </Sheet>
  )
}
