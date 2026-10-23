# P7 expanded existing-core regression and fixes

The original full-core command supplied only `PERSISTENCE_TEST_MONGO_URL` and
reported **4420 passing / 68 pending / 0 failing**. This was insufficient to
exercise the other environment-gated existing suites.

## Real-service reproduction

Two disposable Docker servers were started with `nofile=64000:64000`, 768 MiB
limits and 0.25 GiB WiredTiger caches: MongoDB **8.0.34** on loopback **29511**,
and **9.0.4** on **29512**. The latter used the existing foundation suite's exact
synthetic authenticated fixture. Each server was awaited before the command.
Node **26.11.1**, npm **11.20.0**, Mocha **11.7.6**:

```sh
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:29511/redbox_prisma_p7_full \
P1_MONGO_URL='mongodb://p1_fixture:p1-only@127.0.0.1:29512/wr_p1_core?authSource=admin' \
FIGSHARE_TEST_MONGO_URI=mongodb://127.0.0.1:29511/sr_p7_figshare \
SIEM_TEST_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_siem \
  npm run test:core
```

The first expanded run finished **4479 passing / 7 pending / 2 failing**,
exit **2**. It actually exercised the previously pending **3 foundation / 51
queued-Figshare / 7 SIEM** cases. The two failures were reproduced without the
legacy global setup or other suites:

```sh
cd packages/redbox-core
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --timeout 30000 test/integration/PersistenceFoundation.test.ts
```

With the same `P1_MONGO_URL` and a fresh authenticated server, this isolated
command reported **1 passing / 2 failing / 0 pending**, exit **2**. This rules
out full-suite global interference. No existing timeout or test changed.

## Causes and corrections

1. `inspectPersistenceIndex` cast an explicit maintenance collection name to a
   generated Prisma model root. The existing `ledger_probe` scope is not such a
   root, and Prisma raised `ORM.MODEL_UNKNOWN` before any duplicate audit. The
   safe public error deliberately hid that native detail. A temporary tagged
   diagnostic isolated it and was removed. The read-only, collection-scoped
   duplicate audit now borrows the already-owned native connection, like the
   surrounding catalog inspection. It registers no model, writes no documents
   and opens no extra pool. Business repositories still use Prisma. The existing
   missing/conflicting/duplicate and explicit-DDL assertions remain intact.
2. `definePersistenceGroup` correctly rejected a retained repository after close,
   but its diagnostic no longer stated that the handle was inactive. Restore the
   established `no longer active` diagnostic while retaining the instruction to
   resolve the active repository. Lifecycle admission/fencing is unchanged.

After the changes, the identical isolated command on a fresh server reported
**3 passing / 0 failing / 0 pending**, exit **0**. The intermediate instrumented
run, with only the diagnostic correction, was **2 passing / 1 failing**; its
remaining error identified the unsupported model root. This is an actual
red/green sequence over unchanged existing assertions. Core Prisma generation,
TypeScript compilation and generated-artifact copying also completed, exit **0**.

The first full rerun reached **4480 passing / 7 pending / 1 failing**, exit **1**:
the separate shared-group test also requires the repository name in the recovery
instruction (`active fixture`). The final message preserves that original
instruction as well as `no longer active`. The unchanged Node 26
`test/unit/persistence-foundation.test.ts` then passed **11/11**, zero pending or
failures. No assertion was broadened. Focused Oxlint reported **0 warnings /
0 errors** for both changed modules; index-source formatting and diff checks
passed. The final complete rerun on the committed fixes finished **4481 passing / 7 pending / 0 failing**, runner exit **0**. Its source is `58f7cbbd60e23881cdfea9fbcb712ab2b01914ca`; both owned Mongo containers/volumes were stopped and removed successfully.

## Seven remaining explicitly disabled cases

These seven source cases are unchanged and remain uncovered; they are not
successful qualification or environment skips:

- `RaidService.test.ts`: two contributor cases have empty bodies and explicitly
  require complex mapping configuration.
- `TriggerService.test.ts`: two template-validation cases are explicitly
  `it.skip`; the source does not record a maintained reason for disabling them.
- `WorkspaceService.test.ts`: three HTTP API cases are explicitly disabled with
  source comments about Axios/module-cache mocking and moving HTTP-dependent
  behavior to integration coverage.

The full-core runner's legacy global setup remains distinct from a production
Express portal. Executing these domain suites cannot close the missing installed
composition or the full Bruno/Playwright/root-Mocha acceptance gate.

Ignored logs beneath `.tmp/sails-retirement/`: `p7/core-real-mongo/suite.log`,
`p7/foundation-red.log`, `p7/foundation-isolated/suite.log`,
`p7/foundation-green/suite.log`, `p7-core-fix-build.log`; the final expanded rerun
is recorded in [P7 qualification](p7-qualification.md#sr-046--existing-regression-and-the-integration-gate).
