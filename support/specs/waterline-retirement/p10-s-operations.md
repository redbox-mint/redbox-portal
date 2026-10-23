> **Current status (phase 8 onward):** Prisma is the sole backend. Remove all
> persistence backend selectors and Sails aliases, including empty or `prisma`
> values. Selector forwarding and Waterline rollback instructions below are
> historical. Follow the [current migration guide](../../wiki/Persistence-Migration.md).

# P10 staged S operations

**Current status — Prisma phase 7:** the S selector now covers all record,
DeletedRecord, CAS/lifecycle/source-intent, recordidentity, authorization/U,
Counter and OID-rebind paths as well as staged storage. Values are
`prisma | waterline`, default Prisma; `mongodb` is rejected. Counter uses an
atomic Prisma increment (S-01 improved). TX-PARITY-01/01a and ADR 0004 supersede
all transaction/shared-session and campaign gates below. No transactions;
ordered partial outcomes remain. [Phase 7 evidence](evidence/prisma-phase7.md)
and the [current operator guide](../../wiki/Staged-Storage-Persistence.md) are
current. The rest of this page records the **historical staged qualification**.


Current selector update (ADR 0004, Prisma phase 5): staged S now accepts
`prisma | waterline`, defaults to `prisma`, and rejects removed `mongodb`
overrides with migration/index guidance. The driver-era behavior and recovery
record below is historical; the same staged allowlist and retained owners apply.
See [phase 5 evidence](evidence/prisma-phase5.md) and the
[current storage guide](../../wiki/Staged-Storage-Persistence.md).

Implementation covers P10.1–P10.3 and P10.5–P10.8 for the **staged subset**.
G-S passes for bounded transaction-free `next`; the independent promotion
`0be51a5f6` defaults S to **mongodb**. G-TX stays CLOSED and OPS-TX-01 undecided.
P10.4 (atomic/U participation) and P11 bridge retirement remain unimplemented.
No supplied stack topology changes. “S promoted” does not move record/identity/
U/lifecycle/authorization operations away from their baseline owner.

`persistence.groups.storage.backend` selects the promoted `mongodb` default or
explicit `waterline` rollback. Supplied Compose files and hook templates forward
`RBPORTAL_STORAGE_BACKEND`, defaulting to `mongodb`.
Restart after changing selectors. Unknown settings, unsupported mappings,
unavailable connections and missing/conflicting indexes fail without fallback.

The selector changes attachment metadata/journal/access audit and the storage
hook's six artifact/reference operations plus five audit operations. Record,
DeletedRecord, recordidentity, all record reads/CAS/lifecycle/source intents,
authorization grant lookup, Counter and attachment OID rebind deliberately
retain their baseline owner. `stagedStorageOperations` is the complete storage
hook allowlist; every other operation stays baseline regardless of selector.
This is a declared split, not recovery from driver failure. See the
[operation classification](p10-s-classification.md) for the U dependency and
Counter race evidence. The baseline does not claim transactional atomicity.

P10.5 adds a separate revision-wrapper maintenance operation. The existing named
migration calls `recordRevisionMaintenance(app).backfill()`; its ledger name/order
is unchanged. With S=mongodb it uses the app-owned `redboxStorage` database only
after checking any loaded collection/datastore/target-column mapping overrides.
No model or manager is required on the driver maintenance path; without ORM
loading it uses the existing `record` and `deletedrecord` physical namespaces. Custom
wrapper mappings require the baseline; errors never trigger automatic fallback.
The baseline retains the original native manager and table-name resolution.
This unit is independently staged-safe: only missing/null `revision` and
tombstone `lifecycleState` are filled, with apply-time `$ifNull` protection.
It does not port record saves, authorization rewrites or atomic lifecycle units.

The default batch size remains 500 (explicit bounds 1–10,000). Run with the normal
migration runner during the agreed maintenance window; already-recorded bodies
are not replayed. Interrupted/unknown batches resume by requerying missing/null
fields. A zero-modification batch rechecks its own pending IDs and refuses a
genuine stall. Stop and inspect a stalled dialect/mapping rather than broadening
the predicate. Existing non-null revisions/lifecycle states, metadata, workflow,
authorization, lastSaveDate and unknown fields are untouched. There is no broad
rewrite, implicit backfill at repository construction or transaction claim.

Stop writers and retain the database checkpoint and matching hooks/config.
With the intended application's selector set, run:

```sh
npm run persistence:indexes -- --inspect
# Review every selected scope, mapping refusal, duplicate count and conflict.
npm run persistence:indexes -- --ensure
npm run persistence:indexes -- --inspect
```

S adds 15 index scopes: six declared attachment indexes in `mongodb`, and nine
existing native schema/audit indexes in `redboxStorage`. Inspection includes all
selected groups before any DDL. Ensure never drops conflicting indexes, deletes
duplicates, repairs documents or runs a backfill. Startup inspects the staged
scopes; the retained record owner keeps its existing index initialization.
The shared fresh-volume init and generated hook template prepare identical S
indexes in the default physical databases. Custom logical database names use
the effective application config and explicit preparation command.

The isolated loaded `migrate: safe` spike did not create the attachment or
Counter secondary indexes. Attachment driver selection therefore requires
explicit preparation of the already-declared storageKey and oid/fileId unique
keys. Review existing duplicates with writers stopped; there is no automatic
cleanup. No Counter index or stronger allocator is introduced by S selection.

Attachment timestamps and leases stay ISO strings. Normalization, enum/null
insertion defaults, finite counts, journal identity, cleanup token/generation
fencing, expired leases and coordinator reservations remain the existing
protocol. An omitted update field remains unchanged. Malformed optional scalars,
rich BSON and unsupported timestamp shapes are refused without rewriting data.
A dispatched write exception is unknown: reconcile the journal and physical
object before another write. Read failures use a separate safe diagnostic;
existing schema validation/domain codes remain intact. Audit
appends and access-count updates are staged, with no exactly-once or atomic
count claim. Single-result attachment reads refuse multiple matches as the
Waterline baseline does.

Artifacts/references retain native BSON Date storage, content-collision checks,
immutable keys, target recheck/compensation, scoped grants, pins and expiry.
Their legacy service interfaces still use Date values; no BSON, collection,
filter, session or cursor type is added to the repository API. Retention remains
the existing bounded non-destructive report. Atomic destructive retention would
need its own decision and G-TX qualification.

Both adapters retain physical collections and datastores. All first-party direct
MongoDB pins now use exact **7.7.0**; npm 11.20.0 regenerated root/storage locks in
a dedicated commit. Staged adapters borrow the shared app runtime pool. Compatible
`mongodb` and `redboxStorage` policies share a pool without moving collections;
different credentials/TLS/read/write policy retain separate pools. Concrete
adapter ports still avoid nominal driver/cursor classes at package boundaries.

The retained record owner still borrows Waterline's manager (BSON 6) for all
record/U/lifecycle operations. Its legacy GridFS bucket now borrows the app-owned
BSON 7 driver database for the **same Record datastore and fs namespace**. Pin
alignment alone did not fix the recorded ABI failure; changing the bucket's Db
owner does. Byte reads/writes/deletes and accepted returned streams are drained
before app pools close. No record operation or G-TX unit changed backend.

Flydrive GridFS has separate app-scoped clients, shared across buckets with the
same effective connection policy. It captures its application, preserves split
configuration, refuses new work while draining, waits for accepted operations and
streams, closes partial initialization and retains failed closes for retry.
`dispose(app)` is repeat-safe; disposing one app cannot close another's clients.
A retained disposed driver refuses new work. Legacy-logo reads resolve effective
application configuration, retain short-lived owned clients through `finally`,
and participate in app draining/failed-close retry.

Agenda queue/history/SQS remain separate protocol owners. With no queue address,
Agenda borrows the app database; an explicit address owns its queue client.
History retains the existing application database/collection routing, including
when the queue address differs. The service awaits backend connection before
constructing Agenda, retains partial starts, stops producers, drains workers and
pending writes/history, then explicitly disconnects each backend. Agenda 6.2.6's
`drain()` clears the processor, making a subsequent `stop()` unable to close the
backend; explicit ownership avoids that leak. SQS clients are destroyed by their
owner and recurring/long-delay/query limitations are unchanged. SQS verification
uses a local protocol endpoint and synthetic credentials, never AWS.

Sessions keep connect-mongo's independent store, cookie/login and native TTL
index behavior. Shutdown refuses new requests, waits for accepted responses and
session saves, then closes the store. Resource close/drain failure retains app
pools and permits cleanup retry. After cleanup, explicit persistence
initialization is required before registering fresh owners.

The ownership fixture uses an explicit 1-second Agenda job lock lifetime to
bound its exit. Agenda 6.2.6 leaves a completed-job watchdog asleep for its existing interval
(maximum of processEvery / 2 and lockLifetime / 2); it checks the stopped flag before further I/O. Existing
production defaults and that upstream timer behavior are unchanged. Connection
and worker draining are proven; whole-process timer quiescence is not claimed.
The package test runner disables Node's native TypeScript stripping, matching
the core runner, after a clean local install exposed the loader conflict.

For selector rollback, stop HTTP writes, producers, dispatchers and migration
runners; drain accepted work, checkpoint both logical databases and corresponding
staging/primary bytes plus hooks/config/assets, then restart with
`persistence.groups.storage.backend=waterline` (or `RBPORTAL_STORAGE_BACKEND=waterline`).
Keep the same namespaces, indexes, database binary/FCV/topology and permanent
identity ledger. Verify schema authorization, record revisions/lifecycle,
attachment bytes/journal state and durable audit. There is no automatic fallback.

For code rollback retain the immutable pre-promotion core+storage qualification
image from `12e566575`, its recorded installed lock and matching hooks/config/assets
in [the artifact ledger](evidence/p10c-s/packed-prior-artifact.json). Its digest is
`sha256:c138489fc72f566815113599b699e13ad55486176f333c394238b361bca094d3`.
Use the appropriate complete portal release image in a real deployment; this
retained image is the bounded development storage rehearsal. Current Compose
files default to MongoDB, so keep `waterline` explicit when using newer Compose
configuration for rollback. The actual image reads driver-written bytes/schema,
writes interoperable metadata/audit and validates restored matching checkpoints.
The evidence includes a forward restart. Code/config rollback does not undo
later writes or external effects. A checkpoint restore is a separate operator
choice requiring a defined loss window and reconciliation before producers resume.
Never erase recordidentity, replay recorded migration bodies or treat a failed
acknowledgment as proof that a write or byte effect is absent.

The fixed provisional next budgets are p95 <=1.20x, throughput >=0.90x,
RSS <=1.10x and database calls <=1.25x Waterline, readiness overhead <=max(250ms,
10% baseline), one shared app pool per compatible policy and no app sockets after
close. [Validation](p10-s-validation.md) records the passing bounded campaign,
separate byte throughput and retained owner/drain limits. The stock default and
explicit Waterline suites, packed consumers and fresh readiness are renewed after
promotion. Formal operations/release/security/institution approval remains open;
real deployment concurrency, failover, auth/TLS and institution hooks/data need
qualification. Stronger Counter allocation is a separate human decision.
No model, shim, association or bridge is retired by this promotion.
