# Sails retirement: v6 implementation plan

Status: implementation not started. Agreed direction recorded on 2026-10-23.
Source baseline: `stack/waterline-4-remove-waterline`, commit
`59a5cb9a4e426b1d0e6c9f3256c089240bc5b0f2`. Integrate/rebase onto the completed
Prisma code stack before implementation; Prisma and this change both ship in v6.0.

The [design](design.md) defines the behavioral contract and proposed interfaces.
The [task list](tasks.md) defines dependencies, acceptance criteria and evidence.
All stages below are planned, not verified. Existing repository capabilities do
not establish that the retirement work has been completed.

## 1. Delivery constraints

- Build a **standalone Express 5 host early**. Express-in-Sails nesting is optional
  development exploration, not a prerequisite or production architecture.
- Target **Node 26** consistently across development, CI and production. Qualify
  and pin exact versions; audit root/core/Companion resolution independently.
- Keep **Prisma over MongoDB 8+**. PostgreSQL is outside this task, including
  speculative relational implementation. Qualify concrete Mongo versions/FCVs
  and relevant topologies rather than inferring support from the startup guard.
- v6 is a major upgrade. Require v6-compatible institution hooks and an explicit
  ReDBox configuration contract with conversion guidance. Preserve public HTTP
  behavior by default; document specific intentional breaks and affected clients.
- Permit forced login and maintenance downtime. Do not promise mixed-version
  rolling operation or old-image rollback against state already used by v6.
- Introduce awaited native ESM loading early. Complete server-package ESM
  conversion is an independent follow-up, not a retirement/default-promotion gate.
- Use one runtime/bootstrap/pool owner per process. The host owns signals; modules
  own their registered work. Initialization and required migrations/bootstrap
  finish before normal traffic, consumers and schedules activate.
- During development, keep the Sails host as a comparison in separate test runs.
  No per-request fallback, dual bootstrap or simultaneous upgrade writers.
- Run focused checks per slice and broader regression at integration milestones
  and before release. Released v5 is the representative public-behavior/upgrade
  reference; Sails-plus-Prisma helps identify which change caused a regression.

## 2. Stage dependencies and working method

The default progression is P0 → P1 → P2 → P3 → P4 → P5/P6 → P7 → P8. This is not
a requirement to put an entire stage in one PR or keep all work serial. After the
pilot interfaces settle, independently verified route groups, pages and provider
conversions proceed when their task prerequisites are met. In particular, P6
authentication/CSRF and progress-socket work gates affected P5 mutations and must
start early enough to satisfy them. Keep shared configuration, instance ownership
and activation changes coherent.

Each slice implements one real behavior, checks it through its intended interface,
and updates the migration inventory. Avoid empty directory scaffolds, generic DI,
framework emulation and a duplicate full parity suite. Preserve existing repository
interfaces and ownership. Remove a bridge when its last consumer is converted.

## P0 — Capture the baseline and define qualification

**Tasks:** SR-001–SR-005. **Prerequisite:** integrated Prisma source baseline.

1. Record source versions and executable Sails references across core, storage,
   PDF/dev hooks, app configuration, migrations, templates, tests, Docker and CI.
   Inventory globals/events/helpers, route/policy resolution, native owners and
   accepted-work lifetimes. Classify source versus generated versus historical use.
2. Record installed Node/npm/Express/Sails/Companion/module resolution from the
   actual import locations. Align development/CI/build execution with Node 26;
   retain exact pins and validate consumer compatibility before removing overrides.
3. Select representative released-v5 API/browser/upgrade fixtures. Reuse existing
   Bruno, Mocha and Playwright cases; capture sanitized results for the pilot and
   critical record/form/workflow/auth paths. Do not build a second complete suite.
4. Capture configuration precedence and exceptional merge paths; identify every
   imperative `mergeHookConfig` action and hook override/bootstrap dependency.
   Record the record-type pilot's schema/concurrency/storage requirements.
5. Define the MongoDB 8/current-newer-major qualification matrix and identify the
   representative institution hook/configuration/topology needed before release.
   Record access/fixture gaps early without mistaking core fixtures for coverage.

**Exit evidence:** bounded source/owner/route inventory, version graph, selected
regression fixtures, explicit qualification scope and a recorded pilot dependency
graph. No nesting feasibility gate. No claim that the source baseline is released v5.

## P1 — Application ownership, persisted module and an early standalone host

**Tasks:** SR-006–SR-011. **Prerequisites:** P0 inventory and target execution setup.

1. Extract the persistence owner from `Sails.Application`, preserving application-
   owned groups, shared pools, operation admission, stale handles and cleanup retry.
   Move Sails shutdown/process integration into its temporary adapter.
2. Implement a small runtime interface with awaited initialization, activation,
   status and stop. Track partial acquisition and incomplete cleanup; constructors
   do no asynchronous work. Production composition owns one instance of each
   selected registration. Fresh-instance restart replaces stopped instances.
3. Inject reference repositories, configuration slices, logging and storage-
   capability operations into `RecordTypesService`. Remove global Sails/Lodash
   and base-class readiness dependencies from its transitive runtime graph.
   Preserve Observable behavior, current stored-policy reads and schema checks.
4. Prove bootstrap/create/read/cache behavior on real MongoDB, including invalid
   schema settings, strict-capability rejection, disposable `bootstrapAlways`,
   startup failure, isolation, stale handles and cleanup retry. A plain repository
   read already works today and is not the new acceptance claim.
5. Build the minimal standalone Express host around that extracted runtime. Own
   one Node server, signal adaptation and an admission/readiness gate. Use explicit
   test configuration/composition for the migrated subset; full configuration and
   the authenticated public pilot follow in P3/P4. Test initialized-but-inactive,
   bind/start failure and shutdown without opening normal processing prematurely.
6. Adapt the Sails development path to the same converted implementation and
   application-owned instance. Leave unconverted modules visibly legacy. Avoid
   loading the legacy core barrel from standalone entrypoints.

**Exit evidence:** compiled standalone runtime/host imports and operates with no
global or loaded Sails module; meaningful record-type behavior persists on real
MongoDB; lifecycle and legacy comparison checks pass. This is a partial host proof,
not complete portal startup or a deployable institution configuration.

## P2 — Async extension interface and early bundled-hook conversion

**Tasks:** SR-012–SR-018. **Prerequisites:** application ownership and pilot factories.

1. Separate installed-package discovery and awaited import from registration,
   shim generation and bootstrap. Resolve public package exports correctly; support
   ESM named/CommonJS/default exports and an ESM hook with top-level await.
2. Define the neutral v6 registration interface using real extension needs. Resolve
   one declaration set per application and preserve hook priority/fallback/view
   lookup behavior. Reject invalid/missing declarations and accidental route
   collisions. Registration remains offline and side-effect-free by contract.
3. Resolve named overrides before constructing app-owned factories. Preserve
   supported capabilities, not arbitrary Sails constructors/singletons. Limit
   factory inputs and explicitly register native resource/host integrations.
4. Convert storage and PDF registrations/lifecycle early. Remove Sails event and
   `lower()` patching dependencies; declare storage readiness, PDF jobs/fibers and
   cleanup through the runtime. Complete queue activation integration in P3 and
   HTTP/socket integration in P6 without delaying the interface proof until P8.
5. Convert development-hook registrations and the dev-tool archetype's extension
   scaffold. Publish v5-to-v6 service/controller/config/bootstrap examples. Final
   operational docs and complete generated-app qualification follow later.
6. Exercise clean packed ESM/CommonJS v6 hooks, per-app instance isolation and an
   ESM-only dependency. Documentation/registration inspection must open neither
   databases nor a listener. Do not require wholesale ESM package conversion.

**Exit evidence:** a documented v6 extension interface works with real bundled
registrations and packed fixtures; precedence is deterministic and factories are
app-owned. CommonJS compatibility means v6-compatible source, not unchanged v5 hooks.

## P3 — ReDBox configuration, complete orchestration and activation gates

**Tasks:** SR-019–SR-025. **Prerequisites:** resolved declarations and lifecycle owners.

1. Implement the explicit configuration precedence/merge rules in the design.
   Validate contributions and supported deployment inputs before finalization.
   Translate legacy exceptions deliberately; do not clone all Sails semantics.
2. Provide old-to-new deployment examples and deterministic conversion where
   useful, including `sails_*` inputs. Unsupported meaningful keys fail with their
   source/path before resources open. Redact secrets in diagnostics.
3. Separate stable startup configuration from dynamic branding/AppConfig. Move
   legacy config-time writes, asset preparation and service injection into their
   proper registrations, awaited bootstrap/migrations and artifact preparation.
4. Move orchestration to explicit stages: persistence/index readiness; required
   module initialization; lexical migrations; core bootstrap; ordered hook
   bootstrap; post-bootstrap prerequisites. Preserve schema/storage/dashboard
   dependencies. Legacy callbacks remain explicitly in the comparison adapter.
5. Gate Agenda claims, cron schedules, PDF execution, submissions and public HTTP
   until required initialization/bootstrap succeeds. Required external bootstrap
   imports are identified and awaited; they are not recurring processing.
6. Integrate every native work owner with quiesce/drain/close and scoped completion
   writes. Bound deadlines, retain resources after failure and preserve clients-
   before-pools close order. A failed stop blocks upgrade, rather than forcing it.
7. Make `persistence:indexes` and other maintenance consumers use configuration,
   registrations and selected persistence without Sails, business bootstrap or
   background activation. Reuse existing index and migration mechanisms.

**Exit evidence:** configuration conversion/precedence fixtures and stage-order
tests pass; initialization failure cannot enable normal work; cleanup retry is
observable; storage/PDF lifecycle integration is exercised. Orchestration is
Sails-free. Unconverted operations are not yet claimed to be standalone.

## P4 — Standalone authenticated record-type route group

**Tasks:** SR-026–SR-030. **Prerequisites:** standalone host, owned configuration,
pilot module, extension resolution and the pilot's authentication/policy dependencies.

1. Adapt existing route contracts to injected configuration and a minimal request
   input interface. Retain Zod/OpenAPI, supported parameter fallbacks and public
   URLs. Remove Sails request dependencies from shared validation.
2. Implement branding/portal/actor context and effective policy resolution,
   including route/controller/action/global overrides, boolean allow/deny and
   ordering. Preserve actual authorization rather than deriving it from OpenAPI.
3. Compose parsers/session/Passport/logging/request lifetime once per application.
   Handle async/Observable completion, errors and late session writes once. Begin
   real authenticated sessions here; complete all supported browser flows in P6.
4. Serve `GET /:branding/:portal/api/recordtypes` and
   `GET /:branding/:portal/api/recordtypes/get` directly through the P1 module.
   Preserve results/envelopes, API-version behavior, no-cache headers and errors.
5. Run focused real-Mongo API cases for unauthenticated, unauthorized, cross-brand,
   invalid, missing-result and failed-operation paths. Assert that no Sails
   controller or per-request fallback participates.

**Exit evidence:** both public pilot endpoints run on the standalone Express 5
host with real Prisma data and required policy/context behavior. Missing route
groups stay explicit in the development manifest; this is not full portal readiness.

## P5 — API and domain migration groups

**Tasks:** SR-031–SR-037. **Prerequisites:** proven pilot adapter and lifecycle rules.

Migrate in reviewable groups, adjusting order when recorded dependencies require it:

1. Configuration, form metadata and translation reads, then writes.
2. Reports, search, named queries and job/history reads.
3. Record reads/exports, followed by record mutations and workflow operations.
4. Identity/account administration and external integration mutations.

For each group, convert its collaborating domain modules and factory/lifecycle
dependencies. Preserve authorization, validation, concurrency, audit and known
partial-failure behavior; public-contract changes require specific migration notes.
Exercise a representative hook override and re-use the relevant existing suites.

Update the route inventory, remove the group's obsolete registrations/globals and
test its standalone import graph. Keep Express objects in adapters. Cover relevant
Express 5 matching/query/body/error/redirect/header changes, root contexts and
proxy URLs as each group encounters them. No request retry through the legacy host.

**Exit per group:** complete owned route/domain behavior is Sails-free with focused
parity/override evidence. **Exit P5:** the planned API inventory is accounted for;
browser/upload/realtime dependencies still requiring P6 are explicitly identified.

## P6 — Complete browser, upload and realtime integration

**Tasks:** SR-038–SR-044. **Prerequisites:** context/policy/lifetime interfaces and
the collaborating domain groups; independent slices may begin after P4.

- **Sessions/authentication:** preserve supported local, bearer/JWT, OIDC/AAF,
  linked/disabled-user, logout and callback/proxy behavior. Implement and document
  one-time session invalidation. Preserve account/role/audit state.
- **CSRF:** select a maintained exact-pinned replacement through compatibility
  evidence. Preserve token endpoint/header/session binding or ship coordinated
  client changes; verify exemptions, origin and invalid-token rejection.
- **EJS/assets:** port layouts, locals/helpers, translations, view/asset precedence,
  branding themes/nonces/fonts and Angular paths using packaged artifact lookup.
- **Multipart:** probe and adopt a maintained streaming parser. Preserve configured
  size/count limits, field ordering, backpressure, cancellation/staging cleanup and
  partial/unknown storage outcomes. Reuse Flydrive/GridFS ownership.
- **tus/Companion:** preserve mount paths, raw-body exclusions, upload auth,
  callback/socket integration and resumable state. Validate Companion's own
  Express dependencies rather than forcing unrelated versions to match.
- **Realtime:** use direct Socket.IO; convert virtual-request/sails.io clients,
  room authorization, endpoint/protocol and reconnect/progress behavior. Attach
  portal and Companion sockets once each and account for accepted callback work.

**Exit per slice:** success, denial, abort/reconnect and draining behavior works
without Sails helpers/events. **Exit P6:** the complete supported HTTP/background/
browser inventory has replacements, with no outstanding legacy consumer hidden by
the development host selector.

## P7 — Qualification, institution rehearsal and internal default promotion

**Tasks:** SR-045–SR-050. **Prerequisites:** complete standalone behavior and bundled
hook conversions. This stage prepares the v6 default; final release also requires P8.

1. Run the Node 26 and MongoDB 8/current-newer-major qualification matrix, including
   relevant institution topology and existing separate-datastore configurations.
   Record exact versions/FCV/artifacts; engine/FCV upgrades remain explicit prerequisites.
2. Run the broad integrated API/browser/domain regression against released-v5
   representative behavior. Review every intentional compatibility change and
   every skip/failure. Use fixtures/stubs for external services where appropriate.
3. Test clean production installs/images, public package exports, async ESM/CJS
   loading, Prisma generation/copy paths, templates/assets and generated hook apps.
   Record startup/shutdown/errors/connections and representative latency/memory
   against observed baselines and agreed tolerances.
4. Publish a concrete institution procedure: converted hooks/config; maintenance;
   single upgrader/writers stopped; consistent backups; existing index inspect/
   reviewed ensure; migrations/bootstrap; validation; activation and forced login.
   Explain partial migration failures and external-effect reconciliation.
5. Rehearse a representative institution upgrade and recovery from supported
   production artifacts. Include overrides, auth, storage, binary objects and
   deployment configuration; core-only fresh startup is not this evidence.
6. Change `npm start`/Docker defaults to the qualified standalone host in a distinct
   internal promotion change. Keep development comparison selection only until
   P8 removes the last legacy consumer; no institution release depends on it.

**Exit evidence:** a qualified complete Express candidate and reviewed upgrade/
recovery results. Full ESM package conversion is not on this critical path. An
internal default switch does not itself establish final v6 release acceptance.

## P8 — Remove Sails and qualify the final artifact

**Tasks:** SR-051–SR-055. **Prerequisites:** P7 evidence and replacements for all owners.

1. Retire shim generation and owned generated artifacts safely; do not delete
   edited institution files indiscriminately. Final hooks use neutral registrations.
2. Remove Sails/socket hooks, executable globals/types/events/config, process
   patches and obsolete dependencies. Check installed/packed/runtime graphs and
   generated output. Framework-independent packages may retain historical names.
3. Replace Sails test bootstrap and remove the temporary host selector. Update
   build/deployment/maintenance tooling and dev-tool templates; a fresh generated
   institution app must start and run its checks without installing Sails.
4. Update authoritative wiki and generated extension/reference documentation with
   implemented contracts and tested conversions. Do not publish proposed interfaces
   as already available before the implementation exists.
5. Rebuild/retest the clean final image after removal, including fresh/upgrade
   startup, restart/stop, async packed hooks and institution recovery. Close the
   inventory with evidence and record remaining release limitations explicitly.

**Exit evidence:** supported application, background, HTTP, extension, tooling and
deployment paths require no Sails installation. All bundled hooks plus the
representative institution pass on the final artifact. The v6 release evidence
covers both Prisma and runtime retirement from the supported production baseline.

## 3. First implementation stack

Keep the initial changes independently reviewable:

1. P0 inventory, Node 26 execution alignment and focused baseline fixtures.
2. Persistence owner/Sails adapter extraction with existing shutdown semantics.
3. Application initialization/activation/stop and app-owned record-type composition.
4. Real-Mongo record-type behavior/failure/isolation proof and minimal standalone
   Express host with admission closed until initialization succeeds.
5. Async extension declarations and initial storage/PDF conversions; then owned
   configuration/orchestration and the authenticated pilot.

The original nesting-first sequence is superseded. Preserve the legacy comparison
artifact during development, but do not make its compatibility adapter part of the
new module interface. Expand only after each slice's narrow proof is recorded.

## 4. Verification commands and evidence

For these planning documents, use formatting, relative-link/reference checks and
task/dependency consistency checks. Do not claim application behavior was tested.

Implementation uses existing commands where applicable:

```bash
# Focused compiled/domain/persistence checks
npm --prefix packages/redbox-core run build
npm run test:core
npm --prefix packages/redbox-core run test:persistence
npm run test:storage-mongo
npm run validate:api-routes

# Integration/API/browser checks selected for the changed behavior
npm run test:mocha:mount
npm run test:bruno
npm run test:bruno:general
npm run test:bruno:oidc
npm run test:bruno:s3
npm run test:playwright:ci

# Complete artifact and release integration checks
npm run compile:all
npm run lint
npm run test:mocha:ci
npm run docs:audit
```

Add focused runtime/Express scripts only when their tests exist. Follow the
[testing guide](../../wiki/ReDBox-Automated-Tests.md) for prerequisites, selected
paths and cleanup; destructive cleanup commands are for disposable test stacks,
never upgrade rehearsal backups or institution volumes. Index maintenance follows
[the existing operator procedure](../../wiki/Persistence-Index-Preparation.md).

Record source commit, artifact identifiers, actual host/route owner, exact versions,
commands, counts, skips/failures and limitations per stage. Real MongoDB is required
for persisted-module and ownership/drain evidence; conditional skips do not count.
Packaged tests run from installed artifacts, not convenient source-tree imports.
Institution/recovery results identify the actual hooks/configuration/topology.

## 5. Controlled implementation choices

Resolve neutral extension export names, exact runtime/library pins, multipart/CSRF
selection and provider-specific drain mechanisms through focused implementation
evidence. Record public breaks and concrete conversions as discovered. Reassess
slice size from the dependency inventory without reopening the agreed release
contract. PostgreSQL and full ESM conversion have separate plans if pursued.
