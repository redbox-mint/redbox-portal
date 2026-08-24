# Record schema implementation log

## Baseline

- Date: 2026-08-24
- Worktree: `/home/andrew/.t3/worktrees/redbox-portal/t3code-9a450851`
- Branch: `feature/json-schema-support`
- Pre-existing worktree state: `design.md`, `implementation_plan.md`, and `task_list.md` were untracked; they were treated as feature inputs and left unchanged.
- Initial `npm run compile:core` and `npm run compile:storage-mongo` attempts failed because the checkout had no root `node_modules` and required local package build output was absent. The first errors were missing root `@tsconfig/node24/tsconfig.json` and unresolved `@researchdatabox/sails-ng-common` declarations.
- Installed the locked root dependencies with `npm ci --ignore-scripts --strict-peer-deps`, then built the existing local prerequisites (`raido`, `rva-registry`, `sails-ng-common`, and `agenda-sqs-backend`) without changing manifests or lockfiles.
- `npm run compile:core`: passed after prerequisites were present.
- `npm run compile:storage-mongo`: passed after prerequisites were present.
- Focused core baseline (`FormsService`, `RecordValidationService`, `RecordsService`, `CoreController`, webservice `RecordController`, and API routes): 387 passing.
- Focused `MongoStorageService` baseline: 72 passing.
- A default-config core test invocation expanded to the whole package suite and exposed five unrelated existing failures in `httpConfigSecurity.test.ts`/`contentSecurityPolicy.test.ts`; the explicitly scoped baseline files all passed.
