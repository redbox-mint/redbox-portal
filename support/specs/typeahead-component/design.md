# Typeahead Form Component Design

## Goal
Add a reusable `TypeaheadInput` form component in the embedded Angular form app using `ngx-bootstrap` typeahead.

The component must support autocomplete from three sources:
1. Static options in component config
2. `VocabularyEntry` search for a configured vocabulary
3. Named query search via `FormVocabularyController.getRecords`

The component must satisfy WCAG requirements and integrate with existing ReDBox form model/visitor infrastructure.

---

# Design

## 1. Data Model (Waterline Models)
- No new Waterline models are required.
- Existing backend entities used:
  - `Vocabulary`
  - `VocabularyEntry`
  - named-query-backed records from existing query pipeline
- No schema/index/lifecycle hook changes.

## 2. Services Layer (Business Logic)
Add one Angular service to normalize source-specific responses into a single option contract.

Proposed service:
- `angular/projects/researchdatabox/form/src/app/service/typeahead-data.service.ts`

Service responsibilities:
- `searchStatic(...)`: client-side filtering of static options
- `searchVocabularyEntries(...)`: call `/vocab/:vocabIdOrSlug/entries`
- `searchNamedQuery(...)`: call `/query/vocab/:queryId`
- normalize to `TypeaheadOption`
- emit typed loading/empty/error states consumable by component

Conventions:
- extend `HttpClientService`
- call `waitForInit()` before requests
- preserve CSRF + branding/portal URL context

## 3. Webservice Controllers (REST API)
- No new REST endpoints required.

## 4. Ajax Controllers (Controllers)
Reuse existing endpoints:
- `GET /:branding/:portal/vocab/:vocabIdOrSlug/entries`
- `GET /:branding/:portal/query/vocab/:queryId`

No mandatory controller changes unless contract gaps are discovered.

## 5. Angular App(s)
Add new component and model in the same file (existing convention):
- `angular/projects/researchdatabox/form/src/app/component/typeahead-input.component.ts`

Constraints:
- `standalone: false` (match existing form components)
- Reactive Forms integration only
- async setup via `initData()` lifecycle hook
- config parsing in `setPropertiesFromComponentMapEntry(...)`

Add config/model contracts in `sails-ng-common`:
- `packages/sails-ng-common/src/config/component/typeahead-input.outline.ts`
- `packages/sails-ng-common/src/config/component/typeahead-input.model.ts`

Register in:
- `packages/sails-ng-common/src/config/dictionary.outline.ts`
- `packages/sails-ng-common/src/config/dictionary.model.ts`
- `packages/sails-ng-common/src/config/visitor/*`
- `packages/sails-ng-common/src/index.ts`
- `angular/projects/researchdatabox/form/src/app/form.module.ts`
- `angular/projects/researchdatabox/form/src/app/static-comp-field.dictionary.ts`

## 6. Additional Views
- No new EJS views required.

## 7. Navigation Configuration
- No navigation changes required.

---

# Component Config Contract

```ts
type TypeaheadSourceType = 'static' | 'vocabulary' | 'namedQuery';
type TypeaheadValueMode = 'value' | 'optionObject';
type TypeaheadStoredSourceType = TypeaheadSourceType | 'freeText';

interface TypeaheadOption {
  label: string;
  value: string;
  sourceType?: TypeaheadSourceType;
  raw?: unknown; // runtime-only payload for rendering/selection context; never persisted
}

interface TypeaheadInputFieldComponentConfig {
  sourceType: TypeaheadSourceType;
  staticOptions?: TypeaheadOption[];
  vocabRef?: string;
  queryId?: string;
  labelField?: string;    // named-query mapping path (dot notation, e.g. "display.label")
  valueField?: string;    // named-query mapping path (dot notation)
  minChars?: number;      // default 2
  debounceMs?: number;    // default 250
  maxResults?: number;    // default 25
  allowFreeText?: boolean;// default false
  valueMode?: TypeaheadValueMode; // default 'value'
  cacheResults?: boolean; // default true for vocabulary/static, false for namedQuery
  multiSelect?: boolean;  // reserved; must be false for current implementation
  placeholder?: string;   // optional input placeholder text
}
```

Validation/default behavior:
- `sourceType` required.
- `sourceType='static'`: requires `staticOptions`.
- `sourceType='vocabulary'`: requires `vocabRef`.
- `sourceType='namedQuery'`: requires `queryId`; defaults `labelField='label'`, `valueField='value'`.
- `multiSelect=true` is rejected by validator (not in scope for this release).

# Stored Value Contract

Default model shape is explicit and configurable:
- `valueMode='value'` (default): store `string | null`
- `valueMode='optionObject'`: store `{ label: string; value: string; sourceType?: string } | null`

Free-text behavior (`allowFreeText=true`):
- `valueMode='value'`: store typed text string
- `valueMode='optionObject'`: store `{ label: typed, value: typed, sourceType: 'freeText' }`

This contract must be reflected consistently in:
- `data-value.visitor.ts`
- `json-type-def.visitor.ts`
- merge/extract flows that consume form values

`raw` handling:
- `raw` is runtime-only and may contain upstream payload snippets for rendering.
- `raw` must not be written to form model values or persisted output.

# UX Behavior Contract

- Loading: show inline `Searching...` indicator and announce via live region.
- Empty input: no remote call until `minChars` met; show helper text if configured.
- No results: show `No matches found` state (SR announced).
- API error: show non-blocking inline error for this field; keep form usable and preserve last valid selection.
- Misconfiguration (`vocabRef/queryId` missing): show configuration error in dev-friendly way, field invalid.
- Disabled/read-only:
  - disabled: input is non-interactive, dropdown must not open.
  - read-only: input remains focusable for screen readers but no suggestion interaction or value mutation.
- Pre-populated values:
  - for `valueMode='value'`, render stored string immediately.
  - if remote source is configured, perform a non-blocking background label lookup.
  - if lookup succeeds, replace display text with resolved label; if lookup fails, keep raw stored string visible.
  - lookup does not block form initialization/readiness.
  - for `valueMode='optionObject'`, use stored label directly.

# Reusable Config Support

`TypeaheadInput` must be compatible with reusable config flows in construct visitor (same behavior as existing field components). No special casing beyond normal reusable expansion rules.

# Legacy `VocabField` Migration

This feature must migrate legacy form config and values used by:
- `class: 'VocabField'`
- `compClass: 'VocabFieldComponent'`

## Config Mapping (`v4` -> `v5 TypeaheadInput`)

- `class/compClass` -> `TypeaheadInputComponent` + `TypeaheadInputModel`
- `definition.vocabQueryId` -> `queryId`
- `definition.sourceType='query'` -> `sourceType='namedQuery'`
- `definition.titleFieldName` -> `labelField` (first priority)
- `definition.stringLabelToField` -> `labelField` (fallback)
- `definition.titleFieldArr[0]` -> `labelField` (fallback)
- `definition.storeLabelOnly=true` -> `valueMode='value'`
- `definition.storeLabelOnly=false` -> `valueMode='optionObject'`
- `definition.disableEditAfterSelect=true` -> read-only-after-select runtime behavior
- `definition.required` -> required validator (existing shared model mapping path)

Legacy fields such as `forceClone`, `completerService`, `lookupService`, `publish`, `subscribe`, and expression-specific flags that do not map 1:1 must be:
- ignored safely, and
- logged as migration warnings (with form path) when behavior is dropped.

## Legacy Value Coercion Rules

Existing record values may be string-only or object-like. Coercion target is based on `valueMode`.

- Target `valueMode='value'`:
  - string -> unchanged
  - object -> resolve string from `labelField`, then `title`, then `label`, then `value`
  - unsupported shapes -> `null` with warning

- Target `valueMode='optionObject'`:
  - object with label/value -> map directly to `{label, value, sourceType}`
  - string -> `{label: string, value: string, sourceType: 'freeText'}`
  - unsupported shapes -> `null` with warning

Normalization strategy:
- coerce values non-blockingly on load/edit path, then keep normalized shape for subsequent saves.
- do not block form render if coercion fails; show field-level warning state in logs/dev diagnostics.

This must be covered in migration + component tests using real legacy examples.

# WCAG Notes

`ngx-bootstrap` provides baseline keyboard/list behaviors, but we still must validate and supplement:
- combobox labeling and `aria-describedby`
- live-region messaging for loading/empty/error
- focus-visible styling consistency
- validation messaging linkage

# ngx-bootstrap Mapping

Config-to-directive mapping:
- `minChars` -> `typeaheadMinLength`
- `debounceMs` -> `typeaheadWaitMs`
- `maxResults` -> `typeaheadOptionsLimit`
- `label` rendering uses `typeaheadOptionField` when object suggestions are bound

Hardcoded defaults (unless later exposed):
- `typeaheadScrollable=true` when results exceed visual max height
- `typeaheadSingleWords=false` to support multi-word terms
- `adaptivePosition=true` (or equivalent) for dropdown placement resilience

# Assumptions
- Existing auth/routing allows access to `/vocab/*` and `/query/vocab/*`.
- `TypeaheadModule` is available in the pinned `ngx-bootstrap` version.
- Form app uses Reactive Forms (not template-driven forms).

# Risks
- Named query payload variance may require robust path extraction (`labelField` / `valueField`).
- Accessibility regressions if default `ngx-bootstrap` markup is assumed sufficient without explicit audit.
- Bundle-size increase from `TypeaheadModule` import.
- Overlay positioning/z-index regressions in complex form layouts.
- Remote-search load spikes if debounce/minChars/caching are misconfigured.

# Future Scope Note
- Enabling `multiSelect` later requires value-type migration from scalar/object to arrays, plus coordinated updates in `construct`, `data-value`, and `json-type-def` visitors.
