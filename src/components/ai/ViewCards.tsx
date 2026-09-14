import { useMemo } from 'react'
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  Clock,
  Flame,
  GraduationCap,
  ListChecks,
  Table,
  TrendingUp,
  TriangleAlert,
  User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Assignment, Course } from '../../lib/types'
import type { View, ViewKind } from '../../lib/ai/validate'
import type { AiController } from '../../lib/ai/useAI'
import { useStore } from '../../lib/store'
import { useCommandHost } from '../../lib/ai/commandHost'
import { buildTimeline, buildTimetable, groupByDay, studyByDay, type TimelineItem } from '../../lib/ai/viewData'
import { KIND_LABEL, dayLoads } from '../../lib/priority'
import { gradeOutlook } from '../../lib/stats'
import { addDays, dayKey, fmtDay, fmtDayShort, fmtDuration, fmtTime, fmtTimeRange, fromDayKey, startOfDay } from '../../lib/date'
import { KIND, distinctPlaces, fmtDays, groupMeetings, hasMultipleMeetingKinds, parsePlace } from '../../lib/meetings'
import { colorOf, edgeOf, solidOf } from '../../lib/theme'
import { KindBadge, KindGlyph, PlaceLine } from '../schedule/ClassBits'
import { Chip, CourseDot } from '../ui'
import { cardClick, cx } from '../../lib/ui'

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const VERDICT_LABEL: Record<string, string> = {
  overdue: 'overdue',
  behind: 'behind',
  tight: 'tight',
  ok: 'on track',
  clear: 'plenty of time',
}

function ViewBlock({
  icon: Icon,
  label,
  title,
  right,
  onOpen,
  children,
}: {
  icon: LucideIcon
  label: string
  title: string
  right?: React.ReactNode
  onOpen?: () => void
  children: React.ReactNode
}) {
  return (
    <section
      onClick={onOpen && cardClick(onOpen)}
      className={cx(
        'rounded-[12px] border border-line bg-surface overflow-hidden',
        onOpen && 'cursor-pointer',
      )}
    >
      <header className="flex items-start gap-2 px-3 pt-2.5 pb-2 border-b border-line bg-surface-2">
        <Icon size={13} className="mt-[3px] shrink-0 text-ink-3" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</p>
          <h3 className="text-[13.5px] font-semibold text-ink leading-snug">{title}</h3>
        </div>
        {right && <div className="shrink-0 pt-[2px]">{right}</div>}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

function Nothing({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-ink-3 leading-snug">{children}</p>
}

function DayHeading({ at, now }: { at: number; now: number }) {
  const diff = Math.round((+startOfDay(at) - +startOfDay(now)) / 86_400_000)
  const name = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : new Date(at).toLocaleDateString(undefined, { weekday: 'long' })
  return (
    <div className="flex items-center gap-2 pt-3 first:pt-0">
      <h4 className="text-[11.5px] font-semibold text-ink shrink-0">{name}</h4>
      <span className="text-[11px] text-ink-3 tnum shrink-0">{fmtDayShort(at)}</span>
      <span className="flex-1 h-px bg-line" aria-hidden />
    </div>
  )
}

function Meter({ fraction, color, over }: { fraction: number; color?: string; over?: boolean }) {
  return (
    <div className="h-[5px] flex-1 rounded-full bg-sunken overflow-hidden">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${Math.min(100, Math.max(0, fraction * 100))}%`,
          background: over ? 'var(--c-warn)' : (color ?? 'var(--c-ink-3)'),
        }}
      />
    </div>
  )
}

function TimelineRow({ item, now, onOpen }: { item: TimelineItem; now: number; onOpen?: () => void }) {
  const overdue = item.kind === 'deadline' && item.at < now
  const soon = item.kind === 'deadline' && !overdue && item.at - now < 48 * 3_600_000
  const minutes = item.endAt ? Math.round((item.endAt - item.at) / 60_000) : 0

  const body = (
    <>
      <span className="w-[52px] shrink-0 text-right text-[11px] tnum text-ink-3">
        {item.allDay ? 'All day' : fmtTime(item.at, { compact: true })}
      </span>
      <CourseDot course={item.course} />
      <span
        className={cx(
          'min-w-0 flex-1 text-[13px] leading-snug truncate',
          item.done ? 'text-ink-3 line-through' : 'text-ink',
        )}
      >
        {item.title}
      </span>
      {item.kind === 'deadline' && (
        <Chip tone={overdue ? 'critical' : soon ? 'warn' : 'quiet'} className="shrink-0">
          {overdue ? 'overdue' : 'due'}
        </Chip>
      )}
      {item.kind === 'class' && item.meetingKind && (
        <>
          <PlaceLine place={parsePlace(item.room)} size="xs" className="shrink min-w-0 hidden sm:inline-flex" />
          {item.course && hasMultipleMeetingKinds(item.course) && <KindBadge kind={item.meetingKind} size="xs" className="shrink-0" />}
        </>
      )}
      {item.kind === 'event' && (
        <Chip tone={item.event?.kind === 'exam' ? 'critical' : 'quiet'} className="shrink-0">
          {item.event?.kind === 'exam' ? 'exam' : item.allDay ? 'calendar' : 'fixed'}
        </Chip>
      )}
      {item.kind === 'block' && minutes > 0 && (
        <span className="shrink-0 text-[11px] tnum text-ink-3">{fmtDuration(minutes)}</span>
      )}
    </>
  )

  if (!onOpen) return <div className="flex items-center gap-2 py-[5px]">{body}</div>
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-2 py-[5px] px-1 -mx-1 rounded-lg text-left hover:bg-tint transition-colors"
    >
      {body}
    </button>
  )
}

const AGENDA_MAX_ROWS = 18

function AgendaCard({ view, now }: { view: Extract<View, { kind: 'agenda' }>; now: number }) {
  const courses = useStore((s) => s.courses)
  const assignments = useStore((s) => s.assignments)
  const blocks = useStore((s) => s.blocks)
  const plannerEvents = useStore((s) => s.plannerEvents)
  const scheduleOverrides = useStore((s) => s.scheduleOverrides)
  const host = useCommandHost()

  const { days, hiddenDays, overdue, counts } = useMemo(() => {
    const to = +addDays(startOfDay(now), view.days)
    const items = buildTimeline({
      from: now,
      to,
      courses,
      assignments,
      blocks,
      plannerEvents,
      scheduleOverrides,
      courseId: view.courseId,
    })

    const late = assignments
      .filter(
        (a) =>
          !a.archived &&
          a.status !== 'done' &&
          a.due &&
          +new Date(a.due) < now &&
          (!view.courseId || a.courseId === view.courseId),
      )
      .sort((a, b) => +new Date(a.due!) - +new Date(b.due!))

    const grouped = groupByDay(items)
    const shown: typeof grouped = []
    let rows = 0
    for (const day of grouped) {
      if (rows && rows + day.items.length > AGENDA_MAX_ROWS) break
      shown.push(day)
      rows += day.items.length
    }

    return {
      days: shown,
      hiddenDays: grouped.length - shown.length,
      overdue: late,
      counts: {
        deadlines: items.filter((i) => i.kind === 'deadline').length,
        blocks: items.filter((i) => i.kind === 'block').length,
        fixed: items.filter((i) => i.kind === 'event').length,
      },
    }
  }, [now, view.days, view.courseId, courses, assignments, blocks, plannerEvents, scheduleOverrides])

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])

  return (
    <ViewBlock
      icon={CalendarRange}
      label={`Next ${view.days === 1 ? '24 hours' : `${view.days} days`}`}
      title={view.title}
      right={
        <span className="text-[11px] tnum text-ink-3">
          {counts.deadlines} due · {counts.blocks} booked{counts.fixed ? ` · ${counts.fixed} fixed` : ''}
        </span>
      }
    >
      {overdue.length > 0 && (
        <div className="mb-2 rounded-[10px] border border-line bg-surface-2 p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <TriangleAlert size={12} className="text-[var(--c-critical)] shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--c-critical-ink)]">
              {overdue.length} overdue
            </span>
          </div>
          <ul className="flex flex-col">
            {overdue.slice(0, 3).map((a) => (
              <li key={a.id} className="flex items-center gap-2 py-[3px]">
                <CourseDot course={a.courseId ? courseById.get(a.courseId) : null} />
                <span className="min-w-0 flex-1 text-[12.5px] text-ink truncate">{a.title}</span>
                <span className="shrink-0 text-[11px] tnum text-ink-3">{a.due ? fmtDayShort(a.due) : 'No deadline'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {days.length === 0 ? (
        <Nothing>
          Nothing is on the calendar for the next {view.days === 1 ? 'day' : `${view.days} days`}.
        </Nothing>
      ) : (
        <div className="flex flex-col">
          {days.map((d) => (
            <div key={d.day}>
              <DayHeading at={d.at} now={now} />
              <ul className="mt-1">
                {d.items.map((i) => (
                  <li key={i.id}>
                    <TimelineRow
                      item={i}
                      now={now}
                      onOpen={i.assignment && host ? () => host.openTask(i.assignment!.id) : undefined}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {hiddenDays > 0 && (
            <p className="pt-2.5 text-[11.5px] text-ink-3">
              {hiddenDays} more {hiddenDays === 1 ? 'day' : 'days'} in this window. See the planner for the rest.
            </p>
          )}
        </div>
      )}
    </ViewBlock>
  )
}

const HOUR_PX = 34

function TimetableCard({ view, now }: { view: Extract<View, { kind: 'timetable' }>; now: number }) {
  const courses = useStore((s) => s.courses)
  const plannerEvents = useStore((s) => s.plannerEvents)
  const scheduleOverrides = useStore((s) => s.scheduleOverrides)
  const tt = useMemo(() => buildTimetable(courses, view.courseId), [courses, view.courseId])
  const course = view.courseId ? courses.find((c) => c.id === view.courseId) : undefined

  const next = useMemo(() => {
    const items = buildTimeline({
      from: now,
      to: +addDays(startOfDay(now), 8),
      courses,
      assignments: [],
      blocks: [],
      plannerEvents,
      scheduleOverrides,
      courseId: view.courseId,
    })
    return items.find((i) => i.kind === 'class')
  }, [courses, plannerEvents, scheduleOverrides, now, view.courseId])

  if (!tt.count) {
    return (
      <ViewBlock icon={Table} label="Class times" title={view.title}>
        <Nothing>
          {course
            ? `No class times recorded for ${course.code}. Add them on the course and they show up here and on the planner.`
            : 'No class times recorded yet. Add them to a course and your week fills in.'}
        </Nothing>
      </ViewBlock>
    )
  }

  return (
    <ViewBlock
      icon={Table}
      label="Class times"
      title={view.title}
      right={
        next && (
          <span className="text-[11px] tnum text-ink-3">
            next {WEEKDAY_SHORT[new Date(next.at).getDay()]} {fmtTime(next.at, { compact: true })}
          </span>
        )
      }
    >
      {course ? (
        <ul className="flex flex-col gap-1.5">
          {tt.days.flatMap((d) =>
            d.slots.map((s) => (
              <li key={s.id} className="flex items-center gap-2.5">
                <span className="w-[34px] shrink-0 text-[12px] font-semibold text-ink">{WEEKDAY_SHORT[d.day]}</span>
                <span className="text-[13px] tnum text-ink shrink-0">
                  {fmtTimeRange(fromMinutes(s.start), fromMinutes(s.end))}
                </span>
                {hasMultipleMeetingKinds(s.course) && <KindBadge kind={s.kind} />}
                <PlaceLine place={parsePlace(s.room)} className="text-ink-3" />

                <span className="ml-auto shrink-0 text-[11px] tnum text-ink-3 hidden sm:inline">
                  {fmtDuration(s.end - s.start)}
                </span>
              </li>
            )),
          )}
        </ul>
      ) : (
        <TimetableGrid tt={tt} />
      )}
    </ViewBlock>
  )
}

const fromMinutes = (min: number) => {
  const d = new Date()
  d.setHours(Math.floor(min / 60), min % 60, 0, 0)
  return d
}

function TimetableGrid({ tt }: { tt: ReturnType<typeof buildTimetable> }) {
  const hours = Array.from({ length: Math.max(1, tt.toHour - tt.fromHour) }, (_, i) => tt.fromHour + i)
  const height = hours.length * HOUR_PX

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex gap-1 min-w-[300px]">
        <div className="shrink-0 w-[30px] pt-[18px]">
          <div className="relative" style={{ height }}>
            {hours.map((h, i) => (
              <span
                key={h}
                className="absolute right-0 -translate-y-1/2 text-[9.5px] tnum text-ink-3"
                style={{ top: i * HOUR_PX }}
              >
                {h % 12 === 0 ? 12 : h % 12}
                {h < 12 ? 'a' : 'p'}
              </span>
            ))}
          </div>
        </div>

        {tt.days.map((d) => (
          <div key={d.day} className="flex-1 min-w-[72px]">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3 text-center pb-1">
              {WEEKDAY_SHORT[d.day]}
            </p>
            <div className="relative rounded-[8px] bg-surface-2 border border-line overflow-hidden" style={{ height }}>
              {hours.map((h, i) =>
                i === 0 ? null : (
                  <span
                    key={h}
                    className="absolute left-0 right-0 h-px bg-line"
                    style={{ top: i * HOUR_PX }}
                    aria-hidden
                  />
                ),
              )}
              {d.slots.map((s) => {
                const top = ((s.start - tt.fromHour * 60) / 60) * HOUR_PX
                const h = Math.max(14, ((s.end - s.start) / 60) * HOUR_PX)
                return (
                  <div
                    key={s.id}
                    className="absolute left-[2px] right-[2px] rounded-[6px] px-[3px] py-[1px] overflow-hidden"
                    style={{
                      top,
                      height: h,
                      background: solidOf(s.course, 18),
                      border: `1px solid ${edgeOf(s.course, 38)}`,
                    }}
                    title={`${s.course.code}${hasMultipleMeetingKinds(s.course) ? ` ${KIND[s.kind].label}` : ''} · ${WEEKDAY_SHORT[d.day]} ${fmtTime(fromMinutes(s.start))}–${fmtTime(fromMinutes(s.end))}${s.room ? ` · ${s.room}` : ''}`}
                  >
                    <p className="flex items-center gap-[3px] text-[10px] font-semibold text-ink leading-tight min-w-0">
                      {hasMultipleMeetingKinds(s.course) && <KindGlyph kind={s.kind} size={9} className="text-ink-2" />}
                      <span className="truncate">{s.course.code}</span>
                    </p>
                    {h >= 26 && (
                      <p className="text-[9px] tnum text-ink-2 leading-tight truncate">
                        {s.room ?? fmtTime(fromMinutes(s.start), { compact: true })}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TaskCard({ view, ai }: { view: Extract<View, { kind: 'task' }>; ai: AiController }) {
  const assignments = useStore((s) => s.assignments)
  const courses = useStore((s) => s.courses)
  const blocks = useStore((s) => s.blocks)
  const host = useCommandHost()
  const now = ai.now

  const task = assignments.find((a) => a.id === view.taskId)
  const ranked = ai.derived.ranked.find((r) => r.assignment.id === view.taskId)
  const course = task?.courseId ? courses.find((c) => c.id === task.courseId) : undefined
  const logged = Math.round(ai.derived.byAssignment.get(view.taskId) ?? 0)
  const booked = useMemo(
    () =>
      blocks
        .filter((b) => b.assignmentId === view.taskId && +new Date(b.end) > now)
        .sort((a, b) => +new Date(a.start) - +new Date(b.start))
        .slice(0, 4),
    [blocks, view.taskId, now],
  )

  if (!task) {
    return (
      <ViewBlock icon={ListChecks} label="Task" title={view.title}>
        <Nothing>That task is no longer in Nudge.</Nothing>
      </ViewBlock>
    )
  }

  const doneSteps = task.subtasks.filter((s) => s.done).length
  const overdue = task.status !== 'done' && !!task.due && +new Date(task.due) < now

  return (
    <ViewBlock
      icon={ListChecks}
      label={KIND_LABEL[task.kind]}
      title={view.title}
      onOpen={host ? () => host.openTask(task.id) : undefined}
      right={
        task.status === 'done' ? (
          <Chip tone="good">done</Chip>
        ) : (
          <Chip tone={overdue ? 'critical' : ranked?.verdict === 'behind' ? 'warn' : 'quiet'}>
            {overdue ? 'overdue' : (VERDICT_LABEL[ranked?.verdict ?? ''] ?? 'open')}
          </Chip>
        )
      }
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        {course && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2">
            <CourseDot course={course} />
            {course.code}
          </span>
        )}

        {task.title !== view.title && <span className="text-[13px] text-ink">{task.title}</span>}
      </div>

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <Chip tone={overdue ? 'critical' : 'neutral'} className="tnum">
          <Clock size={11} />
          {task.due ? `${fmtDay(task.due)} · ${fmtTime(task.due)}` : 'No deadline'}
        </Chip>
        {task.weight != null && <Chip tone="quiet">{task.weight}% of grade</Chip>}
        {ranked && <Chip tone="quiet" className="tnum">{fmtDuration(ranked.remainingMin)} left</Chip>}
        {logged > 0 && <Chip tone="quiet" className="tnum">{fmtDuration(logged)} logged</Chip>}
      </div>

      {ranked && ranked.progress > 0 && ranked.progress < 1 && (
        <div className="mt-2.5 flex items-center gap-2">
          <Meter fraction={ranked.progress} color={colorOf(course)} />
          <span className="text-[11px] tnum text-ink-3 shrink-0">{Math.round(ranked.progress * 100)}%</span>
        </div>
      )}

      {task.subtasks.length > 0 && (
        <div className="mt-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3 mb-1">
            Steps · {doneSteps}/{task.subtasks.length}
          </p>
          <ul className="flex flex-col gap-[3px]">
            {task.subtasks.map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <span
                  className={cx(
                    'mt-[3px] h-[13px] w-[13px] rounded-[4px] border-[1.5px] grid place-items-center shrink-0',
                    s.done ? 'bg-invert-bg border-invert-bg text-invert-ink' : 'border-line-2 text-transparent',
                  )}
                  aria-hidden
                >
                  <Check size={9} strokeWidth={3} />
                </span>
                <span className={cx('text-[12.5px] leading-snug', s.done ? 'text-ink-3 line-through' : 'text-ink')}>
                  {s.title}
                </span>
                {s.due && <span className="ml-auto shrink-0 text-[11px] tnum text-ink-3">{fmtDayShort(s.due)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {booked.length > 0 && (
        <div className="mt-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3 mb-1">Time booked</p>
          <ul className="flex flex-col gap-[3px]">
            {booked.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-[12.5px] text-ink-2 tnum">
                <CourseDot course={course} size={14} />
                {fmtDay(b.start)} · {fmtTime(b.start, { compact: true })}
                <span className="text-ink-3">
                  {fmtDuration(Math.round((+new Date(b.end) - +new Date(b.start)) / 60_000))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {host && (
        <button
          type="button"
          onClick={() => host.openTask(task.id)}
          className="mt-3 text-[12px] font-medium text-ink-2 hover:text-ink transition-colors"
        >
          Open task →
        </button>
      )}
    </ViewBlock>
  )
}

function WorkCard({ view, ai }: { view: Extract<View, { kind: 'work' }>; ai: AiController }) {
  const assignments = useStore((s) => s.assignments)
  const courses = useStore((s) => s.courses)
  const host = useCommandHost()
  const now = ai.now

  const course = view.courseId ? courses.find((c) => c.id === view.courseId) : undefined
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])

  const rows = useMemo(() => {
    const cutoff = view.days ? +addDays(startOfDay(now), view.days) : Infinity
    const rankOf = new Map(ai.derived.ranked.map((r, i) => [r.assignment.id, i]))
    return assignments
      .filter((a) => {
        if (a.archived) return false
        if (view.courseId && a.courseId !== view.courseId) return false
        if (view.status === 'open' && a.status === 'done') return false
        if (view.status === 'done' && a.status !== 'done') return false
        return a.due ? +new Date(a.due) < cutoff : !view.days
      })
      .sort((a, b) => {
        if (a.status === 'done' && b.status === 'done') {
          const aDue = b.due ? +new Date(b.due) : Number.POSITIVE_INFINITY
          const bDue = a.due ? +new Date(a.due) : Number.POSITIVE_INFINITY
          return aDue - bDue
        }
        const ra = rankOf.get(a.id) ?? Number.MAX_SAFE_INTEGER
        const rb = rankOf.get(b.id) ?? Number.MAX_SAFE_INTEGER
        return ra - rb
      })
      .slice(0, 12)
  }, [assignments, ai.derived.ranked, view.courseId, view.status, view.days, now])

  const label = view.status === 'done' ? 'Finished' : view.status === 'all' ? 'All work' : 'Open work'

  return (
    <ViewBlock
      icon={ListChecks}
      label={course ? `${label} · ${course.code}` : label}
      title={view.title}
      right={<span className="text-[11px] tnum text-ink-3">{rows.length}</span>}
    >
      {rows.length === 0 ? (
        <Nothing>
          {view.status === 'done'
            ? 'Nothing finished yet.'
            : course
              ? `Nothing open for ${course.code}.`
              : 'No open work. The list is clear.'}
        </Nothing>
      ) : (
        <ul className="flex flex-col">
          {rows.map((a) => (
            <li key={a.id}>
              <TaskLine
                task={a}
                course={a.courseId ? courseById.get(a.courseId) : undefined}
                now={now}
                remainingMin={ai.derived.ranked.find((r) => r.assignment.id === a.id)?.remainingMin}
                showCourse={!course}
                onOpen={host ? () => host.openTask(a.id) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </ViewBlock>
  )
}

function TaskLine({
  task,
  course,
  now,
  remainingMin,
  onOpen,
  showCourse = true,
}: {
  task: Assignment
  course?: Course
  now: number
  remainingMin?: number
  onOpen?: () => void
  showCourse?: boolean
}) {
  const done = task.status === 'done'
  const overdue = !done && !!task.due && +new Date(task.due) < now
  const body = (
    <>
      <CourseDot course={course} />
      <div className="min-w-0 flex-1">
        <p className={cx('text-[13px] leading-snug truncate', done ? 'text-ink-3 line-through' : 'text-ink')}>
          {task.title}
        </p>
        <div className="flex items-center gap-x-2 text-[11px] text-ink-3 tnum">
          {course && showCourse && <span className="font-medium text-ink-2">{course.code}</span>}
          <span>{KIND_LABEL[task.kind]}</span>
          {task.weight != null && <span>{task.weight}%</span>}
          {!done && remainingMin != null && <span>{fmtDuration(remainingMin)} left</span>}
        </div>
      </div>
      <span
        className={cx(
          'shrink-0 text-[11px] tnum',
          overdue ? 'text-[var(--c-critical-ink)] font-medium' : 'text-ink-3',
        )}
      >
        {task.due ? fmtDayShort(task.due) : 'No deadline'}
      </span>
    </>
  )
  if (!onOpen) return <div className="flex items-center gap-2 py-1.5">{body}</div>
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-2 py-1.5 px-1 -mx-1 rounded-lg text-left hover:bg-tint transition-colors"
    >
      {body}
    </button>
  )
}

function CourseCard({ view, ai }: { view: Extract<View, { kind: 'course' }>; ai: AiController }) {
  const courses = useStore((s) => s.courses)
  const assignments = useStore((s) => s.assignments)
  const host = useCommandHost()
  const now = ai.now

  const course = courses.find((c) => c.id === view.courseId)
  const outlook = useMemo(
    () => (course ? gradeOutlook(course, assignments) : null),
    [course, assignments],
  )

  if (!course) {
    return (
      <ViewBlock icon={GraduationCap} label="Course" title={view.title}>
        <Nothing>That course is no longer in Nudge.</Nothing>
      </ViewBlock>
    )
  }

  const open = ai.derived.ranked.filter((r) => r.assignment.courseId === course.id)
  const minutes = Math.round(ai.derived.byCourse.get(course.id) ?? 0)
  const stale = ai.derived.staleByCourse.get(course.id) ?? 0
  const meetings = groupMeetings(course.meetings)
  const places = distinctPlaces(course)
  const hasMultipleKinds = hasMultipleMeetingKinds(course)

  return (
    <ViewBlock
      icon={GraduationCap}
      label={course.archived ? 'Course · archived' : 'Course'}
      title={view.title}
      right={<CourseDot course={course} size={15} />}
    >
      {course.title && <p className="text-[12.5px] text-ink-2 -mt-0.5 mb-2">{course.title}</p>}

      {course.professor && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
          <span className="inline-flex items-center gap-1 min-w-0">
            <User size={11} className="shrink-0" />
            <span className="truncate">{course.professor}</span>
          </span>
        </div>
      )}

      {meetings.length > 0 && (
        <div className="mb-2.5 flex flex-col gap-1">
          {meetings.map((g, i) => {
            const place = places.length === 1 ? null : parsePlace(g.room ?? course.room)
            return (
              <div key={i} className="flex items-start gap-2 min-w-0">
                {hasMultipleKinds && <KindBadge kind={g.kind} className="mt-[1px]" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] leading-[18px] flex items-baseline gap-1.5 min-w-0">
                    <span className="font-medium text-ink-2 shrink-0">{fmtDays(g.days)}</span>
                    <span className="tnum text-ink-3 truncate">
                      {fmtTimeRange(fromMinutes(g.start), fromMinutes(g.end))}
                    </span>
                  </p>
                  {place && <PlaceLine place={place} size="xs" className="text-ink-3" />}
                </div>
              </div>
            )
          })}
          {places.length === 1 && <PlaceLine place={places[0]} size="xs" className="text-ink-3 mt-0.5" />}
        </div>
      )}

      {outlook && (outlook.display != null || outlook.target != null) && (
        <div className="mb-2.5">
          <div className="flex items-baseline justify-between text-[11.5px] mb-1">
            <span className="text-ink-3">Grade</span>
            <span className="tnum text-ink-2">
              {outlook.display != null ? `${outlook.display}%` : '—'}
              {outlook.target != null && <span className="text-ink-3"> / {outlook.target}% target</span>}
            </span>
          </div>
          <Meter fraction={(outlook.display ?? 0) / 100} color={colorOf(course)} />
          {outlook.needed != null && outlook.remainingWeight > 0 && (
            <p className="mt-1 text-[11px] text-ink-3 leading-snug">
              {outlook.outOfReach
                ? `Target is out of reach. It would take ${outlook.needed}% on the remaining ${Math.round(outlook.remainingWeight)}%.`
                : `Needs ${Math.max(0, outlook.needed)}% on the remaining ${Math.round(outlook.remainingWeight)}% to hit target.`}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="quiet" className="tnum">
          {open.length} open
        </Chip>
        {minutes > 0 && (
          <Chip tone="quiet" className="tnum">
            {fmtDuration(minutes)} logged
          </Chip>
        )}
        {stale >= 4 && <Chip tone="warn">untouched {stale}d</Chip>}
      </div>

      {open.length > 0 && (
        <ul className="mt-2.5 flex flex-col border-t border-line pt-1.5">
          {open.slice(0, 5).map((r) => (
            <li key={r.assignment.id}>
              <TaskLine
                task={r.assignment}
                course={course}
                now={now}
                remainingMin={r.remainingMin}
                showCourse={false}
                onOpen={host ? () => host.openTask(r.assignment.id) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </ViewBlock>
  )
}

function DayCard({ view, ai }: { view: Extract<View, { kind: 'day' }>; ai: AiController }) {
  const courses = useStore((s) => s.courses)
  const assignments = useStore((s) => s.assignments)
  const blocks = useStore((s) => s.blocks)
  const plannerEvents = useStore((s) => s.plannerEvents)
  const scheduleOverrides = useStore((s) => s.scheduleOverrides)
  const capacity = useStore((s) => s.settings.dailyCapacityMin)
  const host = useCommandHost()
  const now = ai.now

  const at = +fromDayKey(view.day)
  const isToday = view.day === dayKey(now)

  const { items, plannedMin } = useMemo(() => {
    const end = +addDays(fromDayKey(view.day), 1)
    const list = buildTimeline({ from: at, to: end, courses, assignments, blocks, plannerEvents, scheduleOverrides })
    const planned = list
      .filter((i) => i.kind === 'block')
      .reduce((s, i) => s + (i.endAt ? (i.endAt - i.at) / 60_000 : 0), 0)
    return { items: list, plannedMin: Math.round(planned) }
  }, [at, view.day, courses, assignments, blocks, plannerEvents, scheduleOverrides])

  const studied = isToday ? Math.round(ai.derived.studiedTodayMin) : 0

  return (
    <ViewBlock
      icon={CalendarDays}
      label={isToday ? 'Today' : new Date(at).toLocaleDateString(undefined, { weekday: 'long' })}
      title={view.title}
      right={<span className="text-[11px] tnum text-ink-3">{fmtDayShort(at)}</span>}
    >
      <div className="mb-2.5">
        <div className="flex items-baseline justify-between text-[11.5px] mb-1">
          <span className="text-ink-3">{isToday ? 'Studied today' : 'Study time booked'}</span>
          <span className="tnum text-ink-2">
            {fmtDuration(isToday ? studied : plannedMin)}
            <span className="text-ink-3"> / {fmtDuration(capacity)}</span>
          </span>
        </div>
        <Meter
          fraction={(isToday ? studied : plannedMin) / Math.max(1, capacity)}
          over={(isToday ? studied : plannedMin) > capacity}
        />
      </div>

      {items.length === 0 ? (
        <Nothing>Nothing is scheduled that day.</Nothing>
      ) : (
        <ul>
          {items.map((i) => (
            <li key={i.id}>
              <TimelineRow
                item={i}
                now={now}
                onOpen={i.assignment && host ? () => host.openTask(i.assignment!.id) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </ViewBlock>
  )
}

function WorkloadCard({ view, ai }: { view: Extract<View, { kind: 'workload' }>; ai: AiController }) {
  const blocks = useStore((s) => s.blocks)
  const capacity = useStore((s) => s.settings.dailyCapacityMin)
  const now = ai.now

  const loads = useMemo(
    () => dayLoads(blocks, ai.derived.sessions, startOfDay(now), view.days, capacity),
    [blocks, ai.derived.sessions, now, view.days, capacity],
  )
  const overloaded = loads.filter((d) => d.overloaded).length

  return (
    <ViewBlock
      icon={CalendarClock}
      label={`Next ${view.days} days`}
      title={view.title}
      right={
        overloaded > 0 ? (
          <Chip tone="warn">{overloaded} overloaded</Chip>
        ) : (
          <span className="text-[11px] tnum text-ink-3">{fmtDuration(capacity)} a day</span>
        )
      }
    >
      <ul className="flex flex-col gap-1.5">
        {loads.map((d) => {
          const at = +fromDayKey(d.day)
          return (
            <li key={d.day} className="flex items-center gap-2">
              <span className="w-[30px] shrink-0 text-[11px] font-medium text-ink-2">
                {WEEKDAY_SHORT[new Date(at).getDay()]}
              </span>
              <Meter fraction={d.plannedMin / Math.max(1, d.capacityMin)} over={d.overloaded} />
              <span
                className={cx(
                  'w-[46px] shrink-0 text-right text-[11px] tnum',
                  d.overloaded ? 'text-[var(--c-warn)] font-medium' : d.plannedMin ? 'text-ink-2' : 'text-ink-3',
                )}
              >
                {fmtDuration(d.plannedMin)}
              </span>
            </li>
          )
        })}
      </ul>
    </ViewBlock>
  )
}

function ProgressCard({ view, ai }: { view: Extract<View, { kind: 'progress' }>; ai: AiController }) {
  const courses = useStore((s) => s.courses)
  const assignments = useStore((s) => s.assignments)
  const now = ai.now

  const days = useMemo(() => studyByDay(ai.derived.sessions, now, view.days), [ai.derived.sessions, now, view.days])
  const total = days.reduce((s, d) => s + d.minutes, 0)
  const peak = Math.max(30, ...days.map((d) => d.minutes))
  const since = +addDays(startOfDay(now), -(view.days - 1))

  const finished = assignments.filter(
    (a) => a.status === 'done' && a.completedAt && +new Date(a.completedAt) >= since,
  ).length

  const byCourse = useMemo(() => {
    const out: { course: Course; minutes: number }[] = []
    for (const c of courses) {
      if (c.archived) continue
      const minutes = Math.round(
        ai.derived.sessions
          .filter((s) => s.courseId === c.id && +new Date(s.start) >= since)
          .reduce((sum, s) => sum + s.minutes, 0),
      )
      if (minutes > 0) out.push({ course: c, minutes })
    }
    return out.sort((a, b) => b.minutes - a.minutes)
  }, [courses, ai.derived.sessions, since])

  const courseMax = Math.max(1, ...byCourse.map((c) => c.minutes))

  return (
    <ViewBlock
      icon={TrendingUp}
      label={`Last ${view.days === 1 ? 'day' : `${view.days} days`}`}
      title={view.title}
      right={
        ai.derived.streak.current > 1 && (
          <span className="inline-flex items-center gap-1 text-[11px] tnum text-ink-2">
            <Flame size={11} className="text-[var(--c-warn)]" />
            {ai.derived.streak.current}d
          </span>
        )
      }
    >
      <div className="flex items-baseline gap-3">
        <span className="text-[22px] font-semibold tracking-[-0.02em] text-ink tnum">{fmtDuration(total)}</span>
        <span className="text-[12px] text-ink-3">
          studied{finished > 0 && ` · ${finished} task${finished === 1 ? '' : 's'} finished`}
        </span>
      </div>

      <div className="mt-2.5 flex items-end gap-[3px] h-[42px]">
        {days.map((d) => (
          <div key={d.day} className="flex-1 flex flex-col justify-end h-full" title={`${d.day}: ${fmtDuration(d.minutes)}`}>
            <div
              className="w-full rounded-[3px] bg-ink-3/70 min-h-[2px]"
              style={{ height: `${Math.max(3, (d.minutes / peak) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tnum text-ink-3">
        <span>{fmtDayShort(days[0]?.at ?? now)}</span>
        <span>{fmtDayShort(days[days.length - 1]?.at ?? now)}</span>
      </div>

      {byCourse.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1.5 border-t border-line pt-2.5">
          {byCourse.slice(0, 5).map(({ course, minutes }) => (
            <li key={course.id} className="flex items-center gap-2">
              <CourseDot course={course} />
              <span className="w-[64px] shrink-0 text-[11.5px] font-medium text-ink-2 truncate">{course.code}</span>
              <Meter fraction={minutes / courseMax} color={colorOf(course)} />
              <span className="w-[42px] shrink-0 text-right text-[11px] tnum text-ink-3">{fmtDuration(minutes)}</span>
            </li>
          ))}
        </ul>
      )}

      {total === 0 && <p className="mt-2 text-[12px] text-ink-3">No study time logged in this window.</p>}
    </ViewBlock>
  )
}

const RENDERS: Record<ViewKind, true> = {
  agenda: true,
  timetable: true,
  task: true,
  work: true,
  course: true,
  day: true,
  workload: true,
  progress: true,
}
void RENDERS

function ViewCard({ view, ai }: { view: View; ai: AiController }) {
  switch (view.kind) {
    case 'agenda':
      return <AgendaCard view={view} now={ai.now} />
    case 'timetable':
      return <TimetableCard view={view} now={ai.now} />
    case 'task':
      return <TaskCard view={view} ai={ai} />
    case 'work':
      return <WorkCard view={view} ai={ai} />
    case 'course':
      return <CourseCard view={view} ai={ai} />
    case 'day':
      return <DayCard view={view} ai={ai} />
    case 'workload':
      return <WorkloadCard view={view} ai={ai} />
    case 'progress':
      return <ProgressCard view={view} ai={ai} />
  }
}

export function ViewBlocks({ views, ai }: { views: View[]; ai: AiController }) {
  if (!views.length) return null
  return (
    <div className="flex flex-col gap-2">
      {views.map((v) => (
        <ViewCard key={v.id} view={v} ai={ai} />
      ))}
    </div>
  )
}
