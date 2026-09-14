import { readKey } from './config'
import { getNotePlainLines, getNoteTitleAndExcerpt, isJsonNote } from '../notes'

export const PRIMARY_TITLER_MODEL = 'gemini-3.7-flash'
export const FALLBACK_TITLER_MODEL = 'gemini-3.5-flash-lite'

export interface AutoTitleResult {
  title: string
  model: string
  usedFallback: boolean
  isLocal: boolean
}

function cleanTitle(raw: string): string {
  let t = raw
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/^Title:\s*/i, '')
    .replace(/^Subject:\s*/i, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  t = t.replace(/[.:;,\-]+$/, '').trim()

  if (t.length > 80) {
    t = t.slice(0, 77) + '…'
  }

  return t
}

export function extractHeuristicTitle(text: string, courseCode?: string): string {
  if (!text || !text.trim()) return 'Untitled note'

  const lines = getNotePlainLines(text)
  if (lines.length === 0) return 'Untitled note'

  for (const line of lines) {
    const cleaned = cleanTitle(line)
    if (cleaned && cleaned.length > 3 && !cleaned.toLowerCase().startsWith('welcome')) {
      const words = cleaned.split(' ')
      if (words.length > 8) {
        return words.slice(0, 7).join(' ')
      }
      return cleaned
    }
  }

  const { title } = getNoteTitleAndExcerpt(text)
  return cleanTitle(title) || (courseCode ? `${courseCode} Note` : 'Untitled note')
}

async function callGeminiGenerate(
  model: string,
  apiKey: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey,
  )}`

  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: 64,
      temperature: 0.3,
    },
    systemInstruction: {
      parts: [
        {
          text:
            'You are an expert academic note summarizer. Read the following student note content and synthesize it into a single, sharp, descriptive title (3 to 6 words). Return ONLY the title text. Do NOT include quotation marks, formatting, prefixes like "Title:", or ending punctuation.',
        },
      ],
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '')
    throw new Error(`Gemini ${model} failed (${res.status}): ${errorBody}`)
  }

  const data = await res.json()
  const candidate = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!candidate || typeof candidate !== 'string') {
    throw new Error(`Empty response from ${model}`)
  }

  return cleanTitle(candidate)
}

export async function generateNoteTitle({
  text,
  courseCode,
  signal,
}: {
  text: string
  courseCode?: string
  signal?: AbortSignal
}): Promise<AutoTitleResult> {
  if (!text || !text.trim() || text.trim() === '[]') {
    return {
      title: 'Untitled note',
      model: 'none',
      usedFallback: false,
      isLocal: true,
    }
  }

  const apiKey = readKey()

  if (!apiKey) {
    return {
      title: extractHeuristicTitle(text, courseCode),
      model: 'local-heuristic',
      usedFallback: false,
      isLocal: true,
    }
  }

  const plainLines = getNotePlainLines(text)
  const excerpt = plainLines.slice(0, 15).join('\n').slice(0, 1500)

  const prompt = courseCode
    ? `Course: ${courseCode}\n\nNote Content:\n${excerpt}`
    : `Note Content:\n${excerpt}`

  try {
    const title = await callGeminiGenerate(PRIMARY_TITLER_MODEL, apiKey, prompt, signal)
    if (title && title.length > 2) {
      return {
        title,
        model: PRIMARY_TITLER_MODEL,
        usedFallback: false,
        isLocal: false,
      }
    }
  } catch (primaryErr) {
    console.warn(`[Auto-Titler] ${PRIMARY_TITLER_MODEL} failed, switching to fallback:`, primaryErr)
  }

  try {
    const title = await callGeminiGenerate(FALLBACK_TITLER_MODEL, apiKey, prompt, signal)
    if (title && title.length > 2) {
      return {
        title,
        model: FALLBACK_TITLER_MODEL,
        usedFallback: true,
        isLocal: false,
      }
    }
  } catch (fallbackErr) {
    console.warn(`[Auto-Titler] ${FALLBACK_TITLER_MODEL} failed, using local heuristic:`, fallbackErr)
  }

  return {
    title: extractHeuristicTitle(text, courseCode),
    model: 'local-heuristic',
    usedFallback: true,
    isLocal: true,
  }
}
