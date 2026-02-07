# Vocabulary Management Implementation Plan

## Verification Plan

### Automated Tests
- **Integration Tests (Mocha)**:
  - Test `VocabularyService:create` creates DB records.
  - Test `VocabularyService:getTree` returns nested structure.
  - Test case-insensitive uniqueness for `label` and `value` within a vocabulary.
  - Test `Vocabulary.type` enum rejects invalid values (allowed: `flat`, `tree`).
  - Test `Vocabulary.slug` auto-generates from name and is unique per branding.
  - Test `type = flat` rejects `parent` assignments.
  - Test parent belongs to same vocabulary and cycles are rejected.
  - Test `(source, sourceId)` uniqueness for `source = rva` to prevent duplicates.
  - Test `RvaImportService` mocks RVA client and creates local records.
  - Test `RvaImportService.syncRvaVocabulary` updates existing records without duplicates.
  - Test RVA sync matches entries by `identifier` before `valueLower`.
  - Test delete cascades and removes related entries.
  - *Command*: `npm run test:integration` (target relevant test file)
- **API Tests (Bruno)**:
  - Test GET/POST/PUT/DELETE on `/api/vocabulary`.
  - Test list pagination/filtering on `GET /api/vocabulary` (`limit`, `offset`, `type`, `source`, `q`).
  - Test `GET /api/vocabulary/:id` returns vocabulary + tree.
  - Test `POST /api/vocabulary/:id/sync` updates imported vocab.
  - *Command*: `npm run test:api` (target relevant collection)
- **Ajax Controller Tests**:
  - Test `VocabularyController` (Ajax) renders the correct view.
  - Test `VocabularyController` (Ajax) mirrors REST actions for list/details/create/update/delete/import/sync.

### Test Outlines
- **Mocha (integration)**
  - `VocabularyService.create`
    - Arrange: create vocabulary (`type = tree`) and entries.
    - Assert: vocab persisted, entries persisted, `labelLower/valueLower` set.
  - `VocabularyService.getTree`
    - Arrange: parent/child entries; include sibling ordering.
    - Assert: nested `children` structure and stable ordering.
  - Case-insensitive uniqueness
    - Arrange: insert `label = "Science"` then attempt `label = "science"` (same vocab).
    - Assert: second insert rejected with validation error.
  - Flat vocab parent restriction
    - Arrange: create `type = flat` vocab; attempt to assign `parent`.
    - Assert: validation error; no DB write.
  - Parent vocabulary validation
    - Arrange: create two vocabs; create entry in vocab A; attempt to set as parent in vocab B.
    - Assert: validation error; no DB write.
  - Cycle detection
    - Arrange: A -> B -> C; attempt to set A parent to C.
    - Assert: validation error; no DB write.
  - RVA import (initial)
    - Arrange: mock RVA client with vocab + entries.
    - Assert: vocab created with `source = rva`, `sourceId`, entries created.
  - RVA sync (idempotent)
    - Arrange: existing RVA vocab + entries; mock RVA returns same plus new entry + updated label.
    - Assert: counts `{ created, updated, skipped }`, no duplicates, `lastSyncedAt` updated.
- **Bruno (API)**
  - `GET /api/vocabulary`
    - Assert: `200`, `{ data, meta }`, pagination and filters (`type`, `source`, `q`).
  - `POST /api/vocabulary`
    - Assert: `201`, created vocab with `type` and `source`.
  - `PUT /api/vocabulary/:id`
    - Assert: `200`, updates reflected.
  - `GET /api/vocabulary/:id`
    - Assert: `200`, `{ vocabulary, entries }` tree shape.
  - `DELETE /api/vocabulary/:id`
    - Assert: `204` or `200` with confirmation.
  - `POST /api/vocabulary/import`
    - Assert: `200`, created RVA vocab; `source = rva`.
  - `POST /api/vocabulary/:id/sync`
    - Assert: `200`, `{ updated, created, skipped, lastSyncedAt }`.
  - Auth negative cases
    - Assert: non-admin/unauthenticated requests are rejected (401/403).

### Manual Verification
- **Admin UI**:
  - Go to Admin > Vocabularies.
  - Create a local vocab "Test Vocab" with `type = tree`.
  - Add entries: "Parent", "Child" (under Parent).
  - Verify Tree structure in UI.
  - Reorder entries via drag/drop; verify `order` updates and persists.
  - Create a local vocab "Flat Vocab" with `type = flat`.
  - Add entries without parent; verify parent UI is disabled/hidden.
  - Attempt to add a duplicate label/value with different casing; verify validation error.
  - Use Import feature to search RVA (mock/real?) and import a vocab.
  - Use "Update from RVA" button to sync changes.
  - Verify data in DB matches RVA and no duplicates are created (case-insensitive).

## RVA Compatibility Notes (Plan)
- **Metadata source**: `ResourcesApi.getVocabularyById(vocabId, includeVersions=true, includeAccessPoints=true, includeRelatedEntitiesAndVocabularies=true, includeLanguageList=true)`
- **Entry source**: `ResourcesApi.getVersionArtefactConceptTree(versionId)` (preferred for tree/flat concepts)
  - Fallback: use `version[].access-point[]` to download artefact files (e.g., TTL) only if concept tree is unavailable.
- **Version selection**:
  - Prefer `version.status = "current"`; otherwise choose the latest by `release-date`.
- **Field mapping (kebab-case → local)**:
  - RVA `id` → `Vocabulary.sourceId`
  - RVA `slug` → `Vocabulary.slug`
  - RVA `title` → `Vocabulary.name`
  - RVA `description` → `Vocabulary.description`
  - RVA `owner` → `Vocabulary.owner`
  - RVA `version[].id` → `Vocabulary.sourceVersionId`
  - RVA `version[].release-date` → store in sync metadata or audit log (optional)
  - RVA `note` → optional `Vocabulary.description` suffix or ignore for MVP
  - RVA `creation-date`, `primary-language` → optional metadata fields (ignore for MVP)
- **Concept tree mapping**:
  - Concept `iri` or identifier → `VocabularyEntry.identifier` (preferred match key)
  - Concept label → `VocabularyEntry.label`
  - Concept notation/value → `VocabularyEntry.value`
  - Parent/children relationships preserved for `type = tree`

## Proposed Changes

### packages/redbox-core-types
#### [NEW] packages/redbox-core-types/src/waterline-models/Vocabulary.ts
#### [NEW] packages/redbox-core-types/src/waterline-models/VocabularyEntry.ts
#### [NEW] packages/redbox-core-types/src/services/VocabularyService.ts
#### [NEW] packages/redbox-core-types/src/services/RvaImportService.ts
#### [NEW] packages/redbox-core-types/src/controllers/webservice/VocabularyController.ts
#### [NEW] packages/redbox-core-types/src/controllers/VocabularyController.ts
#### [MODIFY] packages/redbox-core-types/src/config/routes.config.ts
#### [MODIFY] packages/redbox-core-types/src/config/auth.config.ts
#### [MODIFY] packages/redbox-core-types/src/config/brandingConfigurationDefaults.config.ts

### packages/redbox-portal
#### [NEW] packages/redbox-portal/src/app/admin-vocabulary
#### [NEW] packages/redbox-portal/views/admin/vocabulary.ejs

## Route Mappings (Admin-only)

### Ajax Controller (Admin)
Add route entries in `packages/redbox-core-types/src/config/routes.config.ts`:

```ts
'get /:branding/:portal/admin/vocabulary/manager': {
  controller: 'VocabularyController',
  action: 'manager'
},
'get /:branding/:portal/admin/vocabulary': {
  controller: 'VocabularyController',
  action: 'list'
},
'get /:branding/:portal/admin/vocabulary/:id': {
  controller: 'VocabularyController',
  action: 'get'
},
'post /:branding/:portal/admin/vocabulary': {
  controller: 'VocabularyController',
  action: 'create'
},
'put /:branding/:portal/admin/vocabulary/:id': {
  controller: 'VocabularyController',
  action: 'update'
},
'delete /:branding/:portal/admin/vocabulary/:id': {
  controller: 'VocabularyController',
  action: 'delete'
},
'post /:branding/:portal/admin/vocabulary/import': {
  controller: 'VocabularyController',
  action: 'import'
},
'post /:branding/:portal/admin/vocabulary/:id/sync': {
  controller: 'VocabularyController',
  action: 'sync'
}
```

### Webservice Controller (Admin)
Add route entries in `packages/redbox-core-types/src/config/routes.config.ts`:

```ts
'get /:branding/:portal/api/vocabulary': {
  controller: 'webservice/VocabularyController',
  action: 'list',
  csrf: false
},
'get /:branding/:portal/api/vocabulary/:id': {
  controller: 'webservice/VocabularyController',
  action: 'get',
  csrf: false
},
'post /:branding/:portal/api/vocabulary': {
  controller: 'webservice/VocabularyController',
  action: 'create',
  csrf: false
},
'put /:branding/:portal/api/vocabulary/:id': {
  controller: 'webservice/VocabularyController',
  action: 'update',
  csrf: false
},
'delete /:branding/:portal/api/vocabulary/:id': {
  controller: 'webservice/VocabularyController',
  action: 'delete',
  csrf: false
},
'post /:branding/:portal/api/vocabulary/import': {
  controller: 'webservice/VocabularyController',
  action: 'import',
  csrf: false
},
'post /:branding/:portal/api/vocabulary/:id/sync': {
  controller: 'webservice/VocabularyController',
  action: 'sync',
  csrf: false
}
```

### Auth Rules (Admin-only)
Add path rules in `packages/redbox-core-types/src/config/auth.config.ts` to restrict Ajax routes to Admin:

```ts
{ path: '/:branding/:portal/admin/vocabulary(/*)', role: 'Admin', can_update: true }
```

Note: `/api/*` routes are already restricted by the existing admin rule `{ path: '/:branding/:portal/api(/*)', role: 'Admin', can_update: true }`.
