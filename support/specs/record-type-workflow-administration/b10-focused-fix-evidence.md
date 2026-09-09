# B10 focused independent-review fix

Reviewed the supplied P1/P2 findings against commit `26af2f67`, the B10
implementation-plan scope, seed contract/evidence, service, persistence models,
and unit/native tests. The worktree started clean on that commit; no branch or
existing commit was replaced.

The seed adapter now applies a local data-only check after bounded preflight.
It rejects function values, proxies, accessors, symbol/non-enumerable properties,
and extra array properties throughout the manifest. Seed entries are traversed
by index, so an own `map` override cannot execute or return an empty successful
report. The shared validator and public API remain unchanged.

Orphan revisions must match the canonical ID, schema, owner, key, revision number,
hash, aggregate, contracts, provenance and actors. Their timestamp must be valid
and they cannot carry an unexpected publication note. History reconciliation
also verifies schema, operation ID, expected versions, timestamp correspondence,
validation/impact reports, changes, redactions, truncation and note, alongside
the existing ownership and content checks. Timestamp comparison accommodates
the string/Date representations supported by the persistence models.

The non-transactional limitation in [B10 evidence](b10-evidence.md) still applies.
The service performs no updates or deletes. Corrupted artifacts require explicit
migration; retries do not repair or remove them.

Regression tests cover 20 caller-property attacks, 15 revision-field corruptions,
24 history-field corruptions, and successful recovery after an interrupted
identity insert. Corruption tests assert unchanged stored artifacts and zero
further writes. These are unit fault simulations; the mandatory native gate
retains all its existing coverage without skips or relaxed prerequisites.

## Verification

Commands ran in the existing worktree, using installed dependencies and the
existing Mongo process on port 27190. The mandatory native runner used a new,
disposable database `redbox_b10_focused_fix_native`; existing databases were not
used or deleted. Full logs are in `.tmp/b10-focused-*.log`.

- Focused seed, record-type, workflow-step and bootstrap unit suites: **103 passing**.
- Core package build/declaration emission: **passed**, exit 0.
- Root `tsc --noEmit`: **passed**, exit 0.
- Strict public consumer (`record-definition-contracts.type-test.ts` and
  `record-definition-seeds.type-test.ts`, importing emitted declarations):
  **passed**, exit 0.
- Oxlint: **0 warnings, 0 errors**.
- Unsafe-expression guard: **passed**, 16 documented legacy sites; **23 tests passed**.
- Explicit-type source/declaration gate: **passed**, unchanged frozen counts
  **5,403 source / 1,780 declaration nodes**; no allowances added.
- Explicit-type guard regression suite: **7 passed**, zero failed/skipped.
- Mandatory generated-app/native Mongo gate: **37 passing**, zero pending,
  including all three mandatory B10 native cases; exit 0.
- Strict diagnostic comparison against `26af2f67`: **749 baseline / 749 current**,
  **0 added / 0 removed**. The inherited strict errors remain; this is a
  no-regression comparison, not a claim that the legacy strict configuration passes.
- `git diff --check` and ancestor preservation check: **passed**.
- Angular, manifests, lockfiles and the frozen explicit-type baseline: **unchanged**.
  Only the B10 service, its unit tests and this evidence file changed.

Reproduction commands (all exit 0):

```sh
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config --require ts-node/register/transpile-only --require chai --require ./packages/redbox-core/test/setup.ts packages/redbox-core/test/services/RecordDefinitionSeedService.test.ts packages/redbox-core/test/services/RecordTypesService.test.ts packages/redbox-core/test/services/WorkflowStepsService.test.ts packages/redbox-core/test/record-definition-seed-bootstrap.test.ts
node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json
node_modules/.bin/tsc --noEmit
node_modules/.bin/tsc packages/redbox-core/test/record-definition-contracts.type-test.ts packages/redbox-core/test/record-definition-seeds.type-test.ts --noEmit --skipLibCheck --strict --target es2022 --module nodenext --moduleResolution nodenext --esModuleInterop --experimentalDecorators
RECORD_DEFINITION_TEST_MONGO_URL=mongodb://127.0.0.1:27190/redbox_b10_focused_fix_native bash support/integration-testing/run-b09-native.sh
npm run lint
node .tmp/b10-focused-compare-strict.cjs
git diff --check
git merge-base --is-ancestor 26af2f67 HEAD
git diff 26af2f67 --exit-code -- angular package.json package-lock.json '**/package.json' '**/*lock*' support/security/explicit-type-node-baseline.json
```

The diagnostic comparison reused the existing `.tmp/b10-compare-strict.cjs`
compiler-host comparison with its baseline revision changed to `26af2f67`;
it reads prior source through `git show` without checking out or altering files.
