# SCU real-configuration grid regression ledger

17 November 2026. Private diagnostic inputs and screenshots were not added to Git. This work used the complete supplied branding-scoped v5 forms and actual SCU `feature/v5-refactor` reusable definitions before reducing fixtures. Scalar record contents were constructed from the supplied kind descriptors; they are synthetic, not imported customer records.

## Base and reproduction inputs

The assigned checkout began at master `1058d0b1c`. Master contains neither the GraphQL nor the explorer implementation. The bugfix branch was fast-forwarded to the existing explorer stack base `224ed41ff` (`origin/feature/record-explorer-ux`), which contains the audited implementation. The SCU hook clone used for reproduction was `4c24dc9` on `feature/v5-refactor`. The user-provided clone was on legacy `main`; it was read without modification.

Of the 24 exported form documents, 13 contain the runtime v5 `configuration`. The remaining 11 are legacy duplicates, without that property. The runtime documents plus 16 exported workflow steps and six record types compile into 16 variants. Three SCU reusable definitions were initially missing; after obtaining the actual hook, all 16 compiled. No reconstructed definitions were used for the accepted baseline.

Baseline command, from the repository root (scripts and raw input remain private):

```sh
node --no-experimental-strip-types -r ./.tmp/scu-grid/baseline-loader.cjs .tmp/scu-grid/baseline.ts
```

The loader reads immutable `224ed41ff` sources from Git, so concurrent fixes cannot alter before measurements. It does not change source files. Accepted output is `.tmp/scu-grid/immutable-baseline.log`; earlier missing-definition/reconstructed probes are explicitly excluded from acceptance evidence.

## Issue ledger

| Finding | Baseline failure and root cause | Implementation and after evidence |
| --- | --- | --- |
| 1. All-stage RDMP | Exact per-stage counts `224,224,228,228,230,230,230`; publication 166. All-stage RDMP fails `CATALOGUE_LIMIT`, including `records(recordType:"rdmp",first:2){nodes{oid workflowStep}hasNextPage}`. The canonical snapshot is **1,754,262 bytes / 43,731 nodes**: byte cap 1 MiB fails; node cap 50,000 does not. The catalogue alone is 1,137,424 bytes; contracts 611,729, schema 2,468, config 2,595 (plus wrapper punctuation). | Hash fields/contracts independently, then hash their ordered summaries. Each part retains 1 MiB/50k-node bounds; aggregate work is capped at 8 MiB/250k nodes and 1,104 parts. Field/stage/query/response/cursor bounds remain. Reduced fixture has all 16 variants and exact single-stage counts: **2 failing / 2 passing before**, all four passing afterward. The combined all-stage union has 234 fields; it need not equal the largest individual stage. Minimal HTTP query returns authoritative unique record OIDs. Selecting a stage after failed discovery now supplies defaults when columns are empty. |
| 2. Editor schema | Exact global SDL is **333,747 bytes**, above the endpoint's 262,144-byte bound. Type-scoped SDL is **238,422 RDMP / 95,738 publication**, within that same cap. A separate regression with an unrelated broken reusable form fails valid selected-type schema construction before the change. | Scope editor schema requests by selected type/stage; filter candidates before compiling and fingerprinting; retain authenticated admin route, bounded cache and original SDL cap. Execution/named-query validation still use their complete schemas. Server chronicle records underlying failures; public errors remain generic. Schema failure/retry appears outside collapsed advanced details. Broken-unrelated-form regression: **1 failing before / 1 passing after**. Oversized global/unscoped discovery still fails closed. |
| 3. Contributor/classification reads | All six publication carriers are hidden SimpleInputs populated by expressions: STRING inference conflicts with two objects and four arrays. Outcome details is a JSONata object-array projection. Question-tree single-answer fields were inferred as arrays. Exact-form synthetic draft/queued probes each produced **eight HISTORICAL_VALUE_TYPE errors**. | Explicit bounded `readShape` declarations describe expression carriers; generic question-tree contribution follows scalar radio versus list checkbox storage. Hook declarations retain only explicit person/outcome properties. The exact supplied publication forms with these declarations produce **zero errors** in each probe. Null, absent, empty, extra-private and genuine incompatible historical values are separately covered. See the read-contract ledger for the required hook changes. |
| 4. Partial results | Controlled three-row HTTP response with a failed alias rejects `preview-failed` and discards usable rows. Before Visual change: **1 failed, 43 passed**. Before free-form change: **1 failed, 49 passed**. | Retain usable Grid/JSON data, safe codes/paths, alias-to-field labels and verified record OIDs; distinguish failed cells from nulls. Raw responses use an explicit optional envelope. Top-level/transport failures, bad identities and invalid pagination remain fatal. Sequence/stale protections are covered. Intermediate selections: **109** and **122** passing. Full integrated data-grid suite: **200 passing**. |
| 5. Business filtering/sorting | SCU hook has no `recordGraphqlFields` opt-ins; default analyzed transforms do not certify exact bindings. Hyphens/colons already work. A second generic failure drops scalar-list destinations during indexing and rejects even explicitly verified lists in discovery/UI/persistence. | Preserve homogeneous scalar lists; expose element predicates only for verified live cardinality/type and exact preIndex source mappings. Lists cannot sort or use single-value prefix companions. UI/shared filter/persistence guards now accept verified scalar lists. Required/defaulted destinations, unique/ACL identifiers and copy-rule collisions remain excluded. Delegate: **248 passing, nine live disposable-Solr cases passing**. Explicit title/keyword/classification/date hook mappings and local reindex sequence are documented separately. No deployment mapping was inferred or enabled remotely. |
| 6. Lookup identities | Exact Party/Activity/Funding/Jira catalogues each have eight fields and generic `/title`; actual identity keys are absent from declared contracts. Synthetic lookup defaults reproduce null titles. | Form `readMetadata[recordType]` explicitly declares readable properties, scalar identity and ordered defaults. This scopes shared generated forms correctly. UI consumes unanimous selectable hints; saved selected columns remain unchanged. With documented opt-ins: Party 15, Activity 24, Funding 10, Jira 24 fields; each synthetic default identity is nonempty with zero errors. No raw-record schema inference. |

Additional detail and exact minimal client configuration:

- [Read contracts and lookup mappings](../scu-grid-read-contracts.md)
- [Index bindings, semantics and reindex example](../scu-grid-index-capabilities.md)
- [Partial-response regressions](../scu-grid-partial-results.md)

## Commands and completed checks

```sh
npm --prefix packages/redbox-core run test:record-graphql
```

Result: **172 passing, one existing pending**, including TypeScript checking. The dedicated catalogue/schema/fingerprint selection passed nine checks; shared filter/fingerprint selection passed 32. `tsc -p packages/redbox-core/tsconfig.json`, root TypeScript compilation, common-library compilation, data-grid and local-auth Angular development builds passed. Webpack completed with existing asset-size warnings.

From `angular/`:

```sh
CHROME_BIN=/usr/bin/chromium ./node_modules/.bin/ng test @researchdatabox/data-grids --watch=false --browsers=ChromeHeadlessNoSandbox
```

Result: **200 passing**. The test browser requires local server binding outside the sandbox.

Repository Docker integration harness, project `scu-grid-regression`, after package builds and shim generation:

```sh
sudo -n docker compose -p scu-grid-regression --profile mount -f support/integration-testing/docker-compose.mocha.yml run --rm --no-deps --entrypoint bash redboxportal-mount -lc 'TS_NODE_PROJECT=tsconfig.json TS_NODE_TRANSPILE_ONLY=true node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --config test/integration/.mocharc.js --exit test/bootstrap.test.ts test/integration/services/RecordGraphqlService.test.ts test/integration/services/RecordGraphqlGrid.test.ts test/integration/services/SavedGridService.test.ts'
```

Result: **37 passing** over Sails, Mongo and Solr: authenticated read/discovery, route permissions, non-admin schema denial, brand/portal isolation, typed filters/sorts, cursor paging and saved-query lifecycle. An initial wrapper invocation treated space-separated paths as one filename and ran zero tests; that result is excluded. The corrected command above is the accepted integration run.

The separate exact-configuration browser harness uses the full deployed v5 forms and hook definitions with explicit proposed read/index opt-ins. It materialized **144 synthetic records**, including 36 draft RDMPs, three publications, 25 each Party/Activity/Funding/Jira. Indexing all records twice left **144 indexed documents**. It uses a local test-only cursor secret. No shared test host was deployed, restarted, modified or reindexed; other thread containers were untouched.

## Authenticated local browser evidence

The accepted local browser/API probe passed all 16 type/stage discovery and minimal collection checks. With the proposed contracts, RDMP stages expose 213/213/217/217/219/219/219 fields, publication stages 228, and lookup catalogues 15/24/10/24. These after counts differ from baseline because question answers now follow scalar storage and explicit object properties become selectable. Scoped SDL returns HTTP 200 (RDMP 238,309 bytes; publication 134,057 bytes). The exact audited 30-column publication query returns three rows and zero errors.

Draft pagination returns 25+11 rows, 36 unique OIDs and no further page; descending first:50 returns 36 unique ordered rows. Verified title equality matches one row, keyword element filtering 36, and the date probe five. Each lookup returns 25 nonempty configured identities. The UI also renders Party defaults with full name/email/ORCID and synthetic values. These checks used the isolated local harness and proposed hook opt-ins, not the shared SCU host. Controlled partial-error UI regressions remain necessary because truthful contracts remove the original contributor errors.

## Reviewable branch stack

All branches are local and depend on the existing explorer stack at `224ed41ff` (`origin/feature/record-explorer-ux`). Each row's base is the preceding row's branch, starting at that explorer branch. No PR was opened or deployment made.

| Branch | Head | Proposed PR title and scope | Validation |
| --- | --- | --- | --- |
| `bugfix/scu-grid-01-read-contracts` | `2438750a0` | Declare bounded metadata read shapes and identity hints | Real-form before/after probes; read-authoring and contract tests |
| `bugfix/scu-grid-02-catalogue-schema` | `cdf990fc9` | Bound composite catalogue fingerprints and scope editor schemas | Exact seven-stage fixture; scoped/unrelated-form and size regressions |
| `bugfix/scu-grid-03-index-capabilities` | `6df246f5e` | Verify business index bindings and support scalar-list predicates | 248 checks; nine disposable Solr cases; selected Docker integration |
| `bugfix/scu-grid-04-variant-complexity` | `c00ac31e9` | Count executable metadata variants within query limits | Full contributor selection and same-type over-limit regressions |
| `bugfix/scu-grid-05-ui-results` | `838352292` | Retain partial grid results and use scoped schemas and configured identities | Complete Angular suite; controlled before/after partial responses; local browser probe |

The final integration branch is `bugfix/scu-real-world-data-grids`, including this ledger. Backend combined verification is 172 passing/one existing pending; selected Docker integration is 37 passing. The UI layer completes the cross-layer schema and scalar-list changes, so release the complete stack together. A Codex Hub review found a mixed-type free-form schema edge case: selecting only the first root type excluded other metadata fragments. A new regression failed before correction (one failing, 11 passing); the editor now scopes only when all record selections agree on a known type, otherwise requesting the existing bounded global schema. This includes fragments and unknown-OID reads. The final Angular suite passed 200 tests. An oversized global schema still fails closed with visible retry guidance; a mixed-type editor query may therefore remain unavailable at SCU until a bounded combined-schema endpoint exists.

## Scope and release requirements

Portal fixes do not supply institutional policy. Findings 3, 5 and 6 require the explicit SCU hook declarations and index mappings described above to be bootstrapped/migrated into stored forms. Unchanged SCU configuration cannot accurately reveal those absent contracts. These opt-ins were applied only in the isolated synthetic harness. Legacy values that truly disagree with the declared shape still produce field errors, now visible alongside partial data.

Validate in this order: build/install the portal fixes; add reviewed hook read declarations and identity/default hints for every relevant stage; register fresh exact/text/list/date index destinations and unambiguous copies; reconcile the local schema and reindex while preserving storage/OID identity; verify counts and unique OIDs; run these regression suites and the browser scenarios; then plan an institution-controlled release. Raw global SDL above 256 KiB remains unavailable; the editor uses a bounded selected scope, and errors explain when schema validation is unavailable. Date bindings require actual calendar-value verification, not only shape descriptors. No PR was opened, merged or deployed.
