# Related-record resolution: implementation task list

Status: RR-01–RR-22 completed with recorded evidence and baseline exceptions.
The discovered lint defect is fixed and verified. See [verification.md](verification.md).

[tasks.json](tasks.json) is the machine-readable dependency,
status and file-ownership manifest; this document provides readable task briefs.
Update manifest statuses during execution. Writing a design/brief does not complete
an implementation task.

Read the [design](design.md) and [implementation plan](implementation-plan.md) before
assigning work. Dependencies and shared-file locks both govern scheduling.

## Task index

| ID | Task | Dependencies | Track |
| --- | --- | --- | --- |
| [RR-01](#rr-01) | Record baseline and establish shared fixtures | None | integration |
| [RR-02](#rr-02) | Add shared DTOs and opt-in configuration contracts | RR-01 | contracts |
| [RR-03](#rr-03) | Exclude runtime enrichment from persistence snapshots | RR-02 | persistence |
| [RR-04](#rr-04) | Provide bounded authorized relation reads in storage | RR-02 | storage |
| [RR-05](#rr-05) | Implement shared resolver and enrichment helpers | RR-03, RR-04, RR-08 | resolver |
| [RR-06](#rr-06) | Integrate shared resolution into initial form construction | RR-05 | forms-server |
| [RR-07](#rr-07) | Add resolved-read and unsaved-refresh routes and client | RR-05 | api |
| [RR-08](#rr-08) | Compile transient display descriptors and fingerprints | RR-02 | forms-contract |
| [RR-09](#rr-09) | Enforce transient display rules across saves and batches | RR-03, RR-05, RR-08 | persistence |
| [RR-10](#rr-10) | Describe conditional transient fields in write schemas | RR-08, RR-09 | schemas |
| [RR-11](#rr-11) | Add component fetching, existing events and render refresh | RR-06, RR-07, RR-08 | forms-client |
| [RR-12](#rr-12) | Separate submission and conflict state from transient controls | RR-08, RR-09 | forms-client |
| [RR-13](#rr-13) | Track settled related rendering and PDF readiness | RR-11, RR-12 | pdf |
| [RR-14](#rr-14) | Enrich existing email evaluation contexts | RR-03, RR-05 | email |
| [RR-15](#rr-15) | Enrich DOI binding inputs and preserve writeback | RR-03, RR-05 | doi |
| [RR-16](#rr-16) | Supply separate related inputs to validation operations | RR-05, RR-09 | validation |
| [RR-17](#rr-17) | Reuse declared source filters before count and pagination | RR-04, RR-05 | queries |
| [RR-18](#rr-18) | Provide a complete generic plan and activity example | RR-06, RR-07, RR-09, RR-10, RR-11, RR-12, RR-13, RR-14, RR-15, RR-16, RR-17 | examples |
| [RR-19](#rr-19) | Prove backend and persistence behavior end to end | RR-03, RR-04, RR-05, RR-07, RR-09, RR-10, RR-14, RR-15, RR-16, RR-17, RR-18 | integration |
| [RR-20](#rr-20) | Prove form races and PDF readiness in browsers | RR-11, RR-12, RR-13, RR-18 | browser-integration |
| [RR-21](#rr-21) | Document APIs, configuration and deployment migration | RR-18, RR-19, RR-20 | documentation |
| [RR-22](#rr-22) | Complete release evidence and implementation handoff | RR-21 | release |

## Dependency waves

These are earliest dependency-ready groups, not permission to edit shared files
concurrently. Acquire each task's locks before assignment.

- Wave 1: RR-01.
- Wave 2: RR-02.
- Wave 3: RR-03, RR-04, RR-08.
- Wave 4: RR-05.
- Wave 5: RR-06, RR-07, RR-09, RR-14, RR-15, RR-17.
- Wave 6: RR-10, RR-11, RR-12, RR-16.
- Wave 7: RR-13.
- Wave 8: RR-18.
- Wave 9: RR-19, RR-20.
- Wave 10: RR-21.
- Wave 11: RR-22.

## Assignment rules

- Supply the task brief, design and dependency results to its implementer.
- Keep public contracts fixed after RR-02 unless all downstream work is coordinated.
- Respect locks: several tasks touch RecordsService, form.component.ts or Mongo.
- Email and DOI are independent consumer tracks after the shared resolver is ready.
- Use RR-01 fixtures and RR-02 DTOs instead of inventing consumer-specific sources.
- Return changed files, behavior, actual validations, baseline issues and blockers.
- Meaningful tests ship with behavior; final integration complements those tests.
- Old behavior remains when opt-ins are absent. Do not add excluded frameworks.

## Task briefs

### RR-01

**Record baseline and establish shared fixtures**

Track: integration. Dependencies: none.
Locks: shared-test-fixtures.
Design sections: 1, 2, 11.

**Existing files to inspect/change:**

- `AGENTS.md`
- `support/wiki/ReDBox-Automated-Tests.md`
- `packages/redbox-core/test/setup.ts`
- `test/playwright/helpers.ts`

**Proposed new files:**

- `packages/redbox-core/test/fixtures/related-records.fixtures.ts`

**Deliverables:**

- Record current HEAD, existing worktree changes, relevant package commands and focused baseline results.
- Create generic root/activity, user/role and cross-tenant fixtures independent of new runtime types.
- Define shared scenarios for source-only changes, reference races, retained local data and required/optional sources.

**Acceptance:**

- Existing work is preserved and baseline failures include exact commands/errors.
- Fixtures include scalar/object/array references, two relations to one type, denied/deleted sources and explicit empty/literal-key data.
- No institution-specific rules, live credentials or external side effects enter fixtures.

**Validation:**

- Existing isolated visitor and relationship-authorization suites
- Focused RecordsService/email/DOI/storage baseline cases

### RR-02

**Add shared DTOs and opt-in configuration contracts**

Track: contracts. Dependencies: RR-01.
Locks: common-contracts, core-public-exports.
Design sections: 3, 4, 7, 8, 9.

**Existing files to inspect/change:**

- `packages/sails-ng-common/src/index.ts`
- `packages/sails-ng-common/src/config/form-component.outline.ts`
- `packages/sails-ng-common/src/config/form-component.model.ts`
- `packages/sails-ng-common/src/config/component/related-object-data.outline.ts`
- `packages/sails-ng-common/src/config/component/related-object-data.model.ts`
- `packages/sails-ng-common/src/validation/record-validation.model.ts`
- `packages/redbox-core/src/config/recordtype.config.ts`
- `packages/redbox-core/src/model/storage/RecordTypeModel.ts`
- `packages/redbox-core/src/model/storage/RecordModel.ts`
- `packages/redbox-core/src/RecordsService.ts`
- `packages/redbox-core/src/index.ts`

**Proposed new files:**

- `packages/sails-ng-common/src/related-records.model.ts`
- `packages/redbox-core/src/related-records/types.ts`

**Deliverables:**

- Implement result/status/request DTOs and optional runtime-only record.relatedMetadata typing.
- Supplement RecordRelation with oidProperty and resolution.metadataFields, retaining old defaults.
- Type component relationId/required, form relatedDisplay and optional validation-operation related requests.
- Declare new methods/read context without global hydration or a duplicate relationship registry.

**Acceptance:**

- Old form and record-type configurations typecheck unchanged.
- Common has no dependency on core/Sails runtime types; the component remains model-free.
- Design examples and exported types agree; new options remain absent by default.

**Validation:**

- npm run test:config-types
- Common compile and configuration construction/type coverage

### RR-03

**Exclude runtime enrichment from persistence snapshots**

Track: persistence. Dependencies: RR-02.
Locks: core-records-service, mongo-storage.
Design sections: 8.

**Existing files to inspect/change:**

- `packages/redbox-core/src/services/RecordsService.ts`
- `packages/redbox-core/src/RecordWriteClassification.ts`
- `packages/sails-hook-redbox-storage-mongo/src/services/MongoStorageService.ts`

**Proposed new files:**

- `packages/redbox-core/src/related-records/runtime-record.ts`
- `packages/redbox-core/test/related-records/runtime-record.test.ts`

**Deliverables:**

- Add detached root-only runtime-property exclusion before classification, canonical candidates and incidental audit/index snapshots.
- Strip again at native Mongo create/update/batch boundaries and cover internal/writeback flows.
- Leave ordinary metadata properties with the same spelling untouched.

**Acceptance:**

- Runtime enrichment neither mutates its input nor creates a false system-write classification.
- Native create/update/batch payloads cannot persist relatedMetadata.
- Existing integration fields and ordinary metadata survive unchanged.

**Validation:**

- Runtime-record unit suite
- Existing write classification/save cases
- Mongo native persistence tests

### RR-04

**Provide bounded authorized relation reads in storage**

Track: storage. Dependencies: RR-02.
Locks: mongo-storage, storage-interface.
Design sections: 4, 5.

**Existing files to inspect/change:**

- `packages/redbox-core/src/StorageService.ts`
- `packages/sails-hook-redbox-storage-mongo/src/services/MongoStorageService.ts`
- `packages/sails-hook-redbox-storage-mongo/test/services/MongoStorageService.test.ts`

**Proposed new files:**

- `packages/sails-hook-redbox-storage-mongo/test/integration/MongoRelatedRecords.integration.test.ts`

**Deliverables:**

- Add optional findRecordsByRelation using server-derived tenant/type/path/values and principal ACL constraints.
- Reuse current matching and list-ACL construction, applying tenant/ACL before limit; return deterministic complete/overflow results.
- Keep bounded direct-OID fallback for other adapters and explicitly fail unsupported non-OID shapes.

**Acceptance:**

- Unreadable/cross-tenant sources cannot influence visible counts/results.
- Scalar/object-array and reverse relation cases behave as declared.
- Limit + 1 detects overflow without successful truncation.
- Legacy graph traversal defaults/shapes remain compatible.

**Validation:**

- npm run test:storage-mongo
- Actual Mongo integration with MONGO_CONCURRENCY_TEST_URL

### RR-05

**Implement shared resolver and enrichment helpers**

Track: resolver. Dependencies: RR-03, RR-04, RR-08.
Locks: core-records-service, core-public-exports, core-record-controller.
Design sections: 3, 4, 5.

**Existing files to inspect/change:**

- `packages/redbox-core/src/services/RecordsService.ts`
- `packages/redbox-core/src/RecordsService.ts`
- `packages/redbox-core/src/services/FormRecordConsistencyService.ts`
- `packages/redbox-core/src/controllers/RecordController.ts`

**Proposed new files:**

- `packages/redbox-core/src/related-records/resolver.ts`
- `packages/redbox-core/src/related-records/references.ts`
- `packages/redbox-core/src/related-records/projection.ts`
- `packages/redbox-core/test/related-records/resolver.test.ts`

**Deliverables:**

- Implement relation lookup, reference normalization/order, projection, safe statuses, required checks and operation-local deduplication/limits.
- Export resolveRelatedMetadata, enrichWithRelatedMetadata and getMetaWithRelatedMetadata on the existing service.
- Extract/reuse caller-effective browser source projection; never fall back to unrestricted metadata.
- Use supplied candidate references and rebuild runtime results without saving or mutating the root.

**Acceptance:**

- Literal keys and explicit empty values survive projection; absent fields remain absent.
- Safe statuses do not leak hidden OIDs or denial/existence distinctions.
- Unsaved candidate references, cardinality, deadlines and unsupported adapters have coverage.
- Resolution causes no root revision, modified-date, audit or recursive-calculation side effects.

**Validation:**

- Resolver/reference/projection suites
- Existing authorization regression suite
- Core build and service registration checks

### RR-06

**Integrate shared resolution into initial form construction**

Track: forms-server. Dependencies: RR-05.
Locks: core-forms-service.
Design sections: 2, 7.

**Existing files to inspect/change:**

- `packages/redbox-core/src/visitor/related-object-data-inline.visitor.ts`
- `packages/redbox-core/src/services/FormsService.ts`
- `packages/redbox-core/test/visitor/related-object-data-inline.visitor.test.ts`

**Deliverables:**

- Use relationId for new shared resolution and attach safe initial result/fingerprint/client descriptors.
- Adapt new entries into existing relatedObjects/template buckets.
- Retain legacy dataPath/oidProperty/relatedFields through a trusted compatibility adapter; keep source values out of canonical metadata.

**Acceptance:**

- Old inline configurations retain their rendering contract.
- New initial resolution is identical to backend resolution for the same authorized source request.
- New scalar/object/multiple references work without stored-data migration.

**Validation:**

- Inline visitor and new relation-mode cases
- FormsService/construct visitor regressions

### RR-07

**Add resolved-read and unsaved-refresh routes and client**

Track: api. Dependencies: RR-05.
Locks: api-registry, core-record-controller, portal-record-client.
Design sections: 6.

**Existing files to inspect/change:**

- `packages/redbox-core/src/controllers/RecordController.ts`
- `packages/redbox-core/src/controllers/webservice/RecordController.ts`
- `packages/redbox-core/src/config/routes.config.ts`
- `packages/redbox-core/src/config/policies.config.ts`
- `packages/redbox-core/src/api-routes/route-registry.ts`
- `packages/redbox-core/src/api-routes/index.ts`
- `angular/projects/researchdatabox/portal-ng-common/src/lib/record.service.ts`

**Proposed new files:**

- `packages/redbox-core/src/api-routes/groups/related-records.ts`
- `packages/redbox-core/test/related-records/routes.test.ts`

**Deliverables:**

- Add explicit enriched GET and session/CSRF refresh POST through existing routing/auth conventions.
- Derive root type/form/creation rights authoritatively and allow only declared reference overrides.
- Sanitize public envelopes and use private/no-store rather than root-only 304 handling.
- Add typed Angular RecordService methods and route/OpenAPI schemas.

**Acceptance:**

- Existing/new unsaved references resolve without a root save.
- Request input cannot widen fields, queries, brand, form or service identity.
- Raw response shapes/ETags remain unchanged; safe status/error mappings are covered.
- Authentication, CSRF and malformed-body cases use real route tests.

**Validation:**

- npm run validate:api-routes
- Route/API integration coverage
- Portal-ng-common client cases

### RR-08

**Compile transient display descriptors and fingerprints**

Track: forms-contract. Dependencies: RR-02.
Locks: core-records-service, core-form-config, common-contracts.
Design sections: 7, 8.

**Existing files to inspect/change:**

- `packages/sails-ng-common/src/config/visitor/common.model.ts`
- `packages/redbox-core/src/visitor/construct.visitor.ts`
- `packages/redbox-core/src/services/FormsService.ts`
- `packages/redbox-core/src/services/RecordsService.ts`
- `packages/redbox-core/test/unit/construct.visitor.test.ts`

**Proposed new files:**

- `packages/redbox-core/src/related-records/display-descriptors.ts`
- `packages/redbox-core/test/related-records/display-descriptors.test.ts`

**Deliverables:**

- Compile metadata-pointer/relation descriptors from canonical forms/reusables before caller-specific UI removal.
- Carry relatedDisplay and source descriptors through construction/transforms/bootstrap.
- Validate role-variant/overlap consistency using existing lineage conventions.
- Include referenced relation definitions and flags in existing form fingerprints.

**Acceptance:**

- Scalar, group-leaf, whole-group and complete-repeatable paths are correct.
- Tabs, reusables and model-free groups do not create incorrect metadata nesting.
- Role presentations remain flexible but agree on metadata persistence.
- Central relation changes invalidate opted-in contracts; old forms retain behavior.

**Validation:**

- Descriptor suite
- Construct/reusable form coverage
- Fingerprint/concurrency regressions

### RR-09

**Enforce transient display rules across saves and batches**

Track: persistence. Dependencies: RR-03, RR-05, RR-08.
Locks: core-records-service, mongo-storage.
Design sections: 8.

**Existing files to inspect/change:**

- `packages/redbox-core/src/services/RecordsService.ts`
- `packages/redbox-core/src/RecordSaveResponse.ts`
- `packages/sails-hook-redbox-storage-mongo/src/services/MongoStorageService.ts`
- `packages/redbox-core/test/services/RecordsService.test.ts`

**Proposed new files:**

- `packages/redbox-core/src/related-records/normalize-display-writes.ts`
- `packages/redbox-core/test/related-records/display-writes.test.ts`

**Deliverables:**

- Normalize authoritative target/reference state before structural validation and after hooks/transformations.
- Preserve stored values/absence under active replace/merge, discard equal stored echoes and reject changed transient submissions.
- On unlink accept explicit local input and clear omitted retained targets under merge/replace.
- Preflight source/target workflow contracts before side-effecting hooks; cover internal/post-sync writes.
- Reject unsupported active transient batches before any batch insertion, including direct adapter batch entrypoints.

**Acceptance:**

- Manipulated controls/API/internal candidates cannot introduce source copies.
- Unrelated saves preserve retained values and normal array behavior outside protected targets.
- Unlink cannot revive a legacy copy; null remains distinct from absence.
- Transitions cannot implicitly materialize displayed values as local answers.
- CAS/hook ordering and existing partial-commit semantics are preserved; unconfigured batches remain compatible.

**Validation:**

- Display-writes suite
- Existing create/update/transition/internal-save regressions
- Mongo batch guard/no-partial-write cases

### RR-10

**Describe conditional transient fields in write schemas**

Track: schemas. Dependencies: RR-08, RR-09.
Locks: record-contract-compiler.
Design sections: 8.

**Existing files to inspect/change:**

- `packages/redbox-core/src/record-contract/core-contributors.ts`
- `packages/redbox-core/src/record-contract/record-contract-compiler.ts`
- `packages/redbox-core/src/record-contract/types.ts`
- `packages/redbox-core/test/unit/record-contract/compiler.test.ts`

**Deliverables:**

- Propagate relatedDisplay into contract annotations and applicable conditional writability/required behavior.
- Keep references/local inputs represented normally and the related-object carrier non-persisting.
- Describe runtime conditional rules without reclassifying every ordinary input.

**Acceptance:**

- Linked transient targets are not required persisted inputs.
- Unlinked local inputs retain ordinary type/validation behavior.
- Schemas accurately explain conditional behavior; old snapshots and contributor coverage remain compatible.

**Validation:**

- npm run test:record-contracts
- Compiler/schema tests and relevant rollout regressions

### RR-11

**Add component fetching, existing events and render refresh**

Track: forms-client. Dependencies: RR-06, RR-07, RR-08.
Locks: angular-related-lifecycle, angular-content-rendering.
Design sections: 7.

**Existing files to inspect/change:**

- `angular/projects/researchdatabox/form/src/app/component/related-object-data.component.ts`
- `angular/projects/researchdatabox/form/src/app/component/related-object-data.component.spec.ts`
- `angular/projects/researchdatabox/form/src/app/component/record-metadata-retriever.component.ts`
- `angular/projects/researchdatabox/form/src/app/component/record-metadata-retriever.component.spec.ts`
- `angular/projects/researchdatabox/form/src/app/component/content.component.ts`

**Proposed new files:**

- `angular/projects/researchdatabox/form/src/app/form-state/related-records/related-record-request.ts`

**Deliverables:**

- Factor request generation/disposal from existing getter patterns without changing getter defaults.
- Reuse matching initial results and publish existing value-change events after subscriptions exist.
- Watch canonical references; refresh unsaved selection/same-ID explicit requests and publish current loading/empty/error results.
- Add awaitable protected content refresh; keep hidden components active and model-free.

**Acceptance:**

- Latest selection wins after every asynchronous extraction/fetch step.
- No previous source appears under a new selection; destruction prevents late publication.
- Existing getter/content/expression behavior remains compatible.
- Initial events and scalar/group/repeatable consumers work through existing semantics.

**Validation:**

- Related-object, retriever and content Angular suites
- Delayed-response/hidden-source cases

### RR-12

**Separate submission and conflict state from transient controls**

Track: forms-client. Dependencies: RR-08, RR-09.
Locks: angular-form-component, common-metadata-projection.
Design sections: 8.

**Existing files to inspect/change:**

- `angular/projects/researchdatabox/form/src/app/form.component.ts`
- `angular/projects/researchdatabox/form/src/app/form.service.ts`

**Proposed new files:**

- `packages/sails-ng-common/src/related-display-projection.ts`
- `angular/projects/researchdatabox/form/src/app/form-state/related-records/related-display-projection.spec.ts`

**Deliverables:**

- Implement pure descriptor-aware local submission/comparison projection using presence-aware pointer operations.
- Apply it to saves, initial/saved baselines, freshness checks and manual/automatic conflict candidates.
- Retain raw displayed values for expressions; conservatively use existing conflict handling when reference/contracts differ.

**Acceptance:**

- Source population/refresh causes no user edit or false deletion diff.
- Active transient values never enter local save payloads.
- Local/reference/unlink changes and real concurrency conflicts remain detectable.
- Nested/group/repeatable projection does not rely only on Angular disabled-state behavior.

**Validation:**

- Projection/serialization/conflict unit cases
- Existing form CAS/merge tests
- Unrelated-local-edit runtime scenario

### RR-13

**Track settled related rendering and PDF readiness**

Track: pdf. Dependencies: RR-11, RR-12.
Locks: angular-form-component, angular-expression-readiness, pdf-service.
Design sections: 7, 9.

**Existing files to inspect/change:**

- `angular/projects/researchdatabox/form/src/app/form.component.ts`
- `angular/projects/researchdatabox/form/src/app/form-state/events/form-component-base-event-consumer.ts`
- `angular/projects/researchdatabox/form/src/app/form-state/apply-expression-target.ts`
- `packages/sails-hook-redbox-pdfgen/src/api/services/PDFService.ts`
- `packages/sails-hook-redbox-pdfgen/src/config/pdfgen.ts`
- `packages/sails-hook-redbox-pdfgen/test/unit/PDFService.test.ts`

**Proposed new files:**

- `angular/projects/researchdatabox/form/src/app/form-state/related-records/related-data-state.service.ts`

**Deliverables:**

- Add form-scoped accounting for fetch/render work and existing asynchronous expression/custom-setter promises.
- Register work before awaits and release in finally, observing downstream events without changing ordering/priority.
- Expose data-rb-related-state and opt-in waitForRelatedData after existing PDF readiness.
- Handle required errors/missing marker/timeouts through current PDF failure paths.

**Acceptance:**

- Fetch completion cannot mark readiness before asynchronous target/render completion.
- Late/aborted generations release tokens safely; multiple forms remain isolated.
- Legacy forms/PDF options remain compatible.
- Actual delayed-page/repeatable PDF coverage proves final content, not just a mocked pending flag.

**Validation:**

- Angular readiness/expression cases
- PDF unit suite
- Actual-browser PDF test in RR-20

### RR-14

**Enrich existing email evaluation contexts**

Track: email. Dependencies: RR-03, RR-05.
Locks: email-service.
Design sections: 9.

**Existing files to inspect/change:**

- `packages/redbox-core/src/services/EmailService.ts`
- `packages/redbox-core/test/services/EmailService.test.ts`

**Deliverables:**

- Add optional options.relatedMetadata without changing service signatures.
- Keep disabled early return; enrich once before opted-in trigger/recipient/subject/body evaluation.
- Use the enriched view for record/imports.record while retaining original hook return/success mutation semantics.

**Acceptance:**

- Every email property uses one fresh consistent related result.
- Required failure stops sendMessage; optional data follows template configuration.
- Default options fetch nothing extra and successful hooks do not persist incidental enrichment.

**Validation:**

- EmailService unit cases
- Mock/local transport integration in RR-19

### RR-15

**Enrich DOI binding inputs and preserve writeback**

Track: doi. Dependencies: RR-03, RR-05.
Locks: doi-service.
Design sections: 9.

**Existing files to inspect/change:**

- `packages/redbox-core/src/services/DoiService.ts`
- `packages/redbox-core/src/services/doi-v2/types.ts`
- `packages/redbox-core/src/services/doi-v2/context.ts`
- `packages/redbox-core/src/configmodels/DoiPublishing.ts`
- `packages/redbox-core/test/services/DoiService.test.ts`

**Deliverables:**

- Carry optional related requests through existing operation/trigger options.
- Enrich the v2 mapping input once before path/template/JSONata/array mapping and HTTP.
- Keep original mutable record for DOI/citation writeback and existing audits/errors.
- Retain unconfigured legacy DOI behavior; reject unsupported legacy new-option use explicitly.

**Acceptance:**

- Create/update payloads read current source values through existing bindings.
- Required failure prevents DataCite HTTP.
- Writeback changes intended DOI fields with normal CAS, never source metadata/runtime properties.
- Tests do not mint live identifiers.

**Validation:**

- DoiService/doi-v2 mapping cases
- Internal writeback and mocked integration coverage

### RR-16

**Supply separate related inputs to validation operations**

Track: validation. Dependencies: RR-05, RR-09.
Locks: core-records-service, record-validation-service.
Design sections: 8, 9.

**Existing files to inspect/change:**

- `packages/redbox-core/src/services/RecordsService.ts`
- `packages/redbox-core/src/services/RecordValidationService.ts`
- `packages/sails-ng-common/src/validation/record-validation.model.ts`

**Proposed new files:**

- `packages/redbox-core/test/related-records/validation-context.test.ts`

**Deliverables:**

- Resolve configured operation relations against the candidate with its actual effective read principal.
- Expose read-only relatedMetadata without changing existing validator record/metadata meanings.
- Keep runtime values out of transformedCandidate metadata and respect existing groups/roles/unknown-dependency validators.

**Acceptance:**

- Candidate reference changes and current source data reach opted-in validators.
- Required absence blocks dependent validation; optional status remains usable.
- Unrelated saves proceed only when their selected validation completes, with no skipped legacy rules.
- No privileges are inferred from role names alone and no transformation can reintroduce display copies.

**Validation:**

- Validation-context suite
- Existing validation operation/authorization cases
- Save/transition integration

### RR-17

**Reuse declared source filters before count and pagination**

Track: queries. Dependencies: RR-04, RR-05.
Locks: named-query-service.
Design sections: 10.

**Existing files to inspect/change:**

- `packages/redbox-core/src/config/namedQuery.config.ts`
- `packages/redbox-core/src/services/NamedQueryService.ts`
- `packages/redbox-core/src/services/FormVocabularyService.ts`
- `packages/redbox-core/test/services/NamedQueryServiceMongoDates.test.ts`

**Proposed new files:**

- `packages/redbox-core/test/related-records/named-query.test.ts`

**Deliverables:**

- Add optional rootRecordType/relationId to current relatedRecordFilters and derive paths/types/ACL from trusted relations.
- Apply source predicates and root authorization before count/page; combine any/exists predicates on the same source correctly.
- Bound source-ID materialization and fail overflow explicitly; preserve existing vocabulary/legacy filters.
- Reject unsupported effective sort/all/aggregation cases and use supported root sorting with OID tie-breaker.

**Acceptance:**

- Source date changes alter next query membership without root writes.
- Counts/pages use authorized current matches and do not disclose hidden source values.
- Same-source predicates cannot accidentally match different activities.
- Limits/unsupported shapes fail explicitly, with no post-pagination filtering shortcut.

**Validation:**

- Named-query suite and existing Mongo date cases
- Authorization/count/page runtime integration

### RR-18

**Provide a complete generic plan and activity example**

Track: examples. Dependencies: RR-06, RR-07, RR-09, RR-10, RR-11, RR-12, RR-13, RR-14, RR-15, RR-16, RR-17.
Locks: dev-hook-configuration.
Design sections: 11.

**Existing files to inspect/change:**

- `packages/redbox-hook-dev/src/config/recordtype.ts`

**Proposed new files:**

- `packages/redbox-hook-dev/src/form-config/related-plan-1.0-draft.ts`
- `packages/redbox-hook-dev/src/form-config/related-activity-1.0-draft.ts`

**Deliverables:**

- Register separate opted-in forms/types with current discovery conventions.
- Demonstrate local notes, single/multiple references, titles/dates, visible informational content and hidden expression source.
- Include role/view presentation variants plus email/DOI mappings, PDF wait and source-date query using test-safe options.

**Acceptance:**

- Examples run through existing framework mechanisms rather than pseudocode only.
- Current demo/client forms retain their original persistence behavior.
- No institution-specific business rule, new approval workflow or automatic source-change effect is added.

**Validation:**

- Dev-hook build/config loading
- Shared fixture setup for backend/browser integration

### RR-19

**Prove backend and persistence behavior end to end**

Track: integration. Dependencies: RR-03, RR-04, RR-05, RR-07, RR-09, RR-10, RR-14, RR-15, RR-16, RR-17, RR-18.
Locks: backend-integration-fixtures.
Design sections: 12.

**Existing files to inspect/change:**

- `test/integration/services/RecordsService.test.ts`
- `test/integration/services/EmailService.test.ts`

**Proposed new files:**

- `test/integration/services/RelatedRecordResolution.test.ts`

**Deliverables:**

- Exercise actual service/HTTP/Mongo paths and compare root metadata/revision/dates/audit around source-only edits.
- Exercise email evaluation, mocked DOI payload/writeback, validation/query membership and supported save modes.
- Cover manipulated payloads, runtime keys, batches, permissions/deletion/config changes and opt-out compatibility.

**Acceptance:**

- Source-only edits change consumer inputs without root writes.
- Real local/DOI writes persist intended changes only.
- Native storage and full pipeline evidence agree; old APIs/config/consumers have explicit assertions.
- No live mail/DOI side effects occur.

**Validation:**

- Runtime integration command in implementation-plan.md
- Actual Mongo evidence
- Schema/concurrency/hook regression suites

### RR-20

**Prove form races and PDF readiness in browsers**

Track: browser-integration. Dependencies: RR-11, RR-12, RR-13, RR-18.
Locks: browser-fixtures, pdf-browser-tests.
Design sections: 7, 9, 12.

**Existing files to inspect/change:**

- `test/playwright/helpers.ts`
- `packages/sails-hook-redbox-pdfgen/test/unit/PDFService.test.ts`

**Proposed new files:**

- `test/playwright/related-record-resolution.spec.ts`

**Deliverables:**

- Use existing login/bootstrap helpers and the generic runtime example.
- Exercise initial/hidden/visible scalar/group/repeatable output, same-ID refresh, unlink/failure, A-to-B races and role presentations.
- Prove save/dirty/conflict behavior and print a PDF after delayed data plus asynchronous repeatable population.

**Acceptance:**

- Older responses cannot win after selection or reload.
- Final UI agrees with shared backend data and transient updates are not user edits/conflicts.
- PDF waits for fully applied content and fails on required-source errors.
- Legacy form/PDF behavior remains covered.

**Validation:**

- npm run test:playwright:mount
- Actual PDF/browser integration
- Focused Angular regressions

### RR-21

**Document APIs, configuration and deployment migration**

Track: documentation. Dependencies: RR-18, RR-19, RR-20.
Locks: wiki-documentation, generated-api-docs.
Design sections: 11, 12.

**Existing files to inspect/change:**

- `support/wiki/Form-Configuration-Recipe-Populate-From-Related-Record.md`
- `support/wiki/Configuring-Related-Records.md`
- `support/wiki/Services-Architecture.md`

**Deliverables:**

- Document implemented declarations/result/events/transient flags/helper calls and email/DOI/PDF examples.
- Update generated API/contract reference with current tools and describe limits/adapter support.
- Add consumer inventory, activation/transition and rollback/copy-writer migration checklist.
- Handle wiki submodule changes and parent pointer explicitly, preserving unrelated work.

**Acceptance:**

- Examples match implemented types/configs and running fixtures.
- Readiness, optional failures and existing post-hook partial-commit semantics are accurate.
- Rollback does not claim old copies become fresh by disabling enrichment.
- Deployment-specific migration is distinguished from implemented core support.

**Validation:**

- Reference/link checks
- API validation and applicable docs generation/audit

### RR-22

**Complete release evidence and implementation handoff**

Track: release. Dependencies: RR-21.
Locks: release-evidence.
Design sections: 12.

**Existing files to inspect/change:**

- `support/specs/related-record-resolution-plan.md`
- `support/specs/related-record-resolution/design.md`
- `support/specs/related-record-resolution/implementation-plan.md`
- `support/specs/related-record-resolution/tasks.md`
- `support/specs/related-record-resolution/tasks.json`

**Proposed new files:**

- `support/specs/related-record-resolution/verification.md`

**Deliverables:**

- Run remaining appropriate touched-package/CI checks after task prerequisites pass.
- Map each agreed acceptance requirement to a real test/command/result.
- Record implementation head, changed paths, baseline failures, unsupported shapes and remaining deployment work.
- Update manifest/documents to the delivered code; never mark skipped/blocked evidence as passed.

**Acceptance:**

- All dependencies and release gates have reviewable evidence.
- Both forms and email/DOI/PDF/backend consumers are demonstrated.
- Compatibility and nonpersistence protections are proven without excluded framework additions.
- No deployment copy writer is retired automatically.

**Validation:**

- Touched-package build/type/lint tests
- Core/common/storage/schema/API regressions
- Runtime Mongo/browser/PDF evidence
- Documentation consistency checks

## Task completion

Implementation and tests are complete; exported/config/schema contracts agree;
relevant compatibility checks pass; changed paths and actual command outcomes are
recorded; prerequisite results are present. If tooling prevents verification, record
the blocker and leave the task incomplete. RR-22 is the feature completion gate.
