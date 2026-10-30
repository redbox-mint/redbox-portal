# Harvest run administration

Tracked harvests record a run summary, the chunks submitted to it, and per-record events. For request formats and migration steps, see [Migrating from the legacy Mint harvest endpoint](https://github.com/redbox-mint/redbox-portal/wiki/Migrating-from-the-Legacy-Mint-Harvest-Endpoint).

## Browse run history

The harvest runs admin UI uses the following admin-only endpoints. Each request checks that the run belongs to the authenticated brand.

| Endpoint | Response |
| --- | --- |
| `GET /:branding/:portal/api/harvest-runs/:id` | Run summary, aggregate counters, the first 20 chunks and events, and `chunksTotal` and `eventsTotal`. |
| `GET /:branding/:portal/api/harvest-runs/:id/chunks` | A page of chunk summaries. |
| `GET /:branding/:portal/api/harvest-runs/:id/events` | A page of per-record events. |

The chunk and event endpoints accept `page` and `pageSize`. Pages start at 1, with 20 rows by default and a maximum of 100. Events can be filtered by `chunkId`, `outcome`, `operation`, `harvestId`, and `oid`. The harvest ID filter requires an exact match within the selected run.

Record events are the main detail table. The collapsed chunks section shows outcome counts, processed and submitted counts, attempt, duration, and error messages. A chunk without a completion timestamp has no duration. Expanding the section uses the first page already included in the detail response.

Use View records or View failures on a chunk to filter the records table by `chunkId`. View failures also sets `outcome=failed`. Paging keeps that scope. Clear filters or select another run to remove it; clearing event filters returns to page 1. Duplicate submissions produce no new events, so they show an explanatory label instead of links to records.

If retention removes the requested event or chunk page while earlier rows remain, the UI reloads page 1 and keeps the current filters. Navigation remains available when the API reports a nonzero total.

Pages sort by timestamp and ID so rows with matching timestamps have a stable order. A running harvest can add events between requests, so pages do not represent a frozen snapshot. Deep pages use offset pagination and take more database work as the offset grows.

## Deploy and check MongoDB indexes

Deploy the backend and Angular assets together. The UI needs the totals and chunk endpoint supplied by the backend.

For `sails-mongo`, startup waits for `HarvestRunService.init()` to create the indexes defined in `packages/redbox-core/src/utilities/HarvestRunIndexes.ts`. The Waterline models use the same definitions. This provisions compound indexes even with `migrate: safe`. Other adapters need their own index management.

Index creation is safe to repeat and preserves existing records and indexes. Initial builds can extend startup time, and the MongoDB user needs permission to create indexes. Before deployment, check for duplicate values in these unique keys:

- Runs: `(brandId, recordType, sourceName, sourceRunId)`.
- Chunks: `(runId, contentHash, attempt)`.

### Run the index preflight before deployment

Build the core package, then run the read-only preflight against the portal datastore:

```sh
npm run compile:core
export HARVEST_MONGO_URL='mongodb://database-host:27017'
export HARVEST_MONGO_DATABASE='portal-database'
npm --prefix packages/redbox-core run harvest:indexes:preflight
```

Supply connection credentials through your deployment's secret settings. The database name must be explicit. Use a MongoDB account that can read the collections and list their indexes.

The command checks both unique keys for duplicate groups, including keys with missing fields. It also checks for conflicting index definitions. It exits with status 1 if it finds problems or cannot complete the check. It reports counts and index names without printing record values, and does not change records or indexes. On a large datastore, duplicate detection scans the collections and may use temporary disk space.

Run this before the deployment window, resolve any reported conflicts, then run it again with harvest writers stopped. A successful check cannot rule out new duplicates introduced by older workers after the check.

Startup still provisions the required indexes and fails if they cannot be created. These constraints protect run identity and chunk retry detection, so serving tracked submissions without them is unsafe. Duplicates or conflicting index options cause initialization to fail. Resolve those conflicts explicitly; startup does not delete duplicates or replace indexes. Existing indexes with different keys remain in place. Review them before removing any that appear redundant.

After deployment, use `getIndexes()` on `harvestrun`, `harvestrunchunk`, and `harvestrecordevent` in the portal datastore. Check chunk and event page queries with `explain('executionStats')`. Ordered page queries should use index scans without blocking sorts. The run-specific event count should use an index without fetching whole event documents.

## Configure history retention

Retention removes expired event and chunk detail across all brands. Run summaries, their lifetime counters, and the harvested records remain. The cleanup requires a MongoDB datastore.

The defaults for `sails.config.harvestRuns.retention` are:

```js
{
  enabled: true,
  successfulDays: 90,
  failedDays: 365,
  batchSize: 1000
}
```

Set these values before deployment. Set `enabled` to `false` to disable cleanup. Retention periods and batch size must be positive integers; `failedDays` must be at least `successfulDays`, and `batchSize` cannot exceed 10,000. Changing the settings cannot restore deleted history.

The Mongo-backed Agenda job `HarvestRunService-PruneHistory` calls `harvestrunservice.pruneHistoryJob` daily. It skips an immediate startup run, permits one concurrent worker, renews its lock between batches, and logs a summary. Override the schedule in `agendaQueue.jobs` if needed.

### What expires

Submissions acquire an atomic guard on the run document before reading chunk history and release it after completion or failure. Retention's atomic claim requires no active submissions. Once retention marks a run, no new submission can acquire the guard, even if it loaded the run before cleanup started.

Stop older portal workers before enabling retention during an upgrade. They do not acquire this guard and cannot safely share a datastore with an active retention worker.

If a process crashes before releasing its guard, the run's `activeSubmissions` count stays positive and retention skips it. The guard does not expire automatically. To recover, stop harvest writers on all portal instances, confirm that no submission is still executing, inspect the run's processing chunks, and resolve any interrupted work. Only then reset that run's `activeSubmissions` to 0 in MongoDB and resume writers. The normal recent-activity and processing-chunk checks still apply.

Only terminal runs with a completion date older than the successful retention window are considered. Running runs, runs without a completion date, recently active runs, and runs with processing chunks are skipped.

| Detail | Retention period |
| --- | --- |
| Successful events and processed chunks with zero failures | `successfulDays` |
| Failed events, including snapshots, failed chunks, and processed chunks containing failures | `failedDays` |

Cleanup checks each event's `createdAt` or chunk's `submittedAt`, as well as the run's completion and last activity. Detail rows with missing or empty timestamps are preserved.

Before deleting detail, cleanup marks the run with `historyRetention`. List and detail responses include this marker, and the UI displays an expired-history notice. Summary counters remain lifetime totals; detail counts reflect the rows still retained.

Further submissions to a marked run return HTTP 409 because its remaining chunk history cannot reliably detect duplicates. Use a new `sourceRunId` for each daily harvest.

### Preview or run cleanup

`HarvestRunService.pruneHistory({ dryRun: true })` reports eligible run, event, and chunk counts without changing data. `pruneHistory()` deletes eligible detail and returns actual deletion counts. These are administrative service methods; there is no public deletion endpoint. Both use the configured retention settings, including `enabled`.

Deletes use batches of IDs scoped to the run and brand. A partial sweep can be retried, and errors propagate to Agenda. Fully expired runs with no remaining detail are marked complete so later sweeps skip them. MongoDB may reuse freed storage without shrinking its files.

## Verify changes

For changes to harvesting, run the harvest Angular tests and the core harvest service, controller, and API contract tests. The Bruno harvest collection covers the chunk endpoint with its tracked-run fixture. See [ReDBox automated tests](https://github.com/redbox-mint/redbox-portal/wiki/ReDBox-Automated-Tests) for the test environment and commands.

The MongoDB integration tests check index idempotency, uniqueness, conflicting definitions, query plans, and retention. From the repository root, run:

```sh
cd packages/redbox-core
HARVEST_MONGO_TEST_URL=mongodb://127.0.0.1:27017 npm exec -- mocha \
  --no-config --node-option no-experimental-strip-types \
  --require ts-node/register/transpile-only --require chai --require test/setup.ts \
  --timeout 5000 \
  test/integration/harvest-run-indexes.test.ts \
  test/integration/harvest-history-retention.test.ts \
  test/services/HarvestRunService.test.ts
```

Use an isolated test MongoDB instance. These tests create and drop randomly named `harvest-index-test-*`, `harvest-retention-test-*`, and `harvest-concurrency-test-*` databases. The MongoDB suites are skipped unless `HARVEST_MONGO_TEST_URL` is supplied.
