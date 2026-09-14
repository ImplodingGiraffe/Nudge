export type ID = string

export type DayKey = string

export type Iso = string

export type ColorSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export type PaletteId =
  | 'sand'
  | 'slate'
  | 'ocean'
  | 'forest'
  | 'plum'
  | 'rose'
  | 'amber'
  | 'mint'
  | 'indigo'
  | 'lavender'
  | 'terracotta'
  | 'graphite'

export type MeetingKind = 'lecture' | 'tutorial' | 'lab' | 'conference'

export interface Meeting {
  id: ID
  day: number
  start: number
  end: number
  kind: MeetingKind
  room?: string
  startsOn?: DayKey
  endsOn?: DayKey
}

export interface Course {
  id: ID
  code: string
  title?: string
  color: ColorSlot
  professor?: string
  room?: string
  currentGrade?: number
  targetGrade?: number
  meetings: Meeting[]
  archived?: boolean
  createdAt: Iso
}

export interface CourseExam {
  id: ID
  title: string
  date: DayKey
  startTime: string
  endTime: string
  room?: string
  weight?: number
}

export type TaskStatus = 'todo' | 'doing' | 'done'

export type TaskKind =
  | 'assignment'
  | 'essay'
  | 'problemset'
  | 'project'
  | 'reading'
  | 'quiz'
  | 'midterm'
  | 'final'
  | 'takehome'
  | 'lab'
  | 'presentation'
  | 'personal'

export interface Subtask {
  id: ID
  title: string
  done: boolean
  due?: Iso
  estimateMin?: number
  completedAt?: Iso
  parentId?: ID
}

export interface Assignment {
  id: ID
  courseId: ID | null
  title: string
  kind: TaskKind
  due?: Iso
  weight?: number
  status: TaskStatus
  estimateMin?: number
  subtasks: Subtask[]
  notes?: string
  grade?: number
  completedAt?: Iso
  createdAt: Iso
  private?: boolean
  breakdownDismissed?: boolean
  archived?: boolean
}

export interface BlockSegment {
  kind: 'prep' | 'focus' | 'break' | 'practice' | 'review' | 'wrap'
  minutes: number
  label: string
}

export type BlockKind = 'study' | 'free' | 'appointment' | 'one_off_class'

export interface StudyBlock {
  id: ID
  kind?: BlockKind
  courseId: ID | null
  assignmentId: ID | null
  subtaskId?: ID | null
  title?: string
  courseCode?: string
  location?: string
  start: Iso
  end: Iso
  done?: boolean
  plan?: BlockSegment[]
  locked?: boolean
  sourceMeetingId?: ID
  sourceDate?: DayKey
  createdAt: Iso
}

export type PlannerEventKind = 'custom_class' | 'exam' | 'blocked_time' | 'reading_break' | 'holiday'

export interface PlannerEvent {
  id: ID
  title: string
  kind: PlannerEventKind
  start: Iso
  end: Iso
  allDay: boolean
  courseId?: ID | null
  room?: string
  weight?: number
  createdAt: Iso
}

export interface ScheduleOverride {
  id: ID
  date: DayKey
  scheduleDay: number | null
  title?: string
  createdAt: Iso
}

export type SessionSource = 'pomodoro' | 'juststart' | 'manual' | 'block'

export interface Session {
  id: ID
  courseId: ID | null
  assignmentId: ID | null
  blockId?: ID | null
  start: Iso
  end?: Iso
  minutes: number
  source: SessionSource
  sittingId?: ID
  auto?: boolean
  createdAt: Iso
}

export type NoteCategory = 'study-checklist' | 'rapid-question' | 'flagged-uncertainty'
export type NoteType = 'lecture' | 'study'

export interface NoteFolder {
  id: ID
  name: string
  parentId?: ID | null
  courseId?: ID | null
  color?: string
  icon?: string
  createdAt: Iso
  updatedAt?: Iso
}

export interface FocusNote {
  id: ID
  title?: string
  text: string
  noteType?: NoteType
  studyId?: ID
  courseId?: ID | null
  assignmentId?: ID | null
  folderId?: ID | null
  isPinned?: boolean
  categories?: NoteCategory[]
  createdAt: Iso
  updatedAt?: Iso
  reviewedAt?: Iso
}

export interface TimerState {
  id: ID
  assignmentId: ID | null
  courseId: ID | null
  blockId: ID | null
  label?: string
  source: SessionSource
  startedAt: Iso
  phase: 'work' | 'break' | 'ready'
  runningSince: number | null
  phaseSec: number
  phaseTotalSec: number
  workedSec: number
  rounds: number
  justStart?: boolean
  plan?: BlockSegment[]
  planIndex?: number
  lastSeenAt: number
}

export interface Settings {
  name?: string
  addMode: 'quick' | 'detailed'
  focusMin: number
  shortBreakMin: number
  longBreakMin: number
  longBreakEvery: number
  dailyCapacityMin: number
  tone: 'gentle' | 'balanced' | 'blunt'
  theme: 'system' | 'light' | 'dark'
  palette: PaletteId
  dayStartHour: number
  dayEndHour: number
  sound: boolean
  termStart?: DayKey
  termEnd?: DayKey
  onboarded: boolean
  mutedNudges: Record<string, DayKey>
}

export interface TodayRef {
  assignmentId: ID
  day: DayKey
}

export interface ScheduleSlot {
  start: Iso
  end: Iso
  locked?: boolean
}

export interface TimeLog {
  id: ID
  start: Iso
  end?: Iso
  minutes: number
  source: SessionSource
  sittingId?: ID
  auto?: boolean
  createdAt: Iso

  courseId?: ID | null
  assignmentId?: ID | null
}

export type WorkStatus = 'todo' | 'doing' | 'done'

export interface WorkUnit {
  id: ID
  parentId: ID | null
  courseId: ID | null
  title: string
  kind: TaskKind | 'step' | 'sitting'
  blockKind?: BlockKind
  location?: string
  due?: Iso
  weight?: number
  grade?: number
  status: WorkStatus
  estimateMin: number
  schedule?: ScheduleSlot | null
  plan?: BlockSegment[]
  logs: TimeLog[]
  notes?: string
  completedAt?: Iso
  createdAt: Iso
  updatedAt?: Iso
  private?: boolean
  breakdownDismissed?: boolean
  archived?: boolean
}

export interface AppState {
  version: number
  courses: Course[]
  assignments: Assignment[]
  blocks: StudyBlock[]
  plannerEvents: PlannerEvent[]
  scheduleOverrides: ScheduleOverride[]
  sessions: Session[]
  focusNotes: FocusNote[]
  noteFolders?: NoteFolder[]
  units?: Record<ID, WorkUnit>
  todayList: TodayRef[]
  settings: Settings
  timer: TimerState | null
  isSample?: boolean
}
