# P1 runtime implementation evidence

Recorded 2026-10-23 in `/home/andrew/src/github/redbox-portal`, branch
`stack/sails-retirement`. Starting SHA:
`b3d25a405badbfe9e6be96198850cae1f9e2f46f`. The commits containing each task are
identified by their conventional subject below (and by the branch history).
This record uses the P0 inventory/configuration characterization; it does not
qualify an institution deployment or claim P2 work.

## Execution environment

All build/test/lint commands below run from the repository root after:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
node --version
npm --version
```

Observed **Node 26.11.1**, **npm 11.20.0**, TypeScript **5.9.3**, ts-node
**10.9.2**, Mocha **11.7.6**; existing exact Prisma pair
`@prisma/orm-mongo@8.0.0-rc.19` / `prisma@8.0.0-rc.24`. No dependency changes.
The shell's unmodified Node remains 24.18.0; no reported check uses it.

Real database setup, actually executed:

```sh
docker run -d --name sr-p1-mongo8 --memory=768m -p 127.0.0.1::27017 mongo:8.0.34 --bind_ip_all --wiredTigerCacheSizeGB 0.25
docker port sr-p1-mongo8 27017/tcp
docker exec sr-p1-mongo8 mongosh --quiet --eval 'print(JSON.stringify({version:db.version(),fcv:db.adminCommand({getParameter:1,featureCompatibilityVersion:1}).featureCompatibilityVersion,hello:db.hello()}))'
docker image inspect mongo:8.0.34 --format '{{.Id}}'
```

Observed port **34899**, MongoDB **8.0.34**, FCV **8.0**, unauthenticated standalone,
image `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
Regression databases are disposable `redbox_prisma_p1` / `redbox_prisma_p1_storage`
on this one server. This is no replica-set, institution, TLS or auth qualification.

## SR-006 — Structural persistence ownership and explicit Sails lifecycle

Implementation commit subject: `refactor(persistence): isolate Sails lifecycle from resource ownership`.

- `src/persistence/owner.ts` defines the structural configuration/log owner;
  runtime, groups, indexes and concrete persistence collaborators accept it.
  Root type exports preserve normal package consumption. No persistence source
  signature uses `Sails.Application`.
- `src/compat/sails/persistenceLifecycle.ts` owns the former shutdown guard,
  process/signal adaptation and `beforeShutdown` composition. Legacy
  `preLiftSetup()` installs it explicitly. Standalone initialization never mutates
  host configuration or installs handlers. Existing tests that exercise the Sails
  hook now explicitly prepare that adapter; their behavior/assertions remain.
- Pool/group identity, admission, retained close/drain retry, client-before-pool
  ordering and stale-handle logic are unchanged. Existing optional repository
  getters still support the legacy global fallback; explicit owners avoid it.
  This does not claim all repository/domain operations are standalone.
- The new compiled child-process check runs without `global.sails`, rejects any
  `sails` package load and checks that no compatibility adapter is imported.
  Structural-owner tests require no Sails type assertion and preserve listeners.

Commands/results:

```sh
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:persistence
npm --prefix packages/redbox-core test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 10000 test/unit/persistence-owner.test.ts test/unit/persistence-foundation.test.ts test/unit/persistence-shutdown.test.ts test/unit/cache-persistence-runtime.test.ts test/unit/prisma-runtime.test.ts test/services/AgendaQueueService.test.ts test/services/AuditFollowupDrain.test.ts test/middleware/redboxSession.test.ts test/middleware/requestLifetime.test.ts
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34899/redbox_prisma_p1 npm --prefix packages/redbox-core run test:persistence
npm run lint
git diff --check
```

- Clean core build: **exit 0** (Prisma generation, TypeScript, contract copy).
- Persistence typecheck, including the structural fixture: **exit 0**.
- Focused owner/legacy shutdown/queue/session/HTTP drain suites: **141 passing,
  0 failing, 0 pending**, about 3 seconds. The real Sails shutdown test retains
  failed-drain/no-lower/concurrent/retry assertions. This is focused legacy
  lifecycle evidence, not a complete legacy portal startup.
- Existing real-Mongo regression suite: **30 passing, 0 failing, 0 pending**,
  about 5 seconds. This suite executes all persistence groups, concurrency,
  indexes, native/session/GridFS ownership and stale/restarted handles.
- Repository lint: **exit 0**, **841 files, 0 warnings/errors**.
- `git diff --check`: **exit 0**.

Initial failures, fixed before completion: the new child-process test initially
had a template-string regexp escaping error (140 passing / 1 failing). Its code
was corrected with `String.raw`, then the complete focused command passed 141.
Typechecking first exposed an overly broad fixture `object` parameter, then a
string-array signal annotation; both were narrowed to their actual types. Final
typecheck exits 0. No production cast or test skip was added to hide these errors.
Prisma's existing module-type/skills notices persist; no runtime module-format or
Prisma dependency migration was attempted.

Local logs are small, uncommitted `.tmp/sails-retirement/p1-{build,typecheck,ownership,persistence,lint}.log`.

## SR-007 — Application lifecycle and owned composition

Implementation commit subject: `feat(application): own module initialization activation and stop`.
Prepared on SR-006 source `993c94de49435e2f13f66cb4933cd1f9838e7fc3`;
final source SHAs are recorded in the completion section below.

`src/application/Application.ts` implements the small lifecycle interface and
`src/application/index.ts` is its narrow compiled entry. A fresh structural owner
carries the resolved startup configuration/logging; resolved synchronous factories
close over their specific dependencies and receive no container. Each application
constructs one module per selected name, retains its own instances/caches, and
registers cleanup in the existing persistence registry before awaited module work.
One owner cannot be attached to a second runtime, including after stop.

Initialization, activation and stop join concurrent calls. Normal readiness stays
false until every activation succeeds. Stop prevents later stages, waits in-flight
acquisition/activation, then drains/closes registered resources before Prisma/pools.
A stopped or failed-start instance cannot restart. Status reports sanitized stage/
module identifiers, stop failure, cleanup pending and ownership names/counts;
original startup errors still reject the initiating call. Cleanup failure remains
separately observable and retryable. Status snapshots do not expose live maps.

The stop deadline defaults to **30,000 ms**, matching the inventoried Agenda
default. Tests use short explicit deadlines. An acquisition that outlives a deadline
stays owned until a caller retries stop; merely settling it does not restart cleanup.
Already-running cleanup can continue after its caller's deadline, retains ownership
until settlement, and can be joined by a retry. It never closes pools under accepted
work. This is not forced cancellation or rollback of completed writes/effects.

`test/application/Application.test.ts` covers lifecycle/order/concurrency, isolated
instances/caches, terminal restart rules, factory/start/activation failures, partial
cleanup, retained resources, deadline expiry and retry. Its compiled subprocess
has no global/loaded Sails, core barrel, compatibility imports or OS handlers.
`ApplicationMongo.test.ts` adds real pools/repositories, isolated applications,
partial startup writes, pending connection acquisition, accepted completion writes,
and fresh-instance/stale-handle cases without legacy test setup.

New scripts run unit and Mongo tests separately. The new standalone Mongo fixture
is explicitly excluded from the default **legacy** Mocha setup because that setup
installs global Sails. Its dedicated command requires a disposable database URL
and fails on missing input; it never counts a missing-environment skip as evidence.
The ordinary application unit cases also run in the existing default core suite.

Commands actually executed:

```sh
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm --prefix packages/redbox-core run test:application
APPLICATION_TEST_MONGO_URL=mongodb://127.0.0.1:34899/sr_p1_application npm --prefix packages/redbox-core run test:application:mongo
npm run test:core
npm run lint
node_modules/.bin/prettier --check packages/redbox-core/src/application packages/redbox-core/test/application packages/redbox-core/test/tsconfig.application.json
git diff --check
```

Final clean core build, application typecheck, repository lint and focused
formatting all **exit 0**. Final lint checks **843 files, 0 warnings/errors**.
Application unit cases: **15 passing, 0 failing, 0 pending**, 165 ms.
Application real-Mongo cases: **5 passing, 0 failing, 0 pending**, about 2 seconds,
MongoDB **8.0.34 / FCV 8.0**, driver **7.7.0** on Node **26.11.1**.
Fixture databases have a checked `sr_p1_application` prefix and are dropped by
teardown. An early command used a wrong working directory and failed before
execution; one exploratory unit invocation used the shell's Node 24. The final
clean rebuild and authoritative passing application commands explicitly prepend
Node 26 and supersede that invocation. No application assertion failure was hidden.

Limitations: this is the lifecycle/composition foundation, with repository-level
Mongo proof. `RecordTypesService` has **not** yet been extracted; its actual
schema/concurrency/Observable/bootstrap semantics still require SR-008/SR-009.
No Express host, authenticated route or shared converted Sails service instance
is claimed. Config resolution, extension loading, migration/business bootstrap,
and all production native-owner integrations remain in their later tasks.

The full existing `npm run test:core` command exits **0**: **4,325 passing,
0 failing, 98 pending**, about 2 minutes. Reviewed pending cases:

- 3 prior driver-foundation cases require `P1_MONGO_URL` and their specifically
  authenticated Mongo 9 fixture; this run did not supply it.
- 30 existing Prisma regression cases require `PERSISTENCE_TEST_MONGO_URL`;
  these same cases ran separately with **30 passing / no skips** in SR-006 above.
- 51 Figshare durable-worker cases require `FIGSHARE_TEST_MONGO_URI`.
- 7 SIEM receiver/delivery cases require `SIEM_TEST_MONGO_URL`.
- 7 pre-existing explicit skips: RaidService (2 complex-config cases),
  TriggerService (2 template cases), WorkspaceService (3 API cases).

The omitted Figshare/SIEM/old authenticated-foundation runs are not claimed as
real-Mongo coverage. No existing assertion or skip condition was weakened.
New application evidence is the dedicated **5 real-Mongo cases / zero skips**.

## Remaining P1 handoff

This round finishes SR-006 and SR-007 completely before attempting the next domain
slice. SR-008, SR-009, SR-010 and SR-011 remain unchecked and **not started**.
There is no provider/quota failure or unresolved user decision for these tasks.

1. **SR-008:** inject narrow reference repositories, startup config/logging and
   storage-capability operations into the existing `RecordTypesService`; preserve
   Observable methods/current stored concurrency policy/schema validation. Remove
   the inherited asynchronous constructor and process-wide converted service cache
   without making a second implementation. Use the P0 characterization as the
   behavioral contract; existing unit tests still pass on the legacy service.
2. **SR-009:** run the actual converted domain module's bootstrap/create/reload/
   cache/schema/strict-storage/`bootstrapAlways` cases on real Mongo. The new
   repository-level application fixture deliberately does not stand in for this.
3. **SR-010:** add one standalone Express 5 server around this lifecycle, readiness/
   admission and host-owned signals, with inactive/bind-failure/stop coverage.
   No standalone HTTP host or production configuration is delivered this round.
4. **SR-011:** route the legacy RecordTypes exports/bootstrap to the same
   application-owned converted instance. SR-006 supplies only the persistence
   shutdown adapter. The legacy host does not yet use `ApplicationRuntime`.

The fixed P0 `source-inventory.json` remains the historical baseline. Current
inventory delta: persistence owner typing is framework-independent; executable
shutdown/process integration moved from `persistence/shutdown.ts` into
`compat/sails/persistenceLifecycle.ts`. Optional default repository resolution,
attachment-domain globals, CoreBase, service/controller caches and the existing
business bootstrap remain visibly legacy with their original later task owners.
No P2 task was started, no dependency version was changed and no branch was pushed.


## Completion source and cleanup

- SR-006 source: `993c94de49435e2f13f66cb4933cd1f9838e7fc3`.
- SR-007 source: `5b2fb1b71e744e535fcf1e0b1c9e6350e68be0e0`. The final build/tests above ran on this
  source immediately before committing it; the following commit only records
  evidence/task status.
- `docker rm -fv sr-p1-mongo8`: **exit 0** after test teardown. Only this round's
  disposable container was removed. Test-created databases had already been
  dropped; no institution or P0 fixture database was used.
- Final `git diff --check`: **exit 0**. The unrelated pre-existing untracked
  `support/specs/graphql-record-metadata/` directory remains untouched.

## SR-008 — Explicit record-type domain

Continuation from accepted SR-006/SR-007 at `7e74945a7116808767c30ed2b41ad79b7b31c31d`.
The earlier handoff describes that earlier round, and is superseded below.

Moved the existing implementation to `src/recordTypes/RecordTypes.ts`, exported by
its narrow index. Its synchronous constructor receives reference operations,
configuration slices, logging and an explicit storage-capability operation.
`initialize(brand)` joins startup; intentional `bootstrap(brand)` reloads remain
available. Observable calls stay lazy and share one result/error per call.
Schema checks, cache contents, stored-policy reads and synchronous create validation
are retained. `close()` clears the instance cache. No CoreBase, inherited imports,
Lodash globals, Sails lookup or framework types execute in the domain graph.

The temporary legacy entrypoint delegates to this implementation; only
`compat/sails/recordTypes.ts` discovers legacy dependencies. The RecordTypes getter
now uses an application-owned symbol, outside `serviceCache`; unconverted getters
remain legacy. Application lifecycle integration follows in SR-011.
No dependencies changed.

On Node 26.11.1 / npm 11.20.0 / TypeScript 5.9.3 / Mocha 11.7.6:

```sh
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm run lint
cd packages/redbox-core
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts test/services/RecordTypesService.test.ts test/recordTypes/RecordTypes.test.ts test/unit/prisma-runtime.test.ts test/unit/cache-persistence-runtime.test.ts test/services/AuditFollowupDrain.test.ts test/services/SecurityEventOwnership.test.ts test/services/AgendaQueueService.test.ts
```

Build, typecheck and lint exit **0** (846 files, no lint warnings/errors).
Focused suite: **106 passing, 0 failing, 0 pending**, including all **17 existing
RecordTypes cases** and two new explicit composition/Observable cases. A separate
Node process requiring `dist/recordTypes` asserted no global Sails and no loaded
Sails, CoreBase/CoreService, compat or services-barrel modules: exit **0**.
Focused Prettier formatting and `git diff --check` pass.

During implementation an automated import rewrite produced a syntax error, corrected
before passing verification. The first build also exposed an existing difference
between record-type config and model hook types; the input now uses the existing
configuration contract with the historical extra fields, instead of casting config
to a stored model. Two initial build invocations overlapped in error; the final
single clean build above completed successfully. Prisma's existing module-type and
skills notices remain unchanged. Real persisted domain proof follows in SR-009.

## SR-009 — Real-Mongo record-type proof

SR-008 source: `ed228e53a` (full SHA available through `git rev-parse`).
New `test/recordTypes/RecordTypesMongo.test.ts` composes the actual converted domain
with `ApplicationRuntime` and existing reference repositories. It exercises
bootstrap/create/reload/cache/read/list/projection, tenant isolation, current stored
policy updates and malformed/missing policy, configured/persisted schema failure,
strict configured/stored/runtime capability rejection, brand-scoped disposable
`bootstrapAlways`, original-error preservation with retained cleanup failure and
retry, separate instances/caches/databases, stale service and repository handles,
and restart from persisted definitions with a fresh owner. This exceeds the prior
foundation fixture by executing actual business bootstrap, validation and caching,
including writes and failure cleanup. Import-only proof runs in a child process
against compiled narrow entries and checks no core barrel, compat/services,
CoreBase, Sails, global Sails or installed signal handlers.

A real persistence mismatch surfaced: optional absent JSON schema overrides decode
as null. A definition created without an override previously failed its next
schema-enabled bootstrap. Stored absent/null overrides now follow the existing
RecordValidationService convention (no override); explicit malformed configuration
and non-null malformed persisted overrides still fail. No repository representation
or ownership was changed. Input typing also continues accepting the pre-existing
RecordTypeModel create argument alongside the existing config definition type.

Fresh disposable container `sr-p1-domain-mongo8`, image `mongo:8.0.34`, image digest
`sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`,
localhost port **34900**. Live `mongosh` buildInfo/version and getParameter report
**8.0.34 / FCV 8.0**, single-node standalone topology. Databases have checked
disposable prefixes, unique suffixes and teardown drops; no institution data.
Node **26.11.1**, npm **11.20.0**, Mongo driver **7.7.0**, Prisma ORM
**8.0.0-rc.19**, Prisma CLI **8.0.0-rc.24**; tooling otherwise as SR-008.
All commands explicitly prepended the qualified local Node 26 toolchain to PATH.

```sh
docker run -d --name sr-p1-domain-mongo8 --memory=768m -p 127.0.0.1::27017 mongo:8.0.34 --bind_ip_all --wiredTigerCacheSizeGB 0.25
docker exec sr-p1-domain-mongo8 mongosh --quiet --eval 'JSON.stringify({version:db.version(),fcv:db.adminCommand({getParameter:1,featureCompatibilityVersion:1}).featureCompatibilityVersion})'
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
RECORD_TYPES_TEST_MONGO_URL=mongodb://127.0.0.1:34900/sr_p1_recordtypes npm --prefix packages/redbox-core run test:record-types:mongo
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34900/redbox_prisma_p1 npm --prefix packages/redbox-core run test:persistence
npm run lint
```

Final commands exit **0**. Actual persisted domain: **9 passing, 0 failing,
0 pending**, about 2 seconds. Existing persistence/ownership regression: **30
passing, 0 failing, 0 pending**, about 5 seconds. Existing RecordTypes plus explicit
composition suite: **19 passing, 0 failing, 0 pending**. Build, application test
strict typecheck (now includes RecordTypes tests), lint and focused formatting pass.
No dependency changes. Dedicated Mongo command requires its environment and never
skips; excluded only from the legacy default test setup which installs global Sails.

Initial Mongo run: **7 passing / 2 failing**, exposing optional JSON absence above;
fixed and final **9/9** rerun. Initial expanded typecheck found the old model/config
search-filter typing mismatch; preserving both existing input contracts resolved it.
No assertion was removed or skip added to hide these failures. This is partial
runtime/domain proof; authenticated endpoints, institution config and production
storage contributors remain in later phases. No P2 work started.

## SR-010 — Minimal standalone Express host

SR-009 source: `5fdfc33cf`. New narrow entry `src/http/express/index.ts` exports
`ExpressHost`. Construction wires one Express application/router and one Node
HTTP server; it acquires nothing and installs no signals. Explicit hostname/port
and an awaited partial `prepare(router, server)` composition are required.
Initialization binds behind the admission gate, initializes the application, awaits
preparation, and stays inactive. Only explicit successful host activation opens
normal requests. `/readyz` reports only readiness; absent routes return 404 after
activation. No core barrel, controller fallback, second server or Sails dispatch.

Stop closes admission synchronously, fences initialization stages, waits accepted
HTTP responses before active application cleanup, and closes the listener. Deadline
failure retains observable state and retry joins the original listener close.
Only explicit `installSignalHandlers` owns SIGINT/SIGTERM; success detaches handlers,
failure remains retryable. Application/host acquisition and cleanup remain awaited;
original startup failures and separate stop failure remain observable.

The test composition is explicitly partial: one test-only probe/router and the
converted RecordTypes module. Authentication, public RecordTypes URLs, sessions,
views, uploads, sockets, workers, production configuration and extension discovery
are absent and remain assigned to later tasks. No root package/module-type change
and no dependency change: core uses its existing exact Express **5.2.1**, verified
from the compiled host child. Root/Companion's Express overrides were not copied.

On the same Node 26.11.1/Mongo 8.0.34 fixture described in SR-009:

```sh
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm --prefix packages/redbox-core run test:http-host
RECORD_TYPES_TEST_MONGO_URL=mongodb://127.0.0.1:34900/sr_p1_recordtypes npm --prefix packages/redbox-core run test:record-types:mongo
npm run lint
node_modules/.bin/prettier --check packages/redbox-core/src/http/express packages/redbox-core/test/http packages/redbox-core/test/recordTypes packages/redbox-core/test/tsconfig.application.json
git diff --check
```

All exit **0**. Host: **9 passing, 0 failing, 0 pending**, ~3 seconds, including
initializing/inactive/preparation gates, concurrent joins, absent public routes,
preparation/runtime/activation/bind failure, stop during initialization/binding,
accepted-response drain, repeated timeout/retry, and a real OS **SIGTERM** delivered
to a compiled standalone child. That child asserts no Sails/compat imports and
removal of its signal listeners. Domain Mongo suite: **10 passing, 0 failing,
0 pending**, now including actual HTTP admission over the real module, cache
read, missing public route, and pool/Prisma/cache closure. Build, expanded strict
application test typecheck, lint (848 files) and formatting pass. No new failing
invocation in this task. The host is an early partial-host proof, not a promoted
portal entrypoint; no P2 or authenticated P4 work is claimed.

## SR-011 — Same-instance legacy comparison adapter

SR-010 source: `3f2062814`. `compat/sails/application.ts` attaches the converted
subset's ApplicationRuntime to the legacy owner; `recordTypes.ts` supplies lazy
shim exports over its one owned RecordTypes instance. Bootstrap joins that
runtime's awaited module initialization, initializes existing reference ownership
idempotently, and returns the same cache. Generated core/hook/post-bootstrap
callbacks remain explicitly legacy; only after they finish does the converted
application activate. Failure cleanup and guarded legacy shutdown stop that same
runtime, preserving retained ownership and retry. The remaining process service
cache is explicitly marked as unconverted. No separate domain implementation,
client, pool or converted singleton registry was introduced.

The loader reads service getters while generating shims before global Sails
exists. The exports now defer owner resolution until invocation; the compiled
legacy test explicitly reads the real ServiceExports getter before Sails exists.
This closes the pre-lift gap in SR-008's temporary getter.

`test/compat/SailsRecordTypesMongo.test.ts` lifts an actual minimal **Sails 1.5.18**
HTTP host (its listener resolves **Express 4.22.2**), loads a generated-style service
shim from the built artifact, runs real reference/RecordTypes bootstrap and
legacy hooks/post-bootstrap, serves a test-only HTTP route and calls guarded
`lower()`. Spies/status prove the shim and runtime use the same domain instance,
one bootstrap, one Prisma client and one pool. Repeated bootstrap calls join;
current stored policy changes apply through both direct and shim calls. Successful
lower clears cache and closes ownership exactly once. A failed converted close
refuses lower, retains that same instance and pool, and succeeds on retry. A later
legacy hook failure preserves its original error, cleans the converted module,
never activates, and leaves completed data writes in place (no rollback claim).

This is focused real legacy-host coverage, not a claim that all unconverted portal
modules or institution hooks are standalone. Only RecordTypes is application-owned
in this adapter; migration/core/extension/post-bootstrap callbacks, other service
caches and normal production Sails entrypoints remain assigned to later tasks.
Standalone domain/runtime/host imports continue to exclude this adapter.

Final commands, all with the qualified Node 26 toolchain prepended to PATH:

```sh
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm --prefix packages/redbox-core run typecheck:persistence
LEGACY_RECORD_TYPES_TEST_MONGO_URL=mongodb://127.0.0.1:34900/sr_p1_legacy P1_RECORD_TYPES_COMPARISON_OUTPUT="$PWD/.tmp/sails-retirement/legacy-pilot.json" npm --prefix packages/redbox-core run test:sails-record-types:mongo
RECORD_TYPES_TEST_MONGO_URL=mongodb://127.0.0.1:34900/sr_p1_recordtypes P1_RECORD_TYPES_COMPARISON_OUTPUT="$PWD/.tmp/sails-retirement/standalone-pilot.json" npm --prefix packages/redbox-core run test:record-types:mongo
diff -u .tmp/sails-retirement/standalone-pilot.json .tmp/sails-retirement/legacy-pilot.json
sha256sum .tmp/sails-retirement/standalone-pilot.json .tmp/sails-retirement/legacy-pilot.json
npm --prefix packages/redbox-core run test:http-host
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34900/redbox_prisma_p1 npm run test:core
npm run lint
node_modules/.bin/prettier --check packages/redbox-core/src/recordTypes packages/redbox-core/src/http/express packages/redbox-core/src/compat/sails packages/redbox-core/src/services/RecordTypesService.ts packages/redbox-core/test/recordTypes packages/redbox-core/test/http packages/redbox-core/test/compat packages/redbox-core/test/tsconfig.application.json
git diff --check
```

Standalone and legacy comparison commands ran as **separate processes and separate
runs**, with isolated disposable database prefixes. Both observe the same seeded
pilot input and compare count/cache size, package type, schema, validation and
resolved policy, excluding physical IDs/timestamps. `diff` exits **0**; both JSON
outputs have SHA-256
`2fdfb2f8969bf7852eb2da203c7ab9f3bee34bd66836f660819c675f915cdd6c`.
They are small local artifacts; assertions and input/observation code are committed
in `test/recordTypes/pilotFixture.ts`. This compares intermediate legacy and new
hosts; it does not replace the separate P0 released-v5 characterization.

Final results:

- Compiled real legacy host/Mongo: **3 passing, 0 failing, 0 pending**, ~3 seconds.
- Standalone actual domain/Mongo/host: **10 passing, 0 failing, 0 pending**, ~3 seconds.
- Dedicated Express host: **9 passing, 0 failing, 0 pending**, ~3 seconds.
- Existing focused bootstrap/shim/RecordTypes/persistence-runtime command:
  **40 passing, 0 failing, 0 pending** (same Mocha flags as SR-008, files
  `test/bootstrap.test.ts test/loader/bootstrapShimRuntime.test.ts
  test/services/RecordTypesService.test.ts test/unit/prisma-runtime.test.ts`).
- Full `test:core` with persistence URL: **4,366 passing, 0 failing, 68 pending**,
  about 2 minutes. The existing **30 real persistence regression cases execute
  and pass in this run**, alongside the existing ownership/drain/queue/session
  and all default core suites.
- Core build, application/persistence strict test typechecks, repo lint
  (**849 files**, no warnings/errors), focused formatting and diff check: exit **0**.

The 68 full-suite pending cases are **51** Figshare worker cases without their
`FIGSHARE_TEST_MONGO_URI`, **7** SIEM cases without `SIEM_TEST_MONGO_URL`, **3** old
foundation cases requiring their authenticated Mongo9 `P1_MONGO_URL` fixture, and
**7** existing explicit skips (Raid 2, Trigger 2, Workspace 3). None is counted as
new real-Mongo evidence. No existing assertion or skip condition was weakened.
The new Mongo commands require their fixture URLs and never skip; the real legacy
host fixture is excluded from default global-mock setup and has its own command.

Exact live versions rechecked: Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**,
ts-node **10.9.2**, Mocha **11.7.6**, Mongo driver **7.7.0**, Prisma ORM
**8.0.0-rc.19**, Sails **1.5.18**, standalone Express **5.2.1**, Sails listener
Express **4.22.2**. Mongo remains **8.0.34 / FCV 8.0**, standalone topology as
SR-009. No dependency version, override, package type or lockfile change.

Implementation failures/limitations: initial real-Sails fixture runs rejected an
omitted `globals.async` setting before bootstrap; fixed by explicit `async: false`.
The first expanded typecheck loaded both built/source ambient Sails declarations;
the compiled consumer now executes dist with source-only type imports, and checks
unknown shim results explicitly. Final strict typechecks pass without weakening
compiler options. A version probe incorrectly looked for npm as a root dependency;
`npm --version` correctly verified the selected toolchain. Synthetic hook failure
logs are expected passing negative tests, not suppressed failures. No provider
quota/usage limit occurred. No P2 task was started and no branch was pushed.
