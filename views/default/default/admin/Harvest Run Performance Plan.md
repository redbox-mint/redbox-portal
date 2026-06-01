# Harvest Run Performance Plan

## Summary

Improve tracked harvest performance for 20k+ record runs by keeping chunk processing synchronous for v1, but making each chunk smaller, cheaper to query, cheaper to audit, and cheaper to return. The submit endpoint becomes summary-only; per-record details are retrieved through the existing paginated events API.

## Key Changes

- Change enhanced chunk submit response to omit inline per-record results and return only `run` and `chunk` summary counters.
- Keep `GET /api/harvest-runs/:id/events` as the source for per-record outcomes, with pagination and filters.
- Default `sails.config.harvestRuns.maxRecordsPerChunk` to `250` and `maxChunkBytes` to `5_000_000`.
- Reject oversized tracked chunks before hashing or processing, using `413` for byte/record cap breaches.
- Store `HarvestRunChunk.responseSummary` as counters/status metadata only, not the full per-record response array.

## Service Performance Changes

- Add a batch preflight lookup for all unique `harvestId`s in a chunk using one `Record.find({ harvestId: { in: [...] }, 'metaMetadata.type', 'metaMetadata.brandId' })`.
- Build an in-memory `Map<harvestId, existingRecords[]>` so per-record processing no longer performs one lookup per record.
- Treat duplicate `harvestId`s inside the same chunk as failed events and do not mutate those records, because intra-chunk ordering would otherwise make batching ambiguous.
- Preserve sequential record mutation for creates, updates, deletes, Solr/audit hooks, and record service side effects.
- Accumulate harvest record events in memory and persist them with `HarvestRecordEvent.createEach(...)` once per chunk, chunked internally if needed.
- Cap failed-event snapshots to 32 KB serialized JSON, storing `{ truncated, sizeBytes, preview }` when larger.
- Create chunks with `status: processing`, return `409` for fresh duplicate processing chunks, mark stale processing chunks as `failed_stale`, and allow retry attempts.

## Data and Index Changes

- Add `HarvestChunkStatus.processing` and `HarvestChunkStatus.failedStale`.
- Add `attempt` to `HarvestRunChunk`.
- Replace the unique chunk index with unique `{ runId, contentHash, attempt }`, plus lookup indexes for `{ runId, contentHash, status }`, `{ runId, chunkIndex }`, and `{ runId, submittedAt }`.
- Add or verify a compound Mongo index on the `record` collection for `{ harvestId: 1, 'metaMetadata.brandId': 1, 'metaMetadata.type': 1 }`.
- Update event indexes to match real queries: `{ runId: 1, brandId: 1, createdAt: -1 }`, `{ runId: 1, brandId: 1, outcome: 1, createdAt: -1 }`, `{ runId: 1, brandId: 1, operation: 1, createdAt: -1 }`, `{ harvestId: 1, recordType: 1, brandId: 1 }`, and `{ oid: 1 }`.

## API and Type Changes

- Update `HarvestTrackedChunkResponse` so `records` is removed or optional and not emitted by default.
- Update OpenAPI/Bruno expectations for enhanced submit responses to assert summary counters instead of inline record arrays.
- Keep event response DTOs unchanged so existing admin detail/event tables can render per-record outcomes from the events endpoint.
- Keep legacy Mint and non-enhanced harvest response behavior unchanged.

## Test Plan

- Service tests for rejecting chunks over `maxRecordsPerChunk` and `maxChunkBytes`.
- Service tests proving a multi-record chunk performs one batched `Record.find` instead of one lookup per record.
- Service tests proving events are persisted through `createEach` and successful chunk responses do not include inline records.
- Service tests for duplicate `harvestId`s in the same chunk producing failed events without mutating records.
- Service tests for `processing`, fresh duplicate `409`, stale retry, failed retry attempt numbering, and processed duplicate summary return.
- Controller/OpenAPI tests for the summary-only enhanced response.
- Bruno tests for large-run flow: submit multiple chunks, verify list counters, fetch paginated events, retry duplicate chunk, and confirm legacy endpoints are unchanged.

## Assumptions

- Synchronous processing remains acceptable for v1 when chunks are capped at 250 records.
- Per-record audit events remain required, but they are fetched separately through pagination.
- Summary-only enhanced submit response is acceptable because this feature is still being implemented and can change before release.
- Background queueing is deferred, but the chunk status/attempt model is designed so queue processing can be added later without changing the public API again.
