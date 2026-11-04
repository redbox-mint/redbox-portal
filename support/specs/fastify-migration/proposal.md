# Fastify host and controller migration proposal

> Historical discussion input. The agreed successor is [the detailed design](design.md),
> with an [implementation plan](implementation_plan.md) and [task list](tasks.md).
> Its decisions supersede the recommendations and open questions below. No Fastify
> implementation or qualification is claimed by these documents.

Status: draft proposal for a Grill Me design discussion. This records the agreed
direction, implementation recommendations, and questions that need a final design.
It does not record completed implementation or qualification.

Date: 2026-11-04.

Source baseline: `stack/sails-retirement-11-docs`, commit `f7ebc45fb`.

## 1. Purpose

Replace the Express HTTP host introduced by the Sails-retirement stack with
Fastify, and organize HTTP behavior into explicit controller classes with named
actions. The user wants better HTTP behavior and a controller-oriented development
model similar to the original Sails setup.

The Sails-retirement work already established explicit application composition,
domain dependencies, persistence ownership, and lifecycle management. This proposal
builds on those boundaries. The transport migration should preserve established
domain behavior and public contracts unless a specific change is agreed and
documented.

The HTTP standards motivation needs concrete acceptance criteria. Moving to
Fastify alone does not establish correctness for routing, parsing, conditional
requests, headers, or streams; those behaviors must be specified and verified.

## 2. Decisions already agreed with the user

- **Use Fastify as the portal HTTP host.**
- **Use controller classes and named action methods**, with explicit
  route-to-controller/action mappings and constructor-injected dependencies.
- **Actions use Fastify's typed request/reply objects directly.** There is no
  requirement for ReDBox-owned framework-neutral HTTP request/response types.
- **Keep Uppy Companion behind an isolated adapter on the Fastify server.**
  Companion is itself an Express application. A separate Companion service is
  outside the selected direction. Express remains an allowed implementation
  dependency of that integration.

The remaining details below are recommendations to challenge during design review,
not additional decisions already made by the user.

## 3. Current implementation and useful boundaries

The current wiki describes the implemented Express architecture. It remains the
source for current behavior until the migration is implemented; this proposal
describes a possible successor.

- [Architecture overview](../../wiki/Architecture-Overview.md) and
  [HTTP handlers and routes](../../wiki/Controllers-Architecture.md).
- [ExpressHost](../../../packages/redbox-core/src/http/express/ExpressHost.ts)
  owns the listener, health/readiness gates, request admission, signals, and host
  lifecycle.
- [Portal host composition](../../../packages/redbox-core/src/application/portal/host.ts)
  adds the HTTP host to the existing application runtime.
- [PortalHttp](../../../packages/redbox-core/src/application/portal/http.ts)
  binds selected domains, policies, authentication, pages, uploads, sockets, and
  extension contributions.
- [Route contracts](../../../packages/redbox-core/src/api-routes/types.ts) already
  carry controller/action identities, validation, response metadata, and policies.
  The route-group implementations often dispatch through `route.action` branches
  rather than actual controller methods.
- [Extension contracts](../../../packages/redbox-core/src/extensions/contract.ts)
  currently expose Express `RequestHandler`, named handler factories, routes,
  before/after-route middleware, and server integrations.
- [Extension resolution](../../../packages/redbox-core/src/extensions/resolution.ts)
  validates collisions using Express/path-to-regexp semantics. Its path identities
  and implicit HEAD behavior are coupled to the existing router.
- [HTTP request lifetimes](../../../packages/redbox-core/src/middleware/requestLifetime.ts)
  retain accepted asynchronous work beyond response completion or disconnect.
  Session operations, uploads, jobs, and streams rely on that ownership.
- [Controller generation](../../../packages/redbox-dev-tools/src/generators/controller.ts)
  already produces classes, but generated action signatures and extension route
  wiring use the current Express handler contract.

The migration also reaches shared request-detail/logging types, session
configuration, package exports, test fixtures, scripts, Docker, CI, and deployment
documentation. Renaming the `http/express` directory would leave these dependencies
unresolved.

## 4. Proposed controller model

### Controller responsibilities and lifetime

Controllers are ordinary exported TypeScript classes. Their constructors receive
the selected domain operations, configuration slices, response helpers, and other
concrete collaborators needed by their actions. Constructors perform wiring;
application lifecycle modules acquire and release resources.

Create one instance per selected controller per application. Keep actor, brand,
portal, language, validated input, and other request-specific values on a typed
Fastify request context. Controller fields must remain safe for concurrent
requests.

Actions accept appropriately parameterized `FastifyRequest` and `FastifyReply`
types. They validate transport inputs, call domain operations, and produce HTTP
responses. Existing domains continue to own authorization-sensitive record
operations and persistence behavior.

Keep browser and API controller identities distinct where they are distinct
today, including the `webservice/` namespace. The final grouping should balance
familiar action names with manageable constructor dependencies and class size.
Existing read/write domain collaborators can be shared between controllers.

### Explicit registration and binding

Use named controller factories and explicit route declarations. A small binding
layer connects a declared controller/action to a Fastify route, with the action
bound to its selected controller instance.

Only declared routes expose actions. Missing controllers, actions, dependencies,
or policies fail composition before listening. Do not discover callable actions
by scanning files or publishing every method on an instance.

Resolve replacements before constructing instances. Extension hooks should be
able to extend a core controller and intentionally register its replacement.
Whether individual action replacement needs a separate registration mechanism is
an open question; subclassing may provide the required customization already.
Changing a controller implementation must not implicitly weaken route policies.

Prefer explicit factories and imports over a general dependency-injection
container or decorator-based discovery. Any shared controller base should be
justified by concrete repeated behavior during the pilot.

### Routes, policies, and documentation

Retain the existing API contracts as the source of API method, path,
controller/action, validation, and documentation metadata. Browser and extension
routes join the final explicit registration inventory. Runtime registration and
coverage checks should consume those declarations without maintaining a separate
handwritten dispatch table.

Bind effective policies and validation when routes are registered. Preserve
explicit public access, ordered named policies, CSRF requirements, and
controller/action policy overrides where supported today. Route validation and
policy metadata do not replace domain authorization.

Initially retain the existing Zod contracts, API version negotiation, response
envelopes, and safe error messages. Fastify coercion, default validation errors,
and response serialization must not silently change accepted inputs or remove
response fields.

## 5. Fastify host and application lifecycle

The application runtime remains the owner of domain initialization, migrations,
bootstrap, workers, persistence resources, and cleanup. Fastify owns HTTP routing
and transport. Establish a single cleanup owner for each integration so Fastify
and application hooks do not both close a borrowed resource.

The recommended startup sequence is:

1. Load and resolve configuration and extension declarations offline; validate
   dependency and registration structure without acquiring resources.
2. Construct the application and Fastify host without starting ordinary work.
3. Await application initialization, required migrations, and bootstrap.
4. Bind initialized collaborators, register the complete Fastify plugin/controller
   graph, and prepare integrations against its server object.
5. Await Fastify readiness, then listen with ordinary application ingress gated.
6. Activate the application and open ordinary ingress only after activation
   succeeds.

Fastify requires registration to finish before readiness/listening. The current
Express host binds its listener before application initialization and route
preparation. The recommendation therefore changes health endpoint availability
during startup: probes cannot reach the HTTP listener until preparation completes.
Validate that operational change and update startup probes/timeouts. Preserve the
separate meanings of `/healthz` and `/readyz` once the listener is available.
If an early health listener is a hard requirement, settle its design before
implementing the host.

Prototype shutdown early. Preserve quiescing, accepted-work draining,
dependency-ordered close, startup failure cleanup, and retry after a deadline or
cleanup failure. A finished response, disconnected client, or completed Fastify
close operation must not release domain resources while accepted work remains.
The interaction between Fastify close hooks and the application's retryable stop
contract needs evidence, not an assumption that `fastify.close()` replaces it.

## 6. HTTP infrastructure and compatibility

Use a supported Fastify release and compatible native plugins, with exact package
versions selected and qualified during implementation. Follow the repository's
dependency-pinning policy and update the relevant lockfiles.

### Routing and parsing

Specify case sensitivity, trailing slashes, wildcard captures, literal versus
parameter precedence, HEAD/OPTIONS behavior, unsupported methods, root contexts,
malformed encodings, duplicate query keys, nested query/form values, content types,
and payload limits. Preserve supported behavior or record each intentional change
with its affected callers.

Rewrite extension collision checks and owned-route identities to agree with the
actual Fastify router. Existing Express path syntax cannot simply be passed to
Fastify. Translate or expand the concrete declarations explicitly, and test
collisions, intentional replacements, and core route coverage. Determine how
existing stable extension route names survive the matcher change.

### Sessions, authentication, and CSRF

Select Fastify-native cookie, session, and authentication integration based on a
working pilot. Do not assume existing middleware is compatible because it accepts
Node HTTP objects.

Preserve application-owned Mongo clients, session index inspection and explicit
maintenance, TTL behavior, cookie/proxy configuration, authentication-version
checks, login rotation, logout invalidation, and save/touch/destroy ownership.
Determine whether existing v6 cookies and persisted sessions remain compatible;
if forced login is selected, document that as an explicit deployment change.

Carry forward local, bearer, OIDC, and AAF authentication; linked/disabled-account
checks; explicit invalid-bearer precedence; session-aware CSRF; canonical-origin
checks; and security events. Authentication state must remain isolated per
application. Decide which Passport integration or direct provider bindings satisfy
those requirements during the pilot.

### Responses, pages, and observation

Preserve status codes, redirects, cookies, API envelopes, cache-control, CSP,
compression behavior, strong record ETags, conditional requests, and stream
headers. Retain view/asset override precedence, EJS locals, forms, and embedded
Angular initialization.

Port request logging and error handling to Fastify hooks while retaining safe
diagnostics and request context. Parser, provider, and authentication errors must
not expose request bodies, credentials, or raw datastore errors. Observation
failures must not change request dispatch.

## 7. Streams, uploads, sockets, and the Companion boundary

Keep the existing domain/storage owners for datastreams, multipart staging, TUS,
progress work, and sockets. Adapt their transport boundaries and retain the
current upload limits, authorization, origin checks, cancellation, backpressure,
staged-file cleanup, and shutdown accounting.

Use Fastify's underlying server for Socket.IO and upgrade integrations. Scope
content parsers so TUS, multipart, and Companion receive the streams they require.
Raw request/reply handling must explicitly account for lifecycle hooks it bypasses,
including session persistence, response completion, error handling, and draining.

Companion stays optional and attaches through one dedicated adapter on the
Fastify server. Keep its Express-specific types and response adaptation inside
that integration. Do not introduce a general Express compatibility layer for
controllers or extension routes. Preserve Companion's path handling, transfer
tracking, upgrade dispatch, authorization boundary, and documented process-lifetime
limitations. The final portal will still contain Express where Companion requires
it; removing all Express packages is not an acceptance criterion.

## 8. Extension and tooling changes

Replace the public Express handler factory contract with explicit controller
factories and action mappings. Replace beforeRoutes/afterRoutes middleware
semantics with named Fastify lifecycle stages and documented plugin scope/order.
Keep host integrations on the single owned server, without independent listeners
or signal handlers.

Preserve offline declaration inspection, CommonJS/ESM support, deterministic
provider precedence, explicit `replaces: true`, missing-dependency failures,
configuration contributions, views/assets, migrations, bootstrap, and jobs.

Treat exported Express types and handler/middleware changes as a breaking
extension-contract change. Determine whether the current `apiVersion: 1` contract
has shipped to consumers before deciding whether to revise the unreleased v6
contract or introduce a new API version. Avoid silently interpreting existing
Express handlers as Fastify actions.

Update controller/method generators, extension wiring, public exports, the v6
scaffold, bundled hooks, packed-consumer fixtures, generated contract references,
and migration examples together. A newly generated controller should compile and
run through the production composition with its declared policies.

## 9. Proposed delivery phases

Recommendation: build a follow-on stack from the completed Sails-retirement tip.
Keep the existing production entrypoint working until the Fastify composition is
qualified. Compare hosts in separate test runs, with separate disposable state;
the production cutover selects one host. Phase boundaries can span multiple PRs
when a controller family or integration needs a smaller reviewable change.

1. **Baseline and design contract.** Inventory routes and integration boundaries,
   capture missing critical behavior checks, and settle the open design questions.
   Exit: an agreed contract and a bounded qualification plan using existing suites.
2. **Host and controller pilot.** Implement Fastify lifecycle and registration with
   a small representative controller. Prove registration ordering, readiness,
   initialization failure, disconnects, draining, and cleanup retries.
   Exit: the host lifecycle is demonstrated before mass conversion.
3. **Authentication and extension foundations.** Prove sessions, policies, CSRF,
   authentication, and the proposed controller replacement contract with an
   authenticated read and mutation. Define native extension hook stages.
   Exit: a working secure pattern and stable public types for later conversions.
4. **API controllers.** Migrate configuration/reference reads first, followed by
   records/queries, identity/administration, and mutations/integrations. Extract
   named actions and reuse selected domain collaborators.
   Exit: migrated route declarations bind exactly once and preserve their contracts.
5. **Browser controllers and assets.** Migrate EJS pages, redirects, form delivery,
   branding, and static/dynamic assets.
   Exit: browser behavior and the existing Playwright assertions pass.
6. **Streaming integrations.** Complete datastreams, multipart, TUS, progress
   sockets, and the isolated Companion adapter. Start feasibility work for these
   alongside the pilot if it could invalidate a host or authentication choice.
   Exit: real-network upload/socket/stream and shutdown evidence.
7. **Tooling and consumers.** Finish generators, scaffolds, bundled extensions,
   installed-package qualification, migration guidance, and generated references.
   Exit: a generated and packed extension runs on the production composition.
8. **Qualification and production cutover.** Switch the default executable and
   update Docker, CI, maintenance/test runners, probes, and current wiki pages.
   Remove first-party Express routing/middleware and dependencies that are no
   longer used; retain Companion's required dependencies.
   Exit: the exact final source and packaged artifact meet the agreed gates.

## 10. Verification and completion criteria

Reuse existing core/root Mocha, Bruno, Playwright, lifecycle, input-contract,
streaming, socket, Mongo, and package qualification coverage. Preserve assertions
while adapting fixtures to Fastify. Add focused tests where the new host or
controller contract introduces a meaningful risk; do not create a second complete
parity suite.

Use Fastify injection for bounded request/route tests, plus actual listeners for
behavior that depends on sockets, raw streams, cookies, disconnects, upgrades, or
shutdown. Reuse the existing Sails-retirement qualification tooling where it still
tests the final runtime, and record the exact revision and artifact under test.
Earlier Express qualification is a baseline, not proof of Fastify behavior.

Completion requires:

- Every supported route is accounted for, with each controller action, policy,
  validation contract, and intentional override bound as declared.
- HTTP behavior is compatible or its intentional changes are documented and
  covered by relevant API/browser tests.
- Authentication, sessions, CSRF, cross-brand access, invalid credentials, and
  extension replacements pass both success and denial cases.
- Real-network streams/uploads/sockets and retained asynchronous work survive
  disconnects and drain correctly during shutdown.
- Startup failures and stop deadlines retain resources for correct cleanup/retry;
  no second application, pool owner, listener, or signal owner is introduced.
- Generated/packed extensions, default startup, restart, maintenance commands,
  production packaging, and CI exercise the Fastify composition.
- First-party controller and extension HTTP contracts use Fastify types, with
  Express-specific transport code confined to the Companion boundary.

No tests have been run for a Fastify implementation, and no implementation is
included with this proposal.

## 11. Questions for the Grill Me design session

Resolve these before treating the proposal as an implementation-ready design:

1. Which specific HTTP behavior motivated the framework change, and what
   observable guarantees must improve? Which existing quirks must stay compatible?
2. Is deferred listening during initialization acceptable operationally, or is
   health endpoint availability before initialization a hard requirement?
3. What exact shutdown sequence reconciles Fastify close hooks with retryable
   application stop, retained work, session writes, and partially prepared resources?
4. Which session/authentication plugin combination supports the existing local,
   bearer, OIDC, and AAF flows? Must existing v6 sessions survive, or is forced
   login an accepted migration behavior?
5. How should controllers be grouped, particularly browser versus API and record
   reads versus mutations? What evidence would justify a shared base class?
6. Is subclass-and-replace sufficient for extension customization? If individual
   action replacement is needed, how does it interact with inherited methods,
   dependency binding, and policy precedence?
7. What are the final controller factory, route declaration, request context, and
   extension hook types? Has the existing extension API shipped, and how should
   consumers distinguish the new contract?
8. Which route/parser compatibility rules will be preserved, how are Express paths
   represented in Fastify, and how will collision detection and stable replacement
   names agree with runtime routing?
9. Where do validation, coercion, error translation, and response serialization
   run, and how will they preserve existing API version and field behavior?
10. What precisely is allowed inside the Companion adapter, and how will it preserve
    authentication/session boundaries, raw streams, upgrades, transfer ownership,
    and cleanup without becoming general Express middleware support?
11. Which real-service, browser, topology, installed-extension, and packaged-artifact
    checks are release gates? Which existing evidence can be reused only as a
    baseline, and which checks need a fresh run?
12. Should this ship in the same unreleased v6 upgrade or a later release, and what
    does that imply for compatibility, downtime, extension conversion, and rollback?

The next thread should challenge these choices and produce a final design,
concrete public TypeScript contracts, recorded behavioral decisions, and a task
plan with dependencies and acceptance evidence.
