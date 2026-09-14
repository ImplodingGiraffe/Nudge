import type { FocusNote } from './types'

export function isStudyNote(note: Pick<FocusNote, 'noteType' | 'studyId'>): boolean {
  return note.noteType === 'study' || Boolean(note.studyId)
}

export function isLectureNote(note: Pick<FocusNote, 'noteType' | 'studyId'>): boolean {
  return note.noteType === 'lecture' || !isStudyNote(note)
}

function extractNodeText(node: any): string {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  if (node.type === 'action_item') {
    const check = node.checked ? '[x] ' : '[ ] '
    const inner = Array.isArray(node.children) ? node.children.map(extractNodeText).join('') : ''
    return check + inner
  }
  if (Array.isArray(node.children)) {
    return node.children.map(extractNodeText).join('')
  }
  return ''
}

export function extractTextFromJSON(jsonStr: string): string[] {
  try {
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed)) {
      return extractTextFromParsedJSON(parsed)
    }
  } catch {}
  return []
}

function extractTextFromParsedJSON(parsed: any[]): string[] {
  const lines: string[] = []
  for (const node of parsed) {
    if (!node) continue
    if (node.type === 'code_block' && Array.isArray(node.children)) {
      for (const lineNode of node.children) {
        const lineText = extractNodeText(lineNode).trim()
        if (lineText) lines.push(lineText)
      }
      continue
    }
    if (node.type === 'table' && Array.isArray(node.children)) {
      for (const row of node.children) {
        const cells = (row.children || [])
          .map(extractNodeText)
          .map((s: string) => s.trim())
          .filter(Boolean)
        if (cells.length) lines.push(cells.join(' | '))
      }
      continue
    }
    const text = extractNodeText(node).trim()
    if (text) lines.push(text)
  }
  return lines
}

type ParsedNoteJSON = {
  isJson: boolean
  array: any[] | null
}

const parsedNoteJSONCache = new Map<string, ParsedNoteJSON>()
const checklistCache = new Map<string, NoteChecklistInfo>()
const codeSnippetCache = new Map<string, NoteCodeSnippet | null>()
const mathSnippetCache = new Map<string, string | null>()

function rememberParsedNoteJSON(key: string, value: ParsedNoteJSON): ParsedNoteJSON {
  if (parsedNoteJSONCache.size >= MAX_NOTE_CACHE) parsedNoteJSONCache.clear()
  parsedNoteJSONCache.set(key, value)
  return value
}

function parseNoteJSON(text: string): ParsedNoteJSON {
  const trimmed = text.trim()
  const cached = parsedNoteJSONCache.get(trimmed)
  if (cached) return cached

  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    return rememberParsedNoteJSON(trimmed, { isJson: false, array: null })
  }

  try {
    const parsed = JSON.parse(trimmed)
    const result = {
      isJson: typeof parsed === 'object' && parsed !== null,
      array: Array.isArray(parsed) ? parsed : null,
    }
    return rememberParsedNoteJSON(trimmed, result)
  } catch {
    return rememberParsedNoteJSON(trimmed, { isJson: false, array: null })
  }
}

export function isJsonNote(text: string): boolean {
  if (!text) return false
  return parseNoteJSON(text).isJson
}

export function cleanPreviewLine(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^>\s?/, '')
    .replace(/^-\s*\[[ xX]\]\s*/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^```(?:\w+)?\s*$/, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .trim()
}

const plainLinesCache = new Map<string, string[]>()
const titleExcerptCache = new Map<string, { title: string; excerpt: string; isEmpty: boolean }>()
const MAX_NOTE_CACHE = 1000

export function getNotePlainLines(text: string): string[] {
  if (!text) return []
  const cached = plainLinesCache.get(text)
  if (cached) return cached

  let lines: string[]
  const parsed = parseNoteJSON(text)
  if (parsed.isJson) {
    lines = parsed.array ? extractTextFromParsedJSON(parsed.array) : []
  } else {
    lines = text.split('\n').map(cleanPreviewLine).filter(Boolean)
  }

  if (plainLinesCache.size >= MAX_NOTE_CACHE) {
    plainLinesCache.clear()
  }
  plainLinesCache.set(text, lines)
  return lines
}

export function getNotePlainText(text: string): string {
  const lines = getNotePlainLines(text)
  return lines.join('\n')
}

export function getNoteTitleAndExcerpt(text: string): {
  title: string
  excerpt: string
  isEmpty: boolean
} {
  if (!text) {
    return { title: 'Untitled note', excerpt: 'Empty note', isEmpty: true }
  }
  const cached = titleExcerptCache.get(text)
  if (cached) return cached

  const isJson = isJsonNote(text)
  const lines = getNotePlainLines(text)
  const isEmpty = isJson ? lines.length === 0 : !text.trim()

  const title = lines[0] || 'Untitled note'
  const excerpt = lines.slice(1, 3).join(' ') || (isEmpty ? 'Empty note' : '')

  const result = { title, excerpt, isEmpty }
  if (titleExcerptCache.size >= MAX_NOTE_CACHE) {
    titleExcerptCache.clear()
  }
  titleExcerptCache.set(text, result)
  return result
}

export const WELCOME_NOTE_SEEN_KEY = 'nudge.notes.welcome_seen.v1'

export function hasSeenWelcomeNote(): boolean {
  try {
    return typeof window !== 'undefined' && localStorage.getItem(WELCOME_NOTE_SEEN_KEY) === 'true'
  } catch {
    return false
  }
}

export function markWelcomeNoteSeen(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(WELCOME_NOTE_SEEN_KEY, 'true')
    }
  } catch {}
}

export function isVeryFirstNote(totalNotesCount: number): boolean {
  if (hasSeenWelcomeNote()) return false
  if (totalNotesCount > 0) {
    markWelcomeNoteSeen()
    return false
  }
  return true
}

export const NUDGE_WELCOME_NOTE_JSON = JSON.stringify([
  {
    type: 'h1',
    children: [{ text: 'Welcome to Nudge' }],
  },
  {
    type: 'callout',
    children: [
      {
        type: 'p',
        children: [
          { text: 'Your Calm, Intelligent Study Companion: ', bold: true },
          {
            text: 'Nudge is built to take the chaos out of student life. It links your courses, deadlines, focus blocks, and notes into one seamless, distraction-free workflow.',
          },
        ],
      },
    ],
  },
  {
    type: 'h2',
    children: [{ text: 'Why Nudge Works' }],
  },
  {
    type: 'p',
    children: [
      { text: 'Most study apps are either rigid calendar boxes or endless to-do lists that pile on guilt. ' },
      { text: 'Nudge is dynamic', bold: true },
      {
        text: ': it calculates your real cognitive capacity, schedules study blocks into genuine free time, and automatically adapts when plans change.',
      },
    ],
  },
  {
    type: 'h3',
    children: [{ text: 'Try These Features in This Note' }],
  },
  {
    type: 'action_item',
    checked: true,
    children: [
      { text: 'Explore rich typography with headings, bold, italic, code, and callouts' },
    ],
  },
  {
    type: 'action_item',
    checked: true,
    children: [
      { text: 'Select any text to reveal the floating formatting and AI bar' },
    ],
  },
  {
    type: 'action_item',
    checked: false,
    children: [
      { text: 'Type ' },
      { text: '/', code: true },
      { text: ' on any line to open the slash insertion menu' },
    ],
  },
  {
    type: 'action_item',
    checked: false,
    children: [
      { text: 'Press ' },
      { text: '⌘+J', kbd: true },
      { text: ' (or Space on an empty line) to ask AI to brainstorm, summarize, or refine' },
    ],
  },
  {
    type: 'action_item',
    checked: false,
    children: [
      { text: 'Link this note to any course or task using the selectors at the top' },
    ],
  },
  {
    type: 'h2',
    children: [{ text: 'The Nudge Ecosystem' }],
  },
  {
    type: 'table',
    children: [
      {
        type: 'tr',
        children: [
          {
            type: 'th',
            children: [{ type: 'p', children: [{ text: 'Area', bold: true }] }],
          },
          {
            type: 'th',
            children: [{ type: 'p', children: [{ text: 'What It Does', bold: true }] }],
          },
          {
            type: 'th',
            children: [{ type: 'p', children: [{ text: 'Shortcut', bold: true }] }],
          },
        ],
      },
      {
        type: 'tr',
        children: [
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'Today', bold: true }] }],
          },
          {
            type: 'td',
            children: [
              {
                type: 'p',
                children: [{ text: 'Zero-decision dashboard of what to focus on right now' }],
              },
            ],
          },
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'T', kbd: true }] }],
          },
        ],
      },
      {
        type: 'tr',
        children: [
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'Plan', bold: true }] }],
          },
          {
            type: 'td',
            children: [
              {
                type: 'p',
                children: [{ text: 'Interactive weekly grid balancing classes & study sessions' }],
              },
            ],
          },
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'P', kbd: true }] }],
          },
        ],
      },
      {
        type: 'tr',
        children: [
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'Notes', bold: true }] }],
          },
          {
            type: 'td',
            children: [
              {
                type: 'p',
                children: [{ text: 'Plate-powered rich notes with math, tables, code, and AI' }],
              },
            ],
          },
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'O', kbd: true }] }],
          },
        ],
      },
      {
        type: 'tr',
        children: [
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'Progress', bold: true }] }],
          },
          {
            type: 'td',
            children: [
              {
                type: 'p',
                children: [{ text: 'Visual streak tracker, completion stats, and velocity' }],
              },
            ],
          },
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'G', kbd: true }] }],
          },
        ],
      },
    ],
  },
  {
    type: 'blockquote',
    children: [
      {
        type: 'p',
        children: [
          {
            text: '“You do not rise to the level of your goals. You fall to the level of your systems.”',
            italic: true,
          },
          { text: ' — James Clear, Atomic Habits' },
        ],
      },
    ],
  },
  {
    type: 'h2',
    children: [{ text: 'Math & Equations' }],
  },
  {
    type: 'p',
    children: [
      {
        text: 'Nudge supports formatted block and inline LaTeX formulas using KaTeX. For instance, the formula for productive study momentum:',
      },
    ],
  },
  {
    type: 'equation',
    texExpression: 'Focus = \\frac{\\text{Clarity} \\times \\text{Intention}}{\\text{Friction} + \\text{Distraction}}',
    children: [{ text: '' }],
  },
  {
    type: 'h2',
    children: [{ text: 'Code & Syntax Highlighting' }],
  },
  {
    type: 'code_block',
    lang: 'typescript',
    children: [
      { type: 'code_line', children: [{ text: '// Schedule a deep-work study block in Nudge' }] },
      { type: 'code_line', children: [{ text: 'const session = new StudySession({' }] },
      { type: 'code_line', children: [{ text: "  course: 'Data Structures & Algorithms'," }] },
      { type: 'code_line', children: [{ text: '  durationMin: 50,' }] },
      { type: 'code_line', children: [{ text: "  technique: 'Pomodoro'," }] },
      { type: 'code_line', children: [{ text: '  distractionsBlocked: true,' }] },
      { type: 'code_line', children: [{ text: '});' }] },
    ],
  },
  {
    type: 'hr',
    children: [{ text: '' }],
  },
  {
    type: 'p',
    children: [
      { text: 'This note is yours to edit, experiment with, or delete. When you are ready for a clean slate, click ' },
      { text: '+ Note', bold: true },
      { text: ' in the sidebar. Let Nudge keep your studies on track!' },
    ],
  },
]);

export function getNoteDisplayTitle(note: { title?: string | null; text?: string | null }): string {
  if (note.title && note.title.trim()) {
    return note.title.trim()
  }
  const lines = getNotePlainLines(note.text || '')
  if (lines.length > 0 && lines[0].trim()) {
    return lines[0].trim()
  }
  return 'Untitled note'
}

export interface NoteChecklistItem {
  text: string
  done: boolean
}

export interface NoteChecklistInfo {
  items: NoteChecklistItem[]
  total: number
  completed: number
}

export function getNoteChecklist(text: string): NoteChecklistInfo {
  if (!text) return { items: [], total: 0, completed: 0 }
  const cached = checklistCache.get(text)
  if (cached) return cached

  const items: NoteChecklistItem[] = []
  const trimmed = text.trim()

  const parsed = parseNoteJSON(trimmed)
  if (parsed.array) {
        const walk = (nodes: any[]) => {
          for (const node of nodes) {
            if (!node) continue
            if (node.type === 'action_item') {
              const itemText = Array.isArray(node.children)
                ? node.children.map(extractNodeText).join('').trim()
                : typeof node.text === 'string'
                  ? node.text.trim()
                  : ''
              items.push({
                text: itemText,
                done: Boolean(node.checked),
              })
            }
            if (Array.isArray(node.children)) {
              walk(node.children)
            }
          }
        }
        walk(parsed.array)
        const result = {
          items,
          total: items.length,
          completed: items.filter((i) => i.done).length,
        }
        if (checklistCache.size >= MAX_NOTE_CACHE) checklistCache.clear()
        checklistCache.set(text, result)
        return result
  }

  const lines = text.split('\n')
  for (const line of lines) {
    const match = line.match(/^[-*]\s*\[([ xX])\]\s*(.*)$/)
    if (match) {
      items.push({
        text: match[2].trim(),
        done: /x/i.test(match[1]),
      })
    }
  }

  const result = {
    items,
    total: items.length,
    completed: items.filter((i) => i.done).length,
  }
  if (checklistCache.size >= MAX_NOTE_CACHE) checklistCache.clear()
  checklistCache.set(text, result)
  return result
}

export function getNoteQuestions(text: string): string[] {
  if (!text) return []
  const questions: string[] = []
  const seen = new Set<string>()

  const addQuestion = (q: string) => {
    const cleaned = cleanPreviewLine(q)
      .replace(/^[?•\-*\s]+/, '')
      .replace(/^Q:\s*/i, '')
      .trim()
    if (cleaned && cleaned.length > 3 && !seen.has(cleaned)) {
      seen.add(cleaned)
      questions.push(cleaned)
    }
  }

  const trimmed = text.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        let inQuestionSection = false
        const walk = (nodes: any[]) => {
          for (const node of nodes) {
            if (!node) continue
            if (node.type === 'h1' || node.type === 'h2' || node.type === 'h3') {
              const hText = extractNodeText(node).toLowerCase()
              inQuestionSection =
                hText.includes('question') || hText.includes('❓') || hText.includes('inquir')
            } else if (node.type === 'p' || node.type === 'action_item' || node.type === 'li') {
              const nodeText = extractNodeText(node).trim()
              if (
                nodeText.startsWith('?') ||
                nodeText.startsWith('Q:') ||
                nodeText.endsWith('?') ||
                (inQuestionSection &&
                  (nodeText.includes('?') || nodeText.startsWith('•') || nodeText.startsWith('-')))
              ) {
                addQuestion(nodeText)
              }
            }
            if (Array.isArray(node.children) && node.type !== 'p') {
              walk(node.children)
            }
          }
        }
        walk(parsed)
        if (questions.length > 0) return questions
      }
    } catch {}
  }

  const lines = text.split('\n')
  let inSection = false
  for (const line of lines) {
    const l = line.trim()
    if (/^#{1,6}\s+.*(?:question|❓|inquir)/i.test(l)) {
      inSection = true
      continue
    } else if (/^#{1,6}\s+/.test(l)) {
      inSection = false
      continue
    }

    if (
      l.startsWith('?') ||
      /^Q:\s*/i.test(l) ||
      /\?\s*$/.test(l) ||
      (inSection && (l.includes('?') || /^[-*•]\s+/.test(l)))
    ) {
      addQuestion(l)
    }
  }

  return questions
}

export function getNoteUncertainties(text: string): string[] {
  if (!text) return []
  const uncertainties: string[] = []
  const seen = new Set<string>()

  const addUncertainty = (u: string) => {
    const cleaned = cleanPreviewLine(u)
      .replace(/^(?:⚠️|!\s*|flag(?:ged)?:\s*|uncertain(?:ty)?:\s*)/i, '')
      .trim()
    if (cleaned && cleaned.length > 2 && !seen.has(cleaned)) {
      seen.add(cleaned)
      uncertainties.push(cleaned)
    }
  }

  const trimmed = text.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        let inUncertaintySection = false
        const walk = (nodes: any[]) => {
          for (const node of nodes) {
            if (!node) continue
            if (node.type === 'h1' || node.type === 'h2' || node.type === 'h3') {
              const hText = extractNodeText(node).toLowerCase()
              inUncertaintySection =
                hText.includes('uncertain') ||
                hText.includes('flagged') ||
                hText.includes('⚠️') ||
                hText.includes('confus') ||
                hText.includes('doubt')
            } else if (node.type === 'p' || node.type === 'action_item' || node.type === 'li') {
              const nodeText = extractNodeText(node).trim()
              if (
                nodeText.includes('⚠️') ||
                /^flag(?:ged)?:\s*/i.test(nodeText) ||
                /^uncertain(?:ty)?:\s*/i.test(nodeText) ||
                (inUncertaintySection && nodeText)
              ) {
                addUncertainty(nodeText)
              }
            }
            if (Array.isArray(node.children) && node.type !== 'p') {
              walk(node.children)
            }
          }
        }
        walk(parsed)
        if (uncertainties.length > 0) return uncertainties
      }
    } catch {}
  }

  const lines = text.split('\n')
  let inSection = false
  for (const line of lines) {
    const l = line.trim()
    if (/^#{1,6}\s+.*(?:uncertain|flagged|⚠️|confus|doubt)/i.test(l)) {
      inSection = true
      continue
    } else if (/^#{1,6}\s+/.test(l)) {
      inSection = false
      continue
    }

    if (
      l.includes('⚠️') ||
      /^flag(?:ged)?:\s*/i.test(l) ||
      /^uncertain(?:ty)?:\s*/i.test(l) ||
      (inSection && l)
    ) {
      addUncertainty(l)
    }
  }

  return uncertainties
}

export function getNoteMathSnippet(text: string): string | null {
  if (!text) return null
  if (mathSnippetCache.has(text)) return mathSnippetCache.get(text) ?? null
  const trimmed = text.trim()
  const parsed = parseNoteJSON(trimmed)
  if (parsed.array) {
        let snippet: string | null = null
        const walk = (nodes: any[]) => {
          for (const node of nodes) {
            if (!node || snippet) return
            if (
              (node.type === 'equation' || node.type === 'inline_equation') &&
              typeof node.texExpression === 'string' &&
              node.texExpression.trim()
            ) {
              snippet = node.texExpression.trim()
              return
            }
            if (typeof node.texExpression === 'string' && node.texExpression.trim()) {
              snippet = node.texExpression.trim()
              return
            }
            if (Array.isArray(node.children)) {
              walk(node.children)
            }
          }
        }
        walk(parsed.array)
        if (snippet) {
          if (mathSnippetCache.size >= MAX_NOTE_CACHE) mathSnippetCache.clear()
          mathSnippetCache.set(text, snippet)
          return snippet
        }
  }

  const blockMatch = text.match(/\$\$([\s\S]+?)\$\$/)
  if (blockMatch && blockMatch[1].trim()) {
    const snippet = blockMatch[1].trim().replace(/\n\s*/g, ' ')
    if (mathSnippetCache.size >= MAX_NOTE_CACHE) mathSnippetCache.clear()
    mathSnippetCache.set(text, snippet)
    return snippet
  }
  const inlineMatch = text.match(/\$([^$\n]+)\$/)
  if (inlineMatch && inlineMatch[1].trim()) {
    const snippet = inlineMatch[1].trim()
    if (mathSnippetCache.size >= MAX_NOTE_CACHE) mathSnippetCache.clear()
    mathSnippetCache.set(text, snippet)
    return snippet
  }

  if (mathSnippetCache.size >= MAX_NOTE_CACHE) mathSnippetCache.clear()
  mathSnippetCache.set(text, null)
  return null
}

export interface NoteCodeSnippet {
  lang: string
  snippet: string
}

export function getNoteCodeSnippet(text: string): NoteCodeSnippet | null {
  if (!text) return null
  if (codeSnippetCache.has(text)) return codeSnippetCache.get(text) ?? null
  const trimmed = text.trim()
  const parsed = parseNoteJSON(trimmed)
  if (parsed.array) {
        let result: NoteCodeSnippet | null = null
        const walk = (nodes: any[]) => {
          for (const node of nodes) {
            if (!node || result) return
            if (node.type === 'code_block') {
              const lang = node.lang || 'code'
              const lines: string[] = []
              if (Array.isArray(node.children)) {
                for (const child of node.children) {
                  lines.push(extractNodeText(child))
                }
              }
              const snippet = lines.join('\n').trim()
              if (snippet) {
                result = { lang, snippet }
                return
              }
            }
            if (Array.isArray(node.children)) {
              walk(node.children)
            }
          }
        }
        walk(parsed.array)
        if (result) {
          if (codeSnippetCache.size >= MAX_NOTE_CACHE) codeSnippetCache.clear()
          codeSnippetCache.set(text, result)
          return result
        }
  }

  const match = text.match(/```(\w*)\r?\n([\s\S]*?)```/)
  if (match && match[2].trim()) {
    const result = {
      lang: match[1] || 'code',
      snippet: match[2].trim(),
    }
    if (codeSnippetCache.size >= MAX_NOTE_CACHE) codeSnippetCache.clear()
    codeSnippetCache.set(text, result)
    return result
  }

  if (codeSnippetCache.size >= MAX_NOTE_CACHE) codeSnippetCache.clear()
  codeSnippetCache.set(text, null)
  return null
}

export interface NotePreviewMetadata {
  plainLines: string[]
  checklist: NoteChecklistInfo
  hasCode: boolean
  hasMath: boolean
}

const previewMetadataCache = new Map<string, NotePreviewMetadata>()

export function getNotePreviewMetadata(text: string): NotePreviewMetadata {
  const cached = previewMetadataCache.get(text)
  if (cached) return cached

  const result = {
    plainLines: getNotePlainLines(text),
    checklist: getNoteChecklist(text),
    hasCode: Boolean(getNoteCodeSnippet(text)),
    hasMath: Boolean(getNoteMathSnippet(text)),
  }
  if (previewMetadataCache.size >= MAX_NOTE_CACHE) previewMetadataCache.clear()
  previewMetadataCache.set(text, result)
  return result
}
