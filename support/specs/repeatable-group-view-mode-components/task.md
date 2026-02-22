# Task List - Content View Fragments via ReusableFormDefinitions

## Phase 1: Design and Contracts

- [ ] Add namespaced reusable view fragment entries to `packages/redbox-core-types/src/config/reusableFormDefinitions.config.ts` with `ContentComponent` roots.
- [ ] Define reusable fragment key mapping for all existing `view -> ContentComponent` sources.
- [ ] Define slot contract and allowed placeholder keys used by transforms.
- [ ] Document Handlebars helper dependencies (`formatDate`, `join`, `default`, `t`, `get`, `markdownToHtml`).
- [ ] Define reusable fragment schema invariants (single definition, `ContentComponent`, non-empty template).
- [ ] Document fallback behavior when template key is missing.

## Phase 2: Transform Layer Changes

- [ ] Add reusable fragment resolver entry points in `packages/sails-ng-common/src/config/form-override.model.ts`.
- [ ] Add bounded slot substitution helper (known placeholders only).
- [ ] Add reusable fragment validation in resolver path (invalid schema falls back + debug log).
- [ ] Refactor `commonContentPlain` to use reusable fragment key(s).
- [ ] Refactor `commonContentOptionList` to use reusable fragment key(s).
- [ ] Refactor date transform template assignment to use reusable fragment key.
- [ ] Refactor group template generation to use reusable fragment container/row keys.
- [ ] Refactor repeatable template generation to use reusable fragment table/list keys.
- [ ] Refactor file upload leaf rendering to use reusable fragment key (read-only file list, no upload controls, notes as read-only text).
- [ ] Document that `RepeatableComponent` and `GroupComponent` fragment resolution is deferred to `client` phase via `deferViewModeContentFlatteningAtConstruct`.
- [ ] Wire `ConstructFormConfigVisitor` to pass `reusableFormDefs` into `FormOverride` for construct-phase transforms.
- [ ] Extend `ClientFormConfigVisitor.start()` to accept `reusableFormDefs` (currently `{ form, formMode?, userRoles? }`).
- [ ] Extend `FormOverride.applyOverrideTransform()` to accept `reusableFormDefs` via options, constructor, or setter.
- [ ] Keep hardcoded-string fallback path active for initial rollout.

## Phase 3: Coverage by Transform Source

Existing transforms:

- [ ] `SimpleInputComponent` template key migration.
- [ ] `TextAreaComponent` template key migration.
- [ ] `DropdownInputComponent` template key migration — upgrade to resolve and display option label.
- [ ] `DateInputComponent` template key migration.
- [ ] `CheckboxInputComponent` option template key migration.
- [ ] `RadioInputComponent` option template key migration.
- [ ] `GroupComponent` template key migration.
- [ ] `RepeatableComponent` template key migration.

New transforms:

- [ ] `TypeaheadInputComponent` — add `knownTransforms`/`defaultTransforms` entries, implement `sourceTypeaheadInputComponentTargetContentComponent`. Handle value as `string | { label, value, sourceType? } | null`; extract display label before assigning content.
- [ ] `RichTextEditorComponent` — add `knownTransforms`/`defaultTransforms` entries, implement `sourceRichTextEditorComponentTargetContentComponent`. Use `{{{markdownToHtml content outputFormat}}}` template.
- [ ] Add `markdownToHtml` Handlebars helper: add `marked` as dep of `sails-ng-common`; use `outputFormat` to decide markdown vs HTML passthrough.

Leaf/passthrough (no separate reusable fragment needed):

- [ ] `ContentComponent` passthrough rendering confirmed.
- [ ] `CheckboxTreeComponent` inline leaf rendering confirmed (uses `{{join}}`).
- [ ] `FileUploadComponent` read-only view rendering implemented — add `knownTransforms`/`defaultTransforms` entry (currently only in `renderLeafValue()` special case).

## Phase 4: CSS and Styling

- [ ] Define view-mode CSS classes in `assets/styles/default-theme.scss` (mix in Bootstrap by default).
- [ ] Verify classes: `rb-view-repeatable`, `rb-view-repeatable-table-wrapper`, `rb-view-repeatable-table`, `rb-view-repeatable-list`, `rb-view-repeatable-card`, `rb-view-group`, `rb-view-row`, `rb-view-label`, `rb-view-value`, `rb-view-file-upload`.
- [ ] Add print-specific overrides in `assets/styles/default-responsive.scss`.

## Phase 5: Tests and Verification

- [ ] Add unit tests for template resolver key selection per transform source.
- [ ] Add unit tests for fallback behavior when reusable fragment key is missing.
- [ ] Add unit tests for invalid reusable fragment schema (wrong class, missing template, multiple definitions) falling back safely.
- [ ] Add unit tests for slot substitution correctness.
- [ ] Add unit tests proving reusable defs are wired in both construct and client phases.
- [ ] Add unit tests for new `TypeaheadInputComponent` view transform (string value, object value, null value).
- [ ] Add unit tests for new `RichTextEditorComponent` view transform.
- [ ] Add unit tests for `markdownToHtml` Handlebars helper (markdown input + `outputFormat="markdown"`, HTML passthrough + `outputFormat="html"`, empty/null).
- [ ] Add explicit test/docs coverage for non-Angular rendering boundary: document and assert that any non-Angular consumer of `markdownToHtml` output must apply equivalent sanitization before rendering.
- [ ] Add unit tests for upgraded `DropdownInputComponent` label resolution.
- [ ] Add unit tests for `FileUploadComponent` read-only view output.
- [ ] Keep/extend repeatable table eligibility and fallback-layout tests.
- [ ] Keep/extend constraint-pruned descendant exclusion tests.
- [ ] Keep/extend `view` vs `edit` transform behavior tests.
- [ ] Run targeted unit tests for `FormOverride` and visitor suites.
- [ ] Verify generated templates preserve current CSS class hooks.
- [ ] Verify no runtime errors when reusable fragment map is partial/incomplete.
