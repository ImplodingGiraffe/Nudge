import { ElementApi, KEYS, nanoid, NodeApi, type Path } from 'platejs';
import type { PlateEditor } from 'platejs/react';
import { AIChatPlugin } from '@platejs/ai/react';
import { serializeMd } from '@platejs/markdown';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import { FALLBACK_MODEL, PRIMARY_MODEL, readKey, readModel } from './config';
import { toast } from 'sonner';

export const DEFAULT_PLATE_MODEL = PRIMARY_MODEL;

export const FALLBACK_MODELS = [
  PRIMARY_MODEL,
  FALLBACK_MODEL,
];

export interface GeminiStreamOptions {
  editor: PlateEditor;
  body: any;
  signal?: AbortSignal;
  sample?: 'comment' | 'markdown' | 'mdx' | 'table' | null;
}

export function cleanModelName(model?: string): string {
  if (!model) return DEFAULT_PLATE_MODEL;
  return model.replace(/^google\//, '').replace(/^models\//, '');
}

async function fetchGeminiWithFallback({
  apiKey,
  preferredModel,
  body,
  signal,
  stream = true,
}: {
  apiKey: string;
  preferredModel: string;
  body: any;
  signal?: AbortSignal;
  stream?: boolean;
}): Promise<Response> {
  const cleanPreferred = cleanModelName(preferredModel);
  const models = Array.from(new Set([cleanPreferred, ...FALLBACK_MODELS]));
  let lastError: any = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const isLastModel = i === models.length - 1;

    try {
      const endpoint = stream ? 'streamGenerateContent' : 'generateContent';
      const query = stream ? 'alt=sse&key=' : 'key=';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}?${query}${encodeURIComponent(
        apiKey
      )}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg =
          errData?.error?.message ||
          `Gemini request failed with status ${res.status}`;
        lastError = new Error(msg);

        const canFallback =
          res.status === 404 ||
          res.status === 429 ||
          (res.status >= 500 && res.status <= 504);

        if (canFallback && !isLastModel) {
          console.warn(
            `Gemini model ${model} failed (${res.status}: ${msg}). Falling back to next model: ${models[i + 1]}.`
          );
          continue;
        }

        const fatalErr = lastError;
        (fatalErr as any).fatal = true;
        throw fatalErr;
      }

      (res as any).model = model;
      (res as any).usedFallback = model !== cleanPreferred;
      return res;
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.fatal) throw err;
      lastError = err;
      if (!isLastModel) {
        console.warn(
          `Gemini model ${model} threw error (${err?.message}). Falling back to next model: ${models[i + 1]}.`
        );
        continue;
      }
    }
  }

  throw lastError ?? new Error('Failed to reach Google Gemini API');
}

export function getEditorContext(editor: PlateEditor) {
  let fullDocument = '';
  try {
    if (Array.isArray(editor.children) && editor.children.length > 0) {
      fullDocument = serializeMd(editor, { value: editor.children }).trim();
    }
  } catch {
    try {
      fullDocument = editor.children
        .map((node) => NodeApi.string(node))
        .join('\n')
        .trim();
    } catch {}
  }

  const isSelectionActive = Boolean(
    editor.selection && !editor.api.isCollapsed()
  );
  let selectedText: string | undefined;
  if (isSelectionActive && editor.selection) {
    try {
      const fragment = editor.api.fragment();
      if (Array.isArray(fragment) && fragment.length > 0) {
        const blocks = fragment.map((node: any) =>
          ElementApi.isElement(node) ? node : { type: 'p', children: [node] }
        );
        selectedText = serializeMd(editor, { value: blocks }).trim();
      }
    } catch {}
    if (!selectedText) {
      try {
        selectedText = editor.api.string(editor.selection).trim();
      } catch {}
    }
  }

  let currentBlockText: string | undefined;
  try {
    const [block] = editor.api.block({ highest: true }) || [];
    if (block) {
      currentBlockText = NodeApi.string(block).trim();
    }
  } catch {}

  return { fullDocument, selectedText, currentBlockText, isSelectionActive };
}

export function extractContextMarkdown(editor: PlateEditor): string {
  return getEditorContext(editor).fullDocument;
}

export function cleanPromptTags(text: string): string {
  if (!text) return '';

  let cleaned = text.trim();
  cleaned = cleaned
    .replace(/^```(?:markdown|md)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '');
  cleaned = cleaned.replace(
    /<\/?(?:OriginalText|EditedText|SurroundingDocumentContext|Result|Document|Block|SelectedText)>/gi,
    ''
  );
  cleaned = cleaned.replace(/^"""\s*\n?/, '').replace(/\n?"""\s*$/, '');
  cleaned = cleaned.replace(
    /^(?:Here (?:is|are|'s) the (?:corrected|edited|improved|revised|updated) (?:text|version|content|sentence|paragraph)s?:\s*\n*)/i,
    ''
  );

  return cleaned.trim();
}

function buildGeminiRequest({
  editor,
  body,
}: {
  editor: PlateEditor;
  body: any;
}): { systemInstruction: string; promptText: string; isEdit: boolean } {
  const toolName =
    body.toolName ||
    body.ctx?.toolName ||
    editor.getOption(AIChatPlugin, 'toolName');

  const messages = body.messages || [];
  const lastMessage = messages.at(-1);
  let userPrompt =
    lastMessage?.parts?.find((p: any) => p.type === 'text')?.text ||
    lastMessage?.content ||
    '';

  const { fullDocument, selectedText, currentBlockText, isSelectionActive } =
    getEditorContext(editor);

  if (userPrompt.includes('{editor}')) {
    userPrompt = userPrompt.replaceAll('{editor}', fullDocument);
  }

  if (userPrompt.includes('<Block>') && !userPrompt.includes('</Block>')) {
    userPrompt = userPrompt.replace(
      '<Block>',
      `<Block>\n${selectedText || currentBlockText || fullDocument}\n</Block>`
    );
  }

  if (toolName === 'edit') {
    const systemInstruction =
      'You are an expert precision text editor. You are given source text and editing instructions.\n' +
      'CRITICAL RULES:\n' +
      '1. OUTPUT ONLY THE FINAL EDITED TEXT. Do not output any preamble, meta talk, conversational pleasantries, notes, or explanations (e.g. NEVER write "Here is the corrected text:").\n' +
      '2. PRESERVE LINKS: You MUST preserve all Markdown links [anchor text](url) with their exact URLs. NEVER strip links or convert links to plain text. If the linked phrase is unchanged, keep [anchor text](url) intact.\n' +
      '3. PRESERVE FORMATTING & CHARACTERS: Preserve existing formatting (bold **, italics *, code ``, math $, citations [1], [2]). Preserve exact unicode characters, dashes (en-dash –, em-dash —), quotes, and special symbols (like phonetic notation /.../) from the original text.\n' +
      '4. Output ONLY the resulting edited text in Markdown.\n' +
      '5. DO NOT output any explanations, meta talk, pleasantries, or preamble.\n' +
      '6. DO NOT wrap your entire output in ```markdown or ``` code fences unless the original text itself was a code block.\n' +
      '7. Never output XML or HTML wrapper tags, and return the exact source text unchanged when no edit is needed.';

    const targetText = selectedText || currentBlockText || fullDocument;
    let promptText = `Text to edit:\n"""\n${targetText}\n"""\n\nEditing instructions:\n${userPrompt}`;
    if (fullDocument && fullDocument !== targetText) {
      promptText = `Surrounding document context (for reference only):\n"""\n${fullDocument}\n"""\n\n${promptText}`;
    }

    return { systemInstruction, promptText, isEdit: true };
  }

  if (toolName === 'generate') {
    const systemInstruction =
      'You are a smart AI writing assistant integrated into a notes editor. Generate high quality content following the user instructions. Output clean Markdown directly without conversational preamble, meta commentary, or wrapping code fences. Always use the full note in <Document> for context.';

    let promptText = fullDocument
      ? `<Document>\n${fullDocument}\n</Document>\n\n`
      : '';
    if (isSelectionActive && selectedText) {
      promptText += `<SelectedText>\n${selectedText}\n</SelectedText>\n\n`;
    }
    promptText += `Task: ${userPrompt}`;

    return { systemInstruction, promptText, isEdit: false };
  }

  const systemInstruction =
    'You are a helpful AI assistant in a rich text notes app. The full note is provided in <Document>. Use it to answer questions, clarify concepts, brainstorm, or generate content. If text is highlighted, use <SelectedText> to focus your answer. Output clear Markdown without unnecessary conversational filler or wrapping code fences.';
  let promptText = fullDocument
    ? `<Document>\n${fullDocument}\n</Document>\n\n`
    : '';
  if (isSelectionActive && selectedText) {
    promptText += `<SelectedText>\n${selectedText}\n</SelectedText>\n\n`;
  }
  promptText += `Student Prompt:\n${userPrompt}`;

  return { systemInstruction, promptText, isEdit: false };
}

export function createGeminiChatStream({
  editor,
  body,
  signal,
  sample,
}: GeminiStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const apiKey = readKey();
  const model = body.model || readModel() || DEFAULT_PLATE_MODEL;

  return new ReadableStream({
    async start(controller) {
      const messageId = `msg_${nanoid()}`;

      const sendEvent = (event: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const sendRawEvent = (raw: string) => {
        controller.enqueue(encoder.encode(`data: ${raw}\n\n`));
      };

      if (signal?.aborted) {
        controller.error(new Error('Aborted'));
        return;
      }

      const abortHandler = () => {
        try {
          controller.error(new Error('Stream aborted'));
        } catch {}
      };
      signal?.addEventListener('abort', abortHandler, { once: true });

      if (!apiKey) {
        const error = new Error(
          'Please configure your Gemini API key in Settings'
        );
        toast.error(error.message);
        try {
          controller.error(error);
        } catch {}
        return;
      }

      if (sample === 'comment') {
        try {
          await handleComments({
            editor,
            apiKey,
            model,
            body,
            signal,
            sendEvent,
            sendRawEvent,
          });
        } catch (err: any) {
          if (!signal?.aborted) {
            toast.error(err?.message || 'Failed to generate AI comments');
            sendRawEvent('[DONE]');
          }
        }
        controller.close();
        return;
      }

      if (sample === 'table') {
        try {
          await handleTableCells({
            editor,
            apiKey,
            model,
            body,
            signal,
            sendEvent,
            sendRawEvent,
          });
        } catch (err: any) {
          if (!signal?.aborted) {
            toast.error(err?.message || 'Failed to update table cells');
            sendRawEvent('[DONE]');
          }
        }
        controller.close();
        return;
      }

      try {
        sendEvent({ type: 'start' });
        sendEvent({ type: 'start-step' });
        sendEvent({
          type: 'text-start',
          id: messageId,
          providerMetadata: { openai: { itemId: messageId } },
        });

        const { systemInstruction, promptText, isEdit } = buildGeminiRequest({
          editor,
          body,
        });

        const geminiBody: any = {
          contents: [
            {
              role: 'user',
              parts: [{ text: promptText }],
            },
          ],
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          generationConfig: {
            temperature: isEdit ? 0.2 : 0.7,
            maxOutputTokens: 4096,
          },
        };

        const res = await fetchGeminiWithFallback({
          apiKey,
          preferredModel: model,
          body: geminiBody,
          signal,
          stream: true,
        });

        if ((res as any).usedFallback) {
          toast.info('Primary model was busy; completed using Gemini 3.5 Flash Lite backup.');
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('No response stream from Gemini');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        let isStartOfStream = true;
        let startBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (!dataStr || dataStr === '[DONE]') continue;

            try {
              const chunkJson = JSON.parse(dataStr);
              const textDelta =
                chunkJson.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textDelta) {

                if (isStartOfStream) {
                  startBuffer += textDelta;

                  if (startBuffer.length < 15 && !startBuffer.includes('\n')) {
                    continue;
                  }
                  isStartOfStream = false;
                   let cleaned = isEdit
                     ? cleanPromptTags(startBuffer)
                     : startBuffer
                         .replace(/^```[a-zA-Z0-9_-]*\n?/, '')
                         .trimStart();
                  if (cleaned) {
                    sendEvent({
                      type: 'text-delta',
                      id: messageId,
                      delta: cleaned,
                    });
                  }
                } else {

                   let cleanedDelta = isEdit
                     ? textDelta.replace(
                         /<\/?(?:OriginalText|EditedText|SurroundingDocumentContext|Result|Document|Block|SelectedText)>/gi,
                         ''
                       )
                     : textDelta;
                  if (cleanedDelta.endsWith('\n```')) {
                    cleanedDelta = cleanedDelta.slice(0, -4);
                  } else if (cleanedDelta.endsWith('```')) {
                    cleanedDelta = cleanedDelta.slice(0, -3);
                  }

                  if (cleanedDelta) {
                    sendEvent({
                      type: 'text-delta',
                      id: messageId,
                      delta: cleanedDelta,
                    });
                  }
                }
              }
            } catch {}
          }
        }

        if (isStartOfStream && startBuffer) {
           let cleaned = isEdit
             ? cleanPromptTags(startBuffer)
             : startBuffer.replace(/^```[a-zA-Z0-9_-]*\n?/, '').trimStart();
           if (cleaned.endsWith('\n```')) {
             cleaned = cleaned.slice(0, -4);
           } else if (cleaned.endsWith('```')) {
             cleaned = cleaned.slice(0, -3);
           }
          if (cleaned) {
            sendEvent({
              type: 'text-delta',
              id: messageId,
              delta: cleaned,
            });
          }
        }

        sendEvent({ type: 'text-end', id: messageId });
        sendEvent({ type: 'finish-step' });
        sendEvent({ type: 'finish' });
        sendRawEvent('[DONE]');
      } catch (err: any) {
        if (signal?.aborted) return;
        const errorMessage = err?.message || 'Error communicating with Gemini';
        toast.error(errorMessage);
        sendEvent({
          type: 'error',
          error: errorMessage,
        });
        sendRawEvent('[DONE]');
        try {
          controller.error(err instanceof Error ? err : new Error(errorMessage));
        } catch {
          try {
            controller.close();
          } catch {}
        }
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
}

async function handleComments({
  editor,
  apiKey,
  model,
  body,
  signal,
  sendEvent,
  sendRawEvent,
}: {
  editor: PlateEditor;
  apiKey: string;
  model: string;
  body: any;
  signal?: AbortSignal;
  sendEvent: (e: any) => void;
  sendRawEvent: (r: string) => void;
}) {
  sendEvent({ type: 'start' });
  sendEvent({ type: 'start-step' });
  sendRawEvent('{"data":"comment","type":"data-toolName"}');

  const blockEntries: Array<{ id: string; text: string; path: Path }> = [];

  editor.children.forEach((node, index) => {
    if (!ElementApi.isElement(node)) return;

    let id = (node as any).id as string | undefined;
    if (!id) {
      id = nanoid();
      editor.tf.withoutSaving(() => {
        editor.tf.setNodes({ id }, { at: [index] });
      });
    }

    const text = NodeApi.string(node).trim();
    if (text) {
      blockEntries.push({ id, text, path: [index] });
    }
  });

  const isSelecting = editor.api.isExpanded();
  let candidateEntries = blockEntries;

  if (isSelecting && editor.selection) {
    try {
      const selectedNodes = editor.api.blocks({
        mode: 'highest',
        at: editor.selection,
      });
      const selectedIds = new Set(
        selectedNodes.map(([node]) => (node as any).id).filter(Boolean)
      );
      const filtered = blockEntries.filter((block) =>
        selectedIds.has(block.id)
      );
      if (filtered.length > 0) {
        candidateEntries = filtered;
      }
    } catch {}
  }

  const validBlocks = candidateEntries.map(({ id, text }) => ({ id, text }));

  if (validBlocks.length === 0) {
    sendEvent({ type: 'finish-step' });
    sendEvent({ type: 'finish' });
    sendRawEvent('[DONE]');
    return;
  }

  const prompt = `You are an expert editor. Review the following note blocks and provide 1 to 3 constructive feedback comments.
CRITICAL:
- "blockId": must match the exact block ID provided below
- "content": must be an EXACT substring found inside that block's text
- "comment": your constructive feedback or suggestion

Output ONLY a JSON array of objects with this structure:
[
  {
    "blockId": "id-here",
    "content": "snippet-here",
    "comment": "your advice here"
  }
]
Do not include backticks or markdown formatting around the JSON.

Blocks:
${JSON.stringify(validBlocks, null, 2)}`;

  const geminiRes = await fetchGeminiWithFallback({
    apiKey,
    preferredModel: model,
    body: {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    },
    signal,
    stream: false,
  });

  if (!geminiRes.ok) {
    sendRawEvent('[DONE]');
    return;
  }

  const data = await geminiRes.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  let comments: Array<{ blockId: string; content: string; comment: string }> = [];
  try {
    const start = cleanJson.indexOf('[');
    const end = cleanJson.lastIndexOf(']');

    if (start >= 0 && end > start) {
      comments = JSON.parse(cleanJson.slice(start, end + 1));
    }
  } catch {
    comments = [];
  }

  const validBlockIds = new Map(validBlocks.map((block) => [block.id, block.text]));
  const resolveCommentContent = (blockText: string, requested: string) => {
    const trimmed = requested.trim();
    if (!trimmed) return blockText.split(/\s+/).slice(0, 6).join(' ');

    const exactIndex = blockText.indexOf(trimmed);
    if (exactIndex >= 0) {
      return blockText.slice(exactIndex, exactIndex + trimmed.length);
    }

    const lowerBlock = blockText.toLocaleLowerCase();
    const lowerRequested = trimmed.toLocaleLowerCase();
    const lowerIndex = lowerBlock.indexOf(lowerRequested);
    if (lowerIndex >= 0) {
      return blockText.slice(lowerIndex, lowerIndex + trimmed.length);
    }

    const tokens = trimmed
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length > 0) {
      const pattern = tokens
        .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[\\s\\p{P}]*');
      const match = blockText.match(new RegExp(pattern, 'iu'));
      if (match?.index !== undefined) {
        return match[0];
      }
    }

    return blockText.split(/\s+/).slice(0, 6).join(' ');
  };

  const verifiedComments = Array.isArray(comments)
    ? comments
        .filter(
          (comment) =>
            typeof comment?.blockId === 'string' &&
            typeof comment?.content === 'string' &&
            typeof comment?.comment === 'string' &&
            comment.comment.trim().length > 0 &&
            validBlockIds.has(comment.blockId)
        )
        .map((comment) => ({
          blockId: comment.blockId,
          content: resolveCommentContent(
            validBlockIds.get(comment.blockId)!,
            comment.content
          ),
          comment: comment.comment.trim(),
        }))
    : [];

  if (verifiedComments.length === 0) {
    sendEvent({ type: 'finish-step' });
    sendEvent({ type: 'finish' });
    sendRawEvent('[DONE]');
    return;
  }

  for (const c of verifiedComments) {
    sendEvent({
      id: nanoid(),
      type: 'data-comment',
      data: {
        comment: {
          blockId: c.blockId,
          content: c.content,
          comment: c.comment,
        },
        status: 'streaming',
      },
    });
  }

  sendEvent({
    id: nanoid(),
    type: 'data-comment',
    data: { comment: null, status: 'finished' },
  });
  sendEvent({ type: 'finish-step' });
  sendEvent({ type: 'finish' });
  sendRawEvent('[DONE]');
}

async function handleTableCells({
  editor,
  apiKey,
  model,
  body,
  signal,
  sendEvent,
  sendRawEvent,
}: {
  editor: PlateEditor;
  apiKey: string;
  model: string;
  body: any;
  signal?: AbortSignal;
  sendEvent: (e: any) => void;
  sendRawEvent: (r: string) => void;
}) {
  sendRawEvent('{"data":"edit","type":"data-toolName"}');

  const selectedCells =
    editor.getOption({ key: KEYS.table }, 'selectedCells') || [];

  let cellIds: string[] = [];
  if (selectedCells.length > 0) {
    cellIds = selectedCells
      .map((cell: { id?: string }) => cell.id)
      .filter(Boolean) as string[];
  } else {
    const cells = Array.from(
      editor.api.nodes({
        at: editor.selection ?? undefined,
        match: (n) =>
          (n as { type?: string }).type === KEYS.td ||
          (n as { type?: string }).type === KEYS.th,
      })
    );
    cellIds = cells
      .map(([node]) => (node as { id?: string }).id)
      .filter(Boolean) as string[];
  }

  if (cellIds.length === 0) {
    sendEvent({
      id: nanoid(),
      type: 'data-table',
      data: { cellUpdate: null, status: 'finished' },
    });
    sendEvent({ type: 'finish-step' });
    sendEvent({ type: 'finish' });
    sendRawEvent('[DONE]');
    return;
  }

  const userPrompt =
    body.messages?.at(-1)?.parts?.find((p: any) => p.type === 'text')?.text ||
    'Update cell content';

  const prompt = `You are a table data assistant. Update the following table cell IDs based on the user instruction.
User instruction: "${userPrompt}"

Cell IDs: ${JSON.stringify(cellIds)}

Return ONLY a JSON array of objects:
[
  { "id": "cell-id", "content": "updated text" }
]
Do not wrap in backticks.`;

  const geminiRes = await fetchGeminiWithFallback({
    apiKey,
    preferredModel: model,
    body: {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    },
    signal,
    stream: false,
  });

  if (!geminiRes.ok) {
    sendEvent({
      id: nanoid(),
      type: 'data-table',
      data: { cellUpdate: null, status: 'finished' },
    });
    sendEvent({ type: 'finish-step' });
    sendEvent({ type: 'finish' });
    sendRawEvent('[DONE]');
    return;
  }

  const data = await geminiRes.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

  let updates: Array<{ id: string; content: string }> = [];
  try {
    updates = JSON.parse(cleanJson);
  } catch {
    updates = [];
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    sendEvent({
      id: nanoid(),
      type: 'data-table',
      data: { cellUpdate: null, status: 'finished' },
    });
    sendEvent({ type: 'finish-step' });
    sendEvent({ type: 'finish' });
    sendRawEvent('[DONE]');
    return;
  }

  for (const u of updates) {
    sendEvent({
      id: nanoid(),
      type: 'data-table',
      data: {
        cellUpdate: { id: u.id, content: u.content },
        status: 'streaming',
      },
    });
  }

  sendEvent({
    id: nanoid(),
    type: 'data-table',
    data: { cellUpdate: null, status: 'finished' },
  });
  sendEvent({ type: 'finish-step' });
  sendEvent({ type: 'finish' });
  sendRawEvent('[DONE]');
}

export async function generateGeminiCopilot({
  prompt,
  instructions,
  model,
  signal,
}: {
  prompt: string;
  instructions?: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const apiKey = readKey();
  if (!apiKey) return '';

  const cleanModel = model || readModel() || DEFAULT_PLATE_MODEL;

  try {
    const res = await fetchGeminiWithFallback({
      apiKey,
      preferredModel: cleanModel,
      body: {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        systemInstruction: instructions
          ? { parts: [{ text: instructions }] }
          : undefined,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 60,
          stopSequences: ['\n'],
        },
      },
      signal,
      stream: false,
    });

    if (!res.ok) return '';

    const data = await res.json();
    const candidateText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    if (!candidateText || candidateText === '0' || candidateText === '""') {
      return '';
    }

    return candidateText;
  } catch {
    return '';
  }
}
