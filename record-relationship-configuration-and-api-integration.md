# Record Relationship Configuration and API Integration

## Summary
Improve `RecordTypeConfig.relatedTo` from a lightly used lookup hint into a named relationship model that can drive form components, AJAX record fetches, REST record fetches, and dashboard relationship grouping.

Use these locked decisions:
- Relationship config style: named relation objects, backward compatible with existing `recordType` + `foreignField`.
- API shape: opt-in expansion via `include=relationships` or `includeRelationships=true`.
- Access: only return related records the caller can view.

## Public APIs / Interfaces / Types
Update `packages/redbox-core/src/config/recordtype.config.ts`:

```ts
export interface RecordRelation {
  id?: string;
  label?: string;
  recordType: string;
  localField?: string;      // defaults to redboxOid
  foreignField: string;     // path on target record
  cardinality?: 'one' | 'many';
  direction?: 'outbound' | 'inbound';
  formHints?: {
    componentNames?: string[];
    sourceField?: string;
    targetField?: string;
    inferWhen?: 'missingConfigOnly' | 'always';
  };
  dashboard?: {
    rowLevel?: number;
    compareField?: string;
  };
  includeByDefault?: boolean;
}
```

Keep existing configs valid:
```ts
relatedTo: [{ recordType: 'dataRecord', foreignField: 'metadata.rdmp.oid' }]
```

Normalize them internally to:
```ts
{
  id: 'rdmp__dataRecord__metadata_rdmp_oid',
  recordType: 'dataRecord',
  localField: 'redboxOid',
  foreignField: 'metadata.rdmp.oid',
  cardinality: 'many',
  direction: 'outbound'
}
```

Add relationship response types in `packages/redbox-core/src/RecordsService.ts` or a small shared model file:
```ts
export interface RecordRelationshipExpandOptions {
  depth?: number;              // default 1 for record fetches, existing recursive route can use unlimited/legacy depth
  includeRecordTypes?: string[];
  includeRelationIds?: string[];
  fields?: 'summary' | 'full';
}

export interface RecordRelationshipEdge {
  relationId: string;
  label?: string;
  sourceOid: string;
  targetOid: string;
  targetRecordType: string;
}

export interface RecordRelationshipGraph {
  rootOid: string;
  edges: RecordRelationshipEdge[];
  relatedObjects: Record<string, unknown[]>;
  omittedByAccess: Record<string, number>;
}
```

## Design

## 1. Data Model (Waterline Models)
No new Waterline model is required. Relationships remain derived from record metadata and `recordtype.relatedTo`.

Changed files:
- `packages/redbox-core/src/config/recordtype.config.ts`
- `packages/redbox-core/src/model/storage/RecordTypeModel.ts`
- `packages/redbox-core/src/waterline-models/RecordType.ts` if stricter typing is useful

Validation:
- `recordType` and `foreignField` are required.
- `localField` defaults to `redboxOid`.
- `id` defaults deterministically when omitted.
- Preserve `localField` semantics from existing wiki docs, but actually implement it in storage lookup.

## 2. Services Layer (Business Logic)
Changed files:
- `packages/redbox-core/src/services/RecordsService.ts`
- `packages/redbox-core/src/RecordsService.ts`
- `packages/redbox-core/src/StorageService.ts`
- `packages/sails-hook-redbox-storage-mongo/src/services/MongoStorageService.ts`

Add/extend methods:
```ts
RecordsService.getRelatedRecords(oid, brand, options?)
RecordsService.getMetaWithRelationships(oid, brand, options?)
```

Implementation details:
- Normalize relationship config before use.
- Resolve local value from `localField`; default to current record `redboxOid`.
- Query target records with:
  - `metaMetadata.type = relation.recordType`
  - `[relation.foreignField] = localValue`
- Use `enableExperimentalDeepTargets`.
- Track visited OIDs and relation IDs to avoid cycles.
- Respect `depth`.
- Return `RecordRelationshipGraph`, while preserving the existing `processedRelationships`/`relatedObjects` shape for callers of the legacy `/relatedRecords` path if needed.

## 3. Webservice Controllers (REST API)
Changed files:
- `packages/redbox-core/src/controllers/webservice/RecordController.ts`
- `packages/redbox-core/src/config/routes.config.ts` only if adding a dedicated REST relationships route

Update:
- `GET /:branding/:portal/api/records/metadata/:oid`

Behavior:
- Without include params: unchanged, returns current metadata response.
- With `?include=relationships` or `?includeRelationships=true`:
```json
{
  "data": {
    "metadata": {},
    "relationships": {
      "rootOid": "oid",
      "edges": [],
      "relatedObjects": {},
      "omittedByAccess": {}
    }
  }
}
```

Also add optional dedicated REST route:
- `GET /:branding/:portal/api/records/:oid/relationships`

Use REST auth and filter each related record through existing view-access logic before returning full metadata.

## 4. Ajax Controllers (Controllers)
Changed files:
- `packages/redbox-core/src/controllers/RecordController.ts`

Update:
- `GET /:branding/:portal/record/metadata/:oid`
- `GET /:branding/:portal/record/:oid/relatedRecords`

Behavior:
- `/record/metadata/:oid` stays unchanged unless include params are present.
- With relationship include, return the current metadata plus `meta.relationships`.
- `/relatedRecords` accepts `relationshipDepth`, `relationshipIds`, `recordTypes`, and `fields` query params, while preserving current Angular `RecordService.getRelatedRecords()` compatibility.

Access:
- Reuse `hasViewAccess(brand, req.user, record)` for each related target.
- Omit inaccessible targets from `relatedObjects`.
- Increment `omittedByAccess[relationId]`.

## 5. Angular App(s)
Changed files:
- `angular/projects/researchdatabox/portal-ng-common/src/lib/record.service.ts`
- `angular/projects/researchdatabox/form/src/app/component/record-selector.component.ts`
- `angular/projects/researchdatabox/form/src/app/component/record-metadata-retriever.component.ts`
- `angular/projects/researchdatabox/dashboard/src/app/dashboard.component.ts`
- `packages/sails-ng-common/src/config/component/record-selector.*`
- optionally `packages/sails-ng-common/src/config/component/typeahead-input.*`

Angular behavior:
- Add `RecordService.getRecordMeta(oid, { includeRelationships, relationshipDepth, relationshipFields })`.
- Add `RecordService.getRelationshipGraph(oid, options)`.
- Extend `RecordSelectorComponent` config with optional `relationshipId`.
- If `recordType` or `filterFields` are absent and `relationshipId` is present, derive them from `recordtype.relatedTo`.
- `RecordMetadataRetrieverComponent` can fetch related metadata through the included graph instead of issuing separate metadata calls when relationship data is already present.
- Dashboard `groupedByRelationships` should prefer relation config by `relationshipId` and fall back to the existing `sortGroupBy.relatedTo` path.

Do not add Angular routing; these remain embedded Angular apps inside existing Sails/EJS views.

## 6. Additional Views
No new EJS views are required.

Potential documentation-only updates:
- `support/wiki/Configuring-Related-Records.md`
- `support/wiki/Configuring-Dashboard-Tables.md`
- `support/wiki/ReDBox-Portal-API.md`

## 7. Navigation Configuration
No navigation changes.

# Consistency Analysis
Current gaps addressed:
- `localField` is documented but effectively ignored by Mongo relationship lookup.
- Related data is available only through a specific AJAX route, not normal record fetches.
- Dashboard grouping duplicates relationship path config in `dashboardtype.sortGroupBy.relatedTo`.
- Form components require manual `recordType`/filter wiring even when relationship config already knows it.

Risks:
- Recursive relationship expansion can be expensive; default fetch expansion depth must be `1`.
- Existing `/relatedRecords` callers expect flattened `items`; keep Angular `RecordService.getRelatedRecords()` output stable.
- Access filtering must be in controller/service layer, not only storage, because storage has no request user.

Assumptions:
- `redboxOid` is the default local identity field.
- Existing `relatedTo` configs must continue to work unchanged.
- Full metadata expansion is opt-in only.

# Implementation Plan
1. Add normalized relationship types and helper utilities in `packages/redbox-core/src/config/recordtype.config.ts` or a new `relationship-config.util.ts`.
2. Update `RecordTypeModel.RelatedTo` to include `id`, `label`, `localField`, `cardinality`, `direction`, `formHints`, and `dashboard`.
3. Update `MongoStorageService.getRelatedRecords()` to use normalized config, support `localField`, `depth`, cycle protection, and relation IDs.
4. Update `StorageService` and `RecordsService` interfaces/signatures for relationship options and graph response.
5. Add `RecordsService.getMetaWithRelationships()` to compose `getMeta()` plus `getRelatedRecords()`.
6. Update AJAX `RecordController.getMeta()` and `getRelatedRecords()` for opt-in relationship expansion and view filtering.
7. Update webservice `RecordController.getMeta()` for the same opt-in REST contract.
8. Update Angular `RecordService` with typed relationship methods and include params.
9. Extend `RecordSelectorComponent` config to accept `relationshipId`; derive missing search config from relationship metadata where possible.
10. Update dashboard relationship grouping to accept relation IDs while keeping existing path config as fallback.
11. Update wiki docs with new config examples, API include params, and migration notes.

# Test Cases and Scenarios
Backend unit tests:
- `packages/sails-hook-redbox-storage-mongo/test/services/MongoStorageService.test.ts`
  - old `relatedTo` config still works
  - `localField` is honored
  - relationship `id` is generated when missing
  - depth limit prevents extra traversal
  - cycles do not recurse forever

Core service/controller tests:
- `packages/redbox-core/test/services/RecordsService.test.ts`
  - passes relationship options to storage
  - `getMetaWithRelationships()` returns record plus graph
- `packages/redbox-core/test/controllers/RecordController.test.ts`
  - AJAX metadata without include remains unchanged
  - AJAX metadata with include returns relationships
  - inaccessible related records are omitted
- Add webservice controller tests for REST include behavior.

Angular unit tests:
- `angular/projects/researchdatabox/portal-ng-common/src/lib/record.service.spec.ts`
  - include params are serialized correctly
- `angular/projects/researchdatabox/form/src/app/component/record-selector.component.spec.ts`
  - relationship-derived config is used when explicit `recordType` is missing
- `angular/projects/researchdatabox/dashboard/src/app/dashboard.component.spec.ts`
  - relation ID grouping works and legacy `relatedTo` path fallback still works

Bruno/API tests:
- Add REST request under `test/bruno/1 - REST API/1 - Record Management/`:
  - fetch metadata without include
  - fetch metadata with `include=relationships`
  - assert relationship graph contains the data record/publication created by existing test setup
- Add AJAX request under `test/bruno/2 - AJAX calls/1 - Admin User Tests/`:
  - fetch `/record/metadata/:oid?include=relationships`
  - fetch `/record/:oid/relatedRecords?relationshipDepth=1`

Verification commands:
- `npm run test:storage-mongo`
- `npm run test:core`
- `npm run test:sails-ng-common`
- `npm run test:angular`
- `npm run compile:server`
- `npm run test:mocha:mount`
- `npm run test:bruno:general:mount`
