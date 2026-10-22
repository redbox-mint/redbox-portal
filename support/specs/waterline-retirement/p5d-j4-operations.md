> **Current status (phase 8 onward):** Prisma is the sole backend. Remove all
> persistence backend selectors and Sails aliases, including empty or `prisma`
> values. Selector forwarding and Waterline rollback instructions below are
> historical. Follow the [current migration guide](../../wiki/Persistence-Migration.md).

# J4 Figshare durable sync operations

`persistence.groups.figshare.backend` selects the promoted `mongodb` default or explicit `waterline` rollback;
restart changed instances. Supplied stacks forward `RBPORTAL_FIGSHARE_BACKEND`.
The selector is independent of SIEM, harvest, progress, vocabulary and record
storage. There is no fallback. Keep the retained model definitions/shims until
their separate retirement phases. The gate ledger records the current default.

Stop dispatchers, incoming source producers and administrative changes, drain
accepted workers, checkpoint the database and matching hooks/config/assets, and
retain the pre-J4 image in the validation manifest. With the intended stopped
process configured for MongoDB, run `npm run persistence:indexes -- --inspect`,
review all selected reports, then explicitly `--ensure` and inspect again.
Driver startup only inspects. Existing volumes never rerun fresh initialization.
Known duplicates, conflicts and unsupported binding-array shapes block without
cleanup. Institution mappings must remain Waterline until ported and qualified.

Three legacy indexes are preserved: full unique OID; unique namespace/article
binding only where both fields match the string partial predicate; and the
next-action/dispatch index. Scalar partial duplicate groups are audited before
any selected DDL. Mongo's type predicate also matches arrays; those unqualified
multikey shapes are refused rather than reported with an incorrect scalar count.
No TTL, bulk rewrite, new namespace or automatic repair is introduced.

The plain `FigshareSyncRepository` owns named sync, source import, dispatch and
lease operations. Mongo `_id`, collections, cursors and driver results are
private. Revision changes replace the complete document under CAS, preserving
its immutable `_id`; deleted optional properties disappear. There are at most
30 retries for an unmatched revision, and no automatic retry of an ambiguous
driver error. Native initialization retains absent optional fields and omits
Waterline's insertion defaults/timestamps. The Waterline baseline borrows the
actual model's datastore and fixed legacy `figsharesync` namespace; its original
native protocol bypasses model create/update callbacks. Unsupported loaded
metadata/callbacks are refused on MongoDB until explicitly ported.

Leases, dispatch cooldowns and due times are numeric milliseconds. They are not
J2 string timestamps or BSON Dates. Workers claim atomically, renew an unexpired
owner and fence every checkpoint/remote guard. Administrative claims and binding
lookups are named operations, without exposing the native collection. Release
matches the owner and cannot release a successor. Generation and receipt state
survives adapter changes, mixed processes and restart.

Source intent remains with the configured RecordsService/storage owner. Import
persists job state and then reads it back, verifying the imported generation and
per-kind source work before acknowledging storage. A successful update count by
itself is insufficient. Failed import/readback withholds acknowledgment; replay
is idempotent. Storage acknowledgment remains generation-conditional, so an older
ack cannot clear newer pending work. An acknowledgment may have applied before
its error reached the worker; inspect both durable states before recovering.
Record storage and its existing partial-write/revision protocols are unchanged.

Job state, record projection, Agenda delivery, audit and remote Figshare effects
are separate effects. Queue dispatch is disposable; due work remains durable.
Preserve submitted/uncertain create and publish markers, upload receipts,
generations and explicit resume approvals. Reconcile ambiguous remote effects
by their existing read/receipt/token protocols before another mutation. Never
interpret a failed acknowledgment as proof of absent state or a missing remote
side effect. Pause and use the existing administrative repair flow when evidence
is insufficient. No exactly-once or cross-system transaction is claimed.

Service init registers worker draining before foundation shutdown. Drain stops
new dispatch/wake/admin/job work and waits for accepted storage acknowledgments,
HTTP operations, heartbeat cleanup, receipts and final checkpoints while the
repositories still accept completion writes. Call `drain()` before direct
persistence cleanup. The normal Sails shutdown chain does this automatically.

For selector rollback drain owners, choose Waterline and restart against the
same namespaces/indexes. For code rollback use the exact pre-J4 image and
matching config/hooks/assets, selecting compatible backends for every later
group. Retain database/FCV/topology/indexes. The older native path keeps its
legacy index setup permissions. Checkpoint restoration is a separate operator
decision and must reconcile later record and remote changes.

Fixed provisional next limits remain p95 <=1.20, throughput >=0.90, RSS <=1.10
and database calls <=1.25 relative to Waterline; readiness <250ms, one shared
foundation client and no app connections after close. The bounded comparison and
controlled HTTP/storage recovery evidence are in the validation ledger. This J4
gate is independent of transaction-gated Figshare vocabulary work. G-TX remains
closed and supplied stacks stay standalone.
