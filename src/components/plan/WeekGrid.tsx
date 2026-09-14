import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Calendar,
  CalendarOff,
  Check,
  ClipboardCheck,
  Coffee,
  MapPin,
  Plus,
  School,
  User,
  Wifi,
} from 'lucide-react'
import type { Assignment, Course, PlannerEvent, ScheduleOverride, StudyBlock } from '../../lib/types'
import {
  atMinutes,
  clamp,
  dayKey,
  fmtDuration,
  fmtHourLabel,
  fmtTime,
  fmtTimeRange,
  isSameDay,
  minutesOfDay,
} from '../../lib/date'
import { blockSpan, layoutSpans } from '../../lib/layout'
import {
  allDayEventsOn,
  classesOn,
  hasMultipleMeetingKinds,
  hopBetween,
  kindOf,
  parsePlace,
  scheduleOverrideOn,
  type ClassOccurrence,
  type Hop,
} from '../../lib/meetings'
import { stepOf } from '../../lib/steps'
import { edgeOf, solidOf } from '../../lib/theme'
import { subjectIcon } from '../../lib/subjectIcon'
import { blockDisplay } from '../../lib/scheduleDisplay'
import { HopTag } from '../schedule/ClassBits'
import { SegmentBar } from '../schedule/SessionPlan'
import { usePlannerGestures, type Draft } from './usePlannerGestures'
import { CourseDot } from '../ui'
import { cx } from '../../lib/ui'

const GUTTER = 56

type GridItem =
  | { kind: 'block'; block: StudyBlock }
  | { kind: 'class'; occ: ClassOccurrence; hop: Hop | null }
  | { kind: 'event'; event: PlannerEvent }

const itemSpan = (it: GridItem) => {
  if (it.kind === 'block') return blockSpan(it.block)
  if (it.kind === 'class') return { startMin: it.occ.meeting.start, endMin: it.occ.meeting.end }
  return blockSpan(it.event)
}

const ITEM = {
  inset: 2,
  radius: 8,
} as const

const plannerEventKindLabel = (kind: PlannerEvent['kind']) => {
  switch (kind) {
    case 'holiday':
      return 'Holiday'
    case 'reading_break':
      return 'Break'
    case 'exam':
      return 'Exam'
    case 'blocked_time':
      return 'Blocked time'
    case 'custom_class':
      return 'Class'
  }
}

const itemFrame = (leftPct: number, widthPct: number) => ({
  left: `calc(${leftPct}% + ${ITEM.inset}px)`,
  width: `calc(${widthPct}% - ${ITEM.inset * 2}px)`,
  borderRadius: ITEM.radius,
})

function formatTimeParts(startMs: number, endMs: number) {
  const s = new Date(startMs)
  const e = new Date(endMs)
  const sh = s.getHours()
  const sm = s.getMinutes()
  const eh = e.getHours()
  const em = e.getMinutes()

  const sH12 = sh % 12 === 0 ? 12 : sh % 12
  const eH12 = eh % 12 === 0 ? 12 : eh % 12

  const sSuffix = sh < 12 ? 'a' : 'p'
  const eSuffix = eh < 12 ? 'a' : 'p'

  const sTime = sm === 0 ? `${sH12}${sSuffix}` : `${sH12}:${`${sm}`.padStart(2, '0')}${sSuffix}`
  const eTime = em === 0 ? `${eH12}${eSuffix}` : `${eH12}:${`${em}`.padStart(2, '0')}${eSuffix}`

  const durationMin = Math.round((endMs - startMs) / 60_000)
  const duration = fmtDuration(durationMin)

  return {
    start: sTime,
    end: eTime,
    duration,
    fullRange: fmtTimeRange(startMs, endMs),
  }
}

function TypePill({
  label,
  title,
  tone = 'default',
  size = 'sm',
  className,
}: {
  label: string
  title?: string
  tone?: 'default' | 'warn'
  size?: 'xs' | 'sm'
  className?: string
}) {
  const isXs = size === 'xs'
  return (
    <span
      title={title ?? label}
      className={cx(
        'inline-flex items-center justify-center rounded-full border font-bold uppercase tracking-wider shrink-0 leading-none whitespace-nowrap select-none tnum',
        isXs ? 'h-[15px] px-1.5 text-[7.5px]' : 'h-[17px] px-1.5 text-[8.5px]',
        tone === 'warn'
          ? 'bg-[var(--c-warn)]/15 border-[var(--c-warn)]/35 text-[var(--c-warn)]'
          : 'bg-surface/90 border-line-2/70 text-ink-2',
        className,
      )}
    >
      {label}
    </span>
  )
}

export interface WeekGridProps {
  days: Date[]
  visibleDays: number
  blocks: StudyBlock[]
  courses: Course[]
  assignments: Assignment[]
  plannerEvents: PlannerEvent[]
  scheduleOverrides: ScheduleOverride[]
  startHour: number
  endHour: number
  hourPx: number
  now: number
  showClasses: boolean
  selectedId: string | null
  density?: 'fit' | 'spacious'
  minColWidth?: number
  onMoveBlock: (id: string, startMs: number, endMs: number, duplicate: boolean) => void
  onMovePlannerEvent: (id: string, startMs: number, endMs: number) => void
  onMoveClass: (occurrence: ClassOccurrence, startMs: number, endMs: number) => void
  onCreate: (startMs: number, endMs: number) => void
  onSelect: (id: string | null) => void
  onSelectCourse: (courseId: string) => void
  onSelectPlannerEvent: (eventId: string) => void
  onSelectDayException?: (date: string, event?: PlannerEvent | null, override?: ScheduleOverride | null) => void
  onNudgeBlock: (id: string, deltaMin: number, resize: boolean) => void
  onDeleteBlock: (id: string) => void
  onToggleDone: (id: string) => void
}

export function WeekGrid(props: WeekGridProps) {
  const {
    days,
    visibleDays,
    blocks,
    courses,
    assignments,
    plannerEvents,
    scheduleOverrides,
    startHour,
    endHour,
    hourPx,
    now,
    showClasses,
    selectedId,
    density = 'spacious',
    minColWidth,
    onMoveBlock,
    onMovePlannerEvent,
    onMoveClass,
    onCreate,
    onSelect,
    onSelectCourse,
    onSelectPlannerEvent,
    onSelectDayException,
    onNudgeBlock,
    onDeleteBlock,
    onToggleDone,
  } = props

  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [colW, setColW] = useState(160)
  const [measured, setMeasured] = useState(false)
  const pxPerMin = hourPx / 60
  const dayMinStart = startHour * 60
  const dayMinEnd = endHour * 60
  const bodyHeight = (dayMinEnd - dayMinStart) * pxPerMin

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
  const assignmentById = useMemo(() => new Map(assignments.map((a) => [a.id, a])), [assignments])

  const courseForBlock = useCallback((block: StudyBlock) => {
    const kind = block.kind ?? 'study'
    if (kind === 'free') return undefined
    if (block.courseId) {
      return courseById.get(block.courseId)
    }
    if (kind === 'study' && block.assignmentId) {
      const assignment = assignmentById.get(block.assignmentId)
      return assignment?.courseId ? courseById.get(assignment.courseId) : undefined
    }
    return undefined
  }, [courseById, assignmentById])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth - GUTTER
      const natural = Math.floor((w / visibleDays) * 100) / 100
      const baselineMin = minColWidth ?? (density === 'spacious' ? 180 : 130)
      setColW(Math.max(baselineMin, natural))
      setMeasured(true)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [visibleDays, minColWidth, density])

  const dayIndexOf = useCallback(
    (iso: string) => days.findIndex((d) => isSameDay(d, new Date(iso))),
    [days],
  )

  const getBlock = useCallback(
    (id: string) => {
      const b = blocks.find((x) => x.id === id)
      if (!b) return null
      const dayIdx = dayIndexOf(b.start)
      if (dayIdx < 0) return null
      const { startMin, endMin } = blockSpan(b)
      return { dayIdx, startMin, endMin }
    },
    [blocks, dayIndexOf],
  )

  const getPlannerEvent = useCallback(
    (id: string) => {
      const event = plannerEvents.find((x) => x.id === id)
      if (!event || event.allDay) return null
      const dayIdx = dayIndexOf(event.start)
      if (dayIdx < 0) return null
      const { startMin, endMin } = blockSpan(event)
      return { dayIdx, startMin, endMin }
    },
    [plannerEvents, dayIndexOf],
  )

  const perDay = useMemo(() => {
    return days.map((day) => {
      const k = dayKey(day)
      const items: GridItem[] = blocks
        .filter((b) => dayKey(b.start) === k)
        .map((block) => ({ kind: 'block' as const, block }))

      if (showClasses) {
        const occs = classesOn(courses, day, { plannerEvents, scheduleOverrides, blocks })
        occs.forEach((occ, i) => {
          items.push({ kind: 'class', occ, hop: hopBetween(occs[i - 1], occ) })
        })
      }

      plannerEvents
        .filter((event) => !event.allDay && dayKey(event.start) === k)
        .forEach((event) => items.push({ kind: 'event', event }))

      return { day, laid: layoutSpans(items, itemSpan) }
    })
  }, [days, blocks, courses, plannerEvents, scheduleOverrides, showClasses])

  const classById = useMemo(() => {
    const map = new Map<string, ClassOccurrence>()
    for (const day of perDay) {
      for (const item of day.laid) {
        if (item.item.kind === 'class') map.set(item.item.occ.id, item.item.occ)
      }
    }
    return map
  }, [perDay])

  const getClass = useCallback(
    (id: string) => {
      const occurrence = classById.get(id)
      if (!occurrence) return null
      const dayIdx = dayIndexOf(new Date(occurrence.start).toISOString())
      if (dayIdx < 0) return null
      return {
        dayIdx,
        startMin: minutesOfDay(occurrence.start),
        endMin: minutesOfDay(occurrence.end),
      }
    },
    [classById, dayIndexOf],
  )

  const snapTargets = useCallback(
    (excludeBlockId: string | null) => {
      const out = new Set<number>()
      for (const day of perDay) {
        for (const l of day.laid) {
          if (l.item.kind === 'block' && l.item.block.id === excludeBlockId) continue
          out.add(l.startMin)
          out.add(l.endMin)
        }
      }
      return [...out]
    },
    [perDay],
  )

  const { draft, handlers } = usePlannerGestures({
    gridRef,
    scrollRef,
    dayCount: days.length,
    startHour,
    endHour,
    pxPerMin,
    snapMin: 15,
    minDurationMin: 15,
    getBlock,
    getPlannerEvent,
    getClass,
    onMove: (id, dayIdx, startMin, endMin, duplicate) => {
      const day = days[dayIdx]
      if (!day) return
      onMoveBlock(id, +atMinutes(day, startMin), +atMinutes(day, endMin), duplicate)
    },
    onMovePlannerEvent: (id, dayIdx, startMin, endMin) => {
      const day = days[dayIdx]
      if (!day) return
      onMovePlannerEvent(id, +atMinutes(day, startMin), +atMinutes(day, endMin))
    },
    onMoveClass: (id, dayIdx, startMin, endMin) => {
      const day = days[dayIdx]
      const occurrence = classById.get(id)
      if (!day || !occurrence) return
      onMoveClass(occurrence, +atMinutes(day, startMin), +atMinutes(day, endMin))
    },
    onCreate: (dayIdx, startMin, endMin) => {
      const day = days[dayIdx]
      if (!day) return
      onCreate(+atMinutes(day, startMin), +atMinutes(day, endMin))
    },
    onTapBlock: onSelect,
    onTapPlannerEvent: onSelectPlannerEvent,
    onTapClass: (id) => {
      const occurrence = classById.get(id)
      if (occurrence) onSelectCourse(occurrence.course.id)
    },
    snapTargets,
  })

  const didInitialScroll = useRef(false)
  useEffect(() => {
    if (didInitialScroll.current || !scrollRef.current || !measured) return
    didInitialScroll.current = true
    const target = clamp(minutesOfDay(now) - 90, dayMinStart, dayMinEnd - 240)
    scrollRef.current.scrollTop = (target - dayMinStart) * pxPerMin
    const todayIdx = days.findIndex((d) => isSameDay(d, now))
    if (todayIdx > 0 && visibleDays < days.length) {
      scrollRef.current.scrollLeft = Math.max(0, (todayIdx - 0.5) * colW)
    }
  }, [now, dayMinStart, dayMinEnd, pxPerMin, days, visibleDays, colW, measured])

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  )

  const top = (min: number) => (min - dayMinStart) * pxPerMin
  const height = (a: number, b: number) => Math.max(14, (b - a) * pxPerMin)

  const nowMin = minutesOfDay(now)
  const draggedBlock = draft?.blockId ? blocks.find((b) => b.id === draft.blockId) : undefined
  const draggedClass = draft?.classId ? classById.get(draft.classId) : undefined

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 overflow-auto scroll-slim overscroll-contain bg-surface rounded-panel border border-line shadow-card"
      style={{ scrollbarGutter: 'stable' }}
    >
      <div style={{ width: GUTTER + colW * days.length, minWidth: '100%' }}>
        {}
        <div className="sticky top-0 z-30 flex bg-surface/92 backdrop-blur-md border-b border-line shadow-xs">
          <div
            className="sticky left-0 z-40 bg-surface shrink-0 border-r border-line flex items-center justify-center"
            style={{ width: GUTTER }}
          >
            <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Time</span>
          </div>
          {days.map((day, i) => {
            const isToday = isSameDay(day, now)
            const allDay = allDayEventsOn(plannerEvents, day)
            const override = scheduleOverrideOn(scheduleOverrides, day)
            const dayEvent = allDay[0] ?? plannerEvents.find((event) => isSameDay(new Date(event.start), day))
            const exceptionLabel = override
              ? 'Timetable switch'
              : dayEvent
                ? plannerEventKindLabel(dayEvent.kind)
                : null
            const mins = perDay[i]?.laid.reduce(
              (s, l) => s + (l.item.kind === 'block' ? l.endMin - l.startMin : 0),
              0,
            ) ?? 0
            const dayName = colW >= 155
              ? day.toLocaleDateString(undefined, { weekday: 'long' })
              : day.toLocaleDateString(undefined, { weekday: 'short' })

            return (
              <div
                key={+day}
                className={cx(
                  'shrink-0 px-2.5 py-2.5 text-center border-r border-line last:border-r-0 transition-colors',
                  isToday ? 'bg-tint/70' : 'hover:bg-tint/20',
                )}
                style={{ width: colW }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={cx(
                    'text-[10.5px] uppercase tracking-[0.08em] font-bold truncate',
                    isToday ? 'text-ink' : 'text-ink-3',
                  )}>
                    {dayName}
                  </span>
                  {mins > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-surface-2 border border-line/60 text-[9.5px] font-medium text-ink-3 tnum leading-none">
                      {fmtDuration(mins)}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onSelectDayException?.(dayKey(day))}
                    className={cx(
                      'grid place-items-center h-[28px] w-[28px] rounded-full text-[13.5px] font-bold tnum cursor-pointer transition-transform hover:scale-105',
                      isToday ? 'bg-invert-bg text-invert-ink shadow-xs' : 'text-ink hover:bg-tint',
                    )}
                    title={`${exceptionLabel ? `${exceptionLabel} for` : 'Add holiday, break, or schedule change for'} ${day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}
                  >
                    {day.getDate()}
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectDayException?.(dayKey(day))}
                    aria-label={`Add exception for ${day.toLocaleDateString()}`}
                    title="Add holiday, break, or schedule change"
                    className="opacity-0 group-hover/grid:opacity-60 hover:!opacity-100 text-[11px] text-ink-3 hover:text-ink p-1 rounded-md hover:bg-tint transition-all"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {override && (
                  <button
                    type="button"
                    onClick={() => onSelectDayException?.(dayKey(day), null, override)}
                    className="mt-1 w-full truncate rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[9.5px] font-medium text-ink-2 hover:bg-tint text-center transition-colors cursor-pointer"
                    title={override.title || 'Schedule override'}
                  >
                    {override.scheduleDay == null
                      ? 'No classes'
                      : `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][override.scheduleDay]} timetable`}
                  </button>
                )}

                {allDay.slice(0, 2).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onSelectDayException?.(dayKey(day), event, null)}
                    className="mt-1 w-full truncate rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[9.5px] font-medium text-ink-2 hover:bg-tint text-center transition-colors cursor-pointer"
                    title={event.title}
                  >
                    {event.title}
                  </button>
                ))}
              </div>
            )
          })}
        </div>

        {}
        <div className="flex">
          {}
          <div
            className="sticky left-0 z-20 shrink-0 bg-surface border-r border-line"
            style={{ width: GUTTER, height: bodyHeight }}
          >
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10.5px] font-semibold text-ink-3 tnum select-none"
                style={{ top: top(h * 60) }}
              >
                {h > startHour ? fmtHourLabel(h) : ''}
              </div>
            ))}
          </div>

          {}
          <div
            ref={gridRef}
            className="relative flex grid-surface group/grid"
            style={{ height: bodyHeight }}
            {...handlers}
          >
            {perDay.map(({ day, laid }, dayIdx) => {
              const isToday = isSameDay(day, now)
              const isPast = +day < +new Date(now).setHours(0, 0, 0, 0)

              return (
                <div
                  key={+day}
                  className={cx(
                    'relative shrink-0 border-r border-line last:border-r-0 transition-colors',
                    isToday && 'bg-tint/30',
                  )}
                  style={{ width: colW }}
                >
                  {}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-line/75 pointer-events-none"
                      style={{ top: top(h * 60) }}
                    />
                  ))}
                  {hours.slice(0, -1).map((h) => (
                    <div
                      key={`half-${h}`}
                      className="absolute inset-x-0 border-t border-dashed border-line/40 pointer-events-none"
                      style={{ top: top(h * 60 + 30) }}
                    />
                  ))}

                  {}
                  {(isPast || isToday) && (
                    <div
                      className="absolute inset-x-0 top-0 bg-sunken/45 pointer-events-none"
                      style={{
                        height: isPast ? bodyHeight : clamp(top(nowMin), 0, bodyHeight),
                      }}
                    />
                  )}

                  {}
                  {laid.map(({ item, startMin, endMin, col, cols }, i) => {
                    if (item.kind === 'class') {
                      if (draft?.active && draft.classId === item.occ.id) return null
                      return (
                        <ClassChip
                          key={`class-${i}`}
                          occ={item.occ}
                          hop={item.hop}
                          top={top(startMin)}
                          height={height(startMin, endMin)}
                          left={(col / cols) * 100}
                          width={(1 / cols) * 100}
                          colW={colW}
                          dragging={false}
                          onOpen={() => onSelectCourse(item.occ.course.id)}
                        />
                      )
                    }

                    if (item.kind === 'event') {
                      if (draft?.active && draft.eventId === item.event.id) return null
                      return (
                        <PlannerEventChip
                          key={item.event.id}
                          event={item.event}
                          course={item.event.courseId ? courseById.get(item.event.courseId) : undefined}
                          top={top(startMin)}
                          height={height(startMin, endMin)}
                          left={(col / cols) * 100}
                          width={(1 / cols) * 100}
                          colW={colW}
                          now={now}
                          onOpen={() => onSelectPlannerEvent(item.event.id)}
                        />
                      )
                    }

                    const block = item.block
                    if (draft?.active && draft.blockId === block.id && !draft.duplicate) return null

                    return (
                      <BlockChip
                        key={block.id}
                        block={block}
                        course={courseForBlock(block)}
                        assignment={block.assignmentId ? assignmentById.get(block.assignmentId) : undefined}
                        top={top(startMin)}
                        height={height(startMin, endMin)}
                        left={(col / cols) * 100}
                        width={(1 / cols) * 100}
                        colW={colW}
                        dragging={false}
                        selected={selectedId === block.id}
                        past={+new Date(block.end) < now}
                        now={now}
                        onKeyCommand={(cmd, shift) => {
                          if (cmd === 'delete') onDeleteBlock(block.id)
                          else if (cmd === 'done') onToggleDone(block.id)
                          else if (cmd === 'open') onSelect(block.id)
                          else onNudgeBlock(block.id, cmd === 'up' ? -15 : 15, shift)
                        }}
                      />
                    )
                  })}

                  {}
                  {draft?.active && draft.mode === 'create' && draft.dayIdx === dayIdx && (() => {
                    const ghostH = height(draft.startMin, draft.endMin)
                    const duration = draft.endMin - draft.startMin
                    const timeText = `${fmtTime(atMinutes(day, draft.startMin))} – ${fmtTime(atMinutes(day, draft.endMin))}`
                    const isGhostTiny = ghostH < 26

                    return (
                      <div
                        className={cx(
                          'absolute rounded-lg border border-ink/30 bg-tint-2 pointer-events-none shadow-xs overflow-hidden',
                          isGhostTiny
                            ? 'px-1.5 py-0.5 flex items-center justify-between'
                            : 'px-2 py-1 flex flex-col justify-center gap-0.5',
                        )}
                        style={{
                          top: top(draft.startMin),
                          height: ghostH,
                          left: 2,
                          right: 3,
                        }}
                      >
                        <div className="text-[10px] font-bold text-ink tnum leading-tight truncate">
                          {timeText}
                        </div>
                        <div className="text-[9px] text-ink-3 tnum font-semibold shrink-0">
                          {fmtDuration(duration)}
                        </div>
                      </div>
                    )
                  })()}

                  {}
                  {isToday && nowMin >= dayMinStart && nowMin <= dayMinEnd && (
                    <div
                      className="absolute inset-x-0 z-20 pointer-events-none"
                      style={{ top: top(nowMin) }}
                      aria-hidden
                    >
                      <div className="relative h-0 border-t-2" style={{ borderColor: 'var(--c-critical)' }}>
                        <span
                          className="absolute -left-[3px] -top-[4.5px] h-[7px] w-[7px] rounded-full animate-pulse"
                          style={{ background: 'var(--c-critical)' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {}
            {draft?.active && draft.blockId && draggedBlock && (
              <div
                className="absolute z-40 pointer-events-none"
                style={{ left: draft.dayIdx * colW, width: colW, top: 0, bottom: 0 }}
              >
                <BlockChip
                  block={draggedBlock}
                  course={courseForBlock(draggedBlock)}
                  assignment={
                    draggedBlock.assignmentId ? assignmentById.get(draggedBlock.assignmentId) : undefined
                  }
                  top={top(draft.startMin)}
                  height={height(draft.startMin, draft.endMin)}
                  left={0}
                  width={100}
                  colW={colW}
                  dragging
                  selected={false}
                  past={false}
                  now={now}
                  onKeyCommand={() => {}}
                />
              </div>
            )}

            {draft?.active && draft.classId && draggedClass && days[draft.dayIdx] && (() => {
              const preview = {
                ...draggedClass,
                start: +atMinutes(days[draft.dayIdx], draft.startMin),
                end: +atMinutes(days[draft.dayIdx], draft.endMin),
              }
              return (
                <div
                  className="absolute z-40 pointer-events-none"
                  style={{ left: draft.dayIdx * colW, width: colW, top: 0, bottom: 0 }}
                >
                  <ClassChip
                    occ={preview}
                    hop={null}
                    top={top(draft.startMin)}
                    height={height(draft.startMin, draft.endMin)}
                    left={0}
                    width={100}
                    colW={colW}
                    dragging
                    now={now}
                    onOpen={() => {}}
                  />
                </div>
              )
            })()}

            {draft?.active && draft.eventId && (() => {
              const draggedEvent = plannerEvents.find((event) => event.id === draft.eventId)
              if (!draggedEvent || !days[draft.dayIdx]) return null
              const preview = {
                ...draggedEvent,
                start: atMinutes(days[draft.dayIdx], draft.startMin).toISOString(),
                end: atMinutes(days[draft.dayIdx], draft.endMin).toISOString(),
              }
              return (
                <div
                  className="absolute z-40 pointer-events-none"
                  style={{ left: draft.dayIdx * colW, width: colW, top: 0, bottom: 0 }}
                >
                  <PlannerEventChip
                    event={preview}
                    course={preview.courseId ? courseById.get(preview.courseId) : undefined}
                    top={top(draft.startMin)}
                    height={height(draft.startMin, draft.endMin)}
                    left={0}
                    width={100}
                    colW={colW}
                    dragging
                    onOpen={() => {}}
                  />
                </div>
              )
            })()}

            {}
            {draft?.active && draft.mode !== 'create' && days[draft.dayIdx] && (
              <div
                className="absolute z-50 pointer-events-none px-2.5 py-1 rounded-lg bg-invert-bg text-invert-ink text-[11px] font-semibold tnum shadow-pop whitespace-nowrap"
                style={{
                  left: clamp(draft.dayIdx * colW + colW / 2, 84, colW * days.length - 84),
                  transform: 'translateX(-50%)',
                  top: Math.max(2, top(draft.startMin) - 26),
                }}
              >
                {fmtTime(atMinutes(days[draft.dayIdx], draft.startMin))} –{' '}
                {fmtTime(atMinutes(days[draft.dayIdx], draft.endMin))}
                <span className="opacity-70 font-normal"> · {fmtDuration(draft.endMin - draft.startMin)}</span>
                {draft.duplicate && <span className="opacity-85"> · copy</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ClassChip({
  occ,
  hop,
  top,
  height,
  left,
  width,
  colW,
  now = Date.now(),
  dragging = false,
  onOpen,
}: {
  occ: ClassOccurrence
  hop: Hop | null
  top: number
  height: number
  left: number
  width: number
  colW: number
  now?: number
  dragging?: boolean
  onOpen: () => void
}) {
  const { course: c, meeting: m, place } = occ
  const spec = kindOf(m.kind)
  const hasMultipleKinds = hasMultipleMeetingKinds(c)

  const effectiveColW = colW * (width / 100)
  const isNarrow = effectiveColW < 112
  const isUltraNarrow = effectiveColW < 82

  const isTier1 = height < 26
  const isTier2 = height >= 26 && height < 46
  const isTier3 = height >= 46 && height < 68

  const timeParts = formatTimeParts(occ.start, occ.end)

  const chipPadding = isTier1
    ? (isUltraNarrow ? '1px 3px' : isNarrow ? '1px 4px' : '1px 5px')
    : isTier2
      ? (isUltraNarrow ? '2px 3.5px' : isNarrow ? '2px 4px' : '2.5px 6px')
      : isTier3
        ? (isUltraNarrow ? '2.5px 4px' : isNarrow ? '2.5px 5px' : '3px 7px')
        : (height >= 120 ? (isNarrow ? '5px 5px' : '6px 7px') : (isNarrow ? '3.5px 5px' : '4px 7px'))

  const fullTooltip = [
    `${c.code}${c.title ? ` · ${c.title}` : ''}`,
    hasMultipleKinds ? `${spec.label} (${spec.short})` : spec.label,
    `${timeParts.fullRange} (${timeParts.duration})`,
    place ? (place.remote ? 'Online / Remote' : `Location: ${place.building}${place.room ? ` ${place.room}` : ''}`) : null,
    hop ? (hop.clash ? `⚠ Clashes with ${hop.from.building}` : `🚶 ${hop.gapMin} min walk from ${hop.from.building}`) : null,
  ].filter(Boolean).join('\n')

  return (
    <button
      type="button"
      data-class-id={c.id}
      data-class-occurrence-id={occ.id}
      onClick={onOpen}
      aria-label={`${c.code} ${spec.label}, ${timeParts.start}–${timeParts.end}${place ? `, ${place.raw}` : ''}`}
      title={`${fullTooltip}\nDrag to move this occurrence only. For a permanent change: Courses → Edit.`}
      className={cx(
        'absolute overflow-hidden text-left select-none rounded-[8px] transition-all duration-150 touch-none',
        dragging
          ? 'z-40 shadow-pop cursor-grabbing'
          : 'cursor-grab hover:brightness-[0.97] hover:shadow-xs focus-visible:outline-2 focus-visible:outline-ink active:scale-[0.99]',
      )}
      style={{
        ...itemFrame(left, width),
        top,
        height,
        padding: chipPadding,
        backgroundColor: solidOf(c, 13),
        boxShadow: `inset 0 0 0 1px ${edgeOf(c, 32)}`,
      }}
    >
      {isTier1 ? (
        <div className="h-full flex items-center justify-between gap-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <CourseDot course={c} size={12} className="shrink-0" />
            <span className="text-[10px] font-bold text-ink tracking-tight truncate min-w-0 leading-none">
              {c.code}
            </span>
            {hasMultipleKinds && (
              <TypePill label={spec.short} title={spec.label} size={isNarrow ? 'xs' : 'sm'} />
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            {hop && <HopTag hop={hop} minutes={false} size={isNarrow ? 'xs' : 'sm'} />}
            {effectiveColW >= 125 && (
              <span className="text-[9px] font-medium text-ink-3 tnum leading-none">
                {timeParts.start}
              </span>
            )}
          </div>
        </div>
      ) : isTier2 ? (
        <div className="h-full flex flex-col justify-center gap-0.5 min-w-0">
          <div className="flex items-center justify-between gap-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <CourseDot course={c} size={13} className="shrink-0" />
              <span className="text-[10px] font-bold text-ink tracking-tight truncate min-w-0 leading-tight">
                {c.code}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-auto">
              {hasMultipleKinds && (
                <TypePill label={spec.short} title={spec.label} size={isNarrow ? 'xs' : 'sm'} />
              )}
              {hop && <HopTag hop={hop} minutes={effectiveColW >= 135} size={isNarrow ? 'xs' : 'sm'} />}
            </div>
          </div>
          <div className="flex items-center gap-1 text-[9px] font-medium text-ink-2 tnum leading-tight min-w-0">
            {place ? (
              <span className="truncate min-w-0">
                {isNarrow && place.shortBuilding ? place.shortBuilding : (place.building || place.room)}
              </span>
            ) : (
              <span className="truncate min-w-0 font-semibold">{timeParts.start}–{timeParts.end}</span>
            )}
          </div>
        </div>
      ) : isTier3 ? (
        <div className="h-full flex flex-col justify-center gap-[2px] min-w-0">
          <div className="flex items-center justify-between gap-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <CourseDot course={c} size={14} className="shrink-0" />
              <span className="text-[10.5px] font-bold text-ink tracking-tight truncate min-w-0 leading-tight">
                {c.code}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-auto">
              {hasMultipleKinds && (
                <TypePill label={spec.short} title={spec.label} size={isNarrow ? 'xs' : 'sm'} />
              )}
              {hop && <HopTag hop={hop} minutes={effectiveColW >= 135} size={isNarrow ? 'xs' : 'sm'} />}
            </div>
          </div>
          {place ? (
            <div className="flex items-center gap-1 text-[9px] font-medium text-ink-2 leading-tight truncate min-w-0">
              <MapPin size={9} className="shrink-0 text-ink-3" />
              <span className="truncate">{place.building || place.room}</span>
            </div>
          ) : c.title ? (
            <div className="text-[10px] font-medium text-ink-2 leading-tight truncate min-w-0">
              {c.title}
            </div>
          ) : null}
          <div className="flex items-center gap-1 text-[9px] font-medium text-ink-3 tnum leading-tight min-w-0">
            <span className="truncate min-w-0 font-semibold text-ink-2">{timeParts.start}–{timeParts.end}</span>
            {!isNarrow && (
              <span className="text-[8.5px] font-semibold uppercase tracking-wider shrink-0">
                ({timeParts.duration})
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col justify-start gap-1 min-w-0">
          <div className="flex items-center justify-between gap-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <CourseDot course={c} size={14} className="shrink-0" />
              <span className="text-[10.5px] font-bold text-ink tracking-tight truncate min-w-0 leading-tight">
                {c.code}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-auto">
              {hasMultipleKinds && (
                <TypePill label={spec.short} title={spec.label} />
              )}
              {hop && (
                <HopTag hop={hop} minutes={effectiveColW >= 135} size={isNarrow ? 'xs' : 'sm'} />
              )}
            </div>
          </div>

          {c.title && (
            <div
              className={cx(
                'text-[10px] font-medium text-ink-2 leading-[1.25] min-w-0 break-normal',
                height < 100 ? 'line-clamp-1' : 'line-clamp-2',
              )}
            >
              {c.title}
            </div>
          )}

          {place && (
            <div className="flex items-start gap-1 text-[9px] text-ink-2 leading-tight min-w-0">
              {place.remote ? (
                <Wifi size={9.5} className="shrink-0 text-ink-3 mt-[1px]" aria-hidden />
              ) : (
                <MapPin size={9.5} className="shrink-0 text-ink-3 mt-[1px]" aria-hidden />
              )}
              <span
                className={cx(
                  'font-medium text-ink-2 min-w-0 break-normal',
                  height < 120 ? 'line-clamp-2' : 'line-clamp-3',
                )}
                title={place.building}
              >
                {place.building || place.room}
                {place.room && place.building && !place.building.includes(place.room) ? ` ${place.room}` : ''}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0 text-[9px] font-medium text-ink-2 tnum leading-tight min-w-0 mt-auto">
            <span className="font-semibold shrink-0">{timeParts.start}–{timeParts.end}</span>
            <span className="text-ink-3 text-[8.5px] uppercase tracking-wider font-semibold shrink-0">
              {timeParts.duration}
            </span>
          </div>

          {height >= 120 && c.professor && !isNarrow && (
            <div className="flex items-center gap-1 text-[9px] text-ink-3 leading-tight truncate">
              <User size={9} className="shrink-0" />
              <span className="truncate">{c.professor}</span>
            </div>
          )}
        </div>
      )}
    </button>
  )
}

function PlannerEventChip({
  event,
  course,
  top,
  height,
  left,
  width,
  colW,
  now = Date.now(),
  dragging = false,
  onOpen,
}: {
  event: PlannerEvent
  course?: Course
  top: number
  height: number
  left: number
  width: number
  colW: number
  now?: number
  dragging?: boolean
  onOpen: () => void
}) {
  const isClass = event.kind === 'custom_class'
  const isExam = event.kind === 'exam'
  const Icon = isClass ? School : isExam ? ClipboardCheck : event.kind === 'blocked_time' ? Calendar : CalendarOff
  const kindLabel = isClass ? 'Class' : isExam ? 'Exam' : (colW * (width / 100) < 112 ? 'Appt' : 'Appointment')
  const place = event.room ? parsePlace(event.room) : null

  const effectiveColW = colW * (width / 100)
  const isNarrow = effectiveColW < 112
  const isUltraNarrow = effectiveColW < 82

  const isTier1 = height < 26
  const isTier2 = height >= 26 && height < 46
  const isTier3 = height >= 46 && height < 68

  const timeParts = event.allDay
    ? { start: 'All day', end: '', duration: '', fullRange: 'All day' }
    : formatTimeParts(+new Date(event.start), +new Date(event.end))

  const chipPadding = isTier1
    ? (isUltraNarrow ? '1px 3px' : isNarrow ? '1px 4px' : '1px 5px')
    : isTier2
      ? (isUltraNarrow ? '2px 3.5px' : isNarrow ? '2px 4px' : '2.5px 6px')
      : isTier3
        ? (isUltraNarrow ? '2.5px 4px' : isNarrow ? '2.5px 5px' : '3px 7px')
        : (height >= 120 ? (isNarrow ? '5px 5px' : '6px 7px') : (isNarrow ? '3.5px 5px' : '4px 7px'))

  const handleH = isTier1 ? 3 : isTier2 ? 4 : isTier3 ? 5 : Math.max(5, Math.min(8, Math.floor(height / 6)))
  const startMs = +new Date(event.start)
  const endMs = +new Date(event.end)
  const past = endMs < now
  const daysUntil = (startMs - now) / 86_400_000
  const isImminent = isExam && !past && daysUntil > 0 && daysUntil <= 1.5
  const isApproaching = isExam && !past && daysUntil > 1.5 && daysUntil <= 3.5
  const isSoon = isExam && !past && daysUntil > 3.5 && daysUntil <= 7.5
  const countdownText = isExam && !past
    ? daysUntil <= 0.5
      ? 'Today'
      : daysUntil <= 1.5
        ? 'Tomorrow'
        : daysUntil <= 7
          ? `in ${Math.ceil(daysUntil)}d`
          : null
    : null

  const renderIcon = (size: number) => {
    if (course) return <CourseDot course={course} size={size} className="shrink-0" />
    if (isExam) return <Icon size={size} className="shrink-0 text-[var(--c-warn)]" />
    return <Icon size={size} className="shrink-0 text-ink-2" />
  }

  return (
    <button
      type="button"
      data-planner-event-id={event.id}
      onClick={onOpen}
      aria-label={`${kindLabel}: ${event.title}, ${timeParts.start}–${timeParts.end}${event.room ? `, ${event.room}` : ''}`}
      title={`${kindLabel}: ${event.title}\n${timeParts.fullRange}${event.room ? `\nLocation: ${event.room}` : ''}`}
      className={cx(
        'block-grab group absolute overflow-hidden text-left rounded-[8px] transition-all duration-150',
        'border text-ink select-none',
        isExam
          ? past
            ? 'border-line-2 bg-surface-2 opacity-65'
            : isImminent
              ? 'border-[var(--c-warn)] bg-gradient-to-br from-amber-500/25 to-rose-500/15 shadow-md ring-1 ring-[var(--c-warn)]/60'
              : isApproaching
                ? 'border-[var(--c-warn)]/80 bg-amber-500/15 shadow-xs'
                : isSoon
                  ? 'border-[var(--c-warn)]/60 bg-amber-500/10 shadow-xs'
                  : 'border-[var(--c-warn)]/45 bg-surface shadow-xs'
          : 'border-line-2 bg-surface-2 hover:bg-tint hover:border-line-2/80',
        dragging && 'z-40 shadow-pop cursor-grabbing',
        !dragging && 'cursor-grab',
      )}
      style={{
        ...itemFrame(left, width),
        top,
        height,
        padding: chipPadding,
      }}
    >
      <div
        data-handle="start"
        style={{ height: handleH }}
        className="absolute inset-x-0 top-0 cursor-ns-resize z-10 flex items-start justify-center pointer-events-auto"
      >
        <span className="mt-[1px] h-[2px] w-5 rounded-full bg-ink/20 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="h-full pointer-events-none min-w-0">
        {isTier1 ? (
          <div className="h-full flex items-center justify-between gap-1.5 min-w-0">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              {renderIcon(10)}
              {course && (
                <span className="text-[10px] font-bold text-ink-2 tracking-tight shrink-0">{course.code}</span>
              )}
              <span className="text-[10px] font-bold text-ink leading-none truncate min-w-0">
                {event.title}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-auto">
              {countdownText && <span className="text-[8.5px] font-bold text-[var(--c-warn)] uppercase tracking-tight">{countdownText}</span>}
              {!isNarrow && (
                <TypePill label={isExam ? 'EXAM' : kindLabel} tone={isExam ? 'warn' : 'default'} size="xs" className="shrink-0" />
              )}
              {isImminent && <span className="h-1.5 w-1.5 rounded-full bg-[var(--c-critical)] animate-pulse" aria-label="Exam is imminent" />}
            </div>
          </div>
        ) : isTier2 ? (
          <div className="h-full flex flex-col justify-center gap-0.5 min-w-0">
            <div className="flex items-center justify-between gap-1 min-w-0">
              <div className="flex items-center gap-1 min-w-0 flex-1">
                {renderIcon(10.5)}
                {course && !isNarrow && (
                  <span className="text-[10px] font-bold text-ink-2 tracking-tight shrink-0">{course.code}</span>
                )}
                <span className="text-[10px] font-bold text-ink leading-tight truncate min-w-0">
                  {event.title}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {countdownText && <span className="text-[8.5px] font-bold text-[var(--c-warn)] uppercase tracking-tight">{countdownText}</span>}
                {!isNarrow && <TypePill label={isExam ? 'EXAM' : kindLabel} tone={isExam ? 'warn' : 'default'} size="xs" />}
              </div>
            </div>
            <div className="flex items-center gap-1 text-[9px] font-medium text-ink-2 tnum leading-tight min-w-0">
              {place ? (
                <span className="truncate min-w-0">
                  · {place.shortBuilding || place.building || place.room}
                </span>
              ) : (
                <span className="truncate min-w-0 font-semibold">{timeParts.start}{timeParts.end ? `–${timeParts.end}` : ''}</span>
              )}
            </div>
          </div>
        ) : isTier3 ? (
          <div className="h-full flex flex-col justify-center gap-[2px] min-w-0">
            <div className="flex items-center justify-between gap-1 min-w-0">
              <div className="flex items-center gap-1 min-w-0 flex-1 text-ink-2">
                {renderIcon(10.5)}
                {course && (
                  <span className="text-[10px] font-bold text-ink-2 tracking-tight truncate">{course.code}</span>
                )}
                {!course && (
                  <span className="text-[10px] font-bold text-ink leading-tight truncate">{event.title}</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {countdownText && <span className="text-[8.5px] font-bold text-[var(--c-warn)] uppercase tracking-tight">{countdownText}</span>}
                {!isNarrow && <TypePill label={isExam ? 'EXAM' : kindLabel} tone={isExam ? 'warn' : 'default'} size="xs" />}
              </div>
            </div>

            {course && (
              <div className="text-[10px] font-bold text-ink leading-tight truncate min-w-0">
                {event.title}
              </div>
            )}

            <div className="flex items-center gap-1 text-[9px] font-medium text-ink-2 tnum leading-tight min-w-0">
              {place ? (
                <span className="text-ink-2 truncate min-w-0 flex items-center gap-0.5">
                  · {place.shortBuilding || place.building || place.room}
                </span>
              ) : (
                <span className="truncate min-w-0 font-semibold">{timeParts.start}{timeParts.end ? `–${timeParts.end}` : ''}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col justify-start gap-1.5 min-w-0">
            {course ? (
              <div className="flex items-center justify-between gap-1 min-w-0">
                <div className="flex items-center gap-1 min-w-0 flex-1 text-ink-2">
                  {renderIcon(10.5)}
                  <span className="text-[10.5px] font-bold text-ink-2 tracking-tight truncate">{course.code}</span>
                </div>
                {!isNarrow && <TypePill label={isExam ? 'EXAM' : kindLabel} tone={isExam ? 'warn' : 'default'} size={isNarrow ? 'xs' : 'sm'} />}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-ink-2 min-w-0">
                {renderIcon(10.5)}
                <span className="text-[8.5px] font-bold uppercase tracking-wider truncate min-w-0">{kindLabel}</span>
              </div>
            )}

            <div className="flex items-start gap-1 min-w-0">
              <div
                className={cx(
                  'text-[10.5px] font-semibold text-ink leading-snug min-w-0 break-normal',
                  height < 100 ? 'line-clamp-2' : 'line-clamp-3',
                )}
              >
                {event.title}
              </div>
            </div>

            {place && (
              <div className="flex items-start gap-1 text-[9px] text-ink-2 leading-tight min-w-0">
                <MapPin size={9.5} className="shrink-0 text-ink-3 mt-[1px]" />
                <span
                  className={cx(
                    'font-medium text-ink-2 min-w-0 break-normal',
                    height < 120 ? 'line-clamp-2' : 'line-clamp-3',
                  )}
                  title={place.building}
                >
                  {place.building || place.room}
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0 text-[9px] font-medium text-ink-2 tnum leading-tight min-w-0 mt-auto">
              <span className="font-semibold shrink-0">{timeParts.start}{timeParts.end ? `–${timeParts.end}` : ''}</span>
              {!event.allDay && timeParts.duration && (
                <span className="text-ink-3 text-[8.5px] uppercase tracking-wider font-semibold shrink-0">
                  {timeParts.duration}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        data-handle="end"
        style={{ height: handleH }}
        className="absolute inset-x-0 bottom-0 cursor-ns-resize z-10 flex items-end justify-center pointer-events-auto"
      >
        <span className="mb-[1px] h-[2px] w-5 rounded-full bg-ink/20 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  )
}

interface ChipProps {
  block: StudyBlock
  course?: Course
  assignment?: Assignment
  top: number
  height: number
  left: number
  width: number
  colW: number
  now: number
  dragging: boolean
  selected: boolean
  past: boolean
  onKeyCommand: (cmd: 'up' | 'down' | 'delete' | 'done' | 'open', shift: boolean) => void
}

function BlockChip({
  block,
  course,
  assignment,
  top,
  height,
  left,
  width,
  colW,
  now,
  dragging,
  selected,
  past,
  onKeyCommand,
}: ChipProps) {
  const kind = block.kind ?? 'study'
  const isFree = kind === 'free'
  const isAppointment = kind === 'appointment'
  const isOneOffClass = kind === 'one_off_class'
  const isExam = kind === 'exam'
  const isStudy = !isFree && !isAppointment && !isOneOffClass && !isExam
  const activeAssignment = isStudy ? assignment : undefined
  const activeStep = isStudy ? stepOf(block, activeAssignment) : undefined
  const activeLocation = (isAppointment || isOneOffClass || isExam) ? block.location : undefined
  const locationPlace = activeLocation ? parsePlace(activeLocation) : null
  const activeCourse = isFree ? undefined : course
  const activeCourseCode = isOneOffClass && !activeCourse ? block.courseCode : undefined
  const activePlan = isStudy ? block.plan : undefined
  const done = !!block.done

  const display = blockDisplay({
    block: { ...block, kind },
    course: activeCourse,
    assignment: activeAssignment,
    stepTitle: activeStep?.title,
  })
  const { title } = display

  const effectiveColW = colW * (width / 100)
  const isNarrow = effectiveColW < 112
  const isUltraNarrow = effectiveColW < 82

  const isTier1 = height < 26
  const isTier2 = height >= 26 && height < 46
  const isTier3 = height >= 46 && height < 68

  const timeParts = formatTimeParts(+new Date(block.start), +new Date(block.end))
  const startMs = +new Date(block.start)
  const daysUntil = (startMs - now) / 86_400_000
  const isImminent = isExam && !past && daysUntil > 0 && daysUntil <= 1.5
  const isApproaching = isExam && !past && daysUntil > 1.5 && daysUntil <= 3.5
  const isSoon = isExam && !past && daysUntil > 3.5 && daysUntil <= 7.5
  const countdownText = isExam && !past
    ? daysUntil <= 0.5
      ? 'Today'
      : daysUntil <= 1.5
        ? 'Tomorrow'
        : daysUntil <= 7
          ? `in ${Math.ceil(daysUntil)}d`
          : null
    : null

  const chipPadding = isTier1
    ? (isUltraNarrow ? '1px 3px' : isNarrow ? '1px 4px' : '1px 5px')
    : isTier2
      ? (isUltraNarrow ? '2px 3.5px' : isNarrow ? '2px 4px' : '2.5px 6px')
      : isTier3
        ? (isUltraNarrow ? '2.5px 4px' : isNarrow ? '2.5px 5px' : '3px 7px')
        : (height >= 120 ? (isNarrow ? '5px 5px' : '6px 7px') : (isNarrow ? '3.5px 5px' : '4px 7px'))

  const handleH = isTier1 ? 3 : isTier2 ? 4 : isTier3 ? 5 : Math.max(5, Math.min(8, Math.floor(height / 6)))

  let bg = isFree && !activeCourse
    ? 'var(--c-surface-2)'
    : solidOf(activeCourse, dragging ? 24 : 14)

  let border = isFree && !activeCourse
    ? 'inset 0 0 0 1px var(--c-line-2)'
    : `inset 0 0 0 1px ${edgeOf(activeCourse, dragging ? 46 : 34)}`
  if (isExam) {
    if (past) {
      bg = 'color-mix(in srgb, var(--c-warn) 6%, var(--c-surface-2))'
      border = 'inset 0 0 0 1px var(--c-line-2)'
    } else if (isImminent) {
      bg = 'linear-gradient(135deg, color-mix(in srgb, var(--c-warn) 30%, var(--c-surface)), color-mix(in srgb, var(--c-critical) 16%, var(--c-surface)))'
      border = 'inset 0 0 0 1.5px var(--c-warn), 0 2px 10px -2px rgba(245, 158, 11, 0.45)'
    } else if (isApproaching) {
      bg = 'linear-gradient(135deg, color-mix(in srgb, var(--c-warn) 20%, var(--c-surface)), color-mix(in srgb, var(--c-warn) 12%, var(--c-surface)))'
      border = 'inset 0 0 0 1.5px color-mix(in srgb, var(--c-warn) 75%, var(--c-line-2))'
    } else if (isSoon) {
      bg = 'color-mix(in srgb, var(--c-warn) 14%, var(--c-surface))'
      border = 'inset 0 0 0 1px color-mix(in srgb, var(--c-warn) 60%, var(--c-line-2))'
    } else {
      bg = activeCourse ? solidOf(activeCourse, 14) : 'color-mix(in srgb, var(--c-warn) 9%, var(--c-surface))'
      border = 'inset 0 0 0 1px color-mix(in srgb, var(--c-warn) 45%, var(--c-line-2))'
    }
  }

  const renderLeadingIcon = (size: number) => {
    if (done) return <Check size={size} className="shrink-0 text-ink-2" />
    if (isExam) {
      return <ClipboardCheck size={size} className={cx('shrink-0', isImminent ? 'text-[var(--c-critical-ink)]' : 'text-[var(--c-warn)]')} />
    }
    if (activeCourse) return <CourseDot course={activeCourse} size={size} className="shrink-0" />
    if (activeCourseCode?.trim()) {
      return createElement(subjectIcon(activeCourseCode), { size, className: 'shrink-0 text-ink-2', 'aria-hidden': true })
    }
    if (isFree) return <Coffee size={size} className="shrink-0 text-ink-2" />
    if (isAppointment) return <Calendar size={size} className="shrink-0 text-ink-2" />
    if (isOneOffClass) return <School size={size} className="shrink-0 text-ink-2" aria-hidden="true" />
    return <BookOpen size={size} className="shrink-0 text-ink-2" />
  }

  const kindPillLabel = isExam
    ? 'Exam'
    : isAppointment
    ? 'Appt'
    : isFree
      ? 'Free'
      : isOneOffClass
        ? 'One-off'
        : 'Study'

  const contextSubtitle = (activeStep && title !== activeStep.title)
    ? activeStep.title
    : (activeAssignment && title !== activeAssignment.title)
      ? activeAssignment.title
      : null

  return (
    <div
      data-block-id={block.id}
      role="button"
      tabIndex={0}
      title={`${title}\n${timeParts.fullRange}${activeLocation ? `\nLocation: ${activeLocation}` : ''}${done ? '\nStatus: Done' : ''}`}
      aria-label={`${title}, ${timeParts.start}–${timeParts.end}${done ? ', done' : ''}`}
      onKeyDown={(e) => {
        const k = e.key
        if (k === 'ArrowUp' || k === 'ArrowDown') {
          e.preventDefault()
          onKeyCommand(k === 'ArrowUp' ? 'up' : 'down', e.shiftKey)
        } else if (k === 'Delete' || k === 'Backspace') {
          e.preventDefault()
          onKeyCommand('delete', false)
        } else if (k === 'Enter') {
          e.preventDefault()
          onKeyCommand('open', false)
        } else if (k === ' ') {
          e.preventDefault()
          onKeyCommand('done', false)
        }
      }}
      className={cx(
        'block-grab absolute overflow-hidden group select-none rounded-[8px]',
        'transition-[box-shadow,opacity,transform] duration-150 ease-[var(--ease-out-soft)]',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink',
        dragging ? 'z-40 shadow-pop cursor-grabbing' : 'cursor-grab hover:shadow-card hover:brightness-[0.98]',
        selected && !dragging && 'ring-2 ring-ink ring-offset-1 ring-offset-surface z-20',
        done && 'opacity-65',
        past && !done && 'opacity-80',
        isExam && isImminent && !dragging && 'ring-1 ring-[var(--c-warn)]/60',
      )}
      style={{
        ...itemFrame(left, width),
        top,
        height,
        padding: chipPadding,
        background: bg,
        boxShadow: border,
      }}
    >
      <div
        data-handle="start"
        style={{ height: handleH }}
        className="absolute inset-x-0 top-0 cursor-ns-resize z-10 flex items-start justify-center pointer-events-auto"
      >
        <span className="mt-[1px] h-[2px] w-5 rounded-full bg-ink/20 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="h-full pointer-events-none min-w-0">
        {isTier1 ? (
          <div className="h-full flex items-center justify-between gap-1.5 min-w-0">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              {renderLeadingIcon(10)}
              <span className={cx('text-[10px] font-bold text-ink leading-none truncate min-w-0', done && 'line-through opacity-80')}>
                {title}
              </span>
            </div>
            {!isUltraNarrow && (
              <div className="flex items-center gap-1 shrink-0">
                {countdownText && <span className="text-[8.5px] font-bold text-[var(--c-warn)] uppercase tracking-tight">{countdownText}</span>}
                <TypePill label={kindPillLabel} tone={isExam && isImminent ? 'warn' : 'default'} size="xs" />
              </div>
            )}
          </div>
        ) : isTier2 ? (
          <div className="h-full flex flex-col justify-center gap-0.5 min-w-0">
            <div className="flex items-center justify-between gap-1 min-w-0">
              <div className="flex items-center gap-1 min-w-0 flex-1">
                {renderLeadingIcon(10.5)}
                {activeCourse && title !== activeCourse.code && !isNarrow && (
                  <span className="text-[10px] font-bold text-ink-2 tracking-tight shrink-0">{activeCourse.code}</span>
                )}
                <span className={cx('text-[10px] font-bold text-ink leading-tight truncate min-w-0', done && 'line-through opacity-80')}>
                  {title}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {countdownText && <span className="text-[8.5px] font-bold text-[var(--c-warn)] uppercase tracking-tight">{countdownText}</span>}
                <TypePill label={kindPillLabel} tone={isExam && isImminent ? 'warn' : 'default'} size="xs" />
              </div>
            </div>
            <div className="flex items-center gap-1 text-[9px] font-medium text-ink-2 leading-tight min-w-0">
              {locationPlace ? (
                <span className="truncate min-w-0">
                  · {isNarrow && locationPlace.shortBuilding ? locationPlace.shortBuilding : (locationPlace.building || locationPlace.room)}
                </span>
              ) : contextSubtitle ? (
                <span className="truncate min-w-0">{contextSubtitle}</span>
              ) : (
                <span className="truncate min-w-0 font-semibold tnum text-ink-2">{timeParts.start}–{timeParts.end}</span>
              )}
            </div>
          </div>
        ) : isTier3 ? (
          <div className="h-full flex flex-col justify-center gap-[2px] min-w-0">
            <div className="flex items-center justify-between gap-1 min-w-0">
              <div className="flex items-center gap-1 min-w-0 flex-1 text-ink-2">
                {renderLeadingIcon(10.5)}
                {activeCourse && (
                  <span className="text-[10px] font-bold text-ink-2 tracking-tight truncate">{activeCourse.code}</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {countdownText && <span className="text-[8.5px] font-bold text-[var(--c-warn)] uppercase tracking-tight">{countdownText}</span>}
                <TypePill label={kindPillLabel} tone={isExam && isImminent ? 'warn' : 'default'} size="xs" />
              </div>
            </div>

            <div className={cx('text-[10px] font-bold text-ink leading-tight truncate min-w-0', done && 'line-through opacity-80')}>
              {title}
            </div>

            <div className="flex items-center gap-1 text-[9px] font-medium leading-tight min-w-0">
              {locationPlace ? (
                <span className="truncate min-w-0 text-ink-2">
                  {isNarrow && locationPlace.shortBuilding ? locationPlace.shortBuilding : (locationPlace.building || locationPlace.room)}
                </span>
              ) : contextSubtitle ? (
                <span className="truncate min-w-0 text-ink-2 font-medium">{contextSubtitle}</span>
              ) : (
                <span className="truncate min-w-0 font-semibold text-ink-2 tnum">{timeParts.start}–{timeParts.end}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col justify-start gap-1 min-w-0">
            <div className="flex items-center justify-between gap-1 min-w-0">
              <div className="flex items-center gap-1 min-w-0 flex-1 text-ink-2">
                {renderLeadingIcon(10.5)}
                {activeCourse && <span className="text-[10.5px] font-bold text-ink-2 tracking-tight truncate">{activeCourse.code}</span>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {countdownText && <span className="text-[9px] font-bold text-[var(--c-warn)] uppercase tracking-tight">{countdownText}</span>}
                <TypePill label={kindPillLabel} tone={isExam && isImminent ? 'warn' : 'default'} size={isNarrow ? 'xs' : 'sm'} />
              </div>
            </div>

            <div className="flex items-start gap-1 min-w-0">
              <div
                className={cx(
                  'font-bold text-ink leading-[1.25] min-w-0 break-normal',
                  isNarrow ? 'text-[10px] tracking-tight' : 'text-[10.5px]',
                  done && 'line-through opacity-80',
                  height < 55 ? 'truncate' : height < 95 ? 'line-clamp-2' : 'line-clamp-3',
                )}
              >
                {title}
              </div>
            </div>

            {locationPlace ? (
              <div className="flex items-start gap-1 text-[9px] text-ink-2 leading-tight min-w-0">
                <MapPin size={9.5} className="shrink-0 text-ink-3 mt-[1px]" />
                <span
                  className={cx(
                    'font-medium text-ink-2 min-w-0 break-normal',
                    height < 120 ? 'line-clamp-2' : 'line-clamp-3',
                  )}
                  title={locationPlace.building}
                >
                  {locationPlace.building || locationPlace.room}
                </span>
              </div>
            ) : contextSubtitle ? (
              <div className="text-[9.5px] font-medium text-ink-2 leading-tight truncate min-w-0">
                {contextSubtitle}
              </div>
            ) : null}

            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0 text-[9px] font-medium text-ink-3 tnum leading-tight min-w-0 mt-auto">
              <span className="font-semibold text-ink-2 shrink-0">{timeParts.start}–{timeParts.end}</span>
              <span className="text-[8.5px] uppercase tracking-wider font-semibold">
                {timeParts.duration}
              </span>
            </div>

            {height >= 120 && isStudy && activeAssignment?.weight != null && (
              <div className="inline-flex items-center h-[17px] px-1.5 rounded-full bg-black/5 dark:bg-white/10 text-[8px] font-bold text-ink-2 w-fit mt-0.5 uppercase tracking-wider">
                {activeAssignment.weight}% of grade
              </div>
            )}

            {height >= 110 && isExam && block.weight != null && (
              <div className="inline-flex items-center h-[17px] px-1.5 rounded-full bg-amber-500/15 text-[8px] font-bold text-[var(--c-warn)] w-fit mt-0.5 uppercase tracking-wider">
                {block.weight}% of grade
              </div>
            )}

            {height >= 105 && activePlan && activePlan.length > 1 && (
              <div className="mt-0.5">
                <SegmentBar segments={activePlan} height={3} />
              </div>
            )}

            {height >= 140 && isStudy && activeAssignment?.notes && (
              <div
                className="text-[9px] text-ink-3 leading-relaxed mt-auto pt-1 border-t border-line/40 break-normal line-clamp-2"
              >
                {activeAssignment.notes}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        data-handle="end"
        style={{ height: handleH }}
        className="absolute inset-x-0 bottom-0 cursor-ns-resize z-10 flex items-end justify-center pointer-events-auto"
      >
        <span className="mb-[1px] h-[2px] w-5 rounded-full bg-ink/20 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  )
}

export type { Draft }
