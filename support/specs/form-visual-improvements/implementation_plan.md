# Form Visual Improvements Implementation Plan

## Scope
This plan addresses visual/layout issues in the edit form experience:
1. Inconsistent or insufficient vertical spacing (notably tab area to bottom action buttons).
2. Inconsistent left margins across components.
3. Components not lining up on a coherent grid.
4. Group-internal components not using available horizontal space effectively.
5. Width differences across tabs causing visual jump when tab changes.

Excluded from scope:
- i18n key/content fixes.

## Baseline Findings (Current State)
Observed in the current form app (`/default/rdmp/record/rdmp/edit`) using desktop viewport:
- Action row can appear visually attached to tab nav on short tabs (Welcome) with near-zero separation.
- Active tab panel width varies by tab content (e.g. ~660px, ~674px, ~690px), causing horizontal layout shift.
- Left-edge anchors vary between labels/controls/sections, so rows do not align to one rhythm.
- Mixed width behavior (full/half/third) appears ad-hoc; group/repeatable sections often leave dead horizontal space.
- Validation summary and debug blocks dominate vertical flow and reduce scannability.

## Design Principles
- Single layout contract: one container width, one tab+content frame, one spacing scale.
- Tokenized spacing: central variables for gaps/padding/section spacing.
- Responsive-first layout: mobile baseline, then tablet/desktop enhancement.
- Predictable field widths: explicit full/half/third patterns, not implicit based on component type.
- Preserve accessibility and existing event-driven save/validation behavior.
- Minimize form-config churn by introducing defaults + optional per-form overrides.
- Prefer CSS Grid/Flexbox with `gap` over margin-based spacing where feasible.

## Target Architecture

### 1. Unified Form Shell Layout
Create a stable top-level layout wrapper class for the Angular form host:
- Fixed max width for tab content + action row.
- Stable horizontal alignment for nav + content + buttons.
- Consistent spacing between tab list, active panel, validation summary, and action row.
- Responsive behavior:
  - Mobile: single column stack (tabs above content, actions below content).
  - Tablet+: two-column tab nav + content/action alignment.

Primary files:
- `angular/projects/researchdatabox/form/src/app/form.component.scss`
- `angular/projects/researchdatabox/form/src/styles.scss`
- `angular/projects/researchdatabox/form/src/app/form.component.ts` (host class additions if needed)
- `angular/projects/researchdatabox/form/src/styles/_rb-form-variables.scss` (optional, if token set grows)

### 2. Tab Layout Contract
Standardize `TabComponentLayout` rendering so tab nav and panel content share one layout grid:
- Keep tab nav column fixed-width (tablet/desktop).
- Keep tab content column consistent width across tabs.
- Ensure action buttons align with content column rather than tab-nav column when configured.
- Use CSS Grid/Flex with `gap` for horizontal and vertical rhythm.

Primary files:
- `angular/projects/researchdatabox/form/src/app/component/tab.component.ts`
- `packages/sails-ng-common/src/config/component/tab.model.ts` (new defaults if needed)
- `packages/sails-ng-common/src/config/component/tab.outline.ts` (new optional layout config props)

### 3. Component Alignment and Spacing Rules
Set consistent layout behavior for default/inline layouts:
- Uniform label-to-control spacing.
- Consistent bottom spacing between fields.
- Remove legacy `<br>`-driven spacing in favor of CSS containers and `gap`.

Primary files:
- `angular/projects/researchdatabox/form/src/app/component/default-layout.component.ts`
- `angular/projects/researchdatabox/form/src/app/component/inline-layout.component.ts`
- `angular/projects/researchdatabox/form/src/app/form.component.scss`

### 4. Group and Repeatable Width Utilization
Improve group/repeatable child distribution to reduce dead space:
- Add container-level grid class for group internals.
- Provide default child width behavior (`full`, `half`, `third`) via css class map or layout metadata.
- Keep backward compatibility by only applying new behavior when a class/flag is enabled.

Primary files:
- `angular/projects/researchdatabox/form/src/app/component/group.component.ts`
- `angular/projects/researchdatabox/form/src/app/component/repeatable.component.ts`
- `packages/sails-ng-common/src/config/component/group.model.ts` and/or related outlines if config extension is needed

### 5. Action Row Placement Consistency
Ensure tab-nav buttons + save/cancel row have consistent spacing and anchoring:
- Introduce explicit `form-action-row` class with standard top margin/gap.
- Keep previous/next and save/close in one aligned row/wrap container.
- Avoid tab-specific action row shifts by anchoring to the same content container.

Primary files:
- `angular/projects/researchdatabox/form/src/app/component/tab-nav-button.component.ts`
- `angular/projects/researchdatabox/form/src/app/component/save-button.component.ts`
- `packages/redbox-core-types/src/form-config/default-1.0-draft.ts` (class hooks for row wrappers where needed)

## Implementation Phases

### Phase 1: Layout Tokens + Shell
1. Add spacing/width CSS variables in form app styles (`styles.scss` initially; split to `styles/_rb-form-variables.scss` if token set grows).
2. Add host/form-shell classes in `FormComponent` styles.
3. Introduce deterministic max-width and horizontal centering for editable form mode.
4. Add responsive breakpoints for mobile/tablet/desktop shell behavior.

Deliverable:
- Stable baseline width and spacing regardless of tab content and viewport.

### Phase 2: Tab + Panel Structural Alignment
1. Refactor `TabComponentLayout` template wrapper structure to semantic layout containers (`tab-nav`, `tab-panel`, `tab-actions`).
2. Map legacy class props (`buttonSectionCssClass`, `tabPaneCssClass`) onto enhanced wrappers to preserve compatibility.
3. Add fallback defaults in `sails-ng-common` tab config for new class hooks.
4. Implement breakpoint behavior:
   - Mobile: tab nav and content stack.
   - Tablet+: nav fixed width + content flexible.

Deliverable:
- No visible horizontal “jump” when switching tabs.

### Phase 3: Field/Group Alignment
1. Replace `<br>` spacing in default/inline layouts with CSS container structures.
2. Normalize label, help, feedback, and control block spacing with `gap`-first rules.
3. Add optional group-internal grid behavior and apply to high-impact sections in default form config.

Deliverable:
- Labels/controls align to consistent columns; group children use available width better.

### Phase 4: Action Row Harmonization
1. Standardize button row containers for tab-nav + save/cancel controls.
2. Define fixed top margin/gap tokens for action row from preceding content.
3. Verify behavior on short and long tabs (Welcome, People, Data classification).

Deliverable:
- Consistent tab-to-action spacing across all tabs.

### Phase 5: Cleanup and Guardrails
1. Keep debug blocks behind existing `debugValue` flag but style as secondary/collapsible panel for edit mode readability.
2. Add regression tests around classes and spacing hooks.
3. Update spec snapshots where class output changed.

Deliverable:
- Cleaner visual hierarchy with reduced regression risk.

## Detailed Task List (File-Level)

1. `angular/projects/researchdatabox/form/src/app/form.component.scss`
- Add CSS variables (`--rb-form-max-width`, `--rb-form-gap-*`, `--rb-form-left-nav-width`).
- Add shell/layout classes for host and inner wrappers.
- Add action-row spacing rules.
- Add responsive breakpoints (`sm`, `md`, `lg`) for tab/content/action arrangement.

2. `angular/projects/researchdatabox/form/src/app/form.component.html`
- Wrap debug sections in a dedicated secondary panel class.
- Ensure debug blocks do not influence primary form container width/alignment.

3. `angular/projects/researchdatabox/form/src/app/component/tab.component.ts`
- Update `TabComponentLayout` template markup to include stable nav/content/action containers.
- Preserve ARIA roles (`tablist`, `tab`, `aria-controls`, `aria-selected`).
- Ensure wrappers expose `rb-form-*` hooks needed for responsive grid/flex layouts.

4. `packages/sails-ng-common/src/config/component/tab.outline.ts`
- Add optional config properties for content/action wrapper classes and width behavior.

5. `packages/sails-ng-common/src/config/component/tab.model.ts`
- Add defaults for new tab layout config options.

6. `angular/projects/researchdatabox/form/src/app/component/default-layout.component.ts`
- Replace `<br>` spacing with class-based spacing wrappers.
- Keep validation feedback behavior unchanged.
- Prefer container `gap`; only use margins where container-level gap is not feasible.

7. `angular/projects/researchdatabox/form/src/app/component/inline-layout.component.ts`
- Align inline layout spacing rules with default layout token system.
- Use flex/grid `gap` for inline rows and wrapped states.

8. `angular/projects/researchdatabox/form/src/app/component/group.component.ts`
- Add optional host classes/containers for grid-based child arrangement.

9. `angular/projects/researchdatabox/form/src/app/component/repeatable.component.ts`
- Apply same alignment/width contract to repeatable rows and add buttons.

10. `angular/projects/researchdatabox/form/src/app/component/tab-nav-button.component.ts`
- Add wrapper classes for previous/next button grouping.
- Ensure consistent row alignment with save/cancel group.

11. `angular/projects/researchdatabox/form/src/app/component/save-button.component.ts`
- Ensure save button host participates in shared action row spacing/alignment classes.

12. `packages/redbox-core-types/src/form-config/default-1.0-draft.ts`
- Add/update class hooks on relevant tab/group/action definitions to adopt new layout contract.
- Avoid changing labels/content/i18n keys.

## Testing Plan

### Unit Tests
- `tab.component.spec.ts`
  - Verifies tab layout renders new wrapper classes and ARIA contracts remain valid.
- `tab-nav-button.component.spec.ts`
  - Verifies action-row wrapper classes and prev/next behavior unchanged.
- `save-button.component.spec.ts`
  - Verifies save interactions unchanged after class/layout changes.
- `group.component.spec.ts` and `repeatable.component.spec.ts`
  - Verifies group/repeatable render expected container classes and child count unaffected.
- `form.component.spec.ts`
  - Verifies debug sections still gated by `debugValue` and host classes include form-shell classes.

### Integration/UI Verification
- Use browser verification on these tabs at mobile, tablet, and desktop widths:
  - Welcome
  - Project
  - People
  - Data classification
- Validate:
  - Constant tab panel width across tab switches (within each breakpoint).
  - Consistent left edge for headings/labels/controls/action row.
  - Minimum vertical gap between tab content and action row.
  - Group internals use available width without clipping or overlap.
  - Tab/content/action wrappers reflow correctly at each breakpoint.

### Regression Checks
- Save flow still follows: Save click -> save-requested event -> submit action -> execute save.
- Validation summary link-to-field behavior unchanged.
- No breakage in view mode (`editMode = false`).

## Acceptance Criteria
1. No perceptible horizontal layout shift when switching between tabs.
2. Tab-to-action-row vertical spacing is consistent and meets defined token value.
3. Left-edge alignment is consistent across labels, controls, and action rows.
4. Group and repeatable sections use width more effectively with consistent column behavior.
5. Existing save, validation, and tab navigation behavior remains unchanged.
6. Mobile/tablet layouts are usable without overlap, clipped controls, or unreachable actions.

## Risks and Mitigations
- Risk: CSS/class changes can affect non-RDMP forms.
  - Mitigation: gate new behavior with form-shell class and optional config hooks.
- Risk: Legacy bootstrap classes conflict with new layout rules.
  - Mitigation: introduce namespaced classes (`rb-form-*`) with selectors anchored to form host.
- Risk: Form config edits become too broad.
  - Mitigation: only update classes where needed in `default-1.0-draft` first; then expand.

## Rollout Strategy
1. Land core layout/token changes behind class hooks.
2. Apply hooks to `default-1.0-draft` and validate RDMP edit form.
3. Expand to other form configs after visual regression pass.
4. Keep rollback simple by preserving old class hooks and defaults.

## Integration Strategy
To support embedding within a larger page:

1. **CSS Isolation**:
   - Rely on Angular's default `ViewEncapsulation.Emulated` to scope component styles.
   - Avoid global styles in `src/styles.scss` where possible.
   - Use a specific class prefix `rb-form-` for any necessary shared utility classes.
2. **CSS Variable Scoping**:
   - Define runtime CSS variables on `:host` of `FormComponent` (preferred) to prevent pollution and allow contextual overrides.
   - Keep token declarations in shared stylesheet files (`styles.scss` and optional `_rb-form-variables.scss`) but consume them via host-scoped vars.
3. **Layout Protection**:
   - Apply a CSS reset (e.g., `box-sizing: border-box`, `max-width: 100%`) to the top-level form container to defend against aggressive parent page styles.
4. **Bootstrap Conflict Control**:
   - Use `rb-form-*` namespace and selectors anchored at `redbox-form` host to improve specificity without `!important`.
   - Ensure form app stylesheet load order remains after Bootstrap when feasible.
5. **Encapsulation Decision**:
   - Do not switch to `ViewEncapsulation.None`; keep existing encapsulation and only place intentionally shared utility classes in app/global stylesheet.

## Review Feedback
1. **Responsive Design**: The baseline findings focus on desktop. The plan should explicitly address mobile/tablet viewports. Consider using CSS Grid/Flexbox with `gap` for layout to naturally handle wrapping, rather than rigid widths.
2. **CSS Architecture**:
   - Since `styles.scss` is currently minimal, adding variables there is appropriate. Consider isolating them in a `_variables.scss` partial if they grow.
   - Clarify if `ViewEncapsulation.None` will be used for host-level styles in `form.component.ts` to ensure they cascade correctly to children, or if these will reside in `styles.scss`.
   - Ensure `rb-form-*` classes have high enough specificity or are loaded after Bootstrap to prevent conflicts.
3. **Spacing Strategy**: Strongly support replacing `<br>` with CSS. Recommend using `gap` property on container elements (flex/grid) rather than margins on children where possible, as it prevents external margin collapsing issues.

### Feedback Addressed
- Added explicit mobile/tablet/desktop behavior in architecture, implementation phases, testing, and acceptance criteria.
- Added CSS architecture decisions for token placement (`styles.scss` + optional `_rb-form-variables.scss`), host-scoped runtime variables, and bootstrap conflict controls.
- Added a clear `gap`-first spacing policy and wired it into component-level tasks (`default-layout`, `inline-layout`, `tab` wrappers).
- Confirmed encapsulation direction: keep existing encapsulation, avoid `ViewEncapsulation.None`.
