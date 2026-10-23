> **Current status (phase 8 onward):** Prisma is the sole backend. Remove all
> persistence backend selectors and Sails aliases, including empty or `prisma`
> values. Selector forwarding and Waterline rollback instructions below are
> historical. Follow the [current migration guide](../../wiki/Persistence-Migration.md).

# J2 harvest lineage operations

J2 defaults to MongoDB after its independent G-J2 qualification. Set
`persistence.groups.harvest.backend` to `waterline` for rollback or `mongodb`; supplied Compose stacks forward
`RBPORTAL_HARVEST_BACKEND`. Restart changed instances. There is no fallback.
The selector is independent of progress, SIEM, Figshare and record storage.

Before cutover stop harvest producers, wait for accepted submissions and their
record/event/checkpoint/counter steps, checkpoint MongoDB plus matching hooks,
config and assets, and retain the pre-J2 built image in the validation manifest.
Use the intended application's installed core/config/hooks to run
`npm run persistence:indexes -- --inspect`, review every report, then explicitly
`--ensure` with writers stopped and inspect again. All 14 J2 indexes are in the
shared fresh-volume script and hook template: four run, four chunk and six event
indexes. Two are full unique/simple: run brand/type/source/source-run dimensions
and chunk run/contentHash/attempt. Do not add event uniqueness or a TTL index.
Startup only inspects; duplicates/conflicts require an owner decision and
explicit cleanup, never automatic repair. Existing volumes do not rerun init.

`HarvestRepositories` exposes named run/chunk/event operations with string
references/identities and plain JSON. `completeChunkCounters` and
`incrementDuplicateChunks` each use one atomic single-document native write.
They intentionally do not update Waterline's `updatedAt`, preserving the old
native pipeline. The loaded Waterline adapter retains its native ID factory and
five-attempt optimistic fallback when no compatible native collection exists.
No pkFactory, BSON, driver filters/cursors or managers cross the public seam.

Run counters, chunk checkpoints, event history, stored records and remote effects
are separate writes. There is no transaction or exactly-once claim. Existing
hash/attempt retries, stale processing timeout and checkpointed-event replay stay
in HarvestRunService. Reject a live processing duplicate; replay a failed/stale
attempt with the same content after reconciling durable events/record effects.
A failed acknowledgement can follow an applied counter/event write. Reload all
related durable state before recovery; blind retry can double-count. Keep the
existing compensation path for known event-persistence failures, and resolve
ambiguous effects explicitly. A new all-or-none requirement would join G-TX,
which remains closed on standalone stacks.

Harvest enrichment uses `findHarvestRecords(harvestIds, recordType, brandId?)`
on the existing configured storage service. The Mongo storage hook keeps the
same loaded Record query and deep-target semantics. The optional brand preserves
legacy unscoped matching; tracked reads supply brand. Record writes remain
RecordsService/storage-owned. Custom storage hooks must implement this operation
before harvest use; a missing method fails actionably. Do not point J2 at record
collections or introduce a second storage pool. Hooks must retain AppConfigService
for hydrated secret reads and configuration publication policy.

Custom J2 collections/datastores/columns/defaults/validation/callbacks remain
Waterline-owned until ported and qualified. Preserve loaded model registrations
and associations for P11/P12. There is no automatic lineage cascade or retention
sweeper in the current implementation: explicit history/chunk/run deletion stays
ordered by the owner; no cross-collection atomic deletion is claimed.

For selector rollback drain producers/submissions, choose Waterline and restart
against the same unchanged namespaces/indexes. For code rollback use the exact
pre-J2 image and matching hooks/config/assets. Preserve MongoDB/FCV/topology.
Checkpoint restoration is a separate decision and must reconcile later record
and external-system changes.

The [three paired samples](evidence/p5b-j2/operations.json) pass all provisional next budgets: p95 ratio 0.313, throughput 2.301, RSS 0.776, database calls 0.615. Every driver worker owns one shared foundation client; all app connections return to the observer baseline after shutdown. Readiness remains below 250 ms.

The fixed workload uses 20 rows with 15,000-byte JSON payloads, 100 warmups and 1,000 measured operations in each fresh worker; backend order alternates for three pairs. J1 mixes polling, revision writes, create/cleanup and workspace status reads. J2 mixes run polling, atomic counters/duplicates and chunk/event ingest/checkpoint/explicit retention. Database profiling uses a 32 MiB capped collection; the observer uses polling monitoring so its own delayed RTT connection cannot masquerade as an app leak. App monitoring policy is unchanged. Storage/remote calls are outside this bounded timing and are covered by standard service/API regressions.

The fixed provisional limits are p95 ≤1.20, throughput ≥0.90, RSS ≤1.10 and
database calls ≤1.25 relative to Waterline; readiness <250 ms, exactly one shared
foundation client for a driver worker and no remaining app connections after
close. These bound the stated synthetic fixture for `next`.
