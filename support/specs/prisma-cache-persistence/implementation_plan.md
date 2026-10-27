# Prisma cache persistence implementation plan

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

Status: planned. No implementation or compatibility proof is implied by this file.

The [design](design.md) defines the behavior and release contract. The
[task list](tasks.md) tracks execution. Changes should be delivered in reviewable
phases with evidence at each gate; implementation details may adapt to the exact
Prisma version without changing the agreed release boundary.

## Phase 0 — Inventory, ADR and acceptance fixtures

### Work

1. Inventory Waterline models, relationships, lifecycle callbacks, registration
   overrides, direct model calls, native driver access, datastores and connection
   owners. Identify application data, record storage, GridFS, sessions and queues
   separately, including shared MongoDB deployments.
2. Enumerate all cache consumers and supported hook seams. Capture current
   CacheService, notification and branding semantics as compatibility fixtures.
   Find/create races, TTL quirks and preview read/delete behavior remain intact.
3. Record an ADR comparing Prisma 8, MikroORM, retained Waterline and direct
   MongoDB access. Include PostgreSQL limitations and the independent value of
   the repository boundary. Mark the Prisma choice subject to proof.
4. Inspect representative Waterline-created raw documents and indexes on an
   isolated real database. Record physical IDs, timestamp formats, JSON/null/
   missing fields and any legacy unsupported values. Do not copy sensitive
   institution payloads into source control or logs.
5. Record actual Node/TypeScript/module/build paths, MongoDB images and exact
   Prisma CLI/runtime candidates. Define the designated previous development
   release used for rollback tests.

### Deliverables and exit gate

Inventory, ADR, sanitized fixtures, compatibility checklist, environment/version
record, and baseline test results. Existing model declarations alone do not
count as physical-schema/index evidence.

## Phase 1 — Compatibility and packaged-runtime spike

Depends on Phase 0. Keep this isolated from service behavior changes.

### Work

1. In an isolated database, define the minimal cache contract with the Prisma
   TypeScript builder and emit its artifacts. Pin independently selected exact
   CLI/runtime versions and document maturity for both.
2. Read/update/delete Waterline-created documents through Prisma. Create/update
   through Prisma and read/delete through Waterline. Inspect raw documents
   after both directions, including automatic timestamps and untouched fields.
3. Probe optional-field omission, null, JSON primitives/arrays/objects, IDs,
   numeric seconds, string timestamps, duplicate errors and unsupported BSON.
4. Compile with existing NodeNext/CommonJS conventions. Load core and generated
   shims, and install a packed core artifact into a clean fixture. Demonstrate
   artifact resolution without source-tree paths or build-time database access.
5. Exercise the actual supported Node matrix, Docker stages and MongoDB 8
   topology. Do not change the application's module type merely to make the
   spike pass.

### Exit gate G1 — Feasible adapter

Stored representations and existing consumer semantics can be preserved; packed
execution works; the required compiler change, if any, is bounded. Record exact
commands/results and unresolved limitations. If a bulk rewrite or broad module
migration is necessary, stop and bring a new decision rather than expanding
scope. The repository boundary can proceed independently if Prisma is rejected.

## Phase 2 — Repository boundary with the Waterline baseline

Depends on G1 for Prisma-specific assumptions; framework-independent interface
and characterization work may start earlier.

### Work

1. Add plain cache types and the four-operation repository interface inside
   core. Define operation misses, JSON input validation, string IDs and failure
   handling without ORM types escaping.
2. Add the transitional Waterline adapter using the actual loaded model. Test
   overridden datastore/collection/callback behavior and connection ownership.
3. Add lazy dependency access that neither imports nor shim generation can turn
   into a connection attempt. Keep repository injection small and explicit.
4. Migrate CacheService's model operations while retaining its signatures,
   memory-first writes, asynchronous error logging and expiry behavior.
5. Migrate both branding preview creation paths, lookup and deletion. Preserve
   existing API/controller results and non-atomic read/delete behavior.
6. Search for remaining core cache model calls, including migrations, test
   fixtures and generated exports; classify intentional transition-only uses.

### Exit gate G2 — Behavior-preserving boundary

Existing service/API expectations pass with Waterline through the repository.
No core business consumer requires Prisma, BSON or Waterline query types.
Characterization tests capture the behaviors intentionally left unchanged.

## Phase 3 — Prisma adapter, lifecycle and prerequisites

Depends on G1 and the repository contract. Waterline remains the default.

### Work

1. Add the Prisma adapter using the proven contract/mappings. Mirror write
   timestamps, update/delete misses and duplicate-name behavior. Avoid upsert,
   implicit retries and data coercion.
2. Add typed temporary backend configuration. Resolve the effective application
   datastore and preserve URI options/credentials without duplicating config.
   An unknown backend or unsupported configuration fails with clear guidance.
3. Add the explicit duplicate/index preflight and idempotent index operation.
   Keep writes disabled for Prisma until required index verification succeeds.
4. Initialize persistence before the service init loop in `preLiftSetup` and
   therefore before migrations. Wire cleanup through generated-bootstrap failure
   handling and normal Sails shutdown. Test failures at each subsequent stage.
5. Ensure repeated setup/cleanup is safe; distinguish owned Prisma resources
   from Waterline resources. Report safe diagnostics without connection secrets
   or persisted payloads.

### Exit gate G3 — Opt-in Prisma readiness

Prisma works through the same repository/service boundary with explicit config.
Initialization failures never fall back silently. Preflight blocks missing or
conflicting indexes/duplicates without modifying documents. Failure/shutdown
tests demonstrate owned connections are released.

## Phase 4 — Deterministic contracts and deployment integration

Can proceed alongside Phases 2–3 after G1 settles artifact requirements.

### Work

1. Add a deterministic generation entry point and freshness check. Commit
   emitted artifacts alongside their TypeScript source; compare regeneration
   into a temporary location so stale source/artifact combinations fail CI.
2. Route package `build`, root `compile:core`, `compile:core:prod`, aggregate
   compilation, development paths and Docker's direct core `tsc` invocation
   through generation/copying in the correct order. Audit CI for bypasses.
3. Include JSON/declaration artifacts in core's `dist` and npm package files.
   Verify production pruning and Docker copies leave the runtime usable without
   CLI/dev dependencies or a repository working directory.
4. Upgrade and pin MongoDB test/development images to a verified 8+ version.
   Include Playwright, PDFgen development/Bruno and hook-archetype templates;
   audit digest-pinned `latest` images by actual server version.
5. Validate shared MongoDB users and document supported upgrade/FCV and topology
   procedures. Keep database-engine downgrade distinct from app rollback.

### Exit gate G4 — Reproducible deployment

Clean local, CI, packed-package and Docker paths generate and include correct
artifacts. Stale contracts fail a deliberate CI check. Required environments run
verified MongoDB 8+, and remaining shared clients pass compatibility smoke tests.

## Phase 5 — Interoperability, regression and operational evidence

Depends on G2–G4. This is the development comparison period, not a permanent
dual-backend product requirement.

### Work

1. Run one repository contract suite against each adapter with real MongoDB.
   Add raw-document assertions rather than only comparing returned values.
2. Run sequential switching and simultaneous mixed-adapter workloads against
   the same collection. Include competing names, updates, expiry timestamps,
   deletion and index enforcement without assuming ordered best-effort writes.
3. Test application restart persistence after observing actual write completion.
   Include cache misses/hits/falsy values/expiry and notification null/reset use.
4. Run core, Docker Mocha, branding API and branding browser regressions with
   Prisma enabled. Keep hook fallback/override coverage during the transition.
5. Test explicit backend rollback and the designated previous development
   release against Prisma-written documents on unchanged MongoDB 8.
6. Run a bounded Waterline/Prisma operational comparison using a representative
   fixed workload/environment. Record latency distributions, persistence
   completion, throughput/errors, startup, memory and total connections. Review
   material regressions; resolve leaks, connection-limit and startup failures.
   Do not build a permanent benchmark product.

### Exit gate G5 — Promote Prisma on `next`

All required evidence is recorded and blockers resolved. A separate promotion
change sets the temporary selector's default to Prisma. Keep explicit Waterline
selection available only during the remainder of development. Publish hook
review requirements and development rollback instructions before promotion.

## Phase 6 — Institution migration documentation and rehearsal

Draft throughout implementation; final rehearsal follows G5.

### Work

1. Publish wiki documentation for repository usage, connection ownership,
   temporary backend selection, unsupported customizations, and the official v6
   breaking change. Link from configuration, development and installation pages.
2. Provide hook migration examples for direct model calls, callbacks, customized
   collections/datastores/IDs and non-JSON values. The interface is public; Prisma
   internals are not the required extension API.
3. Publish a version-specific MongoDB upgrade/FCV, backup/restoration, preflight,
   index-remediation and application deployment runbook. Avoid promising that a
   direct v5 rollback or MongoDB downgrade is safe.
4. Rehearse a representative institution upgrade from its documented starting
   version, including hook changes, shared database clients, existing data and
   readiness checks. Rehearse recovery independently of backend switching.

### Exit gate G6 — Institution-ready migration

Migration prerequisites, supported versions, breaking changes and recovery
procedure are published and rehearsed. No automatic data cleanup, full cache
flush, or silent custom-value conversion is needed for the tested path.

## Phase 7 — Retire the bridge and qualify official v6

Depends on C2 and the [revised driver release gate](p7-status.md). The former
Prisma-specific P7.1 stable CLI/runtime task is superseded by accepted ADR0003.

### Work

1. Qualify exact supported official-driver pins and the actual release's
   Node/npm/MongoDB/FCV/topology, credentials/TLS/SRV, hooks and installed artifacts.
   Earlier RC/spike or bounded next evidence alone is insufficient.
2. Remove `WaterlineCacheEntryRepository` and the remaining temporary cache
   selector/environment/Compose forwarding and cache-only model/shim surface.
   Reject obsolete explicit configuration with actionable migration guidance.
   Retain Waterline infrastructure for unmigrated domains.
3. Archive the remaining adapter comparison/next rollback evidence. C2 already
   archives the removed Prisma implementation; retain driver raw/repository,
   service, package, lifecycle and recovery regressions.
4. Run final sole-driver core, Docker Mocha/Bruno, API/browser, package/image,
   fresh-volume startup and institution deployment checks. Verify obsolete
   hook/model dependencies fail clearly or have been migrated.
5. Record official-v6 acceptance against release/institution recovery and
   operations budgets. Reconsider scope/date if support or readiness fails.

### Exit gate G7 — Official v6 readiness

The official driver is the sole cache backend; its supported release matrix,
final regressions and actual institution migration/recovery obligations pass.
The artifact has no supported cache backend selector or Waterline fallback.
C2 deliberately retains explicit Waterline on next, so G7 remains open.

## Validation commands and evidence handling

Use the repository scripts and [wiki testing guide](../../wiki/ReDBox-Automated-Tests.md).
The following commands exist today; add focused persistence scripts during
implementation rather than documenting imaginary commands as available:

```bash
npm run compile:core
npm --prefix packages/redbox-core run build
npm run test:core
RBPORTAL_MOCHA_TEST_PATHS=$'test/integration/services/CacheService.test.ts\ntest/integration/services/BrandingService.test.ts' npm run test:mocha:mount
npm run test:mocha:ci
npm run test:bruno
npm run test:bruno:general
npm run test:playwright:ci
```

Select relevant branding cases using supported runner options, and run required
broader release checks when assembling G7. Test configuration must explicitly
record which backend is active during the transition; a default change must not
silently stop coverage of the other adapter before retirement.

Record each gate's commit, CLI/runtime/Node/TypeScript/MongoDB versions, topology,
commands, test outcome and sanitized diagnostics in the implementation evidence.
Keep a durable summary of the temporary comparison and rollback rehearsal after
removing their runnable transition code. Do not mark tasks complete merely
because code exists without their required verification.

## Subsequent migration groups

1. Reference/configuration models.
2. Users, relationships, and transaction-sensitive operations.
3. Record storage and remaining native MongoDB dependencies, including explicit
   decisions for GridFS, sessions and queues where applicable.

Each group needs its own suitability evidence, hook contract, data migration
assessment and PostgreSQL limitations. None is authorized implicitly by cache
pilot success.
