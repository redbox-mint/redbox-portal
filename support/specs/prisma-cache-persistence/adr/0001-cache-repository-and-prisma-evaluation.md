# Own the cache repository contract and evaluate Prisma 8 conditionally

Status: accepted for the repository boundary and bounded evaluation; Prisma
production suitability remains unproven. Decision date: 2026-10-19 Adelaide.

Core services currently couple cache behavior to the Waterline global, while
notification reset state and branding previews make the cache more than a pool
of disposable values. We will put the four cache operations behind a narrow
ReDBox-owned repository and evaluate Prisma 8 against the existing physical
collection and behavior. This preserves an independent service contract even if
the ORM evaluation fails, without introducing a generic ORM facade, unit of work,
query DSL or whole-database migration.

## Alternatives against the same requirements

**Prisma 8 is the selected evaluation target.** Its typed TypeScript contract
builder and emitted runtime/declaration artifacts can make the cache contract
reviewable and usable outside Sails. The exact registry candidates are CLI
8.0.0-rc.23 and MongoDB runtime @prisma/orm-mongo 8.0.0-rc.18, independently
versioned. Its current MongoDB runtime is early access; the CLI is RC. Neither
the latest npm tag nor PostgreSQL capabilities establish stable MongoDB support.
Prisma 8 MongoDB does not yet support transactions. This relationship-free pilot
needs no transaction API, but its success would not authorize users/relations or
record-storage adoption.

Compatibility cost is real: map ObjectId `_id` to string-facing IDs, preserve
automatic ISO string timestamps and numeric epoch seconds, represent missing/null
without rewriting rows, preserve unknown legacy fields on updates, and enforce
the unique-name prerequisite explicitly. P0's real Waterline fixture confirms
those requirements; it does not prove the Prisma mapping. Its ESM runtime must
work with existing CommonJS/NodeNext builds, package exports, generated shims and
clean installed artifacts without a broad module conversion. It also adds a pool
alongside the remaining Waterline/session/queue/GridFS connections. Startup,
failure cleanup, graceful shutdown and total connections need operational proof.

**MikroORM is a credible MongoDB alternative, not a benchmarked rejection.**
Current npm 7.2.5 has a MongoDB driver and Node >=22.17.0 requirement. Its documented
native ObjectId plus serialized string ID is aligned with the observed identity
representation. Collection/property mapping, native operations and explicit
index management are available; preserving the particular timestamp strings,
null/omission and update semantics still needs the same fixture spike. Its
current core/driver packages are ESM; CommonJS/NodeNext package loading and entity
discovery/metadata must be tested, not assumed easier than Prisma. An older
CommonJS-capable major is a separate version/support decision. An entity manager,
identity map and flush lifecycle add integration choices not needed by four cache
operations; returning entities to services would also violate the plain-data seam.
Waterline callbacks and replacement models would require explicit hook migration
here too. MikroORM's PostgreSQL support offers future modeling tools, not a
conversion of MongoDB documents, relationships or native consumers. P0 neither
installed it nor measured performance, packaging or transaction suitability.

**Waterline behind the repository is the baseline and development bridge.**
It reuses the loaded runtime model, configuration, hooks and existing connection,
preserving callbacks/customized collections/datastores/IDs during next development.
It has the lowest immediate compatibility cost and is the initial default.
However it retains Sails/Waterline coupling inside the adapter and does not meet
the agreed official v6 cache direction. Its safe migration mode does not establish
name uniqueness: P0 observed duplicate writes before creating an explicit unique
index. Retaining it does not avoid index/data auditing or establish PostgreSQL
portability of native application behavior.

**Direct MongoDB driver is the smallest physical mapping baseline.**
Core already depends on MongoDB 7.7.0 and uses native collections elsewhere.
An adapter could preserve ObjectId, string timestamps, $set updates and explicit
indexes directly, without ORM metadata/generation. It still needs validation,
connection ownership, failure cleanup, error normalization, hook migration and
the same service contract. It gives up Prisma's contract tooling and keeps
application persistence tied to MongoDB APIs. PostgreSQL would require another
implementation plus data migration, just as it would with an ORM. It remains a
fallback architectural choice to reconsider if the Prisma stop conditions trigger,
not an unimplemented performance claim.

## Consequences and acceptance limits

- The interface belongs to ReDBox, returns plain JSON-compatible values and
  string IDs, and exposes findByName/create/updateByName/deleteById only.
  ORM/BSON/query-builder types stay inside adapters. CacheService keeps its
  Observable get and void memory-first best-effort set; branding awaits writes
  and retains delete-after-read. Deferred fixes stay separate.
- During next, use explicit backend selection, initial Waterline default and
  institution hook review. Prisma will not execute Waterline callbacks merely
  because model registration remains. Effective loaded model customization is a
  migration concern; do not silently pick an adapter or redirect record storage.
- P1 must prove physical interoperability in both directions, CommonJS/packed
  execution and a bounded compiler/artifact change. Stop and revisit the ORM
  choice if it needs bulk rewrites or broad module migration. P3/P5 must prove
  readiness, explicit indexes, lifecycle ownership and acceptable operational cost.
- Official v6 removes the Waterline cache bridge and selector only after stable
  supported Prisma tooling **and MongoDB runtime** plus all release gates.
  The currently observed RC/early-access pair cannot satisfy that gate. If stable
  runtime support is unavailable, reconsider scope/date explicitly.
- Future PostgreSQL work needs ID/type/table mappings, indexes/collation,
  timestamps, relational/transaction design, data migration and replacements for
  native MongoDB, GridFS, sessions and queues. The repository preserves an option;
  it is not evidence of portability or suitability beyond cache.

Evidence: [inventory](../p0-inventory.md),
[characterization/raw fixtures](../p0-characterization.md),
[versions, maturity and primary sources](../p0-environment.md),
[validation](../p0-validation.md). No alternative was benchmarked in P0.
