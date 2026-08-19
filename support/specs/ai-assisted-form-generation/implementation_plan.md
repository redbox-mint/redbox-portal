# AI-assisted form generation implementation plan

Status: proposed

Design: [design.md](design.md)

Requirements: [requirements.md](requirements.md)

## 1. Delivery strategy

Deliver a narrow but real researcher experience first, behind disabled-by-default core configuration. The POC must use persisted/versioned configuration, a real queue, the real ReDBox form lifecycle, and a real OpenRouter adapter implemented through the Vercel AI SDK. It may defer the full admin application, additional providers, conditional questionnaires, saved-record regeneration, and vector retrieval.

The implementation is divided into two release milestones:

- **Milestone A — customer-facing POC:** Phases 0–11. This is the presentation-ready vertical slice.
- **Milestone B — complete configurable platform feature:** Phases 12–15. This adds admin screens and REST administration, further adapters, advanced retrieval, regeneration, and production rollout.

Do not implement Milestone B shortcuts inside POC demo code. POC configuration is bootstrap-seeded through the same services and models that the admin UI will later call.

## 2. Cross-cutting implementation rules

1. Keep all generation runtime code in core/shared packages. `redbox-hook-dev` contains only representative demo configuration.
2. Do not add generation properties to `FormConfigFrame` or individual field definitions.
3. Do not let controllers, Angular components, or provider adapters write ReDBox records.
4. Resolve brand and user on the server for every operation and repeat authorization in queue workers.
5. Add exact dependency versions only. Prefer built-in Node `fetch`, `AbortController`, and `crypto`, plus the already installed Zod.
6. Add tests immediately with each layer; do not postpone all validation until the end.
7. All standard tests use a deterministic fake provider. A live OpenRouter smoke test is opt-in.
8. No raw prompt, source snapshot, knowledge text, candidate value, response body, or secret may enter ordinary logs.
9. The exact OpenRouter model is a bootstrap deployment value selected during final smoke testing, not a source-code constant.

## 3. Phase 0 — baseline, contracts, and feature boundary

### 3.1 Confirm and record the baseline

- Run `git status --short`, preserve unrelated user changes, and create a feature branch only if requested by the user/team workflow.
- Run the existing fast baselines before modification:
  - `npm run compile:sails-ng-common`;
  - `npm run compile:core`;
  - targeted form Angular tests through `support/unit-testing/angular/testDevAngular.sh form` or the repository-supported app selector;
  - existing form behaviour/event-bus unit tests.
- Record any pre-existing failures separately so they cannot be attributed to generation.

### 3.2 Add shared generation contracts

Create `packages/sails-ng-common/src/generation/`:

- `runtime-action.ts` — `FormRuntimeAction`, action kinds, launch descriptor;
- `question.ts` — client-safe question definitions and values;
- `run.ts` — run states/phases, status view, safe errors;
- `candidate-patch.ts` — server-mapped field items, evidence summaries, grounding/review states;
- `provenance.ts` — persisted/pending display contracts;
- `form-runtime-meta.ts` — optional `runtimeActions` and `generationSession` response metadata;
- `index.ts` — barrel exports.

Update `packages/sails-ng-common/src/index.ts`. Add exhaustive status/phase constants rather than free-form strings and unit tests that reject invalid transitions/contract fixtures.

Skill guidance: Redbox Form Config for keeping runtime metadata separate from the form DSL; Redbox Testing for package tests.

### 3.3 Add core configuration

Create `packages/redbox-core/src/config/generation.config.ts` containing typed defaults:

- `enabled: false`;
- installed provider adapter IDs (`openrouter` initially);
- artifact encryption key reference and key ID;
- operational artifact expiry;
- diagnostic retention default/max;
- provider/context/request/response size and timeout limits;
- queue job names/concurrency;
- per-user and per-brand limits;
- polling min/max suggestions;
- outbound hostname policy;
- bootstrap directory and enable flag;
- diagnostic/admin flags.

Export/merge it through the current config index/loader conventions and add configuration parsing tests, including invalid/negative retention, missing encryption key when enabled, and maximum bounds.

## 4. Phase 1 — persistence foundation

### 4.1 Implement Waterline models

Add the twelve models specified in the design under `packages/redbox-core/src/waterline-models/`:

- `GenerationProfile.ts`;
- `GenerationProfileVersion.ts`;
- `GenerationBinding.ts`;
- `GenerationModelConnection.ts`;
- `GenerationModelDeployment.ts`;
- `KnowledgeCollection.ts`;
- `KnowledgeCollectionVersion.ts`;
- `KnowledgeDocument.ts`;
- `KnowledgeChunk.ts`;
- `GenerationRun.ts`;
- `GenerationRunArtifact.ts`;
- `GenerationFieldProvenance.ts`.

For each model:

- define an `@Entity` identity and declared indexes;
- use typed attributes and global Waterline model declarations;
- normalise identifiers/statuses in lifecycle hooks;
- require `brandId` and actor fields where applicable;
- reject published-version changes;
- reject secret-looking connection properties;
- bound strings/JSON arrays before persistence;
- export the Waterline definition and attribute/model interfaces.

Update `packages/redbox-core/src/waterline-models/index.ts` exports, imports, and `WaterlineModels` map.

### 4.2 Add generation persistence primitives

Create `packages/redbox-core/src/services/GenerationPersistenceService.ts` with:

- canonical JSON serializer/hash helpers;
- brand-scoped `findOne` helpers that require `brandId`;
- native Mongo collection access isolated behind typed interfaces;
- run compare-and-set transition helper;
- profile/deployment/knowledge publication pointer compare-and-set helper;
- `ensureIndexes()` for TTL/sparse/state indexes;
- `bootstrap()`/`init()` wiring that checks indexes after the datastore is ready.

The compare-and-set helper returns the updated entity or a typed conflict; it never falls back to an unscoped update.

### 4.3 Add artifact encryption

Create:

- `GenerationSecretResolverService.ts` with an installed resolver registry and POC `env:` resolver;
- `GenerationCryptoService.ts` using Node `crypto` AES-256-GCM and a versioned envelope;
- typed encryption/redaction tests.

Encryption requirements:

- accept a 256-bit key through a secret reference, not database config;
- create a unique random IV per encryption;
- authenticate run ID and brand ID as additional authenticated data;
- support key ID lookup for rotation;
- zero or release plaintext buffers/references as practical after use;
- never log the payload or resolved secret;
- fail closed on missing/invalid key, auth-tag failure, or brand/run mismatch.

Skill guidance: Redbox Services and Redbox Testing.

## 5. Phase 2 — configuration/version services and bootstrap

### 5.1 Implement `GenerationProfileService`

File: `packages/redbox-core/src/services/GenerationProfileService.ts`.

Implement:

- list/get/create stable profile;
- create/copy/update draft version;
- canonical hash;
- definition contract validation;
- source/question/target ID uniqueness;
- JSON Pointer syntax checks;
- supported output/component matrix checks delegated to schema service;
- knowledge/deployment reference validation;
- fixture definition validation;
- publish/retire with immutable versions and pointer compare-and-set;
- resolve published version by profile/binding.

Do not render a prompt in this service. Its responsibility ends with valid configuration.

### 5.2 Implement `GenerationBindingService`

File: `packages/redbox-core/src/services/GenerationBindingService.ts`.

Implement CRUD/validation plus:

- `resolveActions(context)`;
- `authorizeLaunch(brand, user, bindingKey, sourceOid)`;
- target-create workflow/role check;
- deterministic relationship initial-value construction;
- target URL construction using brand/portal and opaque run ID;
- matching by source record type, form mode, workflow stage, and allowed roles.

Unit-test omission of disabled/unpublished/cross-brand bindings and confirm existing linked targets do not hide the action.

### 5.3 Implement `GenerationModelService` and adapter registry

Files:

- `packages/redbox-core/src/services/GenerationModelService.ts`;
- `packages/redbox-core/src/services/GenerationProviderRegistryService.ts`;
- `packages/redbox-core/src/services/generation/providers/types.ts`;
- `packages/redbox-core/src/services/generation/providers/FakeGenerationProvider.ts` for tests.

Implement registry bootstrap, duplicate adapter-ID rejection, connection/deployment draft/publish/version operations, capability negotiation, secret-safe summaries, and a fake provider whose fixture is keyed by test case/run input rather than prompt string matching.

### 5.4 Implement `GenerationBootstrapService`

File: `packages/redbox-core/src/services/GenerationBootstrapService.ts`.

Read `<bootstrapDataPath>/generation/` in deterministic dependency order:

1. model connections;
2. model deployments;
3. knowledge collections/documents;
4. profiles;
5. bindings.

Use stable brand-scoped keys and content hashes for idempotency. Reject embedded secrets. A malformed item logs only its filename and safe validation details, then continues. Missing directory is a verbose no-op. Add the bootstrap call to `packages/redbox-core/src/bootstrap.ts` after brand/form/record type prerequisites are available and before runs may be launched.

The bootstrap loader calls the same service validation/publication methods that future admin endpoints use; it does not directly insert published rows.

### 5.5 Export services

Update `packages/redbox-core/src/services/index.ts` imports, module exports, and lazy `ServiceExports`. Add declarations required by TypeScript/test globals without deliberate `any` bypasses.

Skill guidance: Redbox Services, Redbox Form Config, Redbox Testing.

## 6. Phase 3 — knowledge ingestion and deterministic retrieval

### 6.1 Implement `GenerationKnowledgeService`

File: `packages/redbox-core/src/services/GenerationKnowledgeService.ts`.

Implement:

- collection/version draft lifecycle;
- plain text and Markdown validation;
- stable document metadata/hashing;
- deterministic heading/paragraph chunking with configured byte bounds;
- explicit tags and authority normalisation;
- preview without persistence;
- publish immutable documents/chunks;
- retrieve by pinned versions and field tags;
- precedence/order and total context limits;
- stable evidence IDs and safe display labels.

POC retrieval must be deterministic; no embeddings and no network calls. Unit tests pin exact chunk boundaries/order/hashes and prove cross-brand chunks are never returned.

### 6.2 Create fictional POC knowledge manifests

Under `support/resources/development/bootstrap-data/generation/knowledge/` add a manifest and four clearly fictional Markdown files:

- data classification;
- approved storage/backup;
- retention/disposal;
- sharing/consent.

Tag chunks to the representative profile fields and include authority/effective dates. Avoid any real institution name or legal claim.

## 7. Phase 4 — form-aware schema and context preparation

### 7.1 Implement `GenerationSchemaService`

File: `packages/redbox-core/src/services/GenerationSchemaService.ts`.

Build a reusable resolved-target map from:

- published profile target fields;
- effective client form returned by `FormsService.buildClientFormConfig` for the actual user/mode/brand;
- component map/definition traversal;
- `FormRecordConsistencyService.buildSchemaForFormConfig()` and value projection/validation;
- resolved bounded vocabulary options.

Implement:

- publish-time validation against configured target form;
- invocation-time revalidation;
- supported component matrix;
- explicit rejection of excluded/system components;
- dynamic JSON Schema generation keyed by stable profile IDs;
- dynamic Zod/local candidate validation;
- stable-ID-to-pointer mapping after parse;
- enum/date/length/cardinality validation;
- candidate record projection and current form-value validation;
- deterministic fallback insertion for profile-configured unresolved fields.

Do not rely on the currently incomplete `validateRecordSchema()` TODO. Add focused extensions to `FormRecordConsistencyService` only where the logic is broadly reusable; keep generation policy in `GenerationSchemaService`.

### 7.2 Implement `GenerationContextService`

File: `packages/redbox-core/src/services/GenerationContextService.ts`.

Implement source record loading/access checks, allowed JSON Pointer projection, question-default evaluation, submitted answer validation, effective target form resolution, target snapshot projection/hash, source revision/hash, evidence catalogue construction, and deterministic context-size enforcement.

Use the repository's existing JSONata implementation for configured source-default expressions, behind a restricted evaluator and input/time/size bounds. A missing optional source value produces an empty question default; it never expands source access.

### 7.3 Implement `GenerationPromptService`

File: `packages/redbox-core/src/services/GenerationPromptService.ts`.

Create provider-neutral messages and schema. Separate platform instructions, profile instructions, field catalogue, project facts, reviewed answers, and knowledge. Label the latter blocks untrusted. Ensure canonical ordering so fixture snapshots are stable.

Add prompt-injection fixtures containing instructions in title/abstract/policy text and prove the output target/evidence/schema contracts remain unchanged.

Skill guidance: Redbox Services, Redbox Form Config, Redbox Testing.

## 8. Phase 5 — OpenRouter adapter

### 8.1 Add the AI SDK invocation layer and implement `OpenRouterGenerationProvider`

File: `packages/redbox-core/src/services/generation/providers/OpenRouterGenerationProvider.ts`.

Add exactly pinned, mutually compatible `ai` and `@ai-sdk/openai-compatible` dependencies to `packages/redbox-core`. Keep all AI SDK types and provider options inside `services/generation/providers/` so ReDBox services, persisted models, and client contracts remain stable if the SDK changes.

Configure the OpenAI-compatible provider for the fixed OpenRouter endpoint and call non-streaming `generateText` with `Output.object`. Use:

- configured/fixed POC base URL;
- Bearer token from `GenerationSecretResolverService`;
- JSON content type and optional approved attribution headers;
- non-streaming chat completions through the AI SDK;
- configured model ID;
- strict `json_schema` response format;
- `provider.require_parameters = true`;
- explicit data-collection/ZDR/provider/fallback routing policy from deployment;
- no `tools`, plugins, browsing, or conversation history;
- ReDBox-owned abort timeout and zero SDK retries;
- a guarded fetch that applies the response byte limit before the SDK parses it;
- safe HTTP/rate-limit/error mapping;
- response model, usage, finish reason, and optional router metadata normalisation.

Do not provide tools or enable SDK telemetry. Do not add an OpenRouter-specific SDK. Do not log or return SDK request/response bodies. Do not repair malformed model JSON automatically in the POC.

### 8.2 Capability and health checks

Implement:

- static required capability declaration (`structuredOutput`, non-streaming, text input);
- deployment validation requiring these capabilities;
- minimal schema health test used by administrators/bootstrap smoke checks;
- actual-model/provider capture where returned;
- explicit incompatibility when the configured model/provider route cannot honour structured output.

Mock `fetch` in unit tests for success, strict output, 401, 404 model, 408/429, 5xx, timeout, oversized response, refusal/content filtering, malformed content, wrong schema, and redaction.

### 8.3 Model selection procedure

Near POC completion, query/test currently available OpenRouter models outside standard CI, select one that demonstrably supports the required strict schema and configured data policy, update only the bootstrap deployment JSON, and record the tested model/provider/date in the deployment capability snapshot. Keep the previous fixture/fake path unchanged.

## 9. Phase 6 — run state machine, queue worker, and provenance

### 9.1 Implement `GenerationRunService`

File: `packages/redbox-core/src/services/GenerationRunService.ts`.

Implement:

- launch from authorised binding/source;
- actor-safe get status/result;
- execute/failure retry with CAS;
- per-user/brand limit check;
- freeze/encrypt artifact;
- enqueue with only brand/run ID;
- cancel request;
- state transition/heartbeat/error helpers;
- terminal cleanup/expiry;
- commit orchestration delegated to provenance service.

`launch` pins current published IDs. `execute` revalidates those pinned entities are still usable for the already-created intent; retiring them may prevent new launches but should not silently swap versions.

### 9.2 Implement `GenerationWorkerService`

File: `packages/redbox-core/src/services/GenerationWorkerService.ts`.

Worker algorithm:

1. load run by brand/run ID and acquire `queued -> running` lease;
2. reload brand/user/source and repeat authorization;
3. decrypt frozen input;
4. revalidate pinned profile/deployment/knowledge brands/hashes;
5. retrieve deterministic knowledge;
6. build provider request/schema;
7. invoke selected adapter with deadline and cancellation checks;
8. transition to validating;
9. validate response/evidence/target/form and construct candidate;
10. encrypt/update artifact;
11. store non-content summary/digests/usage and transition to completed;
12. on safe retryable failure, transition failed with code; on cancel, discard response and transition cancelled.

Do not apply the patch or save a record.

### 9.3 Register Agenda jobs

Update `packages/redbox-core/src/config/agendaQueue.config.ts` with execution and cleanup jobs. Set lock lifetime longer than provider timeout plus validation margin, heartbeat before expiry, bounded concurrency, and no recurring SQS schedule assumption. Add Agenda integration tests for enqueue, redelivery, terminal no-op, failure retry, cancel, and expiry.

### 9.4 Implement `GenerationProvenanceService`

File: `packages/redbox-core/src/services/GenerationProvenanceService.ts`.

Implement:

- idempotent commit from completed run to one target OID;
- target brand/type/form/source relationship/creator/edit-access verification;
- current saved value hash verification;
- provenance upsert by run/field;
- reviewed field validation;
- run `completed -> committing -> committed` transition with retry rollback;
- provenance read by authorised target record;
- display-state derivation from current metadata;
- explicit review endpoint logic;
- artifact deletion/rewrite according to retention.

Add service tests for duplicate commits, different-target attack, altered value, deleted field, reviewed state, cross-brand OID, missing artifact, and retention zero/nonzero.

Skill guidance: Redbox Services and Redbox Testing.

## 10. Phase 7 — controllers, routes, and authorization

### 10.1 Add browser/AJAX controller

Create `packages/redbox-core/src/controllers/GenerationController.ts` with exported methods:

- `launch`;
- `getRun`;
- `execute`;
- `cancel`;
- `commit`;
- `getProvenance`;
- `reviewProvenance`.

Validate/sanitise primitive request shapes, derive trusted brand/user, call services, map domain errors, and use `this.sendResp(req, res, payload)`.

### 10.2 Add REST/admin controller contracts

Do not implement an incomplete admin API for the POC. Exercise bootstrap/configuration through public services and Mocha tests. In Milestone B, implement the complete contract-first REST surface from Design section 3 before the admin Angular app, including:

- `packages/redbox-core/src/controllers/webservice/GenerationAdminController.ts`;
- `packages/redbox-core/src/api-routes/groups/generation.ts`;
- `packages/redbox-core/src/api-routes/route-registry.ts`;
- `packages/redbox-core/src/api-routes/index.ts`;
- reusable Zod/OpenAPI schema helpers;
- controller exports/names, explicit Admin auth, and Bruno coverage.

The complete endpoints cover profiles/versions, bindings, connections/deployments, knowledge, non-content runs, guarded diagnostics, and purge. They use the same service methods already exercised by the POC bootstrap path.

### 10.3 Register controllers/routes/auth

Update:

- `packages/redbox-core/src/controllers/index.ts`;
- `packages/redbox-core/src/config/routes.config.ts` for CSRF browser routes in the POC and Admin page/API routes later;
- `packages/redbox-core/src/config/auth.config.ts` with explicit Researcher/Librarian/Admin browser paths in the POC and Admin REST paths later;
- `packages/redbox-core/src/config/lognamespace.config.ts`;
- API route/OpenAPI validation tests.

### 10.4 Extend form response runtime metadata

Modify `RecordController.getForm()` after effective-form construction/access checks to:

- resolve runtime actions for existing source records;
- resolve/authorize `generationRunId` for new target forms;
- return deterministic relationship `initialValues` and `autoOpen` session metadata;
- avoid changing `data`/`FormConfigFrame`;
- return no cross-brand or unauthorised details.

Add controller tests for source view/edit, target new form, no matching binding, disabled feature, invalid run, wrong user, wrong brand, and unchanged form definition snapshots.

The browser-to-form-response handoff requires an explicit client change. The current `FormComponent` already parses page request parameters, while `FormService.getFormConfig()` builds a new request URL and forwards none of them. Change `downloadFormComponents()`/`getFormConfig()` to accept a typed, narrowly scoped runtime context and forward only a valid, single-string `generationRunId`. Do not spread or re-encode the complete `requestParams` map. Add Angular HTTP/integration tests for a valid run ID, missing run ID, arrays/boolean/empty/oversized values, unrelated parameters, encoding, and unchanged normal form URLs.

Skill guidance: Redbox Controllers, Redbox Services, Redbox Testing.

## 11. Phase 8 — form action/event/state foundation

### 11.1 Extend typed form events

Modify:

- `angular/projects/researchdatabox/form/src/app/form-state/events/form-component-event.types.ts`;
- event factories/barrel exports;
- event-bus tests;
- form behaviour matcher tests where generic events are observed.

Add runtime-action/generation lifecycle events and backwards-compatible field event `origin`/`correlationId`. Preserve O(1)-relative filtering and ephemeral semantics.

### 11.2 Add generation state/actions/reducer/selectors/effects

Create `angular/projects/researchdatabox/form/src/app/form-state/generation/` and register it through the existing form feature provider. State must be scoped/reset with the form component lifetime.

Effects:

- consume runtime action request and call launch;
- navigate to target URL;
- load/reconcile generation session from form response;
- execute and poll active run;
- publish phase/completion/failure events;
- call patch applier only after completed server validation;
- load provenance for existing record;
- track review state;
- commit after create success;
- stop polling on terminal/destroy/logout.

Unit-test every state transition, duplicate suppression, backoff, cancellation, reopen, save commit, and failure recovery.

### 11.3 Add `GenerationApiService`

Create the Angular service using the standard `HttpClientService`/CSRF/base URL pattern. Add HTTP tests verifying URL, method, body, CSRF context, response typing, and error propagation.

Separately, extend the existing `FormService` form-definition request with the allowlisted runtime-context argument described in Phase 7. Keep this transport concern out of `GenerationApiService`: the server must receive and authorise `generationRunId` while constructing the initial form response, before generation state/effects can initialise.

Skill guidance: Redbox Angular Services, Redbox Angular Apps, Redbox Testing.

## 12. Phase 9 — customer-facing form UI and patch application

### 12.1 Add runtime actions toolbar

Create:

- `form-runtime-actions.component.ts/html/scss/spec.ts` or an inline-template equivalent consistent with the form project;
- mount it from the form root near normal actions without changing institutional form definitions.

The toolbar publishes a typed action request and does not know OpenRouter/profile details.

### 12.2 Add guided side panel

Create:

- `generation-side-panel.component.ts/html/scss/spec.ts`;
- optional `generation-progress.component.*`;
- focus management/focus restoration helpers if not already reusable.

Implement draft questions, editable prefilled values, generate, four progress phases, cancel/close, retry on failed attempt, completed summary, flagged field link/focus, and no second successful run.

### 12.3 Add `GenerationPatchApplierService`

Implement the snapshot/current/candidate check and batch mutation contract. Reuse the form component map and lineage resolver; do not query DOM elements to find controls. Add tests for each supported control/value kind, empty/non-empty targets, changes made while running, repeatables, disabled/missing targets, event counts, dirty/touched state, and validation broadcast.

### 12.4 Add provenance badges/review

Integrate a compact provenance component into `FormBaseWrapperComponent` or another single wrapper-level seam. It resolves by lineage pointer and must not require changes to each field class.

Implement expanded evidence/rationale, advisory review-required state, mark reviewed, pending-before-save, generated-after-reload, edited/removed state, accessibility, no field disabling, and no POC save blocking solely because the advisory flag remains unresolved.

### 12.5 Wire module and styles

Update `form.module.ts`, relevant barrels/static declarations, and translations in development locale resources. Because these are form-root components rather than new configurable field classes, do not add them to the form component dictionary or visitor mappings.

Skill guidance: Redbox Angular Apps, Redbox Angular Services, Web Interface Verification, Redbox Testing. The Redbox Form Components skill is not required unless implementation changes course and exposes a configurable form-field class.

## 13. Phase 10 — representative demo configuration

### 13.1 Add demo record types and workflows

Modify `packages/redbox-hook-dev/src/config/recordtype.ts` and `workflow.ts` to add:

- `researchActivity` with draft/view/edit/search configuration;
- `demoRdmp` with a normal draft workflow and relation back to Research Activity.

Do not add generation services or mappings to the hook.

### 13.2 Add representative forms

Create:

- `packages/redbox-hook-dev/src/form-config/researchActivity-1.0-draft.ts`;
- `packages/redbox-hook-dev/src/form-config/demoRdmp-1.0-draft.ts`.

Update the form-config index. Use existing supported field components, ordinary translations/validation, and a mixture of enums/radio/checkbox/textarea fields from the requirements matrix. The relationship field is deterministic/runtime-owned and excluded from the model target list.

### 13.3 Add synthetic Research Activity records

Create `support/resources/development/bootstrap-data/records/researchActivity.json` with at least:

- the live-demo human-participant interviews/surveys project with incomplete sharing consent;
- a non-sensitive environmental observations fixture.

Use stable OIDs, bootstrap authorization for demo users/roles, and no real names, emails, grants, or institutions.

### 13.4 Add persisted generation bootstrap manifests

Under `support/resources/development/bootstrap-data/generation/` add:

- OpenRouter connection with `secretRef: env:OPENROUTER_API_KEY`;
- one draft/published deployment whose model ID is replaceable configuration;
- fictional knowledge manifest/documents;
- `demo-rdmp-assistant` profile/version with five questions and the explicit target field allowlist;
- Research Activity to demo RDMP binding.

Add a development-only artifact encryption key reference to the environment/docker-compose configuration without committing a production secret. Document how a presenter supplies `OPENROUTER_API_KEY` and selects the model in bootstrap data or an override.

Skill guidance: Redbox Form Config, Redbox Testing.

## 14. Phase 11 — POC verification and hardening

### 14.1 Package and unit verification

Run:

- `npm run compile:sails-ng-common` and its full package tests;
- `npm run compile:core` and `npm run test:core`;
- targeted form Angular suite, then full `npm run test:angular` if practical;
- API route validation and generated OpenAPI checks;
- lint/format checks for changed files.

### 14.2 Backend integration gate

Add Mocha integration tests under:

- `test/integration/models/GenerationModels.test.ts`;
- `test/integration/services/GenerationBootstrapService.test.ts`;
- `test/integration/services/GenerationRunService.test.ts`;
- `test/integration/services/GenerationWorkerService.test.ts`;
- `test/integration/services/GenerationBrandIsolation.test.ts`;
- `test/integration/services/GenerationProvenanceService.test.ts`.

Use the fake adapter and synthetic records. Run targeted mounted tests, then the required full backend suite. The OpenRouter network is never required.

### 14.3 API/CSRF gate

Add Bruno requests for:

- authorised launch/status/execute/commit/provenance;
- unauthenticated/unauthorised requests;
- CSRF enforcement;
- invalid/cross-brand run/source/target;
- duplicate execute and idempotent commit;
- safe errors and the absence of any undeclared POC admin endpoint.

Run the mounted general/AJAX and REST collections as appropriate.

### 14.4 Browser verification

Create natural-language/automated browser scenarios for:

1. open Research Activity and launch;
2. verify side-panel questions/defaults;
3. fake-provider successful generation and field values;
4. flagged sharing field and mark reviewed;
5. edit generated value and save;
6. reload and verify badges/edited state;
7. launch a second independent RDMP from the same Research Activity;
8. failed provider retry and no second success;
9. keyboard/focus/live-region behaviour;
10. no console errors or leaked raw content.

Use the T3 collaborative preview/browser workflow when executing, with login handled through the ReDBox development-login process.

### 14.5 Opt-in live OpenRouter smoke test

Add an integration test guarded by `RUN_LIVE_GENERATION_TESTS=true` and required environment values. It:

- uses only the synthetic fixture;
- validates deployment capabilities first;
- invokes one strict structured request;
- validates the candidate locally;
- records actual model/provider/usage in test output without printing prompt/result content;
- skips cleanly in CI/default development.

### 14.6 Presentation rehearsal

Prepare a deterministic fake-provider mode as a contingency, but rehearse the real OpenRouter path. Confirm startup/bootstrap, credentials, selected model capability, queue health, synthetic source record, target form, policy citations, progress timing, review flag, save/reload provenance, and cleanup.

Milestone A exits only when all twenty POC acceptance criteria in `requirements.md` are satisfied.

## 15. Phase 12 — admin REST and embedded management app (post-POC)

### 15.1 Complete REST contracts/controllers

Implement all endpoints listed in Design section 3 with Zod/OpenAPI schemas, optimistic content-hash concurrency, Admin brand scoping, redacted connections, fixture execution, and diagnostic audit/purge.

### 15.2 Generate/scaffold `admin-generation`

Use the ReDBox Angular app generator where it matches repository conventions. Add:

- project in `angular/angular.json`;
- app under `angular/projects/researchdatabox/admin-generation/`;
- EJS view `views/default/default/admin/generation.ejs`;
- hashed asset loading;
- Sails render route/auth/navigation;
- `GenerationAdminApiService` extending `HttpClientService`.

No Angular Router. Use internal state for Profiles, Bindings, Models, Knowledge, and Runs.

### 15.3 Implement simple-to-advanced editors

Build schema-driven forms and field pickers first; advanced JSONata/prompt/JSON views are opt-in sections. Publishing is an Admin action with validation/test summaries and no second approval step.

### 15.4 Admin verification

Add component/service tests, REST/Bruno tests, cross-brand permission tests, and browser scenarios for draft/copy/validate/test/publish/retire/version history, connection redaction, knowledge preview/retrieval, and diagnostics purge.

Skill guidance: Redbox Angular Apps, Redbox Angular Services, Redbox Controllers, Redbox Services, Redbox Testing, Web Interface Verification.

## 16. Phase 13 — additional AI SDK providers (post-POC)

### 16.1 Generic OpenAI-compatible adapter

Use `@ai-sdk/openai-compatible` behind the existing ReDBox adapter interface with operator endpoint allowlisting, capability probes, strict structured-output mode where supported, custom header secret references, response normalisation, and local validation. Do not assume all OpenAI-compatible servers support identical parameters.

### 16.2 Google Vertex AI/Gemini provider

First confirm whether the client requires Gemini model invocation on Vertex AI or the distinct Gemini Enterprise search/agent API. For Vertex model invocation, add exactly pinned `@ai-sdk/google-vertex` only when implementation begins. Support application default credentials/workload identity, project, region, publisher/custom model configuration, structured output for compatible Gemini models, safety settings, timeouts, usage normalisation, and no tools or model-side retrieval. Add mocked provider tests; live Google Cloud tests remain opt-in. If Gemini Enterprise APIs are required, design a separate knowledge/agent integration; do not imply that the AI SDK Vertex provider supplies those APIs.

### 16.3 AWS Bedrock provider

Add exactly pinned `@ai-sdk/amazon-bedrock` and only the credential packages required by the implementation. Support the AWS default credential chain, assume role/workload identity, region/model configuration, structured output for compatible models, timeouts, usage normalisation, and no tools. Add mocked SDK/LocalStack tests where protocol support permits; live AWS tests remain opt-in.

### 16.4 Capability matrix and deployment migration

Expose installed adapter capabilities in admin UI. Require a new tested deployment and profile version for model/provider changes. Never transparently fall back across deployments.

## 17. Phase 14 — advanced knowledge and regeneration (post-POC)

### 17.1 Knowledge management/retrieval adapters

Add upload MIME validation, larger ingestion jobs, external/vector retrieval adapters with brand-specific namespaces, reindex status, and retrieval evaluation fixtures. Retain immutable collection versions and stable evidence IDs.

### 17.2 Saved-record regeneration

Extend binding/profile policy with explicit replace/append/merge operations. Add a candidate-review UI using three-way merge:

- base snapshot at generation start;
- candidate value;
- current form value at apply.

Never silently overwrite. Conflicts and replacements require explicit per-field/bulk confirmation. This phase is not allowed to weaken the create-only POC safety defaults.

### 17.3 Optional manual trigger surfaces

Allow additional profile bindings to appear in appropriate form modes/workflows or respond to explicit generic runtime action events. Automatic save/create hooks remain opt-in and require separate cost/rate/failure semantics.

## 18. Phase 15 — production rollout

1. Threat-model review: brand boundaries, SSRF, prompt injection, output injection, secret handling, queue redelivery, artifact retention, and admin diagnostics.
2. Privacy/data-processing review for each installed provider/deployment and institution.
3. Load/concurrency tests with fake provider latency/failure distributions.
4. Operational dashboards and alerts for queue backlog, failure rate, timeout rate, token/cost ceilings, and artifact cleanup lag.
5. Backup/restore and key-rotation rehearsal for configuration/provenance and encrypted transient artifacts.
6. Upgrade/rollback plan: feature flag off prevents new launches while existing records/provenance remain readable.
7. Pilot one brand/profile, then expand by explicit brand configuration.
8. Update wiki documentation for administrators, researchers, providers, security, and troubleshooting.

## 19. Expected file map

### Core backend

```text
packages/redbox-core/src/
  api-routes/groups/generation.ts
  config/generation.config.ts
  controllers/GenerationController.ts
  controllers/webservice/GenerationAdminController.ts
  model/generation/*
  services/GenerationBindingService.ts
  services/GenerationBootstrapService.ts
  services/GenerationContextService.ts
  services/GenerationCryptoService.ts
  services/GenerationKnowledgeService.ts
  services/GenerationModelService.ts
  services/GenerationPersistenceService.ts
  services/GenerationProfileService.ts
  services/GenerationPromptService.ts
  services/GenerationProvenanceService.ts
  services/GenerationProviderRegistryService.ts
  services/GenerationRunService.ts
  services/GenerationSchemaService.ts
  services/GenerationSecretResolverService.ts
  services/GenerationWorkerService.ts
  services/generation/providers/OpenRouterGenerationProvider.ts
  services/generation/providers/FakeGenerationProvider.ts
  services/generation/providers/types.ts
  waterline-models/Generation*.ts
  waterline-models/Knowledge*.ts
```

### Shared/form frontend

```text
packages/sails-ng-common/src/generation/*
angular/projects/researchdatabox/form/src/app/
  component/form-runtime-actions.component.*
  generation/generation-api.service.*
  generation/generation-patch-applier.service.*
  generation/generation-side-panel.component.*
  generation/generation-field-provenance.component.*
  form-state/generation/*
```

### Demo and tests

```text
packages/redbox-hook-dev/src/form-config/researchActivity-1.0-draft.ts
packages/redbox-hook-dev/src/form-config/demoRdmp-1.0-draft.ts
support/resources/development/bootstrap-data/generation/*
support/resources/development/bootstrap-data/records/researchActivity.json
packages/redbox-core/test/{models,services,controllers}/Generation*.test.ts
angular/projects/researchdatabox/form/src/app/**/*generation*.spec.ts
test/integration/{models,services}/Generation*.test.ts
test/bruno/.../Generation/*.bru
```

### Post-POC admin UI

```text
angular/projects/researchdatabox/admin-generation/*
views/default/default/admin/generation.ejs
```

## 20. Definition of done

Milestone A is done when the POC acceptance criteria pass with the deterministic fake provider, the standard suites require no external account, an opt-in live OpenRouter smoke test passes for the final configured model, the browser workflow has been rehearsed end-to-end, raw content is absent from logs, and disabling the feature removes all runtime actions without affecting ordinary forms/records.

Milestone B is done when Admin can configure/version/test/publish every entity through the embedded UI, at least OpenRouter plus one additional adapter pass the same contract suite, saved-record regeneration uses explicit merge review, and production security/privacy/operations gates are complete.
