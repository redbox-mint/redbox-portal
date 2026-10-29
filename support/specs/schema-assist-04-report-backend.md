# Report backend assistance (PR 4)

Base: `stack/schema-assist-03-query-editor`, `9f79cce87534ab690cc4e823f8216dcd61d13ccd`.
Implementation branch: `stack/schema-assist-04-report-backend`.
Database reports only. No report editor UI, persisted authoring state, push or PR.

## Routes and policies

Paths below are relative to `/:branding/:portal/api/report-config`.
All three actions use `webservice/ReportController` and the existing contract
policy chain: no-cache, brand/portal preparation, webservice authentication,
brand-configured `checkAuth`, CSP and request-contract validation. Default
report-config rules allow Admin; custom brand report-author roles work without
named-query administration or the email editor policy. Responses are `no-store`.

| Method | Suffix | Request | Response |
| --- | --- | --- | --- |
| GET | `/named-query/:name/description` | Optional query `property`, `multivalue=true`, `recordType`, `stage` | `ReportNamedQueryDescription` |
| POST | `/validate` | Unsaved report config directly as JSON | `ReportConfigValidation` |
| POST | `/preview` | Existing report-config body; existing filter input values as request parameters | Extended `ReportConfigPreviewDto` |

The description URL is PR 2's existing report-owned route. Its controller action
now delegates to `ReportsService.describeQuery`, which reuses
`NamedQueryEditorService.describeSaved`. Existing description fields remain.
`property` uses the same lodash lookup syntax as saved report columns;
`multivalue` is an ephemeral context selection, never persisted.
Absent explicit type guidance, the saved query can infer its exact record type.
There is no second query-description implementation or query-admin dependency.

Both draft POST routes have Sails `csrf: true`. The existing admin preview alias
also explicitly enables CSRF and passes the authenticated caller to the same
service. Existing API create/update/delete retain bearer compatibility and now
use PR 2's `namedQueryMutationCsrf` policy for authenticated browser sessions,
before bearer authentication populates `req.user`. Existing saves and exports
otherwise retain their behavior.

Completed validation returns HTTP 200 even when `valid: false`, keeping structured
diagnostics accessible through API v1 and v2. Preview-only execution refusals
also return 200 with `valid: false`, `success: false` and empty samples.
API v2 wraps data in `{ data, meta }`; v1 returns data directly.
Input/complexity/response overflow returns 413, denied access 403, missing query
description 404 and execution timeout 408. Unexpected assistance failures expose
only `ASSISTANCE_UNAVAILABLE`, never parser/source/database exception text.
Existing required-config preview failures preserve their 400/403 status with
the safe `INVALID_REPORT` code.

## DTOs and service methods

Shared DTOs are exported by `packages/sails-ng-common/src/report.model.ts`:

- `ReportNamedQueryDescription` extends PR 2's `NamedQueryDescription` with
  `templateContexts: { display: FieldDescription, csv: FieldDescription }`.
  Each uses PR 1's separate report context adapter with the selected column.
- `ReportConfigValidation` contains `valid` and `diagnostics: EditorDiagnostic[]`.
- `ReportConfigPreviewDto` retains `total`, `pageNum`, `recordsPerPage`, `records`
  and `success`. It adds `valid`, `diagnostics`, `renderedRows`, `truncated`,
  `truncationReasons` and `limits`. `records` are the raw named-query **result**
  rows, including the query's mapped metadata, rather than stored Mongo records.
  `renderedRows[i].cells[j]` corresponds to `records[i]` and configured column `j`;
  cells contain `{ display: string, export: unknown }`. Hidden columns are retained
  for export. Export values keep existing untemplated scalar/array/object types;
  strings include spreadsheet-formula protection and precede CSV quoting.
  Missing/null export values become explicit empty strings, matching CSV's blank cells.

`ReportsService` exports `describeQuery(brand, portal, caller, name, property?,
multivalue?, guidance?)`, `validateConfig(brand, portal, caller, config)` and its
extended `previewConfig(brand, config, requestParameters, { portal, caller })`.
Preview requires authenticated context from its controller. Hook callers of this
internal service operation must supply that fourth argument.
The selected query is always loaded by current brand/name; a report request
cannot submit a draft query or execution budget.

## Diagnostics and compatibility

The legacy-save regression was run before implementation: 29 ReportsService
tests passed, including create **and** update with invalid templates, unknown
columns and stale date bindings. Saves check required name/title/query existence,
column label/property and date-bound parameter-key presence. They do not parse
templates or validate bindings. This implementation preserves that behavior.

Validation uses the saved query's parameter keys and output description:

- `UNKNOWN_QUERY_PARAMETER`: text `paramName`, or date
  `database.fromProperty` / `database.toProperty`, is absent from the saved query.
  The date properties retain their legacy names but contain **parameter keys**.
  `createdAfter` targeting `dateCreated` binds as `createdAfter`.
- `INCOMPATIBLE_DATE_PARAMETER`: a known incompatible parameter type, or an
  operator-bearing date parameter with `format: days` that expects a day offset.
  Date filters send ISO timestamp strings. String and unknown parameter types
  remain editable without a guessed date format.
- `UNKNOWN_OUTPUT_COLUMN`: a known missing result property. Mapping alias
  `projectTitle` belongs under `metadata.projectTitle`; envelope fields stay at
  the root. Literal aliases retain their bracket-path semantics.
- `TEMPLATE_SYNTAX`, `UNKNOWN_TEMPLATE_REFERENCE`, `TEMPLATE_COMPLEXITY`:
  advisory template diagnostics. Scope handling covers each/with, block aliases,
  root/parent references and registered helpers; custom helper contexts remain
  unknown. Display and CSV templates use their respective adapters; CSV fallback
  to the display template is checked in its CSV context too.
- `ARRAY_WITHOUT_MULTIVALUE`: explains per-item rendering versus whole-array
  handling, including the distinct scalar display/CSV `val` behavior.

All these advice codes are warnings; existing required-config failures are
errors. A deleted selected query is a blocking `QUERY_NOT_FOUND`, as saving
already requires a saved query. Partial/unavailable guidance, unknown mappings,
non-record output and dynamic/hook descendants do not become false blockers.
Validation never executes or persists, and query changes never rewrite or delete
report filters, columns or templates. Diagnostics are capped at 200, errors first.
Preview template safety is computed before that cap, including later columns.

## Render paths and bounds

Both runtime paths use Handlebars, not lodash source templates. Column properties
remain lodash lookups. Preview uses the existing `ReportsService.getDataRows` /
`getDataRow` / `getColValue` / `getEntryValue` path with an internal optional
execution budget. Ordinary saved report/export calls have no new render limits.
CSV still selects `exportTemplate`, then `template`, renders with `noEscape`,
joins multivalue entries without a separator, applies formula protection and
finally quotes/serializes through `csv-stringify`.

The display mode follows `RecordTableComponent.getColValue/getEntryValue`:
the row, `recordTableMeta.col`, `recordTableMeta.val` and `optTemplateData` are
merged at the root. Scalar display leaves `val` undefined; multivalue supplies
each item. CSV supplies the selected scalar or array/item value. Display uses
the normal escaped Handlebars options, matching the real precompiled display
templates. Both contexts expose `optTemplateData.brandingAndPortalUrl` and have
no email-specific `record`, `imports`, `portal` or `sailsConfig` roots.

Display strings pass through existing `DomSanitizerService.sanitizeWithProfile`
with the `html` profile. The running report page continues to use Angular's
normal `[innerHTML]` sanitizer; its code and semantics are unchanged. The server
HTML profile is more restrictive for some tags/attributes (e.g. images/style),
so preview intentionally removes those before delivery. PR 5 should bind display
through normal `[innerHTML]`, without trust bypass, and show export/raw values
as text/JSON. Runtime template errors produce empty text with advisory syntax
diagnostics, preserving legacy behavior. This server sanitizer difference is
the display parity limitation; escaping, data contexts and CSV values are tested.

Preview uses PR 2's saved execution service through `previewDraft`, with one
server-created budget shared by native query execution and report rendering.
It performs no schema/form/hook guidance reads during execution. Validate and
describe provide that advisory guidance separately.

| Bound | Value |
| --- | --- |
| Submitted JSON/filter parameters and effective query budget | 131072 UTF-8 bytes |
| Input depth / visited nodes | 24 / 4000 |
| Template expressions | 256 per template |
| Query execution plus report rendering deadline | 5000 ms |
| Sample rows | 100, start zero |
| Serialized response including raw/rendered rows and wrapper reserve | 524288 UTF-8 bytes |
| Executor scan guard / mapping aliases | 1000 / 1024 |
| Displayed diagnostics | 200 |

Templates use PR 2's guarded renderer with an added optional `noEscape` argument
(default unchanged). It checks literals, expressions, nested blocks, partials and
helper inputs/results before amplified concatenation. Report cell construction
is also accounted before retention; response accounting includes both raw and
rendered values and drops whole rows. Construction accounting is conservative,
so complex output can truncate before its final serialized value fills the cap.
`truncationReasons` contains `rows` and/or `bytes`; `total` retains the match count.
Excessive template complexity refuses preview before database reads, without
blocking saves. Native Mongo count/find receive remaining `maxTimeMS`.

## Access findings and execution limits

- Existing report/named-query record execution forcibly scopes
  `metaMetadata.brandId`. Preview uses exactly the same executor and cannot opt
  out through submitted branding or query configuration.
- Existing database reports do **not** apply per-record read ACL filtering.
  A real-Mongo regression compares saved report rows and preview rows containing
  empty view ACLs and confirms equal administrative access behavior.
- PR 2's deadline limitations also apply here: custom/user collection execution,
  related-filter reads and relation expansion use uncancellable Waterline/hook
  paths. Preview returns `PREVIEW_DEADLINE_UNSUPPORTED` before such reads.
  This narrows the old preview operation for those saved query kinds; normal
  report runs, exports, configuration saves and non-record descriptions remain
  available with their existing behavior. No deadline support is fabricated.
- Solr config mutations/preview remain forbidden; Solr saved runs/exports and
  read-only flags remain unchanged and covered by existing report tests.

## Verification

Installs/builds/tests ran serially under external `timeout`, with one memory-heavy
command at a time. Final validation uses the repository's Node **24.22.1**.
Dependency installs used `--include=dev --no-save
--ignore-scripts --strict-peer-deps` for root/common/core, then the package scripts
for prerequisite raido, rva-registry and agenda-sqs builds. No dependency versions
or lockfiles changed.

- Legacy-save characterization: **29 passing** before backend edits.
- Focused report/query/context/controller/API-contract Mocha: **218 passing,
  0 failing, 0 pending**. This includes new report service/controller/native-Mongo
  tests, existing named-query editor/deadline tests and generated OpenAPI checks.
- Existing report/named-query Mocha: **123 passing, 0 failing, 0 pending**,
  including all 20 native-Mongo date regressions and existing CSV/controller cases.
- Shared DTO build, core `tsc --noEmit`, and new-test `tsc --noEmit` pass.
- Final report/context/controller rerun after adding the runtime `col.hide`
  guidance field: **54 passing**, with no failures or pending cases.
- Focused source oxlint, formatting checks for new/formatted files and
  `git diff --check` pass.

Mocha commands use `timeout 180`, `TS_NODE_PROJECT=test/tsconfig.json`, package-local
`node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types
--require ts-node/register/transpile-only --require ./node_modules/chai/index.js
--require test/setup.ts --timeout 10000` from `packages/redbox-core`.
Focused paths: `test/services/{ReportAssistance,ReportAssistanceMongo,
NamedQueryEditorService,NamedQueryPreviewMongo,QueryReportContext}.test.ts`,
`test/controllers/webservice/{ReportAssistance,NamedQueryAssistance}.test.ts`,
and `test/unit/api-routes.test.ts`. Regression paths are the existing
`NamedQueryService`, `NamedQueryServiceMongoDates`, `ReportsService`, webservice
`NamedQueryController`, `NamedQueryNotificationParams` and `ReportControllerCsv`.

Mongo uses `NAMED_QUERY_TEST_MONGO_URL=mongodb://127.0.0.1:27534` and
`NAMED_QUERY_TEST_MONGO_FAILPOINTS=true` against one disposable `mongo:latest`
container, resolved to **9.0.4**, named `schema-assist-pr4-mongo-9c907abb`, limited
to 0.5 CPU / 1 GiB with 0.25 GiB WiredTiger cache and test commands enabled.
It and its anonymous volume are removed after verification; unrelated host
containers are untouched. Logs are `/tmp/schema-assist-pr4-{focused,regression,
core-tsc,tests-tsc,lint}.log`.

Bruno requests extend `test/bruno/1 - REST API/14 - Report Config/`: CSRF/session
setup, changed preview assertions, saved description contexts, advisory binding/
template diagnostics, structural diagnostics and missing-CSRF refusals for both
POSTs. They are added for PR 6's lifted portal run; Bruno and browser/end-to-end
execution are not claimed here. Generated API metadata is updated and validated;
publishing generated reference files and wiki changes remain in PR 6.

PR 5 owns report controls, consuming diagnostics/contexts, rendering samples,
guarding stale requests and preserving unsaved UI edits. Section 3 marks only
finished backend items; shared UI parts remain unchecked. No open backend
implementation questions remain; the documented sanitizer and uncancellable-path
limitations should be reflected in preview presentation.
