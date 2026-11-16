# Verification — 11 November 2026

## Latest browser verification and review

The fresh second independent full review of the Record explorer pivot reported
**no issues found**. The parent then verified the latest deployed source through the
actual Tailscale portal, signed in as **Welcome Local Admin**. This section records
that browser verification; implementation-thread browser automation was not used.

- A new visual query for dataPublication / draft selected default title, OID and
  workflow-stage columns. **+ Add columns** exposed actual schema fields/types and
  allowed Amount selection. Title containing `Climate`, sorted by title descending,
  returned 25 rows on page one and studies 02/01 on page two.
- Saved `Explorer climate visual` as `6af3875abdbce73d1d854a5d`, separately from the
  legacy demonstration. Reopening through the saved picker and a full document
  reload (Navigation Timing type `reload`) automatically opened compact results.
  Title/OID/workflow-stage/Amount headers, Climate study 27 / Amount 270, conditions
  and descending sort were retained.
- Generate GraphQL used fresh actual metadata fragments and preserved visual query
  meaning. Running the generated document returned 25 rows with title/Amount values.
- A separately edited `Explore($type: String!, $first: Int, $after: String)` query
  selected `records(recordType: $type, first: $first, after: $after)` with
  `nodes { oid recordType workflowStep }`, `hasNextPage` and `endCursor`. Variables
  were `type: dataPublication`, `first: 25`, `after: null`. It returned 25 rows,
  followed by five through Next. JSON showed the actual response, the grid used
  `records.nodes`, and record links used genuine OIDs.
- Saved `Explorer GraphQL records` as `6af3879bbdbce73d1d854a5e`. Full reload
  automatically opened compact results with 25 rows and oid/recordType/workflowStep
  headers. Editing to `nonexistentField` displayed the actual GraphQL diagnostic,
  disabled Run and clearly marked retained results stale.
- Schema assistance showed actual Query field argument signatures. Ctrl+Space at
  `query { rec` opened completions filtered to `rec`; selecting `record` inserted
  `query { record`. Navigation prompted to discard changes. The invalid draft was
  discarded and the saved raw query remained unchanged.
- Desktop layout was inspected at 1280px. The compact saved visual view at 390px
  had no document overflow (`body.scrollWidth === 390`). The browser host briefly
  reconnected during the mobile transition and recovered; this was not an app fault.

The heading label was subsequently corrected from **Results preview** to **Results**
in English defaults and the isolated default-brand translation entry. Translation
and asset caches were refreshed without rebuilding or restarting the application.
The screenshots below precede this label-only correction:

- Desktop saved visual query:
  `/home/andrew/.t3/userdata/browser-artifacts/browser-screenshot-intelmacbook-tail4a7c3-ts-net-mwb6mbm5-d6f8c5b4.png`
- Mobile:
  `/home/andrew/.t3/userdata/browser-artifacts/browser-screenshot-intelmacbook-tail4a7c3-ts-net-mwb6no8v-6176b206.png`

The original demonstration `6af3775166cfb54a8ef9110e` remains unchanged at revision 2.
All 30 synthetic records are preserved. The two new browser-created saved queries
are intentionally left for inspection. Delete, revision conflicts and failed Save as
are covered by automated tests; this browser run makes no claims for those flows or
institution-specific configuration. The existing HTTP-origin COOP warning persists.
Translation validation and `git diff --check` passed for the label/documentation update.

## Record explorer implementation

The workspace now follows the approved Record explorer direction: query controls above
always-present results, independent draft/executed state, explicit stale-result status,
optional naming/save, saved-query results with in-place editing, paginated searchable
picker, New query/dirty confirmations, and searchable schema columns with accessible
ordering/removal. Title/OID links use actual records and the current portal.

Visual and GraphQL definitions both save/reopen through the scoped Mongo API. Legacy
saved definitions remain unchanged. GraphQL mode provides document/JSON-variable
editing, actual SDL field/argument help and completion, schema/variable validation,
JSON/grid mapping and conservative recognized cursor pagination. Generating GraphQL
uses fresh discovery/fragments and preserves visual semantics. Raw edits remain
separate from the preserved visual draft.

Parent `570c34d28` forbids introspection in `record-graphql/schema.ts` but exposes
`describeReadSchema`. The new Admin schema route uses that actual tooling. All raw
execution and save validation use the parent's read-only executor and its operation,
permission, request/response and work limits. Saving a raw query performs a bounded
read; it stores no results or non-null result cursors. Arbitrary shapes remain
explicitly nonpaginated, with JSON available when scalar grid mapping is unsuitable.

Checks for this implementation: **84 Angular tests**, **24 backend/admin tests** and
**8 real HTTP/Mongo tests** passed. The Angular suite covers both modes, generated
semantics, saves, dialog accessibility, mappings, stale/error/race states and paging.
The real suite adds schema-route access and raw persistence/read-only rejection to
existing session/CSRF, scope, CRUD, pagination and revision-race coverage. Production
Angular build, source core no-emit check, combined-runtime core build, shim generation,
translations, focused lint and whitespace checks passed. Existing shared CommonJS
build warnings remain. Commands are in [README.md](README.md).

The Record explorer round-one review findings were addressed with regressions:

- Server/editor/transport enforce the same variable-value depth bound before writes;
  rejected create/update requests leave catalogue counts/revisions unchanged. Boundary
  object and array values still save, list, parse and load the initial catalogue.
- Retained rows keep their executed page identity. Undoing visual column edits,
  reformatting raw variables and remapping earlier data stay stale until rerun.
- Raw links require AST proof of a direct unconditional unaliased `oid`; aliases,
  fragment-only selections and directives cannot provide identity from response names.
- Save as uses a detached request and adopts identity after success. Rejected creates
  followed by cancellation and ordinary Save update the original revision in both modes.

Deployed into `/home/andrew/.t3/redbox-grid-verify-runtime`, preserving parent exports,
policies, configuration and dependencies. Core was built and shims regenerated before
restart. Only the data-grids asset targets were deleted/replaced, preserving other apps.
Translations and asset caches were refreshed. The isolated default-brand English
bundle's 175 `data-grids-*` entries were updated through `I18nEntriesService.setEntry`
and reloaded; unrelated translation keys were preserved. Previous feature entries
are backed up at runtime `.tmp/explorer-translations-before.json`. This is needed
because normal default seeding preserves existing stored values. Runtime-only Amount/Active/Event date
mappings were restored idempotently and all 30 records reindexed after restart. The
portal is healthy. All disposable integration fixtures were removed. The saved
`Climate publications` demonstration remains at ID `6af3775166cfb54a8ef9110e`, revision 2,
in its original legacy format. Runtime backup:
`/tmp/redbox-explorer-r1-backup-1ltujyf8` (latest backend/test snapshot); the previous
full deployment backup remains `/tmp/redbox-explorer-runtime-backup-jhjibh7a`.

The exact `graphql` 16.14.2 dependency was added to source manifests/locks for parsing
and validation. Existing shared dependency files were not modified; the runtime used
its existing parent GraphQL dependency. The original checkout and environment file
were untouched. No commits, pushes or PRs were made.

The latest review and browser verification are recorded above. Older browser
evidence and review clearance below describe the previous interface.

## Earlier persistence implementation (before Record explorer)

Server persistence and catalogue/create/edit/view/delete/hard-reload flows are now
implemented in this checkout. Focused automated checks cover the scoped HTTP
contract, CSRF headers, revisions, save errors, reopen discovery and results,
stale-field repair, brand/portal isolation and concurrent backend updates. The
focused backend suite uses an atomic Mongo fake; the additional Docker integration
suite exercises actual registered HTTP routes, session/CSRF policies and Mongo.

Checks for that interface: **62 Angular tests passed**, **14 saved-grid backend tests plus
7 admin-foundation tests passed**, and **6 real HTTP/Mongo integration tests passed**
with no failures or skips. Production Angular build, source core TypeScript check,
combined-runtime core build, translation validation, focused backend lint and
`git diff --check` passed. Shared-package CommonJS build warnings remain.

Round-one regressions cover filter scalar-type drift and explicit repair,
create/update timestamp precision/calendar bounds, catalogue pagination beyond 500,
independent stage discovery with a failed all-stage catalogue, and full saved-response
parsing. Round-two regressions cover persisted sort scalar-type drift on save,
reopen and query, explicit sort repair, and malformed sort bindings. Tabs use a
readonly typed collection without a template cast.

The real integration suite verifies Admin/anonymous/Researcher session access,
missing/incorrect/valid CSRF tokens, brand and portal isolation, CRUD/list response
serialization and registered Mongo persistence, bounded pagination beyond 500 rows,
and concurrent updates/deletes using real revision selectors. The maintained runner
and Docker commands are in [README.md](README.md). All disposable test fixtures were
removed; the runtime retained all 30 synthetic records. A saved demonstration grid
was subsequently created through the browser as described below.

The combined isolated runtime was deployed with the current source, preserving the
parent GraphQL exports/policies and runtime configuration. Its core was built before
shim regeneration and restart. Both target data-grids asset directories were deleted
before copying the production build; other Angular apps were preserved. Translations
were deployed and caches refreshed by restart. Runtime-only Amount/Active/Event date
form/index mappings were restored with an idempotent seed and the 30 records reindexed.
The portal is healthy. Runtime backups are at
`/tmp/redbox-round2-runtime-backup-h7ijz77m`. No shared dependencies were installed or
modified. The original checkout and its environment file were untouched.

## Saved-grid browser verification and final review

Three independent full reviews covered the tracked diff and untracked implementation
against the parent contract. The implementation thread addressed all findings from
the first two rounds. The third review reported **no issues found** and reran the
21 backend/admin tests, core no-emit typecheck and whitespace checks successfully.

The following then passed through the live Tailscale browser using the actual UI:

- Created and saved `Climate publications` for dataPublication / draft, with title,
  Amount, Active and Event date columns, title containing `Climate`, title descending
  and 25 rows per page. The UI confirmed `Grid saved.`.
- Left the editor and saw the saved configuration in the catalogue.
- Opened its `View results` action: 25 matching rows on page one, then studies 02
  and 01 on page two, with no unsaved changes.
- Moved title below Amount and saved the update successfully.
- Reloaded the document (browser Navigation Timing confirmed `reload`): the saved
  ID reopened automatically, refreshed discovery and loaded page one. Headers were
  Amount, title, Active, Event date; the filter and descending title ordering were
  retained, beginning with Climate study 27 / Amount 270.

The saved example remains available at:
`http://intelmacbook.tail4a7c3.ts.net:1500/default/rdmp/admin/data-grids#grid=6af3775166cfb54a8ef9110e`

Catalogue screenshot:
`/home/andrew/.t3/userdata/browser-artifacts/browser-screenshot-intelmacbook-tail4a7c3-ts-net-mwb44bwl-0025c76b.png`

Results after full reload:
`/home/andrew/.t3/userdata/browser-artifacts/browser-screenshot-intelmacbook-tail4a7c3-ts-net-mwb45v9d-4e028a09.png`

Conflict and deletion behavior are covered by automated frontend and real HTTP/Mongo
tests; this browser pass did not repeat those scenarios.

The browser evidence below predates persistence. Its temporary-editor statements
are historical and do not describe the current implementation.

## Earlier live verification

Verified through the shared browser at:

`http://intelmacbook.tail4a7c3.ts.net:1500/default/rdmp/admin/data-grids`

The isolated runtime at `/home/andrew/.t3/redbox-grid-verify-runtime` combines
this frontend with the GraphQL parent implementation at `570c34d28`. Its Docker
Compose project is `redbox-grid-verify`, with separate MongoDB and Solr data.
The original feature checkout and its environment file were left untouched.
The running stack is left available for manual review.

## Data and scope

Thirty synthetic development records were created in that runtime's database
and indexed in Solr. Twenty-seven have titles `Climate study 01` through
`Climate study 27`; three have other titles. The draft dataPublication form
was extended only in the verification environment with numeric Amount,
boolean Active and timestamp Event date fields and explicit index mappings.
These are real stored/indexed records returned by the parent GraphQL endpoint,
not mocked HTTP responses or production frontend fixtures. The runtime-only extra field
setup was restored after the latest restart; repeat it after any later restart.

## Browser results

All of the following passed using the actual controls:

- Admin login, sidebar navigation and the shared admin workspace layout.
- Record type discovery, workflow stage choices and stage-specific capabilities.
  All-stage fields with incomplete variant coverage explain their limitations.
- Select title, Amount, Active and Event date columns; reorder title and remove
  Event date. Headers and values follow the chosen column order.
- Filter title containing `Climate`, sorted by title descending: page one has
  25 rows beginning with Climate study 27; Next returns the remaining two rows
  (02 and 01), and Previous restores the first page.
- Add Amount BETWEEN 100 and 150: six rows (studies 15 through 10).
- Also require Active=true and Event date greater than
  `2026-01-12T12:00:00+12:00`: exactly studies 15 and 13 remain.
- An invalid February 30 timestamp shows validation and disables preview;
  a valid timezone-qualified timestamp restores it.
- A condition with no matches displays the application's empty-results message.
- Changing the Solr schema during the editor session blocks preview with a
  field/capability revision message and clears stale results. Refresh fields
  followed by preview recovers successfully.
- Leaving a changed configuration prompts for discard confirmation.
- Saving is disabled and the temporary nature of edits is explained.
- Visual inspection at 1280px, 768px and 390px widths: controls remain readable,
  narrow layouts stack, and the results grid scrolls internally. The document
  has no horizontal overflow at 768px or 390px.

The final build was reloaded after deployment and its empty-results behavior,
normal 25-row preview and same-origin Quartz font loading were checked again.

## Fixes found through browser testing

- The portal CSP blocked AG Grid's embedded data-URL icon font. Quartz now uses
  an external same-origin WOFF2 asset copied from the pinned package, with its
  upstream licence. Font loading succeeds without changing CSP.
- AG Grid's default English empty overlay appeared alongside the application's
  localized message. It is now suppressed, with an actual grid regression test.

## Automated checks and limits

- Angular suite: **44 tests passed** in Chromium headless.
- Production Angular build: passed; existing shared CommonJS warnings remain.
- Translation validation and `git diff --check`: passed.
- Portal container: healthy; MongoDB and Solr containers running.

The earlier browser run did not exercise saved-grid persistence or
institution-specific forms, mappings or permissions. The HTTP Tailscale origin
produces the browser's existing warning that Cross-Origin-Opener-Policy is ignored
on an untrustworthy origin; use HTTPS when validating that header's behavior.

Desktop screenshot:
`/home/andrew/.t3/userdata/browser-artifacts/browser-screenshot-intelmacbook-tail4a7c3-ts-net-mwb299tl-764c912f.png`

Mobile screenshot:
`/home/andrew/.t3/userdata/browser-artifacts/browser-screenshot-intelmacbook-tail4a7c3-ts-net-mwb28rr4-644cb379.png`

## Complex/repeated field slice — UON, 11 November 2026

This slice is implemented and deployed for independent review; no browser automation
or independent-review clearance is claimed by this implementation task.

- **93 Angular tests passed**: complete discovered fragments/stable saved choices,
  grouped response parsing, raw array mapping, one record per row, false/zero/null/empty
  values, nested name/email pairing, missing fields, safe text, labelled modal close and
  focus return, grid keyboard entry/activation (including actual AG Grid), and localized/clipped summaries.
- **89 parent GraphQL tests passed**, including declared group projections and nested
  repeated children, nullable/missing values, private-child exclusion, opaque-list
  rejection and no scalar server operations on repeats.
- **25 saved-grid/admin backend tests passed**, including repeated-column save/reopen
  and repeated filter/sort rejection. Primary core no-emit check and combined runtime
  core compile passed. Production explorer build passed with existing CommonJS warnings.
- **8 registered HTTP/Mongo tests passed**, without skips. Anonymous access in UON
  redirects to the exact login URL, so those assertions now accept that denial as well
  as 403; signed-in unauthorized access and invalid/missing CSRF still require 403.
- `verify-complex.py` passed against real session/CSRF-backed HTTP: selected actual
  fragments, paired names/emails, empty/null groups, repeated filters/sorts rejected,
  all-stage RDMP pages **25+25+10**, 60 unique RDMP OIDs, and all **80 records** retained.
  Every original saved definition/revision equals `complex-saved-before.json` exactly.
- `verify-form-assets.py` passed after deployment: 12 record view/edit pages, 12 actual
  effective form configurations, metadata/client configuration, and **67 served assets**
  compared byte-for-byte with primary outputs and both runtime asset targets. Form main
  remains `main-K3CXZRE5.js`. Explorer is `main-ERDXOXX6.js`, styles `styles-JHU3JH6V.css`.
  Translation validation and whitespace checks passed.

The complete explorer output was copied from primary into runtime `assets/angular`
and `.tmp/public/angular` (only the data-grids targets replaced). Form assets and the
previously built primary shared Angular libraries were retained. CacheService hashes
were refreshed normally. The runtime app source matches all **29 primary app files**;
`complex-frontend-parity.json` records hashes. No dependencies were installed or changed
for this slice. No commits, pushes, PRs or browser work were performed. The UON hook
remains Git-clean; the original portal checkout and its environment file were untouched.

New visual demonstration **UON — Investigators and funding**:
`6af39b6108e110d5c27e0977`, revision 1. It selects title, workflow stage, contributors,
supervisors, funding bodies and data-source types. The existing five saved queries
were preserved. Synthetic RDMPs 001–003 were enriched through
`MongoStorageService.updateMeta` with actual revision preconditions, then reindexed
through `SolrSearchService.solrAddOrUpdate`. Their original full records are backed up
in `complex-before-uon-explorer-rdmp-00{1,2,3}.json`; `complex-enrichment.json` records
the exact added values. No original fields were removed and no workflow transitions
or external hooks/integrations ran.

Authoritative parent change: the checked-in
`backend-patches/record-graphql-complex-fields.patch` (also copied to UON runtime
`graphql-complex-fields.patch`) changes only parent `catalogue.ts` and `grid.test.ts`.
The primary SavedGridService and tests are the other backend changes. Earlier UON
fingerprint/index/label compatibility changes remain intact and separate. Existing
GraphQL permissions and budgets were retained. Opaque UON `contributor_ci` children
remain unavailable; complete declared contributors/supervisors are inspectable.
Independent review should inspect the patch as well as primary sources, and the
parent should verify the deployed grid/keyboard dialog visually in its browser.

Logs: `complex-angular-tests.log`, `complex-graphql-tests.log`,
`complex-saved-tests.log`, `complex-http-suite.log`, `complex-core-build.log`,
`complex-primary-core-check.log`, `complex-angular-build.log`,
`complex-http-verification.json`, `complex-form-assets-verification.log`,
`complex-asset-cache-result.json` and `complex-translations-result.json` in the UON
runtime directory. Original command recipes remain in README.md.

## Structured-cell independent review round 1 remediation

All five findings quoted in the parent's fresh review brief are addressed:

1. Numeric rendering uses the shortest round-trip JS representation instead of a
   fixed decimal-place formatter. Tests cover `1e-21`, `-1e-25`,
   `1.234567890123456e-15`, minimum/maximum finite values, zero and signed zero in both
   summaries and full details, including conversion back to the identical numeric value.
2. Ambiguous labels use the actual discovered path, for example `Name (/owner/name)`
   and `Name (/contact/name)`, in available/selected fields, chips, headers and accessible
   inspector titles. The available picker additionally shows discovered paths. Regressions
   use duplicate child labels and exercise the rendered Community Grid and dialog.
3. Raw getters/renderers retain undefined for absent properties. Heterogeneous raw
   rows test Missing versus No value for both ordinary and record-link-eligible fields.
4. A null group item has its indexed row with `No item (null)` spanning all child
   columns. `[null, {name:null,email:null}]` renders distinctly and is covered directly.
5. Default and live UON copy distinguish inspectable repeating fields from unavailable
   independent columns, and describe selecting lists/groups within one record row.
   A backend unit test reads the actual English defaults. Only four live translation
   keys were updated; all **4,715 unrelated translation entries** were compared unchanged.

Validation: **97 Angular tests**, **26 backend/admin/copy tests**, production Angular
build, focused lint (zero warnings/errors), translations and whitespace checks passed.
No production backend changes were needed; the earlier parent patch and its 89-test
result remain unchanged. Read-only live HTTP preservation checks confirm all **six**
saved definitions/revisions are identical to `round1-saved-before.json` and all **80**
records remain, including RDMP pagination 25+25+10. No records or saved definitions were
modified by this remediation. The deployed explorer is `main-OAGNOQ4X.js`; its complete
asset output was synchronized to both runtime targets and CacheService refreshed.
Form bundles remain unchanged. Source parity and the 67 served assets are verified
again after deployment. Evidence uses `round1-` files in the UON runtime directory.

The parent browser check **before these fixes** confirmed saved-query autoexecution,
the first three-item research-team table with correctly paired names/emails and the
missing third email, and Escape closing the dialog with focus return. Screenshot:
`/home/andrew/.t3/userdata/browser-artifacts/browser-screenshot-intelmacbook-tail4a7c3-ts-net-mwb9x307-e1603e1d.png`.
This task performed no browser automation and left the parent's available-fields panel
untouched. The parent still needs to retest the updated labels/copy and remediated
edge cases in the browser, followed by a fresh independent review. No review clearance
is claimed here. No installs, commits, pushes, PRs or original-checkout edits occurred.

## Structured-cell independent review round 2 remediation

The single `raw-json-path-collision` finding is addressed in `graphql-query.ts`.
`rawRows` now validates each flattened property segment as a GraphQL name. A JSON
scalar object containing `{'a.b':1,a:{b:2}}` rejects the entire grid mapping and uses
the existing complete JSON fallback. No partial rows or ambiguous columns are exposed.
Unsafe names in either order across heterogeneous rows also reject mapping. Objects
inside arrays are never flattened and retain arbitrary names/nested arrays intact.
There are no new path encodings, API contracts, dependencies or backend changes.

Regression coverage adds within-row and across-row collisions, other non-GraphQL
property names, unchanged ordinary scalar-object columns, retained nested repeated
values with dotted keys, and the component's rendered complete JSON fallback. The
component regression verifies both original values remain in JSON and rows/columns
are cleared, for both within-row and across-row cases.

Parent browser evidence reported with this round (before the round 2 deployment):
the corrected guidance and path-qualified duplicates passed, and the first three-person
inspector retained paired values with Escape closing and returning focus. The parent
accepted all five round 1 fixes. Tiny-number and null-item edge cases were covered by
automated regressions and were **not visually exercised**. This implementation task
performed no browser automation. The new JSON-collision fallback still awaits parent
browser checking/fresh independent review; no review clearance is claimed here.

Round 2 validation: **101 Angular tests passed**, production explorer build passed,
focused lint reported zero warnings/errors, translation validation and whitespace
checks passed. Existing CommonJS build warnings remain. Live read-only HTTP checks
confirmed the exact six saved definitions/revisions and all 80 records unchanged
(RDMP pages 25+25+10). No backend or stored data changes occurred. Explorer bundle:
`main-ZNJUJPLH.js`, unchanged `styles-JHU3JH6V.css`. Complete assets were deployed from
primary to both runtime locations and CacheService hashes refreshed. The 29-file app
source parity and all 67 served form/explorer assets are verified after deployment.
Form bundles remain unchanged and UON is healthy. Evidence/logs use the `round2-`
prefix in `/home/andrew/.t3/redbox-uon-explorer/`. No installs, commits, pushes, PRs or
original checkout/environment edits were performed.

## Structured-cell independent review round 3 remediation

Both minor findings are addressed. Visual title-linked fields now use shared scalar
presentation for missing/null/empty values before creating a link. Visual getters no
longer collapse missing to null. Nullable `metadata:/owner/title` regression rows prove
three distinct markers without blank anchors, while ordinary title/OID links retain
safe text and URL encoding. The existing populated-title link eligibility is unchanged;
boolean/zero link labels also retain their actual scalar presentation.

Raw empty objects now occupy an inspectable cell instead of disappearing during
flattening. The heterogeneous `{payload:{}}`, missing payload, and `{payload:null}`
case stays distinct; nested empty objects and repeated empty structures are covered.
Full details explicitly label an Empty object. Auditing neighboring scalar/structured
branches also found the synthetic root-column name `value` could alias an actual
property in heterogeneous rows. A small original-path identity check rejects that
mapping into the existing complete JSON fallback, in either row order. Existing
non-GraphQL-name/collision checks remain intact.

These are frontend presentation/mapping fixes only. No production backend, parent
patch, record or saved-definition changes were made. Unrelated backend suites were
not rerun. The new Empty object translation is applied as a single targeted live
entry; unrelated translations remain untouched and are compared during the update.
Browser evidence remains the parent's previously reported guidance/path-qualified
labels and paired three-person inspector with Escape/focus return. The nullable-title,
empty-object, tiny-number and null-item edge cases have automated coverage and are
not claimed as visually exercised. This implementation did not automate the browser;
the parent owns the next browser check and fresh independent review.

Round 3 checks: **106 Angular tests passed**; production build, frontend typecheck,
focused lint (zero warnings/errors), formatting, translation validation and whitespace
checks passed. Existing CommonJS warnings remain. Read-only HTTP preservation checks
confirmed all six saved definitions/revisions and 80 records unchanged (RDMP pages
25+25+10). Only `data-grids-cell-empty-object` was applied live, with **4,719 unrelated
translation entries verified unchanged**. New bundle: `main-RKUGVAEA.js`; styles and
form bundles are unchanged. Both complete asset targets were synchronized and hashes
refreshed. All 67 served assets match primary and both runtime targets; 12 record pages
and 12 effective form configurations passed again. All 29 app source files match the
primary snapshot. Evidence/logs use `round3-` in the UON runtime directory. The parent
backend patch remains identical, UON is healthy and the hook remains Git-clean. No
installs, original-checkout/.env edits, commits, pushes, PRs or browser automation.
Ready for the parent's fresh independent review.


## Structured/repeated slice — final parent verification

Fresh independent review round 4 returned **NO ISSUES FOUND** after the three remediation rounds. Review: [Review structured and repeated field inspection — round 4](t3-thread://v2/d7950a7a-ecf7-4d7a-9560-50508843bbe1/thread:delegated-task:command%3Amcp%3Ae8fe9c3c-9dce-4912-9a96-6bde18d2290b%3Adelegate-task%3Ae85a42d0-f4b6-4b05-aa1e-fb6ebb127c8a).

The parent reloaded the deployed saved query `6af39b6108e110d5c27e0977` in the authenticated Tailscale browser. It reopened and automatically executed. The funding summary expanded to the complete three-entry list. The research-team summary expanded to three indexed rows: Avery Finch and Jordan Lake retained their respective emails; Morgan Reed retained an empty email marker without shifting values between people. Escape closed the dialog and returned focus to its originating button. Column labels carried the discovered parent path. Earlier browser checks confirmed corrected picker guidance and paths. The final saved query paged as **25 + 25 + 10 records**, with Next disabled on page 3; a full reload restored the saved query on page 1.

Latest screenshots:
- Funding list: `/home/andrew/.t3/userdata/browser-artifacts/browser-screenshot-intelmacbook-tail4a7c3-ts-net-mwbatesc-af376b47.png`.
- Paired investigator table: `/home/andrew/.t3/userdata/browser-artifacts/browser-screenshot-intelmacbook-tail4a7c3-ts-net-mwbatjy4-b0c81c74.png`.

Numeric extremes, raw unsafe-key JSON fallback, raw missing/null/empty-object distinctions and null group items have automated regression coverage; they were not separately exercised through live browser fixtures. The latest suite passed 106 Angular tests. Earlier unchanged backend coverage passed 89 GraphQL, 26 backend/admin/copy and 8 HTTP/Mongo tests. Build/typecheck, lint, translation checks and deployed asset parity passed as recorded above.

All four UON containers remain running, portal healthy. The previous core verification stack remains stopped. The UON hook is Git-clean; no commits or pushes were made. All 80 records and six saved queries remain available. Summary reporting, charts, row expansion, and repeated-group filtering/sorting remain outside this slice. Opaque schema fields cannot expose undeclared children; declared object/list shapes are supported.


## Cell detail dialog styling

Restyled the existing native modal to use the admin brand tokens, panel-coloured header, 18px heading, 14px body, padded table and footer with the shared outline button. The explicit workspace pixel type scale avoids UON's smaller root rem. The modal carries the admin wrapper because it is appended to body. Its content scrolls independently, keeping the header and close button visible. No query, data, persistence or value-rendering behaviour changed.

Verified the deployed UON supervisor and research-team dialogs at 1280px, and the research-team dialog at 390px: the dialog stays inside the viewport, the wide table scrolls inside its content region, and the close button remains visible. Escape and button close still restore focus. Production build and all 106 Angular tests passed (CHROME_BIN=/usr/bin/chromium, KARMA_PORT=9877); whitespace checks passed. New bundles: main-B4PVYNPD.js and styles-R55BZVXQ.css. Primary source and complete app assets were synchronized to both runtime targets; hashes refreshed without restart. Desktop evidence: /home/andrew/.t3/userdata/browser-artifacts/browser-screenshot-intelmacbook-tail4a7c3-ts-net-mwbcagvw-1ec1f853.png. Narrow viewport evidence: /home/andrew/.t3/userdata/browser-artifacts/browser-screenshot-intelmacbook-tail4a7c3-ts-net-mwbcb2lw-228d1024.png.

## UON chief investigator contract repair

The original live compile evidence (`ci-investigation-result.json` in the UON harness)
showed `incompatible-read-variants` for `contributor_ci` in draft, active and retired.
The reusable person group compiled correctly in isolation with five declared children;
`replaceName` was not the cause. A hidden scalar edit carrier in the declaration tab and
an explicit view-only Content transform were being merged as scalar storage variants.
The compiler now omits only explicit view-only Content projections. Real edit declarations
remain authoritative; a scalar edit carrier still causes an object/scalar conflict in tests.
A separate one-line UON hook patch removes the redundant CI carrier. No blanket JSON
exposure, arbitrary data-based inference, new filtering/sorting, permissions or budget changes.

Runtime boundary: parent-only source changes are in `record-contract/record-contract-compiler.ts`
and `record-graphql/catalogue.ts`, with tests in `read-variants.test.ts` and `grid.test.ts`.
The incremental authoritative patch is `backend-patches/record-graphql-single-object-fields.patch`
(after the existing complex-fields patch). Primary changes are the frontend protocol/spec and
SavedGridService/spec. The hook patch is `backend-patches/uon-chief-investigator-carrier.patch`.
`git apply --check` passed for the hook patch; reverse-check passed against the combined parent.
The hook checkout remains clean. The runtime compiled-hook overlay is mounted read-only from
`redbox-uon-explorer/hook-overlays/rdmp-ethics-compliance.js`; it differs only by that deleted call.
`ci-form-overlay.js` removed exactly one hidden edit carrier from each of three persisted forms,
backed up in `ci-forms-before.json`. Startup regeneration was tested after mounting the overlay.

Automated checks: **108 Angular tests**, **92 GraphQL tests**, **27 saved-grid/admin/copy tests**
passed. Coverage includes real fragments and stable saved IDs, object and child columns together
without alias leakage, translated CI label, reusable children/replaceName, view/edit semantics,
private and undeclared child exclusion, nullable objects, malformed object responses, structured fields whose labels contain title, scope,
one-record pagination and rejected scalar operations. Production app build and parent core build,
frontend/GraphQL typechecks, focused production lint (zero warnings/errors), translation validation,
formatting and whitespace checks passed. Existing CommonJS build warnings remain. Backend source
was changed here, so the affected parent/persistence suites were rerun; unrelated HTTP/Mongo suites
were not rerun.

Authenticated live checks (`verify-ci.py`, `ci-http-verification.json`) passed: CI is selectable
OBJECT with the correct existing translation key and five selectable children, across three stages
and each individual stage scope. Group-plus-child values agree for all 60 RDMP records, paged
25+25+10. A disposable definition was created, reopened, and deleted; all original six definitions
and revisions are byte-equivalent as JSON. No demo was added and no record data changed.
Read-only preservation checks confirmed 60 RDMP + 12 dataRecord + 8 dataPublication records.

Deployment: built from primary, synchronized complete data-grids assets to both runtime targets,
refreshed CacheService hashes, and retained all form assets. New main is `main-75VAUKA2.js`;
styles remain `styles-R55BZVXQ.css`. All 67 served assets match primary and both runtime targets;
12 record pages and 12 effective form configurations passed. Parent's styled dialog source files
retain their exact pre-task hashes. All four UON containers remain running, portal healthy.

No browser automation was performed. Existing parent browser evidence for styled dialogs,
390px layout, repeated pairing, saved-query execution/paging and Escape/focus return remains valid
as previously reported. The newly selectable CI picker/group/child UI and its saved reopen still
need the parent's browser check; HTTP and automated coverage are not claimed as visual evidence.
This change is ready for a fresh independent review, not declared review-cleared.

Focused persistence verification command (primary `packages/redbox-core`):

```bash
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config \
  --node-option no-experimental-strip-types --require ts-node/register/transpile-only \
  --require chai --require test/setup.ts test/services/SavedGridService.test.ts \
  test/unit/admin-foundation.test.ts test/unit/data-grid-copy.test.ts
```

Parent GraphQL: `npm --prefix packages/redbox-core run test:record-graphql` from combined runtime.
Parent build: `./node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json` from combined runtime.
Frontend test/build commands and live verification commands are in the UON handoff's
Chief investigator section. Logs/evidence are retained under `ci-` in that harness.

## CI review remediation — standalone view fields

The independent CI review identified a major regression in the initial compiler repair:
blanket exclusion of explicit view-only Content transforms also removed standalone stored
read fields. The former `viewOnly` assertion incorrectly expected that deletion. That
assertion now requires the original typed string contract to survive.

Exclusion now requires another authoritative declaration at the **same resolved storage
pointer**. A bounded authority pass uses the existing compiler's contributors, reusable
expansion, transparent containers and name overrides. If it encounters Content projection
candidates, a second pass compiles the final contract, retaining candidates with no exact
owner. State, definitions and property budgets are reset between passes; first-pass output
is not published. Forms without projection candidates and write-mode compilation still use
one pass. No storage data is inspected and no projection metadata is added to public schemas.

Regressions cover a standalone view-only `external_reference`, root versus nested same-name
paths, both declaration orders across separate tabs/reusable definitions and `replaceName`,
standalone renamed reusable fields, CI object collisions and genuine scalar/object conflicts.
GraphQL privacy tests also verify that excluding a redundant projection preserves private
parent and child exclusions, including validation rejection before record reads.

Checks for this remediation: **95 GraphQL tests**, **27 persistence/admin/copy tests**, parent
core TypeScript build, GraphQL typecheck, focused compiler lint (zero warnings/errors),
formatting, patch reverse-check and whitespace checks passed. No frontend production source,
translations or styles changed, so the existing 108 Angular-test result and primary-built
`main-75VAUKA2.js` / `styles-R55BZVXQ.css` remain the applicable frontend evidence; those tests
and the frontend build were not rerun for this backend-only refinement.

The refined compiler and regression tests are retained in the same authoritative incremental
`backend-patches/record-graphql-single-object-fields.patch`, including the additional
`read-privacy.test.ts` coverage. The earlier complex-fields patch and one-line UON carrier patch
are unchanged. Core was rebuilt in the combined runtime and portal restarted with its existing
shim-regeneration setting. UON compiled overlay remains mounted; hook checkout is clean.

Post-restart evidence is in `ci-review-standalone-result.json` (deployed runtime preserves the
standalone typed field), `ci-review-http-verification.json` (CI group/children, three scopes,
25+25+10 paging and temporary save/reopen/delete), and `ci-review-preservation.json` (80 records
and all six saved definitions/revisions unchanged). Final served asset/form parity was checked
again. No browser checks are claimed; the parent's new CI browser check remains pending after
independent review clearance.

## CI review round 2 remediation — projection privacy

The review found the reverse privacy case missing from the preceding tests: a private
projection with a public owner. Returning before invoking the projection's source contributor
lost its write-only annotation, allowing that public owner to expose the stored value.

The final compilation pass now invokes and validates every registered projection contributor
before suppressing any redundant shape. Only an exact-owner projection whose contributed node
contains **no write-only restriction** can be omitted. A privacy-bearing projection retains its
node in the existing deny-wins merge, including object children, array items and conditional
branches. Matching structured shapes preserve public siblings; incompatible shapes containing
private descendants close the affected region conservatively. This deliberately avoids trying
to transplant private paths onto a different storage type. The authority pass still resolves
owners without projections; it does not publish its output. Standalone view-only contracts and
the preceding reusable/rename ownership fix remain intact. No contributor-class exceptions,
record-data inference, new merge framework, permission changes or new scalar capabilities.

Eight new regressions cover private projections with public owners in both declaration orders:
the direct private hook / public SimpleInput scalar reproduction, nested objects, array groups,
and incompatible shapes. Structured fixtures use reusable definitions and renamed paths.
Discovery excludes private paths; permitted public siblings remain readable; forbidden GraphQL
selections fail validation with zero record reads. Existing private-owner/public-projection and
standalone-field regressions also pass.

Checks: **103 GraphQL tests**, **27 persistence/admin/copy tests**, parent core build/typecheck,
focused compiler lint (zero warnings/errors), formatting, whitespace and authoritative-patch
reverse-check passed. Core was rebuilt and portal restarted with existing shim regeneration.
The authoritative single-object-fields patch now contains this compiler fix and expanded
read-privacy coverage; the earlier complex-fields and UON carrier patches are unchanged.
Frontend source, translations, styling and emitted assets did not change, so Angular tests and
frontend build were not rerun. Existing frontend evidence remains 108 tests and primary-built
main-75VAUKA2.js / styles-R55BZVXQ.css.

Deployed-runtime reproduction (`ci-privacy-runtime-result.json`) confirms the private annotation
survives and selection fails with HTTP 400 and **zero reads** in both orders. The standalone
runtime compilation remains a typed string (`ci-privacy-standalone-result.json`). Authenticated
live CI discovery, three stage scopes, group/child values, 25+25+10 paging and temporary saved
roundtrip pass (`ci-privacy-http-verification.json`). Exact record/saved-definition preservation
is recorded in `ci-privacy-preservation.json`: 80 records and the original six definitions and
revisions unchanged. No demo was retained. Final source/asset parity and form checks passed;
portal healthy, all four containers running and hook Git-clean. No browser automation or new CI
visual verification is claimed. Ready for another independent review.


## Chief investigator — final parent browser verification

Fresh independent CI review round 3 returned **NO ISSUES FOUND**: [Review chief-investigator contract repair — round 3](t3-thread://v2/d7950a7a-ecf7-4d7a-9560-50508843bbe1/thread:delegated-task:command%3Amcp%3A00aa0522-e6bd-45f5-8d86-ab8beb83ad6d%3Adelegate-task%3Aa06b9fb9-dfa6-45fb-8c66-eccf2caf7970).

Parent authenticated Tailscale browser verification passed: the picker exposes the translated Chief investigator / primary investigator group and its five selectable child fields. Selected name, email and the complete object together; running returned matching values within each record row. The first record's object inspector showed Avery Finch, uon-synthetic-001@example.invalid and University of Newcastle Australia, with explicit No value markers for jobTitle and ORCID. The styled modal is retained; Escape closes and returns focus to its cell.

Saved a separate visual example **UON — Chief investigators**, ID `6af3b792e8840e0db3677e53`, through the browser Save as flow. A full reload reopened it and automatically executed the same columns on page 1 with 25 records. The original six saved queries were preserved; there are now seven including this retained example. All 80 records remain unchanged. Screenshot: `/home/andrew/.t3/userdata/browser-artifacts/browser-screenshot-intelmacbook-tail4a7c3-ts-net-mwbdx1oe-394f8a87.png`. This verification covers the default all-stage scope; individual-stage coverage and privacy/standalone regressions remain the automated/HTTP evidence recorded above.

The compiler/catalogue changes and one-line UON carrier change remain authoritative patches in backend-patches. The hook checkout remains clean; the local UON runtime uses the documented compiled overlay. These patches must travel with the implementation when integrated. All four UON containers remain running, portal healthy. No commits or pushes were made.
