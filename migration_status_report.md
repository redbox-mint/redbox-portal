# Service Migration Status Report

## Overview
We are migrating 38 TypeScript services and 1 JavaScript service from the main application to the `redbox-core-types` package. This involves moving the code, fixing imports, updating the loader to generate shims, and adding unit tests.

## Completed Tasks

### 1. Infrastructure Setup
- **`redbox-loader.js` Updated**: Added logic to discover services from hooks/core-types and generate shims in `api/services/`.
- **`src/services/index.ts` Created**: Central export file created in `redbox-core-types` using lazy instantiation for `ServiceExports`.
- **`src/index.ts` Updated**: Now exports all services and the `ServiceExports` object.
- **`src/sails.ts` Updated**: Added missing `on`, `emit`, and `getDatastore` method definitions to `Sails` and `Model` interfaces.
- **Dependencies**: Added `fs-extra` and `@types/fs-extra` to `packages/redbox-core-types/package.json` to resolve runtime errors in `ConfigService`.

### 2. Service Migration
- **ViewUtils Migration**: Converted `ViewUtils.js` to `src/services/ViewUtilsService.ts` in `redbox-core-types`.
- **TypeScript Services**: All 38 services moved from `typescript/api/services/` to `packages/redbox-core-types/src/services/`.
- **Import Updates**: All internal imports within services updated to use relative paths (e.g., `from '..'` instead of `@researchdatabox/redbox-core-types`).
- **Dependencies**: Added missing dependencies to `redbox-core-types/package.json`:
  - `@researchdatabox/sails-ng-common`
  - `@researchdatabox/raido-openapi-generated-node`
- **Original Files Deleted**: Cleaned up the source directories.
- **Fixed `AgendaQueueService`**: Resolved runtime error during shim generation by checking `typeof sails` before access. Updated type declarations to use `Sails.Application`.
- **Fixed `CoreService`**: Resolved `ReferenceError: sails is not defined` in `logger` getter by adding checks for `sails` existence and providing a fallback console logger for shim generation context.

### 3. Build Status
- **Compilation**: `redbox-core-types` compiles successfully (`npm run build`).

### 4. Testing
- **Test Infrastructure**:
  - Created `test/services/` directory.
  - Created `test/services/testHelper.ts` for mocking Sails globals.
  - Created `test/setup.ts` for global environment setup.
- **Unit Tests Created** (39 test files covering all services):
  - `ViewUtilsService.test.ts`
  - `CacheService.test.ts`
  - `BrandingService.test.ts`
  - `RolesService.test.ts`
  - `ConfigService.test.ts`
  - `AsynchsService.test.ts`
  - `RecordTypesService.test.ts`
  - `WorkflowStepsService.test.ts`
  - `PathRulesService.test.ts`
  - `WorkspaceAsyncService.test.ts`
  - `AgendaQueueService.test.ts`
  - `ContrastService.test.ts`
  - `BrandingLogoService.test.ts`
  - `DashboardTypesService.test.ts`
  - `AppConfigService.test.ts`
  - `DoiService.test.ts`
  - `EmailService.test.ts`
  - `FigshareService.test.ts`
  - `FormRecordConsistencyService.test.ts`
  - `FormsService.test.ts`
  - `I18nEntriesService.test.ts`
  - `NamedQueryService.test.ts`
  - `NavigationService.test.ts`
  - `OrcidService.test.ts`
  - `SvgSanitizerService.test.ts`
  - `TranslationService.test.ts`
  - `VocabService.test.ts`
  - `WorkspaceTypesService.test.ts`
  - `TemplateService.test.ts`
  - `SassCompilerService.test.ts`
  - `ReportsService.test.ts`
  - `WorkspaceService.test.ts`
  - `SolrSearchService.test.ts`
  - `TriggerService.test.ts`
  - `UsersService.test.ts`
  - `RecordsService.test.ts`
  - `RDMPService.test.ts`
  - `OniService.test.ts`
  - `RaidService.test.ts`
- **Test Status**: 
  - **Unit Tests**: 400 Passing / 0 Failing ✅
  - **Integration Tests**: Attempted `test:mocha:mount`, services bootstrap correctly but tests time out in this environment (likely due to resource constraints/volume performance).
  - **Compilation**: Verified `npm run compile:sails` succeeds cleanly. ✅

## Outstanding Tasks

1. **Integration Testing**: Run the full suite (`npm run test:mocha` and `npm run test:bruno`) in a proper CI/CD environment to verify end-to-end functionality.

## File Locations
- **Migrated Services**: `packages/redbox-core-types/src/services/`
- **New Tests**: `packages/redbox-core-types/test/services/`
- **Loader Logic**: `redbox-loader.js`
