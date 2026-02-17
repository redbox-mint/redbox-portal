# Typeahead Component Task List

## 1. Data Model (Waterline Models)
- [ ] Confirm no Waterline schema/index changes are needed.
- [ ] Unit test task: verify no migration artifacts are required.

## 2. Services Layer (Business Logic)
- [ ] Validate existing backend response contracts for `/vocab/:vocabIdOrSlug/entries` and `/query/vocab/:queryId`.
- [ ] Document named-query mapping defaults (`labelField`, `valueField`) for service normalization.
- [ ] Write contract/mapping artifact: `support/specs/typeahead-component/backend-contract-mapping.md`.
- [ ] Create `angular/projects/researchdatabox/form/src/app/service/typeahead-data.service.ts`.
- [ ] Unit test task: create `angular/projects/researchdatabox/form/src/app/service/typeahead-data.service.spec.ts`.

## 3. `sails-ng-common` Component Contracts
- [ ] Create `packages/sails-ng-common/src/config/component/typeahead-input.outline.ts` with full config contract.
- [ ] Create `packages/sails-ng-common/src/config/component/typeahead-input.model.ts` with map/default definitions.
- [ ] Update `packages/sails-ng-common/src/config/dictionary.outline.ts`.
- [ ] Update `packages/sails-ng-common/src/config/dictionary.model.ts`.
- [ ] Update `packages/sails-ng-common/src/index.ts` with new exports.

## 4. Visitor Infrastructure Prerequisites
- [ ] Update `packages/sails-ng-common/src/config/visitor/base.outline.ts` with typeahead method signatures.
- [ ] Update `packages/sails-ng-common/src/config/visitor/base.model.ts` with default/stub implementations.

## 5. Visitor Implementations
- [ ] Update `packages/sails-ng-common/src/config/visitor/construct.visitor.ts` for defaults/coercion/reusable behavior.
- [ ] Update `packages/sails-ng-common/src/config/visitor/client.visitor.ts` for client-safe config shaping.
- [ ] Update `packages/sails-ng-common/src/config/visitor/data-value.visitor.ts` for `valueMode` extraction behavior.
- [ ] Update `packages/sails-ng-common/src/config/visitor/json-type-def.visitor.ts` for schema output by `valueMode`.
- [ ] Update `packages/sails-ng-common/src/config/visitor/validator.visitor.ts` for source-specific required fields and unsupported `multiSelect` guard.
- [ ] Update `packages/sails-ng-common/src/config/visitor/template.visitor.ts` (stub/no-op unless templating fields are introduced).
- [ ] Update `packages/sails-ng-common/src/config/visitor/migrate-config-v4-v5.visitor.ts` with explicit legacy mapping:
  - `VocabField`/`VocabFieldComponent` -> `TypeaheadInput`
  - map `vocabQueryId`, `sourceType=query`, `titleFieldName`/fallbacks, and `storeLabelOnly`
  - warn on dropped/unmappable legacy properties
- [ ] Unit test task: add/extend tests in `packages/sails-ng-common/test/unit/*` for all touched visitors.

## 6. Compile Verification Gate
- [ ] Run `npm run compile:all` after `sails-ng-common` changes; fix all type errors before Angular runtime work.

## 7. Angular App Implementation
- [ ] Verify generator path: `redbox-hook-kit generate form-component typeahead-input --app form`.
- [ ] Fallback task: if generator is unsuitable, manually scaffold based on `dropdown-input` and `checkbox-tree` conventions.
- [ ] Create `angular/projects/researchdatabox/form/src/app/component/typeahead-input.component.ts`.
- [ ] Keep Angular model class in same file as component.
- [ ] Ensure `standalone: false`.
- [ ] Implement `setPropertiesFromComponentMapEntry(...)` and async `initData()` lifecycle behavior.
- [ ] Update `angular/projects/researchdatabox/form/src/app/form.module.ts` with `TypeaheadModule.forRoot()` and declarations.
- [ ] Update `angular/projects/researchdatabox/form/src/app/static-comp-field.dictionary.ts` component/model registrations.
- [ ] Document `ngx-bootstrap` TypeaheadDirective input mapping (config-bound vs hardcoded defaults).
- [ ] Unit test task: create `angular/projects/researchdatabox/form/src/app/component/typeahead-input.component.spec.ts`.
- [ ] Unit test task: extend existing `angular/projects/researchdatabox/form/src/app/form-component.integration.spec.ts` for config-driven rendering (file verified present).

## 8. UX + Accessibility Behaviors
- [ ] Implement explicit states: idle, loading, no-results, error, misconfigured.
- [ ] Implement free-text behavior (`allowFreeText`) and value storage behavior by `valueMode`.
- [ ] Implement pre-populated rendering for `valueMode='value'` including non-blocking remote label resolution and fallback to raw value.
- [ ] Implement pre-populated rendering for `valueMode='optionObject'` using stored label/value.
- [ ] Implement legacy value coercion on load for migrated `VocabField` values (string/object variants).
- [ ] Implement disabled/read-only behavior so dropdown does not open and value cannot be mutated.
- [ ] Implement keyboard/ARIA semantics and live-region announcements.
- [ ] Unit test task: add accessibility and state-behavior assertions.
- [ ] Unit test task: add legacy-value coercion tests for:
  - string values (`storeLabelOnly=true`)
  - object values (`storeLabelOnly=false`)
  - malformed values (safe null + warning)

## 9. Sample Form Config Fixtures
- [ ] Create `support/specs/typeahead-component/form-config-samples.json` with examples for:
  - static source
  - vocabulary source
  - namedQuery source
  - freeText + `valueMode` variants
- [ ] Use fixture entries for manual verification notes and integration checks.

## 10. Controller/API Regression Validation
- [ ] Confirm no new endpoint is required.
- [ ] Backend patch task: only if a hard contract gap is found.
- [ ] Unit test task: update `packages/redbox-core-types/test/controllers/FormVocabularyController.test.ts` only when backend behavior changes.

## 11. Quality and Integration Gates
- [ ] Code review task: run `redbox-feature-implementation-review`; write findings to `issues.json` if present.
- [ ] Conditional task: if `issues.json` exists, fix all issues and delete the file.
- [ ] Conditional task: rerun `redbox-feature-implementation-review`.
- [ ] Integration gate: run `npm run test:mocha` and do not continue until passing.
- [ ] Integration gate: run `npm run test:bruno` as regression-only verification (no new API surface) and do not continue until passing.
- [ ] Final gate: rerun both integration suites.

## 12. Bundle + Visual Smoke Checks
- [ ] Smoke-test that `TypeaheadModule` import does not conflict with existing `ngx-bootstrap` modules.
- [ ] Verify dropdown overlay/z-index/positioning in representative forms.

## Skill Usage
- `redbox-feature-design-planner`
- `Redbox Form Components`
- `Redbox Angular Apps`
- `Redbox Angular Services`
- `Redbox Form Config`
- `Redbox Controllers`
- `Redbox Services`
- `Redbox Testing`
- `Web Interface Verification`
- `Redbox Feature Implementation Review`

## Skill Gaps
- Missing dedicated skill for automated accessibility auditing (axe/pa11y).
- Missing dedicated skill for visual regression testing of dynamic overlays/dropdowns.
- Proposed new skills:
  - `Redbox Accessibility Verification`
  - `Redbox Visual Regression Verification`
