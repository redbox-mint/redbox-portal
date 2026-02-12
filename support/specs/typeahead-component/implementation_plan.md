# Typeahead Component Implementation Plan

## Step 1: Confirm backend contracts first
- Validate exact response shapes for:
  - `GET /:branding/:portal/vocab/:vocabIdOrSlug/entries`
  - `GET /:branding/:portal/query/vocab/:queryId`
- Produce a short mapping table for named-query `labelField/valueField` defaults.
- Write the mapping table to:
  - `support/specs/typeahead-component/backend-contract-mapping.md`
- If hard gaps exist, define minimal backend patch before Angular implementation.
- Skills: `Redbox Controllers`, `Redbox Services`

## Step 2: Verify generator availability + fallback
- Attempt scaffold:
  - `redbox-hook-kit generate form-component typeahead-input --app form`
- If generator output is unsuitable/missing, manually scaffold using `dropdown-input` + `checkbox-tree` patterns.
- Skills: `Redbox Form Components`

## Step 3: Define `sails-ng-common` contracts
- Create:
  - `packages/sails-ng-common/src/config/component/typeahead-input.outline.ts`
  - `packages/sails-ng-common/src/config/component/typeahead-input.model.ts`
- Include complete config schema (source selection, free text, value mode, performance knobs).
- Skills: `Redbox Form Components`

## Step 4: Register dictionaries + barrel exports
- Update:
  - `packages/sails-ng-common/src/config/dictionary.outline.ts`
  - `packages/sails-ng-common/src/config/dictionary.model.ts`
  - `packages/sails-ng-common/src/index.ts`
- Skills: `Redbox Form Components`

## Step 5: Add visitor interface prerequisites
- Update:
  - `packages/sails-ng-common/src/config/visitor/base.outline.ts`
  - `packages/sails-ng-common/src/config/visitor/base.model.ts`
- Add required methods:
  - `visitTypeaheadInputFieldComponentDefinition`
  - `visitTypeaheadInputFieldModelDefinition`
  - `visitTypeaheadInputFormComponentDefinition`
- Skills: `Redbox Form Components`

## Step 6: Implement per-visitor behavior
- `construct.visitor.ts`:
  - instantiate typeahead definitions
  - apply defaults/coercions
  - preserve reusable behavior
- `client.visitor.ts`:
  - sanitize client-safe config
  - strip unsupported/undefined values
- `data-value.visitor.ts`:
  - enforce extraction for selected value based on `valueMode`
- `json-type-def.visitor.ts`:
  - emit schema reflecting `valueMode` (`string|null` vs object)
- `validator.visitor.ts`:
  - enforce required config by source type
  - reject unsupported `multiSelect=true`
- `template.visitor.ts`:
  - only implement if template-capable fields are added (otherwise no-op method)
- `migrate-config-v4-v5.visitor.ts`:
  - add explicit mapping for legacy `VocabField`/`VocabFieldComponent` to `TypeaheadInput`
  - map legacy config keys (`vocabQueryId`, `sourceType=query`, `titleFieldName`, `storeLabelOnly`)
  - emit warnings for unmapped legacy behaviors (`forceClone`, legacy publish/subscribe constructs, etc.)
- Skills: `Redbox Form Components`

## Step 7: Compile gate after `sails-ng-common` work
- Run compile/type check gate before Angular coding:
  - `npm run compile:all` (or package-specific compile if faster and equivalent)
- Resolve all type issues before proceeding.
- Skills: `Redbox Testing`

## Step 8: Implement Angular data service
- Create `angular/projects/researchdatabox/form/src/app/service/typeahead-data.service.ts`.
- Normalize source responses and add optional caching behavior.
- Create `typeahead-data.service.spec.ts`.
- Skills: `Redbox Angular Services`, `Redbox Testing`

## Step 9: Implement Angular component + module wiring
- Create `angular/projects/researchdatabox/form/src/app/component/typeahead-input.component.ts` with:
  - Angular-side model class in same file
  - `standalone: false`
  - `setPropertiesFromComponentMapEntry(...)`
  - `initData()` async lifecycle usage
  - Reactive Forms integration
- Wire into:
  - `angular/projects/researchdatabox/form/src/app/form.module.ts`
  - `angular/projects/researchdatabox/form/src/app/static-comp-field.dictionary.ts`
- Document which `TypeaheadDirective` inputs are bound from config vs hardcoded defaults.
- Skills: `Redbox Angular Apps`, `Redbox Form Components`

## Step 10: Accessibility/UX hardening pass on implemented component
- Define and implement explicit field-level states:
  - idle, loading, no-results, error, misconfigured
- Validate keyboard/ARIA behavior with typeahead dropdown interactions.
- Ensure validation and live-region announcements are wired.
- Verify disabled/read-only modes prevent dropdown interaction and value mutation.
- Implement and verify legacy-value coercion behavior in edit/load flows (string/object legacy inputs).
- Skills: `Web Interface Verification`

## Step 11: Create sample form config fixtures
- Add fixtures exercising all source types and key flags:
  - static
  - vocabulary
  - namedQuery
  - freeText/valueMode variants
- Use fixtures for manual test and integration assertions.
- Skills: `Redbox Form Config`, `Redbox Testing`

## Step 12: Test and quality gates
- Run unit tests for:
  - component
  - service
  - visitor changes
  - legacy config migration + legacy value coercion
- Run `redbox-feature-implementation-review` gate before each integration stage.
- Run integration gates:
  - Mocha
  - Bruno (regression-only; no new endpoints)
  - final rerun of both suites
- Skills: `Redbox Testing`, `Redbox Feature Implementation Review`

## Step 13: Bundle/CSS smoke checks
- Verify `TypeaheadModule` import does not break existing `ngx-bootstrap` usage.
- Smoke-check dropdown overlay positioning/z-index in real form layouts.
- Skills: `Web Interface Verification`
