# Backend Contract Mapping

## Purpose
Capture the validated response contracts used by `TypeaheadInput` service normalization so implementation decisions are preserved.

## Endpoints

### 1) Vocabulary entries
- Endpoint: `GET /:branding/:portal/vocab/:vocabIdOrSlug/entries`
- Expected request params:
  - `search` (string)
  - `limit` (number)
  - `offset` (number)
- Expected response shape:
  - `data[]` with vocabulary entry fields
  - `meta` with pagination context
- Normalization target:
  - `label <- entry.label`
  - `value <- entry.value`

### 2) Named query records
- Endpoint: `GET /:branding/:portal/query/vocab/:queryId`
- Expected request params:
  - `search` (string)
  - `start` (number)
  - `rows` (number)
- Expected response shape:
  - existing `FormVocabularyController.getRecords` payload (query dependent)
- Mapping strategy:
  - `label <- get(record, labelField)`
  - `value <- get(record, valueField)`
- Supported mapping syntax:
  - dot notation path (e.g. `display.label`, `metadata.title`)
  - array indices via numeric path segments when present

## Defaults
- `labelField`: `label`
- `valueField`: `value`

## Error Handling Contract
- Vocabulary endpoint failure: field-level non-blocking error state, no global form failure.
- Named query endpoint failure: field-level non-blocking error state, no global form failure.
- Invalid mapping path resolution: skip malformed record and log debug warning in component/service logger.

## Notes
- Update this file after Step 1 validation if observed payloads differ.

## Legacy VocabField Mapping Notes

Reference legacy config sample fields mapped during migration:
- `vocabQueryId` -> `queryId`
- `sourceType='query'` -> `sourceType='namedQuery'`
- `titleFieldName`/`stringLabelToField`/`titleFieldArr[0]` -> `labelField` (priority order)
- `storeLabelOnly` -> `valueMode` (`true` => `value`, `false` => `optionObject`)

Known non-1:1 properties to log as warnings when dropped:
- `forceClone`
- legacy publish/subscribe action wiring
- legacy completer/lookup service hints
