# Named-query backend assistance (PR 2)

Base: `stack/schema-assist-01-shared`, `58c33427c`. Implementation branch:
`stack/schema-assist-02-query-backend`. This PR adds backend operations and shared
DTOs; PR 3 owns the editor UI and its Angular API methods. No persisted authoring
context or query configuration shape was added.

## Routes and wire contract

All paths start with `/:branding/:portal/api/named-query`. All six actions use the
existing named-query contract policy chain: `noCache`, brand/portal preparation,
webservice authentication, brand-configured `checkAuth`, CSP and contract request
validation. The default path rule allows Admin; brand rules may authorize other
administration roles. There is no email policy or hard-coded Admin check.
Responses use `CoreController.sendResp`: API v2 has `{ data: DTO, meta: {} }`,
API v1 returns the DTO directly. All assistance responses are `no-store`.

| Method | Suffix | Request | Response DTO | CSRF |
| --- | --- | --- | --- | --- |
| GET | `/editor/schema-targets` | none | `{ recordTypes: SchemaTarget[] }` | safe method |
| GET | `/editor/fields` | query `collectionName`, optional `recordType`, `stage` | `NamedQueryFieldDescription` | safe method |
| POST | `/editor/validate` | `NamedQueryDraftRequest` | `NamedQueryValidation` | Sails `csrf: true` |
| POST | `/editor/describe` | `NamedQueryDraftRequest` | `NamedQueryDescription` | Sails `csrf: true` |
| POST | `/editor/preview` | `NamedQueryPreviewRequest` | `NamedQueryPreview<NamedQueryResponseRecord>` | Sails `csrf: true` |
| GET | `/:name/description` | saved name; optional query `recordType`, `stage` | `NamedQueryDescription` | safe method |

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
`PREVIEW_TIMEOUT`, 413 input/complexity/response limits, 422 unsafe effective query
or scan limit, and 500 `ASSISTANCE_UNAVAILABLE` for unexpected failures.

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
  under its report authorization. It loads `NamedQueryService.getNamedQueryConfig`
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
Likely typos receive suggestions; custom fields stay editable. The Mongo query
is never validated as stored metadata against a JSON Schema.

Preview adds execution-only safety diagnostics for malformed query/mapping/
parameter/sort/related-filter shapes, missing required parameters, malformed
object parameters, invalid or excessive template syntax, and server JavaScript.
After parameter coercion/substitution it rechecks the effective query, so object
parameters and parameter paths cannot introduce `$where`, `$function`, or
`$accumulator`. Existing saved definitions are not rewritten or newly rejected.

Server constants in `utilities/NamedQueryPreview.ts`:

| Bound | Value |
| --- | --- |
| Serialized request/effective query | 131,072 UTF-8 bytes |
| JSON nesting / visited nodes | 24 / 4,000 |
| Handlebars expressions per template | 256 |
| Preview deadline, including guidance | 5,000 ms |
| Returned rows | 100, starting at zero |
| Serialized response | 524,288 UTF-8 bytes, with wrapper overhead reserved |
| User/active-link/related-filter scan | 1,000 rows; fetch one extra and refuse overflow |
| Returned validation diagnostics | 200; locations capped at 256 characters |

Record Mongo count/find receive the remaining `maxTimeMS`; asynchronous service
and adapter work shares the deadline. Synchronous parameter/mapping rendering
uses the **same** existing renderer/helper registry through a constant VM call
with a deadline; there is no template dialect replacement. Byte truncation drops
whole result rows. `truncated` and `truncationReasons: ['rows' | 'bytes']` explain
the sample, while `summary.numFound` retains the execution total. An oversized
single row yields an empty sample with byte truncation.

Waterline/hook operations receive a remaining-time hint and have bounded waits;
third-party adapters that ignore that hint cannot be forcibly cancelled after
the response deadline. Overflowing user/join scans fail rather than reporting
an incomplete count or silently changing join results. This is an intentional
preview-only limit; normal saved-query pagination is unchanged.

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
- Relation expansion continues through `RecordsService.getRelatedRecords` with
  the current brand and its existing access behavior.
- Legacy related-filter reads were unscoped and unbounded. Draft preview adds
  forced foreign brand scope (including user role/link scope) and scan bounds.
  A draft cannot use another brand's foreign rows to broaden its joins. Existing
  saved related-filter behavior is otherwise retained.

## Verification

Focused checks run sequentially under external `timeout`, without Docker.
The service/controller suite covers diagnostics, description derivation, saved
brand lookup, non-record collections, immutable definitions, parameters, sort,
relations, main/foreign brand isolation, CSRF, malformed drafts, limits and
synchronous/asynchronous deadlines. Route tests also validate generated OpenAPI.
Bruno requests are in `test/bruno/2 - AJAX calls/6 - Named Query Assistance/`.
They cover session/CSRF setup, discovery, non-record fields, validate, describe,
preview, malformed drafts, missing CSRF and saved descriptions. Bruno and lifted
Docker integration execution remain for PR 6; no portal was started here.

Final results:

- PASS: `timeout 120 node_modules/.bin/tsc -p packages/sails-ng-common/tsconfig.prod.json`.
- PASS: `timeout 120 node_modules/.bin/tsc --noEmit -p packages/redbox-core/tsconfig.json`.
- PASS: `timeout 120 node_modules/.bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.named-query-assist.json`.
- PASS: focused Mocha, 238 passing (18 seconds), with `timeout 120`,
  `--no-config --node-option no-experimental-strip-types`, `ts-node/register/transpile-only`,
  `chai` and `test/setup.ts`. Files: service tests `NamedQueryEditorService`,
  `NamedQueryService`, `QueryReportContext`, `FieldDescriptionsService`,
  `ReportsService`, `PathRulesService`; controller tests `NamedQueryAssistance`,
  `NamedQueryController`, `NamedQueryNotificationParams`; unit `api-routes`.
- PASS: focused source oxlint, zero warnings/errors; new-source/test formatting
  checks; `git diff --check`.
- Not run: Bruno, opt-in native Mongo dates, lifted integration and browser tests.
  No Docker or portal process was started.
