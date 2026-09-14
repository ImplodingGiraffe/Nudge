'use client';

import * as React from 'react';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';

import { exportToDocx } from '@platejs/docx-io';
import { MarkdownPlugin } from '@platejs/markdown';
import { ArrowDownToLineIcon } from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { PDFDocument } from 'pdf-lib';
import type { SlatePlugin } from 'platejs';
import { createSlateEditor } from 'platejs';
import { useEditorRef } from 'platejs/react';
import { serializeHtml } from 'platejs/static';

import { BaseEditorKit } from '@/components/editor/editor-base-kit';
import { DocxExportKit } from '@/components/editor/plugins/docx-export-kit';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { EditorStatic } from './editor-static';
import { ToolbarButton } from './toolbar';

function isLightColor(colorStr: string): boolean {
  if (!colorStr) return false;

  const color = colorStr.trim().toLowerCase();
  if (color === '#fff' || color === '#ffffff' || color === 'white') {
    return true;
  }

  if (color.startsWith('#')) {
    const hex = color.slice(1);
    let r = 0;
    let g = 0;
    let b = 0;

    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length >= 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.68;
  }

  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.68;
  }

  return false;
}

function isDarkColor(colorStr: string): boolean {
  if (!colorStr) return false;

  const color = colorStr.trim().toLowerCase();
  if (color === '#000' || color === '#000000' || color === 'black') {
    return true;
  }

  if (color.startsWith('#')) {
    const hex = color.slice(1);
    let r = 0;
    let g = 0;
    let b = 0;

    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length >= 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.35;
  }

  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.35;
  }

  return false;
}

function sanitizeNodesForExport(nodes: any[]): any[] {
  if (!Array.isArray(nodes)) return nodes;

  return nodes.map((node) => {
    if (!node || typeof node !== 'object') return node;

    const clone: any = { ...node };

    if (typeof clone.text === 'string') {
      if (clone.color && isLightColor(clone.color)) {
        delete clone.color;
      }
      if (clone.backgroundColor && isDarkColor(clone.backgroundColor)) {
        delete clone.backgroundColor;
      }
      return clone;
    }

    if (clone.backgroundColor && isDarkColor(clone.backgroundColor)) {
      clone.backgroundColor = '#f4f4f5';
    }
    if (clone.background && isDarkColor(clone.background)) {
      delete clone.background;
    }

    if (Array.isArray(clone.children)) {
      clone.children = sanitizeNodesForExport(clone.children);
    }

    return clone;
  });
}

const lightExportVariables = `
  --c-bg: #ffffff !important;
  --c-surface: #ffffff !important;
  --c-surface-2: #f4f4f5 !important;
  --c-sunken: #e4e4e7 !important;
  --c-ink: #111827 !important;
  --c-ink-2: #374151 !important;
  --c-ink-3: #6b7280 !important;
  --c-line: #e5e7eb !important;
  --c-line-2: #d1d5db !important;
  --c-accent: #2563eb !important;
  --background: #ffffff !important;
  --foreground: #111827 !important;
  --card: #ffffff !important;
  --card-foreground: #111827 !important;
  --popover: #ffffff !important;
  --popover-foreground: #111827 !important;
  --primary: #111827 !important;
  --primary-foreground: #ffffff !important;
  --secondary: #f4f4f5 !important;
  --secondary-foreground: #111827 !important;
  --muted: #f4f4f5 !important;
  --muted-foreground: #6b7280 !important;
  --border: #e5e7eb !important;
  --highlight: #fef08a !important;
  color-scheme: light !important;
`;

const lightCanvasStyles = `
  :root, html, body {
    ${lightExportVariables}
  }
  [contenteditable="true"] {
    background-color: #ffffff !important;
    color: #111827 !important;
    font-family: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
    white-space: normal !important;
    word-break: normal !important;
    overflow-wrap: break-word !important;
    letter-spacing: 0px !important;
    word-spacing: normal !important;
    font-kerning: none !important;
    font-variant-ligatures: none !important;
    text-rendering: geometricPrecision !important;
    line-height: 1.6 !important;
  }
  [contenteditable="true"] * {
    border-color: #e5e7eb !important;
  }
  [contenteditable="true"] p,
  [contenteditable="true"] li,
  [contenteditable="true"] span,
  [contenteditable="true"] div,
  [contenteditable="true"] h1,
  [contenteditable="true"] h2,
  [contenteditable="true"] h3,
  [contenteditable="true"] h4,
  [contenteditable="true"] h5,
  [contenteditable="true"] h6 {
    color: #111827 !important;
    white-space: normal !important;
    letter-spacing: 0px !important;
    word-spacing: normal !important;
    font-kerning: none !important;
    font-variant-ligatures: none !important;
    font-family: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
  }
  [contenteditable="true"] p,
  [contenteditable="true"] li,
  [contenteditable="true"] td,
  [contenteditable="true"] th,
  [contenteditable="true"] blockquote {
    white-space: normal !important;
    letter-spacing: 0px !important;
    word-spacing: normal !important;
    font-kerning: none !important;
    font-variant-ligatures: none !important;
    font-family: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
    line-height: 1.6 !important;
  }
  [contenteditable="true"] pre {
    background-color: #f8fafc !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 8px !important;
  }
  [contenteditable="true"] code {
    background-color: #f1f5f9 !important;
    color: #0f172a !important;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  }
  [contenteditable="true"] pre code {
    background-color: transparent !important;
    color: inherit !important;
  }
  [contenteditable="true"] blockquote {
    border-left-color: #d1d5db !important;
    color: #4b5563 !important;
    background-color: #f9fafb !important;
  }
  [contenteditable="true"] table {
    background-color: #ffffff !important;
  }
  [contenteditable="true"] th,
  [contenteditable="true"] td {
    border-color: #e5e7eb !important;
    background-color: #ffffff !important;
    color: #111827 !important;
  }
  [contenteditable="true"] th {
    background-color: #f9fafb !important;
  }
  [contenteditable="true"] a {
    color: #2563eb !important;
  }
  [contenteditable="true"] .bg-muted {
    background-color: #f4f4f5 !important;
  }
  [contenteditable="true"] .text-muted-foreground {
    color: #6b7280 !important;
  }
  [data-slate-placeholder] {
    display: none !important;
  }
`;

const lightHtmlStyles = `
  :root {
    ${lightExportVariables}
  }
  *, *::before, *::after {
    box-sizing: border-box;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background-color: #ffffff !important;
    color: #111827 !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
    font-size: 16px !important;
    line-height: 1.65 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .export-wrapper {
    max-width: 800px;
    margin: 0 auto;
    padding: 48px 24px;
    background-color: #ffffff !important;
  }
  .export-wrapper, .export-wrapper * {
    color: #111827;
  }
  h1, h2, h3, h4, h5, h6 {
    color: #111827 !important;
    font-weight: 700 !important;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    line-height: 1.25;
  }
  h1 { font-size: 2.25em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
  h2 { font-size: 1.75em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25em; }
  h3 { font-size: 1.35em; }
  h4 { font-size: 1.15em; }
  p {
    color: #1f2937 !important;
    margin: 0.8em 0;
  }
  a {
    color: #2563eb !important;
    text-decoration: underline;
  }
  ul, ol {
    padding-left: 2em;
    margin: 0.8em 0;
    color: #1f2937 !important;
  }
  li {
    margin: 0.3em 0;
  }
  blockquote {
    margin: 1.2em 0;
    padding: 12px 20px;
    border-left: 4px solid #d1d5db !important;
    background-color: #f9fafb !important;
    color: #4b5563 !important;
    border-radius: 0 6px 6px 0;
  }
  pre {
    background-color: #f8fafc !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 8px !important;
    padding: 16px !important;
    overflow-x: auto !important;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
    font-size: 0.9em !important;
    line-height: 1.5 !important;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
    background-color: #f1f5f9 !important;
    color: #0f172a !important;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 0.88em;
  }
  pre code {
    background-color: transparent !important;
    padding: 0 !important;
    color: inherit !important;
  }
  table {
    border-collapse: collapse !important;
    width: 100% !important;
    margin: 1.5em 0 !important;
  }
  th, td {
    border: 1px solid #e5e7eb !important;
    padding: 10px 14px !important;
    color: #111827 !important;
    background-color: #ffffff !important;
    text-align: left;
  }
  th {
    background-color: #f8fafc !important;
    font-weight: 600 !important;
  }
  hr {
    border: none !important;
    border-top: 1px solid #e5e7eb !important;
    margin: 2em 0 !important;
  }
  .bg-muted {
    background-color: #f4f4f5 !important;
    border-radius: 6px;
  }
  .text-muted-foreground {
    color: #71717a !important;
  }
  [data-slate-placeholder] {
    display: none !important;
  }
`;

export function ExportToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  const getCanvas = async () => {
    const editorDom = editor.api.toDOMNode(editor);

    if (!editorDom) {
      throw new Error('Editor element not found');
    }

    return html2canvas(editorDom, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      onclone: (clonedDoc: Document) => {
        const roots = [clonedDoc.documentElement, clonedDoc.body];

        for (const root of roots) {
          root.classList.remove('theme-dark', 'theme-light', 'dark');
          root.removeAttribute('data-palette');
          root.removeAttribute('data-theme');
          root.style.background = '#ffffff';
          root.style.color = '#111827';
          root.style.colorScheme = 'light';
        }

        clonedDoc
          .querySelectorAll('[data-palette], [data-theme], .theme-dark, .theme-light, .dark')
          .forEach((element) => {
            element.removeAttribute('data-palette');
            element.removeAttribute('data-theme');
            element.classList.remove('theme-dark', 'theme-light', 'dark');
          });

        const printStyle = clonedDoc.createElement('style');
        printStyle.textContent = lightCanvasStyles;
        clonedDoc.head.appendChild(printStyle);

        const editorElement = clonedDoc.querySelector(
          '[contenteditable="true"]'
        ) as HTMLElement | null;

        if (editorElement) {
          editorElement.style.backgroundColor = '#ffffff';
          editorElement.style.color = '#111827';
          editorElement.style.fontFamily =
            'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
          editorElement.style.whiteSpace = 'normal';
          editorElement.style.letterSpacing = '0px';
          editorElement.style.fontKerning = 'none';

          editorElement.querySelectorAll('*').forEach((element) => {
            const htmlElement = element as HTMLElement;
            const isCodeElement =
              htmlElement.tagName === 'PRE' || htmlElement.tagName === 'CODE';

            if (
              htmlElement.style.fontFamily.includes('-apple-system') ||
              htmlElement.style.fontFamily.includes('BlinkMacSystemFont')
            ) {
              htmlElement.style.fontFamily = isCodeElement
                ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
                : 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
            }

            if (!isCodeElement) {
              htmlElement.style.whiteSpace = 'normal';
              htmlElement.style.letterSpacing = '0px';
              htmlElement.style.fontKerning = 'none';
            }

            if (htmlElement.style.color && isLightColor(htmlElement.style.color)) {
              htmlElement.style.color = '#111827';
            }
            if (
              htmlElement.style.backgroundColor &&
              isDarkColor(htmlElement.style.backgroundColor)
            ) {
              htmlElement.style.backgroundColor = '#f4f4f5';
            }
          });
        }
      },
    });
  };

  const downloadFile = async (url: string, filename: string) => {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  const exportToPdf = async () => {
    const canvas = await getCanvas();
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([canvas.width, canvas.height]);
    const imageEmbed = await pdfDoc.embedPng(canvas.toDataURL('PNG'));
    const { height, width } = imageEmbed.scale(1);

    page.drawImage(imageEmbed, { height, width, x: 0, y: 0 });

    const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: true });
    await downloadFile(pdfBase64, 'plate.pdf');
  };

  const exportToImage = async () => {
    const canvas = await getCanvas();
    await downloadFile(canvas.toDataURL('image/png'), 'plate.png');
  };

  const exportToHtml = async () => {
    const sanitizedNodes = sanitizeNodesForExport(editor.children);
    const editorStatic = createSlateEditor({
      plugins: BaseEditorKit,
      value: sanitizedNodes,
    });

    const editorHtml = await serializeHtml(editorStatic, {
      editorComponent: EditorStatic,
      props: { style: { padding: '0', paddingBottom: '' } },
    });

    const katexCss = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.18/dist/katex.css" integrity="sha384-9PvLvaiSKCPkFKB1ZsEoTjgnJn+O3KvEwtsz37/XrkYft3DTk2gHdYvd9oWgW3tV" crossorigin="anonymous">`;
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    ${katexCss}
    <style>
      ${lightHtmlStyles}
    </style>
  </head>
  <body>
    <div class="export-wrapper">
      ${editorHtml}
    </div>
  </body>
</html>`;

    const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await downloadFile(url, 'plate.html');
  };

  const exportToMarkdown = async () => {
    const md = editor.getApi(MarkdownPlugin).markdown.serialize();
    const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`;
    await downloadFile(url, 'plate.md');
  };

  const exportToWord = async () => {
    const sanitizedNodes = sanitizeNodesForExport(editor.children);
    const blob = await exportToDocx(sanitizedNodes, {
      editorPlugins: [...BaseEditorKit, ...DocxExportKit] as SlatePlugin[],
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plate.docx';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip="Export" isDropdown>
          <ArrowDownToLineIcon className="size-4" />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={exportToHtml}>
            Export as HTML
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportToPdf}>
            Export as PDF
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportToImage}>
            Export as Image
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportToMarkdown}>
            Export as Markdown
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportToWord}>
            Export as Word
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}