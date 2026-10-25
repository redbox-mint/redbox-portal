# Round 13 HTTP input acceptance

Reviewer-owned runtime fixes: **afaf6ef010ff00e4cdf6f98b8bce62daf2c64db4**;
parent-owned supporting limit correction: **f1da6196e**. Feature baseline:
`a49366803164429f9d8bdd249dadcdf856c9d13e`; incoming reviewed HEAD:
`c8a5064d0f16ad9e10f083c6590ae4bc178085db`. No broad/Docker qualification was run
by this reviewer. The parent owns final qualification. SR-005/045/049/055
representative-institution acceptance remains outstanding as already accepted.

## Complete inventory and evidence boundaries

| Coverage | Count | What it proves |
|---|---:|---|
| Unique native route declarations | 335 | Every declared matcher is in the permanent table, including authentication, browser aliases, upload, actions, pages and assets. |
| API declarations within that total | 152 | API schema coverage is a subset, not the complete route inventory. |
| Baseline route-config patterns | 331 | All map to current declarations; zero unresolved patterns. The two legacy preview token patterns share one native matcher. |
| Resolved baseline controller actions per current declaration | 332 | Actual baseline methods, same-class helpers and inherited dashboard methods are retained as source provenance. The three other rows are explicit HEAD policy, inline CSRF and root. |
| Declared schema parameter fields | 554 | Source, requiredness, type and explicit precedence are recorded per field. |
| Baseline/current extraction and field-validation cells | 5,945 | Actual baseline and current extraction plus field Zod acceptance agree; zero unexplained differences. These cells alone do not prove handler semantics. |
| Current-only alias schema cells | 1,200 | Snapshot acceptance for aliases that had no old API schema; these are explicitly not baseline differential proof. |
| Total retained schema cells | 7,145 | The sum of the two preceding categories. |
| New real native HTTP cases | 59 | Actual HTTP through native handlers with deterministic domain ports: supported values/precedence, target mutation, malformed controls and R12 toggle behavior. |
| Actual baseline controller/helper probes | 30 | Four administration operations with/without userid, four translation filters, four notation lists, thirteen booleans, one bodyless sync. |
| Baseline editor source assertion | 1 | Actual legacy selector and guarded record lookup, not execution of the old editor. Current editor/form behavior is exercised over HTTP. |
| Supplemental mounts/protocols | 10 | Companion base/subtree, health/readiness, artifact fallback, final page fallback, progress/Companion upgrades, extension registration, final unmatched fallback. |
| Bundled extension registrations | 3 | All three have zero own HTTP route declarations; development root configuration is served by native pages. |

[Machine-readable table](http-acceptance.json) retains each route's original
controller input expressions and containing statements, source line, followed
helpers, current owner, schema field/source/precedence, individual executable
cells, disposition and verification references. Owner-level native input sites
are deduplicated under `owners`; they are not claimed to apply to every action in
that owner. [All 335 rows](http-acceptance-routes.md) provide a readable route table,
plus the supplemental mounts and bundled registrations.
[The consumed-input source ledger](http-acceptance-inputs.txt) retains the actual
baseline expressions/contexts used for manual comparisons. Requiredness, defaults,
coercion and supported aliases for handlers without schemas were reviewed from
those statements against their native owners. Their rows say `source-comparison`,
not synthetic wire coverage. Authentication rows point to the parent's executable
matrix and baseline probes.

The permanent `test/http/httpInputInventory.test.ts` consumes retained JSON and
actual current declarations/extraction. It neither invokes Git nor loads the
Git-dependent generator. It asserts equality with all native matchers after
implicit HEAD/all-method expansion, including configured Companion and health
routes. Each of the 335 declaration tests verifies provenance/disposition and
executes its schema cells where present. Thus 336 passing tests do not mean 336
independent end-to-end domain scenarios.

## Verified and fixed Class A findings

All six families are introduced in feature-written native handlers. All were
fixed in **afaf6ef010ff00e4cdf6f98b8bce62daf2c64db4**, with regressions in
`packages/redbox-core/test/http/httpInputAcceptance.test.ts`.

| Severity / family | Current source location | Baseline proof at a49366803 | Realistic failure and correction |
|---|---|---|---|
| **P1: administration selected another account** | `src/http/express/identityAdministration.ts:168` | `controllers/AdminController.ts:365,383,435,470` read `body.userid` for generate/revoke key, profile and roles; eight actual method probes cover presence/absence. | A stale/unrelated `query.id` overrode the submitted userid, reproducibly writing another same-brand user's profile/key/roles. Browser operations now select body.userid exclusively; path enable/disable and authenticated self targeting retain their owners. Four mutation cases preserve the other account; twelve missing-userid controls forbid body.id/query.id fallback before lookup/write. |
| **P2: optional translation filters rejected** | `src/http/express/metadata.ts:253` | `controllers/TranslationController.ts:142`; four actual method probes show omitted/empty locale and namespace default. | Listing all locales or using an empty namespace returned 400. Optional scalar inputs and the `translation` default are restored; structured/control inputs still fail. |
| **P2: historical-value boolean spellings changed** | `src/http/express/formVocabulary.ts:101` | `controllers/FormVocabularyController.ts:75` calls actual `toBoolean`; thirteen baseline probes. | `TRUE`, ` t `, `1`, `yes`, `y`, `on`, `enable`, `enabled` silently selected false. Native handling uses the existing conversion; thirteen spellings plus malformed controls are covered. |
| **P2: notation list splitting/dedup changed** | `src/http/express/formVocabulary.ts:117` | `controllers/FormVocabularyController.ts:198` and actual `parseNotationList`; four probes. | Repeated comma-containing values and duplicate lists selected wrong notations or exceeded the unique-value limit. Split every repeated value, trim and deduplicate before applying the existing unique limit. Four accepted cases plus malformed/overlimit controls. |
| **P2: bodyless browser vocabulary sync rejected** | `src/http/express/vocabularyIntegrations.ts:54` | `controllers/VocabularyController.ts:341` consumes optional `req.body?.versionId`; one actual method probe. | The existing latest-version browser sync returned 400 without a body. Supply an empty validation input only for that browser alias; the REST contract still requires a body. One HTTP case checks both. |
| **P2: query-selected existing editor/form lost selection** | `src/http/express/pages.ts:168`, `formDelivery.ts:45` | `controllers/RecordController.ts:851,979` consumes `req.param('oid')`; actual editor selector/guarded getMeta source asserted. | Supported `/record/:recordType/edit?oid=...` and `/record/form/:name?oid=...` opened new-record defaults with no existing-record lookup. Query fallback is restored, path oid wins, and rendered/form identity remains consistent. Four HTTP cases cover selection and precedence. |

Locations above are relative to `packages/redbox-core/`. The target-account issue
meets P1 because the pre-fix handler writes a different account, rather than
merely returning the wrong error. The other families are P2 wrong behavior in
normal supported input paths. No speculative coercion expansion was added.

## Parent-owned fixes and R12 review

| Area | Evidence / result |
|---|---|
| Local login body/query/mixed/nested fields | Parent commit `5f887304f`; fifteen local-input table rows; actual baseline controller/pinned passport-local probes **10 pass**. See `local-input-baseline.cjs` and `test/http/authentication-matrix.test.ts`. |
| Configured OIDC names | Parent commit `2f9634213`; three real accepted names plus three malformed controls; actual baseline probes **6 pass**. See `oidc-identifier-baseline.cjs`. Parent reports final complete auth matrix **118 passing in Docker Node 26**. Those results are parent-provided, not rerun by this reviewer. |
| REST versus browser list/search limits | Parent commits `2d7516aaa` and supporting correction **`f1da6196e`** separate REST API limits from browser list/search limits; the production `maxSearchRows` binding at `src/application/portal/http.ts:466` is in `afaf6ef01`. **Only REST** record/deleted-record lists use `api.max_requests` (default20). Baseline browser `RecordController.ts:99` extends `Core.Controller`; its `getRecordList:2541` / `getDeletedRecordList:2627` call its own `getRecords:2723` / `getDeletedRecords:2798`, and that file never references `api.max_requests`. Browser lists/deleted lists therefore retain the incoming native `maxSearchRows` policy (default1m), as does search. Parent reports four actual baseline method probes pass (`browser-list-baseline.cjs`) and **15 real HTTP controls pass** (`test/http/recordReadLimits.test.ts`), versus previous code 10 pass/5 fail: API lists/deleted retain20; browser lists/deleted accept50/100 under configured bound100; search remains independent. This corrects the existing API-limit fix, not a separate incoming issue. Configuration reviewer owns API/prehydrate bindings in `03b1d724e`. |
| R12 configurationWrites query toggle | Reviewed `e487ce22c`: only the browser bundle-enabled alias may omit its body. Nine focused current HTTP cases cover query-only true/false, existing body/query truthiness precedence and four malformed/missing controls. All pass; all nine also pass against the pinned R12 native owner. `ConfigurationMongo.test.ts` remains the existing datastore regression. No new R12 defect found. |

## Supported inputs and deliberate compatibility changes

The spec says “Preserve externally used HTTP URLs, response envelopes, status
codes and normal record/form/workflow behavior by default” (`design.md:34`),
“Valid body/query precedence is retained” in the identity contract (`:124`), and
requires “documented legacy parameter precedence” when extracting the minimum
path/query/body/header input shape (`:575`). Its Express qualification list
explicitly includes “missing bodies/coercion” (`:605`). The six findings above
violate those compatibility requirements; no additional missing/partial/wrong
requirement or scope creep was verified in this HTTP review.

The [HTTP request input scope](../../../../wiki/V6-Client-Compatibility.md#http-request-input-scope)
states which legitimate transports are supported and maps deliberate changes:

| Category | Disposition |
|---|---|
| Declared path/query reads; declared write bodies and explicit aliases | Supported according to the route's precedence, requiredness and coercion. Fixed realistic examples appear above. |
| Every theoretical Sails req.param source, including arbitrary GET bodies | Not a compatibility promise. Native reads use declared URL path/query fields; clients move GET-body inputs into those fields. This review does not claim universal req.param emulation. |
| Arrays/objects where a scalar is declared | Intentional 400. Declared list/JSON fields retain their contracts. |
| Unknown fields | Per-route projection/passthrough/rejection, not a global claim. Arbitrary record metadata remains domain data. |
| Invalid pagination/limits/field names | Intentional integer/range checks: positive page/row sizes, nonnegative offsets where declared, no numeric prefixes or structured scalars, no unsafe search-field syntax. |
| Generic evaluated service actions | Retired in favor of registered named operations; unknown action 404. |
| Legacy virtual socket HTTP | Subscribe/unsubscribe 410; direct progress grants and separate pinned Companion protocol replace it. |

These dispositions separate malformed/unsafe historical acceptance from the
supported scalar/list/JSON/body/query cases. They do not turn every rejected
legacy input into an A defect.

## Source-review areas without an additional verified defect

| Native owner group | Reviewed input boundaries |
|---|---|
| recordTypes, metadata, configuration, configurationWrites | Path/query/body projection, required/optional filters, translation slash keys, defaults and the R12 toggle. |
| recordReads, recordMutations, harvestMutations | ID/type/workflow selectors, metadata/permission JSON, ETag/concurrency, distinct REST API versus browser list/deleted-list limits (parent-owned supporting correction above), harvest payloads and retry identifiers. |
| queryReads, queryWrites | Search/report/history/dashboard selectors, rows/start/date/depth/field checks, named query bodies and extraction fallbacks. |
| identityAdministration, identityLinks | Browser userid versus REST/path/self target, profile/role/list fields, link target IDs and explicit aliases. Login/Accounts/callbacks are parent-owned. |
| vocabularyAdministration, vocabularyIntegrations, formVocabulary | IDs, optional versions, booleans, notation lists, imports, paging and structured-input controls. |
| brandingOperations, brandingUploads, datastreamReads/Writes, resumableUploads | Route IDs, query selectors, multipart/raw transport boundaries, range/content headers, attachment metadata and upload protocol ownership. |
| pages, formDelivery, pageAssets | Editor/form path/query selection, page route selectors, preview/dynamic/static paths, manifest fallback and actual legacy optional/wildcard mappings. |
| adminOperations, figshareAdministration, siemWrites, integrationOperations | Admin selectors, remote identifiers/configuration bodies, operation options and existing API extraction/schema cells. |
| csrf, configuredActions, progressOperations, Companion and bundled registrations | Token transport, named action input, grants/topics, retired virtual socket protocol, provider-owned routes/upgrades and absence of additional bundled HTTP declarations. |

No new P3 or inherited backlog addition was verified. The inherited B-06
includeDisabled behavior remains with its existing backlog disposition; this
review did not silently turn it into a feature fix.

## Reproduction and results

Use installed Node `26.11.1`, exact repository dependencies; no package pin changed.
Generation and baseline/negative probes require Git history. The permanent table
gate does not.

From repository root:

```sh
.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node --no-experimental-strip-types support/specs/sails-retirement/evidence/final-review-r13/http-acceptance-inventory.cjs
.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node support/specs/sails-retirement/evidence/final-review-r13/http-acceptance-baseline.cjs
```

Generation: **335 routes / 331 baseline patterns / zero unresolved / zero schema
differences**. Baseline: **30 executable probes pass plus one source assertion**;
retained output is `http-acceptance-baseline.json`. Full requested
`git diff a49366803...HEAD` SHA-256/byte length/stat and untruncated
`git log a49366803..HEAD --oneline` are in `http-acceptance-provenance.json`.

From `packages/redbox-core`, current focused gate:

```sh
TS_NODE_PROJECT=test/tsconfig.json ../../.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node --no-experimental-strip-types ../../node_modules/mocha/bin/mocha.js --no-config --require chai --require ts-node/register/transpile-only --timeout 30000 --reporter dot test/http/httpInputInventory.test.ts test/http/httpInputAcceptance.test.ts test/http/recordBrowserPages.test.ts test/http/recordBrowserForms.test.ts
```

Current gate: **461 passing** (336 portable inventory + 59 new native input + 66
existing page/form tests). The runtime-only subset previously passed **125**.
The final inventory-only run with a `git` executable stub returning 128 first on
PATH passed **336** without calling it; retained output is
`http-acceptance-no-git.log`. This checks that unavailable live Git does not skip
the portable acceptance gate. Set PATH to a directory containing that stub before
the same command and select only `test/http/httpInputInventory.test.ts` to repeat.
Focused runtime handler oxlint: **zero warnings/errors**. Prettier applied to the
owned runtime/tests/generators. Full application typecheck/qualification belongs
to the parent; explicit ZodType/unknown annotations fix the reported TS7022 errors
in the inventory test.

Negative control uses the same new native regression with only the six handler
owners loaded from `c8a5064d0` (no checkout mutation):

```sh
TS_NODE_PROJECT=test/tsconfig.json ../../.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node --no-experimental-strip-types ../../node_modules/mocha/bin/mocha.js --no-config --require chai --require ts-node/register/transpile-only --require ../../support/specs/sails-retirement/evidence/final-review-r13/http-acceptance-negative-control.cjs --timeout 30000 --reporter json test/http/httpInputAcceptance.test.ts
```

Pinned pre-fix native owners: **26 pass / 33 expected failures**. The failures are
21 supported-input regressions (four wrong-account mutations, three translation,
eight booleans, three notation, one sync, two editor/form) and twelve missing-userid
controls. Retained results/metadata are `http-acceptance-negative-results.json`
and `http-acceptance-negative.json`. This is actual native-handler execution with
deterministic ports, not live persistence or full-institution qualification.
