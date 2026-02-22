# Design - Content View Fragments via ReusableFormDefinitions

## Summary

Centralize template structures used by `view` mode transforms that output `ContentComponent` by defining them as reusable form fragments in `ReusableFormDefinitions`.

Primary target config:

- `packages/redbox-core-types/src/config/reusableFormDefinitions.config.ts`

Primary transform consumer:

- `packages/sails-ng-common/src/config/form-override.model.ts`

## Goals

- Move hardcoded template shell markup out of transform methods and into reusable form fragments.
- Support all existing `view -> ContentComponent` transforms, not only repeatable/group.
- Add view-mode transforms for components that currently lack them (`TypeaheadInputComponent`, `RichTextEditorComponent`).
- Upgrade `DropdownInputComponent` view rendering to display the option label rather than the raw value.
- Upgrade `FileUploadComponent` to render as a read-only version of its edit-mode appearance.
- Preserve current rendering behavior and classes for all other transforms.
- Keep transform logic focused on data extraction, layout decisioning, and slot population.

## Non-Goals

- No functional redesign of output HTML structure in this change (except FileUpload and Dropdown as noted above).
- No routing/controller/service/model changes.
- No migration of unrelated template systems.

## In-Scope Transform Sources

Current transform sources that resolve to `ContentComponent` in `view` mode:

- `SimpleInputComponent`
- `TextAreaComponent`
- `DropdownInputComponent` — upgraded to render the option **label** instead of the raw value.
- `CheckboxInputComponent`
- `RadioInputComponent`
- `DateInputComponent`
- `RepeatableComponent`
- `GroupComponent`

New transform sources to add as part of this change:

- `TypeaheadInputComponent` — renders as plain text leaf using the display value. The model value can be a `string`, a `TypeaheadInputModelOptionValue` object (`{ label, value, sourceType? }`), or `null`. The transform must extract the display label: if the value is an object, use `.label`; if a string, use the string directly. Migration: add a `knownTransforms` entry, `defaultTransforms` entry (view → ContentComponent), and a `sourceTypeaheadInputComponentTargetContentComponent` method. Cannot simply delegate to `commonContentPlain` — needs value-shape handling first.
- `RichTextEditorComponent` — renders as a formatted content block. The stored value is a string that may be HTML or markdown depending on the `outputFormat` config (`"html"` or `"markdown"`). Migration: add `knownTransforms`/`defaultTransforms` entries and a `sourceRichTextEditorComponentTargetContentComponent` method. Use `{{{markdownToHtml content outputFormat}}}` template with a new Handlebars helper that converts markdown to HTML (passes through HTML unchanged). Angular's `[innerHtml]` binding provides client-side sanitization.

Related leaf rendering paths used by repeatable/group generation also remain in scope:

- `ContentComponent` — passthrough; existing template rendered inline.
- `CheckboxTreeComponent` — inline leaf using `{{join}}` helper; no separate reusable fragment needed.
- `FileUploadComponent` — renders as a read-only version of the edit-mode UI: file list with download links visible, "add attachment" button hidden, notes displayed as read-only text. Note: currently handled only via `renderLeafValue()` special case — this change should add a proper `knownTransforms`/`defaultTransforms` entry (view → ContentComponent) for consistency.

## Two-Phase Transform Timing

`RepeatableComponent` and `GroupComponent` transforms are **deferred** during the `construct` phase via the `deferViewModeContentFlatteningAtConstruct` guard. Their view-mode content flattening only runs during the `client` phase, after all construct-time visitors have completed.

This is necessary because construct-phase visitors may still need to inspect the original component tree (e.g. for data-model binding, attachment field discovery, etc.). The reusable fragment resolver must respect this phasing: fragment lookup and template assembly happens at `client` phase only for these two component types.

All other component transforms (leaf types) execute at `construct` phase as usual.

## Resolver Wiring Contract

Reusable fragment resolution must be wired explicitly in both visitor phases:

- `construct` phase: `ConstructFormConfigVisitor` already has `reusableFormDefs`. It must pass these defs into `FormOverride` for leaf transforms that still execute during construct.
- `client` phase: `ClientFormConfigVisitor` must receive the same `reusableFormDefs` input and pass them into `FormOverride` when applying deferred `RepeatableComponent`/`GroupComponent` transforms.
- `FormOverride` API contract: the current `applyOverrideTransform(source, formMode, options?)` signature must be extended to accept the active reusable definitions for lookup. Options include: adding `reusableFormDefs` to the `options` parameter, passing via the constructor, or a setter method. No global/static import of `redbox-core-types` config from `sails-ng-common`.
- `ClientFormConfigVisitor.start()` API: the current signature `start({ form, formMode?, userRoles? })` must be extended to accept `reusableFormDefs` so they can be passed through to `FormOverride` during deferred transforms.
- Failure behavior: if defs are absent, key is missing, or lookup fails, use hardcoded fallback templates and emit debug logging for traceability.

## Proposed Configuration Shape

Define view-mode templates as named `ReusableFormDefinitions` entries whose root component is `ContentComponent`.

Naming convention (example):

- `view-template-leaf-plain`
- `view-template-leaf-date`
- `view-template-leaf-option-empty`
- `view-template-leaf-option-single`
- `view-template-leaf-option-multi`
- `view-template-leaf-rich-text`
- `view-template-leaf-file-upload`
- `view-template-group-container`
- `view-template-group-row-with-label`
- `view-template-group-row-no-label`
- `view-template-repeatable-table`
- `view-template-repeatable-list`

These entries coexist alongside existing edit-mode entries (e.g. `standard-contributor-fields`). Users may reference any reusable definition in any mode — the `view-template-*` prefix is a naming convention, not an enforcement mechanism.

Transforms select one reusable fragment key per rendering branch and then apply bounded slot substitution.

## Reusable Fragment Definition Invariants

Each `view-template-*` reusable entry must satisfy these invariants:

- The reusable definition key resolves to an array with exactly one form component definition.
- That single definition must have `component.class === "ContentComponent"`.
- `component.config.template` must exist and be a non-empty string.
- `name` must be stable and unique within the reusable entry.
- Optional `model`/`layout` properties are allowed but not required by the resolver.

Resolver validation behavior:

- If an entry violates invariants, treat it as invalid for runtime lookup.
- Invalid entries do not throw in production flow; they trigger fallback template behavior plus debug log output.

## Slot Contract

Transform logic injects computed fragments into shell templates via a bounded slot contract:

- `rootExpr`
- `headersHtml`
- `cellsHtml`
- `rowsHtml`
- `itemBodyHtml`
- `labelHtml`
- `valueHtml`
- `valueExpr`

Rule: slot substitution is deterministic and limited to known placeholders; no arbitrary template rewriting.

## Handlebars Helper Dependencies

Reusable fragment templates depend on the following Handlebars helpers being registered at render time. Any custom templates defined via `ReusableFormDefinitions` must have access to these helpers:

| Helper           | Usage                            | Example                        |
| ---------------- | -------------------------------- | ------------------------------ |
| `formatDate`     | Date formatting                  | `{{formatDate content}}`       |
| `join`           | Array-to-string with delimiter   | `{{join expr ", "}}`           |
| `default`        | Fallback for missing values      | `{{default expr ""}}`          |
| `t`              | i18n translation                 | `{{t "label-key"}}`            |
| `get`            | Safe nested property access      | `(get this "field" "")`        |
| `markdownToHtml` | Markdown → HTML conversion (new) | `{{{markdownToHtml content outputFormat}}}` |

## Rich Text Rendering and Sanitization

`RichTextEditorComponent` view-mode output uses `{{{markdownToHtml content outputFormat}}}` with a new Handlebars helper. Sanitization is handled by existing layers:

- **Server-side**: `DomSanitizerService` (in `redbox-core-types/src/services/DomSanitizerService.ts`) uses DOMPurify with configurable profiles. Rich-text content should be sanitized through this service during the transform if desired.
- **Client-side**: `ContentComponent` renders via `[innerHtml]` binding, which Angular's built-in `DomSanitizer` automatically sanitizes — stripping script tags, event-handler attributes, and dangerous URL protocols.

The `markdownToHtml` Handlebars helper:

- Converts markdown content to HTML when `outputFormat === "markdown"`. If `outputFormat === "html"` (or absent), the content is already HTML and passes through unchanged. The transform should pass the `outputFormat` alongside the content so the helper can make this decision.
- Should be registered as a Handlebars helper alongside the existing helpers (`formatDate`, `join`, etc.).
- Add `marked` as a dependency of `sails-ng-common` (since the helper runs in shared/server transform code).

Between these two sanitization layers, no additional sanitization step is required in the transform itself.

Risk note:

- This design relies on Angular `[innerHtml]` sanitization for client rendering safety. If `markdownToHtml` output is later reused outside Angular rendering paths, equivalent sanitization must be explicitly enforced at that new boundary.

## Behavior Rules

- Repeatable layout selection remains unchanged:
  - table when children are table-eligible and uniquely named
  - list/card fallback otherwise
- Group row rendering remains unchanged:
  - labeled rows where label is present
  - value-only rows when label missing
- Label behavior remains unchanged:
  - `{{t "<label-key>"}}` for configured labels
  - fallback to field name literal
- Empty/missing values render safely as empty output.
- `DropdownInputComponent` resolves the **label** from configured options for the stored value, falling back to the raw value if no matching option is found.
- `FileUploadComponent` view output mirrors the edit-mode file list but omits the "add attachment" controls and renders notes as read-only.

## CSS and Styling

View-mode CSS classes are defined in `assets/styles/default-theme.scss`. Classes should mix in Bootstrap styles by default.

Key classes: `rb-view-repeatable`, `rb-view-repeatable-table-wrapper`, `rb-view-repeatable-table`, `rb-view-repeatable-list`, `rb-view-repeatable-card`, `rb-view-group`, `rb-view-row`, `rb-view-label`, `rb-view-value`, `rb-view-file-upload`.

Print-specific overrides go in `assets/styles/default-responsive.scss`, since view modes are commonly printed to generate PDFs.

## Package Boundary and Ownership

- `redbox-core-types` owns default reusable fragment definitions.
- `sails-ng-common` owns transform algorithm and selection logic.
- `sails-ng-common` consumes resolved reusable fragments via explicit input/resolution path rather than hard dependency on `redbox-core-types` internals.

## Backward Compatibility Strategy

- Keep hardcoded transform templates as fallback defaults initially.
- If reusable fragment lookup fails or template key missing, use existing hardcoded output.
- Remove fallback only after parity tests pass and adoption stabilizes.

## Risks and Mitigations

- Risk: silent markup drift during extraction.
  - Mitigation: snapshot/string-assert tests for existing expected templates.
- Risk: package coupling.
  - Mitigation: keep reusable fragment consumption through typed input boundary.
- Risk: slot substitution errors.
  - Mitigation: strict slot key validation and unit tests for each family.

## Acceptance Criteria

- All current `view -> ContentComponent` transforms resolve templates from `ReusableFormDefinitions` view fragments.
- `TypeaheadInputComponent` and `RichTextEditorComponent` have working view-mode transforms.
- `DropdownInputComponent` renders the option label in view mode.
- `FileUploadComponent` renders a read-only file list matching its edit-mode appearance.
- Generated templates for current fixtures match existing output behavior.
- Repeatable/group table-vs-fallback decisions unchanged.
- Missing template keys fall back without runtime failure.
- View-mode CSS classes defined in `default-theme.scss` with print overrides in `default-responsive.scss`.
- Resolver wiring is present in both construct and client visitors with no direct `sails-ng-common` import of core config.
- Invalid reusable fragment schema entries trigger fallback templates without runtime failure.
- Rich-text output renders correctly via `markdownToHtml` helper, with Angular's `[innerHtml]` sanitizer providing client-side protection.
