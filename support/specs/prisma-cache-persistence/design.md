# Prisma 8 cache persistence design

> **Current contract after C2 — user decision 2026-10-20.**
> Official v6 requires **driver-repository cache** under accepted
> [ADR0003](../waterline-retirement/adr/0003-orm-reevaluation.md).
> [C2 validation](../waterline-retirement/c2-validation.md) records qualification,
> the separate MongoDB default promotion and Prisma removal. Current `next`
> defaults to `mongodb`; explicit `waterline` remains a temporary transition
> choice. `prisma` is retired and fails with migration guidance. Prisma adapters,
> contracts, generator/freshness/config tooling and root/core dependencies are gone.
> **Prisma-specific P7.1 is superseded**, not satisfied by a GA upgrade. The release
> gate now requires the supported official driver and qualified Node/Mongo/FCV,
> package, Docker, lifecycle, operation and institution recovery matrix; final
> Waterline cache/model/selector retirement; and explicit official-v6 acceptance.
> **P7/G7 remain incomplete.** C2's bounded next evidence does not retire the
> remaining Waterline bridge or settle REL-01 scope/date, SEC-01 or INST-01.
> The Prisma maturity and pilot results below are historical evidence.

Status: historical Prisma pilot design below; current driver contract and C2
implementation/promotion status are governed by the approved revision above.

This specification captures the design decisions agreed during review of
“Introduce Prisma 8 through a cache persistence pilot”. Read it with the
[implementation plan](implementation_plan.md) and [task list](tasks.md).

## 1. Outcome and release boundary

Introduce a framework-independent cache repository within `redbox-core`, then
use Prisma 8 to persist `CacheEntry` documents in the existing MongoDB collection.
The pilot must deliver production-ready cache persistence while providing a
reversible evaluation of Prisma during `next` development.

There are two deliberately different compatibility periods:

- **Development on `next`:** Prisma and Waterline adapters coexist temporarily.
  Backend selection is explicit. Waterline remains the initial default until
  compatibility, packaging, lifecycle, rollback, and operational checks pass.
  A later change promotes Prisma to the default. Institutions must review their
  hooks before enabling it. Concurrent instances using different adapters must
  interoperate against the same collection.
- **Official v6 (revised):** cache persistence requires the official-driver repository. Remove the Waterline cache
  adapter and backend-selection configuration before release. Institutions must
  migrate affected hooks and infrastructure. Waterline remains for other,
  unmigrated persistence domains. Permanent cache fallback and rollback to v5
  are not v6 compatibility promises.

A supported stable official MongoDB driver and qualified Node/Mongo matrix are
mandatory v6 release gates under ADR0003/C2. If either is unavailable, explicitly reconsider v6
scope or timing. Do not automatically ship the transitional cache backend.
Release candidates and MongoDB early-access packages may be evaluated on `next`.

If Prisma fails the pilot, retain the useful repository boundary, record the
evidence, and reconsider the ORM decision. A successful cache pilot authorizes
cache adoption and investigation of the next domain; it does not establish
suitability for relationships, transactions, or record storage.

## 2. Scope and exclusions

In scope:

- Inventory application models, hook overrides, callbacks, relationships, and
  direct MongoDB access, separating the application datastore from record
  storage, GridFS, sessions, and queues.
- Define one narrow cache repository, implement both transitional adapters,
  and move every core `CacheEntry` consumer behind it.
- Integrate connection lifecycle, contract generation, packaging, deployment,
  tests, institution migration documentation, and adapter retirement.
- Require MongoDB 8+ and document the upgrade prerequisites for shared instances.

Out of scope:

- Removing Sails or all Waterline use; migrating other domain models.
- Implementing PostgreSQL, a generic ORM facade, or a Waterline-compatible query
  language.
- Bulk cache-document rewrites, automatic duplicate cleanup, database-wide
  schema synchronization, or automatic database-engine upgrades.
- Correcting cache expiry/falsy-value quirks, adding durable `set()` semantics,
  introducing write retries/upsert behavior, or making previews atomically
  single-use.
- A permanent dual-backend benchmark or support commitment.

## 3. Existing behavior and implementation anchors

The following files are the starting points, not an exhaustive change manifest:

- [CacheEntry model](../../../packages/redbox-core/src/waterline-models/CacheEntry.ts):
  `cacheentry` identity, required unique `name`, optional JSON `data`, numeric
  `ts_added`.
- [Model defaults](../../../packages/redbox-core/src/config/models.config.ts):
  application datastore `mongodb`, safe migration mode, string timestamps,
  and string-facing `id` mapped to `_id`.
- [Datastore configuration](../../../packages/redbox-core/src/config/datastores.config.ts):
  application and record-storage connections are distinct.
- [CacheService](../../../packages/redbox-core/src/services/CacheService.ts):
  NodeCache plus asynchronous persisted reads/writes and an RxJS public API.
- [BrandingService](../../../packages/redbox-core/src/services/BrandingService.ts):
  draft and retained-version preview creation, fetch, and deletion.
- [IntegrationNotificationService](../../../packages/redbox-core/src/services/IntegrationNotificationService.ts):
  JSON objects with ISO date strings and null cache writes.
- [Bootstrap](../../../packages/redbox-core/src/bootstrap.ts) and
  [generated bootstrap runtime](../../../packages/redbox-core/src/loader/bootstrapShimRuntime.ts):
  `preLiftSetup` invokes service initialization before migrations and core bootstrap.
- [Loader](../../../packages/redbox-core/src/loader/index.ts): hook-registered
  models replace core definitions rather than merely adding callbacks.

Current compiler settings already use NodeNext module/module resolution in root
and core. TypeScript is pinned to 5.9.3. The main Dockerfile currently uses Node
26.11.1; some integration infrastructure uses Node 24. Test the actual supported
build/runtime matrix rather than assuming the project still runs only Node 24.

### Behavior that remains unchanged

1. `CacheService.get()` returns an Observable. A missing entry returns null.
   Truthy memory hits avoid persistence; falsy values currently trigger a
   persistence lookup. Preserve that behavior.
2. Persisted age is based on numeric epoch-second `ts_added` and global
   `custom_cache.cacheExpiry`, with expiry when age is strictly greater than
   that value. Per-call `set()` expiry affects memory only.
3. A database hit repopulates memory with the default local TTL rather than
   remaining lifetime. Expired ordinary cache documents remain stored.
4. `set()` returns void, writes memory first, then performs a best-effort
   asynchronous find followed by update or create. Persistence errors are
   logged. Do not replace this with upsert, retries, serialization of writes,
   or an awaited durability guarantee.
5. Persisted null and missing `data` read as null through the service. Other
   supported JSON primitives retain their values. Integration-notification
   null writes with expiry zero retain their current behavior.
6. Branding previews use their own TTL, default 300 seconds. Expired previews
   are deleted before reporting expiry; valid previews are deleted after
   lookup. Keep existing service/API errors and brand scoping. Read/delete
   remains non-atomic; describe it as delete-after-read, not an atomic consume.
7. Existing find/create races may yield duplicate-name errors under competing
   writes. Tests must establish interoperability and index enforcement without
   promising that every concurrent `set()` succeeds or that write order improves.

Record changes to these behaviors as separate follow-up issues.

## 4. Architecture decision: Prisma behind a narrow repository

### Decision and alternatives

Target Prisma 8 for the cache adapter, contingent on real compatibility evidence.
The interface belongs to ReDBox; adapters own ORM and driver details.

The implementation ADR must compare at least these alternatives:

- **Prisma 8:** the selected evaluation target, with contract artifacts and a
  MongoDB runtime. Its package maturity, physical data mapping, compiled-package
  behavior, and operational cost require proof.
- **MikroORM:** assess MongoDB support, existing-document mapping, CommonJS and
  packaging requirements, hook migration cost, and prospective PostgreSQL work
  against the same needs. Do not claim the pilot has benchmarked it.
- **Waterline behind the repository:** a useful baseline and development bridge,
  but not the agreed official v6 cache backend.
- **Direct MongoDB driver:** a baseline for native MongoDB dependencies and the
  cost of keeping application persistence tied directly to driver APIs.

The reason to introduce the boundary is independent of the selected ORM:
services should express cache operations and business behavior without
Waterline globals or Prisma types. No repository factory for arbitrary models,
unit-of-work abstraction, plugin registry, or generic query DSL is required.

### Proposed code organization

Add a small `packages/redbox-core/src/persistence/` subtree containing:

- `cache/CacheEntryRepository.ts`: plain types and repository interface.
- `cache/PrismaCacheEntryRepository.ts`: Prisma-only mapping and queries.
- `cache/WaterlineCacheEntryRepository.ts`: temporary loaded-model adapter.
- `prisma/`: TypeScript contract source and generated contract artifacts.
- A runtime/composition module responsible for configuration, initialization,
  repository access, and cleanup.

Exact filenames may follow nearby conventions; preserve the separation of
domain-facing types, adapters, and Sails integration. Export the interface and
intended hook migration seam through core's supported package exports. Keep
client/contract internals private where possible.

### Repository contract

The following is a proposed application contract, not Prisma API syntax:

```typescript
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface CacheEntryRecord {
  id: string;
  name: string;
  data?: JsonValue;
  ts_added: number;
  createdAt?: string;
  updatedAt?: string;
}

interface CacheEntryWrite {
  name: string;
  data?: JsonValue;
  ts_added: number;
}

interface CacheEntryRepository {
  findByName(name: string): Promise<CacheEntryRecord | null>;
  create(entry: CacheEntryWrite): Promise<void>;
  updateByName(name: string, entry: CacheEntryWrite): Promise<void>;
  deleteById(id: string): Promise<void>;
}
```

Use an existing suitable JSON type if available. Numbers must be finite and
objects/arrays must contain only JSON-compatible values. Reject unsupported
values rather than silently serializing Dates, Buffers, BSON values, BigInts,
functions, cycles, or undefined members. An absent top-level optional `data`
field is supported; it is distinct from an arbitrary undefined nested value.

Keep the public `CacheService.set(name, data: unknown, expiry?)` signature during
this pilot. Validate the persistence input within its asynchronous error path,
so invalid persisted values follow existing logging behavior after the local
cache operation. Branding awaits repository writes and retains its existing
failure propagation. Richer institution values require explicit hook migration.

Reads return plain data, string IDs, and no BSON, ORM instances, query builders,
or lazy relations. Missing legacy `data` may normalize to null on read where the
driver cannot distinguish missing from null; this must not rewrite stored
documents or change service output. Physical omission/null handling on writes
must be established by the compatibility spike and tested explicitly.

`updateByName` does not insert a missing row; deletion of a missing ID is a
no-op. Preserve existing caller behavior for concurrent deletion. Names are
unique in an activated Prisma deployment, so update cardinality is at most one.
For the transitional Waterline adapter, preserve the loaded model's update
behavior rather than imposing a different query on customized models.

Repository failures reject promises. Normalize only error categories callers
actually need, such as duplicate name or invalid persisted value, into small
ReDBox errors. Retain the underlying cause for internal diagnostics; do not
expose Prisma error codes as the service contract or invent a broad error
framework. Service/API-visible error behavior remains unchanged.

## 5. MongoDB mapping and compatibility proof

Use the existing physical `cacheentry` collection. Verify actual collection
names and representative raw documents instead of relying on class names.

The compatibility spike must establish:

- Physical `_id` BSON type and string-facing ID round trips, including reads,
  updates and deletion in both adapter directions.
- Required/optional fields; JSON object, array, primitive, null, and missing
  values; unrelated legacy fields left untouched by updates.
- Numeric epoch-second `ts_added` and the actual physical representation of
  `createdAt`/`updatedAt`. Preserve Waterline-compatible string timestamp
  representations and automatic create/update behavior; do not use Prisma
  DateTime defaults that introduce BSON dates.
- Existing unique-name index shape, collation, and error behavior.
- Prisma writes read by Waterline, including the designated development
  rollback release, and Waterline writes read by Prisma.

Use real MongoDB and raw-document assertions. Passing service tests alone is
insufficient: both adapters could return equivalent values while storing an
incompatible representation. Never rewrite all documents to make tests pass.
Unexpected legacy BSON-bearing cache values must be reported for explicit
institution migration; do not silently coerce or erase them.

### Unique-name preflight

Treat `unique: true` in the Waterline model as intent, not proof of a deployed
index. Safe migration mode does not establish that every institution has it.

Provide an explicit preflight/index procedure that reports duplicate names and
verifies the required unique index. Index creation must be scoped, idempotent,
and explicitly invoked as a deployment/migration step, not a hidden side effect
of arbitrary repository imports. Handle an existing compatible index without
recreating it. Report conflicting definitions or duplicates for remediation.
Account for concurrent writes between inspection and index creation: successful
index creation/verification is the authority, not the earlier duplicate scan.

Prisma startup verifies prerequisites and refuses readiness if the required
index is absent or incompatible. It must not delete duplicate data, run a
database-wide schema push, or silently choose Waterline. During `next`, an
operator can explicitly retain/select Waterline while resolving prerequisites.
Official v6 requires remediation before startup.

## 6. Composition, connection ownership, and lifecycle

The repository interface and service-facing dependency contain no Sails globals.
The composition layer reads effective Sails configuration after model loading
and supplies the chosen repository lazily to consumers. A getter or a small
constructor dependency is sufficient; do not add a dependency-injection framework.

During `next`, introduce typed `persistence.cache.backend: 'prisma' | 'waterline'`.
Initially default to Waterline; promote Prisma only after the development gates.
Reject unknown values. Do not select a backend by detecting hook registration.
Official v6 removes this setting and rejects explicitly supplied obsolete
backend configuration with migration guidance rather than ignoring it.

Resolve the effective application datastore from existing application/model
configuration. Preserve authentication, TLS, URI options, and database selection
without inventing a second competing connection URL. Never accidentally use
`redboxStorage` simply because it also points to MongoDB. Customized Waterline
models can change collection, datastore, attributes, callbacks, or primary key;
they require explicit review before Prisma activation.

Ownership rules:

- Waterline owns its connection. Its adapter uses the loaded runtime model and
  does not create or close a second Waterline connection.
- The persistence runtime owns the Prisma client and any driver resources it
  creates. Use one runtime/client per application instance, not per operation.
- Importing core, constructing service exports, and generating/loading shims
  must not open connections. Resolving a dependency before initialization must
  fail clearly rather than opening an implicit untracked connection.
- Initialization and cleanup must be safe against repeated invocation. Close
  partially acquired resources on failed initialization and all owned resources
  after failures later in startup. Preserve the original startup error if
  cleanup also fails.
- Register normal Sails shutdown cleanup; close only owned resources. Test the
  supported graceful shutdown/failure paths rather than assuming signal handling
  covers every bootstrap failure.

Initialization must finish **before the service `init()` loop inside
`preLiftSetup`**, and therefore before migrations, core bootstrap and hook
bootstraps. Adding it only at the start of `coreBootstrap` is too late. Integrate
the generated-bootstrap failure wrapper with cleanup so errors from service
initialization, migrations, and later bootstraps release Prisma resources.
Report initialization failures and fail startup; no automatic backend fallback.

## 7. Service and hook integration

`CacheService` keeps NodeCache, its exported methods, Observable reads and void
writes. Replace only model access with repository calls, preserving RxJS timing
and error propagation. Regression tests must distinguish durable completion
from the return of a best-effort `set()`.

`BrandingService` uses the same repository for both preview creation paths,
lookup, expired deletion and successful deletion. Keep its independent TTL and
existing controller/API behavior. No new endpoint or Angular feature is required.

During development, retain the Waterline model, generated shim, and registration
contract. The Waterline adapter resolves the actual loaded model; it must honor
an overridden collection/datastore/callback rather than reconstructing the core
model. The Prisma adapter intentionally does not execute Waterline callbacks.

Before official v6, publish the repository seam and examples for hooks that
previously called `CacheEntry` directly or overrode its definition. Require
explicit review and migration; do not claim that preserving model registration
preserves Prisma behavior. Once the adapter is retired, eliminate core cache
model queries and migrate/remove obsolete cache-only model/shim exports as
appropriate. Keeping general Waterline registration for other models does not
provide a supported v6 cache fallback. Tests must prove the final release uses
only the Prisma cache path.

## 8. Contracts, builds, and package artifacts

Use Prisma 8's TypeScript contract builder for this pilot. Keep contract source
small and limited to the collection in scope. Emit and package the runtime
contract and its declaration artifacts (`contract.json` and `contract.d.ts` as
documented for the chosen version). Pin CLI and MongoDB runtime packages to
independently tested exact versions; they do not need matching version numbers.
Update applicable lockfiles and avoid semver ranges.

Establish one deterministic generation entry point used by all core compilation
paths. Root `compile:core`, `compile:core:prod`, package `build`, and the Dockerfile
currently have paths that invoke `tsc` directly; wiring only `prebuild` misses
some of them. Audit development scripts and CI for equivalent bypasses.

Generate before consumers need declaration artifacts, and copy runtime artifacts
into `dist` after any build step that cleans it. Never open a database during
generation. Runtime paths must resolve relative to the installed module, not
the checkout's current working directory.

Commit deterministic emitted artifacts alongside contract source and verify
freshness by regeneration into a temporary directory and comparison. If the
chosen tool emits unstable metadata, remove/configure that nondeterminism before
using the check. A stale artifact must fail CI even if compilation otherwise
succeeds. Packaged execution must succeed from a clean package installation
without source files, repository paths, the generation CLI, or a live build-time
database. The runtime and all required artifact files must survive production
dependency pruning and Docker stage copies.

Retain existing CommonJS runtime semantics. The compatibility spike decides
whether any additional compiler changes are needed; broad module migration
requires a separate decision.

## 9. Infrastructure and institution migration

Require MongoDB 8+ and select a tested, supported, reproducibly pinned image
version/digest at implementation time. Do not assume an existing digest tagged
`latest` satisfies the minimum. The inventory must include root development and
integration Compose files, Playwright's MongoDB 7 image, PDF generation
development/Bruno files, and generated hook-archetype templates.

The upgrade affects more than cache persistence when application data, sessions,
queues, GridFS, and record storage share a MongoDB deployment. Validate those
users against the chosen MongoDB version even though their persistence adapters
are not migrated. Do not add a replica-set requirement without an actual feature
dependency; test the selected Prisma version against the supported topology.

Publish a version-specific operator runbook covering:

1. Inventory databases, server/topology versions, storage/users, hook overrides,
   direct model calls, and supported cache value shapes.
2. Back up affected data/configuration and verify a restoration rehearsal.
3. Follow MongoDB's supported upgrade sequence and feature compatibility version
   procedure for the institution's starting version. Upgrading to 8 is not
   always a one-step image substitution.
4. Validate Waterline and other shared-database consumers on the upgraded server.
5. Audit/remediate duplicate names and legacy unsupported cache values explicitly;
   establish the unique index and verify Prisma prerequisites.
6. Migrate institution hooks, install packaged application artifacts, and run
   startup, cache, notification and branding smoke checks before readiness.
7. Remove temporary backend configuration before installing official v6.

During `next`, verify explicit configuration rollback and redeployment of the
designated previous development release on the same MongoDB 8 data. Document the
exact tested release. Database-engine downgrade is a separate operational matter,
not a consequence of changing an application backend setting.

For official v6, publish migration and recovery instructions instead of promising
in-place v5 rollback. Recovery follows the rehearsed backup/restoration procedure
and institution deployment plan. No bulk cache rewrite or cache flush is assumed
by this milestone; do not classify notification cache entries as disposable
without a separate decision.

## 10. Validation and acceptance

### Required development evidence

- A real-Mongo repository contract suite passes against both adapters, including
  JSON values, null/missing fields, ID and timestamp mappings, updates, deletion,
  duplicate-name failures, and update/delete misses.
- Raw stored documents retain compatibility. Both write/read directions and
  mixed concurrent instances pass on the same collection. Competing creates
  enforce uniqueness; read/update/delete races retain documented semantics.
- Service tests cover memory hits/misses, falsy values, persistence hits,
  expiry boundaries, best-effort errors and notification null/reset behavior.
- Restart tests await/observe actual persistence before stopping one application
  process and reading from another. Do not mistake a memory hit for persistence.
- Branding service, API and browser regressions cover both preview types,
  valid/expired/missing tokens, deletion, scope and error behavior.
- Startup tests cover invalid config, credentials/unreachable database, missing
  index, partial initialization and later bootstrap failures. Shutdown leaves
  no owned Prisma/driver resources. Shims load without opening connections.
- Clean package and Docker execution prove contract generation/copying,
  declaration resolution and CommonJS behavior. Stale artifacts fail CI.
- Explicit hook fallback and previous-development-release rollback pass during
  the transition; final-v6 tests cover their removal.

### Bounded operational comparison

No existing cache performance harness was identified. Run a bounded development
comparison with the same MongoDB, dataset, application instance count, hardware
limits and workload for each adapter. Include cache hits, database reads,
best-effort writes and branding preview creation/fetch. Record warm-up, duration,
payload sizes, concurrency and error counts so the results are interpretable.

Measure latency distributions (including tail latency), throughput, startup
time, memory and connection usage. Since `set()` returns before persistence,
measure persistence completion separately from method-return time. Include the
remaining Waterline connections when assessing total Prisma-enabled usage.

Investigate material regressions and record the promotion decision with the
results. No new connection-limit failures, startup failures, or sustained memory
growth is acceptable. Do not create a permanent dual-backend benchmark system
or invent numeric thresholds without a representative baseline.

### Official v6 release acceptance

All development evidence must be recorded before removing the transition path.
The supported stable MongoDB runtime/tooling gate must pass, institution
migration and recovery docs must be published, and final package/integration/API/
browser tests must pass with Prisma as the only cache backend. Remove the
Waterline cache implementation and selector; retain useful Prisma and service
regressions and archive development comparison/rollback evidence.

## 11. Risks and evidence-driven stop conditions

- **Runtime remains experimental:** blocks official v6 under the agreed scope;
  requires an explicit scope/date decision.
- **Stored representation cannot be preserved:** stop promotion and revisit
  the adapter/ORM decision; do not smuggle in a bulk data migration.
- **Build requires broad module conversion:** bring a separate design decision
  before expanding the pilot.
- **Hook customization bypasses the boundary:** institution migration is
  required; temporary Waterline selection is only a development bridge.
- **Operational regressions or leaked resources:** resolve or reject promotion.
- **Shared MongoDB upgrade breaks another subsystem:** treat infrastructure
  readiness as blocked even if the cache adapter passes its own tests.
- **Cache success is overgeneralized:** users/relationships, transactions,
  reference/configuration models, and record storage need independent decisions.

Future PostgreSQL work includes physical types and IDs, collection/table mapping,
unique/index behavior, timestamp handling, relational modeling, transactions,
data migration and native MongoDB dependencies. A database-independent interface
preserves an option; it does not make existing MongoDB data or semantics portable.

## 12. Reference material

Repository guidance takes precedence over legacy `support/docs` material:

- [Architecture overview](../../wiki/Architecture-Overview.md)
- [Services architecture](../../wiki/Services-Architecture.md)
- [Loader](../../wiki/Redbox-Loader.md)
- [Coding standards](../../wiki/Coding-Standards-and-Conventions.md)
- [Automated tests](../../wiki/ReDBox-Automated-Tests.md)
- [Configuration](../../wiki/Configuration-Guide.md)
- [Installation](../../wiki/Installation-Guide.md)
- [Data migrations](../../wiki/Data-Migrations.md)

Upstream references checked during design review; recheck against the exact
versions selected for implementation because Prisma 8 is evolving:

- [Prisma release status](https://www.prisma.io/docs/orm/release-status)
- [Supported databases and MongoDB runtime maturity](https://www.prisma.io/docs/orm/supported-databases)
- [MongoDB prerequisites](https://www.prisma.io/docs/prisma-orm/quickstart/existing-app/mongodb#prerequisites)
- [CommonJS guidance](https://www.prisma.io/docs/cli/orm-init#in-a-commonjs-project)
- [TypeScript contract builder](https://www.prisma.io/docs/orm/contract-authoring/typescript-schema-builder)
- [Existing MongoDB application](https://www.prisma.io/docs/prisma-orm/add-to-existing-project/mongodb)
- [MongoDB data modeling](https://www.prisma.io/docs/orm/data-modeling/mongodb)
