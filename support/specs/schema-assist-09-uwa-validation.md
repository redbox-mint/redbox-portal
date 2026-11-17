# UWA validation of the schema-assisted query and report editors

Validated on 30 October 2026, working only in the existing core worktree
`/home/ubuntu/.t3/worktrees/redbox-portal/t3-c15c01bd`, on
`stack/schema-assist-09-client-hook-validation`, starting at
`5cafd962852abc15e2b8965bab84bdfff520bf53`.
The UWA hook is `/home/ubuntu/work/bitbucket/redbox-hook-uwa`, branch
`feature/v5-refactor`, commit `6ab15f1f337996d39f6f263d40d86a410e61f743`.
No tracked hook files changed. No subagents, new worktrees or pushes were used.

The UWA editor stack works with its real effective forms and 187 realistic
validation records. One core persistence bug was fixed in commit `13c7eacea`.
The remaining issues below are advisory/UX findings or hook configuration
issues. Both UWA and UoN are left running.

## Environment and reproduction

UWA is available at <http://nam-oci-agent-2.tail4a7c3.ts.net:1540>.
`tailscale status --json` supplied `nam-oci-agent-2.tail4a7c3.ts.net.`;
`sails_appUrl` and `REDBOX_PORTAL_APP_URL` use the name without its final dot,
with the published host port 1540. The required login page loaded and the dev
admin authenticated through the visible local login form, with
`Welcome Local Admin` verified before testing.

| Purpose | URL path / account |
| --- | --- |
| Login | `/default/rdmp/user/login`; `admin` / `rbadmin` |
| Named queries | `/default/rdmp/admin/named-query` |
| Report configuration | `/default/rdmp/admin/reports` |
| Saved validation report | `/default/rdmp/admin/report/uwaRdmpDateReport` |
| Email templates | `/default/rdmp/admin/email-templates` |
| Report configuration role | `UWAReportAuthor` |
| Restricted test account | `uwa-report-author` / `UWAreport123!` |

Read the main editor spec, SCU/UoN validation reports, global/project
`AGENTS.md`, hook README and `support/development/` core-mount/notifications
instructions. The previous ignored tooling was adapted under
**`.tmp/schema-assist-09-uwa/`**. It remains available on this worker, including
the compose wrapper/override, serial Angular build helper, seeder, snapshots,
API assertions, UI probes and evidence JSON. It is not committed.

The hook's Dockerfile target built successfully:

```bash
cd /home/ubuntu/work/bitbucket/redbox-hook-uwa
timeout 1800 docker build --target redbox-hook-uwa \
  -t redbox-hook-uwa:sa09-core-mount .
```

The host hook was compiled with its `npm run compile` script and Node 24.22.1.
Its installed core dependencies were stale, so temporary package links pointed
to the supplied core worktree for compilation; the original dependency
directories were restored afterward. The hook's tracked tree remains clean.
The local wrapper overrides the developer-specific path in `core-mount.env`.

Exact start/stop commands:

```bash
cd /home/ubuntu/.t3/worktrees/redbox-portal/t3-c15c01bd

# UWA: start/reuse its database and portal; no rebuild:
timeout 600 bash .tmp/schema-assist-09-uwa/compose.sh up -d --no-build rbportal
# Stop UWA while keeping its volumes:
timeout 180 bash .tmp/schema-assist-09-uwa/compose.sh stop

# UoN: left running throughout this validation:
timeout 600 bash .tmp/schema-assist-09-uon/compose.sh up -d --no-build rbportal
timeout 180 bash .tmp/schema-assist-09-uon/compose.sh stop

# Eventual UWA teardown, only when its data is no longer needed:
timeout 180 bash .tmp/schema-assist-09-uwa/compose.sh down -v --remove-orphans
```

`compose.sh` runs project `sa09-uwa` with the hook's development compose file,
its core-mount override and `.tmp/schema-assist-09-uwa/uwa.override.yml`.

| Service | Image | Limits | Ports |
| --- | --- | --- | --- |
| `sa09-uwa-rbportal-1` | `redbox-hook-uwa:sa09-core-mount` | 3 GiB; Node heap 2 GiB; 1.25 CPU | 1540 → 1500 |
| `sa09-uwa-mongodb-1` | `mongo:latest`, verified **9.0.4** | 768 MiB; WiredTiger 0.25 GiB | 127.0.0.1:27550 → 27017 |
| `sa09-uwa-solr-1` | `solr:8.11.1` | 768 MiB; heap 384 MiB | no host port |

The launcher copies core views followed by UWA views into a project-specific
views volume. Compiled core packages, this worktree's Angular assets and core
styles are mounted, including both bundle-hash discovery and public paths.
The UWA public directory is separate from UoN's. Core and UWA translations are
recursively merged so the new labels resolve. Screenshots show the full-page
workspaces with the UWA theme, rather than the image's old modal editor.

Boolean CSRF protection is enabled. External RVA imports are disabled and
SeaweedFS is behind an unused attachments profile. The hook's notification
mock is preloaded, with email enabled and capture written to
`.tmp/schema-assist-09-uwa/capture/messages.jsonl`; no SMTP server is contacted.

Core TypeScript was compiled after the fix, then the UWA portal restarted.
No frontend source changed, so the supplied production Angular builds were
reused. For a future frontend change, build serially and restart the portal
because bundle hash filenames are cached at lift:

```bash
timeout 240 env PATH=/home/ubuntu/.nvm/versions/node/v24.22.1/bin:$PATH \
  NODE_OPTIONS=--max-old-space-size=3072 \
  node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json
timeout 2400 bash .tmp/schema-assist-09-uwa/build-angular.sh
timeout 120 bash .tmp/schema-assist-09-uwa/compose.sh restart rbportal
```

T3 Browser performed the initial login, every admin bootstrap query/report
open and no-op save, query creation, report creation and real report/CSV
checks. Repeated parameter-picker clicks returned
`Preview automation click timed out after 15000ms`; remaining UI assertions
used fallback Chromium via CDP, driven by Playwright, alongside agent-browser.
Its temporary browser/profile and the agent-owned T3 tab were closed at the
end. This was a browser transport/locator problem, not a portal failure.

## Data

The controlled bulk fixture set contains **186 records**, plus one plan
created through the real record API, for **187 records overall**:

| Record type | Bulk count | Workflow stages |
| --- | ---: | --- |
| `rdmp` | 114 | draft, active, archived: 38 each |
| `dataRecord` | 30 | in-progress, draft, archived: 10 each |
| `servicenow-catalog` | 18 | draft, provisioning, provisioned: 6 each |
| `party` | 6 | draft |
| `activity` | 6 | draft |
| `fundingBody` | 6 | draft |
| `organisation` | 6 | draft |

The data uses Swan–Canning, Ningaloo, Noongar, Murchison and Wheatbelt research
topics; UWA schools/institutes; synthetic institutional people and emails;
investigator, administrator and funding arrays; FOR/SEO codes; grant numbers;
2025–2026 creation/modification dates; project dates; storage requests; and
UWA classification fields. Empty arrays, missing descriptions/funding and
missing classification values are intentional. IDs start `sa09-uwa-` and
metadata contains `validationFixture: schema-assist-09-uwa`.

`seed.cjs` inserts bulk records directly into `redbox-storage.record` for
repeatable volume and missing-value coverage. Those records bypass hooks and
Solr indexing. Separately, POSTing raw metadata to
`/default/rdmp/recordmeta/rdmp?targetStep=active` created
**`638934e9174c4999b805e17defe126aa`**, titled
`Swan estuary community seagrass survey — API-created UWA validation plan`.
Real hooks assigned **P000002**, retained active stage and populated the
successful staff/cultural notification state/logs. Two notifications were
captured locally, addressed to the fixture CI, investigator and administrator.
The staff email links to port 1540; the cultural body matches the supplied
template after normalizing nonbreaking spaces (`notification-evidence.json`).
An initial incorrectly nested API payload was removed through the real
delete/destroy endpoints and is excluded from all counts.

```bash
timeout 90 node .tmp/schema-assist-09-uwa/seed.cjs
timeout 90 node .tmp/schema-assist-09-uwa/validate.cjs
timeout 45 node .tmp/schema-assist-09-uwa/extra-api.cjs
timeout 30 node .tmp/schema-assist-09-uwa/snapshot.cjs final
timeout 30 node .tmp/schema-assist-09-uwa/compare.cjs final
```

## Named-query editor

All **nine UWA bootstrap queries** opened individually. Each raw Mongo JSON
definition was toggled guided → raw → guided → raw, checked for semantic
equality and no-op saved. After the fix, all **12 original stored query
definitions**, including three additional core defaults, are byte-identical
to the baseline after excluding database identity, branding/key and lifecycle
timestamps. Serialized JSON and its formatting are compared, not merely its
parsed value (`query-ui-noops.json`, `final.json`, `noop-comparison.json`).

| UWA bootstrap query | Rows | Preview result |
| --- | ---: | --- |
| `listActivities` | 6 | Native Mongo preview |
| `listDRRecords` | 30 | Native Mongo preview |
| `listFundingBodies` | 6 | Native Mongo preview |
| `listOrganisations` | 6 | Native Mongo preview |
| `listParties` | 6 at runtime | Safe preview refuses legacy array-valued mappings; hook issue below |
| `listRDMPProjectWithEndingDate` | 38 with realistic bounds | Native Mongo preview; empty/default parameters match zero |
| `listRDMPRecords` | 115 | Explicit 100-row truncation |
| `listUsers` | — | Structured `PREVIEW_DEADLINE_UNSUPPORTED` refusal, zero rows |
| `listWorkspaceRecords` | 18 | Native Mongo preview |

All definitions pass authoring validation without blocking errors. The date
probe supplies `projectEndDateStart=2026-10-01` and `projectEndDateDays=90`.
The user-query report compatibility path remains usable despite its stricter
named-query preview refusal.

Exact unparameterized type predicates infer type guidance. User queries and
the workspace query, which constrains `metaMetadata.packageType`, infer none.
Unsaved multi-type `$in` and parameterized-type probes infer none. Type-only
UI guidance has an inferred type label and no explicit stage selection;
choosing a stage changes assistance only. API field descriptions resolve an
effective stage and disclose partial coverage. No workflow-stage predicate
inference is claimed. Switching draft → active guidance left raw Mongo bytes
unchanged; the new query used the explicit **Add type constraint** action.

All **14 advertised type/stage combinations** returned HTTP 200:

| Type/stages | Fields per stage | Precision / completeness |
| --- | --- | --- |
| RDMP draft/active/archived | 85 / 85 / 85 | form-config / partial |
| Data record in-progress/draft/archived | 65 / 65 / 65 | form-config / partial |
| ServiceNow draft/provisioning/provisioned | 32 / 34 / 34 | form-config / partial |
| ServiceNow not-provisioned | 1 runtime root | none / unavailable |
| Organisation draft | 9 | form-config / partial |
| Party/activity/fundingBody draft | 1 each | none / unavailable |

UWA namespaced fields such as
`metadata.uwa-rdmp-data-classification-item-outcome` and its details are
present. Label search finds **Funding source**. Missing effective forms do
not prevent manual query editing. Field counts above exclude the separately
provided envelope-field list.

Created and saved **`uwaRdmpDateRange`** through the UI. It selects RDMPs,
sorts by `dateCreated ASC`, accepts inclusive ISO-date `createdAfter` /
`createdBefore` parameters, and maps project title, UWA classification,
investigators, creation date and funding arrays. Preview found 115 real plans,
returned 100 and clearly disclosed row truncation with no diagnostics.

Insertion assertions covered condition, parameter, sort, local related-filter,
foreign related-filter and result-mapping locations. Foreign guidance used
the data-record form independently of local RDMP guidance:

| Location | Inserted value |
| --- | --- |
| Condition / parameter / sort / local filter | `metadata.uwa-rdmp-data-classification-item-outcome` |
| Foreign data-record filter | `metadata.ethics-data-classification` |
| Direct mapping | `record.metadata.uwa-rdmp-data-classification-item-outcome` |
| Handlebars mapping | `{{record.metadata.uwa-rdmp-data-classification-item-outcome}}` |
| Colon-key direct mapping | `record.metadata["foaf:fundedBy_foaf:Agent"]` |
| Colon-key array template | `{{#each record.metadata.[foaf:fundedBy_foaf:Agent]}}` … `{{/each}}` |

Probe changes were discarded. `$where` refused execution with
`PREVIEW_UNSAFE_DEFINITION` and zero records. A large rendered mapping produced
explicit byte/row truncation. Evidence: `new-query-ui.json`,
`query-probes.json`, `api-probes.json`, `extra-api.json`,
`final-query-preview.json`; screenshots `20-query-preview-1440.png` and
`20-query-preview-390.png`.

Nonblocking diagnostic noise was recorded rather than changing the UI:
partial organisation guidance lacks computed lookup fields;
`workflow.stage`, `notification` and `metaMetadata.packageType` are outside
the advertised guidance; user mapping fields lack precise source guidance.
These are false-positive/noisy advisories, not invalid Mongo definitions.
Literal-looking legacy strings such as `Research Activities`/`People` also
receive unknown-path warnings. Those warnings reflect current execution:
plain mapping strings are lookups and the corresponding `repository_name`
output is absent. That is a hook definition issue, rather than a false alarm.

## Report editor and real execution

All **four UWA bootstrap reports** opened, loaded query/output descriptions,
previewed and no-op saved as both admin and the restricted report author.
All four original stored report definitions remain byte-identical to the
baseline. There were no blocking validation errors.

| Report | Preview total | Notes |
| --- | ---: | --- |
| `dataRecords` | 30 | Hidden URL column advisory only |
| `rdmpRecords` | 115 | Bounded 100-row preview; hidden URL / array lookup advisories |
| `user` | 1 initially; 2 after provisioning report author | Existing user report compatibility path succeeds |
| `workspaces` | 18 | Template-only URL columns and package-type guidance advisories |

Some advisory column warnings are noisy: hidden `reportExternalURL` columns
derive their value entirely from export templates; user envelope properties
are absent while display templates read `metadata.*`; administrator lookup
uses an explicit index in its template even though the configured property
traverses an array. Preview and runtime templates remain usable. Definitions
were preserved (`report-ui-noops.json`, `author-all.json`).

Created **`uwaRdmpDateReport`** in the editor, selected `uwaRdmpDateRange`,
added five output columns, assigned long realistic UWA labels and configured:

- A date-range input bound separately to `createdAfter` and `createdBefore`.
- Display and CSV templates, including bold project titles and formatted dates.
- Multivalue investigator names for display and names/emails for CSV.
- A second multivalue column for Australian research funders.
- Keyboard ArrowDown/Enter completion in both display and CSV template inputs.

Preview with **1 January–30 June 2026** returned **30 records / 30 rendered
rows / five columns**, with success, valid=true and no diagnostics. Missing
values and empty arrays render cleanly. Dismissing the cancel confirmation
retained the unsaved report before its successful save.

The real report page was filtered with the same dates. All three runtime
pages were collected and compared with the editor preview:

- All **30 records** match, including their order.
- All **150 display cells** match after DOM whitespace normalization.
- The real downloaded CSV has **30 rows / 150 values**, matching preview
  export strings exactly, including trailing spaces and multivalue output.

This verifies display/CSV parity against each template's intended rendering;
display and CSV intentionally use different date and contributor formats.
Evidence: `new-report-preview.json`, `runtime-browser.json`,
`runtime-parity.json`, `uwaRdmpDateReport.csv`; screenshots
`05-report-preview-1440.png`, `06-report-workspace-390.png`,
`07-runtime-report-1440.png`, `17-runtime-report-390.png`.

## Report-config-only role

The local role grants report configuration, query-description, runtime and
CSV routes only, without query/email administration or general record access.
Tests used a separate browser context with the restricted account.

All four bootstrap reports opened, previewed successfully and no-op saved.
The new report's title was changed, saved, reopened and restored. Output
fields/parameters were available and **Manage named queries** was absent.
The real runtime filter returned 30 rows; its first page matched admin and
its entire CSV was byte-identical to the admin export.

The named-query page, query list API and schema-target API, plus the email
editor and catalogue API, all returned **403**. Evidence: `author.json`,
`author-all.json`, `author-runtime.json`; screenshots
`12-report-only-author.png`, `18-report-only-bootstrap-rdmp.png`,
`19-report-only-runtime.png`.

## Email template editor and UWA notifications

All **seven supplied UWA templates** opened and their editor bodies matched
the hook files: `culturalSensitivity`, `externalStorageExemption`,
`hdrProjectEndApproaching90`, `hdrRdmpCreated`, `projectEndApproaching28`,
`sanctionedCountry` and `staffRdmpCreated`.

Each rendered with the real API-created plan, showed RDMP active form guidance
and reported **No problems found**. The staff template's portal link uses the
correct Tailscale host/1540 and actual record ID. Subject keyboard completion
resolved `record.metadata.title`. A temporary body using UWA's classification
field previewed `CONFIDENTIAL`; its sandboxed iframe, enabled publish state,
autosave, reload and draft persistence were verified. The draft was discarded
without publishing. Final API checks confirm **no live overrides or drafts**
for any of these seven templates. No additional notifications were sent by
editor testing; the capture still contains the two real create-hook messages.

Evidence: `email-ui.json`, `notification-evidence.json`, capture JSONL;
screenshots `13-email-preview-1440.png`, `14-email-editor-390.png`,
`21-email-default-preview-1440.png`, `21-email-default-preview-390.png`.

## Core fix and automated verification

**Bug:** a no-op save of UWA's legacy `listUsers` query changed its stored
`brandIdFieldPath` from `branding` to an empty string. This violated the
byte-preservation contract even though runtime user scoping is resolved
independently through roles.

**Fix:** `packages/redbox-core/src/services/NamedQueryService.ts` preserves
the existing scope metadata only when both collection and submitted path are
unchanged. Edited paths and collection switches still use the canonical
server-resolved scope. Execution continues to resolve user access through
roles. No new client control over execution scope was introduced.

`packages/redbox-core/test/services/NamedQueryService.test.ts` adds **four
regressions**: legacy user no-op preservation, ignored forged scope for user,
ignored forged scope when switching to record, and canonical scope recomputed
when switching collections with the original legacy path. The preservation
case failed before the fix. Browser save and final database snapshots confirm
the corrected behavior. Commit: **`13c7eacea`**.

Verification completed serially, with external timeouts and Node 24:

| Check | Result |
| --- | --- |
| Core TypeScript compilation | Passed |
| Scoped oxlint on changed service/test | 0 warnings / 0 errors |
| `git diff --check` | Passed |
| Query/editor/field/report/email services and assistance/view controller suites | **380 passing** |
| Native Mongo preview/date/report, context and CSV controller suites | **34 passing, 3 pending** |
| Total automated checks | **414 passing, 3 pending**, including four new regressions |

The 380-test group comprises `NamedQueryService`, `NamedQueryEditorService`,
`FieldDescriptionsService`, `ReportAssistance`, `ReportsService`, controller
`NamedQueryAssistance`/`ReportAssistance`/`ReportEditorView`, and
`EmailTemplateAdminService`/`EmailTemplateService`.
The 34-test group comprises `NamedQueryPreviewMongo`,
`NamedQueryServiceMongoDates`, `ReportAssistanceMongo`, `QueryReportContext`
and `ReportControllerCsv`, using
`NAMED_QUERY_TEST_MONGO_URL=mongodb://127.0.0.1:27550`.
The three pending cases require Mongo failpoints/`enableTestCommands`; they
were not enabled on this interactive development database.
Mocha ran from `packages/redbox-core` with `test/tsconfig.json`,
`ts-node/register/transpile-only`, `chai`, `test/setup.ts` and Node's native
TypeScript stripping disabled. Relevant concise test logs are retained in the
ignored evidence directory.

## Performance, UX and hook-side findings

This is a functional/performance smoke run on a shared 2-CPU host, not a load
benchmark. Recorded HTTP timings include transport:

| Operation | Observed elapsed time |
| --- | --- |
| Type/stage field descriptions | 40–157 ms |
| Bootstrap query validation | 29–122 ms |
| Bootstrap query output descriptions | 30–191 ms |
| Successful nonempty bootstrap query previews | 53–107 ms |
| Active-plan date preview, 38 rows | 127 ms |
| Bootstrap report preview | 58 ms user; 331 ms data records; 453 ms workspaces; 2,621 ms RDMP/100 rows |
| Large mapping / byte truncation probe | 185 ms |

No portal crashes, OOMs or HTTP 5xx responses were observed in the successful
validation runs. Report rendering of 100 rows is the slowest measured case.

At 1440 and 390 CSS pixels, query/report editor documents fit the viewport;
the email editor also fits (375 px usable body with a 390 px viewport).
Screenshot names below are relative to
**`/tmp/schema-assist-09-uwa-screenshots/`**. Visual/UX issues were listed,
without redesigning:

1. The existing mobile admin navigation occupies several screens before the
   editor. `04-query-preview-390.png` shows the surrounding navigation;
   `16-query-390.png` and `16-report-390.png` show the actual workspaces.
2. The legacy runtime report table overflows horizontally: 538 px document
   width in fallback Chromium and about 547–548 px in T3 at a 390 px viewport.
   Long titles wrap into tall rows, and dates/funders require horizontal
   scrolling. Evidence: `layout.json`, `runtime-parity.json`,
   `17-runtime-report-390.png`.
3. Long UWA labels/paths are dense in the desktop editor and use horizontal
   input scrolling; the mobile tab list and sticky action bar wrap. They remain
   operable. Evidence: `10-after-funding-label-search.png`,
   `16-query-390.png`, `16-report-390.png`, `14-email-editor-390.png`.
4. The nonblocking diagnostic noise described above deserves wording/schema
   coverage improvements; it did not prevent saves or report execution.

Hook-side findings, left unmodified:

- `bootstrap-data/namedqueries/listParties.json` supplies arrays for `Email`,
  `Given_Name`, `Family_Name` and `Honorific` mappings. Authoring preserves
  these with `LEGACY_MAPPING` advisories; safe preview correctly refuses them
  with `PREVIEW_UNSAFE_DEFINITION: Preview mappings must be strings`.
  Running the saved query returns six people with working lowercase aliases,
  but those four array-valued output aliases are absent. Convert them to
  supported string mappings in the hook, or separately define the desired
  array execution contract. Core preview was not weakened to run them.
- Literal `repository_name` mappings `People` and `Research Activities`
  are plain path lookups under the existing execution contract. The repository
  label is absent from the tested party/activity outputs. Use a supported
  rendered mapping if a constant label
  is required; the editor's unknown-path advisory is appropriate here.
- The advertised `servicenow-catalog-not-provisioned` stage has no effective
  form description; guidance degrades to one runtime root. It was checked via
  the discovery/fields API; bulk storage records cover the three form-backed
  stages. Party/activity/fundingBody schemas are likewise unavailable;
  organisation guidance is partial.
- `views/emailTemplates/externalStorageExemption.hbs` explicitly labels its
  wording a placeholder requiring UWA approval before release. Rendering
  succeeds; this validation does not approve that wording.

## Cleanup, final state and limits

The UWA and UoN portal/Mongo/Solr containers remain running and healthy.
UoN was never stopped. Its process was not restarted merely to reload the
backend-only fix; it still has its originally loaded service module until the
user chooses to restart it. Both stacks mount this worktree. The unrelated
`redbox-5025-*` containers were left alone.

No failed-attempt containers, extra networks/volumes or dangling images remain
from this task. The tagged UWA image and its active volumes are retained for
the user. UWA-build cache records were selected by their recorded IDs and
creation times and removed, reclaiming approximately **1.04 GB** of unshared
build output; unrelated cache/images were preserved. Temporary browser state,
failed-run logs and unused copied browser scripts were removed. Reproduction
tooling, compact assertion evidence, notification capture and requested
screenshots remain intentionally available.

| Filesystem | Before | After |
| --- | --- | --- |
| Root `/` | 77 GB total; 55 GB used; **22 GB free**, 72% | 77 GB total; 55 GB used; **22 GB free**, 72% |
| Docker/hook filesystem `/home/ubuntu/work` | Earliest build sample: 118 GB total; 58 GB used; **54 GB free**, 52% | 118 GB total; 59 GB used; **53 GB free**, 53% |

`free -g` was checked throughout; both client stacks fit without stopping UoN.
Portal heaps/container caps were retained and memory-heavy builds/tests ran
one at a time under external `timeout`.

Not exercised: external SMTP delivery; SSO; ServiceNow provisioning; external
storage/publishing integrations; SeaweedFS attachments; PDF rendering;
Solr search parity for directly inserted fixtures; all notification trigger
branches; sustained concurrent load; native mobile devices; and Mongo
failpoint deadline cases. The mock transport covers notification formatting
and two real create-hook paths. Report-only users intentionally cannot edit
named queries or email templates. No changes were committed to the UWA hook
and nothing was pushed.
