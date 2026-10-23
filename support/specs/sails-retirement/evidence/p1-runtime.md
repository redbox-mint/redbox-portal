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
