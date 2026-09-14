import { PALETTE_IDS } from '../theme'

export const ACTION_GROUPS = [
  'views',
  'create_tasks',
  'update_tasks',
  'delete_tasks',
  'breakdowns',
  'create_schedule_items',
  'update_schedule_items',
  'remove_schedule_items',
  'schedule_blocks',
  'move_blocks',
  'rename_blocks',
  'remove_blocks',
  'today_list',
  'reorder_today',
  'study_sessions',
  'create_courses',
  'update_courses',
  'update_settings',
  'update_steps',
  'complete_steps',
  'remove_steps',
  'duplicate_blocks',
  'complete_blocks',
  'delete_courses',
  'archive_courses',
  'log_sessions',
  'mute_nudges',
  'commands',
] as const

export type ActionGroup = (typeof ACTION_GROUPS)[number]

export const TASK_KINDS = [
  'assignment',
  'essay',
  'problemset',
  'project',
  'reading',
  'quiz',
  'midterm',
  'final',
  'takehome',
  'lab',
  'presentation',

  'personal',
] as const

export const SEGMENT_KINDS = ['prep', 'focus', 'break', 'practice', 'review', 'wrap'] as const

export const MEETING_KINDS = ['lecture', 'tutorial', 'lab', 'conference'] as const
export const SCHEDULE_ITEM_KINDS = ['exam', 'custom_class', 'blocked_time', 'reading_break', 'holiday'] as const
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const TONES = ['gentle', 'balanced', 'blunt'] as const
export const THEMES = ['system', 'light', 'dark'] as const
export const PALETTES = PALETTE_IDS

export const COMMANDS = [
  'open_today',
  'open_planner',
  'open_courses',
  'open_progress',
  'open_task',
  'open_course',
  'open_settings',
  'open_add_task',
  'open_shortcuts',
  'open_export',
  'open_import',
  'open_erase_confirm',
  'start_focus',
  'pause_timer',
  'resume_timer',
  'next_round',
  'stop_timer',
  'finish_and_stop',
  'show_focus',
  'hide_focus',
  'next_week',
  'previous_week',
  'this_week',
  'toggle_class_times',
  'fill_gaps',
  'load_sample_data',
  'undo',
] as const

export const VIEW_KINDS = [
  'agenda',
  'timetable',
  'task',
  'work',
  'course',
  'day',
  'workload',
  'progress',
] as const

export type ViewKind = (typeof VIEW_KINDS)[number]

export const WORK_FILTERS = ['open', 'done', 'all'] as const

export const INTENTS = ['answer', 'advice', 'plan', 'question'] as const

const str = (description: string) => ({ type: 'string', description })

const int = (description: string, minimum: number, maximum: number) => ({
  type: 'integer',
  description,
  minimum,
  maximum,
})

const REASON = str(
  'One short clause, user-facing, explaining why this specific change. e.g. "3 days before the exam". No filler.',
)
const DATE = str('Local calendar date, YYYY-MM-DD. Never a timestamp, never a timezone.')
const TIME = str('Local 24-hour time, HH:MM.')
const TASK_ID = str('The task id, copied character-for-character from the data above.')

const arrayOf = (description: string, properties: Record<string, unknown>, required: string[]) => ({
  type: 'array',
  description,
  items: { type: 'object', properties, required },
})

const NO_COURSE = 'NONE'

const courseField = (codes: string[], description: string) => ({
  type: 'string',
  enum: [...codes, NO_COURSE],
  description,
})

const proposedCourseField = (description: string) => ({
  type: 'string',
  description,
})

const buildGroups = (courseCodes: string[]): Record<ActionGroup, ReturnType<typeof arrayOf>> => ({
  views: arrayOf(
    'Visual blocks for Nudge to pull up beside your answer. Use these whenever the student wants to SEE something they already have — what is coming up, their class times, one assignment, one course, one day, how full their week is, what they have got through. A card is always better than describing their data back to them in a sentence, and you should reach for one on almost every question about their own week. They change nothing, so they are never approved and never need to be. At most four, and only ones that answer what was actually asked.',
    {
      kind: {
        type: 'string',
        enum: [...VIEW_KINDS],
        description:
          'Which card. agenda = everything ahead in date order: deadlines, classes and study blocks (the right answer to "what have I got coming up"). timetable = the weekly class-time grid, all courses or one. task = one assignment in full, with its steps, its blocks and what is left. work = a filtered list of assignments. course = one course in full. day = one day laid out hour by hour. workload = how full each of the next few days is against their capacity. progress = study time, streak and what they have finished.',
      },
      title: str(
        'The card’s own heading, 2-6 words, sentence case, naming what is in it — "MATH 140 class times", "The next seven days", "What’s left on the term paper". Never a question, never a sentence.',
      ),
      taskId: str('For kind "task": the task id, copied character-for-character from the data above.'),
      courseCode: courseField(
        courseCodes,
        'Narrows the card to one course. Required for kind "course". Optional on "timetable", "agenda" and "work" — leave it out to cover every course, which is what a student asking about "my classes" means.',
      ),
      date: str('For kind "day": which day, YYYY-MM-DD, local calendar. Omit only if they clearly mean today.'),
      days: int(
        'How far ahead the card reaches, for kinds "agenda", "work", "workload" and "progress". 7 for "this week" or an unqualified "coming up", 1 for today, 14 for the next fortnight. For "progress" it looks backwards instead.',
        1,
        30,
      ),
      status: {
        type: 'string',
        enum: [...WORK_FILTERS],
        description: 'For kind "work": which tasks to list. Defaults to open work, which is nearly always what they mean.',
      },
    },
    ['kind', 'title'],
  ),

  create_tasks: arrayOf(
    'Assignments to add. Only what they actually told you about.',
    {
      reason: REASON,
      title: str('What the work is. Concrete and specific.'),
      date: str('The day it is due, YYYY-MM-DD, local calendar. A bare weekday means the next one still to come, unless they clearly mean a past day.'),
      time: TIME,
      courseCode: proposedCourseField(
        `Which course this belongs to. Use an existing course code, the code of a course proposed in create_courses, or ${NO_COURSE} if it genuinely belongs to none.`,
      ),
      kind: {
        type: 'string',
        enum: [...TASK_KINDS],
        description:
          'What sort of work this is. Use "midterm" or "final" for preparation work, "takehome" for a take-home exam, and "quiz" for quiz or test preparation. Use "personal" for everything that is not coursework — a chore, an errand, an appointment, anything filed under NONE. The other kinds are graded work and carry a grade weight and an effort default with them.',
      },

      weight: int('Percent of the final grade, as the student said it: "worth 6%" is 6, "a quarter of the grade" is 25. Never 0.25, never scaled up. Omit entirely unless they stated it.', 0, 100),
      estimateMin: int('Total effort in minutes. Omit to let Nudge use its own default for this kind.', 5, 1200),
      notes: str('Optional short note.'),
      steps: {
        type: 'array',
        description:
          'Optional ordered checklist for this new task. Include when the student gives named steps or asks for the task to contain steps. Each is one concrete action; 1-7 steps.',
        items: {
          type: 'object',
          properties: {
            title: str('The concrete action, imperative.'),
            estimateMin: int('Minutes for this step.', 5, 480),
            date: str('Optional local date this step should be done by, YYYY-MM-DD.'),
          },
          required: ['title'],
        },
      },
    },
    ['reason', 'title', 'date', 'courseCode'],
  ),

  update_tasks: arrayOf(
    'Any change to an existing task: rename it, resize it, refile it under a different course, mark it finished, reopen it, or move its due date. This is the ONLY way to change a task — there is no separate list for finishing one or for moving a deadline. Two different changes to the same task — reweighted AND re-estimated, finished AND renamed — are TWO entries here, one for each; a single entry that tries to carry both reliably loses one.',
    {
      reason: REASON,
      taskId: TASK_ID,
      title: str('Replacement title.'),

      courseCode: courseField(courseCodes, 'Refile the task under this course. Only when it is filed under the wrong one.'),
      kind: {
        type: 'string',
        enum: [...TASK_KINDS],
        description: 'Replacement type. "personal" for work that is not coursework.',
      },

      weight: int('Replacement grade weight, whole percent, exactly the number the student said: "6%" is 6, "30 percent" is 30. Never scale it.', 0, 100),
      estimateMin: int('Replacement effort estimate, minutes.', 5, 1200),
      notes: str('Replacement note.'),
      done: {
        type: 'boolean',
        description:
          'true marks the task finished, false reopens one finished by mistake. Omit to leave its status alone.',
      },
      grade: int('The mark they got back, whole percent. Only for work that is finished, and only when they state it.', 0, 100),

      started: {
        type: 'boolean',
        description:
          'true marks an unstarted task as in progress, false puts it back to not started. NOT how you finish one — that is done: true.',
      },

      private: {
        type: 'boolean',
        description:
          'true withholds this task\u2019s title, notes and step names from every future request, keeping its date and effort so it can still be planned around. false shares it again. Only when the student asks.',
      },

      date: str('New DUE date, YYYY-MM-DD. Only when the deadline itself moved — wanting more time is not a reason. A bare weekday means the next one still to come, never today.'),
      time: str('New due time, HH:MM.'),
    },
    ['reason', 'taskId'],
  ),

  breakdowns: arrayOf(
    'Splitting a big task into the sittings it actually takes.',
    {
      reason: REASON,
      taskId: TASK_ID,
      steps: {
        type: 'array',
        description:
          'The ordered breakdown, 3-7 steps. Each is one sitting a real student can finish in a single go.',
        items: {
          type: 'object',
          properties: {
            title: str('The physical action, imperative. "Outline the argument (thesis + 3 points)", not "Outlining".'),
            estimateMin: int('Minutes for this step.', 10, 480),
            date: str(
              'Local date this step should be done by, YYYY-MM-DD. Walk backwards from the deadline. Nudge books the step a sitting on this day, so give every step one.',
            ),
          },
          required: ['title', 'estimateMin'],
        },
      },
    },
    ['reason', 'taskId', 'steps'],
  ),

  create_schedule_items: arrayOf(
    'Fixed things that belong on the calendar: exams, one-time classes, appointments, breaks, and holidays. These are commitments, not work blocks. Use this for an exam; add a separate task only when the student also needs prep work tracked.',
    {
      reason: REASON,
      title: str('What the scheduled item is called.'),
      kind: {
        type: 'string',
        enum: [...SCHEDULE_ITEM_KINDS],
        description: 'exam for a sitting exam; custom_class for a one-off academic session; blocked_time for any appointment or commitment; reading_break or holiday for days with no regular classes.',
      },
      date: DATE,
      endDate: str('Last calendar date for an all-day reading break or holiday, YYYY-MM-DD. Omit for one day.'),
      time: str('Start time, HH:MM. Required for exams, one-time classes, and commitments. Never use for an all-day break or holiday.'),
      durationMin: int('Length in minutes for a timed item. Required for exams, one-time classes, and commitments.', 15, 720),
      courseCode: courseField(courseCodes, 'Course this item belongs to. Use NONE for an appointment, break, or a non-course commitment.'),
      room: str('Room, address, or call link, if the student gave one.'),
    },
    ['reason', 'title', 'kind', 'date'],
  ),

  update_schedule_items: arrayOf(
    'Change a fixed schedule item already in Nudge: its name, date, time, length, course, room, or kind. Give eventId and only fields that change. An all-day break or holiday uses date and optional endDate; timed items use time and durationMin.',
    {
      reason: REASON,
      eventId: str('The schedule item id, copied character-for-character from the fixed schedule above.'),
      title: str('Replacement name.'),
      kind: { type: 'string', enum: [...SCHEDULE_ITEM_KINDS], description: 'Replacement schedule kind. Set only when the kind itself changes.' },
      date: DATE,
      endDate: str('Replacement last date for an all-day reading break or holiday, YYYY-MM-DD.'),
      time: TIME,
      durationMin: int('Replacement total length in minutes for a timed item.', 15, 720),
      courseCode: courseField(courseCodes, 'Replacement course. Use NONE to remove the course link.'),
      room: str('Replacement room, address, or call link. Use an empty string to clear it.'),
    },
    ['reason', 'eventId'],
  ),

  remove_schedule_items: arrayOf(
    'Remove a fixed schedule item when it was cancelled or entered twice. Do not use for a study block.',
    { reason: REASON, eventId: str('The schedule item id, copied character-for-character from the fixed schedule above.') },
    ['reason', 'eventId'],
  ),

  schedule_blocks: arrayOf(
    'New study time on the calendar.',
    {
      reason: REASON,
      date: DATE,
      time: TIME,
      durationMin: int('Length in minutes, in multiples of 15.', 15, 300),
      taskId: str('The task this block is for, copied from the data above. Omit only for general study.'),
      courseCode: courseField(courseCodes, 'Which course this block is for, when it is not tied to one task.'),
      title: str('Label for the block. Omit when taskId is set — Nudge uses the task name.'),
    },
    ['reason', 'date', 'time', 'durationMin'],
  ),

  move_blocks: arrayOf(
    'Changing a block that exists: date/time to move it, durationMin to resize, taskId or courseCode to change what it is for. Renaming one is rename_blocks. Never delete a block and make a new one to edit it. TWO different changes to the same block — moved AND pointed at another task — are TWO entries here, one for each; a single entry that tries to carry both reliably loses one.',
    {
      reason: REASON,
      blockId: str('The study block id, copied character-for-character from the data above.'),

      taskId: str('Point the block at this task instead. Copied from the data above.'),
      courseCode: courseField(courseCodes, 'Point the block at this course instead, when it is not for one task.'),
      date: DATE,
      time: TIME,

      durationMin: int(
        'The block’s NEW TOTAL length in minutes, not the amount added. To resize only, set this and leave date and time out.',
        15,
        300,
      ),
    },
    ['reason', 'blockId'],
  ),

  rename_blocks: arrayOf(
    'Rename a study block — its caption only. This never changes what the block is for; that is move_blocks with taskId.',
    { reason: REASON, blockId: str('The study block id, copied from the data above.'), title: str('The new label.') },
    ['reason', 'blockId', 'title'],
  ),

  remove_blocks: arrayOf(
    'Study blocks to delete — typically ones that are now stale or double-booked.',
    { reason: REASON, blockId: str('The study block id, copied from the data above.') },
    ['reason', 'blockId'],
  ),

  today_list: arrayOf(
    "Putting a task on today's list, or taking one off it. The task itself is untouched either way.",
    {
      reason: REASON,
      taskId: TASK_ID,
      onToday: { type: 'boolean', description: 'true to put it on today, false to take it off.' },
    },
    ['reason', 'taskId', 'onToday'],
  ),

  reorder_today: arrayOf(
    "Move a task within today's list. It must already be on the list — putting one on is today_list.",
    {
      reason: REASON,
      taskId: TASK_ID,
      position: int('Where it should sit: 1 is the top of today’s list, 2 second, and so on.', 1, 20),
    },
    ['reason', 'taskId', 'position'],
  ),

  delete_tasks: arrayOf(
    'Removing a task from Nudge entirely. Only when the work genuinely no longer exists — cancelled, or entered twice. Finishing something is update_tasks with done: true, not this.',
    { reason: REASON, taskId: TASK_ID },
    ['reason', 'taskId'],
  ),

  create_courses: arrayOf(
    'Courses to add. Class times go in meetings so Nudge can plan around them.',
    {
      reason: REASON,
      code: str('Course code as the student writes it, e.g. "PSYC 200".'),
      title: str('Full course name, if they gave one.'),
      meetings: {
        type: 'array',
        description: 'When the class actually meets. One entry per weekly session.',
        items: {
          type: 'object',
          properties: {
            day: { type: 'string', enum: [...WEEKDAYS], description: 'Which weekday.' },
            start: TIME,
            end: TIME,
            kind: { type: 'string', enum: [...MEETING_KINDS], description: 'Which kind of session this one is — lecture, tutorial, lab or conference. They are rarely in the same room.' },
            room: str('Room for THIS session, e.g. "Leacock 132". A tutorial is often in a different building from its lecture, so give each session its own.'),
          },
          required: ['day', 'start', 'end'],
        },
      },
    },
    ['reason', 'code'],
  ),

  update_courses: arrayOf(
    'Edits to a course: its name, instructor, room, colour, target grade, or its class times.',
    {
      reason: REASON,
      courseCode: courseField(courseCodes, 'Which existing course to edit.'),
      newCode: str('Replacement course code, e.g. "COMP 251". Only when the code itself is wrong.'),
      title: str('Replacement course name.'),
      professor: str('Instructor name.'),
      room: str('Fallback room, used only for class times that name none of their own.'),
      colorSlot: int('Which of Nudge’s eight course colours: 1 red, 2 orange, 3 yellow, 4 green, 5 teal, 6 blue, 7 violet, 8 pink.', 1, 8),
      targetGrade: int('The grade they are aiming for, whole percent. Only when they say it.', 0, 100),
      currentGrade: int('The grade they have in the course so far, whole percent. Only when they say it.', 0, 100),
      meetings: {
        type: 'array',
        description: 'Replacement class times — this replaces the whole timetable for the course, so include every session, not just the new one.',
        items: {
          type: 'object',
          properties: {
            day: { type: 'string', enum: [...WEEKDAYS], description: 'Which weekday.' },
            start: TIME,
            end: TIME,
            kind: { type: 'string', enum: [...MEETING_KINDS], description: 'Which kind of session this one is — lecture, tutorial, lab or conference. They are rarely in the same room.' },
            room: str('Room for THIS session. Each one carries its own; a lecture and its tutorial are routinely in different buildings.'),
          },
          required: ['day', 'start', 'end'],
        },
      },
    },
    ['reason', 'courseCode'],
  ),

  update_settings: arrayOf(
    'How Nudge plans and looks. At most one entry, and only when they ask: these reshape every estimate in the app. Set exactly the fields they named and no others — never re-send a value that is already correct.',
    {
      reason: REASON,
      dailyCapacityMin: int('Realistic study minutes in an ordinary day. Drives every deadline warning.', 30, 720),

      plannerWindow: {
        type: 'object',
        description:
          'The hours the planner grid covers. Set this only when the student asks about the planner’s hours, and set both ends — a window is a pair.',
        properties: {
          startHour: int('First hour on the grid, 0-23. 7 means the grid starts at 07:00.', 0, 23),
          endHour: int('Hour the grid ends at, 1-24. Midnight is 24 — "until midnight" is 24, never 23.', 1, 24),
        },
        required: ['startHour', 'endHour'],
      },
      focusMin: int('Length of one focus round, minutes.', 5, 120),
      shortBreakMin: int('Length of a short break between rounds, minutes.', 1, 60),
      longBreakMin: int('Length of the long break, minutes.', 5, 120),
      longBreakEvery: int('How many focus rounds before a long break.', 2, 8),
      sound: { type: 'boolean', description: 'Whether a chime plays when a round ends.' },
      theme: { type: 'string', enum: [...THEMES], description: 'Light, dark, or follow the system.' },
      palette: {
        type: 'string',
        enum: [...PALETTES],
        description:
          'The color theme the whole app is painted in. Separate from light/dark — every theme has both. Only when they ask about color.',
      },
      name: str('What Nudge should call them. Only when they say so.'),
      tone: { type: 'string', enum: [...TONES], description: 'How direct Nudge should be.' },
    },
    ['reason'],
  ),

  update_steps: arrayOf(
    'Add a step to a checklist, or reword / re-time one. Omit stepId to add; give stepId to edit. It CANNOT finish a step — that is complete_steps. To replace a whole checklist, use breakdowns.',
    {
      reason: REASON,
      taskId: TASK_ID,
      stepId: str('The step id, copied from the data above. OMIT THIS to add a new step instead of changing one.'),
      title: str('The step wording. Required when adding; when editing, set it only if the wording itself changes. Never re-send the current wording.'),
      estimateMin: int('Minutes for this step.', 5, 480),
      date: str('Local date this step should be done by, YYYY-MM-DD.'),
    },
    ['reason', 'taskId'],
  ),

  complete_steps: arrayOf(
    'Tick a step off as finished, or untick one. This is the only way to finish a step: when the student says they did, finished or completed part of a task, it belongs here.',
    {
      reason: REASON,
      taskId: TASK_ID,
      stepId: str('The step id, copied from the data above.'),
      done: { type: 'boolean', description: 'true ticks the step off, false unticks it.' },
    },
    ['reason', 'taskId', 'stepId', 'done'],
  ),

  remove_steps: arrayOf(
    'Steps to delete from a task.',
    { reason: REASON, taskId: TASK_ID, stepId: str('The step id, copied from the data above.') },
    ['reason', 'taskId', 'stepId'],
  ),

  duplicate_blocks: arrayOf(
    'Copy a study block. The copy lands in the first free slot after it.',
    { reason: REASON, blockId: str('The study block id, copied from the data above.') },
    ['reason', 'blockId'],
  ),

  complete_blocks: arrayOf(
    'Tick a study block off as done, or untick one.',
    {
      reason: REASON,
      blockId: str('The study block id, copied from the data above.'),
      done: { type: 'boolean', description: 'true marks the block done, false reopens it.' },
    },
    ['reason', 'blockId', 'done'],
  ),

  delete_courses: arrayOf(
    'Remove a course they have dropped. It does NOT remove its assignments — they survive without a course, exactly as when the student deletes one by hand, so never add delete_tasks for its work unless they asked. "Archive it", "hide it" and "the term is over" are archive_courses, not this.',
    { reason: REASON, courseCode: courseField(courseCodes, 'Which course to remove.') },
    ['reason', 'courseCode'],
  ),

  archive_courses: arrayOf(
    'Put a course away when its term is over, or bring an archived one back. It keeps everything — tasks, blocks, logged time — and only drops the course out of the ranking and the pickers. Never a way to delete one.',
    {
      reason: REASON,
      courseCode: courseField(courseCodes, 'Which course. Archived ones are listed above and can be named here to restore them.'),
      archived: { type: 'boolean', description: 'true puts it away, false brings it back.' },
    },
    ['reason', 'courseCode', 'archived'],
  ),

  log_sessions: arrayOf(
    'Record study time that already happened, when the student says they worked but the timer was not running.',
    {
      reason: REASON,
      minutes: int('How long they worked.', 5, 720),
      taskId: str('The task they worked on, copied from the data above.'),
      courseCode: courseField(courseCodes, 'The course, if it was not one specific task.'),
      date: str('Local date they worked, YYYY-MM-DD. Omit for today.'),
      time: str('Local time they started, HH:MM. Omit if they did not say.'),
    },
    ['reason', 'minutes'],
  ),

  mute_nudges: arrayOf(
    'Silence one of Nudge’s own on-screen prompts for the rest of today, when they ask you to stop reminding them about something. It changes nothing about the work itself.',
    {
      reason: REASON,
      nudgeId: str('The nudge id, copied character-for-character from the nudges listed above.'),
    },
    ['reason', 'nudgeId'],
  ),

  commands: arrayOf(
    'Things to do in the interface right now — opening a view, driving the timer. These happen immediately when you reply; they change no data and are not approved, so use them only for what the student actually asked for.',
    {
      reason: REASON,
      action: {
        type: 'string',
        enum: [...COMMANDS],
        description:
          'Which one. open_task needs taskId. open_course needs courseCode. start_focus takes an optional taskId or blockId, and minutes. Everything else takes nothing.',
      },
      taskId: str('For open_task and start_focus: the task id, copied from the data above.'),
      blockId: str('For start_focus: the study block they are sitting down to, when they named one. The sitting is logged against it.'),
      courseCode: courseField(courseCodes, 'For open_course: which course to open.'),
      minutes: int('For start_focus: how long the round should run. Omit for their usual length.', 1, 180),
    },
    ['reason', 'action'],
  ),

  study_sessions: arrayOf(
    'The shape of one sitting, as ordered segments. This IS the study block — it puts the time on the calendar as well as the plan for spending it, so never add a schedule_blocks entry for the same stretch.',
    {
      reason: REASON,
      date: DATE,
      time: TIME,
      segments: {
        type: 'array',
        description: 'In order, at most ten. Must add up to the time available.',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: [...SEGMENT_KINDS], description: 'What happens in this segment.' },
            minutes: int('Length of this segment.', 3, 180),
            label: str('What the student actually does. Specific to their work, never "study".'),
            taskId: str('The task this segment works on, if it maps to one.'),
          },
          required: ['kind', 'minutes', 'label'],
        },
      },
    },
    ['reason', 'segments'],
  ),
})

const ENVELOPE = {
  requested: {
    type: 'array',
    description:
      'Every distinct thing the student just asked for, one per entry, in their own words and in the order they said them. "Mark X done and add Y" is two entries. A single request is one entry. Fill this in FIRST, then make sure every entry is either carried out in a list below or addressed in your message.',
    items: { type: 'string' },
  },
  intent: {
    type: 'string',
    enum: [...INTENTS],
    description:
      'answer = a factual reply about their data. advice = guidance, no changes. plan = you filled in one of the action lists. question = you need one specific fact first.',
  },
  message: str(
    'What the student reads. Plain sentences, no markdown, no headings, no emoji, two or three at most — the lists carry the detail, so do not narrate them. Nothing has happened yet, so write what the change WOULD do, never what you did: "capping focus rounds at 120 minutes" not "I have set them to 120".',
  ),
  headline: str('Optional 2-5 word label, sentence case. e.g. "Rebalanced week". Omit when you propose nothing.'),
  assumptions: {
    type: 'array',
    description:
      'Meaningful assumptions you made, one short clause each, at most three. Only things a student would want to correct. Usually empty.',
    items: { type: 'string' },
  },
  question: str('Set ONLY when intent is question: the single most useful thing to ask, one sentence.'),
}

export function schemaFor(courseCodes: string[] = []) {
  const built = buildGroups(courseCodes)
  const properties: Record<string, unknown> = { ...ENVELOPE }
  for (const g of ACTION_GROUPS) properties[g] = built[g]
  return {
    type: 'object',
    description: 'A single reply from Nudge to a student.',
    properties,
    required: ['requested', 'intent', 'message', ...ACTION_GROUPS],
  }
}

export const groupsFor = (): ActionGroup[] => [...ACTION_GROUPS]

export interface RawStep {
  title?: unknown
  estimateMin?: unknown
  date?: unknown
}

export interface RawSegment {
  kind?: unknown
  minutes?: unknown
  label?: unknown
  taskId?: unknown
}

export interface RawItem {
  reason?: unknown
  private?: unknown
  days?: unknown
  status?: unknown
  onToday?: unknown
  started?: unknown
  position?: unknown
  archived?: unknown
  nudgeId?: unknown
  stepId?: unknown
  action?: unknown
  minutes?: unknown
  done?: unknown
  code?: unknown
  professor?: unknown
  room?: unknown
  colorSlot?: unknown
  newCode?: unknown
  targetGrade?: unknown
  currentGrade?: unknown
  grade?: unknown
  sound?: unknown
  theme?: unknown
  palette?: unknown
  name?: unknown
  shortBreakMin?: unknown
  longBreakMin?: unknown
  longBreakEvery?: unknown
  meetings?: unknown
  dailyCapacityMin?: unknown
  plannerWindow?: unknown
  focusMin?: unknown
  tone?: unknown
  taskId?: unknown
  blockId?: unknown
  eventId?: unknown
  courseCode?: unknown
  title?: unknown
  kind?: unknown
  date?: unknown
  endDate?: unknown
  time?: unknown
  durationMin?: unknown
  estimateMin?: unknown
  weight?: unknown
  notes?: unknown
  steps?: unknown
  segments?: unknown
}

export { NO_COURSE }

export type RawReply = {
  intent?: unknown
  message?: unknown
  headline?: unknown
  assumptions?: unknown
  question?: unknown
} & Partial<Record<ActionGroup, unknown>>
