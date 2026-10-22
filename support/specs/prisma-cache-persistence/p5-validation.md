# P5 transitional evidence and promotion review

Replay inputs for the `.tmp/prisma-cache-p5` commands below are tracked under
[evidence/p5/harness](evidence/p5/harness/README.md). Follow that README to copy
inputs, substitute the checkout path, build the archived release and recreate
the frozen final-script aliases. `.tmp` is the replay workspace, not an additional
source dependency. Recorded image hashes/timings are historical observations.

**G5 passes for next-development promotion.** P5.1–P5.9 are complete.
The separate default change is **`210adbdc4ddd4b1100844469db8ba19d2747bc57`**,
after the rollback/operational evidence commit `d7b4bc46d`; input G4 is `6f50def34`.
Explicit Waterline selection and both-backend tests remain available. The known
source-loading timeout and Solr bootstrap indexing issue remain recorded below;
no new functional failure remains. This does not qualify official v6.

## Independent application contract (P5.1–P5.4, P5.6)

`P5_SKIP_BUILD=true bash packages/redbox-core/test/fixtures/cache-persistence/run-transition.sh`
passes **7 tests** against disposable standalone MongoDB **8.0.34** (digest
`4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`).
Host Node **24.18.0**; compiled G4 core; unchanged exact Prisma CLI/runtime pins
**8.0.0-rc.23 / 8.0.0-rc.18**; MongoDB driver **7.7.0**; TypeScript **5.9.3**.
No dependency or lock maintenance in this step. Each worker explicitly records
its backend, actual repository class and PID. The runner owns/removes only its
new Mongo container and anonymous volume; no existing development server access.

The same contract function tests each backend with raw-document assertions:
ObjectId/string IDs; ISO string create/update timestamps; finite fractional epoch
seconds; object, array, string, number, boolean, falsy, null and missing data;
omitted update preservation; legacy-field preservation; missing reads, updates
and deletions; duplicate creates and renames with the real unique index.

Sequential selection and simultaneous mixed Node processes use the same physical
collection/index. Competing creates yield exactly one success/one rejection;
concurrent updates allow either final writer, and both adapters read the same raw
result. Expired reads retain the document, concurrent deletes are harmless, and
the unique index remains. No ordered writes/retries/upserts are assumed.

Restart uses three separate application PIDs: Prisma writer, new Prisma reader,
then explicit Waterline rollback. The parent observes the actual raw persisted
value **before** closing the writer; return from void `set()` is not durability.

Both backends run real CacheService memory and database hits/misses, falsy values,
null/missing values, exact global expiry and greater-than expiry, local TTL
repopulation and best-effort failure logging. A real unsupported BSON document
rejects on read, logs on asynchronous set, remains unmodified, and does not lose
the memory write. Real IntegrationNotificationService dispatch uses real cache
persistence; only channel delivery/config lookup are fixtures. Failure state has
ISO strings, repeat failures throttle, recovery writes null with local TTL zero,
and a second recovery sends nothing.

Explicit Waterline selection runs a loaded replacement model on a hook datastore
and collection, observing create/update/destroy callbacks. Prisma on the standard
model executes none of those callbacks. Customized collection/schema/ID mappings
still require migration before Prisma activation, as established by G3.

Log: [independent-process run](evidence/p5/transition.log).

## Full portal preview regressions (P5.5, part of P5.8)

`bash .tmp/prisma-cache-p5/run-mocha.sh prisma` invokes the normal Docker
`run-mocha-redbox.sh` runner with the existing CacheService/BrandingService suites
plus `test/integration/services/CachePersistenceTransition.test.ts`. It passes
**13 tests (3 minutes)** and exits zero; the test asserts effective config and
`PrismaCacheEntryRepository`, printing `P5 portal active cache backend=prisma`.
Portal Node **26.11.1**, npm **11.20.0**, mounted compiled core and standalone
MongoDB **8.0.34**. Compose project `redbox-cache-p5-mocha-prisma-815a2a6e`
creates/removes its containers, network and anonymous Mongo volume. Attachments
and mail use dedicated `.tmp/prisma-cache-p5` directories.

The same command with `waterline` passes **13 tests (5 minutes)**, records
`P5 portal active cache backend=waterline` and asserts the actual Waterline adapter.
Both full portal selections therefore exercise the same cases.
[Waterline assertion log](evidence/p5/mocha-waterline.log).

This covers awaited draft/token writes, retained-version previews, cross-brand
history rejection, missing/expired/valid tokens, delete-before-error/return,
unchanged draft data and HTTP CSS content/cache headers/404 bodies. The existing
expiry test now mutates its fixture through the selected repository instead of
using a direct Waterline cache model. Controller unit and Bruno/browser checks
remain separate evidence below. The initial attempt stopped before the portal
started because Keycloak's dependency health deadline expired; the isolated
rerun overlay allows 180 seconds of dependency startup and passes. No application
or assertion timeout was changed. Build/export disk contention delayed this run;
it is not used for operational latency measurements.

[Sanitized portal assertion log](evidence/p5/mocha-prisma.log).

## Focused core and setup checks

`bash .tmp/prisma-cache-p5/backend-focused.sh waterline` and the corresponding
`prisma` command each pass **92 tests**. These are service/controller/runtime
unit fixtures with explicit repository doubles/configuration; the requested
selection is printed, but the environment variable alone does not turn these
fixtures into live Prisma tests. Live selection is separately asserted above.
Logs: [Waterline request](evidence/p5/core-focused-waterline.log),
[Prisma request](evidence/p5/core-focused-prisma.log).

Current core `npm --prefix packages/redbox-core run build` passes contract
regeneration and TypeScript compilation. Scoped persistence test type-check
`node_modules/.bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.cache-persistence.json`
passes. Prettier for changed tests/preflight, preflight oxlint, `git diff --check`,
root/PDFgen Compose rendering and generated hook dev/Mocha Compose rendering
pass. CircleCI YAML parses with all three workflow Mocha invocations matrixed
across Waterline and Prisma; the core CI job runs the real-Mongo transition suite.
These local config checks do not claim a hosted CircleCI execution.

The fresh-stack init script explicitly creates only the unique cache name index;
no data is deleted. Existing-volume remediation and hook callback bypass are
published in [the development rollback runbook](../../wiki/Cache-Persistence-Rollback.md).
Both backend selectors remain available. No dependency/lock changes have occurred.

## Operational comparison (P5.9)

The archived bounded harness uses one minimal independent Sails ORM/CacheService
application at a time, MongoDB 8.0.34 on a private loopback port, host Node 24.18.0,
and `maxPoolSize: 5` for each application-owned pool. Six processes run in
W/P/P/W/W/P order. Each has the same excluded warmup, 500 measured five-operation
create/read/update/read/delete cycles at concurrency eight, 100 sequential
CacheService sets polled for **completed value persistence**, 1,000 memory hits,
100 forced database cache reads, and 100 actual BrandingService preview
create/fetch operations. Brand metadata is fixed; CSS generation and all cache
persistence are real. Full portal semantics are checked independently above.

Two additional identical workloads per process record retained memory after
forced GC. Connection sampling includes the native observer, the remaining
Waterline pool and the additional Prisma pool; shutdown is checked against the observer-only
baseline. The completed measurement runs after all task builds/test stacks stop;
results and qualifications follow.

## HTTP harness investigations (not acceptance runs)

The first Prisma REST run stopped at the existing variable-font upload fixture:
HTTP 409 `branding-conflict` instead of the expected 400 font rejection. An
unchanged Waterline run reproduced it with runtime `rb_revision=2`, while an
immediate control using the same revision and file with the revision text part
**before** the file returned 400 `typeface-variable-font`. The upload callback
can precede availability of trailing multipart text fields. Waterline otherwise
passed 35/36 REST requests (including this extra successful control) and all
18 AJAX requests. Three upload fixtures now use revision-before-file ordering;
no application/controller/service behavior changed. Corrected both-backend
acceptance runs pass as recorded below. [Diagnostic](evidence/p5/multipart-diagnostic.log).

The first Waterline A17 run completed the branding assertions but failed strict
browser diagnostics on four Chromium errors: COOP was ignored for the untrusted
`http://redboxportal` origin. The corrected harness shares the portal network
namespace and uses trustworthy `http://localhost:1500`; no diagnostics are
suppressed and no assertions/timeouts are changed. An artifact-copy permission
error was also corrected by copying into the host-owned rehearsal directory.
[Original diagnostics](evidence/p5/browser-initial-diagnostics.json).

The next localhost browser attempt correctly rejected the still-rendered
`redboxportal` Angular API base URL under `connect-src 'self'`. The harness now
sets Sails `appUrl` to the same localhost origin for browser runs and asserts the
effective value after lift. One Waterline rerun stopped when the harness was
edited during execution; final runs use frozen script inputs. These are recorded
harness failures, not passing browser evidence.

With the corrected multipart fixtures, both selections pass the unchanged
**35 REST requests / 48 tests** and **18 AJAX requests / 25 tests**. Prisma command:
`bash .tmp/prisma-cache-p5/run-http.sh prisma` (API stages pass; browser origin
mismatch described above). Waterline final command:
`bash .tmp/prisma-cache-p5/run-http-waterline-final.sh waterline` (API stages pass;
browser passes). Full-portal MongoDB snapshots immediately after Bruno include
all clients and the observing mongosh: Waterline **132**, Prisma **135**, rejected
connections **0** for both. Startup timings from these runs are excluded from the
bounded comparison because builds/exports overlapped them.

The final browser-only Prisma rerun
`P5_HTTP_SKIP_BRUNO=true bash .tmp/prisma-cache-p5/run-http-prisma-browser-final.sh prisma`
passes **A17, 1 test (14.2 seconds)**; the final Waterline run passes the same
unchanged case **(15.2 seconds)**. Both commands exit zero, assert the live
repository/config after lift and print the selected backend before Playwright.
Both diagnostic artifacts have **zero diagnostics/expectations**. CSRF is enabled
and both the browser origin and rendered application URL are localhost. No
assertions, retries, diagnostics filters or test timeouts were changed.
Playwright **1.64.0**, Chromium **156.0.8078.4**, runner Node **24.21.0**, Angular
**22.2.0**, one worker, zero retries. All isolated HTTP projects were removed.

Durable reports: [Prisma REST](evidence/p5/bruno-rest-prisma.xml),
[Waterline REST](evidence/p5/bruno-rest-waterline.xml),
[Prisma AJAX](evidence/p5/bruno-app-prisma.xml),
[Waterline AJAX](evidence/p5/bruno-app-waterline.xml),
[Prisma browser](evidence/p5/playwright-prisma.xml),
[Waterline browser](evidence/p5/playwright-waterline.xml),
and `browser-{prisma,waterline}-{metadata,diagnostics}.json` in the same directory.
API cookies are removed from archived reports.

## Configuration and previous-release rollback (P5.7)

The configuration rollback is in the seven-test transition suite: a completed
Prisma write is observed raw, its writer is closed, a separate current Waterline
application selects `persistence.cache.backend=waterline`, reads/updates/deletes
the same document, and retains the index.

`P5_TRACE_STARTUP=true bash .tmp/prisma-cache-p5/run-rollback.sh` exits zero.
The exact designated **`0cfbd62b93260b63ad907d7c01ed9f33a2af619e`** snapshot is
built from `git archive`, with its original root/core locks, Node **26.11.1**,
npm **11.20.0**, TypeScript **5.9.3**, Sails **1.5.17**, sails-mongo **2.1.2**,
root MongoDB driver **7.2.0** and nested core driver **7.7.0**. The offline probe
checks both lock SHA-256 hashes and absence of the new persistence runtime.
Tested image **`sha256:b23de47e7be99203d86a789b6e685d809075b70f927627c27d2b7f6e6b5964c4`**;
[image and lock provenance](evidence/p5/rollback-image.json).

A current Prisma application writes JSON variants, ordinary cache, notification
failure state and preview tokens, observing completed persistence before closing.
The full old portal starts through its untouched `app.js` with deployment config
and same-snapshot synthetic bootstrap fixtures only. It lifts, reads the completed
cache value, serves the Prisma-written preview through HTTP and verifies deletion.
A second independent old application reads/updates/deletes JSON variants with raw
ID/string-timestamp checks; reads restarted cache; throttles the prior notification
failure, sends recovery and observes persisted null; consumes valid/expired
previews, rejects missing tokens; and verifies the unique index and unchanged
MongoDB **8.0.34**. A final new Prisma application reads the old release's completed
write. No current core/dependency code is mounted into the old application.
Private database, Solr, portal and network are removed; existing development
containers/data are untouched. [Assertion output](evidence/p5/rollback.log).

Rehearsal investigations: an initial writer preparation hit the fixture's existing
30-second startup deadline during image/export load, before the old application
ran; it was cleaned up, not counted as acceptance. Auditing the first image found
that removing the standalone core dependency tree had also removed nested packages
required by its root lock. A second image layer restores that **same original
root lock graph** with npm ci; the qualified image above passes the offline probe.
No source or dependency pins were changed to make the old release work.

The full old bootstrap logs the same unrelated `SolrSearchService` undefined
client `add` errors present in the current Prisma HTTP run: source initializes
Solr clients on `ready`, after records bootstrap attempts inline indexing. Both
applications lift and the cache/preview assertions pass. This cache rollback
rehearsal does not qualify bootstrap search indexing; that existing behavior
needs separate investigation before broader release qualification.

`bash .tmp/prisma-cache-p5/run-compare.sh` exits zero: three rounds/backend in
W/P/P/W/W/P order, **7,500 primary timed CRUD operations/backend**, plus identical
warmup, service workloads and two retained-memory repetitions/process. Each
preview generates **10,158 bytes** of actual CSS. No workload failure or logged
persistence error occurs, including warmup/retention repetitions.
[Raw samples and distributions](evidence/p5/operational.json),
[environment](evidence/p5/operational-environment.log),
[bounded inputs](evidence/p5/harness/README.md).

| Metric (milliseconds unless stated) | Waterline | Prisma |
| --- | ---: | ---: |
| Five-operation cycle p50 / p95 / p99 | 89.90 / 129.25 / 176.21 | 39.12 / 49.92 / 57.57 |
| Mean CRUD operations/second | 421.79 | 997.92 |
| Observed set persistence completion p50 / p95 / p99 | 8.32 / 15.50 / 24.54 | 4.80 / 7.49 / 9.36 |
| Memory cache hit p50 / p95 / p99 | 0.0131 / 0.0306 / 0.1400 | 0.0122 / 0.0156 / 0.0381 |
| Forced database cache read p50 / p95 / p99 | 2.55 / 3.78 / 4.45 | 1.65 / 2.32 / 2.67 |
| Preview create/fetch p50 / p95 / p99 | 8.55 / 12.69 / 17.50 | 4.97 / 11.10 / 17.76 |
| Minimal app startup median / maximum (seconds) | 3.347 / 3.412 | 4.141 / 4.259 |
| Post-primary RSS range (MiB) | 441.8–444.0 | 418.0–420.7 |
| Retained heap after primary + repeats (MiB) | 119.61–119.82 | 144.12–145.52 |
| Total connections, sampled peak / after shutdown | 10 / 3 | 10 / 3 |
| Primary failures / logged persistence errors | 0 / 0 | 0 / 0 |

These are **five-operation cycles**, not individual-query latency. Throughput
counts the five CRUD operations only; sequential service phases follow separately.
Completion is an observed persisted **iteration value**, not `set()` return time;
polling at 1 ms adds common measurement overhead. Startup is the minimal cache
application, not full-portal readiness; only three startup samples/backend exist.
The environment is a shared four-core Intel N100 host, **15,615 MiB RAM**, no swap
or added CPU/memory caps, Docker **29.6.1**, Node **24.18.0**, MongoDB **8.0.34**.
Existing development services were running during this measurement; P5 did
not connect to them. No task build/test stack overlaps the comparison, but background T3/disk activity remains; recorded
I/O samples and the balanced process order bound the interpretation. This is a
fixed small cache/branding workload, not a capacity or institution-wide forecast.

Regressions investigated: Prisma adds **0.795 seconds** to median minimal startup
and about **26 MiB** retained heap. Stage timestamps put **0.789–0.914 seconds**
between ORM load and Prisma readiness, versus less than 1 ms for borrowed
Waterline composition. This stage connects/verifies prerequisites, lazily loads
the Prisma runtime/contracts and initializes the additional client; it is expected
fixed startup/resource work. All startup samples finish successfully. The extra
retained heap does not grow across repeated workloads (Prisma starts at about
145.6 MiB after warmup and finishes at 144.1–145.5 MiB; Waterline about 119.6 to
119.8 MiB). RSS allocation rises then levels; after the primary workload, two
additional repetitions add 0.25–0.38 MiB Prisma RSS and 2.1–8.5 MiB Waterline RSS.
This bounded evidence finds no accumulating heap/pool leak; it does not promise
zero leaks under arbitrary workloads. The additional startup/heap cost is
acceptable for next-development promotion with capacity review retained for P6.

Total connections include **every remaining Waterline connection, Prisma's
additional pool, and the observer**. All six stopped applications leave three
observer-only connections. The initial two-to-three observer baseline transition
is checked separately below; it is not hidden by subtracting only Prisma sockets.
Under full portal Bruno load, the independent post-run snapshots are 132 versus
135 total connections, zero rejected for both. Peak demand depends on the real
deployment pools; P6 must account for these extra clients against server limits.

The independent observer-only control,
`bash .tmp/prisma-cache-p5/run-observer-control.sh`, starts **no application** and
passes with 22 one-second samples: **2 connections initially, then 3 from the
11-second sample onward**. This reproduces the MongoDB driver's monitoring
connection appearing after its heartbeat interval. A first four-second probe
ended before that transition and was insufficient to confirm the explanation;
the final 22-second control does. [Control](evidence/p5/observer-control.log).
The comparison's two-to-three first baseline change is therefore observer
behavior, while all application pools close back to that observer-only level.

## Full core baseline timeout investigation

`bash .tmp/prisma-cache-p5/run-final-core.sh waterline` runs unfiltered
`npm run test:core`: **4,098 passing, 87 pending, 1 failing (2 minutes)**. The sole
failure is the explicitly known `startup-module-loading` child-process
**12-second ETIMEDOUT**. The unchanged isolated current test also times out.
A `git archive 6f50def34` control with the original complete core package/config
files and the **same installed dependencies** reproduces the identical timeout
using the unchanged test. Thus this is also present at the input G4 commit.
Before promotion, the only P5 production-core diff from G4 is the actionable
missing-index error text. No timeout is raised or test skipped.
[Current isolated test](evidence/p5/startup-current-isolated.log),
[unchanged G4 control](evidence/p5/startup-g4-baseline.log).
This is an existing core timing issue, separate from successful live cache startup.

The full `prisma`-labelled run passes **4,099 tests, 87 pending (2 minutes)**,
including the unchanged startup test at **10,631 ms**. The subsequent full
`waterline`-labelled retry again has **4,098 passing, 87 pending, only that same
timeout failing**. These labels record the requested runner environment; the
unit suites choose their own explicit configurations/doubles, and do not become
a live Prisma deployment merely from this shell variable. The complete suite
therefore has a passing execution, while the separately reproduced timing
instability remains unresolved. Actual backend behavior is asserted in the live
transition, Docker Mocha, API and browser runs. No new core failure appears.
Selected full-run output: [passing full run](evidence/p5/core-final-prisma.log),
[initial Waterline request](evidence/p5/core-final-waterline.log),
[Waterline retry](evidence/p5/core-final-waterline-retry.log).

Final pre-promotion live reruns: `P5_SKIP_BUILD=true bash
packages/redbox-core/test/fixtures/cache-persistence/run-transition.sh` passes
**7 tests (52 seconds)** with both actual adapters explicitly logged.
`P3_SKIP_BUILD=true bash packages/redbox-core/test/fixtures/cache-persistence/run-prisma.sh`
passes **13 tests (4 seconds)** for Prisma selection, connection/configuration,
indexes/duplicates, safe startup errors and ownership/cleanup. Logged original
startup failures are intentional failure-injection assertions.
[Transition rerun](evidence/p5/transition-final.log),
[Prisma prerequisites](evidence/p5/prisma-prerequisites-final.log).

## G5 evidence review before the separate default change

The evidence supports **next-development promotion**: the same live physical
contract works in both directions and mixed processes; completed writes survive
restart and both rollback paths; service/notification semantics and portal API/
browser behavior pass; G4 build/deployment evidence remains valid. The bounded
comparison finds no cache error, accumulating heap/pool leak or material request
latency regression. Its approximately 0.8-second startup and 26-MiB retained-heap
costs are understood fixed costs and accepted for this bounded development gate.
The full core suite has a passing execution; its known 12-second source-loading
timing instability is reproduced on G4 and remains unchanged, as requested. The
pre-existing Solr bootstrap indexing issue is also recorded separately above.
Neither is a newly introduced cache persistence failure.

The index prerequisite is concrete: fresh dev/test/hook/PDFgen/CI stack setup
explicitly provisions the unique name index without cleaning documents; existing
volumes and custom databases require the published reviewed DDL procedure. Missing
index readiness errors name that limitation and link the rollback runbook. Hooks
must migrate callbacks/custom mappings or explicitly retain Waterline during
next development. Both adapters remain in the live transition suite and CI Mocha
matrix. These requirements must remain visible when the default changes.

The next commit is restricted to the default, its configuration/test expectations
and documentation. G5 is checked only after the changed default is tested against
real MongoDB without an explicit selector. P6 still owns institution migration/
backup/recovery rehearsal; P7 still requires stable supported Prisma tooling and
MongoDB runtime before official v6 and removes the temporary Waterline bridge.
The current **8.0.0-rc.23 CLI / 8.0.0-rc.18 MongoDB runtime** remain prerelease;
this evidence does not waive that official release gate.

## Promotion verification and final G5 decision

Separate promotion commit **`210adbdc4ddd4b1100844469db8ba19d2747bc57`** changes
only the default, forwarding configuration, explicit selection in unit/integration
fixtures, live absent-selector coverage and the default/rollback documentation.
The adapter implementations and physical contract remain those qualified above.
All dependency pins and lockfiles are unchanged during P5.

Post-change verification:

- `P5_SKIP_BUILD=true bash packages/redbox-core/test/fixtures/cache-persistence/run-transition.sh`:
  **8 passing (45 seconds)**. The new test has **no persistence selector in the
  loaded app config**, asserts `PrismaCacheEntryRepository` and successfully writes
  a raw MongoDB document. Both explicit adapters, switching/concurrency/restart,
  cache/notification semantics and Waterline hook callbacks still pass.
- `P3_SKIP_BUILD=true bash packages/redbox-core/test/fixtures/cache-persistence/run-prisma.sh`:
  **13 passing (3 seconds)** after the new default.
- `bash .tmp/prisma-cache-p5/backend-focused.sh waterline` and `prisma`:
  **92 passing each**, with explicit unit-double/configuration scope recorded.
- `bash .tmp/prisma-cache-p5/promotion-waterline-model.sh`: **1 passing** on
  MongoDB **8.0.34** with explicit Waterline and actual hook datastore/collection/
  callback overrides; the borrowed connection remains usable after cleanup.
- The bootstrap ordering/lifecycle file alone passes **12 tests** after its
  model-double fixtures explicitly select Waterline. The first post-change full
  run exposed two fixtures still relying on the old default; those fixture
  failures are resolved without weakening Prisma mapping validation.
- `bash .tmp/prisma-cache-p5/run-final-core.sh prisma`, final run:
  **4,098 passing, 88 pending, only the known 12-second source-loading timeout
  failing (2 minutes)**. Both newly corrected bootstrap cases pass. No other
  new failure remains. The earlier **4,099-test** full pass, isolated current
  failure and unchanged G4 failure document the existing timing variability.
  The test is neither skipped nor given more time.
- Core build/contract generation, scoped test TypeScript check, changed source
  lint/format and compiled import/service/shim smoke pass; the import/shim smoke
  asserts the **Prisma default** and observes **zero socket attempts**.
- `node .tmp/prisma-cache-p5/promotion-config.cjs` passes **24 selection checks**
  across 12 root/PDFgen/generated-hook Compose configurations: absent variable
  resolves to Prisma, explicit Waterline stays Waterline, fresh index mounts are
  present. The three CircleCI Mocha matrices retain both backends. This is local
  rendering/validation, not a claim of hosted CI execution.

The P2 replay initially rejected the runner's P5 database prefix before loading
the app. The runner now uses its original guarded P0 fixture prefix on a private
new server; the safety assertion stays intact. The archived configuration check
also materializes its generated directories and `.js.hbs` helper so replay does
not depend on earlier manual rendering.

Evidence: `promotion-{transition,prerequisites,waterline-model,focused-waterline,
focused-prisma,bootstrap,config,static,core-initial,core-final}.log` under
[evidence/p5](evidence/p5/). Reproduction inputs are in the archived harness.

**Decision:** promote Prisma for the bounded next-development phase. Raw
interoperability, completed-write restart, both rollback paths, service/API/
browser compatibility, prerequisite/lifecycle checks and the operational review
support the change. The unchanged pre-existing timing test is explicitly
accounted for, as in the task brief; the evidence does not claim a uniformly
green full suite or an official stable release. Explicit Waterline remains a
development selection, and no initialization/runtime failure silently falls back.

Cleanup: all P5 containers, Compose networks and owned data volumes are removed;
both newly created rollback image tags were removed after capturing provenance.
Existing development data was never queried or modified. Existing development
containers were observed stopped by final audit after the operational comparison;
no P5 stop/cleanup command targets them, and they were left in that state.
[Cleanup record](evidence/p5/cleanup.log).

## P6 handoff

- Existing volumes/custom databases must explicitly inspect/remediate duplicate
  names/conflicting indexes and create/verify the unique name index before using
  the default. Fresh-stack init is not existing-volume remediation. Never clean
  documents silently. Review hook callbacks, collection/attribute/ID mappings
  and richer BSON/JSON values; migrate through the repository seam or select
  Waterline during development.
- Expand the published [rollback runbook](../../wiki/Cache-Persistence-Rollback.md)
  into institution-specific MongoDB upgrade/FCV, shared-subsystem, backup and
  restore rehearsals. Only the designated next snapshot on unchanged MongoDB 8
  was rehearsed; no v5 rollback/database-engine downgrade promise follows.
- Recheck institution startup/memory/server connection limits with real deployed
  pools and data. The fixed workload's pool cap of five and three rounds/backend
  are bounded evidence. Track the existing source-loading timeout and the old/
  current Solr-before-ready bootstrap indexing errors separately.
- Retain explicit both-backend coverage until P7 retires the bridge. Official v6
  requires stable supported tooling **and MongoDB runtime**, not the current
  **CLI 8.0.0-rc.23 / runtime 8.0.0-rc.18** qualification. Deferred cache TTL/falsy
  behavior, void best-effort durability/races and non-atomic preview read/delete
  remain unchanged; improvements need separate decisions.
