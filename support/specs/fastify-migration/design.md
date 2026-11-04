# Fastify host and controller design

Status: agreed design, 2026-11-04. Implementation and qualification are pending.

## 1. Outcome and scope

V6 will use Fastify as its sole first-party HTTP host. Explicit controller classes
with named actions replace Express route-group dispatch. Controllers use typed
Fastify request/reply objects directly and receive concrete constructor inputs.
The application runtime continues to own domains, persistence, initialization,
workers, accepted work, and dependency-ordered cleanup.

Success means observable HTTP behavior is specified and tested, controller wiring
is explicit, and supported API/browser behavior remains compatible. Performance
is a regression gate, rather than the primary reason for changing frameworks.

The final composition contains Express only where Uppy Companion demonstrably
requires it. There will be no general Express compatibility plugin, public Express
handler contract, first-party Express host option, or middleware bridge for
authentication. During development the existing production entrypoint remains
usable until the Fastify composition qualifies. After cutover, rollback uses the
preceding build, rather than a host-selection switch in the new release.

Fastify ships within v6, with release planning aimed at late 2027. Qualification
must pass before release. This migration does not add direct TLS/HTTP2 hosting,
cross-replica transfer continuity, a dependency-injection container, decorator or
filesystem action discovery, or a persistent-data migration solely for transport.

## 2. Decision record

The following decisions were explicitly accepted in the design discussion.

| Questions | Agreed decision |
| --- | --- |
| Q1 | Explicit HTTP correctness and controller ergonomics; performance regression gate. |
| Q2 | Preserve documented and supported client behavior; document deliberate breaks and affected callers. Do not reproduce every accidental Express quirk. |
| Q3 | Deferred listening is acceptable; update startup probes. |
| Q4 | Subclass-and-replace is sufficient; no independent action-replacement registry. |
| Q5 | Ship in v6, with time for full qualification. |
| Q6 | Preserve case-insensitive existing routes, optional trailing slashes, explicit HEAD-policy precedence, and pre-listen collision rejection. |
| Q7 | Preserve supported nested inputs, duplicate-key behavior, limits, Zod validation, and error envelopes. No silent coercion or response-field filtering. |
| Q8 | One-time forced login is allowed; preserve session security and ownership. |
| Q9 | Extension API v2; actionable rejection of API v1. |
| Q10 | Preserve controller/action identities initially, separate browser and API controllers, split by concrete responsibility, no initial base class. |
| Q11 | Maintenance-window upgrade, rollback to the preceding v6 build, no transport-driven persistent-data change. |
| Q12 | Authenticated read/write, session persistence, raw upload, socket upgrade, Companion tracking, and retryable shutdown must work before mass conversion. |
| Q13 | Companion may require process restart after full stop; cleanup retry within shutdown remains required. |
| Q14 | Controller replacement preserves route policies and validation; policy changes require explicit route replacement. |
| Q15 | Typed factory inputs and explicit application bindings; export core controller input interfaces. |
| Q16 | Immutable brand/portal/optional actor context; brand-scoped roles; action-specific validated input and shared language resolver. |
| Q17 | Preserve default deny and existing route-specific policy/CSRF/validation ordering. |
| Q18 | Scoped named hooks by default, explicit global hooks, deterministic ordering, and separate fallback contributions. |
| Q19 | Quiesce, drain, and retry cleanup while retaining ownership after deadline; deployment tooling owns eventual forced termination. |
| Q20 | Fresh final-source and final-artifact gates, including a real institution hook. |
| Q21 | Remove first-party Express composition at cutover; Companion is the only justified exception. |
| Q22 | Repeatable deterioration above 10% in p95 latency or throughput blocks cutover pending investigation and explicit acceptance. |
| Q23 | HTTP/1.1 behind the existing reverse proxy; preserve proxy trust and canonical origin. |
| Q24 | Preserve existing process topology and document affinity/restart requirements. |
| Q25 | Native Passport integration or direct provider bindings are allowed; all provider/security behavior must survive without an Express bridge. |
| Q26 | Fresh local WSU qualification is an implementation gate; production acceptance remains institution-owned and separately recorded. |

## 3. Current boundaries and evidence

Start implementation from the actual integrated Sails-retirement tip, recording
its SHA and any later base changes. The proposal's `f7ebc45fb` source reference is
historical context, not a fixed implementation base or Fastify evidence.

Relevant existing implementation:

- [ExpressHost](../../../packages/redbox-core/src/http/express/ExpressHost.ts)
  listens before initialization/preparation. Health is available during startup;
  ordinary requests are gated. Deferred listening intentionally changes this.
- [Portal HTTP composition](../../../packages/redbox-core/src/application/portal/http.ts)
  binds selected domains, policies, authentication, pages, assets, and integrations.
- [Application runtime](../../../packages/redbox-core/src/application/Application.ts)
  owns startup and retryable stop. A stop deadline retains cleanup ownership.
- [Request lifetimes](../../../packages/redbox-core/src/middleware/requestLifetime.ts)
  retain work after response completion and disconnect, including session work.
- [API route contracts](../../../packages/redbox-core/src/api-routes/types.ts)
  carry controller/action, validation, policies, and response documentation.
- [Extension contracts](../../../packages/redbox-core/src/extensions/contract.ts),
  [resolution](../../../packages/redbox-core/src/extensions/resolution.ts), and
  [composition](../../../packages/redbox-core/src/extensions/composition.ts)
  provide offline inspection, deterministic replacement, and concrete bindings.

The [retirement evidence summary](../sails-retirement/evidence-summary.md)
designates WSU and records archived local qualification, including 565 hook
passes. Those results qualify their recorded revisions, not this migration.
Some wiki qualification text predates that designation; prefer the current
retirement evidence for institution status. The local WSU checkout found during
design was a legacy v5 branch; locate and identify the converted WSU source
referenced by retirement evidence before using it. Never silently substitute the
legacy checkout, generated hook, or demo fixture for institution qualification.

## 4. Composition and package structure

Target organization within `packages/redbox-core/src/`:

```text
http/
  contracts.ts                 controller, route, context and hook types
  controllers/                 browser controller classes
    webservice/                API controller classes
  fastify/
    FastifyHost.ts             listener, admission, lifecycle coordination
    registration.ts            declared controller/action binding
    routes.ts                  route normalization and router compatibility
    hooks.ts                   ordered request stages
    policies.ts                policy binding/execution
    responses.ts               envelopes, errors, redirects and headers
    session.ts                 native session/store boundary
    authentication.ts          selected provider transport bindings
    pages.ts                   EJS/asset transport
    streams.ts                 transport helpers where actually shared
  integrations/
    companion/                 isolated Express requirement and bridge
application/portal/
  http.ts                      concrete controller/integration bindings
  host.ts                      selected Fastify host composition
```

These are implementation destinations, not a requirement to create empty files
or relocate working domain code. Split helpers only when concrete reuse or
ownership warrants it. Public exports use stable package entrypoints; consumers
must not import `http/fastify` implementation internals. Move reusable identity
types out of Express-specific modules before deleting them.

Each selected controller is constructed once per application. Constructors wire
dependencies and acquire no resources. Request state never lives in controller
fields. Stateful collaborators are initialized and closed by application modules;
controllers borrow their operations. There are no global controller instances.

## 5. Controller and route contracts

### 5.1 Typed factories and declared actions

The following are target public declarations. They specify the intended contract;
they are not claims that these exports already exist. The pilot must compile them
against the selected Fastify version and package consumers before freezing API v2.

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ExtensionFactory } from './extensions';
import type { ApiRouteDefinition } from './api-routes';

export type ControllerMethodName<C extends object> = {
  [K in keyof C]: C[K] extends (...args: never[]) => unknown ? K : never;
}[keyof C] & string;

export interface ControllerFactory<Input, C extends object>
  extends ExtensionFactory<Input, C> {
  // Explicit exposure allowlist; no prototype/file scanning.
  readonly actions: readonly ControllerMethodName<C>[];
}

export type RouteAccess =
  | { readonly kind: 'public' }
  | { readonly kind: 'policies'; readonly names: readonly [string, ...string[]] }
  | { readonly kind: 'deny' };

export type PortalHttpMethod =
  | 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

export interface ControllerTarget {
  readonly controller: string;
  readonly action: string;
}

export interface HttpRouteDeclaration extends ControllerTarget {
  readonly name: string;
  readonly method: PortalHttpMethod;
  readonly path: string;
  readonly access: RouteAccess;
  readonly csrf?: boolean;
  readonly replaces?: true;
  // Reference the existing API declaration, rather than copying its schemas.
  readonly api?: ApiRouteDefinition;
}

// Public binder retains factory-specific inference at the application boundary.
export declare function bindControllerFactory<Input, C extends object>(
  factory: ControllerFactory<Input, C>,
  input: Input
): () => C;

export declare function defineController<Input, C extends object>(
  factory: ControllerFactory<Input, C>
): ControllerFactory<Input, C>;
```

Actions have the form `action(request: FastifyRequest<RouteGeneric>,
reply: FastifyReply): Promise<unknown>` (or a synchronous equivalent). The method
name helper identifies callable keys, not full Fastify signature compatibility;
generated examples and type fixtures must verify action signatures. Runtime
registration validates that every declared action is callable. Heterogeneous
factory type erasure is confined to the resolver/binder boundary, following the
existing concrete-input pattern; it is not exposed as `any` service lookup to
controller authors. `requires` continues to describe module dependencies and does
not become a constructor-parameter injection map.

Every replaceable core controller exports its own named input interface, using
selected domain operation types and configuration slices. An extension subclass
can reuse that input or extend it with explicitly bound dependencies. Selecting a
replacement happens before any controller factory runs; losing factories do not
construct instances. New installed controllers require companion application
binding code. Unknown bindings fail during offline composition, before acquisition.

Only route declarations expose actions. A callable helper on the class is not a
route. The action allowlist may name an inherited method deliberately; registration
checks the selected instance and binds `this`. Constructor and prototype internals
cannot be declared as actions. Duplicate action names and unlisted action targets
are errors. Class names are not used as implicit registration identifiers.

### 5.2 One route inventory

Existing API declarations remain the source of API method, path, controller/action,
Zod inputs, response metadata, version behavior, and documentation. Produce their
normalized registration view automatically. Do not create a parallel handwritten
API dispatch table. Browser and extension declarations enter that same resolved
inventory. Reject mismatches between normalized API fields and their source.

Resolve core policy metadata plus the most-specific configured mapping with the
existing precedence and default-deny behavior. The normalized route access is the
explicit source declaration; the resolved registration additionally retains an
`effectivePolicies: readonly (string | false)[]` chain. Do not collapse a chain
such as `['nocache', false]` to an immediate denial and lose its ordered effects.
Explicit API public mappings and extension `public` declarations remain deliberate;
an empty policy array is not an accidental public escape hatch.
Document how explicit public is represented in each source format. Reject unknown
policy names and malformed or empty named-policy declarations.

The inventory records stable route name, source provider, original declaration,
effective method/path, controller/action, selected factory, ordered policy chain,
CSRF, validation, and intentional replacement. API identities lacking a current
stable route name receive one deterministic identity during inventory work; it is
then frozen and documented. Existing extension names remain stable across router
syntax conversion. Route coverage asserts that every supported entry is bound
exactly once, replaced intentionally, or explicitly retired with an agreed reason.

Controller replacement changes implementation only. It cannot change policies,
validation, CSRF, URLs, or action exposure. Route replacement is separate, requires
`replaces: true` and an existing owned name, and supplies complete access metadata.
Record old/new policy and validation effects in inspection output for review.

## 6. Extension API v2

`registerRedboxExtension()` returns `apiVersion: 2`. Replace `handlers` with
controller factories and action mappings; replace middleware stages with typed
hooks/fallbacks. Keep non-HTTP declarations, CommonJS/ESM support, asynchronous
registration, package-relative views/assets, module/work dependency resolution,
migrations, bootstrap, jobs, configuration, and provider precedence intact.

The declaration collections use the same erased-input strategy as current
`ExtensionFactory`; concrete application bindings restore the input types:

```ts
export interface ControllerRegistration extends ExtensionFactory<never, object> {
  readonly actions: readonly string[];
}

export interface RedboxExtensionV2 {
  readonly apiVersion: 2;
  readonly controllers?: readonly ControllerRegistration[];
  readonly routes?: readonly HttpRouteDeclaration[];
  readonly hooks?: readonly HttpHookContribution[];
  readonly fallbacks?: readonly HttpFallbackContribution[];
  // All existing non-HTTP contribution fields remain available with their
  // existing types; this excerpt intentionally omits those unchanged members.
}
```

The non-generic collection descriptor deliberately erases constructor inputs and
method-key inference. Provide a typed `defineController` helper that checks
`ControllerFactory<Input, C>` at author sites and returns that descriptor; concrete
binding retains the original factory and its input type. Confine erasure inside
this helper/resolver boundary, rather than requiring casts throughout consumer
code. The pilot must include a subclass and a new controller with different input
types in one installed extension.

API v1 fails offline with provider/package identity, expected API version, and a
link to migration instructions. Do not reinterpret Express handlers. Resolution
preserves explicit replacements, missing-target failures, dependency validation,
core-lowest precedence, and deterministic provider order before factories run.

### 6.1 Hooks and fallback

Expose a supported subset of named lifecycle stages with documented semantics:

| Contribution stage | Ordering and permitted behavior |
| --- | --- |
| `afterAuthentication` | Parsed request and resolved authentication are available; before route access/CSRF. May terminate with an explicit response. Does not grant authorization. |
| `beforeAction` | After required policies, CSRF, and route validation; may terminate. Domain authorization still occurs in the action/domain. |
| `onResponse` | Observation after response completion; cannot change dispatch or response. Any asynchronous observation work remains owned. |
| `onError` | Safe observation of a sanitized failure; cannot replace the core error response or expose raw provider/parser errors. |

`afterAuthentication` and `beforeAction` are portal stages implemented using
ordered Fastify request hooks; their names must not imply that arbitrary plugin
registration order enforces the application security chain. Core admission and
security hooks are installed by the host and cannot be removed by extension hooks.

```ts
export type HttpHookScope =
  | { readonly kind: 'routes'; readonly names: readonly string[] }
  | { readonly kind: 'application' };

export type HttpHookContribution =
  | {
      readonly name: string;
      readonly stage: 'afterAuthentication' | 'beforeAction';
      readonly scope: HttpHookScope;
      readonly requires?: readonly string[];
      readonly replaces?: true;
      run(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    }
  | {
      readonly name: string;
      readonly stage: 'onResponse';
      readonly scope: HttpHookScope;
      readonly requires?: readonly string[];
      readonly replaces?: true;
      observe(request: FastifyRequest): Promise<void>;
    }
  | {
      readonly name: string;
      readonly stage: 'onError';
      readonly scope: HttpHookScope;
      readonly requires?: readonly string[];
      readonly replaces?: true;
      observe(request: FastifyRequest, error: SafeHttpError): Promise<void>;
    };

export interface SafeHttpError {
  readonly code: string;
  readonly statusCode: number;
  readonly requestId: string;
}

export interface HttpFallbackContribution extends ControllerTarget {
  readonly name: string;
  readonly prefix: string;
  readonly access: RouteAccess;
  readonly csrf?: boolean;
  readonly replaces?: true;
}
```

Hook functions shown are already application-bound; declaration inspection never
executes them. Concrete hook inputs use the same offline factory/binding pattern
when dependencies are required. `requires` for hooks refers to hook names in the
same stage; missing names, cycles, cross-stage edges, and unresolved route scopes
fail offline. Use dependency order, then existing provider order and declaration
order as deterministic tie breakers. Replacement requires an existing name.
Application scope must be explicit; missing scope is invalid, never global.

Fallbacks run only when no supported route/method handler matches. Select the
longest segment-boundary prefix; equal effective prefixes require explicit named
replacement. Apply their access/CSRF checks before their action. Resolve any
required brand context from a declared, validated scope rather than inferring an
actor from arbitrary unmatched paths; fail closed if unavailable. Host health,
readiness, malformed-request errors, and unsupported-method handling are reserved
and cannot be intercepted by fallback. Absent fallback produces the existing safe
404 contract. Express `afterRoutes` maps to fallback only when its actual behavior
requires it; it is never mechanically mapped to `onResponse`.

## 7. Request context and execution order

The target context retains current isolation:

```ts
export interface HttpRequestContext {
  readonly brand: BrandRow;
  readonly portal: string;
  readonly actor?: AuthenticatedActor;
}

export declare function requestContext(
  request: FastifyRequest
): HttpRequestContext;
```

`BrandRow` and `AuthenticatedActor` are the existing domain/persistence-backed
types moved or re-exported through stable entrypoints. Keep request storage
private to the binding layer. Freeze context/actor snapshots and copy/filter
roles to the resolved brand. Do not expose mutable session actors as authoritative
domain actors. The accessor throws when context is unavailable: health, global
hooks, unbranded routes, parser failures, and unmatched requests do not magically
have a brand. Branded controller actions have context after their required
resolution stage. Language uses a shared resolver; validated input is action-local
and typed, rather than one universal mutable request bag.

The request pipeline is:

1. Admit ordinary traffic only when host/application ready; start request lifetime
   and safe request correlation before asynchronous work.
2. Apply bounded routing/content parsing and session/authentication transport.
3. Resolve brand/portal and actor in the existing route-required order. Execute
   `afterAuthentication` contributions at the documented point, with context
   availability specified for that route.
4. Execute effective policies in order: explicit route chain, then most-specific
   configured action/controller/global mapping. Preserve target normalization and
   default deny.
5. Apply applicable browser/API CSRF and canonical-origin checks.
6. Preserve each action's existing domain checks and input-validation ordering.
   `beforeAction` means all route-level guards/validation are complete; domain
   checks that currently precede validation stay in an explicit adapter/action
   prelude. Do not move them later simply to fit a global hook.
7. Invoke the bound action and response helpers, persist session changes at the
   correct boundary, then release transport work only when actually complete.
8. Run safe response/error observations while retaining any accepted asynchronous
   operations through completion.

Parser errors necessarily precede policies. Later schema validation must not move
into Fastify's default early validation/coercion path and change denial precedence.
Retain existing Zod extraction and API version negotiation. Response schemas remain
documentation metadata initially; do not activate field-stripping serialization.
Errors preserve safe envelopes/statuses and do not disclose bodies, credentials,
raw datastore failures, or provider payloads. Logging/observation failures cannot
change action dispatch or replace a response.

## 8. Routing, parsing, and response behavior

Build a behavior inventory from current declarations and relevant tests. For each
row record current observation, target rule, affected callers, test, and any
intentional change. Preserve known supported behavior; resolve unrecorded cases
by inspecting implementation/tests before treating them as a contract.

| Surface | Required target behavior / evidence |
| --- | --- |
| Existing path matching | Case insensitive; optional trailing slash; root context and encoded path handling characterized. |
| Pattern translation | Expand/translate concrete optional groups and wildcards; preserve parameter values and stable names. No Express grammar passed through unchecked. |
| Router identity | Use Fastify-effective case/trailing-slash/structural identities; prove collision checks agree with runtime precedence. Reject ambiguous overlap. |
| HEAD | Explicit route wins regardless of registration order and retains its policies. Implicit HEAD behavior must be inventoried, not trusted to defaults. |
| OPTIONS / other methods | Characterize existing responses and Allow/CORS behavior; preserve supported behavior or explicitly record the break. |
| Bad encodings / URLs | Bounded safe error behavior, no credential/body disclosure; tests for malformed captures. |
| Query and form inputs | Supported nested structures and duplicate-key semantics survive; bounded depth/keys/size and prototype safety. Any stricter bound affecting callers is a documented break. |
| JSON / URL-encoded | Preserve 1 MB limits and supported content-type/charset/error behavior. Unsupported types and oversized bodies receive characterized responses. |
| Raw prefixes | Preserve stream ownership for multipart, TUS and Companion; case-insensitive prefix behavior tested without routing bypass. |
| API responses | Existing statuses, API versions, envelopes, field contents, redirects, and safe errors. |
| Conditional responses | Strong record ETags and preconditions, conditional GET/HEAD, cache headers and Vary; no weakening through compression or generated ETags. |
| Browser responses | CSP, cookies, compression, canonical origin, EJS locals and override precedence, forms and Angular initialization. |

Use Fastify-native plugins only after qualification against this matrix. Select a
supported Fastify release and compatible plugin versions at implementation time;
pin exact dependencies and update all affected lockfiles. Avoid inventing version
numbers in the design or assuming plugin compatibility from a package name.

## 9. Authentication, sessions, and CSRF

The pilot may choose native Fastify Passport integration or direct provider
bindings. All local, bearer, OIDC, and AAF flows must preserve provider/domain
behavior. Test linked and disabled accounts, brand roles, explicit invalid-bearer
precedence, fresh credential resolution, authentication version, login rotation,
logout invalidation/provider logout, callback failures and disconnects, security
events, and application isolation. No Express request emulation is permitted.

Retain runtime-owned Mongo clients and explicit index inspection/maintenance;
session plugins must not create a second pool, auto-create TTL indexes, or close a
borrowed client. Verify expiry/touch/save/destroy, cookie signing/secrets,
secure/same-site/path/domain settings, trusted proxy behavior, and failure handling.
One-time forced login is an intentional deployment change. The selected invalidation
mechanism must prevent the new host from accepting old sessions and avoid making
rollback silently accept sessions that were logged out or revoked during the new
deployment. Document secret/namespace/version handling and the resulting rollback
login behavior. Do not weaken revocation merely to retain a session store format.

Preserve session-aware CSRF and canonical-origin checks, including denials and
login/logout transitions. Raw replies, streams and bridges must explicitly await
necessary session writes before headers or ownership are released. A sent response
is not proof a session operation completed.

## 10. Host lifecycle and ownership

### 10.1 Startup

1. Load configuration/declarations offline. Resolve providers, replacements,
   dependencies, controller bindings, action allowlists, routes, policies and hook
   ordering without acquiring resources.
2. Construct one application runtime and Fastify host. No ordinary work begins.
3. Await application initialization, persistence preparation/index checks,
   migrations, and bootstrap.
4. Construct selected controllers using initialized collaborators. Register the
   complete Fastify plugin graph/routes/hooks. Prepare integrations against
   `fastify.server`, a single `node:http.Server`, before accepting traffic.
5. Await Fastify readiness. Listen with ordinary ingress gated.
6. Activate the application. Open ordinary admission only after activation succeeds.

Offline checks validate declared names, dependencies, bindings and allowlist
membership. Actual method callability and binding to the selected instance are
checked in step 4, before readiness/listening. Do not run factories during offline
inspection merely to claim instance checks happened before resource acquisition.

Before step 5 there is no HTTP listener, including health. Once bound, `/healthz`
reports liveness independently of `/readyz`; readiness and ordinary ingress remain
closed through activation and shutdown. Preserve their existing status/body
contracts after binding. Validate startup probe budgets using real initialization
times; configure a startup probe rather than letting liveness kill initialization.
No auxiliary early health listener is introduced.

Preparation cannot require an externally reachable listener. Prototype Socket.IO,
Companion, and other server integrations early and adapt their preparation if
necessary. A preparation/ready/listen/activation failure closes admission and
enters the same owned cleanup path. Stop during initialization waits for partial
acquisition/preparation to settle before releasing resources it can still touch.

### 10.2 Shutdown and retry

The host coordinates transport and application stop; it does not replace the
application cleanup protocol with `fastify.close()`.

1. Set stop intent, close ordinary admission and mark not-ready immediately. Join
   concurrent stop calls. Quiesce the application and integrations.
2. Await any in-flight acquisition/preparation/activation within the caller's
   absolute deadline. Keep partially prepared resources owned meanwhile.
3. Stop accepting transport connections and begin the one tracked Fastify-close
   operation. Drain accepted request work, retained callbacks, session operations,
   uploads, jobs, transfers, sockets and streams through their owners. Transport
   closure and accepted work completion are independent observations.
4. Application dependency-order cleanup releases consumers before their borrowed
   dependencies, only after their work drains. Fastify close hooks release only
   Fastify-owned resources. They must not close shared Mongo/domain clients or
   wait cyclically for the application stop that is awaiting Fastify closure.
5. Mark stopped and remove owned signal handlers only after both transport and
   application cleanup succeed.

Keep one tracked transport-close attempt; a caller's timeout does not create a
second concurrent close. A settled Fastify-close failure remains visible and is
not relabeled successful on retry. The pilot must establish the selected Fastify
version's failure behavior and show how remaining owned cleanup can be retried
without duplicate close hooks or premature releases. A permanently unrecoverable
transport failure is reported as such; never promise successful retry by ignoring
it. Application cleanup failures/deadlines remain retryable after the prior attempt
settles. Successful stop is idempotent.

An expired deadline reports failure, retains ownership/state, and permits another
stop attempt. It does not abort accepted work by destroying its dependencies.
Deployment tooling may eventually terminate the process; that is a distinct
operational action, not successful graceful shutdown. Restart constructs a fresh
application/owner, not a reused stopped instance. Companion additionally requires
a fresh process after full stop due to its process-lifetime provider resources.

## 11. Streams, uploads, sockets, and Companion

Keep domain/storage ownership, staged multipart cleanup, TUS state, progress work,
authorization and origin checks. Use the Fastify-owned underlying server for
Socket.IO/upgrades. No independent listener or signal owner is introduced.

Scope content parsers to avoid pre-consuming raw bodies. Test backpressure,
partial uploads, malformed multipart, fields before/after files, cancellation,
storage failures, response disconnects, upgrade denials, transfer cleanup and
shutdown. Preserve conditional stream headers and authorization before bytes are
released. For hijacked/raw responses, enumerate hooks bypassed and explicitly
implement session persistence, completion/error observation, and drain accounting.

Companion lives behind one optional dedicated adapter. Express imports, request/
response adaptation, its existing unlistened bridge server if still necessary,
path rewriting, and upgrade dispatch are confined to that boundary. The bridge
does not listen independently. Prove why each remaining Express dependency is
necessary; do not retain first-party Express utilities for convenience.

Preserve Companion's authenticated portal boundary, tracked transfer authorization,
upgrade routing, shared-secret limits, cancellation and retained transfer work.
Its shared secret does not establish a user identity. Record provider services
without public close handles and process-lifetime timers explicitly. Process exit
in isolated Companion tests cannot substitute for owned transfer-drain assertions.

Socket grants/connections and Companion transfers remain process-local. Preserve
the existing topology, document process affinity and restart requirements, and
make no cross-replica continuity claim. Multi-replica portability is separate work.

## 12. Qualification, performance, and cutover

### 12.1 Pilot gate

Before mass conversion, prove an authenticated read and mutation, native session
persistence/rotation, all authentication provider feasibility, raw upload, socket
upgrade, Companion tracking, and real-network retryable shutdown. Include failures,
disconnects, preparation interleavings, and second stop after timeout/cleanup error.
A plugin choice fails the pilot if it cannot preserve any required provider,
security, raw-stream or ownership behavior. Resolve the cause before conversion;
do not spread a known incompatible pattern across controllers.

### 12.2 Final evidence

Adapt existing suites and preserve their assertions. Use injection for bounded
route/response tests; use actual listeners for cookies, raw streams, disconnects,
upgrades, backpressure and shutdown. Reuse qualification tooling, not historical
passing labels. Record exact source SHA, lockfiles/toolchain, packed package hashes,
immutable image identity, test commands, service versions/topology, logs, results,
pending/skipped cases and approved deviations. Missing-provider skips do not
qualify a provider.

Release gates include route/policy reconciliation; core/root Mocha; general/OIDC/S3
and other applicable Bruno profiles; full existing Playwright acceptance; real Mongo
lifecycle/auth/CSRF; real-network upload/socket/stream/Companion; generated/packed
consumers; bundled hooks; WSU; runtime-default fresh/restart/stop; maintenance and
index commands; database configurations supported by the final artifact; reference
generation/audit; dependency pins; and source/dependency closure of Express.
The implementation plan maps existing commands to these gates.

### 12.3 Performance method

Before replacing Express, capture a repeatable baseline with representative API
reads, mutations, page rendering and streaming. Compare hosts in separate runs
using equivalent disposable data, identical hardware limits, reverse-proxy setup,
Node/plugin/runtime configuration, services, concurrency, payloads and warmup.
Record load-generator configuration, raw samples, p95 latency, completed throughput,
memory/RSS, CPU, errors and timeouts. Use repeated runs and a documented variability
band; a single noisy sample is not evidence of a repeatable regression.

For comparable workload runs, latency regression is
`(fastifyP95 / expressP95 - 1) * 100`; throughput regression is
`(1 - fastifyThroughput / expressThroughput) * 100`. More than 10% in either blocks
cutover until investigated and explicitly accepted. Zero/invalid baselines and
error-rate differences invalidate the comparison; dropped work must not appear as
a performance improvement. Use workload-appropriate timing for streams, including
completion/bytes, rather than claiming whole-stream latency from first byte alone.
Retain the baseline artifact when the old host is removed.

### 12.4 Deployment and acceptance

Use a maintenance window: quiesce/drain the preceding deployment, capture the
existing recovery checkpoint as appropriate, deploy the qualified image/hooks/
configuration, apply deliberate session invalidation, await startup/readiness,
then run API/browser/auth/upload smoke checks before restoring traffic. Preserve
explicit proxy trust/canonical URL. No direct TLS/HTTP2 branch is added.

Rollback selects the preceding known-good build/configuration and accounts for
work/external effects created during the attempted upgrade. Transport migration
introduces no persistent-data change. Existing v6 migrations remain governed by
their own recovery requirements; this is not a promise that every v6 database
change can be reversed. Test rollback login/session invalidation behavior.

Locate the converted WSU source, record portal/hook/configuration identities, port
its controllers to API v2, and perform fresh local qualification on the final
artifact. Archived WSU results and generated fixtures are baselines only. Actual
institutional production acceptance remains separate: deployed versions/database,
real federation and topology, identity/search/workload/availability, client approval,
and operator-owned cutover/reconciliation must be recorded by their owners.

## 13. Implementation decisions still requiring evidence

No product-scope decision remains open from the interview. The following are
engineering selections with explicit gates, not permission to weaken the design:

- Supported Fastify and exact native plugin versions: selected and locked in P1/P2.
- Native session/auth provider combination and forced-login mechanism: proven in P2.
- Actual router translations, parser bounds, and any caller-visible changes:
  recorded from the P0 inventory, verified in P1/P3, and explicitly approved if breaking.
- Fastify close failure/retry mechanics and integration preparation before listen:
  demonstrated by P1/P2 before mass conversion.
- Converted WSU source/artifact identity: located in P0 before institution work.
- Measured performance workload parameters and supported deployment/database matrix:
  fixed in P0 from current supported configurations, then rerun on the final artifact.

Keep evidence and deviations alongside the task list. Do not label the migration
complete while any required gate is pending, skipped, or supported only by Express
or historical Sails-retirement results.
