import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    const onVis = () => document.visibilityState === 'visible' && setNow(Date.now())
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [intervalMs])
  return now
}

export function useMedia(query: string) {
  const [match, setMatch] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

export const useIsMobile = () => useMedia('(max-width: 767px)')

export function useLatest<T>(v: T) {
  const ref = useRef(v)
  useLayoutEffect(() => {
    ref.current = v
  })
  return ref
}

export function useEvent<A extends unknown[], R>(fn: (...a: A) => R) {
  const ref = useLatest(fn)
  return useCallback((...a: A) => ref.current(...a), [ref])
}

interface OverlayItem {
  id: number
  onClose?: () => void
}

let nextOverlayId = 1
const activeOverlays: OverlayItem[] = []
const overlayListeners = new Set<() => void>()
let globalKeydownRegistered = false

function ensureGlobalOverlayKeydown() {
  if (globalKeydownRegistered || typeof window === 'undefined') return
  globalKeydownRegistered = true

  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if ((e.target as HTMLElement | null)?.closest?.('[data-escape-guard]')) return
      if (document.body.hasAttribute('data-planner-gesture')) return

      const top = activeOverlays[activeOverlays.length - 1]
      if (top?.onClose) {
        e.preventDefault()
        e.stopPropagation()
        top.onClose()
      }
    },
    true,
  )
}

function updateBodyOverflow() {
  if (typeof document === 'undefined') return
  if (activeOverlays.length > 0) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
}

export function useOverlayStack(open: boolean, onClose?: () => void): number {
  const idRef = useRef<number>(0)
  if (!idRef.current) {
    idRef.current = nextOverlayId++
  }
  const id = idRef.current

  const closeRef = useLatest(onClose)
  const hasClose = Boolean(onClose)
  const [, setTick] = useState(0)
  const stackIndex = activeOverlays.findIndex((item) => item.id === id)
  const zIndex =
    stackIndex >= 0
      ? 50 + (stackIndex + 1) * 10
      : open
        ? 50 + (activeOverlays.length + 1) * 10
        : 50

  useLayoutEffect(() => {
    ensureGlobalOverlayKeydown()

    if (!open) return

    const onUpdate = () => setTick((t) => t + 1)
    overlayListeners.add(onUpdate)

    const prevFocus = document.activeElement as HTMLElement | null

    const idx = activeOverlays.findIndex((item) => item.id === id)
    if (idx !== -1) {
      activeOverlays.splice(idx, 1)
    }
    activeOverlays.push({
      id,
      onClose: hasClose ? () => closeRef.current?.() : undefined,
    })
    updateBodyOverflow()

    return () => {
      overlayListeners.delete(onUpdate)
      const removeIdx = activeOverlays.findIndex((item) => item.id === id)
      if (removeIdx !== -1) {
        activeOverlays.splice(removeIdx, 1)
        updateBodyOverflow()
        overlayListeners.forEach((fn) => fn())
      }
      if (prevFocus && typeof prevFocus.focus === 'function' && document.contains(prevFocus)) {
        prevFocus.focus()
      }
    }
  }, [open, id, closeRef, hasClose])

  useLayoutEffect(() => {
    if (!open) return

    const myIndex = activeOverlays.findIndex((item) => item.id === id)
    if (myIndex < 0) return

    const committedZIndex = 50 + (myIndex + 1) * 10
    if (committedZIndex !== zIndex) setTick((t) => t + 1)
  }, [open, id, zIndex])

  return zIndex
}

export function hasActiveOverlays() {
  return activeOverlays.length > 0
}

export function useAutoFocus<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!active) return

    const id = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const target =
        el.querySelector<HTMLElement>('[data-autofocus]') ??
        el.querySelector<HTMLElement>('input,textarea,select,button')
      target?.focus()
    }, 0)
    return () => clearTimeout(id)
  }, [active])
  return ref
}

export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !ref.current) return
      const items = ref.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
      )
      if (!items.length) return
      const list = Array.from(items).filter((el) => el.offsetParent !== null)
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active])
  return ref
}

export function useHashRoute(fallback: string) {
  const read = useCallback(
    () => (typeof location === 'undefined' ? fallback : location.hash.replace(/^#\/?/, '') || fallback),
    [fallback],
  )
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [read])
  const go = useCallback((next: string) => {
    if (location.hash.replace(/^#\/?/, '') === next) return
    location.hash = `/${next}`
  }, [])
  return [route, go] as const
}
