# Authorization Resource-Gate Inventory

This inventory records the Phase 7 enforcement boundary for every protected
brand-owned resource family. It complements the route-to-scope inventory:
route scopes authorize an action, while the boundaries below independently
authorize the target brand, entity, or record.

## Rules shared by all families

- The authoritative HTTP brand is `req.authorization.brand`, exposed to
  controllers through `BrandingService.getBrandFromReq(req)` or
  `requireRequestResourceAuthorization(req)`. Query, route, body, session, and
  default-brand values are not alternative authority sources once an
  authorization context exists.
- Non-HTTP service calls supply an explicit `BrandingModel`, brand ID, or
  `AuthorizationContext`. Controller-facing ID-only methods are deprecated for
  brand-owned resources; low-level ID-only methods remain internal storage
  primitives only.
- Create and import payload `branding` values are ignored and overwritten with
  the authoritative brand. Ordinary updates preserve the stored brand and
  cannot transfer ownership.
- Missing and cross-brand identifiers have the same `404` response and generic
  body. A `403` is reserved for a known in-brand resource that fails its scope,
  entity policy, or record ACL.
- Collection reads include their brand predicate before pagination, search,
  count, or export. Resource context and scoped-route extraction are immutable
  and memoized on the request. Background scans use bounded pages.

## Resource families

| Family | Authoritative boundary | Enforcement notes | Test owner |
| --- | --- | --- | --- |
| Active and deleted records | `RecordsService.authorizeRecordCollection`, `getAuthorizedMeta`, and `getAuthorizedDeletedRecordMeta` | Route capability is composed with base `record.read`/`record.update`, authoritative brand, and ACL before data is returned. Missing and foreign records are intentionally collapsed. | `packages/redbox-core/test/services/AuthorizationResourceGates.test.ts`, `test/integration/services/AuthorizationPhase7.test.ts` |
| Record ACL, search, storage, and exports | `AuthorizationService.authorizeRecord`, `RecordsService`, `MongoStorageService`, and `SolrSearchService` | Direct-user grants and edit-implies-view are preserved. Persisted ACL roles use immutable same-brand `role.key ?? role.name`. `record.read.all`/`record.update.all` bypass only the ACL and never brand ownership. Mongo, Solr, direct reads, and exports receive the same effective keys and brand predicate. | `packages/redbox-core/test/authorization/resource-access.test.ts`, `packages/redbox-core/test/services/SolrSearchService.test.ts`, `test/integration/services/MongoStorageConcurrency.test.ts`, `test/integration/services/SolrSearchService.test.ts` |
| Attachments, audit, related records, integration audit, record schemas, and dynamic form discovery | Record-aware `RecordsService` methods and `getAuthorizedMeta` | Every record-adjacent read/write resolves the parent record first through the route-specific capability, base record action, brand, and ACL. Integration-audit rows are not queried until the parent record passes. | `packages/redbox-core/test/controllers/webservice/IntegrationAuditController.test.ts`, `packages/redbox-core/test/controllers/webservice/FormManagementController.test.ts`, record controller and schema suites |
| Vocabularies and entries | `VocabularyService.*Authorized` and parent-scoped entry methods | ID, slug, notation, tree, import, sync, export, reorder, update, and delete remain inside the active brand. Entry authorization is inherited from the parent vocabulary. | `packages/redbox-core/test/services/VocabularyService.test.ts`, vocabulary controller suites, `test/integration/services/AuthorizationPhase7.test.ts` |
| Figshare/RVA vocabulary state and crosswalks | `FigshareVocabularyService` context objects and authorized vocabulary import/sync | Catalogue, preview, apply, crosswalk, and remote import operations carry an explicit brand ID; payload brand values are not authority. | Figshare vocabulary service/controller suites and `test/integration/services/FigshareVocabularyBootstrapData.test.ts` |
| Forms, record types, and workflows | `FormsService`, `RecordTypesService`, and parent-record-type `WorkflowStepsService` contracts | Form and record-type lookup always supplies the active brand. A workflow step is reachable only through its brand-constrained record type. Record-aware form/schema discovery additionally applies the record gate. | Forms, record-type, workflow, record-schema controller/service suites and `test/integration/services/AuthorizationPhase7.test.ts` |
| Dashboard types and dashboard configuration | `DashboardTypesService` and `DashboardConfigService` with explicit brand | Stored definitions and configuration merge only the active brand. No protected controller falls back to the default brand. | dashboard service/controller suites and `test/integration/services/AuthorizationPhase7.test.ts` |
| Reports and exports | `ReportsService` with explicit brand plus record collection authorization for report/export execution | Report definitions use the brand-keyed identity; record-producing paths also apply record collection/ACL filtering. | `packages/redbox-core/test/services/ReportsService.test.ts`, export controller suites, `test/integration/services/AuthorizationPhase7.test.ts` |
| Named queries | `NamedQueryService` brand-keyed contracts | Config CRUD and execution resolve config by active-brand key. Results are constrained using the configured authoritative brand field before mapping. | named-query service/controller suites and `test/integration/services/AuthorizationPhase7.test.ts` |
| App and navigation configuration | `AppConfigService` with explicit brand and brand-aware controller resolution | Config create/update derives brand from the request context; reads cannot select another brand through route or body data. Navigation configuration is static/global unless stored in a brand AppConfig, in which case the AppConfig boundary applies. | AppConfig and admin controller suites, `test/integration/services/AuthorizationPhase7.test.ts` |
| Branding configuration, history, logo, favicon, and preview | `BrandingService.getBrandFromReq`, brand-constrained history rollback, and branding asset services | All protected AJAX, REST, and compatibility mutations replace route branding with the authorized brand. Public CSS/image/favicon rendering remains an intentionally public brand-addressed read. | `packages/redbox-core/test/controllers/BrandingAuthorization.test.ts`, branding service suites |
| Translation entries and bundles | `I18nEntriesService` with the authorized `BrandingModel` | Protected REST and Angular management endpoints resolve the authorization brand. Public i18next namespace/language delivery remains a public brand-addressed read. | translation controller/service suites and `test/integration/services/AuthorizationPhase7.test.ts` |
| Harvest and integration state | `HarvestRunService` brand-aware list/get/chunk/event methods; record gate for integration audit | Run, chunk, event, retry, and audit lookup include brand. Record integrations carry explicit record/brand context and cannot expose audit state for an inaccessible parent record. | harvest and integration-audit suites, `test/integration/services/AuthorizationPhase7.test.ts` |
| User management and account linking | `UsersService.getUserForBrand`, `findUserForBrand`, and brand-aware mutation/link/audit/token methods | Same-brand role membership or an active same-brand account link is required. Missing and foreign users share the opaque not-found result. Foreign role assignments are preserved during a same-brand update. Search/list/link queries are capped. | user service/admin/controller suites and `test/integration/services/AuthorizationPhase7.test.ts` |
| User-triggered jobs and asynchronous progress | Immutable queued authority envelope plus `RecordsService` re-authorization | Queue payloads persist actor ID, brand, operation ID, and exact scopes; worker start re-resolves the actor and rejects payload authority expansion. Progress lookup is brand constrained and bounded. Trusted scheduled work uses named, scope-limited system-process contexts. | async/job authorization suites and `packages/redbox-core/test/services/WorkspaceAsyncAuthorization.test.ts` |
| Privileged WebSocket events | Request resource authorization plus per-message context re-resolution | Handshake context is presentation state only. Each subscribe/progress message re-resolves active principal, assignments, route capability, parent record, brand, and ACL, so revocation takes effect on the next event. | `packages/redbox-core/test/controllers/AsynchController.test.ts` and workspace async suites |
| Hook-owned entities | Hook route metadata and the hook's brand-aware service contract | The maintained `redbox-hook-dev` package does not add a separate brand-owned persistence model. Storage hooks operate through the record boundary. Any future hook model must declare global/brand ownership, an explicit context-bearing service contract, bounded queries, and a cross-brand integration fixture before its route can be merged. | hook route merge/loader suites plus the owning hook's required resource test |

## Existence-oracle response contract

`AuthorizationResourceError` is the single controller mapping contract.
`CoreController.sendResp` and the authorization policy response helper emit
RFC-style problem responses without entity titles, IDs, brands, ACL values, or
backend error text. The same identifier presented as missing or cross-brand
therefore yields the same status and public body. Known in-brand ACL denials
remain `403`, and inactive principals remain `401`.

## Background and hook contract

User-triggered asynchronous work must persist an immutable authority envelope
created from the request context. Workers re-resolve the principal and current
assignments before work begins and never reconstruct authority from a username,
payload brand, or default brand. Trusted maintenance can obtain a system-process
context only from the internal factory and must name its process identity,
brand, operation, and exact scopes. Both paths are auditable.
