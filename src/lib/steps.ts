import { uid } from './id'
import { scheduleSteps } from './autoSchedule'
import { addDays, atMinutes, daysBetween, startOfDay } from './date'
import type {
  Assignment,
  Course,
  ID,
  PlannerEvent,
  ScheduleOverride,
  Settings,
  StudyBlock,
  Subtask,
} from './types'

export interface DraftStep {
  title: string
  estimateMin?: number
  dayMs?: number
}

export function placeSteps(opts: {
  assignment: Assignment
  steps: DraftStep[]
  blocks: StudyBlock[]
  courses: Course[]
  plannerEvents?: PlannerEvent[]
  scheduleOverrides?: ScheduleOverride[]
  settings: Settings
  now: number
  schedule?: boolean
}): { subtasks: Subtask[]; blocks: StudyBlock[] } {
  const { assignment, steps, blocks, courses, settings, now } = opts

  const dueMs = assignment.due ? +new Date(assignment.due) : now + 7 * 86400000
  const bookable = opts.schedule !== false && assignment.status !== 'done' && !assignment.archived

  const slots = !bookable
    ? steps.map(() => null)
    : scheduleSteps({
        steps: spread(steps, dueMs, now),
        dueMs,
        blocks,
        courses,
        plannerEvents: opts.plannerEvents,
        scheduleOverrides: opts.scheduleOverrides,
        now,
        dayStartHour: settings.dayStartHour,
        dayEndHour: settings.dayEndHour,
        dailyCapacityMin: settings.dailyCapacityMin,
      })

  const createdAt = new Date(now).toISOString()
  const subtasks: Subtask[] = []
  const made: StudyBlock[] = []

  steps.forEach((s, i) => {
    const slot = slots[i]
    const id = uid()

    subtasks.push({
      id,
      title: s.title,
      done: false,
      estimateMin: s.estimateMin,
      due: slot ? new Date(slot.end).toISOString() : unbooked(s, dueMs, settings.dayEndHour, now),
    })
    if (!slot) return
    made.push({
      id: uid(),
      courseId: assignment.courseId,
      assignmentId: assignment.id,
      subtaskId: id,
      start: new Date(slot.start).toISOString(),
      end: new Date(slot.end).toISOString(),
      done: false,
      createdAt,
    })
  })

  return { subtasks, blocks: made }
}

function unbooked(step: DraftStep, dueMs: number, dayEndHour: number, now: number): string | undefined {
  if (!step.dayMs) return undefined
  const endOfDay = Math.min(+atMinutes(startOfDay(step.dayMs), dayEndHour * 60), dueMs)
  return new Date(endOfDay < now && dueMs > now ? dueMs : endOfDay).toISOString()
}

function spread(steps: DraftStep[], dueMs: number, now: number): DraftStep[] {
  if (steps.every((s) => s.dayMs != null)) return steps
  const span = Math.max(0, daysBetween(now, dueMs))
  const midnight = +startOfDay(now)
  return steps.map((s, i) =>
    s.dayMs != null ? s : { ...s, dayMs: +addDays(midnight, Math.round(((i + 1) * span) / (steps.length + 1))) },
  )
}

export const stepOf = (block: StudyBlock, assignment?: Assignment): Subtask | undefined =>
  block.subtaskId && assignment ? assignment.subtasks.find((s) => s.id === block.subtaskId) : undefined

export const blockOf = (blocks: StudyBlock[], subtaskId: ID): StudyBlock | undefined =>
  blocks.find((b) => b.subtaskId === subtaskId)

const spent = (b: StudyBlock, now: number) => !!b.done || +new Date(b.start) < now

export function releaseSteps(blocks: StudyBlock[], gone: Set<ID>, now: number): StudyBlock[] {
  return blocks.flatMap((b) => {
    if (!b.subtaskId || !gone.has(b.subtaskId)) return [b]
    return spent(b, now) ? [{ ...b, subtaskId: null }] : []
  })
}

export function replaceTaskPlan(blocks: StudyBlock[], taskId: ID, keep: Set<ID>, now: number): StudyBlock[] {
  return blocks.flatMap((b) => {
    if (b.assignmentId !== taskId || (b.subtaskId && keep.has(b.subtaskId))) return [b]
    if (spent(b, now)) return [b.subtaskId ? { ...b, subtaskId: null } : b]
    return []
  })
}

export const repoint = (b: StudyBlock, patch: Partial<StudyBlock>): Partial<StudyBlock> => {
  const next: Partial<StudyBlock> = { ...patch }
  if (patch.assignmentId !== undefined && patch.assignmentId !== b.assignmentId && patch.subtaskId === undefined) {
    next.subtaskId = null
  }
  if (patch.courseId !== undefined && patch.courseId !== b.courseId && patch.assignmentId === undefined) {
    next.assignmentId = null
    next.subtaskId = null
  }
  return next
}

export const splitSummary = (steps: number, blocks: number, replaced = 0) =>
  blocks === 0
    ? `Split into ${steps} steps`
    : replaced > 0
      ? `Split into ${steps} steps, replanned over the time already set aside`
      : blocks >= steps
        ? `Split into ${steps} steps, each with time on the plan`
        : `Split into ${steps} steps, ${blocks} with time on the plan`
