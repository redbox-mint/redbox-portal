# Sails retirement: v6 task list

Status: **54 of 55 tasks are complete for the recorded qualification scope.**
SR-055 remains open: R21 found two new introduced P2 issues, now fixed; a
subsequent round with zero new A/P1/P2 findings is still required.
WSU is the designated institution. Its authorized released-v5 source fallback,
converted v6 hook, two-major local topology matrix, installed cutover and complete
checkpoint recovery pass. Clean final artifacts and inventory closure pass.
[WSU evidence and production-only gaps](evidence/institution-wsu.md) distinguish
faithful local equivalents from actual production deployment acceptance. Real
production credentials/infrastructure were unavailable; those additional operator
checks remain explicitly unchecked in the evidence.

**Historical P8 artifact qualification:** clean application commit `5088f4a7a`
passed 12 real npm packs/20 checks, all three immutable image/installed dependency
graphs and zero executable Sails violations. That checkpoint passed core Mocha
4498/7 unchanged pending, root 422/10 unchanged pending, full Playwright 124,
general/OIDC/S3 Bruno 329 requests/582 tests/3 assertions, native PDF 4 requests/10
tests, and the Mongo 8/9 matrix's 216 checks. Runtime-default fresh/restart/stop
and released-v5 stand-in cutover/checkpoint recovery also passed. These artifacts
qualify that exact source; subsequent fixes are absent from those images. See
[P8 evidence](evidence/p8-retirement.md#final-qualification-and-task-disposition)
and [exact artifacts/results](evidence/p8-artifacts.json).

**Latest completed qualification:** [R16](evidence/final-review-r16.md) records
runtime/test revision `4bf60062fd2a9d1cf387d3ac993cf531c1b6032b`: core 5,631
passed/7 unchanged pending; real-service core 224 passed; root 422 passed/10
unchanged pending; full Playwright 124 and harness 19 passed; dedicated retirement
browser 4 passed; general Bruno 309 requests/554 tests/3 assertions; OIDC 13/17,
S3 7/12 and PDF 4/10 requests/tests; focused Angular 135 passed. All completed gates
passed. Pending cases are separate. These current source/compiled-tree results do
not claim replacement immutable images or a repeated topology matrix. They do
not designate an institution or grant production release acceptance.

**Latest confirmation review:** [R17](evidence/final-review-r17.md) found zero
class-(A) P1/P2 issues. It changes review evidence and status text only; R16's
full qualification still applies to the unchanged runtime/test tree. Fresh
authentication recovery, late-fix regression and structural checks are recorded
separately in R17.

Review evidence: [R1](evidence/final-review-r1.md), [R2](evidence/final-review-r2.md), [R3](evidence/final-review-r3.md), [R4](evidence/final-review-r4.md),
[R5](evidence/final-review-r5.md), [R6](evidence/final-review-r6.md), [R7](evidence/final-review-r7.md), [R8](evidence/final-review-r8.md),
[R9](evidence/final-review-r9.md), [R10](evidence/final-review-r10.md), [R11](evidence/final-review-r11.md), [R12](evidence/final-review-r12.md),
[R13](evidence/final-review-r13.md), [R14](evidence/final-review-r14.md), [R15](evidence/final-review-r15.md), [R16](evidence/final-review-r16.md),
[R17](evidence/final-review-r17.md).
The [inherited-defects backlog](evidence/inherited-defects-backlog.md) records 14
unchanged groups separately from the feature gate. The formerly outstanding institution criteria are now covered by the WSU
local-equivalent qualification below; production-only access gaps remain explicit.

Read the [design](design.md) for behavior and the
[implementation plan](implementation_plan.md) for delivery stages.

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

- [x] **SR-005 — Define database qualification and the institution rehearsal cohort.**

  **Status:** done; WSU `14ab99e` is designated, with released v5.0.4 plus
  historical compatible WSU `4996206` as the demonstrated source fallback. Exact
  artifacts, configuration, Mongo 8/9 candidates/FCVs, separate stores, local
  S3/Solr/auth topology and production access/release-coverage gaps are explicit.
  [WSU designation and source reasoning](evidence/institution-wsu.md#sr-005--institution-source-decision-and-topology).
  [R19 review](evidence/final-review-r19.md) confirms this explicitly limited cohort
  and rechecks the evidence hashes after R18/R19 remediation.
  [R20](evidence/final-review-r20.md) retains this designation and verifies the
  original/R18/R19 ledgers; production-only access gaps remain unchecked.

  **Depends on:** SR-001, SR-003.

  **Deliver:** exact qualification candidates for MongoDB 8 and the selected newer
  major/FCV, relevant topology and separate datastores; designate a representative
  institution hook/configuration and supported production upgrade source.

  **Accept/evidence:** release coverage and access gaps are explicit. A runtime
  version guard or core-only fixture is not counted as topology/institution proof.
  Engine/FCV upgrades have separate operator prerequisites.

## P1 — Runtime, persisted-module proof and early standalone host

- [x] **SR-006 — Extract the persistence-owner interface and isolate Sails shutdown.**

  **Status:** done; [structural owner, adapter and real-Mongo ownership checks](evidence/p1-runtime.md#sr-006--structural-persistence-ownership-and-explicit-sails-lifecycle).

  **Depends on:** SR-001, SR-004.

  **Deliver:** minimal owner typing in persistence/group runtime and a temporary
  Sails lifecycle adapter. Preserve existing pools, group state, admission,
  retained-resource cleanup retry and stale-handle behavior.

  **Accept/evidence:** existing ownership tests pass; standalone construction
  needs neither a `Sails.Application` cast nor global Sails/process handlers.

- [x] **SR-007 — Implement application lifecycle and application-owned composition.**

  **Status:** done; [lifecycle, deadlines/retry, isolated composition and real-Mongo checks](evidence/p1-runtime.md#sr-007--application-lifecycle-and-owned-composition).

  **Depends on:** SR-006.

  **Deliver:** synchronous wiring plus awaited initialization/activation/stop,
  status, resource acquisition tracking and app-owned instance/cache composition.
  Keep the interface small and factory inputs narrow.

  **Accept/evidence:** repeated/concurrent calls do not duplicate resources;
  failed cleanup remains observable/retryable; activation ordering is enforced;
  stopped instances are terminal and fresh instances restart without stale state.

- [x] **SR-008 — Extract the record-type module behind explicit dependencies.**

  **Status:** done; [explicit RecordTypes dependencies and retained behavior](evidence/p1-runtime.md#sr-008--explicit-record-type-domain).

  **Depends on:** SR-007, SR-004.

  **Deliver:** reference repository/config/log/capability injection, explicit
  initialization and a narrow import entrypoint. Remove inherited unawaited imports,
  global Sails/Lodash and implicit storage lookup from the migrated graph.

  **Accept/evidence:** Observable results, schema validation, cache and current
  stored-policy reads retain their behavior; converted instances leave the legacy
  module-level cache. No duplicate record-type implementation is introduced.

- [x] **SR-009 — Prove meaningful standalone record-type behavior on real MongoDB.**

  **Status:** done; [real persisted domain, failures, isolation and restart](evidence/p1-runtime.md#sr-009--real-mongo-record-type-proof).

  **Depends on:** SR-002, SR-006, SR-007, SR-008.

  **Deliver:** bootstrap/create/reload/read/list/cache integration cases, schema
  failure, strict-capability rejection and disposable `bootstrapAlways` coverage.
  Add failure-cleanup, isolation, stale-handle and fresh-instance restart cases.

  **Accept/evidence:** cases actually run with MongoDB; global Sails is absent and
  the compiled import graph does not load Sails. A successful repository `get()`
  alone is not sufficient. Record how this exceeds the existing foundation fixture.

- [x] **SR-010 — Build the minimal standalone Express 5 host early.**

  **Status:** done; [partial Express host, admission, signals and failure checks](evidence/p1-runtime.md#sr-010--minimal-standalone-express-host).

  **Depends on:** SR-002, SR-007.

  **Deliver:** one server, host-owned signals, explicit test composition and
  admission/readiness integration around the runtime. Keep normal traffic closed
  through initialization and handle listener preparation/bind failures.

  **Accept/evidence:** standalone startup/inactive/activation/stop and failure
  cases pass without Sails. Partial route/module coverage is identified; the host
  does not dispatch absent routes through a legacy controller or second process.

- [x] **SR-011 — Connect the temporary Sails comparison adapter to the same instance.**

  **Status:** done; [same-instance compiled Sails host and isolated comparison](evidence/p1-runtime.md#sr-011--same-instance-legacy-comparison-adapter).

  **Depends on:** SR-006, SR-007, SR-008.

  **Deliver:** legacy exports/bootstrap/shutdown delegate converted work to the
  same application-owned implementation. Keep unconverted caches/callbacks explicit.

  **Accept/evidence:** focused legacy-host behavior passes without duplicate
  bootstrap/clients/services. Standalone imports do not pull in this adapter;
  dual-host comparison uses separate runs and isolated fixtures.

## P2 — Async extensions and early hook conversion

- [x] **SR-012 — Discover installed extensions and load them asynchronously.**

  **Status:** done; installed and real packed/offline acceptance passed in SR-017.
  [Evidence](evidence/p2-extensions.md#sr-012--installed-async-discovery).

  **Depends on:** SR-001, SR-007.

  **Deliver:** package-export-aware resolution and awaited native imports with
  deliberate ESM/CommonJS/default normalization, separated from shim generation.

  **Accept/evidence:** installed/packed fixtures, hidden `package.json` exports,
  named/default exports, missing entrypoints and top-level await behave predictably;
  diagnostics identify the offending package without leaking secrets.

- [x] **SR-013 — Define and resolve the neutral v6 registration contract.**

  **Status:** done; [P2 evidence](evidence/p2-extensions.md#sr-013--neutral-declarations-and-offline-resolution).

  **Depends on:** SR-012, SR-004.

  **Deliver:** versioned/documented declarations for the capabilities required
  by real hooks; preserve priority/fallback and view/asset lookup ordering.
  Resolve one set per application, with validation before acquisition.

  **Accept/evidence:** offline registration opens no database/listener; missing
  or invalid declarations and accidental route collisions fail clearly. Migration
  name order remains independent of hook load priority.

- [x] **SR-014 — Resolve app-owned factory overrides and scoped host integrations.**

  **Status:** done; [P2 evidence](evidence/p2-extensions.md#sr-014--selected-factories-and-owned-host-integrations).

  **Depends on:** SR-013, SR-008.

  **Deliver:** resolve winning named overrides before instantiation, inject narrow
  inputs and detect duplicate/missing/cyclic prerequisites. Define tracked route,
  middleware and necessary server-resource registration.

  **Accept/evidence:** overridden core factories are not instantiated; each app
  owns one selected instance. Integrations obey admission/cleanup and do not create
  their own listener, process handlers or unrestricted default service locator.

- [x] **SR-015 — Convert storage-hook registration and readiness.**

  **Status:** done; [P2 evidence](evidence/p2-extensions.md#sr-015--storage-registration-and-readiness).

  **Depends on:** SR-014, SR-006.

  **Deliver:** v6 storage factory/capability/contributor/migration declarations
  over existing Prisma repositories and native byte-store owners.

  **Accept/evidence:** registration is offline; standalone composition resolves
  capability before record-type checks and preserves storage/index readiness and
  stale-handle semantics. No data relocation or new persistence abstraction.

- [x] **SR-016 — Convert PDF-hook lifecycle before broad route migration.**

  **Status:** done; [P2 evidence](evidence/p2-extensions.md#sr-016--pdf-lifecycle-and-declarations).

  **Depends on:** SR-014, SR-007.

  **Deliver:** explicit config contributions, factories, job declarations and
  tracked generation/retry-fiber cleanup. Replace Sails events and `lower()` patches.

  **Accept/evidence:** standalone hook composition and resource lifetime tests
  pass without Sails. Activation is registered explicitly; full backend activation
  is verified in SR-023 and HTTP/progress integration in P6.

- [x] **SR-017 — Prove packed ESM/CommonJS hooks and offline loading.**

  **Status:** done; [real tarballs, isolated production install and offline proof](evidence/p2-extensions.md#sr-017--packed-production-and-offline-loading).

  **Depends on:** SR-010, SR-012, SR-015, SR-016.

  **Deliver:** clean installed fixtures with ESM-only dependency/top-level await,
  CommonJS v6 registrations, override precedence and app-owned instance isolation.

  **Accept/evidence:** production-style loading uses public exports and no source
  tree shortcut; offline inspection has no live clients/workers. Full package ESM
  conversion and unchanged v5 hook compatibility are not prerequisites.

- [x] **SR-018 — Port development registrations and publish the initial hook scaffold.**

  **Status:** done; [shared registration, compiling scaffold and migration examples](evidence/p2-extensions.md#sr-018--development-registrations-and-initial-v6-scaffold).

  **Depends on:** SR-013, SR-014.

  **Deliver:** v6 development-hook/archetype declarations and concrete before/after
  service, controller/route, config, bootstrap, migration and resource examples.

  **Accept/evidence:** scaffold output compiles against the proposed v6 contract;
  examples distinguish CommonJS format compatibility from Sails source compatibility.
  Complete generated-app packaging is subsequently qualified in SR-047/SR-053.

## P3 — Configuration, orchestration and activation

- [x] **SR-019 — Own startup configuration resolution and finalization.**

  **Status:** done; [resolution, offline loading and validation](evidence/p3-lifecycle-config.md#sr-019--startup-resolution-and-finalization).

  **Depends on:** SR-002, SR-004, SR-013.

  **Deliver:** explicit core/hook/app/environment/local/env-input/CLI precedence,
  typed validation, ordinary array replacement and declared domain merge rules.

  **Accept/evidence:** precedence/function/array/job-name fixtures pass; approved
  executable values survive without JSON cloning. No database or worker starts
  while loading config; consumers receive finalized startup slices.

- [x] **SR-020 — Provide deployment conversion and actionable diagnostics.**

  **Status:** done; [typed mapping, synthetic conversion fixtures and diagnostics](evidence/p3-lifecycle-config.md#sr-020--deployment-conversion-and-diagnostics). Institution qualification remains SR-005/SR-045–049.

  **Depends on:** SR-019, SR-005.

  **Deliver:** retained/renamed/unsupported key mapping and concrete institution
  examples for connections, session/auth, proxy/root paths, storage and `sails_*`
  inputs. Add small deterministic conversion tooling only where useful.

  **Accept/evidence:** converted representative fixtures resolve as intended;
  unsupported meaningful keys fail before acquisition and diagnostics redact secrets.
  Do not ship a permanent general Sails configuration emulator.

- [x] **SR-021 — Separate dynamic application settings from startup config.**

  **Status:** done; [fresh dynamic reads and tracked comparison writes](evidence/p3-lifecycle-config.md#sr-021--dynamic-settings-and-owned-configuration-effects).

  **Depends on:** SR-019.

  **Deliver:** dynamic branding/AppConfig access and invalidation remain explicit;
  split legacy merge side effects into configuration, asset preparation, migrations/
  awaited bootstrap and factory declarations.

  **Accept/evidence:** brand changes remain visible at the intended request-time
  interface; startup consumers do not depend on later object mutation; previously
  unawaited application-data writes become tracked work.

- [x] **SR-022 — Implement ordered initialization, migrations and bootstrap.**

  **Status:** done; [ordered stages, real Mongo ledger/failure and cleanup evidence](evidence/p3-lifecycle-config.md#sr-022--ordered-initialization-migrations-and-bootstrap).

  **Depends on:** SR-019, SR-014, SR-015, SR-016.

  **Deliver:** explicit persistence/module/migration/core/hook/post-bootstrap
  stages with storage/contributor/schema/dashboard prerequisites. Reuse the ledger
  and lexical migration ordering; keep comparison-only callbacks in the adapter.

  **Accept/evidence:** ordered/failing-stage cases prove required work is awaited
  once and partial acquisition is cleaned up. Migration failure/partial-write
  behavior is preserved without inventing transactional or exactly-once guarantees.

- [x] **SR-023 — Gate queue consumers, schedules and normal submissions.**

  **Status:** done; [real Agenda gating/failure, owned cron and PDF checks](evidence/p3-lifecycle-config.md#sr-023--queue-pdf-and-cron-activation).

  **Depends on:** SR-022, SR-016.

  **Deliver:** Agenda/PDF/cron and other inventoried producers declare work during
  initialization and begin normal processing only on activation. Required remote
  bootstrap imports have separate named, awaited stages.

  **Accept/evidence:** a migration/bootstrap failure cannot start ordinary work;
  processors/schedules activate once. Test activation failure and cleanup of
  participants already started without claiming rollback of emitted effects.

- [x] **SR-024 — Preserve native-resource draining and retryable failed stops.**

  **Status:** done; [quiesce, scoped completions, real Mongo/HTTP/GridFS deadlines and cleanup retry](evidence/p3-lifecycle-config.md#sr-024--quiesce-scoped-completion-and-retryable-draining).

  **Depends on:** SR-023, SR-006.

  **Deliver:** explicit quiesce/drain/close integration for known owners, scoped
  completion writes, configurable deadlines and host/container grace guidance.

  **Accept/evidence:** new work is denied while admitted completion proceeds;
  timeouts/failures retain ownership for retry; Prisma clients/pools stay open
  until dependent work settles. Later upload/socket owners must use this interface.

- [x] **SR-025 — Make maintenance entrypoints standalone and inactive.**

  **Status:** done; [installed inactive maintenance, real Mongo index safety and cleanup](evidence/p3-lifecycle-config.md#sr-025--standalone-inactive-maintenance).

  **Depends on:** SR-019, SR-022, SR-015.

  **Deliver:** `persistence:indexes` and inventoried maintenance consumers use
  config/registrations/selected persistence without Sails or business activation.

  **Accept/evidence:** inspect/explicit ensure/cleanup work from installed artifacts;
  imports do not activate jobs, migrations or business bootstrap unexpectedly.
  Existing index safety, exit statuses and stopped-writer guidance remain intact.

## P4 — Authenticated standalone HTTP pilot

- [x] **SR-026 — Adapt route contracts and validation inputs.**

  **Status:** done; [minimal inputs, injected resolution and contract/document checks](evidence/p4-http-pilot.md#sr-026--contract-inputs-and-injected-resolution).

  **Depends on:** SR-013, SR-019.

  **Deliver:** injected route configuration and minimal HTTP input extraction
  while retaining Zod/OpenAPI and documented legacy parameter precedence.

  **Accept/evidence:** route validation/document generation pass; shared contracts
  import without Sails; public paths and relevant missing/query/body cases match
  expected results. Runtime policy execution stays separate from OpenAPI metadata.

- [x] **SR-027 — Implement actor/brand context and effective policy ordering.**

  **Status:** done; [standalone actor, ordering and real identity/denial checks](evidence/p4-http-pilot.md#sr-027--authenticated-actor-brand-and-effective-policies).

  **Depends on:** SR-026, SR-022.

  **Deliver:** converted pilot identity/branding/portal dependencies plus route,
  controller/action/global policy resolution, boolean allow/deny and overrides.

  **Accept/evidence:** unauthenticated/unauthorized/cross-brand and overridden
  policies fail or succeed correctly using authenticated context, never trusted
  client-supplied identity. Required collaborators are standalone.

- [x] **SR-028 — Compose per-app middleware and track request completion.**

  **Status:** done; [middleware, shared lifetime and real Mongo session checks](evidence/p4-http-pilot.md#sr-028--per-application-middleware-and-accepted-request-completion).

  **Depends on:** SR-027, SR-010, SR-023, SR-024.

  **Deliver:** parser/session/Passport/log/context and error handling in explicit
  order, no process-wide middleware cache, and accepted-work lifetime propagation.

  **Accept/evidence:** parsers/loggers/session loading run once; async/Observable
  results complete once; aborts, late session writes and errors after headers retain
  correct ownership without duplicate responses or fallback dispatch.

- [x] **SR-029 — Serve both record-type endpoints from the standalone host.**

  **Status:** done; [thin adapters, retained contracts and persisted HTTP results](evidence/p4-http-pilot.md#sr-029--both-standalone-record-type-endpoints).

  **Depends on:** SR-028, SR-008, SR-021.

  **Deliver:** list/get route adapters over the extracted module, preserving
  API-version/field-selection behavior, response envelopes, no-cache headers and errors.

  **Accept/evidence:** both existing URLs use real Prisma data and authenticated
  brand context. No Sails controller is called and no Express object reaches the
  domain interface. Partial-host inventory identifies unimplemented groups.

- [x] **SR-030 — Record authenticated pilot parity and failure evidence.**

  **Status:** done; [released-v5 replay, real Mongo HTTP failures, compiled graph and full regression](evidence/p4-http-pilot.md#sr-030--authenticated-parity-failures-and-final-regression).

  **Depends on:** SR-029, SR-009, SR-003, SR-020, SR-011.

  **Deliver:** focused integration/API cases for valid/missing results, invalid
  input, denied access, cross-brand access and server failures on real MongoDB.

  **Accept/evidence:** expectations distinguish v5 reference, intermediate source
  and documented breaks; actual host/version is recorded. Repeat abort/session-save
  failure cases where adapter lifetime could release resources too early.

## P5 — Domain and API groups

- [x] **SR-031 — Establish repeatable route-group acceptance and inventory updates.**

  **Status:** done; [checklist, complete route assignment, policy parity/cache and executed Mongo/HTTP/Bruno evidence](evidence/p5-route-groups.md).

  **Depends on:** SR-030.

  **Deliver:** a small per-group checklist covering domain dependencies, factories,
  lifecycle, policy/schema contracts, hook override and Sails import removal.
  Record newly found route ordering/provider prerequisites.

  **Accept/evidence:** each remaining route has an assigned group; required CSRF,
  upload or socket prerequisites are explicit. Use existing tests with focused
  additions, not a generated parallel suite or generic framework abstraction.

- [x] **SR-032 — Migrate configuration, forms metadata and translations.**

  **Status:** done; [read/domain/form delivery evidence](evidence/p5-metadata-read.md)
  and [protected configuration, translation and dashboard writes](evidence/p5-metadata-write.md).
  All 63 inventoried declarations have explicit standalone mounts, verified with
  SR-038 authentication and SR-039 CSRF. Institution qualification remains SR-005.

  **Depends on:** SR-031, SR-021; SR-039 before completing protected writes.

  **Deliver:** read then write slices, converted collaborators and dynamic-setting
  behavior. Cover slash-containing translation keys and JSON/form coercion.

  **Accept/evidence:** policy/brand isolation, metadata/results, write security,
  invalidation and representative overrides pass. Record each intentional public
  break and remove the group's obsolete globals/registrations.

- [x] **SR-033 — Migrate reports, search, named queries and job/history reads.**

  **Depends on:** SR-031.

  **Deliver:** standalone operations and adapters preserving filters, pagination,
  projections, access rules and response formats with explicit backend collaborators.

  **Accept/evidence:** representative search/report/history requests, denials,
  malformed input and backend errors pass; relevant hooks work without Sails and
  accepted backend operations participate in shutdown ownership.

  **Evidence:** [query reads](evidence/p5-query-reads.md). All 25 declarations are
  mounted; Mongo/Solr HTTP and Bruno pass with no pending tests.

- [x] **SR-034 — Migrate record reads and exports.**

  **Depends on:** SR-031, SR-015, SR-016.

  **Deliver:** record read/export operations, storage/template collaborators,
  actor/brand authorization, headers and streaming/result behavior.

  **Accept/evidence:** representative records, denied reads, exports, missing
  objects and aborts pass; admitted work outlives transport termination when needed.
  Record the remaining mutation/upload/progress dependencies explicitly.

  **Evidence:** [record reads, schemas and owned exports](evidence/p5-record-reads.md).
  All 21 declarations mount; real Mongo/Solr HTTP, Bruno, denied reads, schema
  reauthorization and abort/shutdown drain pass. Integrated HTTP: 85/85, no skips.
  Full Mongo-backed core: 4408 passing, 68 existing pending, zero failures.
  SR-035 mutations, SR-041/042 uploads and SR-043 progress remain separate.

- [x] **SR-035 — Migrate record mutations and workflow operations.**

  **Status:** done; [owned pipeline, all 23 mutation/harvest declarations,
  concurrency/schema/audit/compensation and actual verification](evidence/p5-record-mutations.md).
  The required direct-progress and local multipart/tus slices are qualified.
  The separate remote Companion transfer/coexistence criteria are now also
  qualified in SR-042/SR-043; these saves do not invoke remote transfers.

  **Depends on:** SR-034, SR-032, SR-039; the direct portal slice of SR-043
  and local multipart/tus slices of SR-041/SR-042. Remote Companion
  transfer/coexistence does not participate in these save operations.

  **Deliver:** create/update/delete/transition slices with validation, stored
  concurrency policy, revisions/incarnations, schema grants, audit and compensation.

  **Accept/evidence:** success, invalid/denied/stale writes and partial failures
  retain documented behavior; ETag/precondition/schema contracts pass. No hidden
  Sails service/socket dependency remains in a completed slice.

- [x] **SR-036 — Migrate identity administration and external integration mutations.**

  **Status:** done; [all 117 identity/administration/integration declarations,
  tenant-qualified linking and real provider success/failure/retry](evidence/p5-identity-integration.md).
  The original 84 independent declarations and linking are implemented; single-record
  indexing was also found misclassified and migrated. No independent route is deferred.

  **Depends on:** SR-031, SR-038, SR-039; add actual domain/provider prerequisites.

  **Deliver:** reviewed slices for account linking/disable/roles and publishing/
  integration operations, preserving authorization, audit and partial-effect rules.

  **Accept/evidence:** representative API/browser requests and external-service
  fixtures cover success/failure/retry without adding new exactly-once claims;
  ordinary external work cannot activate during failed initialization.

- [x] **SR-037 — Close API-group overrides, dependency and route coverage.**

  **Status:** done; [152/152 API contracts, overrides/import closure and full
  qualification](evidence/p5-api-closure.md). Inventory: 282/333 standalone
  declarations; the remaining 51 are SR-040 pages/static consumers. The accepted
  Companion adapter and joint socket ownership are qualified in P6. Final HTTP:
  153 passing; Bruno: 34 requests/53 scripted checks; full Mongo core: 4417 passing,
  68 existing pending, zero failures. All new provider cases execute without skips.

  **Depends on:** SR-032, SR-033, SR-034, SR-035, SR-036.

  **Deliver:** completed API manifest, representative named overrides, import
  graph checks and removal of group-specific legacy registrations/bridges.

  **Accept/evidence:** each API entry is implemented or has an intentional
  documented removal; Express 5 matching/HEAD/OPTIONS/errors/proxy cases are
  covered where relevant. Remaining browser/provider work is owned by P6 tasks.

## P6 — Browser, upload and realtime slices

- [x] **SR-038 — Complete supported authentication and session migration.**

  **Status:** done; [standalone local/bearer/AAF/OIDC, real Keycloak/Bruno,
  session invalidation/rotation, audit and provider limits](evidence/p6-auth-csrf.md#sr-038--authentication-and-session-migration).
  CSRF is separately gated in SR-039; login/page rendering belongs to SR-040.

  **Depends on:** SR-028, SR-022.

  **Deliver:** local/bearer/JWT and supported OIDC/AAF flows, callbacks/proxy HTTPS,
  linked/disabled-user/logout/rotation behavior and explicit v6 session invalidation.

  **Accept/evidence:** authentication/account/role/audit cases pass; old sessions
  require login safely; cookie changes and socket/client consequences are documented.
  Do not require preserving Sails serialization or lose upload state implicitly.

- [x] **SR-039 — Replace Sails CSRF and verify browser policy enforcement.**

  **Status:** done; [exact-pinned synchronizer, real Mongo/Bruno and actual browser
  token/origin/role/schema/logout enforcement](evidence/p6-auth-csrf.md#sr-039--session-bound-csrf-and-browser-policies).

  **Depends on:** SR-038, SR-028.

  **Deliver:** focused replacement probe, maintained exact-pinned implementation
  and token endpoint/header integration or coordinated Angular changes.

  **Accept/evidence:** valid/missing/invalid tokens, session binding, exemptions,
  cross-origin and admin/schema authorization pass. Protected P5 write groups
  cannot be completed before this behavior is available.

- [x] **SR-040 — Port EJS pages, helpers, themes and static artifacts.**

  **Status:** done; [owned page operations, installed artifact lookup, policies,
  root/proxy delivery, visible persisted Angular workflows and baseline artifact
  limitations](evidence/p6-pages.md). All 10 page cases pass in the 171-case HTTP
  matrix; three real Docker browser runs pass 4/4 with zero skips/failures.

  **Depends on:** SR-032, SR-018, SR-038.

  **Deliver:** rendering, layouts/partials/locals, translations, view/asset
  precedence, CSP nonces, branding/fonts and Angular/static delivery.

  **Accept/evidence:** visible persisted browser workflows and packaged artifact
  lookup pass under institution root/proxy URLs; cache/content-type/dotfile behavior
  is intentional. No `res.view()` or source-tree-only path is required.

- [x] **SR-041 — Replace Skipper multipart handling with owned streaming uploads.**

  **Status:** done; [exact parser selection, all 13 declarations, real bytes,
  backpressure, cancellation and cleanup/failure/retry](evidence/p6-uploads.md#sr-041-owned-streaming-multipart).

  **Depends on:** SR-034, SR-035, SR-024.

  **Deliver:** focused parser selection/limits probe, exact pin, converted upload
  routes and shared Flydrive/GridFS ownership with tracked staging cleanup.

  **Accept/evidence:** field ordering, count/size limits, backpressure, validation,
  cancellation and partial/unknown storage outcomes pass. Remove `req.file()`
  consumers only after their route behavior and cleanup are proven.

- [x] **SR-042 — Integrate tus and Companion with the standalone server.**

  **Status:** done under the accepted single-instance 7.1.1 public-API adapter
  decision; [tus, actual URL-provider transfer, authorization/resume/proxy,
  initialize-time ownership and bounded drain](evidence/p6-uploads.md).
  Docker qualification: 6 passing, exit 0; final HTTP: 153 passing, no skips/failures.
  Process-owned cron and remote I/O beyond the deadline are documented limits.

  **Depends on:** SR-041, SR-038, SR-034.

  **Deliver:** dedicated mounts/raw-parser exclusions, auth/callback paths,
  resumable state and tracked transfers. Audit Companion's Express/socket graph.

  **Accept/evidence:** upload authorization, reconnect/resume, proxy URLs and
  shutdown drain work; only one Companion/socket attachment exists. Dependency
  overrides are changed only with consumer-specific compatibility evidence.

- [x] **SR-043 — Replace portal Sails sockets with direct Socket.IO.**

  **Status:** done; [direct portal sockets, six progress declarations, client
  conversion, current session/record authorization, real Companion coexistence,
  reconnect/resume and deadline termination](evidence/p6-realtime.md).
  Both protocols attach once without stealing upgrades. The real provider and
  progress cases pass in the 153-case HTTP matrix and six-case Docker qualification.

  **Depends on:** SR-028, SR-034, SR-023.

  **Deliver:** endpoint/room/progress integration, authenticated brand/record joins,
  reconnect behavior and conversion of inventoried virtual-request/sails.io clients.

  **Accept/evidence:** joins, denials, progress/reconnect and admitted completion
  work pass; portal and Companion sockets remain distinct and attach once each.
  Document coordinated client/protocol changes where compatibility is not retained.

- [x] **SR-044 — Verify integrated browser/provider lifetime behavior.**

  **Status:** done; [real auth/upload/PDF/progress/browser combinations,
  abort/deadline/persistence/retry proof and accepted provider limits](evidence/p6-browser-lifetime.md).
  Three fresh browser processes pass 4/4; final HTTP is 171 passing, Bruno 34
  requests/53 checks, full Mongo core 4420 passing/68 existing pending/zero failures.
  Accepted work persists before pools/clients close; final owned upgrade count is 0.

  **Depends on:** SR-038, SR-039, SR-040, SR-041, SR-042, SR-043, SR-024, SR-016.

  **Deliver:** browser/API/provider scenarios combining auth, upload, PDF/progress,
  abort/reconnect and application stop, using real persisted state and local stubs.

  **Accept/evidence:** accepted jobs/transfers/session writes drain or fail stop
  observably without premature client/pool closure; the complete browser/provider
  inventory has replacements without Sails helpers or events.

## P7 — Qualification, upgrade rehearsal and internal promotion

- [x] **SR-045 — Execute the Node 26 and MongoDB 8+ qualification matrix.**

  **Status:** done. The prior generic production-host matrix passes four local
  Node 26/Mongo 8.0.34 FCV 8.0 and 9.0.4 FCV 9.0 rows, including split replica
  sets/stepdown/drain (216 checks). WSU now adds actual installed-hook rows on
  both selected majors with its separate standalone datastore/S3/Solr/local-auth
  topology equivalent: maintenance, persistence, worker, CSRF/pages, ownership,
  failed-drain retry and restart all pass; both processes exit 0. Actual WSU
  production TLS/auth/set membership is unknown and unqualified, with engine/FCV
  procedures separate. [WSU matrix](evidence/institution-wsu.md#sr-045--installed-wsu-topology-qualification);
  the final corrected WSU `c1c847d` artifact repeats both rows successfully in
  [R19](evidence/final-review-r19.md), including actual vocabulary migration and
  normalized notation lookup checks on both majors.
  [R20](evidence/final-review-r20.md) repeats both installed rows with portal
  `5786b7e77` and WSU `50293cc2`: assertions pass, pools/Prisma clients close,
  and processes naturally exit 0. Its delayed-exit diagnosis qualifies timing;
  zero pools alone is not proof of immediate process exit.
  [historical generic matrix](evidence/p7-qualification.md#sr-045--database-matrix).

  **Depends on:** SR-005, SR-002, SR-025, SR-037, SR-044.

  **Deliver:** exact runtime/database/FCV/topology results covering MongoDB 8 and
  the selected newer major, relevant separate datastores and institution topology.

  **Accept/evidence:** real persistence/ownership/maintenance cases pass for each
  supported combination; unsupported combinations and engine-upgrade prerequisites
  are explicit. Runtime guard acceptance alone does not qualify a combination.

- [x] **SR-046 — Run broad API, domain and browser regression.**

  **Status:** done; actual production Express passes full Playwright (124 passing/0 failing/0 skipped), general Bruno (309 requests/553 tests/3 assertions), dedicated OIDC (13 requests/17 tests) and S3 (7 requests/12 tests), all with no failures/skips. Compiled-source root Mocha passes 422 tests/10 unchanged pending/0 failing. Final fully serialized core passes 4485 tests/7 unchanged pending/0 failing with all real-Mongo cases executing. Earlier failures, retained external-service cases and test conversions are recorded in [integration evidence](evidence/p7-production-composition.md). Clean artifacts and complete cutover are tracked below.

  **Depends on:** SR-003, SR-037, SR-044.

  **Additional implementation prerequisite discovered in P7:** bind the extracted
  modules into an installed production Express portal, including complete domain
  configuration/bootstrap, selected extension/provider bindings and HTTP/pages.
  The new `app.express.cjs` candidate supplies this entrypoint; its complete
  broad-suite/artifact/local-topology qualification passes. Institution qualification
  remains SR-005/049. See
  [production composition](evidence/p7-production-composition.md).

  **Deliver:** existing Mocha/Bruno/Playwright and relevant package suites over the
  integrated host, comparing representative behavior with released v5 fixtures.

  **Accept/evidence:** intentional breaks have conversions and affected consumers;
  failures/skips are reviewed, not hidden by partial-host coverage or broad mocks.
  Record counts, commands, artifacts and external-service fixture limitations.

- [x] **SR-047 — Qualify clean package/image artifacts and operational comparisons.**

  **Status:** done for the user-authorized qualification scope; twelve clean tarballs pass 20 strict production/offline consumer checks; all nine packages, 20 Angular apps/2 libraries and webpack build. Installed runtime/rehearsal images pass assets, split-store lifecycle, native PDF, actual portal health/ready/login/forms/restart/stop and pre-recorded v5 operational tolerances. Clean archived inputs and exact incremental-build provenance are in [artifact evidence](evidence/p7-qualification.md#sr-047--clean-packed-artifacts). Institution-specific generated applications remain SR-005/049's external gate.

  **Depends on:** SR-017, SR-018, SR-037, SR-044, SR-045.
  Full portal qualification also requires SR-046's production-composition prerequisite.

  **Deliver:** clean production installs/images and generated institution apps;
  verify exports, async ESM/CJS, Prisma generated/copied artifacts and EJS/Angular
  assets. Measure startup/stop/errors/connections and representative latency/memory.

  **Accept/evidence:** no source-tree or dev-dependency shortcut is needed;
  comparisons use observed baselines and recorded tolerances. Full package ESM
  conversion is not added as a promotion gate.

- [x] **SR-048 — Publish a concrete v6 upgrade and recovery procedure.**

  **Status:** done; [operator runbook](upgrade-recovery-v6.md) exercised with installed production artifact through full cutover/restart/stop, injected partial failure and complete native database/file/config/hook/image recovery; fresh empty offline-engine binary proof passes. [Executed results](evidence/institution-upgrade-recovery.md).

  **Depends on:** SR-020, SR-025, SR-038, SR-024, SR-045.
  Complete cutover execution also requires SR-046's production-composition prerequisite.

  **Deliver:** versioned artifact/config/hook preparation; maintenance/writers
  stopped; consistent backup; index inspect/reviewed ensure; one migration runner;
  bootstrap/validation/activation; forced login; partial-failure recovery.

  **Accept/evidence:** commands match implemented entrypoints and existing tooling;
  explain that migration bodies/DDL are not transactional and old-image selection
  cannot undo writes or external effects. Restore covers binaries/config/hooks too.

- [x] **SR-049 — Rehearse a representative institution upgrade and recovery.**

  **Status:** done for the authorized WSU local-equivalent rehearsal. Released
  v5.0.4 with compatible historical WSU `4996206` upgrades directly to the clean
  v6 artifact with converted WSU, corrected through `c1c847d` in
  [R19](evidence/final-review-r19.md): generated publication HTTP delivery,
  fresh integration, both matrix rows, upgrade/retained reads, readiness, restart
  and stop pass. Real partial-initialization failure and exact four-database
  restoration are repeated with the corrected artifact. The original complete
  native recovery remains retained historical evidence and restores
  all four databases (28 collections/5,162 documents), S3, files, configuration,
  hook, Solr and the exact source image payload. The actual archive-loaded image
  passes source reads/restart/stop; all stops exit 0. The designated owner and
  production source/infrastructure gaps remain explicit.
  [WSU recovery](evidence/institution-wsu.md#sr-049--released-wsu-cutover-and-complete-recovery).
  Earlier bundled-hook stand-in evidence remains historical and separate.
  [R20](evidence/final-review-r20.md) repeats installed cutover/restart/stop,
  partial-initialization failure and exact four-database restoration with portal
  `5786b7e77` and WSU `50293cc2`, and verifies the corrected ordinary PDF GET
  before/after restart. The complete native recovery remains historical.

  **Depends on:** SR-047, SR-048, SR-046, SR-045.

  **Deliver:** upgrade from the designated supported production artifact with
  converted institution overrides, auth, storage and deployment settings; exercise
  the documented restoration/reconciliation route on a consistent checkpoint.

  **Accept/evidence:** institution/topology/artifact identifiers and fresh/upgrade/
  restart/stop outcomes are recorded; no interim development release is required.
  Core-only startup or database-only restoration does not complete this task.

- [x] **SR-050 — Promote the qualified Express host as the internal v6 default.**

  **Status:** done for the explicitly authorized internal promotion; root start/debug, Docker CMD/readiness health and both explicit development Compose modes use Express. Actual default runtime fresh/restart, real npm start and both dev modes pass health/ready/CSRF login/assets/20 forms requests and exit 0. Clean metadata-overlay provenance, two fixed dev regressions and cleanup are in [promotion evidence](evidence/p7-qualification.md#internal-default-implementation-and-executed-verification). The user-authorized complete stand-in permitted that historical internal promotion. The later WSU rehearsal under SR-049 now completes its local institution criterion; actual production access gaps remain explicit in WSU evidence.

  **Depends on:** SR-049, SR-046, SR-047.

  **Deliver:** distinct `npm start`/Docker entrypoint promotion with one runtime,
  server and signal owner. Keep any remaining host selector development-only.

  **Accept/evidence:** promoted candidate passes startup/readiness/stop checks;
  release acceptance remains pending P8 removal and clean-artifact verification.

## P8 — Retirement and final release evidence

- [x] **SR-051 — Retire shim generation and reconcile owned generated files.**

  **Status:** done; exact 236-file removal preserves nine application-owned paths,
  edited/symlink safeguards pass, twelve clean packs pass20 consumer/scaffold
  checks and the installed runtime contains none of the236 shims.
  [P8 evidence](evidence/p8-retirement.md#sr-051-clean-installation-and-emitted-artifact-acceptance).

  **Depends on:** SR-050, SR-037, SR-018.

  **Deliver:** stop generating Sails service/controller/policy/config/bootstrap
  shims; remove exact obsolete generated output and give guidance for edited files.

  **Accept/evidence:** builds/installations no longer recreate shims; manual
  institution customizations are not indiscriminately deleted; new hook entrypoints
  use neutral registration rather than a hidden legacy generation path.

- [x] **SR-052 — Remove executable Sails dependencies and compatibility adapters.**

  **Status:** done; source, compiled owned packs, installed runtime and1194-package
  strict packed consumer report0 executable violations/0 forbidden dependency
  entries. Exact dependency/lock removal ledger and historical package-name
  classifications are recorded.
  [P8 evidence](evidence/p8-retirement.md#sr-052-strict-installed-packed-graph-acceptance).

  **Depends on:** SR-051, SR-044, SR-050.

  **Deliver:** remove Sails/socket hooks, globals/types/events, process patches,
  Sails-only config and obsolete runtime dependencies from all owned packages.

  **Accept/evidence:** source, built output and installed/packed dependency graphs
  have no required Sails runtime path. Historical text and framework-independent
  package names containing `sails` are classified, not renamed unnecessarily.

- [x] **SR-053 — Finish test/deployment/maintenance and archetype retirement.**

  **Status:** done; clean generated production scaffold, standalone full suites,
  real provider profiles, Docker default CMD/user/native health, maintenance and
  v6-only dev-tools all pass without Sails installed. Existing assertions are
  preserved; fixture synchronization/corrections are justified in
  [final P8 evidence](evidence/p8-retirement.md#final-qualification-and-task-disposition).

  **Depends on:** SR-052, SR-025, SR-018.

  **Deliver:** standalone test bootstrap, no legacy host selector, aligned build/
  Docker/Compose/CI and maintenance scripts, and final generated-app templates.

  **Accept/evidence:** clean generated institution app and supported maintenance/
  test entrypoints work without Sails installed; templates do not reintroduce old
  metadata, process handlers, shims or unsupported configuration aliases.

- [x] **SR-054 — Update authoritative wiki and generated extension references.**

  **Status:** done; wiki stays ordinary tracked files in the main repository.
  Architecture/extension/configuration/operator pages and the complete intentional
  v6 client-break list are updated and linked from upgrade/recovery. Both generators,
  audit and 4 documentation tests pass; 43 surfaces/523 advisory findings and example
  validation limits remain explicit. Relative links resolve.
  [P8 documentation evidence](evidence/p8-retirement.md#sr-054--tracked-wiki-and-generated-reference-update).

  **Depends on:** SR-020, SR-018, SR-053, SR-048.

  **Deliver:** architecture/runtime, extension, services/controllers, config,
  development/testing/install and upgrade pages; classify supported interfaces and
  add validated migration examples to the generated reference inputs.

  **Accept/evidence:** documentation describes implemented behavior, links resolve,
  example/reference validation and `docs:audit` results are recorded. Update the
  doc router only where the implemented documentation structure requires it.

- [ ] **SR-055 — Qualify the final Sails-free artifact and close the inventory.**

  **Status:** open for the zero-new-findings confirmation gate.
  [R21](evidence/final-review-r21.md) finds two introduced P2 build/CI issues,
  fixed in WSU `8679736` and `1b9b1ac`; successful remediation does not make R21 a zero-finding
  round. The complete WSU suite passes 546 tests; dev-tools 60, root tooling 38,
  focused core loading/ownership 15 and the 1,271-case resolver comparison pass.
  Source closure and all 1,261 baseline inventory entries reconcile. Twelve
  byte-identical R20 tarballs pass 20 fresh production/offline consumer checks
  with explicit strict/nonlegacy peers after portal `15f8a8d58`; R20's original
  strict-peer claim is qualified. R21 changes build/test/documentation inputs,
  not core or WSU runtime bodies. R20's full core/root, derivative-image,
  Mongo 8/9, installed cutover/restoration and migration evidence remain historical,
  with their provenance and limitations retained. The
  [institution qualification](evidence/institution-wsu.md#sr-055--final-artifacts-inventory-and-task-disposition)
  retains the authorized local scope and unchecked production acceptance work.
  A subsequent confirmation round finding zero new A/P1/P2 issues is required.

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
