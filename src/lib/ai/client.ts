import {
  FALLBACK_MODEL,
  PRIMARY_MODEL,
  markVerified,
  readKey,
} from './config'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1'
const VERIFY_TIMEOUT_MS = 10_000

export type AiErrorKind =
  | 'no-key'
  | 'auth'
  | 'rate'
  | 'quota'
  | 'server'
  | 'network'
  | 'timeout'
  | 'blocked'
  | 'malformed'
  | 'request'
  | 'cancelled'

export class AiError extends Error {
  kind: AiErrorKind

  retryable: boolean

  retryAfter?: number

  constructor(kind: AiErrorKind, message: string, opts: { retryable?: boolean; retryAfter?: number } = {}) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
    this.retryable = opts.retryable ?? false
    this.retryAfter = opts.retryAfter
  }
}

export function userMessage(e: unknown): string {
  const kind = e instanceof AiError ? e.kind : 'server'
  switch (kind) {
    case 'no-key':
      return 'Add a Gemini key in Settings to turn this on.'
    case 'auth':
      return 'That key was rejected. Check Settings to make sure it is complete and still active.'
    case 'rate':
      return 'Too many requests just now. Give it a few seconds.'
    case 'quota':
      return 'That key has hit its daily limit. It resets tomorrow.'
    case 'server':
      return 'Gemini is having a moment. Try again shortly.'
    case 'network':
      return 'Couldn’t reach Gemini. Check your connection.'
    case 'timeout':
      return 'That took too long, so I stopped waiting. Try a smaller ask.'
    case 'blocked':
      return 'The safety filter stopped that response. Rephrasing usually clears it.'
    case 'malformed':
      return 'I got an answer I couldn’t trust, so I threw it away rather than act on it.'
    case 'cancelled':
      return 'Stopped.'
    case 'request':
      return 'Something in that request confused Gemini. Nothing was changed.'
    default:
      return 'That didn’t work. Nothing was changed.'
  }
}

interface ApiErrorBody {
  error?: {

    code?: string | number
    message?: string
    status?: string

    details?: {
      reason?: string
      violations?: { quotaId?: string; quotaMetric?: string }[]
    }[]
  }
}

function unwrapError(body: unknown): ApiErrorBody['error'] | undefined {
  const node = Array.isArray(body) ? body[0] : body
  if (!node || typeof node !== 'object') return undefined
  return (node as ApiErrorBody).error
}

function classify(status: number, body: unknown): AiError {
  const err = unwrapError(body)
  const reasons = (err?.details ?? []).map((d) => String(d?.reason ?? '')).join(' ')
  const hay = [err?.code, err?.status, reasons, err?.message].map((x) => String(x ?? '')).join(' ').toLowerCase()

  const badKey = hay.includes('api_key_invalid') || hay.includes('api key not valid')
  if (badKey || status === 401 || status === 403 || hay.includes('authentication') || hay.includes('permission'))
    return new AiError('auth', 'key rejected')

  if (status === 429) {

    const violated = (err?.details ?? [])
      .flatMap((d) => d?.violations ?? [])
      .map((v) => `${v?.quotaId ?? ''} ${v?.quotaMetric ?? ''}`)
      .join(' ')
      .toLowerCase()

    const daily = /per_?day|per_?month|daily/.test(violated) || hay.includes('quota_exceeded')
    return new AiError(daily ? 'quota' : 'rate', 'rate limited', { retryable: !daily })
  }

  if (status === 404) return new AiError('request', 'model not found', { retryable: true })

  if (status >= 500) return new AiError('server', 'upstream error', { retryable: true })

  if (status === 400) {

    return new AiError('request', 'bad request')
  }

  return new AiError('server', `unexpected ${status}`, { retryable: status >= 500 })
}

export interface AiRequest {
  system: string

  input: string
  schema?: object
  maxOutputTokens?: number

  thinkingLevel?: 'low' | 'medium' | 'high'
  signal?: AbortSignal
  timeoutMs?: number
}

export interface AiResult {
  text: string
  model: string

  usedFallback: boolean
  ms: number

  tokens?: { input: number; output: number; thought: number }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(new AiError('cancelled', 'aborted'))
      },
      { once: true },
    )
  })

const MAX_RETRY_AFTER_S = 10

const backoff = (attempt: number) => Math.min(8000, 1000 * 2 ** attempt) * (0.7 + Math.random() * 0.6)

interface Step {
  type?: string
  content?: { type?: string; text?: string }[]
}

function extractText(json: { steps?: Step[]; status?: string }): string {
  const steps = Array.isArray(json.steps) ? json.steps : []
  const out: string[] = []
  for (const step of steps) {
    if (step?.type !== 'model_output') continue
    for (const c of step.content ?? []) {
      if (c?.type === 'text' && typeof c.text === 'string') out.push(c.text)
    }
  }
  return out.join('').trim()
}

async function once(model: string, req: AiRequest, key: string): Promise<AiResult> {
  const started = Date.now()
  const timeout = req.timeoutMs ?? 45_000

  const ctrl = new AbortController()
  const onOuterAbort = () => ctrl.abort()
  req.signal?.addEventListener('abort', onOuterAbort, { once: true })
  const timer = setTimeout(() => ctrl.abort(), timeout)

  try {
    const body: Record<string, unknown> = {
      model,
      input: req.input,
      system_instruction: req.system,

      store: false,
      generation_config: {
        max_output_tokens: req.maxOutputTokens ?? 4096,
        thinking_level: req.thinkingLevel ?? 'low',
      },
    }
    if (req.schema) {
      body.response_format = { type: 'text', mime_type: 'application/json', schema: req.schema }
    }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })

    if (!res.ok) {
      let parsed: unknown = null
      try {
        parsed = await res.json()
      } catch {

      }
      const retryAfter = Number(res.headers.get('retry-after')) || undefined
      const err = classify(res.status, parsed)
      if (retryAfter) err.retryAfter = retryAfter
      throw err
    }

    const json = (await res.json()) as { steps?: Step[]; status?: string; usage?: Record<string, number> }

    if (json.status && json.status !== 'completed') {
      throw new AiError(json.status === 'failed' ? 'server' : 'malformed', `status ${json.status}`, {
        retryable: json.status === 'failed',
      })
    }

    const text = extractText(json)
    if (!text) throw new AiError('blocked', 'empty response')

    return {
      text,
      model,
      usedFallback: model !== PRIMARY_MODEL,
      ms: Date.now() - started,

      tokens: json.usage
        ? {
            input: json.usage.total_input_tokens ?? 0,
            output: json.usage.total_output_tokens ?? 0,
            thought: json.usage.total_thought_tokens ?? 0,
          }
        : undefined,
    }
  } catch (e) {
    if (e instanceof AiError) throw e
    if ((e as Error)?.name === 'AbortError') {

      throw req.signal?.aborted ? new AiError('cancelled', 'aborted') : new AiError('timeout', 'timed out')
    }
    throw new AiError('network', 'fetch failed', { retryable: true })
  } finally {
    clearTimeout(timer)
    req.signal?.removeEventListener('abort', onOuterAbort)
  }
}

export interface AskOptions extends AiRequest {

  onAttempt?: (model: string, attempt: number) => void
}

export async function ask(opts: AskOptions): Promise<AiResult> {
  const key = readKey()
  if (!key) throw new AiError('no-key', 'no key configured')

  const ladder: { model: string; attempts: number }[] = [
    { model: PRIMARY_MODEL, attempts: 3 },
    { model: FALLBACK_MODEL, attempts: 2 },
  ]

  let last: AiError = new AiError('server', 'never ran')

  for (const rung of ladder) {
    for (let attempt = 0; attempt < rung.attempts; attempt++) {
      try {
        opts.onAttempt?.(rung.model, attempt)
        const result = await once(rung.model, opts, key)
        markVerified(key, true)
        return result
      } catch (e) {
        const err = e instanceof AiError ? e : new AiError('server', 'unknown')
        last = err

        if (err.kind === 'cancelled') throw err
        if (err.kind === 'auth') {
          markVerified(key, false)
          throw err
        }

        if (err.kind === 'malformed' || err.kind === 'blocked') throw err

        if (!err.retryable) break

        const isLastAttempt = attempt === rung.attempts - 1

        const wait = err.retryAfter && err.retryAfter <= MAX_RETRY_AFTER_S ? err.retryAfter * 1000 : backoff(attempt)
        if (!isLastAttempt) await sleep(wait, opts.signal)
      }
    }
  }

  throw last
}

export async function verifyKey(key: string, signal?: AbortSignal): Promise<{ ok: true } | { ok: false; error: AiError }> {
  const ctrl = new AbortController()
  let timedOut = false
  const onOuterAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onOuterAbort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, VERIFY_TIMEOUT_MS)

  try {
    const res = await fetch(MODELS_ENDPOINT, {
      method: 'GET',
      headers: { 'x-goog-api-key': key },
      signal: ctrl.signal,
    })
    if (!res.ok) {
      let parsed: unknown = null
      try {
        parsed = await res.json()
      } catch {

      }
      const err = classify(res.status, parsed)
      const keyAccepted = err.kind === 'rate' || err.kind === 'quota'
      markVerified(key, keyAccepted)

      if (keyAccepted) return { ok: true }
      return { ok: false, error: err }
    }
    markVerified(key, true)
    return { ok: true }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      return {
        ok: false,
        error: signal?.aborted
          ? new AiError('cancelled', 'aborted')
          : timedOut
            ? new AiError('timeout', 'verification timed out')
            : new AiError('network', 'request aborted'),
      }
    }
    return { ok: false, error: new AiError('network', 'fetch failed', { retryable: true }) }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onOuterAbort)
  }
}
