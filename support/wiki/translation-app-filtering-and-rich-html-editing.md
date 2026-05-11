# Translation App Filtering And Rich HTML Editing

## Summary

Add two features to the embedded Angular translation admin app:

1. A single text filter that matches translation `key` or `value`.
2. A Tiptap-based rich text editor in the edit modal, with a raw HTML source toggle so users can still hand-edit exact markup when needed.

The implementation stays inside the existing standalone translation app at `angular/projects/researchdatabox/translation/src/app/translation.component.*` and reuses the already-pinned Angular Tiptap dependencies from `angular/package.json`.

## Current State

- Translation app is a standalone Angular component:
  - `angular/projects/researchdatabox/translation/src/app/translation.component.ts`
  - `angular/projects/researchdatabox/translation/src/app/translation.component.html`
  - `angular/projects/researchdatabox/translation/src/app/translation.component.spec.ts`
- Current list features:
  - language selection
  - category filtering
  - sortable category/key/value columns
  - edit modal with raw `<textarea>`
- Tiptap is already installed in `angular/package.json`:
  - `@tiptap/core`
  - `@tiptap/starter-kit`
  - `@tiptap/extension-table`
  - `@tiptap/extension-table-row`
  - `@tiptap/extension-table-header`
  - `@tiptap/extension-table-cell`
  - `ngx-tiptap`
- Existing form rich text editor cannot be reused directly because it extends ReDBox form component infrastructure. The translation app should reuse the same Tiptap libraries and behavior patterns instead.

## Public Interfaces And Types

No backend API changes.

No database/model changes.

Angular component state additions:

```ts
filterText = '';

richTextEditor: Editor | null = null;
isHtmlSourceMode = false;
htmlSourceValue = '';
```

Optional helper type to reduce repeated inline types:

```ts
type TranslationEntry = {
  key: string;
  value: any;
  description?: string;
  category?: string;
};
```

The existing `entries` and `viewEntries` signals can be updated to use this type.

## Filtering Behavior

Use one search box labeled `Filter by key or value`.

Filtering rules:

- Case-insensitive.
- Trims leading/trailing whitespace.
- Empty filter means show all entries for the selected category.
- Match if either:
  - `entry.key` contains the filter text, or
  - `String(entry.value ?? '')` contains the filter text.
- Category filtering and text filtering both apply.
- Sorting applies after filtering.
- Filtering does not mutate `entries`; it only recalculates `viewEntries`.

Implementation details:

- Add `filterText = ''` to the component.
- Add `onFilterTextChange()` that calls `refreshDerived()`.
- In `refreshDerived()`:
  1. Start from `this.entries()`.
  2. Apply category filter if `selectedCategory` is set.
  3. Apply text filter if `filterText.trim()` is non-empty.
  4. Sort the filtered result.
  5. Set `viewEntries`.
- The filter should preserve current sort column/direction.

HTML placement:

- Add the search box in the existing Manage Translations filter row beside or below category filtering.
- Use Bootstrap-compatible markup already used in the file:
  - `form-label`
  - `form-control`
  - `row g-3 mb-3`
  - `col-md-6`
- Add a small clear button only if `filterText` is non-empty:
  - button text: `Clear`
  - action: set `filterText = ''` and refresh.

## Rich Text Editing Behavior

Use Tiptap in the edit modal by default, plus a raw HTML source toggle.

Editor behavior:

- Opening an entry:
  - Set `editKey`, `editValue`, `editDescription`.
  - Initialize `htmlSourceValue = String(entry.value ?? '')`.
  - Create a new Tiptap `Editor` with `content: htmlSourceValue`.
  - Set `isHtmlSourceMode = false`.
  - Open modal.
- Rich text mode:
  - Render `<div tiptapEditor [editor]="richTextEditor"></div>`.
  - Tiptap updates `editValue` and `htmlSourceValue` via `editor.getHTML()`.
- HTML source mode:
  - Render `<textarea [(ngModel)]="htmlSourceValue">`.
  - On every source change, update `editValue`.
  - When switching back to rich text mode, call `editor.commands.setContent(htmlSourceValue, { contentType: 'html' })`.
- Saving:
  - Save `htmlSourceValue` when source mode is active.
  - Save `richTextEditor.getHTML()` when rich text mode is active.
  - Keep the existing `svc.setEntry(..., { value })` API.
  - Update local `entries` with the saved value.
- Closing modal:
  - Destroy the editor.
  - Null out `richTextEditor`.
  - Close modal.

Tiptap extensions:

```ts
StarterKit,
Table.configure({ resizable: true }),
TableRow,
TableHeader,
TableCell
```

Imports to add in `translation.component.ts`:

```ts
import { OnDestroy } from '@angular/core';
import { Editor, type AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { TiptapEditorDirective } from 'ngx-tiptap';
```

Update standalone `imports`:

```ts
imports: [CommonModule, FormsModule, HttpClientModule, TiptapEditorDirective]
```

Lifecycle:

- Change class to `implements OnInit, OnDestroy`.
- Add `ngOnDestroy()` to destroy `richTextEditor`.

Toolbar:

Add a compact toolbar above the editor:

- Bold
- Italic
- Heading
- Bullet list
- Ordered list
- Link
- Table
- Undo
- Redo
- Toggle HTML source

Use the same Tiptap command style as the form app:

```ts
this.richTextEditor.chain().focus().toggleBold().run();
```

Link behavior:

- Use the same pragmatic prompt-based flow as the form app:
  - Prompt for URL.
  - Empty string removes link.
  - Non-empty string applies/toggles link.

Modal layout:

- Replace the current raw `textarea` value field with:
  - toolbar row
  - either raw textarea or Tiptap editor surface
- Keep the key field disabled.
- Keep the description text below the editor.
- Keep existing Save/Cancel buttons.

Styling:

Add component styles for:

- `.translation-rich-text-toolbar`
- `.translation-rich-text-editor .ProseMirror`
- `.translation-rich-text-source`
- table borders inside editor and preview/content

Use the existing form rich text editor styles as the source pattern, scoped to translation class names.

## Edge Cases

- Empty value should open as an empty editor and save as `''`, not `<p></p>`.
- Non-string values should be converted using `String(value ?? '')` for editing and filtering.
- Existing raw HTML should round-trip through source mode unchanged unless the user switches to rich text mode and edits it.
- If Tiptap initialization throws, fall back to source textarea so the user can still edit/save.
- Destroy and recreate the editor for each opened entry to prevent stale content.
- Filtering should work on HTML strings as stored, not rendered text, because the user asked for value string filtering.

## Tests

Update `translation.component.spec.ts`.

Add unit coverage for filtering:

1. Empty filter shows all entries after category rules.
2. Filter matches by key case-insensitively.
3. Filter matches by value case-insensitively.
4. Category filter and text filter combine.
5. Sorting still applies after text filtering.
6. Clear filter restores the category-filtered list.

Add unit coverage for rich editor behavior:

1. `openEdit()` initializes modal state, `htmlSourceValue`, and a Tiptap editor.
2. Source-mode edits update the value saved through `setEntry`.
3. Rich-text editor updates are reflected in saved HTML.
4. `closeModal()` destroys the editor and closes the modal.
5. `ngOnDestroy()` destroys any active editor.
6. If editor creation fails, source editing still works.

Testing command:

```sh
cd angular
npm test -- @researchdatabox/translation
```

If Chrome sandbox issues appear in the environment, use the repo helper:

```sh
support/unit-testing/angular/testDevAngular.sh @researchdatabox/translation
```

## Acceptance Criteria

- Admin users can type one search string and see entries whose key or value contains it.
- The search works alongside the existing category filter and sort controls.
- Editing a translation value opens a rich text editor by default.
- Users can switch to raw HTML source mode and save exact HTML.
- Existing translation save flow and API payload shape remain unchanged.
- Unit tests cover filtering and editor lifecycle/save behavior.
- No dependency version changes are made.
- No backend/controller/service changes are required.

## Assumptions And Defaults

- Filter UI: one search box matching either key or value.
- Editor UI: rich text editor by default with a raw HTML toggle.
- Stored format: HTML string.
- Existing `setEntry` API remains authoritative.
- The translation app should have its own Tiptap editor implementation rather than importing the form app’s `RichTextEditorComponent`, because the form component depends on form field model infrastructure.
