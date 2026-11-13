# Background admin CSV export verification

Implementation branch: `fix/4762-background-admin-csv-export`.

## Review loops

1. Independent UI review found no actionable issues. Independent backend review found two issues: unfinished GridFS chunks could survive a worker crash, and an initial storage read failure could close the HTTP connection before an error response. Both received fixes and regression coverage.
2. A fresh backend review reproduced a further GridFS race: a chunk insert could finish after failure cleanup removed its recovery marker. The driver now waits for each bounded write and final file insertion before failure cleanup; three regressions exercise the actual GridFS stream with delayed database operations.
3. A third independent backend review found no actionable issues and independently reran all 56 export service, GridFS driver, and controller tests successfully. The UI remained unchanged after its clean review.
4. Closeout review checked the GridFS fixture metadata correction, scoped CSRF token requests, token/session acquisition before constructing POST requests, and the final documentation. No actionable issues remained.

## Verification evidence

- Shared package compilation, core source typecheck/build, and affected source lint passed.
- Angular export app: 20 Chromium tests, app/spec typechecks, and production build passed. The build reports the existing bundle-budget and CommonJS warnings.
- Export lifecycle and GridFS driver: 35 tests passed, including duplicate delivery, heartbeat/deadline failure, stale work, expiry/deletion retries, saved disks, restart recovery, and late-write failures.
- Controller: 21 tests passed, including initial storage read errors, client disconnects, zero-byte downloads, and the executable proxy-timeout regression. The regression uses a 100 ms idle timeout and a 300 ms silent preparation delay: the legacy direct request times out; creation, polling, and prepared-file download succeed.
- StorageManager and Agenda regression suites: 73 tests passed.
- Existing Mongo CSV/JSON generator regression suite: 7 tests passed, preserving columns from later pages, serialization, filtering, and empty exports.
- The final real Docker integration run passed all 8 committed tests with CSRF protection enabled, using the application, Mongo, Agenda, GridFS, and a private filesystem disk. Its 25-row fixture spans multiple pages and includes a final-page-only field, Unicode, and formula protection. The crash regression verifies stale and unreferenced chunk-only uploads are removed while a live attempt remains intact. Missing-token preparation returns 403 without creating a job, and valid-token preparation succeeds.
- All 9 Bruno scenarios passed in the preceding stack run with the standard integration harness's CSRF-disabled configuration. That run also passed the 7 business integration cases; a temporary Mocha wrapper ran Bruno before shutdown, giving 8 passing Mocha checks overall. Both disposable stacks mounted the current checkout into an existing development image, used real Mongo/Solr/Agenda/storage, and enabled local authentication for isolation.
- A broad core run completed with 4,452 passing and 121 pending tests. Three timing-sensitive tests exceeded their deadlines during concurrent validation; all three passed in isolation (font inspection, vocabulary bootstrap retries, and startup module loading). The core test-project typecheck also has existing diagnostics outside the export files.

Final reviews are clear. A small test-fixture type correction adds GridFS's required `chunkSize` metadata without changing production code. Final test-project typechecking reports no diagnostics in the affected files; existing diagnostics remain elsewhere. The CSRF-enabled run overrides the ordinary test bootstrap's disabled setting; the missing-token case skips when the harness disables protection.

## Explicit deletion follow-up

An independent review of the finished-export Delete API, cleanup lifecycle, UI, and regression coverage found no actionable issues. Downloading keeps the original completion-based expiry. Delete revokes access before removing the artifact through its saved disk, preserves failed-worker cleanup grace, and leaves a hidden tombstone for idempotence and cleanup retries.

- All 60 export service/controller unit tests and 29 Angular tests passed. Core source compilation, affected source lint/format, Angular app/spec typechecks, production build, and translation verification passed. The core test-project typecheck retains its 217 lines of baseline diagnostics, with none in affected export files.
- The disposable Mongo/Solr/Agenda/GridFS stack passed all 8 business integration cases and the Bruno wrapper (9 passing Mocha checks). Both CSRF-specific integration cases skipped under the standard CSRF-disabled harness. All 14 Bruno scenarios passed, including deletion, repeated deletion, hidden list entries, and inaccessible status/download URLs. GridFS and saved private filesystem deletion were both exercised.
- The running development stack was rebuilt and verified through Tailscale HTTPS with CSRF enabled. The new compiled bundle and Delete translations are served correctly. A fresh two-row export downloaded successfully without changing expiry. Missing-token DELETE returned 403 and left the file downloadable; valid-token DELETE returned an empty 204, removed the list entry, made status/download return 404, and accepted repeated deletion with 204.
- A direct check of that fresh job confirmed its `deleted` tombstone, successful cleanup timestamp, saved `exports` disk, and no completed or pending GridFS artifact. All 10,000 sample records and the previously listed exports remained intact.
- Both disposable attempts were cleaned up, including their containers, networks, volumes, and attachment directory. The first attempt stopped at a test-harness startup collision between `chai.should` and Sails's dependency scanner; a temporary scanner exclusion for non-hook dependencies resolved it without changing production code. No task worktrees or Docker images were created. The manual `redbox4762-dev` stack remains running and healthy.

## Operational limits

The proxy regression verifies the timeout mechanism; it is not a production capacity benchmark. Large representative deployment data was not available, so peak memory, database load, and throughput for a production-sized export remain unmeasured. The existing paged, two-pass generator is reused without a new whole-file buffer. It retains its live-record consistency semantics.

The temporary Docker projects reuse existing images. After each run, task containers, networks, and disposable volumes are removed. No task worktrees or images were created; unrelated resources are preserved.
