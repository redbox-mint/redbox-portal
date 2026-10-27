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

# Migration ledger operation and institution adoption

M defaults to **`prisma` on `next` under ADR 0004**. Keep MongoDB/FCV
and application data unchanged. Before upgrading, complete the preparation below
or explicitly retain `persistence.groups.migration.backend = 'waterline'`.
That selector remains the development rollback. Cache, M/R/Q/J1–J4 and the staged
S subset have independent selectors; C/M/R/Q now use Prisma, with explicit
Waterline rollback. Later groups await their Prisma phases; records, Counter and OID
rebind retain their baseline owners. There is no second migration datastore URL.

## Prepare and start

1. Inventory `Migration` registrations, callbacks, columns, primary key, datastore,
   validation/default overrides, native/direct ledger consumers and historical
   migration bodies. The Waterline repository borrows the actual loaded model.
   Prisma requires the standard `mongodb` datastore, `migration` collection,
   `_id` mapping and fields; unsupported overrides fail before migration bodies.
   Move custom behavior into explicit migration/service code, then qualify the
   institution on a restored copy. Private hooks are not certified by fixtures.
2. Designate exactly **one deployment migration runner**. Stop other application
   instances and workers during cutover, or start them with
   `REDBOX_SKIP_MIGRATIONS=true` and hold traffic until the runner succeeds.
   Unique ledger names prevent duplicate entries; they cannot stop two processes
   executing the same body before either records success. The ledger and body
   are not one transaction, and a crash after body effects but before logging can
   leave the body pending. Review/reconcile effects before retrying.
3. Take a quiesced backup/checkpoint and retain the built pre-change image,
   exact config/hooks and matching external assets. M owns no external assets,
   but historical migration bodies may change assets or other domains. The
   ledger rollback qualification cannot undo those effects or downgrade MongoDB.
4. With writers stopped, use the **intended cutover backend selections** and
   actual application configuration in the shared maintenance command:

   ```bash
   npm run persistence:indexes -- --inspect
   npm run persistence:indexes -- --ensure
   ```

   Inspect is read-only. Review every selected group's duplicate/index/collation
   findings before explicitly invoking ensure. Known duplicates or conflicts in
   any selected scope block all index creation; no documents or indexes are
   removed. Compatible full unique simple indexes under other names are accepted.
   See the [shared index runbook](../../wiki/Persistence-Index-Preparation.md)
   for exit codes, actual hook/datastore resolution and one-off Compose use.
   Selecting Waterline skips that group's scope, so explicitly select `prisma`
   for the maintenance process when preparing a Waterline-to-Prisma cutover.
   Startup stays inspect-only and never calls these ensure APIs.

   Fresh standard stacks mount `support/resources/mongodb-persistence-indexes.js`
   (the hook archetype ships the same script), creating the qualified C/M/R/Q/J/S
   indexes in the default application and record-storage databases. J1 requires
   no secondary indexes. **Existing volumes never rerun it.**
   Both fresh and existing deployments use the same required index semantics.
5. Omitted M selection now means `prisma`. To make the selection explicit,
   configure `module.exports.persistence = {groups: {migration: {backend: 'prisma'}}}`
   in the normal Sails configuration merge, preserving other persistence keys.
   The normal app entrypoint also accepts
   `sails_persistence__groups__migration__backend=prisma`. Direct Sails callers
   can pass the config object. Supplied development/integration/PDF-hook stacks
   and hook-archetype templates forward `RBPORTAL_MIGRATION_BACKEND`;
   this is Compose forwarding, not a new application configuration resolver.
   Fresh supplied stacks prepare the indexes through the shared init script.
   Custom fresh databases without that script use the same maintenance command;
   startup deliberately fails until indexes are ready. For an unprepared institution,
   retain explicit Waterline while reviewing mappings and history.
6. Start the designated runner. `preLiftSetup` initializes the ledger before
   service initialization and Umzug. Readiness failures stop startup without
   fallback. Umzug runs pending names lexically, logs only success, and stops at
   the first failed body. Applied names absent from the current bundle remain
   legitimate history. Skipped bodies stay pending. Verify dashboard migration
   history/readiness and pending-body outcomes, then start other instances and
   admit traffic. Do not clear the skip flag on concurrently starting replicas.

## Recovery and rollback

Stop incoming work and the designated runner. Preserve failure logs and examine
body effects before retrying any unlogged name. A logged body never replays just
because the application restarts or a backend changes. Migration failure causes
still propagate through Umzug; neither repository retries a body.

For a ledger/backend problem, leave MongoDB 8, FCV, data and the name index
unchanged. Set M to `waterline`, restart, verify applied names and dashboard
readiness, and resume pending migrations through the same one-runner procedure.
For prior-artifact rollback, run the designated pre-P2 image with its original
Waterline configuration on the unchanged database. Match config/hooks/assets
to its checkpoint. See [validation](p2-m-validation.md) for the actual immutable
image and rehearsal; no v5 or engine downgrade promise is implied.

The public seam is `MigrationExecution`, `MigrationLedgerRepository` and
`getMigrationLedgerRepository(app?)`; resolve inside initialized operations.
It has four methods: history names in ranAt order, exact-name existence,
record-success, and remove-success for Umzug's manual down storage contract.
There is no generic query, CRUD API, driver/BSON type or service-init dependency.
Prisma does not execute Waterline callbacks. Shared shutdown refuses new
operations, drains accepted ones, invalidates old repository references and
closes only owned pools; Waterline remains responsible for its borrowed pool.

For PostgreSQL, a future adapter must retain name identity, numeric milliseconds,
metadata defaults and history/body ordering, explicit full uniqueness/collation,
missing historical fields, no read rewrites and the one-runner/crash semantics.
Do not infer SQL transactions, exactly-once effects or a portable query dialect.
