# Named-query backend assistance (PR 2)

Base: `stack/schema-assist-01-shared`, `58c33427c`. Implementation branch:
`stack/schema-assist-02-query-backend`. This PR adds backend operations and shared
DTOs; PR 3 owns the editor UI and its Angular API methods. No persisted authoring
context or query configuration shape was added.

## Routes and wire contract

Named-query paths start with `/:branding/:portal/api/named-query`. All six actions use the
existing named-query contract policy chain: `noCache`, brand/portal preparation,
webservice authentication, brand-configured `checkAuth`, CSP and contract request
validation. The default path rule allows Admin; brand rules may authorize other
administration roles. The report-owned saved-description GET below uses the same
policy chain with the current brand's `/api/report-config(/*)` path rules. It
reuses `describeSaved` and exposes only a saved definition's description; report
permission does not grant editor fields/validate/describe/preview access. There
is no email policy or hard-coded Admin check.
Responses use `CoreController.sendResp`: API v2 has `{ data: DTO, meta: {} }`,
API v1 returns the DTO directly. All assistance responses are `no-store`.

| Method | Suffix                   | Request                                                | Response DTO                                  | CSRF               |
| ------ | ------------------------ | ------------------------------------------------------ | --------------------------------------------- | ------------------ |
| GET    | `/editor/schema-targets` | none                                                   | `{ recordTypes: SchemaTarget[] }`             | safe method        |
| GET    | `/editor/fields`         | query `collectionName`, optional `recordType`, `stage` | `NamedQueryFieldDescription`                  | safe method        |
| POST   | `/editor/validate`       | `NamedQueryDraftRequest`                               | `NamedQueryValidation`                        | Sails `csrf: true` |
| POST   | `/editor/describe`       | `NamedQueryDraftRequest`                               | `NamedQueryDescription`                       | Sails `csrf: true` |
| POST   | `/editor/preview`        | `NamedQueryPreviewRequest`                             | `NamedQueryPreview<NamedQueryResponseRecord>` | Sails `csrf: true` |
| GET    | `/:name/description`     | saved name; optional query `recordType`, `stage`       | `NamedQueryDescription`                       | safe method        |

Report authors (PR 4) use
`GET /:branding/:portal/api/report-config/named-query/:name/description`, with
the same request/DTO as the named-query saved-description GET. Both routes use
brand-effective saved lookup. Omitted `recordType` passes no guidance override,
so an exact saved `metaMetadata.type: 'rdmp'` predicate can infer the field types.

DTOs are exported from `packages/sails-ng-common/src/named-query-assist.model.ts`.
A draft request contains `definition` (the existing configuration object),
optional `guidance: { recordType, stage? }`, and optional `relatedGuidance`, indexed
by related-filter index (`"0"`, `"1"`, ...). Preview also accepts `parameters`,
a map keyed by **parameter name**, not stored-record path. Limits, pagination,
execution options, brand and caller cannot be supplied by this DTO.

Completed validate/describe/preview operations return HTTP 200, including
`valid: false` and blocking diagnostics. Consumers must inspect `valid` and
must not treat a warning as blocking. A refused preview returns no records.
This keeps structured diagnostics available through both existing API wrappers;
the controller's ordinary 4xx path discards supplied data. Request-contract,
authorization and execution failures use the existing error envelopes (v2
`errors[].code`, v1 translated message), with safe identifiers only: 400 invalid
collection/schema target, 403 forbidden/CSRF, 404 `QUERY_NOT_FOUND`, 408
`PREVIEW_TIMEOUT`, 413 input/complexity/mapping/response limits, 422 unsafe effective query
or unsupported deadline path, and 500 `ASSISTANCE_UNAVAILABLE` for unexpected failures.

The `/editor/` namespace avoids reserving additional existing query names.
Existing create/update/delete keep their bearer-compatible `csrf: false` routes,
but a new `namedQueryMutationCsrf` policy verifies tokens for browser sessions.
It runs **before** bearer authentication assigns `req.user`, preserving token
clients. The Angular API service already enables the CSRF header.

## Service API and descriptions

`NamedQueryEditorService` exports:

- `schemaTargets(brand, caller)`.
- `describeFields(brand, portal, caller, { collectionName, recordType?, stage? })`.
- `validateDraft(brand, portal, caller, request)` without execution or persistence.
- `describeDraft(brand, portal, caller, request)`.
- `describeSaved(brand, portal, caller, name, guidance?)`: PR 4 should call this
  through the report-owned GET route (or under its report authorization). It loads `NamedQueryService.getNamedQueryConfig`
  using the current brand/name key; it never consults an editor draft.
- `previewDraft(brand, portal, caller, request)`.

`NamedQueryService.resolveBrandScope(collectionName)` now exposes the same
collection eligibility used by existing create/update/execution. The editor's
supported-collections dropdown is not a new execution allowlist: registered
models with a `branding` attribute remain valid. Unscoped models are refused.
`performNamedQueryFromConfig` and `performNamedQuery` accept a final optional
internal `NamedQueryExecutionBudget`; ordinary callers need no changes.

Field discovery composes PR 1's authorized `FieldDescriptionsService` and shared
context/path adapters. `fields` is the stored `metadata.*` tree;
`envelopeFields` separately lists `redboxOid`, dates and `metaMetadata.type`;
`mappingFields` uses the real `record.*` wrapper. Non-record collections never
resolve a record schema or inherit its metadata tree. Related filters resolve
separate foreign guidance. A simple exact, unparameterized top-level type
constraint may supply guidance; multi-type, dynamic and conflicting constraints
do not. Guidance never adds a query predicate.

Explicit discovery denies inaccessible schema targets. Validation/description
omit unavailable or denied schema guidance and preserve manual editing.
Descriptions preserve source precision/completeness. Parameters retain their
keys (`createdAfter`) separately from their paths (`dateCreated`). Result aliases
appear under `metadata.<alias>`; direct lookups retain known source types,
Handlebars produces strings, and dynamic/hook expressions remain unknown.
Whole-tree mapping descriptions cap expansion at 5,000 source/alias combinations;
larger products omit source descendants and mark completeness partial.
Unmapped records retain their metadata wrapper. Date strings gain no inferred
format. Descriptions include the actual `oid,title,dateCreated,lastSaveDate`
result envelope.

## Validation and preview bounds

Legacy tests first characterized create/update: they validate brand-scoped
collection eligibility, but do not parse templates, validate hook parameter
types, or require all optional configuration objects. Those saves remain
compatible. Validation blocks a non-object definition or invalid collection.
Legacy shapes/template syntax and schema path/type/operator advice are warnings.
Diagnostic display is capped at 200, prioritizing errors then template blockers.
An independent execution-safety flag is computed before display truncation, so
omitted diagnostics cannot permit unsafe preview execution.
Likely typos receive suggestions; custom fields stay editable. The Mongo query
is never validated as stored metadata against a JSON Schema.

Preview adds execution-only safety diagnostics for malformed query/mapping/
parameter/sort/related-filter shapes, missing required parameters, malformed
object parameters, invalid or excessive template syntax, and server JavaScript.
After parameter coercion/substitution it rechecks the effective query, so object
parameters and parameter paths cannot introduce `$where`, `$function`, or
`$accumulator`. Existing saved definitions are not rewritten or newly rejected.

Server constants in `utilities/NamedQueryPreview.ts`:

| Bound                                  | Value                                                |
| -------------------------------------- | ---------------------------------------------------- |
| Serialized request/effective query     | 131,072 UTF-8 bytes                                  |
| JSON nesting / visited nodes           | 24 / 4,000                                           |
| Handlebars expressions per template    | 256                                                  |
| Preview execution deadline             | 5,000 ms                                             |
| Returned rows                          | 100, starting at zero                                |
| Serialized response                    | 524,288 UTF-8 bytes, with wrapper overhead reserved  |
| Executor scan guard                    | 1,000 rows; user/link/join preview paths are refused |
| Returned validation diagnostics        | 200; locations capped at 256 characters              |
| Mapping aliases in assistance requests | 1,024                                                |
| Response accounting depth              | 100; deeper rows are byte-truncated                  |

Record Mongo count/find receive the remaining `maxTimeMS` directly on the native
Mongo driver's `countDocuments` and `find`; no Waterline metadata hint is relied
on. Mongo code 50 maps to HTTP 408 `PREVIEW_TIMEOUT`. Preview permits only native
record execution without related filters or relation expansion. User/custom
collections, foreign joins and relation hooks use uncancellable Waterline or
hook reads, so preview refuses them **before I/O** with HTTP 200, `valid: false`
and an error diagnostic `PREVIEW_DEADLINE_UNSUPPORTED`. Internal execution with
a budget also refuses these paths with 422; record adapters without native
access return the same 422 code. Ordinary saved-query runs keep their original
collection, role/link scoping, join and relation behavior with no new deadline.

Preview does not load schema guidance, since schema/form authorization and hook
reads cannot guarantee database deadlines either. It still validates structural,
parameter, template and query safety. Use validate/describe for advisory field
lint; those operations keep their existing guidance behavior and do not execute
the draft query.

Synchronous parameter/mapping rendering uses the **same** existing renderer/helper
registry through a constant VM call with a deadline. Mapped values are accounted
incrementally before retaining another alias or rendering another row. A bounded
JSON walker counts UTF-8/escaped bytes and stops at the remaining budget without
building an expanded JSON string, including when many aliases reference the
same large object. Final row accounting reserves DTO/wrapper overhead. The HTTP assistance guard
also counts bytes before serializing any DTO. Byte
truncation drops whole rows; an oversized single row gives an empty sample.
`truncated` and `truncationReasons: ['rows' | 'bytes']` explain the sample, while
`summary.numFound` retains the execution total. No mapping or output limits are
applied to normal saved-query execution.

## Access-control findings

- Named-query administration already uses brand path rules (Admin by default).
  Shared field discovery additionally requires caller-authorized workflow
  create/transition access, as in PR 1.
- Record execution forcibly scopes `metaMetadata.brandId`; branded custom models
  use `branding`, regardless of submitted `brandIdFieldPath`. Final flattened
  criteria now reapply that scope, fixing a nested/dotted key collision that
  could previously overwrite it in saved execution too.
- User results require a role in the current brand or an active secondary-user
  link in that brand. Password/token fields are removed before mapping.
- The main record query does **not** perform per-record read ACL filtering in
  the existing saved executor. Preview retains this administrative behavior;
  adding a different ACL contract belongs to a separate change.
- Normal saved relation expansion continues through `RecordsService.getRelatedRecords`
  with the current brand and its existing access behavior. Preview refuses it.
- Legacy saved related-filter reads retain their existing behavior. Preview
  refuses related filters before any foreign read, so a draft cannot use another
  brand's foreign rows to broaden its joins.

## Verification

Checks run sequentially under external `timeout`; Mongo regressions use an isolated
lightweight container, without lifting the portal.
The service/controller suite covers diagnostics, description derivation, saved
brand lookup, non-record collections, immutable definitions, parameters, sort,
saved relations/joins, brand isolation, CSRF, malformed drafts, limits and
synchronous/asynchronous deadlines. Route tests also validate generated OpenAPI.
Bruno requests are in `test/bruno/2 - AJAX calls/6 - Named Query Assistance/`.
They cover session/CSRF setup, discovery, non-record fields, validate, describe,
preview, malformed drafts, missing CSRF and saved descriptions. Bruno and lifted
Docker integration execution remain for PR 6; no portal was started here.

## PR 2 review fixes

All five findings were reproduced before edits with the reviewer's seven probes.
Committed regressions replace the defect assertions with expected safe behavior,
including the 1,024-alias/600 KB metadata case, warning saturation, saved `rdmp`
inference, report-only authorization and native Mongo deadline propagation.
The positive `$or`/`$expr` brand-collision probe is retained too.

Review-fix validation (Node 24.22.1, all commands serial under `timeout`):

- Reviewer defect probes before edits: **7 passing**, confirming all five findings.
- Shared DTO build: `timeout 120 node_modules/.bin/tsc -p packages/sails-ng-common/tsconfig.prod.json`.
- Focused Mocha: **166 passing, 0 failing, 0 pending** (15 s), including
  `NamedQueryEditorService`, `NamedQueryAssistance`, `QueryReportContext`,
  `FieldDescriptionsService`, `PathRulesService`, `api-routes`, and
  `NamedQueryPreviewMongo`.
- Existing named-query/report Mocha: **122 passing, 0 failing, 0 pending** (2 s),
  including `NamedQueryService`, `ReportsService`, webservice `NamedQueryController`,
  `NamedQueryNotificationParams`, `ReportControllerCsv`, and all 20 previously
  pending `NamedQueryServiceMongoDates` cases.
- Both Mocha commands used `timeout 180`, `TS_NODE_PROJECT=test/tsconfig.json`,
  package-local `node_modules/.bin/mocha`, `--no-config`,
  `--node-option no-experimental-strip-types`, `--require ts-node/register/transpile-only`,
  `--require ./node_modules/chai/index.js`, `--require test/setup.ts`, and `--timeout 10000`.
- Mongo runs used `NAMED_QUERY_TEST_MONGO_URL=mongodb://127.0.0.1:27529` against
  a single disposable `mongo:latest` container (resolved to **9.0.4**), limited
  to 1 CPU / 1 GiB with a 0.25 GiB WiredTiger cache. The focused run additionally
  set `NAMED_QUERY_TEST_MONGO_FAILPOINTS=true` and started mongod with
  `--setParameter enableTestCommands=1`. Driver command monitoring verified
  count (`aggregate`) and `find` carry positive remaining `maxTimeMS`;
  `maxTimeAlwaysTimeOut` verified server-side enforcement on each operation.
  The container was stopped and automatically removed after the tests.
- PASS: core `timeout 180 node_modules/.bin/tsc --noEmit -p tsconfig.json`
  and focused-test `timeout 180 node_modules/.bin/tsc --noEmit -p test/tsconfig.named-query-assist.json`,
  both from `packages/redbox-core`.
- PASS: focused source oxlint (0 warnings/errors), formatting checks on the new/
  formatted source and test files, and `git diff --check`.
- Bruno, lifted portal integration and browser checks remain for PR 6.
