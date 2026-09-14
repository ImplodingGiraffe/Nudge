import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  Coffee,
  Headphones,
  Loader2,
  Minimize2,
  Pause,
  Play,
  Square,
  StickyNote,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import type { Course, TimerState } from '../../lib/types'
import { takeTimerRecovery, useStore } from '../../lib/store'
import type { Recovery } from '../../lib/timer'
import {
  CHIME_WINDOW_MS,
  HEARTBEAT_MS,
  RECOVERY_GAP_MS,
  boundaryAt,
  liveOf,
  readHeartbeat,
  writeHeartbeat,
} from '../../lib/timer'
import { FOCUS_DONE, START_ENCOURAGEMENT, pick } from '../../lib/copy'
import { dayKey, fmtDuration } from '../../lib/date'
import { colorOf } from '../../lib/theme'
import { SegmentBar } from '../schedule/SessionPlan'
import { totalOf } from '../../lib/sessionPlan'
import { NoteComposer, NoteItem } from '../today/FocusNotes'
import { Button, CourseDot, IconButton } from '../ui'
import { showToast, useToast } from '../../lib/toast'
import { cx } from '../../lib/ui'
import { useOverlayStack } from '../../lib/hooks'

export interface Station {
  id: string
  name: string
  label: string
  url: string
}

export const LOFI_STATIONS: Station[] = [
  {
    id: 'purplecat',
    name: 'Purple Cat',
    label: 'Lo-Fi Beats (192k)',
    url: 'https://streaming.live365.com/a30440',
  },
  {
    id: 'chillhop',
    name: 'Chillhop',
    label: 'Chillhop Radio (320k)',
    url: 'https://streams.fluxfm.de/Chillhop/mp3-320/streams.fluxfm.de',
  },
  {
    id: 'nightwave',
    name: 'Nightwave Plaza',
    label: 'Lo-Fi & Chill (128k)',
    url: 'https://radio.plaza.one/mp3',
  },
  {
    id: 'fluid',
    name: 'Fluid',
    label: 'Hip Hop Beats (128k)',
    url: 'https://ice.somafm.com/fluid-128-aac',
  },
  {
    id: 'groovesalad',
    name: 'Groove Salad',
    label: 'Ambient & Downtempo (128k)',
    url: 'https://ice.somafm.com/groovesalad-128-aac',
  },
  {
    id: 'groovesalad2',
    name: 'Groove Salad 2',
    label: 'Ambient & Downtempo Vol 2 (128k)',
    url: 'https://ice.somafm.com/groovesalad2-128-aac',
  },
]

let globalLofiAudio: HTMLAudioElement | null = null
let globalAudioCtx: AudioContext | null = null
let globalAnalyser: AnalyserNode | null = null
let globalSourceNode: MediaElementAudioSourceNode | null = null

interface LofiPlayerState {
  currentStationId: string | null
  isPlaying: boolean
  isLoading: boolean
  volume: number
  isMuted: boolean
}

function getSavedVolume(): number {
  if (typeof window === 'undefined') return 0.7
  try {
    const v = localStorage.getItem('nudge.lofi.volume')
    if (v !== null) {
      const n = parseFloat(v)
      if (!Number.isNaN(n) && n >= 0 && n <= 1) return n
    }
  } catch {}
  return 0.7
}

function getSavedMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem('nudge.lofi.muted') === 'true'
  } catch {}
  return false
}

let lofiState: LofiPlayerState = {
  currentStationId: null,
  isPlaying: false,
  isLoading: false,
  volume: getSavedVolume(),
  isMuted: getSavedMuted(),
}

const lofiListeners = new Set<() => void>()

function notifyLofi() {
  lofiState = { ...lofiState }
  lofiListeners.forEach((fn) => fn())
}

function subscribeLofi(callback: () => void) {
  lofiListeners.add(callback)
  return () => {
    lofiListeners.delete(callback)
  }
}

function getLofiSnapshot(): LofiPlayerState {
  return lofiState
}

function getAudio(): HTMLAudioElement {
  if (!globalLofiAudio && typeof window !== 'undefined') {
    globalLofiAudio = new Audio()
    globalLofiAudio.preload = 'none'
    globalLofiAudio.crossOrigin = 'anonymous'
    globalLofiAudio.volume = lofiState.volume
    globalLofiAudio.muted = lofiState.isMuted

    globalLofiAudio.addEventListener('waiting', () => {
      lofiState.isLoading = true
      notifyLofi()
    })

    globalLofiAudio.addEventListener('playing', () => {
      lofiState.isLoading = false
      lofiState.isPlaying = true
      notifyLofi()
    })

    globalLofiAudio.addEventListener('pause', () => {
      lofiState.isPlaying = false
      lofiState.isLoading = false
      notifyLofi()
    })

    globalLofiAudio.addEventListener('ended', () => {
      lofiState.isPlaying = false
      lofiState.isLoading = false
      notifyLofi()
    })

    globalLofiAudio.addEventListener('error', () => {
      lofiState.isLoading = false
      lofiState.isPlaying = false
      notifyLofi()
      showToast('Could not connect to audio stream', { tone: 'warn' })
    })

    globalLofiAudio.addEventListener('volumechange', () => {
      if (!globalLofiAudio) return
      let changed = false
      if (lofiState.volume !== globalLofiAudio.volume) {
        lofiState.volume = globalLofiAudio.volume
        changed = true
        try {
          localStorage.setItem('nudge.lofi.volume', String(globalLofiAudio.volume))
        } catch {}
      }
      if (lofiState.isMuted !== globalLofiAudio.muted) {
        lofiState.isMuted = globalLofiAudio.muted
        changed = true
        try {
          localStorage.setItem('nudge.lofi.muted', String(globalLofiAudio.muted))
        } catch {}
      }
      if (changed) notifyLofi()
    })
  }
  return globalLofiAudio!
}

function initAudioEngine(): {
  audio: HTMLAudioElement
  analyser: AnalyserNode | null
  ctx: AudioContext | null
} {
  const audio = getAudio()

  if (!globalAudioCtx && typeof window !== 'undefined') {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (Ctx) {
      try {
        const ctx = new Ctx()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.82

        const source = ctx.createMediaElementSource(audio)
        source.connect(analyser)
        analyser.connect(ctx.destination)

        globalAudioCtx = ctx
        globalAnalyser = analyser
        globalSourceNode = source
      } catch (err) {
        console.warn('Web Audio setup failed, falling back to basic audio', err)
      }
    }
  }

  if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {})
  }

  return {
    audio,
    analyser: globalAnalyser,
    ctx: globalAudioCtx,
  }
}

function selectStation(station: Station | null) {
  const { audio, ctx } = initAudioEngine()
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }

  if (!station) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    lofiState.currentStationId = null
    lofiState.isPlaying = false
    lofiState.isLoading = false
    notifyLofi()
    return
  }

  if (lofiState.currentStationId === station.id && lofiState.isPlaying) {
    audio.pause()
    lofiState.isPlaying = false
    lofiState.isLoading = false
    notifyLofi()
    return
  }

  lofiState.isLoading = true
  lofiState.currentStationId = station.id
  notifyLofi()

  audio.src = station.url
  audio.volume = lofiState.volume
  audio.muted = lofiState.isMuted
  audio.load()
  audio.play().catch((err: unknown) => {
    if (err instanceof Error && err.name !== 'AbortError') {
      lofiState.isLoading = false
      lofiState.isPlaying = false
      notifyLofi()
    }
  })
}

function setLofiVolume(v: number) {
  const audio = getAudio()
  const clamped = Math.max(0, Math.min(1, v))
  audio.volume = clamped
  lofiState.volume = clamped
  try {
    localStorage.setItem('nudge.lofi.volume', String(clamped))
  } catch {}
  if (clamped > 0 && audio.muted) {
    audio.muted = false
    lofiState.isMuted = false
    try {
      localStorage.setItem('nudge.lofi.muted', 'false')
    } catch {}
  }
  notifyLofi()
}

function toggleLofiMute() {
  const audio = getAudio()
  audio.muted = !audio.muted
  lofiState.isMuted = audio.muted
  try {
    localStorage.setItem('nudge.lofi.muted', String(audio.muted))
  } catch {}
  notifyLofi()
}

export function useLofiPlayer() {
  const state = useSyncExternalStore(subscribeLofi, getLofiSnapshot, getLofiSnapshot)

  useEffect(() => {
    if (state.isPlaying && globalAudioCtx && globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume().catch(() => {})
    }
  }, [state.isPlaying])

  const activeStation = useMemo(
    () => LOFI_STATIONS.find((s) => s.id === state.currentStationId) ?? null,
    [state.currentStationId],
  )

  return {
    stations: LOFI_STATIONS,
    activeStation,
    isPlaying: state.isPlaying,
    isLoading: state.isLoading,
    volume: state.volume,
    isMuted: state.isMuted,
    analyser: globalAnalyser,
    selectStation,
    setVolume: setLofiVolume,
    toggleMute: toggleLofiMute,
  }
}

function WaveVisualizer({
  active,
  volume,
  muted,
  analyser,
}: {
  active: boolean
  volume: number
  muted: boolean
  analyser?: AnalyserNode | null
}) {
  const bar1Ref = useRef<HTMLSpanElement>(null)
  const bar2Ref = useRef<HTMLSpanElement>(null)
  const bar3Ref = useRef<HTMLSpanElement>(null)

  const animStateRef = useRef({
    curLow: 0.18,
    curMid: 0.18,
    curHigh: 0.18,
    smoothLow: 0.18,
    smoothMid: 0.18,
    smoothHigh: 0.18,
    lowFloor: 0.18,
    midFloor: 0.14,
    highFloor: 0.10,
    zeroFrames: 0,
    lastTime: performance.now(),
  })

  useEffect(() => {
    let animId: number
    const effectiveVol = active && !muted ? volume : 0
    const buffer = new Uint8Array(256)
    const s = animStateRef.current
    s.lastTime = performance.now()

    const render = (now: DOMHighResTimeStamp) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - s.lastTime) / 1000))
      s.lastTime = now
      const frameRatio = dt / 0.01667

      const node = analyser ?? globalAnalyser
      if (node) {
        if (node.fftSize !== 512) {
          try {
            node.fftSize = 512
          } catch {}
        }
        if (node.smoothingTimeConstant !== 0.82) {
          try {
            node.smoothingTimeConstant = 0.82
          } catch {}
        }
      }

      let rawLow = 0
      let rawMid = 0
      let rawHigh = 0
      let hasData = false

      if (active && node && effectiveVol > 0) {
        node.getByteFrequencyData(buffer)

        let sum = 0
        for (let i = 1; i <= 40; i++) sum += buffer[i]

        if (sum > 0) {
          hasData = true
          s.zeroFrames = 0
          const binCount = node.frequencyBinCount

          if (binCount >= 256) {
            const b1 = buffer[1] / 255
            const b2 = buffer[2] / 255
            const b3 = buffer[3] / 255
            const b4 = buffer[4] / 255
            rawLow = b1 * 0.42 + b2 * 0.38 + b3 * 0.14 + b4 * 0.06

            let mSum = 0
            for (let i = 6; i <= 26; i++) mSum += buffer[i]
            rawMid = mSum / 21 / 255

            let hSum = 0
            for (let i = 28; i <= 80; i++) hSum += buffer[i]
            rawHigh = hSum / 53 / 255
          } else {
            const b1 = buffer[1] / 255
            const b2 = buffer[2] / 255
            rawLow = b1 * 0.65 + b2 * 0.35

            let mSum = 0
            for (let i = 3; i <= 13; i++) mSum += buffer[i]
            rawMid = mSum / 11 / 255

            let hSum = 0
            for (let i = 14; i <= 40; i++) hSum += buffer[i]
            rawHigh = hSum / 27 / 255
          }
        } else {
          s.zeroFrames++
        }
      }

      if (active && effectiveVol > 0 && (!hasData || s.zeroFrames > 12)) {
        const timeSec = now / 1000
        const beatSec = 60 / 82
        const measureTime = (timeSec % (beatSec * 4)) / beatSec
        const beatNum = Math.floor(measureTime)
        const frac = measureTime - beatNum

        const kickHit = (beatNum === 0 && frac < 0.22) || (beatNum === 2 && frac >= 0.5 && frac < 0.72)
        const snareHit = (beatNum === 1 && frac < 0.25) || (beatNum === 3 && frac < 0.25)
        const hatHit = ((frac * 2) % 1) < 0.22

        rawLow = kickHit ? 0.88 : 0.16
        rawMid = snareHit ? 0.78 : 0.18
        rawHigh = hatHit ? 0.65 : 0.12
      }

      if (active && effectiveVol > 0) {
        const inputAlpha = Math.min(1, 0.72 * frameRatio)
        s.smoothLow += (rawLow - s.smoothLow) * inputAlpha
        s.smoothMid += (rawMid - s.smoothMid) * inputAlpha
        s.smoothHigh += (rawHigh - s.smoothHigh) * inputAlpha

        const floorAlpha = Math.min(1, 0.025 * frameRatio)
        s.lowFloor += (s.smoothLow - s.lowFloor) * floorAlpha
        s.midFloor += (s.smoothMid - s.midFloor) * floorAlpha
        s.highFloor += (s.smoothHigh - s.highFloor) * floorAlpha

        const punchLow = Math.max(0, s.smoothLow - s.lowFloor * 0.68)
        const punchMid = Math.max(0, s.smoothMid - s.midFloor * 0.68)
        const punchHigh = Math.max(0, s.smoothHigh - s.highFloor * 0.62)

        const targetLow = Math.min(1, Math.max(0, punchLow * 2.3 + s.smoothLow * 0.22))
        const targetMid = Math.min(1, Math.max(0, punchMid * 2.4 + s.smoothMid * 0.22))
        const targetHigh = Math.min(1, Math.max(0, punchHigh * 2.5 + s.smoothHigh * 0.22))

        const attackL = Math.min(1, 0.46 * frameRatio)
        const decayL = Math.min(1, 0.11 * frameRatio)
        s.curLow += (targetLow - s.curLow) * (targetLow > s.curLow ? attackL : decayL)

        const attackM = Math.min(1, 0.52 * frameRatio)
        const decayM = Math.min(1, 0.13 * frameRatio)
        s.curMid += (targetMid - s.curMid) * (targetMid > s.curMid ? attackM : decayM)

        const attackH = Math.min(1, 0.58 * frameRatio)
        const decayH = Math.min(1, 0.16 * frameRatio)
        s.curHigh += (targetHigh - s.curHigh) * (targetHigh > s.curHigh ? attackH : decayH)
      } else {
        const idleDecay = Math.max(0, 1 - 0.18 * frameRatio)
        s.curLow *= idleDecay
        s.curMid *= idleDecay
        s.curHigh *= idleDecay
      }

      const volMultiplier = effectiveVol > 0 ? 0.35 + 0.65 * effectiveVol : 0
      const isDead = !active || effectiveVol === 0

      const scale1 = isDead ? 0.18 : Math.max(0.18, Math.min(1, 0.18 + 0.82 * s.curLow * volMultiplier))
      const scale2 = isDead ? 0.18 : Math.max(0.18, Math.min(1, 0.18 + 0.82 * s.curMid * volMultiplier))
      const scale3 = isDead ? 0.18 : Math.max(0.18, Math.min(1, 0.18 + 0.82 * s.curHigh * volMultiplier))

      if (bar1Ref.current) bar1Ref.current.style.transform = `scaleY(${scale1.toFixed(3)})`
      if (bar2Ref.current) bar2Ref.current.style.transform = `scaleY(${scale2.toFixed(3)})`
      if (bar3Ref.current) bar3Ref.current.style.transform = `scaleY(${scale3.toFixed(3)})`

      if (active && effectiveVol > 0) {
        animId = requestAnimationFrame(render)
      } else if (s.curLow > 0.005 || s.curMid > 0.005 || s.curHigh > 0.005) {
        animId = requestAnimationFrame(render)
      }
    }

    animId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animId)
  }, [active, volume, muted, analyser])

  return (
    <span
      className="inline-flex items-end justify-center gap-[1.5px] w-3 h-3.5 text-[var(--c-accent)] pb-0.5"
      aria-hidden="true"
    >
      <span
        ref={bar1Ref}
        className="w-[2px] h-[13px] bg-current rounded-full origin-bottom will-change-transform"
        style={{ transform: 'scaleY(0.18)' }}
      />
      <span
        ref={bar2Ref}
        className="w-[2px] h-[13px] bg-current rounded-full origin-bottom will-change-transform"
        style={{ transform: 'scaleY(0.18)' }}
      />
      <span
        ref={bar3Ref}
        className="w-[2px] h-[13px] bg-current rounded-full origin-bottom will-change-transform"
        style={{ transform: 'scaleY(0.18)' }}
      />
    </span>
  )
}

function LofiMenu({ player }: { player: ReturnType<typeof useLofiPlayer> }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const isLive = player.isPlaying && player.activeStation

  return (
    <div className="relative" ref={menuRef}>
      <Button
        size="sm"
        variant="quiet"
        onClick={() => setOpen((v) => !v)}
        aria-label="Lo-Fi Study Radio"
        className={cx(
          'h-8 px-2.5 text-[12px] font-medium transition-all gap-1.5',
          isLive
            ? 'bg-surface-2 text-ink border border-line shadow-xs'
            : open
              ? 'bg-tint text-ink'
              : 'text-ink-2 hover:bg-tint',
        )}
      >
        {player.isLoading ? (
          <Loader2 size={13} className="animate-spin text-ink-3" />
        ) : isLive ? (
          <WaveVisualizer
            active={player.isPlaying}
            volume={player.volume}
            muted={player.isMuted}
            analyser={player.analyser}
          />
        ) : (
          <Headphones size={14} />
        )}
        <span className="truncate max-w-[110px]">
          {isLive ? player.activeStation?.name : 'Lo-Fi'}
        </span>
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-line bg-surface p-2 shadow-pop z-50 a-fade">
          <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-line mb-1.5">
            <span className="text-[11.5px] font-semibold text-ink-3 uppercase tracking-wider">
              Study Radio
            </span>
            {isLive && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--c-good)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--c-good)] animate-pulse" />
                Live
              </span>
            )}
          </div>

          <div className="flex flex-col gap-0.5">
            {player.stations.map((s) => {
              const active = player.activeStation?.id === s.id && player.isPlaying
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => player.selectStation(s)}
                  className={cx(
                    'flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left transition-colors',
                    active
                      ? 'bg-tint text-ink font-medium'
                      : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] leading-tight truncate">{s.name}</p>
                    <p className="text-[11px] text-ink-3 leading-tight truncate">{s.label}</p>
                  </div>
                  {active ? (
                    <Pause size={13} className="shrink-0 text-ink" />
                  ) : (
                    <Play size={13} className="shrink-0 text-ink-3 opacity-60" />
                  )}
                </button>
              )
            })}

            {player.activeStation && (
              <button
                type="button"
                onClick={() => player.selectStation(null)}
                className="mt-1 w-full px-2 py-1 text-[11.5px] text-ink-3 hover:text-ink hover:bg-surface-2 rounded-md transition-colors text-center"
              >
                Turn off radio
              </button>
            )}
          </div>

          <div className="mt-2.5 pt-2 border-t border-line px-2 pb-1">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={player.toggleMute}
                className="text-ink-3 hover:text-ink transition-colors shrink-0"
                aria-label={player.isMuted ? 'Unmute' : 'Mute'}
              >
                {player.isMuted || player.volume === 0 ? (
                  <VolumeX size={14} />
                ) : (
                  <Volume2 size={14} />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={player.isMuted ? 0 : player.volume}
                onChange={(e) => player.setVolume(parseFloat(e.target.value))}
                className="w-full h-1 bg-sunken rounded-lg appearance-none cursor-pointer accent-[var(--c-ink)]"
                aria-label="Volume slider"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function chime(kind: 'done' | 'break') {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const notes = kind === 'done' ? [660, 880] : [520, 392]
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02 + i * 0.16)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55 + i * 0.16)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.16)
      osc.stop(ctx.currentTime + 0.7 + i * 0.16)
    })
    setTimeout(() => ctx.close(), 1600)
  } catch {}
}

function useTick(active: boolean) {
  const [n, force] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => force((x) => x + 1), 500)
    return () => clearInterval(id)
  }, [active])
  return active ? n : 0
}

const mmss = (sec: number) => {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`
}

const span = (min: number) => (min > 0 && min < 1 ? '<1m' : fmtDuration(min))

export const useTimerEngine = () => {
  const timer = useStore((s) => s.timer)
  const sound = useStore((s) => s.settings.sound)
  const { toast } = useToast()
  const running = timer?.runningSince != null
  const firedFor = useRef<string | null>(null)

  const announce = useCallback(
    (r: Recovery | null) => {
      if (!r) return
      const away = Math.round(r.awaySec / 60)
      if (r.kind === 'banked') {
        toast(`Resumed an unfinished session. ${span(r.minutes)} logged.`, { tone: 'good' })
        return
      }
      if (r.kind !== 'paused') return
      const t = r.timer
      toast(
        away >= 1 ? `Paused for ${fmtDuration(away)}. That time was not counted.` : 'Paused while you were away.',
        away >= 1 && t
          ? {
              duration: 8000,
              action: {
                label: 'Count it',
                run: () =>
                  useStore.getState().logSession({
                    minutes: away,
                    assignmentId: t.assignmentId,
                    courseId: t.courseId,
                    blockId: t.blockId,
                    source: 'manual',
                    start: new Date(Date.now() - r.awaySec * 1000).toISOString(),
                  }),
              },
            }
          : undefined,
      )
    },
    [toast],
  )

  useEffect(() => {
    announce(takeTimerRecovery())
  }, [announce])

  useEffect(() => {
    if (!running) return
    const beat = () => {
      const prev = readHeartbeat()
      const now = Date.now()
      if (prev && now - prev > RECOVERY_GAP_MS) announce(useStore.getState().reconcileTimer())
      writeHeartbeat(now)
    }
    beat()
    const id = setInterval(beat, HEARTBEAT_MS)

    const onLeave = () => {
      useStore.getState().settleTimer()
      writeHeartbeat()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat()
      else onLeave()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', onLeave)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', onLeave)
      onLeave()
    }
  }, [running, announce])

  useEffect(() => {
    if (!running) return
    const checkBoundary = () => {
      const current = useStore.getState().timer
      if (!current || current.runningSince == null || !current.phaseTotalSec) return
      if (liveOf(current).remainingSec > 0) return
      const key = `${current.id}:${current.phase}:${current.rounds}`
      if (firedFor.current === key) return
      firedFor.current = key

      const at = boundaryAt(current)
      const fresh = at != null && Date.now() - at < CHIME_WINDOW_MS
      const wasWork = current.phase === 'work'
      if (fresh && sound) chime(wasWork ? 'done' : 'break')
      useStore.getState().completeTimerPhase()
      if (fresh && wasWork) toast(pick(FOCUS_DONE, key), { tone: 'good' })
    }
    checkBoundary()
    const id = setInterval(checkBoundary, 500)
    return () => clearInterval(id)
  }, [running, sound, toast])
}

function useTimerView() {
  const timer = useStore((s) => s.timer)
  const assignments = useStore((s) => s.assignments)
  const courses = useStore((s) => s.courses)
  const blocks = useStore((s) => s.blocks)
  const banked = useStore((s) => s.sessions)
  useTick(timer?.runningSince != null)

  const block = timer?.blockId ? blocks.find((b) => b.id === timer.blockId) : undefined
  const assignment = timer?.assignmentId ? assignments.find((a) => a.id === timer.assignmentId) : undefined
  const resolvedCourseId = timer?.courseId ?? assignment?.courseId ?? block?.courseId
  const course = resolvedCourseId ? courses.find((c) => c.id === resolvedCourseId) : undefined
  if (!timer) return null

  const live = liveOf(timer)
  const todayKey = dayKey(Date.now())
  const totalMin = timer.assignmentId
    ? banked.reduce((s, x) => (x.assignmentId === timer.assignmentId ? s + x.minutes : s), 0) + live.workedSec / 60
    : banked.filter((x) => dayKey(x.start) === todayKey).reduce((s, x) => s + x.minutes, 0) + live.workedSec / 60

  return { timer, live, assignment, course, totalMin }
}

const phaseColor = (t: TimerState, course?: Course) =>
  t.phase === 'break' ? 'var(--c-good)' : t.phase === 'ready' ? 'var(--c-line-2)' : colorOf(course)

const statusWord = (t: TimerState) =>
  t.phase === 'break' ? 'break' : t.phase === 'ready' ? 'ready' : t.runningSince == null ? 'paused' : 'focusing'

export function FocusChip({ onExpand, variant }: { onExpand: () => void; variant: 'rail' | 'header' }) {
  const store = useStore()
  const view = useTimerView()
  const lofiPlayer = useLofiPlayer()
  if (!view) return null
  const { timer, live, assignment, course } = view

  const paused = timer.runningSince == null
  const label = timer.phase === 'break' ? 'Back soon' : (assignment?.title ?? course?.code ?? timer.label ?? 'Focus')
  const clock = timer.phase === 'ready' ? 'Ready' : mmss(live.remainingSec)
  const rail = variant === 'rail'

  return (
    <div
      className={cx(
        'flex items-center gap-2 rounded-xl border border-line bg-surface-2 min-w-0',
        rail ? 'a-rise mx-2 mb-1 p-1.5' : 'h-9 pl-1.5 pr-1 flex-1',
      )}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label={`Open focus mode: ${statusWord(timer)}, ${clock}`}
        className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-lg"
      >
        <Ring pct={live.pct} size={rail ? 28 : 24} stroke={rail ? 3 : 2.5} color={phaseColor(timer, course)}>
          {timer.phase === 'break' ? <Coffee size={11} className="text-ink-2" /> : null}
        </Ring>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className={cx('font-semibold text-ink tnum leading-none', rail ? 'text-[13.5px]' : 'text-[13px]')}>
              {clock}
            </span>
            <span className="text-[10.5px] text-ink-3 leading-tight">{statusWord(timer)}</span>
            {lofiPlayer.isPlaying && (
              <span
                className="ml-auto mr-1 inline-flex items-center text-[var(--c-accent)] shrink-0"
                title={`Playing ${lofiPlayer.activeStation?.name ?? 'Lo-Fi'}`}
              >
                <WaveVisualizer
                  active={lofiPlayer.isPlaying}
                  volume={lofiPlayer.volume}
                  muted={lofiPlayer.isMuted}
                  analyser={lofiPlayer.analyser}
                />
              </span>
            )}
          </span>
          <span className="block text-[11px] text-ink-2 truncate leading-tight">{label}</span>
        </span>
      </button>
      {timer.phase !== 'ready' && (
        <IconButton
          label={paused ? 'Resume' : 'Pause'}
          size="xs"
          onClick={paused ? store.resumeTimer : store.pauseTimer}
          className="shrink-0"
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </IconButton>
      )}
    </div>
  )
}

function FocusNotesOverlay({
  timer,
  course,
  onClose,
}: {
  timer: TimerState
  course?: Course
  onClose: () => void
}) {
  const store = useStore()
  const { toast } = useToast()
  const zIndex = useOverlayStack(true, onClose)
  const allNotes = useStore((s) => s.focusNotes)

  const relevantNotes = allNotes.filter((n) => n.studyId === timer.id)

  return createPortal(
    <aside
      role="dialog"
      aria-label="Study Notes"
      style={{ zIndex }}
      className="fixed inset-y-0 right-0 w-full sm:w-[400px] bg-surface/95 backdrop-blur-sm border-l border-line shadow-pop flex flex-col a-slide-in-right"
    >
      <div className="flex items-start justify-between gap-3 px-5 py-4 shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 text-[var(--c-accent)] shrink-0">
            <StickyNote size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-ink truncate">Study Notes</h3>
            {course && <p className="mt-0.5 text-[12px] text-ink-3 truncate">{course.code}</p>}
          </div>
        </div>
        <IconButton label="Close Study Notes" size="sm" onClick={onClose} className="shrink-0 -mr-1 -mt-1">
          <X size={16} />
        </IconButton>
      </div>

      <div className="px-5 pt-1 pb-5 shrink-0">
        <NoteComposer
          autoFocus
          hideCourseSelector
          hideSaveHint
          initialCourseId={timer.courseId ?? ''}
          initialAssignmentId={timer.assignmentId ?? ''}
          placeholder="Write a note…"
          onSave={(text, courseId, assignmentId) => {
            store.addFocusNote({
              text,
              studyId: timer.id,
              courseId: courseId || timer.courseId || null,
              assignmentId: assignmentId || timer.assignmentId || null,
            })
            toast('Note saved')
          }}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 scroll-slim">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <p className="text-[13px] font-semibold text-ink">Study Notes</p>
          {relevantNotes.length > 0 && <span className="text-[12px] text-ink-3 tnum">{relevantNotes.length}</span>}
        </div>

        {relevantNotes.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {relevantNotes.map((note) => (
              <NoteItem key={note.id} note={note} comfortable />
            ))}
          </div>
        ) : (
          <div className="mt-8 px-5 text-center">
            <p className="text-[14px] font-medium text-ink-2">No Study Notes yet</p>
          </div>
        )}
      </div>
    </aside>,
    document.body,
  )
}

export function FocusOverlay({ onMinimise }: { onMinimise: () => void }) {
  const store = useStore()
  const { toast } = useToast()
  const view = useTimerView()
  const lofiPlayer = useLofiPlayer()

  const encouragement = useMemo(() => pick(START_ENCOURAGEMENT, view?.timer.id ?? ''), [view?.timer.id])
  const zIndex = useOverlayStack(Boolean(view), onMinimise)

  const [showNotes, setShowNotes] = useState(false)
  const allNotes = useStore((s) => s.focusNotes)

  if (!view) return null
  const { timer, live, assignment, course, totalMin } = view
  const paused = timer.runningSince == null
  const isWork = timer.phase === 'work'
  const isBreak = timer.phase === 'break'

  const relevantNotes = allNotes.filter((n) => n.studyId === timer.id)
  const openNotesCount = relevantNotes.filter((n) => !n.reviewedAt).length

  const end = (finish = false) => {
    lofiPlayer.selectStation(null)
    const name = assignment?.title
    const res = store.endSitting({ finish })
    onMinimise()
    if (!res) return
    if (finish) {
      toast(
        res.minutes >= 1
          ? `${name ? `${name} d` : 'D'}one. ${span(res.minutes)} logged, ${span(res.totalMin)} total.`
          : 'Done.',
        { tone: 'good', action: { label: 'Undo', run: () => store.undo() } },
      )
    } else if (res.minutes >= 1) {
      toast(
        assignment
          ? `${span(res.minutes)} logged · ${span(res.totalMin)} on ${name} so far.`
          : `${span(res.minutes)} logged. That still counts.`,
        { tone: 'good', action: { label: 'Undo', run: () => store.undo() } },
      )
    } else {
      toast('Too short to log, but you started.')
    }
  }

  const planDone = !!timer.plan && timer.phase === 'ready' && (timer.planIndex ?? 0) >= timer.plan.length - 1
  const heading = isBreak
    ? 'Break'
    : timer.phase === 'ready'
      ? planDone
        ? 'Sitting done'
        : timer.rounds === 1 && timer.justStart
          ? 'Ten minutes. Kept.'
          : `Round ${timer.rounds} done`
      : (assignment?.title ?? course?.code ?? timer.label ?? 'Focus')

  const seg = timer.plan?.[timer.planIndex ?? 0]
  const nextSeg = timer.plan?.[(timer.planIndex ?? 0) + 1]

  const playedMin = timer.plan
    ? planDone
      ? totalOf(timer.plan)
      : timer.plan.slice(0, timer.planIndex ?? 0).reduce((n, x) => n + x.minutes, 0) +
        Math.min(seg?.minutes ?? 0, live.phaseSec / 60)
    : undefined

  const blurb = planDone
    ? 'All parts are complete. Stop the clock to log the session.'
    : seg
      ? nextSeg
        ? `${seg.label}. Then ${nextSeg.minutes} min: ${nextSeg.label}.`
        : `${seg.label}. Last stretch of this sitting.`
      : isBreak
        ? 'Water, window, walk. Come back in a minute.'
        : timer.phase === 'ready'
          ? 'Nothing is being counted until you start again.'
          : timer.justStart
            ? encouragement
            : (timer.label ?? 'One thing, this window, until the timer stops.')

  return createPortal(
    <div style={{ zIndex }} className="fixed inset-0 bg-bg flex flex-col a-fade">
      <header className="relative z-10 shrink-0 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {course && <CourseDot course={course} size={15} />}
          <span className="text-[13px] font-medium text-ink-2 truncate">
            {isBreak ? 'Break' : (course?.code ?? 'Focus')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <LofiMenu player={lofiPlayer} />

          <Button
            size="sm"
            variant="quiet"
            onClick={() => setShowNotes((v) => !v)}
            className={cx(
              'h-8 px-2.5 text-[12px] font-medium transition-colors',
              showNotes ? 'bg-tint text-ink' : 'text-ink-2 hover:bg-tint',
            )}
          >
            <StickyNote size={14} />
            <span>Study Notes</span>
            {openNotesCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10.5px] font-semibold bg-ink text-surface">
                {openNotesCount}
              </span>
            )}
          </Button>
          <IconButton label="Minimise" onClick={onMinimise} title="Minimise (Esc)">
            <Minimize2 size={17} />
          </IconButton>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-6 pb-12">
        <Ring pct={live.pct} size={248} stroke={9} color={phaseColor(timer, course)}>
          <div className="text-center">
            <div className="text-[54px] font-semibold leading-none text-ink tracking-tight tnum">
              {timer.phase === 'ready' ? '—' : mmss(live.remainingSec)}
            </div>
            <div className="mt-1.5 text-[12.5px] font-medium uppercase tracking-[0.1em] text-ink-3">
              {timer.plan
                ? planDone
                  ? 'Sitting complete'
                  : `Stretch ${(timer.planIndex ?? 0) + 1} of ${timer.plan.length}`
                : isBreak
                  ? 'Break'
                  : timer.phase === 'ready'
                    ? 'Paused between rounds'
                    : timer.justStart
                      ? 'Just start'
                      : `Round ${timer.rounds + 1}`}
            </div>
          </div>
        </Ring>

        <h2 className="mt-8 text-[19px] font-semibold text-ink text-center max-w-[24ch] leading-snug">{heading}</h2>
        <p className="mt-2 text-[13.5px] text-ink-2 text-center max-w-[34ch] leading-relaxed">{blurb}</p>

        <dl className="mt-7 flex items-stretch divide-x divide-line rounded-xl border border-line bg-surface-2">
          <div className="px-5 py-2.5 text-center">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">This session</dt>
            <dd className="mt-0.5 text-[17px] font-semibold text-ink tnum">{span(live.workedSec / 60)}</dd>
          </div>
          <div className="px-5 py-2.5 text-center">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
              {assignment ? 'Total on this task' : 'Total today'}
            </dt>
            <dd className="mt-0.5 text-[17px] font-semibold text-ink tnum">{span(totalMin)}</dd>
          </div>
        </dl>

        {timer.plan && timer.plan.length > 1 && (
          <div className="mt-7 w-full max-w-[320px]">
            <SegmentBar segments={timer.plan} playedMin={playedMin} />
            <div className="mt-2 flex items-baseline justify-between gap-3 text-[11.5px] tnum">
              <span className="text-ink-3">{span(totalOf(timer.plan))} sitting</span>
              <span className="text-ink-2">
                {planDone ? 'all of it done' : `${span(totalOf(timer.plan) - (playedMin ?? 0))} to go`}
              </span>
            </div>
          </div>
        )}

        {timer.phase === 'ready' && live.overSec > 90 && (
          <p className="mt-3 text-[12.5px] text-ink-3">
            Waiting {fmtDuration(live.overSec / 60)}. That time was not counted.
          </p>
        )}

        <div className="mt-8 flex items-center gap-2.5">
          {isWork && (
            <Button size="lg" variant="secondary" onClick={paused ? store.resumeTimer : store.pauseTimer} className="w-[122px]">
              {paused ? <Play size={17} /> : <Pause size={17} />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
          )}
          {isWork ? (
            <Button size="lg" variant="primary" onClick={() => end()}>
              <Square size={14} />
              Stop
            </Button>
          ) : (
            <>
              {planDone ? (
                <>
                  <Button size="lg" variant="secondary" onClick={store.startNextRound} className="w-[132px]">
                    <Play size={16} />
                    One more
                  </Button>
                  <Button size="lg" variant="primary" onClick={() => end()}>
                    <Check size={15} />
                    Log it and stop
                  </Button>
                </>
              ) : (
                <>
                  <Button size="lg" variant="secondary" onClick={() => end()} className="w-[122px]">
                    <Square size={14} />
                    Stop
                  </Button>
                  <Button size="lg" variant="primary" onClick={store.startNextRound}>
                    <Play size={16} />
                    {isBreak ? 'Back to it' : `Round ${timer.rounds + 1}`}
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        {assignment && (
          <button
            onClick={() => end(true)}
            className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink transition-colors"
          >
            <Check size={14} />
            Finish this assignment
          </button>
        )}
      </div>

      {showNotes && <FocusNotesOverlay timer={timer} course={course} onClose={() => setShowNotes(false)} />}
    </div>,
    document.body,
  )
}

export function Ring({
  pct,
  size,
  stroke,
  color,
  children,
}: {
  pct: number
  size: number
  stroke: number
  color: string
  children?: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0 grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-sunken)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct)))}
          style={{ transition: 'stroke-dashoffset .5s linear' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}
