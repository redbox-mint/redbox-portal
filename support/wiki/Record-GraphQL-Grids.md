# Record GraphQL grids

The authenticated read-only endpoint `POST /:branding/:portal/api/graphql` supports `record(oid: ID!)`, `records(...)` and `recordFields(...)`. These last two operations provide a backend for a visual query builder and paginated data grid. This change adds no UI or saved-grid persistence. Mutations, subscriptions, public discovery, relationship traversal and REST projection remain outside its scope.

## Enable and prepare the index

Keep the existing GraphQL route authentication and explicit persisted path read rule. By default the bootstrap rule grants Admin access; integration roles need their own applicable rule. An Admin role does not bypass record read permissions. Send bearer or session authentication and a JSON GraphQL body; responses use `application/graphql-response+json` and `Cache-Control: private, no-store`. General introspection, GraphiQL, batching and public SDL remain disabled. `__typename` remains usable in normal selections.

```javascript
recordGraphql: {
  enabled: true,
  cacheEntries: 16,
  maxVariants: 100,
  cursorSecret: process.env.RECORD_GRAPHQL_CURSOR_SECRET
}
```

Set a random secret of at least 32 characters, shared by every portal instance. Keep it out of source control. Changing the secret invalidates existing cursors. Single-record reads do not require it. Grids require the SolrSearchService structured-query adapter; other search providers must implement equivalent bounded schema and cursor-page operations before they can serve grids.

When enabled with a cursor secret, Solr schema reconciliation installs single-valued exact `redbox_grid_oid`, `redbox_grid_type`, `redbox_grid_stage`, `redbox_grid_form`, `redbox_grid_version` fields and timestamp fields `redbox_grid_created`, `redbox_grid_modified`. The unique key must be a stored indexed single-valued string with DocValues. Conflicting live definitions fail collection reads. Schema copy rules must not target the protected identifiers.

**Reindex all applicable records before using grids**, including after changing a mapping or its indexing semantics. Schema reconciliation alone does not populate existing documents. Collection queries include only grid index version `1`; unprocessed documents are absent from results. Missing protected schema fields return `REINDEX_REQUIRED`. The version marker does not certify completion of an institution's reindex job.

Readable metadata is selectable independently of indexing. To advertise metadata filtering or sorting, explicitly map its stable ID in the selected record type's search core, and supply one matching `preIndex.copy` rule. For example, merge these additions into `solr.cores.default` (retain the other existing schema and transformation rules):

```javascript
recordGraphqlFields: { 'metadata:/title': 'grid_title' },
schema: {
  'add-field': [{
    name: 'grid_title', type: 'string',
    indexed: true, stored: true, multiValued: false, docValues: true
  }]
},
preIndex: {
  copy: [{ source: 'metadata.title', dest: 'grid_title' }]
}
```

This version accepts identifier-style source path segments only (`metadata.details.note`), with no arrays or ambiguous dots inside a stored key. A mapped GraphQL name such as `dc:title` is still selectable but cannot be given index capabilities by this adapter. Targets must be safe non-reserved index names. The mapping must have exactly one matching copy source. The indexer snapshots the original scalar and restores that copy after templates and flattening; objects, arrays and null are omitted. Mapping an existing derived search field changes that destination's meaning to the original scalar, so use dedicated grid fields. Live Solr schema classes and properties, rather than name conventions, determine capabilities.

## Discover columns and capabilities

Send this authenticated request before building a query:

```graphql
query GridFields($type: String!, $stages: [String!]) {
  recordFields(recordType: $type, workflowStages: $stages) {
    revision
    variants { typeName workflowStage form }
    fields {
      id path label labelKey scalarType nullable nested repeating
      selectable availableInAllVariants filterable operators sortable
      choices { label value }
      unavailableReason
      selections { variant workflowStage form selection responsePath }
    }
  }
}
```

```json
{ "type": "dataPublication", "stages": ["draft"] }
```

The catalogue uses registered read contracts for the authenticated brand/portal. It includes configured forms and hidden workflow steps, consistent with single-record schema exposure. UI edit/view modes and role variants describe stored shapes; they are not field read permissions. Compatible variants are merged. Contributor nodes explicitly annotated `writeOnly: true` are excluded. Conditional branches merge before read exclusions are applied: a private declaration in any branch takes precedence recursively, and incompatible regions containing private descendants are closed rather than exposed as opaque JSON. Undeclared stored keys are excluded. Discovery does not load records or expose record counts or index queries.

Metadata IDs use `metadata:` followed by a JSON Pointer; record envelope IDs use `record:oid`, `record:recordType`, `record:workflowStep`, `record:form`, `record:createdOn`, `record:lastModified`. IDs are independent of generated GraphQL type names and catalogue revisions. Names and labels can change without changing the ID for a storage path. `labelKey` contains the untranslated configured `@...` key where applicable; clients can localize it and use `label` as fallback. Enum choices describe the current configuration, rather than enforcing historical enum values.

A title entry after the example mapping has this shape (the `selections` values are described immediately below):

```json
{
  "id": "metadata:/title",
  "path": "/title",
  "label": "title",
  "labelKey": "@title",
  "scalarType": "STRING",
  "nullable": true,
  "nested": false,
  "repeating": false,
  "selectable": true,
  "availableInAllVariants": true,
  "filterable": true,
  "operators": ["EQ", "CONTAINS", "IN", "EXISTS"],
  "sortable": true,
  "choices": [],
  "unavailableReason": null
}
```

Each metadata `selections` entry supplies an **executable inline fragment** in `selection`, its exact `variant` type name, stage/form, and a `responsePath` starting with `metadata`. Insert those fragments inside `nodes { metadata { __typename ... } }`. The server supplies aliases at every nested segment, so mapped keys and conflicting types in different variants remain valid when combining columns. For record-level entries, insert `selection` directly inside `nodes`; the response path starts with the record field itself. Deduplicate identical fragment text. Never derive generated names from a metadata pointer.

For example, the configured default publication draft has type name `M_dataPublication_draft_62709f3f9062122d1c62901e260f2084131a3d6c2949e0794a487e99bf8717d7`. A direct selection is shown below, but a builder should use the returned `selection`/`responsePath` values and refresh them after configuration changes.

`ids: [ID!]` optionally requests up to 50 distinct saved column IDs in their supplied order; an unknown or removed ID returns `UNKNOWN_FIELD`. A full catalogue has at most 1,000 entries. For large catalogues, first request lightweight fields without selections, then request the selected IDs with fragments to stay within the response budget.

## Collection contract and example

```graphql
query GridPage(
  $type: String!
  $stages: [String!]
  $filters: [RecordFilterInput!]
  $sort: [RecordSortInput!]
  $first: Int = 25
  $after: String
) {
  records(
    recordType: $type, workflowStages: $stages,
    filters: $filters, sort: $sort, first: $first, after: $after
  ) {
    nodes {
      oid recordType workflowStep form
      metadata {
        __typename
        ... on M_dataPublication_draft_62709f3f9062122d1c62901e260f2084131a3d6c2949e0794a487e99bf8717d7 {
          title
        }
      }
    }
    hasNextPage
    endCursor
  }
}
```

With the title mapping above and the default publication draft form:

```json
{
  "type": "dataPublication",
  "stages": ["draft"],
  "filters": [{ "field": "metadata:/title", "contains": "climate" }],
  "sort": [{ "field": "metadata:/title", "direction": "ASC" }],
  "first": 25,
  "after": null
}
```

Require exactly one registered record type. An omitted or empty stage list includes only its configured workflow stages, enforced in both the index query and current stored-record checks. Unregistered historical stages do not affect rows or `hasNextPage`. Unknown stages are errors. Each stored row's actual type/stage/form chooses its metadata union member; the client cannot substitute a different form. A field available in only some variants has `availableInAllVariants: false` and fragments only for the applicable variants. Such fields remain columns, but filtering and sorting require availability across every form in the selected workflow scope (`VARIANT_SCOPE_REQUIRED` otherwise); narrow the stages to enable those capabilities. Use `metadata.__typename` to find the matching selection and represent an inapplicable field as null in the grid. A missing declared value is returned as null. An unregistered historical form gives a nullable metadata error while retaining the record envelope.

Only non-repeating scalar fields are grid columns. Nested scalar leaves are supported through exact response paths; parent objects and opaque JSON are not columns. Repeating entries have `metadata-list:` identifiers and `repeating: true`; they cannot be columns, filters or sorts. Lists are not flattened. Fields with incompatible shapes across selected stages are unavailable; narrow the workflow scope to resolve them. Collection selections of opaque metadata regions return `UNDECLARED_METADATA` and null rather than exposing unknown children. Existing `record(oid:...)` opaque JSON behavior is preserved. Historical type mismatches retain GraphQL's nullable-field/nullable-item errors.

## Filters and sorting

Filters are an AND-only list. Each input has `field` and exactly one operator. `eq`, `in`, `gt`, `lt`, and `between` take typed values containing exactly one of `text`, `number`, `boolean`, or `dateTime`. `contains` takes a literal string; `exists` takes a boolean. Never send null as a typed value; use `exists: false` for missing/null indexed values.

| Verified index type | Metadata type | Operators | Sort |
| --- | --- | --- | --- |
| `StrField` | STRING | EQ, CONTAINS, IN, EXISTS | Single-valued + DocValues |
| `BoolField` | BOOLEAN | EQ, IN, EXISTS | Single-valued + DocValues |
| Numeric point fields | NUMBER / INTEGER | EQ, IN, GT, LT, BETWEEN, EXISTS | Single-valued + DocValues |
| `DatePointField` | STRING / DATETIME (catalogue reports DATETIME) | EQ, IN, GT, LT, BETWEEN, EXISTS | Single-valued + DocValues |
| `TextField` | STRING | EXISTS | Unavailable |

Unmapped fields and other classes advertise no operations. Text equality and contains are case-sensitive literal operations on exact strings, without tokenization or stemming. CONTAINS adds server-owned wildcard delimiters around escaped text. A value cannot supply raw Solr/Lucene syntax. Numeric inputs must be finite and within the advertised index representation; integer fields require safe integers. GT/LT are exclusive, BETWEEN is inclusive, and reversed ranges are errors. For a multi-valued index field, an operator matches an indexed value; no multi-value sorting is advertised.

Timestamp inputs require RFC 3339 with seconds, a timezone and at most three fractional digits and a UTC year in 0001–9999, for example `{ "dateTime": "2026-01-01T12:00:00+12:00" }`. Hours (including offset hours) must be 00–23, and minutes and seconds must be 00–59. Invalid component ranges, `24:00:00`, leap-second literals, invalid calendar dates, date-only inputs and ambiguous local times are rejected before UTC normalization. See [RFC 3339 section 5.6](https://www.rfc-editor.org/rfc/rfc3339.html#section-5.6) for the component grammar; leap seconds are outside this API's supported subset. Timestamps are normalized to UTC instants. Record envelope timestamps are returned as UTC ISO strings or null; legacy timezone-less envelope strings are interpreted as UTC. Metadata date indexing follows the configured pre-index normalization; use UTC/timezone-qualified source values.

The protected index copies omit null/missing/non-scalar values. `exists: true` tests indexed presence; `exists: false` tests absence. Empty strings are values for exact string fields. An analyzed text field may produce no terms for an empty or stopword-only value; its EXISTS describes indexed terms, not storage-key presence. Other comparisons exclude missing values. Sorting follows the live Solr field's missing-value rules (`sortMissingFirst`/`sortMissingLast`, or the field type's default); clients must not infer SQL null ordering. Ascending strings use Solr's exact lexicographic ordering. Explicit sorts accept ASC/DESC, and the unique index key is always appended ascending as a deterministic tie-breaker. With no explicit sort the server uses OID ascending, then unique key ascending.

Unknown IDs, unknown input properties, unsupported operators/sorts, repeated sort fields, invalid types and oversize values return errors. No requested operation is silently ignored. A readable field can remain a column while having `filterable: false` and `sortable: false`.

## Pagination, permissions and consistency

`first` defaults to 25 and must be 1–50. `hasNextPage` is based on an additional authorized matching row. `endCursor` is null when exhausted; otherwise supply it as `after` with the same query, sort and page size. Cursors are encrypted/authenticated, expire after one hour, and bind the caller identity/roles, brand, portal, search core, catalogue/index configuration and query context. Invalid, changed-scope, stale or expired cursors return `INVALID_CURSOR`. Store grid choices, not cursors, for reusable grids.

The resolver requests bounded cursor batches from Solr and hydrates candidates through the actual runtime RecordsService override. It checks stored brand, record type/stage and `hasViewAccess` before choosing page boundaries or calculating `hasNextPage`. Metadata-filtered or metadata-sorted queries also require the stored stage/form to have a registered read contract in that scope, so historical or stale-index form values cannot expose undeclared fields through matching or order. Indexed ACLs are deliberately not treated as authoritative: newly granted access must not be hidden by a stale ACL index, and custom service overrides must still run. No totals or estimates are returned. Invisible hits consume internal work but appear in neither rows, cursors nor counts.

At most 200 candidates (four batches of 50) are considered per request. If the resolver cannot prove a full page plus authorized lookahead, or exhaustion, within that budget, the entire collection field fails with `COLLECTION_LIMIT`; it does not return a short page or skip visible hits. Narrow the filters/stages or reduce page size. Sparse visibility across a broad index may require a future search backend with proven equivalence to runtime authorization. This version provides correct bounded pages, not unrestricted export scanning. Storage/search outages and partial Solr results fail the collection field; they are not treated as an empty result. Runtime `getMeta` overrides should return null/undefined for absent records; thrown provider errors fail the page. Single-record exception handling retains its existing not-found behavior.

Pagination is not a snapshot. On an unchanged index the unique tie-breaker makes equal-sort values deterministic. Inserts, removals, changed sort values, reindexing or permission changes between requests can cause duplicates, omissions or cursor invalidation. Refresh/restart for a current view; deduplicate by OID. Current authorization is rechecked on every page. Metadata is hydrated from current record storage, but filters/sorts use the asynchronously maintained index. Values can therefore differ from the indexed values that matched, and newly saved records may not appear until indexing finishes. Stored type/stage are rechecked, so recently transitioned candidates can disappear from an old indexed scope. Do not use grid results as transactional validation.

## Resource limits and client errors

In addition to the page and candidate limits: at most 10 filters, 3 explicit sort fields, 20 IN values, 256 UTF-8 bytes per filter value, 20 distinct stages, 50 requested catalogue IDs, and 8 KiB per cursor. One operation can include at most one collection and one catalogue, with five root record operations in total. Existing limits remain: 64 KiB request JSON, 2,000 parser tokens, 200 expanded fields, depth 12, 2,000 selection steps, 10,000 execution work units, 256 KiB response and five-second execution deadline. Storage reads are request-local cached by OID, including single-record aliases and collection lookahead. Solr schema/search calls have bounded response bytes and deadline-based aborts. Generated search parameters use a form-encoded POST body capped at 256 KiB, so the effective configured stage scope does not depend on URL length limits. Reduce selected columns if selection, work or response limits are reached.

Useful `errors[].extensions.code` values include `UNKNOWN_FIELD`, `UNKNOWN_RECORD_TYPE`, `UNKNOWN_WORKFLOW_STAGE`, `UNSUPPORTED_FILTER`, `INVALID_FILTER_VALUE`, `UNSUPPORTED_SORT`, `INVALID_PAGE_SIZE`, `INVALID_CURSOR`, `REINDEX_REQUIRED`, `UNSUPPORTED_SEARCH_INDEX`, `COLLECTION_UNAVAILABLE`, `COLLECTION_LIMIT`, `SEARCH_UNAVAILABLE`, `STORAGE_UNAVAILABLE`, `QUERY_LIMIT` and `QUERY_TIMEOUT`. GraphQL validation also rejects unknown fields/operators/input properties. Check errors before displaying page metadata. Authentication/route failures still happen before GraphQL execution; the disabled endpoint returns 503.

## Saved grid shape

A client can persist this JSON in its own configuration store:

```json
{
  "version": 1,
  "recordType": "dataPublication",
  "workflowStages": ["draft"],
  "columns": ["record:oid", "metadata:/title", "record:workflowStep"],
  "filters": [{ "field": "metadata:/title", "contains": "climate" }],
  "sort": [{ "field": "metadata:/title", "direction": "ASC" }],
  "pageSize": 25
}
```

On load, refresh the catalogue for that scope. Resolve every column/filter/sort ID and verify scalar types, operators and sort capabilities. Report missing or changed capabilities rather than silently dropping or reinterpreting them. The optional catalogue `revision` helps detect change but is not a persistent field identity. A reused storage path with changed business meaning requires an institution-managed grid migration; the API cannot infer that semantic change. Save neither generated type names nor fragment aliases as the sole identity. Generate selections from the current catalogue.

## Verification and references

Core regression tests: `npm --prefix packages/redbox-core run test:record-graphql`. Docker HTTP tests use `RBPORTAL_MOCHA_TEST_PATHS` with `test/integration/services/RecordGraphqlService.test.ts` and `test/integration/services/RecordGraphqlGrid.test.ts` through `npm run test:mocha:mount`. Grid HTTP fixtures add synthetic scalar fields to the title-only publication draft stub and exercise real Solr, MongoDB, bearer authentication and route policies. They are not institution-specific production form coverage.

See [Configuring Solr](Configuring-Solr), [Record Schema Contract Contributors](Record-Schema-Contract-Contributors), [Solr cursor pagination](https://solr.apache.org/guide/solr/latest/query-guide/pagination-of-results.html), [Solr query parsers](https://solr.apache.org/guide/solr/latest/query-guide/other-parsers.html) and [Solr field properties](https://solr.apache.org/guide/solr/latest/indexing-guide/field-type-definitions-and-properties.html).
