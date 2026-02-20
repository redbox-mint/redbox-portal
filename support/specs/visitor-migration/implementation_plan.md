# Implementation Plan - Visitor Migration

## Goal

Migrate server-side visitor implementations from `sails-ng-common` to `redbox-core-types` while preserving and extending existing `redbox-core-types` behavior. Refactor `vocab-inline.visitor.ts` to extend `FormConfigVisitor`.

## Decisions

1. `packages/redbox-core-types/src/visitor/validator.visitor.ts` is the canonical validator implementation.
2. `packages/sails-ng-common/src/config/visitor/validator.visitor.ts` must be merged into the canonical validator implementation for any missing behavior.
3. Existing `redbox-core-types` validator behavior must not regress.
4. All known consumers (including `redbox-hook-kit`) should resolve migrated visitors from `redbox-core-types`.

## Proposed Changes

### Configuration

1.  **Move Files**: Move the following files from `packages/sails-ng-common/src/config/visitor/` to `packages/redbox-core-types/src/visitor/`:
    - `attachment-fields.visitor.ts`
    - `client.visitor.ts`
    - `construct.visitor.ts`
    - `data-value.visitor.ts`
    - `json-type-def.visitor.ts`
    - `migrate-config-v4-v5.visitor.ts`
    - `template.visitor.ts`
    - `validator.visitor.ts` (merge behavior into existing destination file, do not overwrite)

2.  **Update Imports**:
    - In moved files under `redbox-core-types`, update internal imports to use local `redbox-core-types` modules where possible, avoiding deep imports from `@researchdatabox/sails-ng-common/dist/...`.
    - In `packages/redbox-core-types/src/services/FormsService.ts`, update imports of `ClientFormConfigVisitor` and `ConstructFormConfigVisitor` to point to local `../visitor/` paths.
    - In `packages/redbox-core-types/src/services/FormRecordConsistencyService.ts`, update imports for visitor classes (`DataValueFormConfigVisitor`, `JsonTypeDefSchemaFormConfigVisitor`, `TemplateFormConfigVisitor`, `ConstructFormConfigVisitor`) to local `../visitor/` paths.
    - Scan the monorepo for direct usage of migrated visitor classes and update imports to resolve from `@researchdatabox/redbox-core-types`.

3.  **Validator Merge (No Regression)**:
    - Treat `packages/redbox-core-types/src/visitor/validator.visitor.ts` as the base.
    - Compare against `packages/sails-ng-common/src/config/visitor/validator.visitor.ts` and port only missing logic.
    - Preserve existing `redbox-core-types` support for component types and behavior currently not present in `sails-ng-common`.
    - Ensure there is no loss of functionality currently validated by `packages/redbox-core-types/test/unit/validator.visitor.test.ts`.

4.  **Refactor `VocabInlineFormConfigVisitor`**:
    - Refactor `packages/redbox-core-types/src/visitor/vocab-inline.visitor.ts`.
    - Make it extend `FormConfigVisitor`.
    - Implement `visitFormConfig`, `visitGroup...`, etc. methods instead of the current custom traversal logic.
    - Ensure it visits children correctly.

### Cleanup

1.  **Remove Files**: Delete the moved files from `packages/sails-ng-common/src/config/visitor/`.
2.  **Exports (`redbox-core-types`)**:
    - Update `packages/redbox-core-types/src/index.ts` to export all migrated visitors so consumers can import them from package root.
3.  **Exports (`sails-ng-common`)**:
    - Remove legacy visitor exports from `packages/sails-ng-common/src/index.ts`.
    - If needed for transition, keep temporary compatibility re-exports with deprecation notes and a removal target release.
4.  **Consumer Updates**:
    - Update `packages/redbox-hook-kit/src/commands/migrate-form-config.ts` to resolve `MigrationV4ToV5FormConfigVisitor` from `@researchdatabox/redbox-core-types` first.
    - Keep legacy fallback resolution paths only for compatibility during transition.
    - Update user-facing error text in hook-kit to reference `redbox-core-types` as the primary source.
5.  **Tests**: Move or recreate unit tests for migrated visitors from `packages/sails-ng-common/test/unit/` into `packages/redbox-core-types/test/unit/`.

## Consumer Impact

1. `redbox-core-types` services should use local visitor implementations.
2. `redbox-hook-kit` should load migration visitor from `redbox-core-types`.
3. Any hook/app importing these visitors from `sails-ng-common` must migrate imports to `redbox-core-types`.
4. Release notes must call out changed import paths and any deprecation window.

## Verification Plan

### Automated Tests

1.  **Redbox Core Types Unit Tests**: Run tests in `redbox-core-types` to ensure migrated visitors and merged validator behavior work correctly.
    ```bash
    cd packages/redbox-core-types
    npm test
    ```
2.  **Visitor Test Coverage in Core Types**:
    - Ensure tests exist and pass for:
      - `attachment-fields.visitor`
      - `client.visitor`
      - `construct.visitor`
      - `data-value.visitor`
      - `json-type-def.visitor`
      - `migrate-config-v4-v5.visitor`
      - `template.visitor`
      - `validator.visitor`
      - `vocab-inline.visitor`
3.  **Hook Kit Tests**:
    ```bash
    cd packages/redbox-hook-kit
    npm test
    ```
4.  **Migration Command Smoke Test**:
    - Run `redbox-hook-kit migrate-form-config` against a sample v4 config and verify visitor resolution succeeds from `redbox-core-types`.
5.  **Filesystem Check**: Verify files are moved and old ones deleted from `sails-ng-common`.
6.  **Import Scan**:
    - Search monorepo for remaining direct imports/usages of migrated visitors from `sails-ng-common`.

### Manual Verification

1.  **Build**: Run build in all affected packages to check for compile errors (circular dependencies or missing exports).
    ```bash
    cd packages/sails-ng-common
    npm run compile
    cd ../redbox-core-types
    npm run build
    cd ../redbox-hook-kit
    npm run build
    ```
2.  **Export Surface Check**:
    - Verify migrated visitors are exported from `@researchdatabox/redbox-core-types`.
    - Verify `sails-ng-common` export changes align with compatibility/deprecation plan.
