import { createElement, Fragment, useMemo, useState, type CSSProperties } from 'react'
import {
  Calendar,
  CalendarOff,
  CalendarPlus,
  Check,
  ClipboardCheck,
  Coffee,
  Play,
  School,
} from 'lucide-react'
import type { Assignment, Course, PlannerEvent, ScheduleOverride, StudyBlock } from '../../lib/types'
import {
  dayAgenda,
  hasMultipleMeetingKinds,
  kindOf,
  nextCommitment,
  scheduleOverrideOn,
  type AgendaEntry,
} from '../../lib/meetings'
import { addDays, fmtDay, fmtDuration, fmtTime, fmtTimeRange, startOfDay } from '../../lib/date'
import { Button, CourseDot, Panel, SectionTitle, Segmented } from '../ui'
import { cardClick, cx } from '../../lib/ui'
import { subjectIcon } from '../../lib/subjectIcon'
import { blockDisplay } from '../../lib/scheduleDisplay'
import { HopRow, ScheduleMeta } from './ClassBits'
import { SegmentBar } from './SessionPlan'

export function DaySchedule({
  courses,
  blocks,
  assignments,
  plannerEvents,
  scheduleOverrides,
  now,
  onGoPlan,
  onStartFocus,
  onOpenCourse,
  onOpenBlock,
  onToggleDone,
  className,
  style,
}: {
  courses: Course[]
  blocks: StudyBlock[]
  assignments: Assignment[]
  plannerEvents: PlannerEvent[]
  scheduleOverrides: ScheduleOverride[]
  now: number
  onGoPlan: () => void
  onStartFocus: (assignmentId: string | null, courseId: string | null, blockId: string) => void
  onOpenCourse: (courseId: string) => void
  onOpenBlock: (blockId: string) => void
  onToggleDone: (blockId: string) => void
  className?: string
  style?: CSSProperties
}) {
  const [userSelectedDay, setUserSelectedDay] = useState<'today' | 'tomorrow' | null>(null)

  const today = useMemo(() => startOfDay(now), [now])
  const tomorrow = useMemo(() => addDays(today, 1), [today])

  const todayAgenda = useMemo(
    () => dayAgenda(courses, blocks, today, assignments, { plannerEvents, scheduleOverrides, blocks }),
    [courses, blocks, assignments, plannerEvents, scheduleOverrides, today],
  )

  const tomorrowAgenda = useMemo(
    () => dayAgenda(courses, blocks, tomorrow, assignments, { plannerEvents, scheduleOverrides, blocks }),
    [courses, blocks, assignments, plannerEvents, scheduleOverrides, tomorrow],
  )

  const todayClasses = useMemo(() => todayAgenda.filter((e) => e.cls), [todayAgenda])
  const todayMustBeThere = useMemo(
    () =>
      todayAgenda.filter(
        (e) =>
          !!e.cls ||
          e.block?.kind === 'appointment' ||
          e.block?.kind === 'one_off_class' ||
          e.block?.kind === 'exam' ||
          (!!e.event && !e.event.allDay),
      ),
    [todayAgenda],
  )

  const autoShowTomorrow = useMemo(() => {
    const currentHour = new Date(now).getHours()
    const hasPendingBlocksTonight = todayAgenda.some(
      (e) =>
        e.block &&
        (!e.block.kind || e.block.kind === 'study') &&
        !e.block.done,
    )
    if (hasPendingBlocksTonight && currentHour < 22) return false
    if (todayClasses.length > 0) {
      const lastClassEnd = Math.max(...todayClasses.map((c) => c.end))
      const lastCommitmentEnd = Math.max(lastClassEnd, ...todayMustBeThere.map((c) => c.end))
      return (now >= lastCommitmentEnd && currentHour >= 18) || currentHour >= 21
    }
    if (todayMustBeThere.length > 0) {
      const lastCommitmentEnd = Math.max(...todayMustBeThere.map((c) => c.end))
      return (now >= lastCommitmentEnd && currentHour >= 18) || currentHour >= 21
    }
    return currentHour >= 18
  }, [todayAgenda, todayClasses, todayMustBeThere, now])

  const isTomorrow = userSelectedDay !== null ? userSelectedDay === 'tomorrow' : autoShowTomorrow
  const agenda = isTomorrow ? tomorrowAgenda : todayAgenda
  const targetDate = isTomorrow ? tomorrow : today

  const override = scheduleOverrideOn(scheduleOverrides, targetDate)

  const nextId = !isTomorrow ? agenda.find((e) => e.start > now)?.id : undefined

  const startableId = !isTomorrow
    ? agenda.find((e) => e.block && !e.block.done && e.end > now && e.start - now < 30 * 60_000)?.id
    : undefined

  const upcoming = useMemo(
    () =>
      agenda.length
        ? null
        : nextCommitment(courses, isTomorrow ? +tomorrow + 86_400_000 : now, 7, {
            plannerEvents,
            scheduleOverrides,
          }),
    [agenda.length, courses, plannerEvents, scheduleOverrides, isTomorrow, tomorrow, now],
  )

  const classCount = agenda.filter((e) => e.cls).length
  const oneOffClassCount = agenda.filter((e) => e.block?.kind === 'one_off_class').length
  const examCount = agenda.filter((e) => e.event?.kind === 'exam' || e.block?.kind === 'exam').length
  const appointmentCount = agenda.filter((e) => e.block?.kind === 'appointment').length
  const studyMin = agenda
    .filter((e) => e.block && (!e.block.kind || e.block.kind === 'study'))
    .reduce((s, e) => s + (e.end - e.start) / 60_000, 0)
  const freeMin = agenda
    .filter((e) => e.block?.kind === 'free')
    .reduce((s, e) => s + (e.end - e.start) / 60_000, 0)

  const summaryParts: string[] = []
  if (classCount > 0) summaryParts.push(`${classCount} class${classCount === 1 ? '' : 'es'}`)
  if (oneOffClassCount > 0)
    summaryParts.push(`${oneOffClassCount} one-off class${oneOffClassCount === 1 ? '' : 'es'}`)
  if (examCount > 0) summaryParts.push(`${examCount} exam${examCount === 1 ? '' : 's'}`)
  if (appointmentCount > 0) summaryParts.push(`${appointmentCount} appointment${appointmentCount === 1 ? '' : 's'}`)
  if (studyMin > 0) summaryParts.push(`${fmtDuration(studyMin)} study`)
  if (freeMin > 0) summaryParts.push(`${fmtDuration(freeMin)} free time`)

  return (
    <Panel as="section" className={cx('px-2 py-2.5', className)} style={style}>
      <SectionTitle
        className="px-1.5"
        right={
          <button
            onClick={onGoPlan}
            className="text-[11.5px] font-medium text-ink-2 hover:text-ink inline-flex items-center gap-1"
          >
            <CalendarPlus size={12} /> Plan
          </button>
        }
      >
        {isTomorrow ? "Tomorrow's schedule" : "Today's schedule"}
      </SectionTitle>

      <div className="px-1.5 mb-2.5">
        <Segmented
          ariaLabel="Select day to view"
          size="sm"
          value={isTomorrow ? 'tomorrow' : 'today'}
          onChange={(v) => setUserSelectedDay(v as 'today' | 'tomorrow')}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'tomorrow', label: 'Tomorrow' },
          ]}
          className="w-full [&>button]:flex-1"
        />
      </div>

      <div>
        {override && (
          <div className="mb-2 px-2.5 py-1.5 rounded-lg border border-line bg-surface-2 flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2">
            <CalendarOff size={13} className="text-ink-3 shrink-0" />
            <span>
              {override.title ||
                (override.scheduleDay == null
                  ? 'No classes scheduled'
                  : `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][override.scheduleDay]} timetable`)}
            </span>
          </div>
        )}

        {agenda.length === 0 ? (
          <div className="px-2 py-2 text-center">
            <p className="text-[13px] text-ink-2 leading-relaxed">
              {isTomorrow
                ? 'No classes or commitments scheduled for tomorrow.'
                : 'No classes or commitments scheduled for today.'}
            </p>
            {upcoming && (
              <p className="mt-1 text-[11.5px] text-ink-3 leading-relaxed">
                {upcoming.kind === 'exam' && upcoming.course ? (
                  <>
                    Next is {upcoming.course.code} {upcoming.title} (Exam), {fmtDay(upcoming.start)} at{' '}
                    {fmtTime(upcoming.start, { compact: true })}
                    {upcoming.place ? ` · ${upcoming.place.raw}` : ''}.
                  </>
                ) : upcoming.kind === 'exam' ? (
                  <>
                    Next is {upcoming.title} (Exam), {fmtDay(upcoming.start)} at{' '}
                    {fmtTime(upcoming.start, { compact: true })}
                    {upcoming.place ? ` · ${upcoming.place.raw}` : ''}.
                  </>
                ) : (
                  <>
                    Next is {upcoming.course?.code ?? upcoming.title}
                    {upcoming.cls && upcoming.course && hasMultipleMeetingKinds(upcoming.course)
                      ? ` ${kindOf(upcoming.cls.meeting.kind).label.toLowerCase()}`
                      : ''}
                    , {fmtDay(upcoming.start)} at {fmtTime(upcoming.start, { compact: true })}
                    {upcoming.place ? ` · ${upcoming.place.raw}` : ''}.
                  </>
                )}
              </p>
            )}
            <Button size="sm" className="mt-3" onClick={onGoPlan}>
              <CalendarPlus size={14} />
              Block out time
            </Button>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-0.5">
              {agenda.map((entry) => (
                <Fragment key={entry.id}>
                  {entry.hop && <HopRow hop={entry.hop} />}
                  <Row
                    entry={entry}
                    now={now}
                    isNext={entry.id === nextId}
                    startable={entry.id === startableId}
                    onStartFocus={onStartFocus}
                    onOpenCourse={onOpenCourse}
                    onOpenBlock={onOpenBlock}
                    onToggleDone={onToggleDone}
                  />
                </Fragment>
              ))}
            </ul>

            {summaryParts.length > 0 && (
              <p className="mt-2 px-1.5 text-[11.5px] text-ink-3 tnum">
                {summaryParts.join(' · ')}
              </p>
            )}
          </>
        )}
      </div>
    </Panel>
  )
}

function Row({
  entry,
  now,
  isNext,
  startable,
  onStartFocus,
  onOpenCourse,
  onOpenBlock,
  onToggleDone,
}: {
  entry: AgendaEntry
  now: number
  isNext: boolean
  startable?: boolean
  onStartFocus: (assignmentId: string | null, courseId: string | null, blockId: string) => void
  onOpenCourse: (courseId: string) => void
  onOpenBlock: (blockId: string) => void
  onToggleDone: (blockId: string) => void
  className?: string
  style?: CSSProperties
}) {
  const live = entry.start <= now && entry.end >= now
  const past = entry.end < now
  const cls = entry.cls
  const course = cls?.course

  const wrap = cx(
    'flex items-start gap-2.5 px-1.5 py-2 rounded-xl transition-colors',
    live && 'bg-tint',
  )
  const timeLine = fmtTimeRange(entry.start, entry.end)
  const minutes = Math.round((entry.end - entry.start) / 60_000)

  if (cls && course) {
    const spec = kindOf(cls.meeting.kind)
    const multiKind = hasMultipleMeetingKinds(course)
    return (
      <li className={cx(wrap, 'cursor-pointer')} title={timeLine} onClick={cardClick(() => onOpenCourse(course.id))}>
        <TimeCell at={entry.start} muted={past} />
        <span className="w-[18px] shrink-0 grid place-items-center h-[17px]">
          <CourseDot course={course} />
        </span>
        <button
          type="button"
          onClick={() => onOpenCourse(course.id)}
          className="min-w-0 flex-1 text-left"
          aria-label={`${course.code}${multiKind ? ` ${spec.label}` : ''}, ${timeLine}${cls.place ? `, ${cls.place.raw}` : ''}`}
        >
          <p className="flex items-baseline gap-1.5 min-w-0">
            <span
              className={cx(
                'text-[13px] font-medium leading-[17px] truncate',
                past ? 'text-ink-3' : 'text-ink',
              )}
            >
              {course.code}
            </span>
            {multiKind && <span className="ui-eyebrow shrink-0">{spec.short}</span>}
          </p>
          <ScheduleMeta minutes={minutes} place={cls.place} className="mt-0.5" />
        </button>
        {live ? <NowTag /> : isNext ? <NextTag /> : null}
      </li>
    )
  }

  if (entry.event) {
    return <EventRow entry={entry} now={now} isNext={isNext} />
  }

  const b = entry.block
  if (!b) return null
  const display = blockDisplay({
    block: b.title ? b : { ...b, title: entry.title },
    course: entry.course,
  })

  if (b.kind === 'one_off_class') {
    const Icon = b.courseCode?.trim() ? subjectIcon(b.courseCode) : School
    return (
      <li
        className={cx(wrap, 'cursor-pointer', past && 'opacity-65')}
        title={`${display.title} · ${timeLine}`}
        onClick={cardClick(() => onOpenBlock(b.id))}
      >
        <TimeCell at={entry.start} muted={past} />
        <span className="w-[18px] shrink-0 grid place-items-center h-[17px]">
          {entry.course ? (
            <CourseDot course={entry.course} />
          ) : (
            createElement(Icon, { size: 14, className: 'text-ink-2', 'aria-hidden': true })
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cx('flex items-baseline gap-1.5 min-w-0', past ? 'text-ink-3' : 'text-ink')}>
            <span className="text-[13px] font-medium leading-[17px] truncate">{display.title}</span>
            {display.typeLabel && <span className="ui-eyebrow shrink-0">{display.typeLabel}</span>}
          </p>
          <ScheduleMeta minutes={minutes} place={entry.place} className="mt-0.5" />
        </div>
        {live ? <NowTag /> : isNext ? <NextTag /> : null}
      </li>
    )
  }

  if (b.kind === 'free') {
    return (
      <li
        className={cx(wrap, 'cursor-pointer', past && 'opacity-65')}
        title={`${display.title} · ${timeLine}`}
        onClick={cardClick(() => onOpenBlock(b.id))}
      >
        <TimeCell at={entry.start} muted={past} />
        <span className="w-[18px] shrink-0 grid place-items-center h-[17px] text-ink-2">
          {entry.course ? <CourseDot course={entry.course} /> : <Coffee size={14} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cx('flex items-baseline gap-1.5 min-w-0', past ? 'text-ink-3' : 'text-ink')}>
            <span className="text-[13px] font-medium leading-[17px] truncate">{display.title}</span>
            {display.typeLabel && <span className="ui-eyebrow shrink-0">{display.typeLabel}</span>}
          </p>
          <ScheduleMeta minutes={minutes} className="mt-0.5" />
        </div>
      </li>
    )
  }

  if (b.kind === 'appointment') {
    return (
      <li
        className={cx(wrap, 'cursor-pointer', past && 'opacity-65')}
        title={`${display.title} · ${timeLine}${b.location ? ` · ${b.location}` : ''}`}
        onClick={cardClick(() => onOpenBlock(b.id))}
      >
        <TimeCell at={entry.start} muted={past} />
        <span className="w-[18px] shrink-0 grid place-items-center h-[17px]">
          {entry.course ? <CourseDot course={entry.course} /> : <Calendar size={14} className="text-ink-2" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cx('flex items-baseline gap-1.5 min-w-0', past ? 'text-ink-3' : 'text-ink')}>
            <span className="text-[13px] font-medium leading-[17px] truncate">{display.title}</span>
            {display.typeLabel && <span className="ui-eyebrow shrink-0">{display.typeLabel}</span>}
          </p>
          <ScheduleMeta minutes={minutes} place={entry.place} className="mt-0.5" />
        </div>
        {live ? <NowTag /> : isNext ? <NextTag /> : null}
      </li>
    )
  }

  if (b.kind === 'exam') {
    return (
      <li
        className={cx(wrap, 'cursor-pointer', past && 'opacity-65')}
        title={`${display.title} · ${timeLine}${b.location ? ` · ${b.location}` : ''}`}
        onClick={cardClick(() => onOpenBlock(b.id))}
      >
        <TimeCell at={entry.start} muted={past} />
        <span className="w-[18px] shrink-0 grid place-items-center h-[17px]">
          {entry.course ? <CourseDot course={entry.course} /> : <ClipboardCheck size={14} className="text-[var(--c-warn)]" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cx('flex items-baseline gap-1.5 min-w-0', past ? 'text-ink-3' : 'text-ink')}>
            <span className="text-[13px] font-medium leading-[17px] truncate">{display.title}</span>
            <span className="ui-eyebrow ui-eyebrow-flag shrink-0">EXAM</span>
            {b.weight != null && <span className="text-[11px] text-ink-3 font-normal shrink-0">{b.weight}%</span>}
          </p>
          <ScheduleMeta minutes={minutes} place={entry.place} className="mt-0.5" />
        </div>
        {live ? <NowTag /> : isNext ? <NextTag /> : null}
      </li>
    )
  }

  const due = !!startable && !b.done
  const openBlock = () => onOpenBlock(b.id)
  return (
    <li
      className={cx(wrap, 'cursor-pointer')}
      title={timeLine}
      onClick={cardClick(openBlock)}
    >
      <TimeCell at={entry.start} muted={past || b.done} />
      <button
        type="button"
        onClick={() => onToggleDone(b.id)}
        aria-label={b.done ? 'Mark incomplete' : 'Mark completed'}
        className={cx(
          'shrink-0 h-[17px] w-[18px] grid place-items-center transition-transform hover:scale-110 active:scale-95',
        )}
      >
        <span
          className={cx(
            'h-[16px] w-[16px] rounded-full border-[1.5px] grid place-items-center',
            b.done
              ? 'bg-invert-bg border-invert-bg text-invert-ink'
              : 'border-line-2 text-transparent hover:border-ink',
          )}
        >
          <Check size={10} strokeWidth={3} />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={cx(
            'text-[13px] font-medium leading-[17px] truncate flex items-center gap-1.5',
            b.done ? 'text-ink-3 line-through' : past ? 'text-ink-3' : 'text-ink',
          )}
        >
          {entry.course && <CourseDot course={entry.course} size={13} />}
          <span className="truncate">{display.title}</span>
          {display.typeLabel && <span className="ui-eyebrow shrink-0 ml-1">{display.typeLabel}</span>}
        </p>
        <ScheduleMeta minutes={minutes} className="mt-0.5">
          {live && !b.done && <NowTag />}
          {!live && isNext && !b.done && <NextTag />}
        </ScheduleMeta>

        {!b.done && !past && b.plan && b.plan.length > 1 && (
          <SegmentBar segments={b.plan} height={3} className="mt-1.5 max-w-[150px]" />
        )}
      </div>
      {!b.done &&
        (due ? (
          <Button
            size="xs"
            variant={live ? 'primary' : 'secondary'}
            onClick={() => onStartFocus(b.assignmentId, b.courseId, b.id)}
            className="shrink-0"
          >
            <Play size={12} />
            Start
          </Button>
        ) : (
          <button
            type="button"
            aria-label="Start this block"
            onClick={() => onStartFocus(b.assignmentId, b.courseId, b.id)}
            className="shrink-0 h-6 w-6 grid place-items-center rounded-lg text-ink-3 hover:text-ink hover:bg-tint transition-colors"
          >
            <Play size={13} />
          </button>
        ))}
    </li>
  )
}

function EventRow({
  entry,
  now,
  isNext,
}: {
  entry: AgendaEntry
  now: number
  isNext?: boolean
}) {
  const event = entry.event as PlannerEvent
  const live = entry.start <= now && entry.end >= now
  const past = entry.end < now
  const Icon =
    event.kind === 'custom_class'
      ? School
      : event.kind === 'exam'
        ? ClipboardCheck
        : event.kind === 'blocked_time'
          ? Calendar
          : CalendarOff
  const kind =
    event.kind === 'custom_class'
      ? 'Class'
      : event.kind === 'exam'
        ? 'Exam'
        : event.kind === 'blocked_time'
          ? 'Blocked time'
          : event.kind === 'reading_break'
            ? 'Reading break'
            : 'Holiday'
  const timeLine = event.allDay ? 'All day' : fmtTimeRange(entry.start, entry.end)
  const exam = event.kind === 'exam'

  return (
    <li
      className={cx(
        'flex items-start gap-2.5 px-1.5 py-2 rounded-xl transition-colors',
        event.allDay && 'border border-dashed border-line-2',
        live && 'bg-tint',
        past && 'opacity-65',
      )}
      title={`${kind} · ${event.title}${event.room ? ` · ${event.room}` : ''}`}
    >
      {event.allDay ? (
        <span className="w-[42px] shrink-0 text-right text-[10.5px] font-medium text-ink-3 leading-[17px]">
          All day
        </span>
      ) : (
        <TimeCell at={entry.start} muted={past} />
      )}
      <span className="w-[18px] shrink-0 grid place-items-center h-[17px] text-ink-2">
        {entry.course ? (
          <CourseDot course={entry.course} size={14} />
        ) : (
          <Icon size={14} aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 min-w-0 text-[13px] font-medium leading-[17px]">
          <span className={cx('truncate', past ? 'text-ink-3' : 'text-ink')}>{event.title}</span>
          {exam && <span className="ui-eyebrow shrink-0">EXAM</span>}
          {exam && event.weight != null && (
            <span className="text-[11px] text-ink-3 font-normal shrink-0">{event.weight}%</span>
          )}
        </p>
        <p className="text-[11.5px] text-ink-3 tnum leading-tight mt-0.5 truncate">
          <span className="sr-only">{timeLine} · </span>
          {kind}
          {!event.allDay && ` · ${timeLine}`}
          {event.room && ` · ${event.room}`}
        </p>
      </div>
      {!event.allDay && (live ? <NowTag /> : isNext ? <NextTag /> : null)}
    </li>
  )
}

function TimeCell({ at, muted }: { at: number; muted?: boolean }) {
  const t = fmtTime(at, { compact: true })
  const m = /(am|pm)$/.exec(t)
  return (
    <span
      className={cx(
        'w-[42px] shrink-0 text-right tnum leading-[17px] whitespace-nowrap',
        muted ? 'text-ink-3' : 'text-ink-2',
      )}
      aria-hidden
    >
      <span className="text-[11.5px] font-medium">{m ? t.slice(0, -2) : t}</span>
      {m && <span className="text-[9.5px] text-ink-3">{m[1]}</span>}
    </span>
  )
}

const NowTag = () => <span className="ui-eyebrow ui-eyebrow-flag shrink-0">Now</span>

const NextTag = () => <span className="ui-eyebrow shrink-0">Next</span>
