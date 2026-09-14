import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { Derived } from '../../lib/derive'
import type { NudgeKind } from '../../lib/nudges'
import type { StudyBlock } from '../../lib/types'
import { useStore } from '../../lib/store'
import type { Surface } from '../../lib/ai/prompt'
import { useAiConfig } from '../../lib/ai/useAiConfig'
import { dayKey, fmtDayShort, fmtDuration } from '../../lib/date'
import { Button } from '../ui'
import { NudgeSurface } from '../today/NudgeCard'

export interface Insight {
  id: string

  kind: NudgeKind

  text: string
  action: string
  intent: { surface: Surface; request?: string; horizonDays?: number }

  covers: { families?: string[]; assignmentId?: string }
}

const DISMISS_KEY = 'nudge.ai.insight.dismissed.v1'

const dismissedToday = (id: string) => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const map = JSON.parse(raw) as Record<string, string>
    return map[id] === dayKey(Date.now())
  } catch {
    return false
  }
}

const dismissToday = (id: string) => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    map[id] = dayKey(Date.now())
    localStorage.setItem(DISMISS_KEY, JSON.stringify(map))
  } catch {

  }
}

function detect(derived: Derived, now: number, blocks: StudyBlock[]): Insight | null {
  const overdue = derived.ranked.filter((r) => r.hoursUntil < 0)
  if (overdue.length >= 2) {
    const work = overdue.reduce((s, r) => s + r.remainingMin, 0)
    return {
      id: 'overdue',
      kind: 'urgent',
      text: `${overdue.length} things are past due, with about ${fmtDuration(work)} of work still in them.`,
      action: 'Rebuild the plan',
      intent: { surface: 'recover', horizonDays: 9 },
      covers: { families: ['overdue'] },
    }
  }

  const soon = derived.ranked.filter((r) => r.daysUntil >= 0 && r.daysUntil <= 3 && r.hoursUntil >= 0)
  if (soon.length >= 2) {
    const need = soon.reduce((s, r) => s + r.remainingMin, 0)
    const have = Math.max(...soon.map((r) => r.runwayMin), 0)
    if (need > have * 1.15 && need - have > 45) {
      const last = soon.reduce((a, b) => (a.hoursUntil > b.hoursUntil ? a : b))
      return {
        id: 'crunch',
        kind: 'warn',
        text: `${soon.length} things are due by ${last.assignment.due ? fmtDayShort(last.assignment.due) : 'then'}. They need about ${fmtDuration(need)}, and there's realistically ${fmtDuration(have)} of study time before then.`,
        action: 'Rebalance the week',
        intent: { surface: 'recover', horizonDays: 7 },
        covers: { families: ['crunch'] },
      }
    }
  }

  const bookedFor = new Set(
    blocks.filter((b) => b.assignmentId && +new Date(b.start) > now).map((b) => b.assignmentId as string),
  )
  const unplanned = derived.ranked.find(
    (r) =>
      r.suggestBreakdown &&
      r.daysUntil >= 1 &&
      r.daysUntil <= 6 &&
      r.weight >= 15 &&
      r.pressure >= 0.55 &&
      !bookedFor.has(r.assignment.id),
  )
  if (unplanned) {
    return {
      id: `start-${unplanned.assignment.id}`,
      kind: 'warn',
      text: `${unplanned.assignment.title} is worth ${Math.round(unplanned.weight)}% and needs about ${fmtDuration(unplanned.remainingMin)}, spread over ${unplanned.daysUntil} day${unplanned.daysUntil === 1 ? '' : 's'}.`,
      action: 'Break it up',
      intent: {
        surface: 'breakdown',
        request: `Break down ${unplanned.assignment.title} and schedule the sittings.`,
        horizonDays: unplanned.daysUntil + 1,
      },
      covers: { assignmentId: unplanned.assignment.id },
    }
  }

  const overloaded = derived.loads.slice(0, 5).find((d) => d.overloaded)
  if (overloaded) {
    return {
      id: `overload-${overloaded.day}`,
      kind: 'warn',
      text: `${fmtDayShort(new Date(`${overloaded.day}T12:00:00`))} has ${fmtDuration(overloaded.plannedMin)} booked against a realistic ${fmtDuration(overloaded.capacityMin)}.`,
      action: 'Spread it out',
      intent: { surface: 'plan_week', request: 'Spread out the overloaded day.', horizonDays: 7 },
      covers: { families: ['overload'] },
    }
  }

  return null
}

export const useAiInsight = (derived: Derived, now: number) => {
  const config = useAiConfig()
  const blocks = useStore((s) => s.blocks)
  const [hidden, setHidden] = useState(false)

  const insight = useMemo(() => detect(derived, now, blocks), [derived, now, blocks])

  if (!config.available) return null
  if (!insight || hidden || dismissedToday(insight.id)) return null

  return {
    insight,
    dismiss: () => {
      dismissToday(insight.id)
      setHidden(true)
    },
  }
}

export function AiInsight({
  insight,
  onAsk,
  onDismiss,
}: {
  insight: Insight
  onAsk: (intent: Insight['intent']) => void
  onDismiss: () => void
}) {
  return (
    <div className="group/nudge">
      <NudgeSurface
        kind={insight.kind}
        onMute={onDismiss}
        actions={
          <Button size="sm" onClick={() => onAsk(insight.intent)}>
            <Sparkles size={13} />
            {insight.action}
          </Button>
        }
      >
        <p className="text-[14px] text-ink leading-snug font-medium">{insight.text}</p>
      </NudgeSurface>
    </div>
  )
}
