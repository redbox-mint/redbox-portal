# Background CSV exports for admin export

Issue: [#4762 — Timeout downloading admin export with many records](https://github.com/redbox-mint/redbox-portal/issues/4762).

Status: implemented, 30 October 2026. Independent review and verification results are recorded in [verification.md](verification.md).

## Problem and evidence

Before this change, the admin export page opened a download URL and waited for the entire export in that HTTP request. Large CSV exports can remain silent longer than the reverse proxy's upstream read timeout.

The current implementation already bounds record memory by paging and streams its output. The remaining problem is when output begins:

1. `angular/projects/researchdatabox/export/src/app/export.component.ts`, `download()`, opens `/export/record/download/:format` in another window.
2. Both `packages/redbox-core/src/controllers/ExportController.ts` and its webservice equivalent pipe `RecordsService.exportAllPlans()` into the response.
3. `packages/redbox-core/src/services/RecordsService.ts` delegates to the configured record storage service.
4. `packages/sails-hook-redbox-storage-mongo/src/services/MongoStorageService.ts`, `exportAllPlans()`, scans every matching record to collect all flattened column names. Only then does it write the UTF-8 BOM and stream a second database pass through the CSV serializer.

The first pass is necessary for today's all-columns CSV contract: deriving the header from the first record would lose fields appearing only in later records or pages. Existing storage tests explicitly protect this behavior.

`record.export.maxRecords` currently defaults to **20** and acts as the query page size, not a total export limit. Small pages and increasing `skip` offsets add database work, but faster queries alone cannot guarantee completion inside a proxy timeout.

These findings come from source inspection. The timeout has not been reproduced against the reporting deployment, and its actual proxy settings and export volume still need measurement during verification.

## Agreed direction and scope

Prepare CSV exports in an Agenda job, store the completed file privately, and let the existing Angular export app show status and download the completed file.

- Queue all CSV requests from this page, including small exports. This gives one predictable flow without an expensive count query or size threshold.
- Preserve the record type and modified-date controls, record authorization, all discovered columns, CSV escaping, formula protection, filename convention, BOM, and empty-result behavior.
- Keep JSON on its existing streaming download path in this issue.
- Preserve the existing browser and REST direct-download response contracts. The admin CSV UI switches to new endpoints; existing direct CSV consumers retain their present timeout exposure. A future additive async REST API can serve those consumers without changing a binary response into JSON.
- Keep report CSV downloads (`ReportController.downloadCSV`), query-editor work, and a general-purpose export framework outside this issue.

## User experience

1. The user selects CSV, record type, and optional date bounds, then chooses **Prepare export**.
2. The page immediately shows **Queued** and then **Preparing CSV**. It explains that preparation continues if the user leaves the page.
3. Once ready, a **Download CSV** link appears with the preparation time and expiry time. Clicking it performs a normal browser download of the stored file.
4. Failure shows a short useful message and **Prepare again**, which creates a new job using that job's original options.
5. Expiry shows **Expired — prepare another export**.

Show a compact list of the user's latest exports below the existing form. Include record type, date range, requested time, status, expiry, and the available action. Restore this list on page load so refresh or navigation does not lose the job. Start with the latest 20 jobs rather than an unbounded history screen.

Use an indeterminate status while preparing. The existing export stream does not expose scan progress, so this design does not invent a percentage or require a preliminary count. Poll while a visible job is queued/running, approximately every three seconds, with no overlapping requests. Stop polling on terminal states and component destruction. A temporary polling error should allow reconnecting without creating another export.

Use an explicit download link once preparation finishes; downloading should not depend on a popup opened after asynchronous work. Disable repeat submission while the create request is pending. Add translations and accessible status announcements through the existing translation/UI conventions.

## Backend boundaries

### ExportService

Add `packages/redbox-core/src/services/ExportService.ts`, extending the core service class and registered through the service index. It owns request validation, job creation, ownership checks, worker execution, status reads, file access, and cleanup. Keep `ExportController` as a thin transport adapter and use the standard response envelope for JSON actions.

Reuse:

- `AgendaQueueService.now()` for durable submission and configured worker execution.
- `RecordsService.exportAllPlans()` as the storage-adapter boundary, initially without changing its signature or two-pass implementation.
- The configured StorageManager disk for all artifact operations: `putStream()`, `getStream()`, `getMetaData()`, `delete()`, and paginated listing for cleanup. Export code works against the disk interface and does not instantiate a storage driver.
- The existing `HttpClientService` conventions for an Angular export service, including CSRF initialization and the branding/portal base URL.

Use a dedicated `ExportJob` model. `AsynchProgress` is a useful UI precedent, but its generic browser endpoints allow clients to update progress metadata and its progress query is brand-scoped rather than inherently owner-scoped. Export state and private artifact references should be writable only by the export service.

### Job record

Store server-owned fields:

```text
id: random job identifier
brandId, portal, requestedByUserId
recordType, format: csv, modifiedBefore?, modifiedAfter?
status: queued | running | ready | failed | expired
createdAt, enqueuedAt?, startedAt?, completedAt?, expiresAt?
attemptId?, heartbeatAt?
diskName?, objectKey?, byteLength?, filename?
authorizationContext?, errorCode?, errorMessage?
```

`authorizationContext` records the effective identity and brand roles used for generation so a subsequent account/role change can invalidate the artifact. Resolve the effective user and current roles again when work starts; do not place a session, bearer token, or client-supplied role list in the queue payload.

Index owner/scope/time for recent-job queries, status/heartbeat for stale-job recovery, and status/expiry for cleanup. Register the model through `waterline-models/index.ts`; use the repository's existing initialization/index conventions. No record-data migration is required.

Return a small shared DTO from `packages/sails-ng-common`: job identifier, selections, public status, timestamps, safe failure information, and a relative download URL only when ready. Keep storage keys, worker tokens, and authorization details out of this response.

### Browser endpoints

All paths below are relative to `/:branding/:portal`. They use the existing session policies, with CSRF on POST and DELETE.

| Method and path | Behavior |
| --- | --- |
| `POST /export/jobs` | Validate `{ format: 'csv', recType, before?, after? }`, persist a queued job, await durable enqueue, and return `202` with the job DTO and `Location` header. Do not scan or count records here. |
| `GET /export/jobs` | Return the latest 20 jobs for the authenticated effective user, brand, and portal. |
| `GET /export/jobs/:id` | Return that user's job status in the current brand and portal. |
| `GET /export/jobs/:id/download` | Stream a completed stored file. Return `409` if not ready, `410` if expired, and `404` for unknown jobs or ownership/scope mismatches. |
| `DELETE /export/jobs/:id` | Delete a finished export early. Return `204`, immediately hide the job and block its status/download URLs, and remove its artifact through its saved disk. Return `409` while queued or running. |

Reject an unknown record type, unsupported format, malformed timestamps, or a reversed date range with `400` before enqueue. Preserve open-ended ranges and the current UI's inclusive local-day selection, normalizing copies rather than mutating the picker dates. Check the worker and download route against the same effective access rules as the existing export path.

The existing `/export(/*)` rules cover Librarians and Admin, but explicitly test access for all new actions and any deployment overrides. Never accept owner, brand, storage key, or status from the POST body. Scope every list/get/download lookup on the server. Use private/no-store caching for status and file responses.

Capture the localized attachment filename at submission so background execution does not depend on an HTTP language context. If enqueue fails, mark the job failed and return a service-unavailable error. A late/duplicate queue delivery must not execute a failed or terminal job. Do not return `202` before durable submission has succeeded; record `enqueuedAt` when acknowledgement arrives.

### Worker and file publication

Register an `ExportService-GenerateCsv` Agenda job. Its payload contains only the job identifier. Follow the configured queue backend; register recurring maintenance explicitly on MongoDB, as existing core maintenance jobs do.

1. Atomically claim a queued job and set `running`, a random attempt identifier, and heartbeat time. Repeated deliveries for an active or terminal job do nothing.
2. Resolve the current brand and effective requester. Fail if the account cannot use export anymore. Pass that requester's current username and brand roles into `RecordsService.exportAllPlans()` so the existing record ACL filter remains authoritative.
3. Resolve the configured disk through `StorageManagerService.disk(diskName)` and persist its name with the attempt's object key, such as `exports/<job-id>/<attempt-id>.csv`. Stream the CSV through that disk's `putStream()`. Await complete storage success and obtain the stored file length through `getMetaData()` before publication.
4. Atomically set `ready` with the artifact reference only if the job is still running under this attempt. Set expiry from completion time. Delete the attempt artifact if publication loses its claim.
5. On failure, destroy the source stream, remove any partial artifact, and set a safe failure code/message, completion time, and retention expiry. Keep diagnostic details in server logs.

Keep the Agenda lock alive with `job.touch()` and update the job heartbeat during preparation, including the silent column-discovery phase. If renewal fails, stop the stream and do not publish. Start with worker concurrency one per portal process; this setting is per process, so document aggregate database load for deployments with multiple workers.

An export should continue when the browser closes. A failed/interrupted job is retried by creating a new job; v1 does not introduce resumable generation or an automatic retry framework. Periodic maintenance marks running jobs with stale heartbeats as failed and queued jobs with no enqueue acknowledgement after a grace period as failed. Missing acknowledgement may also mean the process died after submission; late delivery still obeys the state check. Acknowledged queue backlogs use a separate configurable maximum wait (24 hours by default), rather than the short missing-acknowledgement grace period. Maintenance fails requests beyond that limit with a queue-timeout error so permanently lost deliveries do not remain queued forever. State/attempt checks prevent a late worker from publishing after recovery has failed its job. Choose heartbeat, lock, and stale thresholds together; test them with a fake clock.

### Private storage and retention

Select the staging location by disk name: `record.export.background.diskName` references an entry in `sails.config.storage.disks`, resolved through `StorageManagerService.disk(diskName)`. The storage disk configuration owns the driver, filesystem root, bucket, datastore, credentials, and visibility. Export generation, downloads, metadata reads, deletion, and reconciliation all use this disk interface.

Provide a default disk named `exports` in the normal storage configuration, initially using the existing private GridFS driver. GridFS is a default configuration choice; the export service has no GridFS-specific code or bucket assumptions. A deployment can map `exports` to a private S3 or filesystem disk, or select another configured disk name. For deployments with multiple portal replicas, the selected disk must be accessible to every worker and download-serving instance.

For example, a filesystem deployment can override the disk through the existing configuration shape:

```typescript
storage: {
  disks: {
    exports: {
      driver: 'fs',
      config: { root: '/attachments/exports', visibility: 'private' }
    }
  }
}
```

Settings live under `record.export.background`: `diskName: 'exports'`, `retentionHours: 24`, `maxRunMinutes: 60`, and `maxQueueMinutes: 1440`. Validate the named disk and positive limits during initialization. Persist the resolved disk name on each job before writing, then use that saved name for download and cleanup even if the configured disk name changes for new jobs. Keep old disk definitions available until their artifacts have expired and been removed. These defaults are operational choices to verify against representative exports, not measured capacity guarantees.

Run a Mongo-backed maintenance job approximately every five minutes to expire completed jobs, delete expired/failed/abandoned attempt objects, recover stale work, and retry previous deletion failures. Keep ownership metadata through a short expired-job window so the owner can receive `410`, then prune it after artifact cleanup. Do not rely on a TTL index alone: deleting the job row would leave its file behind.

An attempt's object key must be recorded before upload so recovery can locate abandoned artifacts. Deletion is idempotent; periodic reconciliation also removes old unreferenced objects beneath the export prefix, excluding live attempts and using an age grace period. Keep the execution deadline separate from retention and abort work that exceeds it.

An explicit delete transitions a terminal job to an internal `deleted` tombstone before removing its file. This internal state is excluded from the public job list and DTOs. Retain artifact references and any failed-attempt cleanup grace until deletion succeeds; maintenance retries storage failures. Prune the tombstone only after successful cleanup and the metadata retention window. Downloading a file does not reset its retention period or delete it. A download opening concurrently with deletion must recheck its job state before returning the stream.

At download, require the current effective owner, brand, portal, and permission to export. If the effective identity/brand roles differ from those used for generation, reject the stored artifact and require preparation again. The file represents the authorized generation result; this does not provide per-record ACL revalidation on every download or a transactionally consistent database snapshot. Document that policy and keep retention short.

Stream `getStream()` through `pipeline()` with `Content-Type: text/csv`, the existing attachment filename convention, and the stored `Content-Length`. Handle failures before headers with the normal error response; terminate the response on a later stream error rather than appending JSON to the CSV. A disconnected download closes that read stream but leaves the ready artifact available until expiry.

## CSV correctness and performance

The first implementation reuses the existing generator so the timeout fix does not also replace serialization or the storage adapter contract. Preserve:

- The union of all flattened fields, including fields found on later pages, in the current first-seen order.
- UTF-8 BOM for populated CSVs and a zero-byte file when there are no matching records.
- Existing nested object/array flattening, quoting, Unicode handling, and formula-injection protection.
- Brand, record type, modified-date bounds, and per-user/per-role record visibility filters.
- Bounded record buffering and downstream backpressure; the distinct column set still grows with the number of distinct fields.

The current two-pass, offset-based scan is a best-effort read of live records. Stable sorting does not make concurrent edits/deletions a database snapshot. Moving it to a job does not change that guarantee; test correctness on a fixed fixture and document live-record behavior.

After the timeout regression is fixed, measure page-size tuning and index/query plans on representative data. A separate improvement can replace repeated offset queries with a cursor and spool the first-pass records to private NDJSON while discovering fields, then create CSV from that same spool. This reduces repeated database reads and ensures the header describes the captured records, at the cost of intermediate storage and cleanup. It should not be a prerequisite for this issue.

Sending headers or a BOM early resets an idle timeout only once. CSV has no general-purpose heartbeat that preserves arbitrary file contents. Increasing proxy timeouts, inserting blank rows, or deriving columns solely from form configuration would leave reliability or data-loss problems, so they are not the proposed fix.

## Implementation plan

1. **Job types, model, and configuration.** Add the shared request/status DTOs, `ExportJob` model and indexes, service registration, configurable StorageManager disk selection and default disk definition, job definitions, and retention/execution settings. Establish atomic state transitions and server-only artifact references.
2. **Generation and lifecycle.** Implement durable enqueue, claim/heartbeat, streamed generation and atomic publication, authorization resolution, execution deadline, failure cleanup, stale-job detection, and retention. Reuse the current CSV generator.
3. **Browser endpoints.** Add thin create/list/status/download actions to the existing export controller and route configuration. Test CSRF, role access, owner/scope enforcement, validation, binary download headers, and error mapping. Keep current direct-download routes available.
4. **Existing Angular export app.** Add a typed local service extending `HttpClientService`; change the CSV action to preparation; add recent jobs, status polling, ready/download, failed/retry, and expired states. Keep JSON behavior. Update translations and component/service tests.
5. **Regression and operational verification.** Run the affected package/UI checks and real-stack lifecycle tests; reproduce a preparation delay exceeding the proxy read timeout and verify the background flow succeeds. Document storage, retention, queue behavior, rollout, and capacity observations in the wiki.

## Verification and acceptance

### Automated coverage

- **Service/worker:** durable acceptance without a record scan; enqueue rejection; all terminal paths; duplicate delivery; atomic claim/publication; heartbeat failure; process interruption; stale work; execution timeout; partial-file cleanup; expiry and deletion retry. Verify every artifact operation uses the selected StorageManager disk, an unknown disk is rejected, alternate disk configurations work, and existing jobs retain their saved disk after configuration changes. Test streamed storage failures and slow consumers without loading the whole file into memory.
- **CSV regression:** retain and run the current storage export tests, particularly later-page fields, formula prefixes, Unicode/BOM, empty results, authorization, date filters, and query failure.
- **Controller and real-stack integration:** create → status → ready → authenticated file download through the real queue and configured StorageManager disk; cover the default GridFS configuration and a private filesystem configuration. Test unauthorized users, cross-brand/portal/owner access, disabled requester, changed roles, unknown/expired jobs, malformed inputs, and missing CSRF. Assert content disposition, byte length, and no-cache behavior. Verify JSON and legacy direct-download contracts.
- **Angular:** correct submitted selections and date normalization, single-flight polling, refresh recovery, terminal states, temporary polling failures, retry with original options, link rendering, and subscription cleanup. Preserve JSON URL encoding and current date-picker models.

Use the existing core, Mongo-storage, shared-model, and Angular test commands for affected packages, plus Docker-backed Mocha/Bruno for the queue/storage/HTTP integration. Use the wiki's current `RBPORTAL_MOCHA_TEST_PATHS` selector for focused integration runs. Complete affected builds, lint, translation validation, and route checks as applicable; generated shims are not source edits.

### Timeout and scale acceptance

1. Put the portal behind a test proxy with a deliberately short upstream read timeout and make CSV preparation exceed that interval. Creation and polling must complete promptly, the job must become ready, and the completed CSV must download successfully. Use this same setup to demonstrate the old direct path's failure.
2. Verify create/status request latency does not depend on export record count; target under two seconds on the representative test environment. Investigate queue/database unavailability separately from export generation time.
3. Use a representative large, heterogeneous fixture, including a field introduced on the final page. Verify every expected row and column, filters, permissions, and parseable output.
4. Record peak process memory, generation duration, database query count/load, artifact size, and download start time. Buffering must remain bounded by page/stream settings plus the distinct-column set rather than the entire record collection or completed file.
5. Refresh/close the page during generation, restart a worker, interrupt a download, and force storage failure/expiry. Every case must lead to an observable recoverable result and eventual artifact cleanup.

The issue is resolved when the admin page can prepare and download a representative large CSV whose preparation outlasts the proxy timeout, with complete columns, preserved access filtering, and no dependency on keeping a browser request open.
