> Historical Solr evidence. After the 18 November 2026 rebase onto `feature/graphql-mongo-collections`, GraphQL collections use Mongo storage. The Solr bindings and reindex steps below are not required for current GraphQL collections. Declared scalar fields receive Mongo capabilities directly; scalar lists currently remain unavailable for filtering/sorting. See `scu-grid/README.md` for the rebase scope.

# Business metadata filter and sort capabilities: finding 5

Sanitized implementation evidence, 17 November 2026. No customer record values,
raw configuration documents, credentials, or private audit bundle are included.
The source audit and reproduction inputs remain outside version control.

## Cause and verified sources

The private audit reported zero filterable business fields across six record
types. The checked-out SCU hook (`.tmp/scu-grid/hook22`, branch
`feature/v5-refactor`) does not register `recordGraphqlFields` or Solr configuration.
The portal default has existing analyzed title/keyword fields and preIndex
transforms, but no business grid opt-ins. Those transforms alone do not certify
an exact field's source, cardinality, or live index type. Missing opt-ins explain
the deployed capability gap; hyphenated property names are already accepted by
`gridIndexBindings`. Colons are accepted too.

Private shape evidence confirms these actual properties without exposing values:

| Metadata property | Observed shape | Intended explicit representation |
| --- | --- | --- |
| `title` | string | single exact string; sorting requires DocValues |
| `finalKeywords` | array of strings | multivalued exact string; element filters, no sort |
| `scu-rdmp-data-classification-item-outcome` | string | single exact string |
| `dc:coverage_vivo:DateTimeInterval_vivo:start` | string | explicit `pdate`, after verifying parseable calendar values |

`irma-id` is a string in some records and an object in others. Contributor fields
also contain objects and object lists. Neither these fields nor arbitrary object
leaves are silently certified as scalar filters. A hook must supply accurate
read contracts and select a compatible workflow/form scope. No SCU names are
bound in portal runtime configuration or implementation.

There was a second, generic portal gap: explicitly mapped scalar lists were
classified as JSON/repeating and rejected by discovery, and `preIndex()` removed
their destination after flattening because it restored only primitive scalars.

## Implementation and semantics

- Preserve homogeneous scalar arrays as a single explicit multivalued Solr field,
  snapshotting before configurable templates can mutate the source. Reject
  object, nested, mixed-type and non-finite lists without coercion.
- Recognize scalar-list parent fields in discovery. Each predicate matches an
  element. Several predicates on a list can match different elements; this does
  not express same-element correlation. Repeated object children stay unavailable.
- Exact strings support EQ, literal CONTAINS, IN and EXISTS. Analyzed text remains
  existence-only. Dates require the verified live date type; single date fields
  can support ranges and sorting. Lists cannot sort or use the single-value
  case-insensitive prefix companion.
- Require live field cardinality compatible with the read contract. Required
  fields, defaults, unique-key destinations, and incoming Solr copy rules cannot
  manufacture metadata capabilities. Existing identifier/ACL protections, query
  bounds, scope checks, caller authorization, cursor ordering and OID de-duplication
  remain enforced.
- Source changes are in index bindings, Solr preIndex and configuration types.
  Catalogue changes are integrated in `catalogue.ts`. The delegate verified its proposed
  patch through a private test overlay before parent integration; final checks use the
  production module directly. UI/shared filter and saved-grid persistence guards also
  accept verified scalar lists; object lists and list sorts remain unavailable.

## Minimal hook-owned opt-in example

This reviewed example uses properties verified in the private shape evidence.
It is proposed configuration, not a claim about the deployed Solr schema. Merge
these entries into the existing default core without dropping its schema,
transforms, ACL fields, or copy rules. Use fresh destination names to avoid
persisted schema conflicts. The hook owns enabling this configuration and
checking its read contracts and actual date contents.

```ts
recordGraphqlFields: {
  'metadata:/title': 'grid_business_title_v1',
  'metadata:/finalKeywords': 'grid_business_keywords_v1',
  'metadata:/scu-rdmp-data-classification-item-outcome': 'grid_business_classification_v1',
  'metadata:/dc:coverage_vivo:DateTimeInterval_vivo:start': 'grid_business_start_v1',
},
// Append to schema['add-field']; none has a default or required: true.
// No Solr copyField may target these fields, including wildcard destinations.
// Existing * -> full_text copies need not be removed.
'add-field': [
  { name: 'grid_business_title_v1', type: 'string', indexed: true,
    stored: true, multiValued: false, docValues: true },
  { name: 'grid_business_keywords_v1', type: 'string', indexed: true,
    stored: true, multiValued: true, docValues: false },
  { name: 'grid_business_classification_v1', type: 'string', indexed: true,
    stored: true, multiValued: false, docValues: true },
  { name: 'grid_business_start_v1', type: 'pdate', indexed: true,
    stored: true, multiValued: false, docValues: true },
],
// Append to preIndex.copy; source paths refer to the original record envelope.
copy: [
  { source: 'metadata.title', dest: 'grid_business_title_v1' },
  { source: 'metadata.finalKeywords', dest: 'grid_business_keywords_v1' },
  { source: 'metadata.scu-rdmp-data-classification-item-outcome',
    dest: 'grid_business_classification_v1' },
  { source: 'metadata.dc:coverage_vivo:DateTimeInterval_vivo:start',
    dest: 'grid_business_start_v1' },
],
```

Reconcile the explicit schema and inspect the effective live definitions/types
and incoming copy rules. Existing fields with conflicting definitions are not
replaced automatically. Reindex **all affected existing records** using the
portal's index-only record processing path. New mappings do not populate old
documents, and schema discovery cannot certify reindex completeness. Compare
sampled source/index values, totals, missing values, scope boundaries and real
query results before making a grid available to users. The example does not add
researcher-object filters, project-ID coercions, or mappings for unseen fields.

## Reproduction and verification ledger

Commands below were run from this worktree. Private scripts are intentionally
untracked; committed regression tests use synthetic values and verified property
names/shapes only. `index-before.log` and `index-after.log` contain sanitized
counts and capability descriptions, not record contents.

1. Read the private report, evidence structure and reproduction-input shapes;
   inspected SCU hook configuration using `rg` for `recordGraphqlFields`, `solr`
   and `preIndex`. Reused the parent's exact 16 compiled workflow/form contracts.
   Ran:

   ```sh
   TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node \
     --no-experimental-strip-types \
     -r ./packages/redbox-core/node_modules/ts-node/register/transpile-only \
     .tmp/scu-grid/index-capabilities.private.ts
   ```

   Before the catalogue fix, without business opt-ins: RDMP active total 228 fields,
   Data Publication all-stage total 166, other four types 8 each; **zero filterable
   metadata fields for every type**. The RDMP active catalogue has 113 ordinary
   metadata IDs; additional entries are repeated-child `metadata-list:` IDs.
   Explicit title, hyphenated classification and colon-bearing date opt-ins
   already worked. Even with an explicit multivalued keyword mapping,
   `finalKeywords` remained JSON, `REPEATING_FIELD`, no operators, no sort.

2. Ran the new `business-index.test.ts` against the unchanged catalogue:
   **3 passing, 4 failing**. Failures demonstrate scalar-list type rejection,
   missing single/list compatibility checks, scope behavior and rejected list
   collection filters. The proposed catalogue overlay initially yielded **7 passing**, then **8 passing**
   after adding the mixed scalar/list variant regression.

3. Ran the new preIndex regression with original HEAD versions of index bindings
   and `SolrSearchService` loaded through a test-only module overlay:

   ```sh
   cd packages/redbox-core
   TS_NODE_PROJECT=test/tsconfig.json node_modules/.bin/mocha --no-config \
     --node-option no-experimental-strip-types \
     --require ts-node/register/transpile-only \
     --require ../../.tmp/scu-grid/index-baseline-overlay.cjs \
     --require chai --require test/setup.ts \
     test/services/SolrSearchService.test.ts --grep 'retains opted-in scalar lists'
   ```

   **0 passing, 1 failing**: mapped keywords expected `['alpha', 'beta']`, actual
   `undefined`. With the source fix the regression passes, including snapshot
   protection, date normalization, invalid lists, empty lists, identifiers and ACL.

4. Ran the actual-config capability script with the proposed catalogue overlay
   (`-r ./.tmp/scu-grid/catalogue-overlay.cjs`): explicit `finalKeywords` becomes
   STRING/repeating with EQ, CONTAINS, IN, EXISTS and **sortable false**. Title and
   classification remain sortable exact strings; the explicit date is DATETIME
   with date comparisons. Without hook opt-ins every type still has zero business
   filter capabilities, as intended.

5. Ran the targeted regression suite:

   ```sh
   cd packages/redbox-core
   TS_NODE_PROJECT=test/tsconfig.json node_modules/.bin/mocha --no-config \
     --node-option no-experimental-strip-types \
     --require ts-node/register/transpile-only \
     --require ../../.tmp/scu-grid/catalogue-overlay.cjs \
     --require chai --require test/setup.ts \
     test/unit/record-graphql/business-index.test.ts \
     test/unit/record-graphql/grid.test.ts \
     test/unit/record-graphql/iprefix.test.ts \
     test/unit/record-graphql/read-privacy.test.ts \
     test/unit/record-graphql/read-variants.test.ts \
     test/unit/record-graphql/schema.test.ts \
     test/services/SolrSearchService.test.ts
   ```

   **248 passing, 1 pending** (live Solr opt-in absent). The collection regression
   includes denied records and duplicate index OIDs, returning each authorized
   OID once. `tsc --noEmit -p test/tsconfig.record-graphql.json` passed. A TypeScript
   compiler-host overlay also checks the proposed catalogue without changing the
   parent-owned source file: **0 diagnostics**.

6. Docker socket access initially failed. Parent coordination established
   passwordless `sudo -n docker` through sandbox escalation. Started only this
   task's disposable `scu-grid-index-regression` container with `solr:8.11.1`,
   `solr-precreate scu-grid`, localhost-only ephemeral port 32772. No other
   worktree/container was changed. Ran the same business tests with:

   ```sh
   SCU_GRID_SOLR_URL=http://127.0.0.1:32772/solr/scu-grid \
   TS_NODE_PROJECT=test/tsconfig.json node_modules/.bin/mocha --no-config \
     --node-option no-experimental-strip-types \
     --require ts-node/register/transpile-only \
     --require ../../.tmp/scu-grid/catalogue-overlay.cjs \
     --require chai --require test/setup.ts \
     test/unit/record-graphql/business-index.test.ts
   ```

   **9 passing**, including actual Solr schema introspection and actual service
   preIndex output. Keyword `alpha` matches only `a`; `beta` matches `a,b`; a third
   record sharing `beta` is denied by the fixture ACL. Exact classification and
   normalized date ranges match the expected rows. Descending title order is
   `b,a`, and exact `Alpha` does not match `Alpha plan`. These are synthetic
   records, not deployed customer data. The live test exposed and corrected a
   mock text-field definition that incorrectly requested DocValues; no production
   capability was inferred from that mock. The task container was removed with
   `sudo -n docker rm --force scu-grid-index-regression` after verification.

## Remaining integration limits

The parent must integrate the catalogue patch alongside its fingerprint changes
and rerun the ordinary suite without the overlay. The frontend owner must honor
advertised scalar-list filter operators; old blanket `!repeating` UI guards hide
these filters. List sorts stay disabled.

The combined RecordGraphqlService/registration suite currently fails during module
loading because `packages/raido/dist/index.js` requires missing generated `./api`.
The targeted 248-test result excludes those suites. No external dependency
symlinks were modified to work around this.

No hook mappings were deployed and no customer index was reprocessed. Exact date
contents, production schema definitions, production reindex completeness,
non-admin deployment behavior and realistic customer-record result totals still
require deployment verification. Scalar-list SQL-style same-element correlation
and repeated-object filtering are deliberately unavailable. Existing resource
limits are unchanged.

Parent verification also passed 20 saved-grid service tests, including persistence/reopen of a verified scalar-list predicate and rejection of list sorting. Shared filter/fingerprint checks passed 32 tests. The record-contract suite passed 92 tests with unchanged write-schema snapshots.
