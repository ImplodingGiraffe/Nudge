import type { Assignment, Course, DayKey, MeetingKind, PlannerEvent, ScheduleOverride, Session, StudyBlock } from '../types'
import { addDays, dayKey, startOfDay } from '../date'
import { classesOn, placeOf } from '../meetings'

export type TimelineKind = 'deadline' | 'class' | 'event' | 'block'

export interface TimelineItem {
  id: string
  kind: TimelineKind

  at: number
  endAt?: number
  title: string
  course?: Course
  assignment?: Assignment
  block?: StudyBlock
  event?: PlannerEvent
  meetingKind?: MeetingKind
  room?: string
  allDay?: boolean
  done?: boolean
}

export interface TimelineDay {
  day: DayKey

  at: number
  items: TimelineItem[]
}

export interface TimelineInput {
  from: number
  to: number
  courses: Course[]
  assignments: Assignment[]
  blocks: StudyBlock[]
  plannerEvents?: PlannerEvent[]
  scheduleOverrides?: ScheduleOverride[]

  courseId?: string
}

const KIND_RANK: Record<TimelineKind, number> = { class: 0, event: 1, block: 2, deadline: 3 }

export function buildTimeline(input: TimelineInput): TimelineItem[] {
  const { from, to, courses, assignments, blocks, courseId, plannerEvents = [], scheduleOverrides = [] } = input
  const byId = new Map(courses.map((c) => [c.id, c]))
  const items: TimelineItem[] = []

  for (const a of assignments) {
    if (a.archived || a.status === 'done') continue
    if (courseId && a.courseId !== courseId) continue
    if (!a.due) continue
    const at = +new Date(a.due)
    if (at < from || at >= to) continue
    items.push({
      id: `due:${a.id}`,
      kind: 'deadline',
      at,
      title: a.title,
      course: a.courseId ? byId.get(a.courseId) : undefined,
      assignment: a,
    })
  }

  if (courses.some((course) => !course.archived && (!courseId || course.id === courseId))) {
    for (let d = startOfDay(from); +d < to; d = addDays(d, 1)) {
      for (const cls of classesOn(courses, d, { plannerEvents, scheduleOverrides, blocks })) {
        if (courseId && cls.course.id !== courseId) continue
        if (cls.start < from || cls.start >= to) continue
        items.push({
          id: `meet:${cls.id}`,
          kind: 'class',
          at: cls.start,
          endAt: cls.end,
          title: cls.course.code,
          course: cls.course,
          meetingKind: cls.meeting.kind,
          room: cls.place?.raw,
        })
      }
    }
  }

  for (const event of plannerEvents) {
    if (courseId && event.courseId !== courseId) continue
    const startAt = +new Date(event.start)
    const endAt = +new Date(event.end)
    if (endAt <= from || startAt >= to) continue
    items.push({
      id: `event:${event.id}`,
      kind: 'event',
      at: event.allDay && startAt < from ? +startOfDay(from) : startAt,
      endAt,
      title: event.title,
      course: event.courseId ? byId.get(event.courseId) : undefined,
      event,
      room: event.room,
      allDay: event.allDay,
    })
  }

  const assignmentById = new Map(assignments.map((a) => [a.id, a]))
  for (const b of blocks) {
    const at = +new Date(b.start)
    if (at < from || at >= to) continue
    const kind = b.kind ?? 'study'
    const linked = (kind === 'study' && b.assignmentId) ? assignmentById.get(b.assignmentId) : undefined
    const resolvedCourseId = kind === 'free' ? undefined : (b.courseId ?? linked?.courseId)
    const course = resolvedCourseId ? byId.get(resolvedCourseId) : undefined
    if (courseId && course?.id !== courseId) continue
    items.push({
      id: `block:${b.id}`,
      kind: 'block',
      at,
      endAt: +new Date(b.end),
      title:
        (b.subtaskId ? linked?.subtasks.find((t) => t.id === b.subtaskId)?.title : undefined) ??
        linked?.title ??
        b.title ??
        'Study',
      course,
      assignment: linked,
      block: b,
      done: b.done,
    })
  }

  items.sort((a, b) => a.at - b.at || KIND_RANK[a.kind] - KIND_RANK[b.kind])
  return items
}

export function groupByDay(items: TimelineItem[]): TimelineDay[] {
  const days: TimelineDay[] = []
  let current: TimelineDay | null = null
  for (const item of items) {
    const key = dayKey(item.at)
    if (!current || current.day !== key) {
      current = { day: key, at: +startOfDay(item.at), items: [] }
      days.push(current)
    }
    current.items.push(item)
  }
  return days
}

export interface TimetableSlot {
  id: string
  course: Course

  start: number
  end: number
  kind: MeetingKind
  room?: string
}

export interface Timetable {

  days: { day: number; slots: TimetableSlot[] }[]

  fromHour: number
  toHour: number
  count: number
}

export function buildTimetable(courses: Course[], courseId?: string): Timetable {
  const wanted = courses.filter((c) => !c.archived && (!courseId || c.id === courseId))
  const byDay = new Map<number, TimetableSlot[]>()
  let min = 24 * 60
  let max = 0
  let count = 0

  for (const c of wanted) {
    for (const m of c.meetings) {
      const slot: TimetableSlot = {
        id: `${c.id}:${m.id}`,
        course: c,
        start: m.start,
        end: m.end,
        kind: m.kind,
        room: placeOf(c, m)?.raw,
      }
      const list = byDay.get(m.day) ?? []
      list.push(slot)
      byDay.set(m.day, list)
      min = Math.min(min, m.start)
      max = Math.max(max, m.end)
      count++
    }
  }

  const days = [...byDay.entries()]
    .map(([day, slots]) => ({ day, slots: slots.sort((a, b) => a.start - b.start) }))
    .sort((a, b) => a.day - b.day)

  return {
    days,
    fromHour: count ? Math.floor(min / 60) : 8,
    toHour: count ? Math.ceil(max / 60) : 18,
    count,
  }
}

export interface StudyDay {
  day: DayKey
  at: number
  minutes: number
}

export function studyByDay(sessions: Session[], now: number, days: number): StudyDay[] {
  const out: StudyDay[] = []
  const totals = new Map<DayKey, number>()
  for (const s of sessions) {
    const key = dayKey(s.start)
    totals.set(key, (totals.get(key) ?? 0) + s.minutes)
  }
  for (let i = days - 1; i >= 0; i--) {
    const at = addDays(startOfDay(now), -i)
    const key = dayKey(at)
    out.push({ day: key, at: +at, minutes: Math.round(totals.get(key) ?? 0) })
  }
  return out
}
