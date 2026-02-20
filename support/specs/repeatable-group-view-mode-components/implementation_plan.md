# Implementation Plan - Form View Mode Transforms for Repeatable and Group Components

## Scope and Decisions

This feature implements view-mode transforms for both:

- `RepeatableComponent` -> `ContentComponent`
- top-level `GroupComponent` -> `ContentComponent`

Key decisions:

- Top-level `GroupComponent` is in scope.
- Authorization and mode constraints must still be enforced after transforms.
- Column and field labels rendered in templates must be translated at runtime.
- Missing/null/invalid data should render as an empty string.

## Why Transform Timing Must Change

Current transform flow runs in construct visitor before client-side constraint pruning. That is not sufficient for this feature, because flattening `RepeatableComponent`/`GroupComponent` into a single `ContentComponent` too early removes descendant component boundaries needed for role/mode filtering.

To preserve correctness:

- Keep existing construct-time transforms as-is for current components.
- Add a new client-visitor transform phase that runs only after constraint filtering has already removed unauthorized/out-of-mode descendants.
- Perform `RepeatableComponent`/`GroupComponent` -> `ContentComponent` transform in this new phase.

## Proposed Changes

### `packages/sails-ng-common`

#### [MODIFY] `src/config/form-override.model.ts`

Add transform support methods that can be used by both visitors:

- Add `knownTransforms` entry:
  - `[RepeatableComponentName] -> [ContentComponentName]`
  - `[GroupFieldComponentName] -> [ContentComponentName]`
- Add `defaultTransforms` entries for `view` mode:
  - `RepeatableComponentName: { component: ContentComponentName }`
  - `GroupFieldComponentName: { component: ContentComponentName }`
- Implement:
  - `sourceRepeatableComponentTargetContentComponent(...)`
  - `sourceGroupComponentTargetContentComponent(...)`
  - `generateTemplateForComponent(...)`
  - helper methods for table/list rendering and safe value/template extraction

Important:

- These methods must not assume every leaf has a model value.
- Any unresolved value path must render empty string.
- Unknown component classes must not throw by default; they must render with generic fallback in list layout.

#### [MODIFY] `src/config/visitor/client.visitor.ts`

Add a post-pruning transform step for `view` mode:

- After constraints/user-role filtering has removed disallowed descendants, transform surviving `RepeatableComponent` and `GroupComponent` instances into `ContentComponent` using `FormOverride`.
- Ensure transform is recursively applied to descendants before parent rendering so nested structures produce stable templates.

Acceptance condition:

- Unauthorized/disallowed descendant fields must not appear in generated template markup or output context.

#### [MODIFY] `src/config/visitor/construct.visitor.ts`

Guard against double transform:

- Ensure `RepeatableComponent`/`GroupComponent` are not flattened at construct time if client visitor is responsible for this feature.
- Existing behavior for other transforms remains unchanged.

### `angular/projects/researchdatabox/form`

#### [MODIFY] `src/app/component/content.component.ts`

Pass translation service into handlebars context so template label translation works:

- Current context: `{ content }`
- Required context: `{ content, translationService }`

This enables `{{t "translation.key"}}` to resolve localized labels in generated templates.

## Rendering Strategy

### 1. Data Root

For transformed components:

- `ContentComponent.config.content` receives source model value.
- Templates iterate using `{{#each content}}...{{/each}}` for repeatables.
- Group templates use `content` as object root.

### 2. Empty Data Rules

Render empty string for:

- `content === undefined`
- `content === null`
- missing object key
- non-array repeatable content
- unsupported primitive/object shape mismatch

For repeatables specifically:

- Non-array content behaves as empty array.
- Empty array renders structural container with no rows/items.

### 3. Component Support Matrix

#### Table-eligible leaf classes

These can render as table cells when directly inside a flat group row:

- `SimpleInputComponent`
- `TextAreaComponent`
- `DateInputComponent`
- `DropdownInputComponent`
- `CheckboxInputComponent`
- `RadioInputComponent`
- `TypeaheadInputComponent`
- `RichTextEditorComponent`
- `MapComponent`
- `ContentComponent`
- `CheckboxTreeComponent`

Table eligibility requires all children in the row are leaf fields with unique, non-empty names and no nested `GroupComponent`/`RepeatableComponent`.

#### Non-table / complex components

- `FileUploadComponent` (file metadata is multi-attribute and should render as its own structure, not nested table cell content)
- `GroupComponent`
- `RepeatableComponent`
- any unknown class

These force list/card fallback layout.

### 4. Header and Label Rules

For table/list labels:

- If `component.config.label` exists, render `{{t "<label-key>"}}`.
- Else fallback to field `name` literal.
- If neither usable, skip label text and render value only.

### 5. Template Rebinding Rules (explicit)

Do not perform arbitrary string rewriting of unknown templates.

Supported behavior:

- For known leaf components transformed to `ContentComponent` by existing logic, use direct generated value expressions rather than attempting to parse/patch nested templates.
- For `ContentComponent` leaves encountered during recursive rendering:
  - If template contains only `{{content}}` or `{{{content}}}`, rebind to current path expression.
  - Otherwise wrap with safe fallback display using current value expression.

This avoids brittle regex/template mutation.

### 6. Value Extraction Rules

- Primitive repeatable element: `{{this}}`
- Object field: `{{this.fieldName}}`
- Nested path: `{{this.parent.child}}`
- All interpolations must use expressions that naturally resolve to empty string when path missing.

### 7. Duplicate/Invalid Field Names

Inside group-based rendering:

- If any child has empty or duplicate `name`, skip table mode.
- Use list fallback.
- In list fallback, unnamed fields render value only (no label).

## Template Layout Rules

### Table Layout (flat repeatable of simple group)

Use when all table eligibility rules pass.

- Header row from translated labels.
- Body row per array element.
- Cell per child field.

### List/Card Layout (fallback)

Use when:

- nested groups/repeatables exist,
- unknown component class exists,
- duplicate/empty names exist,
- mixed incompatible shapes exist.

Rendering pattern:

- outer list of repeatable elements
- card/item wrapper per element
- field rows as `label: value`
- nested collections recurse with additional nested list wrappers

## Styling Rules

- Classes for tables and other generated elements should be placed in `assets/styles/default-theme.scss`.
- They should mixin Bootstrap styles by default.
- We often print the view mode to make PDFs, so print CSS should also be considered in `assets/styles/default-responsive.scss`.

## Constraint and Authorization Guarantees

Required invariant:

- Any field removed by mode or role constraints must not contribute labels, template fragments, or value bindings in output.

Implementation guarantee:

- Generate templates only from already-filtered component definitions in `ClientFormConfigVisitor`.

## Detailed Task Breakdown

1. Add transform entries and transform helpers in `form-override.model.ts` for repeatable/group.
2. Add helper utilities in `form-override.model.ts`:
   - component classification
   - table eligibility check
   - label resolution
   - safe value expression building
3. Add post-pruning transform phase in `client.visitor.ts` for view mode.
4. Ensure recursion order in client visitor handles child transforms before parent template generation.
5. Prevent conflicting construct-time flattening for repeatable/group in `construct.visitor.ts`.
6. Update `content.component.ts` context to include `translationService`.
7. Add focused logging (debug-level) for transform decisions (table vs list fallback, skipped fields).
8. Update spec examples to reflect translated labels and empty-value behavior.

## Comprehensive Test Plan

### Unit Tests - `packages/sails-ng-common/test/unit/construct.visitor.test.ts`

Add/extend tests covering:

1. `RepeatableComponent` transforms to `ContentComponent` in `view` mode only.
2. Top-level `GroupComponent` transforms to `ContentComponent` in `view` mode only.
3. `edit` mode keeps `RepeatableComponent` and `GroupComponent` untransformed.
4. Flat group repeatable renders table template.
5. Nested group repeatable renders list/card fallback.
6. Repeatable with unknown child class uses fallback layout and does not throw.
7. Repeatable with `CheckboxTreeComponent` inside group renders successfully (table if eligible, otherwise fallback per rules).
8. Repeatable/group row containing `FileUploadComponent` always uses list/card fallback (never table mode).
9. Duplicate child names disable table mode and switch to fallback.
10. Empty child names disable table mode and switch to fallback.
11. Missing `label` falls back to field name.
12. Labels render using translation helper markers (`{{t ...}}`) in template.
13. `content: undefined|null` renders empty output path (no literal `undefined`/`null`).
14. Repeatable with non-array content renders as empty list/container.
15. Missing object keys render empty string and do not throw.
16. Nested repeatable recursion produces stable template structure.
17. Existing transforms (simple input, date, tab->accordion) still pass unchanged.
18. Existing repeatable TODO case at line with TODO comments is replaced by explicit assertions for final behavior.

### Unit Tests - `angular/projects/researchdatabox/form`

Add `ContentComponent` tests:

1. Handlebars context includes `translationService`.
2. `{{t ...}}` in template resolves translated value when translation service returns value.
3. `{{t ...}}` falls back to key when translation missing.

### Authorization/Constraint Regression Tests

In `construct.visitor.test.ts` or `client.visitor.test.ts` (whichever has role/mode pruning assertions):

1. Group child disallowed by `allowModes` is excluded from generated template.
2. Group child disallowed by `allowRoles` is excluded from generated template.
3. Mixed allowed/disallowed children only render allowed subset.
4. Nested disallowed descendants are excluded recursively.
5. No unauthorized label keys appear in output template.

### Snapshot/String Assertion Guidance

When asserting templates:

- Assert critical fragments (wrapper, each block, header/cell expressions, translation helper usage).
- Normalize whitespace to avoid brittle failures.
- Include negative assertions for unauthorized/disallowed fields.

### Manual Verification

1. Open a representative form in `view` mode containing:
   - top-level group
   - repeatable simple list
   - repeatable group table
   - repeatable with nested repeatable
   - repeatable containing checkbox tree
2. Verify labels are translated.
3. Verify role/mode changes remove restricted fields from rendered output.
4. Verify empty values display as blank (not `null`/`undefined`).
