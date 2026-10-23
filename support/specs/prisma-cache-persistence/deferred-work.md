# Deferred work after the cache persistence pilot

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

Recorded **2026-10-19** against P0–P6, through `ff039a667`.
These records complete the three recording tasks in [tasks.md](tasks.md); they
do not authorize or implement another migration or behavior change. The
[design exclusions](design.md#2-scope-and-exclusions),
[release boundary](design.md#1-outcome-and-release-boundary),
[ADR](adr/0001-cache-repository-and-prisma-evaluation.md), and
[P0 inventory](p0-inventory.md) remain the underlying decisions and evidence.

## 1. Separate decisions for subsequent migration groups

Follow the [implementation plan's ordered groups](implementation_plan.md#subsequent-migration-groups).
A successful cache pilot permits investigation of the next group, not automatic
adoption. Each group needs its own suitability evidence, hook contract, physical
mapping, data-migration assessment and PostgreSQL limitations.

### Reference and configuration models

**Decision:** investigate this group first, with a separate adoption decision.
Use the [model/callback inventory](p0-inventory.md#models-relationships-and-lifecycle-callbacks)
and [direct-consumer inventory](p0-inventory.md#direct-model-and-native-access)
to scope configuration, branding, forms/workflows, vocabulary and related models.
Prove their actual IDs, timestamps, indexes, brand scoping, relationships,
normalization/key-generation callbacks and institution model overrides rather
than generalizing from relationship-free CacheEntry. Assess native index/lease
operations alongside ordinary model calls. Do not infer that all core models
use the application datastore: the inventory identifies BrandingConfigHistory
on `redboxStorage`.

### Users, relationships and transaction-sensitive operations

**Decision:** assess this group after reference/configuration work, under its
own adoption decision. The inventory records User/Role many-to-many associations
and generated junction models, User password hashing and access-assignment
callbacks, plus application references outside declared associations. Require
relationship/cardinality and transaction/consistency evidence, explicit hook
migration and preservation of security behavior. The ADR's observed MongoDB
runtime transaction limitation must be rechecked against the versions proposed
for that work; cache CRUD evidence cannot qualify transactions or relationships.

### Record storage and remaining native MongoDB consumers

**Decision:** assess this group last and separately from application persistence.
Start with the [native-access inventory](p0-inventory.md#direct-model-and-native-access)
and [datastores/connection owners](p0-inventory.md#datastores-owners-and-shared-server-impact).
Record storage has its own datastore, revision/tombstone invariants, native
conditional operations, cursors, schema artifacts/references and indexes.
Application-native leases, job/event state and backfills also need explicit
replacement decisions. Decide independently how GridFS, sessions and queues
will persist data and own connections; moving CacheEntry does not migrate them.
Require storage/atomicity, hook and recovery evidence for those contracts. P6's
shared-client smoke and matching-engine restoration evidence is bounded
infrastructure evidence, not an authorization to migrate these domains.

## 2. PostgreSQL implementation and data-migration limitations

**Decision:** preserve PostgreSQL as a future option requiring a separate
implementation and migration plan. No PostgreSQL adapter, schema, migration tool
or PostgreSQL qualification is delivered by this pilot. The four-operation
repository returns plain values but proves only the tested MongoDB cache mapping.

Use the [ADR consequences](adr/0001-cache-repository-and-prisma-evaluation.md#consequences-and-acceptance-limits)
and [inventory's scope carried forward](p0-inventory.md#scope-carried-forward)
as the requirements baseline. Future work must establish physical ID/type and
collection/table mapping, JSON/null/missing semantics, string timestamps,
unique/index/collation behavior, relationships and transactions. It must account
for undeclared application references and native MongoDB/GridFS/session/queue
operations rather than assuming ORM support converts those contracts.

Existing data needs explicit transformation, validation, cutover and recovery
decisions, including institution hooks, custom IDs/schema and richer values.
There is no bulk cache rewrite, cache-flush shortcut or automatic BSON conversion
authorized here; notification reset state must not be presumed disposable.
The [P6 recovery evidence](p6-validation.md#independent-backuprestoration-rehearsals)
qualifies matching MongoDB checkpoints, not cross-engine data migration or a
database-engine downgrade. Assess implementation and data migration separately
for each subsequent domain group.

## 3. Independent cache and branding behavior changes

**Decision:** keep the candidates in [P0 deferred behavior](p0-deferred-behavior.md)
as the detailed follow-up record. That document already records their present
semantics and decision questions; this record does not redefine them. No external
issues have been opened by this documentation task.

Track independently:

- TTL/expiry consistency, memory rehydration lifetime, persisted per-entry TTL,
  falsy/null local-hit semantics, expired-row retention and notification resets
  (P0 items 1, 2 and 4).
- Awaited durability, failure propagation, retries/upserts and competing-write
  ordering/races (P0 item 3). Unique-index activation does not make every
  concurrent `set()` succeed.
- Atomic branding preview consumption and its API/error semantics (P0 item 5),
  separately from preview route scope and typed configuration (P0 item 6).
  Current preview consumption remains non-atomic delete-after-read.

Each proposed change needs its own behavior decision and relevant service/API
regressions, including notification/null-reset and preview error/ETag effects.
Do not enlarge the four-operation repository incidentally to implement them.
P0 item 7's strict JSON persistence boundary was implemented in the pilot;
institution-specific richer-value codecs still need explicit migration review,
not silent conversion. [P5's handoff](p5-validation.md#p6-handoff) and
[P6's P7 handoff](p6-validation.md#g6-decision-cleanup-and-p7-handoff) retain all
these behavior limits through final release qualification.
