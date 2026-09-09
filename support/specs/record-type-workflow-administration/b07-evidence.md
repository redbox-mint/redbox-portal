# B07 authoritative manual transition service

Started in the existing shared worktree at `c7211c4e`, with a clean index and
working tree. No branch/worktree replacement, reset, discarded edit, dependency
change, or commit replacement was performed. The Angular lockfile remains Git
blob `999da9f88d7f2f0fea33119c8c55eeb2c6e957b8`.

## Implementation boundary

`WorkflowTransitionService.execute(brand, actor, { oid, transitionId,
expectedRevision })` is the controller-independent entry point. Brand and actor
are authenticated server facts. The method forwards only the stable edge ID and
revision to the normal `RecordsService.updateMeta` path. It exposes no generic
action execution endpoint and adds no B08+ routes, UI, secrets, or migration.

RecordsService selects the stored record and the active runtime projection once.
The transition resolver receives that projection's immutable revision, never a
draft or a client-supplied definition. It requires a manual edge ID, exact source
stage, record edit authorization, and a role present in both the source stage's
edit roles and the transition's allowed roles. Empty roles deny all; distinct
roles cannot combine to broaden the intersection. Eligibility uses the existing
bounded JSONata worker and its curated transition projection of the stored
record. UI visibility and submitted labels/roles/targets/metadata do not supply
authority.

A manual transition requires a usable expected record revision even under a
legacy last-write-wins definition. The existing full-record storage capability
check and CAS remain authoritative at persistence. The candidate is rebuilt
from the stored record, the selected target stage/form are applied through the
normal save path, and trigger suppression cannot skip the bound actions. A
managed type cannot use the legacy target-only update/create shortcut; create
first, then request an explicit transition. Untouched legacy types retain their
characterized behavior until the separately scoped migration.

Validation operation authorization/resolution runs before actions, without form
validators. The ordinary save validation runs afterward on the action result,
using the same active settings/stages and server-selected operation. Unresolved
or unavailable validation fails closed for manual transitions even in shadow
mode; resolved form-validation rollout semantics remain unchanged. The registry
coordinator prevalidates the bounded action plan and selects transition bindings
by the stable edge ID. Transition pre, update pre, primary persistence,
postSync/persistence, and detached post retain the existing ordering. Manual
saves never enter automatic evaluation, and the existing automatic first-match,
one-hop engine remains unchanged.

The existing version-one action audit summary gains optional bounded transition
evidence: stable transition ID, immutable definition revision ID, source stage,
and target stage. It remains separate from business metadata and carries no
client label, condition, credentials, or action parameters. Existing action
failure/redaction and post-persistence outcome contracts are reused. The strict
record-save response schema accepts only the four bounded transition fields;
extra parameters or secret fields are rejected. A thrown postSync action retains
the committed transition and suppresses detached transition post dispatch,
matching the existing characterized exception path.

## Focused review fix against `f9c1699b`

The runtime projection now explicitly copies only `transitionId`,
`definitionRevisionId`, `sourceStage`, and `targetStage`. All four must be strings
of at most the public schema's 128-character limit; malformed evidence is
omitted without coercion or identity truncation. The result is detached. The
closed public response schema and public declarations already describe this
shape and remain unchanged. Adversarial core tests inject parameters, secrets,
expressions, helpers, arrays and nested objects into both extra and permitted
fields, and mutate input/output independently.

Call-site review also found Mongo's secondary audit sanitizer dropped transition
evidence. It now retains the same four bounded strings, with independent
adversarial persistence tests. Other action summary fields, detached completion,
automatic transitions and legacy saves retain their existing behavior.

The publication suite now has two **published-to-save** cases: stable ID/revision
only, and a forged target/label/role/validation-operation/group payload. Each
publishes through the default Mongo-backed publication authority, seeds a real
record under that managed type and brand, and calls the authoritative
`RecordsService.updateMeta` boundary. It checks exact denial codes and native
Mongo state for wrong brand, missing record edit permission, stage/edge role
intersection, stale revision and wrong source stage. It executes a real required
validator in the published `publish` group, proves forged fields cannot skip it,
and loses a native Mongo CAS to a competing revision update after validation.
The successful save checks immutable revision evidence, server stage/label/form,
unchanged business metadata, revision 4 → 6, action/persistence order, and the
persisted native audit summary.

Harness setup: the existing lift deliberately skips application bootstrap. The
cases install real source RecordTypes/WorkflowSteps service instances to keep
source and compiled runtime WeakMap snapshots paired, restore them afterward,
and await Mongo's real initialization/index creation. Test actions are direct
registered handlers published as ordinary bindings. A validation observer calls
the original resolver and inspects its results; it does not replace validation,
authorization, workflow selection or active-definition resolution. The initial
operation-only validation has no effective groups; the two subsequent validation
passes execute `publish`. Search indexing is a successful sink, and queue audit
delivery forwards to the real Mongo `createRecordAudit` implementation. This
covers save authority and audit persistence, not Solr or queue infrastructure.

## Verification commands and evidence

Focused-fix logs are copied to `.tmp/b07-fix-*.log` (ignored local artifacts).

- Full core suite: **3,045 passing, 14 pending**, no failures, with
  `npm --prefix packages/redbox-core test -- --timeout 15000 --reporter dot
--require ../../.tmp/b07-fix-mocha-timeout.cjs`. The temporary hook below extends
  only the existing hook-docs rendering test; production action/expression limits
  are unchanged.
- Focused B07 resolver/save/audit tests: **37 passing**.
- Mounted native Mongo save/CAS tests: **17 passing**.
- Full Mongo-storage suite: **117 passing, 9 pending**; focused audit projection
  tests: **2 passing**.
- Mounted publication/draft integration: **31 passing**, including both real published-to-save B07 cases.
- All build, standard type, public type and lint commands completed successfully.
  The explicit-type baseline remains **5,409 source / 1,781 declaration nodes**,
  unchanged, with no new explicit `any`/`unknown` admitted.

- Core and Mongo-storage build/declaration emission, root backend typecheck,
  and strict public declaration consumer check.
- Full repository lint, unsafe-expression gate and 23 guard tests, explicit
  `any`/`unknown` source/isolated-declaration gate and seven adversarial tests.
- Focused resolver/save tests, full core suite, real Mongo native-storage save
  boundary tests, and mounted publication/draft integration tests.
- Optional strict compiler-host comparison against `c7211c4e`: 749 baseline and
  749 current diagnostics, zero additions/removals; no baseline source checkout
  or worktree modification is needed for the comparison.

Focused tests:

```sh
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json \
node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config \
  --require ts-node/register/transpile-only --require chai \
  --require ./packages/redbox-core/test/setup.ts \
  packages/redbox-core/test/services/WorkflowTransitionService.test.ts \
  packages/redbox-core/test/services/RecordsService.test.ts \
  packages/redbox-core/test/action-execution/executor.test.ts --grep B07
```

For native Mongo storage, run the RecordsService selection with
`B07_TEST_MONGO_URL=mongodb://127.0.0.1:27189/redbox_b07`. This must be a dedicated
disposable database: the tests clear their `b07_records` fixture collection.
They use the real MongoStorageService CAS implementation and inspect native
persisted documents. Definition projection, authorization, validation and action
fixtures are controlled in that suite. The original separate publication case
exercises ID resolution only. The new published-to-save cases described above cover the full B05 publication → B06
runtime → B07 RecordsService → native Mongo connection without those stubs.

Mounted publication/draft integration uses the existing bootstrap helper and a
separate disposable database (the lifted app uses `migrate: drop`):

```sh
docker run --rm --network host \
  -v "$PWD:/opt/redbox-portal" -w /opt/redbox-portal \
  -e NODE_ENV=development \
  -e TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json \
  -e RECORD_DEFINITION_TEST_MONGO_URL=mongodb://127.0.0.1:27189/redbox_b07_mounted \
  --entrypoint node qcifengineering/redbox-portal:develop \
  --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config \
  --require ts-node/register/transpile-only --require chai \
  --require ./test/integration/helpers/record-definition-bootstrap.cjs \
  test/integration/services/RecordDefinitionPublicationService.test.ts \
  test/integration/services/RecordDefinitionDraftService.test.ts
```

The same image/mount can run the RecordsService selection with its unit setup
and `B07_TEST_MONGO_URL` instead of the publication bootstrap helper. No test
claims a distributed network-partition or complete B09 API/browser exercise.

Additional focused-fix commands (exit zero):

```sh
npm --prefix packages/redbox-core run build
npm --prefix packages/sails-hook-redbox-storage-mongo run build
npm --prefix packages/sails-hook-redbox-storage-mongo test -- --reporter dot
node_modules/.bin/tsc --noEmit
node_modules/.bin/tsc packages/redbox-core/test/record-definition-contracts.type-test.ts \
  --noEmit --skipLibCheck --strict --target es2022 --module nodenext \
  --moduleResolution nodenext --esModuleInterop --experimentalDecorators
npm run lint
node .tmp/b07-fix-compare-strict.cjs
git diff --check
```

`npm run lint` includes the explicit unsafe-expression and explicit-type-node
gates and their adversarial tests. The strict comparison uses a compiler-host
source overlay from `git show c7211c4e:<path>` and excludes the newly added B07
service from baseline roots; it does not switch or modify the worktree.
The Angular lockfile hash remains the blob listed above.

## Test-run corrections

An initial full core run hit the existing OpenAPI render test's five-second
harness limit. The final run used a fifteen-second Mocha timeout and passed.
One new failure-order assertion initially expected detached post after a thrown
postSync handler; it was corrected to the existing characterized suppression
semantics, with no runtime order change. Earlier expression checks overlapping builds also experienced worker timing contention;
final test runs were separated from builds. No production timeout was relaxed.

The task-owned Mongo container was removed after verification. `git diff --check`
passed, and the Angular lockfile blob was rechecked before committing.

During the focused fix, an initial storage build overlapped the core build's
replacement of its declaration directory; the sequential storage rebuild passed.
Two full core runs had 3,044 passing, 14 pending and one timeout in the existing
hook-contributed API docs test (its local 10-second limit), including an isolated
rerun. The final isolated run uses this ignored local Mocha hook, at
`.tmp/b07-fix-mocha-timeout.cjs`, to give only that test 30 seconds. It changes no
assertions, repository test files, or production limits:

```js
exports.mochaHooks = {
  beforeEach() {
    if (
      this.currentTest.fullTitle() === 'API routes contract layer should include hook-contributed routes in merged docs'
    ) {
      this.currentTest.timeout(30000);
    }
  },
};
```
