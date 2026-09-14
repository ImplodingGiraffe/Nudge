import { CalloutElementDocx } from '@/components/ui/callout-node-static';
import {
  CodeBlockElementDocx,
  CodeLineElementDocx,
  CodeSyntaxLeafDocx,
} from '@/components/ui/code-block-node-static';
import {
  ColumnElementDocx,
  ColumnGroupElementDocx,
} from '@/components/ui/column-node-static';
import {
  EquationElementDocx,
  InlineEquationElementDocx,
} from '@/components/ui/equation-node-static';
import { TocElementDocx } from '@/components/ui/toc-node-static';
import { DocxExportPlugin } from '@platejs/docx-io';
import { KEYS } from 'platejs';

export const DocxExportKit = [
  DocxExportPlugin.configure({
    override: {
      components: {
        [KEYS.codeBlock]: CodeBlockElementDocx,
        [KEYS.codeLine]: CodeLineElementDocx,
        [KEYS.codeSyntax]: CodeSyntaxLeafDocx,
        [KEYS.column]: ColumnElementDocx,
        [KEYS.columnGroup]: ColumnGroupElementDocx,
        [KEYS.equation]: EquationElementDocx,
        [KEYS.inlineEquation]: InlineEquationElementDocx,
        [KEYS.callout]: CalloutElementDocx,
        [KEYS.toc]: TocElementDocx,
      },
    },
  }),
];
