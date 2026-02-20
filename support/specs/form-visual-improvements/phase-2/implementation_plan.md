# Form Visual Improvements - Phase 2 Implementation Plan

## Objective
Phase 2 hardens the form layout framework so it remains **configuration-by-convention** while preserving strong override flexibility and avoiding behavioral coupling to incidental CSS classes.

This phase specifically addresses the issues uncovered during Phase 1 implementation:
- tab layout fallback behavior encoded in component templates,
- action-row behavior leaking into generic `GroupComponent` behavior,
- wrapper/default classes (e.g. Bootstrap `row`) unintentionally overriding layout intent.

## Design Intent

### Core Principles
1. Convention-first defaults
- Components should render sensible defaults when config is minimal.
- Defaults live in config model defaults, not in ad-hoc template logic.

2. Explicit overrides
- Form config can always override convention defaults using documented hooks.
- No hidden behavior tied to unrelated CSS classes.

3. Separation of concerns
- Layout behavior is expressed through layout contracts and config.
- Generic components (`GroupComponent`, `TabComponent`) should not special-case by visual class name.

4. Backward compatibility
- Existing forms should continue to render safely.
- Legacy class hooks remain supported during migration.

## Scope

### In Scope
- Formalize Phase 2 contracts for tab shell and action row behavior.
- Introduce a dedicated action-row layout contract (instead of `GroupComponent` branching).
- Centralize defaults in `sails-ng-common` model defaults.
- Remove component-level style fallbacks that bypass config contracts.
- Add migration strategy for `default-1.0-draft` and future forms.
- Add tests for convention/default behavior and explicit override behavior.

### Out of Scope
- i18n label/content corrections.
- non-form app visual redesign.
- broad migration of every historical form config in this phase.

## Current State Summary (Problems to Solve)
1. `TabComponentLayout` uses hardcoded fallback class strings in template.
- This bypasses declared model defaults and can mask missing config defects.

2. `GroupComponent` includes action-row-specific behavior.
- Generic group rendering now depends on host class content, reducing composability.

3. Action row wrappers can inherit legacy `row` classes and stack unexpectedly.
- Layout correctness depends on CSS overrides rather than explicit contract.

4. Missing formal contract for action bar composition.
- Action rows are currently emulated through generic group + class conventions.

## Target Architecture

### A. Tab Layout Contract (Convention + Override)

#### Contract
- `TabFieldLayoutConfig` is the single source of default class hooks for tab shell.
- `TabComponentLayout` should consume only configured/defaulted properties.
- No hardcoded class literals in component template logic.

#### Default Behavior
- Defaults come from `packages/sails-ng-common/src/config/component/tab.model.ts`.
- Template binds directly to properties expected to always resolve via defaults.

#### Override Behavior
- Forms can override `tabShellCssClass`, `tabNavWrapperCssClass`, `tabPanelWrapperCssClass`, `buttonSectionCssClass`, `tabPaneCssClass`, `tabPaneActiveCssClass`.

### B. Action Row as First-Class Layout Contract

#### Contract
Introduce dedicated action-row layout semantics instead of generic group special-casing.

Recommended approach:
1. Add `ActionRowLayout` in `sails-ng-common` field-layout model/outline.
2. `ActionRowLayout` defines:
- container class,
- alignment strategy (`start | end | space-between`),
- wrapping policy,
- slot behavior for child actions,
- optional compaction tokens.

3. In form config, action bar group uses `layout.class = "ActionRowLayout"`.

#### Component Responsibilities
- `GroupComponent` remains generic and does not inspect host classes to alter structure.
- `ActionRowLayout` owns rendering wrapper semantics for grouped action controls.

### C. Wrapper Class Policy

#### Contract
- Document wrapper precedence order:
1. Explicit `wrapperCssClasses` on component config.
2. Layout host classes.
3. `defaultComponentCssClasses` fallback.

- For action row contexts, discourage Bootstrap structural classes (`row`) unless intentionally configured.

#### Enforcement
- Add a non-blocking warning in dev logs when action-row components resolve to `row` and no explicit action wrapper class exists.
- Keep runtime permissive for compatibility.

## Implementation Workstreams

### Workstream 1: Formalize Contracts in `sails-ng-common`
Files:
- `packages/sails-ng-common/src/config/component/tab.outline.ts`
- `packages/sails-ng-common/src/config/component/tab.model.ts`
- `packages/sails-ng-common/src/config/component/*` (new action row layout files)
- dictionary/visitor mappings where required.

Tasks:
1. Confirm and finalize tab layout config property docs.
2. Add new `ActionRowLayout` outline/model and defaults.
3. Register layout in component/layout dictionaries and visitor map.
4. Add default values supporting convention-first behavior.

Deliverable:
- Contracts fully described and type-safe.

### Workstream 2: Refactor Angular Form Rendering to Contracts
Files:
- `angular/projects/researchdatabox/form/src/app/component/tab.component.ts`
- `angular/projects/researchdatabox/form/src/app/component/group.component.ts`
- `angular/projects/researchdatabox/form/src/app/component/default-layout.component.ts`
- `angular/projects/researchdatabox/form/src/app/component/inline-layout.component.ts`
- `angular/projects/researchdatabox/form/src/app/form.component.scss`

Tasks:
1. Remove template hardcoded fallback classes from tab layout.
2. Remove action-row branching from `GroupComponent`.
3. Implement `ActionRowLayout` renderer (or wrapper-level layout behavior) to own action-row structure.
4. Keep CSS selectors contract-driven (`rb-form-*`) and bound to layout usage.
5. Reduce CSS patching that compensates for incorrect component structure.

Deliverable:
- Behavior driven by layout contracts, not ad-hoc component logic.

### Workstream 3: Form Config Migration (RDMP default)
Files:
- `packages/redbox-core-types/src/form-config/default-1.0-draft.ts`

Tasks:
1. Update `GroupComponent-fields-5` to `ActionRowLayout`.
2. Keep `wrapperCssClasses` explicit for action slots.
3. Remove temporary compatibility classes once no longer needed.
4. Validate tabs still use explicit layout overrides where desired.

Deliverable:
- `default-1.0-draft` uses first-class contracts and remains readable.

### Workstream 4: Tests and Guardrails
Files:
- `angular/projects/researchdatabox/form/src/app/component/tab.component.spec.ts`
- `angular/projects/researchdatabox/form/src/app/component/group.component.spec.ts`
- new `action-row-layout.component.spec.ts` (or equivalent)
- `angular/projects/researchdatabox/form/src/app/form.component.spec.ts`
- relevant `sails-ng-common` tests for model defaults.

Tasks:
1. Test tab convention defaults apply without explicit config values.
2. Test tab explicit overrides take precedence.
3. Test group component is structure-stable and generic.
4. Test action row layout renders all action controls inline by default.
5. Test action row wrapping behavior on narrow viewport.
6. Test save/tab-nav/cancel interactions unchanged.

Deliverable:
- Regression protection for contract behavior and override precedence.

## Detailed Change List

### 1. Tab behavior cleanup
- Remove `|| "rb-form-..."` template fallbacks from tab layout template.
- Ensure model defaults guarantee non-empty values in normal operation.

### 2. Group behavior cleanup
- Remove `isActionRowHost` style-based branching logic from `GroupComponent`.
- Restore one generic container path.

### 3. Add dedicated action row layout
- Add new layout class and config interfaces.
- Use explicit template/container class semantics for action rows.
- Move action-row-specific spacing rules under this layout contract.

### 4. CSS consolidation
- Keep token-driven spacing and width system.
- Remove CSS rules that patch around group special-cases.
- Keep only contract-aligned rules for `rb-form-action-row`, action slots, and inline behavior.

### 5. Config migration
- Update only `default-1.0-draft` in this phase.
- Add migration notes for other form configs.

## Backward Compatibility Strategy
1. Keep existing legacy layout classes functional.
2. Map existing class hooks to new action-row layout where feasible.
3. Provide temporary alias behavior for one release cycle if needed.
4. Add migration notes:
- before: `GroupComponent + hostCssClasses: rb-form-action-row`
- after: `layout.class: ActionRowLayout`.

## Verification Plan

### Unit
- `ng test @researchdatabox/form` subset for tab/group/action components.
- `npm run test:sails-ng-common` for config model behavior.

### Compile
- `npm run compile:sails-ng-common`
- `npm run compile:core`
- `npm run compile:ng`

### Browser
Use redbox dev login workflow and verify:
- URL: `/default/rdmp/record/rdmp/edit`
- Expected:
1. Tab nav left on desktop.
2. Action bar inline in one row where space allows.
3. Predictable wrap on smaller width.
4. No tab/content horizontal jumps.
5. Save/Cancel/Tab navigation behavior intact.

### Responsive checks
- mobile: 390px
- tablet: 768px
- desktop: >=1200px

## Risks and Mitigations
1. Risk: New layout class introduces migration burden.
- Mitigation: keep conventions and aliases; migrate only RDMP default first.

2. Risk: Existing forms rely on implicit Bootstrap rows.
- Mitigation: preserve fallback behavior unless action layout explicitly applied.

3. Risk: CSS specificity regressions.
- Mitigation: scope under form host + layout class; avoid global overrides.

4. Risk: Increased complexity in layout dictionary.
- Mitigation: document contract and provide small reference examples.

## Acceptance Criteria
1. Tab layout is contract-driven without hardcoded template fallbacks.
2. `GroupComponent` contains no action-row-specific branching.
3. Action row is implemented via dedicated layout contract.
4. `default-1.0-draft` action controls render inline consistently at desktop widths.
5. Form behavior (save/validation/tab flow) remains unchanged.
6. Convention defaults work when minimal config is supplied.
7. Explicit config overrides convention defaults deterministically.

## Rollout
1. Land `sails-ng-common` contract additions.
2. Land Angular renderer refactor.
3. Migrate `default-1.0-draft`.
4. Run compile + tests + browser verification.
5. Share migration snippet for other form configs.

## Open Questions for Review
1. Should `ActionRowLayout` be reusable beyond footer actions (e.g. repeatable controls)?
2. Should we emit runtime warnings for structural Bootstrap classes (`row`, `col-*`) in action context, or keep silent compatibility?
3. Should action-row alignment defaults be `end` or `space-between` for broader portal consistency?
