import type { Course, TaskKind } from './types'
import { normalizeCode } from './store'
import { addDays, startOfDay } from './date'

export interface Parsed {
  title: string
  courseId: string | null
  courseCode: string | null
  kind: TaskKind
  kindExplicit: boolean
  due: Date

  dueExplicit: boolean
  weight?: number
  estimateMin?: number
  error?: string
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const phrasePattern = (phrases: string[]) => {
  const alternatives = phrases
    .sort((a, b) => b.length - a.length)
    .map((phrase) =>
      phrase
        .trim()
        .split(/[\s-]+/)
        .map(escapeRegex)
        .join('[\\s-]+'),
    )
  return new RegExp(`(?<![A-Za-z0-9])(?:${alternatives.join('|')})(?![A-Za-z])`, 'i')
}

const KIND_WORDS: [RegExp, TaskKind][] = [
  [
    phrasePattern([
      'take-home exam', 'take home exam', 'takehome exam', 'open-book exam', 'open book exam',
      'at-home exam', 'at home exam', 'home-based exam', 'unsupervised exam', 'untimed exam',
      '24-hour exam', '48-hour exam', '72-hour exam', 'take-home midterm', 'take home midterm',
      'take-home final', 'take home final', 'take-home quiz', 'take home quiz', 'take-home test',
      'take home test', 'take-home assessment', 'take home assessment', 'take-home assignment',
      'take home assignment', 'takehome', 'take-home', 'open-book test', 'open book test', 'open-notes exam',
      'open notes exam', 'open-resource exam', 'open resources exam', 'take-home assessment',
    ]),
    'takehome',
  ],
  [
    phrasePattern([
      'oral presentation', 'oral report', 'class presentation', 'class talk', 'group presentation',
      'group talk', 'poster presentation', 'poster session', 'slide deck', 'slides', 'powerpoint',
      'power point', 'ppt', 'presentation deck', 'presentation slides', 'speaking assignment',
      'public speaking', 'thesis defense', 'project defense', 'viva voce', 'viva', 'demo',
      'demonstration', 'showcase', 'pitch deck', 'pitch', 'seminar presentation', 'seminar talk',
      'lecture talk', 'presentation', 'present', 'presenting', 'talk', 'speech',
    ]),
    'presentation',
  ],
  [
    phrasePattern([
      'lab practical exam', 'practical lab', 'laboratory report', 'experiment report',
      'experimental report', 'lab assignment', 'lab exercise', 'lab work', 'lab practical',
      'lab session', 'lab prep', 'lab preparation', 'lab report', 'lab write-up', 'lab writeup',
      'lab notebook', 'lab notes', 'lab worksheet', 'lab handout', 'lab questions', 'lab problems',
      'lab investigation', 'field lab', 'computer lab', 'wet lab', 'dry lab', 'lab exam',
      'lab test', 'lab submission', 'laboratory', 'experiment', 'experiments', 'lab', 'labs',
    ]),
    'lab',
  ],
  [
    phrasePattern([
      'group project', 'team project', 'course project', 'capstone project', 'final project',
      'term project', 'semester project', 'research project', 'design project', 'software project',
      'coding project', 'programming project', 'app project', 'build project', 'prototype project',
      'portfolio project', 'independent project', 'collaborative project', 'studio project',
      'practicum project', 'implementation project', 'project proposal', 'project plan',
      'project report', 'project brief', 'project milestone', 'project deliverable', 'project work',
      'prototype', 'project', 'projects', 'app', 'build',
    ]),
    'project',
  ],
  [
    phrasePattern([
      'problem set', 'problemset', 'homework set', 'exercise set', 'practice problems',
      'assigned problems', 'problem sheet', 'problem list', 'problem collection', 'tutorial sheet',
      'assignment problems', 'online homework', 'online problems', 'coding exercises',
      'programming exercises', 'math exercises', 'math problems', 'physics problems',
      'calculus problems', 'questions to solve', 'questions', 'exercises', 'problems',
      'webwork', 'web work', 'myopenmath', 'mastering homework', 'aleks homework', 'homework',
      'hw', 'hws', 'pset', 'psets', 'ps1', 'ps2', 'ps3', 'ps4', 'ps5', 'ps6', 'ps7', 'ps8',
    ]),
    'problemset',
  ],
  [
    phrasePattern([
      'assigned reading', 'course reading', 'required reading', 'textbook chapter',
      'textbook chapters', 'book chapter', 'book section', 'journal article', 'research article',
      'article to read', 'paper to read', 'reading response', 'reading notes', 'reading questions',
      'reading list', 'reading packet', 'reading material', 'reading materials', 'read through',
      'close read', 'close reading', 'skim reading', 'skim the chapter', 'read the chapter',
      'read the article', 'read the paper', 'read pages', 'pages to read', 'chapter',
      'chapters', 'article', 'articles', 'reading', 'read',
    ]),
    'reading',
  ],
  [
    phrasePattern([
      'quiz prep', 'quiz preparation', 'quiz review', 'quiz study', 'study for quiz',
      'study for quizzes', 'prepare for quiz', 'prepare for quizzes', 'practice quiz',
      'practice quizzes', 'mock quiz', 'pop quiz', 'in-class quiz', 'online quiz', 'take quiz',
      'complete quiz', 'weekly quiz', 'chapter quiz', 'unit quiz', 'knowledge check',
      'test prep', 'test preparation', 'test review', 'test study', 'study for test',
      'study for tests', 'prepare for test', 'prepare for tests', 'practice test',
      'practice tests', 'mock test', 'unit test', 'chapter test', 'weekly test', 'quiz',
      'quizzes', 'test', 'tests',
    ]),
    'quiz',
  ],
  [
    phrasePattern([
      'midterm exam', 'mid-term exam', 'midterm test', 'mid-term test', 'midterm prep',
      'midterm preparation', 'prepare for midterm', 'prepare for mid-term', 'study for midterm',
      'study for mid-term', 'review for midterm', 'midterm review', 'midterm study',
      'midterm practice', 'practice midterm', 'mock midterm', 'midterm mock', 'midterm questions',
      'midterm problems', 'midterm notes', 'midterm flashcards', 'midterm flash card',
      'midterm revision', 'midterm revision session', 'mid-semester exam', 'mid semester exam',
      'middle exam', 'first midterm', 'second midterm', 'midterm', 'mid-term', 'midterms', 'mt',
    ]),
    'midterm',
  ],
  [
    phrasePattern([
      'essay assignment', 'essay paper', 'research paper', 'position paper', 'term paper',
      'reflection paper', 'response paper', 'analytical paper', 'analysis paper', 'course paper',
      'academic paper', 'written essay', 'argumentative essay', 'persuasive essay',
      'compare and contrast essay', 'expository essay', 'literature essay', 'critical essay',
      'short paper', 'long paper', 'paper draft', 'essay draft', 'paper outline', 'essay outline',
      'writing piece', 'writing assignment', 'composition assignment', 'written assignment',
      'paper', 'papers', 'essay', 'essays', 'writing', 'composition',
    ]),
    'essay',
  ],
  [
    phrasePattern([
      'final exam', 'final test', 'final prep', 'final preparation', 'prepare for final',
      'study for final', 'review for final', 'final review', 'final study', 'final practice',
      'practice final', 'mock final', 'final mock', 'final questions', 'final problems',
      'final notes', 'final flashcards', 'final flash card', 'final revision',
      'final revision session', 'end-of-term exam', 'end of term exam', 'end-of-semester exam',
      'end of semester exam', 'semester final', 'course final', 'comprehensive final',
      'cumulative final', 'finals', 'final',
    ]),
    'final',
  ],
  [
    phrasePattern([
      'personal task', 'personal errand', 'household task', 'household chore', 'daily chore',
      'chores', 'chore', 'errands', 'errand', 'laundry', 'wash clothes', 'do laundry',
      'dishes', 'do dishes', 'grocery shopping', 'grocery run', 'groceries', 'shopping',
      'vacuum', 'vacuuming', 'clean room', 'cleaning', 'tidy room', 'tidy up', 'take out trash',
      'take out bins', 'trash', 'rubbish', 'rent', 'pay bills', 'bills', 'bank errand',
      'post office', 'pharmacy', 'prescription', 'dentist appointment', 'doctor appointment',
      'haircut', 'call mom', 'call mum', 'call dad', 'call home', 'birthday gift', 'buy gift',
      'pack', 'packing', 'move', 'renew', 'appointment', 'personal', 'home task',
    ]),
    'personal',
  ],
  [
    phrasePattern([
      'graded assignment', 'class assignment', 'course assignment', 'written assignment',
      'weekly assignment', 'module assignment', 'unit assignment', 'online assignment',
      'required assignment', 'academic assignment', 'assignment task', 'coursework task',
      'course work', 'coursework', 'schoolwork', 'classwork', 'graded work', 'written work',
      'required work', 'course requirement', 'learning activity', 'class activity',
      'learning task', 'academic task', 'work to submit', 'work to hand in', 'hand-in',
      'hand in', 'turn-in', 'turn in', 'asg', 'asgn', 'deliverable', 'submission', 'assignment', 'task',
      'activity', 'exercise', 'worksheet',
    ]),
    'assignment',
  ],
]

const WEEKDAYS = [
  ['sunday', 'sun'],
  ['monday', 'mon'],
  ['tuesday', 'tue', 'tues'],
  ['wednesday', 'wed'],
  ['thursday', 'thu', 'thur', 'thurs'],
  ['friday', 'fri'],
  ['saturday', 'sat'],
]

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

interface Cut {
  start: number
  end: number
}

export function parseQuickAdd(raw: string, courses: Course[], now: Date = new Date()): Parsed {
  const text = raw.trim()
  const cuts: Cut[] = []
  const errors: string[] = []
  const eat = (m: RegExpMatchArray | null) => {
    if (m?.index != null) cuts.push({ start: m.index, end: m.index + m[0].length })
  }

  let courseId: string | null = null
  let courseCode: string | null = null

  for (const c of courses) {
    if (c.archived) continue
    const [subj, num] = c.code.split(' ')
    const re = new RegExp(`\\b${subj}\\s*${num ?? ''}\\b`, 'i')
    const m = text.match(re)
    if (m) {
      courseId = c.id
      courseCode = c.code
      eat(m)
      break
    }
  }
  if (!courseId) {

    for (const c of courses) {
      if (c.archived) continue
      const subj = c.code.split(' ')[0]
      const m = text.match(new RegExp(`\\b${subj}\\b`, 'i'))
      if (m && courses.filter((x) => !x.archived && x.code.startsWith(subj)).length === 1) {
        courseId = c.id
        courseCode = c.code
        eat(m)
        break
      }
    }
  }
  if (!courseId) {
    const m = text.match(/\b([a-z]{3,4})\s?(\d{3}[a-z]?\d?)\b/i)
    if (m) {
      courseCode = normalizeCode(`${m[1]} ${m[2]}`)
      eat(m)
    }
  }

  let weight: number | undefined
  const wm = text.match(/\b(\d{1,3}(?:\.\d)?)\s?%/)
  if (wm) {
    const v = parseFloat(wm[1])
    if (v > 0 && v <= 100) {
      weight = v
      eat(wm)
    }
  }

  let estimateMin: number | undefined
  const em =
    text.match(/~?\b(\d{1,2})\s?h(?:rs?|ours?)?\s?(\d{1,2})?\s?m?(?:in)?\b/i) ??
    text.match(/~?\b(\d{2,3})\s?m(?:in|ins|inutes)?\b/i) ??
    text.match(/~?\b(\d(?:\.\d)?)\s?h(?:rs?|ours?)?\b/i)
  if (em) {
    if (/h/i.test(em[0])) {
      estimateMin = Math.round(parseFloat(em[1]) * 60 + (em[2] ? parseInt(em[2], 10) : 0))
    } else {
      estimateMin = parseInt(em[1], 10)
    }
    if (estimateMin > 0 && estimateMin <= 2400) eat(em)
    else estimateMin = undefined
  }

  let hour: number | null = null
  let minute = 0
  const tm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/i)
  if (tm) {
    const clockHour = parseInt(tm[1], 10)
    const clockMinute = tm[2] ? parseInt(tm[2], 10) : 0
    eat(tm)
    if (clockHour < 1 || clockHour > 12 || clockMinute > 59) {
      errors.push('That time is not valid. Use a time between 1:00 and 12:59.')
    } else {
      hour = clockHour % 12
      if (/pm/i.test(tm[3])) hour += 12
      minute = clockMinute
    }
  } else {
    const t24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
    if (t24) {
      hour = parseInt(t24[1], 10)
      minute = parseInt(t24[2], 10)
      eat(t24)
    } else {
      const noon = text.match(/\b(noon|midday)\b/i)
      const night = text.match(/\b(midnight|eod)\b/i)
      if (noon) {
        hour = 12
        eat(noon)
      } else if (night) {
        hour = 23
        minute = 59
        eat(night)
      }
    }
  }

  let day: Date | null = null
  const rel = text.match(/\b(today|tonight|tmrw?|tmr|tomorrow|overmorrow)\b/i)
  if (rel) {
    const w = rel[1].toLowerCase()
    day = w === 'today' || w === 'tonight' ? new Date(now) : addDays(now, w === 'overmorrow' ? 2 : 1)
    if (w === 'tonight' && hour == null) hour = 22
    eat(rel)
  }

  if (!day) {
    const inDays = text.match(/\bin\s+(\d{1,2})\s?(day|days|d)\b/i)
    if (inDays) {
      day = addDays(now, parseInt(inDays[1], 10))
      eat(inDays)
    }
  }
  if (!day) {
    const inWeeks = text.match(/\bin\s+(\d{1,2})\s?(week|weeks|w)\b/i)
    if (inWeeks) {
      day = addDays(now, parseInt(inWeeks[1], 10) * 7)
      eat(inWeeks)
    }
  }

  if (!day) {
    for (let i = 0; i < WEEKDAYS.length; i++) {
      const names = WEEKDAYS[i].join('|')
      const m = text.match(new RegExp(`\\b(next\\s+)?(${names})\\b`, 'i'))
      if (!m) continue
      const target = i
      const cur = now.getDay()
      let delta = (target - cur + 7) % 7
      if (delta === 0) delta = 7
      if (m[1]) delta += 7
      day = addDays(now, delta)
      eat(m)
      break
    }
  }

  if (!day) {
    const md = text.match(new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})\\b`, 'i'))
    const dm = text.match(new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS.join('|')})[a-z]*\\b`, 'i'))
    const hit = md ?? dm
    if (hit) {
      const monthName = (md ? hit[1] : hit[2]).slice(0, 3).toLowerCase()
      const dayNum = parseInt(md ? hit[2] : hit[1], 10)
      const month = MONTHS.indexOf(monthName)
      if (month >= 0 && dayNum >= 1 && dayNum <= 31) {
        const d = new Date(now.getFullYear(), month, dayNum)

        eat(hit)
        if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== month || d.getDate() !== dayNum) {
          errors.push('That date is not valid.')
        } else {
          if (+d < +startOfDay(now) - 86_400_000 * 2) d.setFullYear(d.getFullYear() + 1)
          day = d
        }
      }
    }
  }

  const dueExplicit = day != null || hour != null
  const base = day ?? (hour != null ? new Date(now) : addDays(now, 7))
  const due = startOfDay(base)
  due.setHours(hour ?? 23, hour != null ? minute : 59, 0, 0)

  if (!day && hour != null && +due < +now) due.setDate(due.getDate() + 1)

  let kind: TaskKind = 'assignment'
  let kindExplicit = false
  for (const [re, k] of KIND_WORDS) {
    if (re.test(text)) {
      kind = k
      kindExplicit = true
      break
    }
  }

  let title = ''
  let cursor = 0
  const sorted = [...cuts].sort((a, b) => a.start - b.start)
  for (const c of sorted) {
    if (c.start >= cursor) {
      title += text.slice(cursor, c.start)
      cursor = c.end
    } else if (c.end > cursor) cursor = c.end
  }
  title += text.slice(cursor)
  title = title
    .replace(/\b(due|by|on|at|for|worth|next)\b/gi, ' ')
    .replace(/[\s,]+/g, ' ')
    .trim()

  if (!title) {
    title = kind === 'assignment' ? 'New task' : KIND_TITLES[kind]
  }
  title = title.charAt(0).toUpperCase() + title.slice(1)

  return { title, courseId, courseCode, kind, kindExplicit, due, dueExplicit, weight, estimateMin, error: errors[0] }
}

const KIND_TITLES: Record<TaskKind, string> = {
  assignment: 'Assignment',
  personal: 'Personal task',
  essay: 'Essay',
  problemset: 'Problem set',
  project: 'Project',
  reading: 'Reading',
  quiz: 'Quiz / test prep',
  midterm: 'Midterm prep',
  final: 'Final prep',
  takehome: 'Take-home exam',
  lab: 'Lab',
  presentation: 'Presentation',
}
