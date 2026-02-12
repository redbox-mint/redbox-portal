# Vocabulary Bootstrap Data Feature

## Acceptance Criteria

- `VocabularyService.bootstrapData()` loads all local vocab JSON files from `support/resources/development/bootstrap-data/vocabularies/` (or mounted `/opt/redbox-portal/bootstrap-data/vocabularies`) and creates them via `VocabularyService.create()`
- Vocabularies that already exist (matched by `slug` + `branding`) are skipped — **never updated**
- `rva-imports.json` entries are imported via `RvaImportService.importRvaVocabulary()` only if no vocabulary with matching `rvaSourceKey` exists
- Calling `bootstrapData()` multiple times is fully idempotent — no duplicates, no errors
- A single malformed file or failed RVA import does **not** block other files from loading
- RVA imports can be disabled via `sails.config.vocab.bootstrapRvaImports: false`
- Files are processed in sorted filename order for deterministic behavior
- Each action is logged at `sails.log.verbose` (created/skipped) or `sails.log.error` (failure)
- All unit tests pass: `cd packages/redbox-core-types && npm test`
- Integration test passes against live database

## Tasks

- [x] Plan the feature and get user approval
- [ ] Create `support/resources/development/bootstrap-data/vocabularies/` with `anzsrc-toa.json` and `rva-imports.json`
- [ ] Add `bootstrapData()` method and `'bootstrapData'` to `_exportedMethods` in `VocabularyService.ts`
- [ ] Hook `vocabularyservice.bootstrapData()` into `bootstrap.ts` after vocab service bootstrap
- [ ] Add unit tests to `VocabularyService.test.ts`
- [ ] Add integration test `VocabularyBootstrapData.test.ts` (mocked RVA for CI stability)
- [ ] Verify all tests pass
