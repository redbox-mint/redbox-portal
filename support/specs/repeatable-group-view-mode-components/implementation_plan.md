# Implementation Plan - Content View Fragments via ReusableFormDefinitions

## Scope

Implement a `ReusableFormDefinitions`-driven view fragment model for all existing `view -> ContentComponent` transforms, add view-mode transforms for `TypeaheadInputComponent` and `RichTextEditorComponent`, and upgrade Dropdown and FileUpload rendering — while preserving current rendering behavior for unchanged paths.

Impacted areas:

- `packages/redbox-core-types/src/config/reusableFormDefinitions.config.ts`
- `packages/sails-ng-common/src/config/form-override.model.ts`
- `packages/redbox-core-types/src/visitor/construct.visitor.ts`
- `packages/redbox-core-types/src/visitor/client.visitor.ts`
- `assets/styles/default-theme.scss`
- `assets/styles/default-responsive.scss`
- Related unit tests in `packages/redbox-core-types/test/unit`

## Phase 1: Define Reusable View Fragments and Keys

1. Add namespaced view fragment entries in `reusableFormDefinitions.config.ts` with `ContentComponent` roots.
2. Group entries by families: leaf/group/repeatable through naming convention.
3. Add a transform-source to reusable key map for deterministic selection.
4. Add/confirm type definitions for allowed template keys and slot names.
5. Document Handlebars helper dependencies (`formatDate`, `join`, `default`, `t`, `get`, `markdownToHtml`) alongside the slot contract.
6. Define and document reusable fragment schema invariants:
   - exactly one form component definition
   - `component.class === "ContentComponent"`
   - non-empty `component.config.template`

Outcome:

- A single central source of default view fragments exists in reusable form definitions, coexisting with existing edit-mode entries.

## Phase 2: Introduce Reusable Fragment Resolver in Transform Layer

1. Add a resolver surface in `FormOverride` that requests reusable fragment templates by key.
2. Keep existing hardcoded template strings as fallback defaults.
3. Add bounded slot-substitution helper for known placeholders only.
4. Wire current transform methods to fetch templates through reusable-key resolver:
   - plain/date/option templates
   - repeatable table/list shells
   - group container/row shells
   - file upload leaf output (read-only file list matching edit-mode appearance, no "add attachment" button, notes as read-only text)
5. Respect two-phase transform timing: `RepeatableComponent` and `GroupComponent` fragment resolution runs at `client` phase only (deferred via `deferViewModeContentFlatteningAtConstruct` guard). All other transforms execute at `construct` phase.
6. Wire reusable defs into both visitor phases:
   - `ConstructFormConfigVisitor` passes `reusableFormDefs` to `FormOverride` for construct-phase transforms.
   - `ClientFormConfigVisitor.start()` must be extended to accept `reusableFormDefs` (current signature: `{ form, formMode?, userRoles? }`).
   - Extend `FormOverride.applyOverrideTransform()` to accept `reusableFormDefs` via the `options` parameter, constructor, or setter.
   - No static import of core config from `sails-ng-common`.
7. Add lookup validation/error handling:
   - invalid/missing reusable fragment key -> fallback hardcoded template
   - debug log includes key and failure reason

Outcome:

- Transform methods no longer own shell markup as primary source.

## Phase 3: Migrate Existing View Transform Paths

Migrate each existing content transform source:

- `SimpleInputComponent` -> `leaf.plain`
- `TextAreaComponent` -> `leaf.plain`
- `DropdownInputComponent` -> `leaf.plain` — upgraded to resolve and display the option **label** for the stored value, falling back to the raw value if no matching option is found.
- `DateInputComponent` -> `leaf.date`
- `CheckboxInputComponent` -> `leaf.optionEmpty|optionSingle|optionMulti`
- `RadioInputComponent` -> `leaf.optionEmpty|optionSingle|optionMulti`
- `GroupComponent` -> `group.container` + row templates
- `RepeatableComponent` -> `repeatable.table|repeatable.list`

Add new view-mode transforms for components that currently lack them:

- `TypeaheadInputComponent` -> `leaf.plain` — add `knownTransforms`/`defaultTransforms` entries and `sourceTypeaheadInputComponentTargetContentComponent`. Handle value as `string | { label, value, sourceType? } | null`; extract display label before assigning content.
- `RichTextEditorComponent` -> `leaf.richText` — add `knownTransforms`/`defaultTransforms` entries and `sourceRichTextEditorComponentTargetContentComponent`. Use `{{{markdownToHtml content outputFormat}}}` template with a new Handlebars helper. Add the `markdownToHtml` helper using `marked`. Angular's `[innerHtml]` sanitizes output client-side.

Also preserve recursive leaf support used by repeatable/group rendering:

- `ContentComponent` — passthrough (inline, no separate reusable fragment)
- `CheckboxTreeComponent` — inline leaf using `{{join}}` helper (no separate reusable fragment)
- `FileUploadComponent` — read-only view: file list with download links, no upload controls, notes as read-only text

Outcome:

- All current view transforms participate in the same reusable fragment model.
- Two new components now have proper view-mode rendering.

## Phase 4: CSS and Styling

1. Define view-mode CSS classes in `assets/styles/default-theme.scss`, mixing in Bootstrap styles by default.
2. Classes to define/verify: `rb-view-repeatable`, `rb-view-repeatable-table-wrapper`, `rb-view-repeatable-table`, `rb-view-repeatable-list`, `rb-view-repeatable-card`, `rb-view-group`, `rb-view-row`, `rb-view-label`, `rb-view-value`, `rb-view-file-upload`.
3. Add print-specific overrides in `assets/styles/default-responsive.scss` for view-mode components (view modes are commonly printed to generate PDFs).

Outcome:

- View-mode components are styled consistently and render well in print.

## Phase 5: Verification and Parity Safety

1. Add tests confirming each transform path selects expected reusable fragment key.
2. Add tests confirming fallback behavior when key missing.
3. Keep existing output assertions for repeatable/group table/list behavior.
4. Add focused tests for slot rendering and escaped values.
5. Add tests for new transforms: `TypeaheadInputComponent`, `RichTextEditorComponent`.
6. Add tests for `TypeaheadInputComponent` value-shape handling (string, object, null).
7. Add tests for upgraded `DropdownInputComponent` label resolution.
8. Add tests for `FileUploadComponent` read-only view output.
9. Add tests for `markdownToHtml` Handlebars helper (markdown input, HTML passthrough, empty/null input).
10. Add resolver wiring tests proving reusable defs are available in both construct and client phases.
11. Add schema-validation tests for invalid reusable fragments (missing template, wrong class, multiple definitions) with fallback behavior.
12. Validate no regressions in `edit` mode behavior.

Outcome:

- Functional parity retained and failure modes controlled.

## Rollout Notes

- Start with reusable fragment lookup + fallback enabled.
- After stable test runs and downstream validation, optionally remove hardcoded fallback paths in a follow-up PR.
