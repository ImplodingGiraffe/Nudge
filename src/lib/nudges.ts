import type { Assignment, Course, DayKey, PlannerEvent, Session, StudyBlock } from './types'
import type { Ranked, Calibration, DayLoad } from './priority'
import { STREAK_MILESTONES, STREAK_MIN_MINUTES, type Streak } from './stats'
import { BANKS, type Tone, fill, line } from './copy'
import { dayKey, daysBetween, fmtDuration, isSameDay } from './date'

export type NudgeKind = 'urgent' | 'warn' | 'tease' | 'celebrate' | 'info' | 'plan'

export interface NudgeAction {
  type: 'start' | 'breakdown' | 'plan' | 'course' | 'assignment' | 'progress'
  label: string
  assignmentId?: string
  courseId?: string
}

export interface Nudge {
  id: string
  kind: NudgeKind
  text: string
  detail?: string
  weight: number
  action?: NudgeAction
  secondary?: NudgeAction

  subject?: string

  related?: string
}

export interface NudgeCtx {
  now: number
  tone: Tone
  ranked: Ranked[]
  courses: Course[]
  assignments: Assignment[]
  blocks: StudyBlock[]
  plannerEvents: PlannerEvent[]
  sessions: Session[]
  streak: Streak
  calibration: Calibration
  minutesByAssignment: Map<string, number>
  staleByCourse: Map<string, number>
  todayLoad: DayLoad
  muted: Record<string, DayKey>
}

export interface Avoidance {
  score: number

  skipped: number
  daysUntouched: number

  confirmed: boolean
}

export function avoidanceScore(a: Assignment, ctx: NudgeCtx): Avoidance {
  const logged = ctx.minutesByAssignment.get(a.id) ?? 0
  const age = daysBetween(a.createdAt, ctx.now)
  const stale = a.courseId ? (ctx.staleByCourse.get(a.courseId) ?? 0) : 0
  const skipped = ctx.blocks.filter(
    (b) => b.assignmentId === a.id && !b.done && +new Date(b.end) < ctx.now,
  ).length

  let score = 0
  if (logged === 0 && age >= 4) score += 1
  if (logged === 0 && age >= 8) score += 1
  score += Math.min(2, skipped * 2)
  if (stale >= 5) score += 1

  const confirmed = logged === 0 && (skipped >= 1 || (stale >= 4 && age >= 5))
  return { score, skipped, daysUntouched: Math.max(stale, logged === 0 ? age : 0), confirmed }
}

const dayOf = (d: number) => dayKey(d)

export function buildNudges(ctx: NudgeCtx): Nudge[] {
  const out: Nudge[] = []
  const { now, tone, ranked, streak } = ctx
  const today = dayOf(now)
  const hour = new Date(now).getHours()
  const seed = today

  const push = (n: Nudge) => {
    if (ctx.muted[n.id] === today) return
    out.push(n)
  }

  const top = ranked[0]

  for (const r of ranked.filter((r) => r.verdict === 'overdue').slice(0, 2)) {
    const sharp = avoidanceScore(r.assignment, ctx).confirmed
    push({
      id: `overdue:${r.assignment.id}`,
      kind: 'urgent',
      subject: r.assignment.id,
      related: r.assignment.courseId ?? undefined,
      text: fill(line(BANKS.overdue, tone, seed + r.assignment.id, sharp), {
        t: r.assignment.title,
        d: fmtDuration(r.remainingMin),
      }),
      detail: `${r.course?.code ?? 'No course'} · ${Math.round(r.weight)}% of the grade · ${fmtDuration(r.remainingMin)} left`,
      weight: 1000 - Math.min(200, r.hoursUntil * -1),
      action: { type: 'start', label: 'Start now', assignmentId: r.assignment.id },
    })
  }

  for (const r of ranked.slice(0, 4)) {
    if (r.verdict === 'overdue') continue
    const avoid = avoidanceScore(r.assignment, ctx)
    const heavy = r.weight >= 10
    const close = r.daysUntil <= 5
    if (!(heavy && close && r.pressure >= 0.7)) continue
    push({
      id: `crunch:${r.assignment.id}`,
      kind: r.pressure >= 1 ? 'urgent' : 'warn',
      subject: r.assignment.id,
      related: r.assignment.courseId ?? undefined,
      text: fill(line(BANKS.crunch, tone, seed + r.assignment.id, avoid.confirmed), {
        t: r.assignment.title,
        c: r.course?.code ?? 'this course',
        n: Math.round(r.weight),
        d: r.daysUntil === 0 ? 'today' : r.daysUntil === 1 ? 'tomorrow' : `in ${r.daysUntil} days`,
        w: fmtDuration(r.remainingMin),
      }),
      detail: r.reason,
      weight: 800 + r.weight * 4 - r.daysUntil * 20,
      action: { type: 'start', label: 'Start 25 min', assignmentId: r.assignment.id },
      secondary: r.suggestBreakdown
        ? { type: 'breakdown', label: 'Break it down', assignmentId: r.assignment.id }
        : { type: 'plan', label: 'Schedule it' },
    })
  }

  for (const r of ranked.slice(0, 5)) {
    const avoid = avoidanceScore(r.assignment, ctx)

    if (!avoid.confirmed || r.daysUntil > 12) continue
    if (r.weight < 8 && r.remainingMin < 90) continue
    push({
      id: `avoiding:${r.assignment.id}`,
      kind: 'tease',
      subject: r.assignment.id,
      related: r.assignment.courseId ?? undefined,
      text: fill(line(BANKS.avoiding, tone, seed + r.assignment.id, avoid.score >= 3), {
        t: r.assignment.title,
        c: r.course?.code ?? 'this',
        n: Math.max(2, avoid.daysUntouched),
      }),
      detail:
        avoid.skipped > 0
          ? `${avoid.skipped} study block${avoid.skipped === 1 ? '' : 's'} came and went. ${fmtDuration(r.remainingMin)} of work left.`
          : `Nothing logged yet. ${fmtDuration(r.remainingMin)} of work left.`,
      weight: 700 + avoid.score * 30,
      action: { type: 'start', label: 'Start 10 min', assignmentId: r.assignment.id },
    })
  }

  for (const r of ranked.slice(1, 4)) {
    if (!r.suggestBreakdown) continue
    push({
      id: `breakdown:${r.assignment.id}`,
      kind: 'plan',
      subject: r.assignment.id,
      related: r.assignment.courseId ?? undefined,
      text: fill(line(BANKS.breakdown, tone, seed + r.assignment.id, avoidanceScore(r.assignment, ctx).confirmed), {
        t: r.assignment.title,
        d: fmtDuration(r.remainingMin),
      }),
      detail: `${fmtDuration(r.remainingMin)} of work, due ${r.daysUntil} day${r.daysUntil === 1 ? '' : 's'} from now.`,
      weight: 560 + r.weight * 2,
      action: { type: 'breakdown', label: 'Break it into steps', assignmentId: r.assignment.id },
    })
  }

  for (const c of ctx.courses) {
    if (c.archived) continue
    const stale = ctx.staleByCourse.get(c.id) ?? 0
    if (stale < 3) continue
    const upcoming = ranked.find((r) => r.assignment.courseId === c.id && r.daysUntil <= 14)
    if (!upcoming) continue
    push({
      id: `stale:${c.id}`,
      kind: stale >= 6 ? 'tease' : 'info',
      subject: c.id,
      text: fill(line(BANKS.stale, tone, seed + c.id, stale >= 6), { c: c.code, n: stale }),
      detail: `Next up in ${c.code}: ${upcoming.assignment.title}, ${upcoming.daysUntil === 0 ? 'due today' : `due in ${upcoming.daysUntil} days`}.`,
      weight: 520 + stale * 12,
      action: { type: 'start', label: `20 min on ${c.code}`, assignmentId: upcoming.assignment.id },
      secondary: { type: 'course', label: 'Open course', courseId: c.id },
    })
  }

  const courseById = new Map(ctx.courses.map((course) => [course.id, course]))
  for (const exam of ctx.plannerEvents.filter((event) => event.kind === 'exam' && !event.allDay)) {
    const startMs = +new Date(exam.start)
    const d = daysBetween(now, startMs)
    if (d < 0 || d > 7) continue
    const course = exam.courseId ? courseById.get(exam.courseId) : undefined
    push({
      id: `exam:${exam.id}`,
      kind: d <= 4 ? 'warn' : 'info',
      subject: exam.id,
      text: fill(line(BANKS.exam, tone, seed + exam.id, course ? (ctx.staleByCourse.get(course.id) ?? 0) >= 4 : false), {
        c: course?.code ?? 'Your',
        k: exam.title,
        w: d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`,
      }),
      weight: 600 - d * 12,
      action: course ? { type: 'course', label: 'Open course', courseId: course.id } : { type: 'plan', label: 'Open plan' },
    })
  }

  if (streak.atRisk && streak.current >= 2 && hour >= 16) {
    const need = Math.max(1, STREAK_MIN_MINUTES - streak.todayMin)
    push({
      id: 'streak-risk',
      kind: 'warn',
      text: fill(line(BANKS.streakRisk, tone, seed, streak.current >= 5), {
        n: streak.current,
        m: streak.current + 1,
        r: need,
      }),
      detail: `${streak.current} days in a row so far. ${need} more minutes today keeps it.`,
      weight: 400 + streak.current * 4,
      action: top
        ? { type: 'start', label: 'Start 10 min', assignmentId: top.assignment.id }
        : { type: 'plan', label: 'Open planner' },
    })
  }

  if (!streak.atRisk && STREAK_MILESTONES.includes(streak.current)) {
    push({
      id: `streak-win:${streak.current}`,
      kind: 'celebrate',
      text: fill(line(BANKS.celebrateStreak, tone, seed, streak.current >= 14), { n: streak.current }),
      detail: streak.current >= streak.longest ? 'Longest run yet.' : undefined,
      weight: 900,
    })
  }

  const recentDone = ctx.assignments
    .filter((a) => a.status === 'done' && a.completedAt && now - +new Date(a.completedAt) < 36 * 3600_000)
    .sort((a, b) => +new Date(b.completedAt!) - +new Date(a.completedAt!))
  for (const a of recentDone.slice(0, 2)) {
    if (!a.due) continue
    const early = daysBetween(a.completedAt!, a.due)
    const course = ctx.courses.find((c) => c.id === a.courseId)
    if (early >= 2) {
      push({
        id: `early:${a.id}`,
        kind: 'celebrate',
        subject: a.id,
        text: fill(line(BANKS.celebrateEarly, tone, seed + a.id, early >= 5), { t: a.title, n: early }),
        weight: 880,
      })
    } else if ((a.weight ?? 0) >= 15) {
      push({
        id: `big-done:${a.id}`,
        kind: 'celebrate',
        subject: a.id,
        text: fill(line(BANKS.celebrateBig, tone, seed + a.id, (a.weight ?? 0) >= 30), {
          t: a.title,
          n: Math.round(a.weight ?? 0),
          c: course?.code ?? 'that course',
        }),
        weight: 870,
      })
    }
  }

  if (ctx.todayLoad.overloaded) {
    push({
      id: `overload:${today}`,
      kind: 'warn',
      text: fill(line(BANKS.overload, tone, seed, ctx.todayLoad.ratio > 1.8), {
        d: fmtDuration(ctx.todayLoad.plannedMin),
      }),
      detail: `${Math.round(ctx.todayLoad.ratio * 100)}% of your typical daily study capacity.`,
      weight: 540,
      action: { type: 'plan', label: 'Open planner' },
    })
  }

  const plannedToday = ctx.blocks.filter((b) => isSameDay(b.start, now))
  if (plannedToday.length === 0 && hour >= 7 && hour < 21 && top && top.daysUntil <= 5) {
    push({
      id: `empty-plan:${today}`,
      kind: 'plan',
      text: fill(line(BANKS.emptyPlan, tone, seed, top.daysUntil <= 1), {
        t: top.assignment.title,
        d: top.daysUntil === 0 ? 'today' : top.daysUntil === 1 ? 'tomorrow' : `in ${top.daysUntil} days`,
      }),
      weight: 460,
      action: { type: 'plan', label: 'Block out time' },
      secondary: { type: 'start', label: 'Or just start', assignmentId: top.assignment.id },
    })
  }

  if (ctx.calibration.samples >= 3 && ctx.calibration.factor >= 1.25) {
    const pct = Math.round((ctx.calibration.factor - 1) * 100)
    push({
      id: `calibration:${Math.round(ctx.calibration.factor * 10)}`,
      kind: 'info',
      text: fill(line(BANKS.calibration, tone, seed, ctx.calibration.factor >= 1.8), {
        n: pct,
        d: fmtDuration(120 * ctx.calibration.factor),
      }),
      detail: `Based on ${ctx.calibration.samples} finished task${ctx.calibration.samples === 1 ? '' : 's'} where you tracked time.`,
      weight: 300,
      action: { type: 'progress', label: 'See the numbers' },
    })
  }

  const doneBlocks = plannedToday.filter((b) => b.done)
  if (plannedToday.length >= 2 && doneBlocks.length === plannedToday.length && hour < 19) {
    const next = ranked.find((r) => !ctx.blocks.some((b) => b.assignmentId === r.assignment.id && isSameDay(b.start, now)))
    push({
      id: `freed:${today}`,
      kind: 'celebrate',
      text: fill(line(BANKS.freedTime, tone, seed, plannedToday.length >= 3), {
        d: fmtDuration(Math.max(60, (21 - hour) * 60 * 0.5)),
        t: next?.assignment.title ?? 'the next thing',
      }),
      weight: 520,
      action: next ? { type: 'start', label: `Start ${next.course?.code ?? 'next'}`, assignmentId: next.assignment.id } : undefined,
    })
  }

  const lastSession = ctx.sessions.reduce((m, s) => Math.max(m, +new Date(s.start)), 0)
  if (lastSession > 0) {
    const away = daysBetween(lastSession, now)
    if (away >= 3 && away <= 30) {
      push({
        id: `welcome-back:${today}`,
        kind: 'info',
        text: fill(line(BANKS.welcomeBack, tone, seed, away >= 10), { n: away }),
        detail: top ? `Smallest useful thing right now: ${top.nextStep}.` : undefined,
        weight: 620,
        action: top ? { type: 'start', label: 'Ten minutes', assignmentId: top.assignment.id } : undefined,
      })
    }
  }

  if (out.length === 0 && ranked.length > 0 && ranked.every((r) => r.pressure < 0.5 && r.daysUntil > 5)) {
    push({
      id: `all-clear:${today}`,
      kind: 'celebrate',
      text: line(BANKS.allClear, tone, seed, ranked.every((r) => r.daysUntil > 10)),
      detail: top ? `Furthest ahead you could get: ${top.assignment.title}, due in ${top.daysUntil} days.` : undefined,
      weight: 200,
    })
  }

  const seenSubjects = new Set<string>()
  const seenFamilies = new Set<string>()
  const kept: Nudge[] = []
  for (const n of out.sort((a, b) => b.weight - a.weight)) {
    const family = n.id.split(':')[0]
    if (n.subject && seenSubjects.has(n.subject)) continue
    if (n.related && seenSubjects.has(n.related)) continue
    if (seenFamilies.has(family)) continue
    if (n.subject) seenSubjects.add(n.subject)
    if (n.related) seenSubjects.add(n.related)
    seenFamilies.add(family)
    kept.push(n)
  }

  const celebrations = kept.filter((n) => n.kind === 'celebrate')
  const rest = kept.filter((n) => n.kind !== 'celebrate')
  return [...rest.sort((a, b) => b.weight - a.weight).slice(0, 3), ...celebrations.slice(0, 1)]
}

export const pruneMutes = (muted: Record<string, DayKey>, today: DayKey) =>
  Object.fromEntries(Object.entries(muted).filter(([, d]) => d === today))
