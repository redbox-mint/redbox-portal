# B06 implementation evidence

Implemented on `feature/record-type-workflow-administration-b`, starting from
`df4aaf24047d15aec8afa6b02b4660b545ee7019`. The initial worktree was clean.
No branch/worktree switch, reset, commit replacement or dependency change was
performed. The Angular lockfile remains byte-identical (Git blob
`999da9f88d7f2f0fea33119c8c55eeb2c6e957b8`).

## Acceptance evidence

| Requirement | Implementation and focused evidence |
| --- | --- |
| Active aggregate only | Resolver reads identity + immutable revision; schema, canonical ID, ownership and hash checks fail closed. No draft reads; runtime identity excludes draft/lifecycle payloads. Draft-only types are excluded from runtime lists. |
| Publication without restart | Shared pointer read on every resolution, immutable revision cache only. Publication/rollback activation and activated-operation recovery invalidate locally. |
| Bounded multi-instance convergence | Two independently cached runtime instances against real MongoDB both observe a publication on their next resolution. Cache delay is zero shared-pointer reads; a read overlapping publication may complete with the old coherent aggregate. |
| In-flight race safety | A paused old revision load finishing after publication and invalidation cannot poison subsequent active resolution. |
| Readiness | All-brand active scan after bootstrap hooks; callable fresh probe; runtime checks on cache hits. Mongo test publishes a hook action available on one node and absent on another: only the latter fails readiness. Draft missing actions and inactive history do not block readiness. |
| Brand isolation | Canonical brand/type/revision cache keys, ownership checks, separate brand publication and cache entries, scoped invalidation and bootstrap-cache access. |
| Bounded caches | Maximum 64 immutable schema-bounded revision entries; no active-pointer or negative cache. Defensive legacy bootstrap snapshot expires after one monotonic second and invalidates on local publication. |
| Compatibility | Observable record-type/workflow adapters project published settings and automatic graph into existing contracts. Full and field-selected objects retain the same aggregate for workflow reads. Untouched legacy rows remain supported until B10/B11. |

The operational contract, probe usage and migration boundary are documented in
[Active record-definition resolution](../../wiki/Active-Record-Definition-Resolution.md).
B07/B08, administration APIs/UI, seed/migration changes, and dependency changes are
outside this implementation.

## Validation

- Shared package compilation: `npm --prefix packages/sails-ng-common run compile`.
- Core build and declarations: `npm --prefix packages/redbox-core run build`.
- Root backend typecheck: `node_modules/.bin/tsc --noEmit`.
- Repository lint and both security gates: `npm run lint`. The type gate performs
  isolated declaration emission; it does not trust generated `dist` contents.
  No new explicit `any`/`unknown` nodes were admitted. The reviewed baseline
  removes two emitted `unknown` nodes from WorkflowStepsService and updates the
  unchanged-count source fingerprint for its formatting change.
- 334 focused/regression tests passed across runtime, record types, workflow,
  bootstrap, publication, drafts and RecordsService, including all 47
  adapter/runtime/bootstrap cases.
- 24 real MongoDB checks passed across publication and draft concurrency suites,
  including the two B06 integration cases.
- Formatting of the new runtime/test/helper and changed record-type adapter,
  `git diff --check`, and Angular lockfile identity were checked.

Focused/regression command (run without a competing build to avoid expression
worker timing contention):

```sh
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json \
node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config \
  --require ts-node/register/transpile-only --require chai \
  --require ./packages/redbox-core/test/setup.ts \
  packages/redbox-core/test/services/RecordDefinitionRuntimeService.test.ts \
  packages/redbox-core/test/services/RecordTypesService.test.ts \
  packages/redbox-core/test/services/WorkflowStepsService.test.ts \
  packages/redbox-core/test/loader/bootstrapShimRuntime.test.ts \
  packages/redbox-core/test/services/RecordDefinitionPublicationService.test.ts \
  packages/redbox-core/test/services/RecordDefinitionDraftService.test.ts \
  packages/redbox-core/test/services/RecordsService.test.ts
```

Integration command, against a **dedicated disposable database** (the test app uses
`migrate: drop`):

```sh
RECORD_DEFINITION_TEST_MONGO_URL=mongodb://127.0.0.1:27186/redbox_b06 \
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json \
node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config \
  --require ts-node/register/transpile-only --require chai \
  --require ./test/integration/helpers/record-definition-bootstrap.cjs \
  test/integration/services/RecordDefinitionPublicationService.test.ts \
  test/integration/services/RecordDefinitionDraftService.test.ts
```

The helper lifts one app around both suites and reuses existing generated shims.
Without it, the first suite closes the datastore while the second sees a stale ORM
hook; standalone draft setup also tries to regenerate a protected local config.
Neither limitation required changing that config or the existing draft tests.
The two-node scenario uses separate runtime objects/caches in one process against
a real shared datastore; it does not claim a distributed network-partition test.
The zero-pointer-cache contract requires primary datastore reads.

Local logs are under `.tmp/b06-*.log` (ignored build/test artifacts). Initial
combined execution had four expression-worker timing failures during competing
build activity; all 21 effect-hook cases passed in isolation and the full 332-test
regression command then passed; the final expanded run passed all 334 tests. No production timeout was relaxed.

## Independent review corrections for e7b35d64

These changes remain within B06 and preserve the existing branch, commits and
worktree. No dependency manifests or lockfiles changed.

- Both record-type operations and stage overrides project `allowedTargetStages`
  to `allowedTargetSteps`. An omitted restriction still inherits, and an empty
  list remains deny-all. Runtime-to-validator tests cover denied and permitted
  transition targets at both layers.
- `RecordValidationService.resolve(request, selectedRecordType)` accepts the
  server-selected settings object separately from request data. RecordsService
  passes that exact object at its shared validation boundary, including post-save
  validation. An explicitly missing selection does not trigger a second lookup.
  Independent validation calls may still resolve their own settings once.
  Discovery has the same optional argument: FormsService passes the object used
  to authorize its workflow targets. Tests interleave publication with validation
  and discovery, and assert that revision-one settings/stages remain paired while
  the next operation observes revision two. Save/discovery caller tests assert
  reference identity, preventing an accidental clone from losing the snapshot.
- Starting-form lookup now uses brand-scoped RecordTypesService and the selected
  aggregate's WorkflowStepsService stages. Only untouched legacy identities can
  query legacy workflow rows. Tests cover a changed active starting stage/form,
  publication, separate brands, invalid pointers and unpublished managed types.
- Dashboard projection emits `showAdminSideBar` and `table.rowConfig`, with
  ordered `title`, `variable` and Handlebars `template` fields. Stages inherit the
  same revision's type dashboard unless overridden. Consumer tests exercise table
  retrieval, template extraction, HTML escaping, stage overrides and brand/revision
  isolation. Dashboard services already pass the selected type to workflow reads;
  the controller's sidebar consumer reads `showAdminSideBar`.

The existing dashboard consumer does not evaluate JSONata column values. Runtime
resolution/readiness rejects those values defensively. The remaining review fix
below also rejects them before publication or rollback activation. Path values
and optional Handlebars render templates are supported. Adding a dashboard JSONata
evaluation pipeline is outside these focused adapter corrections.

Validation for the corrections:

- Shared compilation, core build/declarations and root `tsc --noEmit` passed.
- Full repository lint, unsafe-expression gate/tests and explicit-type source and
  isolated declaration gate/tests passed. FormsService removes two legacy source
  `unknown` nodes (34 to 32); only that baseline entry was reduced. There are no
  new explicit source or emitted declaration `any`/`unknown` nodes.
- The optional core `typecheck:strict` profile still has 749 pre-existing
  diagnostics. A TypeScript compiler-host comparison against HEAD's source,
  without changing any worktree files, found exactly the same 749 diagnostics
  and zero additions/removals. The required standard build/typecheck pass.
- The focused/regression command above was expanded with RecordValidationService,
  FormsService, DashboardTypesService, DashboardConfigService, RecordController,
  webservice RecordController, FormManagementController and DashboardConfigController.
  All 618 cases passed, including 28 focused active-runtime cases.
- The Mongo command above used a dedicated disposable database at
  `mongodb://127.0.0.1:27187/redbox_b06_fix`: all 24 publication/draft integration
  checks passed. The task-owned Mongo container was removed afterward.
- Angular lockfile blob remains `999da9f88d7f2f0fea33119c8c55eeb2c6e957b8`.
  `git diff --check` passed. Logs are `.tmp/b06-fix-*.log`.


## Remaining blocker from independent re-review of 4c2f84a1

The shared worktree started clean at 4c2f84a1. All existing commits are preserved.

The accepted activation contract is **path dashboard values with optional
Handlebars rendering**. Publication validation now reports
`unsupported-dashboard-value` at each unsupported column's `value` path, for
both record-type dashboards and every stage dashboard. Rollback and lifecycle
recovery use the same publication validator. Valid JSONata can remain in a draft
for editing, but cannot be activated. The runtime's defensive rejection remains
in place for invalid externally written/older active data.

No projection or expression execution code changed: sidebar/table shape, column
ordering, path lookup, Handlebars escaping, inherited/overridden stage dashboards,
and brand/revision cache isolation retain their existing regression coverage.
JSONata in other supported expression contexts is unaffected.

New adversarial validation cases cover type/stage dashboards, syntactically valid
record lookups, constant expressions, forbidden globals, and a render template
that must not bypass rejection. The complete publishable fixture now uses a path.
Real Mongo tests persist unsupported type/stage drafts, assert rejection without
revision/history writes, repair them to paths and publish successfully, then
inject an inactive old-validator revision with a correct canonical hash and
assert rollback rejection. Active pointer/version and history remain unchanged;
warm resolution and fresh-node readiness succeed after both rejected operations.

Validation for this remaining fix:

- Shared compilation and core build/declarations passed.
- Expanded B01–B06/consumer regression selection: **663 passing**. This includes
  the prior 618-case selection plus contract, model and authoritative validation
  suites, with six new dashboard rejection cases.
- Real Mongo publication/draft suites: **26 passing**, including two new dashboard
  activation/readiness cases. Repeated against the mounted portal image:
  **26 passing**. Both runs used the committed bootstrap helper and dedicated
  disposable databases on task-owned Mongo at port 27188.
- The mounted command uses the workspace as the portal source and explicitly sets
  development mode; the first attempt inherited the image's production mode and
  failed the session-secret setup before running tests. No configuration change
  was needed.

Mounted integration command (same test paths and helper as the local Mongo command
above, using a separate disposable database):

```sh
docker run --rm --network host \
  -v "$PWD:/opt/redbox-portal" -w /opt/redbox-portal \
  -e NODE_ENV=development \
  -e TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json \
  -e RECORD_DEFINITION_TEST_MONGO_URL=mongodb://127.0.0.1:27188/redbox_b06_final_mounted \
  --entrypoint node qcifengineering/redbox-portal:develop \
  --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config \
  --require ts-node/register/transpile-only --require chai \
  --require ./test/integration/helpers/record-definition-bootstrap.cjs \
  test/integration/services/RecordDefinitionPublicationService.test.ts \
  test/integration/services/RecordDefinitionDraftService.test.ts
```

- Full core suite (`npm --prefix packages/redbox-core test`): **2,962 passing,
  14 pending**, no failures.
- Root `node_modules/.bin/tsc --noEmit` and strict public contract consumer
  typechecking passed. The public check compiles
  `packages/redbox-core/test/record-definition-contracts.type-test.ts` against
  built declarations with `--noEmit --skipLibCheck --strict --target es2022
  --module nodenext --moduleResolution nodenext --esModuleInterop
  --experimentalDecorators`.
- Full repository lint passed, including the unsafe-expression gate and all 23
  guard tests, and the explicit `any`/`unknown` source/isolated-declaration gate
  and all seven adversarial guard tests. The frozen baseline is unchanged:
  5,409 source and 1,781 declaration nodes; no new nodes were admitted.
- Changed TypeScript files passed Prettier; `git diff --check` passed. Dependency
  manifests/lockfiles are unchanged. Angular lockfile blob is still
  `999da9f88d7f2f0fea33119c8c55eeb2c6e957b8`.
- The task-owned Mongo container and its disposable volumes were removed.
  Verification logs are `.tmp/b06-final-*.log` (ignored local artifacts).
