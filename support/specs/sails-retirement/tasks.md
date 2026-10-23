# Sails retirement: v6 task list

Status: P0 SR-001–SR-004 complete; SR-005 is partial pending institution cohort
and production-source designation. Task evidence is linked below. Planning
documents were prepared on 2026-10-23; their existence is not implementation or
release evidence. Read the [design](design.md)
for behavior and the [implementation plan](implementation_plan.md) for stages.

## Working rules

- External prerequisite: integrate the Prisma implementation stack. Institutions
  upgrade from a supported production release to v6, which contains both changes.
- Keep tasks unchecked until their acceptance criteria and recorded verification
  are satisfied. Existing plain-owner persistence is a baseline capability, not
  completed application-runtime extraction.
- Dependencies below are the initial minimum. Record additional dependencies found
  in the inventory and split large tasks into reviewable slices without dropping
  acceptance criteria. Security dependencies override the suggested phase order.
- P6 authentication/CSRF and progress-socket work starts as its prerequisites
  complete and is required by affected P5 writes. Phases are delivery groups,
  not barriers that force that work to wait.
- Store evidence beside the specification under `evidence/` when implementation
  produces it. Record commit/artifact, actual host, exact versions, commands,
  counts, skips, failures and limitations. Do not create placeholder proof files.
- Use focused checks per change; use the integrated matrix at milestones and
  before release. Preserve existing test suites and add only meaningful missing
  coverage. Real-Mongo tests must actually execute; missing-environment skips do
  not prove ownership, draining or persisted behavior.
- Qualify Node 26 and MongoDB 8+; exact package/runtime pins and topologies are
  evidence, not assumptions. PostgreSQL and complete package ESM conversion are
  outside this task list's retirement critical path.

## P0 — Baseline and qualification scope

- [x] **SR-001 — Record the integrated baseline and executable Sails inventory.**

  **Status:** done; [source, surface/resource owners and generated-file evidence](evidence/p0-baseline.md#sr-001--integrated-source-and-executable-inventory).

  **Depends on:** integrated Prisma source.

  **Deliver:** commit/version manifest and classified references across core,
  app config, hooks, migrations, routes/policies, native resources, templates,
  test bootstrap, Docker and CI. Identify owners and generated versus edited files.

  **Accept/evidence:** every known runtime surface has a migration group or an
  explicit classification; source commit and reproducible inventory method are
  recorded. Historical documentation/package names are not treated as executable use.

- [x] **SR-002 — Align execution on Node 26 and audit dependency resolution.**

  **Status:** done; [exact selections, commands/results and consumer override risk](evidence/p0-execution.md).

  **Depends on:** SR-001.

  **Deliver:** consistent dev/CI/build/runtime selections and recorded Node/npm,
  compiler/test-loader and root/core/Sails/Express/Companion resolution. Check
  strip-types, ts-node and Mocha behavior under the chosen exact Node patch.

  **Accept/evidence:** focused existing build/tests execute on Node 26; pins are
  exact; incompatible consumer overrides are investigated rather than globally
  flattened. Record the reason and checks for each dependency change.

- [x] **SR-003 — Capture representative released-v5 behavior and upgrade fixtures.**

  **Status:** done; [released artifact, selected public cases and sanitized logical fixture](evidence/p0-released-v5.md).

  **Depends on:** SR-001.

  **Deliver:** selected existing API/browser cases and sanitized upgrade fixtures
  for auth, record types, records/forms/workflows and extension-sensitive behavior.
  Run the v5 artifact with its supported runtime, not an assumed Node 26 requirement.

  **Accept/evidence:** fixtures identify the released artifact and expected public
  behavior; Sails-plus-Prisma is labeled an intermediate comparison. Sensitive
  institution data remains in approved institution-owned fixtures or is sanitized.

- [x] **SR-004 — Characterize configuration, hooks and the record-type dependency graph.**

  **Status:** done; [precedence, merge/effect examples, lifecycle/cache owners and executed checks](evidence/p0-configuration.md).

  **Depends on:** SR-001.

  **Deliver:** config precedence and merge examples, imperative `mergeHookConfig`
  effects, hook priority/lookup behavior and lifecycle prerequisites. Include
  record-type schema validation, stored concurrency policy and storage capability.

  **Accept/evidence:** array, function, branded and Agenda job-name cases are
  distinguished; PDF events/shutdown and process-level instance caches have owners.

- [ ] **SR-005 — Define database qualification and the institution rehearsal cohort.**

  **Status:** partial; [exact Mongo candidates and executed foundation checks](evidence/p0-qualification.md).
  Representative institution hook/configuration and approved production upgrade
  source remain undesignated; topology and release-coverage gaps are explicit.

  **Depends on:** SR-001, SR-003.

  **Deliver:** exact qualification candidates for MongoDB 8 and the selected newer
  major/FCV, relevant topology and separate datastores; designate a representative
  institution hook/configuration and supported production upgrade source.

  **Accept/evidence:** release coverage and access gaps are explicit. A runtime
  version guard or core-only fixture is not counted as topology/institution proof.
  Engine/FCV upgrades have separate operator prerequisites.

## P1 — Runtime, persisted-module proof and early standalone host

- [ ] **SR-006 — Extract the persistence-owner interface and isolate Sails shutdown.**

  **Depends on:** SR-001, SR-004.

  **Deliver:** minimal owner typing in persistence/group runtime and a temporary
  Sails lifecycle adapter. Preserve existing pools, group state, admission,
  retained-resource cleanup retry and stale-handle behavior.

  **Accept/evidence:** existing ownership tests pass; standalone construction
  needs neither a `Sails.Application` cast nor global Sails/process handlers.

- [ ] **SR-007 — Implement application lifecycle and application-owned composition.**

  **Depends on:** SR-006.

  **Deliver:** synchronous wiring plus awaited initialization/activation/stop,
  status, resource acquisition tracking and app-owned instance/cache composition.
  Keep the interface small and factory inputs narrow.

  **Accept/evidence:** repeated/concurrent calls do not duplicate resources;
  failed cleanup remains observable/retryable; activation ordering is enforced;
  stopped instances are terminal and fresh instances restart without stale state.

- [ ] **SR-008 — Extract the record-type module behind explicit dependencies.**

  **Depends on:** SR-007, SR-004.

  **Deliver:** reference repository/config/log/capability injection, explicit
  initialization and a narrow import entrypoint. Remove inherited unawaited imports,
  global Sails/Lodash and implicit storage lookup from the migrated graph.

  **Accept/evidence:** Observable results, schema validation, cache and current
  stored-policy reads retain their behavior; converted instances leave the legacy
  module-level cache. No duplicate record-type implementation is introduced.

- [ ] **SR-009 — Prove meaningful standalone record-type behavior on real MongoDB.**

  **Depends on:** SR-002, SR-006, SR-007, SR-008.

  **Deliver:** bootstrap/create/reload/read/list/cache integration cases, schema
  failure, strict-capability rejection and disposable `bootstrapAlways` coverage.
  Add failure-cleanup, isolation, stale-handle and fresh-instance restart cases.

  **Accept/evidence:** cases actually run with MongoDB; global Sails is absent and
  the compiled import graph does not load Sails. A successful repository `get()`
  alone is not sufficient. Record how this exceeds the existing foundation fixture.

- [ ] **SR-010 — Build the minimal standalone Express 5 host early.**

  **Depends on:** SR-002, SR-007.

  **Deliver:** one server, host-owned signals, explicit test composition and
  admission/readiness integration around the runtime. Keep normal traffic closed
  through initialization and handle listener preparation/bind failures.

  **Accept/evidence:** standalone startup/inactive/activation/stop and failure
  cases pass without Sails. Partial route/module coverage is identified; the host
  does not dispatch absent routes through a legacy controller or second process.

- [ ] **SR-011 — Connect the temporary Sails comparison adapter to the same instance.**

  **Depends on:** SR-006, SR-007, SR-008.

  **Deliver:** legacy exports/bootstrap/shutdown delegate converted work to the
  same application-owned implementation. Keep unconverted caches/callbacks explicit.

  **Accept/evidence:** focused legacy-host behavior passes without duplicate
  bootstrap/clients/services. Standalone imports do not pull in this adapter;
  dual-host comparison uses separate runs and isolated fixtures.

## P2 — Async extensions and early hook conversion

- [ ] **SR-012 — Discover installed extensions and load them asynchronously.**

  **Depends on:** SR-001, SR-007.

  **Deliver:** package-export-aware resolution and awaited native imports with
  deliberate ESM/CommonJS/default normalization, separated from shim generation.

  **Accept/evidence:** installed/packed fixtures, hidden `package.json` exports,
  named/default exports, missing entrypoints and top-level await behave predictably;
  diagnostics identify the offending package without leaking secrets.

- [ ] **SR-013 — Define and resolve the neutral v6 registration contract.**

  **Depends on:** SR-012, SR-004.

  **Deliver:** versioned/documented declarations for the capabilities required
  by real hooks; preserve priority/fallback and view/asset lookup ordering.
  Resolve one set per application, with validation before acquisition.

  **Accept/evidence:** offline registration opens no database/listener; missing
  or invalid declarations and accidental route collisions fail clearly. Migration
  name order remains independent of hook load priority.

- [ ] **SR-014 — Resolve app-owned factory overrides and scoped host integrations.**

  **Depends on:** SR-013, SR-008.

  **Deliver:** resolve winning named overrides before instantiation, inject narrow
  inputs and detect duplicate/missing/cyclic prerequisites. Define tracked route,
  middleware and necessary server-resource registration.

  **Accept/evidence:** overridden core factories are not instantiated; each app
  owns one selected instance. Integrations obey admission/cleanup and do not create
  their own listener, process handlers or unrestricted default service locator.

- [ ] **SR-015 — Convert storage-hook registration and readiness.**

  **Depends on:** SR-014, SR-006.

  **Deliver:** v6 storage factory/capability/contributor/migration declarations
  over existing Prisma repositories and native byte-store owners.

  **Accept/evidence:** registration is offline; standalone composition resolves
  capability before record-type checks and preserves storage/index readiness and
  stale-handle semantics. No data relocation or new persistence abstraction.

- [ ] **SR-016 — Convert PDF-hook lifecycle before broad route migration.**

  **Depends on:** SR-014, SR-007.

  **Deliver:** explicit config contributions, factories, job declarations and
  tracked generation/retry-fiber cleanup. Replace Sails events and `lower()` patches.

  **Accept/evidence:** standalone hook composition and resource lifetime tests
  pass without Sails. Activation is registered explicitly; full backend activation
  is verified in SR-023 and HTTP/progress integration in P6.

- [ ] **SR-017 — Prove packed ESM/CommonJS hooks and offline loading.**

  **Depends on:** SR-010, SR-012, SR-015, SR-016.

  **Deliver:** clean installed fixtures with ESM-only dependency/top-level await,
  CommonJS v6 registrations, override precedence and app-owned instance isolation.

  **Accept/evidence:** production-style loading uses public exports and no source
  tree shortcut; offline inspection has no live clients/workers. Full package ESM
  conversion and unchanged v5 hook compatibility are not prerequisites.

- [ ] **SR-018 — Port development registrations and publish the initial hook scaffold.**

  **Depends on:** SR-013, SR-014.

  **Deliver:** v6 development-hook/archetype declarations and concrete before/after
  service, controller/route, config, bootstrap, migration and resource examples.

  **Accept/evidence:** scaffold output compiles against the proposed v6 contract;
  examples distinguish CommonJS format compatibility from Sails source compatibility.
  Complete generated-app packaging is subsequently qualified in SR-047/SR-053.

## P3 — Configuration, orchestration and activation

- [ ] **SR-019 — Own startup configuration resolution and finalization.**

  **Depends on:** SR-002, SR-004, SR-013.

  **Deliver:** explicit core/hook/app/environment/local/env-input/CLI precedence,
  typed validation, ordinary array replacement and declared domain merge rules.

  **Accept/evidence:** precedence/function/array/job-name fixtures pass; approved
  executable values survive without JSON cloning. No database or worker starts
  while loading config; consumers receive finalized startup slices.

- [ ] **SR-020 — Provide deployment conversion and actionable diagnostics.**

  **Depends on:** SR-019, SR-005.

  **Deliver:** retained/renamed/unsupported key mapping and concrete institution
  examples for connections, session/auth, proxy/root paths, storage and `sails_*`
  inputs. Add small deterministic conversion tooling only where useful.

  **Accept/evidence:** converted representative fixtures resolve as intended;
  unsupported meaningful keys fail before acquisition and diagnostics redact secrets.
  Do not ship a permanent general Sails configuration emulator.

- [ ] **SR-021 — Separate dynamic application settings from startup config.**

  **Depends on:** SR-019.

  **Deliver:** dynamic branding/AppConfig access and invalidation remain explicit;
  split legacy merge side effects into configuration, asset preparation, migrations/
  awaited bootstrap and factory declarations.

  **Accept/evidence:** brand changes remain visible at the intended request-time
  interface; startup consumers do not depend on later object mutation; previously
  unawaited application-data writes become tracked work.

- [ ] **SR-022 — Implement ordered initialization, migrations and bootstrap.**

  **Depends on:** SR-019, SR-014, SR-015, SR-016.

  **Deliver:** explicit persistence/module/migration/core/hook/post-bootstrap
  stages with storage/contributor/schema/dashboard prerequisites. Reuse the ledger
  and lexical migration ordering; keep comparison-only callbacks in the adapter.

  **Accept/evidence:** ordered/failing-stage cases prove required work is awaited
  once and partial acquisition is cleaned up. Migration failure/partial-write
  behavior is preserved without inventing transactional or exactly-once guarantees.

- [ ] **SR-023 — Gate queue consumers, schedules and normal submissions.**

  **Depends on:** SR-022, SR-016.

  **Deliver:** Agenda/PDF/cron and other inventoried producers declare work during
  initialization and begin normal processing only on activation. Required remote
  bootstrap imports have separate named, awaited stages.

  **Accept/evidence:** a migration/bootstrap failure cannot start ordinary work;
  processors/schedules activate once. Test activation failure and cleanup of
  participants already started without claiming rollback of emitted effects.

- [ ] **SR-024 — Preserve native-resource draining and retryable failed stops.**

  **Depends on:** SR-023, SR-006.

  **Deliver:** explicit quiesce/drain/close integration for known owners, scoped
  completion writes, configurable deadlines and host/container grace guidance.

  **Accept/evidence:** new work is denied while admitted completion proceeds;
  timeouts/failures retain ownership for retry; Prisma clients/pools stay open
  until dependent work settles. Later upload/socket owners must use this interface.

- [ ] **SR-025 — Make maintenance entrypoints standalone and inactive.**

  **Depends on:** SR-019, SR-022, SR-015.

  **Deliver:** `persistence:indexes` and inventoried maintenance consumers use
  config/registrations/selected persistence without Sails or business activation.

  **Accept/evidence:** inspect/explicit ensure/cleanup work from installed artifacts;
  imports do not activate jobs, migrations or business bootstrap unexpectedly.
  Existing index safety, exit statuses and stopped-writer guidance remain intact.

## P4 — Authenticated standalone HTTP pilot

- [ ] **SR-026 — Adapt route contracts and validation inputs.**

  **Depends on:** SR-013, SR-019.

  **Deliver:** injected route configuration and minimal HTTP input extraction
  while retaining Zod/OpenAPI and documented legacy parameter precedence.

  **Accept/evidence:** route validation/document generation pass; shared contracts
  import without Sails; public paths and relevant missing/query/body cases match
  expected results. Runtime policy execution stays separate from OpenAPI metadata.

- [ ] **SR-027 — Implement actor/brand context and effective policy ordering.**

  **Depends on:** SR-026, SR-022.

  **Deliver:** converted pilot identity/branding/portal dependencies plus route,
  controller/action/global policy resolution, boolean allow/deny and overrides.

  **Accept/evidence:** unauthenticated/unauthorized/cross-brand and overridden
  policies fail or succeed correctly using authenticated context, never trusted
  client-supplied identity. Required collaborators are standalone.

- [ ] **SR-028 — Compose per-app middleware and track request completion.**

  **Depends on:** SR-027, SR-010, SR-023, SR-024.

  **Deliver:** parser/session/Passport/log/context and error handling in explicit
  order, no process-wide middleware cache, and accepted-work lifetime propagation.

  **Accept/evidence:** parsers/loggers/session loading run once; async/Observable
  results complete once; aborts, late session writes and errors after headers retain
  correct ownership without duplicate responses or fallback dispatch.

- [ ] **SR-029 — Serve both record-type endpoints from the standalone host.**

  **Depends on:** SR-028, SR-008, SR-021.

  **Deliver:** list/get route adapters over the extracted module, preserving
  API-version/field-selection behavior, response envelopes, no-cache headers and errors.

  **Accept/evidence:** both existing URLs use real Prisma data and authenticated
  brand context. No Sails controller is called and no Express object reaches the
  domain interface. Partial-host inventory identifies unimplemented groups.

- [ ] **SR-030 — Record authenticated pilot parity and failure evidence.**

  **Depends on:** SR-029, SR-009, SR-003, SR-020, SR-011.

  **Deliver:** focused integration/API cases for valid/missing results, invalid
  input, denied access, cross-brand access and server failures on real MongoDB.

  **Accept/evidence:** expectations distinguish v5 reference, intermediate source
  and documented breaks; actual host/version is recorded. Repeat abort/session-save
  failure cases where adapter lifetime could release resources too early.

## P5 — Domain and API groups

- [ ] **SR-031 — Establish repeatable route-group acceptance and inventory updates.**

  **Depends on:** SR-030.

  **Deliver:** a small per-group checklist covering domain dependencies, factories,
  lifecycle, policy/schema contracts, hook override and Sails import removal.
  Record newly found route ordering/provider prerequisites.

  **Accept/evidence:** each remaining route has an assigned group; required CSRF,
  upload or socket prerequisites are explicit. Use existing tests with focused
  additions, not a generated parallel suite or generic framework abstraction.

- [ ] **SR-032 — Migrate configuration, forms metadata and translations.**

  **Depends on:** SR-031, SR-021; SR-039 before completing protected writes.

  **Deliver:** read then write slices, converted collaborators and dynamic-setting
  behavior. Cover slash-containing translation keys and JSON/form coercion.

  **Accept/evidence:** policy/brand isolation, metadata/results, write security,
  invalidation and representative overrides pass. Record each intentional public
  break and remove the group's obsolete globals/registrations.

- [ ] **SR-033 — Migrate reports, search, named queries and job/history reads.**

  **Depends on:** SR-031.

  **Deliver:** standalone operations and adapters preserving filters, pagination,
  projections, access rules and response formats with explicit backend collaborators.

  **Accept/evidence:** representative search/report/history requests, denials,
  malformed input and backend errors pass; relevant hooks work without Sails and
  accepted backend operations participate in shutdown ownership.

- [ ] **SR-034 — Migrate record reads and exports.**

  **Depends on:** SR-031, SR-015, SR-016.

  **Deliver:** record read/export operations, storage/template collaborators,
  actor/brand authorization, headers and streaming/result behavior.

  **Accept/evidence:** representative records, denied reads, exports, missing
  objects and aborts pass; admitted work outlives transport termination when needed.
  Record the remaining mutation/upload/progress dependencies explicitly.

- [ ] **SR-035 — Migrate record mutations and workflow operations.**

  **Depends on:** SR-034, SR-032, SR-039, SR-043; add affected provider tasks from SR-031.

  **Deliver:** create/update/delete/transition slices with validation, stored
  concurrency policy, revisions/incarnations, schema grants, audit and compensation.

  **Accept/evidence:** success, invalid/denied/stale writes and partial failures
  retain documented behavior; ETag/precondition/schema contracts pass. No hidden
  Sails service/socket dependency remains in a completed slice.

- [ ] **SR-036 — Migrate identity administration and external integration mutations.**

  **Depends on:** SR-031, SR-038, SR-039; add actual domain/provider prerequisites.

  **Deliver:** reviewed slices for account linking/disable/roles and publishing/
  integration operations, preserving authorization, audit and partial-effect rules.

  **Accept/evidence:** representative API/browser requests and external-service
  fixtures cover success/failure/retry without adding new exactly-once claims;
  ordinary external work cannot activate during failed initialization.

- [ ] **SR-037 — Close API-group overrides, dependency and route coverage.**

  **Depends on:** SR-032, SR-033, SR-034, SR-035, SR-036.

  **Deliver:** completed API manifest, representative named overrides, import
  graph checks and removal of group-specific legacy registrations/bridges.

  **Accept/evidence:** each API entry is implemented or has an intentional
  documented removal; Express 5 matching/HEAD/OPTIONS/errors/proxy cases are
  covered where relevant. Remaining browser/provider work is owned by P6 tasks.

## P6 — Browser, upload and realtime slices

- [ ] **SR-038 — Complete supported authentication and session migration.**

  **Depends on:** SR-028, SR-022.

  **Deliver:** local/bearer/JWT and supported OIDC/AAF flows, callbacks/proxy HTTPS,
  linked/disabled-user/logout/rotation behavior and explicit v6 session invalidation.

  **Accept/evidence:** authentication/account/role/audit cases pass; old sessions
  require login safely; cookie changes and socket/client consequences are documented.
  Do not require preserving Sails serialization or lose upload state implicitly.

- [ ] **SR-039 — Replace Sails CSRF and verify browser policy enforcement.**

  **Depends on:** SR-038, SR-028.

  **Deliver:** focused replacement probe, maintained exact-pinned implementation
  and token endpoint/header integration or coordinated Angular changes.

  **Accept/evidence:** valid/missing/invalid tokens, session binding, exemptions,
  cross-origin and admin/schema authorization pass. Protected P5 write groups
  cannot be completed before this behavior is available.

- [ ] **SR-040 — Port EJS pages, helpers, themes and static artifacts.**

  **Depends on:** SR-032, SR-018, SR-038.

  **Deliver:** rendering, layouts/partials/locals, translations, view/asset
  precedence, CSP nonces, branding/fonts and Angular/static delivery.

  **Accept/evidence:** visible persisted browser workflows and packaged artifact
  lookup pass under institution root/proxy URLs; cache/content-type/dotfile behavior
  is intentional. No `res.view()` or source-tree-only path is required.

- [ ] **SR-041 — Replace Skipper multipart handling with owned streaming uploads.**

  **Depends on:** SR-034, SR-035, SR-024.

  **Deliver:** focused parser selection/limits probe, exact pin, converted upload
  routes and shared Flydrive/GridFS ownership with tracked staging cleanup.

  **Accept/evidence:** field ordering, count/size limits, backpressure, validation,
  cancellation and partial/unknown storage outcomes pass. Remove `req.file()`
  consumers only after their route behavior and cleanup are proven.

- [ ] **SR-042 — Integrate tus and Companion with the standalone server.**

  **Depends on:** SR-041, SR-038, SR-034.

  **Deliver:** dedicated mounts/raw-parser exclusions, auth/callback paths,
  resumable state and tracked transfers. Audit Companion's Express/socket graph.

  **Accept/evidence:** upload authorization, reconnect/resume, proxy URLs and
  shutdown drain work; only one Companion/socket attachment exists. Dependency
  overrides are changed only with consumer-specific compatibility evidence.

- [ ] **SR-043 — Replace portal Sails sockets with direct Socket.IO.**

  **Depends on:** SR-028, SR-034, SR-023.

  **Deliver:** endpoint/room/progress integration, authenticated brand/record joins,
  reconnect behavior and conversion of inventoried virtual-request/sails.io clients.

  **Accept/evidence:** joins, denials, progress/reconnect and admitted completion
  work pass; portal and Companion sockets remain distinct and attach once each.
  Document coordinated client/protocol changes where compatibility is not retained.

- [ ] **SR-044 — Verify integrated browser/provider lifetime behavior.**

  **Depends on:** SR-038, SR-039, SR-040, SR-041, SR-042, SR-043, SR-024, SR-016.

  **Deliver:** browser/API/provider scenarios combining auth, upload, PDF/progress,
  abort/reconnect and application stop, using real persisted state and local stubs.

  **Accept/evidence:** accepted jobs/transfers/session writes drain or fail stop
  observably without premature client/pool closure; the complete browser/provider
  inventory has replacements without Sails helpers or events.

## P7 — Qualification, upgrade rehearsal and internal promotion

- [ ] **SR-045 — Execute the Node 26 and MongoDB 8+ qualification matrix.**

  **Depends on:** SR-005, SR-002, SR-025, SR-037, SR-044.

  **Deliver:** exact runtime/database/FCV/topology results covering MongoDB 8 and
  the selected newer major, relevant separate datastores and institution topology.

  **Accept/evidence:** real persistence/ownership/maintenance cases pass for each
  supported combination; unsupported combinations and engine-upgrade prerequisites
  are explicit. Runtime guard acceptance alone does not qualify a combination.

- [ ] **SR-046 — Run broad API, domain and browser regression.**

  **Depends on:** SR-003, SR-037, SR-044.

  **Deliver:** existing Mocha/Bruno/Playwright and relevant package suites over the
  integrated host, comparing representative behavior with released v5 fixtures.

  **Accept/evidence:** intentional breaks have conversions and affected consumers;
  failures/skips are reviewed, not hidden by partial-host coverage or broad mocks.
  Record counts, commands, artifacts and external-service fixture limitations.

- [ ] **SR-047 — Qualify clean package/image artifacts and operational comparisons.**

  **Depends on:** SR-017, SR-018, SR-037, SR-044, SR-045.

  **Deliver:** clean production installs/images and generated institution apps;
  verify exports, async ESM/CJS, Prisma generated/copied artifacts and EJS/Angular
  assets. Measure startup/stop/errors/connections and representative latency/memory.

  **Accept/evidence:** no source-tree or dev-dependency shortcut is needed;
  comparisons use observed baselines and recorded tolerances. Full package ESM
  conversion is not added as a promotion gate.

- [ ] **SR-048 — Publish a concrete v6 upgrade and recovery procedure.**

  **Depends on:** SR-020, SR-025, SR-038, SR-024, SR-045.

  **Deliver:** versioned artifact/config/hook preparation; maintenance/writers
  stopped; consistent backup; index inspect/reviewed ensure; one migration runner;
  bootstrap/validation/activation; forced login; partial-failure recovery.

  **Accept/evidence:** commands match implemented entrypoints and existing tooling;
  explain that migration bodies/DDL are not transactional and old-image selection
  cannot undo writes or external effects. Restore covers binaries/config/hooks too.

- [ ] **SR-049 — Rehearse a representative institution upgrade and recovery.**

  **Depends on:** SR-047, SR-048, SR-046, SR-045.

  **Deliver:** upgrade from the designated supported production artifact with
  converted institution overrides, auth, storage and deployment settings; exercise
  the documented restoration/reconciliation route on a consistent checkpoint.

  **Accept/evidence:** institution/topology/artifact identifiers and fresh/upgrade/
  restart/stop outcomes are recorded; no interim development release is required.
  Core-only startup or database-only restoration does not complete this task.

- [ ] **SR-050 — Promote the qualified Express host as the internal v6 default.**

  **Depends on:** SR-049, SR-046, SR-047.

  **Deliver:** distinct `npm start`/Docker entrypoint promotion with one runtime,
  server and signal owner. Keep any remaining host selector development-only.

  **Accept/evidence:** promoted candidate passes startup/readiness/stop checks;
  release acceptance remains pending P8 removal and clean-artifact verification.

## P8 — Retirement and final release evidence

- [ ] **SR-051 — Retire shim generation and reconcile owned generated files.**

  **Depends on:** SR-050, SR-037, SR-018.

  **Deliver:** stop generating Sails service/controller/policy/config/bootstrap
  shims; remove exact obsolete generated output and give guidance for edited files.

  **Accept/evidence:** builds/installations no longer recreate shims; manual
  institution customizations are not indiscriminately deleted; new hook entrypoints
  use neutral registration rather than a hidden legacy generation path.

- [ ] **SR-052 — Remove executable Sails dependencies and compatibility adapters.**

  **Depends on:** SR-051, SR-044, SR-050.

  **Deliver:** remove Sails/socket hooks, globals/types/events, process patches,
  Sails-only config and obsolete runtime dependencies from all owned packages.

  **Accept/evidence:** source, built output and installed/packed dependency graphs
  have no required Sails runtime path. Historical text and framework-independent
  package names containing `sails` are classified, not renamed unnecessarily.

- [ ] **SR-053 — Finish test/deployment/maintenance and archetype retirement.**

  **Depends on:** SR-052, SR-025, SR-018.

  **Deliver:** standalone test bootstrap, no legacy host selector, aligned build/
  Docker/Compose/CI and maintenance scripts, and final generated-app templates.

  **Accept/evidence:** clean generated institution app and supported maintenance/
  test entrypoints work without Sails installed; templates do not reintroduce old
  metadata, process handlers, shims or unsupported configuration aliases.

- [ ] **SR-054 — Update authoritative wiki and generated extension references.**

  **Depends on:** SR-020, SR-018, SR-053, SR-048.

  **Deliver:** architecture/runtime, extension, services/controllers, config,
  development/testing/install and upgrade pages; classify supported interfaces and
  add validated migration examples to the generated reference inputs.

  **Accept/evidence:** documentation describes implemented behavior, links resolve,
  example/reference validation and `docs:audit` results are recorded. Update the
  doc router only where the implemented documentation structure requires it.

- [ ] **SR-055 — Qualify the final Sails-free artifact and close the inventory.**

  **Depends on:** SR-052, SR-053, SR-054, SR-049, SR-050.

  **Deliver:** rebuilt clean production artifact and final fresh/upgrade/restart/
  stop, packed-hook, bundled-hook and institution recovery checks after removal.
  Reconcile every inventory entry and publish the final limitation/evidence record.

  **Accept/evidence:** supported startup/background/HTTP/tooling/deployment paths
  need no Sails installation; both Prisma and runtime retirement are covered from
  the production baseline. Record release readiness without inventing results for
  untested combinations or treating the earlier internal promotion as final proof.

## Evidence organization and completion

Suggested evidence records are `evidence/p0-baseline.md`, `p1-runtime.md`,
`p2-extensions.md`, `p3-lifecycle-config.md`, `p4-http-pilot.md`, per-group P5/P6
records, `p7-qualification.md`, `institution-upgrade-recovery.md` and
`p8-retirement.md` under `evidence/`. Create them when real results exist and link
task IDs to their result sections. Reuse existing persistence/release evidence
only when its source/artifact and scope apply to the tested runtime.

All SR-001–SR-055 acceptance criteria are required for this retirement plan.
Completing planning documents checks none of them. If release direction later adds
PostgreSQL or changes the supported compatibility matrix, revise the relevant
design/release plan explicitly rather than silently marking these tasks complete.

Complete package ESM conversion can have its own later task list. Async loading,
v6-compatible CommonJS hooks and the packed-module cases above remain required.
