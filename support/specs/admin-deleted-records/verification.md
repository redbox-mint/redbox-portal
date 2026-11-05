# Verification: deleted records

All builds, tests and Docker operations ran sequentially on the constrained development host.

| Check | Result |
| --- | --- |
| Core TypeScript compilation | Passed |
| Mongo storage TypeScript compilation | Passed |
| Full core unit suite | 4,558 passing, 121 pending |
| Mongo storage suite | 296 passing, 42 pending |
| Angular shared-library build | Passed |
| Angular deleted-record application build | Passed |
| Angular shared-library tests | 187 passing |
| Angular deleted-record tests | 60 passing |
| API route contract validation | 59 passing |
| REST generation (`npm run doc:api`) | Passed; ignored JSON/YAML/API Blueprint/HTML outputs regenerated |
| Translation verification | Passed: 2,909 English keys |

New coverage includes type/actor projections (including unknown and cross-brand actors), deletion-time actor capture at the durable tombstone boundary, query predicates before pagination for 7/30/any periods and exact deleters, batch validation/cap/duplicates, independent per-record authorization, stale preconditions, mixed/unknown outcomes, UI selection and both bulk flows, count confirmation/cancellation, filter forwarding, selected-revision preflight and malformed response handling. Existing single-record lifecycle UI tests still pass.

`test/integration/services/AdminDeletedRecordsAjax.test.ts` adds real session/Admin/CSRF, cap, absent-item and filter validation checks. Docker integration suites were not run, as required by the task brief. Pending core/storage tests are inherited. The default Mocha compose disables CSRF, so the CSRF-specific integration assertion runs only when it is enabled; CSRF rejection was checked against the running development portal.

Detailed command logs are under `/tmp/redbox-admin-shots/stack-05-*.log`.

## Browser and HTTP checks

The mounted portal was restarted and reported healthy after sequential builds. Four disposable records (two `rdmp`, two `dataRecord`) were created through storage and deleted through RecordsService as the local Admin. New tombstones exposed the captured actor and translated types. One fixture was changed to an older, actor-less tombstone to verify **Unknown** and exclusion by the 7-day and exact-username filters (3 results versus 4 for any time).

HTTP checks verified 403 without CSRF, 400 for 101 items, 400 for an invalid deletion period, per-item unavailable results, and a real mixed batch with one successful restore and one unavailable id. A disposable Researcher logged in successfully and received 403 on the bulk endpoint with a valid CSRF token.

The UI selected three current-page rows. One record was independently restored and deleted again, changing its revision. Bulk restore then reported **2 succeeded · 1 failed**, named the stale record, cleared selection and refreshed the list. A subsequent bulk permanent deletion succeeded after explicit count confirmation. No simulated response was required. Desktop/tablet page overflow checks were false; table overflow stays inside its card. Normal page and action flows had no application console errors. Diagnostics contained the existing HTTP-origin COOP warning and the expected 400/403 entries from deliberate rejection checks.

Screenshots are under `/tmp/redbox-admin-shots/stack-05/`:

- `table-1280.png`, `table-768.png`: both types, deletion actors and legacy Unknown.
- `filter-1280.png`, `filter-768.png`: Last 7 days, with the older record excluded.
- `selection-1280.png`, `selection-768.png`: page selection and bulk bar.
- `confirmation-1280.png`, `confirmation-768.png`: permanent-delete confirmation with count.
- `partial-failure-1280.png`, `partial-failure-768.png`: real partial failure and refreshed results.

Widths in filenames are CSS viewport widths; the shared preview browser saves tablet PNGs at its device-pixel scale. A reproducible Playwright interaction script is at `/tmp/redbox-admin-shots/stack-05-interactions.py`. Screenshots were reviewed against the existing admin patterns.

## Cleanup and final checks

All four fixture OIDs were purged using the normal lifecycle services; fixture RecordAudit rows and their test-only OID identity reservations were then removed. Final counts were **0 active records, 0 deleted records, 0 record audits, 0 identity rows** for those OIDs. The temporary auth user and its UserAudit entries were removed, and no auth-fixture users remain. The admin deleted-record page returned to its original empty state. No branding or portal configuration was changed.

Both compound deletion-filter indexes were confirmed in the running Mongo collection.

Targeted lint passed with 0 warnings/errors; `git diff --check` passed. Webpack completed with its existing Sass dependency warnings. `docs:audit` completed (42 published surfaces, 825 advisory findings). Generated REST outputs and audit artifacts are ignored build products. No dependency changes were made. All screenshots and detailed logs remain outside the repository; the listed source/test/documentation changes form the branch commit.
