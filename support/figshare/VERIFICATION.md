# Figshare queued synchronisation: delivery and verification

## Baseline and scope

- Portal baseline: `master`, `69dd36e48dbd51cc576803b52b2fc1d8f3734247`; branch `feature/figshare-queued`.
- Companion CQU baseline: `feature/v5-refactor`, `5361c4b388b336065bf96001990707123888a75f`; branch `feature/figshare-queued` in its separate worktree.
- Design input: workspace `specs/figshare-queued-sync` (the request referred to `specs/figshare-queued`).
- Core dependency declarations: Agenda 6.2.5, `@agendajs/mongo-backend` 4.0.2 and the repository's `agenda-sqs-backend`. Record persistence uses the configured Sails Mongo datastore; the lifted test verified its native manager supports the required operations.
- Followed the repository agent guide and architecture/service/loader/coding/testing guidance. The implementation uses master's save path and does not depend on develop's general concurrency work.

## Entry points and save boundary

`validateFigshareRecord` and its old create/update alias perform local validation. `wakeFigshareRecord`, the old upload/sync aliases, old delayed publish/cleanup adapters and the legacy workflow scanner converge on durable work. They do not execute the old inline pipeline. Customer metadata overrides retain `makeClient` and `syncMetadata` extension points inside worker execution context.

Create commits initialising intent with the record and marks it ready only after attachment binding and synchronous post-hook persistence succeed. Update derives source intent after final pre-hooks; synchronous post-hook saves retain the intent and readiness token. Maintenance/projection writes do not originate intent. Incoming record snapshots cannot supply or overwrite protected intent/version fields.

## Automated evidence (2026-09-29)

| Check | Result |
| --- | --- |
| Core TypeScript compilation | Passed |
| Mongo storage TypeScript compilation | Passed |
| Full core suite with real Mongo Figshare tests | 2,217 passed; 14 skipped |
| Final focused worker/transport/status/receipt suite | 33 passed |
| Full Mongo storage suite with Mongo 7 | 233 passed |
| CQU compilation and unit suite | Passed; 262 tests passed on the v5-refactor base |
| Integration-status component, ChromeHeadless/Karma | 27 passed |
| Lifted portal Docker integration | Passed: model/shim/datastore registration, ready intent import, competing claims and conditional projection |
| CLI argument/help smoke check | Passed |
| Whitespace and implementation type-cast review | Passed; no new type-escape casts in implementation |

The final focused run includes two status/publication cases added after the full core run. Skipped core cases are not counted as verified. Tests used isolated Mongo databases and local controlled HTTP responses; no institution-owned article was created or published.

### Coverage by design phase

| Phases | Implementation and evidence |
| --- | --- |
| P0–P1 | `FigshareSyncModel`, registered Waterline shim and native `sync-store`; real Mongo CAS, duplicate initialisers, lease contention, stale owners and exclusive article binding |
| P2 | `RecordWriteOptions`, protected source intent in Mongo record writes and RecordsService save boundaries; concurrent source generations, initialising saves, hook failure, maintenance preservation, partial projections and primary/secondary expected-version conflicts |
| P3 | OID/brand jobs, Mongo recurrence and source import before acknowledgment; dropped delivery, replay, cooldown and archive predicate regression |
| P4–P5 | Distinct account/author identity fixtures, minimal create, exact token recovery, hidden create400, delayed visibility and changed CI; owner/token GET/DELETE/body placement and unmodified uploader credentials |
| P6 | Full-phase lease heartbeat, slow remote call and queue touch, lease loss, newer source save during update, current policy/config checks, curation freeze and quiet review waits |
| P7 | Content receipts, interrupted initialisation and explicit resumption, changed same-name bytes, deliberate deselection, foreign-file preservation, pending completion, embargo/public access, retained local bytes and post-cleanup selection identity |
| P8 | Compatibility adapters, cleanup-only mutation prohibition and guarded synchronous workflow persistence; real Mongo test documents later stale ordinary saves as the accepted master limitation |
| P9 | Live queued and terminal status without operation identities, researcher reload visibility, pending polling, bounded review/manual-publication audits and observed-publication event |
| P10 | Read-only inspect/reconcile/dry-run, wrong-context rejection, verified upload repair with lease exclusion, repeated conservative migration and uncertain-create quarantine |
| P11 | CQU source hooks/job registration/identity policy, preserved metadata override, updated lifecycle diagrams and core configuration/operator documentation |
| P12 | Automated regression evidence above; environment-specific release gates below remain open |

Useful test sources:

- `packages/redbox-core/test/services/figshare-queued.test.ts`
- `packages/redbox-core/test/services/figshare-managed-assets.test.ts`
- `packages/redbox-core/test/services/RecordsService.test.ts`
- `packages/sails-hook-redbox-storage-mongo/test/integration/FigshareIntent.test.ts`
- `test/integration/services/FigshareQueued.test.ts`
- `angular/projects/researchdatabox/form/src/app/component/integration-status.component.spec.ts`

## Reproduction

Use Node 24 as pinned by the repository, install/build the repository packages, and run:

```sh
npm run test:core
MONGO_TEST_URL=mongodb://127.0.0.1:27028 npm run test:storage-mongo
FIGSHARE_TEST_MONGO_URI=mongodb://127.0.0.1:27028 npm run test:core
RBPORTAL_MOCHA_TEST_PATHS=test/integration/services/FigshareQueued.test.ts npm run test:mocha:mount
```

The Mongo environment variables must reference a disposable test Mongo server. Each real-Mongo fixture uses its own database. For frontend verification, run from `angular`:

```sh
CI=true npx ng test @researchdatabox/form --watch=false --browsers=ChromeHeadlessNoSandbox --include='**/integration-status.component.spec.ts'
```

The local lifted test used the repository mount compose profile under an isolated project name, with anonymous dependency volumes because the host dependencies were symlinked to another local checkout. No tracked dependency versions or lockfiles were changed for that setup.

## Open release gates

Processing remains disabled by default. Live institutional staging, production backfill/cutover and rollback drills were not performed. Before enabling a brand, validate real CI/account permissions, owner creation followed by token updates, asynchronous review/publication/version semantics, slow multipart completion, embargo download access, service-user workflow permissions and production queue/backend operation. Test long SQS work against the deployed backend; local queue mocks and Mongo fixtures do not prove real SQS visibility behaviour.

Migration intentionally leaves unknown legacy files unmanaged, requires explicit reconciliation for ambiguous create/binding evidence and does not publish. It schedules observation; a record without an authorised source policy needs an eligible save before sync or automatic workflow transition. Local attachment bytes remain retained. Ordinary stale foreground saves retain master's documented ability to overwrite a completed background workflow transition.

See the [operator runbook](../wiki/Figshare-Queued-Synchronisation.md) for deployment, migration, repair and rollback procedures.

## CQU development stack startup verification

Built `redbox-hook-cqu:figshare-queued-local` from the compiled feature worktrees and production form bundle; started Compose project `cqu-figshare-queued` with MongoDB, Solr and MinIO. The portal passed its health check and `/default/rdmp/home` returned HTTP 200. Running core worker/source-intent, Mongo storage and CQU configuration file hashes matched the worktree builds; the generated FigshareSync shim was present.

Startup found and fixed a credential-validation boundary: preparing source intent and local validation must not require a remote token while processing is disabled. Worker execution diagnoses a missing token as repair-required once processing is enabled. The targeted RecordsService/FigshareService regression suite passed 119 tests after this fix. The local stack uses an S3 SDK initializer because the legacy MinIO client download URL returned HTTP 410.

## CQU v5-refactor baseline update

Reapplied the queued hooks, durable job registration and processing/impersonation configuration on CQU `feature/v5-refactor` at `5361c4b`. Contributor form defaults, null-safe metadata bindings and the CQU metadata override come from that base. A clean hook compilation and all 262 unit tests passed; the earlier master-based hook run had 302 tests. The portal implementation and its master baseline are unchanged.

Rebuilt `redbox-hook-cqu:figshare-queued-v5-local` and recreated the detached dev stack with the existing data mounts. Portal health passed and `/default/rdmp/home` returned HTTP 200. Container hashes matched the fresh CQU configuration/service build and the portal queued worker; both queued jobs were present and processing remained disabled.

## CI coverage enablement and master update (2026-10-01)

Merged current `master` at `0bc90811e` into the feature branch without conflicts. The Codecov report for `368f0e2fe` showed 37.35% patch coverage: CI had not configured `FIGSHARE_TEST_MONGO_URI` or `MONGO_TEST_URL`, so the durable worker and atomic storage integration suites were skipped despite being included in the test globs.

The core CI job now starts isolated Mongo 7.0, waits for its readiness and sets the worker test URI. The storage CI job now has its own Mongo service and test URL. Both suites reject missing database settings when `CI=true`, preventing silent skips from reappearing. Coverage thresholds and exclusions are unchanged.

Verification after the merge used Node 24.16.0 and a separate disposable Mongo instance, with controlled local HTTP responses and no Figshare UAT traffic. The core TypeScript build passed; the complete core suite passed 2,244 tests with 14 unrelated skips, including all 28 durable worker cases. The complete storage suite passed 233 tests. Oxlint passed across 607 files with zero warnings/errors, and the CircleCI YAML parsed with the expected database settings.

Local LCOV line coverage was 86.34% for the queued worker, 81.30% for the admin module, 96.83% for the sync store and 92.19% for MongoStorageService. Combining the local core and storage reports covered 83.82% of instrumented changed lines relative to current master. This local calculation is not the final Codecov result, which also merges the other CI reports and evaluates the new commit.


## CodeRabbit review remediation (2026-10-01)

Reviewed all eight inline findings on [PR #4825](https://github.com/redbox-mint/redbox-portal/pull/4825).

- Pending Figshare status is remembered for the viewing session so a completion between polls remains visible to researchers. Other integrations retain their existing visibility rules.
- Explicit relinking to a different article clears an observed publication checkpoint after the existing publication/receipt uncertainty checks. The operation makes no remote mutations.
- Disabled processing no longer attempts to parse legacy Agenda delays. The user confirmed that unsupported phrases with enabled processing must preserve record saves and pause Figshare work with a configuration error. Source intent is retained, live status identifies the required setting, and no remote operation or failure audit occurs until an explicit millisecond delay is configured.
- Live mutations perform their full guard immediately before HTTP. Fixture and customer overrides retain boundary guards. Multipart PUTs are explicitly classified as asset operations. The suggested lease-only multipart check was not adopted because the design requires fresh generation, configuration, eligibility and curation checks before each mutation.
- Dispatcher imports isolate record errors and page by OID beyond paused records. Failed and paused intents remain pending; their presence does not prevent delivering other due work.
- Legacy hooks warn once per brand when publishing is configured but queued processing is disabled. No inline mutation path is restored during cutover.
- Workflow-transition intent is collected only after an authorised transition is applied. Ordinary update policies remain eligible independently.
- The user confirmed explicit owner account IDs for owner-based administrative link/relink reads. The CLI accepts `--owner-id`, reads the target in a read-only owner context, verifies the returned article and owner IDs, and rejects conflicting or missing owner evidence. The same verified article reuses its bound owner even after a CI change. Bound file repair reads also carry the persisted owner context. No remote mutation or ownership transfer is performed.

Local verification used Node 24.16.0, Mongo 7.0 in a separate disposable container and controlled HTTP fixtures. The initial review fixes passed 2,250 core tests with 14 unrelated skips, including 31 durable worker cases. The complete storage suite passed 234 tests and the status-panel Karma suite passed 28 tests. Core and storage TypeScript builds and Oxlint passed. Additional focused runs covered unsupported legacy delays during disabled-processing saves and failure isolation after both invalid configuration and a changed persisted brand. No Figshare UAT request or local-stack credential read was needed.

The previous pushed commit (`a654190db`) has successful CI checks and project coverage, while Codecov patch coverage is 67.15% against a 69.21% target. CI/Codecov results for these review changes require a new run after pushing.


After both policy confirmations, the complete core suite passed 2,258 tests with 14 unrelated skips, including all 38 controlled-Mongo worker cases. These cover both legacy delay settings, paused pending and imported work, recovery after correction, explicit-owner dry runs and apply operations, mismatched/missing ownership evidence, same-article owner reuse after a CI change, and relinking to a different owner. A focused final upload-repair test also verified that private file reads use the persisted owner. Core TypeScript, Oxlint, CLI syntax/help and translation JSON validation passed. No UAT article or credential was accessed for these controlled tests.

## Rebuilt-stack UAT verification after review remediation

The CQU image and production form bundle were rebuilt from the reviewed sources and the stack recreated with its existing data. The real worker created private UAT article `11544326`, mapped all three related materials and uploaded two attachments with matching remote sizes/MD5 and retained local SHA-256 hashes. Three additional observe-only cycles preserved the expected pending state, with one started and one successful audit entry, no failed entries and no repeated remote mutations. The authenticated portal audit drawer displayed the successful sync trace. Detailed E2E reports are retained locally and excluded from source control. The user authorised committing and pushing after this verification completed.
