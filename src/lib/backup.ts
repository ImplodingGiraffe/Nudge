import type { AppState } from './types'

export const BACKUP_EXT = '.nudge'
export const BACKUP_MIME = 'application/x-nudge-backup'
export const BACKUP_ACCEPT = '.nudge,.json,application/json,text/plain'

const MAGIC = 'NUDGE BACKUP'
const FORMAT_VERSION = 1

const WRAP = 76

export type BackupPayload = Pick<
  AppState,
  | 'version'
  | 'courses'
  | 'assignments'
  | 'blocks'
  | 'plannerEvents'
  | 'scheduleOverrides'
  | 'sessions'
   | 'focusNotes'
  | 'todayList'
  | 'settings'
> & {
  noteFolders?: AppState['noteFolders']
}

let crcTable: Uint32Array | null = null

const table = (): Uint32Array => {
  if (crcTable) return crcTable
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  crcTable = t
  return t
}

const crc32 = (bytes: Uint8Array): number => {
  const t = table()
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const toB64Url = (bytes: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64Url = (text: string): Uint8Array => {
  const clean = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const pipe = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream) => {
  const buf = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream as never)).arrayBuffer()
  return new Uint8Array(buf)
}

const gzip = async (bytes: Uint8Array): Promise<Uint8Array | null> => {
  if (typeof CompressionStream === 'undefined') return null
  try {
    return await pipe(bytes, new CompressionStream('gzip'))
  } catch {
    return null
  }
}

const gunzip = async (bytes: Uint8Array): Promise<Uint8Array> => {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser can’t read compressed backups. Try a current Chrome, Safari or Firefox.')
  }
  return pipe(bytes, new DecompressionStream('gzip'))
}

const wrap = (s: string): string => {
  const lines: string[] = []
  for (let i = 0; i < s.length; i += WRAP) lines.push(s.slice(i, i + WRAP))
  return lines.join('\n')
}

export const backupFilename = (at = new Date()): string => {
  const p = (n: number) => `${n}`.padStart(2, '0')
  return `nudge-${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}${BACKUP_EXT}`
}

export const encodeBackup = async (state: BackupPayload): Promise<string> => {
  const raw = new TextEncoder().encode(JSON.stringify(state))
  const sum = crc32(raw).toString(16).padStart(8, '0')
  const packed = await gzip(raw)

  const header = [
    `${MAGIC} v${FORMAT_VERSION}`,
    `alg: ${packed ? 'gzip+b64url' : 'raw+b64url'}`,
    `created: ${new Date().toISOString()}`,
    `counts: courses=${state.courses.length} assignments=${state.assignments.length}` +
      ` blocks=${state.blocks.length} sessions=${state.sessions.length}`,
    `bytes: ${raw.length}`,
    `crc32: ${sum}`,
  ]
  return `${header.join('\n')}\n\n${wrap(toB64Url(packed ?? raw))}\n`
}

export class BackupError extends Error {}

const fail = (msg: string): never => {
  throw new BackupError(msg)
}

const asPayload = (data: unknown): BackupPayload => {
  if (!data || typeof data !== 'object') fail('That file didn’t look like a Nudge backup.')
  const d = data as Partial<BackupPayload>

  const requiredCollections: (keyof BackupPayload)[] = ['courses', 'assignments', 'blocks', 'sessions', 'todayList']
  if (requiredCollections.some((key) => !Array.isArray(d[key]))) {
    fail('That file didn’t look like a complete Nudge backup.')
  }
  for (const key of ['plannerEvents', 'scheduleOverrides'] as const) {
    if (d[key] !== undefined && !Array.isArray(d[key])) fail('That file didn’t look like a complete Nudge backup.')
  }
  if (d.focusNotes !== undefined && !Array.isArray(d.focusNotes)) {
    fail('That file didn’t look like a complete Nudge backup.')
  }
  if (d.noteFolders !== undefined && !Array.isArray(d.noteFolders)) {
    fail('That file didn’t look like a complete Nudge backup.')
  }
  if (d.settings !== undefined && (!d.settings || typeof d.settings !== 'object' || Array.isArray(d.settings))) {
    fail('That file didn’t look like a complete Nudge backup.')
  }
  return d as BackupPayload
}

export const decodeBackup = async (text: string): Promise<BackupPayload> => {
  const body = text.trim()
  if (!body) fail('That file was empty.')

  if (body.startsWith('{')) {
    try {
      return asPayload(JSON.parse(body))
    } catch (e) {
      if (e instanceof BackupError) throw e
      return fail('That file didn’t look like a Nudge backup.')
    }
  }

  if (!body.startsWith(MAGIC)) fail('That doesn’t look like a Nudge backup.')

  const lines = body.split(/\r?\n/)
  const version = Number(/v(\d+)\s*$/.exec(lines[0] ?? '')?.[1])
  if (!Number.isFinite(version)) fail('That backup’s header is damaged.')
  if (version > FORMAT_VERSION) {
    fail('That backup was written by a newer version of Nudge than this one.')
  }

  const blank = lines.findIndex((l, i) => i > 0 && l.trim() === '')
  if (blank < 0) fail('That backup is missing its contents. It may have been cut short.')

  const head: Record<string, string> = {}
  for (const line of lines.slice(1, blank)) {
    const at = line.indexOf(':')
    if (at > 0) head[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }

  const alg = head.alg ?? 'gzip+b64url'
  if (alg !== 'gzip+b64url' && alg !== 'raw+b64url') {
    fail(`That backup uses an encoding this version doesn’t know (${alg}).`)
  }

  const payload = lines.slice(blank + 1).join('')
  if (!payload.trim()) fail('That backup is missing its contents. It may have been cut short.')

  let bytes: Uint8Array
  try {
    bytes = fromB64Url(payload)
  } catch {
    return fail('That backup is damaged. Some of it was lost in transit.')
  }

  let raw: Uint8Array
  try {
    raw = alg === 'gzip+b64url' ? await gunzip(bytes) : bytes
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('This browser')) throw new BackupError(e.message)
    return fail('That backup is damaged and could not be unpacked.')
  }

  const want = head.crc32
  if (want && crc32(raw).toString(16).padStart(8, '0') !== want) {
    fail('That backup is damaged. Its checksum does not match. If you copied it as text, some of it was probably lost.')
  }

  try {
    return asPayload(JSON.parse(new TextDecoder().decode(raw)))
  } catch (e) {
    if (e instanceof BackupError) throw e
    return fail('That backup is damaged and its contents could not be read.')
  }
}

export const isFramed = (): boolean => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

export const downloadFile = (name: string, text: string, mime = BACKUP_MIME): boolean => {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    a.style.display = 'none'

    document.body.appendChild(a)
    a.click()

    setTimeout(() => {
      URL.revokeObjectURL(url)
      a.remove()
    }, 30_000)
    return true
  } catch {
    return false
  }
}

export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

export const fmtBytes = (n: number): string =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} kB` : `${(n / 1024 / 1024).toFixed(1)} MB`
