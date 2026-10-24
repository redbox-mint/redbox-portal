# Implemented v6 extension declarations

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
the host's default Express router. The host
must bind policy execution; declaration metadata is not authorization. Middleware
and integrations participate in the host's admission and application cleanup.
Integrations attach to the host's single server, never call listen or add signal
handlers, and register ownership before preparation. This interface is a supported
contract, not a sandbox for arbitrary hook code.

The contract was introduced in P2; P3–P6 added production composition, startup
configuration, queues, public routes and authentication/provider ownership. P8
retires bundled legacy entries and all comparison adapters. Extensions must use
the neutral public entrypoints.

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
explicit index ensure remains maintenance work. Comparison-only callbacks,
configuration-write waits, version/global discovery and the legacy migration skip
flag were removed with `compat/sails` in P8.

Queue and cron owners are available at `redbox-core/queues`. Bind each configured
Agenda `fnName` to a concrete handler; missing bindings fail initialization. Queue
initialization borrows the application pool, inspects required indexes, connects
and defines jobs. It neither claims jobs nor persists startup schedules. Activation
starts each backend once and awaits every configured schedule write; normal
submissions require activation. SQS recurring work still requires an external
scheduler. Cron receives named, bound async operations and owns both timers and
accepted callback promises. Required remote imports belong in named bootstrap
work rather than recurring work. PDF retains its existing explicit activation and
owned retry/browser lifecycle. Ready callbacks, global lookup, legacy lazy queue
initialization and framework shutdown hooks are retired.

Resources may implement synchronous, idempotent `quiesce()` to close producer
admission before draining. The application invokes it immediately on stop, then
awaits accepted startup/work, resource drains and close, Prisma clients and pools.
Use the existing persistence owner and `runAcceptedPersistenceWork(owner, asyncWork)`
for a concrete accepted callback lifetime. Repository operations inside that live
scope can finish during shutdown; unrelated callers and detached descendants after
scope settlement are denied. Queue handlers enter this scope; persisted cron
operations supply their owner. Do not retain a scope for unbounded detached work.

Supply the same `owner` to the Express host for persistent handlers. Its
existing HTTP lifetime interface owns `trackHttpRequestWork`, callback/response
handoffs and accepted request context. A finished/aborted response alone cannot
release explicitly tracked work. Route adapters retain returned action work and
session handoffs through this interface. Upload/socket/native owners use this
resource contract and keep real work, including late completion writes, owned.

## Selected mutation operations and native providers

The migrated adapters accept their selected Records/Users/Branding/vocabulary/
provider operations directly; resolve named factory overrides before construction.
They never look up a Sails service or dispatch through a legacy controller when
an operation is missing. Record hook names resolve through `RecordPipelineInput.
resolveHook` to known callable operations. Preserve the existing hook arguments,
ordering, response effects and save compensation; do not evaluate configuration
as JavaScript. Configured HTTP actions use the smaller `ConfiguredAction` pair:
`authorize(context)` and `execute(context)`, with explicit actor/brand/portal and
plain input facts. The adapter awaits the action's audit.

Register the actual StreamingMultipart, ResumableUploads and ProgressSockets
owners with the application's existing resource owner. Resolve policies for the
whole group before mounting any route. Use raw parser exclusions for tus and
multipart, current record ACLs and independently verified bearer exemption or
browser CSRF. ProgressSockets takes the same persistence owner so its draining
completion permission belongs to an active admitted HTTP/job scope. A detached
callback cannot acquire completion privileges from an old scope.

Companion is an explicit process singleton, constructed only during host/application
initialize using pinned 7.1.1 public APIs. A second application requires a separate
process. Set metrics explicitly, attach the provider to the owned unlistened event
bridge and forward only its canonical socket paths. No registration/import may
construct `app()`. Cleanup cron and beyond-deadline provider-internal I/O remain
process-owned; Redis and periodic pings are not supported by this adapter. See the
[design ownership/limitations](design.md#companion-711-ownership-and-residual-limitations)
and [executed evidence](evidence/p6-uploads.md).
