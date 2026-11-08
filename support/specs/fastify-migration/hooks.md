# Scoped hooks and unmatched fallback (FM-018)

API2 accepts `hooks` and `fallbacks`. Import their types from
`@researchdatabox/redbox-core/http`; declarations remain offline and already bound
to concrete application operations. Extensions never receive a Fastify instance,
registration facade, server or constructor-input lookup. Bound closures borrow
application-owned operations; they do not acquire resources during inspection.

Each hook declares a unique stable `name`, `stage`, and explicit `scope`:
`{ kind: 'routes', names: ['stable-route-name'] }` or `{ kind: 'application' }`.
Names can also select a named fallback. Missing/empty/unknown scopes fail offline.
One offline `HttpTargetNamespace` owns selected core/extension routes, fallbacks,
synthetic/internal owners and hook-target resolution in both controller-host and
API2 composition. Route/fallback name collisions fail there. Reserved internal
names and prefixes (`redbox.internal` / `redbox.internal.*`, `portal.automatic-*`,
and the existing `core-native-http-*`) are case-insensitively forbidden in every
user route, fallback and hook declaration, including losing replacements. Scoped
hooks resolve only public route/fallback owners through that same namespace;
internal names cannot be scoped targets, even if that internal route is absent.
Application-scoped hooks retain their documented admitted-dispatch behavior.

The namespace reserves automatic OPTIONS/HEAD, exact host probes, native auth and
provider families, static/asset owners from every FM-002 catalog entry, and core
error/not-found handlers before any initialization or listen. Sealed preparation
claims actual native registration names within its pre-reserved prefix; extension
closures cannot execute offline and never make native names public scope targets.
Implicit/denied HEAD is a method variant of its declared logical route: it keeps
that public hook target and has a distinct reserved internal owner. Method/path
variants reference their logical owner rather than redeclaring its name. Raw
matched-registration tokens remain separate from this logical name namespace.

Application scope applies to admitted portal dispatch and unmatched requests; host
probes, malformed transport failures and closed admission remain host-owned.

| Stage                 | Fastify binding and behavior                                                                                                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `afterAuthentication` | First root `preHandler` for every native and declarative route, after bounded parsing and prepared session/authentication transport. Declarative routes also normalize params and run their core `security.resolveContext` prelude. Runs before inherited access/CSRF guards. May terminate.                |
| `beforeAction`        | Final route `preHandler` for every native and declarative route, after inherited and route-local policy/CSRF/validation guards. Declarative routes also run their action-specific `guards` prelude and declared validation first. Domain checks inside native actions retain their position. May terminate. |
| `onResponse`          | Fastify `onResponse`, after transport completion. Observation work remains request-owned until settled.                                                                                                                                                                                                     |
| `onError`             | Fastify `onError`, before the sole core error writer. Receives only the frozen `{ code, statusCode, requestId }` safe error. Cannot replace the error response.                                                                                                                                             |

An unmatched fallback has the same request pipeline in its owned not-found handler.
An unmatched request with no eligible fallback runs application-scoped
`afterAuthentication`, then the safe 404. There is no `beforeAction` without an
action. Authentication/brand resolution that still occurs in a legacy access
policy is not silently moved earlier: context is available at `afterAuthentication`
only when core explicitly resolves it in `security.resolveContext`. Otherwise the
context accessor fails as documented. Core admission/security cannot be removed
by an extension declaration. Controller family migrations must put their required
domain-before-validation checks into the core prelude before enabling this binder.

Both request-stage boundaries use the same owned callback continuation adapter.
Stage promises remain tracked after an early response; synchronous native response
faults from the continuation enter the existing error boundary. Hosts with no
composed request stages continue synchronously.

The API2 observation argument is `HttpObservationRequest`, a frozen detached record
of `id`, `method`, query-free `url`, optional stable `routeName` and `statusCode`.
This deliberately narrows the design's illustrative `FastifyRequest` signature to
satisfy its mandatory observation-only semantics: live request methods, mutable
body/query/headers, sessions, transports, reply and logger capabilities are absent.
Return values are discarded. Throws/rejections are isolated per observer, allowing
later observations to run; they log only `HTTP_OBSERVATION_FAILED` through FM-016's
redacting, failure-isolated logger. Async logging retains the existing drain owner.
No response-error writer or logger recovery mechanism is added.

`requires` lists hook names in the same stage. Missing targets, cross-stage edges
and cycles fail during offline composition, before host registration, factories,
application initialization or listen. Among eligible nodes, the existing resolver's
low-to-high provider order (core first; configured priority and deterministic package
order) and declaration position break ties. Dependency edges run first. A winning
replacement uses its provider/declaration position, requires `replaces: true` and an
existing owned name. The selected graph/scope arrays are copied and frozen. Core
security itself always precedes the corresponding extension stage.

Fallbacks declare `name`, literal segment-boundary `prefix`, `controller`, `action`,
complete `access`, optional `csrf` and optional literal
`context: { branding, portal }`. Prefixes are relative to root context, match
case-insensitively, and select the longest matching prefix. Equal effective prefixes
require replacement of the same name. The fallback runs exactly once; a denied
specific fallback never falls through to a broader public one. Standard policy
bindings and CSRF adapters are required offline even for fallback-only hosts.
Context params come exclusively from the validated literal declaration; ordinary
brand/portal policies still check their existence/allowlist. No brand/actor is
inferred from unmatched URL segments. Required unavailable context fails closed.

Core supplies a complete namespace catalog derived from the retained FM-002 inventory
and tracked asset/build declarations. Build rejects catalog drift. The explicit
`http-asset-sources.json` lists tracked authored assets and is checked against
`git ls-files` when Git is present. Docker uses the same declared inputs without
Git. Angular `outputPath` and Webpack emitted/copied filenames reserve generated
roots (including `/angular` and `/icons`) before any bundle exists. Ignored/local
asset files, `dist` and `.tmp/public` never supply catalog entries. Missing source
assets fail the check; adding generated or untracked files cannot change it.
`http-generated-assets.cjs` reads each Webpack config as syntax and uses the pinned
public defaults for implicit URL resources, chunk, runtime/worker, CSS and map
templates. Root output templates become anchored pattern reservations. Implicit URL
rules (including CSS `url()`) reserve hashed resources with optional normal extensions;
authored `asset/resource` rules retain rule/module filename and extension overrides.
The effective async Wasm default also reserves its binary and map names. Hash widths
remain local to each config. Dynamic/unsupported root
declarations fail the build. Angular hashed media and scripts stay inside the
declared output namespaces, independent of `outputHashing` or bundle existence.
Patterns use the same registry and protect existing/missing files and every method;
they never add routes or alter static responses. No production output layout changes.
`coreFallbackReservedPrefixes`
provides every required mount root relative to root context; the core-only
`namespaceConfiguration` resolves configured Companion HTTP and upgrade roots.
Omitting `fallbackReservedPrefixes` uses that supplier. An explicit empty or incomplete
list fails offline, naming the missing FM-002 reservation; extra reservations are
allowed. This is core ownership, never an extension capability. Complete roots protect
missing files and unsupported methods, including fonts, favicon, branded dynamic
assets, static roots and configured integrations. Asset migration remains FM-031.

The fallback never registers a catch-all route. It uses an encapsulated, owned
Fastify not-found handler under `/`, behind the existing root host/admission hooks.
One core registry captures every actual normalized registration through the sealed
preparation guard, including native authentication providers, nested async plugins,
declarative routes and HEAD handlers. Wildcard mounts also reserve their base root.
Fallback checks this registry and the live native router across methods, preserving
method misses, HEAD/405 and automatic OPTIONS behavior. Synthetic OPTIONS wildcard
registration is not evidence that every path is owned. The registry also supplies
probe reservations and complete static/integration namespaces. Its public snapshots
contain frozen descriptive metadata only; router lookup stays private. The same
registry binds application request stages to every registered route, with owned
callbacks and native observation identities. Existing actions calling `callNotFound`
remain reserved. Global probes, malformed paths, encodings, dot/empty segments,
HEAD/OPTIONS and unsupported methods cannot reach a fallback. Absent/ineligible
fallback retains `{ "error": "not-found" }`. This bounded fallback grammar is an
explicit fail-closed API2 rule; it does not normalize suspicious unmatched URLs.

Each actual registration receives its own opaque identity in route context. Request
normalization, scoped hooks and early error/response observations resolve through
the matched registration, including its constraints, rather than a method/path
key. Explicit and synthetic OPTIONS/HEAD handlers and prefixed registrations keep
separate identities; a native method array shares one registration with per-method
metadata. Detached request metadata exposes only the inert token, while executable
boundaries remain private. Native descriptive names include the constraint values.
Version and host constraints remain outside the sealed preparation allowlist.

Express `beforeRoutes` has a counterpart only where its actual parsed/authenticated
request behavior fits `afterAuthentication`. Express `afterRoutes` runs in dispatch
after route matching; convert its actual unmatched behavior to a named fallback.
It is rejected as a hook stage and is never mapped to response observation. The
retained differential exercises the existing Express extension composer on both
matching and unmatched requests. Express production composition remains unchanged.
