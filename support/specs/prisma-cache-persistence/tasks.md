# Prisma cache persistence task list

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

All tasks start unchecked. The [design](design.md) is the behavioral contract;
the [implementation plan](implementation_plan.md) defines dependencies and gates.
Check off a task only when its acceptance evidence exists. Gate evidence should
identify the implementation commit and exact tested dependency/environment versions.

## P0 — Inventory and decision record

Evidence and acceptance review: [P0 validation](p0-validation.md). This completes
discovery for the checked-in code and tested defaults; Prisma suitability and
later release gates remain unproven. The unresolved core baseline timeout is
recorded there.

- [x] **P0.1** Inventory Waterline models, relationships, callbacks, hook overrides
      and direct MongoDB/model use. Separate application persistence, record storage,
      GridFS, sessions and queues; identify shared database deployments.
- [x] **P0.2** Enumerate every core CacheEntry consumer and institution extension
      point; identify direct calls, overridden schema/datastore/collection/ID behavior
      and cache values outside JSON.
- [x] **P0.3** Capture sanitized raw Waterline fixtures for IDs, all timestamps,
      object/array/primitive/null/missing data and indexes from real MongoDB.
- [x] **P0.4** Characterize CacheService TTL/falsy-value behavior, memory-first
      asynchronous writes, logging, notification reset behavior and preview expiry/
      deletion/errors. Record deferred behavior fixes separately.
- [x] **P0.5** Record the actual Node/TypeScript/CommonJS/build matrix, MongoDB
      image versions, Prisma candidates and designated rollback development release.
- [x] **P0.6** Write the ADR comparing Prisma, MikroORM, Waterline and direct
      MongoDB against compatibility, operational and future PostgreSQL needs.
- [x] **P0 gate** Review the inventory, baseline results, ADR and fixtures before
      treating physical representation or ORM suitability as established.

## P1 — Prisma compatibility spike

Depends on P0.

Evidence and acceptance decision: [P1 validation / G1](p1-validation.md).
G1 passes for bounded development adoption; RC/early-access maturity and later
release/deployment gates remain explicitly unqualified.

- [x] **P1.1** Select and pin exact, independently versioned Prisma CLI and MongoDB
      runtime candidates; record separate maturity/support status and lockfile changes.
- [x] **P1.2** Build the minimal TypeScript cache contract and emit JSON/declaration
      artifacts without a live database or schema synchronization.
- [x] **P1.3** Prove Waterline-write/Prisma-read/update/delete and the reverse on
      real MongoDB 8, inspecting raw documents after each direction.
- [x] **P1.4** Prove physical ID round trips, string timestamps, numeric epoch
      seconds, optional/null/JSON values and preservation of unrelated fields.
- [x] **P1.5** Probe unsupported BSON values and duplicate-name errors; document
      explicit blockers without rewriting or silently coercing stored data.
- [x] **P1.6** Compile and execute using existing NodeNext/CommonJS conventions;
      verify core imports, generated shims and a clean installed package fixture.
- [x] **P1.7** Exercise supported Node versions, the selected MongoDB topology and
      Docker packaging. Document any bounded compiler adjustments.
- [x] **G1** Record feasibility evidence, or stop Prisma adoption and revisit the
      decision if it requires bulk rewrites or broad module conversion.

## P2 — Repository and Waterline baseline

Depends on G1 for proven mapping choices.

Evidence and acceptance decision: [P2 validation / G2](p2-validation.md).
G2 passes with Waterline through the repository. The final full core run,
characterization/controller checks, real-Mongo override tests and isolated portal
integration tests pass; the pre-existing timing-sensitive startup timeout is
recorded in the evidence, including its pass in the final run.

- [x] **P2.1** Add plain JSON/cache types and find-by-name, create, update-by-name,
      delete-by-ID operations. Specify misses, error propagation and string IDs.
- [x] **P2.2** Add strict JSON persistence validation with missing top-level data
      support; reject richer values without automatic serialization/coercion.
- [x] **P2.3** Implement the temporary Waterline adapter using the loaded model,
      preserving hook overrides and leaving connection ownership with Waterline.
- [x] **P2.4** Add lazy service dependency access and intended package exports;
      prove imports, export inspection and shim generation open no connections.
- [x] **P2.5** Migrate CacheService reads/writes without changing its public API,
      RxJS behavior, expiry quirks, write durability, races or error handling.
- [x] **P2.6** Migrate draft/version preview creation, lookup and valid/expired
      deletion in BrandingService, preserving errors and non-atomic read/delete.
- [x] **P2.7** Update service test doubles at the repository seam and check all
      core CacheEntry references; classify intentional transitional references.
- [x] **G2** Pass characterization and existing service/API regressions through
      Waterline; ensure ORM/driver types do not escape the boundary.

## P3 — Prisma runtime, configuration and lifecycle

Depends on G1 and the repository contract; keep Waterline default initially.

Evidence and acceptance decision: [P3 validation / G3](p3-validation.md).
G3 passes for explicit Prisma opt-in on the recorded development matrix;
Waterline remains the default. Build/package/infrastructure qualification and
the full interoperability/promotion evidence remain P4/P5.

- [x] **P3.1** Implement the Prisma adapter with proven physical mappings,
      timestamp behavior, misses and duplicate errors; do not introduce upsert/retries.
- [x] **P3.2** Add typed temporary `persistence.cache.backend` configuration,
      initially defaulting to Waterline; reject unknown values without fallback.
- [x] **P3.3** Resolve the effective application datastore, database and URI
      options/credentials; distinguish it from record storage and avoid duplicate URLs.
- [x] **P3.4** Implement duplicate/index inspection and explicitly invoked
      idempotent unique-index creation; detect conflicting indexes and concurrent
      writes without automatic document cleanup.
- [x] **P3.5** Verify Prisma prerequisites/index at startup and block readiness
      with safe actionable errors if validation fails.
- [x] **P3.6** Initialize persistence before the service init loop in preLiftSetup
      and before migrations; keep repository access before initialization explicit.
- [x] **P3.7** Clean up partial initialization and failures during service init,
      migrations, core/hook bootstrap; preserve the original failure if cleanup fails.
- [x] **P3.8** Wire normal shutdown cleanup, make it repeat-safe and prove it
      closes only owned Prisma/driver connections.
- [x] **P3.9** Test invalid config, unavailable DB, authentication failure,
      missing/conflicting index, duplicate data and repeated startup/cleanup.
- [x] **G3** Pass opt-in Prisma tests and lifecycle checks; demonstrate there is
      no silent backend switch on any initialization/runtime failure.

## P4 — Build artifacts and MongoDB infrastructure

Depends on G1; can overlap P2/P3. Evidence: [P4 validation](p4-validation.md).

- [x] **P4.1** Add deterministic contract generation and commit emitted artifacts;
      add regeneration/comparison that fails on stale or missing outputs.
- [x] **P4.2** Integrate generation/copying into core build, root compile:core,
      compile:core:prod, aggregate/development scripts and Docker's direct tsc path.
- [x] **P4.3** Audit CI and alternative build entry points for generation bypasses
      and order generation/copying correctly around dist cleanup.
- [x] **P4.4** Include contracts and declarations in dist/package files; resolve
      artifact paths from the installed module rather than the working directory.
- [x] **P4.5** Test a clean packed installation and Docker runtime after dependency
      pruning, without contract sources, the generation CLI or build-time DB access.
- [x] **P4.6** Select reproducibly pinned supported MongoDB 8+ test/dev images;
      update Playwright, root Compose, PDFgen and hook-archetype templates as needed.
- [x] **P4.7** Verify actual server versions for digest-pinned latest images and
      validate the supported MongoDB topology without an unjustified replica-set rule.
- [x] **P4.8** Smoke-test remaining Waterline domains, sessions, queues, GridFS and
      record storage against upgraded shared MongoDB deployments as applicable.
- [x] **G4** Pass clean builds, stale-artifact failure test, packed/Docker runtime
      tests and infrastructure compatibility checks.

## P5 — Transitional evidence and default promotion

Depends on G2–G4. Evidence: [P5 validation / G5](p5-validation.md).
Default promotion is the separate commit `210adbdc4`.

- [x] **P5.1** Run one real-Mongo repository contract suite against both adapters:
      JSON variants, missing/null, IDs, timestamps, updates/misses, deletion/misses,
      duplicate names and raw representation assertions.
- [x] **P5.2** Test sequential adapter switching and concurrent mixed instances
      on one collection, including competing names, updates, expiry and deletion.
- [x] **P5.3** Test restart persistence using separate application instances after
      observing completed persistence, rather than relying on set() return time.
- [x] **P5.4** Cover cache misses, memory/database hits, falsy/null values, exact
      expiry boundaries, best-effort errors and notification reset semantics.
- [x] **P5.5** Exercise branding draft/version previews, missing/expired/valid
      tokens, deletion, brand scope and unchanged API errors with Prisma enabled.
- [x] **P5.6** Verify explicit Waterline selection with hook model overrides;
      document that Prisma does not execute those callbacks/customizations.
- [x] **P5.7** Rehearse config rollback and redeployment of the designated previous
      development release against Prisma-written data on unchanged MongoDB 8.
- [x] **P5.8** Run relevant core, Docker Mocha, Bruno branding and browser checks;
      record the active backend explicitly in all transitional test runs.
- [x] **P5.9** Run the bounded operational comparison; record workload/environment,
      latency/throughput/errors, persistence completion, startup, memory and total
      connections. Investigate material regressions without adding a permanent suite.
- [x] **G5** Record promotion evidence and resolve blockers; change the next
      default to Prisma in a separate reviewable change, retaining temporary explicit
      Waterline selection and published development rollback instructions.

## P6 — Institution migration and recovery

Evidence and bounded institution-readiness decision: [P6 validation / G6](p6-validation.md).
The representative migration and both checkpoint restores pass. Stable tooling/
MongoDB runtime and final sole-backend v6 qualification remain P7 gates.

- [x] **P6.1** Publish wiki architecture/configuration/build guidance and link it
      from relevant wiki entry points; distinguish next transition from official v6.
- [x] **P6.2** Document the repository seam and hook migration examples for direct
      model queries, callbacks, altered datastore/collection/IDs and richer values.
- [x] **P6.3** Publish MongoDB upgrade/FCV prerequisites, shared-subsystem checks,
      duplicate remediation/index steps and explicit application readiness checks.
- [x] **P6.4** Document and rehearse backups/restoration; distinguish development
      app rollback, official v6 recovery and database-engine downgrade limitations.
- [x] **P6.5** Rehearse a representative institution migration with existing data
      and hooks, without assuming a cache flush, bulk rewrite or silent conversion.
- [x] **G6** Record rehearsal results and publish the official v6 migration and
      recovery instructions, including removal of temporary backend configuration.

## P7 — Retire Waterline cache support and qualify v6

Depends on C2, the revised supported official-driver release matrix and final
bridge/model/selector retirement. [P7 status](p7-status.md) defines the current
gate. C2 next qualification/promotion/Prisma removal do not pass official-v6 G7.

- **P7.1 — SUPERSEDED:** the Prisma-specific stable CLI/MongoDB-runtime upgrade
  task is retired by accepted ADR0003 and the driver-cache decision. Replace its
  release prerequisite with the supported exact official-driver/Node/Mongo/FCV,
  auth/TLS/SRV, package/image and institution recovery matrix in P7 status.
- [ ] **P7.2** Remove the remaining Waterline cache adapter and backend selector;
  reject explicitly supplied obsolete configuration with migration guidance.
- [ ] **P7.3** Remove/migrate obsolete cache-only model/shim exposure and core
  global-model references while retaining Waterline for unmigrated domains.
- [ ] **P7.4** Remove the remaining transition-only adapter tests/jobs; retain
  useful driver, service, raw-fixture, package and lifecycle coverage. C2 archived
  Prisma-only suites/comparisons; the Waterline transition still remains.
- [ ] **P7.5** Run final core, Docker Mocha/Bruno, branding API/browser, clean
  packages/production images and deployment checks with the driver as the sole
  cache backend.
- [ ] **P7.6** Verify institution migration/recovery docs match the final release
  behavior and no supported cache Waterline fallback/backend configuration remains.
- [ ] **G7** Record explicit official-v6 acceptance against the revised gate,
  including the remaining release/security/institution decisions. Reconsider
  scope/date if release support or any readiness gate fails.

## Deferred work to record, not implement in this pilot

Recorded, without implementation: [deferred-work records](deferred-work.md).

- [x] Record separate decisions for reference/configuration models, then users
      and relationships, then record storage and remaining native MongoDB consumers.
- [x] Record PostgreSQL implementation/data-migration limitations rather than
      treating the interface as proof of portability.
- [x] Record potential cache TTL/falsy-value/durability/race improvements and
      atomic branding preview consumption as independent behavior changes.
