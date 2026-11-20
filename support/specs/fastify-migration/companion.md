# Companion and progress sockets

The production Fastify composition owns all seven progress HTTP routes,
Socket.IO client scripts/maps and Engine.IO transports, and optional Companion
HTTP and WebSocket paths. FM-043 removes the first-party Express executable,
host, middleware and adapters. The FM-035 differential results remain historical
qualification at their recorded revisions; current gate results are in
[evidence/FM-043.md](evidence/FM-043.md).

## Boundary and ownership

`createPortalFastifyApplication` resolves the configured integration namespace and
adds the non-replaceable `portal-raw-http` module when Companion is enabled. That
module declares its domain dependencies, constructs the adapter during application
initialization, and attaches it to the host's one HTTP server during preparation,
before listening. Disabled mode constructs no Companion app, acquires no process
singleton, adds no Companion route or upgrade handler, and keeps the configured
namespace reserved against extension fallbacks.

`http/integrations/companion` contains the provider loader, bounded logger,
transfer/socket owner, canonical popup action and native-to-Express handoff.
There are no Express compatibility re-exports or alternate host. Pure policy selection lives in `http/policyConfiguration`; native security
never executes Express authentication, session or policy middleware.

| Resource                                    | Acquire / admission                                                                                                                                       | Drain / close owner                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP server and listener                    | FastifyHost, one listen after preparation                                                                                                                 | FastifyHost's single retained transport-close attempt                                                                                          |
| Provider app and process guard              | CompanionUploads.initialize, at most once per process                                                                                                     | portal-raw-http module; standalone callers register the same adapter directly as a persistence resource                                        |
| Provider WS dispatcher                      | Companion.socket borrows an EventEmitter implementing its pinned server-event requirement                                                                 | CompanionUploads detaches the bridge listeners; no second HTTP Server, parser or listener exists                                               |
| Upgrade sockets                             | One server upgrade dispatcher selects the Companion owner; tracked transfer token (or bounded OAuth callback token shape), canonical Origin and readiness | CompanionUploads retains admitted work, closes idle sockets after work settles, or terminates at deadline; close unregisters only its owner    |
| HTTP/provider callbacks and transfer grants | Same host request lifetime, aliased onto the raw incoming request; public token/terminal/upload-start events                                              | Host and adapter join the same lease through response, disconnect, terminal event, connect timeout or documented deadline termination          |
| Sessions and cookies                        | Native session plugin/store; provider borrows session data/save API                                                                                       | First raw write awaits the native session commit, including provider mutations; pending commit remains HTTP/application-owned after disconnect |
| Domain, session and Mongo pools             | Existing production application modules                                                                                                                   | Existing dependency-ordered application cleanup, retained across deadline/retry                                                                |

Production composition borrows the adapter lifecycle instead of registering a
second drain/close resource. A first-write barrier preserves raw write callbacks
and pipe backpressure while session persistence settles. It is private to this
provider boundary and grants no additional public Fastify/raw capability.
Hijack bypasses Fastify serialization/onSend; this barrier supplies session writes,
the shared error writer supplies safe faults, and native onResponse plus request
and module drains retain completion accounting. Shared guards perform URL-input
checks, canonical send-token generation and audit ordering for both transports.

All HTTP entry points pass host admission, native parsing, session/authentication,
trusted brand/portal selection, the retained configured policy chain and CSRF
before provider dispatch. Native tests preserve canonical popup/CORS/COOP, body,
status, framing, representation headers, provider work and transfer ownership. Paths outside the selected integration only
assert namespace exclusion. Unhandled provider paths reach the outer portal
page fallback through normal host routing.

## Why Express remains

| Dependency                                                               | Required use                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| express 5.3.0 and its Request/Response types                             | Companion 7.1.1 returns an Express app and requires real Express request/response prototypes, routing, query parsing and response helpers. One private boundary app establishes these prototypes; it has no portal routes or security middleware. |
| Companion's express-interceptor, cookie-parser and Grant Express adapter | Provider OAuth callback responses, provider token cookies and OAuth session state. Replacing these internals is outside the public app/socket/emitter API.                                                                                        |
| express-session / connect-redis in Companion's package graph             | Companion's published standalone/package dependencies; the Fastify adapter starts neither. The portal native Mongo session store remains the only selected store. Redis and periodic-ping options are explicitly refused.                         |


FM-043 keeps exactly two direct Express requirements in core: `express@5.3.0`
and `@types/express@5.0.6`. Only `http/integrations/companion/fastify.ts` imports
Express at runtime: its unlistened boundary app establishes real provider
prototypes and performs the namespace handoff. Only that file and `uploads.ts`
import provider Request/Response/NextFunction types. They are private implementation
files; no public declaration or export exposes Express. All generated JavaScript
and internal declarations obey the same exact-file audit exception.

The dependency audit permits Express packages only below `@uppy/companion`, or
below core's two exact direct requirements. Companion's Express router, body-parser,
Express session/Redis standalone modules, cookie-parser, express-interceptor and
Grant adapter belong to its published graph. Core does not invoke its standalone
session/Redis modules. There is one native session store, listener and signal owner.
The adapter exposes no Express-shaped portal request/reply facade.

The separate Angular build lock has narrowly enumerated build-only exceptions:
`@angular-devkit/build-angular` → (optional `@angular-devkit/build-webpack`) →
`webpack-dev-server` → `express`, Express types and `compression`; Express's
`body-parser` and the dev server's `@types/serve-index` /
`@types/connect-history-api-fallback` type edges are included explicitly.
The unchanged Karma tool (directly or through the builder / `@angular/build`)
requires only `body-parser`. That parser exception permits no Express/session
package beneath Karma. No source/type import or direct Angular manifest dependency
is exempt. No Angular exception applies to server npm graphs, packed packages or
production images; FM-043 must prove those graphs exclude the Angular builder,
webpack dev server and Karma. `@angular-devkit/build-angular` stays unchanged.

Provider defaults remain those of the pinned release. Optional URL-import
configuration is explicitly forwarded by the native integration (`enableUrlEndpoint`, `allowLocalUrls`, `streamingUpload`, `chunkSize`,
`clientSocketConnectTimeout`); normal defaults disable URL imports/local URLs.
The test deployment enables only disposable local source/destination services.
Metrics is selected explicitly by hydrated configuration (default false).

## Process lifetime and limits

Companion 7.1.1 has a singleton emitter/provider registry, production daily cleanup
cron, internal upload workers/remote I/O and provider clients without public
complete-disposal handles. Its `socket` API exposes no WebSocketServer close
handle. All adapter-owned sockets/listeners are terminated/detached, but this does
not claim disposal of the provider's process globals. The bounded logger loader
checks the exact pinned version and module hash, and refuses prior unsafe imports.
Redis and periodic pings are rejected because they also lack owned close handles.

After full stop, start a **fresh process**. Never reset the process guard or reuse
the stopped adapter/application. A stop deadline closes admission and terminates
remaining adapter-owned sockets/grants, while an executing provider HTTP callback
or session write remains owned until it settles; Mongo dependencies cannot close
under it. Retry stop explicitly. A timed-out provider's internal remote I/O may
still require process termination; closing a socket is not proof it was cancelled.
The separate production-cron process probe tests this limit after owned cleanup.

Route Engine.IO polling and upgrades, grant issuance, reconnects, Companion
HTTP requests and transfer/callback sockets to the same process. Grants and
active work live in that process; Mongo-backed sessions do not make those
resources portable. Reconnect to a progress socket requires a fresh one-use
30-second grant. Companion reconnect may resume observation/control of the
same retained in-flight transfer in that process. No cross-replica transfer,
grant, callback or progress continuity is claimed.

The dispatcher installs one `upgrade` listener for both protocol owners.
Engine.IO owns only its configured raw prefix; Companion owns only its configured
namespace. An unknown upgrade closes as on Express. Every Engine.IO request,
including existing polling sids and upgrades, enforces the canonical Origin
(the accepted FM-020 behavior). Client script/map bytes and headers remain public
as on Express. Companion HTTP routes retain native admission, policy, actor,
CSRF and session publication guards before the private provider boundary.

Tests cover disabled, enabled with both supported providers, Drive-only,
OneDrive-only and streaming-upload configurations. Authenticated list/download
and callback-token generation use the actual provider clients and verifier;
synthetic provider network replies come from a disposable upstream. Real URL
and provider downloads upload through both external TUS and the production
portal's Companion TUS aliases, with exact staged bytes checked. This does not
claim institutional OAuth credentials or external provider availability.

The pinned baseline also returns 404 for the direct Grant entry under a nonempty
implicit root: Grant matches originalUrl against server.path without implicitPath.
The retained production test characterizes that existing status. This pre-existing
direct Grant path remains deferred. Absolute-form provider
connect/callback HTTP targets likewise retain the Express 404, while generated
redirects and popup origins use configured canonical URLs even with hostile
Host/forwarded headers. Absolute-form callback WebSocket targets are authorized
using their parsed paths and forwarded with the normalized configured namespace.
Unsigned provider deauthorization callbacks retain the provider's 500 response;
the native shared opaque-error boundary retains its existing restricted headers.
See FM-035 evidence for exact checks and deferred issues.

The unchanged Karma Jasmine, HTML and JUnit reporters also reach Karma through
peer dependencies. Only their exact `reporter → karma → body-parser` paths in
`angular/package-lock.json` are allowlisted; they cannot justify Express beneath
Karma or a first-party parser dependency.

FM-043 also fixes the allowed provider closure by package name and existing
locked version: Express **5.3.0**, `@types/express` **5.0.6**,
`@types/express-serve-static-core` **5.1.1 / 5.1.3**, `@types/body-parser`
**1.19.6**, `body-parser` **2.4.0**, `cookie-parser` **1.4.7**,
`connect-redis` **7.1.1**, `express-interceptor` **1.2.0**,
`express-prom-bundle` **8.0.0**, and `express-session` **1.18.2 / 1.19.0**.
The two session/type versions reflect existing application and package lock
layouts. The provider's metrics dependency (`express-prom-bundle`) is only
activated by explicit metrics configuration. A new name/version, middleware
bridge or uncontained ancestry fails the audit. This inventory grants no
first-party import exception beyond the two private files above.

The runtime closure gate inventories the actual built image independently of
`npm ls`: it walks the complete physical filesystem (including every nested or
standalone `node_modules`, package links and linked JavaScript files), inventories
package identities and parses Express import/require/type sites. Only the
physically resolved dependency closure of pinned Companion 7.1.1 and the two
private first-party boundary files above may contain those references. Angular
builder, webpack-dev-server and Karma packages are forbidden anywhere in that
runtime inventory. The Angular lockfile exception applies only to build tooling;
it never applies to the runtime filesystem, even if a copied Angular installation
is invisible to the root dependency graph.

CI builds the production `runtime` target and runs
`support/tooling/fastify-retirement/runtime-image-audit.cjs` against that image.
Its normal scan has no source/tooling mounts, no network and a read-only
filesystem. A second disposable container copies an independent Angular builder
→ webpack-dev-server → Express tree into the image and proves that the package
inventory and physical require-site scan reject it. The container overlay is
removed afterward; the qualified image is unchanged.

The production dependency stage also removes unused vendor artifacts rather than
exempting their Express sites from that scan. `prune-runtime.cjs` limits removal
to the following existing package versions and paths; another version requires
review. Native package implementations and the native OIDC entrypoint remain.

| Package | Version | Removed runtime-image artifacts |
| --- | --- | --- |
| `@fastify/session` | 11.1.6 | `benchmark/`, `examples/`, `types/index.tst.ts` |
| `@fastify/view` | 12.0.1 | `benchmark/` |
| `express-interceptor` | 1.2.0 | `examples/`, `test/` |
| `light-my-request` | 6.8.0 | `test/` |
| `openid-client` | 6.8.8 | `build/passport.js`, its map and declaration; the unused `./passport` export |

This is runtime packaging, not an import/dependency exception. The scanner still
parses every remaining source. Companion declaration imports may resolve to their
physically installed, pinned `@types` packages in the same provider closure;
JavaScript requires cannot use that declaration fallback. Unrelated consumers,
including ones importing those same types, remain forbidden.
