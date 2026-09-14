import {
  type Descendant,
  type TElement,
  ElementApi,
  KEYS,
  nanoid,
  NodeApi,
  TextApi,
} from 'platejs';
import type { PlateEditor } from 'platejs/react';
import { AIChatPlugin } from '@platejs/ai/react';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import {
  BaseSuggestionPlugin,
  diffToSuggestions,
  getTransientSuggestionKey,
  SkipSuggestionDeletes,
} from '@platejs/suggestion';
import { deserializeMd } from '@platejs/markdown';

export interface ExtractedLink {
  text: string;
  node: TElement;
}

export function getCommonPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  return a.slice(0, i);
}

export function getCommonSuffix(a: string, b: string): string {
  let i = 0;
  while (
    i < a.length &&
    i < b.length &&
    a[a.length - 1 - i] === b[b.length - 1 - i]
  ) {
    i++;
  }
  return a.slice(a.length - i);
}

export function alignPunctuation(aiText: string, originalText: string): string {
  if (!aiText || !originalText) return aiText;
  let result = aiText;

  if (originalText.includes('–')) {
    result = result.replace(/(\d+)-(\d+)/g, (match, p1, p2) => {
      if (originalText.includes(`${p1}–${p2}`)) {
        return `${p1}–${p2}`;
      }
      return match;
    });
  }

  if (originalText.includes('—')) {
    result = result.replace(/--/g, '—');
  }

  if (originalText.includes('ˈ')) {
    const ipaWords = originalText.match(/\/[^/]+\//g) || [];
    for (const ipa of ipaWords) {
      const asciiVariant = ipa.replaceAll('ˈ', "'");
      if (result.includes(asciiVariant)) {
        result = result.replaceAll(asciiVariant, ipa);
      }
    }
  }

  if (originalText.includes('[1]') || originalText.includes('[2]')) {
    result = result.replace(/\[\\\[(\d+)\\\]\]/g, '[$1]');
  }

  return result;
}

export function extractLinks(nodes: Descendant[]): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const walk = (node: Descendant) => {
    if (ElementApi.isElement(node)) {
      if (node.type === 'a' || node.type === KEYS.a) {
        const text = NodeApi.string(node).trim();
        const isCitation = /^\[\d+\]$/.test(text) || /^\/[^/]+\/$/.test(text);
        const isMultiWord = text.includes(' ') || text.includes('-');
        if (text && (isMultiWord || isCitation)) {
          links.push({ node, text });
        }
      }
      node.children?.forEach(walk);
    }
  };

  nodes.forEach(walk);

  return links.sort((a, b) => b.text.length - a.text.length);
}

export function restoreLinksInNodes(
  nodes: Descendant[],
  links: ExtractedLink[]
): Descendant[] {
  if (!links.length) return nodes;

  const usedLinks = new Set<ExtractedLink>();

  const processNodes = (nodeList: Descendant[]): Descendant[] => {
    return nodeList.map((node) => {
      if (ElementApi.isElement(node)) {

        if (node.type === 'a' || node.type === KEYS.a) {
          return node;
        }

        const newChildren: Descendant[] = [];

        for (const child of node.children || []) {
          if (TextApi.isText(child)) {
            let segments: Array<Descendant & { _isLink?: boolean }> = [{ ...child }];

            for (const linkItem of links) {
              if (usedLinks.has(linkItem)) continue;
              const { node: originalLink, text: linkText } = linkItem;

              const nextSegments: Array<Descendant & { _isLink?: boolean }> = [];
              let matched = false;

              for (const seg of segments) {
                if (
                  !matched &&
                  TextApi.isText(seg) &&
                  !seg._isLink &&
                  seg.text.includes(linkText)
                ) {
                  const parts = seg.text.split(linkText);
                  for (let i = 0; i < parts.length; i++) {
                    if (parts[i]) {
                      nextSegments.push({ ...seg, text: parts[i] });
                    }
                    if (i < parts.length - 1) {
                      nextSegments.push({
                        ...originalLink,
                        _isLink: true,
                        children: [{ text: linkText }],
                      } as any);
                    }
                  }
                  matched = true;
                  usedLinks.add(linkItem);
                } else {
                  nextSegments.push(seg);
                }
              }

              segments = nextSegments;
            }

            segments.forEach((s) => {
              const copy = { ...s };
              delete copy._isLink;
              newChildren.push(copy);
            });
          } else if (ElementApi.isElement(child)) {
            newChildren.push(processNodes([child])[0]);
          } else {
            newChildren.push(child);
          }
        }

        return {
          ...node,
          children: newChildren,
        };
      }

      return node;
    });
  };

  return processNodes(nodes);
}

export function cleanSuggestionNode<T extends Descendant>(node: T): T {
  const clean: any = { ...node };
  delete clean.suggestion;
  delete clean.diff;
  delete clean.diffOperation;

  Object.keys(clean).forEach((k) => {
    if (k.startsWith(`${KEYS.suggestion}_`)) {
      delete clean[k];
    }
  });

  if (Array.isArray(clean.children)) {
    clean.children = clean.children.map((child: Descendant) =>
      cleanSuggestionNode(child)
    );
  }

  return clean;
}

export function refineAdjacentSuggestions(
  nodes: Descendant[],
  editor: PlateEditor
): Descendant[] {
  const api = editor.getApi(BaseSuggestionPlugin);

  return nodes.map((node) => {
    if (!ElementApi.isElement(node) || !node.children) return node;

    const newChildren: Descendant[] = [];

    for (let i = 0; i < node.children.length; i++) {
      const curr: any = node.children[i];
      const next: any = node.children[i + 1];

      if (curr?.suggestion && next?.suggestion) {
        const currData = api.suggestion.suggestionData(curr);
        const nextData = api.suggestion.suggestionData(next);

        const isPair =
          (currData?.type === 'remove' && nextData?.type === 'insert') ||
          (currData?.type === 'insert' && nextData?.type === 'remove');

        if (isPair) {
          const removeNode = currData.type === 'remove' ? curr : next;
          const insertNode = currData.type === 'insert' ? curr : next;

          const removeText = NodeApi.string(removeNode);
          const insertText = NodeApi.string(insertNode);

          if (removeText === insertText) {
            newChildren.push(cleanSuggestionNode(removeNode));
            i++;
            continue;
          }

          const commonPrefix = getCommonPrefix(removeText, insertText);
          const remainingRemoveAfterPrefix = removeText.slice(commonPrefix.length);
          const remainingInsertAfterPrefix = insertText.slice(commonPrefix.length);
          const commonSuffix = getCommonSuffix(
            remainingRemoveAfterPrefix,
            remainingInsertAfterPrefix
          );

          const coreRemoveText = remainingRemoveAfterPrefix.slice(
            0,
            remainingRemoveAfterPrefix.length - commonSuffix.length
          );
          const coreInsertText = remainingInsertAfterPrefix.slice(
            0,
            remainingInsertAfterPrefix.length - commonSuffix.length
          );

          if (commonPrefix.length > 0 || commonSuffix.length > 0) {

            if (commonPrefix.length > 0) {
              if (ElementApi.isElement(removeNode) && commonPrefix === removeText) {
                newChildren.push(cleanSuggestionNode(removeNode));
              } else {
                newChildren.push({ text: commonPrefix });
              }
            }

            if (coreRemoveText.length > 0) {
              if (TextApi.isText(removeNode)) {
                newChildren.push({ ...removeNode, text: coreRemoveText });
              } else {
                newChildren.push({
                  ...removeNode,
                  children: [{ text: coreRemoveText }],
                });
              }
            }

            if (coreInsertText.length > 0) {
              if (TextApi.isText(insertNode)) {
                newChildren.push({ ...insertNode, text: coreInsertText });
              } else {
                newChildren.push({
                  ...insertNode,
                  children: [{ text: coreInsertText }],
                });
              }
            }

            if (commonSuffix.length > 0) {
              if (ElementApi.isElement(removeNode) && commonSuffix === removeText) {
                newChildren.push(cleanSuggestionNode(removeNode));
              } else {
                newChildren.push({ text: commonSuffix });
              }
            }

            i++;
            continue;
          }
        }
      }

      if (ElementApi.isElement(curr) && curr.children) {
        newChildren.push(refineAdjacentSuggestions([curr], editor)[0]);
      } else {
        newChildren.push(curr);
      }
    }

    return {
      ...node,
      children: newChildren,
    };
  });
}

export const isSingleCellTable = (nodes: Descendant[]): boolean => {
  if (nodes.length !== 1) return false;
  const table = nodes[0] as any;
  if (table.type !== KEYS.table) return false;
  const rows = table.children;
  if (rows?.length !== 1) return false;
  const row = rows[0];
  if (row.type !== KEYS.tr) return false;
  const cells = row.children;
  if (cells?.length !== 1) return false;
  return cells[0].type === KEYS.td;
};

export const getTableCellChildren = (table: TElement): Descendant[] => {
  return (table as any).children[0].children[0].children;
};

export const withProps = (diffNodes: Descendant[], chatNodes: Descendant[]) =>
  diffNodes.map((node, index) => {
    if (!ElementApi.isElement(node)) return node;
    const originalNode = chatNodes?.[index];
    return {
      ...node,
      ...(originalNode ?? { id: nanoid() }),
      children: node.children,
    };
  });

export const withTransient = (diffNodes: Descendant[]): Descendant[] =>
  diffNodes.map((node) => {
    if (TextApi.isText(node)) {
      return {
        ...node,
        [getTransientSuggestionKey()]: true,
      };
    }
    return {
      ...node,
      children: withTransient((node as any).children),
      [getTransientSuggestionKey()]: true,
    };
  });

export const withoutSuggestionAndComments = (nodes: Descendant[]): Descendant[] =>
  nodes.map((node) => {
    if (TextApi.isText(node)) {
      if ((node as any)[KEYS.suggestion] || (node as any)[KEYS.comment]) {
        return { text: node.text };
      }
      return node;
    }
    if (ElementApi.isElement(node)) {
      if ((node as any)[KEYS.suggestion]) {
        const nodeWithoutSuggestion: any = {};
        Object.keys(node).forEach((key) => {
          if (key !== KEYS.suggestion && !key.startsWith(KEYS.suggestion)) {
            nodeWithoutSuggestion[key] = (node as any)[key];
          }
        });
        return {
          ...nodeWithoutSuggestion,
          children: withoutSuggestionAndComments(node.children),
        };
      }
      return {
        ...node,
        children: withoutSuggestionAndComments(node.children),
      };
    }
    return node;
  });

export function cleanAiContent(content: string): string {
  if (!content) return '';

  let cleaned = content.trim();
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
  cleaned = cleaned.replace(
    /^(?:Corrected|Edited|Revised|Improved) (?:text|version):\s*\n*/i,
    ''
  );

  return cleaned.trim();
}

export function getTargetChatNodes(editor: PlateEditor): Descendant[] {
  let chatNodes = withoutSuggestionAndComments(
    editor.getOption(AIChatPlugin, 'chatNodes') || []
  );

  if (isSingleCellTable(chatNodes)) {
    chatNodes = getTableCellChildren(chatNodes[0] as TElement);
  }

  if (chatNodes.length === 0) {
    if (editor.selection && editor.api.isExpanded()) {
      try {
        const fragment = editor.api.fragment();
        if (fragment.length > 0) {
          chatNodes = fragment.map((node: Descendant) =>
            ElementApi.isElement(node) ? node : { type: 'p', children: [node] }
          );
        }
      } catch {}
    }

    if (chatNodes.length > 0) {
      return chatNodes;
    }

    const selectedBlocks = editor
      .getApi(BlockSelectionPlugin)
      ?.blockSelection?.getNodes({ sort: true })
      ?.map(([node]) => node);

    if (selectedBlocks && selectedBlocks.length > 0) {
      chatNodes = selectedBlocks;
    } else {
      const blockEntry = editor.api.block({ highest: true });
      if (blockEntry && ElementApi.isElement(blockEntry[0])) {
        chatNodes = [blockEntry[0]];
      }
    }
  }

  return chatNodes;
}

export function isPartialTextSelection(
  editor: PlateEditor,
  chatNodes: Descendant[]
): boolean {
  if (!editor.selection || !editor.api.isExpanded() || chatNodes.length === 0) {
    return false;
  }

  let selectedText = '';
  try {
    selectedText = editor.api.string(editor.selection).trim();
  } catch {}
  if (!selectedText) return false;

  const blockEntry = editor.api.block({ highest: true });
  if (!blockEntry || !ElementApi.isElement(blockEntry[0])) return false;

  return selectedText !== NodeApi.string(blockEntry[0]).trim();
}

export function getSmartDiffNodes(editor: PlateEditor, aiContent: string): Descendant[] {
  const chatNodes = getTargetChatNodes(editor);

  const originalText = chatNodes.map((n) => NodeApi.string(n)).join('\n');
  const cleanedContent = cleanAiContent(aiContent);
  const alignedContent = alignPunctuation(cleanedContent, originalText);

  const links = extractLinks(chatNodes);

  const rawAiNodes = deserializeMd(editor, alignedContent);

  const relinkedAiNodes = restoreLinksInNodes(rawAiNodes, links);

  const aiNodes = withProps(relinkedAiNodes, chatNodes);

  const rawDiffNodes = diffToSuggestions(editor, chatNodes, aiNodes, {
    ignoreProps: ['id', 'listStart'],
  });

  const cleanDiffNodes = refineAdjacentSuggestions(rawDiffNodes, editor);

  return withTransient(cleanDiffNodes);
}

export function smartApplyAISuggestions(editor: PlateEditor, content: string): void {

  if (!content || !content.trim()) return;
  if (
    content.includes('Gemini error:') ||
    content.includes('API Key Required') ||
    content.startsWith('*(Gemini error')
  ) {
    console.warn('smartApplyAISuggestions skipped: content contains error string');
    return;
  }

  editor.getApi({ key: KEYS.cursorOverlay })?.cursorOverlay?.removeCursor('selection');

  const chatNodes = getTargetChatNodes(editor);

  if (chatNodes.length > 0) {
    if (isPartialTextSelection(editor, chatNodes)) {
      const diffNodes = getSmartDiffNodes(editor, content);
      editor.tf.insertFragment(diffNodes);

      const nodes = Array.from(
        editor.api.nodes({
          at: [],
          mode: 'lowest',
          match: (n) =>
            TextApi.isText(n) &&
            !!(n as any)[getTransientSuggestionKey()],
        })
      );

      if (nodes.length > 0) {
        const range = editor.api.nodesRange(nodes);
        if (range) {
          editor.tf.setSelection(range);
        }
      }
      return;
    }

    const setReplaceIds = (ids: string[]) => {
      editor.setOption(AIChatPlugin, '_replaceIds', ids);
    };

    const currentReplaceIds = (editor.getOption(AIChatPlugin, '_replaceIds') as string[]) || [];
    if (currentReplaceIds.length === 0) {
      setReplaceIds(
        chatNodes.map((node: any) => node.id).filter(Boolean)
      );
    }

    const diffNodes = getSmartDiffNodes(editor, content);
    const replaceIds =
      (editor.getOption(AIChatPlugin, '_replaceIds') as string[]) || [];
    const replaceNodes = Array.from(
      editor.api.nodes({
        at: [],
        match: (n) =>
          ElementApi.isElement(n) &&
          replaceIds.includes((n as any).id),
      })
    );

    replaceNodes.forEach(([node, path], index) => {
      const replaceNode = node as any;
      const diffNode = diffNodes[index] as any;
      if (!diffNode) return;

      const isSameString =
        SkipSuggestionDeletes(editor, replaceNode) ===
        SkipSuggestionDeletes(editor, diffNode);
      const isSameSuggestion =
        replaceNode.suggestion?.type === diffNode.suggestion?.type;

      if (isSameString && isSameSuggestion && replaceNode.id === diffNode.id) {
        return;
      }

      if (
        index === replaceNodes.length - 1 &&
        diffNodes.length > replaceNodes.length
      ) {
        editor.tf.replaceNodes(diffNodes.slice(index), { at: path });
      } else {
        editor.tf.replaceNodes(diffNode, { at: path });
      }
    });

    try {
      editor.getApi(BlockSelectionPlugin).blockSelection.set(
        diffNodes.map((node: any) => node.id)
      );
    } catch {}

    setReplaceIds(diffNodes.map((node: any) => node.id));
  } else {
    const diffNodes = getSmartDiffNodes(editor, content);
    editor.tf.insertFragment(diffNodes);

    const nodes = Array.from(
      editor.api.nodes({
        at: [],
        mode: 'lowest',
        match: (n) => TextApi.isText(n) && !!(n as any)[getTransientSuggestionKey()],
      })
    );

    if (nodes.length > 0) {
      const range = editor.api.nodesRange(nodes);
      if (range) {
        editor.tf.setSelection(range);
      }
    }
  }
}
