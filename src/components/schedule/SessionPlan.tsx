import type { ReactNode } from 'react'
import type { BlockSegment, StudyBlock } from '../../lib/types'
import { useStore } from '../../lib/store'
import { fmtDuration, fmtTime } from '../../lib/date'
import { SEGMENT_TONE, SEGMENT_WORD, dayWord, offsetsOf, totalOf, whenPhrase } from '../../lib/sessionPlan'
import { stepOf } from '../../lib/steps'
import { edgeOf, solidOf } from '../../lib/theme'
import { CourseDot } from '../ui'
import { cx } from '../../lib/ui'

export function SegmentBar({
  segments,
  className,
  playedMin,
  height = 7,
}: {
  segments: BlockSegment[]
  className?: string
  playedMin?: number
  height?: number
}) {
  const total = totalOf(segments) || 1
  return (
    <div
      className={cx('relative flex w-full overflow-hidden rounded-full bg-sunken', className)}
      style={{ height }}
      aria-hidden
    >
      {segments.map((s, i) => (
        <span
          key={i}
          style={{ width: `${(s.minutes / total) * 100}%`, background: SEGMENT_TONE[s.kind] }}
          className={cx(i > 0 && 'border-l border-surface')}
        />
      ))}

      {playedMin != null && (
        <span
          className="absolute top-0 bottom-0 w-[2px] bg-ink transition-[left] duration-500"
          style={{ left: `calc(${Math.min(100, Math.max(0, (playedMin / total) * 100))}% - 1px)` }}
        />
      )}
      <span className="sr-only">{segments.map((s) => `${s.minutes} minutes: ${s.label}`).join('. ')}</span>
    </div>
  )
}

export function SegmentRows({
  segments,
  className,
  currentIndex,
}: {
  segments: BlockSegment[]
  className?: string
  currentIndex?: number
}) {
  const offsets = offsetsOf(segments)
  return (
    <ol className={cx('flex flex-col', className)}>
      {segments.map((s, i) => {
        const spent = currentIndex != null && i < currentIndex
        const live = currentIndex === i
        return (
          <li
            key={`${s.label}-${i}`}
            className={cx(
              'flex items-baseline gap-3 py-1.5 border-t border-line first:border-t-0',
              spent && 'opacity-45',
            )}
          >
            <span className="w-[42px] shrink-0 text-[11.5px] text-ink-3 tnum">
              {live ? <span className="text-ink font-semibold">now</span> : `+${offsets[i]}m`}
            </span>
            <span
              className={cx(
                'flex-1 min-w-0 text-[13px] leading-snug',
                live ? 'text-ink font-medium' : 'text-ink',
              )}
            >
              {s.label}
            </span>
            <span className="shrink-0 text-[11.5px] text-ink-3">{SEGMENT_WORD[s.kind]}</span>
            <span className="shrink-0 w-[34px] text-right text-[11.5px] text-ink-3 tnum">{s.minutes}m</span>
          </li>
        )
      })}
    </ol>
  )
}

export function SittingCard({
  block,
  now,
  label,
  icon,
  detail = 'first',
  note,
  className,
  children,
}: {
  block: StudyBlock
  now: number
  label: string
  icon?: ReactNode
  detail?: 'first' | 'full'
  note?: string
  className?: string
  children?: ReactNode
}) {
  const courses = useStore((s) => s.courses)
  const assignments = useStore((s) => s.assignments)

  const running = useStore((s) => s.timer?.blockId) === block.id
  const planIndex = useStore((s) => s.timer?.planIndex)
  const planLength = useStore((s) => s.timer?.plan?.length)

  const task = assignments.find((a) => a.id === block.assignmentId) ?? null
  const course = courses.find((c) => c.id === (block.courseId ?? task?.courseId)) ?? null
  const step = stepOf(block, task ?? undefined)
  const startMs = +new Date(block.start)
  const endMs = +new Date(block.end)
  const minutes = Math.round((endMs - startMs) / 60_000)
  const plan = block.plan ?? []
  const first = plan[0]
  const relative = running ? null : whenPhrase(startMs, endMs, now)
  const current = running && planLength === plan.length ? (planIndex ?? 0) : undefined

  return (
    <div
      className={cx('rounded-panel border p-3.5 a-rise', className)}
      style={{ background: solidOf(course, 12), borderColor: edgeOf(course, 28) }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="ui-eyebrow">{label}</span>
      </div>

      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[14px] font-semibold text-ink leading-snug">
          {step?.title ?? task?.title ?? block.title ?? 'Study session'}
        </span>
        {course && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2 shrink-0">
            <CourseDot course={course} />
            {course.code}
          </span>
        )}
      </div>

      {step && task && <p className="mt-0.5 text-[12px] text-ink-2 leading-snug">{task.title}</p>}

      <p className="mt-0.5 text-[11.5px] text-ink-2 tnum">
        {dayWord(startMs, now)} · {fmtTime(startMs)} – {fmtTime(endMs)} · {fmtDuration(minutes)}
        {relative && <span className="text-ink-3"> · {relative}</span>}
      </p>

      {plan.length > 0 && (
        <>
          <SegmentBar segments={plan} className="mt-2.5" playedMin={current == null ? undefined : offsetsOf(plan)[current]} />
          {detail === 'full' ? (
            <SegmentRows segments={plan} className="mt-1.5" currentIndex={current} />
          ) : (
            first && (
              <p className="mt-2.5 text-[13px] text-ink leading-snug">
                <span className="text-ink-3">Starts with {first.minutes} min: </span>
                {first.label}
              </p>
            )
          )}
        </>
      )}

      {children}
      {note && <p className="mt-2 text-[11.5px] text-ink-3 leading-snug">{note}</p>}
    </div>
  )
}
