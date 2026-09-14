import { useState } from 'react'
import type { Derived } from '../../lib/derive'
import type { Surface } from '../../lib/ai/prompt'
import { useAI } from '../../lib/ai/useAI'
import { Button } from '../ui'
import { cx } from '../../lib/ui'
import { AiResult, Failure, Working } from './AiResult'

export function InlineAi({
  derived,
  now,
  surface,
  focusAssignmentId,
  hint,
  request,
  horizonDays,
  label,
  icon,

  onApplied,
  className,
  variant = 'quiet',
  size = 'xs',
}: {
  derived: Derived
  now: number
  surface: Surface
  focusAssignmentId?: string | null
  hint?: string
  request?: string
  horizonDays?: number
  label: string
  icon?: React.ReactNode
  onApplied?: () => void
  className?: string
  variant?: 'quiet' | 'secondary' | 'primary'
  size?: 'xs' | 'sm' | 'md'
}) {
  const ai = useAI(derived, now)
  const [open, setOpen] = useState(false)

  const go = () => {
    setOpen(true)
    void ai.run({ surface, request, hint, focusAssignmentId, horizonDays })
  }

  if (!ai.available) return null

  if (!open) {
    return (
      <Button size={size} variant={variant} onClick={go} className={className}>
        {icon}
        {label}
      </Button>
    )
  }

  return (
    <div className={cx('rounded-[12px] border border-line bg-surface-2 p-3', className)}>
      {ai.status === 'thinking' && <Working surface={surface} onCancel={ai.cancel} />}

      {ai.status === 'error' && ai.error && <Failure message={ai.error} onRetry={go} />}

      {ai.reply && ai.status !== 'thinking' && (
        <AiResult
          reply={ai.reply}
          ai={ai}
          surface={surface}
          compact
          onApplied={() => {
            setOpen(false)
            ai.reset()
            onApplied?.()
          }}
        />
      )}

      {ai.status !== 'thinking' && (
        <button
          type="button"
          onClick={() => {
            ai.cancel()
            ai.reset()
            setOpen(false)
          }}
          className="mt-2 text-[12px] text-ink-3 hover:text-ink transition-colors"
        >
          Close
        </button>
      )}
    </div>
  )
}
