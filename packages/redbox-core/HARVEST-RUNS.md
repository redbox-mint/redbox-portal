# Harvest run administration

The run detail endpoint returns the first 20 chunks and 20 events, together with
`chunksTotal` and `eventsTotal`. The Angular page reuses those rows on selection.
Subsequent pages use `GET /:branding/:portal/api/harvest-runs/:id/chunks` or
`.../:id/events`, with `page` and `pageSize` (default 20, maximum 100). Both endpoints
check the authenticated brand's run before querying. Event outcome and exact
harvest-ID filters apply within the selected run. Clearing event filters starts
again at page 1.

Pages sort by timestamp and ID to keep rows with matching timestamps in a stable
order. The pagination handlers ignore initialization events for the loaded page,
and late responses from a previous selection cannot overwrite the current one.
Offset pagination remains proportional to the offset for deep pages; cursor
pagination would be a separate API change. A running harvest can insert events
between page requests, so browsing it does not provide a frozen snapshot.

## Mongo index provisioning and rollout

`HarvestRunService.init()` is awaited by the existing service initialization pass.
For the `sails-mongo` datastore it creates the indexes from
`src/utilities/HarvestRunIndexes.ts`. The model metadata uses the same definitions.
This explicitly provisions compound indexes even with Waterline's `migrate: safe`.
The initialization is idempotent and does not drop existing indexes or records.
Other datastore adapters are left to their own index-management mechanisms.

Deploy the backend and Angular assets together: the page uses the new totals and
chunk endpoint. Initial index builds can extend startup time and require MongoDB
index-creation permission. Check existing data for duplicate run identity keys
`(brandId, recordType, sourceName, sourceRunId)` and chunk keys
`(runId, contentHash, attempt)` before rollout. If duplicates or conflicting index
options exist, initialization fails rather than serving without the required
constraints. Resolve conflicts explicitly; startup does not delete duplicates or
replace existing indexes. Previously provisioned indexes with different keys are
retained; review them separately before removing any redundant indexes.

Verify `getIndexes()` on `harvestrun`, `harvestrunchunk` and `harvestrecordevent` in
the portal datastore, then check event/chunk page queries using
`explain('executionStats')`. Ordered page queries should use index scans without
blocking sorts. The run-specific event count should use an index without fetching
whole event documents. These indexes improve database work; the frontend request
loop fixes are required independently.

## Focused checks

Run the harvest Angular project tests and the core harvest service, controller and
API contract tests. The existing Bruno harvest collection also exercises the chunk
endpoint using its tracked-run fixture.

For real MongoDB index verification, provide an **isolated test MongoDB** URL:

```sh
cd packages/redbox-core
HARVEST_MONGO_TEST_URL=mongodb://127.0.0.1:27017 npm exec -- mocha \
  --no-config --node-option no-experimental-strip-types \
  --require ts-node/register/transpile-only --require chai --require test/setup.ts \
  test/integration/harvest-run-indexes.test.ts
```

These tests create and drop randomly named `harvest-index-test-*` databases and
verify idempotency, uniqueness, conflicting definitions, and real query plans.
They are skipped unless the test URL is supplied.

## Records and chunks

Record events are the primary detail table. Chunks appear below it in a collapsed
section, with outcome counts, processed/submitted counts, attempt, duration and
error messages. Missing completion timestamps display no duration.

View records and View failures filter the existing records table by `chunkId`
(and `outcome=failed` for failures). The event endpoint accepts optional `chunkId`,
scoped to the authorized run and brand. Paging retains this scope; Clear filters
or selecting another run removes it. Duplicate submissions have no new events
and show an explanatory label instead of drill-down links. Expanding chunks
makes no additional API call: the first page is already included in detail.
