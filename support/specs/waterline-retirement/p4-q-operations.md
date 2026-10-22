> **Current status (phase 8 onward):** Prisma is the sole backend. Remove all
> persistence backend selectors and Sails aliases, including empty or `prisma`
> values. Selector forwarding and Waterline rollback instructions below are
> historical. Follow the [current migration guide](../../wiki/Persistence-Migration.md).

> Phase 2 update (2026-10-22): this group's current selector is
> `prisma | waterline`, default `prisma`. Explicit `mongodb` is refused.
> Prisma replaces driver CRUD/query/preflight; existing physical contracts and
> rollback behavior below remain. Q fallback coordination also uses Prisma.
> Historical qualification matrices below are not repeated in this phase;
> see [phase 2 evidence](evidence/prisma-phase2.md).

# Q configuration, dashboards, translations and secret coordination

Q defaults to `prisma` on `next` after the separate G-Q promotion.
`persistence.groups.configuration.backend` accepts `prisma` or explicit
`waterline` rollback.
For app.js use `sails_persistence__groups__configuration__backend`; supplied Compose
stacks forward `RBPORTAL_CONFIGURATION_BACKEND`. Restart every changed instance.
There is no fallback. Imports/shim registration remain offline; readiness runs
before service initialization and migrations. Q borrows the shared app pool.

## Index preparation and cutover

Stop writers/workers, checkpoint MongoDB plus matching hook/config/assets, and
retain the built image of pre-Q commit `f8c8cd7de`. Preserve AWS secret resources
and access configuration separately; AWS and MongoDB are **not a transaction**.
Using the intended app configuration and hooks with Q selected, run:

```sh
npm run persistence:indexes -- --inspect
npm run persistence:indexes -- --ensure
npm run persistence:indexes -- --inspect
```

All selected scopes are inspected before any DDL. Q requires full unique simple
indexes on dashboardconfiguration.branding and on each I18n collection's uid.
An equivalent index under another name is accepted. Conflicting/partial/sparse/
TTL/collation indexes and duplicates block readiness. Resolve them with the data
owner; never delete duplicates automatically. The shared fresh-stack script and
hook template prepare the same indexes on empty volumes. Existing volumes do
not rerun init scripts. Prisma Q startup inspects and performs no DDL.

**Never add AppConfig brand/key uniqueness.** Legacy duplicate rows remain valid;
reads warn and choose the latest updatedAt (falling back to createdAt). Ties keep
the last encountered row, with no new sorting guarantee. A duplicate-matching
save still fails rather than silently selecting a row to overwrite. Reset deletes
all matching overrides as before.

Dashboard branding is a string, not an ObjectId relationship. All writers use
the expected revision in one update of the aggregate. Multi-target copy remains
all-or-none within that document. Keep the migration ledger and explicit legacy
resolution process; selectors never rerun completed migrations or replace CAS
with a read/save sequence. Waterline retains legacy owner index creation via
Prisma control until its own retirement; the Prisma-selected owner requires
deployment preparation. Its CAS/DDL follow the loaded dashboard datastore and
leases follow AppConfig's datastore. The existing one-client-per-logical-datastore
binding policy still applies; incompatible simultaneous mappings fail explicitly.

## Institution hooks

`getConfigurationRepositories(app?)` exposes appConfigs, dashboards, bundles,
translations and secretLeases as plain Promise operations. Their public DTOs
contain string IDs, JSON and string timestamps; lease metadata uses epoch
milliseconds. No native manager, BSON, query builder, filter or cursor is public.
Keep service entry points for secret masking/hydration, cache publication,
translation sanitization/reload and dashboard validation/copy behavior. Direct
repository writes intentionally bypass those service policies.

Waterline uses the actual loaded models/callbacks. Prisma readiness refuses
custom collections, datastores, columns, fields/defaults/validation or callbacks
outside the qualified four-model mapping. Keep such institutions on Waterline
while moving behavior into explicit hook services/domain operations and testing
both selectors. Retain model/shim registrations and association targets until
P11/P12; selection alone does not retire them.

Named queries for all four Q targets follow Q's selector, independently of R.
Tenant scoping, count/order/page/projection and the supported existing expression
subset remain owned by the named-query execution module. Inventory private
queries/targets before deployment; use explicit institution target registration
for additional models. A target name is never arbitrary collection discovery.
Unsupported BSON in Q DTOs fails with controlled diagnostics and no read rewrite;
perform a reviewed institution migration rather than lossy conversion.

## Secrets and interrupted writes

The native appconfigsecretlocks collection retains string `_id` names, BSON Date
expiry, owner fencing and cache tokens. Built-in `_id` uniqueness is sufficient;
there is no TTL index. Releasing a lease keeps its freshness token. Renew/token
publication require matching owner and unexpired lease; release requires owner.
A stale owner cannot renew, mark or release its replacement's lease.

Preserve the existing 120-second lease, 20-second heartbeat and 30-second AWS
deadline. A failed/aborted AWS request may still commit. Freshness changes before
AWS dispatch; aborted requests leave the lease to expire. Do not clear a live
foreign lease, bulk-delete lock metadata, retry an unknown external write blindly
or restore only MongoDB and assume AWS rolled back. Stop affected writers,
inspect current AWS values with authorized tooling, wait for expiry, reload and
retry the intended configuration. Masked references still need readable/cached
values; no failure may downgrade secrets to plaintext. Logs must omit AWS/native
messages, payloads, ARNs and credentials. A DB write already dispatched cannot be
cancelled by losing the lease; heartbeat renewal and final service checks retain
the existing limits rather than claiming cross-system atomicity.

A failed datastore acknowledgement is not proof that a write was absent. Reload
the current dashboard aggregate and revision before producing a new preview/save;
retain revision conflicts and never replace CAS with read/save. A lease acquisition
can likewise commit despite a reported failure. The failed caller performs no AWS
operation; another owner must respect the lease until expiry. Tests inject both
rejected commands and applied writes with a failed write-concern acknowledgement.
This is bounded failure evidence, not production network/failover qualification.

I18n sync remains best effort: a saved entry can survive a failed bundle update,
and a saved bundle can survive failed entry synchronization. Existing warnings,
pruning/retry and reload behavior remain. Keep backups and reconcile through
service operations. Atomic cross-document synchronization would require G-TX
and explicit approval; OPS-TX-01 remains undecided and stacks stay standalone.
Ordered entry prefix matching remains case-sensitive and treats regex punctuation literally. Bundle UID is create-only. Translation patch UID uses only submitted normalized
locale/key/branding/namespace, never a loaded merged row. Empty values remain
valid and null values remain invalid.

## Bounded operational comparison

The [three-pair report](evidence/p4-q/operations.json) uses Node 24.18.0 and an
owned MongoDB 8.0.34 standalone with 20 AppConfig rows, 20 bundles, 20 entries
and one dashboard aggregate. The configuration payload is 15,484 bytes per row.
Each fresh worker performs 100 warmups and 1,000 reads across the four domain
operations. Backend order alternates; the database profiler counts actual calls.
The raw snapshots remain unchanged. No AWS operation is included in this timing.

| Mean across three runs | Waterline | MongoDB |
| --- | ---: | ---: |
| p50 | 4.57 ms | 3.54 ms |
| p95 | 6.58 ms | 5.16 ms |
| p99 | 12.44 ms | 5.97 ms |
| Throughput | 225.36 ops/s | 320.05 ops/s |
| RSS | 570.34 MiB | 379.73 MiB |
| Database calls, including warmups | 1100.00  | 1100.00  |

MongoDB/Waterline ratios are p95 **0.784** (budget ≤1.20), throughput **1.420**
(≥0.90), RSS **0.666** (≤1.10), calls **1.00** (≤1.25). Q readiness is
2.72–3.54 ms for Waterline and 79.08–86.74 ms for MongoDB, below 250 ms.
This comparison selects M/R Waterline to isolate Q's contribution. Q owns zero
new foundation clients under Waterline and exactly one under MongoDB. Connection
counts are baseline 3, active 6/9, then 3 after close in every pair. The shared
foundation governs application pool reuse; this is not a per-model pool.

These are provisional synthetic read budgets for `next`, not production capacity
or AWS latency/failover qualification. The offline source-import regression
passes at 10,415 ms against the unchanged 12,000 ms deadline; it explicitly
asserts no eager Q adapter imports, browser DOM or full Effect barrel.
The installed/pruned package also imports and generates shims with sockets
blocked before explicit persistence startup. Fresh default Mocha (53), Bruno (305 requests/549 assertions), nine-scope
maintenance inspection and normal development HTTP startup pass after promotion
`d2dc6f8ce`. Q's gate and complete command results are recorded in
[validation](p4-q-validation.md).

## Rollback and P5 J1–J4 handoff

Drain/stop the app before switching Q to Waterline, then restart against the
same unchanged database/indexes. Verify a masked config read/save, dashboard
revision conflict, empty translation, bundle and lease release. For code rollback
use the designated pre-Q installed runtime image with matching hook/config/assets;
retain MongoDB/FCV/topology and all indexes. Checkpoint restoration is a separate
operator decision and must reconcile subsequent DB and AWS writes.

P5 owns the four job subgroups separately:

| Group | Preserve and qualify independently |
| --- | --- |
| J1 | AsynchProgress/WorkspaceAsync optional references, status/result/failure JSON, cleanup and restart visibility; no invented cross-job atomicity. |
| J2 | HarvestRun/Chunk/Event lineage, deduplication/hash/attempt indexes and native atomic run counters. |
| J3 | SecurityEvent/SiemDeliveryAttempt redaction, attempt history, claim token/expiry fencing, retry/retention and worker drain. |
| J4 | FigshareSync record OID and partial namespace/article uniqueness, replacement/unset semantics, revision/millisecond leases and source-intent generation/receipts. |

Jobs must keep AppConfigService reads for hydrated secrets and cache/publication
policy: raw Q repository JSON can contain secret references. Treat Q's lease
collection as its own domain; J claim/renew/release predicates need their own
spike and failure/recovery evidence. IDs, timestamp units and uniqueness do not
become universal merely because the driver pool is shared.

Each J subgroup needs its own physical/callback spike, baseline, opt-in adapter,
complete consumers/named-query readers, shared-index updates, mixed-instance/
restart/prior-image rollback, operations evidence and separate promotion. Reuse
the shared app pool/lifecycle and explicit domain operations. Q selectors do not
move any J writer or grant multi-document atomicity. AppConfig service caches
remain process-local; direct config writes do not refresh other instances.
M and R are promoted independently. Q gate/promotion and actual command results
are recorded in [validation](p4-q-validation.md).
