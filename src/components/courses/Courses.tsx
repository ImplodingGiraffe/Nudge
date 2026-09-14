import { useEffect, useMemo, useState } from 'react'
import { ArchiveRestore, CalendarClock, ChevronDown, ChevronRight, GraduationCap, Plus, User } from 'lucide-react'
import type { Course } from '../../lib/types'
import type { Derived } from '../../lib/derive'
import { useStore } from '../../lib/store'
import { gradeOutlook } from '../../lib/stats'
import { atMinutes, daysBetween, fmtDayShort, fmtDuration, fmtTimeRange, fromDayKey, startOfDay } from '../../lib/date'
import { distinctPlaces, fmtDays, groupMeetings, hasMultipleMeetingKinds, parsePlace } from '../../lib/meetings'
import { colorOf } from '../../lib/theme'
import { KindBadge, PlaceLine } from '../schedule/ClassBits'
import { Button, Card, Chip, CourseDot, EmptyState, PageHeader } from '../ui'
import { useToast } from '../../lib/toast'
import { TaskRow } from '../tasks/TaskRow'

export function Courses({
  derived,
  now,
  onOpenTask,
  onEditCourse,
  onAddCourse,
  focusCourseId,
}: {
  derived: Derived
  now: number
  onOpenTask: (id: string) => void
  onEditCourse: (id: string) => void
  onAddCourse: () => void
  focusCourseId?: string | null
}) {
  const courses = useStore((s) => s.courses)
  const assignments = useStore((s) => s.assignments)
  const plannerEvents = useStore((s) => s.plannerEvents)
  const [expanded, setExpanded] = useState<string | null>(focusCourseId ?? null)

  useEffect(() => {
    if (focusCourseId) {
      setExpanded(focusCourseId)
    }
  }, [focusCourseId])

  const active = courses.filter((c) => !c.archived)
  const archived = courses.filter((c) => c.archived)

  if (active.length === 0 && archived.length === 0) {
    return (
      <div className="px-3 sm:px-6 py-6 max-w-[900px] mx-auto">
        <Card>
          <EmptyState
            icon={<GraduationCap size={20} />}
            title="No courses yet"
            body="Add your course codes. Nudge will then organize tasks, grades, and class times by course."
            action={
              <Button variant="primary" onClick={onAddCourse}>
                <Plus size={16} />
                Add a course
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="px-3 sm:px-6 pt-4 sm:pt-7 pb-8 max-w-[1180px] mx-auto">
      <PageHeader
        className="mb-4"
        title="Courses"
        description="Keep classes, deadlines, grades, and study time together."
        actions={
          <Button variant="primary" size="sm" onClick={onAddCourse}>
            <Plus size={15} />
            Add course
          </Button>
        }
      />

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {active.map((c) => (
          <CourseCard
            key={c.id}
            course={c}
            derived={derived}
            now={now}
            expanded={expanded === c.id}
            onToggle={() => setExpanded((e) => (e === c.id ? null : c.id))}
            onEdit={() => onEditCourse(c.id)}
            onOpenTask={onOpenTask}
            assignmentsCount={assignments.filter((a) => a.courseId === c.id && a.status !== 'done').length}
            plannerEvents={plannerEvents}
          />
        ))}
      </div>

      {archived.length > 0 && <ArchivedCourses courses={archived} onEditCourse={onEditCourse} />}
    </div>
  )
}

function ArchivedCourses({
  courses,
  onEditCourse,
}: {
  courses: Course[]
  onEditCourse: (id: string) => void
}) {
  const store = useStore()
  const assignments = useStore((s) => s.assignments)
  const { toast } = useToast()
  const [open, setOpen] = useState(false)

  return (
    <section className="mt-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 px-1 pb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3 hover:text-ink transition-colors"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Archived
        <span className="tnum font-normal">{courses.length}</span>
      </button>

      {open && (
        <div className="bg-surface border border-line rounded-card shadow-card p-1">
          {courses.map((c) => {
            const kept = assignments.filter((a) => a.courseId === c.id).length
            return (
              <div key={c.id} className="group flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-tint transition-colors">
                <CourseDot course={c} size={15} className="opacity-70" />
                <button type="button" onClick={() => onEditCourse(c.id)} className="min-w-0 flex-1 text-left">
                  <span className="text-[14px] font-medium text-ink-2">{c.code}</span>
                  {c.title && <span className="text-[12.5px] text-ink-3 ml-2 truncate">{c.title}</span>}
                </button>
                <span className="text-[11.5px] text-ink-3 tnum shrink-0">
                  {kept} {kept === 1 ? 'task' : 'tasks'} kept
                </span>
                <Button
                  size="sm"
                  onClick={() => {
                    store.setCourseArchived(c.id, false)
                    toast(`${c.code} restored`, { action: { label: 'Undo', run: () => store.undo() } })
                  }}
                >
                  <ArchiveRestore size={14} />
                  Restore
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function CourseCard({
  course,
  derived,
  now,
  expanded,
  onToggle,
  onEdit,
  onOpenTask,
  assignmentsCount,
  plannerEvents,
}: {
  course: Course
  derived: Derived
  now: number
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onOpenTask: (id: string) => void
  assignmentsCount: number
  plannerEvents: import('../../lib/types').PlannerEvent[]
}) {
  const assignments = useStore((s) => s.assignments)
  const outlook = useMemo(() => gradeOutlook(course, assignments), [course, assignments])
  const stale = derived.staleByCourse.get(course.id) ?? 0
  const minutes = derived.byCourse.get(course.id) ?? 0
  const tasks = derived.ranked.filter((r) => r.assignment.courseId === course.id)
  const oneRoom = parsePlace(course.room)

  const exams = plannerEvents
    .filter((event) => event.kind === 'exam' && event.courseId === course.id)
    .map((event) => ({ label: event.title, iso: event.start }))
  const nextExam = exams
    .map((e) => ({ ...e, days: daysBetween(now, +new Date(e.iso)) }))
    .filter((e) => e.days >= 0)
    .sort((a, b) => a.days - b.days)[0]

  return (
    <Card onOpen={onEdit} className="overflow-hidden flex flex-col">
      <div className="p-3.5 flex-1 flex flex-col">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-ink leading-tight flex items-center gap-2">
              <CourseDot course={course} size={18} />
              {course.code}
            </h2>
            {course.title && <p className="text-[12.5px] text-ink-3 truncate mt-0.5">{course.title}</p>}
          </div>
          <button
            onClick={onEdit}
            className="text-[12px] font-medium text-ink-3 hover:text-ink px-1.5 py-0.5 rounded-md hover:bg-tint transition-colors shrink-0"
          >
            Edit
          </button>
        </div>

        {(course.professor || (oneRoom && !course.meetings.length)) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
            {course.professor && (
              <span className="inline-flex items-center gap-1 min-w-0">
                <User size={12} className="shrink-0" />
                <span className="truncate">{course.professor}</span>
              </span>
            )}
            {!course.meetings.length && <PlaceLine place={oneRoom} className="text-ink-3" />}
          </div>
        )}

        <ScheduleStrip course={course} now={now} />

        {outlook.target != null && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-[11.5px] mb-1">
              <span className="text-ink-3">Grade outlook</span>
              <span className="font-semibold text-ink tnum">
                {outlook.display != null ? `${Math.round(outlook.display)}%` : '—'}
                {outlook.target != null && (
                  <span className="text-ink-3 font-normal"> / target {Math.round(outlook.target)}%</span>
                )}
              </span>
            </div>
            <GradeBar outlook={outlook} course={course} />
          </div>
        )}

        {nextExam && (
          <div className="mt-3 flex items-center justify-between text-[12px] rounded-lg bg-surface-2 px-2.5 py-1.5 border border-line">
            <span className="text-ink-2 truncate flex items-center gap-1.5">
              <CalendarClock size={13} className="text-ink-3 shrink-0" />
              {nextExam.label}
            </span>
            <span className="text-ink-3 shrink-0 text-[11px] font-medium ml-2">
              {nextExam.days === 0 ? 'Today' : nextExam.days === 1 ? 'Tomorrow' : `in ${nextExam.days}d`}
            </span>
          </div>
        )}

        <div className="mt-auto pt-3 flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <Chip tone={assignmentsCount ? 'neutral' : 'quiet'} className="tnum">
            {assignmentsCount} open
          </Chip>
          <Chip tone="quiet" className="tnum">
            {fmtDuration(minutes)} logged
          </Chip>
          {stale >= 3 && (
            <Chip tone="warn" className="tnum">
              {stale}d untouched
            </Chip>
          )}
        </div>

        {tasks.length > 0 && (
          <button
            onClick={onToggle}
            className="mt-3 -mb-1 self-start text-[12.5px] font-medium text-ink-2 hover:text-ink transition-colors"
            aria-expanded={expanded}
          >
            {expanded
              ? 'Hide details'
              : `Show ${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-line p-3 bg-surface-2 flex flex-col gap-3.5 a-rise">
          {tasks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Open Tasks ({tasks.length})
              </p>
              <div className="flex flex-col gap-0.5">
                {tasks.map((r) => (
                  <TaskRow
                    key={r.assignment.id}
                    r={r}
                    now={now}
                    compact
                    onOpen={() => onOpenTask(r.assignment.id)}
                    onToggle={() => useStore.getState().setAssignmentStatus(r.assignment.id, 'done')}
                  />
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </Card>
  )
}

function ScheduleStrip({ course, now }: { course: Course; now: number }) {
  const groups = useMemo(() => groupMeetings(course.meetings), [course.meetings])
  const places = useMemo(() => distinctPlaces(course), [course])
  const hasMultipleKinds = useMemo(() => hasMultipleMeetingKinds(course), [course])

  const single = places.length === 1 ? places[0] : null
  if (!groups.length) return null

  const day = startOfDay(now)

  return (
    <div className="mt-2.5 flex flex-col gap-1.5">
      {groups.map((g, i) => {
        const place = single ? null : parsePlace(g.room ?? course.room)
        const applies =
          g.startsOn && g.endsOn
            ? `${fmtDayShort(fromDayKey(g.startsOn))} – ${fmtDayShort(fromDayKey(g.endsOn))}`
            : g.startsOn
              ? `From ${fmtDayShort(fromDayKey(g.startsOn))}`
              : g.endsOn
                ? `Through ${fmtDayShort(fromDayKey(g.endsOn))}`
                : null
        return (
          <div key={i} className="flex items-start gap-2 min-w-0">
            {hasMultipleKinds && <KindBadge kind={g.kind} className="mt-[1px]" />}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] leading-[18px] flex items-baseline gap-1.5 min-w-0">
                <span className="font-medium text-ink-2 shrink-0">{fmtDays(g.days)}</span>
                <span className="tnum text-ink-3 truncate">
                  {fmtTimeRange(atMinutes(day, g.start), atMinutes(day, g.end))}
                </span>
              </p>
              {applies && <p className="text-[10.5px] leading-[15px] text-ink-3">{applies}</p>}
              {place && <PlaceLine place={place} size="xs" className="text-ink-3" />}
            </div>
          </div>
        )
      })}
      {single && <PlaceLine place={single} className="text-ink-3 mt-0.5" />}
    </div>
  )
}

function GradeBar({ outlook, course }: { outlook: ReturnType<typeof gradeOutlook>; course: Course }) {
  const value = outlook.display ?? 0
  const target = outlook.target ?? 0
  return (
    <div className="relative h-[7px] w-full rounded-full bg-sunken overflow-hidden">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.min(100, value)}%`, background: colorOf(course) }}
      />
      {target > 0 && (
        <span
          className="absolute top-0 h-full w-[2px] bg-ink/45"
          style={{ left: `calc(${Math.min(100, target)}% - 1px)` }}
          title={`Target ${target}%`}
          aria-hidden
        />
      )}
    </div>
  )
}
