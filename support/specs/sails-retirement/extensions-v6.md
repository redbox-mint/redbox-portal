# Implemented v6 extension declarations (P2)

Packages opt in with `"redbox": { "extension": "./extension" }` in their installed
manifest and expose that public subpath through `exports` (or use `"."` for the
main public entry). Export `registerRedboxExtension()` returning a fresh
`RedboxExtension` with `apiVersion: 1`. Native awaited import supports ESM named
exports, ESM default registration functions/objects and CommonJS exports. CommonJS
format compatibility requires converted v6 source; existing Sails hooks do not
become compatible merely by changing manifest metadata.

Import the narrow types from `@researchdatabox/redbox-core/extensions`.
Use its exported `RequestHandler` type for handler factories so declarations use
the host's Express 5 types even in a checkout with legacy Express 4 typings.
`@researchdatabox/redbox-core/extensions/config` exposes the existing pure DOI
binding helper without importing the legacy core barrel.
Registration/imports are offline: no repositories, clients, writes, workers,
listeners or process handlers. Factories synchronously wire concrete dependencies;
awaited module initialization acquires resources. Inspection does not run work.

The contract declares startup config, module factories, HTTP handler factories,
routes, middleware at beforeRoutes/afterRoutes stages, server integrations,
migrations/bootstrap work, jobs, forms/workflows, config-model definitions, contributor ownership and
package-relative view/asset roots. Domain factories implement `ApplicationModule`;
Express handler factories stay separate. Each concrete factory defines its own
input interface. A host composition binds only that factory's required operations
and startup slices; the declarations do not receive a service locator.

Resolve the complete set before creating instances. Core is lowest precedence;
`hookLoadPriority[0]` wins over later listed hooks and unlisted hooks. Unlisted
lookup is descending package name. Contributions process low to high, resources
search high to low. Names within one provider are unique. A higher-precedence
named replacement explicitly declares `replaces: true` and requires an existing
target. Missing module prerequisites and cycles fail offline. Migrations retain
lexical name order independently of extension priority; resolving does not run
them or replace the existing migration ledger. P3 owns orchestration and config
merge rules.

Routes identify a named handler factory and explicitly declare `access: 'public'`
or a nonempty ordered list of policy names. Named replacements retain or expressly
revise the route's contract and policies; accidental method/path collisions fail
before mounting, including parameter-name, case and trailing-slash aliases under
the partial host's default Express router. The host
must bind policy execution; declaration metadata is not authorization. Middleware
and integrations participate in the host's admission and application cleanup.
Integrations attach to the host's single server, never call listen or add signal
handlers, and register ownership before preparation. This interface is a supported
contract, not a sandbox for arbitrary hook code.

P2 does not promote a production host, merge institution configuration, activate
queue backends, or implement public route/authentication/provider parity. Those
remain in P3–P6. Bundled packages temporarily retain their explicit legacy entry
alongside the neutral public extension subpath for the separate comparison host.

See [the initial scaffold and before/after conversion examples](hook-migration-v6.md).

## P3 startup orchestration

`composeExtensionApplication` now requires a `work(registration)` binding when the
resolved set declares migrations/bootstrap. Use `bindExtensionWork(declaration,
concreteInput)` just as for selected factories; it binds only that operation's
input. Bindings do not execute during resolution/composition.

The application's fixed stages are root/selected persistence and index readiness,
module initialization, lexical ledger migrations, core bootstrap, ordered extension
bootstrap, and post-bootstrap prerequisites. The optional fourth composition
argument supplies `preparePersistence`, named `coreBootstrap` and named
`postBootstrap` operations, plus application version metadata. Work declares
`requires` module names; missing prerequisites fail before acquisition. Put storage
capability and contributor registration before schema checks, and dashboard target
finalization after all hook bootstrap work. Normal consumers remain inactive until
explicit activation and HTTP preparation succeeds.

The runner is the existing Umzug/Prisma ledger implementation extracted into
`application/migrations.ts`. Migration names/source/history retain their meaning;
it records success only after the body. Failed bodies can leave partial writes;
no transaction, distributed body lock or exactly-once guarantee is added. Fresh
applications skip ledger-completed bodies. Keep one designated migration runner
and stop other writers during upgrades. Startup inspects required indexes;
explicit index ensure remains maintenance work. Comparison-only Sails callbacks,
configuration-write waits, version/global discovery and the legacy migration skip
flag live in `compat/sails`; neutral imports do not execute them.

Queue and cron owners are available at `redbox-core/queues`. Bind each configured
Agenda `fnName` to a concrete handler; missing bindings fail initialization. Queue
initialization borrows the application pool, inspects required indexes, connects
and defines jobs. It neither claims jobs nor persists startup schedules. Activation
starts each backend once and awaits every configured schedule write; normal
submissions require activation. SQS recurring work still requires an external
scheduler. Cron receives named, bound async operations and owns both timers and
accepted callback promises. Required remote imports belong in named bootstrap
work rather than recurring work. PDF retains its existing explicit activation and
owned retry/browser lifecycle. The temporary Sails adapters alone translate ready
callbacks, global lookup, legacy lazy queue initialization and shutdown hooks.

Resources may implement synchronous, idempotent `quiesce()` to close producer
admission before draining. The application invokes it immediately on stop, then
awaits accepted startup/work, resource drains and close, Prisma clients and pools.
Use the existing persistence owner and `runAcceptedPersistenceWork(owner, asyncWork)`
for a concrete accepted callback lifetime. Repository operations inside that live
scope can finish during shutdown; unrelated callers and detached descendants after
scope settlement are denied. Queue handlers enter this scope; persisted cron
operations supply their owner. Do not retain a scope for unbounded detached work.

Supply the same `owner` to the partial Express host for persistent handlers. Its
existing HTTP lifetime interface owns `trackHttpRequestWork`, callback/response
handoffs and accepted request context. A finished/aborted response alone cannot
release explicitly tracked work. P4/P5 route adapters must retain returned action
work and session handoffs through this interface; the partial host does not yet
adapt arbitrary legacy actions. Future upload/socket/native owners must use this
resource contract and keep real work, including late completion writes, owned.
