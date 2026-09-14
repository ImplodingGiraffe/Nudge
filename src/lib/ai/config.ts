const KEY_STORAGE = 'nudge.ai.key.v1'
const PREFS_STORAGE = 'nudge.ai.prefs.v1'
export const MODEL_STORAGE = 'nudge.ai.model.v1'

export const PRIMARY_MODEL = 'gemini-3.8-flash'

export const FALLBACK_MODEL = 'gemini-3.5-flash-lite'

export const AVAILABLE_GEMINI_MODELS = [
  { label: 'Gemini 3.8 Flash (Primary)', value: 'google/gemini-3.8-flash' },
  { label: 'Gemini 3.5 Flash Lite (Fast & Lightweight)', value: 'google/gemini-3.5-flash-lite' },
] as const

export function readModel(): string {
  try {
    const v = localStorage.getItem(MODEL_STORAGE)
    return v && v.trim() ? v.trim() : PRIMARY_MODEL
  } catch {
    return PRIMARY_MODEL
  }
}

export function writeModel(model: string | null) {
  try {
    if (model && model.trim()) localStorage.setItem(MODEL_STORAGE, model.trim())
    else localStorage.removeItem(MODEL_STORAGE)
  } catch {}
  notify()
}

export interface AiPrefs {

  enabled: boolean
}

export const DEFAULT_PREFS: AiPrefs = {
  enabled: true,
}

export function readKey(): string | null {
  try {
    const v = localStorage.getItem(KEY_STORAGE)
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

export function writeKey(key: string | null) {
  try {
    if (key && key.trim()) localStorage.setItem(KEY_STORAGE, key.trim())
    else localStorage.removeItem(KEY_STORAGE)
  } catch {

  }
  notify()
}

export function readPrefs(): AiPrefs {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<AiPrefs>
    return { ...DEFAULT_PREFS, ...parsed }
  } catch {
    return DEFAULT_PREFS
  }
}

export function writePrefs(patch: Partial<AiPrefs>) {
  const next = { ...readPrefs(), ...patch }
  try {
    localStorage.setItem(PREFS_STORAGE, JSON.stringify(next))
  } catch {

  }
  notify()
  return next
}

type Listener = () => void
const listeners = new Set<Listener>()
let version = 0

function notify() {
  version++
  listeners.forEach((l) => l())
}

export function subscribeConfig(l: Listener) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const configVersion = () => version

export type KeyStatus = 'absent' | 'present' | 'verified' | 'rejected'

const VERIFIED_STORAGE = 'nudge.ai.verified.v1'
const GOOGLE_KEY_PREFIXES = ['AIza', 'AQ.'] as const

const fingerprint = (key: string) => {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export function markVerified(key: string, ok: boolean) {
  try {
    if (ok) localStorage.setItem(VERIFIED_STORAGE, fingerprint(key))
    else localStorage.removeItem(VERIFIED_STORAGE)
  } catch {

  }
  notify()
}

export function keyStatus(): KeyStatus {
  const key = readKey()
  if (!key) return 'absent'
  try {
    return localStorage.getItem(VERIFIED_STORAGE) === fingerprint(key) ? 'verified' : 'present'
  } catch {
    return 'present'
  }
}

export const aiAvailable = () => readPrefs().enabled && !!readKey()

export function maskKey(key: string): string {
  if (key.length <= 12) return '••••••••'
  return `${key.slice(0, 4)}${'•'.repeat(8)}${key.slice(-4)}`
}

export function looksLikeKey(raw: string): { ok: boolean; hint?: string } {
  const key = raw.trim()
  if (!key) return { ok: false, hint: 'Paste your key to continue.' }
  if (/\s/.test(key)) return { ok: false, hint: 'That key contains a space. Keys are one unbroken string.' }
  if (key.length < 30) return { ok: false, hint: 'That looks too short to be a full key.' }
  if (!GOOGLE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)))
    return { ok: false, hint: 'Google API keys start with “AIza” or “AQ.”. This might be a project ID or an OAuth token.' }
  return { ok: true }
}
