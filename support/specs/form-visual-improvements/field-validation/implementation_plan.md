# Field Validation Visual Improvements Implementation Plan

## Scope
This plan improves field-level validation presentation in the Angular form app so that:
1. A field can cleanly show zero, one, or many validation errors.
2. Multiple errors do not break row rhythm, card spacing, or tab panel layout.
3. Users can still access full error detail near the field.
4. Existing validation triggers and save flow behavior remain unchanged.

Excluded from scope:
- Validation rule logic changes (required/pattern/custom validation semantics).
- i18n content rewrite beyond message formatting needed for display.

## Problem Statement (Current State)
Current field errors are rendered as inline text under controls. This works for single short errors but degrades when a field has multiple or long messages:
- Vertical expansion can push nearby content and produce uneven row height.
- Dense error blocks reduce scanability.
- Multiple errors near each other can create visual noise.

## Design Goals
- Keep per-field layout height predictable in the default state.
- Preserve proximity of errors to the offending field.
- Provide progressive disclosure for secondary errors.
- Ensure full keyboard/screen-reader accessibility.
- Keep style/token usage aligned with existing form visual improvements.

## UX Pattern (Proposed)

### 1. Field Error Summary Row (Always Present When Invalid)
For invalid fields, render one compact summary row directly beneath the input:
- Show first error message only.
- If additional errors exist, append a compact action: `+N more`.
- Summary row remains one line with overflow handling to prevent uncontrolled height growth.

Example behavior:
- 1 error: `This field is required.`
- 3 errors: `This field is required. +2 more`

### 2. Expandable Error Detail Panel (On Demand)
When user clicks `+N more` (or focus/keyboard activates the toggle):
- Expand an in-flow error panel directly below the summary row.
- Show full list of errors as bullets.
- Cap panel height (`max-height`) and enable internal scroll if needed.
- Keep panel anchored to field so context is preserved.

### 3. Field State Visuals
- `valid`: normal border and helper text behavior.
- `invalid-single`: error border + summary row.
- `invalid-multiple`: error border + summary row with count + toggle.
- Optional future variant: `warning` state using same structure with different tokens.

## Accessibility Contract
- Invalid control: `aria-invalid="true"`.
- Summary row id connected with `aria-describedby` from the input.
- Expand/collapse control uses `aria-expanded` and `aria-controls`.
- Detail panel uses `role="region"` and descriptive label (e.g. `Project name validation errors`).
- Keyboard support:
  - `Enter` and `Space` toggle details.
  - Focus remains stable when panel opens/closes.

## Technical Architecture

### Presentation Model
Introduce a normalized field error view model:
- `allErrors: string[]`
- `primaryError: string | null`
- `additionalErrorCount: number`
- `hasMultipleErrors: boolean`
- `isExpanded: boolean`

This model can be derived from existing validation output without changing validator logic.

### Component Responsibilities
- Field renderer/layout components compute and pass error model.
- Error message sub-template/component handles summary/toggle/panel rendering.
- Styling centralized with namespaced `rb-form-*` classes and shared spacing/color tokens.

## File-Level Implementation Tasks

1. `angular/projects/researchdatabox/form/src/app/component/default-layout.component.ts`
- Replace direct multi-message dump with summary + expandable details markup.
- Add toggle handlers and stable ids for `aria-*` linking.

2. `angular/projects/researchdatabox/form/src/app/component/inline-layout.component.ts`
- Mirror the same error rendering contract used by default layout.
- Ensure inline rows do not wrap unpredictably when in invalid-multiple state.

3. `angular/projects/researchdatabox/form/src/app/form.component.scss`
- Add reusable validation classes (`rb-field-error-summary`, `rb-field-error-toggle`, `rb-field-error-panel`).
- Add tokenized spacing and state colors consistent with current visual refresh.
- Add max-height + overflow behavior for multi-error panels.

4. `angular/projects/researchdatabox/form/src/styles.scss`
- Add or extend form-level CSS variables for validation states, with fallback values.
- Keep variable names namespaced and avoid bootstrap collisions.

5. `angular/projects/researchdatabox/form/src/app/component/repeatable.component.ts`
- Confirm nested/repeatable items inherit the same error rendering behavior.
- Ensure expansion inside repeatable rows does not break add/remove action alignment.

6. `packages/sails-ng-common/src/config/visitor/migrate-config-v4-v5.visitor.ts` (only if needed)
- If error-display class hooks are introduced in config, add migration mapping.
- Skip if implementation is purely internal/default class behavior.

7. `packages/redbox-core-types/src/form-config/default-1.0-draft.ts` (only if needed)
- Add optional class hooks for fields requiring custom error presentation overrides.
- Keep defaults backward compatible.

## Implementation Phases

### Phase 1: Shared Error Rendering Contract
1. Define helper logic for `primaryError`, `additionalErrorCount`, and detail toggling.
2. Implement in `default-layout.component.ts`.
3. Add initial styles and ensure no regression for single-error fields.

Deliverable:
- All default-layout fields use compact summary behavior.

### Phase 2: Inline + Repeatable Integration
1. Apply same pattern to `inline-layout.component.ts`.
2. Validate behavior in repeatable/group contexts and nested field sets.
3. Ensure error toggle state is isolated per field instance.

Deliverable:
- Consistent behavior across default, inline, and repeatable contexts.

### Phase 3: Accessibility + Visual Polish
1. Add ARIA attributes and keyboard interactions.
2. Tune truncation/line-height/icon alignment at mobile/tablet/desktop breakpoints.
3. Validate interaction with existing help text and validation summary links.

Deliverable:
- Accessible and visually stable field-level error UI.

### Phase 4: Optional Config Hooks + Migration
1. Add config hooks only if required by custom form needs.
2. Implement migration mapping for new hooks if introduced.

Deliverable:
- Backward-compatible configuration path for selective overrides.

## Testing Plan

### Unit Tests
- `default-layout.component.spec.ts`
  - Shows primary error only by default.
  - Shows `+N more` when multiple errors exist.
  - Expands/collapses detail panel via click and keyboard.
- `inline-layout.component.spec.ts`
  - Matches behavior contract from default layout.
- `repeatable.component.spec.ts`
  - Multiple invalid rows keep independent expansion states.

### Accessibility Tests
- Verify `aria-invalid`, `aria-describedby`, `aria-expanded`, and `aria-controls` wiring.
- Verify panel region labels are present and unique per field instance.

### UI Verification
Check in form tabs with short and long content:
- Single short error does not increase baseline rhythm beyond expected line.
- Multi-error fields remain compact until expanded.
- Expanded panel scrolls internally after max height.
- No overlap/clipping on mobile/tablet/desktop.

### Regression Checks
- Save flow unchanged.
- Validation summary top-of-form behavior unchanged.
- Link-to-field navigation still lands on and highlights target control.

## Acceptance Criteria
1. Invalid field with many errors renders as one-line summary by default.
2. User can reveal all errors per field without full-page layout break.
3. Expanded detail panel remains readable and scrollable when error count is high.
4. Accessibility contract passes keyboard and screen-reader checks.
5. Existing validation and save behavior is preserved.

## Risks and Mitigations
- Risk: Toggle states drift in dynamic repeatable rows.
  - Mitigation: key expansion state by stable field instance id.
- Risk: Text truncation hides meaningful context.
  - Mitigation: preserve full message in expanded panel and expose tooltip/title for summary line if needed.
- Risk: Style conflicts with bootstrap/global rules.
  - Mitigation: namespaced `rb-form-*` classes and host-anchored selectors.

## Rollout Strategy
1. Implement default behavior without requiring form-config updates.
2. Validate on RDMP edit flows with high-error scenarios.
3. Introduce optional config hooks only if specific forms need variant behavior.
4. Expand to additional forms after regression pass.
