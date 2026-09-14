import { Check, ListTree, Lock } from 'lucide-react'
import type { Ranked } from '../../lib/priority'
import { fmtCountdown, fmtDue, fmtDuration } from '../../lib/date'
import { colorOf } from '../../lib/theme'
import { Chip, CourseDot, Hint } from '../ui'
import { cardClick, cx } from '../../lib/ui'
import { useStore } from '../../lib/store'
import { useToast } from '../../lib/toast'

export function DueChip({ r, now }: { r: Ranked; now: number }) {
  const hrs = r.hoursUntil
  if (!r.assignment.due) return <span className="text-[11.5px] text-ink-3 whitespace-nowrap">No deadline</span>
  if (hrs < 0)
    return (
      <Chip tone="critical" className="font-semibold tnum">
        {fmtCountdown(r.assignment.due, now)}
      </Chip>
    )
  if (hrs <= 48)
    return (
      <Chip tone="critical" className="font-semibold tnum">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--c-critical)] animate-pulse" aria-hidden />
        {fmtCountdown(r.assignment.due, now)}
      </Chip>
    )
  if (hrs <= 24 * 7)
    return (
      <Chip tone={r.verdict === 'behind' ? 'warn' : 'neutral'} className="tnum">
        {fmtCountdown(r.assignment.due, now)}
      </Chip>
    )
  return <span className="text-[11.5px] text-ink-3 tnum whitespace-nowrap">{fmtDue(r.assignment.due, now)}</span>
}

export function TaskRow({
  r,
  now,
  onOpen,
  onToggle,
  compact,
}: {
  r: Ranked
  now: number
  onOpen: () => void
  onToggle: () => void
  compact?: boolean
}) {
  const a = r.assignment
  const subDone = a.subtasks.filter((s) => s.done).length
  const store = useStore()
  const { toast } = useToast()

  return (
    <div
      onClick={cardClick(onOpen)}
      className={cx(
        'group relative flex items-start gap-2.5 rounded-xl cursor-pointer transition-colors duration-150',
        'hover:bg-tint focus-within:bg-tint',
        compact ? 'px-2 py-2' : 'px-2.5 py-2.5',
      )}
    >
      <button
        type="button"
        onClick={() => {
          onToggle()
          toast('Task completed', { tone: 'good', action: { label: 'Undo', run: () => store.undo() } })
        }}
        aria-label={`Mark ${a.title} as done`}
        className={cx(
          'mt-[1px] shrink-0 h-[19px] w-[19px] rounded-full border-[1.5px] grid place-items-center',
          'transition-all duration-150 hover:scale-110 active:scale-95',
          'border-line-2 hover:border-ink text-transparent hover:text-ink-3',
        )}
      >
        <Check size={12} strokeWidth={3} />
      </button>

      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-start gap-2">
          <span
            className={cx(
              'text-[14px] font-medium text-ink leading-snug min-w-0 flex-1',
              a.status === 'doing' && 'text-ink',
            )}
          >
            {a.title}

            {a.private && (
              <Lock
                size={11}
                className="inline-block ml-1.5 mb-[2px] text-ink-3"
                aria-label="Private: not sent to Nudge's planner"
              />
            )}
          </span>
          <span className="shrink-0 pt-[1px]">
            <DueChip r={r} now={now} />
          </span>
        </div>

        <div className="mt-1 flex items-center gap-x-2 gap-y-1 flex-wrap text-[11.5px] text-ink-3">
          {r.course && (
            <span className="inline-flex items-center gap-1 font-medium text-ink-2">
              <CourseDot course={r.course} size={14} />
              {r.course.code}
            </span>
          )}
          {a.weight != null && <span className="tnum">{a.weight}%</span>}
          {a.estimateMin != null ? (
            <span className="tnum">
              {r.loggedMin > 0
                ? `${fmtDuration(r.loggedMin)} / ${fmtDuration(a.estimateMin)}`
                : `~${fmtDuration(a.estimateMin)} est`}
            </span>
          ) : r.loggedMin > 0 ? (
            <span className="tnum">{fmtDuration(r.loggedMin)} logged</span>
          ) : null}
          {a.subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1 tnum">
              <ListTree size={11} />
              {subDone}/{a.subtasks.length}
            </span>
          )}
          {r.verdict === 'behind' && r.hoursUntil > 0 && (
            <Hint text={r.reason}>
              <span className="text-[var(--c-critical-ink)] font-medium cursor-help underline decoration-dotted underline-offset-2">
                behind
              </span>
            </Hint>
          )}
        </div>

        {r.progress > 0 && r.progress < 1 && (
          <div className="mt-1.5 h-[3px] w-full rounded-full bg-sunken overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${r.progress * 100}%`, background: colorOf(r.course) }}
            />
          </div>
        )}
      </button>
    </div>
  )
}
