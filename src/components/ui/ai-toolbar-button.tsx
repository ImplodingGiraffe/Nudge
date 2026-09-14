'use client';

import * as React from 'react';

import { AIChatPlugin } from '@platejs/ai/react';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import { useEditorPlugin } from 'platejs/react';

import { ToolbarButton } from './toolbar';

export function AIToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>
) {
  const { api, editor } = useEditorPlugin(AIChatPlugin);
  const selectionRef = React.useRef<typeof editor.selection>(null);
  const blockSelectionRef = React.useRef<string[] | null>(null);

  return (
    <ToolbarButton
      {...props}
      onClick={() => {
        if (blockSelectionRef.current) {
          editor
            .getApi(BlockSelectionPlugin)
            .blockSelection.set(blockSelectionRef.current);
        } else if (selectionRef.current) {
          editor.tf.setSelection(selectionRef.current);
        }
        blockSelectionRef.current = null;
        selectionRef.current = null;
        api.aiChat.show();
      }}
      onMouseDown={(e) => {
        const blockSelection = editor
          .getApi(BlockSelectionPlugin)
          .blockSelection.getNodes({ sort: true });

        blockSelectionRef.current =
          blockSelection.length > 0
            ? blockSelection.map(([node]) => node.id as string)
            : null;

        selectionRef.current =
          blockSelectionRef.current || !editor.selection
            ? null
            : {
                anchor: {
                  path: [...editor.selection.anchor.path],
                  offset: editor.selection.anchor.offset,
                },
                focus: {
                  path: [...editor.selection.focus.path],
                  offset: editor.selection.focus.offset,
                },
              };
        e.preventDefault();
      }}
    />
  );
}
