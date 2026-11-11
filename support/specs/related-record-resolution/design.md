# Related-record resolution: detailed design

Status: implemented generic scope, 3 November 2026; RR-22 handoff completed with
recorded baseline exceptions. See [verification.md](verification.md) for results and deviations.

This document turns the [agreed scope](../related-record-resolution-plan.md) into
concrete contracts. Read it with the [implementation plan](implementation-plan.md)
and [task list](tasks.md). The APIs below are proposed additions, not existing
methods. No application implementation is included in these documents.

## 1. Outcome and invariants

Forms and backend operations must fetch current declared related data without
periodically copying it into the referencing record. An RDMP and activity are the
motivating example; core contains no institution-specific activity rules.

The implementation must maintain these invariants:

1. Existing `record.metadata`, `record.metaMetadata`, raw reads, relationship graph
   responses, form expressions and operation triggers retain their meanings.
2. Enrichment is explicit and additive: `record.relatedMetadata` exists only on a
   requested runtime view. It is never a stored live projection.
3. The form component, email, DOI and other backend consumers resolve through the
   same relationship definitions and authorization boundary.
4. Source reads do not save the referencing record or advance its revision,
   modified date or edit audit. Real business writebacks remain normal writes.
5. Opted-in display values cannot enter canonical metadata through browser, API,
   internal writeback or batch paths. Existing retained data is not cleaned up by
   an unrelated save.
6. Source availability is explicit. A missing/denied source does not reactivate an
   old synchronized value. Valid empty values remain valid values.
7. Presentation remains form-configured. There is no automatic flattening, general
   expression replay on the server or new global expression precedence policy.

## 2. Existing code and intended changes

Paths in this table exist at the investigation baseline `d7b7eb479`.

| Existing entry point | Current behavior | Intended change |
| --- | --- | --- |
| `packages/redbox-core/src/config/recordtype.config.ts` | Typed `relatedTo`, IDs, local/foreign fields and cardinality | Supplement reference extraction and metadata projection; retain existing defaults |
| `packages/redbox-core/src/model/storage/RecordTypeModel.ts` | Persisted configuration mirror | Mirror the optional additions |
| `packages/redbox-core/src/services/RecordsService.ts` | Raw reads, graph reads, writes and hook coordination | Add explicit resolver wrappers and focused transient-write safeguards |
| `packages/redbox-core/src/RecordsService.ts` | Public service types | Declare the new methods and request/context types |
| `packages/redbox-core/src/StorageService.ts` | Storage adapter interface | Add one optional bounded relation-query method |
| `packages/sails-hook-redbox-storage-mongo/src/services/MongoStorageService.ts` | Relationship traversal and native record writes | Reuse relation query logic with tenant/ACL constraints; exclude runtime enrichment from writes |
| `packages/redbox-core/src/visitor/related-object-data-inline.visitor.ts` | Initial server population of component result buckets | Delegate new relation-based resolution to the shared resolver; retain legacy configuration |
| `packages/redbox-core/src/services/FormsService.ts` | Builds caller-effective forms | Supply shared results and server-derived client descriptors |
| `packages/sails-ng-common/src/config/component/related-object-data.outline.ts` | Existing display configuration and summaries | Add opt-in relation reference and result/state typing |
| `angular/projects/researchdatabox/form/src/app/component/related-object-data.component.ts` | Content/template rendering | Add fetch, refresh and existing-event publication |
| `angular/projects/researchdatabox/form/src/app/component/record-metadata-retriever.component.ts` | Hidden asynchronous getter with race guards | Factor reusable request lifecycle pieces without changing its defaults |
| `angular/projects/researchdatabox/form/src/app/component/content.component.ts` | Configurable template rendering | Expose an awaitable protected render refresh seam |
| `angular/projects/researchdatabox/form/src/app/form.component.ts` | Form serialization, baselines and conflict handling | Use the same transient-display projection for submitted and compared local data |
| `packages/redbox-core/src/services/EmailService.ts` | Evaluates a supplied record context | Use a detached enriched view when requested |
| `packages/redbox-core/src/services/DoiService.ts` | Maps supplied record data and writes DOI fields back | Enrich mapping input while retaining a separate writeback candidate |
| `packages/sails-hook-redbox-pdfgen/src/api/services/PDFService.ts` | Prints an authenticated record page | Optionally wait for related data and dependent rendering |
| `packages/redbox-core/src/services/NamedQueryService.ts` | Source-ID filtering before count/page; ordinary root sorting | Supplement the existing path for declared authorized relation filters |

New helpers should live in a small `packages/redbox-core/src/related-records/`
module. They are implementation modules used by existing services, not a new
source registry, hook runner or orchestration framework.

## 3. Shared types and runtime result

Put browser-safe DTOs in the proposed
`packages/sails-ng-common/src/related-records.model.ts` and export them from the
package index. Keep Sails services, actor authorization and storage dependencies
in core. Do not create a common-to-core dependency.

```ts
type RelatedResolutionStatus =
  | 'resolved' | 'empty' | 'partial' | 'unavailable' | 'invalid' | 'failed';

interface RelatedMetadataRecord {
  redboxOid: string;
  metaMetadata: { type: string; brandId: string };
  metadata: Record<string, unknown>;
  revision?: number;
}

interface RelatedResolutionIssue {
  code: 'unavailable' | 'invalid-reference' | 'cardinality'
    | 'limit-exceeded' | 'unsupported-relation' | 'field-absent'
    | 'configuration-error' | 'source-read-failed';
  referenceIndex?: number;
  fieldPointer?: string;
}

interface RelatedMetadataEntry {
  status: RelatedResolutionStatus;
  records: RelatedMetadataRecord[];
  issues: RelatedResolutionIssue[];
}

type RelatedMetadata = Record<string, RelatedMetadataEntry>; // relation ID keys

interface RelatedMetadataSelection {
  relationId: string;
  required?: boolean; // default false
}

interface RelatedMetadataRequest {
  relations: RelatedMetadataSelection[];
}
```

Add optional `relatedMetadata?: RelatedMetadata` to the public record typing, with
an explicit runtime-only comment. An enriched record is a detached record object
with this property; `metadata` remains the original local/stored metadata.

For example, an email can use
`record.relatedMetadata.activities.records[0].metadata.title`. A DOI array mapping
can iterate `relatedMetadata.activities.records`. There is no first-item
selection in the resolver; a scalar consumer chooses its own mapping.

Only the projected source metadata and minimal identity envelope appear in source
entries. Do not return source authorization arrays, full `metaMetadata`, internal
integration state or another nested `relatedMetadata`. Revision is descriptive;
it is not a new dependency precondition or snapshot guarantee.

### Status rules

| Situation | Result |
| --- | --- |
| No selected outbound references or no visible inbound matches | `empty`, no records |
| All selected readable records resolved | `resolved` |
| Some explicitly selected references could not resolve | `partial`, readable records only |
| Selected source unavailable, missing, denied or cross-tenant | `unavailable`; same safe public reason |
| Malformed reference or cardinality violation | `invalid` |
| Operational/source-read failure | `failed` |

For inbound queries, apply source ACLs before counting/limiting and do not report
the existence/count/identities of denied matches. Issues must not include hidden
OIDs or distinguish deletion from denied access. A reference index is allowed only
when it refers to a reference already supplied by or visible to the caller.

An authorized source with a missing projected field can still resolve. Omit the
absent field and report `field-absent`; a required field constraint belongs to the
existing consumer validation/mapping. Preserve `null`, `false`, `''` and `[]`.

A `required` relation must be nonempty and complete before a dependent operation
proceeds. Optional relations can expose partial/empty results. Configuration errors
and unsupported storage capabilities remain explicit failures, not missing data.

## 4. Relationship configuration

Use existing `relatedTo` IDs as the single relationship identity. Add these optional
properties to `RecordRelation` and its storage model mirror:

```ts
interface RelatedRelationResolutionConfig {
  metadataFields: string[]; // RFC 6901 pointers relative to source metadata
}

// Optional additions to the existing RecordRelation:
// oidProperty?: string;
// resolution?: RelatedRelationResolutionConfig;
```

`oidProperty` uses the same property-path convention as the existing component.
Existing local/foreign fields retain Lodash path semantics, including quoted
bracket notation for literal keys. The new projection list uses JSON Pointer so
literal dots, colons, slashes and tildes are unambiguous. Never split a JSON Pointer
on dots. Use token-safe reads/writes and existing pointer utilities/dependencies.

Example configuration, entirely generic:

```ts
relatedTo: [{
  id: 'activities',
  recordType: 'activity',
  localField: 'metadata.activities',
  foreignField: 'redboxOid',
  cardinality: 'many',
  oidProperty: 'oid',
  resolution: { metadataFields: ['/title', '/startDate', '/endDate'] }
}]
```

An explicit new enrichment request requires a declared projection. There is no
implicit full-record projection. Existing relations without `resolution` continue
to work through existing graph APIs. Legacy inline components retain their
server-configured `relatedFields`; their compatibility adapter uses that trusted
projection rather than accepting field lists from an HTTP request.

### Reference normalization and matching

- Read `localField` from the supplied root/candidate. Default values remain those
  of `normalizeRecordRelation`; do not change old relation normalization.
- Accept a string, an object whose configured `oidProperty` is a string, or arrays
  containing those forms. Reject nested arrays, nonstring identifiers and malformed
  objects in the new path. Treat a blank reference as unselected.
- Deduplicate repeated identifiers by first occurrence and preserve that order.
  Deduplicate fetches across relations separately; a source may participate in
  two distinct relation entries.
- Match the existing `foreignField` against normalized local values, with the
  declared source record type, tenant and source ACL constraints.
- For direct OID references, order records by reference order. For reverse/non-OID
  queries without reference order, use OID order for deterministic output.
- Apply `cardinality: 'one'` after authorized matching; multiple matches are an
  explicit error in the new resolver. Do not change legacy graph first-match
  behavior as an incidental part of this feature.
- Existing direction/edge conventions remain compatible. This resolver loads
  direct related source records; it does not recursively calculate their fields.

Share the new opt-in object-reference extractor with the graph path when
`oidProperty` is configured, so an enhanced relation does not stringify objects as
`[object Object]`. Keep graph response envelopes and the behavior of existing
relations without the new option unchanged.

## 5. Service boundary and resolver algorithm

Add exported wrappers on the existing `RecordsService`, its public interface and
`_exportedMethods`:

```ts
resolveRelatedMetadata(
  record: Readonly<RecordModel>,
  context: RelatedRecordReadContext,
  request: RelatedMetadataRequest
): Promise<RelatedMetadata>;

enrichWithRelatedMetadata(
  record: Readonly<RecordModel>,
  context: RelatedRecordReadContext,
  request: RelatedMetadataRequest
): Promise<RecordModel>;

getMetaWithRelatedMetadata(
  oid: string,
  context: RelatedRecordReadContext,
  request: RelatedMetadataRequest
): Promise<RecordModel>;
```

`RelatedRecordReadContext` contains the authoritative brand, effective user and
server-selected audience (`browser`, `api` or `service`); background execution also
identifies the calling service. The audience selects existing output projection
conventions and never changes source read authorization. A service must supply a
real effective principal under existing source-read rules. An internal write
`authorization: 'service'` option does not authorize an unrelated source read.
HTTP callers cannot supply a service identity or permission-bypass flag.

Pre-save create validation sets server-owned `rootOperation: 'create'` in this
context, so an already allocated OID still uses existing create authorization.
Derive this intent from the lifecycle operation, never candidate metadata or HTTP
parameters. Updates and post-save validation use authoritative stored-root checks;
the stored-record overload always checks its loaded root, regardless of this flag.

The supplied-record overload preserves in-flight local changes and references.
The stored-record overload loads the root once. Enrichment clones the supplied
record; it never mutates the caller's candidate. Never trust an existing
`relatedMetadata` property as current: build a fresh result for this operation.

Algorithm:

1. Validate request size, relation count and duplicate selections. Load authoritative
   record-type configuration using the supplied record's type and active brand.
2. Authorize the root where applicable and reject a tenant mismatch before sources
   are followed. A new unsaved root uses existing create/operation authorization.
3. Resolve requested relation IDs from `relatedTo`; validate projections and extract
   references from the supplied candidate.
4. Group compatible source reads, deduplicate OIDs and use bounded storage reads.
5. Enforce source tenant/type/ACL before projection. Browser output also retains
   existing caller-effective source-field projection: reuse
   `FormRecordConsistencyService.projectMetadataClientFormConfig` and the current
   effective-form selection seam rather than bypassing it with a raw source read.
   Extract a reusable service helper where the selection currently lives in a
   controller. A projection failure never falls back to unrestricted metadata.
   Imported/source records without a form follow the existing no-form read rules
   plus the declared field projection; resolution does not require a source UI.
   If a requested source field is itself an active transient related display,
   report an unsupported calculated-source chain instead of returning its retained
   stored value. Use the source's authoritative descriptors without evaluating its
   browser expressions or fetching another level of sources.
6. Intersect allowed source data with the declared projection, construct minimal
   entries and statuses, and enforce required relations.
7. Return a new result. Record safe relation/status/timing summaries through existing
   logging; do not log full source metadata or inaccessible identifiers.

### Storage seam and bounds

Add optional `findRecordsByRelation` to `StorageService` for a single bounded
relation query, implemented by Mongo. The query contains server-derived tenant,
record type, foreign field, normalized values, principal/ACL constraints and limit.
Named-query source filtering uses its own bounded native Mongo queries with
tenant and read ACL constraints before root counting and pagination.
Declared source materialisation applies MongoDB `maxTimeMS: 10000` as well as
its 1,000-source cap. A timeout aborts before root counting and pagination. Configure
indexes for source brand/type and the configured predicate/foreign-field paths,
and for root local-reference paths; inspect explain plans for each configured query.
Return records plus a completeness/overflow indicator. Fetch at most limit + 1 to
detect overflow; never silently truncate and report success.

Reuse Mongo relationship criteria and existing record-list ACL construction. Apply
tenant and read ACL before limit, then perform the existing access check again at
the resolver boundary. Query field paths come only from trusted configuration.
Do not call the existing unlimited, caller-unaware graph walker as a fallback.

Adapters without the optional method may use bounded deduplicated `getMeta` calls
for direct OID references. Other relation shapes return `unsupported-relation`.
This is an additive read capability, not a new storage concurrency protocol.

Initial bounds: 8 relations/request, 50 records/relation, 200 records/operation,
6 concurrent direct reads, 10-second operation deadline, 64 KiB HTTP reference
payload, 1 MiB per projected source envelope and 4 MiB cumulative resolved output.
Count UTF-8 JSON bytes, including repeated cached sources, statuses and issues.
Inspect declared source fields before cloning or browser preparation, and bound the
prepared projection before copying it. Oversized relations return `limit-exceeded`
with no partial source records; required relations still block. The operation-local
projection cache also has the 4 MiB budget. Keep constants together and document
configuration only if a real deployment needs overrides. A late underlying read may finish, but its expired
result cannot be published or start a dependent external operation.

HTTP related handlers start this shared deadline at controller entry, including
initial root, workflow/form and relation configuration lookups. They pass a
server-owned `loadedRoot`/`startedAt` operation-options object to resolution;
request parameters cannot select it. Reference overrides affect only a detached
candidate, and resolution rechecks the authoritative root's ACL, brand, type and
OID. Expiry returns a safe generic error and prevents late reads from starting
further resolution; it does not cancel the underlying storage operation.

## 6. HTTP and client contracts

Use existing controllers/policies and contract-first API routing. Proposed routes:

| Route | Purpose |
| --- | --- |
| `GET /:branding/:portal/api/records/resolved/:oid?relations=activities` | Explicit enriched stored-record representation |
| `POST /:branding/:portal/record/relatedMetadata/resolve` | Session-authenticated, CSRF-protected form refresh, including unsaved references |

The GET uses current webservice authentication/record authorization and returns a
safe record envelope with `relatedMetadata`. Project root metadata using the
existing appropriate public-read rules; do not expose raw authorization/internal
envelope fields merely because the internal service returns a full record.

The POST request is a discriminated union:

```ts
type RelatedMetadataRefreshRequest = {
  oid: string;
  relations: string[];
  references?: Record<string, unknown>; // relation IDs -> candidate local values
} | {
  recordType: string;
  relations: string[];
  references: Record<string, unknown>;
};

// POST response data:
// { relatedMetadata: RelatedMetadata }
```

For existing records, derive type/form from storage and authorize read access.
For new records, derive the permitted starting form through existing create
authorization. Validate requested relations against server-known configuration.
Reference overrides can change only the selected relation's declared reference
value; the caller cannot submit arbitrary queries, field projections, form names,
brands, roles, foreign paths or a service principal. No root save occurs.

Return body errors using existing conventions: malformed input/unknown relation
400, root authorization 403/404 as current policy dictates, configuration failure
500. Safe optional-source availability remains a successful response containing
statuses. Source lookup and request failures must remain distinguishable in the
client's loading/error state without exposing hidden record details.

Both routes use `Cache-Control: private, no-store`. Do not evaluate a root-only
`If-None-Match` to return 304 for an enriched representation. Existing raw routes
and their root CAS/ETag behavior remain unchanged.

Add typed methods to the existing Angular `RecordService`. Put API definitions in
a new `api-routes/groups/related-records.ts`, register/export the group, and add
the browser route/CSRF policy through the existing route configuration. Update
OpenAPI schemas and route consistency tests together.

## 7. Form configuration and events

New configuration is opt-in by an explicit relation ID on the existing component:

```ts
{
  name: 'activityData',
  component: {
    class: 'RelatedObjectDataComponent',
    config: { relationId: 'activities', required: false }
  },
  layout: { class: 'DefaultLayout', config: { visible: false } }
}
```

The component still has `model?: never`. Existing `dataPath`, `oidProperty`,
`relatedFields`, template/content, output format and result buckets remain valid
for legacy components. `relationId` selects the new path; conflicting legacy
reference configuration is a configuration error, not a second source definition.

The server supplies a compiled client descriptor with the relation ID, reference
tokens relative to metadata, object-OID extraction and the initial result/reference
fingerprint. Client descriptors are derived data, not trusted request input.
The readiness source list includes only components surviving caller role/mode
pruning and final view conversion. Canonical display targets and relation
references remain intact for persistence projection and fingerprinting.

### Lifecycle

1. Register the source in the form-scoped related-data state before form-ready.
2. Once subscriptions exist, publish the server-provided result if its reference
   fingerprint matches the current form; otherwise fetch through the POST helper.
3. Watch existing field/form change notifications. Extract the declared reference
   from current raw form data, compare normalized fingerprints and fetch only on
   a changed reference. Do not assume component/event paths equal metadata paths.
4. Invalidate the previous generation immediately when a selection changes. Clear
   the component's old result and publish a loading/empty state so configured
   targets can clear old content. Capture request generation before async work.
5. On completion, update both template context and result event only if the
   generation is still current. Abort/dispose where possible; retain identity
   checks after every await. Explicit refresh/page reload may fetch the same OID.
6. Unlinking publishes `empty` without a source read. Failure publishes a safe
   current error/unavailable result, not the previous source's values.
7. Destroy subscriptions and invalidate requests on form destruction/reload.

Use existing `field.value.changed` events, with the source component's actual
pointer for `fieldId` and `sourceId`. For the new component mode, `event.value` is
the `RelatedMetadataEntry`, extended in the client event value with
`loading?: boolean`. Network results never persist that client-only flag.

Examples of ordinary target expressions:

```ts
// A repeatable of activity titles:
{
  conditionKind: 'jsonpointer',
  condition: '/mainTab/activityData::field.value.changed',
  runOnFormReady: false,
  template: 'event.value.records.metadata.title[]',
  target: 'model.value'
}

// A corresponding disabled-state expression:
{
  conditionKind: 'jsonpointer',
  condition: '/mainTab/activityData::field.value.changed',
  runOnFormReady: false,
  template: 'event.value.status != "empty" or event.value.loading = true',
  target: 'field.disabled'
}
```

The paths are illustrative: use actual lineage paths in a real form. Authors may
format dates, aggregate titles or show informational text using existing JSONata
and templates. Existing expression ordering, notifications, dirty-state preservation
and feedback-loop protection remain intact. This design does not infer backend
business calculations by replaying those expressions.

Adapt new results to the existing `relatedObjects` summaries for template rendering.
Only include a summary title when projected. Expose a protected awaitable render
refresh in `ContentComponent`; data-result changes must render even if no form
control changes. Legacy template context remains available.

## 8. Transient display fields and writes

Add one optional declaration to `FormComponentDefinitionFrame`, its runtime base
class and construction/bootstrap paths:

```ts
relatedDisplay?: { relationId: string };
```

For example, an ordinary title input or complete repeatable can declare
`relatedDisplay: { relationId: 'activities' }` while its existing expressions decide
how to populate it. This flag identifies persistence behavior only. It does not
generate mappings, override expression values or force a presentation component.

The field is transient while its declared reference is selected, including when
the source is loading or unavailable. With no reference, it is an ordinary local
field. Invalid nonempty references remain protected and fail reference validation;
malformed input cannot turn a display field into an editable server override.

### Compile one metadata-path descriptor

Compile `{ metadataPointer, relationId }` from the authoritative source form and
expanded reusable definitions. Reuse common visitor lineage rules and the record
contract compiler's path conventions; tabs/layouts do not create metadata nesting.
Use pointers relative to metadata. Support scalar paths, selected group children,
whole groups and complete repeatables. First-release examples use complete
repeatables; mixed per-row transient/local persistence is not introduced.

Compile persistence descriptors before caller-specific constraints remove UI
components. Different role variants may show different controls for the same
metadata path, but must agree on its persistence declaration. Reject conflicting
declarations and parent/child overlaps with incompatible relations. This is a
configuration consistency check, not a general expression precedence system.

Include used relation definitions and these declarations in the existing form
fingerprint. A change to centralized projections/reference definitions must
invalidate the opted-in form contract even if its form file did not change.

### Server normalization rules

Evaluate reference state from the merged candidate. Preserve root CAS checks and
validate reference shape before treating a field as local. Apply these rules before
structural submission validation and again after hooks/transformations, using
authoritative descriptors:

| Previous/candidate reference state | Metadata handling at a declared target |
| --- | --- |
| Candidate reference selected | Do not persist submitted display data; preserve the authoritative stored value or absence at that pointer |
| Previously selected, candidate unlinked | Accept explicitly submitted local input; if omitted, clear retained data at that target so a merge cannot resurrect an old copy |
| Neither selected | Existing ordinary local-field semantics |
| Create with selected reference | The transient target is absent from persisted metadata |

A submitted transient value equal to the authoritative stored value is a harmless
legacy echo: remove it from the submission and preserve the stored value. A
different submitted value is rejected using an existing validation error envelope
with code `related-display-field-not-writable`. This is the documented compatibility
policy for opted-in records; unchanged forms keep existing semantics. Internal
full-record candidates can retain equal stored values, but cannot introduce changed
source-populated values through hooks or snapshots.

For replace saves, restore protected pointers from the authoritative stored record
after applying the payload; omission must not erase them. For merges, preserve
ordinary array behavior outside protected pointers. Use presence-aware operations
so absence differs from `null`. Do not clean up legacy copied metadata here.

On unlink, the default is fresh local input/empty configured state, not an automatic
archive restore. A same-session form may explicitly submit a deliberate local
answer under its normal configuration. There is no durable prior-answer archive.

Workflow transitions must evaluate both source and target form contexts. Never
materialize departing display values into newly persistent fields. While a source
reference remains active, target workflow forms must retain compatible declarations;
an incompatible transition fails as a configuration error before side-effecting
hooks. Update all relevant opted-in workflow form versions together. Explicit
conversion/migration is separate work.

### Runtime envelope exclusion

Add a focused core utility that returns a detached record without root-level
`relatedMetadata`. Reuse it before write classification, canonical candidate
snapshots, storage payload construction and incidental root audit/index snapshots.
Strip again at Mongo create/update/batch boundaries as defense in depth. Do not
recursively delete user metadata keys with the same spelling.

Cover `create`, `updateMeta`, `updateMetaInternal`, `mutateMetaInternal`, post-sync
writebacks, storage `createBatch` and direct batch calls. The generic `createBatch`
path bypasses form validation today: for types containing active transient-display
rules, it must reject that bypass or explicitly route records through the same
normalizer. Do not silently claim full form enforcement from a storage-only strip.
Existing batch behavior for unconfigured types stays unchanged.

### Browser serialization and concurrency

Add a pure metadata projection helper used by submission serialization and every
local/conflict baseline. Remove active transient pointers from the local submission.
Never derive persistence solely from Angular disabled-state omission or arbitrary
`model.value` assignments.

Use the same descriptor-aware projection for initial baseline, saved baseline,
candidate freshness checks, latest-record comparisons and automatic conflict merge.
Transient population must not mark the form dirty or appear as a local edit.
When reference/activation/form contracts differ across concurrent snapshots,
disable automatic rebase for the affected subtree and use the existing manual
conflict path. A source-only edit does not invalidate root CAS.

Public write schemas describe protected fields as non-writable in the applicable
contract; required local validators must not require a transient submitted field.
For an unlinked candidate, existing local-field validation applies again. Published
schemas must describe conditional/runtime rules honestly, without claiming that
every stored reference always makes a target permanently non-persisting.

## 9. Validation and backend integrations

### Validation

Add optional `relatedMetadata?: RelatedMetadataRequest` to existing validation
operation definitions/overrides. Resolve it from the current candidate at the
central validation boundary. Supply a separate read-only related-data context to
opted-in validators; keep `transformedCandidate.metadata` local and persistable.
The existing validator context variable `record` may mean metadata, not a full
record envelope: add an explicit `relatedMetadata` variable without changing it.

Missing required relations block that operation. Optional ones expose statuses.
Existing unknown-dependency validators are not silently skipped. Existing validation
groups, roles and operation authorization continue to govern which rules run.

### Emails

Add optional `options.relatedMetadata: RelatedMetadataRequest`. Preserve the
disabled-email early return. For an enabled opted-in operation, enrich once before
evaluating its trigger, recipients, subject or body. Both `record` and
`imports.record` in the existing template context reference the enriched view.

Keep the original record for hook return values and `onNotifySuccess` mutations.
Do not replace it with the enriched rendering object. Required-resolution failure
must happen before sending; optional sources remain template-configurable. Do not
change delivery retries or create a new notification pipeline.

For record-backed administrative previews, declare the shared request on the
server-owned `emailnotification.templates[templateId].relatedMetadata` configuration.
Both delivery and preview use this default with the trusted caller's permissions.
An explicit delivery `options.relatedMetadata` overrides it (`null` disables the
default). A preview has no delivery-trigger options, so trigger-only overrides
are not inferred; template content and edited preview JSON cannot select relations.

### DOI minting/updating

Carry the same optional request through existing DOI operation/trigger options.
After selecting the existing profile, enrich the mapping input once and use it
for every path, Handlebars and JSONata binding in that run, including arrays.
Resolve before a DataCite HTTP request. Existing profile binding behavior remains.

Keep the original mutable record for DOI/citation writebacks. Source data cannot
become part of that writeback through a cloned enrichment object. Use existing DOI
failure and integration-audit paths, with no new evidence store or side-effect
transaction guarantee. Tests mock DataCite; they do not mint live identifiers.

### PDFs and asynchronous readiness

PDF generation loads the authenticated record page rather than rendering the
service argument. Add optional `waitForRelatedData: boolean` to existing PDF
options/configuration, default false. It supplements the existing readiness strategy.

Expose form-scoped readiness through a stable form DOM attribute:
`data-rb-related-state="pending|ready|error"`. A required-source failure produces
`error`; optional-source failure can settle as `ready` with its configured display.

Readiness must include fetches, dependent expressions/custom setters and template
rendering. The current event bus returns `void` while consumers are asynchronous:
a fetch-complete boolean or fixed timeout is insufficient. Add form-scoped pending
work accounting around related fetch/render work and existing expression consumer
promises. Register work synchronously before the first await and release it in
`finally`; observe work without changing expression execution order. Account for
downstream emitted events/custom repeatable setters before declaring quiescence.

Only expose this new readiness behavior for opted-in forms. Keep trackers isolated
per form instance; do not move the global event bus or introduce a new scheduler.
PDF waits for the expected form marker and fails through existing PDF errors on
required-source failure, missing marker or readiness timeout. No source wait is
added when the option is absent. Add real-browser coverage with delayed responses
and an asynchronous repeatable target.

### Other services and operation timing

Any hook/service can call the same helpers with an OID or supplied candidate.
Existing coordinator ordering and return values remain authoritative. A required
source failure stops that dependent output; it does not roll back a root save that
already committed before a post-hook ran. Existing side-effect/retry semantics are
not upgraded by this feature.

## 10. Queries and vocabulary reuse

Keep existing lookup/vocabulary selection and named-query execution. New related
data does not change what typeahead selections persist. Configure selectors to
retain references; fetch current values separately on subsequent reads.

Supplement `RelatedRecordFilterDefinition` with optional `rootRecordType` and
`relationId` for the declared relation path. Keep old filter definitions unchanged.
For new declared filters, derive reference paths/type/tenant/ACL from the configured
relation, apply the existing source predicate, then constrain authorized roots
before count and pagination. Do not let the request choose a collection or path.

For multiple references, the first release matches any readable source, without a
configurable match mode. Combine predicates that must match the same source in one source query;
do not accidentally match one condition on activity A and another on activity B.
Unspecified `all`, aggregation, unsupported literal-field query paths and effective
sorts are configuration errors. Sort by existing supported stored root fields with
a stable OID tie-breaker in the new opt-in path.

Bound materialized source IDs in the new query path to 1,000 initially, detecting
overflow rather than using an incomplete set. This query bound is distinct from
the smaller per-record resolution bounds. Keep legacy query limits unchanged.

Date discovery must rerun the current source predicate; a source date edit must
change the next matching root set even if the root modified date is unchanged.
This is query-time reuse, not a maintained projection or reverse-dependency feed.
Count/page consistency remains ordinary datastore consistency during concurrent
updates, not a new multi-document snapshot contract.

## 11. Configuration examples and compatibility

Add a generic example in `packages/redbox-hook-dev` using separate opted-in form
versions and record types/configuration as appropriate. Do not silently change
the persistence meaning of current demo/client forms.

The example must include:

- A plan referencing one activity, with a local notes field.
- Multiple activity references with repeatable titles and dates.
- A visible informational related-object template and a hidden source feeding
  ordinary controls through expressions.
- Different role/view presentations using the same relation and persistence rules.
- An email and DOI payload using `record.relatedMetadata`.
- A PDF readiness example and a current-source date-discovery named query.

Backward compatibility is tested by absence of each opt-in: old form definitions,
raw reads, graph APIs, getters, expressions, email/DOI options, PDF settings and
named-query filters continue to use their existing behavior. Do not globally
hydrate every `getMeta()` call or run every hook with a replaced record object.

## 12. Implementation boundaries and verification

The task list assigns contract, resolver, persistence, UI and consumer work with
explicit dependencies. The implementation plan defines release gates and test
commands. Minimum release evidence must prove:

1. Source-only changes affect the next form/API/email/DOI/PDF inputs without a root
   write; real DOI or other business writebacks still persist their intended data.
2. All supported references, projections, availability states and permissions obey
   the shared contract, including unsaved reference changes and late responses.
3. Replacement/merge/internal/batch paths cannot persist runtime related data or
   new display copies, and unrelated saves preserve retained metadata.
4. Existing framework behaviors remain compatible when not opted in.
5. PDF waits for fully applied data, not merely a completed network request.
6. Required query predicates operate before count/page and react to source edits.

No new general ownership framework, prior-answer archive, expression priority,
approval evidence, transitive calculation engine, shared cache, generic index,
automatic source-change workflow or multi-record transaction is part of this
design. Institution-specific migration and copy-writer retirement remain deployment
activities, with the migration gate documented in the implementation plan.

Implemented deviations: RR-08 additive descriptor types; scoped
`relatedViewPreserved` view marker and disabled preserved controls; readonly repeatable
add/remove/reorder restrictions; refresh CSRF enforced by the security hook rather
than required route-body schema; PDF content verified through pre-print DOM capture.
See the verification record for compatibility details and release blockers.
