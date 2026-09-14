import type { Course, PlannerEvent, ScheduleOverride, StudyBlock } from './types'
import type { Ranked } from './priority'
import { MIN, addDays, atMinutes, clamp, dayKey, isSameDay, snap, startOfDay } from './date'
import { classesOn, plannerEventOnDay, samePlace } from './meetings'

interface Interval {
  start: number
  end: number
}

export interface Proposal {
  courseId: string | null
  assignmentId: string
  start: number
  end: number
}

const BUFFER_MIN = 10

const WALK_MIN = 20

const preferenceScore = (startMin: number) => {
  const h = startMin / 60
  if (h >= 14 && h < 18) return 3
  if (h >= 18 && h < 21.5) return 2.6
  if (h >= 10 && h < 14) return 2.2
  if (h >= 21.5) return 0.9
  return 0.5
}

function busyOn(
  day: Date,
  blocks: StudyBlock[],
  courses: Course[],
  plannerEvents: PlannerEvent[] = [],
  scheduleOverrides: ScheduleOverride[] = [],
): Interval[] {
  const k = dayKey(day)
  const out: Interval[] = []
  for (const b of blocks) {
    if (dayKey(b.start) !== k) continue
    out.push({ start: +new Date(b.start) - BUFFER_MIN * MIN, end: +new Date(b.end) + BUFFER_MIN * MIN })
  }

  const occs = classesOn(courses, day, { plannerEvents, scheduleOverrides, blocks })
  occs.forEach((occ, i) => {
    const prev = occs[i - 1]
    const crossing = !!prev && !!occ.place && !!prev.place && !samePlace(prev.place, occ.place)
    out.push({
      start: occ.start - (crossing ? WALK_MIN : BUFFER_MIN) * MIN,
      end: occ.end + BUFFER_MIN * MIN,
    })
  })

  for (const event of plannerEvents) {
    if (!plannerEventOnDay(event, day)) continue
    if (event.allDay) {
      out.push({ start: +startOfDay(day), end: +startOfDay(day) + 24 * 60 * MIN })
    } else {
      out.push({ start: +new Date(event.start) - BUFFER_MIN * MIN, end: +new Date(event.end) + BUFFER_MIN * MIN })
    }
  }

  return out.sort((a, b) => a.start - b.start)
}

function freeOn(day: Date, busy: Interval[], startHour: number, endHour: number, now: number): Interval[] {
  let cursor = +atMinutes(day, startHour * 60)
  const end = +atMinutes(day, endHour * 60)
  if (isSameDay(day, now)) cursor = Math.max(cursor, Math.ceil((now + 5 * MIN) / (15 * MIN)) * (15 * MIN))
  const out: Interval[] = []
  for (const b of busy) {
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, end) })
    cursor = Math.max(cursor, b.end)
    if (cursor >= end) break
  }
  if (cursor < end) out.push({ start: cursor, end })
  return out.filter((s) => s.end - s.start >= 30 * MIN)
}

export function findGapOnDay(opts: {
  fromMs: number
  durationMin: number
  blocks: StudyBlock[]
  courses: Course[]
  dayEndHour: number
  dayStartHour?: number
  plannerEvents?: PlannerEvent[]
  scheduleOverrides?: ScheduleOverride[]
  ignoreBlockId?: string
}): number | null {
  const {
    fromMs,
    durationMin,
    blocks,
    courses,
    dayStartHour = 0,
    dayEndHour,
    plannerEvents = [],
    scheduleOverrides = [],
    ignoreBlockId,
  } = opts
  const day = startOfDay(fromMs)
  const busy = busyOn(
    day,
    blocks.filter((b) => b.id !== ignoreBlockId),
    courses,
    plannerEvents,
    scheduleOverrides,
  )
  const limit = +atMinutes(day, dayEndHour * 60) - durationMin * MIN
  const step = 15 * MIN
  let t = Math.max(+atMinutes(day, dayStartHour * 60), Math.ceil(fromMs / step) * step)
  while (t <= limit) {
    const end = t + durationMin * MIN
    const clash = busy.find((b) => t < b.end && b.start < end)
    if (!clash) return t
    t = Math.max(t + step, Math.ceil(clash.end / step) * step)
  }
  return null
}

export function autoSchedule(opts: {
  ranked: Ranked[]
  blocks: StudyBlock[]
  courses: Course[]
  plannerEvents?: PlannerEvent[]
  scheduleOverrides?: ScheduleOverride[]
  now: number

  from: Date
  days: number
  dayStartHour: number
  dayEndHour: number
  dailyCapacityMin: number
}): Proposal[] {
  const {
    ranked,
    blocks,
    courses,
    plannerEvents = [],
    scheduleOverrides = [],
    now,
    from,
    days,
    dayStartHour,
    dayEndHour,
    dailyCapacityMin,
  } = opts

  const dayList = Array.from({ length: days }, (_, i) => addDays(startOfDay(from), i))
  const scheduled: StudyBlock[] = [...blocks]

  const usedByDay = new Map<string, number>()
  for (const b of blocks) {
    const k = dayKey(b.start)
    usedByDay.set(k, (usedByDay.get(k) ?? 0) + (+new Date(b.end) - +new Date(b.start)) / MIN)
  }

  const proposals: Proposal[] = []
  const candidates = ranked
    .filter((r) => r.remainingMin >= 20 && (!Number.isFinite(r.daysUntil) || r.daysUntil <= days + 2))
    .slice(0, 8)

  for (const r of candidates) {
    const due = r.assignment.due ? +new Date(r.assignment.due) : Number.POSITIVE_INFINITY
    const overdue = due <= now

    const alreadyPlanned = scheduled
      .filter((b) => b.assignmentId === r.assignment.id && +new Date(b.start) >= now)
      .reduce((s, b) => s + (+new Date(b.end) - +new Date(b.start)) / MIN, 0)

    let need = clamp(r.remainingMin - alreadyPlanned, 0, Math.min(r.remainingMin, 8 * 60))
    if (need < 25) continue

    const chunk = need > 240 ? 90 : need > 120 ? 75 : need > 60 ? 60 : Math.max(30, Math.round(need / 15) * 15)

    for (const day of dayList) {
      if (need < 25) break
      if (Number.isFinite(due) && !overdue && +startOfDay(day) > +startOfDay(due)) break
      const k = dayKey(day)
      const capacityLeft = dailyCapacityMin - (usedByDay.get(k) ?? 0)
      if (capacityLeft < 30) continue
      const dayDeadline = !Number.isFinite(due)
        ? +atMinutes(day, dayEndHour * 60)
        : overdue
        ? Math.max(due, +atMinutes(day, dayEndHour * 60))
        : Math.min(due, +atMinutes(day, dayEndHour * 60))

      let placedToday = 0
      let blocksToday = 0
      const midnight = +startOfDay(day)

      while (need >= 25 && placedToday < capacityLeft - 15 && blocksToday < 2) {
        let best: { start: number; minutes: number; score: number } | null = null
        for (const slot of freeOn(
          day,
          busyOn(day, scheduled, courses, plannerEvents, scheduleOverrides),
          dayStartHour,
          dayEndHour,
          now,
        )) {
          const room = Math.min(
            (slot.end - slot.start) / MIN,
            chunk,
            need,
            capacityLeft - placedToday,
            Math.max(0, (dayDeadline - slot.start) / MIN),
          )
          const minutes = Math.floor(room / 15) * 15
          if (minutes < 30) continue
          for (let t = slot.start; t + minutes * MIN <= Math.min(slot.end, dayDeadline); t += 30 * MIN) {
            const score = preferenceScore((t - midnight) / MIN)
            if (!best || score > best.score) best = { start: t, minutes, score }
          }
        }
        if (!best) break

        const end = best.start + best.minutes * MIN
        proposals.push({ courseId: r.assignment.courseId, assignmentId: r.assignment.id, start: best.start, end })
        scheduled.push({
          id: `tmp-${proposals.length}`,
          courseId: r.assignment.courseId,
          assignmentId: r.assignment.id,
          start: new Date(best.start).toISOString(),
          end: new Date(end).toISOString(),
          createdAt: new Date().toISOString(),
        })
        need -= best.minutes
        placedToday += best.minutes
        blocksToday++
      }
      usedByDay.set(k, (usedByDay.get(k) ?? 0) + placedToday)
    }
  }

  return proposals.sort((a, b) => a.start - b.start)
}

const STEP_MAX_MIN = 240

const OVERDUE_DAYS = 2

const loadOn = (day: Date, blocks: StudyBlock[]) => {
  const k = dayKey(day)
  return blocks.reduce(
    (sum, b) => (dayKey(b.start) === k ? sum + (+new Date(b.end) - +new Date(b.start)) / MIN : sum),
    0,
  )
}

function bestSlotOn(opts: {
  day: Date
  want: number
  from: number
  until: number
  scheduled: StudyBlock[]
  courses: Course[]
  plannerEvents: PlannerEvent[]
  scheduleOverrides: ScheduleOverride[]
  dayStartHour: number
  dayEndHour: number
  now: number
}): { start: number; minutes: number } | null {
  const {
    day,
    want,
    from,
    until,
    scheduled,
    courses,
    plannerEvents,
    scheduleOverrides,
    dayStartHour,
    dayEndHour,
    now,
  } = opts
  const midnight = +startOfDay(day)
  const step = 15 * MIN

  const floor = Math.min(want, 30)
  let best: { start: number; minutes: number; score: number } | null = null
  for (const slot of freeOn(
    day,
    busyOn(day, scheduled, courses, plannerEvents, scheduleOverrides),
    dayStartHour,
    dayEndHour,
    now,
  )) {
    const first = Math.ceil(Math.max(slot.start, from) / step) * step
    const last = Math.min(slot.end, until)
    const minutes = Math.floor(Math.min(want, (last - first) / MIN) / 15) * 15
    if (minutes < floor) continue
    for (let t = first; t + minutes * MIN <= last; t += step) {
      const score = preferenceScore((t - midnight) / MIN)
      if (!best || score > best.score) best = { start: t, minutes, score }
    }
  }
  return best ? { start: best.start, minutes: best.minutes } : null
}

function daysAround(target: Date, first: Date, last: Date): Date[] {
  const out: Date[] = []
  for (let d = new Date(Math.max(+target, +first)); +d <= +last; d = addDays(d, 1)) out.push(d)
  for (let d = addDays(target, -1); +d >= +first; d = addDays(d, -1)) out.push(d)
  return out
}

export interface StepSlot {
  start: number
  end: number
}

export function scheduleSteps(opts: {
  steps: { estimateMin?: number; dayMs?: number }[]
  dueMs: number
  blocks: StudyBlock[]
  courses: Course[]
  plannerEvents?: PlannerEvent[]
  scheduleOverrides?: ScheduleOverride[]
  now: number
  dayStartHour: number
  dayEndHour: number
  dailyCapacityMin: number
}): (StepSlot | null)[] {
  const {
    steps,
    blocks,
    courses,
    plannerEvents = [],
    scheduleOverrides = [],
    now,
    dayStartHour,
    dayEndHour,
    dailyCapacityMin,
  } = opts
  const overdue = opts.dueMs < now
  const runway = addDays(startOfDay(now), overdue ? OVERDUE_DAYS : 0)
  const until = overdue ? Math.max(opts.dueMs, +atMinutes(runway, dayEndHour * 60)) : opts.dueMs
  const lastDay = startOfDay(until)
  const scheduled = [...blocks]
  const out: (StepSlot | null)[] = []

  let after = now
  for (const step of steps) {
    const want = clamp(snap(step.estimateMin ?? 45), 15, STEP_MAX_MIN)
    const from = Math.max(now, after)
    const firstDay = startOfDay(from)
    const target = startOfDay(clamp(step.dayMs ?? from, +firstDay, +lastDay))

    let hit: { start: number; minutes: number } | null = null
    for (const underCapacity of [true, false]) {
      for (const day of daysAround(target, firstDay, lastDay)) {
        const room = underCapacity ? dailyCapacityMin - loadOn(day, scheduled) : want
        if (room < Math.min(want, 30)) continue
        hit = bestSlotOn({
          day,
          want: Math.min(want, room),
          from,
          until,
          scheduled,
          courses,
          plannerEvents,
          scheduleOverrides,
          dayStartHour,
          dayEndHour,
          now,
        })
        if (hit) break
      }
      if (hit) break
    }

    if (!hit) {
      out.push(null)
      continue
    }
    const end = hit.start + hit.minutes * MIN
    scheduled.push({
      id: `step-${out.length}`,
      courseId: null,
      assignmentId: null,
      start: new Date(hit.start).toISOString(),
      end: new Date(end).toISOString(),
      createdAt: new Date(now).toISOString(),
    })
    out.push({ start: hit.start, end })
    after = end
  }

  return out
}
