# Guided Provider Configuration for Record Ingestion

## Summary

Replace the raw source-JSON editor with a schema-driven, guided configuration experience. The page will follow the established ReDBox management pattern: full-width searchable source table, toolbar, status badges, and a large create/edit modal.

Provider plugins will supply typed JSON Schema metadata so they receive a usable configuration form without provider-specific Angular code. Common source settings remain explicit controls; provider filters and credential references are generated from the selected provider’s schemas; crosswalk and request-policy controls live under an Advanced section.

Raw JSON editing and import/export controls will be removed from this screen. Existing import/export APIs remain unchanged for automation and compatibility.

# Design

## 1. Data Model (Waterline Models)

- No new models, attributes, indexes, migrations, or loader shims are required.
- Continue storing provider-specific values in the existing `filter` and `credentialRefs` attributes of `RecordIngestSource`.
- New source records remain disabled by default.
- Provider configuration remains constrained to the existing source contract. Plugins requiring novel top-level persisted properties are outside this change and would require a separately versioned provider API extension.
- Provider selection may be changed while editing, but the UI must warn that doing so resets filter, credential, crosswalk, and provider-limit defaults before applying the change.
- Enabling/disabling is operational state and must not create a configuration revision.

## 2. Services Layer (Business Logic)

### Provider schema contract

Update `packages/redbox-core/src/record-ingest/types.ts` with recursive, type-safe schema interfaces supporting this explicit subset:

- `object`, `string`, `integer`, `number`, `boolean`, and one-dimensional `array`.
- `title`, `description`, `default`, `examples`, `enum`, and `format`.
- `properties`, `required`, `items`, `minProperties`, `minItems`, and `maxItems`.
- `minimum`, `maximum`, `minLength`, and `maxLength`.

Change `configurationSchema`, `filterSchema`, and `credentialSchema` from unstructured `JsonObject` to these schema types. Retain the property names for hook compatibility.

`RecordIngestProviderRegistryService.register()` must validate provider descriptors at bootstrap:

- Reject missing field titles/descriptions for configurable properties.
- Reject unsupported schema constructs such as nested arrays, arbitrary executable widgets, `$ref`, `allOf`, or conditionals.
- Include the provider key and failing schema path in `RecordIngestProviderRegistryError`.
- Continue returning cloned safe descriptors from `listProviders()`.

### Built-in descriptors

Enrich all built-in provider descriptors with labels, explanations, examples, formats, defaults, bounds, and credential guidance:

- ROR: query, country code, organisation types, IDs, GeoNames locations, and status.
- Crossref funders: name, location, IDs, contact email, and optional token reference.
- ARDC activities: institution, funder, activity type, identifier, modified-since date, and required API-key reference.
- Ensure every field exposed by provider validation is represented by its schema.
- Set batch-size guidance from `supportedRequestLimits`.

### Activation

Add `RecordIngestConfigService.enableSource(brand, id, actor?)`:

- Resolve the brand-scoped saved source.
- Re-run target, crosswalk, and provider configuration validation.
- Return `404` for a missing source and `400` with structured diagnostics for invalid configuration.
- Set `enabled: true`, `runStatus: "idle"`, and calculate `nextRunAt` for interval schedules.
- Do not change `revision`, `configHash`, or create `RecordIngestSourceRevision`.

Retain the existing disable behavior and all hidden import/export service methods.

## 3. Webservice Controllers (REST API)

Add:

- `POST /:branding/:portal/api/record-ingest/sources/:id/enable`
- Success: `200` with the redacted source.
- Failure: `400` invalid saved configuration, `404` missing source.
- Authentication: existing Admin-only `/api/record-ingest(/*)` rule.
- Implement `enableSource` in `RecordIngestController` using `init()`/`_exportedMethods` conventions and `sendResp`.
- Add the route contract to `packages/redbox-core/src/api-routes/groups/record-ingest.ts` and update generated OpenAPI expectations.

Unchanged public endpoints:

- Provider descriptors and source CRUD.
- Validation, connection test, preview, run, cancel, revisions, checkpoint reset.
- JSON import/export endpoints, which remain available to API clients but disappear from this UI.

## 4. Ajax Controllers (Controllers)

- No new Ajax controller.
- Continue using authenticated, CSRF-protected webservice endpoints through `RecordIngestApiService`.

## 5. Angular App(s)

### Page structure

Refactor the existing embedded app at `angular/projects/researchdatabox/record-ingest/`; do not add Angular Router.

Use the restrained Bootstrap management style already used by named queries, reports, vocabularies, and user management:

- Full-width page content.
- Toolbar with search, provider/status filters, Refresh, and primary “Create source” action.
- Summary badges for total, enabled, disabled, and running sources.
- Responsive striped/hover source table.
- Columns: name, provider display name, target record type, schedule, status, last run, and actions.
- Status badges must distinguish enabled/disabled and queued/running/error operational states.
- Empty and filtered-empty states must provide a clear create/reset action.
- Row actions: Edit, Run now, Enable or Disable.
- Provider listings are removed from the page because provider selection and guidance belong in the editor.
- Run and activation actions use accessible confirmation modals rather than browser `confirm()`.

### Editor modal

Create a large scrollable create/edit modal with these sections:

1. Basics
   - Source name.
   - Provider select using descriptor display names.
   - Target record type select populated from `/api/recordtypes`.
   - Optional workflow-stage select populated from `/record/wfSteps/:recordType`.
   - Provider description, adapter version, and capability summary.

2. Provider configuration
   - Render `filterSchema` through a reusable schema-field component.
   - Render credential references from `credentialSchema`.
   - Show descriptions, examples, required markers, bounds, and inline validation.
   - Never request or retain secret values; controls accept deployment-managed reference names only.
   - Arrays use add/remove rows and enforce item limits.

3. Schedule
   - Manual or interval control.
   - Show interval minutes only for interval mode.
   - Apply the service bounds of 1–525600 minutes.

4. Advanced, collapsed by default
   - Priority.
   - Batch size constrained by the provider’s `maxBatchSize`.
   - Reconciliation interval.
   - Request timeout, maximum attempts, maximum delay, and retry status codes.
   - Structured crosswalk controls for metadata expression, display-label expression, inactive-patch expression, source-owned paths, and canonical identifier scheme/expression rows.
   - Use textareas for JSONata expressions, but never expose the complete source as editable JSON.

### Components and state

Split the current monolithic component into:

- `RecordIngestComponent`: loading, filtering, source table, editor lifecycle, confirmations, and status messages.
- `SourceEditorComponent`: common fields, modal sections, validation orchestration, connection test, and preview.
- `SchemaFieldsComponent`: recursive renderer for the supported provider schema subset.
- `CrosswalkEditorComponent`: structured advanced mapping controls.
- Small shared dialog/status components only where existing project patterns justify them.

Use typed draft models rather than `Record<string, unknown>` throughout the UI. Convert the form draft to `RecordIngestSourceConfiguration` only at the API boundary.

### Form behavior

- Selecting a provider on a new source initializes empty/default filter values, credential references, default crosswalk, batch size, and request defaults.
- Changing provider on a dirty draft requires confirmation and resets provider-dependent values.
- Changing record type clears an incompatible workflow stage.
- Editing an existing source loads a fresh detail through `getSource()` to avoid editing stale table data.
- Save performs client-side schema checks, then calls `validateSource()`, maps returned diagnostic paths to fields, and only calls create/update when valid.
- New sources are saved disabled.
- Enable and Disable remain separate row actions.
- Connection test and preview operate on the unsaved draft and show loading, success, warning, and sanitised error states.
- Preview shows a bounded result summary and mapped labels/identifiers without persisting records.
- Prevent duplicate submissions while requests are active.
- A revision conflict keeps the modal open, explains the conflict, and offers reload without discarding silently.
- Modal close with dirty changes requires confirmation.
- Restore focus to the invoking control after dialogs close.

### API service

Update `record-ingest-api.service.ts` to:

- Add complete provider-schema and source-configuration types.
- Add `listRecordTypes()`, `getWorkflowSteps(recordType)`, and `enableSource(id)`.
- Retain import/export methods for API compatibility but do not call or expose them from components.
- Preserve CSRF, `brandingAndPortalUrl`, and response-envelope normalization.
- Return typed validation, connection-test, and preview results.

### Accessibility and translations

- Replace all hard-coded UI text with `i18next` keys.
- Add keys to `language-defaults/en/translation.json` and the maintained support-language default mirror.
- Include associated labels, help IDs, required state, inline error references, keyboard-accessible dialogs, focus trapping, and live status/error regions.
- Preserve the portal’s existing typography, theme colours, and Bootstrap conventions rather than introducing a new visual system.

## 6. Additional Views

- Keep `views/default/default/admin/record-ingest.ejs` and its existing embedded Angular mount, sidebar, CSP nonce, and hashed asset handling.
- No new EJS views or Sails page routes.
- Adjust wrapper classes only if required to match the full-width layout used by other administration pages.

## 7. Navigation Configuration

- Keep the existing Admin-only “Record ingestion” sidebar item, feature flag, route, and permissions unchanged.
- No new navigation entries.

# Consistency Analysis

- The provider registry remains the single source of provider UI metadata and runtime behavior.
- Hook providers gain guided forms without shipping Angular bundles.
- Common source fields are explicit; only provider-varying filter and credential fields are schema-rendered.
- Server validation remains authoritative and is reused by save and enable.
- Existing import/export clients remain compatible despite removal of those controls from the browser UI.
- No model migration or alternate record-ingest storage is introduced.
- The Angular app remains embedded in the Sails/EJS page and uses no Angular Router.
- Existing dirty untracked design documents are preserved and not modified.

Assumptions and defaults:

- JSON Schema support is intentionally limited to the documented subset.
- Providers that register unsupported schemas fail during bootstrap with a provider/path-specific error.
- Enabling requires successful current configuration validation, but does not require persisted proof of an earlier connection test or preview.
- Existing providers may be changed during editing only after confirmation and dependent-value reset.
- Raw JSON removal applies to this management interface, not authenticated automation APIs.
- Advanced crosswalk and request settings remain editable through structured controls.
- Visual direction is utilitarian and consistent with current ReDBox management pages.

Risks:

- Hook providers using loose or undocumented schemas will need descriptor updates.
- Existing backend diagnostics may not always contain precise paths; unpathable messages must appear in a modal-level validation summary.
- Workflow-step response typing may require normalization because it comes from an older non-webservice endpoint.
- Large crosswalk expressions need careful modal sizing and keyboard behavior.

# Implementation Plan

1. Define the supported provider-schema types and descriptor validation in `record-ingest/types.ts` and `RecordIngestProviderRegistryService.ts`.
2. Enrich and correct the ROR, Crossref, and ARDC schemas; add descriptor contract tests.
3. Implement service/controller/route support for explicit source enabling without configuration revisions.
4. Expand the Angular API types and add record-type, workflow-step, validation, preview, and enable operations.
5. Build the generic schema renderer and structured crosswalk editor with focused component tests.
6. Refactor the page into the established full-width list plus editor-modal pattern.
7. Add filtering, summaries, status badges, confirmations, diagnostics, preview, and activation flows.
8. Replace hard-coded strings with translations and complete accessibility behavior.
9. Run backend, API, Angular, browser, and regression verification.

# Task List (With Tests and Skill Usage)

## 1. Data Model (Waterline Models)

- [ ] Confirm no persistence changes are introduced and document the existing `filter`/`credentialRefs` boundary. Use Redbox Services.
- [ ] Add a regression test confirming enable/disable operations do not create a configuration revision. Use Redbox Testing.

## 2. Services Layer (Business Logic)

- [ ] Add typed recursive provider-schema contracts in `packages/redbox-core/src/record-ingest/types.ts`. Use Redbox Services.
- [ ] Add provider descriptor validation to `RecordIngestProviderRegistryService.register()`. Use Redbox Services.
- [ ] Add unit tests for supported primitives, arrays, defaults, required fields, and provider/path-specific rejection of unsupported schemas. Use Redbox Testing.
- [ ] Enrich the three built-in provider descriptors and align schemas with their validation logic. Use Redbox Services.
- [ ] Add unit tests covering every built-in field, credential requirement, examples/defaults, and request limits. Use Redbox Testing.
- [ ] Implement `RecordIngestConfigService.enableSource()`. Use Redbox Services.
- [ ] Add service tests for missing sources, invalid configuration, manual/interval activation, next-run calculation, and unchanged revision/hash. Use Redbox Testing.
- [ ] Review the completed model/service work with Redbox Feature Implementation Review; if issues are found, write `issues.json` in the project root.
- [ ] If `issues.json` exists, fix every listed issue and delete the file.
- [ ] Re-run Redbox Feature Implementation Review.
- [ ] Run the targeted Mocha service suite with the mounted development command; do not continue until it passes. Use Redbox Testing.

## 3. Webservice Controllers (REST API)

- [ ] Add `enableSource` to `RecordIngestController`, its exported methods, route registry, and OpenAPI contract. Use Redbox Controllers.
- [ ] Add controller tests for success, validation failure, missing source, brand scoping, and `sendResp` error formatting. Use Redbox Testing.
- [ ] Add Bruno coverage for Admin enable/disable and non-Admin denial. Use Redbox Testing.
- [ ] Review controller and route changes with Redbox Feature Implementation Review; if issues are found, write `issues.json`.
- [ ] If `issues.json` exists, fix every listed issue and delete the file.
- [ ] Re-run Redbox Feature Implementation Review.
- [ ] Run the mounted Bruno general suite; do not continue until it passes. Use Redbox Testing.

## 4. Ajax Controllers (Controllers)

- [ ] Verify no Ajax route was introduced and all browser mutations use CSRF-protected webservice methods. Use Redbox Controllers and Redbox Angular Services.
- [ ] Add/retain API-service tests confirming the branded webservice URLs and CSRF request context. Use Redbox Testing.

## 5. Angular App(s)

- [ ] Replace loose Angular API types with provider-schema, draft, diagnostic, preview, connection, record-type, and workflow-step interfaces. Use Redbox Angular Services.
- [ ] Add API service methods for record types, workflow steps, and enable; test envelope normalization and URL encoding. Use Redbox Angular Services and Redbox Testing.
- [ ] Implement `SchemaFieldsComponent` for the supported schema subset. Use Redbox Angular Apps and frontend-design.
- [ ] Add component tests for required fields, descriptions, defaults, enum/select fields, numeric bounds, formats, arrays, and unsupported-schema presentation. Use Redbox Testing.
- [ ] Implement `CrosswalkEditorComponent` and its repeatable path/identifier controls. Use Redbox Angular Apps.
- [ ] Add crosswalk component tests covering row add/remove, defaults, and model updates. Use Redbox Testing.
- [ ] Refactor `RecordIngestComponent` into the full-width management list, toolbar, filters, summaries, empty states, status badges, and row actions. Use Redbox Angular Apps and frontend-design.
- [ ] Implement the create/edit modal, provider reset confirmation, dirty-close handling, focus restoration, structured Advanced section, and pending states. Use Redbox Angular Apps and frontend-design.
- [ ] Implement validation-to-field mapping, connection test, bounded preview, revision-conflict handling, and enable/disable/run confirmations. Use Redbox Angular Apps and Redbox Angular Services.
- [ ] Add component tests for create/edit, provider switching, record-type/workflow dependencies, validation failures, save, connection test, preview, enable/disable, run confirmation, stale revisions, and duplicate-click prevention. Use Redbox Testing.
- [ ] Run `support/unit-testing/angular/testDevAngular.sh record-ingest` and the record-ingest production build; fix all failures. Use Redbox Angular Apps and Redbox Testing.

## 6. Additional Views

- [ ] Verify the existing EJS mount, nonce, asset hashes, sidebar layout, and full-width wrapper after the Angular refactor. Use Redbox Angular Apps.
- [ ] Add no new views unless verification identifies a concrete layout defect.

## 7. Navigation Configuration

- [ ] Confirm the existing feature-gated Admin sidebar entry and auth rules remain unchanged.
- [ ] Add all new translation keys and test that no visible record-ingest text remains hard-coded. Use Redbox Angular Apps.

## Final Verification

- [ ] Review the complete implementation with Redbox Feature Implementation Review; if issues are found, write `issues.json`.
- [ ] If `issues.json` exists, fix every listed issue and delete the file.
- [ ] Re-run Redbox Feature Implementation Review.
- [ ] Use Web Interface Verification to test desktop and narrow layouts, keyboard-only operation, focus trapping/restoration, schema guidance, validation, preview, activation, and empty/error states.
- [ ] Re-run the targeted Mocha and Bruno suites, then the record-ingest Angular tests and production build.
- [ ] Confirm existing import/export APIs still work and no raw JSON/import/export control appears in the management UI.

### Skill Gaps

- No additional skill is required. The work is covered by Redbox Services, Redbox Controllers, Redbox Angular Apps, Redbox Angular Services, Redbox Testing, Web Interface Verification, Redbox Feature Implementation Review, and frontend-design.
