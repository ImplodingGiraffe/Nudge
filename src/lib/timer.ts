import type { Session, Settings, TimerState } from './types'

export const MIN_LOGGABLE_MIN = 0.5

export const RESUME_GRACE_MS = 30_000

export const STALE_MS = 30 * 60_000

export const RECOVERY_GAP_MS = 2 * 60_000

export const HEARTBEAT_MS = 5_000

export const CHIME_WINDOW_MS = 60_000

const HEARTBEAT_KEY = 'nudge.heartbeat'

export function writeHeartbeat(at = Date.now()) {
  try {
    localStorage.setItem(HEARTBEAT_KEY, String(at))
  } catch {

  }
}

export function readHeartbeat(): number {
  try {
    const raw = localStorage.getItem(HEARTBEAT_KEY)
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function creditedSec(t: TimerState, at: number): number {
  if (t.runningSince == null) return 0
  const raw = Math.max(0, (at - t.runningSince) / 1000)

  if (!t.phaseTotalSec) return raw
  return Math.min(raw, Math.max(0, t.phaseTotalSec - t.phaseSec))
}

export function settle(t: TimerState, at: number = Date.now()): TimerState {
  const seen = Math.max(t.lastSeenAt, at)
  if (t.runningSince == null) return { ...t, lastSeenAt: seen }
  const sec = creditedSec(t, at)
  return {
    ...t,
    phaseSec: t.phaseSec + sec,
    workedSec: t.workedSec + (t.phase === 'work' ? sec : 0),

    runningSince: t.runningSince + sec * 1000,
    lastSeenAt: seen,
  }
}

export function boundaryAt(t: TimerState): number | null {
  if (!t.phaseTotalSec || t.runningSince == null) return null
  return t.runningSince + Math.max(0, t.phaseTotalSec - t.phaseSec) * 1000
}

export interface Live {
  running: boolean

  phaseSec: number

  workedSec: number

  remainingSec: number

  overSec: number

  pct: number
}

export function liveOf(t: TimerState, now: number = Date.now()): Live {

  const seg = creditedSec(t, now)
  const phaseSec = t.phaseSec + seg
  const workedSec = t.workedSec + (t.phase === 'work' ? seg : 0)
  const total = t.phaseTotalSec
  return {
    running: t.runningSince != null,
    phaseSec,
    workedSec,
    remainingSec: total ? Math.max(0, total - phaseSec) : 0,
    overSec: total ? Math.max(0, phaseSec - total) : phaseSec,
    pct: total ? Math.min(1, phaseSec / total) : 1,
  }
}

export const liveMinutes = (t: TimerState | null, now: number = Date.now()) =>
  t ? liveOf(t, now).workedSec / 60 : 0

export function breakSecFor(rounds: number, s: Settings) {
  const long = s.longBreakEvery > 0 && rounds % s.longBreakEvery === 0
  return (long ? s.longBreakMin : s.shortBreakMin) * 60
}

export function toWork(t: TimerState, sec: number, at: number = Date.now()): TimerState {
  return { ...t, phase: 'work', phaseSec: 0, phaseTotalSec: sec, runningSince: at, lastSeenAt: Math.max(t.lastSeenAt, at) }
}

export function toBreak(t: TimerState, sec: number, at: number = Date.now()): TimerState {
  return { ...t, phase: 'break', phaseSec: 0, phaseTotalSec: sec, runningSince: at, lastSeenAt: Math.max(t.lastSeenAt, at) }
}

export function toReady(t: TimerState, at: number = Date.now()): TimerState {
  return { ...t, phase: 'ready', phaseSec: 0, phaseTotalSec: 0, runningSince: at, lastSeenAt: Math.max(t.lastSeenAt, at) }
}

const isBreakKind = (kind: string) => kind === 'break'

export function completePhase(t: TimerState, s: Settings): TimerState {
  const at = boundaryAt(t)
  if (at == null) return t
  const settled = settle(t, at)

  if (settled.plan?.length) {
    const nextIndex = (settled.planIndex ?? 0) + 1
    const next = settled.plan[nextIndex]
    const rounds = settled.phase === 'work' ? settled.rounds + 1 : settled.rounds
    if (!next) return toReady({ ...settled, rounds }, at)
    const carried = { ...settled, rounds, planIndex: nextIndex, label: next.label }
    return isBreakKind(next.kind)
      ? toBreak(carried, next.minutes * 60, at)
      : toWork(carried, next.minutes * 60, at)
  }

  if (settled.phase === 'work') {
    const rounds = settled.rounds + 1

    if (settled.justStart) return toReady({ ...settled, rounds }, at)
    return toBreak({ ...settled, rounds }, breakSecFor(rounds, s), at)
  }
  return toReady(settled, at)
}

export type RecoveryKind =

  | 'resumed'

  | 'paused'

  | 'banked'

  | 'discarded'

export interface Recovery {
  kind: RecoveryKind

  minutes: number

  awaySec: number
  assignmentId: string | null

  timer: TimerState | null

  session: Omit<Session, 'id'> | null
}

const isSpent = (t: TimerState) => t.phaseTotalSec > 0 && t.phaseSec >= t.phaseTotalSec

const resumeAt = (t: TimerState, now: number) => (isSpent(t) ? t.runningSince : now)

export function recover(t: TimerState, now: number = Date.now(), heartbeat = 0): Recovery {
  const aliveUntil = Math.min(now, Math.max(t.lastSeenAt, heartbeat, +new Date(t.startedAt)))
  const awaySec = Math.max(0, (now - aliveUntil) / 1000)
  const wasRunning = t.runningSince != null

  const isStale = now - aliveUntil > STALE_MS
  const interrupted = wasRunning && now - aliveUntil > RECOVERY_GAP_MS
  const settled = settle(t, isStale || interrupted ? aliveUntil : now)
  const minutes = settled.workedSec / 60

  if (isStale) {
    if (minutes < MIN_LOGGABLE_MIN) {
      return { kind: 'discarded', minutes: 0, awaySec, assignmentId: t.assignmentId, timer: null, session: null }
    }
    return {
      kind: 'banked',
      minutes,
      awaySec,
      assignmentId: t.assignmentId,
      timer: null,
      session: sessionFrom(settled, now),
    }
  }

  if (wasRunning && !interrupted) {
    return {
      kind: 'resumed',
      minutes,
      awaySec,
      assignmentId: t.assignmentId,
      timer: { ...settled, runningSince: resumeAt(settled, now), lastSeenAt: now },
      session: null,
    }
  }

  return {
    kind: 'paused',
    minutes,
    awaySec,
    assignmentId: t.assignmentId,
    timer: { ...settled, runningSince: null, lastSeenAt: now },
    session: null,
  }
}

export function sessionFrom(t: TimerState, now: number = Date.now()): Omit<Session, 'id'> {
  return {
    courseId: t.courseId,
    assignmentId: t.assignmentId,
    blockId: t.blockId,
    start: t.startedAt,
    minutes: Math.round((t.workedSec / 60) * 10) / 10,
    source: t.source,
        sittingId: t.id,
    auto: false,
    createdAt: new Date(now).toISOString(),
  }
}
