import type { ReactNode } from 'react'
import { Award, BellOff, EyeOff, Hourglass, Info, ListChecks, TriangleAlert } from 'lucide-react'
import type { Nudge, NudgeKind } from '../../lib/nudges'
import { Button } from '../ui'
import { cx } from '../../lib/ui'

const LOOK: Record<NudgeKind, { icon: typeof Info; label: string; alarm?: true }> = {
  urgent: { icon: TriangleAlert, label: 'Urgent', alarm: true },
  warn: { icon: Hourglass, label: 'Heads up' },

  tease: { icon: EyeOff, label: 'Noticed' },
  celebrate: { icon: Award, label: 'Well done' },
  plan: { icon: ListChecks, label: 'Suggestion' },
  info: { icon: Info, label: 'Note' },
}

const mix = (hue: string, pct: number) => `color-mix(in srgb, ${hue} ${pct}%, var(--c-surface))`

export function NudgeSurface({
  kind,
  label,
  actions,
  onMute,
  muteLabel = 'Not now',
  children,
}: {
  kind: NudgeKind

  label?: string

  actions?: ReactNode
  onMute?: () => void
  muteLabel?: string
  children: ReactNode
}) {
  const look = LOOK[kind]
  const Icon = look.icon
  const word = label ?? look.label

  return (
    <div
      className={cx('a-rise rounded-panel border px-3.5 py-3', !look.alarm && 'bg-surface border-line')}
      style={
        look.alarm
          ? { background: mix('var(--c-critical)', 7), borderColor: mix('var(--c-critical)', 24) }
          : undefined
      }
    >
      <div className="flex items-start gap-2.5">

        <span
          title={word}
          className={cx('mt-[2px] shrink-0', look.alarm ? 'text-[var(--c-critical-ink)]' : 'text-ink-3')}
        >
          <Icon size={15} strokeWidth={2.1} aria-hidden />
          <span className="sr-only">{word}:</span>
        </span>

        <div className="min-w-0 flex-1 flex items-start justify-between gap-x-3 gap-y-2 flex-wrap">
          <div className="min-w-[15rem] flex-1">{children}</div>
          {actions && <div className="shrink-0 flex items-center gap-1.5">{actions}</div>}
        </div>

        {onMute && (
          <button
            type="button"
            aria-label={muteLabel}
            title={muteLabel}
            onClick={onMute}
            className={cx(
              'shrink-0 -mr-1 -mt-0.5 h-7 w-7 grid place-items-center rounded-lg',
              'text-ink-3 opacity-0 group-hover/nudge:opacity-60 hover:!opacity-100 focus-visible:opacity-100',
              'hover:text-ink hover:bg-tint transition-[opacity,color,background-color]',
            )}
          >
            <BellOff size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export function NudgeCard({
  nudge,
  onAction,
  onMute,
}: {
  nudge: Nudge
  onAction: (a: NonNullable<Nudge['action']>) => void
  onMute: () => void
}) {
  return (
    <div className="group/nudge">
      <NudgeSurface
        kind={nudge.kind}
        onMute={onMute}
        actions={
          (nudge.action || nudge.secondary) && (
            <>

              {nudge.action && (
                <Button size="sm" onClick={() => onAction(nudge.action!)}>
                  {nudge.action.label}
                </Button>
              )}
              {nudge.secondary && (
                <Button size="sm" variant="ghost" onClick={() => onAction(nudge.secondary!)}>
                  {nudge.secondary.label}
                </Button>
              )}
            </>
          )
        }
      >
        <p className="text-[14px] text-ink leading-snug font-medium">{nudge.text}</p>

        {nudge.detail && (
          <p className="text-[11.5px] text-ink-3 mt-1 leading-snug truncate" title={nudge.detail}>
            {nudge.detail}
          </p>
        )}
      </NudgeSurface>
    </div>
  )
}

export function NudgeNote({ nudge, onMute }: { nudge: Nudge; onMute: () => void }) {
  return (
    <div className="group inline-flex max-w-full items-center gap-2">
      <Award size={12} className="shrink-0 text-ink-3" aria-hidden />
      <span className="min-w-0 text-[11.5px] text-ink-2 leading-snug">{nudge.text}</span>
      <button
        type="button"
        aria-label="Not now"
        title="Not now"
        onClick={onMute}
        className="shrink-0 h-5 w-5 grid place-items-center rounded-full text-ink-3 opacity-0 group-hover:opacity-60 hover:!opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        <BellOff size={11} />
      </button>
    </div>
  )
}
