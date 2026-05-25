# Migrating from the Legacy Mint Harvest Endpoint

This guide explains how to move integrations off the legacy Mint-compatible harvest endpoint and onto the new harvest endpoints introduced with harvest run tracking.

## Summary

The legacy Mint-compatible endpoint is still available:

```text
POST /:branding/:portal/api/mint/harvest/:recordType
```

It accepts the old Mint payload shape and returns the legacy flat array response, but it does not create tracked harvest runs.

The new implementation introduces two migration targets:

1. A compatibility endpoint that keeps batch-style harvesting but uses the new ReDBox payload shape.
2. A tracked harvest workflow that records runs, chunks, and per-record events and can be monitored through new read endpoints and the admin UI.

## Endpoint Mapping

| Use case | Endpoint | Notes |
| --- | --- | --- |
| Legacy Mint-compatible harvest | `POST /:branding/:portal/api/mint/harvest/:recordType` | Kept for backwards compatibility only. No harvest run tracking. |
| New compatibility harvest | `POST /:branding/:portal/api/records/harvest/:recordType` | Same batch submission pattern, but with the new request format. |
| List harvest runs | `GET /:branding/:portal/api/harvest-runs` | Admin-only read endpoint for run summaries. |
| Get one harvest run | `GET /:branding/:portal/api/harvest-runs/:id` | Returns run, chunk, event, and aggregate details. |
| List events for a run | `GET /:branding/:portal/api/harvest-runs/:id/events` | Admin-only paginated event feed for per-record outcomes. |

The `:branding`, `:portal`, and `:recordType` path parameters do not change.

## What Changes

### 1. URL change

The first migration step is to stop posting to the Mint-specific route and post to:

```text
POST /:branding/:portal/api/records/harvest/:recordType
```

### 2. Payload shape change

The legacy route expects records like this:

```json
{
  "records": [
    {
      "harvest_id": "s123456",
      "metadata": {
        "data": {
          "ID": "s123456",
          "GIVEN_NAME": "Andrew",
          "EMAIL": "notAReal@email.edu.au"
        }
      }
    }
  ]
}
```

The new compatibility route expects this shape instead:

```json
{
  "records": [
    {
      "harvestId": "s123456",
      "recordRequest": {
        "metadata": {
          "ID": "s123456",
          "GIVEN_NAME": "Andrew",
          "EMAIL": "notAReal@email.edu.au"
        }
      }
    }
  ]
}
```

### 3. Query parameter change

The legacy route uses the `merge` query parameter:

```text
POST /:branding/:portal/api/mint/harvest/:recordType?merge=true
```

The new compatibility route uses `updateMode` instead:

```text
POST /:branding/:portal/api/records/harvest/:recordType?updateMode=merge
```

Supported `updateMode` values are:

- `override`: Replace existing metadata when the record already exists. This is the default.
- `merge`: Merge incoming metadata into existing metadata. Array values are appended.
- `ignore`: Skip updates when the record already exists.
- `create`: Always create a new record instead of updating an existing harvested record.

## Migration Paths

### Option 1: Move to the new compatibility endpoint first

This is the lowest-risk migration path if you only want to stop depending on the Mint route.

Use the new `POST /api/records/harvest/:recordType` endpoint and translate the payload fields as follows:

| Legacy field | New field |
| --- | --- |
| `records[].harvest_id` | `records[].harvestId` |
| `records[].metadata.data` | `records[].recordRequest.metadata` |
| `merge=true` | `updateMode=merge` |

The response remains a flat array of harvest result rows:

```json
[
  {
    "harvestId": "s123456",
    "oid": "record-1",
    "message": "Record updated successfully",
    "details": "",
    "status": true
  }
]
```

This path is appropriate when:

- your harvester is already sending whole batches in one request;
- you do not need run-level progress or monitoring;
- you want to decouple from the legacy Mint route before changing your harvest orchestration.

### Option 2: Move to tracked harvest submissions

Tracked submissions use the same `POST /api/records/harvest/:recordType` endpoint, but the request body includes `sourceRunId`. When `sourceRunId` is present, ReDBox treats the request as a tracked harvest chunk.

Example tracked request:

```json
{
  "sourceRunId": "mint-run-2026-05-26T10:00:00Z",
  "sourceName": "mint",
  "sourceUri": "https://mint.example.edu.au/harvests/123",
  "finalChunk": true,
  "chunk": {
    "index": 0,
    "label": "page-1",
    "totalExpected": 1
  },
  "records": [
    {
      "harvestId": "s123456",
      "operation": "upsert",
      "updateStrategy": "replace",
      "recordRequest": {
        "metadata": {
          "ID": "s123456",
          "GIVEN_NAME": "Andrew",
          "EMAIL": "notAReal@email.edu.au"
        }
      }
    }
  ]
}
```

Tracked submissions add three major capabilities:

- run-level tracking keyed by `sourceRunId`;
- chunk-level deduplication and retry detection;
- per-record event history that can be queried after the submission.

Tracked request rules:

- `sourceRunId`, `sourceName`, `chunk.index`, and at least one record are required.
- `chunk.index` must be an integer greater than or equal to `0`.
- `updateMode` is not allowed on tracked requests. Use per-record `operation` and `updateStrategy` instead.
- Duplicate submissions of the exact same chunk content are detected and counted instead of being reprocessed.
- A chunk that is already processing returns `409` until it becomes stale and is eligible for retry.
- By default, the service limits tracked chunks to `250` records and `5,000,000` bytes unless `sails.config.harvestRuns` overrides those values.

Tracked record options:

- `operation`: `create`, `update`, `upsert`, or `delete`. The default is `upsert`.
- `updateStrategy`: `replace`, `merge`, or `ignoreIfExists`. The default is `replace`.

Tracked response example:

```json
{
  "run": {
    "id": "run-1",
    "sourceRunId": "mint-run-2026-05-26T10:00:00Z",
    "recordType": "party",
    "sourceName": "mint",
    "status": "completed",
    "totalProcessed": 1,
    "created": 0,
    "updated": 1,
    "deleted": 0,
    "unchanged": 0,
    "failed": 0,
    "chunksProcessed": 1,
    "duplicateChunks": 0
  },
  "chunk": {
    "id": "chunk-1",
    "chunkIndex": 0,
    "status": "processed",
    "recordCount": 1,
    "totalProcessed": 1,
    "created": 0,
    "updated": 1,
    "deleted": 0,
    "unchanged": 0,
    "failed": 0,
    "duplicate": false
  }
}
```

For per-record outcomes, query the harvest run event endpoints rather than relying on the submission response body.

## Monitoring and Admin API

Tracked harvesting is intended to be observable after submission.

### List runs

```text
GET /:branding/:portal/api/harvest-runs
```

Supported filters:

- `status`
- `recordType`
- `sourceName`
- `dateFrom`
- `dateTo`
- `page`
- `pageSize`

### Get one run

```text
GET /:branding/:portal/api/harvest-runs/:id
```

This returns:

- the run summary;
- all chunks recorded for the run;
- the latest event rows included in the detail response;
- aggregate counts for processed, created, updated, deleted, unchanged, failed, and duplicate chunks.

### List run events

```text
GET /:branding/:portal/api/harvest-runs/:id/events
```

Supported filters:

- `outcome`
- `operation`
- `harvestId`
- `oid`
- `page`
- `pageSize`

These read endpoints are admin-only and are the same endpoints used by the harvest runs admin UI added in this feature branch.

## Recommended Rollout

1. Move callers from `POST /api/mint/harvest/:recordType` to `POST /api/records/harvest/:recordType` using the compatibility payload.
2. Replace legacy field names with `harvestId` and `recordRequest.metadata`.
3. Replace `merge=true` with `updateMode=merge` where needed.
4. Once that is stable, introduce tracked chunk submissions by adding `sourceRunId`, `sourceName`, and `chunk.index`.
5. Mark the last chunk with `finalChunk=true` so the run can be closed cleanly.
6. Update operational monitoring to use `GET /api/harvest-runs`, `GET /api/harvest-runs/:id`, and `GET /api/harvest-runs/:id/events`.

## When to Keep Using the Legacy Endpoint

The legacy Mint endpoint should only remain as a temporary compatibility bridge while upstream harvesters are being upgraded. It is still useful when:

- an external Mint client cannot yet change its payload shape;
- you need short-term backwards compatibility during a staged rollout.

If you want access to run tracking, chunk deduplication, event history, and the harvest runs admin UI, you must migrate off the legacy Mint route.