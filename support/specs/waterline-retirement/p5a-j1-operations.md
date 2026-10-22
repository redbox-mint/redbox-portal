> **Current status (phase 8 onward):** Prisma is the sole backend. Remove all
> persistence backend selectors and Sails aliases, including empty or `prisma`
> values. Selector forwarding and Waterline rollback instructions below are
> historical. Follow the [current migration guide](../../wiki/Persistence-Migration.md).

# J1 progress and workspace status operations

J1 defaults to MongoDB after its independent G-J1 qualification. Set
`persistence.groups.progress.backend` to `waterline` for rollback or `mongodb`; supplied Compose stacks forward
`RBPORTAL_PROGRESS_BACKEND`. Restart each instance after selector changes.
There is no fallback. This subgroup is independent of harvest, SIEM and Figshare.

Stop HTTP/job producers and workspace cron dispatch. The service init hook awaits
`WorkspaceAsyncService.drain()` before `cleanupPersistence(app)` during shutdown;
accepted jobs must finish their status/result writes while persistence is open.
The foundation then drains accepted repository operations before closing its
shared pool. A progress status does not transact with an external job. After a
crash, reload durable state; `pending` is the existing worker selection. Error
and started rows are not automatically requeued. Do not infer exactly-once job
execution from progress counters or a finished row. Reconcile external effects
before replaying an interrupted job.

Checkpoint MongoDB and matching hooks/config/assets; retain the built pre-J1
image in the validation manifest. Existing-volume inspection uses the shared
`npm run persistence:indexes -- --inspect` command. J1 needs only built-in `_id`
indexes and simple collation; it adds no secondary/unique/TTL indexes. Startup
never alters data/indexes. Cleanup is explicit and criteria-scoped, with no
cascades into records/users/types/jobs.

Waterline keeps actual hook mappings/callbacks. MongoDB refuses custom fields,
collections, datastores, columns/defaults/validation/callbacks until ported and
qualified. Keep model registrations for associations and P11/P12 retirement.
Use explicit hook services and the plain repository seam for migrated behavior;
representative tests do not certify private institution hooks/data.

A rejected command can leave the row unchanged; a failed acknowledgement can
leave its intended update stored. Reload before recovery. No blanket retry or
backend fallback is performed. Driver diagnostics exclude native payloads and
credentials. Unsupported stored BSON is refused without rewriting data; use
Waterline for investigation and an explicit reviewed data migration.

The [three paired samples](evidence/p5a-j1/operations.json) pass all provisional next budgets: p95 ratio 0.510, throughput 2.041, RSS 0.839, database calls 0.875. Every driver worker owns one shared foundation client; all app connections return to the observer baseline after shutdown. Readiness remains below 250 ms.

The fixed workload uses 20 rows with 15,000-byte JSON payloads, 100 warmups and 1,000 measured operations in each fresh worker; backend order alternates for three pairs. J1 mixes polling, revision writes, create/cleanup and workspace status reads. J2 mixes run polling, atomic counters/duplicates and chunk/event ingest/checkpoint/explicit retention. Database profiling uses a 32 MiB capped collection; the observer uses polling monitoring so its own delayed RTT connection cannot masquerade as an app leak. App monitoring policy is unchanged. Storage/remote calls are outside this bounded timing and are covered by standard service/API regressions.

The fixed provisional limits are p95 ≤1.20, throughput ≥0.90, RSS ≤1.10 and
database calls ≤1.00 relative to Waterline; readiness <250 ms, exactly one shared
foundation client for a driver worker and no remaining app connections after
close. These bound the stated synthetic fixture for `next`.

For selector rollback stop producers and await workspace drain, select Waterline
and restart against the same namespaces/indexes. Check durable progress refs,
workspace status/result/error JSON and scoped cleanup. For code rollback use the
exact pre-J1 image and matching hooks/config/assets; drain every active owner
and restore compatible later-group selectors first. See the
[rollback handoff](p5-jobs-handoff.md). Preserve MongoDB/FCV/topology and reconcile
external job effects before any separate checkpoint restoration.
