import { useMemo, useState } from 'react'
import {
  CalendarRange,
  ChevronRight,
  MessageCircleQuestion,
  Check,
  Flame,
  Play,
  Plus,
  Star,
  Timer,
  Zap,
} from 'lucide-react'
import type { Assignment, Course } from '../../lib/types'
import type { Derived } from '../../lib/derive'
import type { Ranked, Verdict } from '../../lib/priority'
import { useStore } from '../../lib/store'
import { addDays, dayKey, daysBetween, fmtCountdown, fmtDayShort, fmtDuration, fmtTime, isSameDay, startOfDay } from '../../lib/date'
import { STREAK_MILESTONES } from '../../lib/stats'
import { colorOf, edgeOf, solidOf } from '../../lib/theme'
import { greet } from '../../lib/copy'
import { splitSummary } from '../../lib/steps'
import type { Surface } from '../../lib/ai/prompt'
import { useAiConfig } from '../../lib/ai/useAiConfig'
import { AiInsight, useAiInsight } from '../ai/AiInsight'
import { Button, Card, Chip, CourseDot, EmptyState, IconButton, Panel } from '../ui'
import { useToast } from '../../lib/toast'
import { cardClick, cx } from '../../lib/ui'
import { DaySchedule } from '../schedule/DaySchedule'
import { SittingCard } from '../schedule/SessionPlan'
import { NudgeCard, NudgeNote } from './NudgeCard'
import { Horizon, WeekAhead } from './Horizon'
import { TaskList, type TaskGroup } from './TaskList'

export interface TodayProps {
  derived: Derived
  now: number
  onOpenTask: (id: string) => void
  onStartFocus: (assignmentId: string | null, courseId: string | null, blockId: string | null, opts?: { minutes?: number; justStart?: boolean }) => void
  onGoPlan: () => void
  onGoProgress: () => void
  onOpenCourse: (id: string) => void
  onOpenBlock: (id: string) => void
  onQuickAdd: () => void
  onAddCourse: () => void
  onAskAi: (intent?: { surface: Surface; request?: string; horizonDays?: number }) => void
}

export function Today(props: TodayProps) {
  const { derived, now, onOpenTask, onStartFocus, onGoPlan, onQuickAdd, onAddCourse, onAskAi } = props
  const aiConfig = useAiConfig()
  const store = useStore()
  const blocks = useStore((s) => s.blocks)
  const courses = useStore((s) => s.courses)
  const settings = useStore((s) => s.settings)
  const assignments = useStore((s) => s.assignments)
  const plannerEvents = useStore((s) => s.plannerEvents)
  const scheduleOverrides = useStore((s) => s.scheduleOverrides)
  const todayList = useStore((s) => s.todayList)
  const { toast } = useToast()

  const todaySet = useMemo(() => new Set(todayList.map((t) => t.assignmentId)), [todayList])

  const todayOrder = useMemo(
    () => new Map(todayList.map((t, i) => [t.assignmentId, i])),
    [todayList],
  )

  const groups = useMemo<TaskGroup[]>(() => {
    const overdue: Ranked[] = []
    const today: Ranked[] = []
    const tomorrow: Ranked[] = []
    const week: Ranked[] = []
    const later: Ranked[] = []
    for (const r of derived.ranked) {
      if (todaySet.has(r.assignment.id) || r.daysUntil === 0) today.push(r)
      else if (r.hoursUntil < 0) overdue.push(r)
      else if (r.daysUntil === 1) tomorrow.push(r)
      else if (r.daysUntil <= 7) week.push(r)
      else later.push(r)
    }

    today.sort(
      (a, b) =>
        (todayOrder.get(a.assignment.id) ?? Number.MAX_SAFE_INTEGER) -
        (todayOrder.get(b.assignment.id) ?? Number.MAX_SAFE_INTEGER),
    )
    return [
      { key: 'overdue', label: 'Overdue', items: overdue, urgent: true },
      { key: 'today', label: 'Today', items: today, ordered: true },
      { key: 'tomorrow', label: 'Tomorrow', items: tomorrow },
      { key: 'week', label: 'This week', items: week },
      { key: 'later', label: 'Later', items: later, collapsed: true },
    ].filter((g) => g.items.length > 0)
  }, [derived.ranked, todaySet, todayOrder])

  const starred = groups
    .find((g) => g.key === 'today')
    ?.items.find((r) => todaySet.has(r.assignment.id))
  const start: Ranked | undefined = starred ?? derived.ranked[0]
  const startStep = start?.assignment.subtasks.find((s) => !s.done)?.title ?? start?.nextStep

  const doneToday = useMemo(
    () =>
      assignments.filter(
        (a) => a.status === 'done' && a.completedAt && daysBetween(a.completedAt, now) === 0,
      ),
    [assignments, now],
  )

  const leadSitting = useMemo(
    () =>
      blocks.find(
        (b) =>
          b.plan?.length &&
          !b.done &&
          +new Date(b.end) > now &&
          (b.id === store.timer?.blockId || +new Date(b.start) - now <= IMMINENT_MIN * 60_000),
      ) ?? null,
    [blocks, now, store.timer?.blockId],
  )

  const ai = useAiInsight(derived, now)
  const covers = ai?.insight.covers
  const alerts = derived.nudges
    .filter((n) => {
      if (n.kind === 'celebrate') return false
      if (!covers) return true
      if (covers.families?.includes(n.id.split(':')[0])) return false
      if (covers.assignmentId && n.subject === covers.assignmentId) return false
      return true
    })

    .slice(0, 2)

  const praise = derived.nudges.find((n) => n.kind === 'celebrate')

  const claimed = new Set(
    alerts.flatMap((n) =>
      n.action?.type === 'start' && n.action.assignmentId ? [n.action.assignmentId] : [],
    ),
  )
  const supersededStart =
    !!start &&
    ((!!leadSitting && leadSitting.assignmentId === start.assignment.id) ||
      claimed.has(start.assignment.id))

  const glance = useMemo(() => {
    const overdue = groups.find((g) => g.key === 'overdue')?.items ?? []
    const today = groups.find((g) => g.key === 'today')?.items ?? []
    const owed = [...overdue, ...today].reduce((n, r) => n + r.remainingMin, 0)
    const left = Math.max(0, derived.todayLoad.capacityMin - derived.studiedTodayMin)
    return [
      ...(overdue.length ? [{ label: 'Overdue', value: String(overdue.length), urgent: true }] : []),
      { label: 'On today', value: String(today.length) },
      { label: 'Work left', value: owed ? fmtDuration(owed) : '—' },
      { label: 'Study time left', value: fmtDuration(left) },
    ]
  }, [groups, derived.todayLoad.capacityMin, derived.studiedTodayMin])

  const dateLine = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const noData = courses.length === 0 && assignments.length === 0 && plannerEvents.length === 0 && blocks.length === 0
  const noTasks = derived.ranked.length === 0

  const renderNudge = (n: Derived['nudges'][number]) => (
    <NudgeCard
      key={n.id}
      nudge={n}
      onAction={(a) => {
        if (a.type === 'start' && a.assignmentId) {
          const t = assignments.find((x) => x.id === a.assignmentId)
          onStartFocus(a.assignmentId, t?.courseId ?? null, null, {
            minutes: a.label.includes('10') ? 10 : undefined,
            justStart: a.label.includes('10'),
          })
        } else if (a.type === 'breakdown' && a.assignmentId) {
          const r = derived.ranked.find((x) => x.assignment.id === a.assignmentId)
          if (aiConfig.available) {
            onAskAi({
              surface: 'breakdown',
              request: `Break down ${r?.assignment.title ?? 'this task'} into steps.`,
              horizonDays: Math.max(2, (r?.daysUntil ?? 7) + 1),
            })
          } else {
            const made = store.applyBreakdown(a.assignmentId, r?.remainingMin ?? 180)
            toast(splitSummary(made.steps, made.blocks, made.replaced), {
              action: { label: 'Undo', run: () => store.undo() },
            })
          }
        } else if (a.type === 'plan') onGoPlan()
        else if (a.type === 'progress') props.onGoProgress()
        else if (a.type === 'course' && a.courseId) props.onOpenCourse(a.courseId)
      }}
      onMute={() => {
        store.muteNudge(n.id)
        toast('Reminder silenced', { action: { label: 'Undo', run: () => store.undo() } })
      }}
    />
  )

  return (
    <div className="px-3 sm:px-6 pb-8 max-w-[1180px] mx-auto w-full">

      <header className="pt-4 sm:pt-6 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[21px] sm:text-[25px] font-semibold tracking-[-0.02em] text-ink leading-tight">
              {greet(new Date(now), derived.todayKey, settings.name)}
            </h1>
            <p className="text-[13px] text-ink-3 mt-0.5">{dateLine}</p>
          </div>

          <div className="flex items-start gap-2.5 shrink-0">
            <div className="hidden sm:flex items-center gap-2">
              <Button variant="primary" onClick={onQuickAdd}>
                <Plus size={16} />
                Add task
              </Button>
            </div>
            <StreakBadge streak={derived.streak} now={now} />
          </div>
        </div>

        <div className="mt-3.5 flex flex-col gap-3">
          <dl className="flex flex-wrap gap-x-6 sm:gap-x-10 gap-y-3">
            {glance.map((g) => (
              <div key={g.label} className="flex flex-col-reverse gap-1.5">
                <dt className={cx('ui-eyebrow', g.urgent && 'ui-eyebrow-flag')}>{g.label}</dt>
                <dd
                  className={cx(
                    'text-[21px] sm:text-[24px] font-semibold tnum leading-none tracking-[-0.02em]',
                    g.urgent ? 'text-[var(--c-critical-ink)]' : 'text-ink',
                  )}
                >
                  {g.value}
                </dd>
              </div>
            ))}
          </dl>
          <DayMeter
            studied={derived.studiedTodayMin}
            capacity={derived.todayLoad.capacityMin}
            planned={derived.todayLoad.plannedMin}
          />
        </div>
      </header>

      {noData ? (
        <Card className="a-rise">
          <EmptyState
            icon={<Plus size={20} />}
            title="Add your courses"
            body="Start with course codes, then add assignments and deadlines."
            action={
              <>
                <Button variant="primary" onClick={onAddCourse}>
                  Add a course
                </Button>
                <Button onClick={() => store.loadSample()}>See it with sample data</Button>
              </>
            }
          />
        </Card>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_318px] xl:grid-cols-[minmax(0,1fr)_348px] gap-y-6 lg:gap-x-6 xl:gap-x-7 items-start">

          <div className="flex flex-col gap-5 min-w-0">

            {(ai || alerts.length > 0) && (
              <div className="flex flex-col gap-2 a-rise" style={rise(0)}>
                {ai && <AiInsight insight={ai.insight} onAsk={onAskAi} onDismiss={ai.dismiss} />}

                {alerts.map((n, i) => (
                  <div key={n.id} className={i > 0 ? 'hidden sm:block' : undefined}>
                    {renderNudge(n)}
                  </div>
                ))}
              </div>
            )}

            {leadSitting && <NextSitting now={now} onStartFocus={onStartFocus} onGoPlan={onGoPlan} />}

            {start && !supersededStart && (
              <StartCard
                r={start}
                now={now}
                starred={!!starred}
                step={startStep}
                focusMin={settings.focusMin}
                canAsk={aiConfig.available}
                onOpen={() => onOpenTask(start.assignment.id)}
                onStart={(minutes) =>
                  onStartFocus(
                    start.assignment.id,
                    start.assignment.courseId,
                    null,
                    minutes ? { minutes, justStart: true } : undefined,
                  )
                }
                onAsk={() => onAskAi({ surface: 'next', horizonDays: 3 })}
              />
            )}

            {!leadSitting && <NextSitting now={now} onStartFocus={onStartFocus} onGoPlan={onGoPlan} />}

            <Horizon
              className="lg:hidden"
              derived={derived}
              now={now}
              onOpenTask={onOpenTask}
              onOpenCourse={props.onOpenCourse}
              onGoPlan={onGoPlan}
            />
            <div className="sm:hidden">
              <Button variant="primary" full onClick={onQuickAdd}>
                <Plus size={16} />
                Add task
              </Button>
            </div>

            {noTasks ? (
              <Card>
                <EmptyState
                  icon={<Check size={20} />}
                  title="Nothing on the list"
                  body={
                    aiConfig.available
                      ? 'Add a deadline yourself, or describe the next few weeks and Nudge can set them up.'
                      : 'No open assignments. Add one when you receive a syllabus or deadline.'
                  }
                  action={
                    <>
                      <Button variant="primary" onClick={onQuickAdd}>
                        <Plus size={16} />
                        Add task
                      </Button>

                      {aiConfig.available && (
                        <Button onClick={() => onAskAi({ surface: 'capture', horizonDays: 21 })}>
                          Describe what’s coming up
                        </Button>
                      )}
                    </>
                  }
                />
              </Card>
            ) : (
              <Panel className="px-3.5 py-3.5 a-rise" style={rise(2)}>
                <TaskList
                  groups={groups}
                  now={now}
                  todaySet={todaySet}
                  onOpenTask={onOpenTask}
                  onStartFocus={(id, courseId) => onStartFocus(id, courseId, null)}
                />
              </Panel>
            )}

            <DayClose
              derived={derived}
              courses={courses}
              doneToday={doneToday}
              praise={praise}
              onReopen={(id) => {
                store.setAssignmentStatus(id, 'doing')
                toast('Task reopened', { action: { label: 'Undo', run: () => store.undo() } })
              }}
              onMutePraise={() => {
                if (!praise) return
                store.muteNudge(praise.id)
                toast('Reminder silenced', { action: { label: 'Undo', run: () => store.undo() } })
              }}
            />
          </div>

          <aside className="flex flex-col gap-4 min-w-0 lg:sticky lg:top-4">
            <Horizon
              className="hidden lg:block a-rise"
              style={rise(1)}
              derived={derived}
              now={now}
              onOpenTask={onOpenTask}
              onOpenCourse={props.onOpenCourse}
              onGoPlan={onGoPlan}
            />

            <DaySchedule
              className="a-rise"
              style={rise(2)}
              courses={courses}
              blocks={blocks}
              assignments={assignments}
              plannerEvents={plannerEvents}
              scheduleOverrides={scheduleOverrides}
              now={now}
              onGoPlan={onGoPlan}
              onStartFocus={(assignmentId, courseId, blockId) => onStartFocus(assignmentId, courseId, blockId)}
              onOpenCourse={props.onOpenCourse}
              onOpenBlock={props.onOpenBlock}
              onToggleDone={(id) => {
                store.toggleBlockDone(id)
                toast('Study block updated', { action: { label: 'Undo', run: () => store.undo() } })
              }}
            />

            <WeekAhead className="a-rise" style={rise(3)} derived={derived} now={now} onGoPlan={onGoPlan} />
          </aside>
        </div>
      )}

    </div>
  )
}

const rise = (i: number) => ({ animationDelay: `${i * 40}ms` })

const IMMINENT_MIN = 60

function NextSitting({
  now,
  onStartFocus,
  onGoPlan,
}: {
  now: number
  onStartFocus: TodayProps['onStartFocus']
  onGoPlan: () => void
}) {
  const blocks = useStore((s) => s.blocks)
  const timer = useStore((s) => s.timer)

  const block = useMemo(() => {
    const today = blocks
      .filter((b) => b.plan?.length && !b.done && isSameDay(b.start, now) && +new Date(b.end) > now)
      .sort((a, b) => +new Date(a.start) - +new Date(b.start))

    return today.find((b) => b.id === timer?.blockId) ?? today[0] ?? null
  }, [blocks, now, timer?.blockId])

  if (!block) return null

  const running = timer?.blockId === block.id
  const startMs = +new Date(block.start)
  const soon = startMs - now <= IMMINENT_MIN * 60_000

  return (
    <SittingCard
      block={block}
      now={now}
      label={running ? 'The sitting you are in' : soon ? 'Your next sitting' : 'Later today'}
      icon={<Timer size={12} className="text-ink-3 shrink-0" />}

      detail={running || soon ? 'full' : 'first'}
    >
      <div className="mt-3 flex items-center gap-2 flex-wrap">

        <Button
          variant={running || soon ? 'primary' : 'secondary'}
          onClick={() => onStartFocus(block.assignmentId, block.courseId, block.id)}
        >
          {running ? <Timer size={15} /> : <Play size={15} />}
          {running ? 'Back to the timer' : soon ? 'Start the sitting' : 'Start it early'}
        </Button>
        {!running && (
          <Button onClick={onGoPlan}>
            <CalendarRange size={14} />
            Move it
          </Button>
        )}
      </div>
    </SittingCard>
  )
}

function DayMeter({
  studied,
  capacity,
  planned,
}: {
  studied: number
  capacity: number

  planned: number
}) {
  if (capacity <= 0) return null
  const pct = (n: number) => Math.min(100, (n / capacity) * 100)
  const met = studied >= capacity
  const label =
    `${fmtDuration(studied)} of ${fmtDuration(capacity)} studied today` +
    (planned > 0 ? `, ${fmtDuration(planned)} blocked out` : '')
  return (
    <div
      className="w-full h-[11px] rounded-full bg-sunken p-[2.5px] shadow-[inset_0_0_0_1px_var(--c-line)]"
      title={label}
      role="img"
      aria-label={label}
    >
      <div className="relative h-full">

        <span
          className="absolute inset-y-0 left-0 rounded-full bg-line-2 transition-[width] duration-700 ease-[var(--ease-out-soft)]"
          style={{ width: `${pct(planned)}%` }}
        />
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-700 ease-[var(--ease-out-soft)]"
          style={{
            width: studied > 0 ? `max(10px, ${pct(studied)}%)` : '0%',
            background: met ? 'var(--c-good)' : 'var(--c-ink)',
          }}
        />
      </div>
    </div>
  )
}

const VERDICT: Partial<Record<Verdict, string>> = {
  overdue: 'Overdue',
  behind: 'Behind',
  tight: 'Tight',
}

function StartCard({
  r,
  now,
  starred,
  step,
  focusMin,
  canAsk,
  onOpen,
  onStart,
  onAsk,
}: {
  r: Ranked
  now: number
  starred: boolean
  step?: string
  focusMin: number
  canAsk: boolean
  onOpen: () => void

  onStart: (minutes?: number) => void
  onAsk: () => void
}) {
  const verdict = VERDICT[r.verdict]
  const steps = r.assignment.subtasks
  const done = steps.filter((s) => s.done).length
  const due =
    !r.assignment.due
      ? 'no deadline'
      : r.hoursUntil < 0
      ? `${fmtCountdown(r.assignment.due, now)} late`
      : r.daysUntil === 0
        ? `due ${fmtTime(r.assignment.due)}`
        : r.daysUntil === 1
          ? 'due tomorrow'
          : r.daysUntil <= 6
            ? `due ${fmtDayShort(r.assignment.due)}`
            : `due in ${r.daysUntil} days`

  return (
    <div
      onClick={cardClick(onOpen)}
      className="@container a-rise rounded-panel border shadow-pop p-4 sm:p-[18px] cursor-pointer"
      style={{
        backgroundColor: solidOf(r.course, 9),
        backgroundImage: `linear-gradient(148deg, ${solidOf(r.course, 16)} 0%, ${solidOf(r.course, 7)} 58%)`,
        borderColor: edgeOf(r.course, 26),
        ...rise(1),
      }}
    >
      <div className="flex flex-col @min-[500px]:flex-row @min-[500px]:items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="ui-eyebrow">
            {starred && <Star size={11} className="text-ink-3" fill="currentColor" />}
            {starred ? 'Starred for today' : 'Suggested start'}
          </p>

          <button type="button" onClick={onOpen} className="text-left mt-1 block max-w-full">
            <span className="text-[19px] sm:text-[21px] font-semibold text-ink leading-[1.25] tracking-[-0.02em] break-words">
              {r.assignment.title}
            </span>
          </button>

          {(step || steps.length > 0) && (
            <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-2 leading-snug min-w-0">
              {steps.length > 0 && (
                <StepPips done={done} total={steps.length} label={`${done} of ${steps.length} steps done`} />
              )}
              <span className="truncate">{step}</span>
            </p>
          )}

          <div className="mt-2 flex items-center gap-x-2.5 gap-y-1 flex-wrap text-[11.5px] text-ink-3 tnum">
            {verdict && (
              <span className="ui-eyebrow ui-eyebrow-flag" title={r.reason}>
                {verdict}
              </span>
            )}
            {r.course && (
              <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
                <CourseDot course={r.course} />
                {r.course.code}
              </span>
            )}
            {!!r.weight && <span>{Math.round(r.weight)}%</span>}
            <span className={cx(r.hoursUntil < 0 && 'text-[var(--c-critical-ink)] font-semibold')}>{due}</span>
            {r.assignment.estimateMin != null ? (
              <span>
                {r.loggedMin > 0
                  ? `${fmtDuration(r.loggedMin)} / ${fmtDuration(r.assignment.estimateMin)}`
                  : `~${fmtDuration(r.assignment.estimateMin)} est`}
              </span>
            ) : r.loggedMin > 0 ? (
              <span>{fmtDuration(r.loggedMin)} logged</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="primary" size="lg" className="flex-1 @min-[500px]:flex-none" onClick={() => onStart(10)}>
            <Zap size={16} />
            Start · 10 min
          </Button>
          <Button size="lg" onClick={() => onStart()} title={`Focus for ${focusMin} minutes`}>
            {focusMin}m
          </Button>
          {canAsk && (
            <IconButton label="Ask what to do now" size="lg" onClick={onAsk} title="Not sure? Ask">
              <MessageCircleQuestion size={17} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  )
}

function StepPips({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-[3px] shrink-0" title={label} role="img" aria-label={label}>
      {Array.from({ length: Math.min(total, 6) }).map((_, i) => (
        <span
          key={i}
          className="h-[4px] w-[9px] rounded-full transition-colors duration-300"
          style={{ background: i < done ? 'var(--c-ink-2)' : 'var(--c-line-2)' }}
        />
      ))}
    </span>
  )
}

function DayClose({
  derived,
  courses,
  doneToday,
  praise,
  onReopen,
  onMutePraise,
}: {
  derived: Derived
  courses: Course[]
  doneToday: Assignment[]
  praise?: Derived['nudges'][number]
  onReopen: (id: string) => void
  onMutePraise: () => void
}) {
  const [open, setOpen] = useState(false)
  const studied = derived.studiedTodayMin
  const capacity = derived.todayLoad.capacityMin

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])

  const split = useMemo(() => {
    const mins = new Map<string, number>()
    for (const s of derived.sessions) {
      if (dayKey(s.start) !== derived.todayKey) continue
      mins.set(s.courseId ?? '', (mins.get(s.courseId ?? '') ?? 0) + s.minutes)
    }
    return [...mins.entries()]
      .map(([id, minutes]) => ({ id, course: courseById.get(id), minutes: Math.round(minutes) }))
      .filter((r) => r.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)
  }, [derived.sessions, derived.todayKey, courseById])

  if (!doneToday.length && !studied && !praise) return null

  const scale = Math.max(capacity, studied, 1)
  const met = capacity > 0 && studied >= capacity

  return (
    <Panel as="section" className="mt-1 p-4 a-rise" style={rise(3)}>
      <div className="flex items-center justify-between gap-3">
        <span className="ui-eyebrow ui-eyebrow-lg">Today so far</span>
        {met && <Chip tone="good">Target met</Chip>}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-7 gap-y-3">
        <div>
          <p
            className={cx(
              'text-[27px] font-semibold leading-none tracking-[-0.02em] tnum',
              studied ? 'text-ink' : 'text-ink-3',
            )}
          >
            {fmtDuration(studied)}
          </p>
          <p className="mt-1.5 text-[12px] text-ink-3">
            studied{capacity > 0 && ` of ${fmtDuration(capacity)}`}
          </p>
        </div>

        {doneToday.length > 0 && (
          <div>
            <p className="text-[27px] font-semibold text-ink leading-none tracking-[-0.02em] tnum">
              {doneToday.length}
            </p>
            <p className="mt-1.5 text-[12px] text-ink-3">
              task{doneToday.length === 1 ? '' : 's'} finished
            </p>
          </div>
        )}
      </div>

      {studied > 0 && (
        <>
          <div
            className="mt-3.5 flex h-2.5 w-full rounded-full bg-sunken overflow-hidden"
            role="img"
            aria-label={`${fmtDuration(studied)} studied of ${fmtDuration(capacity)}${
              split.length ? `: ${split.map((r) => `${r.course?.code ?? 'No course'} ${fmtDuration(r.minutes)}`).join(', ')}` : ''
            }`}
          >
            {split.map((r, i) => (
              <div
                key={r.id}
                className="h-full transition-[width] duration-500"
                style={{
                  width: `${(r.minutes / scale) * 100}%`,
                  background: colorOf(r.course),
                  marginRight: i < split.length - 1 ? 2 : 0,
                }}
              />
            ))}
          </div>

          {split.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
              {split.map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1.5 min-w-0">
                  <span
                    aria-hidden
                    className="h-[7px] w-[7px] rounded-full shrink-0"
                    style={{ background: colorOf(r.course) }}
                  />
                  <span className="text-[12px] text-ink-2 truncate">{r.course?.code ?? 'No course'}</span>
                  <span className="text-[12px] text-ink-3 tnum shrink-0">{fmtDuration(r.minutes)}</span>
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {doneToday.length > 0 && (
        <div className="mt-3.5 pt-3 border-t border-line">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="ui-eyebrow hover:text-ink-2 transition-colors"
          >
            <ChevronRight size={11} className={cx('transition-transform', open && 'rotate-90')} />
            {open ? 'Hide what you finished' : 'See what you finished'}
          </button>

          {open && (
            <div className="mt-1.5 flex flex-col gap-0.5">
              {doneToday.map((a) => {
                const course = a.courseId ? courseById.get(a.courseId) : undefined
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-2.5 -mx-1.5 px-1.5 py-1.5 rounded-xl hover:bg-tint transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onReopen(a.id)}
                      aria-label={`Reopen ${a.title}`}
                      title="Reopen"
                      className="shrink-0 h-[19px] w-[19px] rounded-full bg-invert-bg border-[1.5px] border-invert-bg text-invert-ink grid place-items-center hover:scale-110 transition-transform"
                    >
                      <Check size={12} strokeWidth={3} />
                    </button>
                    <CourseDot course={course} size={13} />
                    <span className="flex-1 text-[13px] text-ink-3 line-through truncate">{a.title}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {praise && (
        <div className="mt-3">
          <NudgeNote nudge={praise} onMute={onMutePraise} />
        </div>
      )}
    </Panel>
  )
}

function StreakBadge({ streak, now }: { streak: Derived['streak']; now: number }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(now), -6 + i))
  const alive = streak.current > 0
  const marked = alive && !streak.atRisk && STREAK_MILESTONES.includes(streak.current)

  return (
    <div className="shrink-0 flex flex-col items-center gap-1.5">
      <div
        className="inline-flex items-center gap-1.5 h-9 px-3 sm:h-10 sm:px-3.5 rounded-full border border-line bg-surface transition-colors"
        title={
          alive
            ? `${streak.current}-day streak${streak.atRisk ? '. Nothing logged today yet' : ''}. Longest: ${streak.longest}.`
            : 'Study 20 minutes to start a streak.'
        }
      >
        <Flame
          size={15}
          className={cx(
            alive
              ? streak.atRisk
                ? 'text-amber-500'
                : 'text-orange-500'
              : 'text-ink-3',
            marked && 'a-cheer',
          )}
          fill={alive ? 'currentColor' : 'none'}
        />
        <span className="text-[13px] font-semibold text-ink tnum">{streak.current}</span>
        <span className="text-[11.5px] text-ink-3 hidden sm:inline">day{streak.current === 1 ? '' : 's'}</span>
      </div>
      <div className="flex items-center gap-[3px]" aria-hidden>
        {days.map((d, i) => {
          const on = streak.last7[i]
          const isToday = isSameDay(d, now)
          return (
            <span
              key={dayKey(d)}
              title={`${d.toLocaleDateString(undefined, { weekday: 'short' })}${on ? ' · studied' : ''}`}
              className={cx(
                'h-[6px] w-[6px] rounded-full transition-colors',
                on
                  ? 'bg-orange-500'
                  : 'bg-line-2',
                isToday && !on && (
                  streak.atRisk
                    ? 'ring-1 ring-amber-500 ring-offset-1 ring-offset-bg bg-amber-500/20'
                    : 'ring-1 ring-ink-3/40 ring-offset-1 ring-offset-bg'
                ),
              )}
            />
          )
        })}
      </div>
    </div>
  )
}
