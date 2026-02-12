# RichTextEditor Component — Implementation Plan

Replace the legacy `MarkdownTextAreaComponent` with a rich-text editor backed by **CKEditor 5**, following the established form component architecture.

## Key Design Decisions

### Output Format & Data Integrity

The component supports two output formats via an `outputFormat` config property:
- `'html'` — stores HTML string (default for new forms)
- `'markdown'` — stores GFM Markdown string (uses CKEditor's built-in `Markdown` plugin)

> [!IMPORTANT]
> **Format drift prevention:** `outputFormat` is an immutable field-level config property. Once a form config defines a field's `outputFormat`, all records created with that config store data in that format. If an administrator changes `outputFormat` on an existing field definition, the component will **not** attempt to re-interpret existing records — the stored string is passed through as-is. CKEditor's GFM processor will parse whatever it receives on load and re-serialize in the current `outputFormat` on save, which provides best-effort conversion. A console warning will be logged when the loaded content appears inconsistent with the declared format (e.g. HTML tags detected in a `'markdown'` field).

The migration visitor sets `outputFormat: 'markdown'` for legacy `MarkdownTextArea` fields so existing data loads correctly.

### Rendering & Sanitization

The trust and sanitization boundary is structured in three layers:

| Layer | Responsibility | Implementation |
|---|---|---|
| **Editor input** | CKEditor's internal HTML purifier strips unsafe elements/attributes on paste and load | Built into CKEditor 5 core — no custom code needed |
| **Stored value** | The `formControl` value is the serialized output from CKEditor (HTML or Markdown) | Clean by construction — CKEditor never emits `<script>`, event handlers, etc. |
| **View-mode rendering** | Read-only display of the stored value | Angular's `DomSanitizer.bypassSecurityTrustHtml()` is **not** used. Instead, the value is bound via `[innerHTML]`, which applies Angular's built-in XSS sanitization. For `outputFormat: 'markdown'`, the stored markdown is converted to HTML at render time using CKEditor's GFM data processor (imported as a utility, no editor instance needed) before passing to `[innerHTML]`. |

### Dependency Versions

| Package | Version | Compatibility |
|---|---|---|
| `ckeditor5` | `~47.5.0` | Core editor; includes GFM markdown plugin |
| `@ckeditor/ckeditor5-angular` | `~11.0.0` | Angular component; supports Angular ≥19 (tested with project's `@angular/core@^20.3.15`) |

Both use tilde ranges (`~`) to allow patch updates while preventing breaking minor/major bumps. The `ckeditor5` package is a single dependency that bundles all open-source plugins (no need for individual plugin packages).

---

## Proposed Changes

### sails-ng-common — Config Contracts

#### [NEW] [rich-text-editor.outline.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/component/rich-text-editor.outline.ts)

Types following the [checkbox-tree.outline.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/component/checkbox-tree.outline.ts) pattern:

- `RichTextEditorComponentName = "RichTextEditorComponent"`
- `RichTextEditorModelName = "RichTextEditorModel"`
- `RichTextEditorModelValueType = string`

Config frame properties:

| Property | Type | Default | Description |
|---|---|---|---|
| `outputFormat` | `'html' \| 'markdown'` | `'html'` | Storage format — immutable per field |
| `editorType` | `'classic'` | `'classic'` | CKEditor build type (extensible) |
| `toolbar` | `string[]` | *(see below)* | Toolbar items |
| `minHeight` | `string` | `'200px'` | CSS min-height |
| `placeholder` | `string` | `''` | Placeholder text |
| `removePlugins` | `string[]` | `[]` | Plugins to remove |

Default toolbar: `['heading', 'bold', 'italic', 'link', 'bulletedList', 'numberedList', 'blockQuote', 'insertTable', 'undo', 'redo']`

#### [NEW] [rich-text-editor.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/component/rich-text-editor.model.ts)

Config/definition/model classes with `accept(visitor)` methods, `RichTextEditorMap`, and `RichTextEditorDefaults`.

---

### sails-ng-common — Dictionary & Exports

#### [MODIFY] [dictionary.outline.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/dictionary.outline.ts)

Add `RichTextEditorTypes` to `AllTypes`.

#### [MODIFY] [dictionary.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/dictionary.model.ts)

Add `RichTextEditorMap` to `AllDefs` and `RichTextEditorDefaults` to `RawDefaults`.

#### [MODIFY] [index.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/index.ts)

Export the new outline and model files.

---

### sails-ng-common — Visitor Infrastructure

Add three methods per visitor:

| Visitor | Behaviour |
|---|---|
| [base.outline.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/base.outline.ts) | Interface declarations |
| [base.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/base.model.ts) | Default `notImplemented()` stubs |
| [construct.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/construct.visitor.ts) | Populate config from frame data |
| [client.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/client.visitor.ts) | Pass-through |
| [data-value.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/data-value.visitor.ts) | Pass-through |
| [json-type-def.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/json-type-def.visitor.ts) | String type definition |
| [validator.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/validator.visitor.ts) | Validation methods |
| [template.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/template.visitor.ts) | Template extraction |

#### [MODIFY] [migrate-config-v4-v5.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/migrate-config-v4-v5.visitor.ts)

Update `MarkdownTextArea` mapping → `RichTextEditorComponent`/`RichTextEditorModel`.

**Migration behaviour details:**

- The visitor injects `outputFormat: 'markdown'` into the migrated component config so the editor knows to use the GFM data processor.
- **Round-trip fidelity:** CKEditor's GFM processor supports standard GFM syntax. Unsupported Markdown extensions (e.g. custom directives) will be passed through as raw text — CKEditor treats unrecognized markup as plain text on load and preserves it in the output.
- **Parse failure fallback:** If CKEditor cannot parse the stored value (corrupt or incompatible data), the component enters an **error state** with three safeguards:
  1. **Visible warning banner** — an inline alert is rendered above the editor area showing a user-facing message (e.g. "This field's content could not be loaded into the editor. The raw data is shown below for manual recovery."). This is a template-rendered element, not a console-only log.
  2. **Save disabled** — the component sets a `parseError` flag that the form framework's save button checks; saving is blocked while any field is in error state, preventing accidental data overwrite.
  3. **Raw data display + recovery** — a read-only `<textarea>` containing the raw stored value is shown beneath the warning, allowing the user to copy the content. A "Retry" button re-attempts parsing after the user edits the raw text. Once parsing succeeds (or the user clears the field), the error state clears and saving is re-enabled.

---

### Angular — CKEditor 5 Integration

#### [MODIFY] [package.json](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/package.json)

```json
"ckeditor5": "~47.5.0",
"@ckeditor/ckeditor5-angular": "~11.0.0"
```

#### [NEW] [rich-text-editor.component.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/form/src/app/component/rich-text-editor.component.ts)

- **`RichTextEditorModel`** extends `FormFieldModel<string>`
- **`RichTextEditorComponent`** extends `FormFieldBaseComponent<string>`
  - Reads config in `setPropertiesFromComponentMapEntry`
  - Conditionally adds `Markdown` GFM plugin when `outputFormat === 'markdown'`
  - Configures toolbar, placeholder, min-height from config
  - Syncs CKEditor data ↔ `formControl` via `change` event
  - **Edit mode:** renders `<ckeditor>` component
  - **View mode:** binds stored value to `[innerHTML]` (Angular's built-in sanitization applies). For markdown output, converts to HTML via CKEditor's GFM `MarkdownDataProcessor` utility first.
  - `licenseKey: 'GPL'`

#### [MODIFY] [form.module.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/form/src/app/form.module.ts)

Add `RichTextEditorComponent` to `declarations`, import `CKEditorModule`.

#### [MODIFY] [static-comp-field.dictionary.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/form/src/app/static-comp-field.dictionary.ts)

Register component and model in static class maps.

---

## Verification Plan

### Automated Tests — Angular Component

#### [NEW] [rich-text-editor.component.spec.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/form/src/app/component/rich-text-editor.component.spec.ts)

| Test | What it verifies |
|---|---|
| Component creation | Instance created with default config |
| HTML mode rendering | Editor loads, types content, `formControl.value` contains HTML |
| Markdown mode rendering | Editor loads with `outputFormat: 'markdown'`, `formControl.value` contains GFM |
| Form-control sync | Programmatic `formControl.setValue(...)` updates editor content |
| View-mode HTML output | Read-only mode renders HTML via `[innerHTML]` without unsafe elements |
| View-mode Markdown output | Read-only mode converts stored markdown to HTML and renders safely |
| Save/reload round-trip (HTML) | Set value → extract → reload → content matches |
| Save/reload round-trip (Markdown) | Set markdown value → extract → reload → content matches |

### Automated Tests — Migration Visitor

#### [MODIFY] [migrate-config-v4-v5.visitor.test.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/test/unit/migrate-config-v4-v5.visitor.test.ts)

Extend the existing mocha+chai test file (follows the package's `test/unit/*.test.ts` convention, compiled and run from `dist/test/unit/**/*.test.js` via `npm test`).

| Test | What it verifies |
|---|---|
| MarkdownTextArea mapping | Legacy `class: 'MarkdownTextArea'` maps to `RichTextEditorComponent` / `RichTextEditorModel` |
| outputFormat injected | Migrated config includes `outputFormat: 'markdown'` |
| Other v4 mappings unaffected | Existing mappings (TextField, TextArea, etc.) still work |

### Test Commands

```bash
# Angular form component tests
cd angular && npx ng test form --watch=false --browsers=ChromeHeadless

# sails-ng-common tests (mocha+chai, runs from compiled JS)
cd packages/sails-ng-common && npm run build && npm test
```

### Manual Verification

1. Load a publication form with a migrated `MarkdownTextArea` field → CKEditor renders with existing Markdown
2. Edit, save, reload → Markdown content round-trips correctly
3. Create a new form config with `outputFormat: 'html'` → editor stores HTML
4. Verify view-mode rendering in both formats
5. Inspect browser console for absence of sanitization warnings
