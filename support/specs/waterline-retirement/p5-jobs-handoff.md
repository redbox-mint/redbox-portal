# P5a/P5b handoff to P5c/P5d

Current follow-up: **G-J3 and G-J4 pass for bounded transaction-free `next`**.
J3 defaults to MongoDB independently in `32e2c2fca`; J4 follows independently in
`6c0194dcb`. Both retain explicit Waterline rollback. Read the current
[J3 validation](p5c-j3-validation.md), [J4 validation](p5d-j4-validation.md) and
their operations docs. The main body below records the original J1/J2 handoff
checkpoint; its J3/J4 Waterline statements describe that earlier checkpoint.

J1 and J2 have separate repositories, selectors, validation ledgers, rollback
images, operation budgets and promotion units. Read their validation records for
the current gate/default decision. Do not infer J3 or J4 acceptance from either.
G-TX remains closed, OPS-TX-01 undecided, and every supplied stack stays standalone.

J1 is promoted independently in `95a7cade5`; J2 follows in `7e4fc3d6e`.
Both now default to MongoDB with separate explicit Waterline rollback selectors.
J3 SIEM and J4 Figshare sync remain on Waterline until their own gates/promotions.

Use the existing foundation's lazy app ownership, compatible-policy shared pool,
explicit operation tracking, scoped inspection/ensure and shutdown ordering.
BSON/driver/native state belongs inside adapters; domain contracts remain plain
DTOs and named operations. J1/J2 add no ORM, query facade, unit of work, per-model
pool, second URL, automatic schema synchronization or silent backend fallback.
Retained Waterline models/shims and their association graph remain P11/P12 work.

New J groups still start on Waterline. Follow the complete per-group protocol:
real loaded physical/callback/index spike, loaded-model baseline, all consumers,
opt-in driver/readiness, raw/bidirectional/mixed/restart/config and prior-image
rollback, failure/worker recovery, bounded budgets, stock fresh runners and clean
packed runtime, then an independent gate and separate promotion commit. The
rollback artifact is the built pre-change commit image, not today's fallback code.

SIEM owns its configured collections/datastores, redaction and destination state,
legacy records, delivery/attempt history, lease/token/expiry fencing, retry and
retention. Figshare sync owns full replacement/unset semantics, partial namespace/
article uniqueness, revision CAS, **millisecond** leases, dispatch generation and
receipts, and durable source intent before acknowledgement. Neither may inherit
J1's status filters, J2's string timestamps, counter pipeline or full-unique-index
descriptors merely because the same driver pool is available. Keep J4 independent
of transaction-gated Figshare vocabulary work. Unknown outcomes need explicit
protocol evidence; a rejected acknowledgement is not proof of an absent write.

All newly required indexes go into the one shared fresh-volume script and its
identical hook template, and into `persistence:indexes` through the group's own
inspection/ensure. Add the actual fresh/upgrade regression. The command inspects
all selected scopes before any DDL; startup stays inspect-only, and known
duplicates/conflicts block without deleting data. J2 contributes 14 descriptors,
including two unique keys. J1 adds no secondary index. Existing volumes require
explicit deployment preparation; do not repair them by deleting volumes.

Storage enrichment now has `StorageService.findHarvestRecords(ids,type,brand?)`.
The current Mongo storage hook retains its existing loaded Record path. Other
record writes, source intents and storage-specific protocols stay with the
storage owner; J3/J4 must use those seams, not acquire record-model globals or a
new pool. AppConfigService still owns hydrated secrets and configuration/cache
publication; raw Q DTOs may contain secret references.

Service init registers draining before the foundation shutdown hook: stop new
workspace/harvest producers, finish accepted work and result/history/counter
writes, then let foundation operations drain and pools close. Apply the same
ordering to SIEM/Figshare workers and their own external work. Do not call
persistence cleanup first and expect later completion writes to be accepted.
The product operation guards intentionally reject new work while closing.

Test fixtures use isolated standalone containers/new Compose projects and remove
only their own resources. The loader fixture uses independent processes for
simultaneous applications: sails-mongo keeps process-level model registration
state across `app.load`/`lower`, so reuse the loaded parent app for maintenance
probes or create a new worker process. Database profiling needs a large capped
profile collection and a stable observer connection baseline; observer monitoring
must not be confused with app pool leakage. Do not relax the 12-second startup
check or other budgets to accommodate concurrent build load.

Each retained image snapshots the full core runtime at its pre-group checkpoint
in the installed, pruned qualification fixture. Deployment hooks/config/assets
are separate matching inputs; this does not certify a published production image.
Drain every active owner and restore compatible selectors/hook/config/assets for
all later groups before
starting an older image; it may not support their MongoDB selection. Preserve
the database, FCV and indexes and recheck later groups' behavior explicitly.

Producer DTOs must already be plain JSON, including nested optional-property
omission. J2's failed snapshot producer now returns its existing size-budgeted
JSON serialization, matching Waterline storage. Keep strict repository validation;
do not make it serialize arbitrary native/class instances to hide a missed
consumer. Exercise real service failures, not only successful repository calls.

The root integration bootstrap now uses `migrate: 'safe'`, like normal startup.
The standard Compose test runners isolate runs with fresh owned volumes and the
shared init script. Waterline's global drop strategy discards composite/query
indexes even when individual models say safe; per-model annotations cannot
protect deployment preparation. New group tests must preserve the prepared
indexes and pass strict startup inspection without manual DDL.

## Follow-up for P10 and gated groups

J3 exposes `SiemRepository` / `getSiemRepository`; J4 exposes
`FigshareSyncRepository` / `getFigshareSyncRepository`. Both have independent
initialization and inspect/ensure APIs, share the foundation driver pool and
keep native handles private. Normal startup is inspect-only. Fresh stacks and
the deployment command prepare all 34 selected index scopes across 15
collections with current defaults. All production J3/J4 consumers now use their
plain boundaries; retained Waterline definitions/shims remain P11/P12 work.

Keep using the RecordsService/storage seams for record reads, Figshare source
intents and harvest enrichment. P10 must still introduce transaction-free S
repositories and migrate all record/attachment/schema/CAS/backfill consumers,
while preserving revisions, incarnations, tombstones, identities, schema
references and staged binary coordination. Characterize Counter's existing
allocation race before strengthening its contract. Finish redboxStorage,
Agenda/history, sessions/connect-mongo, GridFS disposal/application isolation
and legacy-logo ownership. Do not infer that job-state retirement closed these
native connection owners or changed record storage.

G-TX remains closed and OPS-TX-01 undecided: U/V/B and atomic S remain blocked.
J4 sync-state acceptance does not accept Figshare vocabulary transactions.
P11/P12 stable/release and institution qualification remain separate. Before a
new group, retain its own built pre-change image, preserve compatible selectors
for every already-promoted group and repeat the complete qualification protocol.
