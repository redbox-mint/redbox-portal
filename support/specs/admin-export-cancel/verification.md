# Verification

Branch: `admin-deferred/04-export-cancel`; parent: `admin-deferred/03-harvest-stats`.

Heavy commands were run sequentially on the constrained development host.

- Shared models, core and Mongo storage builds passed.
- Core suite: **4,551 passed, 121 pending**. New tests cover queued cancellation/late delivery/deletion, preparing stream destruction and incomplete-upload cleanup, batch checkpoints, both cancel-versus-complete outcomes, all terminal states, changed disk configuration, Admin/owner/brand/portal enforcement, late remote writes after deletion, maintenance retry and pruning.
- Export controller tests cover scoped cancellation, v2 response/private headers, authentication, safe 403/404/409 mapping and CSRF-enabled route registration.
- Mongo storage suite: **293 passed, 42 pending**. New regressions verify cancellation at discovery and writing page boundaries. Existing CSV/JSON behavior remains covered.
- Angular export suite: **43 passed**. Covers dialog confirmation/dismissal, Admin/active-state restrictions, immediate badge/delete availability, stale polling and duplicate mutations, completion conflicts, encoded request IDs and CSRF opt-in. Coverage: 96.18% statements, 88.53% branches, 98.07% functions, 97.97% lines.
- Angular export development build passed.
- API route validation: **58 passed**, including UUID validation, CSRF, Admin metadata and generated OpenAPI validation for the cancellation endpoint.
- API JSON/YAML/Blueprint/HTML regenerated under `support/docs/generated/api` (repository-ignored generated artifacts).
- `docs:audit` completed: 42 published surfaces, 819 advisory findings; no audit gate failed.
- Translation verification passed: 1,524 metadata keys, 2,887 English keys, one production locale.
- Affected backend source lint passed with zero warnings/errors.
- HTTP integration tests were extended in `test/integration/services/ExportService.test.ts`. The Docker integration suites were not run, as required by the shared stack brief. SQS transport was not exercised against AWS; cancellation lives in the shared worker and Mongo job state, independent of delivery transport.
- Shared Webpack assets passed in development asset mode with the 3 GB heap. Existing Sass warnings remain. The mounted portal was restarted and returned healthy.

## Live browser and cleanup evidence

The actual portal created an `rdmp` export through the UI with 100 throwaway records. A removable inspector test script wrapped only the running exporter's checkpoint with a three-second delay; no pacing or test configuration was committed. The real Mongo/Agenda worker entered Preparing CSV with a pending private GridFS upload. The browser then confirmed cancellation and deletion.

The running job `ec1e7a6d-0025-47a4-b21b-0d572f837875` returned 403 for missing-CSRF cancellation, became Cancelled through the UI immediately after valid cancellation, rejected a repeat with 409, and returned 404 after Delete. The worker's final saved-file existence was false, incomplete-upload count was zero, and `cleanedAt` was set. Browser assertions also checked initial dialog focus, no horizontal page overflow at either width, and no application console errors (the existing HTTP-origin COOP browser warning is filtered by the shared capture tooling).

Screenshots reviewed against the shared admin patterns are in `/tmp/redbox-admin-shots/stack-04/`:

- `preparing-1280.png`
- `cancel-confirmation-1280.png`, `cancel-confirmation-768.png`
- `cancelled-1280.png`, `cancelled-768.png`
- `delete-confirmation-1280.png`, `delete-confirmation-768.png`
- `deleted-1280.png`, `deleted-768.png`
- `admin_export-1280.png`, `admin_export-768.png` (shared `capture.py`, after cleanup)

`interactions.py`, `browser-results.json`, `worker-cleanup.json`, `fixture-setup.json`, `fixture-cleanup.json` and `queue-cleanup.json` in that folder record the live test and cleanup. Screenshot-script locator retries were also cleaned up. All 100 fixture records and all five attempt jobs were removed; their two remaining queue entries and three queue-history entries were removed by exact job ID. The record count returned to its original 31, all six pre-existing export metadata rows remained, the original exporter function was restored, and there are no active fixture globals, records, job metadata or artifacts. No brand configuration was changed or published.

## Decisions and remaining limits

Cancellation is Admin-only, while existing Librarian export access remains unchanged. No data/model migration or dependency change is required. In-flight I/O stops cooperatively, and a crashed or unavailable storage backend may defer physical cleanup to maintenance; atomic status/publication checks still prevent a cancelled download. Custom storage hooks that ignore the checkpoint have best-effort upstream resource release. There are no open product questions or undelivered items in the requested scope; AWS SQS and Docker integration suites remain unrun as described above.
