import { useStore, syncBlockSessions } from '../store'
import { stateToUnits, unitsToRelational, mergeProjectedSessions, syncAssignmentsFromUnits, syncBlocksFromUnits, reconcileUnitClosures, applyCompositeStatus } from '../workEngine'
import { uid } from '../id'
import { MIN, dayKey } from '../date'
import { defaultEffort } from '../priority'
import { placeSteps, releaseSteps, repoint, replaceTaskPlan } from '../steps'
import type { Assignment, AppState, Course, PlannerEvent, Session, StudyBlock } from '../types'
import { revalidate, summarize, type Proposal, type ValidationState } from './validate'

export interface ApplyResult {
  applied: number
  stale: Proposal[]
  label: string
  created: Created[]
}

export interface Created {
  proposalId: string
  blockId?: string
  taskId?: string
  scheduleItemId?: string
}

const iso = (ms: number) => new Date(ms).toISOString()
const courseIdFor = (state: AppState, id: string | null, code: string | null) => {
  if (id && state.courses.some((course) => course.id === id)) return id
  if (!code) return id
  const normalized = code.toUpperCase().replace(/[\s\-_]+/g, '')
  return state.courses.find((course) => course.code.toUpperCase().replace(/[\s\-_]+/g, '') === normalized)?.id ?? null
}

export function foldProposal(state: AppState, p: Proposal, nowIso: string): Partial<AppState> {
  switch (p.type) {
    case 'create_task': {
      const a: Assignment = {
        id: uid(),
        courseId: courseIdFor(state, p.courseId, p.courseCode),
        title: p.title,
        kind: p.kind,
        due: iso(p.dueMs),
        weight: p.weight,
        status: 'todo',
        estimateMin: p.estimateMin ?? defaultEffort({ kind: p.kind, weight: p.weight }),
        subtasks: [],
        notes: p.notes,
        createdAt: nowIso,
      }
      if (!p.steps?.length) return { assignments: [...state.assignments, a] }

      const placed = placeSteps({
        assignment: a,
        steps: p.steps.map((s) => ({ title: s.title, estimateMin: s.estimateMin, dayMs: s.dueMs })),
        blocks: state.blocks,
        courses: state.courses,
        plannerEvents: state.plannerEvents,
        scheduleOverrides: state.scheduleOverrides,
        settings: state.settings,
        now: +new Date(nowIso),
      })
      return {
        assignments: [...state.assignments, { ...a, subtasks: placed.subtasks }],
        blocks: [...state.blocks, ...placed.blocks],
      }
    }

    case 'update_task':
      return {
        assignments: state.assignments.map((a) => (a.id === p.taskId ? { ...a, ...p.patch } : a)),
      }

    case 'move_deadline':
      return {
        assignments: state.assignments.map((a) => (a.id === p.taskId ? { ...a, due: iso(p.toMs) } : a)),
      }

    case 'split_task': {
      const task = state.assignments.find((a) => a.id === p.taskId)
      if (!task) return {}
      const now = +new Date(nowIso)
      const kept = replaceTaskPlan(state.blocks, task.id, new Set(), now)
      const { subtasks, blocks } = placeSteps({
        assignment: task,
        steps: p.steps.map((s) => ({ title: s.title, estimateMin: s.estimateMin, dayMs: s.dueMs })),
        blocks: kept,
        courses: state.courses,
        plannerEvents: state.plannerEvents,
        scheduleOverrides: state.scheduleOverrides,
        settings: state.settings,
        now,
      })
      return {
        assignments: state.assignments.map((a) =>
          a.id === p.taskId
            ? {
                ...a,
                subtasks,
                breakdownDismissed: true,
              }
            : a,
        ),
        blocks: [...kept, ...blocks],
      }
    }

    case 'schedule_block': {
      const b: StudyBlock = {
        id: uid(),
        courseId: p.courseId,
        assignmentId: p.assignmentId,
        title: p.assignmentId ? undefined : p.title,
        start: iso(p.startMs),
        end: iso(p.endMs),
        done: false,
        createdAt: nowIso,
      }
      return { blocks: [...state.blocks, b] }
    }

    case 'create_schedule_item': {
      const event: PlannerEvent = {
        id: uid(),
        title: p.title,
        kind: p.kind,
        start: iso(p.startMs),
        end: iso(p.endMs),
        allDay: p.allDay,
        courseId: courseIdFor(state, p.courseId, p.courseCode),
        room: p.room,
        createdAt: nowIso,
      }
      return { plannerEvents: [...state.plannerEvents, event] }
    }

    case 'update_schedule_item':
      return { plannerEvents: state.plannerEvents.map((event) => (event.id === p.eventId ? p.after : event)) }

    case 'remove_schedule_item':
      return { plannerEvents: state.plannerEvents.filter((event) => event.id !== p.eventId) }

    case 'move_block':
      return {
        blocks: state.blocks.map((b) =>
          b.id === p.blockId
            ? { ...b, start: iso(p.startMs), end: iso(p.endMs), ...repoint(b, p.patch ?? {}) }
            : b,
        ),
      }

    case 'remove_block':
      return { blocks: state.blocks.filter((b) => b.id !== p.blockId) }

    case 'focus_today': {
      if (state.todayList.some((t) => t.assignmentId === p.taskId)) return {}
      return { todayList: [...state.todayList, { assignmentId: p.taskId, day: dayKey(Date.now()) }] }
    }

    case 'remove_from_today':
      return { todayList: state.todayList.filter((t) => t.assignmentId !== p.taskId) }

    case 'complete_task': {
      const targetBlockIds = new Set(
        state.blocks.filter((b) => b.assignmentId === p.taskId || b.id === p.taskId).map((b) => b.id),
      )
      return {
        assignments: state.assignments.map((a) =>
          a.id === p.taskId
            ? {
                ...a,
                status: p.done ? ('done' as const) : ('doing' as const),
                completedAt: p.done ? nowIso : undefined,
                subtasks: p.done
                  ? a.subtasks.map((t) => ({ ...t, done: true, completedAt: t.done ? t.completedAt : nowIso }))
                  : a.subtasks.map((t) => ({ ...t, done: false, completedAt: undefined })),
              }
            : a,
        ),
        blocks:
          targetBlockIds.size > 0
            ? state.blocks.map((b) => (targetBlockIds.has(b.id) ? { ...b, done: p.done } : b))
            : state.blocks,
        sessions:
          targetBlockIds.size > 0
            ? syncBlockSessions(state.blocks, state.sessions, targetBlockIds, p.done, nowIso)
            : state.sessions,
      }
    }

    case 'delete_task':
      return {
        assignments: state.assignments.filter((a) => a.id !== p.taskId),
        blocks: state.blocks.map((b) =>
          b.assignmentId === p.taskId ? { ...b, assignmentId: null, subtaskId: null } : b,
        ),
        sessions: state.sessions.map((x) =>
          x.assignmentId === p.taskId ? { ...x, assignmentId: null } : x,
        ),
        todayList: state.todayList.filter((t) => t.assignmentId !== p.taskId),
      }

    case 'create_course': {
      const used = new Set(state.courses.map((c) => c.color))
      let slot = 1
      for (let i = 1; i <= 8; i++)
        if (!used.has(i as Course['color'])) {
          slot = i
          break
        }
      const c: Course = {
        id: uid(),
        code: p.code,
        title: p.title,
        color: slot as Course['color'],
        targetGrade: 85,
        meetings: p.meetings.map((m) => ({ ...m, id: uid() })),
        createdAt: nowIso,
      }
      return { courses: [...state.courses, c] }
    }

    case 'update_course':
      return { courses: state.courses.map((c) => (c.id === p.courseId ? { ...c, ...p.patch } : c)) }

    case 'update_settings':
      return { settings: { ...state.settings, ...p.patch } }

    case 'add_step': {
      const task = state.assignments.find((a) => a.id === p.taskId)
      if (!task) return {}
      const { subtasks, blocks } = placeSteps({
        assignment: task,
        steps: [{ title: p.title ?? 'Step', estimateMin: p.estimateMin, dayMs: p.dueMs }],
        blocks: state.blocks,
        courses: state.courses,
        plannerEvents: state.plannerEvents,
        scheduleOverrides: state.scheduleOverrides,
        settings: state.settings,
        now: +new Date(nowIso),
        schedule: p.dueMs != null,
      })
      return {
        assignments: state.assignments.map((a) =>
          a.id === p.taskId ? { ...a, subtasks: [...a.subtasks, ...subtasks] } : a,
        ),
        blocks: [...state.blocks, ...blocks],
      }
    }

    case 'update_step': {
      const targetBlockIds = new Set(
        p.done != null && p.stepId
          ? state.blocks.filter((b) => b.subtaskId === p.stepId).map((b) => b.id)
          : [],
      )
      return {
        assignments: state.assignments.map((a) =>
          a.id === p.taskId
            ? {
                ...a,
                subtasks: a.subtasks.map((t) =>
                  t.id === p.stepId
                    ? {
                        ...t,
                        title: p.title ?? t.title,
                        done: p.done ?? t.done,
                        estimateMin: p.estimateMin ?? t.estimateMin,
                        completedAt: p.done ? nowIso : p.done === false ? undefined : t.completedAt,
                      }
                    : t,
                ),
                status: p.done && a.status === 'todo' ? 'doing' : a.status,
              }
            : a,
        ),
        blocks:
          p.done == null || !p.stepId
            ? state.blocks
            : state.blocks.map((b) => (b.subtaskId === p.stepId ? { ...b, done: p.done! } : b)),
        sessions:
          p.done != null && targetBlockIds.size > 0
            ? syncBlockSessions(state.blocks, state.sessions, targetBlockIds, p.done, nowIso)
            : state.sessions,
      }
    }

    case 'remove_step':
      return {
        assignments: state.assignments.map((a) =>
          a.id === p.taskId ? { ...a, subtasks: a.subtasks.filter((t) => t.id !== p.stepId) } : a,
        ),
        blocks: p.stepId ? releaseSteps(state.blocks, new Set([p.stepId]), +new Date(nowIso)) : state.blocks,
      }

    case 'duplicate_block': {
      const len = +new Date(p.before.end) - +new Date(p.before.start)
      const start = +new Date(p.before.end) + 10 * MIN
      const b: StudyBlock = {
        ...p.before,
        id: uid(),
        start: iso(start),
        end: iso(start + len),
        done: false,
        createdAt: nowIso,
      }
      return { blocks: [...state.blocks, b] }
    }

    case 'complete_block': {
      const b = state.blocks.find((x) => x.id === p.blockId)
      if (!b) return {}
      const targetBlockIds = new Set([p.blockId])
      const done = p.done ?? !b.done
      return {
        blocks: state.blocks.map((x) => (x.id === p.blockId ? { ...x, done } : x)),
        assignments: b.subtaskId
          ? state.assignments.map((a) =>
              a.id === b.assignmentId
                ? {
                    ...a,
                    subtasks: a.subtasks.map((t) =>
                      t.id === b.subtaskId
                        ? { ...t, done, completedAt: done ? nowIso : undefined }
                        : t,
                    ),
                    status: done && a.status === 'todo' ? ('doing' as const) : a.status,
                  }
                : a,
            )
          : state.assignments,
        sessions: syncBlockSessions(state.blocks, state.sessions, targetBlockIds, done, nowIso),
      }
    }

    case 'delete_course': {
      const taskIds = new Set(state.assignments.filter((a) => a.courseId === p.courseId).map((a) => a.id))
      const blockIds = new Set(state.blocks.filter((b) => b.courseId === p.courseId).map((b) => b.id))
      return {
        courses: state.courses.filter((c) => c.id !== p.courseId),
        assignments: state.assignments.map((a) => (a.courseId === p.courseId ? { ...a, courseId: null } : a)),
        blocks: state.blocks.map((b) =>
          b.courseId === p.courseId ? { ...b, courseId: null } : b,
        ),
        sessions: state.sessions.map((x) => {
          const courseLink =
            x.courseId === p.courseId ||
            (x.assignmentId != null && taskIds.has(x.assignmentId)) ||
            (x.blockId != null && blockIds.has(x.blockId))
          return courseLink ? { ...x, courseId: null } : x
        }),
      }
    }

    case 'reorder_today': {
      const list = [...state.todayList]
      const from = list.findIndex((t) => t.assignmentId === p.taskId)
      if (from < 0) return {}
      const [moved] = list.splice(from, 1)
      list.splice(Math.min(p.toPosition - 1, list.length), 0, moved)
      return { todayList: list }
    }

    case 'archive_course':
      return {
        courses: state.courses.map((c) =>
          c.id === p.courseId ? { ...c, archived: p.archived || undefined } : c,
        ),
      }

    case 'mute_nudge':
      return { settings: { ...state.settings, mutedNudges: { ...state.settings.mutedNudges, [p.nudgeId]: dayKey(Date.now()) } } }

    case 'log_session': {
      const sess: Session = {
        id: uid(),
        courseId: p.courseId,
        assignmentId: p.taskId,
        start: iso(p.startMs),
        minutes: p.minutes,
        source: 'manual',
        createdAt: nowIso,
      }
      return { sessions: [...state.sessions, sess] }
    }

    case 'study_session': {
      const primary = p.segments.find((s) => s.taskId)?.taskId ?? null
      const linked = primary ? state.assignments.find((a) => a.id === primary) : null
      const b: StudyBlock = {
        id: uid(),
        courseId: linked?.courseId ?? null,
        assignmentId: linked?.id ?? null,
        title: linked ? undefined : 'Study session',
        start: iso(p.startMs),
        end: iso(p.startMs + p.totalMin * 60_000),
        done: false,
        plan: p.segments.map((s) => ({ kind: s.kind, minutes: s.minutes, label: s.label })),
        createdAt: nowIso,
      }
      return { blocks: [...state.blocks, b] }
    }
  }
}

function labelFor(proposals: Proposal[]): string {
  if (proposals.length === 1) return summarize(proposals[0])
  const blocks = proposals.filter((p) => p.type === 'schedule_block' || p.type === 'study_session').length
  const scheduleItems = proposals.filter((p) => p.type === 'create_schedule_item').length
  const scheduleEdits = proposals.filter((p) => p.type === 'update_schedule_item').length
  const scheduleRemovals = proposals.filter((p) => p.type === 'remove_schedule_item').length
  const moves = proposals.filter((p) => p.type === 'move_block').length
  const tasks = proposals.filter((p) => p.type === 'create_task').length
  const bits: string[] = []
  if (tasks) bits.push(`${tasks} task${tasks === 1 ? '' : 's'} added`)
  if (blocks) bits.push(`${blocks} block${blocks === 1 ? '' : 's'} scheduled`)
  if (scheduleItems) bits.push(`${scheduleItems} schedule item${scheduleItems === 1 ? '' : 's'} added`)
  if (scheduleEdits) bits.push(`${scheduleEdits} schedule item${scheduleEdits === 1 ? '' : 's'} updated`)
  if (scheduleRemovals) bits.push(`${scheduleRemovals} schedule item${scheduleRemovals === 1 ? '' : 's'} removed`)
  if (moves) bits.push(`${moves} moved`)
  const done = proposals.filter((p) => p.type === 'complete_task').length
  if (done) bits.push(`${done} marked done`)
  const courses = proposals.filter((p) => p.type === 'create_course' || p.type === 'update_course').length
  if (courses) bits.push(`${courses} course${courses === 1 ? '' : 's'} updated`)
  return bits.length ? bits.join(', ') : `${proposals.length} changes applied`
}

export function applyProposals(proposals: Proposal[], vstate: ValidationState): ApplyResult {
  const { live, stale } = revalidate(proposals, vstate)
  if (!live.length) return { applied: 0, stale, label: 'Nothing left to apply', created: [] }

  const store = useStore.getState()
  store.pushUndo(live.length === 1 ? summarize(live[0]) : 'Applied Nudge AI’s plan')

  const created: Created[] = []

  useStore.setState((s) => {
    const nowIso = new Date().toISOString()

    let working = s as AppState
    for (const p of live) {
      const before = working
      const patch = foldProposal(working, p, nowIso)
      working = { ...working, ...patch }

      const blockId = addedId(before.blocks, working.blocks)
      const taskId = addedId(before.assignments, working.assignments)
      const scheduleItemId = addedId(before.plannerEvents, working.plannerEvents)
      if (blockId || taskId || scheduleItemId) created.push({ proposalId: p.id, blockId, taskId, scheduleItemId })
    }
    const units = reconcileUnitClosures(
      applyCompositeStatus(stateToUnits(working)),
      s.units ?? {},
      nowIso,
    )
    const rel = unitsToRelational(units)
    return {
      assignments: syncAssignmentsFromUnits(working.assignments, units, nowIso),
      blocks: syncBlocksFromUnits(working.blocks, units),
      todayList: working.todayList,
      courses: working.courses,
      plannerEvents: working.plannerEvents,
      scheduleOverrides: working.scheduleOverrides,
      settings: working.settings,
      sessions: mergeProjectedSessions(rel.sessions, working.sessions, s.units ?? {}, units),
      units,
    }
  })

  return { applied: live.length, stale, label: labelFor(live), created }
}

function addedId(before: { id: string }[], after: { id: string }[]): string | undefined {
  if (after.length <= before.length) return undefined
  const seen = new Set(before.map((x) => x.id))
  return after.find((x) => !seen.has(x.id))?.id
}

export function currentValidationState(now: number, nudges?: { id: string; text: string }[]): ValidationState {
  const s = useStore.getState()
  return {
    assignments: s.assignments,
    courses: s.courses,
    blocks: s.blocks,
    plannerEvents: s.plannerEvents,
    scheduleOverrides: s.scheduleOverrides,
    nudges,
    todayOrder: s.todayList.map((t) => t.assignmentId),
    now,
    dayEndHour: s.settings.dayEndHour,
    dailyCapacityMin: s.settings.dailyCapacityMin,
    settings: s.settings,
    todayIds: new Set(s.todayList.map((t) => t.assignmentId)),
  }
}
