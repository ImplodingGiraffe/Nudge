'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { normalizeStaticValue, type Value, NodeApi } from 'platejs';
import { Plate, usePlateEditor } from 'platejs/react';
import { EditorKit } from '@/components/editor/editor-kit';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { TooltipProvider } from '@/components/ui/tooltip';
import { prewarmMediaFromText } from '@/lib/media-storage';
import { cx } from '../../lib/ui';

export interface PlateEditorProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  className?: string;
  onStatsChange?: (stats: { words: number; chars: number; readingMin: number }) => void;
}

export function parseTextToPlate(text: string): Value {
  if (!text || !text.trim()) {
    return [{ type: 'p', children: [{ text: '' }] }];
  }

  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeStaticValue(parsed);
      }
    } catch {}
  }

  const lines = text.split('\n');
  const nodes: any[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLang = 'javascript';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        nodes.push({
          type: 'code_block',
          lang: codeLang,
          children: codeLines.map((l) => ({ type: 'code_line', children: [{ text: l }] })),
        });
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.slice(3).trim() || 'javascript';
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith('### ')) {
      nodes.push({ type: 'h3', children: [{ text: line.slice(4) }] });
    } else if (line.startsWith('## ')) {
      nodes.push({ type: 'h2', children: [{ text: line.slice(3) }] });
    } else if (line.startsWith('# ')) {
      nodes.push({ type: 'h1', children: [{ text: line.slice(2) }] });
    } else if (line.startsWith('> ')) {
      nodes.push({ type: 'blockquote', children: [{ type: 'p', children: [{ text: line.slice(2) }] }] });
    } else if (/^- \[[ xX]\](?:\s.*)?$/.test(line)) {
      const checked = line.startsWith('- [x]') || line.startsWith('- [X]');
      const content = line.replace(/^- \[[ xX]\](?:\s)?/, '');
      nodes.push({
        type: 'action_item',
        checked,
        children: [{ text: content }],
      });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      nodes.push({
        type: 'p',
        indent: 1,
        listStyleType: 'disc',
        children: [{ text: line.slice(2) }],
      });
    } else if (/^\d+\.\s(.*)$/.test(line)) {
      const match = line.match(/^\d+\.\s(.*)$/);
      nodes.push({
        type: 'p',
        indent: 1,
        listStyleType: 'decimal',
        children: [{ text: match ? match[1] : '' }],
      });
    } else if (line.trim() === '---' || line.trim() === '***') {
      nodes.push({ type: 'hr', children: [{ text: '' }] });
    } else {
      nodes.push({ type: 'p', children: [{ text: line }] });
    }
  }

  if (inCodeBlock && codeLines.length) {
    nodes.push({
      type: 'code_block',
      lang: codeLang,
      children: codeLines.map((l) => ({ type: 'code_line', children: [{ text: l }] })),
    });
  }

  return normalizeStaticValue(
    nodes.length ? nodes : [{ type: 'p', children: [{ text: '' }] }],
  );
}

export function plateValueToText(nodes: Value): string {
  return JSON.stringify(nodes);
}

function computeStats(nodes: Value) {
  const fullText = nodes
    .map((node) => {
      try {
        return NodeApi.string(node);
      } catch {
        return '';
      }
    })
    .join('\n');
  const raw = fullText.trim();
  const words = raw ? raw.split(/\s+/).filter(Boolean).length : 0;
  const chars = raw.length;
  const readingMin = Math.max(1, Math.ceil(words / 200));
  return { words, chars, readingMin };
}

export function PlateEditor({
  value,
  onChange,
  placeholder = 'Type / for commands, ⌘+J for AI...',
  readOnly = false,
  autoFocus = false,
  className,
  onStatsChange,
}: PlateEditorProps) {

  const initialValue = useMemo(() => {
    return parseTextToPlate(value);

  }, []);

  const editor = usePlateEditor({
    plugins: EditorKit,
    value: initialValue,
  });

  const lastEmittedTextRef = useRef(value);
  const latestValueRef = useRef<Value | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onStatsChangeRef = useRef(onStatsChange);
  onStatsChangeRef.current = onStatsChange;

  const saveTimerRef = useRef<number | null>(null);
  const statsTimerRef = useRef<number | null>(null);

  useEffect(() => {
    prewarmMediaFromText(value);

  }, []);

  useEffect(() => {
    if (onStatsChangeRef.current && initialValue) {
      onStatsChangeRef.current(computeStats(initialValue));
    }
  }, [initialValue]);

  useEffect(() => {
    if (value !== lastEmittedTextRef.current) {
      lastEmittedTextRef.current = value;
      try {
        const parsed = parseTextToPlate(value);
        if (editor && editor.tf) {
          editor.tf.setValue(parsed);
          if (onStatsChangeRef.current) {
            onStatsChangeRef.current(computeStats(parsed));
          }
        }
      } catch (err) {
        console.warn('Failed to apply external value to Plate editor:', err);
      }
    }
  }, [value, editor]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (statsTimerRef.current) {
        clearTimeout(statsTimerRef.current);
      }
      if (latestValueRef.current) {
        const text = plateValueToText(latestValueRef.current);
        if (text !== lastEmittedTextRef.current) {
          lastEmittedTextRef.current = text;
          onChangeRef.current(text);
        }
      }
    };
  }, []);

  const handleValueChange = useCallback(
    ({ value: newValue }: { value: Value }) => {
      if (readOnly) return;
      latestValueRef.current = newValue;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        if (!latestValueRef.current) return;
        const text = plateValueToText(latestValueRef.current);
        if (text !== lastEmittedTextRef.current) {
          lastEmittedTextRef.current = text;
          onChangeRef.current(text);
        }
      }, 400);

      if (onStatsChangeRef.current) {
        if (statsTimerRef.current) clearTimeout(statsTimerRef.current);
        statsTimerRef.current = window.setTimeout(() => {
          if (latestValueRef.current && onStatsChangeRef.current) {
            onStatsChangeRef.current(computeStats(latestValueRef.current));
          }
        }, 600);
      }
    },
    [readOnly]
  );

  return (
    <TooltipProvider>
      <div className={cx('flex flex-col h-full min-h-0 bg-surface text-ink relative', className)}>
        <Plate editor={editor} onValueChange={handleValueChange} readOnly={readOnly}>
          <EditorContainer variant="default" className="h-full min-h-0 bg-surface">
            <Editor
              variant="none"
              placeholder={placeholder}
              autoFocus={autoFocus}
              disabled={readOnly}
              className="size-full max-w-5xl mx-auto px-6 sm:px-10 lg:px-12 pt-4 pb-48 text-base leading-relaxed focus:outline-none min-h-[500px]"
            />
          </EditorContainer>
        </Plate>
      </div>
    </TooltipProvider>
  );
}
