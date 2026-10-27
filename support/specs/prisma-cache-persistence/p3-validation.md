# P3 Prisma runtime, configuration and lifecycle

**Final-review correction:** the `.tmp/prisma-cache-p3/run-docker.sh`, Compose
overlay and `backend.test.ts` described below were local inputs and were not
retained. Their reported 10-test runs are historical observations, not an exactly
replayable harness. Do not invoke those missing paths from a clean checkout.
The tracked core `test:cache-prisma` and `run-waterline-capture.sh` runners replay
the prerequisite/lifecycle and loaded-model checks. For the full portal, use the
later tracked [P5 harness and preparation instructions](evidence/p5/harness/README.md)
with `run-mocha.sh` for each selector; its committed
`CachePersistenceTransition.test.ts` asserts the actual backend. That later
13-test coverage supersedes the missing diagnostic assertion. The original G3
results remain historical evidence, subject to this reproducibility limit.

Recorded 2026-10-19 Australia/Adelaide. Input: G2 at `2b91872c5`.
Implementation checkpoints: `b01df8bec` (adapter/contract/preflight), `5b87ef804`
(selection/lifecycle), `07bdf556d` (isolated failures, datastore overrides and locks),
`87873026d` (Sails module reload ownership, split config, driver alignment),
and `181dfc2aa` (explicit Docker Mocha selector forwarding).
The final evidence revision is resolvable with
`git log --format='%H %s' -- support/specs/prisma-cache-persistence/p3-validation.md`.

## G3 decision

**G3 passes for explicit opt-in on the tested development matrix. P3.1–P3.9
are evidenced below. Waterline remains the default.** The opt-in MongoDB suite,
configuration/lifecycle checks, both portal backend assertions and final full
core suite pass. Missing/conflicting prerequisites, invalid configuration,
authentication/connectivity failures, partial initialization and runtime query
failures never select another adapter: initialization rejects with no accessible
repository, or the selected Prisma repository continues to reject its query.
Neither documents nor indexes are automatically cleaned up.

No P4/P5 gate or Prisma default promotion is implied. The CLI/runtime are still
RC/early-access, and the package/infrastructure, full interoperability and
release gates remain outstanding.

## Deliverables and contract (P3.1)

`packages/redbox-core/src/persistence/cache/PrismaCacheEntryRepository.ts`
implements the same four-operation plain ReDBox interface as Waterline. Its
Prisma types stay inside the adapter/client, outside the service-facing seam.
The P1 contract is copied into core at
`src/persistence/prisma/contract.ts`, with committed
`src/persistence/prisma/generated/contract.json` and `contract.d.ts`.
The historical spike remains unchanged as P1 evidence.

The adapter maps BSON ObjectId `_id` to string `id`; supplies matching ISO
string `createdAt`/`updatedAt` on create; changes only `updatedAt` on update;
and uses the proven `field.double()` for finite numeric epoch seconds. Omitted
create data becomes physical null; omitted update data preserves the stored
value. Legacy missing data reads as null, with missing timestamps omitted from
the plain result. Reads do not rewrite documents. Updates preserve unrelated
fields. A missing read returns null, missing update/delete does nothing, and
there is no upsert, write retry or serialization/coercion workaround.

Input validation uses P2's strict JSON validator. Unsupported legacy BSON
rejects during Prisma decoding without modifying the document.
`DuplicateCacheEntryError` has code `duplicate-cache-entry`, a payload-free
message and the original MongoDB duplicate error as `cause`, for create and
renaming update. Other repository failures reject and retain the selected
adapter. Neither service API/durability nor expiry behavior changed.

Exact dependencies: Prisma CLI **8.0.0-rc.23**, runtime
**@prisma/orm-mongo 8.0.0-rc.18**, MongoDB driver **7.7.0**, connection
string parser **7.0.2**, TypeScript **5.9.3** (existing). The parser handles
MongoDB multi-host/SRV URLs and encoded credentials without a handwritten URI
parser. Core and root locks are updated. Both Prisma candidates retain P1's
RC/early-access qualification; they are not qualified for official v6. Root MongoDB
is aligned from **7.2.0 to 7.7.0** with core and Prisma: the Docker runner's npm
install exposed a deduplication-dependent mismatch between nominal driver types.
After alignment, root, core and the Prisma runtime resolve the same driver. No
cast bypasses the ownership/client types.

The emitted artifact hashes are identical to P1:

- JSON SHA256: `1cca2cc02a0c6a833ed835618cb4e8f49b4bc36224c1e91fa55be37ae89aa993`
- Declaration SHA256: `3be17d603d4cc61aac3cd71128467a9348891665b525b410d18c9b836d3e60be`

## Configuration and datastore resolution (P3.2–P3.3)

`src/config/persistence.config.ts`, exported through `Config`, provides:

```typescript
persistence: {
  cache: {
    backend: 'waterline';
  }
}
```

The only accepted backend values are `waterline` and `prisma`. Absent config
uses Waterline; an explicitly incomplete, null or unknown value rejects. Changing
an initialized application's backend also rejects until cleanup. No config,
connection, index, mapping or query error selects another adapter.

To opt in through the standard Sails environment configuration:

```bash
sails_persistence__cache__backend=prisma
```

The normal `app.js` entrypoint merges this through `rc('sails')`. Direct
Sails `load()`/`lift()` calls do not parse `sails_*` variables; tests must pass
the configuration explicitly. The root Docker Mocha bootstrap now forwards
this selector and leaves validation to core.

There is no second cache connection URL. `configuration.ts` resolves the loaded
CacheEntry model's `getDatastore().config`, preserving its registered application
datastore, database, credentials, URI query options and driver options. It does
not read `redboxStorage`. Split database/host/port/user/password settings override
URI values, including preserving the URI half of partial credential overrides.
Multi-host overrides that cannot be applied unambiguously fail with guidance to
move them into the existing URL. Unsupported driver/serialization options also
reject. Standard collection/primary-key/attribute mappings are verified before
Prisma activation; Prisma does not run Waterline callbacks. Institutions must
still review their customized hooks explicitly.

Unit checks cover encoded credentials, multi-host URIs, TLS/authSource/
replicaSet/retryWrites options, SRV parsing, split overrides, partial credentials,
missing databases and safe rejection of unsupported configuration. Live checks
use an authenticated application datastore while an unused record-storage URL
points elsewhere. The live model selects a custom `applicationCache` datastore
configured entirely with split host/port/database/auth settings (no URL), proving
that registered Waterline normalization and a nondefault datastore are honored.
TLS/SRV deployment handshakes are not claimed tested here.

## Explicit preflight and readiness (P3.4–P3.5)

Supported package exports:

```typescript
await inspectCachePersistence(app); // read-only counts/index status
await ensureCachePersistenceIndex(app); // explicitly invoked scoped DDL
```

Reports contain MongoDB major version, duplicate-name group count and
`ready | missing | conflicting` index status, without names or document payloads.
The operation accepts an existing compatible index under any name. It rejects
nonunique, sparse, partial, non-simple collation and conflicting reserved-name
indexes, and rejects non-simple collection collation. Index creation is limited
to unique `{ name: 1 }` on `cacheentry`, named `cacheentry_name_unique`; it is
idempotent and never deletes documents/indexes or runs schema synchronization.

Startup requires MongoDB 8+ and verified unique-name enforcement. Missing index,
conflicts, duplicate data, unsupported mapping/version, unavailable database,
authentication failure or missing installed artifacts prevent repository access
and readiness. Safe errors identify remediation without retaining URL-bearing
connection/parse errors. Index creation failure remains authoritative if writes
introduce duplicates after inspection; the tested race leaves both documents
intact and reports failure. Startup never invokes index creation.

## Ownership and lifecycle (P3.6–P3.8)

`initializeCachePersistence(app)` completes immediately before the service
`init()` loop in `preLiftSetup`, hence before generated migrations/core/hook
bootstraps. `getCacheEntryRepository()` rejects before explicit initialization,
during startup/cleanup and after cleanup. Imports, constructors, service export
inspection and shim generation do not acquire connections.

Each application has one runtime in a private, non-enumerable application property
keyed by `Symbol.for('@researchdatabox/redbox-core/cache-persistence/v1')`.
Sails/include-all invalidates dependency modules during shim loading, so a
module-local WeakMap lost startup ownership across imports. The application
property shares the same runtime and shutdown registration across module loads,
without a global connection registry. Prisma borrows one runtime-owned MongoClient
for queries and inspection, with no second Prisma driver pool.
The Waterline adapter borrows the actual loaded model and closes no resources.
Initialization closes partially acquired resources on failure. Failed closes
remain owned so later cleanup can finish before resources are reacquired.

`preLiftSetup` cleans failures from service/controller initialization.
`createGeneratedBootstrap` also cleans failures from preLift, migrations, core,
hooks, post-bootstrap initialization and snapshot execution. Cleanup failures
log a fixed safe warning and do not replace the original startup error (including
the migration runner's existing error/cause). Tests inject a close error after
a real driver close and verify the original startup failure survives.

Normal Sails `beforeShutdown` awaits cleanup and chains an existing callback,
retaining its error or synchronous throw. Repeated/concurrent init and cleanup
are safe. The opt-in suite also initializes Prisma and calls real `app.lower()`:
the retained repository is closed afterward. Borrowed Waterline/native fixture
connections remain usable after persistence cleanup; owned drivers reject reuse.

## Commands and results (P3.9)

Host: Node **24.18.0**, npm **12.0.2**, Linux x86_64. Test MongoDB is standalone
**8.0.34**, pinned to
`mongo@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
Portal Docker runtime: Node **26.7.0**, npm **11.19.0**. Both host and Docker
runs use the existing CommonJS/NodeNext build. No replica set is required.
Every raw-suite container gets a random loopback
port and synthetic database; an EXIT trap removes only its returned container ID
and anonymous volumes. No connection is made to `development-mongodb-1`.

```bash
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run test:cache-prisma
node packages/redbox-core/test/fixtures/cache-persistence/repository-import-smoke.cjs
bash packages/redbox-core/test/fixtures/cache-persistence/run-waterline-capture.sh
node_modules/.bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.cache-persistence.json
```

Build **exit 0**. The opt-in command builds again, then runs **13 passing**
compiled-runtime tests on authenticated MongoDB 8.0.34. It covers raw JSON/IDs/
timestamps/omissions/misses, unsupported writes/legacy BSON, duplicate create/
update causes, index conflicts and concurrent writes, unsupported reported server
version, absent artifacts, invalid backend, unavailable database, invalid auth,
repeat startup/cleanup, every later bootstrap failure and real Sails lowering.
A deliberately closed driver causes a real query rejection while the same
Prisma repository remains selected. The unsupported-version case runs on MongoDB
8 and injects only the older buildInfo response; it does not claim a MongoDB 7
compatibility run.

The socket-blocking import/export/shim check **passes with zero socket attempts**,
including the generated default persistence config shim. The P0 raw Waterline
and P2 loaded hook-model override suites each **pass (1 test each)** on their
own disposable MongoDB 8 container. Scoped TypeScript checking **exits 0**.
The focused lifecycle/configuration/repository/bootstrap checks are included in
the full core suite. Oxlint reports **0 warnings, 0 errors** for 11 persistence/
configuration files; targeted Prettier, bash syntax and `git diff --check` pass.

The focused lifecycle/configuration suite passes **12 tests (76 ms)**, including
sharing one repository/shutdown hook across explicit require-cache invalidation.
That regression first failed **0 passing / 1 failing**, then passed after the
application-owned runtime fix. The first full Docker Waterline run had **5
passing / 5 failing** because service imports could not see the module-local
runtime. A diagnostic rerun reproduced it. This was a P3 implementation bug;
`87873026d` fixes it. Temporary diagnostic source logging was removed.

The final isolated Waterline portal run passes **10 tests**, **exit 0**
(Mocha reports 1 minute), on the standard `run-mocha-redbox.sh` entrypoint.
It includes webpack, shim generation, full lift/lower, the existing nine cache/
branding tests and a tenth assertion that the actual repository class is
`WaterlineCacheEntryRepository` for explicit `waterline` configuration.
The earlier module-invalidation failures no longer occur. Compose removed the
project containers/network and MongoDB anonymous volume.

The two portal invocations use the existing integration Compose definition
with a temporary `.tmp/prisma-cache-p3/compose.yml` overlay. It changes only the
MongoDB image to the digest above, mounts a test-only init script containing
`db.getSiblingDB('redbox-portal').cacheentry.createIndex({ name: 1 },
{ unique: true, name: 'cacheentry_name_unique' })`, and sets
`sails_persistence__cache__backend` explicitly. Test bootstrap uses Waterline
`migrate: 'drop'` in its own database and recreates a compatible `name_1` index;
Prisma startup accepts that verified index without replacing it.
The backend assertion compares the configured selector with the repository's
constructor name and prints `P3 active cache backend: <value>`.

```bash
bash .tmp/prisma-cache-p3/run-docker.sh waterline
bash .tmp/prisma-cache-p3/run-docker.sh prisma
```

The wrapper sets project names `redbox-cache-p3-waterline-815a2a6e` and
`redbox-cache-p3-prisma-815a2a6e`, and `RBPORTAL_MOCHA_TEST_PATHS` to the two
existing cache/branding suites plus `.tmp/prisma-cache-p3/backend.test.ts`.
It invokes `docker compose --profile mount -f
support/integration-testing/docker-compose.mocha.yml -f
.tmp/prisma-cache-p3/compose.yml up --menu=false --abort-on-container-exit
--exit-code-from redboxportal-mount redboxportal-mount`, with an EXIT trap
running `down -v --remove-orphans --timeout 180` on that same project.
Final runs use the standard entrypoint; the earlier diagnostic rerun used
prebuilt bundles to isolate module loading. The temporary harness remains
local/ignored; the durable opt-in runner is committed in core.

The first standard-entrypoint Prisma portal attempt reported **9 passing /
1 failing**: the new assertion found effective config `waterline` when the
environment requested `prisma`. The root test bootstrap called `sails.lift()`
directly without the `rc('sails')` merge used by `app.js`, so the environment
selector had never entered application config. This was a test-harness gap,
not passing Prisma evidence or a runtime failure fallback. `181dfc2aa` forwards
only this selector explicitly, and documents direct-lift test configuration.
The failed project's resources were removed before rerunning it.

The corrected standard-entrypoint Prisma portal run on `181dfc2aa` passes
**10 tests**, **exit 0** (Mocha reports 1 minute). It prints **P3 active cache
backend: prisma**, and verifies `PrismaCacheEntryRepository` after full bootstrap.
Cache tests observe persisted best-effort creates/updates from separate cache
instances, including falsy/null writes. Branding tests cover draft validation,
preview creation/stored CSS/TTL expiry, publish/history/restore. This is bounded
P3 integration evidence; it does not claim completion of all P5 preview/API cases.
Sails lowers normally and Compose removes its containers, MongoDB anonymous
volume and network. Final `docker ps -a` filters for both project labels and the
raw-suite label return no containers; project network filters also return none.
Development MongoDB was never queried or modified.

```bash
npm run test:core
```

**Final result: exit 0, 4,099 passing, 80 pending, zero failures (2 minutes)**.
Pending opt-in MongoDB suites are run separately above; skipped tests are not
counted as passes. The unchanged startup-module-loading test passes in **11,131
ms**. An earlier P3 run reported **4,092 passing, 79 pending, 1 failing**, solely
the known `startup-module-loading.test.ts` child **ETIMEDOUT** at its existing
12-second limit, already reproduced on base `0cfbd62b9`. No startup assertion,
source, skip or timeout was changed. The final run is sequential, without build
or Compose contention.

Final static checks:

```bash
node_modules/.bin/oxlint packages/redbox-core/src/persistence packages/redbox-core/src/config/persistence.config.ts
bash -n packages/redbox-core/test/fixtures/cache-persistence/run-prisma.sh
git diff --check
```

All **exit 0**; Oxlint reports **0 warnings, 0 errors**. Targeted Prettier checks
pass for new/changed persistence sources, tests, fixtures and this evidence.
The core package build includes the committed artifacts. Deterministic generation
and clean packed/pruned production qualification are explicitly left to P4.

## P4/P5 handoff and remaining qualification

- The authoritative contract is `packages/redbox-core/src/persistence/prisma/contract.ts`;
  emitted JSON/declarations are under its `generated/` directory.
  `prisma.config.ts` can emit the core contract offline. P3's package `build`
  copies the committed JSON/declaration with `scripts/copy-cache-contract.cjs`
  after tsc; `client.ts` resolves JSON relative to the installed module. P4 must
  replace/extend this minimal copy step with deterministic generation/freshness
  checks across root compile scripts, Docker's direct tsc, CI and packaging.
  No clean installed/pruned production package claim is made for P3.
- Root/core locks were refreshed with npm 12. P1 documented npm 11/12 peer-lock
  differences; P4 must qualify clean installs on its actual Docker/npm matrix.
- `test:cache-prisma` is the standalone opt-in command. `P3_SKIP_BUILD=true` is
  only for iterating against a current build. `P3_CACHE_MONGO_URL` belongs to the
  disposable runner, not application configuration. Tests select the backend via
  `app.config.persistence.cache.backend`, then explicitly prepare the index and
  initialize; portal tests use the standard Sails environment override above.
- P5 must still run the shared adapter contract/interoperability, mixed writers,
  switch/restart/rollback, full notification/preview/API/browser and operational
  comparison suites before a separately reviewed default promotion.
- The startup-module-loading timeout remains a known pre-existing concern from
  base `0cfbd62b9`. No startup assertion/timeout is changed or skipped. Institution
  hooks, real TLS/SRV deployments, shared-system MongoDB upgrades and official v6
  stable-runtime qualification remain their later gates.
