import { useMemo, type CSSProperties } from 'react'
import { CalendarRange, ClipboardCheck } from 'lucide-react'
import type { Derived } from '../../lib/derive'
import type { Course } from '../../lib/types'
import { useStore } from '../../lib/store'
import { dayKey, daysBetween, fmtDay, fmtDayShort, fmtDuration, fromDayKey, isSameDay } from '../../lib/date'
import { CourseDot, Panel, SectionTitle } from '../ui'
import { cx } from '../../lib/ui'

export function WeekAhead({
  derived,
  now,
  onGoPlan,
  className,
  style,
}: {
  derived: Derived
  now: number
  onGoPlan: () => void
  className?: string
  style?: CSSProperties
}) {
  const max = Math.max(derived.todayLoad.capacityMin, ...derived.loads.map((l) => l.plannedMin), 60)

  const dueByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of derived.ranked) {
      if (r.hoursUntil < 0 || !r.assignment.due) continue
      const k = dayKey(r.assignment.due)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [derived.ranked])

  const total = derived.loads.reduce((s, l) => s + l.plannedMin, 0)

  return (
    <Panel as="section" className={cx('px-2 py-2.5', className)} style={style}>
      <SectionTitle
        className="px-1.5"
        right={
          <button
            onClick={onGoPlan}
            className="text-[11.5px] font-medium text-ink-2 hover:text-ink inline-flex items-center gap-1"
          >
            <CalendarRange size={12} /> Plan
          </button>
        }
      >
        Week ahead
      </SectionTitle>

      <div className="px-1.5">
        <div className="flex items-stretch gap-1">
          {derived.loads.map((l) => {
            const d = fromDayKey(l.day)
            const today = isSameDay(d, now)
            const due = dueByDay.get(l.day) ?? 0
            return (
              <button
                key={l.day}
                onClick={onGoPlan}
                aria-label={`${fmtDayShort(d)}: ${fmtDuration(l.plannedMin)} planned${due ? `, ${due} due` : ''}`}
                title={`${fmtDuration(l.plannedMin)} planned${due ? ` · ${due} due` : ''}`}

                className={cx(
                  'flex-1 flex flex-col items-center gap-1.5 pt-1.5 pb-1 rounded-xl transition-colors',
                  today ? 'bg-tint' : 'hover:bg-tint',
                )}
              >

                <span className="w-full h-[46px] flex items-end justify-center px-1">

                  <span
                    className="w-full max-w-[38px] rounded-[5px] transition-[height,background-color] duration-500 ease-[var(--ease-out-soft)]"
                    style={{
                      height: `${Math.max(4, (l.plannedMin / max) * 46)}px`,

                      background: l.overloaded
                        ? 'var(--c-critical)'
                        : today
                          ? 'var(--c-ink)'
                          : 'var(--c-line-2)',
                    }}
                  />
                </span>
                <span className={cx('text-[10.5px] font-medium', today ? 'text-ink font-semibold' : 'text-ink-3')}>
                  {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
                </span>

                <span className="h-[5px] flex items-center gap-[2px]" aria-hidden>
                  {Array.from({ length: Math.min(3, due) }).map((_, i) => (
                    <span key={i} className="h-[4px] w-[4px] rounded-full bg-ink-3" />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-2.5 text-[11.5px] text-ink-3 text-center tnum">
          {fmtDuration(total)} planned · {derived.ranked.filter((r) => r.daysUntil <= 6 && r.hoursUntil >= 0).length} due
          this week
        </p>
      </div>
    </Panel>
  )
}

interface HorizonItem {
  id: string
  at: number
  title: string
  course?: Course

  note: string
  exam?: boolean
}

const FROM_DAYS = 7
const TO_DAYS = 21

function useHorizon(derived: Derived, now: number): HorizonItem[] {
  const courses = useStore((s) => s.courses)
  const plannerEvents = useStore((s) => s.plannerEvents)
  const blocks = useStore((s) => s.blocks)

  return useMemo(() => {
    const out: HorizonItem[] = []

    for (const r of derived.ranked) {
      const d = r.daysUntil
      if (!r.assignment.due || d < FROM_DAYS || d > TO_DAYS) continue
      const heavy = r.weight >= 10
      const long = r.remainingMin >= 120
      if (!heavy && !long) continue
      out.push({
        id: r.assignment.id,
        at: +new Date(r.assignment.due),
        title: r.assignment.title,
        course: r.course,
        note: [
          heavy ? `${Math.round(r.weight)}%` : null,
          r.assignment.estimateMin ? `~${fmtDuration(r.assignment.estimateMin)} est` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })
    }

    const courseById = new Map(courses.map((course) => [course.id, course]))
    for (const exam of plannerEvents.filter((event) => event.kind === 'exam' && !event.allDay)) {
      const at = +new Date(exam.start)
      const days = daysBetween(now, at)
      if (days < 0 || days > TO_DAYS) continue
      const course = exam.courseId ? courseById.get(exam.courseId) : undefined
      out.push({
        id: `course-exam:${exam.id}`,
        at,
        title: exam.title,
        course,
        note: `${fmtDay(at)}${exam.room ? ` · ${exam.room}` : ''}`,
        exam: true,
      })
    }

    for (const examBlock of blocks.filter((block) => block.kind === 'exam')) {
      const at = +new Date(examBlock.start)
      const days = daysBetween(now, at)
      if (days < 0 || days > TO_DAYS) continue
      const course = examBlock.courseId ? courseById.get(examBlock.courseId) : undefined
      out.push({
        id: `block-exam:${examBlock.id}`,
        at,
        title: examBlock.title || (course ? `${course.code} Exam` : 'Exam'),
        course,
        note: `${fmtDay(at)}${examBlock.weight != null ? ` · ${examBlock.weight}%` : ''}${examBlock.location ? ` · ${examBlock.location}` : ''}`,
        exam: true,
      })
    }

    return out
      .sort((a, b) => Number(!!b.exam) - Number(!!a.exam) || a.at - b.at)
      .slice(0, 4)
  }, [derived.ranked, courses, plannerEvents, blocks, now])
}

export function Horizon({
  derived,
  now,
  onOpenTask,
  onOpenCourse,
  onGoPlan,
  className,
  style,
}: {
  derived: Derived
  now: number
  onOpenTask: (id: string) => void
  onOpenCourse: (id: string) => void
  onGoPlan: () => void
  style?: CSSProperties

  className?: string
}) {
  const items = useHorizon(derived, now)
  if (!items.length) return null

  return (
    <Panel as="section" className={cx('px-2 py-2.5', className)} style={style}>
      <SectionTitle
        className="px-1.5"
        right={
          <button
            onClick={onGoPlan}
            className="text-[11.5px] font-medium text-ink-2 hover:text-ink inline-flex items-center gap-1"
          >
            <CalendarRange size={12} /> Plan
          </button>
        }
      >
        On the horizon
      </SectionTitle>
      <ul className="flex flex-col gap-0.5">
        {items.map((it) => {
          const days = daysBetween(now, it.at)
          const when =
            days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days <= 6 ? fmtDayShort(it.at) : `${days} days`
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() =>
                  it.exam
                    ? it.course && onOpenCourse(it.course.id)
                    : onOpenTask(it.id)
                }
                className="w-full flex items-center gap-2.5 px-1.5 py-2 rounded-xl text-left hover:bg-tint transition-colors"
              >
                <span className="w-[18px] grid place-items-center shrink-0">
                  {it.exam && !it.course ? (
                    <ClipboardCheck size={15} strokeWidth={2} className="text-ink-2" />
                  ) : (
                    <CourseDot course={it.course} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="block text-[13px] font-medium leading-tight truncate text-ink">
                      {it.title}
                    </span>
                    {it.exam && <span className="ui-eyebrow shrink-0">EXAM</span>}
                  </span>
                  <span className="block text-[11.5px] text-ink-3 leading-tight mt-0.5 tnum">{it.note}</span>
                </span>

                <span className="shrink-0 text-[11.5px] font-semibold text-ink-2 tnum text-right">{when}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
