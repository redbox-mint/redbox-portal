# Sails retirement: v6 application runtime and Express design

Status: agreed direction, proposed implementation. No implementation stage,
compatibility result or release qualification is complete because it is described
here. Prepared on 2026-10-23 against `stack/waterline-4-remove-waterline`, commit
`59a5cb9a4e426b1d0e6c9f3256c089240bc5b0f2`.

Read with the [implementation plan](implementation_plan.md) and
[task list](tasks.md). This document defines the intended behavior and interfaces;
the plan defines delivery order; the task list tracks executable work and evidence.
Current source and the authoritative [wiki](../../wiki/Home.md) establish existing
behavior. Older persistence specifications contain superseded decisions; use the
current [persistence migration guide](../../wiki/Persistence-Migration.md).

## 1. Outcome and agreed scope

ReDBox v6.0 replaces Sails with a ReDBox-owned application runtime and a standalone
Express 5 host. Prisma persistence and Sails retirement ship in the same major
upgrade. Integrating the Prisma code stack first is an implementation prerequisite,
not a requirement that institutions install an intermediate development release.

The retirement implementation targets Prisma over MongoDB 8+. A potential
PostgreSQL migration is a separate task, even if considered before the v6 release.
It does not add relational adapters, data conversion or speculative portability
abstractions to this task. Domain modules continue using the existing repositories.

The supported Node major is **26**. Development, compilation, CI, Docker and
institution guidance must use a consistent, exact-qualified patch and compatible
npm/tooling versions. The framework target is **Express 5**, not Express 6.
Dependency changes use exact versions, including new CSRF or multipart packages.

### 1.1 Compatibility contract

- Preserve externally used HTTP URLs, response envelopes, status codes and normal
  record/form/workflow behavior by default. Specific breaks are permitted where
  compatibility materially complicates retirement; record their rationale,
  affected consumers and concrete migration before release. This is not a general
  public API redesign.
- Institutions must make hooks v6-compatible. Preserve supported extension
  capabilities and deterministic precedence, rather than unchanged Sails-dependent
  hook source. Separate v5/v6 hook releases are acceptable.
- Replace Sails deployment conventions with an explicit ReDBox configuration
  contract. Preserve meaningful settings and provide conversion guidance/tooling;
  unsupported inputs produce actionable errors.
- A one-time forced login is acceptable. Preserve supported authentication methods,
  identity/account-linking behavior, authorization and tenant isolation. Keeping
  Sails session serialization readable is not an acceptance requirement.
- A maintenance window is acceptable. Stop the old deployment before upgrading;
  mixed-version rolling operation is not a release promise for this migration.
- Recovery may require a consistent pre-upgrade backup of databases, binary
  objects, configuration and hook artifacts. Restarting the old image against
  state already used by v6 is not a promised recovery mechanism.
- Existing Angular applications and EJS pages remain consumers of the new host.
  Coordinated integration changes, such as socket or CSRF client wiring, are
  permitted and documented; a general frontend migration is outside this task.

### 1.2 Distinct outcomes

1. **Runtime extraction:** migrated modules initialize, perform their operations
   and stop without importing or constructing Sails.
2. **HTTP/realtime retirement:** the standalone Express host supplies all supported
   portal behavior without Sails helpers, events, sockets or generated shims.
3. **Async module support:** awaited native loading supports ESM-only dependencies,
   top-level await and v6-compatible CommonJS hooks early in development.

Complete conversion of every server package to ESM is independently deliverable.
It does not block retirement when the required async loading works. Do not flip
the root package to `type: module` merely to introduce the first dynamic import.
Keep CommonJS tooling explicit where needed; avoid dual builds without a consumer.

### 1.3 Recorded HTTP compatibility breaks

- The authenticated record-type API pilot returns **401** with a Bearer challenge
  for absent/invalid authentication, instead of legacy login redirects/path-rule
  denials. Affected consumers are unauthenticated callers of the two exact pilot
  URLs. Supply a valid bearer credential or a new authenticated browser session.
  This keeps the API authentication requirement explicit and avoids HTML redirects
  being mistaken for successful API responses.
- Those pilot routes also require membership in the requested brand through the
  explicit `brandActor` policy, including on paths without a matching rule. Clients
  previously using another tenant's credential must receive an approved membership
  for the target brand. This prevents a missing path rule granting cross-tenant API
  access. `checkAuth` itself preserves legacy unruled-path access and anonymous
  default roles; public routes do not inherit the pilot's membership policy.
- Operational authentication/repository failures return sanitized errors; clients
  must not depend on datastore/provider exception text. Orphan/cyclic linked aliases
  fail authentication; administrators must repair their primary-account linkage.

SR-031's matching/unruled, anonymous/default-role, redirect/JSON/schema and event
tests supersede P4's provisional missing-rule denial and per-request rule-query
behavior. Cached rules refresh at bootstrap or explicit `loadRules()`, as in the
legacy service. Evidence: [route-group acceptance](route-group-acceptance.md) and
[SR-031 results](evidence/p5-route-groups.md).

## 2. Observed starting point

These observations identify seams, not completed migration evidence.

- [app.js](../../../app.js) loads core, generates shims and lifts Sails. The
  [loader](../../../packages/redbox-core/src/loader/index.ts) combines hook
  discovery, synchronous loading, registration and generated CommonJS files.
- [Service exports](../../../packages/redbox-core/src/services/index.ts) cache
  exported instances at module scope. [CoreBase](../../../packages/redbox-core/src/CoreBase.ts)
  starts imports from its constructor and discovers logging/lifecycle globally.
- [Persistence runtime](../../../packages/redbox-core/src/persistence/runtime.ts)
  already owns clients, pools, operations and resources on a supplied owner.
  [Group runtime](../../../packages/redbox-core/src/persistence/groupRuntime.ts)
  rejects stale handles and can use an explicit owner instead of global `sails`.
  The existing [foundation integration fixture](../../../packages/redbox-core/test/integration/PersistenceFoundation.test.ts)
  already constructs a plain owner. A standalone repository read is therefore
  insufficient proof of a newly extracted application runtime.
- [RecordTypesService](../../../packages/redbox-core/src/services/RecordTypesService.ts)
  combines reference repositories with global configuration, logging, Lodash,
  inherited initialization and storage-capability lookup. Its bootstrap can
  replace configured definitions, validates schema settings and checks strict
  concurrency support. Those behaviors belong in the first persisted-module proof.
- [Bootstrap](../../../packages/redbox-core/src/bootstrap.ts) and its
  [shim adapter](../../../packages/redbox-core/src/loader/bootstrapShimRuntime.ts)
  initialize services before migrations, then run core/hook/post-bootstrap work.
  Current readiness callbacks can start queue processors and schedules. PDF work
  has additional shutdown behavior outside the persistence resource registry.
- [ConfigService](../../../packages/redbox-core/src/services/ConfigService.ts)
  performs imperative work as well as merging: application-data writes, asset
  copying and service/controller installation. Generic Lodash merge, branding
  array replacement and Agenda job-name merging are distinct behaviors.
- [Route contracts](../../../packages/redbox-core/src/api-routes) already own
  Zod validation and generated OpenAPI. Runtime resolution and extraction still
  depend on Sails types/configuration. The
  [HTTP config](../../../packages/redbox-core/src/config/http.config.ts) also
  contains process-level middleware caches and lazy Sails-dependent setup.
- The source snapshot resolves different Sails, Express and Companion versions
  from root and core. Core declares Express `5.2.1`; the current Sails listeners
  use Express 4. Companion's root override also differs from its requested Express
  version. Re-record this graph after integration rather than copying assumptions.
- Node configuration is inconsistent: development/CI select 24, Docker selects
  26, and older wiki material mentions 20. Node 26 alignment is migration work,
  not a claim that existing checks already run on that target.

Default Prisma storage representations remain in place. Existing migration/index
tooling supplies specific backfills and preparation; this task does not require a
new bulk migrator, distributed migration framework or transaction mechanism.

## 3. Modules and dependency direction

Use modules inside `packages/redbox-core/src/` initially, extracting new packages
only when real consumers require them:

- `application/` owns application construction, lifecycle, readiness, instance
  composition and resource ownership. Its implementation hides stage ordering and
  cleanup details behind a small interface.
- `extensions/` discovers installed packages, awaits loading, resolves registrations
  and precedence, and reports invalid extension contracts.
- `http/express/` implements request context, policies, route adaptation, rendering,
  middleware and integration with the Node server.
- `compat/sails/` temporarily adapts the legacy host to extracted modules. Only this
  adapter may translate remaining Sails lifecycle/global assumptions.
- Existing persistence/domain modules retain their locations. Each accepts its
  needed configuration, repositories and collaborating operations explicitly.

The dependency direction is host → runtime composition → domain/repositories.
HTTP adapters call domain operations; domain modules do not import Express,
Sails, request types, response helpers or the compatibility directory. Extension
contracts distinguish domain overrides from HTTP handlers. Do not create a generic
DI container, generic HTTP framework interface or Sails-shaped replacement object.
HTTP-independent operations are enough to permit a later framework evaluation.

Constructors do synchronous wiring. Awaited methods perform asynchronous setup.
An internal application-owned instance map may compose named registrations; it is
not passed unrestricted to every module. Factories receive typed, narrow inputs.
Remove converted instances from the process-wide cache instead of adding a second
registry with independent ownership.

### 3.1 Proposed lifecycle interface

The following is a design sketch, not an existing exported interface:

```typescript
interface Application {
  initialize(): Promise<void>;
  activate(): Promise<void>;
  stop(options?: { deadlineMs?: number }): Promise<void>;
  status(): ApplicationStatus;
}
```

Construction receives resolved startup configuration, resolved registrations and
logging. Runtime composition supplies repositories and concrete collaborators to
the registered factories. The HTTP host keeps the instance and exposes a simpler
startup/shutdown interface to deployment entrypoints. Maintenance consumers use
only the persistence/configuration composition they need, without business
bootstrap, `activate()` or an HTTP listener.

`initialize()` completes persistence readiness, service initialization, migrations
and required bootstrap. `activate()` enables normal processing only after those
prerequisites and host preparation succeed. Keeping the methods distinct serves
actual host and maintenance/test requirements; it is not a configurable general
workflow engine. Exact exported names and types are finalized against the pilot.

### 3.2 Instance and state rules

- Each application owns its configuration snapshot, factories, instances, caches
  and resource registrations. Production has one host/runtime per process.
- Repeated concurrent initialization or stopping joins the in-flight operation;
  it does not construct duplicate resources. Activating before initialization is
  an explicit error. Admission stays closed after a stop has begun.
- A stop during initialization prevents activation, stops entering new stages and
  waits for in-flight acquisition/work to settle before cleanup. It cannot race
  client creation against pool closure. Cancel safe work where supported; preserve
  ownership for non-cancellable effects until they settle or stop fails observably.
- Readiness distinguishes construction/initialization, initialized-but-inactive,
  active, stopping, stopped and failure. A failed stop records retained resources;
  it must not report clean shutdown.
- A successfully stopped application is terminal. Restart uses a fresh instance.
  Cleanup failure may be retried on the same instance but does not permit a new
  start over retained clients or pools.
- Tests construct isolated runtime instances and detect cross-instance caches or
  repository leakage. This does not add a supported multi-portal production host.

## 4. Startup, activation and failure behavior

### 4.1 Required sequence

1. The host reads installation identity/environment selection and discovers the
   installed extension set. Await package loading and collect declarations.
2. Resolve configuration contributions, normalize supported deployment inputs,
   validate them and finalize startup configuration. Resolve named registrations
   and detect missing prerequisites or invalid overrides.
3. Establish application-owned persistence and resource ownership. Startup inspects
   required indexes; DDL remains an explicit maintenance action.
4. Construct and initialize modules needed by migrations/bootstrap. Declare queue
   handlers and schedules without enabling claims, timers or normal submissions.
5. Run pending migrations through the existing ledger in lexical name order.
6. Run core bootstrap, ordered extension bootstrap and post-bootstrap initialization.
   Make storage capability, record-type, schema contributor and dashboard
   dependencies explicit. Preserve known ordering before simplifying it.
7. Prepare HTTP middleware/routes, views and socket integrations against one
   server. Required listeners/resources must be able to initialize with admission
   closed. Complete all required readiness checks.
8. Activate the prepared application and host. Open public admission and normal
   queue/schedule processing only after required prerequisites succeed.

Readiness is an admission condition, not just a log message or Sails event.
The host may bind behind a closed admission gate when a library requires a server
before final preparation; that must not expose normal routes or job submission.
No normal consumer may treat module import, construction or a registration callback
as permission to begin work.

### 4.2 Bootstrap side effects

Initialization/bootstrap is not read-only. Required core-data writes, schema setup
and configured vocabulary imports may perform persistence or network work, but
they must be named, awaited stages with failure behavior. Distinguish them from
recurring jobs, external publishing, queue consumers and public requests, which
remain inactive. A maintenance command must not accidentally invoke business
bootstrap simply because it imports core.

Migrations and hooks must not rely on an active public listener. A hook needing an
outbound callback or integration during bootstrap must identify that prerequisite
explicitly and provide a safe upgrade procedure; do not silently activate the
whole portal to satisfy it.

### 4.3 Failure handling

Before activation, failure leaves normal admission closed and initiates awaited
cleanup of everything acquired so far. Register cleanup immediately after
acquisition so partial startup is covered. Preserve the original failure and
report cleanup failures separately, with sanitized resource/stage identifiers.

Activation is not a distributed transaction. Prepare resources before opening
admission; if activation partially fails, close admission, deactivate participants
already started and drain/clean up. Report any effects already emitted rather than
claiming rollback. Failures after successful activation are runtime failures and
must affect readiness when required resources become unavailable.

## 5. Resource ownership and shutdown

Keep the existing persistence ownership, stale-handle and admission guarantees.
Replace the `Sails.Application` owner type with the minimal structural contract
actually required by persistence. Move Sails shutdown/process adaptation into the
temporary adapter; ordinary runtime construction never installs OS handlers.

The host installs signal handlers once and coordinates HTTP/server shutdown with
the same application's resources. The stop sequence is:

1. Mark unready and refuse new HTTP, socket application events, uploads, queue
   submissions and schedule execution. Stop claiming new background jobs.
2. Quiesce producers and drain accepted requests, callbacks, session writes,
   byte streams, jobs and scoped completion/audit/backend writes.
3. Detach/close socket integrations, queue backends, streams and other native
   resources once their accepted work has settled.
4. Close Prisma clients, then shared pools, preserving existing ownership order.
5. Report clean stop only when every required owner has completed cleanup.

Reuse accepted-work scopes; do not count an HTTP `finish` or disconnected socket
as proof that associated database work is finished. An aborted transport may cancel
safe, cancellable work; already-accepted writes and their cleanup retain ownership
until settled. Completion writes needed by draining jobs remain permitted within
their admitted scope, while unrelated new operations are rejected.

Deadlines are bounded and configurable. Agenda currently uses a 30-second default;
capture actual defaults and align the documented host/container grace periods.
Do not silently replace them with an infinite wait or assume all uploads fit that
deadline. On timeout or cleanup failure, retain resource ownership for retry,
surface the incomplete stop and block the upgrade procedure. Do not close pools
under work that still needs them. Forced process termination is an explicit
operator recovery path with possible partial effects, not successful draining.

PDF generation/retry fibers, Companion transfers, tus/multipart streams, GridFS,
sessions and socket callbacks must each have a real owner. Merely attaching them
to the server is insufficient. Avoid a second global drain registry where the
existing owner can register the resource directly.

## 6. Configuration interface

### 6.1 Resolution and finalization

Own a documented ReDBox configuration interface rather than recreating every
Sails setting. The intended precedence, from low to high, is:

1. Core defaults.
2. Extension contributions in low-to-high hook precedence.
3. Application configuration.
4. Selected environment configuration.
5. Local deployment overrides.
6. Supported environment-variable inputs.
7. Explicit supported command-line inputs.

Capture the legacy paths first. If a deployed input differs from this order, the
conversion must make that difference explicit and demonstrate its v6 equivalent.
Do not introduce an undocumented precedence change while extracting the loader.
Configuration loading is awaited but must not open persistence or start workers.

For the new interface, merge ordinary objects recursively and replace ordinary
arrays. Define intentional domain rules separately, including Agenda jobs keyed
by name and branding defaults. Functions are accepted only in supported typed
extension/configuration positions; retain approved executable values rather than
serializing them through JSON. Null/undefined and unknown keys follow their
declared validation rules, with errors identifying the source and path.

All contributions and derived startup values are finalized before consumers
initialize. Modules receive stable slices; they must not depend on later mutation
of the whole configuration object. Required values discovered from initialized
resources belong behind an explicit collaborator, not an implicit config patch.

### 6.2 Dynamic settings

Brand-specific application settings, themes and administrator-edited state remain
dynamic through their existing application operations/repositories. Preserve
request-time brand resolution and cache invalidation. Do not freeze dynamic
database-backed settings into the startup snapshot or let dynamic settings mutate
transport/client ownership secretly.

Split `mergeHookConfig` responsibilities: declarations contribute startup values;
asset preparation follows an explicit build/install or awaited preparation path;
application-data writes belong to migrations/bootstrap; factories supply overrides.
Await writes that previously escaped tracking. Configuration diagnostics redact
secrets, credentials and tokens; an old raw debug export is not a safe default.

### 6.3 Deployment migration

Publish old-to-new examples for datastore/session/auth/proxy/root-context/storage
settings, custom environment files and `sails_*` inputs. Classify each legacy key
as retained, renamed/converted or unsupported. A small deterministic conversion
tool may help; a permanent loader for arbitrary Sails semantics is not required.
Unsupported meaningful inputs fail before starting resources, rather than being
ignored. Secret-bearing values stay in the institution's secret/config channels.

## 7. Extension interface and migration

### 7.1 Discovery and loading

Discover extensions from the actual installed dependency tree and resolve their
public entrypoints/package exports. Do not assume source directories or exported
`package.json` files. Await native `import()` and deliberately normalize ESM named
exports and CommonJS/default exports. Include packed fixtures with top-level await
and ESM-only dependencies so Node interop does not mask synchronous-loader bugs.

Resolve one registration set per application. Registration declares configuration,
module factories, routes/policies, forms/workflows, migrations, bootstrap work and
view/asset locations as needed. It does not acquire repositories, create clients,
write application data or start processors. Offline documentation/build consumers
can inspect registrations without database credentials or a listener.

The exact neutral export/manifest names and contract version are finalized using
the storage/PDF pilots and documented before external conversion. Retain existing
logical registration names where useful, but do not make `sails` manifest metadata
or generated shims part of the final interface. Temporary translation belongs in
the compatibility adapter and is removed with it.

### 7.2 Precedence and overrides

Preserve `hookLoadPriority`: the first listed hook has highest precedence; listed
hooks outrank unlisted hooks; unlisted hooks retain deterministic package-name
fallback. Merge contributions low-to-high; view/asset lookup searches high-to-low.
Migrations retain lexical name execution rather than hook priority execution.

Named supported module/controller overrides resolve before construction, and the
winning factory is instantiated once for that application. No core instance is
created only to be discarded behind a hook override. Diagnose duplicate entries
within one provider, missing dependencies and invalid replacements at startup.
Retain route-registry uniqueness checks: an intended route replacement must use
the supported named replacement mechanism and retain or deliberately revise its
contract/policies; accidental method/path collisions must not depend on mount order.

Hook factories receive the concrete repositories, operations and configuration
their implementation needs. Do not expose a universal container as every hook's
default input. Detect declared dependency cycles; convert legacy event-driven
cycles into explicit staged work rather than preserving untracked event races.

### 7.3 Host integration

Hooks can register Express-native HTTP handlers and middleware at explicit stages.
Registered handlers participate in the host's context, policy and accepted-work
rules. Support intentional public routes explicitly rather than accidentally
inheriting no authorization from registration order.

Server integrations such as upload/socket providers use a narrow host capability
only when a real implementation needs it. They declare initialization,
activation/admission and cleanup. They do not call `listen()`, install independent
signal handlers or create hidden process-wide clients. The interface is not a
sandbox for arbitrary extension code; it defines supported behavior and what
qualification must exercise.

### 7.4 Early conversion evidence

Convert storage and PDF hooks before broad API migration. Storage exercises
repository/capability readiness; PDF exercises configuration, overrides, job
declarations, lifecycle callbacks and shutdown. Remove direct `sails.lower()`
patching and event-dependent activation. HTTP/socket details may follow in their
own slices, but the lifecycle interface must already express their ownership.

Publish before/after examples for services, controllers/routes, configuration,
bootstrap/migrations, forms/contributors, assets/views and native resources.
CommonJS hooks remain supported when they implement the v6 interface. The bundled
development hook, PDF hook, storage hook and dev-tool archetypes must all be ported
before release. A representative institution conversion is additional evidence.

## 8. Standalone Express host and HTTP contracts

### 8.1 Early host and development comparison

Build a standalone Express host early, against the extracted runtime. Initial
test compositions contain only the migrated module set; they are not complete
portal deployments and must not be advertised as production-ready.

The legacy Sails host remains a development comparison while unconverted groups
exist. A temporary harness selection starts one host per process. Compare hosts
in separate test runs or explicitly isolated fixtures; never concurrently migrate
or bootstrap shared upgrade data. There is no request-level retry/fallback to
Sails. An unimplemented Express route is reported as such/404 in the partial test
composition, rather than dispatched to a legacy controller.

The route inventory records migrated groups and expected remaining routes. It is
an implementation/evidence manifest, not a production split router. Express-in-
Sails nesting may be explored if it demonstrably helps development, but it is not
a prerequisite, supported deployment state or delivery gate.

### 8.2 Contract and policy adaptation

Retain the Zod/OpenAPI route registry as the source of public route contracts.
Extract validation from the minimum request input shape: path/query/body/headers
and documented legacy parameter precedence. Adapt runtime configuration through
explicit inputs. Generated OpenAPI security descriptions are not policy execution.

Resolve effective route/controller/action/global policy settings, including
boolean allow/deny, overrides and chain order. Normalize supported legacy policy
configuration into the v6 interface where necessary. Apply brand/portal context,
authentication, authorization, CSRF and input validation in the characterized
order for each route class. Cross-brand checks must use the authenticated actor,
not a trusted request-supplied identity.

HTTP adapters translate validated inputs and actor/brand context into domain
arguments. They own Express responses and map domain outcomes to the existing
envelope. Do not invoke Sails controller actions as the domain implementation or
pass `req`/`res` through the extracted operation interface.

### 8.3 Middleware and completion

Prepare middleware once per application, removing module-scoped session,
Passport, parser and Companion caches. Install a documented order with explicit
parser exclusions for raw/tus/multipart/Companion paths. Parsing, session loading,
logging and request admission occur once for each supported request path.

Preserve request context and logging across callbacks, promises and Observables.
Define each adapter's result semantics: ordinary single-result endpoints complete
once; streaming/progress operations have their own lifetime. Do not universally
take the first Observable emission or release admitted work when a client closes.
Handle thrown errors, rejected promises, validation failures, session-save errors
and errors after headers are sent without a second response or fallback dispatch.

Cover Express 5 route syntax and behavior: wildcard/optional parameters, slash-
containing translation keys, decoding/traversal, trailing slashes, query parser
selection and read-only `req.query`, missing bodies/coercion, HEAD/OPTIONS, async
errors, redirects, static dotfiles, cache/content-type headers and proxy/root URLs.
Preserve external paths even when internal match patterns change.

### 8.4 First authenticated route group

Migrate `GET /:branding/:portal/api/recordtypes` and
`GET /:branding/:portal/api/recordtypes/get` using the extracted record-type module.
Preserve API-version behavior, field selection, no-cache headers and error/result
envelopes. Cover valid/missing definitions, unauthenticated and unauthorized actors,
cross-brand input, malformed input and repository failure. Evidence identifies
the actual standalone host and proves legacy controller actions are not invoked.

## 9. Browser, upload and realtime behavior

### 9.1 Identity and browser security

Construct Passport and session middleware per application. Preserve local login,
bearer/JWT, supported OIDC/AAF callbacks, disabled/linked account handling, logout,
rotation, proxy HTTPS and trust-proxy behavior. The upgrade procedure deliberately
invalidates old sessions, including browser/socket handling; identity mappings,
roles, consent and audit state remain intact. Document cookie changes and retained
upload-related state separately from the allowed forced login.

Replace Sails CSRF with a maintained exact-pinned implementation after a focused
probe. Preserve the Angular token endpoint/header contract and session binding, or
deliver coordinated client changes in the same slice. Verify missing/invalid token,
cross-origin, exemption and authorization behavior. Preserve CSP nonces and
record-schema/admin policies; enabling a new HTTP host must not weaken them.

### 9.2 Pages and static artifacts

Replace `res.view()` explicitly with EJS rendering. Preserve layouts, partials,
locals/helpers, translations, hook lookup precedence, brand themes, immutable font
delivery and Angular/static paths. Use packaged asset resolution instead of
assuming a source checkout or writable production package directory. Account for
institution root-context/proxy URLs and browser cache behavior.

### 9.3 Uploads

Choose a maintained streaming multipart parser through a focused compatibility
probe. Preserve configured size/count limits, field-before-file expectations,
backpressure, staging/cleanup and partial/unknown storage outcomes. Exercise
oversize input, disconnects, invalid metadata and failed downstream writes as well
as successful upload. Replace Skipper consumers only after their routes move.

Keep tus and Companion as explicit mounts with parser exclusions, authentication,
brand/record authorization, callback paths and owned transfer cleanup. Reuse
Flydrive/GridFS ownership. Audit Companion's own Express/socket dependency graph;
do not force every Express copy to one version without validating its consumer.
Session invalidation does not authorize silently losing resumable-upload state.

### 9.4 Realtime

Replace `sails.sockets` with direct Socket.IO. Inventory `sails.io.js` and virtual
request clients and convert their integrations explicitly. Preserve or coordinate
endpoint/protocol, room naming, session/authentication, reconnect and progress
events. Authorize room joins for the actual record and brand. Distinguish portal
progress sockets from Companion sockets; attach each once to the host's server.
Draining gates new work/joins while permitting tracked completion reporting.

## 10. Persisted-module proof

Keep `RecordTypesService` as the first domain module unless the recorded dependency
inventory establishes a concrete reason to change it. Inject reference repositories,
startup slices, logging and storage-capability operations. Replace global Lodash
access with explicit imports or simple native operations where appropriate.

Exercise the module through its intended interface with real MongoDB:

1. Create/bootstrap configured definitions, reload them and read/list with the
   existing Observable result semantics and brand scoping.
2. Preserve configured `bootstrapAlways` behavior in disposable fixtures, cache
   population, record-schema validation and malformed configuration failures.
3. Preserve strict concurrency/storage-capability rejection. Resolve policy from
   current stored definitions so administrative changes are not frozen at startup.
4. Fail during initialization/bootstrap and prove acquired resources are cleaned
   up or retained observably when cleanup itself fails.
5. Test repeated/concurrent stop, fresh-instance restart, stale-handle rejection
   and isolation of application-owned caches/instances.
6. Import a narrow compiled/packed entrypoint with `global.sails` absent and no
   Sails module loaded through a transitive barrel. A separate temporary Sails
   adapter uses the same converted implementation and instance for its host.

Do not claim the pilot makes every queue/session/upload/module standalone.
Expand that claim only as its dependencies and accepted-work owners migrate.

## 11. v6 upgrade and recovery procedure

The institution path begins at the supported production release, not this source
commit. Released v5 supplies representative public-behavior/upgrade fixtures;
Sails-plus-Prisma is useful intermediate evidence for diagnosing either migration.
Capture sensitive deployment fixtures only in sanitized or institution-owned form.
Run the released-v5 comparison artifact on its own supported runtime; Node 26 is
the target for v6, not a retroactive requirement for running the baseline.

### 11.1 Preparation

Inventory and convert the institution's hooks/configuration; identify exact old/new
artifacts, Node/Mongo/FCV/topology, datastores and binary storage. ReDBox supports
MongoDB 8+ for this task, but the runtime's major-version guard is not qualification
of every topology or future version. Qualify MongoDB 8 and the selected current
newer major, with the representative institution's topology, before release.
Document further qualified combinations explicitly.

Required engine/FCV upgrades are operator prerequisites with their own supported
procedure, not a side effect of application startup. They do not imply replica-set
conversion, transactions or a PostgreSQL migration. Align exact Node 26, image,
package and hook versions and ensure recovery artifacts are available.

### 11.2 Maintenance and startup

1. Enter maintenance; stop old hosts, consumers and all other writers. Drain
   requests, jobs and byte streams. A failed drain blocks the procedure.
2. Capture a consistent checkpoint of both logical databases, indexes, binary
   objects, deployment configuration and hook/application artifacts. Record the
   external-effect reconciliation point and expected loss window.
3. Install the v6 artifacts and converted configuration/hooks without normal
   business startup. Run the existing `persistence:indexes -- --inspect` procedure;
   review and perform explicit `--ensure` only as required, then inspect again.
4. Start one designated v6 instance. Run existing ledger migrations, required
   bootstrap and validation before enabling normal traffic/integrations/jobs.
   A rehearsal can validate an isolated initialized host before its activation.
5. Confirm record/form/workflow reads and writes, authentication, storage and
   extension behavior; reopen normal operation and explain forced login.

The index coordinator does not repair documents or drop conflicting indexes;
ensure is not atomic across groups. Migrations record success after the body,
have no cross-instance body lock/transaction, and can leave partial writes on
failure. Reconcile an unrecorded body's effects before retry. Preserve migration
names/ledger history; do not erase records to replay destructive work.

### 11.3 Recovery

Before reopening normal processing, failures may be handled by reconciliation and
retry or restoration of the consistent checkpoint with matching artifacts. After
normal writes/external effects resume, prefer forward fixes. Restoring the old
checkpoint can lose later changes and requires external-effect reconciliation.
Optional manual `down` handlers and a temporary host selector do not provide an
automatic rollback. Rehearse the chosen restoration path, including binary objects
and configuration, rather than proving only a database restore.

## 12. Verification and release evidence

Use focused checks during early v6 development and broad regression before
release. Reuse existing suites; avoid a second complete test suite for host parity.
Exact script invocations and task dependencies are in the plan and task list.

Required evidence includes:

- Runtime/real-Mongo proofs, failure cleanup and resource drain/retry semantics.
- A standalone authenticated pilot and each subsequent route/domain group.
- Configuration conversion/precedence and offline ESM/CommonJS packed fixtures.
- Converted storage/PDF lifecycle and all other bundled hooks/archetypes.
- Supported identity, CSRF, pages/assets, upload, realtime and proxy behavior.
- Clean production installs/images with generated Prisma and frontend/view assets.
- Node 26 and explicitly qualified MongoDB 8+ versions/topologies.
- Fresh startup and a released-v5 institution upgrade/recovery rehearsal with
  overrides, authentication, storage and real deployment configuration.
- Representative startup/shutdown, error-rate, connection-count, latency and
  memory comparisons. Establish tolerances from observed baselines before cutover;
  do not invent performance guarantees in this design.

Each result records source/artifact versions, host, commands, counts, skips,
failures and limitations. Conditional tests skipped for missing Mongo credentials
do not count as real-Mongo evidence. A successful core fixture does not qualify an
institution or deployment topology that was not exercised.

## 13. Retirement and remaining engineering checkpoints

Before default promotion, the standalone host must contain the complete supported
route/background inventory. Remove Sails, socket hooks, generated shims, global
declarations, process patches and legacy host selectors only after their consumers
have replacements. Inspect installed/packed trees and generated output as well as
source imports. Package names containing `sails` may remain when their runtime is
framework-independent; renaming packages is separate work.

Update authoritative wiki architecture, loader/extensions, services/controllers,
configuration, development, testing, installation and upgrade guidance alongside
implemented behavior. Classify supported extension interfaces in generated
reference documentation and provide validated conversion examples.

Implementation resolves exact qualified pins, neutral registration names/types,
CSRF/multipart selection, provider-specific drain integration and the representative
institution fixture. These are bounded engineering checkpoints with recorded
evidence, not reasons to reopen agreed scope or require approval for routine work.
Any proposal to add PostgreSQL, broaden compatibility promises or change release
scope is a separate design change.

## References

- [Architecture](../../wiki/Architecture-Overview.md),
  [services](../../wiki/Services-Architecture.md),
  [controllers](../../wiki/Controllers-Architecture.md),
  [loader](../../wiki/Redbox-Loader.md),
  [configuration](../../wiki/Configuration-Guide.md).
- [Persistence migration](../../wiki/Persistence-Migration.md),
  [index preparation](../../wiki/Persistence-Index-Preparation.md),
  [data migrations](../../wiki/Data-Migrations.md),
  [backup/recovery](../../wiki/Cache-Persistence-Recovery.md).
- [Automated tests](../../wiki/ReDBox-Automated-Tests.md) and
  [generated reference documentation](../../wiki/Generated-Reference-Documentation.md).
- [Express 5 migration guide](https://expressjs.com/en/guide/migrating-5.html).
