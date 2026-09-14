import {
  Archive,
  ArrowRight,
  ArrowUpDown,
  BellOff,
  BookPlus,
  CalendarDays,
  CircleCheck,
  SlidersHorizontal,
  StarOff,
  CalendarPlus,
  Check,
  Clock,
  CornerDownRight,
  ListChecks,
  Star,
  Timer,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import type { Course } from '../../lib/types'
import type {
  CreateTaskProposal,
  CreateScheduleItemProposal,
  UpdateScheduleItemProposal,
  RemoveScheduleItemProposal,
  MoveBlockProposal,
  MoveDeadlineProposal,
  Proposal,
  RemoveBlockProposal,
  ScheduleBlockProposal,
  SplitTaskProposal,
  StudySessionProposal,
  UpdateTaskProposal,
  FocusTodayProposal,
  CompleteTaskProposal,
  CreateCourseProposal,
  UpdateCourseProposal,
  StepProposal,
  BlockOpProposal,
  DeleteCourseProposal,
  LogSessionProposal,
  ArchiveCourseProposal,
} from '../../lib/ai/validate'
import { useStore } from '../../lib/store'
import { fmtDayShort, fmtDuration, fmtTime } from '../../lib/date'
import { KIND_LABEL } from '../../lib/priority'
import { WEEKDAYS } from '../../lib/ai/schema'
import { edgeOf, solidOf } from '../../lib/theme'
import { SegmentBar, SegmentRows } from '../schedule/SessionPlan'
import { Chip, CourseDot } from '../ui'
import { cx } from '../../lib/ui'

function CourseTag({ course }: { course?: Course | null }) {
  if (!course) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2 shrink-0">
      <CourseDot course={course} size={14} />
      {course.code}
    </span>
  )
}

const when = (ms: number) => `${fmtDayShort(ms)} · ${fmtTime(ms)}`

function Transition({ from, to, struck = true }: { from: string; to: string; struck?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 flex-wrap text-[13px] tnum">
      <span className={cx('text-ink-3', struck && 'line-through')}>{from}</span>
      <ArrowRight size={13} className="text-ink-3 shrink-0" aria-label="becomes" />
      <span className="font-semibold text-ink">{to}</span>
    </span>
  )
}

function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {items.map((w) => (
        <li key={w} className="flex items-start gap-1.5 text-[12px] leading-snug text-[var(--c-warn)]">
          <TriangleAlert size={12.5} className="mt-[2px] shrink-0" />
          <span>{w}</span>
        </li>
      ))}
    </ul>
  )
}

function CreateTaskBody({ p }: { p: CreateTaskProposal }) {
  const courses = useStore((s) => s.courses)
  const course = courses.find((c) => c.id === p.courseId) ?? null
  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[14px] font-semibold text-ink leading-snug">{p.title}</span>
        <CourseTag course={course} />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <Chip>{when(p.dueMs)}</Chip>
        <Chip tone="quiet">{KIND_LABEL[p.kind]}</Chip>
        {p.weight != null && <Chip tone="quiet">{p.weight}%</Chip>}
        {p.estimateMin != null && <Chip tone="quiet">{fmtDuration(p.estimateMin)}</Chip>}
      </div>
      {p.steps?.length ? (
        <ol className="mt-2 flex flex-col">
          {p.steps.map((s, i) => (
            <li key={`${s.title}-${i}`} className="flex items-start gap-2.5 py-1.5 border-t border-line first:border-t-0">
              <span className="mt-[1px] h-[17px] w-[17px] rounded-full border-[1.5px] border-line-2 grid place-items-center text-[10px] font-semibold text-ink-3 shrink-0 tnum">
                {i + 1}
              </span>
              <span className="flex-1 min-w-0 text-[13px] text-ink leading-snug">{s.title}</span>
              <span className="shrink-0 flex items-center gap-2 text-[11.5px] text-ink-3 tnum">
                {s.dueMs && <span>{fmtDayShort(s.dueMs)}</span>}
                {s.estimateMin != null && <span>{fmtDuration(s.estimateMin)}</span>}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </>
  )
}

function UpdateTaskBody({ p }: { p: UpdateTaskProposal }) {
  return (
    <>
      <span className="text-[14px] font-semibold text-ink leading-snug">{p.before.title}</span>
      <div className="mt-1.5 flex flex-col gap-1">
        {p.changes.map((c) => (
          <div key={c.field} className="flex items-baseline gap-2">
            <span className="text-[11.5px] text-ink-3 w-[58px] shrink-0">{c.field}</span>
            <Transition from={c.from} to={c.to} />
          </div>
        ))}
      </div>
    </>
  )
}

function MoveDeadlineBody({ p }: { p: MoveDeadlineProposal }) {
  return (
    <>
      <span className="text-[14px] font-semibold text-ink leading-snug">{p.before.title}</span>
      <div className="mt-1.5">
        <Transition from={when(p.fromMs)} to={when(p.toMs)} />
      </div>
    </>
  )
}

function SplitTaskBody({ p }: { p: SplitTaskProposal }) {
  const total = p.steps.reduce((s, x) => s + x.estimateMin, 0)
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold text-ink leading-snug">{p.before.title}</span>
        <span className="text-[11.5px] text-ink-3 shrink-0 tnum">{fmtDuration(total)} total</span>
      </div>
      <ol className="mt-2 flex flex-col">
        {p.steps.map((s, i) => (
          <li key={`${s.title}-${i}`} className="flex items-start gap-2.5 py-1.5 border-t border-line first:border-t-0">
            <span className="mt-[1px] h-[17px] w-[17px] rounded-full border-[1.5px] border-line-2 grid place-items-center text-[10px] font-semibold text-ink-3 shrink-0 tnum">
              {i + 1}
            </span>
            <span className="flex-1 min-w-0 text-[13px] text-ink leading-snug">{s.title}</span>
            <span className="shrink-0 flex items-center gap-2 text-[11.5px] text-ink-3 tnum">
              {s.dueMs && <span>{fmtDayShort(s.dueMs)}</span>}
              <span>{fmtDuration(s.estimateMin)}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11.5px] text-ink-3 leading-snug">
        Each step gets its own time on the plan, in a free hour on that day.
      </p>
    </>
  )
}

function ScheduleBlockBody({ p }: { p: ScheduleBlockProposal }) {
  const courses = useStore((s) => s.courses)
  const course = courses.find((c) => c.id === p.courseId) ?? null
  const mins = Math.round((p.endMs - p.startMs) / 60_000)
  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[14px] font-semibold text-ink leading-snug">{p.title}</span>
        <CourseTag course={course} />
      </div>

      <div
        className="mt-2 flex items-center gap-2 rounded-[10px] border px-2.5 py-2"
        style={{ background: solidOf(course, 14), borderColor: edgeOf(course, 30) }}
      >
        <Clock size={13} className="text-ink-2 shrink-0" />
        <span className="text-[12.5px] font-medium text-ink tnum">
          {fmtDayShort(p.startMs)} · {fmtTime(p.startMs)} – {fmtTime(p.endMs)}
        </span>
        <span className="ml-auto text-[11.5px] text-ink-2 tnum shrink-0">{fmtDuration(mins)}</span>
      </div>
    </>
  )
}

function CreateScheduleItemBody({ p }: { p: CreateScheduleItemProposal }) {
  const courses = useStore((s) => s.courses)
  const course = courses.find((c) => c.id === p.courseId) ?? null
  const kind = p.kind === 'exam'
    ? 'Exam'
    : p.kind === 'custom_class'
      ? 'One-time class'
      : p.kind === 'blocked_time'
        ? 'Commitment'
        : p.kind === 'reading_break'
          ? 'Reading break'
          : 'Holiday'
  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[14px] font-semibold text-ink leading-snug">{p.title}</span>
        <CourseTag course={course} />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <Chip tone={p.kind === 'exam' ? 'critical' : 'quiet'}>{kind}</Chip>
        <Chip>{p.allDay ? `${fmtDayShort(p.startMs)}${fmtDayShort(p.startMs) === fmtDayShort(p.endMs - 1) ? '' : ` – ${fmtDayShort(p.endMs - 1)}`} · all day` : `${fmtDayShort(p.startMs)} · ${fmtTime(p.startMs)} – ${fmtTime(p.endMs)}`}</Chip>
        {p.room && <Chip tone="quiet">{p.room}</Chip>}
      </div>
    </>
  )
}

function UpdateScheduleItemBody({ p }: { p: UpdateScheduleItemProposal }) {
  return (
    <>
      <span className="text-[14px] font-semibold text-ink leading-snug">{p.before.title}</span>
      <ChangeList changes={p.changes} />
    </>
  )
}

function RemoveScheduleItemBody({ p }: { p: RemoveScheduleItemProposal }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[14px] font-semibold text-ink leading-snug line-through decoration-ink-3">{p.before.title}</span>
      <Chip tone={p.before.kind === 'exam' ? 'critical' : 'quiet'}>{p.before.kind === 'exam' ? 'Exam' : 'Schedule item'}</Chip>
      <span className="text-[12px] text-ink-3 tnum">{when(+new Date(p.before.start))}</span>
    </div>
  )
}

function MoveBlockBody({ p }: { p: MoveBlockProposal }) {
  const { courses, assignments } = useStore.getState()
  const linked = p.before.assignmentId ? assignments.find((a) => a.id === p.before.assignmentId) : null
  const course = courses.find((c) => c.id === (p.before.courseId ?? linked?.courseId)) ?? null
  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[14px] font-semibold text-ink leading-snug">
          {linked?.title ?? p.before.title ?? 'Study block'}
        </span>
        <CourseTag course={course} />
      </div>
      <div className="mt-1.5 flex flex-col gap-1">

        <Transition
          from={`${fmtDayShort(p.fromStartMs)} ${fmtTime(p.fromStartMs)}${movedLength(p) ? ` · ${fmtDuration((p.fromEndMs - p.fromStartMs) / 60000)}` : ''}`}
          to={`${fmtDayShort(p.startMs)} ${fmtTime(p.startMs)}${movedLength(p) ? ` · ${fmtDuration((p.endMs - p.startMs) / 60000)}` : ''}`}
        />
        {p.changes?.map((c) => (
          <div key={c.field} className="flex items-baseline gap-2">
            <span className="text-[11.5px] text-ink-3 w-[58px] shrink-0">{c.field}</span>
            <Transition from={c.from} to={c.to} />
          </div>
        ))}
      </div>
    </>
  )
}

const movedLength = (p: MoveBlockProposal) => p.endMs - p.startMs !== p.fromEndMs - p.fromStartMs

function RemoveBlockBody({ p }: { p: RemoveBlockProposal }) {
  const { courses, assignments } = useStore.getState()
  const linked = p.before.assignmentId ? assignments.find((a) => a.id === p.before.assignmentId) : null
  const course = courses.find((c) => c.id === (p.before.courseId ?? linked?.courseId)) ?? null
  const start = +new Date(p.before.start)
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[14px] font-semibold text-ink leading-snug line-through decoration-ink-3">
        {linked?.title ?? p.before.title ?? 'Study block'}
      </span>
      <CourseTag course={course} />
      <span className="text-[12px] text-ink-3 tnum">{when(start)}</span>
    </div>
  )
}

function FocusTodayBody({ p }: { p: FocusTodayProposal }) {
  const courses = useStore((s) => s.courses)
  const course = courses.find((c) => c.id === p.before.courseId) ?? null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Star size={13} className="text-ink-2 shrink-0" />
      <span className="text-[14px] font-semibold text-ink leading-snug">{p.before.title}</span>
      <CourseTag course={course} />
    </div>
  )
}

function StudySessionBody({ p }: { p: StudySessionProposal }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold text-ink leading-snug">
          {`${fmtDayShort(p.startMs)} · ${fmtTime(p.startMs)}`}
        </span>
        <span className="text-[11.5px] text-ink-3 shrink-0 tnum">{fmtDuration(p.totalMin)}</span>
      </div>
      <SegmentBar segments={p.segments} className="mt-2" />
      <SegmentRows segments={p.segments} className="mt-2" />
    </>
  )
}

function TaskLine({ task, struck }: { task: { title: string; courseId: string | null }; struck?: boolean }) {
  const courses = useStore((s) => s.courses)
  const course = courses.find((c) => c.id === task.courseId) ?? null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className={cx(
          'text-[14px] font-semibold text-ink leading-snug',
          struck && 'line-through decoration-ink-3',
        )}
      >
        {task.title}
      </span>
      <CourseTag course={course} />
    </div>
  )
}

const hhmm = (min: number) => `${Math.floor(min / 60)}:${`${min % 60}`.padStart(2, '0')}`

function MeetingsLine({ meetings }: { meetings: { day: number; start: number; end: number; kind: string }[] }) {
  if (!meetings.length) return <span className="text-[12px] text-ink-3">No class times given</span>
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {meetings.map((m, i) => (
        <Chip key={i} tone="quiet">
          {WEEKDAYS[m.day]} {hhmm(m.start)}–{hhmm(m.end)}
        </Chip>
      ))}
    </div>
  )
}

function ChangeList({ changes }: { changes: { field: string; from: string; to: string }[] }) {
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {changes.map((c) => (
        <div key={c.field} className="flex items-baseline gap-2">
          <span className="text-[11.5px] text-ink-3 w-[104px] shrink-0">{c.field}</span>
          <Transition from={c.from} to={c.to} />
        </div>
      ))}
    </div>
  )
}

const HEADINGS: Record<Proposal['type'], { icon: typeof Check; label: string }> = {
  add_step: { icon: ListChecks, label: 'Add a step' },
  update_step: { icon: ListChecks, label: 'Edit a step' },
  remove_step: { icon: ListChecks, label: 'Remove a step' },
  duplicate_block: { icon: Clock, label: 'Duplicate block' },
  complete_block: { icon: CircleCheck, label: 'Study block' },
  delete_course: { icon: Trash2, label: 'Remove course' },
  log_session: { icon: Timer, label: 'Log study time' },
  remove_from_today: { icon: StarOff, label: 'Take off today' },
  complete_task: { icon: CircleCheck, label: 'Mark done' },
  delete_task: { icon: Trash2, label: 'Delete task' },
  create_course: { icon: BookPlus, label: 'New course' },
  update_course: { icon: CornerDownRight, label: 'Edit course' },
  update_settings: { icon: SlidersHorizontal, label: 'Planning settings' },
  create_task: { icon: CalendarPlus, label: 'New task' },
  create_schedule_item: { icon: CalendarDays, label: 'Schedule item' },
  update_schedule_item: { icon: CornerDownRight, label: 'Edit schedule' },
  remove_schedule_item: { icon: Trash2, label: 'Remove schedule item' },
  update_task: { icon: CornerDownRight, label: 'Edit' },
  move_deadline: { icon: TriangleAlert, label: 'Deadline change' },
  split_task: { icon: ListChecks, label: 'Break into steps' },
  schedule_block: { icon: Clock, label: 'Study block' },
  move_block: { icon: ArrowRight, label: 'Move block' },
  mute_nudge: { icon: BellOff, label: 'Silence for today' },
  reorder_today: { icon: ArrowUpDown, label: "Today's order" },
  archive_course: { icon: Archive, label: 'Archive course' },
  remove_block: { icon: Trash2, label: 'Remove block' },
  focus_today: { icon: Star, label: 'Add to today' },
  study_session: { icon: Timer, label: 'Study session' },
}

function Body({ p }: { p: Proposal }) {
  switch (p.type) {
    case 'create_task':
      return <CreateTaskBody p={p} />
    case 'update_task':
      return <UpdateTaskBody p={p} />
    case 'move_deadline':
      return <MoveDeadlineBody p={p} />
    case 'split_task':
      return <SplitTaskBody p={p} />
    case 'create_schedule_item':
      return <CreateScheduleItemBody p={p} />
    case 'update_schedule_item':
      return <UpdateScheduleItemBody p={p} />
    case 'remove_schedule_item':
      return <RemoveScheduleItemBody p={p} />
    case 'schedule_block':
      return <ScheduleBlockBody p={p} />
    case 'move_block':
      return <MoveBlockBody p={p} />
    case 'remove_block':
      return <RemoveBlockBody p={p} />
    case 'focus_today':
      return <FocusTodayBody p={p} />
    case 'study_session':
      return <StudySessionBody p={p} />
    case 'remove_from_today':
      return <TaskLine task={p.before} />
    case 'complete_task':
      return <CompleteTaskBody p={p} />
    case 'delete_task':
      return <TaskLine task={p.before} struck />
    case 'create_course':
      return <CreateCourseBody p={p} />
    case 'update_course':
      return <UpdateCourseBody p={p} />
    case 'update_settings':
      return <ChangeList changes={p.changes} />
    case 'add_step':
    case 'update_step':
    case 'remove_step':
      return <StepBody p={p} />
    case 'duplicate_block':
    case 'complete_block':
      return <BlockOpBody p={p} />
    case 'delete_course':
      return <DeleteCourseBody p={p} />
    case 'log_session':
      return <LogSessionBody p={p} />
    case 'reorder_today':
      return (
        <>
          <TaskLine task={p.before} />
          <div className="mt-1.5">
            <Transition from={`#${p.fromPosition} today`} to={`#${p.toPosition} today`} />
          </div>
        </>
      )
    case 'archive_course':
      return <ArchiveCourseBody p={p} />
    case 'mute_nudge':
      return <span className="text-[14px] text-ink leading-snug">“{p.text}”</span>
  }
}

function StepBody({ p }: { p: StepProposal }) {
  const label = p.title ?? p.stepBefore?.title ?? 'Step'
  return (
    <>
      <TaskLine task={p.before} />
      <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[13px]">
        {p.type === 'update_step' && p.stepBefore && p.title && p.title !== p.stepBefore.title ? (
          <Transition from={p.stepBefore.title} to={p.title} />
        ) : (
          <span className={cx('text-ink', p.type === 'remove_step' && 'line-through text-ink-3')}>{label}</span>
        )}
        {p.done != null && <Chip tone={p.done ? 'good' : 'neutral'}>{p.done ? 'ticked off' : 'unticked'}</Chip>}
        {p.estimateMin != null && <Chip tone="quiet">{fmtDuration(p.estimateMin)}</Chip>}
      </div>
    </>
  )
}

function BlockOpBody({ p }: { p: BlockOpProposal }) {
  const { courses, assignments } = useStore.getState()
  const linked = p.before.assignmentId ? assignments.find((a) => a.id === p.before.assignmentId) : null
  const course = courses.find((c) => c.id === (p.before.courseId ?? linked?.courseId)) ?? null
  const start = +new Date(p.before.start)
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[14px] font-semibold text-ink leading-snug">
        {linked?.title ?? p.before.title ?? 'Study block'}
      </span>
      <CourseTag course={course} />
      <span className="text-[12px] text-ink-3 tnum">{when(start)}</span>
      {p.type === 'complete_block' && <Chip tone={p.done ? 'good' : 'neutral'}>{p.done ? 'done' : 'reopened'}</Chip>}
      {p.type === 'duplicate_block' && <Chip tone="quiet">copy goes after it</Chip>}
    </div>
  )
}

function DeleteCourseBody({ p }: { p: DeleteCourseProposal }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[14px] font-semibold text-ink leading-snug line-through decoration-ink-3">
        {p.before.code}
      </span>
      {p.taskCount > 0 && <Chip tone="warn">{p.taskCount} tasks keep going, without a course</Chip>}
    </div>
  )
}

function ArchiveCourseBody({ p }: { p: ArchiveCourseProposal }) {
  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        <CourseTag course={p.before} />
        {p.before.title && <span className="text-[12.5px] text-ink-3 truncate">{p.before.title}</span>}
      </div>

      <p className="mt-1.5 text-[13px] text-ink-2 leading-snug">
        {p.archived
          ? `Out of the ranking and the pickers. Its ${p.taskCount} ${p.taskCount === 1 ? 'task' : 'tasks'}, blocks and logged time stay.`
          : 'Back in the ranking, with everything it had.'}
      </p>
    </>
  )
}

function LogSessionBody({ p }: { p: LogSessionProposal }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[14px] font-semibold text-ink leading-snug">{p.label}</span>
      <Chip>{fmtDuration(p.minutes)}</Chip>
      <span className="text-[12px] text-ink-3 tnum">{when(p.startMs)}</span>
    </div>
  )
}

function CompleteTaskBody({ p }: { p: CompleteTaskProposal }) {
  return (
    <>
      <TaskLine task={p.before} struck={p.done} />
      <p className="mt-1 text-[12px] text-ink-3">{p.done ? 'Marked finished' : 'Reopened'}</p>
    </>
  )
}

function CreateCourseBody({ p }: { p: CreateCourseProposal }) {
  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[14px] font-semibold text-ink leading-snug">{p.code}</span>
        {p.title && <span className="text-[12.5px] text-ink-2">{p.title}</span>}
      </div>
      <MeetingsLine meetings={p.meetings} />
    </>
  )
}

function UpdateCourseBody({ p }: { p: UpdateCourseProposal }) {
  return (
    <>
      <span className="text-[14px] font-semibold text-ink leading-snug">{p.before.code}</span>
      <ChangeList changes={p.changes} />
    </>
  )
}

export function ProposalCard({
  proposal,
  checked,
  onToggle,
}: {
  proposal: Proposal
  checked: boolean
  onToggle: () => void
}) {
  const head = HEADINGS[proposal.type]
  const Icon = head.icon
  const id = `prop-${proposal.id}`

  return (
    <div
      className={cx(
        'rounded-[12px] border transition-colors duration-150',
        checked ? 'bg-surface border-line' : 'bg-surface-2 border-line opacity-60',
        proposal.sensitive && checked && 'border-[var(--c-warn)]',
      )}
    >
      <div className="flex items-start gap-2.5 p-3">

        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-labelledby={id}
          onClick={onToggle}
          className={cx(
            'mt-[2px] h-[19px] w-[19px] rounded-[6px] border-[1.5px] grid place-items-center shrink-0 transition-all',
            checked ? 'bg-invert-bg border-invert-bg text-invert-ink' : 'border-line-2 text-transparent hover:border-ink-3',
          )}
        >
          <Check size={12} strokeWidth={3} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Icon size={12} className="text-ink-3 shrink-0" />
            <span id={id} className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
              {head.label}
            </span>
          </div>

          <Body p={proposal} />

          {proposal.reason && (
            <p className="mt-1.5 text-[12px] text-ink-2 leading-snug">{proposal.reason}</p>
          )}
          <Warnings items={proposal.warnings} />
        </div>
      </div>
    </div>
  )
}
