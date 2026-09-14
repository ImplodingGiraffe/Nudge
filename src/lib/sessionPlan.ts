import type { BlockSegment } from './types'
import { fmtDay, isSameDay } from './date'

export const SEGMENT_WORD: Record<BlockSegment['kind'], string> = {
  prep: 'Set up',
  focus: 'Focus',
  practice: 'Practice',
  review: 'Review',
  break: 'Break',
  wrap: 'Wrap up',
}

export const SEGMENT_TONE: Record<BlockSegment['kind'], string> = {
  prep: 'var(--c-ink-3)',
  focus: 'var(--c-ink)',
  practice: 'var(--c-ink-2)',
  review: 'var(--c-ink-2)',
  break: 'var(--c-line-2)',
  wrap: 'var(--c-ink-3)',
}

export const totalOf = (segments: BlockSegment[]) => segments.reduce((n, s) => n + s.minutes, 0)

export const offsetsOf = (segments: BlockSegment[]) => {
  let acc = 0
  return segments.map((s) => {
    const at = acc
    acc += s.minutes
    return at
  })
}

export function dayWord(ms: number, now: number): string {
  if (isSameDay(ms, now)) return 'Today'
  if (isSameDay(ms, now + 86_400_000)) return 'Tomorrow'
  return fmtDay(ms)
}

export function whenPhrase(startMs: number, endMs: number, now: number): string | null {
  if (!isSameDay(startMs, now)) return null

  if (now >= endMs) return null
  if (now >= startMs) return 'happening now'
  const min = Math.round((startMs - now) / 60_000)
  if (min < 1) return 'starting now'
  if (min < 60) return `in ${min} min`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return `in ${rest ? `${h}h ${rest}m` : `${h}h`}`
}
