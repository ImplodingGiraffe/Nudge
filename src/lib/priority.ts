import type { Assignment, Course, Session, StudyBlock, TaskKind } from './types'
import { DAY, HOUR, MIN, addDays, clamp, dayKey, daysBetween, fmtDuration, startOfDay } from './date'

const KIND_EFFORT: Record<TaskKind, number> = {
  personal: 30,
  reading: 90,
  quiz: 90,
  lab: 150,
  assignment: 150,
  problemset: 180,
  presentation: 240,
  essay: 300,
  midterm: 360,
  project: 480,
  final: 600,
  takehome: 450,
}

const KIND_WEIGHT: Record<TaskKind, number> = {
  personal: 0,
  reading: 2,
  quiz: 5,
  lab: 5,
  problemset: 8,
  assignment: 10,
  presentation: 10,
  essay: 15,
  midterm: 20,
  project: 20,
  final: 35,
  takehome: 25,
}

export const KIND_LABEL: Record<TaskKind, string> = {
  assignment: 'Assignment',
  personal: 'Personal',
  essay: 'Essay',
  problemset: 'Problem set',
  project: 'Project',
  reading: 'Reading',
  quiz: 'Quiz / test prep',
  midterm: 'Midterm prep',
  final: 'Final prep',
  takehome: 'Take-home exam',
  lab: 'Lab',
  presentation: 'Presentation',
}

const CHUNKABLE: TaskKind[] = ['essay', 'project', 'presentation', 'midterm', 'final', 'takehome', 'personal']

export const defaultWeight = (kind: TaskKind) => KIND_WEIGHT[kind] ?? 10

export const carriesWeight = (kind: TaskKind) => kind !== 'personal'

export const hasPlaybook = (kind: TaskKind) => kind in PLAYBOOKS

export function defaultEffort(a: Pick<Assignment, 'kind' | 'weight'>) {
  const base = KIND_EFFORT[a.kind] ?? 150
  if (a.weight == null) return base

  return Math.round(clamp((base + a.weight * 16) / 2, 30, 1200) / 15) * 15
}

export interface Calibration {
  factor: number
  samples: number
  byKind: Partial<Record<TaskKind, { factor: number; samples: number }>>
}

const median = (xs: number[]) => {
  if (!xs.length) return 1
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function computeCalibration(
  assignments: Assignment[],
  minutesByAssignment: Map<string, number>,
): Calibration {
  const ratios: number[] = []
  const perKind = new Map<TaskKind, number[]>()
  for (const a of assignments) {
    if (a.status !== 'done' || !a.estimateMin) continue
    const actual = minutesByAssignment.get(a.id) ?? 0
    if (actual < 15) continue
    const r = clamp(actual / a.estimateMin, 0.2, 5)
    ratios.push(r)
    const list = perKind.get(a.kind) ?? []
    list.push(r)
    perKind.set(a.kind, list)
  }
  const byKind: Calibration['byKind'] = {}
  for (const [k, list] of perKind) {
    if (list.length >= 3) byKind[k] = { factor: clamp(median(list), 0.6, 3), samples: list.length }
  }
  return {
    factor: ratios.length >= 3 ? clamp(median(ratios), 0.6, 3) : 1,
    samples: ratios.length,
    byKind,
  }
}

export const calibrationFor = (cal: Calibration, kind: TaskKind) =>
  cal.byKind[kind]?.factor ?? cal.factor

export function progressOf(a: Assignment, loggedMin: number): number {
  if (a.status === 'done') return 1
  if (a.subtasks.length) {
    const total = a.subtasks.reduce((s, t) => s + (t.estimateMin || 30), 0)
    const done = a.subtasks.reduce((s, t) => s + (t.done ? t.estimateMin || 30 : 0), 0)
    return total ? clamp(done / total, 0, 0.95) : 0
  }
  const est = a.estimateMin || defaultEffort(a)
  if (loggedMin > 0) return clamp(loggedMin / est, 0, 0.9)
  return a.status === 'doing' ? 0.3 : 0
}

export function remainingEffort(a: Assignment, loggedMin: number, cal: Calibration): number {
  if (a.status === 'done') return 0
  const raw = a.estimateMin ?? defaultEffort(a)
  const adjusted = a.estimateMin ? raw * calibrationFor(cal, a.kind) : raw
  const left = adjusted * (1 - progressOf(a, loggedMin))
  return Math.max(15, Math.round(left))
}

export interface RunwayCtx {
  now: number
  dailyCapacityMin: number

  studiedTodayMin: number
}

export function runwayMinutes(dueIso: string | undefined, ctx: RunwayCtx): number {
  if (!dueIso) return Math.max(ctx.dailyCapacityMin - ctx.studiedTodayMin, 30)
  const due = +new Date(dueIso)
  if (due <= ctx.now) return 0
  const cap = ctx.dailyCapacityMin
  let total = 0

  const endOfToday = startOfDay(ctx.now)
  endOfToday.setHours(23, 0, 0, 0)
  const todayCutoff = Math.min(+endOfToday, due)
  if (todayCutoff > ctx.now) {
    const wall = (todayCutoff - ctx.now) / MIN
    total += clamp(Math.min(wall * 0.55, cap - ctx.studiedTodayMin), 0, cap)
  }

  const dueDay = startOfDay(due)
  const fullDays = daysBetween(ctx.now, dueDay) - 1
  if (fullDays > 0) total += fullDays * cap

  if (daysBetween(ctx.now, dueDay) >= 1) {
    const minutesIntoDay = (due - +dueDay) / MIN
    total += clamp(minutesIntoDay * 0.5, 0, cap)
  }
  return Math.round(total)
}

export type Verdict = 'overdue' | 'behind' | 'tight' | 'ok' | 'clear'

export interface Ranked {
  assignment: Assignment
  course?: Course
  score: number

  pressure: number
  remainingMin: number
  runwayMin: number
  loggedMin: number
  progress: number
  weight: number
  hoursUntil: number
  daysUntil: number
  verdict: Verdict

  reason: string

  nextStep: string
  suggestBreakdown: boolean
  courseStaleDays: number | null
}

export interface RankCtx extends RunwayCtx {
  courses: Course[]
  calibration: Calibration
  minutesByAssignment: Map<string, number>

  staleByCourse: Map<string, number>
}

export function rankAssignments(assignments: Assignment[], ctx: RankCtx): Ranked[] {
  const byId = new Map(ctx.courses.map((c) => [c.id, c]))
  const out: Ranked[] = []

  for (const a of assignments) {
    if (a.status === 'done' || a.archived) continue
    const course = a.courseId ? byId.get(a.courseId) : undefined
    if (course?.archived) continue

    const logged = ctx.minutesByAssignment.get(a.id) ?? 0
    const progress = progressOf(a, logged)
    const remainingMin = remainingEffort(a, logged, ctx.calibration)
    const dueMs = a.due ? +new Date(a.due) : Number.NaN
    const hasDue = Number.isFinite(dueMs)
    const runwayMin = runwayMinutes(a.due, ctx)
    const hoursUntil = hasDue ? (dueMs - ctx.now) / HOUR : Number.POSITIVE_INFINITY
    const daysUntil = hasDue ? daysBetween(ctx.now, dueMs) : Number.POSITIVE_INFINITY
    const weight = a.weight ?? defaultWeight(a.kind)
    const overdue = hasDue && hoursUntil <= 0

    const pressure = overdue ? 4 : remainingMin / Math.max(runwayMin, 20)

    const stakes = 0.55 + weight / 22
    let score = 100 * Math.pow(clamp(pressure, 0.02, 4), 0.85) * stakes

    if (overdue) score = score * 2.2 + 350
    if (hoursUntil >= 0 && hoursUntil < 24) score *= 1.3
    else if (hoursUntil < 48) score *= 1.12
    if (a.status === 'doing') score *= 1.08

    const stale = a.courseId ? (ctx.staleByCourse.get(a.courseId) ?? null) : null
    if (stale != null && stale >= 3 && daysUntil <= 10) score *= 1.06

    if (daysUntil > 14) score *= 0.55
    else if (daysUntil > 7) score *= 0.8

    const verdict: Verdict = overdue
      ? 'overdue'
      : pressure >= 1
        ? 'behind'
        : pressure >= 0.6
          ? 'tight'
          : pressure >= 0.25
            ? 'ok'
            : 'clear'

    out.push({
      assignment: a,
      course,
      score,
      pressure,
      remainingMin,
      runwayMin,
      loggedMin: logged,
      progress,
      weight,
      hoursUntil,
      daysUntil,
      verdict,
      reason: explain({ overdue, pressure, remainingMin, runwayMin, weight, daysUntil, hoursUntil }),
      nextStep: nextStepFor(a, progress),
      suggestBreakdown:
        !a.breakdownDismissed &&
        a.subtasks.length === 0 &&
        remainingMin >= 150 &&
        (CHUNKABLE.includes(a.kind) || weight >= 15) &&
        daysUntil >= 1 &&
        daysUntil <= 21,
      courseStaleDays: stale,
    })
  }

  return out.sort((x, y) => {
    const dueX = x.assignment.due ? +new Date(x.assignment.due) : Number.POSITIVE_INFINITY
    const dueY = y.assignment.due ? +new Date(y.assignment.due) : Number.POSITIVE_INFINITY
    return (
      y.score - x.score ||
      (Number.isFinite(dueX) ? dueX : 0) - (Number.isFinite(dueY) ? dueY : 0)
    )
  })
}

function explain(p: {
  overdue: boolean
  pressure: number
  remainingMin: number
  runwayMin: number
  weight: number
  daysUntil: number
  hoursUntil: number
}) {
  const h = (m: number) => fmtDuration(m)
  if (p.overdue) return `Past due. ${h(p.remainingMin)} of work left.`
  if (p.pressure >= 1)
    return `Needs about ${h(p.remainingMin)}, but there's realistically only ${h(p.runwayMin)} of study time before it's due.`
  if (p.hoursUntil < 24) return `Due within a day and ${h(p.remainingMin)} still to go.`
  if (p.weight >= 15 && p.daysUntil <= 6)
    return `Worth ${Math.round(p.weight)}% of the grade and due in ${p.daysUntil} day${p.daysUntil === 1 ? '' : 's'}.`
  if (p.pressure >= 0.6) return `${h(p.remainingMin)} of work and ${h(p.runwayMin)} of study time. The schedule is tight.`
  return `Comfortable for now: ${h(p.remainingMin)} of work, ${h(p.runwayMin)} available.`
}

function nextStepFor(a: Assignment, progress: number): string {
  const next = a.subtasks.find((s) => !s.done)
  if (next) return next.title
  if (a.subtasks.length && !next) return `Final pass on ${a.title}`
  if (progress === 0) return `Open ${a.title} and work the first 10 minutes`
  return `Keep going on ${a.title}`
}

export interface DayLoad {
  day: string
  plannedMin: number
  doneMin: number
  capacityMin: number

  ratio: number
  overloaded: boolean
}

export function dayLoads(
  blocks: StudyBlock[],
  sessions: Session[],
  from: Date,
  days: number,
  capacityMin: number,
): DayLoad[] {
  const planned = new Map<string, number>()
  for (const b of blocks) {
    if (b.kind && b.kind !== 'study') continue
    const k = dayKey(b.start)
    planned.set(k, (planned.get(k) ?? 0) + (+new Date(b.end) - +new Date(b.start)) / MIN)
  }
  const done = new Map<string, number>()
  for (const s of sessions) {
    const k = dayKey(s.start)
    done.set(k, (done.get(k) ?? 0) + s.minutes)
  }
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(from, i)
    const k = dayKey(d)
    const plannedMin = Math.round(planned.get(k) ?? 0)
    const ratio = plannedMin / Math.max(capacityMin, 30)
    return {
      day: k,
      plannedMin,
      doneMin: Math.round(done.get(k) ?? 0),
      capacityMin,
      ratio,
      overloaded: ratio > 1.35,
    }
  })
}

const PLAYBOOKS: Partial<Record<TaskKind, string[]>> = {
  essay: [
    'Read the prompt and pick an angle',
    'Gather + skim sources, take notes',
    'Outline the argument (thesis + 3 points)',
    'Draft the body',
    'Draft intro & conclusion',
    'Edit, cite, proofread',
  ],
  project: [
    'Re-read the spec, list deliverables',
    'Sketch the approach / design',
    'Build the core piece',
    'Build the remaining pieces',
    'Test and fix',
    'Write up + submit',
  ],
  presentation: [
    'Decide the one message',
    'Outline the slides',
    'Build the slides',
    'Rehearse out loud once',
    'Tighten and time it',
  ],
  problemset: ['Skim all questions', 'Work the easy half', 'Work the hard half', 'Check and write up'],
  midterm: [
    'Collect notes, slides, past problems',
    'Review unit 1–2',
    'Review unit 3–4',
    'Do a practice problem set',
    'Redo everything you got wrong',
  ],
  final: [
    'Build a topic checklist from the syllabus',
    'Review the first third',
    'Review the second third',
    'Review the last third',
    'Full practice exam, timed',
    'Patch the weak spots',
  ],
  takehome: [
    'Read the instructions and list what to submit',
    'Gather notes and allowed sources',
    'Draft the answers',
    'Check citations and requirements',
    'Proofread and submit',
  ],
  lab: ['Read the handout', 'Prep data / setup', 'Run the work', 'Write the report'],
  reading: ['Skim headings + conclusion', 'Close read', 'Write 5 bullet summary'],
}

const GENERIC = ['Start with 15 minutes', 'Work on the main part', 'Finish and review']

export function proposeBreakdown(a: Assignment, totalMin: number, now = Date.now()) {
  const steps = PLAYBOOKS[a.kind] ?? GENERIC
  if (!a.due) return GENERIC.slice(0, 3).map((title, i) => ({
    title,
    estimateMin: Math.max(20, Math.round(totalMin / 3 / 15) * 15),
    dayMs: +startOfDay(now) + i * DAY,
  }))
  const due = +new Date(a.due)
  const span = Math.max(1, daysBetween(now, due))
  const usable = Math.min(steps.length, Math.max(2, Math.min(6, span)))
  const chosen =
    usable >= steps.length
      ? steps
      :
        [steps[0], ...steps.slice(1, -1).filter((_, i) => i % Math.ceil((steps.length - 2) / (usable - 2)) === 0), steps[steps.length - 1]].slice(0, usable)

  const per = Math.max(20, Math.round(totalMin / chosen.length / 15) * 15)
  const gap = Math.max(1, Math.floor(span / chosen.length))

  return chosen.map((title, i) => {
    const daysBeforeDue = (chosen.length - 1 - i) * gap + 1
    return {
      title,
      estimateMin: per,
      dayMs: Math.max(+startOfDay(due - daysBeforeDue * DAY), +startOfDay(now)),
    }
  })
}
