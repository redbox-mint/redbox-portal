# Cancel background admin CSV exports

Delivered on `admin-deferred/04-export-cancel`, parent `admin-deferred/03-harvest-stats`.

## API and authorization

`POST /:branding/:portal/export/jobs/:id/cancel` takes a UUID route parameter and no application payload. Session callers supply the normal CSRF token (header or `_csrf` field). Success is HTTP 200 with the cancelled ExportJob DTO; API v2 uses `{data, meta}`. Invalid route parameters return 400, inaccessible/missing/deleted jobs 404, and an already terminal job 409. Authentication and authorization failures use the ordinary policy/controller errors. Responses are private and never expose disk keys, worker IDs or authorization snapshots.

The route is registered in the contract registry with CSRF enabled and the usual authentication, path-rule and validation policies. ExportService independently resolves the current effective user, checks the brand's Admin role, and scopes the mutation to that user's brand and portal. Existing create/list/download/delete permissions (including Librarians) are preserved. Cancellation is deliberately Admin-only; owning an export alone does not grant cancellation.

## Lifecycle and races

ExportJob stores a string status, so adding the shared `cancelled` terminal state needs no migration or index change. The ordinary path is queued → running (shown as Preparing) → ready, with failed and expired outcomes. Deleted is a private tombstone. Cancellation atomically updates only queued/running jobs. A worker atomically claims only queued jobs and atomically publishes only its still-running attempt. Claim, cancel, failure and publication therefore compete on the same document; cancellation never rewrites a ready export, and a cancelled attempt cannot publish. Late and duplicate queue deliveries cannot restart it.

Cancelled jobs have no download retention. Their expiry timestamp records cancellation time, their badge stays Cancelled, and metadata is pruned only after successful cleanup and the ordinary additional 24-hour terminal retention. Existing Delete accepts cancelled jobs, hides them immediately and preserves any cleanup grace for an unfinished writer. Cancellation does not require resolving the current disk configuration, so configuration changes cannot prevent stopping a job.

## Worker and storage

RecordsService forwards an optional async checkpoint to storage hooks. The Mongo storage hook checks it before/after each database page in both CSV passes: discovering the union of columns, then streaming sanitized records through json2csv. Both passes use bounded pages; there are no filesystem CSV temp files. Partial output lives on the saved StorageManager disk (private GridFS by default, or configured filesystem/S3).

A one-second database check also stops silent or blocked work and destroys the source stream. The existing heartbeat and deadline continue to guard the queue lease and execution. Cleanup waits for settled writes; a late remote upload cannot publish and gets another deletion attempt when it settles. GridFS's incomplete-upload discovery removes pending mappings and chunks as well as completed files. Failed cleanup keeps the saved disk/object reference for maintenance retry. Crashed workers are recovered after the existing five-minute grace; a live cancellation normally stops at the next page or within one second plus the current operation's latency.

Cancellation is queue-independent: both Mongo Agenda and `packages/agenda-sqs-backend` invoke the same worker with the ExportJob ID. We do not remove a message from the queue; its later receipt safely no-ops. The existing Mongo-backed maintenance schedule remains required even when generation uses SQS (its backend is already explicitly configured as Mongo). No new SQS feature is required.

Custom storage hooks may ignore the optional checkpoint without breaking their existing signature. For those hooks, prompt upstream query/resource release is best-effort through source destruction and the one-second check; atomic cancellation and suppression of publication remain authoritative. Hooks should honor the checkpoint and stream destruction for cooperative resource release. In-flight database/storage calls cannot be forcibly interrupted; late completion cleanup and maintenance cover their artifacts.

## UI

Admins see Cancel for Queued/Preparing rows. A focus-trapped dialog asks “Stop preparing this export?” and initially focuses Keep preparing. It blocks duplicate mutations, preserves error feedback, restores focus, and refreshes immediately after success or conflict. It drains older list requests before applying a cancellation response so stale polling cannot restore Preparing. Cancelled rows display a neutral badge and offer Delete through the ordinary confirmation menu. New copy is translated.

## Verification

See `verification.md` for test results and screenshot evidence. HTTP integration coverage is extended in the existing ExportService suite; it includes CSRF, Admin-only access, owner/brand/portal isolation, invalid IDs, late delivery, repeat cancellation and subsequent deletion. The Docker integration suite is intentionally not run under this task's shared brief.
