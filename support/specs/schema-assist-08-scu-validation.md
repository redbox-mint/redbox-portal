# SCU validation of the schema-assisted query and report editors

Validated on 30 October 2026 on `stack/schema-assist-08-scu-validation`, based on
`stack/schema-assist-07-ui-polish` at `00d05d566`. SCU hook:
`/home/ubuntu/work/bitbucket/redbox-hook-scu`, `feature/v5-refactor`, `6145e27`.
No tracked hook files were changed, and nothing was pushed.

## Running environment

The SCU stack is **left running**:

- Portal: <http://nam-oci-agent-2.tail4a7c3.ts.net:1538>
- Login: `/default/rdmp/user/login`, `admin` / `rbadmin`.
- Query editor: `/default/rdmp/admin/named-query`.
- Report editor: `/default/rdmp/admin/reports`.
- New report: `/default/rdmp/admin/report/scuRdmpDateReport`.
- Email editor: `/default/rdmp/admin/email-templates`.
- Report-only account: `scu-report-author` / `SCUreport123!`.

Tailscale `Self.DNSName` was `nam-oci-agent-2.tail4a7c3.ts.net.`. Both
`sails_appUrl` and `REDBOX_PORTAL_APP_URL` use the hostname without its final dot
and published port **1538**. T3 Browser loaded that login URL and authenticated
with the visible text `Welcome Local Admin` before testing.

Compose project: `sa08-scu`. Containers:

| Service | Image | Memory cap | Published port |
| --- | --- | --- | --- |
| rbportal | cached `redbox-portal:playwright-node24` | 3 GiB; Node heap 2 GiB | 1538 → 1500 |
| mongodb | `mongo:latest`, verified 9.0.4 | 768 MiB; WiredTiger 0.25 GiB | 127.0.0.1:27548 → 27017 |
| solr | cached image `sha256:d5d3e2445d6ecf634d81259f1d0c25ba7fd3d297bc31f0032aca16cdc6cbd8e5` | 768 MiB; heap 384 MiB | none |

`sa07-*` on 1537 and `redbox-5025-*` were neither stopped nor changed. Heavy
commands ran serially under external `timeout`; Angular assets were built
before SCU started. Final observed SCU RSS was approximately 606 MiB portal,
412 MiB Mongo and 570 MiB Solr, with 5 GiB host RAM available and 20 GiB disk
free. This is a development validation environment, not a load-test result.

### Local preparation and commands

All environment scripts and overrides are git-ignored in this worktree's
`.tmp/schema-assist-08/`; generated frontend output is in `.tmp/public/` and
`assets/angular/`. The other agent's `t3-b2debb8e` worktree was only read.
Dependency directories were copied into this worktree, with local package links
pointing here. Node 24.22.1 compiled the core packages and SCU hook. Ignored hook
`node_modules` links and `dist` output were produced; its tracked tree is clean.

The hook README's `npm run dev:run:core` / `prepare-core-mount.sh` and
`support/development/docker-compose.core-mount.yml` were used as the integration
pattern. **The stock command alone is insufficient for this validation**: it
uses the image's old Angular assets. Instead, the ignored `compose.sh` runs:

```bash
export REDBOX_PORTAL_PATH=/home/ubuntu/.t3/worktrees/redbox-portal/t3-c15c01bd
export REDBOX_PORTAL_APP_URL=http://nam-oci-agent-2.tail4a7c3.ts.net:1538
export REDBOX_APP_URL=$REDBOX_PORTAL_APP_URL
cd /home/ubuntu/work/bitbucket/redbox-hook-scu
docker compose -p sa08-scu \
  -f support/development/docker-compose.yml \
  -f support/development/docker-compose.core-mount.yml \
  -f "$REDBOX_PORTAL_PATH/.tmp/schema-assist-08/scu.override.yml" up -d --no-build rbportal
```

The actual wrapper commands, from the core root, were:

```bash
timeout 1500 bash .tmp/schema-assist-08/compile.sh
timeout 2400 bash .tmp/schema-assist-08/build-angular.sh
timeout 180 env NODE_OPTIONS=--max-old-space-size=3072 node .tmp/schema-assist-08/build-assets.cjs
timeout 120 bash .tmp/schema-assist-08/compose.sh up -d --no-build rbportal
node .tmp/schema-assist-08/seed.cjs
```

Individual compilation/build steps inside the scripts also have timeouts.
The Angular build script serially builds `portal-ng-common`, `named-query-editor`,
`report-config`, `email-templates`, `local-auth` and `report`, then copies their
output into `.tmp/public/angular/`. Core theme CSS was compiled through Webpack;
the local asset script omits the unavailable Redoc copy pattern. SCU assets were
also copied into `.tmp/public/` on the host.

The local override mounts **both** `.tmp/public` and each built
`assets/angular/<app>` into the container. The latter is necessary because
`CacheService` reads asset hashes there; mounting only the served directory
initially caused stale bundle URLs and a 404. It also mounts core styles and
merged core/SCU translations, overrides the portal port and memory limits, and
uses Node 24. The launcher copies core views, then SCU views/bootstrap data,
registers the SCU hook, enables boolean CSRF, disables external RVA import, and
starts Sails. An empty local overlay for the hook's runtime `node_modules`
prevents host-absolute compilation links from breaking module resolution.
The portal runs as root locally so those image-directory copies can complete.
SeaweedFS is behind an unused `attachments` profile.

After a core service change:

```bash
timeout 240 env PATH=/home/ubuntu/.nvm/versions/node/v24.22.1/bin:$PATH \
  NODE_OPTIONS=--max-old-space-size=3072 \
  node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json
timeout 120 bash .tmp/schema-assist-08/compose.sh restart rbportal
```

Wait for the Tailscale login URL to return HTTP 200. The full-page workspaces,
fresh hashed bundles, SCU labels and rebuilt theme were verified in T3 Browser.

**To stop and remove only this stack and its disposable data:**

```bash
timeout 180 bash /home/ubuntu/.t3/worktrees/redbox-portal/t3-c15c01bd/.tmp/schema-assist-08/compose.sh down -v --remove-orphans
```

Omit `-v` to retain its named Mongo volume. Do not use the hook's generic
cleanup command for this separately named project.

## Realistic data

There are **173 validation records**: 172 deterministic bulk fixtures plus one
record created successfully through the public record API and SCU validation
hooks.

| Type | Count | Variety |
| --- | --- | --- |
| rdmp | 112 bulk + 1 API | all seven SCU stages; 16 bulk records per stage |
| activity | 16 | SCU example projects, FOR/SEO classifications and funding |
| dataPublication | 24 | draft, queued, published and retired; RDMP links |
| party | 4 | example people with identifiers and contributor details |
| funding | 8 | hook example funding providers |
| jira-ts | 8 | draft/provisioning workspace stages and linked RDMPs |

Bulk fixtures derive from `test/example-data/{people,activities,providers}.json`.
They contain realistic project titles, long labels/values, contributors and
identifier arrays, FOR/SEO values, funding arrays, namespaced start/end dates,
SCU faculty and retention fields, expired/upcoming retention dates, empty arrays,
and omitted values. IDs start `sa08-`; the metadata marker is
`validationFixture: "schema-assist-08"`.

The API-created RDMP is `fffcb50913a7490f959071f68b154876`, titled
“SCU river restoration field survey — API-created validation plan”. It passed
SCU pre/post-create hooks and appears in the email editor's real-record search.
Initial create attempts correctly reached SCU's retention-reason and data
classification validators; successful metadata included
`redbox:retentionPeriod_dc:date_skos:note: ["not-applicable"]` and
`scu-rdmp-data-classification-item-data-in-categories: ["none-apply"]`.

Bulk loading directly into disposable `redbox-storage.record` intentionally
bypasses hook execution and Solr indexing; those records exercise native Mongo
queries/reports, but do not all appear in Solr-backed record pickers. The one
API-created record exercises that separate path. No SCU `dataRecord` type is
advertised by its schema-target API; SCU's publication type is `dataPublication`.

## Browser and live API results

### Named-query editor — pass, with advisory limitations below

All **18 SCU bootstrap queries** were individually opened in the browser,
toggled to/from raw Mongo JSON, and saved without changes. Parsed raw JSON
round-tripped in every case. After restoring original bootstrap definitions,
all 18 were saved again against the fixed server: every original definition
remained byte-identical, including `sort: "[]"` and serialized JSON whitespace.
Comparisons exclude model IDs, branding/key and lifecycle timestamps, not
definition fields. All seven additional core bootstrap queries were also
unchanged in the database snapshots.

Exact type constraints infer guidance; the cross-type
`listRecordNotificationLogs` leaves it unselected. Explicit guidance/stage
changes do not modify stored predicates. All seven RDMP stages return partial
effective-form guidance: 87 fields in draft/approval/submitted/active and 89 in
ended/closed/abandoned, including 16 `scu_` fields. Field labels are translated
from real SCU keys; searching “Project name” finds `metadata.title`.

Insertion was exercised through the controls/field trees:

| Context | Observed inserted value |
| --- | --- |
| Mongo condition | `metadata.scu_contributor_ci_faculty` |
| Direct result mapping | `record.metadata.title` |
| Handlebars result mapping | `{{record.metadata.scu_contributor_ci_faculty}}` |
| Sort | `metadata.scu_calculated_retention_end_date` |
| Related-filter local and foreign fields | `metadata.title`, with independently selected foreign publication guidance |

All 18 validation and preview requests returned HTTP 200 and valid drafts.
Representative final preview counts (with appropriate lookup parameters):

| Bootstrap query | Matches |
| --- | --- |
| listDataPublicationsForRdmp | 4 for `sa08-rdmp-000` |
| listFundingBodies | 1 for “research” |
| listPartiesPeople | 2 for “example” |
| listRDMPRecords | 113; preview capped at 100 |
| listRdmpsForResearchActivity | 113 without a restricting activity parameter; capped at 100 |
| listRdmpsInWorkflowSubmitted | 16 |
| listRdmpsProjectEndReached | 13 |
| listRecordNotificationLogs | 137; capped at 100 |
| listResearchActivities / listResearchActivitiesUpdatedDate | 16 each |
| listWorkspacesJiraTsForRdmp | 1 for `sa08-rdmp-000` |
| E12 / E13 / E14 / E15 notifications | 0 / 3 / 13 / 15 |
| E16 / E17 / E18 retention notifications | 8 / 16 / 8 |

The browser displays an explicit row-limit warning. A temporary unsaved draft
with related filters and `$where` was refused with specific deadline/server
JavaScript diagnostics. It was discarded, not saved. Preview output preserved
arrays, wrapper paths, and missing/empty values.

New query **`scuRdmpDateRange`** was created through the UI: an exact RDMP
constraint, ISO date parameters `createdAfter`/`createdBefore` on `dateCreated`,
ascending sort, and mappings for project title, created date, contributor array,
SCU faculty and calculated retention date. It remains available for exploration.

### Report editor and runtime — pass, with advisory limitations below

Both SCU bootstrap reports (`notificationLogRecords`, `rdmpRecords`) load their
query's parameters/output descriptions and existing filters, columns and
templates. Browser no-op saves preserve their complete stored definitions.
Their previews initially returned zero rows because the report title leaked
into a `title` filter; after the fix they returned 136/112 rows before the extra
API fixture, bounded to 100. Final matching query counts are 137/113.

New report **`scuRdmpDateReport`** was built and saved through the browser:

- Five columns added from selected output fields, retaining real SCU labels.
- One date-range filter bound to `createdAfter` and `createdBefore`.
- Display template with bold project title and formatted created date.
- Separate CSV templates, using the result-row path and `recordTableMeta.val`.
- A multivalue contributor column with per-item display and export templates.
- Keyboard autocomplete in both display and CSV editors inserted
  `{{metadata.projectTitle}}`; it also worked in the shared email editor.

The range 1 January–30 June 2026 returns **29 rows**. All 29 display rows match
the saved runtime report over its three pages. All 29 raw export-value arrays
match the downloaded CSV exactly, including configured trailing separator
spaces; this was checked separately from DOM whitespace normalization.
The browser download is 5,348 bytes. Arrays with two contributors and empty
arrays render/export correctly. Display and CSV deliberately format dates
differently, and each matches its corresponding preview. No diagnostics are
reported for this new report.

The runtime page's filter controls were filled and **Filter** clicked; its
initial URL does not prepopulate filter controls. This existing runtime behavior
was not changed. Preview date inputs and runtime datepicker inputs were both
tested with their respective formats.

### Report-only role — pass after view-gate fix

`SCUReportAuthor` has report list, report-config API/admin and runtime report
permissions, with no named-query administration permission. In a separate
incognito browser session it can open the full editor, fetch query descriptions
through the report-owned endpoint, preview, and save a real title change. The
title was then restored. Named-query discovery/admin APIs return 403 and the
Manage named queries link is absent. The default reader-only list remains
covered by the view regression test.

### Email templates — shared editor pass; SCU legacy defaults fail

The catalogue loads all 26 entries. The core `test` template opens under SCU,
loads real SCU field/stage guidance, selects the API-created RDMP, autocompletes
`record.metadata.title`, renders title/faculty in the preview frame, and saves a
draft. An intentional `record.title` mistake produced an appropriate advisory
and missing-preview-value error. The corrected draft was saved but **not
published**; no email was sent.

All **19 SCU-specific legacy defaults** show Invalid. Opening
`e13ProjectEndApproaching` returns 404 `MISSING_DEFAULT`. The hook supplies
`views/emailTemplates/*.ejs` and EJS subject expressions, while the current
template service reads `.hbs` defaults. This is a hook migration issue, not fixed
by changing core's template execution contract. Seven core defaults are listed
without that invalid status; one was exercised end-to-end as described above.

## Core bugs fixed and regression coverage

| Bug exposed by SCU | Minimal fix | Regression tests |
| --- | --- | --- |
| Query no-op saves normalize serialized JSON and change `[]` to an empty string | `NamedQueryService.update` preserves semantically unchanged source strings, including omitted empty optional arrays; real changes and clearing nonempty arrays still work | 3 cases in `test/services/NamedQueryService.test.ts` |
| Report no-op saves materialize optional defaults and discard hook extension properties | `ReportsService.updateConfig` returns the current config when normalized definitions are equal | 1 case in `test/services/ReportsService.test.ts`; existing invalid-template mutation test still changes a real value |
| Preview treats body `title`/`name` as filter input | Both admin and API `ReportController.previewConfig` read filters only from `req.query` | 2 controller cases for explicit query/date values, absent body collisions and empty strings |
| Raw SCU translation keys make label search ineffective | `FieldDescriptionsService` resolves full `@` label keys using brand-aware `TranslationService`; keeps literal/missing labels | 1 SCU-style form regression |
| Report-config-only users cannot reach the Angular workspace | `views/default/default/admin/reports.ejs` checks report-config path permission in addition to Admin and passes the actual admin flag | 3 EJS cases: author, reader and administrator |

Ten new regression cases in total. No Angular source or visual redesign was
introduced in this branch.

### Checks run

| Check | Result |
| --- | --- |
| Core TypeScript compilation after the fixes | pass |
| Focused query/report/field/controller/view/editor/email Mocha suites | 238 passing |
| Additional assistance/context/CSV/HTTP and native Mongo preview suites | 85 passing, 3 pending |
| Native Mongo date comparisons | 20 passing |
| Total final Mocha results | **343 passing, 0 failing, 3 pending** |
| Production Angular builds before stack startup | six successful builds, including the shared library |
| Core theme/JS asset compilation | pass with local Redoc copy omission |
| Oxlint on five changed TypeScript implementation files | 0 warnings/errors |
| `git diff --check` | pass |

The three pending cases require Mongo server failpoints, which were not enabled
on the running development database. Native Mongo tests used separate
`redbox_named_query_regression` collections and cleaned their fixtures.

Reproducible focused command, from `packages/redbox-core`:

```bash
timeout 180 env PATH=/home/ubuntu/.nvm/versions/node/v24.22.1/bin:$PATH \
  TS_NODE_PROJECT=test/tsconfig.json NODE_OPTIONS=--max-old-space-size=2048 \
  ../../node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types \
  --require ts-node/register/transpile-only --require ../../node_modules/chai/index.js \
  --require test/setup.ts --timeout 15000 \
  test/services/NamedQueryService.test.ts test/services/ReportsService.test.ts \
  test/services/FieldDescriptionsService.test.ts \
  test/controllers/webservice/ReportAssistance.test.ts \
  test/controllers/ReportEditorView.test.ts test/services/NamedQueryEditorService.test.ts \
  test/services/EmailTemplateService.test.ts
```

The additional suite uses the same runner with
`NAMED_QUERY_TEST_MONGO_URL=mongodb://127.0.0.1:27548` and
`ReportAssistance.test.ts`, `ReportAssistanceMongo.test.ts`,
`NamedQueryPreviewMongo.test.ts`, `QueryReportContext.test.ts`,
`ReportControllerCsv.test.ts`, `webservice/NamedQueryAssistance.test.ts`;
the date suite runs `NamedQueryServiceMongoDates.test.ts`.

Logs are `/tmp/schema-assist-08-{regression-final,contract-regression,date-regression,core-tsc,lint}.log`
and `/tmp/schema-assist-08-<app>-build.log`.

## Performance, screenshots and open UX issues

Desktop checks used 1440 × 1000 CSS pixels; narrow checks used 390 × 844.
Warm stage guidance requests took 88–106 ms, and final bootstrap previews took
34–470 ms. A five-column, 29-row report preview took 325 ms. Field search and
keyboard completion updated within the 100–150 ms observation intervals, with
no visible typing stall. These timings include browser/HTTP overhead and are
single-user observations on 173 fixtures, not production-scale guarantees.

All screenshots are in **`/tmp/schema-assist-08-scu-screenshots/`**. Key evidence:

| Files | Evidence |
| --- | --- |
| `00-login.png`, `01-authenticated.png` | Tailscale login and Local Admin |
| `03-before-label-search.png`, `04-before-untranslated-label.png`, `07-translated-field-search.png`, `19-scu-field-labels-desktop.png` | SCU labels and translation fix |
| `05-before-report-author.png`, `06-report-author-workspace.png` | report-only role before/after |
| `08-report-preview-desktop.png`, `09-runtime-report-desktop.png`, `21-report-csv-preview-desktop.png` | realistic report preview/runtime/export |
| `10-scu-legacy-email-unavailable.png` | hook's missing legacy email default |
| `11-email-editor-desktop.png`, `12-email-editor-narrow.png` | shared email editor |
| `13-report-editor-narrow.png`, `22-report-scu-column-labels-narrow.png` | report workspace and long SCU column labels |
| `15-query-editor-narrow.png`, `16-query-mapping-scroll-narrow.png` | narrow query workspace and wide mapping table |
| `18-query-preview-refusal.png`, `20-query-preview-truncation.png` | explicit refusal and truncation |

Open issues for a later UX/diagnostics pass; no redesign was attempted:

1. At 390 px the query mapping table is 1,166 px wide inside a 324 px scroller.
   Editing a source and its output name requires horizontal movement.
   See `16-query-mapping-scroll-narrow.png`. Overall page width remains 390 px.
2. The report editor is very long with five columns; Fields and help follows
   the main editor on narrow screens, and the sticky actions consume significant
   vertical space. “Save report” wraps at 390 px. See `13-report-editor-narrow.png`
   and `22-report-scu-column-labels-narrow.png`.
3. Partial-form guidance emits nonblocking `UNKNOWN_FIELD` warnings for valid
   envelope/notification paths and contributor `text_full_name` not described
   by the effective form. These are noisy for SCU notification queries.
   The existing report's hidden template-only `reportExternalURL` also receives
   an `UNKNOWN_OUTPUT_COLUMN` advisory even though its export template is valid.
   These are advisories, not false blocking errors; no definitions were rewritten.
4. Long SCU labels wrap acceptably but require substantial scrolling; the query
   preview's metadata JSON column is also very wide for contributor-rich rows.
   Desktop help has a long explanation before the field tree. See
   `17-scu-fields-desktop.png`, `19-scu-field-labels-desktop.png` and the preview
   screenshots.

## Hook-side findings and remaining limits

- SCU EJS email defaults require migration to the current Handlebars/default
  registration contract; see the failure above.
- `listRecordNotificationLogs` uses `oid` in its stored predicate/parameter
  rather than stored-record `redboxOid`, so filtering by an ID needs hook review.
- E15's output mapping uses `record.metadata.metadata.rdmp-data-status-published`
  (a doubled `metadata`); the real value is not at that path.
- E12 filters top-level `createdOn`; real records use `dateCreated` and/or
  `metaMetadata.createdOn`. Its zero rows are not an editor failure.
- The hook's obsolete optional email unit fixture refers to
  `src/api/services/EmailService.ts`, absent in the modern hook layout. It was
  not enabled as a substitute for live editor validation.
- Attachments/SeaweedFS, email delivery/publishing, external SCU integrations,
  the entire hook/portal CI suites, and production-scale load were not tested.
  Only one core email default was edited; all 19 SCU defaults were inspected in
  the catalogue and one missing-default failure was opened directly.
- Angular unit suites were not rerun: this branch changes server code and an
  EJS gate, with Mocha regressions and fresh production Angular builds. The
  existing 07 handoff records its Angular suite results. Live browser work here
  used T3 Browser, not a second memory-heavy Playwright stack.

Ignored detailed evidence: `baseline.json`, `final-noop.json`,
`bootstrap-query-results.json`, `final-bootstrap.json`, `stage-results.json`,
`report-parity.json`, `raw-csv-parity.json`, and `scuRdmpDateReport.csv` under
`.tmp/schema-assist-08/`. Original bootstrap definitions remain unchanged;
the new query, report, report-author account, fixtures and unpublished `test`
email draft remain in the disposable SCU database for exploration.
