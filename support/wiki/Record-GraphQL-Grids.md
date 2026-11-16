# Record GraphQL grids

The authenticated read-only endpoint `POST /:branding/:portal/api/graphql` supports `record(oid: ID!)`, `records(...)` and `recordFields(...)`. These last two operations provide a backend for a visual query builder and paginated data grid. The admin Record explorer uses these operations and saves reusable visual or GraphQL queries through the scoped saved-grid API. Mutations, subscriptions, public discovery, relationship traversal and REST projection remain outside its scope.

## Record explorer workspace

Open **Admin → Records and reporting → Record explorer**
(`/:branding/:portal/admin/data-grids`). The left rail contains saved queries,
search, publication badges and a link to Named queries. Selecting a saved query
loads its current definition and results. The query card holds Save, Publish or
Update, and an overflow menu with Save as, Rename and Delete. Changes stay in the
draft until saved. Publication metadata does not itself make a query dirty.

**Visual** and **GraphQL** are two views of one query. Choose a record type,
workflow stage, sort and row limit; edit condition chips and selected columns;
then **Run query**. The Results card offers Grid and JSON in either view, with
cursor paging below it. Results are marked stale after query changes. New queries
prefer Title, Workflow stage, Last modified and OID where available; existing
saved column choices are preserved.

**Edit columns** opens a side panel. Search grouped fields, expand a group and
select fields. Repeating child fields sit behind an explanation; select the
supported parent group where appropriate. Reorder shown chips by drag, arrow
keys, Home or End. **Apply and run** commits the detached selection and reruns;
Cancel/Escape retains the prior selection and restores focus. Grid detail buttons
open a labelled dialog for structured values and return focus on Escape.

Generated GraphQL follows Visual and stays read-only. **Unlink and edit** makes
GraphQL canonical and Visual read-only. Variables and full schema details are
under disclosures; the field list uses friendly labels. Switching views retains
query identity, dirty state and results. Schema loading and validation happen on
demand; unchanged documents are not reparsed on every render.

**Publish as named query…** first saves an unsaved source, then opens a side panel
with Basics, Parameters, Lookup fields and Preview. Publishing retains the link;
**Published as** opens the named editor. Named queries can also select a saved
source through Create. **Open in explorer** and Built from links use
`#grid=<saved-query-id>` to reopen the correct source and run its results. See
[Configuring Named Queries](Configuring-Named-Queries#create-and-edit-in-admin)
for publication, review/update and missing-source behavior.

The default sidebar groups both screens together. Persisted institution sidebar
overrides need their own navigation update. Hook logo/footer partials should
provide meaningful image alt text and avoid inline style attributes; core's
banner and footer landmarks contain their rendered content. HTTP demo origins
cannot satisfy Lighthouse's HTTPS and COOP checks; production needs HTTPS.

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

This version accepts identifier-style source path segments, including colons (`metadata.details.note`, `metadata.dc:identifier`), with no arrays or ambiguous dots inside a stored key. The ID `metadata:/dc:identifier` names one literal metadata key, not a nested `dc.identifier` path. Targets must be safe non-reserved index names. The mapping must have exactly one matching copy source. The indexer snapshots the original scalar and restores that copy after templates and flattening; objects, arrays and null are omitted. Mapping an existing derived search field changes that destination's meaning to the original scalar, so use dedicated grid fields. Live Solr schema classes and properties, rather than name conventions, determine capabilities.

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

The catalogue uses registered read contracts for the authenticated brand/portal. It includes configured forms and hidden workflow steps, consistent with single-record schema exposure. UI edit/view modes and role variants describe stored shapes; they are not field read permissions. Compatible variants are merged. Contributor nodes explicitly annotated `writeOnly: true` are excluded. Conditional branches merge before read exclusions are applied: a private declaration in any branch takes precedence recursively, and incompatible regions containing private descendants are closed rather than exposed as opaque JSON. Private array-item declarations are also excluded from discovery, including item identifiers, descriptions and enum choices; a readable repeating parent may remain listed. Undeclared stored keys are excluded. Discovery does not load records or expose record counts or index queries.

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

Filters are an AND-only list. Each input has `field` and exactly one operator. `eq`, `in`, `gt`, `lt`, and `between` take typed values containing exactly one of `text`, `number`, `boolean`, or `dateTime`. `contains` and `iprefix` take literal strings; `exists` takes a boolean. Never send null as a typed value; use `exists: false` for missing/null indexed values.

| Verified index type | Metadata type | Operators | Sort |
| --- | --- | --- | --- |
| `StrField` | STRING | EQ, CONTAINS, IN, EXISTS | Single-valued + DocValues |
| `StrField` with verified opt-in companion below | STRING | Also IPREFIX | Raw binding's sort capability is unchanged |
| `BoolField` | BOOLEAN | EQ, IN, EXISTS | Single-valued + DocValues |
| Numeric point fields | NUMBER / INTEGER | EQ, IN, GT, LT, BETWEEN, EXISTS | Single-valued + DocValues |
| `DatePointField` | STRING / DATETIME (catalogue reports DATETIME) | EQ, IN, GT, LT, BETWEEN, EXISTS | Single-valued + DocValues |
| `TextField` | STRING | EXISTS | Unavailable |

Unmapped fields and other classes advertise no operations. Text equality and contains are case-sensitive literal operations on exact strings, without tokenization or stemming. CONTAINS adds server-owned wildcard delimiters around escaped text. A value cannot supply raw Solr/Lucene syntax. Numeric inputs must be finite and within the advertised index representation; integer fields require safe integers. GT/LT are exclusive, BETWEEN is inclusive, and reversed ranges are errors. For a multi-valued index field, an operator matches an indexed value; no multi-value sorting is advertised.

Timestamp inputs require RFC 3339 with seconds, a timezone and at most three fractional digits and a UTC year in 0001–9999, for example `{ "dateTime": "2026-01-01T12:00:00+12:00" }`. Hours (including offset hours) must be 00–23, and minutes and seconds must be 00–59. Invalid component ranges, `24:00:00`, leap-second literals, invalid calendar dates, date-only inputs and ambiguous local times are rejected before UTC normalization. See [RFC 3339 section 5.6](https://www.rfc-editor.org/rfc/rfc3339.html#section-5.6) for the component grammar; leap seconds are outside this API's supported subset. Timestamps are normalized to UTC instants. Record envelope timestamps are returned as UTC ISO strings or null; legacy timezone-less envelope strings are interpreted as UTC. Metadata date indexing follows the configured pre-index normalization; use UTC/timezone-qualified source values.

The protected index copies omit null/missing/non-scalar values. `exists: true` tests indexed presence; `exists: false` tests absence. Empty strings are values for exact string fields. An analyzed text field may produce no terms for an empty or stopword-only value; its EXISTS describes indexed terms, not storage-key presence. Other comparisons exclude missing values. Sorting follows the live Solr field's missing-value rules (`sortMissingFirst`/`sortMissingLast`, or the field type's default); clients must not infer SQL null ordering. Ascending strings use Solr's exact lexicographic ordering. Explicit sorts accept ASC/DESC, and the unique index key is always appended ascending as a deterministic tie-breaker. With no explicit sort the server uses OID ascending, then unique key ascending.

Unknown IDs, unknown input properties, unsupported operators/sorts, repeated sort fields, invalid types and oversize values return errors. No requested operation is silently ignored. A readable field can remain a column while having `filterable: false` and `sortable: false`.

### Literal prefix with ASCII case folding

`{field: "metadata:/dc:identifier", iprefix: "uOn-"}` matches the start of the full stored string, ignoring **ASCII A–Z case only**. For stored string S and prefix P, the contract is `foldAsciiCase(S).startsWith(foldAsciiCase(P))`; the fold replaces A–Z with a–z one code unit at a time. Every other UTF-16 code unit is unchanged. There is no trimming, tokenization, accent removal, Unicode case folding or Unicode normalization. For example, `UON-ΟΣΑ` matches `uon-ΟΣ` but not `uon-οσ` or `uon-ος`; `École` matches `É` but not `é` or decomposed `E\u0301`. Turkish İ/ı, ß/ẞ and fullwidth letters retain their exact distinctions. Spaces, punctuation, controls and supplementary characters are literal text.

Queries must be nonempty, well-formed UTF-16 strings of at most 256 UTF-8 bytes; empty, null, malformed or oversized values return `INVALID_FILTER_VALUE` before searching. Non-ASCII text is accepted, including ordinary successful no-match results. A one-character prefix is valid. The backend passes the folded value as a separate parameter to Solr's `prefix` parser: `*`, `?`, backslashes, quotes, brackets, `OR *:*` and local-parameter-looking text are literal characters. Clients must not escape them or add wildcards. CONTAINS keeps its existing case-sensitive substring semantics.

Merge these additions into the actual search core used by the record type, retaining existing schema and pre-index rules:

```javascript
recordGraphqlFields: { 'metadata:/dc:identifier': 'uon_grid_project_id' },
recordGraphqlCaseInsensitivePrefixFields: {
  'metadata:/dc:identifier': 'uon_grid_project_id_iprefix_v1'
},
schema: {
  'add-field': [
    { name: 'uon_grid_project_id', type: 'string',
      indexed: true, stored: true, multiValued: false, docValues: true },
    { name: 'uon_grid_project_id_iprefix_v1', type: 'string',
      indexed: true, stored: false, multiValued: false, docValues: false, required: false }
  ]
},
preIndex: {
  copy: [{ source: 'metadata.dc:identifier', dest: 'uon_grid_project_id' }]
}
```

Use a fresh versioned companion field. Do not add a `preIndex.copy` or Solr `copyField` to populate the companion, and do not use a lowercase TextField analyzer. The core indexer derives it from the original string using the same fold as the query planner and restores it after configurable transformations. Every source string is accepted, including empty strings and Unicode/control-containing strings; missing/null/non-string sources omit only the companion. No character-domain preflight or index-time character rejection is introduced. Displayed metadata and the raw index copy retain their original value.

Discovery adds IPREFIX only for a readable non-repeating STRING present in every selected variant, with an unambiguous primary scalar copy and a distinct, unshared, safe companion. The companion must be explicitly configured and verified live as an indexed single-valued `StrField` with the configured type, **non-required** (`required` omitted or `false`) and **no default value** in both configuration and the live schema. Solr defaults would manufacture indexed terms for missing/null/non-string sources; `required: true` would reject their entire documents, including unrelated record types sharing that core. Dynamic-only fields, analyzed fields, shared/reserved destinations and incoming exact or wildcard Solr copy rules do not qualify. Ordinary string bindings without the opt-in retain their existing operators. Unsupported bindings return `UNSUPPORTED_FILTER`; the adapter never falls back to CONTAINS or filters a loaded page.

Capability rejection does not repair a live required field: explicitly replace that field with a non-required definition, verify the live schema, and retry rejected indexing jobs. Do not invent placeholder companion values. After repairing a defaulted field, reindex affected documents to remove previously manufactured terms before enabling the lookup. The visual explorer currently uses its existing operator list; author this filter in GraphQL mode until visual IPREFIX authoring is implemented.

Deployment order and rollback:

1. Build/deploy this core layer after the GraphQL/explorer dependencies and rebuild any hook consuming its config types. Use the hook's normal `registerRedboxConfig`/loader registration for institutional configuration; no new shim or service registration is required by this operator.
2. Add the primary mapping/copy if absent and append the new companion definition/map in the effective per-core hook or environment overlay. Reconcile the schema, inspect effective live field required/default settings and copy rules, and verify discovery. Schema verification certifies the binding, **not reindex completion**.
3. Index-only reprocess the selected existing records through the deployed SolrSearchService. The authenticated `POST /:branding/:portal/api/search/index?oid=<OID>` queues one existing record; wait for successful queue completion. It does not require saving metadata or changing workflow/ACLs. Do not delete/recreate source records or clear the whole index. The broader `indexAll` route queues all visible records and is unnecessary for a selected fixture set.
4. Verify the companion values/counts in Solr, discovery IPREFIX and actual mixed-case/prefix/literal queries with admin and ordinary authorized callers. Merely adding the schema/map leaves old documents without companions. Enable the named-query/form reference only after reindex completion and these checks; existing grid version `1` does not certify companion backfill. Runtime record ACL, stage/form checks and existing scan/time/page bounds still apply.
5. Roll back by disabling the new lookup/form reference and companion mapping, then deploying the previous application if needed. Leave raw metadata, primary mappings, records and index fields intact; the unused fresh companion can remain. Changed indexing semantics require a new versioned companion and another reindex.

For an institutional deployment, inspect the environment's runtime overlay as well
as hook configuration. Generic development Compose files may not own the target.
Preserve effective mappings and per-core copy rules. Map lookup labels from the
searched project ID and identifiers from `oid`; retain title separately in metadata.
Title search needs its own companion and lookup. Deployment, backfill and ordinary-user
verification are operational steps, not effects of merely installing the operator.

## Pagination, permissions and consistency

`first` defaults to 25 and must be 1–50. `hasNextPage` is based on an additional authorized matching row. `endCursor` is null when exhausted; otherwise supply it as `after` with the same query, sort and page size. Cursors are encrypted/authenticated, expire after one hour, and bind the caller identity/roles, brand, portal, search core, catalogue/index configuration and query context. Invalid, changed-scope, stale or expired cursors return `INVALID_CURSOR`. Store grid choices, not cursors, for reusable grids.

The resolver requests bounded cursor batches from Solr and hydrates candidates through the actual runtime RecordsService override. It checks stored brand, record type/stage and `hasViewAccess` before choosing page boundaries or calculating `hasNextPage`. Metadata-filtered or metadata-sorted queries also require the stored stage/form to have a registered read contract in that scope, so historical or stale-index form values cannot expose undeclared fields through matching or order. Indexed ACLs are deliberately not treated as authoritative: newly granted access must not be hidden by a stale ACL index, and custom service overrides must still run. No totals or estimates are returned. Invisible hits consume internal work but appear in neither rows, cursors nor counts.

At most 200 candidates (four batches of 50) are considered per request. If the resolver cannot prove a full page plus authorized lookahead, or exhaustion, within that budget, the entire collection field fails with `COLLECTION_LIMIT`; it does not return a short page or skip visible hits. Narrow the filters/stages or reduce page size. Sparse visibility across a broad index may require a future search backend with proven equivalence to runtime authorization. This version provides correct bounded pages, not unrestricted export scanning. Storage/search outages and partial Solr results fail the collection field; they are not treated as an empty result. Runtime `getMeta` overrides should return null/undefined for absent records; thrown provider errors fail the page. Single-record exception handling retains its existing not-found behavior.

Pagination is not a snapshot. On an unchanged index the unique tie-breaker makes equal-sort values deterministic. Inserts, removals, changed sort values, reindexing or permission changes between requests can cause duplicates, omissions or cursor invalidation. Refresh/restart for a current view; deduplicate by OID. Current authorization is rechecked on every page. Metadata is hydrated from current record storage, but filters/sorts use the asynchronously maintained index. Values can therefore differ from the indexed values that matched, and newly saved records may not appear until indexing finishes. Stored type/stage are rechecked, so recently transitioned candidates can disappear from an old indexed scope. Do not use grid results as transactional validation.

## Resource limits and client errors

In addition to the page and candidate limits: at most 10 filters, 3 explicit sort fields, 20 IN values, 256 UTF-8 bytes per filter value, 20 distinct stages, 50 requested catalogue IDs, and 8 KiB per cursor. One operation can include at most one collection and one catalogue, with five root record operations in total. Existing limits remain: 64 KiB request JSON, 2,000 parser tokens, 200 expanded fields, depth 12, 2,000 selection steps, 10,000 execution work units, 256 KiB response and five-second execution deadline. Storage reads are request-local cached by OID, including single-record aliases and collection lookahead. Solr schema/search calls have bounded response bytes and deadline-based aborts. Generated search parameters use a form-encoded POST body capped at 256 KiB, so the effective configured stage scope does not depend on URL length limits. Reduce selected columns if selection, work or response limits are reached.

Useful `errors[].extensions.code` values include `UNKNOWN_FIELD`, `UNKNOWN_RECORD_TYPE`, `UNKNOWN_WORKFLOW_STAGE`, `UNSUPPORTED_FILTER`, `INVALID_FILTER_VALUE`, `UNSUPPORTED_SORT`, `INVALID_PAGE_SIZE`, `INVALID_CURSOR`, `REINDEX_REQUIRED`, `UNSUPPORTED_SEARCH_INDEX`, `COLLECTION_UNAVAILABLE`, `COLLECTION_LIMIT`, `SEARCH_UNAVAILABLE`, `STORAGE_UNAVAILABLE`, `QUERY_LIMIT` and `QUERY_TIMEOUT`. GraphQL validation also rejects unknown fields/operators/input properties. Check errors before displaying page metadata. Authentication/route failures still happen before GraphQL execution; the disabled endpoint returns 503 with GRAPHQL_DISABLED; unexpected service unavailability returns safe UNAVAILABLE/503.

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

GraphQL-backed reusable definitions and detached explorer promotion are documented in [Configuring Named Queries](Configuring-Named-Queries#graphql-source). Form lookups expose only the first25 suggestions with unknown totals; this does not add GraphQL reports or CSV export.


### Explorer presentation metadata

`recordFields` adds nullable `recordTypeLabel` and `recordTypeLabelKey`. The label
uses configured `recordtype[type].labels.name`, falling back to the type ID. A
translation reference is returned separately as the key.

Each field adds nullable `displayLabel`, `displayLabelKey`, `group`, `groupKey`,
`groupPath: [String!]`, `repeatingSubfield`, and `repeatingGroupId`. Existing `label`,
`labelKey`, IDs, paths and execution capabilities retain their meanings. Request
these additions explicitly in GraphQL selections; old clients remain valid.

- Display label uses an explicit `shortLabel` annotation/config where present,
  otherwise a short existing label/translation reference, then a readable field
  name when the configured label contains a long question or markup. Full question
  text remains in `label`. Treat labels as text, never HTML.
- Group paths retain labelled form tabs (`layout.config.buttonLabel`), accordion
  sections and stored groups. `group` is the nearest heading; `groupPath` contains
  the outer-to-inner path. Translation references start with `@`; companion key
  fields identify translated leaf headings. Fields without form hierarchy fall
  back to translated Metadata; system fields to translated Record.
- A selectable repeating group retains `repeatingSubfield:false`. Its descendants
  have `repeatingSubfield:true` and `repeatingGroupId` pointing to the outer group,
  allowing a UI to hide disabled children behind one note. These hints grant no
  new selection/filter/sort capabilities. Private fields remain excluded.

Presentation hierarchy is attached to read contracts only. Write validation and
stored record paths do not change. The default admin sidebar places Record explorer
and Named queries together; persisted institution sidebar customizations are not
rewritten.
