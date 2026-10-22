# P2 repository boundary and Waterline baseline

Recorded 2026-10-19 Australia/Adelaide. Input: G1 at `7ed196923`.
Implementation checkpoints: `bdd3858aa` (contract, validation, loaded-model
adapter) and `fc0e170d0` (service migrations, regression tests, offline shims and
real loaded-model override coverage). The final evidence commit is resolvable
with `git log --format='%H %s' -- support/specs/prisma-cache-persistence/p2-validation.md`.

## G2 decision

**G2 PASS — behavior-preserving repository boundary with the Waterline baseline.**
P2.1–P2.7 are evidenced below. Final core tests pass (4,087 passing, 67 pending),
as do all 132 focused checks, both real-Mongo suites, the offline socket-blocking
smoke and nine isolated portal integration tests. No new test failure remains.
The known base startup timeout occurred in the earlier concurrent run and passed
in the final sequential core run; its underlying timing sensitivity remains
unresolved. No timeout or assertion was changed. This gate authorizes P3 work;
it is not Prisma readiness, default promotion or official v6 qualification.

## Delivered seam (P2.1–P2.4)

`packages/redbox-core/src/persistence/cache/CacheEntryRepository.ts` owns
`JsonValue`, `CacheEntryRecord`, `CacheEntryWrite` and `CacheEntryRepository`.
The package root exports these types, `getCacheEntryRepository`,
`assertJsonValue`, `assertCacheEntryWrite` and `InvalidCacheEntryError`.
Services also accept an optional constructor dependency
`() => CacheEntryRepository`; resolving it is deferred until an operation.
Neither constructors nor `exports()` resolve the repository.

The four operations return promises: `findByName(name)` returns a plain record
or null; `create(entry)`, `updateByName(name, entry)` and `deleteById(id)` resolve
void. Missing updates/deletes are no-ops, never inserts. String IDs are opaque
at the service boundary; the default Mongo model maps its ObjectId to a string.
Timestamps are optional strings, and `ts_added` is finite numeric epoch seconds.
The declarations contain no ORM/driver types or query builders.

Missing top-level `data` is allowed. With the default Waterline model, omission
on create becomes physical null; omission on update preserves existing data.
Reads may retain absence (Waterline) or normalize it to null (future Prisma).
The service output is null in either case. `CacheService.set(..., undefined)`
omits the optional top-level property; explicitly present undefined passed to
the validator/repository is rejected. Nested undefined is always rejected.

Validation rejects nonfinite numbers, Date, Buffer/BSON, BigInt, functions,
symbols, class instances, array subclasses, sparse arrays, cycles, accessors,
hidden/symbol object members and extra array properties. Plain objects, null
prototype objects, arrays, primitives, null and repeated noncyclic references
are supported. Validation never invokes `toJSON`, getters or serialization.
Messages describe structure without copying payloads. Unsupported stored values
reject on read without modifying the stored document.

`WaterlineCacheEntryRepository.ts` borrows the actual loaded model, resolved
from `sails.models.cacheentry` by `runtime.ts`. It creates/closes no connections,
reconstructs no model and imposes no datastore/collection defaults. Waterline
retains callbacks, automatic timestamps and its multi-update behavior, including
customized deployments without a unique-name index. Return values are projected
onto the plain contract; unrelated fields and methods never escape. Original
model errors, including `E_UNIQUE`, reject unchanged. Current callers need no
new duplicate-error category, so no broad normalization framework was added.
An absent loaded model fails clearly, without starting an implicit connection.
P3 still owns explicit Prisma initialization/readiness/cleanup and selection.

## Preserved consumers (P2.5–P2.7)

CacheService retains its Observable `get()` and void `set(name, data: unknown,
expiry?)`, memory snapshot at call time, persistence on subscription, truthy
memory shortcut, falsy lookups, strict-greater-than global expiry, full default
local TTL after a DB hit, retained expired ordinary rows, memory-only per-call
TTL and null/zero-TTL notification resets. Writes remain memory-first followed
by asynchronous find/create-or-update, with two error log calls and no upsert,
retry, ordering guarantee or awaited durability. Validation occurs inside this
error path after the local operation. The existing notification suite passes.

BrandingService awaits both draft and retained-version preview creation and
uses the same repository for lookup and expired/valid deletion. Its independent
TTL, brand-scoped creation/history lookup, token-only fetch, existing errors and
deletion-failure precedence remain. Read/delete stays non-atomic. The misleading
single-use source comment now describes delete-after-lookup. No controller,
route or response behavior changed.

Service doubles now replace the repository seam, using promises rather than
Waterline queries. P0's 16 behavior cases remain, with additional tests for
subscription timing, rich-value error handling, competing creates, lookup errors
and awaited preview creation failures. Existing branding/controller coverage is
retained. The Docker cache test now observes actual write completion before
reading through separate cache instances and verifies update/falsy/null paths;
it does not mistake return from `set()` for durability.

## Remaining CacheEntry reference audit

Audit commands:

```bash
rg -n -i 'cacheentry' packages/redbox-core/src packages/redbox-core/test test/integration
rg -l -i 'cacheentry' packages/redbox-core --glob '!package-lock.json' --glob '!*.ejson'
rg -n -i 'cacheentry\s*\.|models[.?]+cacheentry|CacheEntryModel' packages/redbox-core/src packages/redbox-core/test test/integration --glob '!*.ejson'
rg -n '@prisma' packages/redbox-core/package.json packages/redbox-core/src/persistence packages/redbox-core/dist/persistence
git diff 7ed196923 -- package.json package-lock.json packages/redbox-core/package.json packages/redbox-core/package-lock.json
```

- **Transitional runtime model:** `src/waterline-models/CacheEntry.ts` and
  `src/waterline-models/index.ts` retain the definition, attributes/global type,
  model registration and `WaterlineModels.CacheEntry` export. The loader still
  generates the model shim using this map, preserving hook replacements. P7
  decides retirement of cache-only model/shim exposure.
- **Transitional adapter/composition:** `src/persistence/cache/runtime.ts` is
  the sole business-runtime lookup of the loaded cache model. The Waterline
  adapter's structural methods remain internal to the persistence subtree.
  Services reference only repository types/access. P3 adds the Prisma runtime;
  P7 removes the Waterline bridge.
- **Legacy compatibility type:** `src/model/storage/CacheEntryModel.ts` and its
  storage barrel retain the old public structural interface. No core business
  consumer uses it. It is not the new repository record/write contract; review
  its compatibility export when retiring cache-only legacy surfaces.
- **Plain seam references:** new persistence files, root package exports,
  CacheService/BrandingService constructor dependencies, unit tests and
  `test/helpers/cacheRepository.ts` intentionally use the new contract.
- **Transition-only physical tests:** `test/integration/CacheEntryWaterline.test.ts`
  and its archived EJSON exercise the original model directly as P0 physical
  evidence. `CacheEntryRepositoryWaterline.test.ts` registers a replacement model,
  inspects its raw collection and checks its manager remains usable after
  repository operations. The runner/README and offline smoke script refer to
  these files or the retained generated model shim. These uses verify adapter
  compatibility/connection ownership and are not service bypasses.
- **Portal integration fixture:** `test/integration/services/BrandingService.test.ts`
  retains two direct model calls to find and backdate a preview for its expiry
  test. `test/integration/globals.d.ts` retains the corresponding test-only
  global declaration. This is deliberate raw fixture manipulation; migrate it
  when running/retiring the two-adapter comparison. All service doubles and the
  generic `packages/redbox-core/test/setup.ts` CacheEntry global are removed.
- **Unrelated match:** `src/hooks/hookDiscovery.ts`'s `HookDiscoveryCacheEntry`
  is an in-memory hook-discovery cache type, unrelated to persisted CacheEntry.
- **No core migration or bundled hook bypass was found.** Earlier P0 inventory,
  `evidence/direct-model-consumers.json` and P1 spike code are historical/input
  evidence; they are not current core business consumers and were not rewritten.

The Prisma grep has no matches. The manifest/lock diff is empty. No Prisma,
new driver dependency, backend selector, bootstrap lifecycle change, schema/index
automation or infrastructure-image change is introduced by P2.

## Versions and isolation

Host: Node **24.18.0**, npm **12.0.2**, TypeScript **5.9.3**, Docker **29.6.1**,
Linux x86_64. Core-resolved dependencies: Sails **1.5.18**, sails-hook-orm
**4.0.3**, Waterline **0.15.2**, sails-mongo **2.1.2**, direct mongodb **7.7.0**,
RxJS **7.8.2**, NodeCache **5.1.2**. The root portal resolves Sails **1.5.17**
and direct mongodb **7.2.0** from its existing installation; this is distinct
from the core package's resolution, not an upgrade made here.

Real adapter/raw tests use the existing disposable runner: random container,
random loopback port, synthetic `redbox_cache_p0_*` databases (the override test
uses an additional `_hook` database), standalone unauthenticated MongoDB
**8.0.34**, image
`mongo@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
No existing volume is mounted. The trap removes only its returned container ID
and anonymous volumes. The archived P0 EJSON is unchanged.

Portal Docker tests use isolated Compose project `redbox-cache-p2-815a2a6e`,
its own MongoDB and the runner's project-scoped cleanup. No connection, command
or data operation targets `development-mongodb-1`. Existing mounted portal image:
`qcifengineering/redbox-portal@sha256:07120382d99c344ddfa07e16ce8b24f5e5b91be2959998d9b0bb78976ca8a129`.
Observed mounted portal runtime: Node **26.7.0**. The Compose MongoDB digest remains
`mongo@sha256:bac22ea7710d774103dcad3ec8ac13cba1eb378f488e3ce8a6b3a1adf2ba9dcc`;
observed server binary **9.0.2**. This existing baseline is separate from the
MongoDB 8 raw/adapter proof.
Both versions were rechecked using image-only `docker run --rm --network none`
commands with `node --version` / `mongod --version` entrypoints (no database
connections). Waterline is the active backend throughout P2.

## Commands and results

All commands start at repository root unless indicated. Logs under `/tmp` are
local diagnostics; raw portal bootstrap logs are not committed because they may
print generated tokens. No manifest/lock or dependency installation was changed
for the core work. Docker's existing runner may install its pinned Redoc helper.

```bash
npm --prefix packages/redbox-core run build
```

Exit **0**. Production source compiles with unchanged strict NodeNext/CommonJS
settings. The first compile caught a new timestamp-narrowing error; it was fixed
before this successful build and the implementation commits.

Focused tests, working directory `packages/redbox-core`:

```bash
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only ../../node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 5000 \
  test/unit/cache-entry-repository.test.ts \
  test/services/CacheServiceCharacterization.test.ts \
  test/services/BrandingPreviewCharacterization.test.ts \
  test/services/CacheService.test.ts \
  test/services/IntegrationNotificationService.test.ts \
  test/services/BrandingService.test.ts \
  test/services/BrandingServiceLifecycle.test.ts \
  test/controllers/BrandingFontDelivery.test.ts
```

Exit **0**, **132 passing** (8 seconds final focused run): 23 repository/validation
tests plus 109 cache, notification, branding and controller cases.

```bash
bash packages/redbox-core/test/fixtures/cache-persistence/run-waterline-capture.sh
node packages/redbox-core/test/fixtures/cache-persistence/repository-import-smoke.cjs
```

Both exit **0**. The disposable server reports **8.0.34**. Raw P0 capture
assertions: **1 passing**, 14 synthetic documents, duplicate **E_UNIQUE**.
Repository override assertions: **1 passing**; customized datastore/collection,
create/update/destroy callbacks, string IDs/timestamps, future numeric seconds,
omission/misses, untouched legacy fields, unsupported stored BSON rejection,
multi-update and unique-index errors all verified. Index creation/duplicate test
fixture cleanup are explicit test operations, never repository side effects.
The original loaded manager remains connected and queryable afterwards.
Offline smoke: **zero socket attempts** while importing built core, inspecting
exports, constructing/exporting both services, generating and loading model,
service and bootstrap shims. The temporary shim app links to the built checkout;
this is not a repeat of P1's clean packed-install qualification.

The first real-test harness attempted two Sails apps in one process; sails-mongo
retained registration state and rejected the second model as already registered.
The runner now uses fresh processes for the two suites. The failed process was
terminated and its own container removed. The first offline shim harness lacked
package resolution from its temporary directory; adding its explicit local
package link fixed it. Both corrected final runs pass without production changes.

```bash
npm run test:core
COMPOSE_PROJECT_NAME=redbox-cache-p2-815a2a6e \
RBPORTAL_MOCHA_TEST_PATHS=$'test/integration/services/CacheService.test.ts\ntest/integration/services/BrandingService.test.ts' \
npm run test:mocha:mount
```

**Final Docker result: exit 0, 9 passing** (Mocha reports 1 minute), including
cache hit/miss, observed persistence create/update/falsy/null paths from separate
cache instances, preview creation/expiry and branding publish/history/restore.
The portal lifts and lowers, and Compose removes its containers/network. A final
`docker ps -a` filtered by the P2 project and by the disposable raw-test label
returns no containers. No development container was modified.

**Final core result: exit 0, 4,087 passing, 67 pending, zero failures**
(2 minutes). The unchanged startup-module test passes in 11,420 ms. Pending
cases include opt-in real-Mongo suites, run separately above; they are not
counted as passing. The first core run (before the last additional tests)
reported **4,082 passing, 67 pending, 1 failing**, solely the pre-existing
`startup-module-loading.test.ts:36` child `ETIMEDOUT` at its unchanged 12-second
timeout. This is already reproduced on base `0cfbd62b9` in P1; no startup assertion was
skipped, startup test source changed or timeout increased. The first concurrent Compose run
exited **1** before portal startup: Keycloak missed its health-check window
while host compilation/core tests also ran. Its project was removed; it is not
a service-test failure or passing evidence. The corrected sequential rerun above
passes with unchanged Compose settings.

```bash
node_modules/.bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.cache-persistence.json
node_modules/.bin/oxlint packages/redbox-core/src/persistence/cache packages/redbox-core/src/services/CacheService.ts packages/redbox-core/src/services/BrandingService.ts
bash -n packages/redbox-core/test/fixtures/cache-persistence/run-waterline-capture.sh
git diff --check
```

All exit **0**; Oxlint reports **0 warnings, 0 errors** (six production files).
Prettier checks also pass for new persistence files, both production services,
root exports, new/helper/characterization/lifecycle tests, the offline smoke and
scoped test configuration. Existing unrelated legacy test formatting is not
claimed fixed. Compiled public contract/accessor declarations were inspected;
they expose only plain ReDBox types and standard promises.

## P3 handoff and unresolved scope

- Implement this exact four-operation seam; preserve optional missing reads or
  normalize to null without rewriting documents. Map default physical ObjectId
  `_id` to string `id`, use P1's `field.double()` for numeric seconds, and retain
  optional ISO string timestamps rather than BSON Dates. Generate timestamps
  on create/update; preserve createdAt and unrelated fields on updates.
- Explicitly supply null for omitted Prisma create data; leave omitted update
  data untouched. Reject rich/nonfinite/nested-undefined data through the same
  validation, with no `toJSON`/serialization workaround. No upsert/retry or atomic
  preview consume belongs in this adapter.
- Replace/extend the lazy composition module with explicit initialization before
  the service init loop, typed backend selection, effective application datastore
  resolution, prerequisite/index verification and owned-resource cleanup. Imports
  and shim generation must stay offline. Never close Waterline's borrowed pool.
- Keep Waterline's existing error behavior; if Prisma needs duplicate-name
  normalization, preserve the native cause and do not expose Prisma codes as
  the service contract. Preserve subscriber propagation, write logging and
  branding failure precedence.
- Safe-mode uniqueness is still not guaranteed. P3 must provide explicit,
  scoped duplicate/index preflight and fail readiness for missing/conflicting
  prerequisites without deleting data or silently falling back.
- Private hooks/rich legacy data and customized IDs/attributes still require
  institution review. The loaded-model baseline honors datastore, collection
  and callbacks; Prisma will not execute Waterline callbacks. Stable Prisma and
  MongoDB-runtime qualification, full packaging/CI/deployment, backend switching,
  restart/rollback, HTTP/browser regressions and operational comparison remain
  their later gates. The known startup suite timeout remains unresolved.
