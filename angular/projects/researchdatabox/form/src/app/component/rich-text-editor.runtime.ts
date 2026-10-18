// Runtime-only editor dependencies. Keep the synchronous field/model dictionary lightweight.
import { type AnyExtension } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import type { RichTextEditorOutputFormatType } from '@researchdatabox/sails-ng-common';

export { Editor } from '@tiptap/core';

export function buildExtensions(outputFormat: RichTextEditorOutputFormatType): AnyExtension[] {
  const extensions: AnyExtension[] = [
    StarterKit,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
  ];
  if (outputFormat === 'markdown') {
    extensions.push(Markdown);
  }
  return extensions;
}
