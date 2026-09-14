import { useMemo } from 'react'
import { ArrowRight, CalendarRange, Check, ListChecks, Play, Timer, Undo2 } from 'lucide-react'
import type { Created } from '../../lib/ai/apply'
import type { Proposal } from '../../lib/ai/validate'
import type { Assignment, Course, StudyBlock } from '../../lib/types'
import { useStore } from '../../lib/store'
import { useCommandHost } from '../../lib/ai/commandHost'
import { dayWord } from '../../lib/sessionPlan'
import { fmtDay, fmtDuration, isSameDay } from '../../lib/date'
import { edgeOf, solidOf } from '../../lib/theme'
import { SittingCard } from '../schedule/SessionPlan'
import { Button } from '../ui'

export interface Handoff {

  applied: Proposal[]
  created: Created[]

  onUndo: () => void
}

const IMMINENT_MIN = 20

function Frame({
  course,
  label,
  children,
}: {
  course?: Course | null
  label: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-[12px] border p-3 a-rise"
      style={{ background: solidOf(course, 12), borderColor: edgeOf(course, 28) }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <LandedTick />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-2">{label}</span>
      </div>
      {children}
    </div>
  )
}

function LandedTick() {
  return (
    <span
      aria-hidden
      className="h-[15px] w-[15px] rounded-full bg-invert-bg text-invert-ink grid place-items-center shrink-0"
    >
      <Check size={10} strokeWidth={3} />
    </span>
  )
}

function Actions({
  children,
  onUndo,
  note,
}: {
  children: React.ReactNode
  onUndo?: () => void
  note?: string
}) {
  return (
    <>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {children}
        {onUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="ml-auto inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink transition-colors"
          >
            <Undo2 size={12} />
            Undo
          </button>
        )}
      </div>
      {note && <p className="mt-2 text-[11.5px] text-ink-3 leading-snug">{note}</p>}
    </>
  )
}

function SittingNext({
  block,
  now,
  onUndo,
  onLeave,
  extra,
}: {
  block: StudyBlock
  now: number
  onUndo: () => void
  onLeave?: () => void
  extra?: string
}) {
  const host = useCommandHost()
  const assignments = useStore((s) => s.assignments)
  const timer = useStore((s) => s.timer)

  const task = assignments.find((a) => a.id === block.assignmentId) ?? null
  const startMs = +new Date(block.start)
  const endMs = +new Date(block.end)
  const minutes = Math.round((endMs - startMs) / 60_000)
  const plan = block.plan ?? []

  const mode: 'running' | 'now' | 'later-today' | 'missed' | 'another-day' =
    timer?.blockId === block.id
      ? 'running'
      : endMs < now
        ? 'missed'
        : startMs - now <= IMMINENT_MIN * 60_000
          ? 'now'
          : isSameDay(startMs, now)
            ? 'later-today'
            : 'another-day'

  const start = () => {
    host?.startFocus(task?.id ?? null, minutes, block.id)
    host?.setFocusExpanded(true)
    onLeave?.()
  }

  const show = () => {
    host?.showBlock(block.id)
    onLeave?.()
  }

  const walks = plan.length > 1 ? `the timer walks all ${plan.length} stretches` : null
  const note =
    mode === 'running'
      ? undefined
      : mode === 'another-day'
        ? `Nothing to do now. It'll be waiting ${dayWord(startMs, now).toLowerCase()}${walks ? `, and ${walks} for you` : ''}.`
        : mode === 'missed'
          ? 'That time has passed. Start now or move the block.'
          : walks
            ? `Once you start, ${walks}.`
            : extra

  return (
    <SittingCard
      block={block}
      now={now}
      label={mode === 'running' ? 'Running now' : mode === 'missed' ? 'That time has passed' : 'On your calendar'}
      icon={<LandedTick />}
      note={note}
    >
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {mode === 'running' ? (
          <Button
            variant="primary"
            onClick={() => {
              host?.setFocusExpanded(true)
              onLeave?.()
            }}
          >
            <Timer size={15} />
            Open the timer
          </Button>
        ) : mode === 'now' ? (
          <Button variant="primary" onClick={start}>
            <Play size={15} />
            {plan.length ? 'Start the sitting' : 'Start now'}
          </Button>
        ) : (
          <Button variant="primary" onClick={show}>
            <CalendarRange size={15} />
            See it on the plan
          </Button>
        )}

        {mode === 'now' && <Button onClick={show}>See it on the plan</Button>}
        {(mode === 'later-today' || mode === 'missed') && (
          <Button onClick={start}>
            <Play size={14} />
            {mode === 'missed' ? 'Start it now' : 'Start it early'}
          </Button>
        )}

        {mode !== 'running' && (
          <button
            type="button"
            onClick={onUndo}
            className="ml-auto inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink transition-colors"
          >
            <Undo2 size={12} />
            Undo
          </button>
        )}
      </div>
    </SittingCard>
  )
}

function StepsNext({
  task,
  onUndo,
  onLeave,
  extra,
}: {
  task: Assignment
  onUndo: () => void
  onLeave?: () => void
  extra?: string
}) {
  const host = useCommandHost()
  const courses = useStore((s) => s.courses)
  const course = courses.find((c) => c.id === task.courseId) ?? null
  const open = task.subtasks.filter((s) => !s.done)
  const first = open[0]

  return (
    <Frame course={course} label={`Broken into ${task.subtasks.length} steps`}>
      <span className="text-[14.5px] font-semibold text-ink leading-snug">{task.title}</span>
      {first && (
        <p className="mt-1.5 text-[13px] text-ink leading-snug">
          <span className="text-ink-3">First step · </span>
          {first.title}
          {first.estimateMin ? <span className="text-ink-3"> · {fmtDuration(first.estimateMin)}</span> : null}
        </p>
      )}
      <Actions onUndo={onUndo} note={extra ?? 'Mark a step complete to update the estimate.'}>
        <Button
          variant="primary"
          onClick={() => {
            host?.startFocus(task.id, first?.estimateMin, null, first?.title)
            host?.setFocusExpanded(true)
            onLeave?.()
          }}
        >
          <Play size={15} />
          {first ? `Start the first step` : 'Start on it'}
        </Button>
        <Button
          onClick={() => {
            host?.openTask(task.id)
            onLeave?.()
          }}
        >
          <ListChecks size={14} />
          See the steps
        </Button>
      </Actions>
    </Frame>
  )
}

function PlainNext({
  label,
  line,
  onUndo,
  onLeave,
  action,
}: {
  label: string
  line: string
  onUndo: () => void
  onLeave?: () => void
  action?: { label: string; run: (host: ReturnType<typeof useCommandHost>) => void; icon?: React.ReactNode }
}) {
  const host = useCommandHost()
  return (
    <Frame label={label}>
      <p className="text-[13.5px] text-ink leading-snug">{line}</p>
      <Actions onUndo={onUndo}>
        {action && (
          <Button
            variant="primary"
            onClick={() => {
              action.run(host)
              onLeave?.()
            }}
          >
            {action.icon}
            {action.label}
          </Button>
        )}
      </Actions>
    </Frame>
  )
}

type Lead =
  | { kind: 'block'; block: StudyBlock; others: number }
  | { kind: 'steps'; task: Assignment; others: number }
  | { kind: 'tasks'; tasks: Assignment[]; others: number }
  | { kind: 'today'; task: Assignment; others: number }

function pickLead(
  applied: Proposal[],
  created: Created[],
  blocks: StudyBlock[],
  assignments: Assignment[],
): Lead | null {
  const bornBlocks = created
    .map((c) => (c.blockId ? blocks.find((b) => b.id === c.blockId) : undefined))
    .filter((b): b is StudyBlock => !!b)

    .sort((a, b) => +new Date(a.start) - +new Date(b.start))

  const sittings = bornBlocks.filter((b) => b.plan?.length)
  const block = sittings[0] ?? bornBlocks[0]
  if (block) return { kind: 'block', block, others: applied.length - 1 }

  const moved = applied.find((p) => p.type === 'move_block')
  if (moved && moved.type === 'move_block') {
    const b = blocks.find((x) => x.id === moved.blockId)
    if (b) return { kind: 'block', block: b, others: applied.length - 1 }
  }

  const split = applied.find((p) => p.type === 'split_task')
  if (split && split.type === 'split_task') {
    const task = assignments.find((a) => a.id === split.taskId)
    if (task?.subtasks.length) return { kind: 'steps', task, others: applied.length - 1 }
  }

  const madeTasks = created
    .map((c) => (c.taskId ? assignments.find((a) => a.id === c.taskId) : undefined))
    .filter((a): a is Assignment => !!a)
  if (madeTasks.length) return { kind: 'tasks', tasks: madeTasks, others: applied.length - madeTasks.length }

  const starred = applied.find((p) => p.type === 'focus_today')
  if (starred && starred.type === 'focus_today') {
    const task = assignments.find((a) => a.id === starred.taskId)
    if (task) return { kind: 'today', task, others: applied.length - 1 }
  }

  return null
}

export const hasNextStep = (applied: Proposal[], created: Created[]): boolean => {
  const s = useStore.getState()
  return pickLead(applied, created, s.blocks, s.assignments) != null
}

export function NextStep({
  handoff,
  now,
  onLeave,
}: {
  handoff: Handoff
  now: number

  onLeave?: () => void
}) {
  const blocks = useStore((s) => s.blocks)
  const assignments = useStore((s) => s.assignments)
  const { applied, created, onUndo } = handoff

  const lead = useMemo(
    () => pickLead(applied, created, blocks, assignments),
    [applied, created, blocks, assignments],
  )

  if (!lead) return null

  const more =
    lead.others > 0 ? `${lead.others} other change${lead.others === 1 ? '' : 's'} applied too.` : undefined

  if (lead.kind === 'block')
    return <SittingNext block={lead.block} now={now} onUndo={onUndo} onLeave={onLeave} extra={more} />

  if (lead.kind === 'steps')
    return <StepsNext task={lead.task} onUndo={onUndo} onLeave={onLeave} extra={more} />

  if (lead.kind === 'tasks') {
    const one = lead.tasks.length === 1 ? lead.tasks[0] : null
    return (
      <PlainNext
        label={one ? 'Added to your list' : `${lead.tasks.length} tasks added`}
        line={
          one
             ? `${one.title}${one.due ? `, due ${fmtDay(one.due)}.` : ', no deadline.'}`
            : `${lead.tasks.map((t) => t.title).slice(0, 3).join(', ')}${lead.tasks.length > 3 ? '…' : ''}`
        }
        onUndo={onUndo}
        onLeave={onLeave}
        action={
          one
            ? { label: 'Open it', icon: <ArrowRight size={14} />, run: (h) => h?.openTask(one.id) }
            : { label: 'See them on Today', icon: <ArrowRight size={14} />, run: (h) => h?.go('today') }
        }
      />
    )
  }

  return (
    <PlainNext
      label="On today's list"
      line={`${lead.task.title} is starred for today.`}
      onUndo={onUndo}
      onLeave={onLeave}
      action={{ label: 'Open Today', icon: <ArrowRight size={14} />, run: (h) => h?.go('today') }}
    />
  )
}
