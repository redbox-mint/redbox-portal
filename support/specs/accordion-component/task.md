# Accordion Component Spec Task

## Objective

Implement accordion rendering for form sections in view mode while preserving current tab behavior in edit mode.

## Context

Current form rendering supports `TabComponent`/`TabContentComponent`. The original spec proposes introducing a dedicated accordion component and converting tab content when `formMode === "view"`.

## What Was Missing In The Original Draft

- No explicit in-scope vs out-of-scope boundaries.
- No final decision on whether to transform `TabComponent` to accordion via visitor logic or via `formModeClasses` overrides.
- No acceptance criteria for behavior, accessibility, or backwards compatibility.
- No edge-case expectations for empty/malformed tab data.
- No clear test matrix tying code changes to required coverage.

## Scope

### In Scope

- Add `AccordionComponent` definitions/models/outlines in `packages/sails-ng-common`.
- Add Angular accordion rendering components in `angular/projects/researchdatabox/form`.
- Add construct visitor support for direct `AccordionComponent`/panel definitions.
- Add view-mode `TabComponent -> AccordionComponent` transformation using the existing form override (`formModeClasses`) transformation pattern.
- Register component classes in dictionaries/services so dynamic form creation can resolve new types.
- Add and update unit tests for visitor transformation and Angular rendering behavior.

### Out Of Scope

- Replacing tab behavior in edit mode.
- Reworking unrelated form component transform rules.
- Theme overhaul beyond minimum classes/markup needed for accordion behavior.
- New backend API endpoints.

## Constraints And Assumptions

- Angular apps remain embedded in existing server-rendered views (no Angular router changes).
- Existing form config files that define tabs must remain valid without manual migration.
- Default behavior must preserve current forms that rely on tab selected-state semantics.
- Default `startingOpenMode` is `all-open` when not specified on a directly-authored `AccordionComponent`.

## Definition Of Done

- `TabComponent` still renders in edit mode.
- In view mode, tab definitions render as accordion UI with equivalent child content.
- Empty tab lists do not throw runtime errors.
- Accordion supports multiple panels open simultaneously.
- `AccordionComponent` has `startingOpenMode` option with supported values: `all-open`, `first-open`, `last-open`.
- When transformed from `TabComponent` in `view` mode, default `startingOpenMode` is `all-open`.
- When `AccordionComponent` is directly authored and `startingOpenMode` is not provided, default is `all-open`.
- Direct `AccordionComponent` authoring in form config is supported.
- Panel header label uses fallback chain: `tab.layout.config.buttonLabel -> tab.name -> panel index`.
- Invalid/missing tab-content entries are skipped with warning logs (not hard errors).
- Accessibility acceptance criteria for `AccordionComponent`/`TabComponent` conversions are met:
  - toggles/headers expose `aria-expanded` and `aria-controls`; panels expose `role="region"` and `aria-labelledby` linkage.
  - keyboard interactions support `Enter`/`Space` toggles, `Tab`/`Shift+Tab` navigation, and arrow-key header navigation where applicable.
  - screen-reader users receive open/close state announcements and updated focusable state context.
  - focus management is correct when panels open/close (focus preserved or moved intentionally to a valid target).
- Styling follows legacy accordion class contract where possible, and all color-related styling comes from core branding SCSS (no component-local color preferences in Angular CSS).
- Existing tab tests still pass and new accordion tests pass.
- `packages/sails-ng-common/test/unit/construct.visitor.test.ts` includes explicit view/edit assertions for transformation behavior.
- `angular/projects/researchdatabox/form/src/app/form.service.spec.ts` (or component spec files) verifies component-map resolution for accordion classes.

These accessibility requirements must be implemented and asserted in relevant unit/spec files alongside existing checks for `startingOpenMode`, panel header label fallback, and skipping invalid tab-content entries.

## Open Decisions

- None currently.
