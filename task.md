# Migrate Controllers to redbox-core-types

## Overview
Migrate all 30 TypeScript controllers from `typescript/api/controllers/` to `packages/redbox-core-types`, following the pattern established in the services migration PR.

## Tasks

### Phase 1: Infrastructure Setup
- [x] Update `redbox-loader.js` to add `generateControllerShims()` function
- [x] Add controller discovery to `findAndRegisterHooks()`
- [x] Update `generateAllShims()` to call controller shim generation
- [x] Create `src/controllers/` directory structure in redbox-core-types
- [x] Create `src/controllers/index.ts` with `ControllerExports` object
- [x] Create `src/controllers/webservice/` subdirectory for webservice controllers
- [x] Export `ControllerNames` and `WebserviceControllerNames` (no instantiation) from controllers index
- [x] Update `src/index.ts` to export controller name lists
- [x] Update bootstrap to call controller `init()` after service init (export `init`, ensure it is not mapped to routes)
- [x] Update hook shim generation to use `registerRedboxControllers()` / `registerRedboxWebserviceControllers()` for hook controllers

### Phase 2: Migrate API Controllers (19 files)
- [x] Migrate `ActionController.ts`
- [x] Migrate `AdminController.ts`
- [x] Migrate `AppConfigController.ts`
- [x] Migrate `AsynchController.ts`
- [x] Migrate `BrandingAppController.ts`
- [x] Migrate `BrandingController.ts`
- [x] Migrate `DynamicAssetController.ts`
- [x] Migrate `EmailController.ts`
- [x] Migrate `ExportController.ts`
- [x] Migrate `RecordAuditController.ts`
- [x] Migrate `RecordController.ts` (largest - 63KB)
- [x] Migrate `RenderViewController.ts`
- [x] Migrate `ReportController.ts`
- [x] Migrate `ReportsController.ts`
- [x] Migrate `TranslationController.ts`
- [x] Migrate `UserController.ts`
- [x] Migrate `VocabController.ts`
- [x] Migrate `WorkspaceAsyncController.ts`
- [x] Migrate `WorkspaceTypesController.ts`

### Phase 3: Migrate Webservice Controllers (11 files)
- [x] Migrate `webservice/AdminController.ts`
- [x] Migrate `webservice/AppConfigController.ts`
- [x] Migrate `webservice/BrandingController.ts`
- [x] Migrate `webservice/ExportController.ts`
- [x] Migrate `webservice/FormManagementController.ts`
- [x] Migrate `webservice/RecordController.ts` (52KB)
- [x] Migrate `webservice/RecordTypeController.ts`
- [x] Migrate `webservice/ReportController.ts`
- [x] Migrate `webservice/SearchController.ts`
- [x] Migrate `webservice/TranslationController.ts`
- [x] Migrate `webservice/UserManagementController.ts`

### Phase 4: Verification
- [x] Build redbox-core-types successfully
- [x] Run existing unit tests
- [x] Run mocha test suite
- [ ] Run Bruno integration tests
- [x] Verify application lifts and controllers are accessible
- [x] Remove legacy `typescript/api/controllers/` and `typescript/api/controllers/webservice/` directories
- [x] Remove stale controller shims if any remain from pre-migration

### Phase 5: Unit Testing
- [x] Create unit tests for controllers in `packages/redbox-core-types/test/controllers/`
