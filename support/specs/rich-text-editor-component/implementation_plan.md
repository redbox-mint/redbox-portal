# Migrate RichTextEditorComponent: CKEditor 5 → Tiptap

Replace CKEditor 5 with Tiptap as the rich text editor. This is a feature branch — breaking config changes are acceptable.

**Rationale:** CKEditor's GPL build renders a "Powered by CKEditor" badge.

---

## Proposed Changes

### sails-ng-common — Config Contracts

#### [MODIFY] [rich-text-editor.outline.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/component/rich-text-editor.outline.ts)

Remove CKEditor-specific properties from both `Frame` and `Outline` interfaces:
- `editorType` (and `RichTextEditorEditorType` type alias)
- `removePlugins`

Remaining config:

| Property | Type | Default | Description |
|---|---|---|---|
| `outputFormat` | `'html' \| 'markdown'` | `'html'` | Storage format |
| `toolbar` | `string[]` | *(see model)* | Toolbar buttons (Tiptap names) |
| `minHeight` | `string` | `'200px'` | CSS min-height |
| `placeholder` | `string` | `''` | Placeholder text |

#### [MODIFY] [rich-text-editor.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/component/rich-text-editor.model.ts)

- Remove `editorType` and `removePlugins` from `RichTextEditorFieldComponentConfig`
- Update `defaultToolbar` to Tiptap extension names:

```typescript
const defaultToolbar = ['heading', 'bold', 'italic', 'link', 'bulletList', 'orderedList', 'blockquote', 'table', 'undo', 'redo'];
```

#### [MODIFY] [construct.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/construct.visitor.ts)

Remove `editorType` and `removePlugins` setPropOverride lines from `visitRichTextEditorFieldComponentDefinition`.

---

### Angular — Dependencies

#### [MODIFY] [package.json](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/package.json)

```diff
-"@ckeditor/ckeditor5-angular": "~11.0.0",
-"ckeditor5": "~47.5.0",
+"@tiptap/core": "^3.0.0",
+"@tiptap/pm": "^3.0.0",
+"@tiptap/starter-kit": "^3.0.0",
+"@tiptap/extension-link": "^3.0.0",
+"@tiptap/extension-table": "^3.0.0",
+"@tiptap/extension-table-row": "^3.0.0",
+"@tiptap/extension-table-cell": "^3.0.0",
+"@tiptap/extension-table-header": "^3.0.0",
+"@tiptap/markdown": "^3.0.0",
+"ngx-tiptap": "^14.0.0",
+"@floating-ui/dom": "^1.6.0",
```

> [!NOTE]
> `ngx-tiptap@14` requires `@tiptap/*@^3.0.0` peer dependencies (including `@tiptap/pm`) and `@floating-ui/dom` as a peer.
> `@tiptap/starter-kit` bundles Paragraph, Heading, Bold, Italic, Blockquote, BulletList, OrderedList, HardBreak, History, etc.
> Table requires 4 separate packages. `@tiptap/markdown` provides bidirectional markdown ↔ HTML via `editor.getMarkdown()`.

---

### Angular — Form Module

#### [MODIFY] [form.module.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/form/src/app/form.module.ts)

```diff
-import { CKEditorModule } from "@ckeditor/ckeditor5-angular";
+import { TiptapEditorDirective } from "ngx-tiptap";
```

In the `imports` array:
```diff
-CKEditorModule,
+TiptapEditorDirective,
```

`TiptapEditorDirective` is a standalone directive — it can be added directly to an NgModule's `imports` array. The component remains `standalone: false` and uses it via the module.

---

### Angular — Component Rewrite

#### [MODIFY] [rich-text-editor.component.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/form/src/app/component/rich-text-editor.component.ts)

Full rewrite. Key design:

**Editor lifecycle:**
- Create `Editor` instance from `@tiptap/core` during `setPropertiesFromComponentMapEntry` with extensions from `StarterKit`, `Link`, `Table`/`TableRow`/`TableCell`/`TableHeader`, and conditionally `Markdown`
- Destroy in `ngOnDestroy` via `editor.destroy()`

**Markdown mode:**
- Include the `Markdown` extension
- Set markdown parsing mode via editor/command content options (for example: initialize editor with `contentType: 'markdown'` in markdown mode, and use `editor.commands.setContent(value, { contentType: 'markdown' })` when syncing markdown text into the editor)
- Use `editor.getMarkdown()` to read content as GFM string for `formControl`
- In HTML mode, use `editor.getHTML()`

**Toolbar:** config toolbar strings map to Tiptap chain commands:

| Config name | Tiptap command |
|---|---|
| `bold` | `toggleBold()` |
| `italic` | `toggleItalic()` |
| `heading` | `toggleHeading({level})` |
| `link` | `toggleLink({href})` |
| `bulletList` | `toggleBulletList()` |
| `orderedList` | `toggleOrderedList()` |
| `blockquote` | `toggleBlockquote()` |
| `table` | `insertTable()` |
| `undo` | `undo()` |
| `redo` | `redo()` |

**Template:** A toolbar `<div>` with `<button>` elements driven by the `toolbar` config, followed by `<div tiptapEditor [editor]="editor">` for the editable area. Readonly mode remains `[innerHTML]` bound to rendered HTML.

**Data sync with loop prevention:**
- `onUpdate` handler reads editor content and sets `formControl` only when value differs
- `formControl.valueChanges` subscription sets editor content only when value differs from current editor content
- A `skipNextSync` flag prevents update loops

**Styles:** Replace CKEditor `.ck` selectors with ProseMirror `.ProseMirror` selectors for min-height, max-height, and overflow.

---

### Angular — Test Helpers

#### [MODIFY] [helpers.spec.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/form/src/app/helpers.spec.ts)

```diff
-import { CKEditorModule } from "@ckeditor/ckeditor5-angular";
+import { TiptapEditorDirective } from "ngx-tiptap";
```

In `createTestBedModuleConfig` imports:
```diff
-"CKEditorModule": CKEditorModule,
+"TiptapEditorDirective": TiptapEditorDirective,
```

---

### Angular — Tests

#### [MODIFY] [rich-text-editor.component.spec.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/form/src/app/component/rich-text-editor.component.spec.ts)

The existing 4 tests cover readonly/view mode and are editor-agnostic. Minimal changes needed (no CKEditor-specific imports in this file).

Add new tests for editable mode:
- **Toolbar action** — trigger a bold toggle, verify editor content updates
- **Value sync (editor → formControl)** — type content, verify `formControl.value` reflects it
- **Value sync (formControl → editor)** — call `formControl.setValue(...)`, verify editor content
- **Loop prevention** — `setValue` from editor doesn't trigger re-entry

---

### Existing Form Config

#### [MODIFY] [default-1.0-draft.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/typescript/form-config/default-1.0-draft.ts)

Remove `editorType: 'classic'` from the `rich_text_1` component config (line 194):

```diff
 config: {
     outputFormat: 'html',
-    editorType: 'classic',
     minHeight: '240px',
     placeholder: 'Start writing formatted content...',
 }
```

---

### Spec Document

#### [MODIFY] [implementation_plan.md](file:///Users/andrewbrazzatti/source/github/redbox-portal/support/specs/rich-text-editor-component/implementation_plan.md)

Update to reflect Tiptap instead of CKEditor (replace after implementation is complete).

---

## Verification Plan

### Automated Tests — sails-ng-common

Existing migration visitor tests (MarkdownTextArea → RichTextEditor mapping) are editor-agnostic and require no changes.

```bash
cd packages/sails-ng-common && npm run build && npm test
```

### Automated Tests — Angular

Run the updated test suite including new editable-mode tests:

```bash
cd angular && npx ng test form --watch=false --browsers=ChromeHeadless
```

### Manual Verification

Use [default-1.0-draft.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/typescript/form-config/default-1.0-draft.ts) to test the editor. Use the `redbox-dev-login-browser` skill to log in and navigate to `http://localhost:1500/default/rdmp/record/rdmp/edit`:

1. Editor renders with toolbar and editable area
2. Typing and toolbar buttons work (bold, italic, headings, links, lists, etc.)
3. Save and reload round-trips content correctly
4. Markdown mode: stored value is GFM markdown, not HTML
5. Readonly/view mode: renders stored content as HTML
