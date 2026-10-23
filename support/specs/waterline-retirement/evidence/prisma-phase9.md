# Phase 9 — whole-branch qualification

Application/images tested: `f4959e4ca` (phase 8 `c7f43b8a5` plus U-11). Final suite code HEAD:
`45640a5e1`, which adds only the dashboard browser-fixture wait; the later evidence commit has no
runtime changes. Baseline: `0ea5e9bc2`, archived source plus its retained compiled dependency
artifact; dev-tools/dev hook compiled from that source. Baseline cache already uses the native
repository, with Waterline still serving U/S. No claim of an all-Waterline baseline.

ARM64, two CPUs, 12 GiB; Node 24.16.0 / npm 11.20.0; Prisma pins unchanged. One heavy command at a
time with external timeouts. Every Mongo container uses
`mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`. Raw logs,
runner overrides and JSON are in `.tmp/wrpz9/`.

## U-11

`f4959e4ca` clears both empty/null revocation inputs with Prisma model CRUD, propagates failed
updates and rejects a disappearing user. Five focused unit cases and two live portal cases pass,
including stored null and HTTP 403 for a previously valid bearer after each input. The quirk is
marked fixed.

## Qualification

1. Fresh development Compose stack: init indexes, official inspect + ensure each ready (99 entries),
   login HTTP 200; SIGTERM 222 ms, exit 0, no OOM.

2. Existing named Mongo volume seeded by the old application: 13 representative entities plus
   membership, SIEM/Figshare state and a real shipped pending migration. Candidate inspect initially
   exit 2; ensure then inspect ready. Real bootstrap applies
   `20261014T000000-admin-sidebar-text-color`. Candidate passes 21 checks including physical absence
   after a supplied-field form patch, explicit null/falsy JSON, new null-token user, real GridFS
   bytes/session request, slow accepted upload and cleanup ordering. Prior artifact passes 17
   readback checks on that same volume, including new Prisma null-token user. No incompatible
   rewrite observed in this bounded fixture; no production/institution backup recovery claim.

3. Full documented Playwright Compose/image run: 19/19 harness cases pass; 119/120 browser cases
   pass in 9.6 min. A03 overlapped its own filter with sorting: the trace shows Prisma returning
   correct ascending titles, then the earlier last-modified filter response arriving last. The
   fixture now waits for the filter response and enabled Search control. A fresh targeted A03 run
   passes (1/1, 12.6 s test); full 120-case gate was not rerun. All 120 cases therefore have passing
   coverage across those runs, without claiming a single green full-suite gate. Covers login/logout,
   dashboards/search, create/edit/submit/conflict, branding, user/role admin, vocabularies, settings
   and local attachments. Full JUnit/log and original failure trace are retained under
   `.tmp/wrpz9/`. F-09-04 records unchanged UI request-concurrency behaviour; F-09-05 records
   initial Solr client errors reproduced by the old seed run. No prior-artifact browser reproduction
   of the UI race was run. The first targeted selection used an over-anchored grep and selected no
   cases; corrected command ran exactly one.

4. Operations: one bounded cache CRUD comparison below.

5. Shutdown/failure: 16 native/domain resources, 2 Prisma clients, 1 shared pool become 0/0/0 in
   correct order; slow GridFS upload completes. Lower callback 12.68 ms in budget run. A separate
   strengthened live drain probe asserts a 750 ms upload is still pending at lower, completes it
   before pool close, and leaves 0/0/0 resources/clients/pools; lower takes 747.69 ms (3 check
   groups). Natural process exit still needs a watchdog at 5 s on both artifacts: Agenda
   completed-job lock-watchdog timers, tracked to upstream JobProcessor. Normal fresh/production
   SIGTERM exits 0. Stale waterline/mongodb/prisma selectors each exit 1 with removal guidance.
   Unreachable Mongo fails bootstrap promptly with bounded credential-free connectivity guidance and
   no listener, but exits 0, also reproduced with old artifact. Register F-09-01/02 captures
   pre-existing issues.

6. Dev-tools standard archetype compiled and passed 5 live groups: lazy repository service,
   discovered hook/service shim, registered Prisma migration readback, one ledger entry after
   running twice, cached hasModels refusal. This is representative qualification of the documented
   porting path, not certification of an actual institution hook.

7. Six local packed tarballs (core/storage + four internal dependencies), strict fresh consumer
   install with `--ignore-scripts` (1322 packages), four no-symlink/no-socket/import/export checks
   pass on Node 24; legacy ORM npm ls empty. Production Dockerfile recipe builds every production
   Angular app, package, Prisma contract and webpack/API bundle. A temporary recipe changes stock
   Node 26.11.1 bases to required Node 24.16.0 and pins npm 11.20.0 in base/runtime/NVM. Actual
   production image starts with production environment, explicit database URLs, session secret and
   socket origins; indexes ready, login HTTP 200; SIGTERM 289 ms, exit 0/no OOM. Stock Node 26
   recipe and PDF runtime target not tested. Pre-existing development Compose double-underscore
   connection env spelling documented as F-09-03.

8. Final code HEAD `45640a5e1`: core 4270 pass /83 pending; durable live persistence 14 pass;
   storage 302 pass /0 pending; portal 420 pass /10 pending. Bruno General folders 1–4: **309/309
   requests, 553/553 tests, 3/3 assertions PASS**, exact collection file parity checked. OIDC
   denied/allowed + S3 folders 5–7: **20/20 requests, 29/29 tests**; exact collection parity
   checked. Static checks below pass. No timeout relaxed. Initial Bruno staging omitted six
   collection files; corrected against repository. Initial 303-request run: 302 passed, 539/541
   tests and 3/3 assertions; one external DataCite service lookup timed out at 10 s (HTTP 500). The
   corrected complete 309-request rerun passes, including the real DataCite call; no test skipped or
   stub substituted.

## Bounded operations comparison

Workload: cache create/read/update/read/delete, 100 warmups then three batches of 1000 cycles,
assertions on every read (zero cycle errors). Same hardware and service caps, same seeded volume and
enabled dev hook, only one app at a time. RSS after requested GC; p95 is entire cycle latency.
Startup timing begins after the probe imports Sails and ends on lifted. Mongo profiler restricted to
cache namespace, so background cache calls contaminate totals. These are three batches in one
process, not three independent cold-start replicates.

| Metric | Prior artifact | Prisma | Budget/result |
| --- | ---: | ---: | --- |
| Startup | 10497.58 ms | 13447.65 ms | +28.10%; exceeds +1049.76 ms observed end-to-end allowance |
| RSS | 909.57 MiB | 680.34 MiB | 0.748x; <=1.10x PASS |
| Cycle p50 | 3.499 ms | 3.666 ms | reported |
| Cycle p95 | 4.891 ms | 5.843 ms | 1.1947x; <=1.20x PASS |
| Cycle p99 | 11.940 ms | 7.243 ms | reported |
| Cycles/s | 267.48 | 251.20 | 0.9391x; >=0.90x PASS |
| Namespace DB calls /3100 cycles | 15550 / 5.0161 | 15561 / 5.0197 | +11 ambient-inclusive calls; <=baseline not established |
| Owned pools after lower | not censused | 0 | PASS on candidate; no resource/client/pool remains |

The [machine-readable measurements](prisma-phase9-operations.json) retain unrounded values and
resource census. Startup includes real pending-migration work on the candidate and different
implementation imports; this single measurement does not isolate persistence overhead. No budget
relaxed. Startup and uncontaminated call-count acceptance remain owner follow-ups before next
promotion. The existing 12-second import-test deadline remains unchanged. Formal operations approval
for official releases and real-user/environment testing remain separate.

## Commands and limits

All full commands/overrides are retained under `.tmp/wrpz9/`: `run-upgrade.sh` then
`run-upgrade-resume.sh` / `run-rollback.sh`, `run-fresh.sh`, `run-production.sh`, `run-failure.sh`,
`run-hooks.sh`, `run-packed.sh`, `run-drain.sh`. They use the repository development/integration
Compose files and maintenance CLI, with isolated prefixes/ports/volumes. Fixture retries corrected
seeded Waterline-mutated IDs/timestamps, an intended pending-migration branding value, Prisma update
return shape and production deployment settings; they were not product fixes. Only the first
completed 3000-cycle candidate measurement is used.

| Final command (all externally bounded with `timeout`) | Result |
| --- | --- |
| `timeout 300s npm --prefix packages/redbox-core test -- --exit` | 4270 passing /83 pending /0 failing |
| `PERSISTENCE_TEST_DOCKER_PREFIX=wrpz9-live npm --prefix packages/redbox-core run test:persistence` | 14 passing /0 failing |
| `MONGO_TEST_URL=… MONGO_CONCURRENCY_TEST_URL=… npm --prefix packages/sails-hook-redbox-storage-mongo test -- --exit` | 302 passing /0 pending /0 failing |
| Isolated Mocha Compose, `mocha --config test/integration/.mocharc.js --exit test/bootstrap.test.ts 'test/integration/**/*.test.ts'` | 420 passing /10 pending /0 failing |
| Isolated Bruno Compose, `bru run --disable-cookies --env int-test --sandbox developer` | General 309 requests /553 tests /3 assertions; extra OIDC/S3 20 requests /29 tests; all pass |
| Playwright Compose + `run-playwright.sh`, full; then `test/playwright/apps/dashboard-and-search.spec.ts --grep 'A03 filters'` | Harness 19/19; browser full 119 pass /1 fail, corrected targeted 1/1 pass |
| `npm --prefix packages/redbox-core run typecheck:persistence`; root `tsc --noEmit -p tsconfig.json`; core `run check:prisma` | PASS |
| `npm run lint`; `git diff --check` | PASS; lint 0 errors /0 warnings, 832 files |
| `npm --prefix <tree> ls --all waterline sails-hook-orm sails-mongo` | Empty in root/core/storage/dev-tools/dev hook/PDF hook, clean tarball consumer and production image; expected exit 1 for no matches, no dependency errors |
| `docker buildx build --builder wrpz9-build -f .tmp/wrpz9/Dockerfile.production --load -t wrpz9/portal:production .`; same with `--target test -t wrpz9/portal:test` | Both builds PASS; required Node/npm substitutions described above |

Core pending cases are optional live/external cases (durable live suite runs separately); portal
pending cases are external DOI/DataCite/RVA integration and the existing legacy form. No pending
case was introduced by this phase. Local logs include `core.log`, `persistence.log`, `storage.log`,
`mocha.log`, `bruno.log`, `bruno-extra.log`, `browser-full.log`, `browser-full-junit.xml`,
`browser-targeted.log`, and the named preparation/probe/build/check logs. No dependency or timeout
was changed.

## Changes, open items and cleanup

Local commits: `f4959e4ca` (U-11), `45640a5e1` (sequential browser fixture), then the phase 9
evidence/register commit. No additional persistence product defect was identified. The browser
change fixes a fixture's readiness assumption; it does not change request-concurrency behaviour.
Register F-09-01–05 records startup exit status, Agenda watchdog/claim diagnostics, Compose
environment spelling, the UI overlap, and bootstrap Solr initialization. Prior-artifact
reproduction/source evidence is distinguished in each row.

Owner follow-ups: disposition of the startup/call-count budget limits; separate existing-behaviour
candidates; a single green full browser gate after the fixture correction if required for promotion;
actual institution hooks/data/backups and real-user qualification before release. Formal operations
approval for an official release remains separate. No PostgreSQL, transaction, stronger consistency
or release certification is claimed.

Cleanup: the run stopped on a provider usage limit after removing its images; the orchestrator confirmed no `wrpz9` containers, volumes, networks or builders remain. Small logs stay under ignored `.tmp/wrpz9/`. No push or PR.

## Final review round 1 fixes

All four findings confirmed and fixed, with no dependency changes:

- Failed acquisitions now evict rejected database/pool promises and Prisma-client promises. Failed
  clients remain owned until close succeeds, including shutdown retries. This covers shared native
  acquisitions for GridFS, Agenda and sessions, plus both Prisma datastores. Focused runtime/GridFS
  tests: **20 passing**; live injected-failure then real GridFS byte recovery: **1 passing**.
- Legacy logo reads await `ownGridFSDownload()` before releasing their tracked operation. Focused
  logo tests: **22 passing**, including a held cursor-close/drain; live malformed-chunk download:
  **1 passing**, asserting cursor killed and session ended while shared transport remains usable.
- Identity query resolution accepts string `createdAt`/`updatedAt` predicates. Focused identity/
  reference tests: **20 passing**; live tenant-scoped user/role/path-rule queries: **1 passing**.
  Other groups already recognize timestamps through the shared resolver or their storage contract.
- R/Q reject fixture-only `syntheticUnknown`, `institutionUnknown`, `extension` and `recordtype.unknown`
  writes/queries. Real `Form.attachmentFields` and `WorkspaceType.label` remain supported. Focused
  R/Q tests: **23 passing**; live refusal/no-write checks: **1 passing**. Other physical maps contain
  no fixture-only descriptors.

Focused commands use core's `mocha --no-config --node-option no-experimental-strip-types
--require ts-node/register/transpile-only --require chai --require test/setup.ts`, selecting the
runtime/GridFS, logo, identity/reference or R/Q files. Live commands select the corresponding new
case in `test/integration/PrismaPersistence.test.ts` with `--grep`. Exact runners/logs are retained
under ignored `.tmp/wrfx1/` (`finding1`–`finding4`, `run-final.sh`, `run-portal.sh`).

The final default suites each ran once, sequentially with external timeouts, on ARM64/two CPUs/
12 GiB, Node 24.16.0/npm 11.20.0. No backend selectors or test deadlines changed. Every Mongo
container used `mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`.

| Command | Result |
| --- | --- |
| `timeout 360s npm --prefix packages/redbox-core run build` | PASS |
| `timeout 300s npm --prefix packages/redbox-core test -- --exit` | **4278 passing /87 pending /0 failing** |
| `PERSISTENCE_TEST_MONGO_URL=… timeout 300s npm --prefix packages/redbox-core run test:persistence` | **18 passing /0 failing** |
| `MONGO_TEST_URL=… MONGO_CONCURRENCY_TEST_URL=… timeout 240s npm --prefix packages/sails-hook-redbox-storage-mongo test -- --exit` | **302 passing /0 pending /0 failing** |
| Isolated standard portal Compose; `mocha --config test/integration/.mocharc.js --exit test/bootstrap.test.ts 'test/integration/**/*.test.ts'` | **420 passing /10 pending /0 failing** |
| Core `run typecheck:persistence`, `run check:prisma`; root `npm run lint`; `git diff --check` | PASS; lint **0 warnings /0 errors** |

The four additional core pending cases are the new opt-in live regressions, all run successfully
in the 18-case live suite. Bruno was skipped: these fixes restore internal persistence contracts;
no HTTP routes or response contracts changed. All `wrfx1` containers, networks and volumes were
removed; temporarily held dependencies were restored. Unrelated `development-*` resources were
untouched. No push or PR.

## Final review round 2 fix

Identity dotted sorts now use Prisma's model-aware typed query builder, with explicit ObjectId
predicate codecs; root sorts keep model `orderBy` with all terms supplied together. Declared JSON
paths are validated. Safe credential-free DTOs, population, membership/link tenant filtering and
paging remain. Ascending/descending pages match native Mongo ordering for missing/null values,
arrays and secondary keys; U-12 records equal-key tie behaviour. No raw/native use or dependency
change was added; the PostgreSQL register describes the typed-sort portability requirement.

Checked every `PrismaNamedQueryTargets` implementation: R, Q, J1, B and V already preserve dotted
keys through their registered translators. Record queries already use typed sorting; Counter,
Role and PathRule declare no JSON sort roots. Live regressions cover form, appconfig, progress,
branding history, vocabulary sync runs and records; no adapter change was needed outside identity.

Runs use ARM64/two CPUs/12 GiB, Node 24.16.0/npm 11.20.0, one heavy command at a time, external
timeouts, the required pinned MongoDB 9.0.4 image and isolated `wrfx2` Docker resources.

| Check | Result |
| --- | --- |
| Focused `test/unit/identity-persistence.test.ts` | **7 passing /0 failing** |
| `PERSISTENCE_TEST_DOCKER_PREFIX=wrfx2-live timeout 300s npm --prefix packages/redbox-core run test:persistence` | **25 passing /0 failing**, including 7 new live regressions |
| `timeout 360s npm --prefix packages/redbox-core run build` | PASS |
| `timeout 300s npm --prefix packages/redbox-core test -- --exit` (once) | **4282 passing /94 pending /0 failing**; 7 added pending cases are the opt-in live regressions above |
| Isolated standard portal Compose; `mocha --config test/integration/.mocharc.js --exit test/bootstrap.test.ts 'test/integration/**/*.test.ts'` (once) | **420 passing /10 pending /0 failing** |
| Core `run typecheck:persistence`, `run check:prisma`; root `npm run lint`; changed TypeScript Prettier check; `git diff --check` | PASS; lint **0 warnings /0 errors** |

All created `wrfx2` containers, networks, volumes and temporary runner/log files were removed;
temporarily held dependencies were restored. Unrelated `development-*` resources were untouched.
No push or PR.

## Final review round 3 fixes

Both findings confirmed. Removed retired selectors and Sails aliases from standard
hook templates, portal development/integration/Bruno/Playwright Compose files and
PDF-hook development/API-test Compose files. CI has no selector entries. Current
migration docs already require removal; older group operation pages now mark their
selector/rollback instructions as historical. The two rendered-template guard
regressions fail before the fix and pass afterwards; both Docker Compose-resolved
generated environments also pass the real guard.

Four Counter live regressions reproduce the ID, numeric-string, text-case and
ObjectId failures before the fix. Counter now validates fields, maps IDs/sorts,
preserves ObjectId operands, coerces scalars and keeps text matching case-sensitive;
model fetches and typed counts share the normalized filter. Record's native Json/
regex dialect and identity refusal remain. Deleted records, recordidentity,
audits, attachments and schema artifacts are not core named-query targets; tests
cover their public refusal, and the adapter now refuses unknown targets rather
than defaulting to Counter. S-09 and S-PG-06 document these dialect boundaries.
No raw/native operation, dependency change or transaction was added.

| Check | Result |
| --- | --- |
| Focused archetype tests; full dev-tools `npm test` | **5 passing**; **47 passing** |
| Focused storage named-query units + pinned-Mongo live persistence suite | **12 +30 passing**, including five new live cases |
| Core `npm test -- --exit` (once) | **4294 passing /99 pending /0 failing** |
| Storage package `npm test` (once) | **264 passing /38 pending /0 failing** |
| Standard portal Compose; `mocha --config test/integration/.mocharc.js --exit test/bootstrap.test.ts 'test/integration/**/*.test.ts'` (once) | **420 passing /10 pending /0 failing** |
| Core build, persistence typecheck, Prisma freshness, root lint, touched-TS formatting, `git diff --check` | PASS; lint **0 warnings /0 errors** |

Runs use ARM64/two CPUs/12 GiB, Node 24.16.0 and external timeouts, one heavy
command at a time, pinned MongoDB 9.0.4 and isolated `wrfx3` resources. Keycloak's
first-start setup exceeded the stock health window at half a CPU; after it became
healthy the portal suite ran once. All created containers, networks, volumes and
temporary runners/logs were removed; held dependencies were restored. Unrelated
`development-*` resources were untouched. No push or PR.

## User decisions — 2026-10-22

- **Startup budget accepted for `next`.** The +28% single-run startup time is
  accepted. ReDBox is moving to PostgreSQL; startup will be re-measured and, if
  needed, optimised there.
- **F-09-01 to F-09-05 are fixed on `master`, not on this branch.** They are
  existing behaviour, not caused by the migration. F-09-04 is a client-side race:
  `filterChanged` and `sortChanged` in the dashboard component each call
  `reloadStep` with no request sequencing, so whichever response arrives last
  wins regardless of backend.

## Merge of origin/next

2026-10-22: validated merge `b335994d7` of `origin/next` (`3556a1abe`) into
`t3/waterline-retirement`, comparing incoming changes with `4ce852bc4`.
Node **24.16.0**, npm **11.20.0**, ARM64/two CPUs/12 GiB; one heavy command at a
time, external `timeout`, Docker prefix `wrmg1` and the required MongoDB 9.0.4 digest.
Commands, overrides, logs and result JSON remain under `.tmp/wrmg1/`.

Incoming `NamedQueryNotificationApi.test.ts` used `User.findOne` and `User.update`.
`232e02871` ports these to existing Prisma model fixtures, preserving/restoring the
stored token hash. Whole-repository grep, the **1,833-file AST audit**, and rebuilt
runtime/shim searches find no executable Waterline access. No new raw/driver use
or PostgreSQL rewrite-register exception was needed.

`d09baaa3f` repairs the incoming Angular lockfile's missing Babel/Bootstrap/Popper
peer dependency closure with npm 11.20.0; direct manifest pins are unchanged and
the subsequent clean install passes. `4931a7568` decodes Keycloak's HTML-escaped
form action using the already pinned `cheerio/slim` entry in the normal/denied/
allowed Bruno fixtures. The current repository Keycloak image, **26.8.1-0**, is used.

| Command / scope (all externally bounded) | Result |
| --- | --- |
| `npm ci --include=dev --include=optional --ignore-scripts --no-audit --no-fund` | Six required trees PASS; also clean-installed raido, RVA, shared types, Agenda, Angular and the isolated Bruno CLI. Only the deliberate Angular lock repair changes a lockfile. |
| `npm --prefix <tree> ls --all waterline sails-hook-orm sails-mongo`, six required trees | All `(empty)`; expected exit 1, no dependency errors. |
| Standard server package builds/compiles; Angular `ng build --configuration=production` plus bundle-stat checks | All PASS; **22 Angular targets**. |
| Core `run typecheck:persistence`, root `tsc --noEmit -p tsconfig.json`, core `run check:prisma` | PASS; root emitted compilation also passes. |
| `npm run lint`; `git diff --check` | PASS; **0 warnings / 0 errors**, 841 linted files. |
| `timeout 300s npm --prefix packages/redbox-core test -- --exit` | **4304 passing / 98 pending / 0 failing**. |
| Both `MONGO_TEST_URL` and `MONGO_CONCURRENCY_TEST_URL` set, storage `test -- --exit` | **302 passing / 0 pending / 0 failing**, including all **38 live cases**. |
| Standard isolated portal bootstrap + `test/integration/**/*.test.ts` | **422 passing / 10 pending / 0 failing**, including both API-key revocation inputs and the incoming API tests. |
| `npm --prefix packages/redbox-dev-tools test` | **48 passing / 0 failing**. |
| CI Angular matrix: `ng test … --browsers=ChromeHeadlessNoSandbox --no-watch --no-progress --code-coverage`, one worker | **20 targets, 1681 passing / 0 skipped / 0 failing**, including **1047 form cases**. |
| Fresh development Compose stack, `/default/rdmp/user/login` | **HTTP 200**, login HTML present, clean shutdown. |

Bruno General folders 1–4 ran **once in full** with repository-identical collection
files: **305/309 requests, 547/552 tests, 3/3 assertions** passed. Failures were the
pre-existing intermittent 10-second external DataCite timeout and the Keycloak
escaped-action fixture defect. Focused DataCite retry passes **1/1 request, 2/2 tests**.
The first parser attempt hit Bruno VM's missing `File` global through Cheerio's
default fetch entry; the parser-only entry passes inside that VM. Final focused
normal/denied/allowed OIDC passes **19/19 requests, 24/24 tests**.
`bruno-coverage.json` reconciles paths: all General **309/309 requests, 553/553 tests,
3/3 assertions** have passing coverage across these runs; no single green full
General rerun is claimed. No timeout was relaxed, external response stubbed or new
test skipped. Core/portal pending cases remain recorded above.

No unresolved code failure remains. All created containers, anonymous volumes and
networks were removed; the final `wrmg1` Docker census is empty. Temporary Bruno
dependencies were removed; logs/runners/results remain. Unrelated `development-*`
containers were untouched. Follow-up commits preserve the merge; no push or PR.
