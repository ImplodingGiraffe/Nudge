import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent, RefObject } from 'react'
import { clamp } from '../../lib/date'

export type GestureMode = 'move' | 'resize-start' | 'resize-end' | 'create'

export interface Draft {
  mode: GestureMode
  blockId: string | null
  eventId: string | null
  classId: string | null
  dayIdx: number
  startMin: number
  endMin: number

  active: boolean
  duplicate: boolean
  origin: { dayIdx: number; startMin: number; endMin: number } | null

  magnetAt: number | null
}

export interface GestureOpts {
  gridRef: RefObject<HTMLDivElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
  dayCount: number
  startHour: number
  endHour: number
  pxPerMin: number
  snapMin: number
  minDurationMin: number

  getBlock: (id: string) => { dayIdx: number; startMin: number; endMin: number } | null
  getPlannerEvent?: (id: string) => { dayIdx: number; startMin: number; endMin: number } | null
  getClass?: (id: string) => { dayIdx: number; startMin: number; endMin: number } | null
  onMove: (id: string, dayIdx: number, startMin: number, endMin: number, duplicate: boolean) => void
  onMovePlannerEvent?: (id: string, dayIdx: number, startMin: number, endMin: number) => void
  onMoveClass?: (id: string, dayIdx: number, startMin: number, endMin: number) => void
  onCreate: (dayIdx: number, startMin: number, endMin: number) => void
  onTapBlock: (id: string) => void
  onTapPlannerEvent?: (id: string) => void
  onTapClass?: (id: string) => void

  snapTargets?: (excludeBlockId: string | null) => number[]
  disabled?: boolean
}

const MAGNET_MIN = 7

const capture = (el: HTMLElement, pointerId: number) => {
  try {
    el.setPointerCapture(pointerId)
  } catch {

  }
}

interface Internal {
  pointerId: number
  mode: GestureMode
  blockId: string | null
  eventId: string | null
  classId: string | null
  downX: number
  downY: number

  grabOffsetMin: number
  anchorMin: number
  origin: { dayIdx: number; startMin: number; endMin: number }
  moved: boolean
  isTouch: boolean
  target: HTMLElement | null

  targets: number[]
}

export function usePlannerGestures(opts: GestureOpts) {
  const {
    gridRef,
    scrollRef,
    dayCount,
    startHour,
    endHour,
    pxPerMin,
    snapMin,
    minDurationMin,
    getBlock,
    getPlannerEvent,
    getClass,
    onMove,
    onMovePlannerEvent,
    onMoveClass,
    onCreate,
    onTapBlock,
    onTapPlannerEvent,
    onTapClass,
    snapTargets,
    disabled,
  } = opts

  const [draft, setDraft] = useState<Draft | null>(null)
  const g = useRef<Internal | null>(null)
  const raf = useRef(0)
  const autoScroll = useRef({ dir: 0, dirX: 0, raf: 0 })
  const draftRef = useRef<Draft | null>(null)
  const lastPointerCoords = useRef({ x: 0, y: 0, altKey: false })

  const dayMinStart = startHour * 60
  const dayMinEnd = endHour * 60

  const setDraftNow = (d: Draft | null) => {
    draftRef.current = d
    setDraft(d)
  }

  const locate = useCallback(
    (clientX: number, clientY: number) => {
      const grid = gridRef.current
      if (!grid) return null
      const rect = grid.getBoundingClientRect()
      const colW = rect.width / dayCount
      const dayIdx = clamp(Math.floor((clientX - rect.left) / colW), 0, dayCount - 1)
      const minutes = dayMinStart + (clientY - rect.top) / pxPerMin
      return { dayIdx, minutes }
    },
    [gridRef, dayCount, pxPerMin, dayMinStart],
  )

  const snapMinutes = useCallback(
    (raw: number, targets: number[]) => {
      const grid = Math.round(raw / snapMin) * snapMin
      let value = grid
      let dist = Math.abs(raw - grid)
      let magnet = false
      for (const t of targets) {
        const d = Math.abs(raw - t)
        if (d < dist && d <= MAGNET_MIN) {
          value = t
          dist = d
          magnet = true
        }
      }
      return { value, dist, magnet }
    },
    [snapMin],
  )

  const stopAutoScroll = useCallback(() => {
    if (autoScroll.current.raf) cancelAnimationFrame(autoScroll.current.raf)
    autoScroll.current = { dir: 0, dirX: 0, raf: 0 }
  }, [])

  const updateDraftFromCoords = useCallback(
    (clientX: number, clientY: number, altKey: boolean) => {
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(() => {
        const pos = locate(clientX, clientY)
        const active = g.current
        if (!pos || !active) return

        const duplicate = altKey && active.mode === 'move'
        let next: Draft

        if (active.mode === 'move') {
          const duration = active.origin.endMin - active.origin.startMin
          const rawStart = pos.minutes - active.grabOffsetMin
          const topEdge = snapMinutes(rawStart, active.targets)
          const botEdge = snapMinutes(rawStart + duration, active.targets)
          const byTop = { start: topEdge.value, at: topEdge.value, ...topEdge }
          const byBot = { start: botEdge.value - duration, at: botEdge.value, ...botEdge }
          const pick = byBot.dist < byTop.dist ? byBot : byTop
          const start = clamp(pick.start, dayMinStart, dayMinEnd - duration)
          next = {
            mode: 'move',
            blockId: active.blockId,
            eventId: active.eventId,
            classId: active.classId,
            dayIdx: pos.dayIdx,
            startMin: start,
            endMin: start + duration,
            active: true,
            duplicate,
            origin: active.origin,
            magnetAt: pick.magnet ? pick.at : null,
          }
        } else if (active.mode === 'resize-end') {
          const snapped = snapMinutes(pos.minutes, active.targets)
          const end = clamp(snapped.value, active.origin.startMin + minDurationMin, dayMinEnd)
          next = {
            mode: 'resize-end',
            blockId: active.blockId,
            eventId: active.eventId,
            classId: active.classId,
            dayIdx: active.origin.dayIdx,
            startMin: active.origin.startMin,
            endMin: end,
            active: true,
            duplicate: false,
            origin: active.origin,
            magnetAt: snapped.magnet && end === snapped.value ? end : null,
          }
        } else if (active.mode === 'resize-start') {
          const snapped = snapMinutes(pos.minutes, active.targets)
          const start = clamp(snapped.value, dayMinStart, active.origin.endMin - minDurationMin)
          next = {
            mode: 'resize-start',
            blockId: active.blockId,
            eventId: active.eventId,
            classId: active.classId,
            dayIdx: active.origin.dayIdx,
            startMin: start,
            endMin: active.origin.endMin,
            active: true,
            duplicate: false,
            origin: active.origin,
            magnetAt: snapped.magnet && start === snapped.value ? start : null,
          }
        } else {
          const snapped = snapMinutes(pos.minutes, active.targets)
          const cursor = clamp(snapped.value, dayMinStart, dayMinEnd)
          const lo = Math.min(active.anchorMin, cursor)
          const hi = Math.max(active.anchorMin, cursor)
          next = {
            mode: 'create',
            blockId: null,
            eventId: null,
            classId: null,
            dayIdx: active.origin.dayIdx,
            startMin: lo,
            endMin: Math.max(hi, lo + minDurationMin),
            active: true,
            duplicate: false,
            origin: null,
            magnetAt: snapped.magnet ? cursor : null,
          }
        }
        setDraftNow(next)
      })
    },
    [locate, snapMinutes, dayMinStart, dayMinEnd, minDurationMin],
  )

  const tickAutoScroll = useCallback(function tickAutoScroll() {
    const el = scrollRef.current
    const { dir, dirX } = autoScroll.current
    if (!el || (!dir && !dirX)) return stopAutoScroll()
    if (dir) el.scrollTop += dir * 9
    if (dirX) el.scrollLeft += dirX * 10
    const { x, y, altKey } = lastPointerCoords.current
    updateDraftFromCoords(x, y, altKey)
    autoScroll.current.raf = requestAnimationFrame(tickAutoScroll)
  }, [scrollRef, stopAutoScroll, updateDraftFromCoords])

  const updateAutoScroll = useCallback(
    (clientX: number, clientY: number) => {
      const el = scrollRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const edge = 56
      const dir = clientY < r.top + edge ? -1 : clientY > r.bottom - edge ? 1 : 0
      const canX = el.scrollWidth > el.clientWidth + 4
      const dirX = !canX ? 0 : clientX < r.left + edge ? -1 : clientX > r.right - edge ? 1 : 0
      if (dir === autoScroll.current.dir && dirX === autoScroll.current.dirX) return
      const running = autoScroll.current.raf
      autoScroll.current.dir = dir
      autoScroll.current.dirX = dirX
      if ((dir || dirX) && !running) autoScroll.current.raf = requestAnimationFrame(tickAutoScroll)
      else if (!dir && !dirX) stopAutoScroll()
    },
    [scrollRef, stopAutoScroll, tickAutoScroll],
  )

  const cancel = useCallback(() => {
    const cur = g.current
    if (cur?.target && cur.target.hasPointerCapture?.(cur.pointerId)) {
      try {
        cur.target.releasePointerCapture(cur.pointerId)
      } catch {

      }
    }
    g.current = null
    stopAutoScroll()
    document.body.classList.remove('dragging')
    document.body.removeAttribute('data-planner-gesture')
    if (raf.current) cancelAnimationFrame(raf.current)
    setDraftNow(null)
  }, [stopAutoScroll])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && g.current) {
        e.preventDefault()
        cancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      stopAutoScroll()
      document.body.classList.remove('dragging')
      document.body.removeAttribute('data-planner-gesture')
    }
  }, [cancel, stopAutoScroll])

  const onPointerDown = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      if (disabled || e.button === 2 || g.current) return
      const target = e.target as HTMLElement

      const blockEl = target.closest<HTMLElement>('[data-block-id]')
      const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle
      const isTouch = e.pointerType !== 'mouse'
      const pos = locate(e.clientX, e.clientY)
      if (!pos) return

       const classEl = target.closest<HTMLElement>('[data-class-occurrence-id]')
       if (classEl) {
         const id = classEl.dataset.classOccurrenceId!
         const geo = getClass?.(id)
         if (!geo) return
         e.preventDefault()
         g.current = {
           pointerId: e.pointerId,
           mode: 'move',
           blockId: null,
           eventId: null,
           classId: id,
           downX: e.clientX,
           downY: e.clientY,
           grabOffsetMin: pos.minutes - geo.startMin,
           anchorMin: geo.startMin,
           origin: geo,
           moved: false,
           isTouch,
           target: e.currentTarget,
           targets: snapTargets?.(null) ?? [],
         }
         document.body.setAttribute('data-planner-gesture', '')
         capture(e.currentTarget, e.pointerId)
         setDraftNow({
           mode: 'move',
           blockId: null,
           eventId: null,
           classId: id,
           dayIdx: geo.dayIdx,
           startMin: geo.startMin,
           endMin: geo.endMin,
           active: false,
           duplicate: false,
           origin: geo,
           magnetAt: null,
         })
         return
       }

      if (blockEl) {
        const id = blockEl.dataset.blockId!
        const geo = getBlock(id)
        if (!geo) return
        const mode: GestureMode =
          handle === 'start' ? 'resize-start' : handle === 'end' ? 'resize-end' : 'move'
        g.current = {
          pointerId: e.pointerId,
          mode,
          blockId: id,
          eventId: null,
            classId: null,
          downX: e.clientX,
          downY: e.clientY,
          grabOffsetMin: pos.minutes - geo.startMin,
          anchorMin: mode === 'resize-start' ? geo.endMin : geo.startMin,
          origin: geo,
          moved: false,
          isTouch,
          target: e.currentTarget,
          targets: snapTargets?.(id) ?? [],
        }
        document.body.setAttribute('data-planner-gesture', '')
        capture(e.currentTarget, e.pointerId)
        setDraftNow({
          mode,
          blockId: id,
          eventId: null,
          classId: null,
          dayIdx: geo.dayIdx,
          startMin: geo.startMin,
          endMin: geo.endMin,
          active: false,
          duplicate: false,
          origin: geo,
          magnetAt: null,
        })
        return
      }

      const eventEl = target.closest<HTMLElement>('[data-planner-event-id]')
      if (eventEl) {
        const id = eventEl.dataset.plannerEventId!
        const geo = getPlannerEvent?.(id)
        if (!geo) return
        const mode: GestureMode =
          handle === 'start' ? 'resize-start' : handle === 'end' ? 'resize-end' : 'move'
        e.preventDefault()
        g.current = {
          pointerId: e.pointerId,
          mode,
          blockId: null,
          eventId: id,
          classId: null,
          downX: e.clientX,
          downY: e.clientY,
          grabOffsetMin: pos.minutes - geo.startMin,
          anchorMin: mode === 'resize-start' ? geo.endMin : geo.startMin,
          origin: geo,
          moved: false,
          isTouch,
          target: e.currentTarget,
          targets: snapTargets?.(null) ?? [],
        }
        document.body.setAttribute('data-planner-gesture', '')
        capture(e.currentTarget, e.pointerId)
        setDraftNow({
          mode,
          blockId: null,
          eventId: id,
          classId: null,
          dayIdx: geo.dayIdx,
          startMin: geo.startMin,
          endMin: geo.endMin,
          active: false,
          duplicate: false,
          origin: geo,
          magnetAt: null,
        })
        return
      }

      if (isTouch) {
        g.current = {
          pointerId: e.pointerId,
          mode: 'create',
          blockId: null,
          eventId: null,
          classId: null,
          downX: e.clientX,
          downY: e.clientY,
          grabOffsetMin: 0,
          anchorMin: Math.floor(pos.minutes / snapMin) * snapMin,
          origin: { dayIdx: pos.dayIdx, startMin: 0, endMin: 0 },
          moved: false,
          isTouch,
          target: e.currentTarget,
          targets: snapTargets?.(null) ?? [],
        }
        document.body.setAttribute('data-planner-gesture', '')
        return
      }

      const anchor = clamp(Math.floor(pos.minutes / snapMin) * snapMin, dayMinStart, dayMinEnd - minDurationMin)
      g.current = {
        pointerId: e.pointerId,
        mode: 'create',
        blockId: null,
        eventId: null,
        classId: null,
        downX: e.clientX,
        downY: e.clientY,
        grabOffsetMin: 0,
        anchorMin: anchor,
        origin: { dayIdx: pos.dayIdx, startMin: anchor, endMin: anchor },
        moved: false,
        isTouch,
        target: e.currentTarget,
        targets: snapTargets?.(null) ?? [],
      }
      document.body.setAttribute('data-planner-gesture', '')
      capture(e.currentTarget, e.pointerId)
    },
    [
      disabled,
      locate,
      getBlock,
      getPlannerEvent,
      getClass,
      snapMin,
      dayMinStart,
      dayMinEnd,
      minDurationMin,
      snapTargets,
    ],
  )

  const onPointerMove = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      const cur = g.current
      if (!cur || cur.pointerId !== e.pointerId) return

      if (!cur.moved) {
        const threshold = cur.isTouch ? 8 : 4
        const dist = Math.hypot(e.clientX - cur.downX, e.clientY - cur.downY)
        if (dist < threshold) return

        if (cur.isTouch && cur.mode === 'create') {
          g.current = null
          document.body.removeAttribute('data-planner-gesture')
          return
        }
        cur.moved = true
        document.body.classList.add('dragging')
      }

      const clientX = e.clientX
      const clientY = e.clientY
      const altKey = e.altKey
      lastPointerCoords.current = { x: clientX, y: clientY, altKey }
      updateAutoScroll(clientX, clientY)
      updateDraftFromCoords(clientX, clientY, altKey)
    },
    [updateAutoScroll, updateDraftFromCoords],
  )

  const onPointerUp = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      const cur = g.current
      if (!cur || cur.pointerId !== e.pointerId) return
      const d = draftRef.current

      if (!cur.moved) {

        if (cur.blockId) {
          onTapBlock(cur.blockId)
        } else if (cur.eventId) {
          onTapPlannerEvent?.(cur.eventId)
        } else if (cur.classId) {
          onTapClass?.(cur.classId)
        } else if (cur.isTouch || cur.mode === 'create') {
          const start = clamp(cur.anchorMin, dayMinStart, dayMinEnd - 60)
          onCreate(cur.origin.dayIdx, start, Math.min(start + 60, dayMinEnd))
        }
      } else if (d?.active) {
        if (d.mode === 'create') onCreate(d.dayIdx, d.startMin, d.endMin)
        else if (d.blockId) {
          const unchanged =
            d.origin &&
            d.origin.dayIdx === d.dayIdx &&
            d.origin.startMin === d.startMin &&
            d.origin.endMin === d.endMin
          if (!unchanged || d.duplicate) onMove(d.blockId, d.dayIdx, d.startMin, d.endMin, d.duplicate)
         } else if (d.classId) {
           const unchanged =
             d.origin &&
             d.origin.dayIdx === d.dayIdx &&
             d.origin.startMin === d.startMin &&
             d.origin.endMin === d.endMin
           if (!unchanged) onMoveClass?.(d.classId, d.dayIdx, d.startMin, d.endMin)
        } else if (d.eventId) {
          const unchanged =
            d.origin &&
            d.origin.dayIdx === d.dayIdx &&
            d.origin.startMin === d.startMin &&
            d.origin.endMin === d.endMin
          if (!unchanged) onMovePlannerEvent?.(d.eventId, d.dayIdx, d.startMin, d.endMin)
        }
      }
      cancel()
    },
    [
      cancel,
      onCreate,
      onMove,
      onMovePlannerEvent,
      onMoveClass,
      onTapBlock,
      onTapPlannerEvent,
      onTapClass,
      dayMinStart,
      dayMinEnd,
    ],
  )

  return {
    draft,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: cancel,

      onLostPointerCapture: cancel,
    },
  }
}
