import type { Assignment, Course, DayKey, Meeting, MeetingKind, PlannerEvent, PlannerEventKind, ScheduleOverride, Settings, StudyBlock, Subtask, TaskKind } from '../types'
import { MIN, atMinutes, clamp, dayKey, fmtDuration, fromDayKey, snap } from '../date'
import { uid } from '../id'
import { classesOn, plannerEventOnDay } from '../meetings'
import {
  COMMANDS,
  MEETING_KINDS,
  NO_COURSE,
  SEGMENT_KINDS,
  SCHEDULE_ITEM_KINDS,
  PALETTES,
  THEMES,
  TONES,
  VIEW_KINDS,
  WEEKDAYS,
  WORK_FILTERS,
  TASK_KINDS,
  groupsFor,
  type ActionGroup,
  type RawItem,
  type RawReply,
  type RawSegment,
  type RawStep,
} from './schema'

export type ActionType =
  | 'create_task'
  | 'create_schedule_item'
  | 'update_schedule_item'
  | 'remove_schedule_item'
  | 'update_task'
  | 'move_deadline'
  | 'split_task'
  | 'schedule_block'
  | 'move_block'
  | 'remove_block'
  | 'focus_today'
  | 'remove_from_today'
  | 'study_session'
  | 'complete_task'
  | 'move_deadline'
  | 'delete_task'
  | 'create_course'
  | 'update_course'
  | 'update_settings'
  | 'add_step'
  | 'update_step'
  | 'remove_step'
  | 'duplicate_block'
  | 'complete_block'
  | 'delete_course'
  | 'log_session'
  | 'mute_nudge'
  | 'reorder_today'
  | 'archive_course'

const GROUP_TYPE: Partial<Record<ActionGroup, ActionType>> = {
  create_tasks: 'create_task',
  create_schedule_items: 'create_schedule_item',
  update_schedule_items: 'update_schedule_item',
  remove_schedule_items: 'remove_schedule_item',
  update_tasks: 'update_task',
  breakdowns: 'split_task',
  schedule_blocks: 'schedule_block',
  move_blocks: 'move_block',
  rename_blocks: 'move_block',
  remove_blocks: 'remove_block',
  today_list: 'focus_today',
  study_sessions: 'study_session',
  delete_tasks: 'delete_task',
  create_courses: 'create_course',
  update_courses: 'update_course',
  update_settings: 'update_settings',
  update_steps: 'update_step',
  complete_steps: 'update_step',
  remove_steps: 'remove_step',
  duplicate_blocks: 'duplicate_block',
  complete_blocks: 'complete_block',
  delete_courses: 'delete_course',
  log_sessions: 'log_session',
  mute_nudges: 'mute_nudge',
  reorder_today: 'reorder_today',
  archive_courses: 'archive_course',
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^(\d{1,2}):(\d{2})$/

export function parseDate(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null
  const m = raw.trim().match(DATE_RE)
  if (!m) return null
  const [, y, mo, d] = m
  const year = +y
  const month = +mo
  const day = +d
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = fromDayKey(`${y}-${mo}-${d}`)

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

export function parseTime(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const m = raw.trim().match(TIME_RE)
  if (!m) return null
  const h = +m[1]
  const min = +m[2]
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

const parseNum = (raw: unknown, lo: number, hi: number): number | null => {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return null
  return clamp(Math.round(n), lo, hi)
}

const positiveWeight = (raw: unknown): number | undefined => {
  const n = parseNum(raw, 0, 100)
  return n != null && n > 0 ? n : undefined
}

const text = (raw: unknown, max = 140): string | null => {
  if (typeof raw !== 'string') return null

  const t = Array.from(raw, (char) => {
    const code = char.charCodeAt(0)
    return code <= 0x1f || code === 0x7f ? ' ' : char
  }).join('')
    .replace(/\s+/g, ' ')
    .trim()
  return t ? t.slice(0, max) : null
}

export interface ProposalBase {

  id: string
  type: ActionType
  reason: string

  warnings: string[]

  sensitive?: boolean
}

export interface CreateTaskProposal extends ProposalBase {
  type: 'create_task'
  title: string
  courseId: string | null
  courseCode: string | null
  kind: TaskKind
  dueMs: number
  weight?: number
  estimateMin?: number
  notes?: string
  steps?: { title: string; estimateMin?: number; dueMs?: number }[]
}

export interface UpdateTaskProposal extends ProposalBase {
  type: 'update_task'
  taskId: string
  before: Assignment
  patch: Partial<Assignment>

  changes: { field: string; from: string; to: string }[]
}

export interface MoveDeadlineProposal extends ProposalBase {
  type: 'move_deadline'
  taskId: string
  before: Assignment
  fromMs: number
  toMs: number
}

export interface SplitTaskProposal extends ProposalBase {
  type: 'split_task'
  taskId: string
  before: Assignment
  steps: { title: string; estimateMin: number; dueMs?: number }[]
}

export interface ScheduleBlockProposal extends ProposalBase {
  type: 'schedule_block'
  assignmentId: string | null
  courseId: string | null
  title: string
  startMs: number
  endMs: number
}

export interface CreateScheduleItemProposal extends ProposalBase {
  type: 'create_schedule_item'
  title: string
  kind: PlannerEventKind
  courseId: string | null
  courseCode: string | null
  startMs: number
  endMs: number
  allDay: boolean
  room?: string
}

export interface UpdateScheduleItemProposal extends ProposalBase {
  type: 'update_schedule_item'
  eventId: string
  before: PlannerEvent
  after: PlannerEvent
  changes: { field: string; from: string; to: string }[]
}

export interface RemoveScheduleItemProposal extends ProposalBase {
  type: 'remove_schedule_item'
  eventId: string
  before: PlannerEvent
}

export interface MoveBlockProposal extends ProposalBase {
  type: 'move_block'
  blockId: string
  before: StudyBlock
  fromStartMs: number
  fromEndMs: number
  startMs: number
  endMs: number

  patch?: Partial<StudyBlock>
  changes?: { field: string; from: string; to: string }[]
}

export interface RemoveBlockProposal extends ProposalBase {
  type: 'remove_block'
  blockId: string
  before: StudyBlock
}

export interface FocusTodayProposal extends ProposalBase {
  type: 'focus_today'
  taskId: string
  before: Assignment
}

export interface StudySessionProposal extends ProposalBase {
  type: 'study_session'
  segments: { kind: (typeof SEGMENT_KINDS)[number]; minutes: number; label: string; taskId?: string }[]
  totalMin: number

  startMs: number
}

export interface CompleteTaskProposal extends ProposalBase {
  type: 'complete_task'
  taskId: string
  before: Assignment
  done: boolean
}

export interface DeleteTaskProposal extends ProposalBase {
  type: 'delete_task'
  taskId: string
  before: Assignment
}

export interface RemoveFromTodayProposal extends ProposalBase {
  type: 'remove_from_today'
  taskId: string
  before: Assignment
}

export interface CreateCourseProposal extends ProposalBase {
  type: 'create_course'
  code: string
  title?: string
  meetings: Omit<Meeting, 'id'>[]
}

export interface UpdateCourseProposal extends ProposalBase {
  type: 'update_course'
  courseId: string
  before: Course
  patch: Partial<Course>
  changes: { field: string; from: string; to: string }[]
}

export interface UpdateSettingsProposal extends ProposalBase {
  type: 'update_settings'
  patch: Partial<Settings>
  changes: { field: string; from: string; to: string }[]
}

export interface StepProposal extends ProposalBase {
  type: 'add_step' | 'update_step' | 'remove_step'
  taskId: string
  before: Assignment
  stepId?: string
  stepBefore?: Subtask
  title?: string
  estimateMin?: number
  dueMs?: number
  done?: boolean
}

export interface BlockOpProposal extends ProposalBase {
  type: 'duplicate_block' | 'complete_block'
  blockId: string
  before: StudyBlock
  done?: boolean
}

export interface DeleteCourseProposal extends ProposalBase {
  type: 'delete_course'
  courseId: string
  before: Course
  taskCount: number
}

export interface ReorderTodayProposal extends ProposalBase {
  type: 'reorder_today'
  taskId: string
  before: Assignment

  fromPosition: number
  toPosition: number
}

export interface ArchiveCourseProposal extends ProposalBase {
  type: 'archive_course'
  courseId: string
  before: Course
  archived: boolean

  taskCount: number
}

export interface MuteNudgeProposal extends ProposalBase {
  type: 'mute_nudge'
  nudgeId: string
  text: string
}

export interface LogSessionProposal extends ProposalBase {
  type: 'log_session'
  minutes: number
  taskId: string | null
  courseId: string | null
  label: string
  startMs: number
}

export interface Command {
  id: string
  action: string
  reason: string
  taskId?: string
  blockId?: string
  courseId?: string
  minutes?: number

  label: string
}

export interface ViewBase {

  id: string

  title: string
}

export type View =

  | (ViewBase & { kind: 'agenda'; days: number; courseId?: string })

  | (ViewBase & { kind: 'timetable'; courseId?: string })

  | (ViewBase & { kind: 'task'; taskId: string })

  | (ViewBase & { kind: 'work'; courseId?: string; days?: number; status: 'open' | 'done' | 'all' })

  | (ViewBase & { kind: 'course'; courseId: string })

  | (ViewBase & { kind: 'day'; day: DayKey })

  | (ViewBase & { kind: 'workload'; days: number })

  | (ViewBase & { kind: 'progress'; days: number })

export type ViewKind = View['kind']

const MAX_VIEWS = 4

const DEFAULT_DAYS: Record<ViewKind, number> = {
  agenda: 7,
  workload: 7,
  progress: 7,
  work: 30,
  timetable: 7,
  task: 1,
  course: 1,
  day: 1,
}

export type Proposal =
  | CreateTaskProposal
  | UpdateTaskProposal
  | MoveDeadlineProposal
  | SplitTaskProposal
  | CreateScheduleItemProposal
  | UpdateScheduleItemProposal
  | RemoveScheduleItemProposal
  | ScheduleBlockProposal
  | MoveBlockProposal
  | RemoveBlockProposal
  | FocusTodayProposal
  | RemoveFromTodayProposal
  | StudySessionProposal
  | CompleteTaskProposal
  | DeleteTaskProposal
  | CreateCourseProposal
  | UpdateCourseProposal
  | UpdateSettingsProposal
  | StepProposal
  | BlockOpProposal
  | DeleteCourseProposal
  | LogSessionProposal
  | MuteNudgeProposal
  | ReorderTodayProposal
  | ArchiveCourseProposal

export interface ValidatedReply {
  intent: 'answer' | 'advice' | 'plan' | 'question'
  message: string
  headline?: string
  assumptions: string[]
  question?: string
  proposals: Proposal[]

  views: View[]

  commands: Command[]

  rejected: { type: string; why: string }[]
}

export interface ValidationState {
  assignments: Assignment[]
  courses: Course[]
  blocks: StudyBlock[]
  plannerEvents: PlannerEvent[]
  scheduleOverrides: ScheduleOverride[]

  nudges?: { id: string; text: string }[]
  now: number
  dayEndHour: number
  dailyCapacityMin: number

  settings?: Settings
  todayIds?: Set<string>

  todayOrder?: string[]
}

function parseMeetings(raw: unknown): Omit<Meeting, 'id'>[] {
  if (!Array.isArray(raw)) return []
  const out: Omit<Meeting, 'id'>[] = []
  for (const m of raw as Record<string, unknown>[]) {
    const dayName = typeof m?.day === 'string' ? m.day.slice(0, 3) : ''
    const day = (WEEKDAYS as readonly string[]).indexOf(dayName)
    const start = parseTime(m?.start)
    const end = parseTime(m?.end)
    if (day < 0 || start == null || end == null || end <= start) continue
    const kindRaw = typeof m?.kind === 'string' ? m.kind : ''
    out.push({
      day,
      start,
      end,
      kind: ((MEETING_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : 'lecture') as MeetingKind,
      room: text(m?.room, 40) ?? undefined,
    })
  }
  return out
}

const liveAssignment = (id: unknown, st: ValidationState) =>
  typeof id === 'string' ? (st.assignments.find((a) => a.id === id && !a.archived) ?? null) : null

const liveBlock = (id: unknown, st: ValidationState) =>
  typeof id === 'string' ? (st.blocks.find((b) => b.id === id) ?? null) : null

const liveScheduleItem = (id: unknown, st: ValidationState) =>
  typeof id === 'string' ? (st.plannerEvents.find((event) => event.id === id) ?? null) : null

function resolveCourse(code: unknown, st: ValidationState): Course | null {
  const raw = typeof code === 'string' ? code.trim().toUpperCase().replace(/[\s\-_]+/g, '') : ''
  if (!raw || raw === NO_COURSE) return null
  return st.courses.find((c) => c.code.toUpperCase().replace(/[\s\-_]+/g, '') === raw && !c.archived) ?? null
}

function resolveAnyCourse(code: unknown, st: ValidationState): Course | null {
  const raw = typeof code === 'string' ? code.trim().toUpperCase().replace(/[\s\-_]+/g, '') : ''
  if (!raw || raw === NO_COURSE) return null
  return st.courses.find((c) => c.code.toUpperCase().replace(/[\s\-_]+/g, '') === raw) ?? null
}

function courseFromTitle(title: string, st: ValidationState): Course | null {
  for (const c of st.courses) {
    if (c.archived) continue
    const [subj, num] = c.code.split(' ')
    if (!subj) continue
    const re = new RegExp(`\\b${subj}\\s*${num ?? ''}\\b`, 'i')
    if (re.test(title)) return c
  }
  return null
}

function instant(date: Date, minutesOfDay: number | null, fallbackMin: number): number {
  return +atMinutes(date, minutesOfDay ?? fallbackMin)
}

const PLAUSIBLE_BACK = 120 * 86_400_000
const PLAUSIBLE_FWD = 400 * 86_400_000

const plausible = (ms: number, now: number) => ms > now - PLAUSIBLE_BACK && ms < now + PLAUSIBLE_FWD

const courseName = (id: string | null, st: ValidationState): string =>
  (id ? st.courses.find((c) => c.id === id)?.code : undefined) ?? '—'

function overlapWarnings(
  startMs: number,
  endMs: number,
  st: ValidationState,
  ignoreBlockId?: string,
  ignoreScheduleItemId?: string,
): string[] {
  const out: string[] = []
  const day = new Date(startMs)

  for (const cls of classesOn(st.courses, day, {
    plannerEvents: st.plannerEvents,
    scheduleOverrides: st.scheduleOverrides,
    blocks: st.blocks,
  })) {
    if (startMs < cls.end && cls.start < endMs) out.push(`Overlaps ${cls.course.code} ${cls.meeting.kind}`)
  }

  for (const event of st.plannerEvents) {
    if (event.id === ignoreScheduleItemId) continue
    if (!plannerEventOnDay(event, day)) continue
    if (event.allDay) {
      out.push(`Falls on ${event.title}`)
      continue
    }
    const eventStart = +new Date(event.start)
    const eventEnd = +new Date(event.end)
    if (startMs < eventEnd && eventStart < endMs)
      out.push(`Overlaps ${event.kind === 'exam' ? 'exam' : 'commitment'}: ${event.title}`)
  }

  for (const b of st.blocks) {
    if (b.id === ignoreBlockId) continue
    const bs = +new Date(b.start)
    const be = +new Date(b.end)
    if (startMs < be && bs < endMs) {
      out.push('Overlaps a study block you already have')
      break
    }
  }

  return out
}

const scheduleWhen = (event: Pick<PlannerEvent, 'start' | 'end' | 'allDay'>) => {
  const start = +new Date(event.start)
  const end = +new Date(event.end)
  if (event.allDay) {
    const last = dayKey(end - 1)
    return dayKey(start) === last ? `${dayKey(start)} all day` : `${dayKey(start)} through ${last}`
  }
  const time = (ms: number) => {
    const d = new Date(ms)
    return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
  }
  return `${dayKey(start)} ${time(start)}–${time(end)}`
}

const scheduleKindLabel = (kind: PlannerEventKind) => kind.replace(/_/g, ' ')

type Outcome = { ok: true; proposal: Proposal; also?: Proposal[] } | { ok: false; why: string }

function validateItem(group: ActionGroup, raw: RawItem, st: ValidationState): Outcome {
  const type = GROUP_TYPE[group]
  if (!type) return { ok: false, why: 'an entry in a list that is not a proposal' }
  const reason = text(raw.reason, 120) ?? ''
  const base = { id: uid(), type, reason, warnings: [] as string[] }

  switch (type) {

    case 'create_task': {
      const title = text(raw.title, 120)
      if (!title) return { ok: false, why: 'a new task with no title' }
      const date = parseDate(raw.date)
      if (!date) return { ok: false, why: `“${title}” had no usable due date` }
      const dueMs = instant(date, parseTime(raw.time), 23 * 60 + 59)
      if (!plausible(dueMs, st.now)) return { ok: false, why: `“${title}” was dated outside this school year` }

      const course = resolveCourse(raw.courseCode, st) ?? courseFromTitle(title, st)
      const kindRaw = typeof raw.kind === 'string' ? raw.kind : ''

      const kind = (TASK_KINDS as readonly string[]).includes(kindRaw)
        ? (kindRaw as TaskKind)
        : course
          ? 'assignment'
          : 'personal'

      const warnings: string[] = []
      if (typeof raw.courseCode === 'string' && raw.courseCode && raw.courseCode !== NO_COURSE && !course)
        warnings.push(`No course called ${raw.courseCode}. This task will be filed without a course.`)
      if (dueMs < st.now) warnings.push('This date is already past')

      const steps: CreateTaskProposal['steps'] = []
      if (Array.isArray(raw.steps)) {
        for (const s of raw.steps as RawStep[]) {
          const stepTitle = text(s?.title, 120)
          if (!stepTitle) continue
          const stepDate = parseDate(s?.date)
          const stepDueMs = stepDate ? instant(stepDate, null, 0) : undefined
          steps.push({
            title: stepTitle,
            estimateMin: parseNum(s?.estimateMin, 5, 480) ?? undefined,
            dueMs: stepDueMs && plausible(stepDueMs, st.now) ? stepDueMs : undefined,
          })
        }
      }

      const dup = st.assignments.find(
        (a) =>
          !a.archived &&
          a.status !== 'done' &&
          a.title.toLowerCase() === title.toLowerCase() &&
          a.due && Math.abs(+new Date(a.due) - dueMs) < 2 * 86_400_000,
      )
      if (dup) warnings.push('You already have a task with this name due around then')

      return {
        ok: true,
        proposal: {
          ...base,
          type,
          title,
          courseId: course?.id ?? null,
          courseCode: course?.code ?? null,
          kind,
          dueMs,
          weight: positiveWeight(raw.weight),
          estimateMin: parseNum(raw.estimateMin, 5, 1200) ?? undefined,
          notes: text(raw.notes, 400) ?? undefined,
          steps: steps.length ? steps : undefined,
          warnings,
        },
      }
    }

    case 'update_task': {
      const before = liveAssignment(raw.taskId, st)
      if (!before) return { ok: false, why: 'a change to a task that no longer exists' }

      const extra: Proposal[] = []
      let head: Proposal | null = null
      const take = (raw: Proposal) => {

        const p = { ...raw, warnings: [...(raw.warnings ?? [])] } as Proposal
        if (head) extra.push(p)
        else head = p
      }
      let alreadyWhy = ''

      if (typeof raw.done === 'boolean') {
        if (raw.done === (before.status === 'done'))
          alreadyWhy = `“${before.title}” is already ${raw.done ? 'finished' : 'open'}`
        else take({ ...base, id: uid(), type: 'complete_task', taskId: before.id, before, done: raw.done })
      }

      const date = parseDate(raw.date)
      if (date) {
        const prev = before.due ? new Date(before.due) : new Date(st.now)
        const toMs = instant(date, parseTime(raw.time), prev.getHours() * 60 + prev.getMinutes())
        const fromMs = +prev
        if (!plausible(toMs, st.now)) alreadyWhy ||= `“${before.title}” was moved outside this school year`
        else if (Math.abs(toMs - fromMs) < MIN) alreadyWhy ||= 'a deadline move to the same time'
        else {
          const warnings: string[] = []
          if (toMs > fromMs)
            warnings.push('This moves the deadline later. Only use it if the professor changed the deadline.')
          take({
            ...base,
            id: uid(),
            type: 'move_deadline',
            taskId: before.id,
            before,
            fromMs,
            toMs,
            warnings,
            sensitive: true,
          })
        }
      }

      const patch: Partial<Assignment> = {}
      const changes: { field: string; from: string; to: string }[] = []

      const title = text(raw.title, 120)
      if (title && title !== before.title) {
        patch.title = title
        changes.push({ field: 'Title', from: before.title, to: title })
      }
      const est = parseNum(raw.estimateMin, 5, 1200)
      if (est != null && est !== before.estimateMin) {
        patch.estimateMin = est
        changes.push({ field: 'Estimate', from: before.estimateMin ? `${before.estimateMin}m` : '—', to: `${est}m` })
      }
      const weight = positiveWeight(raw.weight)
      if (weight != null && weight !== before.weight) {
        patch.weight = weight
        changes.push({ field: 'Weight', from: before.weight != null ? `${before.weight}%` : '—', to: `${weight}%` })
      }
      if (typeof raw.started === 'boolean') {
        const want = raw.started ? 'doing' : 'todo'
        if (before.status === 'done')
          return { ok: false, why: `“${before.title}” is finished. Reopen it with done: false instead.` }
        if (before.status !== want) {
          patch.status = want
          changes.push({ field: 'Status', from: before.status, to: want === 'doing' ? 'in progress' : 'not started' })
        }
      }
      if (typeof raw.private === 'boolean' && raw.private !== !!before.private) {
        patch.private = raw.private

        changes.push({
          field: 'Privacy',
          from: before.private ? 'withheld from Nudge' : 'shared with Nudge',
          to: raw.private ? 'withheld from Nudge' : 'shared with Nudge',
        })
      }
      const grade = parseNum(raw.grade, 0, 100)
      if (grade != null && grade !== before.grade) {
        patch.grade = grade
        changes.push({ field: 'Grade', from: before.grade != null ? `${before.grade}%` : '—', to: `${grade}%` })
      }
      const notes = text(raw.notes, 400)
      if (notes && notes !== before.notes) {
        patch.notes = notes
        changes.push({ field: 'Note', from: before.notes ?? '—', to: notes })
      }
      if (typeof raw.courseCode === 'string' && raw.courseCode) {
        if (raw.courseCode === NO_COURSE) {
          if (before.courseId) {
            patch.courseId = null
            changes.push({ field: 'Course', from: courseName(before.courseId, st), to: '—' })
          }
        } else {
          const target = resolveCourse(raw.courseCode, st)
          if (target && target.id !== before.courseId) {
            patch.courseId = target.id
            changes.push({ field: 'Course', from: courseName(before.courseId, st), to: target.code })
          }
        }
      }
      const kindRaw = typeof raw.kind === 'string' ? raw.kind : ''
      if ((TASK_KINDS as readonly string[]).includes(kindRaw) && kindRaw !== before.kind) {
        patch.kind = kindRaw as TaskKind
        changes.push({ field: 'Type', from: before.kind, to: kindRaw })
      }

      if (changes.length) take({ ...base, id: uid(), type: 'update_task', taskId: before.id, before, patch, changes })

      if (!head) return { ok: false, why: alreadyWhy || `an edit to “${before.title}” that changed nothing` }
      return { ok: true, proposal: head, also: extra }
    }

    case 'split_task': {
      const before = liveAssignment(raw.taskId, st)
      if (!before) return { ok: false, why: 'a breakdown for a task that no longer exists' }
      const rawSteps: RawStep[] = Array.isArray(raw.steps) ? (raw.steps as RawStep[]) : []
      const steps: SplitTaskProposal['steps'] = []
      for (const s of rawSteps) {
        const title = text(s?.title, 120)
        if (!title) continue
        const estimateMin = parseNum(s?.estimateMin, 10, 480) ?? 45
        const d = parseDate(s?.date)
        const dueMs = d ? instant(d, null, 0) : undefined
        steps.push({ title, estimateMin, dueMs: dueMs && plausible(dueMs, st.now) ? dueMs : undefined })
      }
      if (steps.length < 2) return { ok: false, why: `a breakdown of “${before.title}” with fewer than two steps` }

      const warnings: string[] = []
      const dueMs = before.due ? +new Date(before.due) : Number.POSITIVE_INFINITY
      if (before.due && steps.some((s) => s.dueMs && s.dueMs > dueMs)) warnings.push('A step lands after the deadline')
      if (before.subtasks.length) warnings.push(`Replaces the ${before.subtasks.length} steps already there`)
      const replanned = st.blocks.filter(
        (b) => b.assignmentId === before.id && !b.done && +new Date(b.start) >= st.now,
      ).length
      if (replanned)
        warnings.push(`Replans the ${replanned} block${replanned === 1 ? '' : 's'} already set aside for it`)

      return { ok: true, proposal: { ...base, type, taskId: before.id, before, steps, warnings } }
    }

    case 'create_schedule_item': {
      const title = text(raw.title, 120)
      if (!title) return { ok: false, why: 'a schedule item with no title' }
      const date = parseDate(raw.date)
      if (!date) return { ok: false, why: `“${title}” had no usable date` }
      const kindRaw = typeof raw.kind === 'string' ? raw.kind : ''
      if (!(SCHEDULE_ITEM_KINDS as readonly string[]).includes(kindRaw))
        return { ok: false, why: `“${title}” had no usable schedule kind` }

      const kind = kindRaw as PlannerEventKind
      const allDay = kind === 'reading_break' || kind === 'holiday'
      const endDate = allDay ? parseDate(raw.endDate) ?? date : date
      if (+endDate < +date) return { ok: false, why: `“${title}” ends before it starts` }

      const startMin = allDay ? 0 : parseTime(raw.time)
      if (startMin == null) return { ok: false, why: `“${title}” needs a start time` }
      const durationMin = allDay ? 0 : snap(parseNum(raw.durationMin, 15, 720) ?? 0, 15)
      if (!allDay && durationMin < 15) return { ok: false, why: `“${title}” needs a duration` }

      const startMs = instant(date, startMin, 0)
      const endMs = allDay ? +atMinutes(endDate, 24 * 60) - 1 : startMs + durationMin * MIN
      if (!plausible(startMs, st.now)) return { ok: false, why: `“${title}” was dated outside this school year` }

      const course = resolveCourse(raw.courseCode, st)
      const warnings = overlapWarnings(startMs, endMs, st)
      if (startMs < st.now) warnings.push('This time has already passed')
      if (typeof raw.courseCode === 'string' && raw.courseCode && raw.courseCode !== NO_COURSE && !course)
        warnings.push(`No course called ${raw.courseCode}. This item will not be tied to a course.`)
      if (st.plannerEvents.some((event) => event.kind === kind && event.title.toLowerCase() === title.toLowerCase() && Math.abs(+new Date(event.start) - startMs) < 2 * 86_400_000))
        warnings.push('You already have a schedule item with this name around then')

      return {
        ok: true,
        proposal: {
          ...base,
          type,
          title,
          kind,
          courseId: course?.id ?? null,
          courseCode: course?.code ?? null,
          startMs,
          endMs,
          allDay,
          room: text(raw.room, 80) ?? undefined,
          warnings,
        },
      }
    }

    case 'update_schedule_item': {
      const before = liveScheduleItem(raw.eventId, st)
      if (!before) return { ok: false, why: 'a change to a schedule item that no longer exists' }

      const hasKind = typeof raw.kind === 'string' && raw.kind.length > 0
      if (hasKind && !(SCHEDULE_ITEM_KINDS as readonly string[]).includes(raw.kind as string))
        return { ok: false, why: `“${before.title}” had no usable schedule kind` }
      const kind = (hasKind ? raw.kind : before.kind) as PlannerEventKind
      const allDay = kind === 'reading_break' || kind === 'holiday'
      const date = parseDate(raw.date) ?? new Date(before.start)
      const priorEndDate = before.allDay ? new Date(+new Date(before.end) - 1) : date
      const endDate = allDay ? parseDate(raw.endDate) ?? (before.allDay ? priorEndDate : date) : date
      if (+endDate < +date) return { ok: false, why: `“${before.title}” ends before it starts` }

      const previousStartMin = new Date(before.start).getHours() * 60 + new Date(before.start).getMinutes()
      const startMin = allDay ? 0 : parseTime(raw.time) ?? (before.allDay ? null : previousStartMin)
      if (startMin == null) return { ok: false, why: `“${before.title}” needs a start time` }
      const previousDuration = (+new Date(before.end) - +new Date(before.start)) / MIN
      const durationMin = allDay ? 0 : snap(parseNum(raw.durationMin, 15, 720) ?? previousDuration, 15)
      if (!allDay && durationMin < 15) return { ok: false, why: `“${before.title}” needs a duration` }

      const startMs = instant(date, startMin, 0)
      const endMs = allDay ? +atMinutes(endDate, 24 * 60) - 1 : startMs + durationMin * MIN
      if (!plausible(startMs, st.now)) return { ok: false, why: `“${before.title}” was moved outside this school year` }

      const warnings = overlapWarnings(startMs, endMs, st, undefined, before.id)
      if (startMs < st.now) warnings.push('This time has already passed')

      let courseId = before.courseId ?? null
      if (typeof raw.courseCode === 'string' && raw.courseCode) {
        if (raw.courseCode === NO_COURSE) courseId = null
        else {
          const course = resolveCourse(raw.courseCode, st)
          if (course) courseId = course.id
          else warnings.push(`No course called ${raw.courseCode}. The course link stays unchanged.`)
        }
      }

      const title = text(raw.title, 120) ?? before.title
      const room = typeof raw.room === 'string' ? (text(raw.room, 80) ?? undefined) : before.room
      const after: PlannerEvent = {
        ...before,
        title,
        kind,
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        allDay,
        courseId,
        room,
      }

      const changes: UpdateScheduleItemProposal['changes'] = []
      if (after.title !== before.title) changes.push({ field: 'Name', from: before.title, to: after.title })
      if (after.kind !== before.kind) changes.push({ field: 'Kind', from: scheduleKindLabel(before.kind), to: scheduleKindLabel(after.kind) })
      if (after.start !== before.start || after.end !== before.end || after.allDay !== before.allDay)
        changes.push({ field: 'When', from: scheduleWhen(before), to: scheduleWhen(after) })
      if (after.courseId !== before.courseId)
        changes.push({ field: 'Course', from: courseName(before.courseId ?? null, st), to: courseName(after.courseId ?? null, st) })
      if (after.room !== before.room) changes.push({ field: 'Location', from: before.room ?? '—', to: after.room ?? '—' })
      if (!changes.length) return { ok: false, why: `an edit to “${before.title}” that changed nothing` }

      return { ok: true, proposal: { ...base, type, eventId: before.id, before, after, changes, warnings } }
    }

    case 'remove_schedule_item': {
      const before = liveScheduleItem(raw.eventId, st)
      if (!before) return { ok: false, why: 'a schedule item that no longer exists' }
      return { ok: true, proposal: { ...base, type, eventId: before.id, before } }
    }

    case 'schedule_block': {
      const date = parseDate(raw.date)
      if (!date) return { ok: false, why: 'a study block with no usable date' }
      const startMin = parseTime(raw.time)
      if (startMin == null) return { ok: false, why: 'a study block with no usable start time' }
      const durationMin = snap(parseNum(raw.durationMin, 15, 300) ?? 60, 15)
      const startMs = instant(date, startMin, 0)
      const endMs = startMs + durationMin * MIN
      if (!plausible(startMs, st.now)) return { ok: false, why: 'a study block outside this school year' }

      const assignment = liveAssignment(raw.taskId, st)
      if (typeof raw.taskId === 'string' && raw.taskId && !assignment)
        return { ok: false, why: 'a study block for a task that no longer exists' }
      const course = assignment?.courseId
        ? (st.courses.find((c) => c.id === assignment.courseId) ?? null)
        : resolveCourse(raw.courseCode, st)

      const warnings = overlapWarnings(startMs, endMs, st)
      if (startMs < st.now) warnings.push('This time has already passed')
      if (assignment?.due && startMs > +new Date(assignment.due)) warnings.push(`Falls after ${assignment.title} is due`)

      const title = text(raw.title, 90) ?? assignment?.title ?? course?.code ?? 'Study'

      return {
        ok: true,
        proposal: {
          ...base,
          type,
          assignmentId: assignment?.id ?? null,
          courseId: course?.id ?? null,
          title,
          startMs,
          endMs,
          warnings,
        },
      }
    }

    case 'move_block': {
      const before = liveBlock(raw.blockId, st)
      if (!before) return { ok: false, why: 'a move for a study block that no longer exists' }
      const date = parseDate(raw.date)
      const startMin = parseTime(raw.time)
      const newDuration = parseNum(raw.durationMin, 15, 300)

      const patch: Partial<StudyBlock> = {}
      const changes: { field: string; from: string; to: string }[] = []
      const byId = new Map(st.assignments.map((a) => [a.id, a]))
      if (typeof raw.taskId === 'string' && raw.taskId) {
        const target = liveAssignment(raw.taskId, st)
        if (!target) return { ok: false, why: 'a block pointed at a task that no longer exists' }
        if (target.id !== before.assignmentId) {
          patch.assignmentId = target.id
          patch.courseId = target.courseId
          const wasFor = before.assignmentId ? byId.get(before.assignmentId)?.title : undefined
          changes.push({ field: 'For', from: wasFor ?? before.title ?? '—', to: target.title })
        }
      } else if (typeof raw.courseCode === 'string' && raw.courseCode && raw.courseCode !== NO_COURSE) {
        const course = resolveCourse(raw.courseCode, st)
        if (course && course.id !== before.courseId) {
          patch.assignmentId = null
          patch.courseId = course.id
          changes.push({ field: 'For', from: before.title ?? '—', to: course.code })
        }
      }

      const newTitle = group === 'rename_blocks' ? text(raw.title, 90) : null
      if (group === 'rename_blocks' && !newTitle) return { ok: false, why: 'a block rename with no name' }
      if (newTitle && newTitle !== before.title) {
        patch.title = newTitle
        changes.push({ field: 'Label', from: before.title ?? '—', to: newTitle })
      }

      if (!date && startMin == null && newDuration == null && !changes.length)
        return { ok: false, why: 'a block change with no date, time, length, task or label' }

      const fromStartMs = +new Date(before.start)
      const fromEndMs = +new Date(before.end)
      const currentMin = new Date(fromStartMs).getHours() * 60 + new Date(fromStartMs).getMinutes()
      const durationMin = snap(newDuration ?? (fromEndMs - fromStartMs) / MIN, 15)

      const startMs = instant(date ?? new Date(fromStartMs), startMin ?? currentMin, currentMin)
      const endMs = startMs + durationMin * MIN
      if (!plausible(startMs, st.now)) return { ok: false, why: 'a block moved outside this school year' }
      if (startMs === fromStartMs && endMs === fromEndMs && !changes.length)
        return { ok: false, why: 'a block move that changed nothing' }

      const warnings = overlapWarnings(startMs, endMs, st, before.id)
      if (startMs < st.now) warnings.push('Moves it into the past')
      const linked = before.assignmentId ? liveAssignment(before.assignmentId, st) : null
      if (linked?.due && startMs > +new Date(linked.due)) warnings.push(`Falls after ${linked.title} is due`)

      return {
        ok: true,
        proposal: {
          ...base,
          type,
          blockId: before.id,
          before,
          fromStartMs,
          fromEndMs,
          startMs,
          endMs,
          warnings,
          patch: changes.length ? patch : undefined,
          changes: changes.length ? changes : undefined,
        },
      }
    }

    case 'remove_block': {
      const before = liveBlock(raw.blockId, st)
      if (!before) return { ok: false, why: 'a deletion for a study block that no longer exists' }
      return { ok: true, proposal: { ...base, type, blockId: before.id, before } }
    }

    case 'focus_today':
    case 'remove_from_today': {
      const before = liveAssignment(raw.taskId, st)
      if (!before) return { ok: false, why: 'a today-list change for a task that no longer exists' }
      const on = raw.onToday !== false
      if (on && before.status === 'done') return { ok: false, why: `“${before.title}” is already finished` }
      if (st.todayIds) {
        const already = st.todayIds.has(before.id)
        if (on === already)
          return { ok: false, why: `“${before.title}” is already ${already ? 'on' : 'off'} today’s list` }
      }
      return {
        ok: true,
        proposal: { ...base, type: on ? 'focus_today' : 'remove_from_today', taskId: before.id, before },
      }
    }

    case 'delete_task': {
      const before = liveAssignment(raw.taskId, st)
      if (!before) return { ok: false, why: 'a deletion for a task that no longer exists' }
      const warnings: string[] = []
      const logged = st.blocks.filter((b) => b.assignmentId === before.id).length
      if (logged) warnings.push(`${logged} study block${logged === 1 ? '' : 's'}点`.replace('点', ' will lose their link'))
      if (before.status === 'done') warnings.push('This task is already finished. Deleting it removes the record.')

      return { ok: true, proposal: { ...base, type, taskId: before.id, before, warnings, sensitive: true } }
    }

    case 'create_course': {
      const code = text(raw.code, 20)
      if (!code) return { ok: false, why: 'a course with no code' }
      const normalized = code.toUpperCase().replace(/[\s\-_]+/g, ' ').trim()
      const dup = st.courses.find(
        (c) => c.code.toUpperCase().replace(/[\s\-_]+/g, '') === normalized.replace(/\s+/g, ''),
      )
      if (dup) return { ok: false, why: `${dup.code}, which you already have` }
      return {
        ok: true,
        proposal: {
          ...base,
          type,
          code: normalized,
          title: text(raw.title, 80) ?? undefined,
          meetings: parseMeetings(raw.meetings),
        },
      }
    }

    case 'update_course': {
      const before = resolveCourse(raw.courseCode, st)
      if (!before) return { ok: false, why: 'an edit to a course that does not exist' }
      const patch: Partial<Course> = {}
      const changes: { field: string; from: string; to: string }[] = []

      const title = text(raw.title, 80)
      if (title && title !== before.title) {
        patch.title = title
        changes.push({ field: 'Name', from: before.title ?? '—', to: title })
      }
      const prof = text(raw.professor, 60)
      if (prof && prof !== before.professor) {
        patch.professor = prof
        changes.push({ field: 'Instructor', from: before.professor ?? '—', to: prof })
      }
      const room = text(raw.room, 40)
      if (room && room !== before.room) {
        patch.room = room
        changes.push({ field: 'Room', from: before.room ?? '—', to: room })
      }
      const newCode = text(raw.newCode, 20)
      if (newCode && newCode.toUpperCase() !== before.code.toUpperCase()) {
        patch.code = newCode
        changes.push({ field: 'Code', from: before.code, to: newCode })
      }
      const current = parseNum(raw.currentGrade, 0, 100)
      if (current != null && current !== before.currentGrade) {
        patch.currentGrade = current
        changes.push({ field: 'Current', from: before.currentGrade != null ? `${before.currentGrade}%` : '—', to: `${current}%` })
      }
      const slot = parseNum(raw.colorSlot, 1, 8)
      if (slot != null && slot !== before.color) {
        patch.color = slot as Course['color']
        changes.push({ field: 'Colour', from: `${before.color}`, to: `${slot}` })
      }
      const target = parseNum(raw.targetGrade, 0, 100)
      if (target != null && target !== before.targetGrade) {
        patch.targetGrade = target
        changes.push({ field: 'Target', from: before.targetGrade != null ? `${before.targetGrade}%` : '—', to: `${target}%` })
      }
      const meetings = parseMeetings(raw.meetings)
      if (meetings.length) {
        patch.meetings = meetings.map((m) => ({ ...m, id: uid() }))

        const fmt = (list: { day: number; start: number; end: number; kind?: string; room?: string }[]) =>
          list.length
            ? list
                .map(
                  (m) =>
                    `${WEEKDAYS[m.day]} ${String(Math.floor(m.start / 60)).padStart(2, '0')}:${String(m.start % 60).padStart(2, '0')}` +
                    `${m.kind ? ` ${m.kind}` : ''}${m.room ? ` in ${m.room}` : ''}`,
                )
                .join(', ')
            : 'none'
        changes.push({ field: 'Classes', from: fmt(before.meetings), to: fmt(meetings) })
      }

      if (!changes.length) return { ok: false, why: `an edit to ${before.code} that changed nothing` }
      return { ok: true, proposal: { ...base, type, courseId: before.id, before, patch, changes } }
    }

    case 'update_settings': {
      const cur = st.settings
      if (!cur) return { ok: false, why: 'a settings change with no settings to compare against' }
      const patch: Partial<Settings> = {}
      const changes: { field: string; from: string; to: string }[] = []

      const cap = parseNum(raw.dailyCapacityMin, 30, 720)
      if (cap != null && cap !== cur.dailyCapacityMin) {
        patch.dailyCapacityMin = cap
        changes.push({ field: 'Study time per day', from: fmtDuration(cur.dailyCapacityMin), to: fmtDuration(cap) })
      }

      const win = (raw.plannerWindow ?? {}) as { startHour?: unknown; endHour?: unknown }
      const startH = parseNum(win.startHour, 0, 23)
      const endH = parseNum(win.endHour, 1, 24)
      if (startH != null && endH != null && endH <= startH)
        return { ok: false, why: 'a planner window that ends before it starts' }
      if (startH != null && startH !== cur.dayStartHour) {
        patch.dayStartHour = startH
        changes.push({ field: 'Planner starts', from: `${cur.dayStartHour}:00`, to: `${startH}:00` })
      }
      if (endH != null && endH !== cur.dayEndHour) {
        patch.dayEndHour = endH
        changes.push({ field: 'Planner ends', from: `${cur.dayEndHour}:00`, to: `${endH}:00` })
      }
      const focus = parseNum(raw.focusMin, 5, 120)
      if (focus != null && focus !== cur.focusMin) {
        patch.focusMin = focus
        changes.push({ field: 'Focus round', from: `${cur.focusMin}m`, to: `${focus}m` })
      }
      const shortB = parseNum(raw.shortBreakMin, 1, 60)
      if (shortB != null && shortB !== cur.shortBreakMin) {
        patch.shortBreakMin = shortB
        changes.push({ field: 'Short break', from: `${cur.shortBreakMin}m`, to: `${shortB}m` })
      }
      const longB = parseNum(raw.longBreakMin, 5, 120)
      if (longB != null && longB !== cur.longBreakMin) {
        patch.longBreakMin = longB
        changes.push({ field: 'Long break', from: `${cur.longBreakMin}m`, to: `${longB}m` })
      }
      const every = parseNum(raw.longBreakEvery, 2, 8)
      if (every != null && every !== cur.longBreakEvery) {
        patch.longBreakEvery = every
        changes.push({ field: 'Long break every', from: `${cur.longBreakEvery}`, to: `${every}` })
      }
      if (typeof raw.sound === 'boolean' && raw.sound !== cur.sound) {
        patch.sound = raw.sound
        changes.push({ field: 'Chime', from: cur.sound ? 'on' : 'off', to: raw.sound ? 'on' : 'off' })
      }
      const themeRaw = typeof raw.theme === 'string' ? raw.theme : ''
      if ((THEMES as readonly string[]).includes(themeRaw) && themeRaw !== cur.theme) {
        patch.theme = themeRaw as Settings['theme']
        changes.push({ field: 'Appearance', from: cur.theme, to: themeRaw })
      }
      const paletteRaw = typeof raw.palette === 'string' ? raw.palette : ''
      if ((PALETTES as readonly string[]).includes(paletteRaw) && paletteRaw !== cur.palette) {
        patch.palette = paletteRaw as Settings['palette']
        changes.push({ field: 'Color theme', from: cur.palette, to: paletteRaw })
      }
      const callMe = text(raw.name, 40)
      if (callMe && callMe !== cur.name) {
        patch.name = callMe
        changes.push({ field: 'Name', from: cur.name ?? '—', to: callMe })
      }
      const toneRaw = typeof raw.tone === 'string' ? raw.tone : ''
      if ((TONES as readonly string[]).includes(toneRaw) && toneRaw !== cur.tone) {
        patch.tone = toneRaw as Settings['tone']
        changes.push({ field: 'Tone', from: cur.tone, to: toneRaw })
      }

      if (!changes.length) return { ok: false, why: 'a settings change that changed nothing' }

      const warnings = patch.dailyCapacityMin != null ? ['This changes every deadline estimate in Nudge'] : []
      return { ok: true, proposal: { ...base, type, patch, changes, warnings } }
    }

    case 'add_step':
    case 'update_step':
    case 'remove_step': {
      const before = liveAssignment(raw.taskId, st)
      if (!before) return { ok: false, why: 'a step change on a task that no longer exists' }

      const adding = group === 'update_steps' && !raw.stepId
      if (type === 'add_step' || adding) {
        const title = text(raw.title, 120)
        if (!title) return { ok: false, why: 'a step with no wording' }
        const d = parseDate(raw.date)
        const dueMs = d ? instant(d, null, 0) : undefined
        return {
          ok: true,
          proposal: {
            ...base,
            type: 'add_step',
            taskId: before.id,
            before,
            title,
            estimateMin: parseNum(raw.estimateMin, 5, 480) ?? undefined,
            dueMs: dueMs && plausible(dueMs, st.now) ? dueMs : undefined,
          },
        }
      }

      const stepBefore = before.subtasks.find((x) => x.id === raw.stepId)
      if (!stepBefore) return { ok: false, why: `a step of “${before.title}” that no longer exists` }
      if (group === 'complete_steps' && typeof raw.done !== 'boolean')
        return { ok: false, why: `a step of “${before.title}” ticked neither on nor off` }

      if (type === 'remove_step')
        return { ok: true, proposal: { ...base, type, taskId: before.id, before, stepId: stepBefore.id, stepBefore } }

      const title = text(raw.title, 120)
      const done = typeof raw.done === 'boolean' ? raw.done : undefined
      const estimateMin = parseNum(raw.estimateMin, 5, 480) ?? undefined
      const changed =
        (title && title !== stepBefore.title) ||
        (done != null && done !== stepBefore.done) ||
        (estimateMin != null && estimateMin !== stepBefore.estimateMin)
      if (!changed) return { ok: false, why: `a step edit on “${before.title}” that changed nothing` }
      return {
        ok: true,
        proposal: {
          ...base,
          type,
          taskId: before.id,
          before,
          stepId: stepBefore.id,
          stepBefore,
          title: title ?? undefined,
          done,
          estimateMin,
        },
      }
    }

    case 'reorder_today': {
      const before = liveAssignment(raw.taskId, st)
      if (!before) return { ok: false, why: 'a reorder for a task that no longer exists' }
      const order = st.todayOrder ?? []
      const fromIndex = order.indexOf(before.id)
      if (fromIndex < 0) return { ok: false, why: `“${before.title}” is not on today’s list to be moved` }
      const wanted = parseNum(raw.position, 1, 20)
      if (wanted == null) return { ok: false, why: `a place in today’s list for “${before.title}” that is not a number` }
      const toIndex = clamp(wanted - 1, 0, order.length - 1)
      if (toIndex === fromIndex) return { ok: false, why: `“${before.title}” is already ${wanted === 1 ? 'first' : `#${wanted}`}` }
      return {
        ok: true,
        proposal: { ...base, type, taskId: before.id, before, fromPosition: fromIndex + 1, toPosition: toIndex + 1 },
      }
    }

    case 'archive_course': {
      const before = resolveAnyCourse(raw.courseCode, st)
      if (!before) return { ok: false, why: 'an archive for a course that does not exist' }
      if (typeof raw.archived !== 'boolean') return { ok: false, why: `${before.code} archived neither on nor off` }
      if (!!before.archived === raw.archived)
        return { ok: false, why: `${before.code} is already ${raw.archived ? 'archived' : 'active'}` }
      const taskCount = st.assignments.filter((a) => a.courseId === before.id).length
      return { ok: true, proposal: { ...base, type, courseId: before.id, before, archived: raw.archived, taskCount } }
    }

    case 'mute_nudge': {
      const id = typeof raw.nudgeId === 'string' ? raw.nudgeId.trim() : ''
      const live = st.nudges?.find((n) => n.id === id)
      if (!live) return { ok: false, why: 'a prompt to silence that is not on screen' }
      return { ok: true, proposal: { ...base, type, nudgeId: live.id, text: live.text } }
    }

    case 'duplicate_block':
    case 'complete_block': {
      const before = liveBlock(raw.blockId, st)
      if (!before) return { ok: false, why: 'a change to a study block that no longer exists' }
      if (type === 'complete_block') {
        const done = raw.done !== false
        if (done === !!before.done) return { ok: false, why: `that block is already ${done ? 'done' : 'open'}` }
        return { ok: true, proposal: { ...base, type, blockId: before.id, before, done } }
      }
      return { ok: true, proposal: { ...base, type, blockId: before.id, before } }
    }

    case 'delete_course': {
      const before = resolveCourse(raw.courseCode, st)
      if (!before) return { ok: false, why: 'a removal of a course that does not exist' }
      const taskCount = st.assignments.filter((a) => a.courseId === before.id && !a.archived).length
      const warnings: string[] = []
      if (taskCount) warnings.push(`${taskCount} task${taskCount === 1 ? '' : 's'} will lose their course`)
      return { ok: true, proposal: { ...base, type, courseId: before.id, before, taskCount, warnings, sensitive: true } }
    }

    case 'log_session': {
      const minutes = parseNum(raw.minutes, 5, 720)
      if (minutes == null) return { ok: false, why: 'logged time with no length' }
      const task = liveAssignment(raw.taskId, st)
      const course = task?.courseId
        ? (st.courses.find((c) => c.id === task.courseId) ?? null)
        : resolveCourse(raw.courseCode, st)
      const d = parseDate(raw.date)
      const startMs = instant(d ?? new Date(st.now), parseTime(raw.time), 18 * 60)
      if (!plausible(startMs, st.now)) return { ok: false, why: 'logged time outside this school year' }
      const warnings: string[] = []
      if (startMs > st.now + 60 * 60_000) warnings.push('That is in the future')
      return {
        ok: true,
        proposal: {
          ...base,
          type,
          minutes,
          taskId: task?.id ?? null,
          courseId: course?.id ?? null,
          label: task?.title ?? course?.code ?? 'Study',
          startMs,
          warnings,
        },
      }
    }

    case 'move_deadline':
    case 'complete_task':
      return { ok: false, why: 'an unroutable change' }

    case 'study_session': {
      const rawSegs: RawSegment[] = Array.isArray(raw.segments) ? (raw.segments as RawSegment[]) : []
      const segments: StudySessionProposal['segments'] = []
      for (const s of rawSegs) {
        const label = text(s?.label, 90)
        const minutes = parseNum(s?.minutes, 3, 180)
        if (!label || minutes == null) continue
        const segKind = typeof s?.kind === 'string' ? s.kind : ''
        const kind = (SEGMENT_KINDS as readonly string[]).includes(segKind)
          ? (segKind as (typeof SEGMENT_KINDS)[number])
          : 'focus'
        const taskId = liveAssignment(s?.taskId, st)?.id
        segments.push({ kind, minutes, label, taskId })
      }
      if (!segments.length) return { ok: false, why: 'a study session with no segments' }

      const totalMin = segments.reduce((sum, s) => sum + s.minutes, 0)
      const date = parseDate(raw.date)
      const startMin = parseTime(raw.time)

      const nextQuarter = Math.ceil(st.now / (15 * 60_000)) * (15 * 60_000)
      const startMs =
        date || startMin != null
          ? instant(date ?? new Date(st.now), startMin, new Date(st.now).getHours() * 60)
          : nextQuarter

      const warnings: string[] = []
      if (totalMin > 240) warnings.push('That is a long study session. Most people lose focus after about two hours.')

      return { ok: true, proposal: { ...base, type, segments, totalMin, startMs, warnings } }
    }
  }
}

export function parseReply(raw: string): RawReply | null {
  const trimmed = raw.trim()
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    : trimmed
  try {
    const parsed = JSON.parse(unfenced)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as RawReply) : null
  } catch {
    return null
  }
}

const COMMAND_LABEL: Record<string, string> = {
  open_today: 'Opened Today',
  open_planner: 'Opened the planner',
  open_courses: 'Opened Courses',
  open_progress: 'Opened Progress',
  open_task: 'Opened the task',
  open_course: 'Opened the course',
  open_settings: 'Opened Settings',
  open_add_task: 'Opened Add task',
  open_shortcuts: 'Showed the shortcuts',
  open_export: 'Opened your backup',
  open_import: 'Opened Import',
  open_erase_confirm: 'Asked you to confirm erasing everything',
  start_focus: 'Started the timer',
  pause_timer: 'Paused the timer',
  resume_timer: 'Resumed the timer',
  next_round: 'Started the next round',
  stop_timer: 'Stopped the timer',
  finish_and_stop: 'Finished and stopped the timer',
  show_focus: 'Opened focus mode',
  hide_focus: 'Minimised focus mode',
  next_week: 'Moved to next week',
  previous_week: 'Moved to last week',
  this_week: 'Back to this week',
  toggle_class_times: 'Toggled class times',
  fill_gaps: 'Filled the free slots',
  load_sample_data: 'Asked you to confirm loading the sample semester',
  undo: 'Undid the last change',
}

function validateCommands(raw: unknown, st: ValidationState): { commands: Command[]; rejected: string[] } {
  const commands: Command[] = []
  const rejected: string[] = []
  if (!Array.isArray(raw)) return { commands, rejected }

  for (const item of raw.slice(0, 8) as RawItem[]) {
    const action = typeof item?.action === 'string' ? item.action : ''
    if (!(COMMANDS as readonly string[]).includes(action)) {
      rejected.push(`an interface action Nudge does not have (“${action}”)`)
      continue
    }
    const task = liveAssignment(item.taskId, st)
    if (action === 'open_task' && !task) {
      rejected.push('opening a task that no longer exists')
      continue
    }

    if (action === 'start_focus' && typeof item.taskId === 'string' && item.taskId && !task) {
      rejected.push('starting a timer on a task that could not be found')
      continue
    }
    const course = resolveCourse(item.courseCode, st)
    if (action === 'open_course' && !course) {
      rejected.push('opening a course that does not exist')
      continue
    }

    const block = action === 'start_focus' ? liveBlock(item.blockId, st) : null
    commands.push({
      id: uid(),
      action,
      reason: text(item.reason, 120) ?? '',
      taskId: task?.id ?? (block?.assignmentId ?? undefined),
      blockId: block?.id,
      courseId: course?.id,
      minutes: parseNum(item.minutes, 1, 180) ?? undefined,
      label: COMMAND_LABEL[action] ?? 'Done',
    })
  }
  return { commands, rejected }
}

const VIEW_FALLBACK_TITLE: Record<ViewKind, string> = {
  agenda: 'Coming up',
  timetable: 'Class times',
  task: 'This task',
  work: 'Your work',
  course: 'This course',
  day: 'That day',
  workload: 'How full your days are',
  progress: 'What you have done',
}

function validateViews(raw: unknown, st: ValidationState): { views: View[]; rejected: string[] } {
  const views: View[] = []
  const rejected: string[] = []
  if (!Array.isArray(raw)) return { views, rejected }

  const seen = new Set<string>()

  for (const item of raw as RawItem[]) {
    if (views.length >= MAX_VIEWS) break

    const kindRaw = typeof item.kind === 'string' ? item.kind.trim().toLowerCase() : ''
    if (!(VIEW_KINDS as readonly string[]).includes(kindRaw)) {
      rejected.push(`a card Nudge does not have (\u201c${kindRaw || 'unnamed'}\u201d)`)
      continue
    }
    const kind = kindRaw as ViewKind

    const days = parseNum(item.days, 1, 30) ?? DEFAULT_DAYS[kind]

    const course = resolveAnyCourse(item.courseCode, st)
    const title = text(item.title, 60)

    let view: View | null = null

    switch (kind) {
      case 'agenda':
        view = { id: uid(), kind, title: title ?? VIEW_FALLBACK_TITLE.agenda, days, courseId: course?.id }
        break

      case 'timetable':
        view = { id: uid(), kind, title: title ?? (course ? `${course.code} class times` : VIEW_FALLBACK_TITLE.timetable), courseId: course?.id }
        break

      case 'task': {
        const task = st.assignments.find((a) => a.id === item.taskId)
        if (!task) {
          rejected.push('a card about a task that is not in your data')
          continue
        }
        view = { id: uid(), kind, title: title ?? task.title, taskId: task.id }
        break
      }

      case 'work': {
        const statusRaw = typeof item.status === 'string' ? item.status.trim().toLowerCase() : ''
        const status = (WORK_FILTERS as readonly string[]).includes(statusRaw)
          ? (statusRaw as 'open' | 'done' | 'all')
          : 'open'
        view = {
          id: uid(),
          kind,
          title: title ?? VIEW_FALLBACK_TITLE.work,
          courseId: course?.id,

          days: parseNum(item.days, 1, 30) ?? undefined,
          status,
        }
        break
      }

      case 'course':
        if (!course) {
          rejected.push('a card for a course that is not in Nudge')
          continue
        }
        view = { id: uid(), kind, title: title ?? course.code, courseId: course.id }
        break

      case 'day': {

        const parsed = parseDate(item.date)
        view = { id: uid(), kind, title: title ?? VIEW_FALLBACK_TITLE.day, day: dayKey(parsed ?? st.now) }
        break
      }

      case 'workload':
        view = { id: uid(), kind, title: title ?? VIEW_FALLBACK_TITLE.workload, days }
        break

      case 'progress':
        view = { id: uid(), kind, title: title ?? VIEW_FALLBACK_TITLE.progress, days }
        break
    }

    if (!view) continue

    const key = [
      view.kind,
      'courseId' in view ? view.courseId : '',
      'taskId' in view ? view.taskId : '',
      'day' in view ? view.day : '',
      'days' in view ? view.days : '',
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    views.push(view)
  }

  return { views, rejected }
}

const orderOf = (p: Proposal): number => {
  if (p.type === 'create_course') return -1
  if (p.type === 'create_schedule_item') return p.startMs
  if (p.type === 'update_schedule_item') return +new Date(p.after.start)
  if (p.type === 'schedule_block' || p.type === 'move_block') return p.startMs
  if (p.type === 'study_session') return p.startMs
  if (p.type === 'move_deadline') return p.toMs
  if (p.type === 'create_task') return p.dueMs
  return 0
}

export function validateReply(raw: RawReply | null, st: ValidationState): ValidatedReply | null {
  if (!raw) return null

  const message = text(raw.message, 600)
  const proposals: Proposal[] = []
  const rejected: { type: string; why: string }[] = []

  const { commands, rejected: badCommands } = validateCommands(raw.commands, st)
  for (const why of badCommands) rejected.push({ type: 'command', why })

  const { views, rejected: badViews } = validateViews(raw.views, st)
  for (const why of badViews) rejected.push({ type: 'view', why })

  const proposedCourses: Course[] = Array.isArray(raw.create_courses)
    ? (raw.create_courses as RawItem[]).flatMap((item, index) => {
        const code = text(item?.code, 20)
        if (!code) return []
        const normalized = code.toUpperCase().replace(/[\s\-_]+/g, ' ').trim()
        if (
          st.courses.some(
            (course) => course.code.toUpperCase().replace(/[\s\-_]+/g, '') === normalized.replace(/\s+/g, ''),
          )
        )
          return []
        return [
          {
            id: `proposal-course-${index}`,
            code: normalized,
            title: text(item?.title, 80) ?? undefined,
            color: 1,
            meetings: parseMeetings(item?.meetings).map((meeting) => ({ ...meeting, id: uid() })),
            createdAt: new Date(st.now).toISOString(),
          },
        ]
      })
    : []
  const proposalState =
    proposedCourses.length > 0 ? { ...st, courses: [...st.courses, ...proposedCourses] } : st

  let budget = 24
  for (const group of groupsFor()) {

    if (group === 'commands' || group === 'views') continue
    const list = raw[group]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (budget <= 0) break
      budget--
      const outcome = validateItem(group, (item ?? {}) as RawItem, group === 'create_courses' ? st : proposalState)
      if (outcome.ok) {
        proposals.push(outcome.proposal)

        if (outcome.also?.length) proposals.push(...outcome.also)
      } else rejected.push({ type: GROUP_TYPE[group] ?? group, why: outcome.why })
    }
  }

  const placed = proposals.filter(
    (p): p is Extract<Proposal, { startMs: number; endMs?: number }> =>
      p.type === 'schedule_block' || p.type === 'study_session' || p.type === 'move_block',
  )
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]
      const b = placed[j]
      const aEnd = 'endMs' in a && a.endMs ? a.endMs : a.startMs + ('totalMin' in a ? a.totalMin : 0) * MIN
      const bEnd = 'endMs' in b && b.endMs ? b.endMs : b.startMs + ('totalMin' in b ? b.totalMin : 0) * MIN
      if (a.startMs < bEnd && b.startMs < aEnd) {
        const note = 'Overlaps another block in this same proposal'
        if (!a.warnings.includes(note)) a.warnings.push(note)
        if (!b.warnings.includes(note)) b.warnings.push(note)
      }
    }
  }

  proposals.sort((a, b) => {
    const oa = orderOf(a)
    const ob = orderOf(b)
    if (oa && ob) return oa - ob
    return 0
  })

  if (!message && !proposals.length && !commands.length && !views.length) return null

  const intentRaw = raw.intent
  const intent: ValidatedReply['intent'] =
    intentRaw === 'plan' || intentRaw === 'advice' || intentRaw === 'question' || intentRaw === 'answer'
      ? intentRaw
      : proposals.length
        ? 'plan'
        : 'answer'

  const question = text(raw.question, 200) ?? undefined

  return {
    intent: intent === 'question' && !question ? 'answer' : intent,
    message: message ?? '',
    headline: text(raw.headline, 40) ?? undefined,
    assumptions: (Array.isArray(raw.assumptions) ? raw.assumptions : [])
      .map((a) => text(a, 120))
      .filter((a): a is string => !!a)
      .slice(0, 3),
    question,
    proposals,
    views,
    commands,
    rejected,
  }
}

export function revalidate(proposals: Proposal[], st: ValidationState): { live: Proposal[]; stale: Proposal[] } {
  const live: Proposal[] = []
  const stale: Proposal[] = []
  for (const p of proposals) {
    let ok = true
    if ('taskId' in p && p.taskId) ok = !!liveAssignment(p.taskId, st)
    if (ok && 'blockId' in p && p.blockId) ok = !!liveBlock(p.blockId, st)
    if (ok && 'eventId' in p && p.eventId) ok = !!liveScheduleItem(p.eventId, st)
    if (ok && p.type === 'schedule_block' && p.assignmentId) ok = !!liveAssignment(p.assignmentId, st)
    ;(ok ? live : stale).push(p)
  }
  return { live, stale }
}

export function summarize(p: Proposal): string {
  switch (p.type) {
    case 'create_task':
      return `Add “${p.title}”`
    case 'update_task':
      return `Edit “${p.before.title}”`
    case 'move_deadline':
      return `Move ${p.before.title}’s deadline`
    case 'split_task':
      return `Break “${p.before.title}” into ${p.steps.length} steps`
    case 'create_schedule_item':
      return `Add ${p.kind === 'exam' ? 'exam' : 'schedule item'} “${p.title}”`
    case 'update_schedule_item':
      return `Edit “${p.before.title}”`
    case 'remove_schedule_item':
      return `Remove “${p.before.title}”`
    case 'schedule_block':
      return `Study block: ${p.title}`
    case 'move_block': {

      const sameStart = p.startMs === p.fromStartMs
      const label = p.before.title ?? 'study block'
      if (sameStart) return `${p.endMs - p.startMs > p.fromEndMs - p.fromStartMs ? 'Lengthen' : 'Shorten'} ${label}`
      return `Move ${label}`
    }
    case 'remove_block':
      return `Remove ${p.before.title ?? 'study block'}`
    case 'focus_today':
      return `Put “${p.before.title}” on today`
    case 'study_session':
      return `${p.totalMin}-minute session`
    case 'remove_from_today':
      return `Take “${p.before.title}” off today`
    case 'complete_task':
      return p.done ? `Finish “${p.before.title}”` : `Reopen “${p.before.title}”`
    case 'delete_task':
      return `Delete “${p.before.title}”`
    case 'create_course':
      return `Add ${p.code}`
    case 'update_course':
      return `Edit ${p.before.code}`
    case 'update_settings':
      return 'Change planning settings'
    case 'add_step':
      return `Add a step to “${p.before.title}”`
    case 'update_step':
      return `Edit a step of “${p.before.title}”`
    case 'remove_step':
      return `Remove a step from “${p.before.title}”`
    case 'duplicate_block':
      return 'Duplicate a study block'
    case 'complete_block':
      return p.done ? 'Tick off a study block' : 'Reopen a study block'
    case 'delete_course':
      return `Remove ${p.before.code}`
    case 'log_session':
      return `Log ${p.minutes}m on ${p.label}`
    case 'mute_nudge':
      return 'Silence that for today'
    case 'reorder_today':
      return p.toPosition === 1 ? `Put “${p.before.title}” first today` : `Move “${p.before.title}” to #${p.toPosition}`
    case 'archive_course':
      return p.archived ? `Archive ${p.before.code}` : `Restore ${p.before.code}`

  }
}

export { dayKey }
