import type { DayKey } from './types'

export const MIN = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000

const pad = (n: number) => `${n}`.padStart(2, '0')

export const toDateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const fromDateValue = (v: string) => {
  const [y, m, d] = v.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function fmtTimeAgo(iso: string, now: number = Date.now()): string {
  const ms = +new Date(iso)
  const diffSec = Math.max(0, Math.floor((now - ms) / 1000))
  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const dayKey = (d: Date | number | string): DayKey => {
  const x = new Date(d)
  const m = `${x.getMonth() + 1}`.padStart(2, '0')
  const day = `${x.getDate()}`.padStart(2, '0')
  return `${x.getFullYear()}-${m}-${day}`
}

export const fromDayKey = (k: DayKey): Date => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export const startOfDay = (d: Date | number | string): Date => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export const addDays = (d: Date | number | string, n: number): Date => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export const startOfWeek = (d: Date | number | string): Date => {
  const x = startOfDay(d)
  const shift = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - shift)
  return x
}

export const isSameDay = (a: Date | number | string, b: Date | number | string) => dayKey(a) === dayKey(b)

export const daysBetween = (a: Date | number | string, b: Date | number | string) =>
  Math.round((+startOfDay(b) - +startOfDay(a)) / DAY)

export const minutesOfDay = (d: Date | number | string) => {
  const x = new Date(d)
  return x.getHours() * 60 + x.getMinutes()
}

export const atMinutes = (day: Date | number | string, minutes: number): Date => {
  const x = startOfDay(day)
  x.setMinutes(minutes)
  return x
}

const HAS_12H = (() => {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? true
  } catch {
    return true
  }
})()

export function fmtTime(d: Date | number | string, opts: { compact?: boolean } = {}) {
  const x = new Date(d)
  const h = x.getHours()
  const m = x.getMinutes()
  if (!HAS_12H) return `${h}:${`${m}`.padStart(2, '0')}`
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  if (opts.compact) {
    return m === 0 ? `${h12}${suffix.toLowerCase()}` : `${h12}:${`${m}`.padStart(2, '0')}${suffix.toLowerCase()}`
  }
  return `${h12}:${`${m}`.padStart(2, '0')} ${suffix}`
}

export function fmtHourLabel(hour: number) {
  if (!HAS_12H) return `${hour}:00`
  const suffix = hour < 12 ? 'AM' : 'PM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12} ${suffix}`
}

export function fmtTimeRange(a: Date | number | string, b: Date | number | string) {
  const from = fmtTime(a, { compact: true })
  const to = fmtTime(b, { compact: true })
  const suffix = to.slice(-2)
  const shared = (suffix === 'am' || suffix === 'pm') && from.endsWith(suffix)
  return `${shared ? from.slice(0, -2) : from}–${to}`
}

export const fmtDay = (d: Date | number | string) =>
  new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export const fmtDayShort = (d: Date | number | string) =>
  new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function fmtDuration(min: number, opts: { long?: boolean } = {}) {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (opts.long) {
    if (h && rest) return `${h} hr ${rest} min`
    if (h) return `${h} hr`
    return `${rest} min`
  }
  if (h && rest) return `${h}h ${rest}m`
  if (h) return `${h}h`
  return `${rest}m`
}

export function fmtDue(due: Date | number | string, now: Date | number = Date.now()) {
  const d = new Date(due)
  const diff = +d - +new Date(now)
  const dayDiff = daysBetween(now, d)
  if (diff < 0) {
    const overdueDays = Math.abs(dayDiff)
    if (overdueDays === 0) return `Due today at ${fmtTime(d)}`
    if (overdueDays === 1) return 'Due yesterday'
    if (overdueDays < 7) return `${overdueDays} days overdue`
    return `Overdue since ${fmtDayShort(d)}`
  }
  if (dayDiff === 0) return `Today ${fmtTime(d)}`
  if (dayDiff === 1) return `Tomorrow ${fmtTime(d)}`
  if (dayDiff < 7)
    return `${d.toLocaleDateString(undefined, { weekday: 'long' })} ${fmtTime(d)}`
  return `${fmtDayShort(d)}`
}

export function fmtCountdown(due: Date | number | string, now: Date | number = Date.now()) {
  const diff = +new Date(due) - +new Date(now)
  const past = diff < 0
  const abs = Math.abs(diff)
  const d = Math.floor(abs / DAY)
  const h = Math.floor((abs % DAY) / HOUR)
  const m = Math.floor((abs % HOUR) / MIN)
  let text: string
  if (d > 0) text = `${d}d ${h}h`
  else if (h > 0) text = `${h}h ${m}m`
  else text = `${m}m`
  return past ? `${text} ago` : text
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export const snap = (minutes: number, step = 15) => Math.round(minutes / step) * step

export function quickAddDays(now: number | Date): { key: DayKey; label: string }[] {
  const base = startOfDay(now)
  const out = [
    { key: dayKey(base), label: 'Today' },
    { key: dayKey(addDays(base, 1)), label: 'Tomorrow' },
  ]
  for (let i = 2; i <= 4; i++) {
    const d = addDays(base, i)
    out.push({ key: dayKey(d), label: d.toLocaleDateString(undefined, { weekday: 'short' }) })
  }
  const nextMon = addDays(base, (8 - base.getDay()) % 7 || 7)
  const nextKey = dayKey(nextMon)
  if (!out.some((d) => d.key === nextKey)) out.push({ key: nextKey, label: 'Next week' })
  return out
}
