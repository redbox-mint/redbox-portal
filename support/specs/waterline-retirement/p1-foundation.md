# P1 repository foundation and institution seam

Decision owner/user direction: 2026-10-20, accepted ADR0003. This foundation is
transaction-free. G-TX remains closed; no development/test/CI topology changes.

## Public contracts

Import from `@researchdatabox/redbox-core`:

- `JsonValue`, `PersistenceId`, `LogicalDatastore`, `PersistenceGroup`,
  `PersistenceBackend`, `PersistenceResource` are plain types. IDs remain opaque;
  domain operations specify physical/time/null/error semantics per group.
- `CacheEntryRepository`, `CacheEntryRecord`, `CacheEntryWrite` and
  `getCacheEntryRepository(app?)` retain the four-operation cache seam. Optional
  application injection avoids process-global lookup in multi-app/hook tests.
- `initializePersistence(app)` initializes app ownership/validates selectors,
  **offline**. Before `cleanupPersistence(app)`, stop producers and await accepted
  handlers that still need to start repository operations. Cleanup refuses new
  repository operations, drains tracked operations/resources, then closes
  app-owned pools. Resource failures retain ownership for a later cleanup retry;
  initialization refuses to acquire replacements until failed cleanup finishes.
- `registerPersistenceResource(app, name, {drain?, close})` registers an owned
  queue/session/blob dependency with explicit callbacks, never a model/provider
  registry. Duplicate registration fails before replacement. Register a partial
  initialization owner before acquiring resources; make cleanup repeat-safe.
- `groupBackends(config)` validates temporary group choices. The supported
  group keys are `migration`, `reference`, `configuration`, `progress`, `harvest`,
  `siem`, `figshare`, `identity`, `vocabulary`, `branding`, `storage`.
- `PersistenceIndex`, `PersistenceIndexInspection`, `inspectPersistenceIndex`,
  `requirePersistenceIndex`, `ensurePersistenceIndex` provide **explicit scoped
  maintenance**, never startup schema synchronization. Prepare descriptors in
  the owning package/domain; do not infer unique constraints from model names.

`persistence.groups.<group>.backend` accepts `waterline` or `mongodb` for qualified
implementations. During P1 all new groups began on Waterline; separate group
qualifications/promotions now default M, R, Q and J1–J4 to MongoDB with explicit
Waterline rollback. Identity, vocabulary and branding retain their independent
gates; premature MongoDB selection is refused. The staged storage subset passed
G-S for `next` and separately promoted MongoDB, retaining explicit Waterline
rollback. Record/identity/U,
Counter and attachment OID rebind remain baseline-only regardless of selector.
See [S operations](p10-s-operations.md); atomic S remains G-TX gated. Do not add a generic
query/repository registry.
Unknown/stale group/backend/settings fail, with no fallback. Existing cache
configuration accepts `waterline` or `mongodb`; absent/default is
**mongodb** after C2. `prisma` fails with actionable migration guidance. `mongodb` names the concrete official-driver backend and avoids the
ambiguous `driver` alias. Use the existing logical datastore settings, standard Sails configuration merge and the supplied cache/group Compose environment forwarding; there is no additional cache URL.

The concrete `mongoDatabase(app, logicalDatastore)` and `persistenceOperation`
are root-exported with **@internal** for first-party concrete adapters, including
the storage hook, and excluded from the institution contract catalogue. They are
not institution/domain public interfaces. The MongoDB cache class stays private;
driver clients, BSON, sessions, filters and cursors stay inside concrete adapters.
This is not a CRUD facade or unit of work.

Core pins **rttc 10.0.1** directly for the private scalar coercion used by R/Q/J1
query adapters, Q/J1 numeric writes and staged storage audit writes. This is the
existing Sails-stack runtime checker used by loaded Waterline, imported without
loading the ORM. No rttc objects or types cross repository contracts; the
root-exported `coercePersistenceScalar` is `@internal` for the first-party storage
adapter. Loaded-model bidirectional comparisons qualify the preserved semantics,
and readiness refuses changes to the qualified attribute types/callbacks.
This dependency remains after Waterline retirement unless P11/P12 separately
qualifies its replacement; removing ORM packages does not authorize deleting the
checker or changing coercion behavior.

## Connection and index policy

The resolver reads `app.config.datastores.mongodb` and `redboxStorage` directly;
no loaded model, manager or sails-mongo normalizer is used. It preserves legacy
URL/protocol-less/split precedence, numeric split conversions, escaped DB names,
single decoding for split credentials and legacy auth splitting/double decoding for URL
credentials outside the comma branch. Comma-bearing URLs (including query tags)
ignore split fields and retain the driver's normal decode. URI/auth/TLS/SRV/
read/write/pool options remain effective. Coercing JSON options and rich/function
connection-policy options fail safely. No parse/connect cause with credentials
is retained in public initialization diagnostics.

Pools are app-owned and acquired lazily. Effective host/authSource/credentials/
TLS/options policy, excluding only driver-generated process metadata/default
callbacks and logical dbName, determines pool sharing. Different default
credential auth databases intentionally prevent sharing. Two compatible logical
databases borrow one client/pool; no per-model pools or model registry. Separate
servers remain separate pools and do not satisfy branding's transaction policy.
Root, core and the storage hook now pin driver 7.7.0 exactly. Public DTOs keep
driver/BSON types inside their owning adapters.

Inspect reports namespace/index status and counts only. Startup never ensures,
deletes duplicates or drops conflicting indexes. Full unique plain keys have
an explicit duplicate count; partial/sparse indexes require operation-specific
readiness audits (no misleading generic count). DDL authority and post-create
verification handle concurrent changes; an initial scan never authorizes use.
AppConfig duplicates are preserved. Each group supplies its own descriptors and
runtime readiness before writers. Existing cache inspect/ensure APIs remain authoritative; C2 removed Prisma freshness/generation after qualification and separate promotion.

## Resource dependency, drain and close matrix

| Resource                  | Acquisition/ownership                                            | Drain/close and remaining owner-phase evidence                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Waterline models/managers | Existing ORM owner; adapters only borrow                         | Runtime never closes them; retain actual loaded hook definitions/callbacks. P11 removes connected definitions only after association analysis.                                                                                                                                     |
| Foundation clients        | One app-owned client per compatible policy                       | Refuse new tracked operations, await accepted operations/acquisitions, drain resources, close resources then pools; retain failed ownership. Imports/build/shims stay offline.                                                                                                     |
| Driver cache              | Borrows foundation application DB                                | Four operations tracked; no independent pool. Cleanup invalidates repository getter; shared owner closes pool after users.                                                                                                                                                         |
| Agenda Mongo default      | Borrows resolved app DB, without User manager                    | Register before queue construction. Before foundation shutdown, stop producers and await accepted jobs/checkpoints through `stop(false)` plus application-owned handler/job/repository tracking. Stop releases prefetched claims; resource closure disconnects tracked backends; the borrowed app pool remains foundation-owned. Explicit queue address remains Agenda-owned. History remains app DB. |
| Agenda SQS                | Agenda/SQS backend owner                                         | Same early worker-drain ordering; backend disconnect closes the owned SDK client. P10 ownership/partial-startup qualification covers live local-protocol requests. Queue/history are not domain models. |
| connect-mongo             | Middleware creates owned store; original TTL/cookie/login config | Register before create. Middleware quiesces accepted HTTP responses before foundation shutdown, including their repository/session writes; resource closure then closes the owned store. Stores supplied outside the mongo factory remain caller-owned. Do not supply app-owned driver clients to stores that close borrowed clients. |
| GridFS/Flydrive           | App-captured cache, survives module reload                       | Drain accepted streams before scoped `dispose(app)` closes that app's clients; retain failed closure ownership for retry. Staged P10 qualifies live stream quiescence and failure recovery. Final owner retirement retains its separate gates. |
| Legacy logo reader        | Existing operation-owned client                                  | Existing finally closure retained; no pool ownership transfer in P1.                                                                                                                                                                                                               |

Sails beforeShutdown chains prior hooks and preserves their original errors.
Deployments must stop incoming HTTP/worker producers before resource shutdown.
Agenda stops polling before awaiting pending enqueue writes and tracks actual
handler promises independently of its lock watchdog. Already-started processors
quiesce while startup index work is pending; starts finishing during shutdown
drain before initialization returns. A failed concurrent start retains all other
pending starts until they settle, preserving the original startup failure.
`agendaQueue.options.drainTimeoutMs`
defaults to 30,000 ms and bounds each drain attempt, including startup and completion
enqueues and the later producer/session shutdown hooks. Exceeding it revokes completion enqueue admission and reports pending
handler/job/enqueue/backend-operation counts; it does not close live resources or cancel accepted writes.
The application guards Sails `lower()` before native teardown: a failed hook
returns its error without emitting `lower` or closing Waterline adapters. Its
Sails-owned SIGINT/SIGTERM/SIGUSR2 listeners exit or restart only after a
successful shutdown; a refused signal leaves resources owned for retry. Concurrent
shutdown requests share one attempt. Forced process termination remains outside
the graceful shutdown contract.
Stop the remaining users and retry cleanup. A retry still awaits those original
handlers and final Agenda completion/retry writes or SQS acknowledgements, even if Agenda has already released their locks. Outstanding claims returning after stop are unlocked before closure; failed unlocks retain ownership for cleanup retry. Mongo releases compare the captured lock timestamp and unique Agenda instance owner, so retries after an applied release with a lost reply cannot clear another worker’s lock. Recovered claims with null next-run times become runnable in that same update. SQS releases keep their receipt attributes. An early stop/unlock failure preserves scoped completion admission until the original deadline; cleanup retry does not extend that admission deadline.
Queue draining also quiesces the HTTP/session owner and waits for its accepted
requests. Completion enqueues from those requests retain their scoped admission
until the request lifetime ends or the drain deadline expires. Unrelated callers
and asynchronous descendants that outlive their request remain refused.
Optional record/attachment SIEM follow-ups retain that same HTTP lifetime without
delaying the response after the primary audit succeeds. Workers and direct callers
await the follow-up as before; no separate completion permission is granted.
Foundation starts resource drains before waiting for database acquisitions, so a
partially started queue can report its drain deadline. If a resource drain fails,
foundation cleanup reports that failure before awaiting other live operations. It retains those operations, resources and pools for retry;
the failure cannot authorize closing resources beneath their users.
SQS release treats `MessageNotInflight` and `ReceiptHandleIsInvalid` as ended
receipt ownership and logs a bounded warning; other release failures retain the
claim for cleanup retry. Only the release path uses this classification.
Normal queue, session, workspace and Figshare shutdown hooks await accepted
handlers before the foundation starts refusing operations. Low-level resource
drains do not authorize starting new repository work during cleanup. Staged
[P10 ownership evidence](p10-s-validation.md) and the [final review](review-round-1.md)
cover the implemented owners; institution qualification and final retirement
retain their independent gates.

## Hooks and institutions

Waterline remains the behavior baseline. Its cache adapter uses the actual loaded
model and honors custom IDs/columns/datastores/callbacks. Existing loader priority
still replaces the whole definition. No model/shim is deleted or rewritten in P1;
unknown handwritten files are never removed. P11/P12 retain provenance-safe
manifest cleanup and actionable obsolete-registration refusal obligations.

Migrate callbacks/business behavior to existing service overrides and constructor
injection. Resolve repositories inside methods/after initialization, never during
module registration. Plain custom modules own explicit contracts and resource
callbacks; no new extension registration system is needed. Map supported physical
customizations explicitly in concrete adapters; custom cache collection/ID/column
is refused by driver selection. A retained standard CacheEntry mapping may name
a configured custom application datastore; only its logical identity is read
from the loaded definition, never its manager. The independent resolver reads
that named config directly. The model-free
cache path supports only the documented standard mapping; do not use it to ignore
a retained hook definition. Driver code does not execute Waterline callbacks.
Review every writer/callback for security/failure timing before opting in.

INST-01 remains open for private IDs/datastores/stored queries/rich BSON/callbacks.
Public synthetic fixtures cannot certify an institution. Preserve string times,
JSON null/missing distinctions, unknown fields, membership edge shapes and all
pilot deferred behaviors. No PostgreSQL adapter or universal codec is implied.

## Historical P2 handoff

M needs a small plain migration-ledger interface and loaded Waterline baseline,
then a private driver implementation using the foundation application database.
Preserve `name/source/appVersion/ranAt/durationMs/executedBy`, ledger ordering,
skip/error and pending historical bodies; unique name is not exactly-once body
execution. Require one deployment migration runner. Initialize before domain
services; no service-init cycle. Add exact physical/index/hook/raw/bidirectional/
mixed/restart/rollback/budget evidence and enable only its selector branch. Do not
promote M or cache defaults in an implementation commit, and keep U/V/B/atomic S
behind G-TX. C2 qualification, separate promotion and Prisma removal are recorded in [C2 validation](c2-validation.md); M retains its independent evidence.
