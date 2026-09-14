import type { NoteCategory, NoteFolder, NoteType } from './types'
import { uid } from './id'

export interface AcademicTemplate {
  id: string
  name: string
  description: string
  icon: string
  defaultCategories: NoteCategory[]
  tags: string[]
  jsonContent: string
  noteType: 'lecture' | 'study'
}

export const CORNELL_TEMPLATE_JSON = JSON.stringify([
  {
    type: 'h1',
    children: [{ text: 'Cornell Notes: Topic Title' }],
  },
  {
    type: 'callout',
    children: [
      {
        type: 'p',
        children: [
          { text: 'Core Question / Learning Objective: ', bold: true },
          { text: 'What is the central theorem, problem, or inquiry explored in this study?' },
        ],
      },
    ],
  },
  {
    type: 'h2',
    children: [{ text: 'Cue Column & Prompt Questions' }],
  },
  {
    type: 'p',
    children: [
      { text: '• Why does this principle hold under edge conditions?' },
    ],
  },
  {
    type: 'p',
    children: [
      { text: '• How does this connect to previous lectures?' },
    ],
  },
  {
    type: 'h2',
    children: [{ text: 'Detailed Lecture Notes' }],
  },
  {
    type: 'p',
    children: [
      { text: 'Capture definitions, step-by-step logic, proofs, and illustrative diagrams here. Break complex arguments into concise bullet points.' },
    ],
  },
  {
    type: 'equation',
    texExpression: 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!} (x - a)^n',
    children: [{ text: '' }],
  },
  {
    type: 'h2',
    children: [{ text: 'Flagged Uncertainties & Questions' }],
  },
  {
    type: 'action_item',
    checked: false,
    children: [{ text: 'Clarify boundary behavior during professor office hours' }],
  },
  {
    type: 'action_item',
    checked: false,
    children: [{ text: 'Review textbook chapter 4 derivation of the asymptotic bound' }],
  },
  {
    type: 'h2',
    children: [{ text: 'Synthesis & Summary' }],
  },
  {
    type: 'blockquote',
    children: [
      {
        type: 'p',
        children: [
          { text: 'In 2-3 sentences, summarize the biggest takeaway and practical implications of today’s material.', italic: true },
        ],
      },
    ],
  },
])

export const LECTURE_SUMMARY_TEMPLATE_JSON = JSON.stringify([
  {
    type: 'h1',
    children: [{ text: 'Lecture Summary: ' }],
  },
  {
    type: 'callout',
    children: [
      {
        type: 'p',
        children: [
          { text: 'Lecture Overview: ', bold: true },
          { text: 'High-level synthesis of key themes covered today.' },
        ],
      },
    ],
  },
  {
    type: 'h2',
    children: [{ text: 'Core Concepts & Definitions' }],
  },
  {
    type: 'p',
    children: [
      { text: '1. Concept Alpha: ', bold: true },
      { text: 'Fundamental building block and primary axioms.' },
    ],
  },
  {
    type: 'p',
    children: [
      { text: '2. Concept Beta: ', bold: true },
      { text: 'Key mechanics and operational rules.' },
    ],
  },
  {
    type: 'h2',
    children: [{ text: 'Code & Implementation' }],
  },
  {
    type: 'code_block',
    lang: 'typescript',
    children: [
      { type: 'code_line', children: [{ text: '// Example algorithm implementation' }] },
      { type: 'code_line', children: [{ text: 'function solve(input: number[]): number {' }] },
      { type: 'code_line', children: [{ text: '  return input.reduce((acc, curr) => acc + curr, 0);' }] },
      { type: 'code_line', children: [{ text: '}' }] },
    ],
  },
  {
    type: 'h2',
    children: [{ text: 'Study Checklist & Action Items' }],
  },
  {
    type: 'action_item',
    checked: false,
    children: [{ text: 'Complete practice problem set 2 (questions 1-4)' }],
  },
  {
    type: 'action_item',
    checked: false,
    children: [{ text: 'Re-derive equations from slide 18 without notes' }],
  },
  {
    type: 'action_item',
    checked: false,
    children: [{ text: 'Check discussion forum for TA clarification on problem 3' }],
  },
])

export const READING_SYNTHESIS_TEMPLATE_JSON = JSON.stringify([
  {
    type: 'h1',
    children: [{ text: 'Active Reading & Literature Synthesis' }],
  },
  {
    type: 'callout',
    children: [
      {
        type: 'p',
        children: [
          { text: 'Citation & Context: ', bold: true },
          { text: 'Author(s), Year, Title, Journal / Publication' },
        ],
      },
    ],
  },
  {
    type: 'h2',
    children: [{ text: 'Central Thesis' }],
  },
  {
    type: 'blockquote',
    children: [
      {
        type: 'p',
        children: [{ text: '“State the primary hypothesis or thesis argued by the author.”' }],
      },
    ],
  },
  {
    type: 'h2',
    children: [{ text: 'Key Arguments & Evidence' }],
  },
  {
    type: 'p',
    children: [{ text: '• First pillar of argument: empirical observations and data sets.' }],
  },
  {
    type: 'p',
    children: [{ text: '• Second pillar: theoretical framework and contrast with prior literature.' }],
  },
  {
    type: 'h2',
    children: [{ text: 'Rapid Questions & Critical Inquiries' }],
  },
  {
    type: 'p',
    children: [{ text: 'What assumptions does the author take for granted without sufficient proof?' }],
  },
  {
    type: 'p',
    children: [{ text: 'How would this theory behave in non-standard scenarios?' }],
  },
  {
    type: 'h2',
    children: [{ text: 'Revision Checklist' }],
  },
  {
    type: 'action_item',
    checked: false,
    children: [{ text: 'Compare thesis against opposing paper discussed in seminar' }],
  },
  {
    type: 'action_item',
    checked: false,
    children: [{ text: 'Draft 200-word critical reflection for weekly response paper' }],
  },
])

export const EXAM_REVISION_TEMPLATE_JSON = JSON.stringify([
  {
    type: 'h1',
    children: [{ text: 'Exam Revision & Cheatsheet' }],
  },
  {
    type: 'callout',
    children: [
      {
        type: 'p',
        children: [
          { text: 'Target Exam: ', bold: true },
          { text: 'Midterm / Final Examination Mastery Guide' },
        ],
      },
    ],
  },
  {
    type: 'h2',
    children: [{ text: 'High-Yield Formulas & Theorems' }],
  },
  {
    type: 'equation',
    texExpression: 'P(A \\mid B) = \\frac{P(B \\mid A) \\, P(A)}{P(B)}',
    children: [{ text: '' }],
  },
  {
    type: 'h2',
    children: [{ text: 'Flagged Uncertainties (Must Review)' }],
  },
  {
    type: 'action_item',
    checked: false,
    children: [{ text: 'Corner case: Zero-division in recursive base case' }],
  },
  {
    type: 'action_item',
    checked: false,
    children: [{ text: 'Proof technique: Diagonalization argument step 3' }],
  },
  {
    type: 'h2',
    children: [{ text: 'Rapid Questions for Office Hours' }],
  },
  {
    type: 'p',
    children: [{ text: 'Will questions test multi-stage dynamic programming or memoization?' }],
  },
  {
    type: 'h2',
    children: [{ text: 'Active Recall Checklist' }],
  },
  {
    type: 'action_item',
    checked: false,
    children: [{ text: 'Timed past paper 2024 exam study (60 mins)' }],
  },
  {
    type: 'action_item',
    checked: false,
    children: [{ text: 'Explain key theorem to study partner without looking at notes' }],
  },
])

export const ACADEMIC_TEMPLATES: AcademicTemplate[] = [
  {
    id: 'cornell',
    name: 'Cornell Notes',
    description: 'Structured cue column, deep lecture notes, synthesis summary, and action items',
    icon: 'GraduationCap',
    defaultCategories: ['study-checklist', 'rapid-question'],
    tags: ['lecture', 'active-recall', 'cornell'],
    jsonContent: CORNELL_TEMPLATE_JSON,
    noteType: 'lecture',
  },
  {
    id: 'lecture-summary',
    name: 'Lecture Summary',
    description: 'Concise objectives, core definitions, code snippets, and study checklists',
    icon: 'FileText',
    defaultCategories: ['study-checklist'],
    tags: ['lecture', 'summary', 'code'],
    jsonContent: LECTURE_SUMMARY_TEMPLATE_JSON,
    noteType: 'lecture',
  },
  {
    id: 'reading-synthesis',
    name: 'Active Reading',
    description: 'Literature analysis, thesis extraction, critical questions, and reflection',
    icon: 'BookOpen',
    defaultCategories: ['rapid-question'],
    tags: ['reading', 'research', 'synthesis'],
    jsonContent: READING_SYNTHESIS_TEMPLATE_JSON,
    noteType: 'study',
  },
  {
    id: 'exam-revision',
    name: 'Exam Revision Sheet',
    description: 'High-yield theorems, math equations, flagged uncertainties, and active recall',
    icon: 'Target',
    defaultCategories: ['flagged-uncertainty', 'study-checklist', 'rapid-question'],
    tags: ['exam', 'revision', 'formulas'],
    jsonContent: EXAM_REVISION_TEMPLATE_JSON,
    noteType: 'study',
  },
]

export interface SequentialStructureConfig {
  courseId?: string | null
  courseCode?: string
  pattern: 'weeks' | 'modules' | 'units' | 'labs'
  count: number
  itemsPerUnit: number
  createStarterNotes: boolean
  templateId?: string
}

export interface GeneratedStructure {
  folders: NoteFolder[]
  notes: {
    id: string
    title: string
    text: string
    noteType: NoteType
    courseId: string | null
    folderId: string
    categories: NoteCategory[]
    createdAt: string
    updatedAt: string
  }[]
}

export function generateSequentialAcademicStructure(
  config: SequentialStructureConfig,
): GeneratedStructure {
  const folders: NoteFolder[] = []
  const notes: GeneratedStructure['notes'] = []
  const now = new Date()

  const unitLabel =
    config.pattern === 'weeks'
      ? 'Week'
      : config.pattern === 'modules'
      ? 'Module'
      : config.pattern === 'units'
      ? 'Unit'
      : 'Lab'

  const itemLabel =
    config.pattern === 'labs'
      ? 'Experiment'
      : config.pattern === 'modules'
      ? 'Topic'
      : 'Lecture'

  const selectedTemplate =
    ACADEMIC_TEMPLATES.find((t) => t.id === config.templateId) || ACADEMIC_TEMPLATES[0]

  for (let u = 1; u <= config.count; u++) {
    const folderId = uid()
    const folderName = `${unitLabel} ${u}`

    const folder: NoteFolder = {
      id: folderId,
      name: folderName,
      parentId: null,
      courseId: config.courseId ?? null,
      color: `var(--course-${((u - 1) % 8) + 1})`,
      createdAt: new Date(+now + u * 1000).toISOString(),
    }
    folders.push(folder)

    if (config.createStarterNotes) {
      for (let item = 1; item <= config.itemsPerUnit; item++) {
        const noteId = uid()
        const noteTitle = `${config.courseCode ? `${config.courseCode} · ` : ''}${unitLabel} ${u}: ${itemLabel} ${item}`

        let contentJson = selectedTemplate.jsonContent
        try {
          const parsed = JSON.parse(contentJson)
          if (Array.isArray(parsed) && parsed[0]?.children?.[0]) {
            parsed[0].children[0].text = noteTitle
            contentJson = JSON.stringify(parsed)
          }
        } catch {}

        notes.push({
          id: noteId,
          title: noteTitle,
          text: contentJson,
          noteType: selectedTemplate.noteType,
          courseId: config.courseId ?? null,
          folderId,
          categories: [...selectedTemplate.defaultCategories],
          createdAt: new Date(+now + (u * 100 + item) * 1000).toISOString(),
          updatedAt: new Date(+now + (u * 100 + item) * 1000).toISOString(),
        })
      }
    }
  }

  return { folders, notes }
}
