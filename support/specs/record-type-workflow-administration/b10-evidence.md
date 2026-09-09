# B10 — Versioned create-only bootstrap seeds

## Contract and startup

`Config.recordDefinitionSeeds` is a loader-discovered configuration entry with an
empty default (core remains pristine). It contains `{ schemaVersion: 1, seeds }`.
Each seed supplies `brandId`, `recordTypeKey`, positive integer `seedVersion`,
code-owned `packageType` and `searchCore`, and a
complete `PublishableRecordDefinitionAggregateDto`. `seedVersion` records deployment
provenance in the bootstrap actor; increasing it never authorizes an update.

`ServiceExports.RecordDefinitionSeedService.seed(manifest)` is the dedicated adapter.
Core bootstrap calls its generated Sails service after brand/role setup and before
loading record types. The manifest supports multiple explicit brand IDs; authority
and record-type reference catalogs are scoped independently for each brand. Hooks
can provide the config using the existing `registerRedboxConfig` discovery contract.
There is no additional hook-discovery mechanism or dependency.

The adapter rejects unsupported envelope versions/properties, invalid identities,
duplicate identities, non-JSON objects/accessors/proxies, oversized input, incomplete
aggregates, invalid workflow graphs and unavailable role/form/action references. It
parses and semantically validates the **whole batch before any definition write**,
using the B02 publication validator and B05 code-owned authority. It validates skipped
seed data as well; a malformed deployment manifest fails startup even when its target
identity already exists.

For each valid entry, an existing `(branding, name)` identity is reported as `skipped`.
Legacy rows, edited definitions, draft-only identities and retired identities are all
preserved. No existing identity, revision, history, draft or workflow row is merged,
updated or deleted. A missing identity gets an immutable revision and bootstrap
history, followed by one unique identity insert pointing at that revision. Runtime
workflow reads project the aggregate; seeds do not create legacy `WorkflowStep` rows.
Per-entry structured logs and the return value report creations and skips and their
brand, key and seed version.

`RecordTypesService.bootstrap` now loads persisted definitions. Its old empty-brand
configuration create branch and `bootstrapAlways` deletion are removed.
`WorkflowStepsService.bootstrap` reads only the caller's identities through the active
runtime adapter. It no longer scans/deletes all workflow rows or fills missing steps
from configuration. Other uses of `bootstrapAlways`, including forms and dashboards,
are outside this slice and remain unchanged.

## Deployment prerequisites and limitations

- Provision the referenced brands, brand roles and forms before calling the seed
  service (for example through installation data or an explicit migration). Brand IDs
  are database identities, not names or aliases; core only creates the default brand
  and its roles. Seeding does not provision other brands or clone default-brand data.
- Legacy `recordtype`/`workflow` configuration, including the retained development-hook
  fixtures, is no longer a seed source. Fresh installations must supply explicit
  versioned aggregates and their prerequisites. Existing persisted legacy definitions
  remain readable. Automatic conversion of those legacy fixtures/rows, expressions,
  and nested callbacks belongs to B11 and is not implemented here. As the governing
  specification states, these slices are a single release, not separate deployable
  release boundaries. Do not deploy this slice alone expecting the old demo bootstrap.
- To change an already deployed definition, use administration or an explicit data
  migration. Changing seed contents or incrementing `seedVersion` only affects missing
  identities. No draft is manufactured by seed startup; the initial active definition
  can be cloned through B04, and existing drafts remain untouched.
- The adapter is **not a multi-document or batch transaction**. Immutable artifacts are
  created before the identity becomes visible. A failure can leave orphan revision or
  history rows, and an earlier seed in a batch can already be active. Retry the identical
  manifest to finish an interrupted seed. Changed content/version conflicting with an
  orphan fails closed; quiesce writers, inspect the artifacts, and use an explicit
  migration to reconcile. Never delete deployed state as a startup workaround.
- Concurrent seed calls use deterministic artifact/identity IDs plus the existing
  model uniqueness constraints. Duplicate/ambiguous write failures are reconciled by
  reading the exact identity or artifact and checking ownership/content. A recovered
  identity is reported as `skipped`, including after a lost create acknowledgement;
  reports describe confirmed adapter outcomes, not an audit count of physical writes.
  Different concurrent manifests can conflict rather than choosing an overwrite winner.
- Races with independent legacy writers may leave unused artifacts if another writer
  wins the identity. There is no cross-process lock or automatic orphan deletion. All
  application writers must use the existing unique identities; this adapter does not
  promise atomicity against administrative edits to authority catalogs during startup.

## Verification

All commands ran in the existing worktree on the existing branch, starting from
`fd721e3d`. Installed dependencies and the already-running Mongo container on port
27190 were reused. The native gate used its own disposable `redbox_b10_native`
database; it did not reuse the prior B09 database.

```sh
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config --require ts-node/register/transpile-only --require chai --require ./packages/redbox-core/test/setup.ts packages/redbox-core/test/services/RecordDefinitionSeedService.test.ts packages/redbox-core/test/services/RecordTypesService.test.ts packages/redbox-core/test/services/WorkflowStepsService.test.ts packages/redbox-core/test/record-definition-seed-bootstrap.test.ts
node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json
node_modules/.bin/tsc -p packages/sails-hook-redbox-storage-mongo/tsconfig.json
RECORD_DEFINITION_TEST_MONGO_URL=mongodb://127.0.0.1:27190/redbox_b10_native bash support/integration-testing/run-b09-native.sh
npm --prefix packages/redbox-core test -- --timeout 15000 --reporter dot --require ../../.tmp/b07-fix-mocha-timeout.cjs
node_modules/.bin/tsc --noEmit
node_modules/.bin/tsc packages/redbox-core/test/record-definition-contracts.type-test.ts packages/redbox-core/test/record-definition-seeds.type-test.ts --noEmit --skipLibCheck --strict --target es2022 --module nodenext --moduleResolution nodenext --esModuleInterop --experimentalDecorators
node .tmp/b10-compare-strict.cjs
npm run lint
bash -n support/integration-testing/run-b09-native.sh support/integration-testing/run-mocha-redbox.sh
git diff --check
git merge-base --is-ancestor fd721e3d HEAD
git diff fd721e3d --exit-code -- angular package.json package-lock.json '**/package.json' '**/*lock*'
```

| Check | Final observed result |
| --- | --- |
| Focused seed/adapter/core-bootstrap tests | 43 passing |
| Required generated-app/native Mongo gate | 37 passing; zero pending, including all three B10 native cases |
| Full core regression | 3,114 passing; 14 existing pending |
| Core and storage package compilation/declarations | Passed (direct package `tsc`, without deleting emitted directories or installing dependencies) |
| Root typecheck | Passed |
| Strict public consumer of emitted declarations | Passed |
| Strict package diagnostic comparison with starting commit | 749 baseline / 749 current; zero added or removed |
| Lint and unsafe-expression security guard | Passed; zero lint warnings/errors; 23 security-guard tests |
| Explicit source/declaration guard | Passed; 5,403 frozen source / 1,780 frozen declaration nodes; 7 guard tests |
| Runner shell syntax and whitespace | Passed |
| Ancestor, manifest, lockfile and Angular preservation | Passed; 633 tracked files byte-identical to starting state |

The strict comparison uses a read-only compiler-host overlay of `git show
fd721e3d:<path>` and compares file/code/message multisets. It does not rewrite or
switch the checkout. The package still has its 749 pre-existing strict diagnostics;
the public consumer passes strict checking. The inherited timeout helper raises only
the hook-contributed API-doc test timeout to 30 seconds. The 14 pending core tests
match the preceding B09 evidence; no new pending tests or skipped assertions were
introduced. The first core regression also passed (3,112 passing / 14 pending) before
the final orchestration/metadata tests were added.

The native gate now includes B10 under the existing mandatory runner. Its generated
Sails application discovers the **emitted** seed service and uses actual Waterline/
Mongo models and default publication authority. Eight concurrent calls produce one
identity, one revision, one history event, one `created` report and seven `skipped`
reports. Real Admin retirement followed by seeding preserves the stored identity,
and runtime projections/history remain readable. The whole-batch malformed-data
case verifies zero definition rows in either brand. The normal integration runner
executes this required isolated gate first; its second, broad application pass excludes
that already-executed suite, just as it already excludes the dedicated B09 HTTP case.
No native prerequisite is converted into a pending test. The full Compose application,
Bruno and Angular suites were not run for this backend slice.

Unit fault injection additionally covers interrupted history creation with invisible
identity, identical-manifest retry, changed-manifest conflict, and identity-create
acknowledgement loss. These are unit simulations, not claims of native fault injection
or transactional recovery. The bootstrap orchestration test mocks unrelated services;
the native gate deliberately disables the application's full bootstrap.

Earlier focused runs exposed and corrected a publishable-to-draft validation-boundary
mismatch. Early native runs corrected two test DTO assumptions (history source shape
and retirement request fields), then found a real missing-deployment-metadata defect.
`packageType` and `searchCore` are now required, validated seed fields persisted only
on identity creation; the final native Admin lifecycle test passes. No production
validation or existing lifecycle test was weakened to make these runs pass.

Removing the destructive branches eliminated six source `unknown` nodes and one
public declaration node. Only the three affected frozen baseline entries were lowered;
no allowance, source exclusion or new explicit type node was added.

Angular lockfile SHA-256 before and after:
`00cd79599210ba9e6b9f43dc606d2c2e130b6a27b4c81970323e4a640c468bc3`.
All existing commits and the preserved Angular lockfile change remain intact.
Dependency manifests and lockfiles are untouched. Only B10's implementation-plan
checkboxes are changed; B11 and later slice checklists remain unchanged.
