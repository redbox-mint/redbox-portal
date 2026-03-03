# Implementation Plan - Visitor Migration

## Goal

Migrate server-side visitor implementations from `sails-ng-common` to `redbox-core` while preserving and extending existing `redbox-core` behavior. Refactor `vocab-inline.visitor.ts` to extend `FormConfigVisitor`.

## Decisions

1. `packages/redbox-core/src/visitor/validator.visitor.ts` is the canonical validator implementation.
2. `packages/sails-ng-common/src/config/visitor/validator.visitor.ts` must be merged into the canonical validator implementation for any missing behavior.
3. Existing `redbox-core` validator behavior must not regress.
4. All known consumers (including `redbox-dev-tools`) should resolve migrated visitors from `redbox-core`.

## Proposed Changes

### Configuration

1.  **Move Files**: Move the following files from `packages/sails-ng-common/src/config/visitor/` to `packages/redbox-core/src/visitor/`:
    - `attachment-fields.visitor.ts`
    - `client.visitor.ts`
    - `construct.visitor.ts`
    - `data-value.visitor.ts`
    - `json-type-def.visitor.ts`
    - `migrate-config-v4-v5.visitor.ts`
    - `template.visitor.ts`
    - `validator.visitor.ts` (merge behavior into existing destination file, do not overwrite)

2.  **Update Imports**:
    - In moved files under `redbox-core`, update internal imports to use local `redbox-core` modules where possible, avoiding deep imports from `@researchdatabox/sails-ng-common/dist/...`.
    - In `packages/redbox-core/src/services/FormsService.ts`, update imports of `ClientFormConfigVisitor` and `ConstructFormConfigVisitor` to point to local `../visitor/` paths.
    - In `packages/redbox-core/src/services/FormRecordConsistencyService.ts`, update imports for visitor classes (`DataValueFormConfigVisitor`, `JsonTypeDefSchemaFormConfigVisitor`, `TemplateFormConfigVisitor`, `ConstructFormConfigVisitor`) to local `../visitor/` paths.
    - Scan the monorepo for direct usage of migrated visitor classes and update imports to resolve from `@researchdatabox/redbox-core`.

3.  **Validator Merge (No Regression)**:
    - Treat `packages/redbox-core/src/visitor/validator.visitor.ts` as the base.
    - Compare against `packages/sails-ng-common/src/config/visitor/validator.visitor.ts` and port only missing logic.
    - Preserve existing `redbox-core` support for component types and behavior currently not present in `sails-ng-common`.
    - Ensure there is no loss of functionality currently validated by `packages/redbox-core/test/unit/validator.visitor.test.ts`.

4.  **Refactor `VocabInlineFormConfigVisitor`**:
    - Refactor `packages/redbox-core/src/visitor/vocab-inline.visitor.ts`.
    - Make it extend `FormConfigVisitor`.
    - Implement `visitFormConfig`, `visitGroup...`, etc. methods instead of the current custom traversal logic.
    - Ensure it visits children correctly.

### Cleanup

1.  **Remove Files**: Delete the moved files from `packages/sails-ng-common/src/config/visitor/`.
2.  **Exports (`redbox-core`)**:
    - Update `packages/redbox-core/src/index.ts` to export all migrated visitors so consumers can import them from package root.
3.  **Exports (`sails-ng-common`)**:
    - Remove legacy visitor exports from `packages/sails-ng-common/src/index.ts`.
    - If needed for transition, keep temporary compatibility re-exports with deprecation notes and a removal target release.
4.  **Consumer Updates**:
    - Update `packages/redbox-dev-tools/src/commands/migrate-form-config.ts` to resolve `MigrationV4ToV5FormConfigVisitor` from `@researchdatabox/redbox-core` first.
    - Keep legacy fallback resolution paths only for compatibility during transition.
    - Update user-facing error text in hook-kit to reference `redbox-core` as the primary source.
5.  **Tests**: Move or recreate unit tests for migrated visitors from `packages/sails-ng-common/test/unit/` into `packages/redbox-core/test/unit/`.

## Consumer Impact

1. `redbox-core` services should use local visitor implementations.
2. `redbox-dev-tools` should load migration visitor from `redbox-core`.
3. Any hook/app importing these visitors from `sails-ng-common` must migrate imports to `redbox-core`.
4. Release notes must call out changed import paths and any deprecation window.

## Verification Plan

### Automated Tests

1.  **Redbox Core Types Unit Tests**: Run tests in `redbox-core` to ensure migrated visitors and merged validator behavior work correctly.
    ```bash
    cd packages/redbox-core
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
    cd packages/redbox-dev-tools
    npm test
    ```
4.  **Migration Command Smoke Test**:
    - Run `redbox-dev-tools migrate-form-config` against a sample v4 config and verify visitor resolution succeeds from `redbox-core`.
5.  **Filesystem Check**: Verify files are moved and old ones deleted from `sails-ng-common`.
6.  **Import Scan**:
    - Search monorepo for remaining direct imports/usages of migrated visitors from `sails-ng-common`.

### Manual Verification

1.  **Build**: Run build in all affected packages to check for compile errors (circular dependencies or missing exports).
    ```bash
    cd packages/sails-ng-common
    npm run compile
    cd ../redbox-core
    npm run build
    cd ../redbox-dev-tools
    npm run build
    ```
2.  **Export Surface Check**:
    - Verify migrated visitors are exported from `@researchdatabox/redbox-core`.
    - Verify `sails-ng-common` export changes align with compatibility/deprecation plan.
