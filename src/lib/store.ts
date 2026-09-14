import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type {
  Assignment,
  AppState,
  BlockSegment,
  ColorSlot,
  Course,
  CourseExam,
  FocusNote,
  NoteCategory,
  NoteType,
  NoteFolder,
  ID,
  MeetingKind,
  PlannerEvent,
  ScheduleSlot,
  ScheduleOverride,
  Session,
  Settings,
  StudyBlock,
  Subtask,
  TaskKind,
  WorkStatus,
  WorkUnit,
} from './types'
import { uid } from './id'
import {
  MIN_LOGGABLE_MIN,
  STALE_MS,
  completePhase,
  readHeartbeat,
  recover,
  sessionFrom,
  settle,
  toWork,
  type Recovery,
} from './timer'
import { atMinutes, dayKey, minutesOfDay, startOfDay } from './date'
import { proposeBreakdown, defaultEffort } from './priority'
import { pruneMutes } from './nudges'
import { findGapOnDay } from './autoSchedule'
import { placeSteps, releaseSteps, repoint, replaceTaskPlan } from './steps'
import { DEFAULT_PALETTE, isPaletteId } from './theme'
import { getNoteTitleAndExcerpt, markWelcomeNoteSeen } from './notes'
import {
  stateToUnits,
  unitsToRelational,
  transitionUnitStatus,
  isAutoLog,
  mergeProjectedSessions,
  syncAssignmentsFromUnits,
  syncBlocksFromUnits,
  sessionCreditsBlock,
  applyCompositeStatus,
  reconcileUnitClosures,
  rootDeliverableId,
  stampCompletions,
} from './workEngine'

const STORAGE_KEY = 'nudge.state.v1'

function resolveStorage(): Storage {
  const base = (globalThis as { localStorage?: Storage }).localStorage
  if (!base) throw new Error('no localStorage')
  return {
    get length() {
      try {
        return base.length
      } catch {
        return 0
      }
    },
    clear: () => {
      try {
        base.clear()
      } catch {

      }
    },
    key: (i: number) => {
      try {
        return base.key(i)
      } catch {
        return null
      }
    },
    getItem: (k: string) => {
      try {
        return base.getItem(k)
      } catch {
        return null
      }
    },
    removeItem: (k: string) => {
      try {
        base.removeItem(k)
      } catch {

      }
    },
    setItem: (k: string, v: string) => {
      try {
        base.setItem(k, v)
      } catch {
      }
    },
  }
}

export const DEFAULT_SETTINGS: Settings = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  dailyCapacityMin: 210,
  tone: 'balanced',
  theme: 'system',
  palette: DEFAULT_PALETTE,
  addMode: 'quick',
  dayStartHour: 7,
  dayEndHour: 23,
  sound: true,
  onboarded: false,
  mutedNudges: {},
}

const EMPTY: AppState = {
  version: 5,
  courses: [],
  assignments: [],
  blocks: [],
  plannerEvents: [],
  scheduleOverrides: [],
  sessions: [],
  focusNotes: [],
  noteFolders: [],
  units: {},
  todayList: [],
  settings: DEFAULT_SETTINGS,
  timer: null,
}

type Snapshot = Pick<
  AppState,
  | 'courses'
  | 'assignments'
  | 'blocks'
  | 'plannerEvents'
  | 'scheduleOverrides'
  | 'sessions'
  | 'focusNotes'
  | 'noteFolders'
  | 'todayList'
  | 'units'
   | 'settings'
>

interface UndoEntry {
  label: string
  snapshot: Snapshot
  at: number
}

type LegacyCourse = Course & {
  exams?: CourseExam[]
  midterm?: string
  final?: string
}

type LegacyFocusNote = FocusNote & { sessionId?: ID }

function migrateFocusNotes(input: FocusNote[] = []): FocusNote[] {
  return input.map((note) => {
    const legacy = note as LegacyFocusNote
    if (!note.studyId && legacy.sessionId) {
      const { sessionId: _legacyStudyId, ...rest } = legacy
      return { ...rest, studyId: legacy.sessionId, noteType: note.noteType ?? 'study' }
    }
    return note
  })
}

function migrateLegacyCourseExams(
  inputCourses: Course[] = [],
  inputEvents: PlannerEvent[] = [],
  inputBlocks: StudyBlock[] = [],
): { courses: Course[]; plannerEvents: PlannerEvent[]; blocks: StudyBlock[] } {
  const plannerEvents: PlannerEvent[] = []
  const blocks = [...inputBlocks]

  for (const event of inputEvents) {
    if (event.kind === 'blocked_time') {
      if (!blocks.some((b) => b.id === event.id)) {
        blocks.push({
          id: event.id,
          kind: 'appointment',
          courseId: event.courseId ?? null,
          assignmentId: null,
          title: event.title,
          location: event.room,
          start: event.start,
          end: event.end,
          done: false,
          createdAt: event.createdAt ?? new Date().toISOString(),
        })
      }
    } else {
      plannerEvents.push(event)
    }
  }

  const courses = inputCourses.map((course) => {
    const legacy = course as LegacyCourse

    for (const [label, iso] of [
      ['Midterm', legacy.midterm],
      ['Final', legacy.final],
    ] as const) {
      if (!iso || Number.isNaN(+new Date(iso))) continue
      const start = new Date(iso)
      const end = new Date(+start + 3 * 60 * 60_000)
      if (
        !plannerEvents.some(
          (event) =>
            event.kind === 'exam' &&
            event.courseId === course.id &&
            event.title === `${course.code} ${label}` &&
            dayKey(event.start) === dayKey(start),
        )
      ) {
        plannerEvents.push({
          id: uid(),
          title: `${course.code} ${label}`,
          kind: 'exam',
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: false,
          courseId: course.id,
          room: course.room,
          createdAt: new Date().toISOString(),
        })
      }
    }

    for (const exam of legacy.exams ?? []) {
      const start = new Date(`${exam.date}T${exam.startTime || '09:00'}:00`)
      const end = new Date(`${exam.date}T${exam.endTime || '12:00'}:00`)
      if (Number.isNaN(+start) || Number.isNaN(+end)) continue
      if (
        plannerEvents.some(
          (event) =>
            event.kind === 'exam' &&
            (event.id === exam.id ||
              (event.courseId === course.id &&
                event.title === exam.title &&
                dayKey(event.start) === exam.date)),
        )
      )
        continue
      plannerEvents.push({
        id: exam.id,
        title: exam.title,
        kind: 'exam',
        start: start.toISOString(),
        end: end > start ? end.toISOString() : new Date(+start + 3 * 60 * 60_000).toISOString(),
        allDay: false,
        courseId: course.id,
        room: exam.room,
        weight: exam.weight,
        createdAt: new Date().toISOString(),
      })
    }

    const { exams: _exams, midterm: _midterm, final: _final, ...withoutLegacyExams } = legacy
    return withoutLegacyExams as Course
  })

  return { courses, plannerEvents, blocks }
}

export interface NudgeStore extends AppState {
  getUnits(): Record<ID, WorkUnit>
  setUnitStatus(id: ID, status: WorkStatus): void
  scheduleUnit(id: ID, slot: ScheduleSlot | null): void
  createUnit(input: Partial<WorkUnit> & { title: string }): WorkUnit
  removeUnit(id: ID): void

  addCourse(input: Partial<Course> & { code: string }): Course
  updateCourse(id: ID, patch: Partial<Course>): void

  setCourseArchived(id: ID, archived: boolean): void
  removeCourse(id: ID): void

  addAssignment(input: Partial<Assignment> & { title: string }): Assignment
  updateAssignment(id: ID, patch: Partial<Assignment>): void
  setAssignmentStatus(id: ID, status: Assignment['status']): void
  removeAssignment(id: ID): void

  addSubtask(assignmentId: ID, input: Partial<Subtask> & { title: string }): void
  updateSubtask(assignmentId: ID, subtaskId: ID, patch: Partial<Subtask>): void
  removeSubtask(assignmentId: ID, subtaskId: ID): void
  applyBreakdown(assignmentId: ID, totalMin: number): { steps: number; blocks: number; replaced: number }
  dismissBreakdown(assignmentId: ID): void

  addBlock(input: Partial<StudyBlock> & { start: string; end: string }): StudyBlock
  addBlocks(input: (Partial<StudyBlock> & { start: string; end: string })[]): StudyBlock[]
  updateBlock(id: ID, patch: Partial<StudyBlock>): void
  moveBlock(id: ID, startMs: number, endMs: number): void

  duplicateBlock(id: ID): StudyBlock | null
  removeBlock(id: ID): void
  toggleBlockDone(id: ID): void

  addPlannerEvent(
    input: Partial<PlannerEvent> & {
      title: string
      kind: PlannerEvent['kind']
      start: string
      end: string
      allDay: boolean
    },
  ): PlannerEvent
  updatePlannerEvent(id: ID, patch: Partial<PlannerEvent>): void
  removePlannerEvent(id: ID): void
  upsertScheduleOverride(input: Omit<ScheduleOverride, 'id' | 'createdAt'>): ScheduleOverride
  removeScheduleOverride(id: ID): void

  logSession(input: Partial<Session> & { minutes: number }): void
  addFocusNote(
    input: Pick<FocusNote, 'text'> &
      Partial<
        Pick<
          FocusNote,
          'title' | 'noteType' | 'studyId' | 'courseId' | 'assignmentId' | 'folderId' | 'isPinned' | 'categories'
        >
      >,
  ): FocusNote
  updateFocusNote(id: ID, patch: Partial<FocusNote>): void
  updateFocusNoteSilent(id: ID, patch: Partial<FocusNote>): void
  markFocusNoteReviewed(id: ID, reviewed: boolean): void
  removeFocusNote(id: ID): void
  convertFocusNoteToTask(id: ID, options?: { due?: string }): Assignment | null

  addNoteFolder(input: {
    name: string
    parentId?: ID | null
    courseId?: ID | null
    color?: string
    icon?: string
  }): NoteFolder
  updateNoteFolder(id: ID, patch: Partial<NoteFolder>): void
  moveNoteFolder(folderId: ID, targetCourseId: ID | null, targetParentId: ID | null): void
  removeNoteFolder(id: ID): void
  batchAddNoteFolders(folders: NoteFolder[]): void

  startSitting(input: {
    assignmentId: ID | null
    courseId: ID | null
    blockId: ID | null
    minutes: number
    justStart?: boolean
    label?: string

    plan?: BlockSegment[]
  }): void
  pauseTimer(): void
  resumeTimer(): void

  completeTimerPhase(): void

  startNextRound(): void

  endSitting(opts?: { finish?: boolean }): { minutes: number; totalMin: number } | null

  settleTimer(at?: number): void

  reconcileTimer(): Recovery | null

  addToToday(assignmentId: ID): void
  removeFromToday(assignmentId: ID): void
  reorderToday(from: number, to: number): void
  clearDoneFromToday(): void

  muteNudge(id: string): void
  updateSettings(patch: Partial<Settings>): void

  undo(): boolean
  redo(): boolean
  pushUndo(label: string): void
  batch(label: string, run: (store: NudgeStore) => void): void
  loadSample(): void
  resetAll(): void
  importState(next: Partial<AppState>): void
}

let undoStack: UndoEntry[] = []
let redoStack: UndoEntry[] = []

const snapshotOf = (s: AppState): Snapshot => ({
  courses: s.courses,
  assignments: s.assignments,
  blocks: s.blocks,
  plannerEvents: s.plannerEvents,
  scheduleOverrides: s.scheduleOverrides,
  sessions: s.sessions,
  focusNotes: s.focusNotes,
  noteFolders: s.noteFolders ?? [],
  units: s.units ?? {},
  todayList: s.todayList,
  settings: s.settings,
})

const nextColor = (courses: Course[]): ColorSlot => {
  const used = new Set(courses.map((c) => c.color))
  for (let i = 1; i <= 8; i++) if (!used.has(i as ColorSlot)) return i as ColorSlot
  return ((courses.length % 8) + 1) as ColorSlot
}

export function syncBlockSessions(
  blocks: StudyBlock[],
  sessions: Session[],
  targetBlockIds: Set<ID>,
  done: boolean,
  nowIso: string,
): Session[] {
  const isAuto = (x: Session) => isAutoLog(x)
  if (!done) {
    return sessions.filter((x) => !(x.blockId && targetBlockIds.has(x.blockId) && isAuto(x)))
  }
  const added: Session[] = []
  for (const b of blocks) {
    if (!targetBlockIds.has(b.id) || b.done) continue
    const planned = Math.round((+new Date(b.end) - +new Date(b.start)) / 60000)
    const tracked = sessions.reduce(
      (sum, x) =>
        sessionCreditsBlock(x, b) && Number.isFinite(x.minutes) && x.minutes >= 0 ? sum + x.minutes : sum,
      0,
    )
    const topUp = Math.round((planned - tracked) * 10) / 10
    if (topUp >= MIN_LOGGABLE_MIN) {
      added.push({
        id: uid(),
        courseId: b.courseId,
        assignmentId: b.assignmentId,
        blockId: b.id,
        start: b.start,
        end: b.end,
        minutes: topUp,
        source: 'block',
        auto: true,
        createdAt: nowIso,
      })
    }
  }
  return added.length ? [...sessions, ...added] : sessions
}

export function normalizeCode(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/[-_]+/g, ' ')
  const m = t.match(/^([A-Z]{2,5})\s*([0-9]{2,3}[A-Z]?[0-9]?)$/)
  if (m) return `${m[1]} ${m[2]}`
  return t.replace(/\s+/g, ' ')
}

interface LegacyTimer {
  mode?: string
  endsAt?: number
  totalSec?: number
  pausedSec?: number | null
  assignmentId?: ID | null
  courseId?: ID | null
  blockId?: ID | null
  justStart?: boolean
}

function withRecovery<T extends Pick<AppState, 'sessions' | 'assignments' | 'timer'>>(state: T, r: Recovery): T {
  const next: T = { ...state, timer: r.timer }
  if (r.session && !state.sessions.some((x) => x.sittingId === r.session!.sittingId)) {
    next.sessions = [...state.sessions, { id: uid(), ...r.session }]
    next.assignments = state.assignments.map((a) =>
      a.id === r.session!.assignmentId && a.status === 'todo' ? { ...a, status: 'doing' as const } : a,
    )
  }
  return next
}

let pendingRecovery: Recovery | null = null

export function takeTimerRecovery(): Recovery | null {
  const r = pendingRecovery
  pendingRecovery = null
  return r
}

export const useStore = create<NudgeStore>()(
  persist(
    (set, get) => {
      let activeBatch: { label: string; snapshot: Snapshot } | null = null

      const recordUndo = (label: string, snapshot: Snapshot) => {
        undoStack.push({ label, snapshot, at: Date.now() })
        if (undoStack.length > 40) undoStack.shift()
        redoStack = []
      }

      const mutate = (label: string, fn: (s: AppState) => Partial<AppState>) => {
        const before = get()
        const at = new Date().toISOString()
        if (!activeBatch) recordUndo(label, snapshotOf(before))
        const changes = fn(before)
        const nextState = { ...before, ...changes }
        const unitsTouched = !!(changes.units || changes.assignments || changes.blocks || changes.sessions)
        if ((changes.assignments || changes.blocks || changes.sessions) && !changes.units) {
          nextState.units = stateToUnits(nextState)
        }
        if (nextState.units && unitsTouched) {
          const priorUnits =
            before.units && Object.keys(before.units).length > 0 ? before.units : stateToUnits(before)
          nextState.units = reconcileUnitClosures(
            applyCompositeStatus({ ...nextState.units }),
            priorUnits,
            at,
          )
          const rel = unitsToRelational(nextState.units)
          nextState.sessions = mergeProjectedSessions(
            rel.sessions,
            nextState.sessions ?? before.sessions,
            priorUnits,
            nextState.units,
          )
          nextState.blocks = syncBlocksFromUnits(nextState.blocks ?? before.blocks, nextState.units)
          nextState.assignments = syncAssignmentsFromUnits(nextState.assignments, nextState.units, at)
        } else if (changes.units && nextState.units) {
          nextState.assignments = syncAssignmentsFromUnits(nextState.assignments, nextState.units, at)
        }
        set(nextState as never)
      }

      return {
        ...EMPTY,

        getUnits() {
          return stateToUnits(get())
        },

        setUnitStatus(id, status) {
          const at = new Date().toISOString()
          mutate(status === 'done' ? 'Completed unit' : 'Reopened unit', (s) => {
            const currentUnits = stateToUnits(s)
            const nextUnits = transitionUnitStatus(currentUnits, id, status, at)
            const relational = unitsToRelational(nextUnits)
            return {
              units: nextUnits,
              assignments: relational.assignments,
              blocks: relational.blocks,
              sessions: mergeProjectedSessions(relational.sessions, s.sessions, currentUnits, nextUnits),
            }
          })
        },

        scheduleUnit(id, slot) {
          mutate('Updated schedule', (s) => {
            const currentUnits = stateToUnits(s)
            const target = currentUnits[id]
            if (!target) return s
            currentUnits[id] = { ...target, schedule: slot, updatedAt: new Date().toISOString() }
            const relational = unitsToRelational(currentUnits)
            return {
              units: currentUnits,
              assignments: relational.assignments,
              blocks: relational.blocks,
              sessions: mergeProjectedSessions(relational.sessions, s.sessions, stateToUnits(s), currentUnits),
            }
          })
        },

        createUnit(input) {
          const now = new Date().toISOString()
          const id = input.id ?? uid()
          const existingUnits = get().getUnits()
          const parentId = input.parentId && existingUnits[input.parentId] ? input.parentId : null
          const courseId = input.courseId ?? (parentId ? existingUnits[parentId].courseId : null)
          const schedule = input.schedule ?? null
          const fromSlot =
            schedule != null
              ? Math.round((+new Date(schedule.end) - +new Date(schedule.start)) / 60000)
              : undefined
          const estimateMin =
            input.estimateMin ??
            (fromSlot != null && Number.isFinite(fromSlot) ? Math.max(0, fromSlot) : parentId ? 45 : 60)
          const kind = input.kind ?? (parentId ? 'step' : 'assignment')
          const unit: WorkUnit = {
            id,
            parentId,
            courseId,
            title: input.title.trim(),
            kind: !parentId && kind === 'step' ? 'assignment' : kind,
            estimateMin,
            due: input.due,
            status: input.status ?? 'todo',
            schedule,
            plan: input.plan,
            logs: input.logs ?? [],
            createdAt: now,
            updatedAt: now,
            notes: input.notes,
            weight: input.weight,
            grade: input.grade,
            private: input.private,
            archived: input.archived,
            breakdownDismissed: input.breakdownDismissed,
            completedAt: input.completedAt,
          }
          mutate('Created work unit', (s) => {
            const priorUnits = stateToUnits(s)
            const currentUnits = { ...priorUnits, [id]: unit }
            const relational = unitsToRelational(currentUnits)
            return {
              units: currentUnits,
              assignments: relational.assignments,
              blocks: relational.blocks,
              sessions: mergeProjectedSessions(relational.sessions, s.sessions, priorUnits, currentUnits),
            }
          })
          return unit
        },

        removeUnit(id) {
          const running = get().timer
          if (running) {
            const units = stateToUnits(get())
            const gone = new Set<ID>()
            const walk = (targetId: ID) => {
              if (gone.has(targetId)) return
              gone.add(targetId)
              Object.values(units)
                .filter((u) => u.parentId === targetId)
                .forEach((child) => walk(child.id))
            }
            walk(id)
            if (
              (running.assignmentId && gone.has(running.assignmentId)) ||
              (running.blockId && gone.has(running.blockId))
            ) {
              get().endSitting()
            }
          }
          mutate('Removed work unit', (s) => {
            const currentUnits = stateToUnits(s)
            const deleteSubtree = (targetId: ID, visited = new Set<ID>()) => {
              if (visited.has(targetId)) return
              visited.add(targetId)
              Object.values(currentUnits)
                .filter((u) => u.parentId === targetId)
                .forEach((child) => deleteSubtree(child.id, visited))
              delete currentUnits[targetId]
            }
            deleteSubtree(id)
            const relational = unitsToRelational(currentUnits)
            return {
              units: currentUnits,
              assignments: relational.assignments,
              blocks: relational.blocks,
              sessions: mergeProjectedSessions(relational.sessions, s.sessions, stateToUnits(s), currentUnits),
            }
          })
        },

        addCourse(input) {
          const course: Course = {
            id: uid(),
            code: normalizeCode(input.code),
            title: input.title,
            color: input.color ?? nextColor(get().courses),
            professor: input.professor,
            room: input.room,
            currentGrade: input.currentGrade,
            targetGrade: input.targetGrade ?? 85,
            meetings: input.meetings ?? [],
            createdAt: new Date().toISOString(),
          }
          mutate('Added course', (s) => ({ courses: [...s.courses, course] }))
          return course
        },
        updateCourse(id, patch) {
          mutate('Updated course', (s) => ({
            courses: s.courses.map((c) =>
              c.id === id ? { ...c, ...patch, code: patch.code ? normalizeCode(patch.code) : c.code } : c,
            ),
          }))
        },

        setCourseArchived(id, archived) {
          const code = get().courses.find((c) => c.id === id)?.code ?? 'course'
          mutate(archived ? `Archived ${code}` : `Restored ${code}`, (s) => ({
            courses: s.courses.map((c) => (c.id === id ? { ...c, archived: archived || undefined } : c)),
          }))
        },
        removeCourse(id) {
          const running = get().timer
          if (running && running.courseId === id) get().endSitting()
          mutate('Deleted course', (s) => {
            const courseTaskIds = new Set(s.assignments.filter((a) => a.courseId === id).map((a) => a.id))
            return {
              courses: s.courses.filter((c) => c.id !== id),
              assignments: s.assignments.map((a) => (a.courseId === id ? { ...a, courseId: null } : a)),
              blocks: s.blocks.map((b) =>
                b.courseId === id || (b.assignmentId != null && courseTaskIds.has(b.assignmentId))
                  ? { ...b, courseId: null }
                  : b,
              ),
              plannerEvents: s.plannerEvents.filter((e) => e.courseId !== id),
              sessions: s.sessions.map((x) => (x.courseId === id ? { ...x, courseId: null } : x)),
              focusNotes: s.focusNotes.map((note) => {
                const courseId = note.courseId === id ? null : note.courseId
                return courseId === note.courseId ? note : { ...note, courseId }
              }),
            }
          })
        },

        addAssignment(input) {
          const kind: TaskKind = input.kind ?? 'assignment'
          const a: Assignment = {
            id: uid(),
            courseId: input.courseId ?? null,
            title: input.title.trim(),
            kind,
            due: input.due,
            weight: input.weight,
            status: input.status ?? 'todo',
            estimateMin: input.estimateMin,
            subtasks: input.subtasks ?? [],
            notes: input.notes,
            grade: input.grade,
            createdAt: input.createdAt ?? new Date().toISOString(),
            private: input.private,
            archived: input.archived,
            completedAt: input.completedAt,
            breakdownDismissed: input.breakdownDismissed,
          }
          mutate('Added task', (s) => ({ assignments: [...s.assignments, a] }))
          return a
        },
        updateAssignment(id, patch) {
          mutate('Updated task', (s) => ({
            assignments: s.assignments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
          }))
        },
        setAssignmentStatus(id, status) {
          const running = get().timer
          if (running && running.assignmentId === id && status === 'done') get().endSitting()
          const at = new Date().toISOString()
          mutate(status === 'done' ? 'Completed task' : 'Changed status', (s) => {
            const current = s.assignments.find((a) => a.id === id)
            if (!current) return s
            const isCompleting = status === 'done' && current.status !== 'done'
            const isReopening = status !== 'done' && current.status === 'done'
            const targetBlockIds = new Set(
              s.blocks.filter((b) => b.assignmentId === id || b.id === id).map((b) => b.id),
            )
            const assignments = s.assignments.map((a) =>
              a.id === id
                ? {
                    ...a,
                    status,
                    completedAt: status === 'done' ? at : undefined,
                    subtasks: isCompleting
                      ? a.subtasks.map((t) => ({ ...t, done: true, completedAt: t.done ? t.completedAt : at }))
                      : isReopening
                        ? a.subtasks.map((t) => ({ ...t, done: false, completedAt: undefined }))
                        : a.subtasks,
                  }
                : a,
            )
            if (!isCompleting && !isReopening) return { assignments }
            const blocks =
              targetBlockIds.size > 0
                ? s.blocks.map((b) => (targetBlockIds.has(b.id) ? { ...b, done: isCompleting } : b))
                : s.blocks
            const sessions =
              targetBlockIds.size > 0
                ? syncBlockSessions(s.blocks, s.sessions, targetBlockIds, isCompleting, at)
                : s.sessions
            return {
              assignments,
              blocks,
              sessions,
              ...(isCompleting ? { todayList: s.todayList.filter((t) => t.assignmentId !== id) } : {}),
            }
          })
        },
        removeAssignment(id) {
          const running = get().timer
          if (running && running.assignmentId === id) get().endSitting()
          mutate('Deleted task', (s) => ({
            assignments: s.assignments.filter((a) => a.id !== id),
            blocks: s.blocks.map((b) =>
              b.assignmentId === id ? { ...b, assignmentId: null, subtaskId: null } : b,
            ),
            sessions: s.sessions.map((x) => (x.assignmentId === id ? { ...x, assignmentId: null } : x)),
            todayList: s.todayList.filter((t) => t.assignmentId !== id),
            focusNotes: s.focusNotes.map((note) =>
              note.assignmentId === id ? { ...note, assignmentId: null } : note,
            ),
          }))
        },

        addSubtask(assignmentId, input) {
          mutate('Added step', (s) => ({
            assignments: s.assignments.map((a) =>
              a.id === assignmentId
                ? {
                    ...a,
                    subtasks: [
                      ...a.subtasks,
                      { id: uid(), title: input.title.trim(), done: false, due: input.due, estimateMin: input.estimateMin },
                    ],
                  }
                : a,
            ),
          }))
        },
        updateSubtask(assignmentId, subtaskId, patch) {
          const at = new Date().toISOString()
          mutate('Updated step', (s) => {
            const targetBlockIds = new Set(
              patch.done != null
                ? s.blocks.filter((b) => b.subtaskId === subtaskId).map((b) => b.id)
                : [],
            )
            return {
              assignments: s.assignments.map((a) =>
                a.id === assignmentId
                  ? {
                      ...a,
                      subtasks: a.subtasks.map((t) =>
                        t.id === subtaskId
                          ? {
                              ...t,
                              ...patch,
                              completedAt:
                                patch.done === true
                                  ? at
                                  : patch.done === false
                                    ? undefined
                                    : t.completedAt,
                            }
                          : t,
                      ),
                      status: patch.done && a.status === 'todo' ? 'doing' : a.status,
                    }
                  : a,
              ),
              blocks:
                patch.done == null
                  ? s.blocks
                  : s.blocks.map((b) => (b.subtaskId === subtaskId ? { ...b, done: patch.done } : b)),
              sessions:
                patch.done != null && targetBlockIds.size > 0
                  ? syncBlockSessions(s.blocks, s.sessions, targetBlockIds, patch.done, at)
                  : s.sessions,
            }
          })
        },
        removeSubtask(assignmentId, subtaskId) {
          mutate('Deleted step', (s) => ({
            assignments: s.assignments.map((a) =>
              a.id === assignmentId ? { ...a, subtasks: a.subtasks.filter((t) => t.id !== subtaskId) } : a,
            ),
            blocks: releaseSteps(s.blocks, new Set([subtaskId]), Date.now()),
          }))
        },
        applyBreakdown(assignmentId, totalMin) {
          const st = get()
          const a = st.assignments.find((x) => x.id === assignmentId)
          if (!a) return { steps: 0, blocks: 0, replaced: 0 }

          const now = Date.now()
          const kept = replaceTaskPlan(st.blocks, a.id, new Set(a.subtasks.map((t) => t.id)), now)
          const { subtasks, blocks } = placeSteps({
            assignment: a,
            steps: proposeBreakdown(a, totalMin, now),
            blocks: kept,
            courses: st.courses,
            plannerEvents: st.plannerEvents,
            scheduleOverrides: st.scheduleOverrides,
            settings: st.settings,
            now,
          })
          mutate('Broke task into steps', (s) => ({
            assignments: s.assignments.map((x) =>
              x.id === assignmentId ? { ...x, subtasks: [...x.subtasks, ...subtasks] } : x,
            ),
            blocks: [...kept, ...blocks],
          }))
          return { steps: subtasks.length, blocks: blocks.length, replaced: st.blocks.length - kept.length }
        },
        dismissBreakdown(assignmentId) {
          set((s) => {
            const assignments = s.assignments.map((a) =>
              a.id === assignmentId ? { ...a, breakdownDismissed: true } : a,
            )
            return {
              assignments,
              units: stateToUnits({ ...s, assignments }),
            }
          })
        },

        addBlock(input) {
          const b: StudyBlock = {
            id: uid(),
            kind: input.kind ?? 'study',
            courseId: input.courseId ?? null,
            assignmentId: input.assignmentId ?? null,
            subtaskId: input.subtaskId ?? null,
            title: input.title,
            courseCode: input.courseCode?.trim().toUpperCase() || undefined,
            location: input.location,
            weight: input.weight,
            start: input.start,
            end: input.end,
            done: input.done ?? false,
            plan: input.plan,
            sourceMeetingId: input.sourceMeetingId,
            sourceDate: input.sourceDate,
            createdAt: new Date().toISOString(),
          }
          const label =
            b.kind === 'free'
              ? 'Added free time'
              : b.kind === 'appointment'
                ? 'Added appointment'
                : b.kind === 'exam'
                  ? 'Added exam'
                  : 'Added study block'
          mutate(label, (s) => ({ blocks: [...s.blocks, b] }))
          return b
        },
        addBlocks(input) {
          if (!input.length) return []
          const createdAt = new Date().toISOString()
          const newBlocks = input.map((item) => ({
            id: uid(),
            kind: item.kind ?? 'study',
            courseId: item.courseId ?? null,
            assignmentId: item.assignmentId ?? null,
            subtaskId: item.subtaskId ?? null,
            title: item.title,
            courseCode: item.courseCode?.trim().toUpperCase() || undefined,
            location: item.location,
            weight: item.weight,
            start: item.start,
            end: item.end,
            done: item.done ?? false,
            plan: item.plan,
            createdAt,
          }))
          mutate(`Added ${newBlocks.length} study block${newBlocks.length === 1 ? '' : 's'}`, (s) => ({
            blocks: [...s.blocks, ...newBlocks],
          }))
          return newBlocks
        },
        updateBlock(id, patch) {
          mutate('Updated block', (s) => ({
            blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...repoint(b, patch), ...patch } : b)),
          }))
        },

        moveBlock(id, startMs, endMs) {
          mutate('Moved block', (s) => ({
            blocks: s.blocks.map((b) =>
              b.id === id ? { ...b, start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() } : b,
            ),
          }))
        },

        duplicateBlock(id) {
          const { blocks, courses, plannerEvents, scheduleOverrides, settings } = get()
          const src = blocks.find((b) => b.id === id)
          if (!src) return null
          const startMs = +new Date(src.start)
          const durationMin = Math.round((+new Date(src.end) - startMs) / 60_000)

          const sourceEnd = +new Date(src.end)
          const slot =
            findGapOnDay({
              fromMs: sourceEnd,
              durationMin,
              blocks,
              courses,
              plannerEvents,
              scheduleOverrides,
              dayStartHour: settings.dayStartHour,
              dayEndHour: settings.dayEndHour,
            }) ??
            (() => {
              const nextDay = new Date(startOfDay(sourceEnd))
              nextDay.setDate(nextDay.getDate() + 1)
              return findGapOnDay({
                fromMs: +atMinutes(nextDay, settings.dayStartHour * 60),
                durationMin,
                blocks,
                courses,
                plannerEvents,
                scheduleOverrides,
                dayStartHour: settings.dayStartHour,
                dayEndHour: settings.dayEndHour,
              })
            })()

          if (slot == null) return null

          const copy: StudyBlock = {
            ...src,
            id: uid(),
            done: false,
            start: new Date(slot).toISOString(),
            end: new Date(slot + durationMin * 60_000).toISOString(),
            createdAt: new Date().toISOString(),
          }
          mutate('Duplicated block', (s) => ({ blocks: [...s.blocks, copy] }))
          return copy
        },
        removeBlock(id) {
          mutate('Deleted block', (s) => ({
            blocks: s.blocks.filter((b) => b.id !== id),
            sessions: s.sessions
              .filter((x) => !(x.blockId === id && isAutoLog(x)))
              .map((x) => (x.blockId === id ? { ...x, blockId: null } : x)),
          }))
        },
        toggleBlockDone(id) {
          const b = get().blocks.find((x) => x.id === id)
          if (!b) return
          const nowDone = !b.done
          if (get().assignments.some((a) => a.id === id)) {
            get().setAssignmentStatus(id, nowDone ? 'done' : 'todo')
            return
          }
          const at = new Date().toISOString()
          mutate(nowDone ? 'Marked block done' : 'Reopened block', (s) => {
            const blocks = s.blocks.map((x) => (x.id === id ? { ...x, done: nowDone } : x))
            let assignments = s.assignments
            if (b.subtaskId) {
              const siblings = blocks.filter((x) => x.subtaskId === b.subtaskId)
              const allDone = siblings.length > 0 && siblings.every((x) => x.done)
              assignments = assignments.map((a) =>
                a.subtasks.some((t) => t.id === b.subtaskId)
                  ? {
                      ...a,
                      subtasks: a.subtasks.map((t) =>
                        t.id === b.subtaskId
                          ? { ...t, done: allDone, completedAt: allDone ? t.completedAt ?? at : undefined }
                          : t,
                      ),
                      status: (nowDone || allDone) && a.status === 'todo' ? ('doing' as const) : a.status,
                    }
                  : a,
              )
            }
            return {
              blocks,
              assignments,
              sessions: syncBlockSessions(s.blocks, s.sessions, new Set([id]), nowDone, at),
            }
          })
        },

        addPlannerEvent(input) {
          const event: PlannerEvent = {
            id: uid(),
            title: input.title.trim(),
            kind: input.kind,
            start: input.start,
            end: input.end,
            allDay: input.allDay,
            courseId: input.courseId ?? null,
            room: input.room?.trim() || undefined,
            weight: input.weight,
            createdAt: new Date().toISOString(),
          }
          mutate('Added schedule item', (s) => ({ plannerEvents: [...s.plannerEvents, event] }))
          return event
        },
        updatePlannerEvent(id, patch) {
          mutate('Updated schedule item', (s) => ({
            plannerEvents: s.plannerEvents.map((event) =>
              event.id === id
                ? {
                    ...event,
                    ...patch,
                    title: patch.title === undefined ? event.title : patch.title.trim(),
                    room: patch.room === undefined ? event.room : patch.room.trim() || undefined,
                  }
                : event,
            ),
          }))
        },
        removePlannerEvent(id) {
          mutate('Deleted schedule item', (s) => ({
            plannerEvents: s.plannerEvents.filter((event) => event.id !== id),
          }))
        },
        upsertScheduleOverride(input) {
          const existing = get().scheduleOverrides.find((override) => override.date === input.date)
          const override: ScheduleOverride = existing
            ? { ...existing, ...input, title: input.title?.trim() || undefined }
            : {
                id: uid(),
                date: input.date,
                scheduleDay: input.scheduleDay,
                title: input.title?.trim() || undefined,
                createdAt: new Date().toISOString(),
              }
          mutate(existing ? 'Updated schedule day' : 'Changed schedule day', (s) => ({
            scheduleOverrides: existing
              ? s.scheduleOverrides.map((item) => (item.id === existing.id ? override : item))
              : [...s.scheduleOverrides, override],
          }))
          return override
        },
        removeScheduleOverride(id) {
          mutate('Reset schedule day', (s) => ({
            scheduleOverrides: s.scheduleOverrides.filter((override) => override.id !== id),
          }))
        },

        logSession(input) {
          if (!Number.isFinite(input.minutes) || input.minutes < MIN_LOGGABLE_MIN) return
          const nowIso = new Date().toISOString()
          const s: Session = {
            id: uid(),
            courseId: input.courseId ?? null,
            assignmentId: input.assignmentId ?? null,
            blockId: input.blockId ?? null,
            start: input.start ?? new Date(Date.now() - input.minutes * 60000).toISOString(),

            minutes: Math.round(input.minutes * 10) / 10,
            source: input.source ?? 'manual',
            sittingId: input.sittingId,
            auto: false,
            createdAt: nowIso,
          }
          mutate('Logged time', (st) => {
            const nextSessions = [...st.sessions, s]
            const placed = stateToUnits({ ...st, sessions: nextSessions })
            const rootId =
              (s.assignmentId && rootDeliverableId(placed, s.assignmentId)) ||
              (s.blockId && rootDeliverableId(placed, s.blockId)) ||
              null
            const nextAssignments = rootId
              ? st.assignments.map((a) => (a.id === rootId && a.status === 'todo' ? { ...a, status: 'doing' as const } : a))
              : st.assignments
            return {
              sessions: nextSessions,
              assignments: nextAssignments,
              units: stateToUnits({ ...st, sessions: nextSessions, assignments: nextAssignments }),
            }
          })
        },

        settleTimer(at) {
          const t = get().timer
          if (!t) return
          set({ timer: settle(t, at) })
        },

        reconcileTimer() {
          const t = get().timer
          if (!t) return null
          const r = recover(t, Date.now(), readHeartbeat())
          const recovered = withRecovery(get(), r)
          const at = new Date().toISOString()
          const units = stateToUnits(recovered as AppState)
          set({
            ...recovered,
            units,
            assignments: syncAssignmentsFromUnits(recovered.assignments, units, at),
            blocks: syncBlocksFromUnits(recovered.blocks, units),
          } as never)
          return r
        },

        addFocusNote(input) {
          markWelcomeNoteSeen()
          const noteType: NoteType = input.noteType ?? (input.studyId ? 'study' : 'lecture')
          const note: FocusNote = {
            id: uid(),
            title: input.title?.trim() || undefined,
            text: input.text.trim(),
            noteType,
            studyId: noteType === 'study' ? input.studyId ?? uid() : undefined,
            courseId: input.courseId ?? null,
            assignmentId: input.assignmentId ?? null,
            folderId: input.folderId ?? null,
            isPinned: Boolean(input.isPinned),
            categories: input.categories ? [...input.categories] : undefined,
            createdAt: new Date().toISOString(),
          }
          mutate('Added focus note', (s) => ({ focusNotes: [note, ...s.focusNotes] }))
          return note
        },
        updateFocusNote(id, patch) {
          mutate('Updated focus note', (s) => ({
            focusNotes: s.focusNotes.map((note) =>
              note.id === id
                ? (() => {
                    const nextType = patch.noteType ?? (patch.studyId !== undefined ? 'study' : note.noteType)
                    const noteType: NoteType = nextType ?? (note.studyId ? 'study' : 'lecture')
                    return {
                      ...note,
                      ...patch,
                      noteType,
                      studyId:
                        noteType === 'study' ? patch.studyId ?? note.studyId ?? uid() : undefined,
                      text: patch.text !== undefined ? patch.text : note.text,
                      updatedAt: new Date().toISOString(),
                    }
                  })()
                : note,
            ),
          }))
        },
        updateFocusNoteSilent(id, patch) {
          set((s) => ({
            focusNotes: s.focusNotes.map((note) =>
              note.id === id
                ? (() => {
                    const nextType = patch.noteType ?? (patch.studyId !== undefined ? 'study' : note.noteType)
                    const noteType: NoteType = nextType ?? (note.studyId ? 'study' : 'lecture')
                    return {
                      ...note,
                      ...patch,
                      noteType,
                      studyId:
                        noteType === 'study' ? patch.studyId ?? note.studyId ?? uid() : undefined,
                      text: patch.text !== undefined ? patch.text : note.text,
                      updatedAt: new Date().toISOString(),
                    }
                  })()
                : note,
            ),
          }))
        },
        markFocusNoteReviewed(id, reviewed) {
          mutate(reviewed ? 'Reviewed focus note' : 'Reopened focus note', (s) => ({
            focusNotes: s.focusNotes.map((note) =>
              note.id === id
                ? { ...note, reviewedAt: reviewed ? new Date().toISOString() : undefined }
                : note,
            ),
          }))
        },
        removeFocusNote(id) {
          markWelcomeNoteSeen()
          mutate('Removed focus note', (s) => ({
            focusNotes: s.focusNotes.filter((note) => note.id !== id),
          }))
        },
        convertFocusNoteToTask(id, options) {
          const note = get().focusNotes.find((n) => n.id === id)
          if (!note || note.assignmentId) return null
          const tomorrow = new Date(Date.now() + 24 * 3600 * 1000)
          tomorrow.setHours(23, 59, 0, 0)
          const assignment: Assignment = {
            id: uid(),
            courseId: note.courseId ?? null,
            title: getNoteTitleAndExcerpt(note.text).title || 'Untitled task',
            kind: 'personal',
            due: options?.due ?? tomorrow.toISOString(),
            status: 'todo',
            subtasks: [],
            createdAt: new Date().toISOString(),
          }
          mutate('Converted note to task', (s) => ({
            assignments: [...s.assignments, assignment],
            focusNotes: s.focusNotes.map((item) =>
              item.id === id ? { ...item, assignmentId: assignment.id } : item,
            ),
          }))
          return assignment
        },

        addNoteFolder(input) {
          const folder: NoteFolder = {
            id: uid(),
            name: input.name.trim(),
            parentId: input.parentId ?? null,
            courseId: input.courseId ?? null,
            color: input.color,
            icon: input.icon,
            createdAt: new Date().toISOString(),
          }
          mutate('Added note folder', (s) => ({
            noteFolders: [...(s.noteFolders ?? []), folder],
          }))
          return folder
        },
        updateNoteFolder(id, patch) {
          mutate('Updated note folder', (s) => ({
            noteFolders: (s.noteFolders ?? []).map((f) =>
              f.id === id ? { ...f, ...patch, updatedAt: new Date().toISOString() } : f,
            ),
          }))
        },
        moveNoteFolder(folderId, targetCourseId, targetParentId) {
          const s0 = get()
          const folder = (s0.noteFolders ?? []).find((f) => f.id === folderId)
          if (!folder || folderId === targetParentId) return

          const folderMap = new Map((s0.noteFolders ?? []).map((f) => [f.id, f]))
          let curr = targetParentId ? folderMap.get(targetParentId) : null
          while (curr) {
            if (curr.id === folderId) return
            curr = curr.parentId ? folderMap.get(curr.parentId) : null
          }

          const targetFolder = targetParentId ? folderMap.get(targetParentId) : null
          const resolvedCourseId = targetParentId ? (targetFolder?.courseId ?? null) : targetCourseId
          const descendants = new Set<string>([folderId])
          let added = true

          while (added) {
            added = false
            for (const child of s0.noteFolders ?? []) {
              if (child.parentId && descendants.has(child.parentId) && !descendants.has(child.id)) {
                descendants.add(child.id)
                added = true
              }
            }
          }

          const updatedAt = new Date().toISOString()
          mutate(`Moved folder "${folder.name}"`, (s) => ({
            noteFolders: (s.noteFolders ?? []).map((item) => {
              if (item.id === folderId) {
                return {
                  ...item,
                  parentId: targetParentId,
                  courseId: resolvedCourseId,
                  updatedAt,
                }
              }
              if (descendants.has(item.id)) {
                return {
                  ...item,
                  courseId: resolvedCourseId,
                  updatedAt,
                }
              }
              return item
            }),
            focusNotes: s.focusNotes.map((note) =>
              note.folderId && descendants.has(note.folderId)
                ? { ...note, courseId: resolvedCourseId, updatedAt }
                : note,
            ),
          }))
        },
        removeNoteFolder(id) {
          mutate('Removed note folder', (s) => {
            const toDelete = new Set<string>([id])
            let added = true
            while (added) {
              added = false
              for (const f of s.noteFolders ?? []) {
                if (f.parentId && toDelete.has(f.parentId) && !toDelete.has(f.id)) {
                  toDelete.add(f.id)
                  added = true
                }
              }
            }
            return {
              noteFolders: (s.noteFolders ?? []).filter((f) => !toDelete.has(f.id)),
              focusNotes: s.focusNotes.map((note) =>
                note.folderId && toDelete.has(note.folderId) ? { ...note, folderId: null } : note,
              ),
            }
          })
        },
        batchAddNoteFolders(folders) {
          if (!folders.length) return
          mutate('Added note folders', (s) => ({
            noteFolders: [...(s.noteFolders ?? []), ...folders],
          }))
        },

        startSitting(input) {
          if (get().timer) get().endSitting()
          const now = Date.now()

          const plan = input.plan?.length ? input.plan : undefined
          const first = plan?.[0]
          set({
            timer: {
              id: uid(),
              assignmentId: input.assignmentId,
              courseId: input.courseId,
              blockId: input.blockId,
              label: first?.label ?? input.label,
              source: input.justStart ? 'juststart' : 'pomodoro',
              startedAt: new Date(now).toISOString(),
              phase: first && first.kind === 'break' ? 'break' : 'work',
              runningSince: now,
              phaseSec: 0,
              phaseTotalSec: Math.max(1, Math.round((first?.minutes ?? input.minutes) * 60)),
              workedSec: 0,
              rounds: 0,
              justStart: plan ? undefined : input.justStart,
              plan,
              planIndex: plan ? 0 : undefined,
              lastSeenAt: now,
            },
          })
        },

        pauseTimer() {
          const t = get().timer
          if (!t || t.runningSince == null) return
          set({ timer: { ...settle(t), runningSince: null } })
        },

        resumeTimer() {
          const t = get().timer
          if (!t || t.runningSince != null) return
          const now = Date.now()
          set({ timer: { ...t, runningSince: now, lastSeenAt: now } })
        },

        completeTimerPhase() {
          const t = get().timer
          if (!t) return
          set({ timer: completePhase(t, get().settings) })
        },

        startNextRound() {
          const t = get().timer
          if (!t || t.phase === 'work') return
          const s = get().settings

          set({ timer: toWork({ ...settle(t), justStart: false }, Math.max(1, s.focusMin) * 60) })
        },

        endSitting(opts = {}) {
          const t0 = get().timer
          if (!t0) return null
          const now = Date.now()
          const t = settle(t0, now)
          const minutes = Math.round((t.workedSec / 60) * 10) / 10
          const keep = minutes >= MIN_LOGGABLE_MIN

          const before = get()

          if (keep || opts.finish) {
            recordUndo(opts.finish ? 'Finished a task' : 'Logged a session', snapshotOf(before))
          }

          const already = before.sessions.some((x) => x.sittingId === t.id)
          let sessions = keep && !already ? [...before.sessions, { id: uid(), ...sessionFrom(t, now) }] : before.sessions
          const at = new Date(now).toISOString()

          const finishIds = opts.finish
            ? new Set(
                before.blocks
                  .filter(
                    (b) => (t.blockId && b.id === t.blockId) || (t.assignmentId && b.assignmentId === t.assignmentId),
                  )
                  .map((b) => b.id),
              )
            : new Set<ID>()

          if (opts.finish && finishIds.size > 0) {
            sessions = syncBlockSessions(before.blocks, sessions, finishIds, true, at)
          }

          const totalMin = t.assignmentId
            ? sessions.reduce(
                (sum, x) =>
                  x.assignmentId === t.assignmentId && Number.isFinite(x.minutes) && x.minutes >= 0
                    ? sum + x.minutes
                    : sum,
                0,
              )
            : minutes

          const blocks =
            opts.finish
              ? before.blocks.map((b) => (finishIds.has(b.id) ? { ...b, done: true } : b))
              : before.blocks

          const nextAssignments = t.assignmentId
            ? before.assignments.map((a) => {
                if (a.id !== t.assignmentId) return a
                if (opts.finish) {
                  return {
                    ...a,
                    status: 'done' as const,
                    completedAt: at,
                    subtasks: a.subtasks.map((x) => ({ ...x, done: true, completedAt: x.completedAt ?? at })),
                  }
                }

                return keep && a.status === 'todo' ? { ...a, status: 'doing' as const } : a
              })
            : before.assignments

          const nextUnits = reconcileUnitClosures(
            stateToUnits({
              ...before,
              sessions,
              blocks,
              assignments: nextAssignments,
            }),
            before.units && Object.keys(before.units).length > 0 ? before.units : stateToUnits(before),
            at,
          )
          const rel = unitsToRelational(nextUnits)
          const priorUnits =
            before.units && Object.keys(before.units).length > 0 ? before.units : stateToUnits(before)
          const syncedSessions = mergeProjectedSessions(rel.sessions, sessions, priorUnits, nextUnits)
          const syncedAssignments = syncAssignmentsFromUnits(nextAssignments, nextUnits, at)

          set({
            sessions: syncedSessions,
            blocks: syncBlocksFromUnits(blocks, nextUnits),
            assignments: syncedAssignments,
            units: nextUnits,
            timer: null,
          })
          return { minutes: keep ? minutes : 0, totalMin }
        },

        addToToday(assignmentId) {
          if (get().todayList.some((t) => t.assignmentId === assignmentId)) return
          mutate('Added to today', (s) => ({
            todayList: [...s.todayList, { assignmentId, day: dayKey(Date.now()) }],
          }))
        },
        removeFromToday(assignmentId) {
          mutate('Removed from today', (s) => ({
            todayList: s.todayList.filter((t) => t.assignmentId !== assignmentId),
          }))
        },
        reorderToday(from, to) {
          mutate('Reordered today', (s) => {
            const next = [...s.todayList]
            const [moved] = next.splice(from, 1)
            if (!moved) return {}
            next.splice(to, 0, moved)
            return { todayList: next }
          })
        },
        clearDoneFromToday() {
          const done = new Set(
            get()
              .assignments.filter((a) => a.status === 'done')
              .map((a) => a.id),
          )
          if (!done.size || !get().todayList.some((t) => done.has(t.assignmentId))) return
          set((s) => ({
            todayList: s.todayList.filter((t) => !done.has(t.assignmentId)),
          }))
        },

        muteNudge(id) {
          set((s) => ({
            settings: {
              ...s.settings,
              mutedNudges: { ...pruneMutes(s.settings.mutedNudges, dayKey(Date.now())), [id]: dayKey(Date.now()) },
            },
          }))
        },
        updateSettings(patch) {
          set((s) => ({ settings: { ...s.settings, ...patch } }))
        },

        pushUndo(label) {
          recordUndo(label, snapshotOf(get()))
        },
        undo() {
          const entry = undoStack.pop()
          if (!entry) return false
          redoStack.push({ label: entry.label, snapshot: snapshotOf(get()), at: Date.now() })
          set(entry.snapshot as never)
          return true
        },
        redo() {
          const entry = redoStack.pop()
          if (!entry) return false
          undoStack.push({ label: entry.label, snapshot: snapshotOf(get()), at: Date.now() })
          if (undoStack.length > 40) undoStack.shift()
          if (redoStack.length > 40) redoStack.shift()
          set(entry.snapshot as never)
          return true
        },
        batch(label, run) {
          if (activeBatch) {
            run(get())
            return
          }
          activeBatch = { label, snapshot: snapshotOf(get()) }
          try {
            run(get())
          } finally {
            const batch = activeBatch
            activeBatch = null
            if (batch) recordUndo(batch.label, batch.snapshot)
          }
        },

        loadSample() {
          const sample = buildSample()
          recordUndo('Loaded sample data', snapshotOf(get()))

          const fullSample = {
            ...sample,
            plannerEvents: sample.plannerEvents ?? [],
            scheduleOverrides: [],
            todayList: sample.todayList ?? [],
            settings: {
              ...get().settings,
              onboarded: true,
              termStart: sample.settings?.termStart,
              termEnd: sample.settings?.termEnd,
            },
            isSample: true,
          }

          set({
            ...fullSample,
            units: stateToUnits(fullSample as AppState),
          })
        },
        resetAll() {
          undoStack = []
          redoStack = []
          set({ ...EMPTY, units: {}, settings: { ...DEFAULT_SETTINGS, onboarded: true }, isSample: false })
        },
        importState(next) {
          recordUndo('Imported data', snapshotOf(get()))
          const settings = { ...DEFAULT_SETTINGS, ...(next.settings ?? {}), onboarded: true }
          if (!isPaletteId(settings.palette)) settings.palette = DEFAULT_PALETTE
          const migrated = migrateLegacyCourseExams(next.courses ?? [], next.plannerEvents ?? [], next.blocks ?? [])
          const nextState: AppState = {
            version: 5,
            courses: migrated.courses,
            assignments: next.assignments ?? [],
            blocks: migrated.blocks,
            plannerEvents: migrated.plannerEvents,
            scheduleOverrides: next.scheduleOverrides ?? [],
            sessions: next.sessions ?? [],
            focusNotes: migrateFocusNotes(next.focusNotes ?? []),
            noteFolders: next.noteFolders ?? [],
            todayList: next.todayList ?? [],
            settings,
            timer: null,
            isSample: false,
          }
          const at = new Date().toISOString()
          const imported = stampCompletions(stateToUnits({ ...nextState, units: next.units ?? {} }), at)
          set({
            ...nextState,
            units: imported,
            assignments: syncAssignmentsFromUnits(nextState.assignments, imported, at),
            blocks: syncBlocksFromUnits(nextState.blocks, imported),
          })
        },
      }
    },
    {
      name: STORAGE_KEY,
      version: 5,
      storage: createJSONStorage(resolveStorage),

      migrate: (persisted, version) => {
        const st = (persisted ?? {}) as Partial<AppState> & { timer?: unknown }
        if (version < 3) {
          const t = st.timer as LegacyTimer | null | undefined
          if (t && t.mode === 'focus' && typeof t.totalSec === 'number' && typeof t.endsAt === 'number') {
            const stale = t.pausedSec == null && Date.now() - t.endsAt > STALE_MS
            const remaining = t.pausedSec ?? Math.max(0, (t.endsAt - Date.now()) / 1000)
            const workedSec = stale ? 0 : Math.min(t.totalSec, Math.max(0, t.totalSec - remaining))
            const minutes = Math.round((workedSec / 60) * 10) / 10
            if (minutes >= MIN_LOGGABLE_MIN) {
              st.sessions = [
                ...(st.sessions ?? []),
                {
                  id: uid(),
                  courseId: t.courseId ?? null,
                  assignmentId: t.assignmentId ?? null,
                  blockId: t.blockId ?? null,
                  start: new Date(t.endsAt - t.totalSec * 1000).toISOString(),
                  minutes,
                  source: t.justStart ? 'juststart' : 'pomodoro',
                  createdAt: new Date().toISOString(),
                },
              ]
            }
          }
          st.timer = null
        }
        const migrated = migrateLegacyCourseExams(st.courses ?? [], st.plannerEvents ?? [], st.blocks ?? [])
        st.courses = migrated.courses
        st.plannerEvents = migrated.plannerEvents
        st.blocks = migrated.blocks
        st.version = 5
        st.focusNotes = migrateFocusNotes(st.focusNotes ?? [])
        st.noteFolders ??= []
        return st as any
      },

      merge: (persisted, current) => {
        const at = new Date().toISOString()
        const next = { ...current, ...(persisted as Partial<NudgeStore>) } as NudgeStore
        const migrated = migrateLegacyCourseExams(next.courses, next.plannerEvents, next.blocks)
        next.courses = migrated.courses
        next.plannerEvents = migrated.plannerEvents
        next.blocks = migrated.blocks
        next.version = 5
        next.focusNotes = migrateFocusNotes(next.focusNotes ?? [])
        next.noteFolders ??= []
        if (next.focusNotes.length > 0) markWelcomeNoteSeen()
        next.settings = { ...DEFAULT_SETTINGS, ...next.settings }
        next.plannerEvents ??= []
        next.scheduleOverrides ??= []
        next.units = stampCompletions(stateToUnits(next), at)
        next.assignments = syncAssignmentsFromUnits(next.assignments, next.units, at)
        next.blocks = syncBlocksFromUnits(next.blocks, next.units)
        if (!next.timer) return next
        pendingRecovery = recover(next.timer, Date.now(), readHeartbeat())
        const recovered = withRecovery(next, pendingRecovery)
        recovered.units = stampCompletions(stateToUnits(recovered), at)
        recovered.assignments = syncAssignmentsFromUnits(recovered.assignments, recovered.units, at)
        recovered.blocks = syncBlocksFromUnits(recovered.blocks, recovered.units)
        return recovered
      },
      partialize: (s) => ({
        version: s.version,
        courses: s.courses,
        assignments: s.assignments,
        blocks: s.blocks,
        plannerEvents: s.plannerEvents,
        scheduleOverrides: s.scheduleOverrides,
        sessions: s.sessions,
        focusNotes: s.focusNotes,
        noteFolders: s.noteFolders ?? [],
        todayList: s.todayList,
        settings: s.settings,
        timer: s.timer,
        isSample: s.isSample,
      }),
    },
  ),
)

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || e.newValue == null) return
    const running = useStore.getState().timer
    void Promise.resolve(useStore.persist.rehydrate()).then(() => {
      if (!running) return
      takeTimerRecovery()
      if (useStore.getState().timer?.id !== running.id) useStore.setState({ timer: running })
    })
  })
}

function buildSample(): Partial<AppState> {
  const now = new Date()
  const iso = (d: Date) => d.toISOString()
  const at = (dayOffset: number, hour: number, minute = 0) => {
    const d = new Date(now)
    d.setDate(d.getDate() + dayOffset)
    d.setHours(hour, minute, 0, 0)
    return d
  }
  const daysAgo = (n: number) => at(-n, 20)

  const mk = (
    code: string,
    color: ColorSlot,
    professor: string,
    room: string,

    meetings: [number, number, number, MeetingKind, string?][],
    extra: Partial<Course> = {},
  ): Course => ({
    id: uid(),
    code,
    color,
    professor,
    room,
    targetGrade: 85,
    createdAt: iso(at(-40, 9)),
    meetings: meetings.map(([day, start, end, kind, room]) => ({ id: uid(), day, start, end, kind, room })),
    ...extra,
  })

  const comp = mk('COMP 250', 1, 'Prof. Alberini', 'Leacock 132', [
    [1, 10 * 60 + 5, 11 * 60 + 25, 'lecture'],
    [3, 10 * 60 + 5, 11 * 60 + 25, 'lecture'],
    [3, 11 * 60 + 35, 12 * 60 + 25, 'tutorial', 'Trottier 2100'],
  ], {
    title: 'Intro to Computer Science',
    currentGrade: 79,
  })

  const math = mk('MATH 133', 3, 'Prof. Drury', 'Burnside 1B45', [
    [1, 13 * 60 + 5, 14 * 60 + 25, 'lecture'],
    [3, 13 * 60 + 5, 14 * 60 + 25, 'lecture'],
    [5, 12 * 60 + 35, 13 * 60 + 25, 'tutorial', 'Burnside 1205'],
  ], { title: 'Linear Algebra & Geometry', currentGrade: 88 })

  const poli = mk('POLI 212', 5, 'Prof. Roberts', 'Arts W-215', [
    [2, 11 * 60 + 35, 12 * 60 + 55, 'lecture'],
    [4, 11 * 60 + 35, 12 * 60 + 55, 'lecture'],
    [2, 13 * 60, 13 * 60 + 50, 'conference', 'Ferrier 456'],
  ], { title: 'Government & Politics of Europe', currentGrade: 82 })

  const psyc = mk('PSYC 100', 2, 'Prof. Titone', 'Adams Auditorium', [
    [1, 8 * 60 + 35, 9 * 60 + 55, 'lecture'],
    [3, 8 * 60 + 35, 9 * 60 + 55, 'lecture'],
    [5, 9 * 60 + 35, 10 * 60 + 25, 'conference', 'Stewart Bio N2/2'],
    [4, 14 * 60 + 35, 17 * 60 + 25, 'lab', 'Stewart Bio S1/4'],
  ], { title: 'Introduction to Psychology', currentGrade: 91 })

  const courses = [comp, math, poli, psyc]

  const plannerEvents: PlannerEvent[] = []
  plannerEvents.push({
    id: uid(),
    title: 'Midterm',
    kind: 'exam',
    start: iso(at(9, 18)),
    end: iso(at(9, 21)),
    allDay: false,
    courseId: comp.id,
    room: 'Leacock 132',
    weight: 25,
    createdAt: iso(now),
  })

  const A = (
    courseId: string,
    title: string,
    kind: TaskKind,
    dueDate: Date,
    weight: number,
    extra: Partial<Assignment> = {},
  ): Assignment => ({
    id: uid(),
    courseId,
    title,
    kind,
    due: iso(dueDate),
    weight,
    status: 'todo',
    estimateMin: defaultEffort({ kind, weight }),
    subtasks: [],
    createdAt: iso(at(-9, 12)),
    ...extra,
  })

  const essay = A(poli.id, 'Comparative politics essay', 'essay', at(3, 23, 59), 30, {
    createdAt: iso(at(-11, 12)),
    estimateMin: 420,
  })
  const a3 = A(comp.id, 'Assignment 3: graphs', 'problemset', at(2, 23, 59), 12, {
    status: 'doing',
    estimateMin: 300,
    subtasks: [
      { id: uid(), title: 'Read the handout, list the questions', done: true, estimateMin: 30, completedAt: iso(daysAgo(2)) },
      { id: uid(), title: 'Q1–Q2 (BFS/DFS)', done: true, estimateMin: 75, completedAt: iso(daysAgo(1)) },
      { id: uid(), title: 'Q3 (shortest path)', done: false, estimateMin: 90, due: iso(at(0, 17)) },
      { id: uid(), title: 'Write-up and submit', done: false, estimateMin: 45, due: iso(at(1, 16, 15)) },
    ],
  })

  const assignments: Assignment[] = [
    a3,
    essay,
    A(math.id, 'WeBWorK 6', 'problemset', at(1, 23, 59), 4, { estimateMin: 90 }),
    A(psyc.id, 'Chapter 8–9 reading', 'reading', at(4, 9, 0), 2, { estimateMin: 90 }),
    A(comp.id, 'Midterm review', 'midterm', at(9, 18, 0), 25, { estimateMin: 480 }),
    A(math.id, 'WeBWorK 7', 'problemset', at(8, 23, 59), 4, { estimateMin: 90 }),
    A(poli.id, 'Seminar response 4', 'assignment', at(6, 12, 0), 5, { estimateMin: 60 }),
    A(psyc.id, 'Research methods quiz', 'quiz', at(12, 10, 0), 8, { estimateMin: 120 }),

    A(math.id, 'WeBWorK 5', 'problemset', at(-4, 23, 59), 4, {
      status: 'done',
      estimateMin: 60,
      grade: 92,
      completedAt: iso(daysAgo(5)),
      createdAt: iso(at(-14, 9)),
    }),
    A(comp.id, 'Assignment 2: recursion', 'problemset', at(-7, 23, 59), 12, {
      status: 'done',
      estimateMin: 180,
      grade: 74,
      completedAt: iso(daysAgo(7)),
      createdAt: iso(at(-20, 9)),
    }),
    A(psyc.id, 'Reflection paper 1', 'essay', at(-9, 23, 59), 10, {
      status: 'done',
      estimateMin: 150,
      grade: 88,
      completedAt: iso(daysAgo(11)),
      createdAt: iso(at(-21, 9)),
    }),
    A(poli.id, 'Reading response 3', 'assignment', at(-2, 12, 0), 5, {
      status: 'done',
      estimateMin: 60,
      grade: 85,
      completedAt: iso(daysAgo(2)),
      createdAt: iso(at(-12, 9)),
    }),
  ]

  const sessions: Session[] = []
  const pattern: [number, number, ColorSlot | 0][] = []
  for (let d = 24; d >= 1; d--) {
    const dow = at(-d, 12).getDay()
    if (dow === 0 && d % 3 !== 0) continue
    const seedy = (d * 2654435761) % 100
    if (seedy < 22) continue
    const rounds = 1 + (seedy % 3)
    for (let r = 0; r < rounds; r++) pattern.push([d, 25 + ((seedy + r * 13) % 4) * 15, 0])
  }
  const courseCycle = [comp, math, psyc, poli]
  pattern.forEach(([d, minutes], i) => {
    const c = courseCycle[(i + d) % courseCycle.length]

    if (c.id === poli.id && d <= 4) return
    const start = at(-d, 14 + ((i * 3) % 7), (i % 4) * 15)
    sessions.push({
      id: uid(),
      courseId: c.id,
      assignmentId: null,
      start: iso(start),
      minutes,
      source: 'pomodoro',
      createdAt: iso(start),
    })
  })

  sessions.push({
    id: uid(),
    courseId: comp.id,
    assignmentId: a3.id,
    start: iso(at(0, Math.max(8, new Date().getHours() - 2))),
    minutes: 50,
    source: 'pomodoro',
    createdAt: iso(now),
  })

  const placed: StudyBlock[] = []
  const B = (
    dayOffset: number,
    hour: number,
    min: number,
    dur: number,
    courseId: string,
    assignmentId: string | null,
    done = false,
    subtaskId?: string,
  ): StudyBlock => {
    const day = at(dayOffset, 0, 0)
    const dow = day.getDay()
    const busy: [number, number][] = courses
      .flatMap((c) => c.meetings.filter((m) => m.day === dow))
      .map((m) => [m.start - 10, m.end + 10])
    for (const p of placed) {
      if (dayKey(p.start) !== dayKey(day)) continue
      busy.push([minutesOfDay(p.start) - 10, minutesOfDay(p.end) + 10])
    }

    let start = hour * 60 + min
    const latest = 22 * 60 - dur
    while (start <= latest && busy.some(([s, e]) => start < e && s < start + dur)) start += 15

    const block: StudyBlock = {
      id: uid(),
      courseId,
      assignmentId,
      subtaskId,
      start: iso(at(dayOffset, 0, Math.min(start, latest))),
      end: iso(at(dayOffset, 0, Math.min(start, latest) + dur)),
      done,
      createdAt: iso(at(-1, 9)),
    }
    placed.push(block)
    return block
  }

  const blocks: StudyBlock[] = [
    B(0, 16, 0, 60, comp.id, a3.id, false, a3.subtasks[2].id),
    B(0, 19, 30, 90, poli.id, essay.id),
    {
      id: uid(),
      kind: 'appointment',
      courseId: null,
      assignmentId: null,
      title: 'Dentist appointment',
      location: 'Downtown Dental Clinic',
      start: iso(at(1, 13, 0)),
      end: iso(at(1, 14, 0)),
      done: false,
      createdAt: iso(at(-1, 9)),
    },
    B(1, 15, 0, 75, comp.id, a3.id, false, a3.subtasks[3].id),
    B(1, 18, 0, 60, math.id, null),
    {
      id: uid(),
      kind: 'free',
      courseId: null,
      assignmentId: null,
      title: 'Free time',
      start: iso(at(2, 17, 0)),
      end: iso(at(2, 19, 0)),
      done: false,
      createdAt: iso(at(-1, 9)),
    },
    B(2, 14, 0, 120, poli.id, essay.id),
    B(3, 10, 0, 90, poli.id, essay.id),
    B(-1, 19, 0, 60, poli.id, essay.id, false),
    B(-2, 17, 0, 60, comp.id, a3.id, true),
  ]

  return {
    courses,
    assignments,
    blocks,
    plannerEvents,
    sessions,

    todayList: [
      { assignmentId: a3.id, day: dayKey(now) },
      { assignmentId: essay.id, day: dayKey(now) },
    ],
      settings: { ...DEFAULT_SETTINGS, onboarded: true, name: 'Tommy', termStart: dayKey(at(-40, 9)), termEnd: dayKey(at(60, 9)) },
    timer: null,
  }
}
