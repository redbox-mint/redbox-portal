# Flydrive Storage Configuration - Task List

## 1. Data Model (Waterline Models)

- [ ] Confirm no model changes are required for storage configuration. Skill: Redbox Services. <!-- id: 0 -->
- [ ] No unit tests required for model changes. <!-- id: 1 -->

## 2. Services Layer (Business Logic)

- [ ] Update `packages/redbox-core-types/src/config/storage.config.ts` to add disk map, stagingDisk, primaryDisk, and driver config types. Skill: Redbox Services. <!-- id: 2 -->
- [ ] Add unit tests for storage config validation in `packages/redbox-core-types/test/services/StorageManagerService.test.ts`. Skill: Redbox Testing. <!-- id: 3 -->

- [ ] Add Flydrive v2 dependencies in `packages/redbox-core-types/package.json` (filesystem + s3 drivers). Skill: Redbox Services. <!-- id: 4 -->
- [ ] Add unit tests for driver registration failures and missing drivers in `packages/redbox-core-types/test/services/StorageManagerService.test.ts`. Skill: Redbox Testing. <!-- id: 5 -->

- [ ] Implement `packages/redbox-core-types/src/services/StorageManagerService.ts` with driver registration, disk accessors, and config validation. Skill: Redbox Services. <!-- id: 6 -->
- [ ] Add unit tests for `disk()`, `stagingDisk()`, `primaryDisk()` accessors. Skill: Redbox Testing. <!-- id: 7 -->

- [ ] Implement `packages/redbox-core-types/src/services/StandardDatastreamService.ts` implementing the full `DatastreamService` contract. Skill: Redbox Services. <!-- id: 8 -->
- [ ] Add unit tests for `addDatastreams`, `addDatastream`, `removeDatastream`, `addAndRemoveDatastreams`, `getDatastream`, and `listDatastreams`. Skill: Redbox Testing. <!-- id: 9 -->

- [ ] Align `StandardDatastreamService.updateDatastream(...)` attachment diff logic with `MongoStorageService`. Skill: Redbox Services. <!-- id: 10 -->
- [ ] Add unit tests that verify add/remove diff behavior in `StandardDatastreamService`. Skill: Redbox Testing. <!-- id: 11 -->

- [ ] Export new services in `packages/redbox-core-types/src/services/index.ts` and `packages/redbox-core-types/src/index.ts`. Skill: Redbox Services. <!-- id: 12 -->
- [ ] Add unit test to assert ServiceExports includes new services if existing coverage pattern is used. Skill: Redbox Testing. <!-- id: 13 -->

- [ ] Code review: run redbox-feature-implementation-review before integration tests. If issues found, write `issues.json`, fix issues, delete `issues.json`, and re-run review. Skill: Redbox Feature Implementation Review. <!-- id: 14 -->
- [ ] Integration gate: add Mocha integration tests for staging -> primary move and run them. Skill: Redbox Testing. <!-- id: 15 -->

## 3. Webservice Controllers (REST API)

- [ ] Confirm no new REST endpoints are required and existing controllers resolve the configured `record.datastreamService`. Skill: Redbox Controllers. <!-- id: 16 -->
- [ ] Add controller unit tests only if behavior changes. Skill: Redbox Testing. <!-- id: 17 -->

## 4. Ajax Controllers (Controllers)

- [ ] Confirm existing attachment upload/download handlers remain unchanged. Skill: Redbox Controllers. <!-- id: 18 -->
- [ ] Add controller unit tests only if behavior changes. Skill: Redbox Testing. <!-- id: 19 -->

## 5. Angular App(s)

- [ ] No Angular changes required. Skill: Redbox Angular Apps. <!-- id: 20 -->
- [ ] No unit tests required. <!-- id: 21 -->

## 6. Additional Views

- [ ] No view changes required. Skill: Redbox Angular Apps. <!-- id: 22 -->
- [ ] No unit tests required. <!-- id: 23 -->

## 7. Navigation Configuration

- [ ] No navigation changes required. Skill: Redbox Angular Apps. <!-- id: 24 -->
- [ ] No unit tests required. <!-- id: 25 -->

## Final Integration Tests

- [ ] Code review: run redbox-feature-implementation-review before final integration tests. If issues found, write `issues.json`, fix issues, delete `issues.json`, and re-run review. Skill: Redbox Feature Implementation Review. <!-- id: 26 -->
- [ ] Run Mocha integration tests and Bruno tests again to validate end-to-end. Skill: Redbox Testing. <!-- id: 27 -->

## Skill Gaps

- None identified.
