# Configurable Public-Source Record Ingestion Framework

## Summary

Build a brand-scoped ingestion framework that converts records from external authoritative providers into ordinary ReDBox record types through configurable, versioned crosswalks.

The first release will include:

- ROR organisations → typically a `party`/organisation record type.
- Crossref funders → typically a funding-body or party record type.
- ARDC Research Activities, including ARC and NHMRC grants/projects → typically a research-activity record type.
- Scheduled, filtered, incremental local ingestion with manual runs.
- Strong-identifier linking across providers.
- Field-level source ownership that preserves locally maintained fields.
- An embedded Angular administration interface with JSON import/export.
- Reuse of the existing harvest run, chunk, and record-event audit infrastructure.
- A typed hook registration mechanism for future providers such as Elsevier Pure.

Researcher-facing typeaheads will continue querying local ReDBox/Solr records. Direct live provider lookup will not ship initially, but provider interfaces will be reusable for that later capability. This avoids making researcher workflows dependent on external uptime.

Provider feasibility is based on the current official interfaces: [ROR REST API](https://ror.readme.io/docs/rest-api), [Crossref funder API](https://support.crossref.org/hc/en-us/articles/215788143-Funder-data-via-the-API), and [ARDC Research Activities API](https://documentation.ardc.edu.au/rda/research-activities-api).

# Design

## 1. Data Model (Waterline Models)

### Purpose and scope

Persist institutional source definitions separately from traditional record-type, workflow, and form definitions. Existing ReDBox record types remain authoritative for the shape and lifecycle of generated records.

### New models

Add under `packages/redbox-core/src/waterline-models/`:

#### `RecordIngestSource.ts`

One brand-scoped provider configuration.

Attributes:

- `key`: generated unique key `<branding>_<name>`.
- `branding`: required relation to `BrandingConfig`.
- `name`: administrator-facing unique name within the brand.
- `providerKey`: registered adapter key such as `ror`, `crossref-funders`, or `ardc-activities`.
- `enabled`: defaults to `false`.
- `priority`: positive integer; lower values win cross-provider field conflicts.
- `targetRecordType`: existing `RecordType.name`.
- `targetWorkflowStage`: optional; defaults to the record type’s starting workflow step.
- `filter`: provider-specific JSON validated by the adapter.
- `schedule`: `{ mode: "manual" | "interval", intervalMinutes?: number }`.
- `crosswalk`: versioned JSON containing:
  - `metadataExpression`: JSONata expression returning record metadata.
  - `sourceOwnedPaths`: JSON Pointer paths that this source may refresh.
  - `canonicalIdentifiers`: array of `{ scheme, expression }`.
  - `displayLabelExpression`.
  - `inactivePatchExpression`, defaulting to an inactive provenance marker.
- `credentialRefs`: names of environment/config secret references; never raw secrets.
- `batchSize`: constrained by `HarvestRunService` limits.
- `requestPolicy`: bounded timeout, retry count, and backoff settings.
- `reconciliationIntervalRuns`: defaults to `7`.
- `revision`: monotonically increasing integer.
- `configHash`: deterministic hash of the effective configuration.
- `checkpoint`: provider-owned opaque JSON checkpoint.
- `nextRunAt`, `lastRunAt`, `lastSuccessfulAt`.
- `runStatus`: `idle | queued | running | error | disabled`.
- `lastError`: sanitised error summary.
- `leaseOwner`, `leaseUntil`: atomic run-lock fields.
- `createdBy`, `updatedBy`, timestamps.

Indexes:

- Unique `{ branding, name }`.
- `{ branding, enabled, nextRunAt }`.
- `{ providerKey, runStatus }`.
- `{ leaseUntil }`.

#### `RecordIngestSourceRevision.ts`

Immutable source configuration history.

Attributes:

- `source`: required relation to `RecordIngestSource`.
- `branding`, `revision`, `configHash`.
- `snapshot`: complete non-secret configuration snapshot.
- `changedBy`, `changeReason`, `createdAt`.

Indexes:

- Unique `{ source, revision }`.
- `{ branding, createdAt: -1 }`.

#### `RecordIngestIdentity.ts`

Maps a provider record to a ReDBox record.

Attributes:

- `branding`, `source`, `providerKey`.
- `externalId`.
- `recordType`, `oid`.
- `active`.
- `lastSeenRunId`, `lastSeenAt`.
- `sourceModifiedAt`.
- `payloadHash`.
- `createdAt`, `updatedAt`.

Indexes:

- Unique `{ branding, providerKey, externalId, recordType }`.
- `{ branding, source, active }`.
- `{ branding, recordType, oid }`.

#### `RecordCanonicalIdentifier.ts`

Supports exact cross-provider linking.

Attributes:

- `branding`, `recordType`.
- `scheme`: normalised lowercase scheme such as `ror`, `crossref-funder-id`, `purl`, or `doi`.
- `value`: canonical normalised value.
- `oid`.
- `source`, `providerKey`.
- `verified`: always `true` for adapter-issued identifiers.
- Timestamps.

Indexes:

- Unique `{ branding, recordType, scheme, value }`.
- `{ branding, recordType, oid }`.

### Relationships and lifecycle

- Deactivating or archiving a source does not delete imported records or audit history.
- A source that has completed runs cannot be hard-deleted through the API; it can only be disabled and archived.
- Provider records absent from a completed reconciliation are marked inactive, not deleted.
- Incremental runs do not infer deletion from absence.
- Strong-ID matching is exact and scheme-aware. Names are never used for automatic merging.
- If canonical identifiers resolve to multiple OIDs, the item fails with an identity-conflict event and requires administrator resolution.
- Cross-provider field collisions use source priority. Equal-priority collisions retain the current owner and generate a warning event.
- Local fields outside `sourceOwnedPaths` are preserved.
- Source-owned fields are refreshed even if locally edited, matching the selected ownership policy.
- Each generated record receives reserved provenance under `metadata._recordIngest`, including source IDs, provider keys, field owners, active state, and last-seen timestamps.

### Validation and access control

- Referenced record type and workflow step must already exist for the same brand.
- JSONata expressions must compile and return the required types.
- Source-owned paths cannot target protected ReDBox metadata such as OID, brand, audit fields, workflow internals, or attachment metadata.
- Provider filters must satisfy adapter-specific bounded-ingestion requirements.
- Credentials are resolved server-side from configured references and redacted from responses, logs, revisions, exports, and harvest events.
- CRUD and execution are Admin-only and brand-scoped.

### Registration

Update `packages/redbox-core/src/waterline-models/index.ts` and exported model types so loader-generated model shims include all four models.

No hook models are required for the core framework. Provider hooks may supply services/adapters without defining their own models.

## 2. Services Layer (Business Logic)

### Public provider interface

Add exported contracts under `packages/redbox-core/src/record-ingest/`:

```ts
interface RecordIngestProvider {
  readonly descriptor: RecordIngestProviderDescriptor;

  validateConfiguration(context: ProviderContext): Promise<ValidationResult>;
  testConnection(context: ProviderContext): Promise<ConnectionTestResult>;
  preview(context: ProviderContext, limit: number): Promise<ProviderPreview>;
  fetchPage(
    context: ProviderContext,
    checkpoint: ProviderCheckpoint | null
  ): Promise<ProviderPage>;
  getExternalId(item: ProviderItem): string;
  getSourceModifiedAt(item: ProviderItem): string | undefined;
  getCanonicalIdentifiers(item: ProviderItem): CanonicalIdentifier[];
}
```

`ProviderPage` contains:

- `items`
- `nextCheckpoint`
- `complete`
- `reconciliationComplete`
- `requestMetadata` containing only non-secret rate-limit and paging information.

`RecordIngestProviderDescriptor` declares:

- Stable provider key and display name.
- Adapter version.
- Configuration/filter/credential schemas.
- Capabilities such as incremental paging, reconciliation, and preview.
- Default crosswalk preset.
- Supported request limits.
- Future `search` capability metadata, without exposing a researcher lookup endpoint in this release.

### Hook extension interface

Extend the loader with:

- `package.json` capability: `sails.hasRecordIngestProviders`.
- Hook export: `registerRedboxRecordIngestProviders()`.
- A merged provider registry following existing hook precedence.
- Duplicate provider keys fail at startup unless an overriding hook deliberately replaces the same key.
- Providers receive a restricted context rather than direct controller request objects.

This becomes the extension path for Elsevier Pure and other vendor integrations.

### New services

#### `RecordIngestProviderRegistryService`

Location: `packages/redbox-core/src/services/RecordIngestProviderRegistryService.ts`.

Responsibilities:

- Register core and hook provider adapters during `bootstrap()`.
- List descriptors safe for the admin UI.
- Resolve an adapter by key.
- Validate duplicate registrations and adapter versions.
- Resolve credential references without returning raw values.
- Expose `listProviders()`, `getProvider()`, and `validateProviderConfig()`.

#### `RecordIngestConfigService`

Location: `packages/redbox-core/src/services/RecordIngestConfigService.ts`.

Responsibilities:

- Brand-scoped source CRUD.
- Validate record types, workflow steps, schedules, adapter filters, credentials, and JSONata mappings.
- Create immutable revisions transactionally with configuration changes.
- Import/export a versioned, non-secret JSON document.
- Prevent modification of operational checkpoint/lease fields through user payloads.
- Compute `configHash`.
- Reset checkpoints only through an explicit Admin action with a recorded reason.

Public methods:

- `listSources(brand)`
- `getSource(brand, id)`
- `createSource(brand, input, actor)`
- `updateSource(brand, id, input, actor)`
- `disableSource(brand, id, actor)`
- `validateSource(brand, input)`
- `previewSource(brand, input, limit)`
- `exportSources(brand)`
- `importSources(brand, document, mode, actor)`
- `listRevisions(brand, sourceId)`

Import modes:

- `validate`: no persistence.
- `merge`: create or update by source name.
- `replace`: disable omitted sources but never destroy them.

#### `RecordIngestCrosswalkService`

Location: `packages/redbox-core/src/services/RecordIngestCrosswalkService.ts`.

Responsibilities:

- Compile and execute JSONata using the existing safe helper.
- Supply a documented mapping context: `{ item, provider, source, run }`.
- Validate output as a plain serialisable metadata object.
- Reject protected paths, circular values, functions, and oversized output.
- Generate canonical identifiers and display labels.
- Apply only source-owned paths on update.
- Maintain field-owner provenance and priority conflict rules.
- Return deterministic mapping diagnostics for preview and harvest events.

#### `RecordIngestService`

Location: `packages/redbox-core/src/services/RecordIngestService.ts`.

Responsibilities:

- Acquire and renew a source lease atomically.
- Create a harvest run using the existing `HarvestRunService`.
- Fetch bounded provider pages and process them as harvest chunks.
- Map provider items and resolve identity in this order:
  1. Existing `RecordIngestIdentity`.
  2. One exact trusted `RecordCanonicalIdentifier`.
  3. Create a new ReDBox record.
- Call existing `RecordsService`/`HarvestRunService` paths so record creation, updating, Solr indexing, audit, workflow metadata, and harvest counters remain consistent.
- Persist identity and canonical-identifier rows transactionally where supported.
- Advance the checkpoint only after its complete chunk commits.
- On retry, use content hashes and existing harvest chunk idempotency.
- Run full reconciliation according to `reconciliationIntervalRuns`.
- Mark unseen identities inactive after a fully successful reconciliation and patch the corresponding records.
- Never delete records automatically.
- Record sanitised per-record mapping, identity, and downstream failures in `HarvestRecordEvent`.

Public methods:

- `queueSourceRun(sourceId, trigger, actor?)`
- `runSourceJob(job)`
- `processSource(sourceId, runContext)`
- `cancelQueuedRun(sourceId)`
- `releaseExpiredLeases()`

#### `RecordIngestSchedulerService`

Location: `packages/redbox-core/src/services/RecordIngestSchedulerService.ts`.

Responsibilities:

- Periodically select enabled sources where `nextRunAt <= now`.
- Atomically mark them queued to avoid duplicate execution across portal instances.
- Submit `RecordIngest-RunSource` Agenda jobs.
- Compute the next interval relative to completion.
- Apply bounded deterministic jitter to avoid every installation hitting public APIs simultaneously.
- Support manual-only sources.
- Recover expired leases and interrupted runs.

Agenda jobs in `packages/redbox-core/src/config/agendaQueue.config.ts`:

- `RecordIngest-DispatchDueSources`: recurring dispatcher, Mongo-backed, every minute.
- `RecordIngest-RunSource`: executes one source, concurrency and lock limits configurable.
- `RecordIngest-RecoverExpiredLeases`: periodic recovery.

### Core providers

Add under `packages/redbox-core/src/record-ingest/providers/`:

#### ROR provider

- API: versioned `/v2/organizations`.
- Require a bounded filter such as country, organisation type, identifier set, or explicit advanced query.
- Reject configurations that could exceed the API’s retrievable-result ceiling.
- Support active/inactive status reconciliation.
- Configure the optional `Client-Id` header through a credential reference because ROR’s rate-limit policy is changing.
- Normalise ROR, GRID, ISNI, Wikidata, and Crossref Funder identifiers.
- Default target preset: organisation/party record.

#### Crossref funders provider

- API: `/funders`.
- Use the polite pool with configured contact email; support optional premium token by secret reference.
- Filters include location, name query, and explicit funder IDs.
- Honour response rate-limit headers and `Retry-After`.
- Canonical IDs include Crossref Funder ID and DOI form.
- Default target preset: funding-body/party record.
- Crossref works are explicitly out of scope for this release.

#### ARDC activities provider

- API: `/api/v2.0/registry/activities`.
- Require an API key secret reference.
- Require at least one bounded scope such as institution, funder, type, identifier, or modified-since.
- Support grants, programs, and projects, including ARC and NHMRC content.
- Use `modifiedSince`, limit, and offset for incremental paging.
- Canonical IDs include activity PURL and supplied grant identifiers.
- Default target preset: research-activity record.

### Resilience and side effects

- Default request timeout: 15 seconds.
- Default retries: three for timeouts, 429, and transient 5xx responses, with exponential backoff and jitter.
- No retry for authentication, mapping, or validation failures.
- Honour provider `Retry-After` headers.
- Stop a run after configurable consecutive page failures.
- Never log complete provider payloads, API keys, tokens, or credential headers.
- Store only capped/sanitised failed snapshots using existing harvest limits.
- Failed runs retain their last committed checkpoint.
- A source can have only one active run.
- No distributed transaction is assumed between Mongo and record storage; identity writes must be retry-safe and repaired from harvest events after partial failures.

### Exports and overrides

Update:

- `packages/redbox-core/src/services/index.ts`
- Root package exports for provider contracts.
- Loader provider-capability handling.
- Associated generated-shim name registries.

All services extend `Services.Core.Service`, use typed `_exportedMethods`, implement `bootstrap()` where required, and access Waterline globals directly.

## 3. Webservice Controllers (REST API)

Add `packages/redbox-core/src/controllers/webservice/RecordIngestController.ts`.

The controller extends `Controllers.Core.Controller`, performs Sails-dependent setup in `init()`, exposes actions through `_exportedMethods`, and responds through `sendResp`.

### Endpoints

All paths are beneath `/:branding/:portal/api/record-ingest` and require `Admin`.

| Method | Path | Result |
|---|---|---|
| GET | `/providers` | Safe provider descriptors and schemas |
| GET | `/sources` | Brand-scoped source summaries |
| POST | `/sources` | Create disabled draft source; `201` |
| GET | `/sources/:id` | Source detail with redacted credentials |
| PUT | `/sources/:id` | Validate, revise, and update source |
| DELETE | `/sources/:id` | Disable/archive source; never hard-delete |
| POST | `/sources/validate` | Validate unsaved configuration |
| POST | `/sources/preview` | Fetch a small provider sample and show mapped output without saving records |
| POST | `/sources/:id/run` | Queue a manual run; `202` |
| POST | `/sources/:id/cancel` | Cancel only a queued run; `409` if already processing |
| POST | `/sources/:id/reset-checkpoint` | Explicit checkpoint reset with required reason |
| GET | `/sources/:id/revisions` | Revision history |
| GET | `/export` | Versioned, non-secret JSON export |
| POST | `/import?mode=validate|merge|replace` | Validate or apply exported configuration |

Run inspection remains on the existing:

- `GET /api/harvest-runs`
- `GET /api/harvest-runs/:id`
- `GET /api/harvest-runs/:id/events`

### Request/response rules

- Responses use the existing wrapped API conventions.
- Validation failures return `400` with stable field error codes.
- Missing provider/source/record type returns `404`.
- Revision conflicts, duplicate names, identity conflicts, or active-run conflicts return `409`.
- Provider authentication failures return `422` from connection tests/previews, without leaking secrets.
- Manual queue acceptance returns the source ID and queued job/run correlation ID.
- List endpoints support pagination.
- All source lookups enforce request branding rather than trusting branding in the body.

Update:

- `packages/redbox-core/src/controllers/index.ts`
- `packages/redbox-core/src/config/routes.config.ts`
- `packages/redbox-core/src/config/auth.config.ts`
- Generated OpenAPI/route-contract inputs used by the repository.

## 4. Ajax Controllers (Controllers)

No new AJAX controller is required.

The embedded administration app will consume the authenticated, CSRF-protected webservice endpoints through an Angular service extending `HttpClientService`. This avoids maintaining duplicate AJAX and REST surfaces.

No researcher-facing remote-search action is added. Existing form typeaheads continue to use local named-query/Solr/service lookup routes.

## 5. Angular App(s)

### Application

Add an embedded Angular project:

`angular/projects/researchdatabox/record-ingest/`

Generate it with Hook Kit where supported and register it in `angular/angular.json`.

Output:

`assets/angular/record-ingest/browser/`

### Components

- `RecordIngestComponent`: page shell and source list.
- `SourceEditorComponent`: provider, target type, workflow, schedule, priority, filter, and credential-reference editor.
- `CrosswalkEditorComponent`: preset selection, JSONata editor, owned-path editor, canonical-ID expressions, and protected-path guidance.
- `SourcePreviewComponent`: raw sample, mapped metadata, identity values, validation errors, and mapping warnings.
- `SourceRunsComponent`: recent runs linking to the existing harvest-run detail page.
- `ImportExportComponent`: validate/import/export workflows.
- `ProviderStatusComponent`: connection test, last success, next run, and sanitised error state.

No Angular Router will be used. Component state switches views inside the mounted app.

### Angular service

Add `record-ingest-api.service.ts` extending `HttpClientService`.

- Wait for configuration initialisation.
- Enable CSRF headers.
- Use `brandingAndPortalUrl`.
- Provide typed methods corresponding to every controller endpoint.
- Never retain actual credential values in browser state.
- Normalise wrapped responses consistently with `HarvestRunApiService`.

### UX rules

- New sources begin disabled.
- A source cannot be enabled until configuration validation, connection test, and mapping preview pass.
- Manual run requires confirmation and displays the chosen source, record type, and filter summary.
- Reset checkpoint requires a typed reason and stronger confirmation.
- Provider outages display a provider-specific operational message and do not imply ReDBox itself is unavailable.
- Preview is capped and clearly labelled as non-persistent.
- Crosswalk changes display affected source-owned paths and create a new revision.
- Import defaults to validation-only before administrators can apply it.
- Accessible labels, keyboard operation, live status regions, and translated text are required.

### EJS wiring

Add `views/default/default/admin/record-ingest.ejs` containing:

- `<record-ingest>` component tag.
- CSP nonce handling.
- Hashed JS/CSS resolution using `CacheService.getNgAppFileHash`.

Add a Sails render route using `RenderViewController.render` with `locals.view = "admin/record-ingest"`.

## 6. Additional Views

Add only:

- `views/default/default/admin/record-ingest.ejs`.

Reuse the existing `admin/harvest-runs.ejs` for run details rather than duplicating it.

No server-rendered provider data is embedded in the page. Branding, portal URL, translations, and asset hashes use the existing render/config services.

Hook-provided provider adapters may contribute descriptors and presets, but not arbitrary executable Angular templates.

## 7. Navigation Configuration

Update `packages/redbox-core/src/configmodels/AdminSidebarConfig.ts`:

- Add `Record ingestion` under the system/integration administration group.
- Path: `/admin/record-ingest`.
- Restrict visibility to `Admin`.
- Keep the existing `Harvest runs` entry as the operational history destination.

Add translation keys in every supported locale for:

- Navigation and headings.
- Provider/filter/schedule fields.
- Connection and preview statuses.
- Validation and conflict messages.
- Run, checkpoint, import/export, inactive, and reconciliation terminology.

# Consistency Analysis

## Cross-checks

- Existing record types, workflows, forms, and Solr mappings remain unchanged and are referenced by source configuration.
- Provider adapters produce raw items; crosswalks produce ReDBox metadata; `RecordIngestService` resolves identity; `HarvestRunService` performs tracked mutations; existing indexing makes the resulting records available to local typeaheads.
- The framework adds no second record store and no alternate typeahead component.
- Run inspection uses existing harvest models, APIs, and Angular UI.
- Strong identifiers are stored separately from flexible record metadata so linking does not depend on Solr freshness.
- Source configuration, revisions, and runtime checkpoints are brand-scoped.
- Hook registration provides the future Pure extension point without allowing administrator-configured arbitrary outbound URLs.
- The provider interface retains preview/paging capabilities that can support a future explicit live-search mode without committing the first release to external uptime.

## Assumptions and defaults

- Primary users are institutional ReDBox administrators; researchers consume the resulting local records through existing forms.
- Administrators define record types and workflows through the existing mechanism before configuring an ingest source.
- Default mappings are presets and may be customised per brand.
- ROR maps to an organisation/party type, Crossref to a funding-body/party type, and ARDC to a research-activity type, but target names are configurable.
- Scholarly works from Crossref and DataCite are out of scope.
- Direct live typeahead lookup is out of scope.
- Fuzzy entity merging is out of scope.
- Automatic deletion is out of scope.
- Schedules use fixed intervals rather than arbitrary cron expressions.
- Secret values are deployment-managed and referenced by name.
- JSON import/export excludes checkpoints, leases, secret values, last errors, and audit data.
- Feature navigation is hidden unless the feature flag is enabled.
- Default feature flag: disabled.
- Default source state: disabled.
- Default schedule: manual.
- Default reconciliation: every seventh successful scheduled run.
- Default conflict handling: existing equal-priority owner wins and a warning is recorded.

## Risks and mitigations

- Provider schema/version changes: adapters declare versions, use fixtures, and fail validation visibly.
- Provider rate limits/outages: local-first researcher experience, throttling, `Retry-After`, retries, jitter, and durable checkpoints.
- Very broad filters: adapter-specific bounded-query validation prevents accidental global harvesting.
- Incorrect crosswalks: compile validation, capped preview, protected paths, immutable revisions, and activation gates.
- Duplicate entities: exact identifiers only; ambiguous matches become explicit failures.
- Partial writes across storage systems: idempotent chunk hashes, identity uniqueness, checkpoint-after-commit, and repairable harvest events.
- Multiple portal instances: atomic leases and queued-state transitions.
- Local edits overwritten unexpectedly: UI clearly lists source-owned paths and revisions record changes.
- Hook provider defects: registration validation and provider contract tests are required before activation.

# Implementation Plan

1. Add provider contracts, configuration types, stable error codes, and hook registration types under `packages/redbox-core/src/record-ingest/`; update loader capability detection and package exports. Use Redbox Hook Development and Redbox Services.
2. Generate and register the four Waterline models, indexes, and typed attributes. Add additive migration/index setup where production auto-indexing is unavailable. Use the Hook Kit model generator and Redbox Services.
3. Implement configuration, provider registry, crosswalk, orchestration, and scheduling services; export them through `services/index.ts`. Use Redbox Services.
4. Implement ROR, Crossref funder, and ARDC activity adapters with fixture-based contract tests and optional opt-in live tests. Use Redbox Services and the proposed provider-adapter skill.
5. Integrate record processing with `HarvestRunService`, exact identity linking, provenance, source-owned field updates, reconciliation, checkpoints, and leases. Use Redbox Services.
6. Add Agenda job definitions and feature/config defaults, including bounded operational settings and the disabled feature flag. Use Redbox Services.
7. Generate the webservice controller, add REST routes and Admin auth rules, update controller exports, and regenerate/validate route documentation. Use Redbox Controllers.
8. Generate the embedded `record-ingest` Angular app and API service, then implement source configuration, preview, scheduling, import/export, and run-history linking. Use Redbox Angular Apps and Redbox Angular Services.
9. Add the EJS host view, render route, hashed assets, navigation entry, feature gating, and translations. Use Redbox Angular Apps.
10. Execute the interleaved backend, API, Angular, browser, and final regression gates below. Use Redbox Testing, Web Interface Verification, Redbox Feature Implementation Review, and Redbox Test Verification.

# Task List (With Tests and Skill Usage)

## 1. Data Model (Waterline Models)

- [ ] Define `RecordIngestSource`, `RecordIngestSourceRevision`, `RecordIngestIdentity`, and `RecordCanonicalIdentifier`, including typed JSON structures and compound indexes. Use Redbox Services and Hook Kit model generation.
- [ ] Add unit tests for defaults, required fields, unique keys, schedule validation helpers, and protected operational fields. Use Redbox Testing.
- [ ] Register model definitions and exports in `packages/redbox-core/src/waterline-models/index.ts`; verify loader-generated shims expose the expected globals. Use Redbox Services.
- [ ] Add a bootstrap/migration test verifying indexes are additive and existing installations lift without seeded sources. Use Redbox Testing.
- [ ] Add persistence tests for immutable revisions, source archival, identity uniqueness, canonical identifier uniqueness, and brand isolation. Use Redbox Testing.

## 2. Services Layer (Business Logic)

- [ ] Define the public provider contracts, descriptors, checkpoints, fixture format, error taxonomy, and hook registration interface. Use Redbox Services and Redbox Hook Development.
- [ ] Add provider-contract tests covering pagination, empty pages, checkpoints, stable external IDs, canonical identifiers, validation, redaction, and serialisability. Use Redbox Testing.
- [ ] Extend the loader for `hasRecordIngestProviders` and `registerRedboxRecordIngestProviders()`, including precedence and duplicate-key behaviour. Use Redbox Hook Development.
- [ ] Add loader tests for core registration, hook registration, intentional overrides, invalid exports, and duplicate keys. Use Redbox Testing.
- [ ] Implement `RecordIngestProviderRegistryService`. Use Redbox Services.
- [ ] Add unit tests for descriptor listing, adapter resolution, credential-reference resolution, and secret redaction. Use Redbox Testing.
- [ ] Implement `RecordIngestConfigService`, revision creation, import/export, record-type/workflow validation, and checkpoint-reset rules. Use Redbox Services.
- [ ] Add unit tests for CRUD, configuration hashes, revision conflicts, validation-only imports, merge/replace imports, brand isolation, and exclusion of secrets/operational state. Use Redbox Testing.
- [ ] Implement `RecordIngestCrosswalkService` with JSONata compilation, mapping context, owned-path updates, canonical-ID extraction, protected paths, and provider-priority conflict handling. Use Redbox Services and Redbox Form Config.
- [ ] Add unit tests for create/update mappings, nulls, arrays, protected paths, oversized output, invalid expressions, local-field preservation, source-owned refreshes, and equal/unequal priority conflicts. Use Redbox Testing.
- [ ] Implement the ROR adapter and its default organisation crosswalk. Use Redbox Services and the proposed Record Ingest Provider Adapters skill.
- [ ] Add ROR fixture tests for paging, statuses, location/type filters, IDs, rate-limit responses, invalid broad queries, schema changes, and redaction. Use Redbox Testing.
- [ ] Implement the Crossref funder adapter and default funding-body crosswalk. Use Redbox Services and the proposed Record Ingest Provider Adapters skill.
- [ ] Add Crossref fixture tests for polite identification, optional token handling, paging, locations, funder identifiers, rate-limit headers, and transient failures. Use Redbox Testing.
- [ ] Implement the ARDC activities adapter and default research-activity crosswalk. Use Redbox Services and the proposed Record Ingest Provider Adapters skill.
- [ ] Add ARDC fixture tests for API-key handling, grants/projects/programs, institution/funder filters, incremental timestamps, paging, PURLs, and ARC/NHMRC samples. Use Redbox Testing.
- [ ] Implement `RecordIngestService` using `HarvestRunService` and `RecordsService`. Use Redbox Services.
- [ ] Add service tests for create, update, unchanged, invalid mapping, exact identity linking, ambiguous identity conflict, checkpoint restart, duplicate chunks, inactive reconciliation, and partial downstream failure. Use Redbox Testing.
- [ ] Implement atomic source leases, lease renewal/recovery, and duplicate-run rejection. Use Redbox Services.
- [ ] Add concurrency tests using two simulated workers and expired leases. Use Redbox Testing.
- [ ] Implement `RecordIngestSchedulerService` and the three Agenda jobs. Use Redbox Services.
- [ ] Add scheduler tests for manual mode, due selection, interval calculation, jitter, disabled sources, queue failure, and multi-instance dispatch. Use Redbox Testing.
- [ ] Add optional live-provider integration tests behind `RUN_LIVE_INTEGRATION_TESTS=true`; never require them in normal CI. Use Redbox Testing.
- [ ] Create Mocha integration tests covering models plus the complete service flow with provider fixtures. Use Redbox Testing.
- [ ] Run a code review using Redbox Feature Implementation Review before the integration suite. If issues are found, write them to `issues.json` in the project root and immediately add tasks to fix every issue, delete `issues.json`, and rerun the review.
- [ ] Run `npm run compile:all` and the targeted `npm run test:mocha:mount` suite. Do not proceed until it passes. Use Redbox Testing.

## 3. Webservice Controllers (REST API)

- [ ] Generate `RecordIngestController`, add all actions, exports, routes, request validation, Admin auth rules, branding enforcement, stable errors, and `sendResp` handling. Use Redbox Controllers.
- [ ] Add controller unit tests for every status path, including redaction, brand isolation, validation errors, conflicts, preview failure, queue acceptance, and checkpoint reset. Use Redbox Testing.
- [ ] Add route/auth tests confirming anonymous and non-Admin users are denied and Admins cannot access another brand’s sources. Use Redbox Testing.
- [ ] Update route-contract/OpenAPI generation inputs and verify generated documentation describes request and response schemas. Use Redbox Controllers.
- [ ] Create Bruno requests for provider listing, source CRUD, validate, preview, import/export, manual run, archive, revisions, and existing harvest-run inspection. Use Redbox Testing.
- [ ] Run a code review using Redbox Feature Implementation Review before the API integration suite. If issues are found, write them to `issues.json` in the project root and immediately add tasks to fix every issue, delete `issues.json`, and rerun the review.
- [ ] Run the targeted Bruno general suite with mounted code. Do not proceed until it passes. Use Redbox Testing.

## 4. Ajax Controllers (Controllers)

- [ ] Confirm through route tests that no duplicate AJAX controller surface was introduced and that CSRF-protected Angular requests work against the webservice endpoints. Use Redbox Controllers and Redbox Testing.
- [ ] Add a regression test confirming existing form vocabulary/typeahead routes remain unchanged. Use Redbox Testing.

## 5. Angular App(s)

- [ ] Generate and register the embedded `record-ingest` Angular application without Angular Router. Use Redbox Angular Apps.
- [ ] Add bootstrap/module tests confirming the custom element mounts and configuration services initialise. Use Redbox Angular Apps and Redbox Testing.
- [ ] Implement the typed `RecordIngestApiService` with CSRF, wrapped-response normalisation, and encoded parameters. Use Redbox Angular Services.
- [ ] Add `HttpTestingController` tests for every service method, error propagation, and absence of credential values in client payloads. Use Redbox Angular Services and Redbox Testing.
- [ ] Implement the source list/editor, provider schemas, target record type/workflow selection, fixed-interval scheduling, priority, and enablement gates. Use Redbox Angular Apps.
- [ ] Add component tests for create/edit/archive, validation, unsaved changes, disabled defaults, and inaccessible enablement. Use Redbox Testing.
- [ ] Implement the crosswalk editor and preview UI with raw/mapped/identity panes and protected-path diagnostics. Use Redbox Angular Apps and Redbox Form Config.
- [ ] Add component tests for presets, invalid JSONata, mapping errors, owned paths, canonical identifiers, and preview redaction. Use Redbox Testing.
- [ ] Implement manual-run, checkpoint reset, recent-run links, provider outage messaging, and import/export workflows. Use Redbox Angular Apps.
- [ ] Add component tests for confirmations, queued responses, conflict states, validation-only import, merge/replace warnings, and harvest-run links. Use Redbox Testing.
- [ ] Run the targeted Angular suite using `support/unit-testing/angular/testDevAngular.sh`. Use Redbox Testing.

## 6. Additional Views

- [ ] Add `views/default/default/admin/record-ingest.ejs`, hashed asset lookup, CSP nonce wiring, and the Sails render route. Use Redbox Angular Apps.
- [ ] Add render tests confirming Admin access, correct view locals, component tag, and hashed assets. Use Redbox Testing.
- [ ] Verify the page in the T3 browser: load, keyboard navigation, responsive layout, source editing, preview, manual run, errors, and link to harvest history. Use Web Interface Verification.
- [ ] Add browser-level regression scenarios confirming researcher record forms continue using local typeahead results while provider services are unavailable. Use Web Interface Verification.

## 7. Navigation Configuration

- [ ] Add the Admin sidebar entry, feature flag, permission gating, and translations in every supported locale. Use Redbox Angular Apps.
- [ ] Add navigation tests for enabled/disabled feature state, Admin visibility, non-Admin absence, and brand-specific URLs. Use Redbox Testing.
- [ ] Document provider setup, credential references, preset crosswalks, hook adapter registration, operational recovery, and the deliberate lack of live researcher lookup under `support/wiki/`. Use Redbox Services, Redbox Hook Development, and Redbox Form Config.
- [ ] Run a final code review using Redbox Feature Implementation Review. If issues are found, write them to `issues.json` in the project root and immediately add tasks to fix every issue, delete `issues.json`, and rerun the review.
- [ ] Run the full Mocha and Bruno integration suites again. Use Redbox Testing.
- [ ] Run the full Angular and relevant package test suites, lint, compilation, route-contract validation, and a final browser smoke test. Use Redbox Testing and Web Interface Verification.

### Skill Gaps

A dedicated skill is missing for implementing resilient external record-ingest adapters. Create a future `Record Ingest Provider Adapters` skill covering:

- Provider contract implementation.
- Pagination and checkpoints.
- API versioning and fixture management.
- Authentication/secret references.
- Rate limits, retries, and `Retry-After`.
- Bounded-filter validation.
- Schema normalisation.
- Canonical identifiers.
- Reconciliation semantics.
- Payload redaction.
- Optional live tests.
- Hook registration and provider override rules.
