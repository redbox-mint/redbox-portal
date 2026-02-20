# Task: Migrate Visitors to Redbox Core Types

## Planning

- [x] Identify visitors to migrate
- [x] Check for dependency issues
- [x] Create implementation plan <!-- id: 0 -->

## Migration

- [ ] Move `attachment-fields.visitor.ts` to `redbox-core-types` <!-- id: 1 -->
- [ ] Move `client.visitor.ts` to `redbox-core-types` <!-- id: 2 -->
- [ ] Move `construct.visitor.ts` to `redbox-core-types` <!-- id: 3 -->
- [ ] Move `data-value.visitor.ts` to `redbox-core-types` <!-- id: 4 -->
- [ ] Move `json-type-def.visitor.ts` to `redbox-core-types` <!-- id: 5 -->
- [ ] Move `migrate-config-v4-v5.visitor.ts` to `redbox-core-types` <!-- id: 6 -->
- [ ] Move `template.visitor.ts` to `redbox-core-types` <!-- id: 7 -->
- [ ] Merge missed functionality from `sails-ng-common` `validator.visitor.ts` into `redbox-core-types` `validator.visitor.ts` (do not overwrite) <!-- id: 8 -->
- [ ] Update imports in moved files <!-- id: 9 -->
- [ ] Update `FormRecordConsistencyService` imports to local `../visitor/` files <!-- id: 14 -->
- [ ] Update `redbox-hook-kit` migration visitor resolution to prefer `@researchdatabox/redbox-core-types` <!-- id: 15 -->

## Refactoring

- [ ] Refactor `vocab-inline.visitor.ts` to extend `FormConfigVisitor` <!-- id: 10 -->

## Cleanup

- [ ] Remove moved files from `sails-ng-common` <!-- id: 11 -->
- [ ] Export migrated visitors from `packages/redbox-core-types/src/index.ts` <!-- id: 16 -->
- [ ] Remove or deprecate legacy visitor exports from `packages/sails-ng-common/src/index.ts` <!-- id: 17 -->

## Verification

- [ ] Verify build of `redbox-core-types` <!-- id: 12 -->
- [ ] Verify build of `sails-ng-common` <!-- id: 13 -->
- [ ] Verify build/tests of `redbox-hook-kit` <!-- id: 18 -->
- [ ] Add/port visitor unit tests into `redbox-core-types/test/unit` and ensure pass <!-- id: 19 -->
- [ ] Smoke test `redbox-hook-kit migrate-form-config` command against sample legacy config <!-- id: 20 -->
