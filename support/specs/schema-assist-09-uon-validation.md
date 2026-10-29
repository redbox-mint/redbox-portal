# UoN validation of the schema-assisted query and report editors

Validated on 30 October 2026 in the existing core worktree
`/home/ubuntu/.t3/worktrees/redbox-portal/t3-c15c01bd`. Branch:
`stack/schema-assist-09-client-hook-validation`, created from
`stack/schema-assist-08-scu-validation` at `f580976c9765142bc6a21c1f112abe9141063b5d`.
UoN hook: `/home/ubuntu/work/bitbucket/redbox-hook-uon`, `feature/v5-refactor`,
`1c1fec1144d3638dacb5ce2006c5aede610e9d8e`. No tracked hook files changed.
No subagents were started and nothing was pushed.

## Running environment and reproduction

The **UoN stack is left running** at
<http://nam-oci-agent-2.tail4a7c3.ts.net:1539>.

| Purpose | Path / account |
| --- | --- |
| Login | `/default/rdmp/user/login`; `admin` / `rbadmin` |
| Named queries | `/default/rdmp/admin/named-query` |
| Report configuration | `/default/rdmp/admin/reports` |
| Saved validation report | `/default/rdmp/admin/report/uonRdmpDateReport` |
| Email templates | `/default/rdmp/admin/email-templates` |
| Report-only account | `uon-report-author` / `UONreport123!` |

`tailscale status --json` identified `Self.DNSName` as
`nam-oci-agent-2.tail4a7c3.ts.net.`. Both `sails_appUrl` and
`REDBOX_PORTAL_APP_URL` use that name without the trailing dot and host port
1539. T3 Browser loaded the required login URL and authenticated the dev admin
with visible `Welcome Local Admin` before screen testing.

The hook's own Dockerfile target built successfully, so rebuilding the older
SCU Playwright image was unnecessary:

```bash
cd /home/ubuntu/work/bitbucket/redbox-hook-uon
timeout 1800 docker build --target redbox-hook-uon \
  -t redbox-hook-uon:sa09-core-mount .
```

The hook README and `support/development/{prepare-core-mount.sh,core-mount.env,
docker-compose.core-mount.yml}` supplied the core-mount pattern. The checked-in
`core-mount.env` points to a developer's macOS checkout; the local wrapper
overrides it explicitly. Existing core dependencies/builds were reused, and
the host hook was compiled with Node 24.22.1. SCU's ignored tooling was adapted
under **`.tmp/schema-assist-09-uon/`**, which remains available on this worker.
The exact start and stop commands, from the core worktree, are:

```bash
cd /home/ubuntu/.t3/worktrees/redbox-portal/t3-c15c01bd
timeout 600 bash .tmp/schema-assist-09-uon/compose.sh up -d --no-build rbportal

# Stop, keeping database and view volumes:
timeout 180 bash .tmp/schema-assist-09-uon/compose.sh stop

# Remove this stack and its data when finished exploring:
timeout 180 bash .tmp/schema-assist-09-uon/compose.sh down -v --remove-orphans
```

`compose.sh` exports `REDBOX_PORTAL_PATH` to this worktree and both app-URL
variables to the Tailscale URL. It runs Docker Compose project `sa09-uon` with
the hook's `support/development/docker-compose.yml`, its core-mount override,
and this worktree's `.tmp/schema-assist-09-uon/uon.override.yml`.

| Service | Image | Memory limit | Ports |
| --- | --- | --- | --- |
| `sa09-uon-rbportal-1` | `redbox-hook-uon:sa09-core-mount` | 3 GiB; Node heap 2 GiB | 1539 → 1500 |
| `sa09-uon-mongodb-1` | `mongo:latest`, verified **9.0.4** | 768 MiB; WiredTiger 0.25 GiB | 127.0.0.1:27549 → 27017 |
| `sa09-uon-solr-1` | `solr:8.11.1` | 768 MiB; heap 384 MiB | no host port |

The override mounts this worktree's compiled core packages, Angular bundles,
styles and `.tmp/public`. Its launcher copies core views followed by hook views
into a separate writable views volume, then bootstraps UoN data and assets.
It does not overwrite tracked core views. These are the new full-page query
and report workspaces, not the image's older modal. Real boolean CSRF is
enabled. Email sending and external RVA imports are disabled; SeaweedFS is
behind an unused attachments profile. Figshare migration uses the hook's
development setting. No external publishing integrations were exercised.

Core and hook translation defaults must be recursively merged. Copying only
the hook's English file loses the new core editor labels. The local merged
`language-defaults/` and runtime bootstrap correct this setup issue.

After the runtime table fix, the shared Angular library and affected report
application were built serially in production mode, copied to public assets,
and the portal restarted. The core TypeScript package was also compiled after
the label fix. `build-angular.sh` remains available for a full serial rebuild
of the six validation apps. A portal restart after any Angular rebuild is
required because bundle hashes are cached at lift:

```bash
timeout 240 env PATH=/home/ubuntu/.nvm/versions/node/v24.22.1/bin:$PATH \
  NODE_OPTIONS=--max-old-space-size=3072 \
  node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json
timeout 2400 bash .tmp/schema-assist-09-uon/build-angular.sh
timeout 120 bash .tmp/schema-assist-09-uon/compose.sh restart rbportal
```

T3 Browser was used first. Its report interactions failed twice with
`click timed out` / `invalid selector`, so browser testing continued in fallback
Chromium. The agent-browser daemon was unreliable on this ARM64 worker;
Playwright over CDP drove that same Chromium successfully. Local reproducible
steps are `run-ui.cjs` plus `query-probes.cjs`, `report-noops.cjs`,
`runtime-parity.cjs`, `author.cjs`, `author-all.cjs`, `author-runtime.cjs`,
`email.cjs`, and `layout.cjs`. Browser
transport, downloads and temporary profile were cleaned up after testing.

## Data

Hook bootstrap ingestion loaded **888 funders, 1,265 ROR organisations and 12
people** through the real application. The local `seed.cjs` added 168 varied
research records:

| Type | Records | Stages |
| --- | --- | --- |
| RDMP | 114 | 38 each draft, active, retired |
| Data record | 24 | draft |
| Data publication | 30 | 6 each draft, queued, published, retired, legacy embargoed |

The bulk records use actual UoN bootstrap people and funders, Hunter/Newcastle
research titles, institutional names and emails, contributor/supervisor/creator
arrays, FOR/SEO codes, grants, ISO dates across 2025–2026, storage/access values,
and namespaced fields including `uon:ethicsApprovalStatus`,
`uon:partnerInstitutions` and `uon:extendedRetentionReasons`. Empty arrays,
missing fields and long labels/values are intentional. IDs start `sa09-` and
metadata is marked `validationFixture: schema-assist-09-uon`.

Bulk fixtures were inserted directly into MongoDB for controlled volume and
missing-value coverage; they bypass record hooks and Solr indexing. Separately,
a real POST to `/default/rdmp/recordmeta/rdmp` created RDMP
`b43ca4f0cea5444b96116670998e2310`, titled
`Hunter estuary citizen-science survey — API-created UoN validation plan`.
UoN hooks populated investigator defaults and normalized a contributor's
institution to `University of Newcastle Australia` (`api-create.json`).
There are **169 validation research records, 2,334 records overall**. The new
query returns 115 RDMPs; its bounded preview returns 100 rows.

```bash
timeout 90 node .tmp/schema-assist-09-uon/seed.cjs
timeout 90 node .tmp/schema-assist-09-uon/validate.cjs
timeout 30 node .tmp/schema-assist-09-uon/snapshot.cjs final
```

## Named-query editor

All eight UoN bootstrap queries opened individually in the UI. Their raw Mongo
JSON was toggled to the guided view and back and each was no-op saved. All
**11 original stored query definitions** remain byte-identical after excluding
database identity, branding/key and lifecycle timestamps. This comparison
includes original serialized JSON strings and their formatting, not just
parsed semantic equality (`baseline.json`, `query-noop.json`, `final.json`).

| Bootstrap query | Real rows found | Preview behavior |
| --- | ---: | --- |
| `listDPRecords` | 30 | Native Mongo preview |
| `listDRRecords` | 24 | Native Mongo preview |
| `listEmbargoedDPRecords` | 6 | Native Mongo preview; stage guidance advisory |
| `listFundingBodies` | 888 | Explicit 100-row truncation |
| `listPartiesPeople` | 12 | Native Mongo preview |
| `listRDMPRecords` | 115 | Explicit 100-row truncation |
| `listRORRecords` | 1,265 | Explicit 100-row truncation |
| `listUsers` | — | Structured `PREVIEW_DEADLINE_UNSUPPORTED` refusal; zero rows |

Every bootstrap definition validates without blocking errors. Exact,
unparameterized type constraints infer guidance. Unsaved `$in` multi-type and
parameterized-type probes infer none. Selecting RDMP active-stage guidance
left raw Mongo JSON unchanged. No implicit type predicate was added; the new
query used the explicit **Add type constraint** action.

All 11 advertised type/stage combinations returned HTTP 200:

- RDMP draft/active/retired: 107 fields each.
- Data record draft: 40 fields.
- Data publication draft/queued/published/retired: 72 fields each.
- ROR draft: 35 fields.
- Party and funding: one runtime root, precision `none`, because no effective
  form schema is available.

Form-backed guidance is correctly marked `form-config` / `partial`. Reusable
form fields and namespaced UoN fields are present; missing schema coverage does
not block valid custom configurations. The literal label fix makes **Funding
source** and colon/dot translation keys readable and searchable.

Insertion was checked against actual form fields:

| Location | Inserted value |
| --- | --- |
| Condition, sort, parameter and related local path | `metadata.uon:ethicsApprovalStatus` |
| Related foreign path, explicitly using publication guidance | `metadata.license_identifier` |
| Direct result mapping | `record.metadata["uon:ethicsApprovalStatus"]` |
| Handlebars result mapping | `{{record.metadata.[uon:ethicsApprovalStatus]}}` |

Created and saved **`uonRdmpDateRange`** through the UI, with an explicit RDMP
constraint, `createdAfter` / `createdBefore` ISODate bindings and five mappings:
project title, ethics status, contributors, creation date and funding arrays.
Its preview preserves mapped output shape and returns realistic rows.

An unsaved `$where` probe is refused with `PREVIEW_UNSAFE_DEFINITION` and no
rows. A bounded 15 KB-per-row Handlebars mapping returns 33 rows with explicit
`rows` and `bytes` truncation reasons. Neither probe was saved. Evidence:
`query-probes.json`, `api-probes.json`, `new-query-ui.json`,
`bootstrap-results.json`.

## Report editor and runtime parity

All five bootstrap reports opened, loaded their query parameters/output
descriptions and no-op saved: `dataPublications`, `dataRecords`,
`embargoedDataPublications`, `rdmpRecords` and `user`. All five original stored
definitions remain byte-identical (`report-ui-noops.json`, `report-noop.json`,
`final.json`). Valid real configurations produce no blocking errors.
Previews find 30, 24, 6, 115 and 1 rows respectively. The existing user-report
compatibility path explicitly reports `deadlineEnforced: false`.

Created and saved **`uonRdmpDateReport`** entirely through the UI:

- Five columns added from selected mapped outputs, with long UoN labels.
- A date-range filter binds `created_fromDate` / `created_toDate` to the query's
  `createdAfter` / `createdBefore` parameters.
- Preview dates 1 January–30 June 2026 select **30 records**.
- Separate display/CSV templates format dates as `dd/MM/yyyy` versus ISO.
- Contributor and funder arrays render per-item templates, including empty
  arrays and absent values. Display and CSV intentionally contain different
  contributor formatting.
- Keyboard autocomplete works in both display and CSV template editors.
- Dismissing Cancel preserves the unsaved report draft.

The actual report page was filtered to the same dates and all three result
pages inspected. **All 30 records and 150 display cells match preview**
(whitespace normalized for DOM text). The real CSV download contains 30 rows;
**all 150 CSV values match preview exactly**, including intentional trailing
spaces. This exposed and then verified the missing-multivalue runtime fix.
Evidence: `new-report-preview.json`, `runtime-parity.json`,
`uonRdmpDateReport.csv`, screenshot `09-runtime-report-desktop.png`.

The separate `UONReportAuthor` role grants report configuration/runtime routes
only. In an isolated browser context its user loaded the full report workspace,
query descriptions and previews, saved a title change, reloaded it and restored
the original. **Manage named queries** is absent. Named-query page/list/schema
discovery and email page/catalogue all return 403 (`author.json`). The role
also opened, previewed and no-op saved **all five bootstrap reports**;
the original definitions remained byte-identical (`author-all.json`). Its real
report page returned the same 30 filtered rows, and its CSV response was
byte-identical to the admin's downloaded CSV (`author-runtime.json`). The default
post-login researcher landing page also returns 403 for this deliberately
minimal role; open `/default/rdmp/admin/reports` directly after login. The final
automated role run established the session through local authentication before
opening that allowed page.

## Email template editor

The UoN Handlebars **`uonAnnualRdmpReminder`** and publication template entries
open. The annual reminder's supplied body uses `title` and `recordUrl`.
Selecting the API-created RDMP supplies the real record/title but cannot infer
the custom hook's separate `recordUrl` input. The editor accurately reports
the missing value. Adding `recordUrl: record.viewUrl` to Context JSON reproduces
the custom send input and the supplied template previews successfully.

On that UoN template, keyboard completion inserted `record.metadata.title`;
a draft containing the real title and `uon:ethicsApprovalStatus` rendered
successfully in the sandboxed iframe with no blocking diagnostics. Draft
autosave, full-page reload and stored content were verified. The test draft was
discarded; **no template was published and no email was sent**. Desktop and
390 px layouts were exercised. Evidence: `email-initial.json`, `email-ui.json`,
screenshots `13-`, `14-`, `15-` below.

## Core fixes and regression verification

1. **`bc55c1539` — literal form translation keys.**
   `packages/redbox-core/src/services/FieldDescriptionsService.ts` now disables
   i18next namespace/key separators when translating literal form label keys,
   matching Angular's literal-key behavior. Before the fix,
   `@dmpt-foaf:fundedBy_foaf:Agent` became `fundedBy_foaf.Agent`; label search
   failed. One new `FieldDescriptionsService.test.ts` regression uses real
   i18next to cover colon and dotted keys plus a missing key. It failed before
   the change and passes after it; live label search also passes.
2. **`7e5d65343` — absent multivalue report cells.**
   `angular/projects/researchdatabox/portal-ng-common/src/lib/record-table.component.ts`
   now renders missing/null/non-iterable multivalue data as an empty cell,
   matching server preview behavior, while preserving arrays and legacy
   string iteration. Previously a missing funder field on page 2 stopped
   Angular rendering later rows. Seven new component cases cover missing,
   null, object, numeric and empty-array values, item context and legacy strings.
   Four cases fail before the fix; all pass after it. Live pagination and CSV
   parity pass after the production rebuild/restart.

Final relevant suites: **387 Mocha passing, 3 pending; 11 Angular passing**
(398 passing overall, eight new regression cases). The 282-case focused Mocha
run covers query/report services, field descriptions, assistance/view
controllers, query editors, email templates and email schema assistance. A
separate 105-case run covers real Mongo query/report assistance, preview,
context, date and CSV contracts against this Docker Mongo on port 27549.
Three Mongo failpoint tests are pending because failpoints are not enabled on
the development server. The earlier 238-case baseline is not counted again.
Angular includes the seven new table cases and four existing report-service
cases. Core TypeScript compilation, shared-library/report production builds,
scoped oxlint and `git diff --check` pass. Existing Angular CommonJS/bundle-size
warnings remain; no dependency versions changed.

Logs retained locally: `/tmp/schema-assist-09-regression-final.log`,
`/tmp/schema-assist-09-contract-specs.log`, `/tmp/schema-assist-09-table-before.log`,
`/tmp/schema-assist-09-table-after.log`, the label failure log and affected build
logs. Unit suites run with Node 24.22.1 and native Mongo contract tests point to
`mongodb://127.0.0.1:27549`. Example affected Angular command:

```bash
cd angular
timeout 240 env PATH=/home/ubuntu/.nvm/versions/node/v24.22.1/bin:$PATH \
  NODE_OPTIONS=--max-old-space-size=3072 NG_BUILD_MAX_WORKERS=1 CI=true \
  CHROME_BIN=/snap/bin/chromium node_modules/.bin/ng test \
  @researchdatabox/portal-ng-common --watch=false \
  --browsers=ChromeHeadlessNoSandbox \
  --include='**/record-table.component.spec.ts' \
  --include='**/report.service.spec.ts'
```

## Performance, visual observations and open issues

On this 2-CPU/12-GiB worker, final native query previews took **39–611 ms**,
record-report previews **99–1,184 ms**, and stage field descriptions **42–533
ms**, measured at the HTTP client. The user-query refusal took 27 ms and its
report compatibility preview 44 ms. These are observed single-request timings,
not concurrency/load benchmarks. No hang or memory-limit exit occurred.

Query and report workspaces were checked at **1440 and 390 px** with real long
titles, field labels and values. Both fit the page width; controls wrap and
sticky action buttons remain usable. Screenshots are in
**`/tmp/schema-assist-09-uon-screenshots/`**:

| Evidence | Screenshot files |
| --- | --- |
| Required URL and admin authentication | `00-login.png`, `01-authenticated.png` |
| Bootstrap report | `02-bootstrap-report-desktop.png` |
| Original new-query/report previews and narrow long results | `03-` through `06-` |
| Literal label before / after | `07-before-funding-label.png`, `08-before-funding-label-search.png`, `10-after-funding-label-search.png` |
| Runtime after fix / failure before fix | `09-runtime-report-desktop.png`, `11-runtime-pagination-incomplete.png` |
| Report-only author | `12-report-only-author.png`, `18-report-only-bootstrap-rdmp.png`, `19-report-only-runtime.png` |
| UoN email draft / narrow / missing custom context | `13-uon-email-desktop.png`, `14-uon-email-narrow.png`, `15-uon-email-custom-context-warning.png` |
| Final workspace layouts, asserted viewport widths | `16-query-1440.png`, `16-query-390.png`, `16-report-1440.png`, `16-report-390.png` |
| Legacy runtime report at phone width | `17-runtime-report-390.png` |

Open UX/diagnostic issues, deliberately not redesigned here:

- **Legacy runtime report overflow:** at a 390 px viewport, long columns expand
  the document to 450 px. The new workspaces fit; the existing results table
  needs its own small-screen treatment (`17-runtime-report-390.png`).
- **Long vertical navigation/results on mobile:** the expanded UoN admin sidebar
  precedes the workspace, and many result rows or the email body editor require
  considerable scrolling (`04-`, `06-`, `14-`, `16-query-390.png`).
- **Advisory noise on valid configurations:** computed ROR lookup fields and
  user mappings are outside partial guidance; hidden/template-only
  `reportExternalURL` columns warn despite functioning templates; an RDMP
  supervisor column's implicit-array property warns while its indexed template
  works; the new valid bracket-literal ethics mapping gets `UNKNOWN_FIELD` in
  report preview. The embargo query also warns about `workflow.stage`. None
  blocks saving/running, but authors must distinguish these from actual errors.
- **Custom email context:** the annual reminder requires manually supplying
  `recordUrl` in preview. The warning is accurate; hook-provided preview context
  or explanatory help would make this smoother (`15-`).

## Hook-side observations and limits

- UoN ships legacy `publicationPublished.ejs`, `publicationReview.ejs` and
  `crateitHarvested.ejs`. The publication IDs display core Handlebars defaults
  in the editor; UoN's EJS-specific content is not their editable default.
  `crateitHarvested` is absent from the catalogue and returns
  `404 UNKNOWN_TEMPLATE`. These legacy templates need hook migration/review.
- The bootstrap embargo query/report selects `workflow.stage: embargoed`, but
  UoN's current publication workflow advertises only draft, queued, published
  and retired. Historical embargoed fixtures demonstrate the report, but the
  editor correctly cannot offer that stage as current form guidance.
- Most volume fixtures bypass hooks and Solr; only the additional API-created
  RDMP demonstrates UoN's create-hook chain. Full browser form entry and every
  workflow transition were not repeated; the task focused on editor contracts
  against effective UoN forms and realistic stored shapes.
- External Figshare/DOI/RVA/attachment operations, actual annual-reminder sends,
  email publish/history lifecycle, all bootstrap reports' individual runtime
  CSV exports, and production concurrency were not exercised. No external
  credentials or sending were needed for this editor validation. Real runtime
  display/CSV parity was checked comprehensively on the new five-column report.

## Cleanup and resources

Heavy builds/tests ran serially with external `timeout`; memory and disk were
checked throughout. The unrelated `redbox-5025-*` containers were left alone.
No failed-attempt portal containers remain. Only this run's three healthy UoN
containers, its network, active Mongo/views/Solr volumes and required images
remain. There are no dangling images. New reclaimable builder cache was
pruned; temporary browser/download state, obsolete logs and intermediate
Angular test/build cache were removed. Local scripts, meaningful test evidence,
compiled assets and screenshots are retained so the running stack is usable.

Root disk before: **77 GiB total, 56 GiB used, 22 GiB available (73%)**.
Root disk after cleanup: **77 GiB total, 55 GiB used, 22 GiB available (72%)**
(rounded `df -h` values; removing the disposable Angular cache reclaimed about
501 MiB). Docker storage on the separate `/dev/sdb` filesystem finishes at
**118 GiB total, 55 GiB used, 57 GiB available (50%)**. Its first observation was
after the image build, so no pre-build disk delta is claimed for it.
Final host memory: 11 GiB total, 5 GiB used, 6 GiB available. Container memory
was approximately **706 MiB portal, 188 MiB Mongo, 542 MiB Solr**, each within
its configured cap. The Tailscale login URL still returns HTTP 200.
