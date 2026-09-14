import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarOff,
  CalendarPlus,
  CalendarRange,
  GraduationCap,
  Info,
  Maximize2,
  Minimize2,
  Plus,
  Sparkles,
} from 'lucide-react'
import { useStore } from '../../lib/store'
import type { Derived } from '../../lib/derive'
import type { PlannerEvent, ScheduleOverride } from '../../lib/types'
import type { ClassOccurrence } from '../../lib/meetings'
import { addDays, dayKey, fmtDay, fmtDayShort, fmtDuration, fmtTime, isSameDay, startOfDay, startOfWeek } from '../../lib/date'
import { autoSchedule } from '../../lib/autoSchedule'
import { washOf } from '../../lib/theme'
import { WeekGrid } from './WeekGrid'
import { BlockSheet } from './BlockSheet'
import { DayExceptionSheet } from './DayExceptionSheet'
import { Button, Card, CourseDot, EmptyState, PeriodNavigator, Segmented } from '../ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '../../lib/toast'
import { cx } from '../../lib/ui'
import { useIsMobile } from '../../lib/hooks'
import type { Surface } from '../../lib/ai/prompt'
import { useAiConfig } from '../../lib/ai/useAiConfig'

export type PlanViewMode = 'week' | 'workweek' | '3day' | 'day'
export type PlanDensity = 'fit' | 'spacious'

export function Plan({
  derived,
  now,
  onStartFocus,
  onAddCourse,
  onEditCourse,
  onAskAi,
  weekOffset,
  setWeekOffset,
  showClasses,
  setShowClasses,
  fillSignal,
  focusBlock,
  onFocusHandled,
}: {
  derived: Derived
  now: number
  onStartFocus: (assignmentId: string | null, courseId: string | null, blockId: string | null) => void
  onAddCourse: () => void
  onEditCourse: (courseId: string) => void
  onAskAi: (intent?: { surface: Surface; request?: string; horizonDays?: number }) => void
  weekOffset: number
  setWeekOffset: (fn: (n: number) => number) => void
  showClasses: boolean
  setShowClasses: (fn: (v: boolean) => boolean) => void
  fillSignal: number
  focusBlock?: { id: string; nonce: number } | null
  onFocusHandled?: () => void
}) {
  const courses = useStore((s) => s.courses)
  const assignments = useStore((s) => s.assignments)
  const blocks = useStore((s) => s.blocks)
  const plannerEvents = useStore((s) => s.plannerEvents)
  const scheduleOverrides = useStore((s) => s.scheduleOverrides)
  const settings = useStore((s) => s.settings)
  const store = useStore()
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const aiConfig = useAiConfig()

  const [viewMode, setViewMode] = useState<PlanViewMode>(isMobile ? '3day' : 'week')
  const [density, setDensity] = useState<PlanDensity>('spacious')
  const [armed, setArmed] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [dayException, setDayException] = useState<{
    date: string
    initialType?: 'holiday' | 'break' | 'override' | 'exam'
    event?: PlannerEvent | null
    override?: ScheduleOverride | null
  } | null>(null)

  const baseWeekStart = useMemo(() => addDays(startOfWeek(now), weekOffset * 7), [now, weekOffset])

  const days = useMemo(() => {
    if (viewMode === 'day') {
      return [addDays(startOfDay(now), weekOffset)]
    }
    if (viewMode === '3day') {
      const start = addDays(startOfDay(now), weekOffset * 3)
      return Array.from({ length: 3 }, (_, i) => addDays(start, i))
    }
    if (viewMode === 'workweek') {
      const mon = startOfWeek(baseWeekStart)
      return Array.from({ length: 5 }, (_, i) => addDays(mon, i))
    }
    const mon = startOfWeek(baseWeekStart)
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  }, [baseWeekStart, weekOffset, now, viewMode])

  const visibleDays = isMobile ? Math.min(3, days.length) : days.length

  const weekBlocks = useMemo(() => {
    if (!days.length) return []
    const from = +days[0]
    const to = +addDays(days[days.length - 1], 1)
    return blocks.filter((b) => {
      const t = +new Date(b.start)
      return t >= from && t < to
    })
  }, [blocks, days])

  const undoable = useCallback(
    (label: string) => toast(label, { action: { label: 'Undo', run: () => store.undo() } }),
    [store, toast],
  )

  const handleMove = useCallback(
    (id: string, startMs: number, endMs: number, duplicate: boolean) => {
      if (duplicate) {
        const src = blocks.find((b) => b.id === id)
        if (!src) return
        const copy = store.addBlock({
          kind: src.kind,
          courseId: src.courseId,
          assignmentId: src.assignmentId,
          title: src.title,
          location: src.location,
          start: new Date(startMs).toISOString(),
          end: new Date(endMs).toISOString(),
        })
        setSelected(copy.id)
        undoable('Block duplicated')
      } else {
        store.moveBlock(id, startMs, endMs)
        undoable('Block moved')
      }
    },
    [blocks, store, undoable],
  )

  const handleMovePlannerEvent = useCallback(
    (id: string, startMs: number, endMs: number) => {
      store.updatePlannerEvent(id, {
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
      })
      undoable('Schedule item moved')
    },
    [store, undoable],
  )

  const handleMoveClass = useCallback(
    (occurrence: ClassOccurrence, startMs: number, endMs: number) => {
      store.addBlock({
        kind: 'one_off_class',
        courseId: occurrence.course.id,
        title: occurrence.course.code,
        courseCode: occurrence.course.code,
        location: occurrence.place?.raw || occurrence.course.room,
        sourceMeetingId: occurrence.meeting.id,
        sourceDate: dayKey(occurrence.start),
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
      })
      undoable('Class time moved')
      toast(`${occurrence.course.code} moved for this block only. For a permanent schedule change, use Courses → Edit.`, {
        action: { label: 'Courses → Edit', run: () => onEditCourse(occurrence.course.id) },
        duration: 7000,
      })
    },
    [onEditCourse, store, toast, undoable],
  )

  const handleCreate = useCallback(
    (startMs: number, endMs: number) => {
      const armedTask = armed ? assignments.find((a) => a.id === armed) : null
      const fallback = derived.ranked[0]
      const target = armedTask ?? fallback?.assignment ?? null
      const newBlock = store.addBlock({
        kind: 'study',
        assignmentId: target?.id ?? null,
        courseId: target?.courseId ?? null,
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
      })
      setSelected(newBlock.id)
      setArmed(null)
      undoable('Study block created')
    },
    [armed, assignments, derived.ranked, store, undoable],
  )

  const handleNudge = useCallback(
    (id: string, deltaMin: number, resize: boolean) => {
      const b = blocks.find((x) => x.id === id)
      if (!b) return
      const s = +new Date(b.start)
      const e = +new Date(b.end)
      if (resize) store.moveBlock(id, s, Math.max(s + 15 * 60000, e + deltaMin * 60000))
      else store.moveBlock(id, s + deltaMin * 60000, e + deltaMin * 60000)
      undoable(resize ? 'Block resized' : 'Block moved')
    },
    [blocks, store, undoable],
  )

  const handleDelete = useCallback(
    (id: string) => {
      store.removeBlock(id)
      setSelected(null)
      undoable('Block deleted')
    },
    [store, undoable],
  )

  const fillWeek = useCallback(() => {
    if (!days.length) return
    const from = days[0]
    const daysLeft = days.length
    const proposals = autoSchedule({
      ranked: derived.ranked,
      blocks,
      courses,
      plannerEvents,
      scheduleOverrides,
      now,
      from,
      days: daysLeft,
      dayStartHour: settings.dayStartHour,
      dayEndHour: settings.dayEndHour,
      dailyCapacityMin: settings.dailyCapacityMin,
    })
    if (!proposals.length) {
      toast(
        derived.ranked.length
          ? 'Your week already has time for every open task.'
          : 'Add a task first, then Nudge can find time for it.',
      )
      return
    }
    store.addBlocks(
      proposals.map((p) => ({
        courseId: p.courseId,
        assignmentId: p.assignmentId,
        start: new Date(p.start).toISOString(),
        end: new Date(p.end).toISOString(),
      })),
    )
    const total = proposals.reduce((s, p) => s + (p.end - p.start) / 60000, 0)
    toast(`Planned ${fmtDuration(total)} across ${proposals.length} block${proposals.length === 1 ? '' : 's'}`, {
      action: { label: 'Undo', run: () => store.undo() },
    })
  }, [days, now, derived.ranked, blocks, courses, plannerEvents, scheduleOverrides, settings, store, toast])

  useEffect(() => {
    if (!focusBlock) return
    const b = blocks.find((x) => x.id === focusBlock.id)
    if (b) {
      const dayOfWeek = new Date(b.start).getDay()
      if ((dayOfWeek === 0 || dayOfWeek === 6) && viewMode === 'workweek') {
        setViewMode('week')
      }
    }
    setSelected(focusBlock.id)
    onFocusHandled?.()
  }, [focusBlock, onFocusHandled, blocks, viewMode])

  const lastFill = useRef(fillSignal)
  useEffect(() => {
    if (fillSignal === lastFill.current) return
    lastFill.current = fillSignal
    fillWeek()
  }, [fillSignal, fillWeek])

  const tray = useMemo(() => {
    return derived.ranked.slice(0, 8).map((r) => {
      const planned = blocks
        .filter((b) => b.assignmentId === r.assignment.id && +new Date(b.end) >= now)
        .reduce((s, b) => s + (+new Date(b.end) - +new Date(b.start)) / 60000, 0)
      return { r, planned, gap: Math.max(0, r.remainingMin - planned) }
    })
  }, [derived.ranked, blocks, now])

  const selectedBlock = selected ? blocks.find((b) => b.id === selected) : null
  const weekMinutes = weekBlocks.reduce((s, b) => s + (+new Date(b.end) - +new Date(b.start)) / 60000, 0)

  const { periodTitle, periodDetail, isCurrentPeriod } = useMemo(() => {
    if (!days.length) return { periodTitle: '', periodDetail: '', isCurrentPeriod: true }
    const first = days[0]
    const last = days[days.length - 1]
    const isCurrent = weekOffset === 0

    if (viewMode === 'day') {
      const title = isSameDay(first, now) ? 'Today' : fmtDay(first)
      const detail = first.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
      return {
        periodTitle: title,
        periodDetail: `${detail}${weekMinutes > 0 ? ` · ${fmtDuration(weekMinutes)} planned` : ''}`,
        isCurrentPeriod: isSameDay(first, now),
      }
    }

    if (viewMode === '3day') {
      return {
        periodTitle: `${fmtDayShort(first)} – ${fmtDayShort(last)}`,
        periodDetail: `${first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}${weekMinutes > 0 ? ` · ${fmtDuration(weekMinutes)} planned` : ''}`,
        isCurrentPeriod: isCurrent,
      }
    }

    if (viewMode === 'workweek') {
      const title = isCurrent ? 'This week (Mon–Fri)' : `${fmtDayShort(first)} – ${fmtDayShort(last)}`
      const detail = `${first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${weekMinutes > 0 ? ` · ${fmtDuration(weekMinutes)} planned` : ''}`
      return { periodTitle: title, periodDetail: detail, isCurrentPeriod: isCurrent }
    }

    const title = isCurrent ? 'This week' : `${fmtDayShort(first)} – ${fmtDayShort(last)}`
    const detail = `${first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${weekMinutes > 0 ? ` · ${fmtDuration(weekMinutes)} planned` : ''}`
    return { periodTitle: title, periodDetail: detail, isCurrentPeriod: isCurrent }
  }, [days, now, weekOffset, viewMode, weekMinutes])

  if (courses.length === 0 && assignments.length === 0 && plannerEvents.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <Card className="max-w-lg mx-auto">
          <EmptyState
            icon={<CalendarRange size={20} />}
            title="Plan your week"
            body="Add a course and a task, then drag out study blocks or have Nudge draft a plan."
            action={
              <Button variant="primary" onClick={onAddCourse}>
                Add your first course
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {}
      <div className="px-3 sm:px-6 pt-3 sm:pt-4 pb-2.5 flex flex-wrap items-center justify-between gap-2.5 border-b border-line/60 bg-surface/50">
        {}
        <PeriodNavigator
          title={periodTitle}
          detail={periodDetail}
          onPrevious={() => setWeekOffset((w) => w - 1)}
          onNext={() => setWeekOffset((w) => w + 1)}
          onToday={isCurrentPeriod ? undefined : () => setWeekOffset(() => 0)}
        />

        {}
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          {}
          <Segmented
            size="sm"
            ariaLabel="Calendar view mode"
            value={viewMode}
            onChange={(v) => {
              setViewMode(v as PlanViewMode)
              setWeekOffset(() => 0)
            }}
            options={
              isMobile
                ? [
                    { value: '3day', label: '3D' },
                    { value: 'day', label: '1D' },
                    { value: 'week', label: '7D' },
                  ]
                : [
                    { value: 'week', label: '7 Days', title: 'Full week (7 days)' },
                    { value: 'workweek', label: '5 Days', title: 'Weekdays (Monday–Friday) with wider columns' },
                    { value: '3day', label: '3 Days', title: 'Focused 3-day view' },
                    { value: 'day', label: 'Day', title: 'Single day view' },
                  ]
            }
          />

          {}
          <Button
            size="sm"
            variant={density === 'spacious' ? 'quiet' : 'ghost'}
            onClick={() => setDensity((d) => (d === 'spacious' ? 'fit' : 'spacious'))}
            title={density === 'spacious' ? 'Fit columns to screen' : 'Spacious columns (wider for building names)'}
            className="hidden sm:inline-flex"
          >
            {density === 'spacious' ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
            <span className="hidden xl:inline">{density === 'spacious' ? 'Fit' : 'Spacious'}</span>
          </Button>

          {}
          <Button
            size="sm"
            variant={showClasses ? 'quiet' : 'ghost'}
            onClick={() => setShowClasses((v) => !v)}
            aria-pressed={showClasses}
            title={showClasses ? 'Hide class times' : 'Show class times'}
          >
            <GraduationCap size={15} />
            <span className="hidden lg:inline">Classes</span>
          </Button>

          {}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" title="Add a study block or exam">
                <Plus size={14} />
                <span className="hidden sm:inline">Add block</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onSelect={() => {
                  const today = new Date(now)
                  const h = Math.max(9, Math.min(19, today.getHours()))
                  today.setHours(h, 0, 0, 0)
                  const s = +today
                  const newBlock = store.addBlock({
                    kind: 'study',
                    start: new Date(s).toISOString(),
                    end: new Date(s + 60 * 60_000).toISOString(),
                  })
                  setSelected(newBlock.id)
                  undoable('Study block created')
                }}
              >
                <Plus size={14} className="text-ink-3" />
                <span>Study block</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  const defaultDate = days[0] ? new Date(days[0]) : new Date(now)
                  setDayException({ date: dayKey(defaultDate), initialType: 'exam' })
                }}
              >
                <GraduationCap size={14} className="text-ink-3" />
                <span>Exam</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {}
          <Button
            size="sm"
            onClick={() => {
              const defaultDate = days[0] ? new Date(days[0]) : new Date(now)
              setDayException({ date: dayKey(defaultDate) })
            }}
            title="Add a holiday, cancelled classes day, snow day, reading break, or timetable switch"
          >
            <CalendarOff size={14} />
            <span className="hidden md:inline">Holiday</span>
          </Button>

          {}
          <Button
            size="sm"
            variant={aiConfig.available ? 'secondary' : 'primary'}
            onClick={fillWeek}
            title="Drop study blocks into free slots"
          >
            <CalendarPlus size={14} />
            <span className="hidden sm:inline">Fill gaps</span>
          </Button>

          {}
          {aiConfig.available && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => onAskAi({ surface: 'plan_week', horizonDays: 9 })}
              title="Build a plan for this week"
            >
              <Sparkles size={14} />
              <span className="hidden sm:inline">Plan my week</span>
            </Button>
          )}
        </div>
      </div>

      {}
      {tray.length > 0 && (
        <div className="px-3 sm:px-6 py-2 border-b border-line/40 bg-surface/30">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3 shrink-0 pr-0.5">
              Needs time
            </span>
            {tray.map(({ r, gap }) => {
              const active = armed === r.assignment.id
              return (
                <button
                  key={r.assignment.id}
                  type="button"
                  onClick={() => setArmed(active ? null : r.assignment.id)}
                  aria-pressed={active}
                  className={cx(
                    'shrink-0 h-7 pl-2 pr-2.5 rounded-lg border flex items-center gap-1.5 text-[12px] font-medium',
                    'transition-all duration-150 active:scale-[.97]',
                    active
                      ? 'border-ink bg-invert-bg text-invert-ink font-semibold'
                      : 'border-line bg-surface text-ink hover:border-line-2 hover:bg-surface-2',
                  )}
                  style={active ? undefined : { background: washOf(r.course, 10) }}
                >
                  <CourseDot
                    course={r.course}
                    size={14}
                    style={active ? { color: 'currentColor' } : undefined}
                  />
                  <span className="truncate max-w-[140px]">{r.assignment.title}</span>
                  {gap > 0 && (
                    <span className={cx('tnum text-[11px]', active ? 'opacity-80' : 'text-ink-3 font-semibold')}>
                      {fmtDuration(gap)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {armed && (
            <p className="mt-1 text-[11.5px] text-ink-2 flex items-center gap-1.5 a-rise">
              <Info size={12} className="shrink-0 text-ink-3" />
              Tap or drag any open slot on the calendar to schedule time for this task.
              <button className="underline underline-offset-2 hover:text-ink font-medium" onClick={() => setArmed(null)}>
                Cancel
              </button>
            </p>
          )}
        </div>
      )}

      {}
      <div className="flex-1 min-h-0 flex px-3 sm:px-6 py-3">
        <WeekGrid
          days={days}
          visibleDays={visibleDays}
          density={density}
          blocks={weekBlocks}
          courses={courses}
          assignments={assignments}
          plannerEvents={plannerEvents}
          scheduleOverrides={scheduleOverrides}
          startHour={settings.dayStartHour}
          endHour={settings.dayEndHour}
          hourPx={isMobile ? 54 : 58}
          now={now}
          showClasses={showClasses}
          selectedId={selected}
          onMoveBlock={handleMove}
          onMovePlannerEvent={handleMovePlannerEvent}
          onMoveClass={handleMoveClass}
          onCreate={handleCreate}
          onSelect={setSelected}
          onSelectCourse={onEditCourse}
          onSelectPlannerEvent={(id) => {
            const ev = plannerEvents.find((e) => e.id === id)
            if (ev) setDayException({ date: dayKey(ev.start), event: ev })
          }}
          onSelectDayException={(date, event, override) => setDayException({ date, event, override })}
          onNudgeBlock={handleNudge}
          onDeleteBlock={handleDelete}
           onToggleDone={(id) => {
             store.toggleBlockDone(id)
             undoable('Study block updated')
           }}
        />
      </div>

      {}
      {selectedBlock && (
        <BlockSheet
          block={selectedBlock}
          courses={courses}
          assignments={assignments}
          onClose={() => setSelected(null)}
          onPatch={(patch) => store.updateBlock(selectedBlock.id, patch)}
          onReschedule={(startMs, endMs) => store.moveBlock(selectedBlock.id, startMs, endMs)}
          onDuplicate={() => {
            const copy = store.duplicateBlock(selectedBlock.id)
            if (!copy) return
            setSelected(copy.id)
            toast(`Copied to ${fmtDay(copy.start)}, ${fmtTime(copy.start)}`, {
              action: { label: 'Undo', run: () => store.undo() },
            })
          }}
          onDelete={() => handleDelete(selectedBlock.id)}
          onToggleDone={() => {
            store.toggleBlockDone(selectedBlock.id)
            undoable('Study block updated')
            setSelected(null)
          }}
          onFocus={() => {
            onStartFocus(selectedBlock.assignmentId, selectedBlock.courseId, selectedBlock.id)
            setSelected(null)
          }}
        />
      )}

      {}
      {dayException && (
        <DayExceptionSheet
          key={`${dayException.date}:${dayException.initialType ?? 'event'}:${dayException.event?.id ?? dayException.override?.id ?? 'new'}`}
          initialDate={dayException.date}
          initialType={dayException.initialType}
          existingEvent={dayException.event}
          existingOverride={dayException.override}
          onClose={() => setDayException(null)}
        />
      )}
    </div>
  )
}
