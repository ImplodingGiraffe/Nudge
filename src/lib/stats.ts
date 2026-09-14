import type { Assignment, Course, DayKey, Session } from './types'
import { DAY, addDays, dayKey, daysBetween, fromDayKey, startOfDay } from './date'

export const STREAK_MIN_MINUTES = 20

export const STREAK_MILESTONES = [3, 5, 7, 10, 14, 21, 30, 50, 75, 100]

export const sumBy = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)

export function groupMinutes<K>(sessions: Session[], key: (s: Session) => K | null | undefined) {
  const m = new Map<K, number>()
  for (const s of sessions) {
    const k = key(s)
    if (k == null) continue
    m.set(k, (m.get(k) ?? 0) + s.minutes)
  }
  return m
}

export const minutesByDay = (sessions: Session[]) => groupMinutes(sessions, (s) => dayKey(s.start))
export const minutesByAssignment = (sessions: Session[]) => groupMinutes(sessions, (s) => s.assignmentId)
export const minutesByCourse = (sessions: Session[]) => groupMinutes(sessions, (s) => s.courseId)

export function lastTouchByCourse(sessions: Session[]) {
  const m = new Map<string, number>()
  for (const s of sessions) {
    if (!s.courseId) continue
    const t = +new Date(s.start)
    if (t > (m.get(s.courseId) ?? 0)) m.set(s.courseId, t)
  }
  return m
}

export function staleDaysByCourse(courses: Course[], sessions: Session[], now: number) {
  const last = lastTouchByCourse(sessions)
  const m = new Map<string, number>()
  for (const c of courses) {
    const t = last.get(c.id)
    const since = t ?? +new Date(c.createdAt)
    m.set(c.id, Math.max(0, daysBetween(since, now)))
  }
  return m
}

export interface Streak {
  current: number
  longest: number
  todayMin: number

  atRisk: boolean

  last7: boolean[]
}

export function computeStreak(sessions: Session[], now: number): Streak {
  const byDay = minutesByDay(sessions)
  const qualifies = (k: DayKey) => (byDay.get(k) ?? 0) >= STREAK_MIN_MINUTES

  const todayKey = dayKey(now)
  const todayMin = Math.round(byDay.get(todayKey) ?? 0)

  let current = 0
  let cursor = qualifies(todayKey) ? new Date(now) : addDays(now, -1)

  while (qualifies(dayKey(cursor))) {
    current++
    cursor = addDays(cursor, -1)
  }

  let longest = 0
  const keys = [...byDay.keys()].filter(qualifies).sort()
  let run = 0
  let prev: number | null = null
  for (const k of keys) {
    const t = +fromDayKey(k)
    run = prev != null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = t
  }

  const last7 = Array.from({ length: 7 }, (_, i) => qualifies(dayKey(addDays(now, i - 6))))

  return { current, longest: Math.max(longest, current), todayMin, atRisk: current > 0 && !qualifies(todayKey), last7 }
}

export function weekMinutesByCourse(sessions: Session[], weekStart: Date) {
  const from = +startOfDay(weekStart)
  const to = from + 7 * DAY
  return groupMinutes(
    sessions.filter((s) => {
      const t = +new Date(s.start)
      return t >= from && t < to
    }),
    (s) => s.courseId ?? '__none__',
  )
}

export interface HeatCell {
  day: DayKey
  minutes: number

  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}

export function heatmap(sessions: Session[], from: Date, to: Date, now: number): HeatCell[] {
  const byDay = minutesByDay(sessions)
  const days = Math.max(1, daysBetween(from, to) + 1)
  const active = [...byDay.values()].filter((v) => v >= 5).sort((a, b) => a - b)
  const p60 = active.length ? active[Math.floor(active.length * 0.6)] : 90
  const scale = Math.max(45, p60)
  const cells: HeatCell[] = []
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i)
    const k = dayKey(d)
    const minutes = Math.round(byDay.get(k) ?? 0)
    const r = minutes / scale
    const level: HeatCell['level'] = minutes < 5 ? 0 : r < 0.4 ? 1 : r < 0.8 ? 2 : r < 1.3 ? 3 : 4
    cells.push({ day: k, minutes, level, future: +startOfDay(d) > +startOfDay(now) })
  }
  return cells
}

export interface GradeOutlook {

  earnedPct: number | null

  gradedWeight: number

  remainingWeight: number

  needed: number | null

  outOfReach: boolean
  target: number | null

  display: number | null
}

export function gradeOutlook(course: Course, assignments: Assignment[]): GradeOutlook {
  const graded = assignments.filter(
    (a) => a.courseId === course.id && a.grade != null && (a.weight ?? 0) > 0 && !a.archived,
  )
  const gradedWeight = graded.reduce((s, a) => s + (a.weight ?? 0), 0)
  const earned = graded.reduce((s, a) => s + ((a.grade ?? 0) * (a.weight ?? 0)) / 100, 0)
  const earnedPct = gradedWeight > 0 ? (earned / gradedWeight) * 100 : null

  const listedWeight = assignments
    .filter((a) => a.courseId === course.id && !a.archived)
    .reduce((s, a) => s + (a.weight ?? 0), 0)
  const remainingWeight = Math.max(0, Math.max(listedWeight, gradedWeight) - gradedWeight)

  const target = course.targetGrade ?? null
  let needed: number | null = null
  if (target != null && remainingWeight > 0) {
    needed = ((target * (gradedWeight + remainingWeight)) / 100 - earned) / (remainingWeight / 100)
  }
  const display = earnedPct ?? course.currentGrade ?? null
  return {
    earnedPct,
    gradedWeight,
    remainingWeight,
    needed: needed == null ? null : Math.round(needed * 10) / 10,
    outOfReach: needed != null && needed > 100,
    target,
    display: display == null ? null : Math.round(display * 10) / 10,
  }
}

export function estimateAccuracy(assignments: Assignment[], byAssignment: Map<string, number>) {
  const rows = assignments
    .filter((a) => a.status === 'done' && a.estimateMin && (byAssignment.get(a.id) ?? 0) >= 15)
    .map((a) => ({
      assignment: a,
      estimateMin: a.estimateMin!,
      actualMin: Math.round(byAssignment.get(a.id) ?? 0),
    }))
    .sort((a, b) => {
      const at = b.assignment.completedAt ?? b.assignment.due ?? b.assignment.createdAt
      const bt = a.assignment.completedAt ?? a.assignment.due ?? a.assignment.createdAt
      return +new Date(at) - +new Date(bt)
    })
  const totalEst = sumBy(rows, (r) => r.estimateMin)
  const totalAct = sumBy(rows, (r) => r.actualMin)
  return { rows, totalEst, totalAct, ratio: totalEst ? totalAct / totalEst : 1 }
}
