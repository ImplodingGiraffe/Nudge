import { useEffect, useRef, useState } from 'react'
import { Check, ExternalLink, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react'
import {
  looksLikeKey,
  maskKey,
  readKey,
  readPrefs,
  writeKey,
  writePrefs,
  type AiPrefs,
} from '../../lib/ai/config'
import { verifyKey } from '../../lib/ai/client'
import { describePayload } from '../../lib/ai/context'
import { useAiConfig } from '../../lib/ai/useAiConfig'
import { Button, Field, Input, Switch } from '../ui'
import { useToast } from '../../lib/toast'
import { cx } from '../../lib/ui'

const CONSOLE_URL = 'https://aistudio.google.com/apikey'

type Phase = 'idle' | 'checking' | 'ok' | 'bad'

export function AiSettings() {
  const config = useAiConfig()
  const { toast } = useToast()
  const stored = readKey()

  const [editing, setEditing] = useState(!stored)
  const [draft, setDraft] = useState('')
  const [reveal, setReveal] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [problem, setProblem] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const prefs = readPrefs()
  const setPref = (patch: Partial<AiPrefs>) => {
    writePrefs(patch)
  }

  const save = async () => {
    if (phase === 'checking') return

    const shape = looksLikeKey(draft)
    if (!shape.ok) {
      setPhase('bad')
      setProblem(shape.hint ?? 'That doesn’t look like a key.')
      return
    }

    setPhase('checking')
    setProblem(null)
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl

    const key = draft.trim()
    const result = await verifyKey(key, ctrl.signal)

    if (result.ok) {
      writeKey(key)
      setPhase('ok')
      setDraft('')
      setEditing(false)
      setReveal(false)
      toast('Nudge can plan for you now')
    } else {
      setPhase('bad')
      setProblem(
        result.error.kind === 'auth'
          ? 'Google refused that key. Check it was copied whole, and that it hasn’t been deleted.'
          : result.error.kind === 'network'
            ? 'Couldn’t reach Google to check it. Check your connection and try again.'
              : result.error.kind === 'timeout'
                ? 'Google took too long to answer. Check your connection and try again.'
                : result.error.kind === 'cancelled'
                  ? 'The check was stopped. Try again.'
            : 'That didn’t work. Try again in a moment.',
      )
    }
  }

  const remove = () => {
    abort.current?.abort()
    writeKey(null)
    setDraft('')
    setPhase('idle')
    setProblem(null)
    setEditing(true)
    toast('Key removed. Nothing more will be sent to Google.')
  }

  const connected = config.status === 'verified'
  const untested = config.status === 'present'

  return (
    <div className="border-t border-line pt-4">
      <h3 className="text-[13px] font-semibold text-ink mb-1">Planning help</h3>
      <p className="text-[12.5px] text-ink-3 leading-relaxed mb-3">
        Nudge can plan your week, break assignments into study sessions, and help you recover a missed plan. It uses
        Google’s Gemini and requires a key from your Google account. Nudge does not run a server (and never will!).
      </p>

      {stored && !editing && (
        <div
          className={cx(
            'flex items-center gap-2.5 rounded-[11px] border px-3 py-2.5 mb-3',
            connected ? 'border-line bg-surface-2' : 'border-[var(--c-warn)] bg-surface-2',
          )}
        >
          {connected ? (
            <ShieldCheck size={16} className="shrink-0 text-[var(--c-good-ink)]" />
          ) : (
            <TriangleAlert size={16} className="shrink-0 text-[var(--c-warn)]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-ink">{connected ? 'Connected' : 'Saved, not yet checked'}</p>
            <p className="text-[11.5px] text-ink-3 tnum truncate">{maskKey(stored)}</p>
          </div>
          <Button size="sm" onClick={() => setEditing(true)} className="shrink-0">
            Replace
          </Button>
          <Button size="sm" variant="danger" onClick={remove} className="shrink-0">
            Remove
          </Button>
        </div>
      )}

      {untested && !editing && (
        <p className="text-[12px] text-ink-3 -mt-1 mb-3">
          This key hasn’t answered a request yet. It will be checked the first time you use it.
        </p>
      )}

      {editing && (
        <div className="flex flex-col gap-2.5 mb-3">
          <Field
            label={stored ? 'New key' : 'Your Gemini key'}
            hint={
              <>
                Free to create at{' '}
                <a
                  href={CONSOLE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-ink-2 inline-flex items-center gap-0.5"
                >
                  Google AI Studio
                  <ExternalLink size={11} />
                </a>
                . It’s stored only in this browser and left out of your Nudge backups.
              </>
            }
          >
            <div className="relative">
              <Input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  if (phase === 'bad') {
                    setPhase('idle')
                    setProblem(null)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save()
                }}

                type={reveal ? 'text' : 'password'}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                name="nudge-planning-key"
                placeholder="AIza… or AQ.…"
                className="pr-10 font-mono text-[13px]"
                aria-invalid={phase === 'bad'}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? 'Hide key' : 'Show key'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded-lg text-ink-3 hover:text-ink hover:bg-tint transition-colors"
              >
                {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>

          {problem && (
            <p className="flex items-start gap-1.5 text-[12px] text-[var(--c-critical-ink)] leading-snug">
              <TriangleAlert size={12.5} className="mt-[2px] shrink-0" />
              {problem}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={save} disabled={!draft.trim() || phase === 'checking'}>
              {phase === 'checking' ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Checking
                </>
              ) : (
                <>
                  <KeyRound size={14} />
                  Save and check
                </>
              )}
            </Button>
            {stored && (
              <Button
                onClick={() => {
                  setEditing(false)
                  setDraft('')
                  setPhase('idle')
                  setProblem(null)
                }}
              >
                Cancel
              </Button>
            )}
            {phase === 'ok' && (
              <span className="flex items-center gap-1 text-[12.5px] text-[var(--c-good-ink)]">
                <Check size={14} />
                Working
              </span>
            )}
          </div>
        </div>
      )}

      {stored && (
        <>
          <details className="group mb-3">
            <summary className="cursor-pointer list-none text-[12.5px] font-medium text-ink-2 hover:text-ink transition-colors">
              What Nudge sends to Google
            </summary>
            <ul className="mt-2 flex flex-col gap-1 pl-1">
              {describePayload().map((line) => (
                <li key={line} className="text-[12px] text-ink-3 leading-snug">
                  · {line}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-ink-3 leading-snug">
              Requests use Google’s no-storage setting. Nudge sends data only when you make a request.
            </p>
          </details>

          <div className="flex flex-col gap-3">
            <Row
              label="Planning help"
              hint="Off keeps your key but disables Nudge AI."
              checked={prefs.enabled}
              onChange={(v) => setPref({ enabled: v })}
            />
          </div>
          <p className="mt-3 text-[11.5px] text-ink-3 leading-snug">
            To keep a task out of planning help, open it and turn on <span className="text-ink-2">Keep this private</span>.
            Nudge will still reserve its scheduled time.
          </p>
        </>
      )}

      {!stored && !editing && (
        <Button size="sm" onClick={() => setEditing(true)}>
          <KeyRound size={14} />
          Add a key
        </Button>
      )}
    </div>
  )
}

function Row({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] text-ink">{label}</p>
        <p className="text-[11.5px] text-ink-3 leading-snug">{hint}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}
