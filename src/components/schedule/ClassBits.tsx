import { Clock3, Footprints, MapPin, TriangleAlert, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'
import type { MeetingKind } from '../../lib/types'
import { kindOf, type Hop, type Place } from '../../lib/meetings'
import { fmtDuration } from '../../lib/date'
import { cx } from '../../lib/ui'

export function KindBadge({
  kind,
  size = 'sm',
  tone = 'plain',
  className,
}: {
  kind: MeetingKind
  size?: 'xs' | 'sm' | 'md'
  tone?: 'plain' | 'solid'
  className?: string
}) {
  const spec = kindOf(kind)
  const Icon = spec.icon
  const dims = {
    xs: { box: 'h-[15px] gap-[3px] px-1.5 rounded-full', text: 'text-[7.5px]', icon: 8 },
    sm: { box: 'h-[17px] gap-[4px] px-2 rounded-full', text: 'text-[8.5px]', icon: 9.5 },
    md: { box: 'h-[21px] gap-[5px] px-2.5 rounded-full', text: 'text-[10px]', icon: 11 },
  }[size]

  return (
    <span
      title={spec.label}
      className={cx(
        'inline-flex items-center justify-center font-bold uppercase tracking-wider whitespace-nowrap shrink-0 border border-line-2/70 leading-none select-none',
        dims.box,
        tone === 'solid' ? 'bg-surface/90 text-ink-2' : 'bg-tint-2 text-ink-2',
        className,
      )}
    >
      <Icon size={dims.icon} strokeWidth={2.2} className="shrink-0 opacity-90" aria-hidden />
      <span className={dims.text} aria-hidden>
        {spec.short}
      </span>
      <span className="sr-only">{spec.label}</span>
    </span>
  )
}

export function KindGlyph({ kind, size = 11, className }: { kind: MeetingKind; size?: number; className?: string }) {
  const spec = kindOf(kind)
  const Icon = spec.icon
  return (
    <>
      <Icon size={size} strokeWidth={2.1} className={cx('shrink-0', className)} aria-hidden />
      <span className="sr-only">{spec.label}</span>
    </>
  )
}

export function PlaceLine({
  place,
  size = 'sm',
  className,
  showRoom = true,
}: {
  place: Place | null
  size?: 'xs' | 'sm'
  className?: string
  showRoom?: boolean
}) {
  if (!place) return null
  const text = size === 'xs' ? 'text-[10px]' : 'text-[11.5px]'
  const hasSeparateRoom = showRoom && !!place.room && !!place.building
  const buildingDisplay = place.shortBuilding || place.building || place.room

  return (
    <span className={cx('inline-flex items-center gap-1.5 min-w-0 max-w-full', text, className)} title={place.raw}>
      {place.remote ? (
        <Wifi size={size === 'xs' ? 10 : 12} className="shrink-0 text-ink-3" aria-hidden />
      ) : (
        <MapPin size={size === 'xs' ? 10 : 12} className="shrink-0 text-ink-3" aria-hidden />
      )}
      <span className="truncate min-w-0 font-medium text-ink-2">
        {buildingDisplay}
      </span>
      {hasSeparateRoom && (
        <span className="inline-flex items-center justify-center h-[17px] px-1.5 rounded-full border border-line-2/70 bg-surface/90 text-[8.5px] font-bold text-ink-2 uppercase tracking-wider shrink-0 leading-none whitespace-nowrap select-none tnum">
          {place.room}
        </span>
      )}
    </span>
  )
}

export function ScheduleMeta({
  minutes,
  place,
  className,
  children,
}: {
  minutes: number
  place?: Place | null
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 text-[11.5px] text-ink-3 tnum leading-tight', className)}>
      <span className="inline-flex items-center gap-1 shrink-0">
        <Clock3 size={11} className="shrink-0 text-ink-3" aria-hidden />
        <span>{fmtDuration(minutes)}</span>
      </span>
      {place && <PlaceLine place={place} className="min-w-0" />}
      {children}
    </div>
  )
}

const hopWords = (hop: Hop) => {
  if (hop.clash) return `Overlaps: ${hop.from.building} and ${hop.to.building} at once`
  if (hop.to.remote) return `${hop.gapMin} min to get online after ${hop.from.building}`
  return `${hop.gapMin} min to get from ${hop.from.building} to ${hop.to.building}`
}

export function HopRow({ hop, className }: { hop: Hop; className?: string }) {
  const tone = hop.clash || hop.tight ? 'text-[var(--c-critical-ink)]' : 'text-ink-3'
  return (
    <li
      className={cx('flex items-center gap-2.5 px-1.5 py-[3px] select-none', className)}
      aria-label={hopWords(hop)}
    >
      <span className="w-[42px] shrink-0" aria-hidden />
      <span className="w-[18px] shrink-0" aria-hidden />
      <span className={cx('inline-flex items-center gap-1.5 text-[11.5px] leading-none min-w-0', tone)} aria-hidden>
        {hop.clash ? <TriangleAlert size={11} className="shrink-0" /> : <Footprints size={11} className="shrink-0" />}
        <span className="tnum font-medium">
          {hop.clash ? 'Clashes' : `${Math.max(0, hop.gapMin)} min`}
        </span>
        <span className="truncate opacity-90">
          {hop.clash ? `${hop.from.building} / ${hop.to.building}` : `→ ${hop.to.building}`}
        </span>
      </span>
    </li>
  )
}

export function HopTag({
  hop,
  minutes = true,
  size = 'sm',
  className,
}: {
  hop: Hop
  minutes?: boolean
  size?: 'xs' | 'sm'
  className?: string
}) {
  const isXs = size === 'xs'
  return (
    <span
      title={hopWords(hop)}
      className={cx(
        'inline-flex items-center justify-center gap-1 rounded-full border font-bold uppercase tracking-wider shrink-0 leading-none whitespace-nowrap select-none tnum',
        isXs ? 'h-[15px] px-1.5 text-[7.5px]' : 'h-[17px] px-1.5 text-[8.5px]',
        hop.clash || hop.tight
          ? 'bg-[color-mix(in_srgb,var(--c-critical)_16%,transparent)] text-[var(--c-critical-ink)] border-[color-mix(in_srgb,var(--c-critical)_30%,transparent)]'
          : 'bg-surface/90 border-line-2/70 text-ink-2',
        className,
      )}
    >
      {hop.clash ? (
        <TriangleAlert size={isXs ? 7.5 : 8.5} aria-hidden />
      ) : (
        <Footprints size={isXs ? 7.5 : 8.5} aria-hidden />
      )}
      {minutes && <span>{hop.clash ? 'Clash' : `${Math.max(0, hop.gapMin)}m`}</span>}
      <span className="sr-only">{hopWords(hop)}</span>
    </span>
  )
}
