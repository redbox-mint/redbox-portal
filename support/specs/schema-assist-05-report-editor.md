# Report editor workspace (PR 5)

Base: `stack/schema-assist-04-report-backend`, `68de093d6054b20cf679fb2dc93f4f703a693d6b`.
Implementation branch: `stack/schema-assist-05-report-editor`.

## Workspace and authoring

The existing report-config list opens a full-page database-report workspace.
Basics, filters and ordered column cards occupy the main area; a collapsible
query parameter/output panel sits alongside it above 1000px and stacks below it
on narrow screens. Results, diagnostics and preview filter inputs follow both.
Save, Cancel and explicit Preview actions are in the workspace header. Entering
and leaving the editor restores keyboard focus to the heading/list action.
Solr reports retain their existing view links and read-only controls. The
report-running/export screens and their execution semantics are unchanged.

Selecting a saved query immediately requests the report-owned description route.
The panel displays parameter **keys**, target paths, types and available output
fields, with precision/completeness information. Search matches labels and paths.
Output checkboxes do not mutate the report; **Add columns from selected output
fields** explicitly adds labelled columns. Lookups use the shared `lookupPath`
adapter, including bracket syntax for literal aliases. Array item paths are not
offered as direct lookups. Labels, ordering, hidden state, multivalue and both
templates remain editable, including manual paths absent from guidance.

Text parameter inputs use named-query keys as native datalist suggestions and
retain free-text editing. Date ranges have separate **From parameter** and
**To parameter** inputs. Persistence keeps the legacy
`database.fromProperty` / `database.toProperty` names, containing parameter keys,
never target record paths. A pair is suggested only when exactly one known date
lower/upper pair addresses the same target and accepts ISO timestamps; applying
it requires confirmation. String/unknown types remain manually selectable but
do not create guessed date-pair suggestions. Known incompatible types and
operator-bearing `days` offsets are excluded from date suggestions. Missing
legacy date-bound objects remain absent until an explicit edit repairs them.

The new standalone `ReportTemplateInputComponent` composes the shared template
editor, autocomplete and keyboard-operable field tree. It derives column-specific
display and CSV completions with the same shared adapters used by the backend
description route. Display scalar `recordTableMeta.val` is undefined; CSV scalar
`val` has the selected value's type; multivalue supplies each item in both modes.
The result row, `recordTableMeta.col` and
`optTemplateData.brandingAndPortalUrl` are available. There are no email roots.
The editor offers the shared runtime Handlebars helper registry and array
iteration insertion. Help explains whole-array versus per-item behavior and the
CSV fallback to the display template.

## Permissions and transport

The Angular service retains the existing `HttpClientService` initialization and
CSRF context. Description uses
`GET /api/report-config/named-query/:name/description`; validation uses
`POST /api/report-config/validate`; preview now uses the PR 4 API route
`POST /api/report-config/preview`. CRUD retains the existing admin endpoints.
Both v1 data and v2 `{ data, meta }` envelopes are accepted.

The existing app host only exposed `is-admin`, which does not establish access
to a brand-overridden named-query path. The small accompanying change in
`views/default/default/admin/reports.ejs` computes
`can-manage-named-queries` through the same brand path-rule lookup and `canRead`
check used by `checkAuth`. The app hides its manage-query links unless that
attribute is explicitly true. It adds no authorization endpoint or role guess.
If named-query listing fails (including a report-author session without query
administration access), the query picker allows entering a saved query name;
describing it still uses the independently authorized report route.

New visible strings are in both English translation resources, and controls have
associated labels or accessible names.

## Draft state, diagnostics and requests

A JSON baseline tracks changes only to the persisted report draft. Selected
outputs, panel/search state, descriptions, diagnostics, preview values and results
are separate authoring state. Existing optional/unknown/hook properties are cloned
and submitted without normalization. A no-op save does not fill in empty
checkbox/template/date properties. Changing filter type preserves existing
bindings. Query changes preserve all filters, columns and templates and request
new diagnostics for broken references; suggestions are never applied implicitly.

Validation is debounced by 400ms and never executes a query. Diagnostics appear
at text/date filter bindings, column properties/options and the relevant display
or CSV template, as well as in a complete diagnostics area. Blocking and advisory
messages have distinct labels/styles; template diagnostics also mark editor
lines. Save validates the current draft, while unavailable assistance leaves
legacy saves available. Preview-only refusals do not tighten the save contract.

Cancel, create, switching reports and portal links require confirmation before
abandoning edits; `beforeunload` also protects the draft. Save sends a snapshot,
preserves later edits, and cannot close a newly selected report. The report name
is disabled during creation requests so later edits cannot change its saved
identity. Save failures retain the draft.

Shared `LatestRequest` guards protect descriptions, validation, preview, item saves
and list reloads. Switching reports/queries, editing a draft, changing preview
values and teardown invalidate the appropriate generations. Obsolete successes,
failures and busy-state updates cannot replace current state. Validation and
preview also compare the submitted draft fingerprint. Window focus and an
explicit refresh action re-fetch descriptions and revalidate without changing
the draft or executing preview.

## Preview binding and fidelity

Preview only runs from the explicit button with a snapshot of the unsaved report
and the legacy filter input names (`paramName`, or
`paramName_fromDate` / `paramName_toDate`). The UI labels real data and shows
configured display columns and a separate export-value table including hidden
columns. Raw query-result JSON remains inspectable. Truncation reasons/limits
and `deadlineEnforced: false` have visible notices.

The sole preview HTML binding is exactly:

```html
<td [innerHTML]="cell.untrustedDisplayHtml"></td>
```

There is no trust bypass, separate sanitizer or other HTML insertion path.
Angular's normal sanitizer matches the live report. CSV values and raw results
use text interpolation. The Angular behavior spec checks that allowed markup
survives, scripts and `onerror` are stripped, and unsafe URLs are rewritten.
Export values are not rendered as HTML.

## Verification

All installs, TypeScript/Angular compilation, specs and builds ran serially under
external `timeout` limits, with one memory-heavy command at a time. No Docker, lifted portal,
interactive browser verification, subagents, push or PR was used. Node **24.22.1** was
used for final compilation/tests/builds; Angular workers were limited to one.
Dependency versions and lockfiles are unchanged.

Prerequisites:

- Root and sails-ng-common: `timeout 600 npm install --include=dev --no-save
  --ignore-scripts --strict-peer-deps` (one install at a time).
- Angular: the same install with `--include=optional` for platform binaries.
- `timeout 180 npm run compile` in `packages/sails-ng-common`.
- `timeout 240 env NG_BUILD_MAX_WORKERS=1 ./node_modules/.bin/ng build
  @researchdatabox/portal-ng-common --configuration development` in `angular`.

Required checks, from `angular`:

- **64 passing report-config specs (57 workspace + 7 API), 0 failing**:
  `timeout 300 env NG_BUILD_MAX_WORKERS=1 CHROME_BIN=/snap/bin/chromium
  ./node_modules/.bin/ng test @researchdatabox/report-config --watch=false
  --browsers=ChromeHeadlessNoSandbox`.
- **4 passing shared schema-assistance specs, 0 failing**: the same command for
  `@researchdatabox/portal-ng-common` with
  `--include='**/schema-assist/*.spec.ts'`.
- **Production report-config build passes**:
  `timeout 300 env NG_BUILD_MAX_WORKERS=1 ./node_modules/.bin/ng build
  @researchdatabox/report-config --configuration production`.

Behavior specs cover query selection, explicit column insertion and literal
aliases, confirmed date pairs and key persistence, separate template contexts
and keyboard completion/insertion, diagnostic placement/severity, unsaved preview
and Angular sanitization, export values/hidden columns/raw JSON, filter values,
truncation/deadline notices, query-change preservation, refresh, stale
success/failure/busy state, save races, unsaved navigation, Solr protection,
missing assistance and no-op round trips.

An EJS render check passed **2 permission scenarios** (allowed and denied), using
brand/caller path-rule stubs and asserting the emitted permission attribute.
Focused source oxlint reports zero warnings/errors; Prettier and
`git diff --check` pass. Logs are `/tmp/schema-assist-05-*.log`.

The production build reports an initial bundle warning (approximately 1.14 MB
against a 1 MB warning budget) and the existing sails-ng-common CommonJS warning;
neither prevents the build.

## PR 6 boundary

Delivery section 3 is complete. Section 4 remains unchecked for PR 6's browser,
end-to-end, full-stack regression and wiki/API reference verification. There are
no open implementation questions. The only scope addition is the minimal EJS
permission attribute needed to honor brand-specific named-query access; it does
not change page access or expose new permissions/routes.

## Review follow-up: save races and literal lookup completion

All three findings were confirmed before implementation. The reviewer's five
probes were incorporated into committed report workspace specs: on the original
code they produced **5 failures with 64 existing specs passing**. Two additional
named-query mapping-control probes confirmed that editor had the same literal
lookup completion defect (**2 failures with 9 typed-control specs passing**).

- **P1:** Save immediately reconciles the server's returned report into the list,
  preserving list order, and keeps the workspace open until list refresh succeeds.
  Cancel/reopen during that refresh therefore clones the saved response. Refresh
  failures remain visible in the workspace, clear the saving state, and retain
  the successfully saved baseline. A successful create becomes an existing
  report before refresh, so retrying after refresh failure cannot create it again.
  Later draft edits and item switches remain protected from the old save's close.
- **P2 (validation):** Save has a separate `LatestRequest` validation stream.
  Window focus, explicit assistance refresh, Preview and advisory validation
  cannot cancel its validation. Item changes and teardown invalidate it; draft
  fingerprints still reject edited snapshots. If the draft changes while Save
  validates, a translated message explains that the author must save again.
  Save still honors structural validation errors and allows legacy saves when
  validation assistance is unavailable.
- **P2 (literal paths):** Report columns and named-query direct mappings retain
  presentation paths while matching. The shared autocomplete accepts a path
  insertion adapter and invokes PR 1's existing sails-ng-common `lookupPath`
  when accepting a suggestion. Dotted, namespaced, spaced and quoted literal
  keys retain their literal meaning in lodash bracket syntax. Native lookup
  parents also match presentation parents when drilling into literal objects.
  Stored Mongo paths keep their existing adapter and behavior; array item
  lookups remain excluded.

There are **19 new regression specs**: 12 report workspace, 5 shared completion,
2 named-query mapping controls. They include an actual second save after reopening
and assertions that late validation cannot replace a different item's diagnostics.
The changes to portal-ng-common (owned by PR 1) and named-query-editor (owned by
PR 3) are deliberately committed here on **PR 5**; earlier stack branches are
unchanged. No sails-ng-common source or dependency changes were needed.

Final checks ran serially with Node **24.22.1**, `NG_BUILD_MAX_WORKERS=1`, and an
external `timeout` for every Angular command. Tests used
`CHROME_BIN=/snap/bin/chromium`, `--watch=false`,
`--browsers=ChromeHeadlessNoSandbox` and `--progress=false`:

- `timeout 240 ... ng build @researchdatabox/portal-ng-common --configuration development`: passes.
- `timeout 300 ... ng test @researchdatabox/report-config`: **76 passing, 0 failing**.
- `timeout 300 ... ng test @researchdatabox/portal-ng-common --include='**/schema-assist/*.spec.ts'`: **9 passing, 0 failing**.
- `timeout 300 ... ng test @researchdatabox/named-query-editor`: **190 passing, 0 failing**.
- `timeout 300 ... ng test @researchdatabox/email-templates`: **232 passing, 0 failing**.
- `timeout 300 ... ng build @researchdatabox/report-config --configuration production`: passes.
- `timeout 300 ... ng build @researchdatabox/named-query-editor --configuration production`: passes.

Both production builds retain their documented bundle-budget and sails-ng-common
CommonJS warnings (report-config approximately 1.14 MB; named-query-editor 1.20 MB).
Focused source oxlint reports zero warnings/errors. Formatting of the changed
report/shared files, parsing of both English JSON resources and `git diff --check`
pass.

Logs: `/tmp/pr5-report-before.log`, `/tmp/pr5-query-before.log`,
`/tmp/pr5-shared-build.log`, `/tmp/pr5-{report,shared,query,email}-after.log`,
`/tmp/pr5-{report,query}-production.log`.
No Docker, subagents, push or PR creation was used. Work stayed in the existing
`t3-39c46c3e` implementation worktree; the other worktree's review evidence was
read only.
