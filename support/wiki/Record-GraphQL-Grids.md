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

## Enable storage collections

Keep the existing GraphQL route authentication and explicit persisted path read rule. The bootstrap rule grants Admin route access; integration roles need an applicable rule. Admin does not bypass record permissions. Send bearer or session authentication and a JSON GraphQL body. Responses use `application/graphql-response+json` and `Cache-Control: private, no-store`. General introspection, GraphiQL, batching and public SDL remain disabled.

```javascript
recordGraphql: {
  enabled: true,
  cacheEntries: 16,
  maxVariants: 100,
  cursorSecret: process.env.RECORD_GRAPHQL_CURSOR_SECRET
}
```

Use a random secret of at least 32 characters shared by all portal instances. Single-record reads do not require it. Collection execution requires the storage provider's bounded `executeRecordCollection` capability; the Mongo storage hook implements it. Unsupported providers return `COLLECTION_UNAVAILABLE` without falling back to search. MongoDB 5.0 or later is required for exact object-key expressions.

`records` and `recordFields` no longer require Solr, schema reconciliation, mappings or reindexing. Paths and scalar types come from the same readable contracts as metadata selections. Existing `recordGraphqlFields` and `recordGraphqlCaseInsensitivePrefixFields` Solr configuration must be removed from typed hook configuration. Their index fields can remain unused. Remove dedicated grid `preIndex.copy`/schema rules when no other search consumer uses them. Solr full-text search and its ACL indexing remain in use outside these GraphQL operations. Old Solr collection cursors intentionally return `INVALID_CURSOR`; restart queries after deployment.

## Discover columns and capabilities

Send this authenticated request before building a query:

```graphql
query GridFields($type: String!, $stages: [String!]) {
  recordFields(recordType: $type, workflowStages: $stages) {
    revision
    variants { typeName workflowStage form }
    fields {
      id path label labelKey scalarType nullable nested repeating cardinality
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

`DateInputComponent` keeps a nullable string contract. Its `x-redbox-format` is `date` when `model.config.dateOnly === true` (persisted `YYYY-MM-DD`), and `date-time` otherwise (a JavaScript Date serialized as an ISO timestamp). Component `dateFormat` controls display/parsing; `enableTimePicker` does not select the persisted format. Each consistent date declaration supports `DATETIME` queries, with calendar dates normalized to UTC midnight. A date declaration combined with an arbitrary string, another scalar type, or the other date format is reported as `MIXED` and cannot be selected, filtered or sorted as one field. Narrow the workflow scope when variants differ. Read-contract merges retain `x-redbox-format-conflict: true` and omit the single format hint when date declarations conflict, so downstream consumers do not assume one branch's format applies to every value.

Collection ACLs follow canonical brand-role IDs and viewer/editor grants, including scalar and array grants and legacy flat ACLs when nested authorization is absent or primitive. User grants compare exact strings. Role grants support strings, booleans and finite JSON numbers using the same `String(value)` name semantics as `hasViewAccess`; BSON integer values are supported within JavaScript's safe-integer range. Owned role IDs compare through `String(id)`, including numeric IDs and ObjectIds. Malformed grants containing objects, nested arrays, null elements, non-finite numbers, BSON decimal/date values or unsafe BSON integers are excluded from collection candidates; their incidental JavaScript string coercions are not an authorization contract. Missing/null owned IDs are also excluded. Nested authorization takes precedence over legacy flat grants, including an empty nested object or array. Runtime `hasViewAccess` still checks each returned candidate.

Metadata IDs use `metadata:` followed by a JSON Pointer; record envelope IDs use `record:oid`, `record:recordType`, `record:workflowStep`, `record:form`, `record:createdOn`, `record:lastModified`. IDs are independent of generated GraphQL type names and catalogue revisions. Names and labels can change without changing the ID for a storage path. `labelKey` contains the untranslated configured `@...` key where applicable; clients can localize it and use `label` as fallback. Enum choices describe the current configuration, rather than enforcing historical enum values.

A declared title entry has this shape (the `selections` values are described immediately below):

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
  "cardinality": "SCALAR",
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

With the default publication draft form:

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

Require exactly one registered record type. An omitted or empty stage list includes only its configured workflow stages, enforced in both Mongo and current stored-record checks. Unregistered historical stages do not affect rows or `hasNextPage`. Unknown stages are errors. Each stored row's actual type/stage/form chooses its metadata union member; the client cannot substitute a different form. A field available in only some variants has `availableInAllVariants: false` and fragments only for the applicable variants. Such fields remain columns, but filtering and sorting require availability across every form in the selected workflow scope (`VARIANT_SCOPE_REQUIRED` otherwise); narrow the stages to enable those capabilities. Use `metadata.__typename` to find the matching selection and represent an inapplicable field as null in the grid. A missing declared value is returned as null. An unregistered historical form gives a nullable metadata error while retaining the record envelope.

Scalar fields, declared objects and declared lists can be grid columns. Nested scalar leaves are supported through exact response paths; opaque JSON is not a column. `cardinality` is `SCALAR` for a single value and `LIST` for a declared array. Only a declared scalar list (see [Declared scalar lists](#declared-scalar-lists)) can be filtered or sorted; object lists, nested lists and their children cannot. Entries inside a list have `metadata-list:` identifiers and `repeating: true`; they cannot be columns, filters or sorts. Lists are not flattened. Fields with incompatible shapes across selected stages are unavailable; narrow the workflow scope to resolve them. Collection selections of opaque metadata regions return `UNDECLARED_METADATA` and null rather than exposing unknown children. Existing `record(oid:...)` opaque JSON behavior is preserved. Historical type mismatches retain GraphQL's nullable-field/nullable-item errors.

## Filters and sorting

Filters are an AND-only list. Each input has `field` and exactly one operator. `eq`, `in`, `gt`, `lt`, and `between` take typed values containing exactly one of `text`, `number`, `boolean`, or `dateTime`. `contains` and `iprefix` take literal strings; `exists` takes a boolean. Never send null as a typed value; use `exists: false` for missing/null normalized values.

| Readable contract type | Operators | Sort |
| --- | --- | --- |
| STRING | EQ, CONTAINS, IPREFIX, IN, EXISTS | Yes |
| BOOLEAN | EQ, IN, EXISTS | Yes |
| NUMBER / INTEGER | EQ, IN, GT, LT, BETWEEN, EXISTS | Yes |
| DATETIME | EQ, IN, GT, LT, BETWEEN, EXISTS | Yes |
| Declared scalar list (`cardinality: LIST`) of one of the types above | The element type's operators, matched per element | Yes, by smallest/largest element |
| Object, object list, nested list, list child, opaque, incompatible or partial-variant fields | None | No |

Nested scalar leaves use exact declared object keys, including names containing colons, dots or dollar signs; stored arrays are never traversed implicitly. Object lists and the children of any list remain selection-only where supported. A scalar declaration containing an array, object or incompatible stored primitive normalizes to missing for filters and sorts. Numeric strings are never coerced. Numeric values must be finite; INTEGER requires a safe integer. Empty strings and false are values. EXISTS tests a valid normalized value, so missing, null and type mismatches match `exists: false`. All other operators exclude them.

Text equality and CONTAINS are case-sensitive literal operations. Regex metacharacters are escaped by the server. GT/LT are exclusive and BETWEEN is inclusive; reversed ranges are errors. Input dates require RFC 3339 with seconds, timezone, at most millisecond precision, and a UTC year in 0001–9999. Invalid component ranges, invalid calendar dates, leap seconds and ambiguous local input are rejected. DateInputComponent read contracts carry `x-redbox-format: date` or `date-time` according to `model.config.dateOnly`; hook contributors can use those extensions on readable string nodes. Ordinary string fields remain STRING even when their names resemble dates.

Date comparisons and sort keys use UTC milliseconds. Stored BSON dates, timezone-qualified timestamps, calendar dates (`YYYY-MM-DD`) and legacy timestamps without a timezone normalize to UTC; invalid dates, numeric epochs and non-scalar values normalize to missing. Metadata selections retain their existing string contract and historical-value errors; date normalization does not rewrite stored metadata. Envelope timestamps retain their ISO output behavior.

Ascending sorts put null/missing/type mismatches first; descending puts them last. Strings use Mongo's binary simple collation. OID ascending breaks equal sort keys, and is the default sort. An explicit OID sort retains its requested direction. No Mongo paths or operators can be supplied by clients.

Unknown IDs, unknown input properties, unsupported operators/sorts, repeated sort fields, invalid types and oversize values return errors. No requested operation is silently ignored. A readable field can remain a column while having `filterable: false` and `sortable: false`.

### Declared scalar lists

A field has `cardinality: LIST`, `repeating: true` and filter/sort capabilities when every selected variant's read contract declares it as an array of one scalar type (`STRING`, `NUMBER`, `INTEGER`, `BOOLEAN`, or a date/date-time string), outside any other list. Examples are multi-value checkboxes and repeatable simple inputs, including lists inside plain objects. Capabilities come only from contracts compiled from form configuration; stored records are never sampled. A list in one variant and a single value in another, different element types, or `date` versus `date-time` elements across variants make the field `MIXED`; narrow the workflow scope. Private (`writeOnly`) lists or list items are excluded.

- **Filters match any valid element.** `eq`, `in`, `contains`, `iprefix`, `gt` and `lt` match when at least one element satisfies the operator. `between` requires a **single element** within both bounds. Separate filters on the same list are independent and may each match a different element; there is no same-element correlation across filters.
- **EXISTS** is true when the list has at least one valid element. Missing, null, empty and non-array stored values have no valid elements.
- **Elements are normalized like scalars of the declared type.** Invalid elements (wrong type, numeric strings, non-finite numbers, unsafe integers, invalid dates, numeric epochs, null, nested arrays and objects) are ignored, never coerced. Arrays are not flattened, unwound or truncated.
- **Sorting** uses the smallest valid element for `ASC` and the largest for `DESC`, over all valid elements regardless of filters. A list without valid elements sorts as missing (first for `ASC`, last for `DESC`), with the usual OID tie-break; continuation cursors carry that one scalar key.

Element arrays are computed per candidate after the ACL and scope predicates and are removed before sorting, so the blocking sort holds only scalar keys and the existing page, deadline, result-byte and no-disk-spill bounds apply. Large stored lists are processed in full within the storage deadline; a query that cannot finish returns `QUERY_TIMEOUT` rather than partial results. These semantics change the catalogue revision, so collection cursors issued before deployment return `INVALID_CURSOR`; restart those queries.

### Literal prefix with ASCII case folding

`{field: "metadata:/dc:identifier", iprefix: "uOn-"}` matches the start of the full stored string, ignoring **ASCII A–Z case only**. For stored string S and prefix P, the contract is `foldAsciiCase(S).startsWith(foldAsciiCase(P))`; the fold replaces A–Z with a–z one code unit at a time. Every other UTF-16 code unit is unchanged. There is no trimming, tokenization, accent removal, Unicode case folding or Unicode normalization. For example, `UON-ΟΣΑ` matches `uon-ΟΣ` but not `uon-οσ` or `uon-ος`; `École` matches `É` but not `é` or decomposed `E\u0301`. Turkish İ/ı, ß/ẞ and fullwidth letters retain their exact distinctions. Spaces, punctuation, controls and supplementary characters are literal text.

Queries must be nonempty, well-formed UTF-16 strings of at most 256 UTF-8 bytes. Empty, null, malformed or oversized values return `INVALID_FILTER_VALUE`. IPREFIX is available on readable STRING fields and declared STRING lists (matching any element) present in every selected variant; no companion field or opt-in mapping is needed. Regex syntax, whitespace, controls and Unicode are literal. The visual explorer retains its existing operator list; IPREFIX can be authored in GraphQL mode.

## Pagination, permissions and consistency

`first` defaults to 25 and must be 1–50. A page reports `hasNextPage` only after finding an additional authorized matching record. Exhaustion returns `endCursor: null`. Supply `after` with the same query, sort and page size. Encrypted authenticated cursors expire after one hour and bind actor identity, canonical role/brand context, portal, type, stages, normalized filters/sorts and readable schema revision. Invalid, tampered, expired or changed-context cursors return `INVALID_CURSOR`.

Mongo applies brand, type, configured stages and viewer/editor username or canonical brand role grants before filtering, sorting and limiting. Admin and Guest/public role grants follow `RecordsService.hasViewAccess`; neither grants implicit access to every record. Legacy flat ACLs apply only without nested authorization. A metadata filter/sort also requires a registered stored stage/form pair. Candidates are then hydrated through the runtime RecordsService override, with defensive brand, type, stage, form and `hasViewAccess` checks before page boundaries and lookahead. Custom access overrides may further restrict this base authorization; they cannot broaden the Mongo ACL predicate.

At most 200 candidates in batches of 50 are hydrated per request. Standard inaccessible rows are excluded in Mongo. Sparse custom access overrides can exhaust the bound: the entire field then fails with `COLLECTION_LIMIT`, without an invented continuation or an empty-page loop. Storage failures return `STORAGE_UNAVAILABLE`, and unsupported providers return `COLLECTION_UNAVAILABLE`. No totals or estimates are returned. Each aggregation has at most 5,000 ms (capped by the request deadline), `allowDiskUse: false`, a bounded projection and result-byte limit. Oversized stored continuation keys fail explicitly.

Queries read current Mongo storage and need no asynchronous indexing. Keyset pagination is deterministic for unchanged data, but is not a snapshot. Concurrent inserts, deletes, permission or sort-value changes may cause omissions or repeated rows across pages; restart for a current view and deduplicate by OID. Hydration may observe changes after candidate selection. Do not use collection results as transactional validation.

## Resource limits and client errors

In addition to the page and candidate limits: at most 10 filters, 3 explicit sort fields, 20 IN values, 256 UTF-8 bytes per filter value, 20 distinct stages, 50 requested catalogue IDs, and 8 KiB per cursor. One operation can include at most one collection and one catalogue, with five root record operations in total. Existing limits remain: 64 KiB request JSON, 2,000 parser tokens, 200 expanded fields, depth 12, 2,000 selection steps, 10,000 execution work units, 256 KiB response and five-second execution deadline. Storage reads are request-local cached by OID, including single-record aliases and collection lookahead. Mongo candidate pages project only OID and normalized sort keys, with a 256 KiB output bound. Reduce selected columns if selection, work or response limits are reached.

Useful `errors[].extensions.code` values include `UNKNOWN_FIELD`, `UNKNOWN_RECORD_TYPE`, `UNKNOWN_WORKFLOW_STAGE`, `UNSUPPORTED_FILTER`, `INVALID_FILTER_VALUE`, `UNSUPPORTED_SORT`, `INVALID_PAGE_SIZE`, `INVALID_CURSOR`, `COLLECTION_UNAVAILABLE`, `COLLECTION_LIMIT`, `STORAGE_UNAVAILABLE`, `QUERY_LIMIT` and `QUERY_TIMEOUT`. GraphQL validation also rejects unknown fields/operators/input properties. Check errors before displaying page metadata. Authentication/route failures still happen before GraphQL execution; the disabled endpoint returns 503 with GRAPHQL_DISABLED; unexpected service unavailability returns safe UNAVAILABLE/503.

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

On load, refresh the catalogue for that scope. Resolve every column/filter/sort ID and verify scalar types, cardinality, operators and sort capabilities. Report missing or changed capabilities rather than silently dropping or reinterpreting them.

The Record explorer stores `expectedScalarType` and `expectedCardinality` (`SCALAR` or `LIST`) with each visual filter and sort. A definition without `expectedCardinality` was saved with single-value meaning. If the field is now a list (or a saved list field is now a single value), saving, previewing and named-query promotion return `filter-cardinality-changed` or `sort-cardinality-changed`. The explorer marks the condition and offers **Use the current meaning**, which keeps a still-supported operator and its values, then requires an explicit save. List conditions are labelled with their element meaning, such as "Any value equals" and "One value is between", and list sorts as "Ascending (by smallest value)" or "Descending (by largest value)". The optional catalogue `revision` helps detect change but is not a persistent field identity. A reused storage path with changed business meaning requires an institution-managed grid migration; the API cannot infer that semantic change. Save neither generated type names nor fragment aliases as the sole identity. Generate selections from the current catalogue.

## Verification and references

Core regression tests: `npm --prefix packages/redbox-core run test:record-graphql`. Docker HTTP tests use `RBPORTAL_MOCHA_TEST_PATHS` with `test/integration/services/RecordGraphqlService.test.ts` and `test/integration/services/RecordGraphqlGrid.test.ts` through `npm run test:mocha:mount`. Grid HTTP fixtures add synthetic scalar, nested and scalar-list fields to the title-only publication draft stub and exercise real MongoDB, bearer authentication and route policies. `test/integration/services/RecordGraphqlMongo.test.ts` runs the compiled storage pipelines directly against MongoDB, including scalar-list operators, malformed elements, exact dotted keys, ACL exclusion, min/max sort keyset paging and large-list timings. They are not institution-specific production form coverage.

See [Record Schema Contract Contributors](Record-Schema-Contract-Contributors) and [ReDBox Automated Tests](ReDBox-Automated-Tests).

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
