# Vocabulary Management Task List

## 1. Data Model (Waterline Models)
- [x] Create `Vocabulary` model in `packages/redbox-core-types/src/waterline-models/Vocabulary.ts` (Skills: Redbox Services)
- [x] Create `VocabularyEntry` model in `packages/redbox-core-types/src/waterline-models/VocabularyEntry.ts` (Skills: Redbox Services)
- [x] Register models in `packages/redbox-core-types` if required (Skills: Redbox Services)
- [ ] **Test**: Write unit tests for `Vocabulary` and `VocabularyEntry` validation logic (type enum, slug auto-gen, uniqueness, RVA `(source, sourceId)`) (Skills: Redbox Testing)

## 2. Services Layer (Business Logic)
- [x] Create `VocabularyService` in `packages/redbox-core-types/src/services/VocabularyService.ts` with CRUD, normalization, and hierarchy logic (Skills: Redbox Services)
- [ ] **Test**: Write unit tests for `VocabularyService` (create, normalizeEntry, validateParent, getTree, delete cascade) (Skills: Redbox Testing)
- [x] Create `RvaImportService` in `packages/redbox-core-types/src/services/RvaImportService.ts` with RVA client mocking and sync logic (Skills: Redbox Services)
- [ ] **Test**: Write unit tests for `RvaImportService` (searchRva, import/sync logic, identifier-first matching) (Skills: Redbox Testing)
- [x] Register services in `packages/redbox-core-types` exports (Skills: Redbox Services)

### Integration Test Gate 1
- [ ] **Code Review**: Run `redbox-feature-implementation-review` on Models & Services. (Skills: Redbox Feature Implementation Review)
    - If issues found: write to `issues.json`
    - If issues found: Fix items in `issues.json` (delete file when done) and Re-run review. keep iterating until no issues are found.
- [x] Create Mocha integration tests for Models + Services in `test/integration/vocabulary` (covering create, tree, constraints, import) (Skills: Redbox Testing, Redbox Test Verification)
- [x] **Verification**: Run `npm run test:mocha:mount` and ensure all pass

## 3. Webservice Controllers (REST API)
- [x] Create `VocabularyController` (REST) in `packages/redbox-core-types/src/controllers/webservice/VocabularyController.ts` (Skills: Redbox Controllers)
- [x] Add REST routes to `packages/redbox-core-types/src/config/routes.config.ts` (Skills: Redbox Controllers)
- [x] Add Admin-only auth rule for `/admin/vocabulary` Ajax endpoints in `packages/redbox-core-types/src/config/auth.config.ts` (Skills: Redbox Controllers)
- [x] **Test**: Write unit tests for `webservice/VocabularyController` actions (Skills: Redbox Testing)

### Integration Test Gate 2
- [ ] **Code Review**: Run `redbox-feature-implementation-review` on Controllers. (Skills: Redbox Feature Implementation Review)
- [x] Create Bruno API tests for endpoints in `test/api/vocabulary` (GET list/details, POST create/import, PUT, DELETE) (Skills: Redbox Testing, Redbox Test Verification)
- [ ] Add Bruno negative auth tests for admin-only endpoints (401/403) (Skills: Redbox Testing)
- [x] **Verification**: Run `npm run test:bruno:general:mount` and ensure all pass

## 4. Ajax Controllers (Controllers)
- [x] Create `VocabularyController` (Ajax) in `packages/redbox-core-types/src/controllers/VocabularyController.ts` for Admin UI rendering (Skills: Redbox Controllers)
- [x] Register Ajax controller routes/actions mirroring REST (list/details/create/update/delete/import/sync) (Skills: Redbox Controllers)
- [x] **Test**: Write unit tests for `VocabularyController` (Ajax) including mirrored endpoints (Skills: Redbox Testing)


## 5. Angular App(s)
- [x] Create `admin-vocabulary` Angular module in `angular/projects/researchdatabox/admin-vocabulary` (Skills: Redbox Angular Apps)
- [x] Create `VocabularyApiService` for API communication using `HttpClientService` (Skills: Redbox Angular Services)
- [x] Implement `VocabListComponent` (list view, delete action) (Skills: Redbox Angular Apps)
- [x] Implement `VocabDetailComponent` (form for create/edit, tree view for hierarchy) (Skills: Redbox Angular Apps)
- [x] Implement manual ordering (up/down) for tree/flat entries (updates `VocabularyEntry.order`) (Skills: Redbox Angular Apps)
- [x] Implement `RvaImportComponent` (search and import flow) (Skills: Redbox Angular Apps)
- [x] **Test**: Write Angular unit tests for components and services (Skills: Redbox Testing)

## 6. Additional Views
- [x] Create `packages/redbox-portal/views/admin/vocabulary.ejs` to mount the `admin-vocabulary` app (Skills: Redbox Angular Apps)

## 7. Navigation Configuration
- [x] Add "Vocabularies" menu item in `packages/redbox-core-types/src/config/brandingConfigurationDefaults.config.ts` (Skills: Redbox Form Config)

## Final Verification
- [ ] **Code Review**: Run `redbox-feature-implementation-review` on all changed code. (Skills: Redbox Feature Implementation Review)
- [x] Run all Mocha integration tests (`npm run test:mocha:mount`) (Skills: Redbox Testing)
- [x] Run all Bruno API tests (`npm run test:bruno:general:mount`) (Skills: Redbox Testing)
- [ ] Manual verification of Admin UI, Tree structure, and RVA Import flows (Skills: Web Interface Verification)

## Skill Gaps
- None identified.
