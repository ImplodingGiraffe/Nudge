import type { ColorSlot, Course, PaletteId } from './types'

export const courseColor = (slot: ColorSlot | undefined) => `var(--course-${slot ?? 1})`

export const courseWash = (slot: ColorSlot | undefined, pct = 12) =>
  `color-mix(in srgb, var(--course-${slot ?? 1}) ${pct}%, transparent)`

export const courseSolid = (slot: ColorSlot | undefined, pct = 16) =>
  `color-mix(in srgb, var(--course-${slot ?? 1}) ${pct}%, var(--c-surface))`

export const solidOf = (course: Course | undefined | null, pct = 16) =>
  course ? courseSolid(course.color, pct) : `color-mix(in srgb, var(--c-ink-3) ${pct}%, var(--c-surface))`

export const edgeOf = (course: Course | undefined | null, pct = 34) =>
  course
    ? `color-mix(in srgb, var(--course-${course.color}) ${pct}%, var(--c-surface))`
    : `color-mix(in srgb, var(--c-ink-3) ${pct}%, var(--c-surface))`

export const colorOf = (course: Course | undefined | null) =>
  course ? courseColor(course.color) : 'var(--c-ink-3)'

export const washOf = (course: Course | undefined | null, pct = 12) =>
  course ? courseWash(course.color, pct) : `color-mix(in srgb, var(--c-ink-3) ${pct}%, transparent)`

export const PALETTES: { id: PaletteId; label: string }[] = [
  { id: 'sand', label: 'Parchment' },
  { id: 'slate', label: 'Moonstone' },
  { id: 'ocean', label: 'Cerulean' },
  { id: 'forest', label: 'Pine' },
  { id: 'plum', label: 'Aubergine' },
  { id: 'rose', label: 'Garnet' },
  { id: 'amber', label: 'Saffron' },
  { id: 'mint', label: 'Jade' },
  { id: 'indigo', label: 'Cobalt' },
  { id: 'lavender', label: 'Wisteria' },
  { id: 'terracotta', label: 'Siena' },
  { id: 'graphite', label: 'Ink' },
]

export const PALETTE_IDS = PALETTES.map((p) => p.id)

export const DEFAULT_PALETTE: PaletteId = 'sand'

export const isPaletteId = (v: unknown): v is PaletteId =>
  typeof v === 'string' && (PALETTE_IDS as string[]).includes(v)
