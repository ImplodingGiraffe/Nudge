import type { StudyBlock } from './types'

export interface Positioned<T> {
  item: T
  startMin: number
  endMin: number

  col: number
  cols: number
}

interface Span {
  startMin: number
  endMin: number
}

export function layoutSpans<T>(items: T[], span: (t: T) => Span): Positioned<T>[] {
  const rows = items
    .map((item) => ({ item, ...span(item) }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

  const out: Positioned<T>[] = []
  let cluster: typeof rows = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (!cluster.length) return
    const colEnds: number[] = []
    const assigned = cluster.map((r) => {
      let c = colEnds.findIndex((end) => end <= r.startMin)
      if (c === -1) {
        c = colEnds.length
        colEnds.push(r.endMin)
      } else {
        colEnds[c] = r.endMin
      }
      return { ...r, col: c }
    })
    const cols = colEnds.length
    for (const a of assigned) out.push({ item: a.item, startMin: a.startMin, endMin: a.endMin, col: a.col, cols })
    cluster = []
    clusterEnd = -Infinity
  }

  for (const r of rows) {
    if (r.startMin >= clusterEnd && cluster.length) flush()
    cluster.push(r)
    clusterEnd = Math.max(clusterEnd, r.endMin)
  }
  flush()
  return out
}

export const blockSpan = (b: Pick<StudyBlock, 'start' | 'end'>) => {
  const s = new Date(b.start)
  const e = new Date(b.end)
  return {
    startMin: s.getHours() * 60 + s.getMinutes(),
    endMin: e.getHours() * 60 + e.getMinutes() || 24 * 60,
  }
}
