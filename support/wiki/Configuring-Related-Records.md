In ReDBox, the `relatedTo` configuration allows for the establishment of relationships between different types of records. This feature is critical for linking associated data, ensuring coherence and navigability within the platform, and facilitating richer data management workflows.

For runtime resolution, access filtering and supported relationship semantics, see [Fresh related metadata](#fresh-related-metadata-opt-in) below.

## Overview of `relatedTo`

The `relatedTo` attribute defines how different record types are connected within the system. For example, a data management plan (DMP) record might be related to multiple data records, or a publication record could be related to the dataset it references. By configuring these relationships, users can easily navigate between related records and maintain an organized data structure.

## Configuring `relatedTo`

The `relatedTo` configuration is defined within the `recordtype` settings for each specific record type. Here's how to structure your configuration:

```javascript
module.exports.recordtype = {
  "rdmp": {
    // Other rdmp configurations...
    "relatedTo": [
      {
        "recordType": "dataRecord",
        "foreignField": "metadata.rdmp.oid"
      }
    ]
  },
  "dataRecord": {
    // Other dataRecord configurations...
    "relatedTo": [
      {
        "recordType": "rdmp",
        "localField": "metadata.rdmp.oid",
        "foreignField": "redboxOid"
      },
      {
        "recordType": "dataPublication",
        "foreignField": "metadata.dataRecord.oid"
      }
    ]
  },
  // Additional record types and configurations...
};
```

### Key Parameters in `relatedTo`

- **`recordType`**: Specifies the type of record that the current record type is related to. This should match the key used in the configuration of the related record type.

- **`localField`**: (Optional) The field within the current record that links to the related record. If omitted, the system assumes the records oid.

- **`foreignField`**: The field within the related record that corresponds to the ID or unique identifier in the current record.
- **`cardinality`**: `one` or `many` for opted-in resolution; omitted values retain the legacy default `many`.
- **`direction`**: `outbound` (default) or `inbound`. Resolution queries the declared foreign path; inbound matching requires adapter relation-query support.

### Best Practices for Configuring Relationships

- **Explicit Definition**: Clearly define the relationship paths between records to avoid confusion and ensure accurate linkage.

- **Consistency**: Maintain consistent naming conventions for `localField` and `foreignField` across different record types to facilitate understanding and maintenance.

- **Bidirectional Links**: Where applicable, define reciprocal relationships in the configurations of both related record types to enable bidirectional navigation.

- **Validation**: Implement validation checks to ensure that related records exist before allowing the creation or update of a record, enhancing data integrity.

- **Documentation**: Document each relationship within your configuration to provide context and understanding for future administrators and developers.

## Example Use Case

Consider a scenario where a Research Data Management Plan (RDMP) needs to be linked to associated Data Records. By configuring the `relatedTo` section within the RDMP's configuration, you can specify that each RDMP relates to multiple Data Records based on a shared identifier (e.g., the RDMP's OID). Conversely, within the Data Record configuration, you would reference back to the RDMP to complete the bidirectional link.

These declarations let ReDBox query the stored references for navigation between RDMPs and their Data Records. They do not create reciprocal references or synchronize copied metadata automatically.

---

By properly configuring the `relatedTo` attribute, you enhance the ReDBox platform's ability to manage complex data relationships, supporting comprehensive research data lifecycle management. If there are specific scenarios or additional details relevant to your project's use of related records, those details can be added to further tailor the documentation.

## Fresh related metadata (opt-in)

Navigation and raw record reads remain available without enrichment. Fresh resolution
uses the existing `relatedTo` registry, not a second registry. It reads current,
authorized sources at the time of an explicit operation; it does not synchronize
copies, traverse calculated chains, trigger source-change workflows, or provide a
multi-record snapshot. Reading sources does not update the root's metadata,
revision, modified date, audit or index.

The development hook's `related-plan` type declares these relations (from
`packages/redbox-hook-dev/src/config/recordtype.ts`):

```typescript
relatedTo: [
  {
    id: 'primaryActivity', recordType: 'related-activity',
    localField: 'metadata.primaryActivity', foreignField: 'redboxOid',
    cardinality: 'one', direction: 'outbound',
    resolution: { metadataFields: ['/title', '/startDate', '/endDate'] },
  },
  {
    id: 'activities', recordType: 'related-activity',
    localField: 'metadata.activities', foreignField: 'redboxOid', oidProperty: 'oid',
    cardinality: 'many', direction: 'outbound',
    resolution: { metadataFields: ['/title', '/startDate', '/endDate'] },
  },
]
```

`localField` and `foreignField` are record paths. Use `redboxOid` for the
record identifier; the resolver does not normalize an `oid` path alias. `oidProperty` extracts identifiers from object references (scalar
strings remain accepted). References can be a string, an object with the declared
identifier property, or an array of either. Null/empty references are ignored;
strings are trimmed and duplicates removed in first-occurrence order. Invalid
nonempty values fail explicitly. Direct OID results retain reference order;
relation-query results are deduplicated and sorted by OID.

`resolution.metadataFields` contains RFC 6901 pointers **relative to source
metadata**, with `~0`/`~1` escapes for literal keys. No implicit full-metadata
projection is supplied. Explicit null/empty values survive; absent properties
remain absent and produce `field-absent` issues. For the `browser` audience, source projection additionally applies the effective
caller's form visibility rules. The implemented `api` and `service` audiences
apply the declared fields to stored metadata after record-level authorization;
they do not apply browser form visibility pruning. Review projections accordingly.
No audience bypasses source record authorization. Calculated related-display source chains are
unsupported.

### Runtime result and service calls

The shared browser-safe types are exported by `@researchdatabox/sails-ng-common`:
`RelatedMetadataRequest`, `RelatedMetadataSelection`, `RelatedMetadata`,
`RelatedMetadataEntry`, `RelatedMetadataRecord`, `RelatedResolutionStatus` and
`RelatedResolutionIssue`. Select trusted relation IDs, never caller-supplied
queries, projection fields, brands or authority:

```typescript
const request = {
  relations: [{ relationId: 'primaryActivity' }, { relationId: 'activities' }],
};
const context = { brand, user, audience: 'service', serviceId: 'MyConsumer' } as const;
const related = await RecordsService.resolveRelatedMetadata(candidate, context, request);
const view = await RecordsService.enrichWithRelatedMetadata(candidate, context, request);
const storedView = await RecordsService.getMetaWithRelatedMetadata(oid, context, request);
// related.primaryActivity.records[0]?.metadata.title
// view.relatedMetadata.activities.records
```

All three return Promises. `resolveRelatedMetadata` returns the map;
`enrichWithRelatedMetadata` returns a detached candidate with a rebuilt root-level
`relatedMetadata`; `getMetaWithRelatedMetadata` first loads the root. Neither
mutates the supplied record. Existing `getMeta()` remains raw. The server-only
`RelatedRecordReadContext` requires `brand` and the actual effective `user`;
`audience` is `browser`, `api`, or `service` (which also requires `serviceId`).
Stored roots require read access; new candidates require creation access.

Each entry has `{ status, records, issues }`. Each projected source has
`redboxOid`, `metaMetadata: { type, brandId }`, `metadata` and optional `revision`.
Revision is descriptive, not a snapshot token. Statuses are:

| Status | Meaning |
| --- | --- |
| `resolved` | Nonempty authorized result with no unavailable references. Absent projected fields can still have issues. |
| `empty` | No selected references or no relation-query matches. |
| `partial` | Some direct references resolved and some were unavailable. |
| `unavailable` | No direct references could be read. Missing and denied are indistinguishable. |
| `invalid` | Invalid references or a cardinality violation. |
| `failed` | Configuration, adapter, read or budget failure. |

Issue codes are `unavailable`, `invalid-reference`, `cardinality`,
`limit-exceeded`, `unsupported-relation`, `field-absent`, `configuration-error`
and `source-read-failed`. Issues belong to their enclosing relation entry. The
optional location fields use zero-based indexes:

- `recordIndex` points into that entry's returned `records` array. Every
  `field-absent` issue includes it, together with a `fieldPointer` relative to
  the source metadata. Use `records[issue.recordIndex].redboxOid` to identify
  the readable source.
- `referenceIndex` points into the original relation reference array, before
  blanks are removed, strings are trimmed, or duplicates are combined. A scalar
  reference uses index `0`. Invalid references and unavailable direct OID
  references include it. Repeated unavailable references produce an issue for
  each original position while sharing one source read.

For example, references `["activity-a", "activity-b", "activity-c"]` could return:

```json
{
  "activities": {
    "status": "partial",
    "records": [
      {
        "redboxOid": "activity-a",
        "metaMetadata": { "type": "activity", "brandId": "default" },
        "metadata": { "title": "Activity A", "endDate": "2026-09-30" }
      },
      {
        "redboxOid": "activity-c",
        "metaMetadata": { "type": "activity", "brandId": "default" },
        "metadata": { "title": "Activity C" }
      }
    ],
    "issues": [
      { "code": "field-absent", "recordIndex": 1, "fieldPointer": "/endDate" },
      { "code": "unavailable", "referenceIndex": 1 }
    ]
  }
}
```

Here the absent date belongs to returned record `activity-c`; the unavailable
reference is the original `activity-b`. Do not match issue array positions to
record array positions. Indexes apply only to that result and its reference
input, not to later refreshes.

Relation-wide failures such as cardinality, configuration, size limits, deadlines,
and source-read failures have no index. Non-OID relation queries can match several
records per input, so they do not attach a reference index to filtered-out matches.
Returned records still have indexed field issues. Hidden source IDs and
missing-versus-denied distinctions are not returned.

Optional failures are returned as entries so consumers must check status and
define their own fallback. A selection with `required: true`
throws `RequiredRelatedMetadataError` unless its status is `resolved`; this is not
field-level required validation (`field-absent` does not itself change that status).

Root-level runtime `relatedMetadata` is excluded from persistence/classification,
audit/index snapshots and native Mongo writes. An ordinary property with that
spelling **inside metadata** is not this runtime envelope.

### HTTP and Angular client

Under the usual branding/portal prefix:

- `GET /:branding/:portal/api/records/resolved/:oid?relations=primaryActivity,activities`
  returns `{ data: { redboxOid, metadata, metaMetadata: { type, brandId }, relatedMetadata } }`.
  It uses the existing API authentication/access conventions.
- `POST /:branding/:portal/record/relatedMetadata/resolve` uses the existing browser
  session and CSRF enforcement (when CSRF is enabled). Existing roots accept
  `{ "oid": "PLAN_OID", "relations": ["primaryActivity"], "references": { "primaryActivity": "ACTIVITY_OID" } }`.
  New roots accept `{ "recordType": "related-plan", "relations": ["primaryActivity"], "references": { "primaryActivity": "ACTIVITY_OID" } }`.
  Response: `{ data: { relatedMetadata } }`. References are keyed by relation ID;
  only declared reference overrides are allowed. The refresh body is limited to 65,536 serialized bytes. Type/form/creation rights are
  server-derived. This never saves the candidate.

Both use `Cache-Control: private, no-store`, without raw root-only ETag/304
semantics. Unknown relations/malformed input yield 400; root access/unavailability
and operational failures use the documented 403/404/500 mappings. Optional source
failure is normally a 200 typed result. HTTP selection is 1–8 distinct IDs, each
1–128 characters; bodies are strict and cannot contain arbitrary metadata or
`required` flags. The refresh POST follows existing `/record(/*)` path rules:
Admin-only accounts without Librarians or Researcher are denied, just as for other
record routes. An Admin presentation role is not a route access grant.

Angular `RecordService.resolveRelatedMetadata(request)` unwraps the map;
`getRecordWithRelatedMetadata(oid, relations)` unwraps the resolved root. The client
sets API version `2.0` and uses existing CSRF configuration. Raw APIs and graph
expansion retain their existing response contracts. See the
[generated REST/contract workflow](Generated-Reference-Documentation.md).

### Limits and adapter support

The resolver's fixed operation limits are 8 relations, 50 references/results per
relation, 200 source reads/results per operation, 6 concurrent direct reads,
10 seconds total and 65,536 serialized reference bytes per relation. Caches and
budgets are operation-local. Timeout does not promise cancellation of underlying
I/O. Overflow is a failure, never successful truncation.

Mongo implements optional `StorageService.findRecordsByRelation`, applying tenant,
type and principal ACL constraints before its limit-plus-one overflow check.
It supports direct OID and declared foreign-path/reverse matching, including
object arrays. Other adapters can use bounded direct-OID fallback through
`getMeta` with subsequent authorization; non-OID/inbound shapes without the
relation-query method produce `unsupported-relation`. Adapter replacements must
supply equivalent authorization and complete/overflow guarantees before enabling
those declarations.

Named queries opt in through `relatedRecordFilters` with `rootRecordType` and
`relationId`. The runnable `relatedPlansByActivityDate` query selects readable
`related-plan` roots whose `activities` have any readable source with
`metadata.startDate >= fromDate` (default `2026-01-01`). Predicates for the same
relation are combined on the **same source**, before root count and pagination.
It uses native Mongo record queries, the actual principal and trusted relation
paths. Matching always requires any readable source; no `match` option is
accepted. Aggregation/effective-source sorts and literal-field relation/query
paths are rejected. Stored root sorting is
supported with an OID tie-breaker. Materialization fails above 1,000 matching
source records or 1,000 extracted source identifiers; it does not silently miss
later pages. This query limit is separate from the resolver's 50-source limit.
Legacy filters and vocabulary reuse remain available without these opt-ins.

## Activation, consumer inventory and deployment migration

Core provides resolution, transient-write enforcement and opt-in integration.
It does not retire an installation's copy writers or migrate stored copies.
Use the separate development-only `related-plan-1.0-draft` and
`related-activity-1.0-draft` fixtures as a starting point, not a silent change to
existing RDMP/data/publication forms. Their local `title`/`notes`, scalar
`primaryActivity`, ordered `activities: [{ oid }]`, hidden source components and
role variants are described in the
[form recipe](Form-Configuration-Recipe-Populate-From-Related-Record.md) and
[service consumer examples](Services-Architecture.md#related-record-consumers).
The repository's `packages/redbox-hook-dev/RELATED-RECORD-EXAMPLES.md` contains
fixture setup and mock-only outbound configuration.

Maintain an inventory for **each copied field** before disabling its writer:

| Consumer | Migration action |
| --- | --- |
| UI edit/view and API clients | Use declared sources/projections, transient targets and resolved reads; check role variants and unsaved changes. |
| Email trigger, recipient, subject, body | Opt in once per notification; handle optional status and required failure before sending. |
| DOI create/update | Use v2 related binding inputs; preserve ordinary DOI writeback. |
| PDF | Verify source access for the authenticated rendered page and enable the operation's readiness wait. |
| Validation operations | Supply related requests; use separate related context rather than copied metadata. |
| Discovery, named queries and vocabularies | Move supported predicates before count/page; exercise limits and ACLs. |
| Exports, jobs, reports, dashboards and custom hooks | Explicitly adopt service helpers or retain a documented copy dependency; these are not globally enriched. |

Deployment checklist:

1. Deploy with opt-ins absent and verify existing raw APIs/forms/hooks/PDFs.
2. Inventory writers (UI expressions, pre/post hooks, templates, importers, batch
   jobs, custom services) and consumers, their source permissions and failure policy.
3. Add trusted projections and separate form versions. Declare the same
   `relatedDisplay` metadata paths/relation IDs in every reachable workflow stage,
   including role variants. Central relation configuration participates in form
   fingerprints; refresh stale forms after configuration changes.
4. Compare outputs after source-only changes, references/unlink, denied/deleted
   sources and local saves. Confirm the root revision/dates/audit do not change
   merely from reading. Test transitions before enabling workflow hooks: an active
   transient target cannot silently become an ordinary writable field at the next
   stage. Keep compatible declarations even where presentation changes.
5. Verify every consumer and writer in the inventory, then retire that deployment's
   copy writer. Existing retained canonical copies can remain; they are not the
   fresh display. Destructive cleanup/backfill needs a separate migration and
   backup procedure. Active transient batches are explicitly unsupported.
6. Stage rollback with compatible form declarations and consumer configuration.
   Preserve references and local answers. If returning to copy-based consumers,
   restore their synchronization writer and reconcile/backfill required data
   through the deployment's migration procedure. **Disabling enrichment does not
   make old copies fresh.** Never materialize fetched source values automatically
   as a rollback side effect or silently remove active transient rules.

Read/required failures prevent the dependent operation from proceeding, but do
not create a multi-record transaction. In particular a required email/DOI failure
in an existing post-save hook can occur **after the root has committed**; it does
not roll back that save or unrelated external effects. Preserve existing
post-hook failure/partial-commit handling and inspect the operation's result
before retrying. Core adds no automatic source-change effects or approval workflow.

Named-query seeds are loaded at bootstrap from `bootstrap-data/namedqueries/*.json`
first, then from hook/deployment `namedQuery.queries` definitions. Both require
`collectionName`; invalid definitions are skipped and logged. Existing brand/name
entries (including admin edits) are never overwritten, so file seeds take precedence
over config seeds of the same name. Config seeds also load when the file directory
is absent. Restart/bootstrap after installing the examples.
