# Implementation Plan - Accordion Component And View-Mode Tab Transformation

## Goal
Introduce an accordion component in the form framework and render tab-style form sections as accordion panels when form mode is `view`, while leaving edit mode tab behavior unchanged.

## Baseline Observations
- `TabComponent` and `TabContentComponent` currently drive tab UI and selected-state behavior.
- `ConstructFormConfigVisitor` currently builds tab definitions but does not construct accordion definitions.
- `FormOverride` currently provides default view transforms for inputs to content, but no tab-to-accordion default transform.
- Existing tests already cover `formMode` behavior in `construct.visitor.test.ts`, giving a good base for extension.

## Key Design Decisions
- Use a first-class accordion definition (`AccordionComponent` + panel definition) rather than only CSS/markup changes inside tab components.
- Perform tab-to-accordion mapping using the existing form override transform pattern (`overrides.formModeClasses` + default transforms), consistent with existing view-mode transforms.
- Preserve tab behavior and existing config schema compatibility for `edit` mode.
- Support direct `AccordionComponent` authoring in form config in this iteration.

## Detailed Change Plan

### 1. Add Component Config Types And Outlines (`packages/sails-ng-common`)
- Add `src/config/component/accordion.model.ts`:
  - `AccordionFieldComponentConfig`
  - `AccordionPanelFieldComponentConfig`
  - optional layout config if distinct layout controls are needed.
- Add `src/config/component/accordion.outline.ts`:
  - `AccordionComponentName`, `AccordionPanelComponentName` constants.
  - Frame/outline definitions mirroring tab/tab-content pattern.
- Update exports/index files where component models/outlines are re-exported.

### 2. Register New Definitions In Dictionaries
- Update `packages/sails-ng-common/src/config/dictionary.outline.ts` and related dictionary maps so accordion and accordion-panel definitions are part of union types and construct mappings.

### 3. Extend Construct Visitor
- Update `packages/sails-ng-common/src/config/visitor/construct.visitor.ts`:
  - Implement visitor handlers for direct accordion/accordion-panel definitions.
  - Preserve lineage path handling for nested child component definitions.

### 4. Extend Form Override Transform
- Update `packages/sails-ng-common/src/config/form-override.model.ts`:
  - Add default `view` transform for `TabComponent` to `AccordionComponent`.
  - Implement tab-to-accordion conversion helper(s) aligned with existing transform method conventions.
  - When tab content entries are invalid/missing, log warning and skip the entry.
  - Apply header fallback chain for panel labels: `tab.layout.config.buttonLabel -> tab.name -> panel index`.
  - Set transformed view-mode default `startingOpenMode` to `all-open`.

### 5. Add Angular Accordion Components
- Add `angular/projects/researchdatabox/form/src/app/component/accordion.component.ts`:
  - Accordion container component.
  - Accordion panel/content component.
  - support multiple simultaneously-open panels.
  - support `startingOpenMode` values: `all-open`, `first-open`, `last-open`.
  - default to `all-open` when directly-authored config omits `startingOpenMode`.
- Update component module declarations/exports as needed.
- Keep styling class structure aligned with legacy `TabOrAccordionContainerComponent` expectations where possible.
- Do not define color preferences in Angular component CSS; consume core branding SCSS tokens/hooks only.

### 6. Wire Component Resolution
- Update `angular/projects/researchdatabox/form/src/app/form.service.ts` static component class map so accordion definitions resolve to the new Angular classes.

### 7. Testing
- Update `packages/sails-ng-common/test/unit/construct.visitor.test.ts`:
  - direct `AccordionComponent` definitions construct successfully.
  - empty tab array does not throw.
  - malformed non-tab children are ignored with warning logs.
- Add/update `packages/sails-ng-common/test/unit/client.visitor.test.ts` (or the most relevant override-path unit test):
  - `view` mode tab input yields accordion output through override transform path.
  - `edit` mode tab input remains tab output.
- Add/update `packages/sails-ng-common/test/unit/form-override.model.test.ts` (if present):
  - fallback header chain behavior.
  - transformed view-mode default `startingOpenMode = all-open`.
  - warning + skip behavior for invalid tab-content entries.
- Add `angular/projects/researchdatabox/form/src/app/component/accordion.component.spec.ts`:
  - renders expected number of panels.
  - toggles open/close panel state correctly.
  - `startingOpenMode` behavior for `all-open`, `first-open`, and `last-open`.
  - directly-authored config without `startingOpenMode` defaults to `all-open`.
  - multiple simultaneous open panels are supported.
- Update `angular/projects/researchdatabox/form/src/app/form.service.spec.ts`:
  - verifies component map can instantiate accordion classes.

## Behavior Specification
- `edit` mode:
  - No change to tab layout/component semantics.
- `view` mode:
  - Tab group is rendered as accordion.
  - Panel title fallback chain is `tab.layout.config.buttonLabel -> tab.name -> panel index`.
  - Child components render in panel body in the same order as tab content definitions.
  - Transformed tabs default to `startingOpenMode = all-open`.
  - Accordion allows multiple panels open simultaneously.
  - Invalid/missing tab-content entries are skipped with warning logs.
- Directly-authored `AccordionComponent` defaults to `startingOpenMode = all-open` when not explicitly set.

## Acceptance Criteria
- No regression in existing tab edit-mode flows.
- View mode shows accordion UI for tab-defined sections.
- Form configs containing tabs require no migration.
- Unit test coverage added for transformation branch and accordion rendering state.
- Existing relevant tests continue to pass.

## Risks And Mitigations
- Risk: mismatch between tab selected semantics and accordion default-open behavior.
  - Mitigation: enforce `startingOpenMode` behavior (`all-open|first-open|last-open`) in tests and spec.
- Risk: lineage path regressions for nested panel fields.
  - Mitigation: include lineage-path assertions in construct visitor tests.
- Risk: styling regressions in existing themes.
  - Mitigation: preserve legacy accordion class hooks where possible and route color styling through core branding SCSS only.

## Rollout And Fallback
- Rollout behind config-mode behavior only (`view` transformation path); no schema migration.
- If regressions occur, temporarily disable view-mode tab transformation and retain tab rendering in both modes while keeping accordion component code isolated.
