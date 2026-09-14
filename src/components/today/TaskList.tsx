import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, ChevronUp, Lock, Play, Plus, Sparkles, Star, X } from 'lucide-react'
import type { Ranked } from '../../lib/priority'
import { defaultEffort } from '../../lib/priority'
import { useStore } from '../../lib/store'
import { daysBetween, fmtCountdown, fmtDuration, fmtTime } from '../../lib/date'
import { Button, CourseDot, InlineEdit } from '../ui'
import { useToast } from '../../lib/toast'
import { cardClick, cx } from '../../lib/ui'

export interface TaskGroup {
  key: string
  label: string
  items: Ranked[]

  urgent?: boolean

  collapsed?: boolean

  ordered?: boolean
}

export interface TaskListProps {
  groups: TaskGroup[]
  now: number
  todaySet: Set<string>
  onOpenTask: (id: string) => void
  onStartFocus: (assignmentId: string, courseId: string | null) => void
}

export function TaskList({ groups, now, todaySet, onOpenTask, onStartFocus }: TaskListProps) {
  const [folded, setFolded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.filter((g) => g.collapsed).map((g) => [g.key, true])),
  )
  const store = useStore()
  const { toast } = useToast()

  const move = (id: string, neighbourId: string) => {
    const list = useStore.getState().todayList
    const from = list.findIndex((t) => t.assignmentId === id)
    const to = list.findIndex((t) => t.assignmentId === neighbourId)
    if (from < 0 || to < 0) return
    store.reorderToday(from, to)
    toast('Reordered Today', { action: { label: 'Undo', run: () => store.undo() } })
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => {
        const open = !folded[g.key]
        return (
          <section key={g.key}>
            <button
              type="button"
              onClick={() => setFolded((f) => ({ ...f, [g.key]: open }))}
              aria-expanded={open}

              className="flex items-center gap-1.5 -ml-1.5 pl-1.5 pr-2.5 py-1 mb-1 rounded-xl hover:bg-tint transition-colors group/head"
            >
              {open ? (
                <ChevronDown size={12} className="text-ink-3" />
              ) : (
                <ChevronRight size={12} className="text-ink-3" />
              )}
              <span className={cx('ui-eyebrow', g.urgent && 'ui-eyebrow-flag')}>{g.label}</span>

              <span
                className={cx(
                  'text-[10.5px] font-medium tnum',
                  g.urgent ? 'text-[var(--c-critical-ink)] opacity-75' : 'text-ink-3',
                )}
              >
                {g.items.length}
              </span>
            </button>

            {open && (
              <div className="flex flex-col gap-0.5">
                {(() => {
                  const starred = g.ordered ? g.items.filter((r) => todaySet.has(r.assignment.id)) : []
                  return g.items.map((r) => {
                    const at = starred.findIndex((x) => x.assignment.id === r.assignment.id)
                    return (
                      <TaskRow
                        key={r.assignment.id}
                        r={r}
                        now={now}
                        flagged={todaySet.has(r.assignment.id)}
                        onOpen={() => onOpenTask(r.assignment.id)}
                        onStartFocus={() => onStartFocus(r.assignment.id, r.assignment.courseId)}
                        onMoveUp={
                          at > 0 ? () => move(r.assignment.id, starred[at - 1].assignment.id) : undefined
                        }
                        onMoveDown={
                          at >= 0 && at < starred.length - 1
                            ? () => move(r.assignment.id, starred[at + 1].assignment.id)
                            : undefined
                        }
                      />
                    )
                  })
                })()}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function TaskRow({
  r,
  now,
  flagged,
  onOpen,
  onStartFocus,
  onMoveUp,
  onMoveDown,
}: {
  r: Ranked
  now: number
  flagged: boolean
  onOpen: () => void
  onStartFocus: () => void

  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const store = useStore()
  const { toast } = useToast()
  const a = r.assignment
  const [openOverride, setOpenOverride] = useState<boolean | null>(null)
  const open = openOverride ?? a.subtasks.length > 0
  const doneSteps = a.subtasks.filter((s) => s.done).length
  const overdue = r.hoursUntil < 0

  return (
    <div
      onClick={cardClick(onOpen)}
      className="group -mx-2 px-2 rounded-xl cursor-pointer hover:bg-tint transition-colors"
    >
      <div className="flex items-start gap-2.5 py-2.5">
        <button
          type="button"
          onClick={() => {
            store.setAssignmentStatus(a.id, 'done')
            toast(r.daysUntil >= 2 ? 'Early. Nice.' : 'Done.', {
              tone: 'good',
              action: { label: 'Undo', run: () => store.undo() },
            })
          }}
          aria-label={`Complete ${a.title}`}
          className="mt-[2px] shrink-0 h-[19px] w-[19px] rounded-full border-[1.5px] border-line-2 grid place-items-center text-transparent hover:border-ink hover:text-ink-3 transition-all hover:scale-110 active:scale-95"
        >
          <Check size={12} strokeWidth={3} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <button type="button" onClick={onOpen} className="text-left min-w-0 flex-1">
              <span className="text-[14px] font-medium text-ink leading-snug">
                {a.title}

                {a.private && (
                  <Lock
                    size={11}
                    className="inline-block ml-1.5 mb-[2px] text-ink-3"
                    aria-label="Private: not sent to Nudge's planner"
                  />
                )}
              </span>
            </button>

            <span
              className={cx(
                'shrink-0 text-[11.5px] tnum pt-[2px] whitespace-nowrap',
                overdue ? 'text-[var(--c-critical-ink)] font-semibold' : 'text-ink-3',
              )}
            >
              {!a.due
                ? 'No deadline'
                : overdue
                  ? `${fmtCountdown(a.due, now)} late`
                  : r.daysUntil === 0
                    ? fmtTime(a.due)
                    : r.daysUntil <= 7
                      ? new Date(a.due).toLocaleDateString(undefined, { weekday: 'short' })
                      : new Date(a.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>

            <button
              type="button"
              onClick={() => {
                if (flagged) {
                  store.removeFromToday(a.id)
                   toast('Removed from Today', { action: { label: 'Undo', run: () => store.undo() } })
                } else {
                  store.addToToday(a.id)
                  toast('Added to Today', { action: { label: 'Undo', run: () => store.undo() } })
                }
              }}
              aria-label={flagged ? `Remove ${a.title} from Today` : `Add ${a.title} to Today`}
              aria-pressed={flagged}
              title={flagged ? 'On Today' : 'Add to Today'}
              className={cx(
                'shrink-0 h-6 w-6 grid place-items-center rounded-lg transition-all hover:bg-tint-2',
                flagged
                  ? 'text-ink-2'
                  : 'text-ink-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              )}
            >
              <Star size={14} fill={flagged ? 'currentColor' : 'none'} />
            </button>

            {(onMoveUp || onMoveDown) && (
              <span className="shrink-0 flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={onMoveUp}
                  disabled={!onMoveUp}
                  aria-label={`Move ${a.title} up in today's order`}
                  className="h-6 w-5 grid place-items-center rounded-lg text-ink-3 hover:bg-tint-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={onMoveDown}
                  disabled={!onMoveDown}
                  aria-label={`Move ${a.title} down in today's order`}
                  className="h-6 w-5 grid place-items-center rounded-lg text-ink-3 hover:bg-tint-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronDown size={13} />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={onStartFocus}
              aria-label={`Start focus on ${a.title}`}
              className="shrink-0 h-6 w-6 grid place-items-center rounded-lg text-ink-3 hover:bg-tint-2 hover:text-ink opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
            >
              <Play size={13} />
            </button>
          </div>

          <div className="mt-1 flex items-center gap-x-2 gap-y-1 flex-wrap text-[11.5px] text-ink-3">

            {r.course && (
              <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
                <CourseDot course={r.course} size={14} />
                {r.course.code}
              </span>
            )}
            {a.weight != null && <span className="tnum">{a.weight}%</span>}
            {a.subtasks.length > 0 ? (
              <button
                type="button"
                onClick={() => setOpenOverride(!open)}
                aria-expanded={open}
                aria-label={`${doneSteps} of ${a.subtasks.length} steps done`}
                title={`${doneSteps} of ${a.subtasks.length} steps done`}
                className="inline-flex items-center gap-1.5 hover:text-ink transition-colors"
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="inline-flex items-center gap-[3px]" aria-hidden>
                  {Array.from({ length: Math.min(a.subtasks.length, 6) }).map((_, i) => (
                    <span
                      key={i}
                      className="h-[4px] w-[8px] rounded-full transition-colors duration-300"
                      style={{ background: i < doneSteps ? 'var(--c-ink-2)' : 'var(--c-line-2)' }}
                    />
                  ))}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setOpenOverride(true)}
                className="inline-flex items-center gap-1 hover:text-ink transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Plus size={11} />
                Add steps
              </button>
            )}
            {a.estimateMin != null ? (
              <span className="tnum">
                {r.loggedMin > 0
                  ? `${fmtDuration(r.loggedMin)} / ${fmtDuration(a.estimateMin)}`
                  : `~${fmtDuration(a.estimateMin)} est`}
              </span>
            ) : r.loggedMin > 0 ? (
              <span className="tnum">{fmtDuration(r.loggedMin)} logged</span>
            ) : null}
            {r.verdict === 'behind' && !overdue && <span className="ui-eyebrow ui-eyebrow-flag">Behind</span>}
          </div>

          {open && <Steps r={r} now={now} />}
        </div>
      </div>
    </div>
  )
}

function stepDate(due: string, now: number) {
  const d = new Date(due)
  const days = daysBetween(now, d)
  if (days === 0) return fmtTime(d)
  if (days > 0 && days <= 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Steps({ r, now }: { r: Ranked; now: number }) {
  const store = useStore()
  const { toast } = useToast()
  const [text, setText] = useState('')
  const a = r.assignment

  return (
    <div className="mt-1 ml-0.5 pl-3.5 flex flex-col gap-0.5">
      {a.subtasks.map((s) => (
        <div key={s.id} className="group/step flex items-start gap-2 py-[3px]">
          <button
            type="button"
             onClick={() => {
               store.updateSubtask(a.id, s.id, { done: !s.done })
               toast(s.done ? 'Step reopened' : 'Step completed', {
                 action: { label: 'Undo', run: () => store.undo() },
               })
             }}
            aria-label={`${s.done ? 'Reopen' : 'Complete'} step ${s.title}`}
            className={cx(
              'mt-[2px] shrink-0 h-[15px] w-[15px] rounded-[6px] border-[1.5px] grid place-items-center transition-all hover:scale-110 active:scale-95',
              s.done
                ? 'bg-invert-bg border-invert-bg text-invert-ink'
                : 'border-line-2 text-transparent hover:border-ink',
            )}
          >
            <Check size={10} strokeWidth={3} />
          </button>
          <InlineEdit
            value={s.title}
             onCommit={(title) => {
               store.updateSubtask(a.id, s.id, { title })
               toast('Step updated', { action: { label: 'Undo', run: () => store.undo() } })
             }}
            ariaLabel={`Edit step ${s.title}`}
            className={cx(
              'flex-1 min-w-0 text-[13px] leading-snug',
              s.done ? 'text-ink-3 line-through' : 'text-ink-2',
            )}
          />
          {s.due && !s.done && (
            <span className="shrink-0 text-[11px] text-ink-3 tnum pt-[2px] whitespace-nowrap">
              {stepDate(s.due, now)}
            </span>
          )}
          <button
            type="button"
             onClick={() => {
               store.removeSubtask(a.id, s.id)
               toast('Step removed', { action: { label: 'Undo', run: () => store.undo() } })
             }}
            aria-label={`Remove step ${s.title}`}
            className="shrink-0 opacity-0 group-hover/step:opacity-100 focus:opacity-100 text-ink-3 hover:text-ink transition-opacity p-0.5"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          store.addSubtask(a.id, { title: text })
          setText('')
           toast('Step added', { action: { label: 'Undo', run: () => store.undo() } })
        }}
        className="flex items-center gap-1.5 mt-0.5"
      >
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label={`Add step to ${a.title}`}
          className="text-ink-3 hover:text-ink disabled:text-ink-3 disabled:hover:text-ink-3 transition-colors p-0.5 shrink-0"
        >
          <Plus size={12} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a step…"
          aria-label={`Add a step to ${a.title}`}
          className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-3 outline-none py-0.5 min-w-0"
        />
        {text.trim() ? (
          <Button
            size="xs"
            variant="quiet"
            type="submit"
            aria-label="Add step"
          >
            Add
          </Button>
        ) : a.subtasks.length === 0 ? (
          <Button
            size="xs"
            variant="quiet"
            type="button"
             onClick={() => {
               const made = store.applyBreakdown(a.id, a.estimateMin ?? defaultEffort(a))
               toast(`Suggested ${made.steps} step${made.steps === 1 ? '' : 's'}`, {
                 action: { label: 'Undo', run: () => store.undo() },
               })
             }}
          >
            <Sparkles size={11} />
            Suggest
          </Button>
        ) : null}
      </form>
    </div>
  )
}
