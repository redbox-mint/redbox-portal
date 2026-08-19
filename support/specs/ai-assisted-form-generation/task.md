# Task List (With Tests and Skill Usage)

Status: proposed

Design: [design.md](design.md)

Plan: [implementation_plan.md](implementation_plan.md)

Legend:

- `[POC]` is required for the customer-facing Milestone A.
- `[FULL]` belongs to the complete configurable Milestone B unless pulled forward deliberately.
- Tests are interleaved immediately after the implementation they protect.
- Do not proceed past an integration gate until it passes or an existing unrelated failure is documented and accepted by the team.

## 0. Baseline and shared contracts

- [ ] **BASE-01 [POC] Capture repository baseline.** Record `git status --short`, active branch, relevant package versions, and existing targeted compile/test results. Preserve unrelated changes. Skills: Redbox Testing.
- [ ] **BASE-01T [POC] Verify baseline evidence.** Confirm baseline output includes `sails-ng-common`, `redbox-core`, and form-app tests and distinguishes pre-existing failures. Skills: Redbox Testing.

- [ ] **BASE-02 [POC] Add shared generation contract directory.** Create typed constants/interfaces for runtime actions, questions, run state/phase, safe errors, candidate patches, evidence summaries, provenance, and form runtime metadata under `packages/sails-ng-common/src/generation/`; export through package barrels. Skills: Redbox Form Config, Redbox Testing.
- [ ] **BASE-02T [POC] Add shared contract unit tests.** Cover enum/status exhaustiveness, representative JSON fixtures, optional runtime metadata compatibility, and rejection of unknown terminal states. Skills: Redbox Testing.

- [ ] **BASE-03 [POC] Add typed core generation configuration.** Create and register `generation.config.ts` with disabled default, adapters, encryption, retention, size/time limits, queue settings, limits, bootstrap, outbound policy, and diagnostics. Skills: Redbox Services.
- [ ] **BASE-03T [POC] Test generation configuration parsing/defaults.** Cover feature disabled, valid override, invalid negative/over-max retention, invalid timeouts/limits, missing encryption key while enabled, and exact environment mapping. Skills: Redbox Testing.

- [ ] **BASE-04 [POC] Add safe domain error types and canonical hash utilities.** Place provider-neutral types under `packages/redbox-core/src/model/generation/`; avoid provider request types outside adapter modules. Skills: Redbox Services.
- [ ] **BASE-04T [POC] Test error redaction and canonical hashing.** Prove object key order does not change hashes and secret/prompt/source values are not rendered by public errors. Skills: Redbox Testing.

## 1. Data Model (Waterline Models)

- [ ] **DM-01 [POC] Implement `GenerationProfile` and `GenerationProfileVersion`.** Add brand keys, version/status/hash fields, actor metadata, indexes, normalisation, and published immutability. Update the Waterline exports/map. Skills: Redbox Services.
- [ ] **DM-01T [POC] Add profile model unit tests.** Cover required brand/key/name, scoped uniqueness, normalisation, allowed transitions, draft mutation, published mutation rejection, and invalid definitions. Skills: Redbox Testing.

- [ ] **DM-02 [POC] Implement `GenerationBinding`.** Add source/target/action/relationship/multiplicity fields, actor metadata, and brand/source/target indexes. Skills: Redbox Services.
- [ ] **DM-02T [POC] Add binding model unit tests.** Cover required source/target/profile, invalid mode/count, brand/key uniqueness, normalised action configuration, and `allowMultipleTargetsPerSource=true`. Skills: Redbox Testing.

- [ ] **DM-03 [POC] Implement `GenerationModelConnection` and `GenerationModelDeployment`.** Add adapter/auth/secret-ref/data-policy/endpoint fields and immutable deployment versions/capability snapshots. Skills: Redbox Services.
- [ ] **DM-03T [POC] Add model connection/deployment tests.** Cover embedded-secret rejection, safe secret reference acceptance, invalid auth/URL/status, scoped version uniqueness, draft edit, and published edit rejection. Skills: Redbox Testing.

- [ ] **DM-04 [POC] Implement knowledge collection/version/document/chunk models.** Include authority/effective dates/classification/tags/content hashes and deterministic ordering/indexes. Skills: Redbox Services.
- [ ] **DM-04T [POC] Add knowledge model tests.** Cover stable key/version uniqueness, published immutability, document/chunk scoping, authority validation, effective-date validation, and cross-version key reuse rules. Skills: Redbox Testing.

- [ ] **DM-05 [POC] Implement `GenerationRun`.** Add pinned references, source/target descriptors, full state/phase model, attempts, digests, safe provider/usage/error metadata, timestamps, and indexes. Skills: Redbox Services.
- [ ] **DM-05T [POC] Add run model tests.** Cover valid initial defaults, prohibited states/phases, bounded error summary, content-free audit shape, source/target descriptor validation, and no secret/prompt fields. Skills: Redbox Testing.

- [ ] **DM-06 [POC] Implement encrypted `GenerationRunArtifact`.** Add brand/run uniqueness, AES envelope fields, content-kind summary, and absolute expiry. Skills: Redbox Services.
- [ ] **DM-06T [POC] Add artifact model tests.** Cover required encryption envelope, invalid/expired timestamps, brand/run uniqueness, and rejection of accidental plaintext payload fields. Skills: Redbox Testing.

- [ ] **DM-07 [POC] Implement `GenerationFieldProvenance`.** Add record/run/field/path, hashes, evidence/rationale, grounding/review state, actor/timestamps, and indexes. Skills: Redbox Services.
- [ ] **DM-07T [POC] Add provenance model tests.** Cover unique run/field, bounded rationale/evidence, valid grounding/review state, and required target record/brand. Skills: Redbox Testing.

- [ ] **DM-08 [POC] Register every model with the loader.** Update `waterline-models/index.ts` exports/imports/`WaterlineModels`, generated type visibility, and test setup globals. Skills: Redbox Services, Redbox Testing.
- [ ] **DM-08T [POC] Add loader/model-registration test.** Assert all twelve names produce model definitions exactly once and existing models remain unchanged. Skills: Redbox Testing.

- [ ] **DM-09 [POC] Implement native index verification.** Add `GenerationPersistenceService.ensureIndexes()` for TTL and state/query indexes not reliably covered by decorators; make it idempotent. Skills: Redbox Services.
- [ ] **DM-09T [POC] Test index creation and drift handling.** Stub native manager for first creation, already-correct index, incompatible index warning/failure, and no unscoped collection calls. Skills: Redbox Testing.

- [ ] **DM-10 [FULL] Add record-destroy provenance cleanup policy.** Integrate with the authoritative destroy lifecycle while retaining provenance for soft deletes. Skills: Redbox Services.
- [ ] **DM-10T [FULL] Test soft-delete retention and hard-destroy cleanup.** Ensure no cross-record or cross-brand deletion. Skills: Redbox Testing.

## 2. Services Layer (Business Logic)

- [ ] **SV-01 [POC] Implement `GenerationPersistenceService` brand-scoped helpers and CAS.** Require brand in every lookup/update, isolate native Mongo typing, and return typed state conflicts. Export through `ServiceExports`. Skills: Redbox Services.
- [ ] **SV-01T [POC] Test scoped access and state transitions.** Cover every allowed/forbidden run transition, stale attempt, wrong brand, terminal redelivery, and publication pointer CAS conflict. Skills: Redbox Testing.

- [ ] **SV-02 [POC] Implement `GenerationSecretResolverService`.** Add installed resolver registry and `env:` resolver, reject unknown schemes, and return redacted status only. Skills: Redbox Services.
- [ ] **SV-02T [POC] Test secret resolution/redaction.** Cover missing env, valid env, unknown scheme, resolver exception, and log/error inspection proving secret absence. Skills: Redbox Testing.

- [ ] **SV-03 [POC] Implement `GenerationCryptoService`.** Use AES-256-GCM with random IV, key IDs, brand/run additional authenticated data, and versioned payload envelopes. Skills: Redbox Services.
- [ ] **SV-03T [POC] Test encryption thoroughly.** Cover round trip, nondeterministic ciphertext, wrong key, wrong brand/run AAD, tampered ciphertext/tag, key rotation lookup, and no plaintext logging. Skills: Redbox Testing.

- [ ] **SV-04 [POC] Implement `GenerationProfileService` draft/version/publish lifecycle.** Validate definition schema, IDs, questions, source/target mappings, references, hashes, and immutable publication. Skills: Redbox Services, Redbox Form Config.
- [ ] **SV-04T [POC] Test profile lifecycle and invalid configurations.** Include duplicate IDs, bad pointers/expressions, conditional questions rejected in POC, no targets, excluded component, missing deployment/knowledge, cross-brand reference, stale publish, idempotent bootstrap hash, and new-draft copy. Skills: Redbox Testing, Redbox Form Config.

- [ ] **SV-05 [POC] Implement `GenerationBindingService` CRUD/validation/action matching.** Resolve published profile, source workflow/mode/role, actual source access, target-create permission, deterministic relation initial values, and relative target URL. Skills: Redbox Services, Redbox Form Config.
- [ ] **SV-05T [POC] Test action availability and launch authorization.** Cover source view versus edit, wrong role/workflow/form, disabled binding/profile, unpublished profile, target permission, cross-brand source, existing linked RDMP still allowing action, and two independent launches. Skills: Redbox Testing.

- [ ] **SV-06 [POC] Implement provider adapter types and `GenerationProviderRegistryService`.** Register installed factories during service init, expose schemas/capabilities, and reject duplicate/unknown adapters. Skills: Redbox Services.
- [ ] **SV-06T [POC] Add provider contract suite and fake adapter.** Reuse one suite for registry, fake, and later real adapters; prove provider-specific objects do not leak into domain output. Skills: Redbox Testing.

- [ ] **SV-07 [POC] Implement `GenerationModelService`.** Add connection/deployment lifecycle, capability/health test, immutable publication, secret-safe summaries, and brand/reference checks. Skills: Redbox Services.
- [ ] **SV-07T [POC] Test model service.** Cover missing secret, adapter mismatch, incompatible structured output, health failure, successful publish, model change requiring a new version, and cross-brand connection/deployment. Skills: Redbox Testing.

- [ ] **SV-08 [POC] Implement `GenerationKnowledgeService` draft/preview/publish.** Validate text/Markdown, normalise metadata, chunk deterministically, hash, store immutable versions, and preserve authority/order. Skills: Redbox Services.
- [ ] **SV-08T [POC] Test ingestion/chunking.** Pin boundaries, headings, tags, ordering, hashes, invalid media/oversize, changed-content version, identical-content idempotency, and published mutation rejection. Skills: Redbox Testing.

- [ ] **SV-09 [POC] Implement deterministic tagged retrieval.** Filter pinned versions by field tags, apply precedence and byte/chunk bounds, and issue stable evidence IDs. Skills: Redbox Services.
- [ ] **SV-09T [POC] Test retrieval.** Cover tag match/no match, precedence, total limits, effective-date handling, duplicate content, stable order, and strict brand/version isolation. Skills: Redbox Testing.

- [ ] **SV-10 [POC] Implement `GenerationSchemaService` form resolution and component matrix.** Traverse effective client form, resolve stable IDs/pointers, use form consistency projection/schema/value validation, and explicitly exclude unsupported/system controls. Skills: Redbox Services, Redbox Form Config.
- [ ] **SV-10T [POC] Test supported/excluded field matrix.** Cover text/textarea/boolean/date/radio/checkbox/dropdown/bounded vocab/group/repeatable and reject attachment/map/record selector/workspace/button/integration/identifier/hidden-uneditable targets. Skills: Redbox Testing, Redbox Form Config.

- [ ] **SV-11 [POC] Implement dynamic provider JSON Schema and local candidate validation.** Generate exact field properties/no extras, parse with response size bounds, map only after validation, verify enums/cardinality/length/date, and apply deterministic profile fallbacks. Skills: Redbox Services.
- [ ] **SV-11T [POC] Test hostile and malformed candidates.** Cover unknown/duplicate/missing fields, invalid enum/date/type/length, path injection, operation injection, HTML/script, malformed JSON, oversized response, unsupported evidence, and valid fallback. Skills: Redbox Testing.

- [ ] **SV-12 [POC] Implement `GenerationContextService`.** Reauthorize source, project allowed paths, evaluate bounded question defaults, validate reviewed answers, project target snapshot, compute revisions/hashes, and enforce context limits. Skills: Redbox Services, Redbox Form Config.
- [ ] **SV-12T [POC] Test context minimisation.** Assert excluded source/target fields never appear, corrections do not update source, bad question IDs/types fail, changed source after launch is frozen only at execute, large fields are bounded, and cross-brand/forbidden sources fail before provider use. Skills: Redbox Testing.

- [ ] **SV-13 [POC] Implement `GenerationPromptService`.** Build canonical provider-neutral messages separating platform/profile instructions from untrusted source/questions/knowledge and include exact evidence catalogue/schema. Skills: Redbox Services.
- [ ] **SV-13T [POC] Add prompt fixture/safety tests.** Snapshot canonical ordering; inject instructions through titles, abstracts, question answers, and policy text; verify no tools, excluded fields, secrets, database paths, or raw brand internals enter the request. Skills: Redbox Testing.

- [ ] **SV-14 [POC] Implement the AI SDK-backed `OpenRouterGenerationProvider`.** Add exactly pinned compatible `ai` and `@ai-sdk/openai-compatible` packages; keep SDK types inside the provider layer; use guarded fetch, resolved Bearer secret, `generateText` with `Output.object`, required-parameter routing, configured data/ZDR/fallback policy, timeout/size bounds, zero SDK retries, no tools/streaming/telemetry, and response/usage/router metadata normalisation. Skills: Redbox Services.
- [ ] **SV-14T [POC] Test the AI SDK-backed OpenRouter adapter with mocked fetch.** Cover exact outbound shape/headers, strict schema translation, success, actual model/provider, SDK warnings, 401, 404 model, 408/429, 5xx, abort timeout, oversized body, refusal/filter, malformed content, zero automatic retries, and secret/body-free logs. Run the shared adapter conformance suite. Skills: Redbox Testing.

- [ ] **SV-15 [POC] Implement `GenerationRunService` launch/get/execute/retry/cancel/expiry.** Pin published IDs, enforce actor/brand/limits, freeze encrypted input, queue by ID, and expose client-safe state/result. Skills: Redbox Services.
- [ ] **SV-15T [POC] Test run lifecycle.** Cover one success per run, failed retry, double-click, multiple runs per source, actor/brand isolation, disabled feature, retired-after-launch semantics, rate/concurrency limits, cancellation, and artifact expiry. Skills: Redbox Testing.

- [ ] **SV-16 [POC] Implement `GenerationWorkerService`.** Acquire lease, reauthorize, decrypt, retrieve, prompt, invoke, validate, persist candidate/digests/usage, heartbeat, and terminal transitions without touching records. Skills: Redbox Services.
- [ ] **SV-16T [POC] Test worker delivery/failure semantics.** Cover success, duplicate delivery, worker restart, source permission revoked, config hash mismatch, cancellation before/during provider, transient/permanent provider errors, schema/evidence failure, and assert no RecordsService create/update call. Skills: Redbox Testing.

- [ ] **SV-17 [POC] Register Agenda execute/cleanup jobs.** Configure lock lifetime/concurrency/heartbeat and safe recurring cleanup; queue payload is only brand/run IDs. Skills: Redbox Services.
- [ ] **SV-17T [POC] Test Agenda registration/enqueue.** Verify exact job names/functions/options, serialisable minimal payload, backend behaviour, terminal no-op, and cleanup schedule. Skills: Redbox Testing.

- [ ] **SV-18 [POC] Implement `GenerationProvenanceService`.** Commit completed candidate after save, verify target/source link and hashes, upsert provenance idempotently, derive display states, record review, and enforce artifact retention. Skills: Redbox Services.
- [ ] **SV-18T [POC] Test provenance service.** Cover same commit twice, different target/digest attack, wrong creator/type/form/brand, changed generated value, reviewed flag, edited/removed display state, retention zero/seven days, and artifact purge failure recovery. Skills: Redbox Testing.

- [ ] **SV-19 [POC] Implement `GenerationBootstrapService`.** Load connection -> deployment -> knowledge -> profile -> binding in deterministic order through public services; reject secrets; continue safely per invalid file. Skills: Redbox Services.
- [ ] **SV-19T [POC] Test bootstrap.** Cover missing directory, sorted order, first creation, second-run idempotency, changed content/new version, malformed file isolation, missing dependency, embedded secret rejection, and correct default brand. Skills: Redbox Testing.

- [ ] **SV-20 [POC] Wire all services and bootstrap lifecycle.** Update service barrels/lazy exports, Sails globals/types, core bootstrap call, and log namespaces. Skills: Redbox Services.
- [ ] **SV-20T [POC] Add service export/bootstrap smoke tests.** Ensure every service is lazily available, initialized after Sails exists, called in dependency order, and feature-disabled bootstrap is harmless. Skills: Redbox Testing.

- [ ] **GATE-SV-01 [POC] Run implementation review before backend integration tests.** Use Redbox Feature Implementation Review across Data Model + Services. If issues are found, write the result to `issues.json` in the project root. Skills: Redbox Feature Implementation Review.
- [ ] **GATE-SV-01A [POC, conditional] Fix every issue in `issues.json` and delete the file when complete.** Do not suppress valid findings. Skills: Redbox Services, Redbox Testing, Redbox Form Config.
- [ ] **GATE-SV-01B [POC, conditional] Re-run the implementation review.** Repeat the fix/review cycle until no actionable issues remain. Skills: Redbox Feature Implementation Review.
- [ ] **GATE-SV-02 [POC] Create Mocha model/service integration tests.** Add live Mongo/Sails coverage for indexes/TTL, bootstrap, brand isolation, state CAS, Agenda execution with fake adapter, encryption/artifacts, and provenance commit. Skills: Redbox Test Verification, Redbox Testing.
- [ ] **GATE-SV-03 [POC] Run the targeted then full Mocha integration suites; do not continue until passing.** Use mounted development commands first, then the CI-equivalent path before merge. Skills: Redbox Testing.

## 3. Webservice Controllers (REST API)

- [ ] **WS-01 [FULL] Define the complete contract-first generation route schemas.** Add `api-routes/groups/generation.ts` for profile/version, binding, connection/deployment, knowledge, run-audit, guarded-diagnostic, and purge endpoints; register/export the group. The POC intentionally has no partial admin REST API. Skills: Redbox Controllers.
- [ ] **WS-01T [FULL] Test route registry/OpenAPI output.** Verify unique paths/operation IDs, request/response schemas, branding/portal substitution, security metadata, and generated docs validation. Skills: Redbox Testing.

- [ ] **WS-02 [FULL] Scaffold `webservice/GenerationAdminController` and shared response/error handling.** Add Admin-only dispatch seams used by the complete endpoint groups, validated request extraction, optimistic-hash handling, redacted connection summaries, and content-free run summaries. Skills: Redbox Controllers, Redbox Services.
- [ ] **WS-02T [FULL] Add controller foundation unit tests.** Cover validated request extraction, brand scoping, service delegation, redaction, 400/403/404/409/422/429/5xx mapping, and `sendResp` usage. Skills: Redbox Testing.

- [ ] **WS-03 [FULL] Register webservice controller and auth.** Update controller exports/names and explicit `/:branding/:portal/api/generation(/*)` Admin rules. Skills: Redbox Controllers.
- [ ] **WS-03T [FULL] Test shim registration and authorization rules.** Verify exact controller name/action, Admin allowed, Researcher/Guest denied, and no broad rule accidentally grants diagnostics. Skills: Redbox Testing.

- [ ] **WS-04 [FULL] Implement complete profile/version REST API.** Add list/create/copy/update/validate/test/publish/retire with optimistic hashes. Skills: Redbox Controllers, Redbox Services.
- [ ] **WS-04T [FULL] Add profile REST controller/API tests.** Cover full lifecycle, stale edit, immediate Admin publish, immutable version, cross-brand access, and fixture test failures. Skills: Redbox Test Verification, Redbox Testing.

- [ ] **WS-05 [FULL] Implement complete binding REST API.** Add CRUD/validate and disable-instead-of-delete rules. Skills: Redbox Controllers, Redbox Services.
- [ ] **WS-05T [FULL] Add binding REST tests.** Cover source/target/profile filters, invalid relation mapping, used binding deletion, and cross-brand IDs. Skills: Redbox Testing.

- [ ] **WS-06 [FULL] Implement connection/deployment REST API.** Add redacted CRUD, test, publish, retire, capability/data-policy summaries. Skills: Redbox Controllers, Redbox Services.
- [ ] **WS-06T [FULL] Add model REST tests.** Assert secrets never return, model changes version, unsupported capabilities block publish, and provider errors are safe. Skills: Redbox Testing.

- [ ] **WS-07 [FULL] Implement knowledge REST API.** Add collection/version/documents, preview, test retrieval, publish/retire/reindex. Skills: Redbox Controllers, Redbox Services.
- [ ] **WS-07T [FULL] Add knowledge REST tests.** Cover MIME/size/authority/tags, preview no mutation, immutable publish, retrieval ordering, and brand isolation. Skills: Redbox Testing.

- [ ] **WS-08 [FULL] Implement admin run/diagnostic API.** Add non-content list/detail, guarded decrypt, audit, immediate purge. Skills: Redbox Controllers, Redbox Services.
- [ ] **WS-08T [FULL] Add diagnostic API tests.** Cover flag disabled, expired/missing artifact, Admin brand scope, safe audit, purge idempotency, and no prompt in list/detail. Skills: Redbox Testing.

## 4. Ajax Controllers (Controllers)

- [ ] **AJ-01 [POC] Implement `GenerationController.launch`.** Validate binding/source input, derive brand/user, delegate, and return `201` run ID/relative URL. Skills: Redbox Controllers, Redbox Services.
- [ ] **AJ-01T [POC] Test launch controller.** Cover success, malformed payload, action unavailable, source forbidden, feature disabled, cross-brand OID, and safe error response. Skills: Redbox Testing.

- [ ] **AJ-02 [POC] Implement run get/execute/cancel actions.** Return only actor-safe question/status/result data; return `202`/`Retry-After` for queued work and `409` after completion. Skills: Redbox Controllers, Redbox Services.
- [ ] **AJ-02T [POC] Test run actions.** Cover draft defaults, queued/running/completed/failed states, retryable failure, duplicate execute, wrong actor/brand, cancel idempotency, and artifact expiry. Skills: Redbox Testing.

- [ ] **AJ-03 [POC] Implement commit/provenance/review actions.** Verify controller input and delegate all record/hash authorization to services. Skills: Redbox Controllers, Redbox Services.
- [ ] **AJ-03T [POC] Test commit/provenance/review actions.** Cover valid/idempotent commit, wrong digest/OID, record access, review actor, safe 4xx/5xx, and compact response shape. Skills: Redbox Testing.

- [ ] **AJ-04 [POC] Register AJAX controller, routes, auth, and CSRF behaviour.** Update controller exports/names, `routes.config.ts`, `auth.config.ts`, and log namespaces. Skills: Redbox Controllers.
- [ ] **AJ-04T [POC] Test route/auth/shim mapping.** Verify Researcher/Librarian/Admin rules, Guest denial, CSRF enabled, exact actions, and no conflict with `/api/generation`. Skills: Redbox Testing.

- [ ] **AJ-05 [POC] Extend `RecordController.getForm()` runtime metadata.** Resolve source runtime actions and authorised target generation sessions after effective-form/access construction; keep `FormConfigFrame` unchanged. Skills: Redbox Controllers, Redbox Services, Redbox Form Config.
- [ ] **AJ-05T [POC] Test form response integration.** Cover source view/edit action, no match, target new form auto-open/initial link, invalid run/user/brand/type, disabled feature, and deep equality of the unchanged form config data. Skills: Redbox Testing, Redbox Form Config.

- [ ] **GATE-CTL-01 [POC] Run implementation review before API integration tests.** Use Redbox Feature Implementation Review across the implemented Milestone A AJAX controller, routes, auth, and form response integration; when Milestone B is implemented, include the full webservice controller and contract routes in the same gate. If issues are found, write the result to `issues.json` in the project root. Skills: Redbox Feature Implementation Review.
- [ ] **GATE-CTL-01A [POC, conditional] Fix every issue in `issues.json` and delete the file when complete.** Skills: Redbox Controllers, Redbox Services, Redbox Testing.
- [ ] **GATE-CTL-01B [POC, conditional] Re-run the implementation review.** Repeat until no actionable issues remain. Skills: Redbox Feature Implementation Review.
- [ ] **GATE-CTL-02 [POC] Create Bruno AJAX tests.** Add authenticated launch/get/execute/cancel/commit/provenance plus unauthorised, CSRF, malformed, duplicate, and cross-brand cases. Add REST Bruno cases with the `[FULL]` webservice endpoints, not as a POC prerequisite. Skills: Redbox Test Verification, Redbox Testing.
- [ ] **GATE-CTL-03 [POC] Run targeted then full Bruno suites; do not continue until passing.** Use general/AJAX and REST collections with mounted code, then CI-equivalent runs before merge. Skills: Redbox Testing.

## 5. Angular App(s)

- [ ] **NG-01 [POC] Extend typed form event union/factories.** Add generic runtime-action and generation lifecycle events plus optional field origin/correlation ID, preserving existing event consumers. Skills: Redbox Angular Apps.
- [ ] **NG-01T [POC] Test event bus additions.** Cover publish/select/scoped behaviour, typed factories, unchanged legacy field events, correlation, and no event persistence. Skills: Redbox Testing.

- [ ] **NG-02 [POC] Add generation NgRx actions/reducer/selectors.** Model available actions, session, questions/answers, run phase/status, polling, candidate, pending provenance, conflicts, review, commit, and errors. Skills: Redbox Angular Apps.
- [ ] **NG-02T [POC] Test every reducer transition/selector.** Include initial/reset, duplicate launch/execute suppression, failure retry, completion lockout, panel close/reopen, review, save commit, and destroyed form. Skills: Redbox Testing.

- [ ] **NG-03 [POC] Implement `GenerationApiService`.** Extend `HttpClientService`, initialise CSRF, use branded base URL/http context, and expose typed launch/run/execute/cancel/commit/provenance/review methods. Skills: Redbox Angular Services.
- [ ] **NG-03T [POC] Add Angular HTTP tests.** Assert method/URL/body/query/context, `Retry-After` handling, response typing, and safe error propagation for every method. Skills: Redbox Testing.

- [ ] **NG-03A [POC] Forward the allowlisted target-form run context.** Extend `FormService.downloadFormComponents()`/`getFormConfig()` with a typed runtime-context argument. Have `FormComponent` pass only a single valid `generationRunId` from its parsed page parameters; never forward the full parameter map. Preserve the request parameter in the existing JSONata query source, but confer no client-side authority. Skills: Redbox Angular Apps, Redbox Angular Services.
- [ ] **NG-03AT [POC] Test form-definition context transport.** Assert a valid run ID is encoded once on `/record/form/...`; missing, empty, boolean, array, malformed, and oversized values are omitted; unrelated page parameters are never forwarded; and ordinary create/edit form URLs remain byte-for-byte equivalent apart from the existing timestamp. Skills: Redbox Testing.

- [ ] **NG-04 [POC] Implement generation effects and event-bus adapter.** Launch/navigate, initialise session, execute, poll with bounded backoff, cancel, publish phases/results/errors, apply patch, load/review provenance, and commit after create save success. Skills: Redbox Angular Apps, Redbox Angular Services.
- [ ] **NG-04T [POC] Test effects.** Cover async ordering, polling stop conditions, destroy/logout cleanup, duplicate suppression, panel reopen, patch only after completion, failure retry, no retry after success, save success commit, commit retry, and no automatic save. Skills: Redbox Testing.

- [ ] **NG-05 [POC] Implement `FormRuntimeActionsComponent`.** Render server-supplied actions in the form root, publish the generic action event, disable during launch, and restore focus on failure. Skills: Redbox Angular Apps.
- [ ] **NG-05T [POC] Add component tests.** Cover no actions, ordered actions, translation/icon/help, click event, disabled/busy, keyboard activation, and no profile/provider knowledge in the component. Skills: Redbox Testing.

- [ ] **NG-06 [POC] Implement accessible `GenerationSidePanelComponent`.** Add five prefilled editable questions, submit, progress, close/cancel, retry-on-failure, completion/flag summary, and one-success lockout. Skills: Redbox Angular Apps.
- [ ] **NG-06T [POC] Add panel tests.** Cover defaults/editing, no conditional branching, required validation, progress labels/live region, focus trap/restore, close before/during run, failure retry, completed no rerun, and flagged-result navigation. Skills: Redbox Testing.

- [ ] **NG-07 [POC] Implement `GenerationPatchApplierService`.** Resolve by component lineage, three-way compare, supported type application, silent batch update, dirty/not-touched state, form revalidation, exact normal events, and aggregate completion. Skills: Redbox Angular Apps, Redbox Form Config.
- [ ] **NG-07T [POC] Test patch application matrix.** Cover each POC component, group/repeatable, empty target, target changed while running, disabled/missing target, unknown field/path, enum mismatch, event count/order/origin, dirty/touched, and validation. Skills: Redbox Testing, Redbox Form Config.

- [ ] **NG-08 [POC] Implement pending/persisted provenance store and badges.** Integrate once at the wrapper level by lineage path; show generated/edited/removed/review-required, expandable rationale/evidence, and mark reviewed without disabling controls or blocking normal POC save solely because an advisory flag is unresolved. Skills: Redbox Angular Apps.
- [ ] **NG-08T [POC] Test provenance UI/state.** Cover pre-save, reload, unchanged hash, edited/removal, explicit review, access/no review button, keyboard/screen-reader text, and no raw evidence body/prompt/model internals. Skills: Redbox Testing.

- [ ] **NG-09 [POC] Wire form module/root/styles/translations.** Register components/services/state/effects, consume typed form response metadata, auto-open authorised sessions, and preserve normal form loading/saving. Skills: Redbox Angular Apps.
- [ ] **NG-09T [POC] Add form integration tests.** Exercise runtime action -> launch, target metadata -> panel, fake completion -> patch, edit/review, normal save event -> commit, and reset on new form. Assert existing save/behaviour/server-sync tests still pass. Skills: Redbox Testing.

- [ ] **NG-10 [POC] Verify behaviour/event interoperability.** Ensure behaviours may observe generic lifecycle events where supported, generation-emitted field changes execute downstream behaviour exactly once, and no event can trigger a second generation without a manual runtime action. Skills: Redbox Angular Apps, Redbox Form Config.
- [ ] **NG-10T [POC] Add loop/event-storm regression tests.** Count generation, field, behaviour, validation, and save events under a populated multi-field patch. Skills: Redbox Testing.

- [ ] **NG-11 [FULL] Scaffold embedded `admin-generation` Angular app.** Add Angular project/output, no Angular Router, internal section state, EJS mount, and API service. Skills: Redbox Angular Apps, Redbox Angular Services.
- [ ] **NG-11T [FULL] Test scaffold and EJS asset contract.** Verify bootstrap component, hashed asset names, base href, CSRF API init, and no Angular router dependency. Skills: Redbox Testing.

- [ ] **NG-12 [FULL] Build Profiles/Bindings management screens.** Add progressive editors, form-field pickers, advanced expression/prompt view, fixture tests, version history, validate/publish/retire. Skills: Redbox Angular Apps, Redbox Angular Services, Redbox Form Config.
- [ ] **NG-12T [FULL] Add component/service tests for profile/binding workflows.** Cover simple and advanced editors, optimistic conflict, invalid target, Admin publish with no second approval, and immutable version. Skills: Redbox Testing.

- [ ] **NG-13 [FULL] Build Models/Knowledge/Runs management screens.** Add redacted connections, schema-driven adapter settings, deployment capability tests, document/chunk/retrieval preview, run audit, guarded diagnostics, and purge. Skills: Redbox Angular Apps, Redbox Angular Services.
- [ ] **NG-13T [FULL] Add component/service tests.** Cover secret write-only behaviour, health failures, data-policy display, knowledge preview/publish, expired diagnostics, and purge. Skills: Redbox Testing.

## 6. Additional Views

- [ ] **VIEW-01 [POC] Keep researcher generation inside the existing record form view.** Mount toolbar/panel through the form Angular root; do not add a new researcher EJS route or SPA navigation. Skills: Redbox Angular Apps.
- [ ] **VIEW-01T [POC] Add render regression test.** Verify record edit/view EJS still loads the same hashed form bundle and generation works only through runtime metadata. Skills: Redbox Testing.

- [ ] **VIEW-02 [POC] Add representative demo forms.** Create `researchActivity-1.0-draft.ts` and `demoRdmp-1.0-draft.ts` in `redbox-hook-dev`, export them, and use ordinary supported components/validation/translations. Skills: Redbox Form Config.
- [ ] **VIEW-02T [POC] Add form config visitor/consistency tests.** Build client configs in create/view/edit modes, validate defaults/schema, verify stable target pointers/component classes, and assert no generation mapping property exists in either form. Skills: Redbox Testing, Redbox Form Config.

- [ ] **VIEW-03 [POC] Add synthetic Research Activity bootstrap records.** Include human-participant live demo and non-sensitive evaluation fixture with stable OIDs and demo authorization. Skills: Redbox Form Config.
- [ ] **VIEW-03T [POC] Test bootstrap records.** Verify idempotent creation, record type/workflow/form linkage, expected metadata paths, synthetic markers, and absence of real personal/institutional data. Skills: Redbox Testing.

- [ ] **VIEW-04 [POC] Add fictional knowledge/profile/binding/deployment bootstrap resources.** Use stable keys, replaceable model ID, environment secret reference, explicit field allowlist, five questions, tagged policies, and source relationship mapping. Skills: Redbox Services, Redbox Form Config.
- [ ] **VIEW-04T [POC] Add bootstrap fixture validation test.** Load every manifest through public services, verify publication/hash references, exact target fields, excluded components, five non-branching defaults, fictional policy labels, and second-run policy. Skills: Redbox Testing.

- [ ] **VIEW-05 [FULL] Add `views/default/default/admin/generation.ejs`.** Include admin sidebar, CSP nonce, loading fallback, component tag, and hashed assets. Skills: Redbox Angular Apps.
- [ ] **VIEW-05T [FULL] Add controller/view render tests.** Assert correct view/locals/title, Admin access, bundle hashes, and no server-injected secrets/config data. Skills: Redbox Testing.

## 7. Navigation Configuration

- [ ] **NAV-01 [POC] Return Research Activity action through runtime metadata.** Ensure action ordering/label/help/icon comes from binding and is absent when feature/binding/access is unavailable. Skills: Redbox Services, Redbox Form Config.
- [ ] **NAV-01T [POC] Add runtime navigation tests.** Verify action remains for an activity with an existing RDMP, two clicks create distinct intents, wrong workflow/brand/role hides it, and client-supplied action IDs cannot bypass service checks. Skills: Redbox Testing.

- [ ] **NAV-02 [FULL] Add Admin Generation sidebar item and page route.** Put it in the chosen Admin section with brand-overridable order/visibility and Admin-only rules. Skills: Redbox Angular Apps, Redbox Controllers.
- [ ] **NAV-02T [FULL] Test menu/route role gating.** Admin sees/opens it; Researcher/Guest/Librarian behaviour matches explicit rules; brand override can hide/reorder without exposing API access. Skills: Redbox Testing.

## 8. POC end-to-end verification and release gate

- [ ] **E2E-01 [POC] Add deterministic fake-provider POC scenario.** Seed expected candidate outputs for both Research Activity fixtures without prompt substring hacks. Skills: Redbox Services, Redbox Testing.
- [ ] **E2E-01T [POC] Run browser happy path.** Log in, open source, launch, inspect five defaults, generate, observe four phases, verify constrained/narrative fields, review flag, edit/review, save, reload provenance. Skills: Web Interface Verification, redbox-dev-login-browser.

- [ ] **E2E-02 [POC] Verify multiple-plan and one-run semantics.** Launch two separate new RDMPs from the same source while refusing a second success in each intent. Skills: Web Interface Verification.
- [ ] **E2E-02T [POC] Automate/assert multiplicity.** Confirm distinct run/target OIDs, preserved action, no duplicate provider job from double-click, and failed retry only. Skills: Web Interface Verification, Redbox Testing.

- [ ] **E2E-03 [POC] Verify accessibility and responsive desktop presentation.** Exercise keyboard-only panel use, focus trap/restore, labels/help, live progress, review text/icon, error recovery, and common presentation viewport. Skills: Web Interface Verification.
- [ ] **E2E-03T [POC] Capture verification evidence.** Store test scenario/results or approved screenshots/recording according to repository practice, with only synthetic data. Skills: Web Interface Verification.

- [ ] **E2E-04 [POC] Add opt-in live OpenRouter smoke test.** Guard with `RUN_LIVE_GENERATION_TESTS=true`, use synthetic data, capability-test selected deployment, and suppress content output. Skills: Redbox Testing.
- [ ] **E2E-04T [POC] Execute live smoke test during final model selection.** Record requested/actual model/provider, date, schema capability, status, tokens/latency, and safe outcome; update only deployment bootstrap configuration. Skills: Redbox Testing.

- [ ] **E2E-05 [POC] Audit privacy/security failure cases.** Attempt cross-brand IDs, wrong actor, revoked source access, malicious source/policy instructions, output paths/operations, generic endpoint tampering, diagnostic disabled, and log capture. Skills: Redbox Feature Implementation Review, Redbox Testing.
- [ ] **E2E-05T [POC] Verify all attacks fail closed.** Confirm no provider call where authorization/context fails, no target mutation, no secret/content logs, and safe status codes. Skills: Redbox Testing.

- [ ] **GATE-FINAL-01 [POC] Run final implementation review before full suites.** Use Redbox Feature Implementation Review across the complete Milestone A. If issues are found, write the result to `issues.json` in the project root. Skills: Redbox Feature Implementation Review.
- [ ] **GATE-FINAL-01A [POC, conditional] Fix every issue in `issues.json` and delete the file when complete.** Skills: all implementation-relevant ReDBox skills.
- [ ] **GATE-FINAL-01B [POC, conditional] Re-run the implementation review.** Repeat until no actionable issues remain. Skills: Redbox Feature Implementation Review.
- [ ] **GATE-FINAL-02 [POC] Run both required integration suites again.** Run the full Mocha backend suite and all relevant Bruno REST/AJAX suites; do not declare complete until passing. Skills: Redbox Testing.
- [ ] **GATE-FINAL-03 [POC] Run complete package/frontend verification.** Compile all changed packages/apps, run core/sails-ng-common/form Angular tests, API route validation/OpenAPI generation, lint, and format checks. Skills: Redbox Testing.
- [ ] **GATE-FINAL-04 [POC] Validate every POC acceptance criterion.** Produce an AC-POC-001–020 evidence table linking automated test, browser scenario, or documented manual check to each criterion. Skills: Redbox Test Verification, Web Interface Verification.
- [ ] **GATE-FINAL-05 [POC] Rehearse presentation and contingency.** Verify real OpenRouter and deterministic fake modes, queue/secret/config startup, synthetic records, citations, review/edit/save/reload, cleanup, and recovery from provider failure. Skills: Web Interface Verification, Redbox Testing.

## 9. Post-POC provider and lifecycle tasks

- [ ] **FULL-PRV-01 [FULL] Implement generic OpenAI-compatible provider support.** Use `@ai-sdk/openai-compatible`; apply endpoint outbound policy, schema/capability probing, custom auth references, strict output where supported, and provider-neutral normalisation. Skills: Redbox Services.
- [ ] **FULL-PRV-01T [FULL] Run common provider contract/security suite.** Include SSRF/private/redirect/DNS cases and servers that silently ignore parameters. Skills: Redbox Testing.

- [ ] **FULL-PRV-02 [FULL] Implement Google Vertex AI/Gemini provider support.** Confirm whether the client needs Vertex model invocation or the separate Gemini Enterprise API. For Vertex, add exactly pinned `@ai-sdk/google-vertex`; support ADC/workload identity, project/location and publisher/custom models, compatible structured output, safety settings, timeouts, no tools/model-side retrieval, and usage/error mapping. Treat Gemini Enterprise search/agent APIs as a separate integration. Skills: Redbox Services.
- [ ] **FULL-PRV-02T [FULL] Run Google provider contract tests and an opt-in Vertex live test.** Use mocked transport in CI and require no Google Cloud credentials in standard suites. Skills: Redbox Testing.

- [ ] **FULL-PRV-03 [FULL] Implement AWS Bedrock provider support.** Add exactly pinned `@ai-sdk/amazon-bedrock` and required credential packages; support the default credential chain, assume role/workload identity, region/model configuration, compatible structured output, timeouts, no tools, and usage/error mapping. Skills: Redbox Services.
- [ ] **FULL-PRV-03T [FULL] Run Bedrock provider contract tests and an opt-in live test.** Use mocked transport/LocalStack where applicable and require no AWS credentials in standard suites. Skills: Redbox Testing.

- [ ] **FULL-KNW-01 [FULL] Add installed retrieval-adapter registry/vector option.** Enforce brand-specific namespaces, immutable collection versions, stable evidence IDs, reindex jobs, and evaluation fixtures. Skills: Redbox Services.
- [ ] **FULL-KNW-01T [FULL] Test cross-brand index isolation and retrieval reproducibility.** Include reindex failure/rollback and expired effective-date content. Skills: Redbox Testing.

- [ ] **FULL-RUN-01 [FULL] Add saved-record regeneration/review.** Introduce explicitly configured replace/append/merge policies and three-way candidate review; preserve fill-only defaults. Skills: Redbox Angular Apps, Redbox Services, Redbox Form Config.
- [ ] **FULL-RUN-01T [FULL] Test all merge/conflict cases.** Prove no silent overwrite under concurrent user edits, repeatable reorder, stale source, hidden/disabled target, or server sync. Skills: Redbox Testing.

## 10. Skill Gaps

The current skills cover ReDBox models/services/controllers/form configuration/embedded Angular/testing and browser verification. Two specialist gaps remain:

1. **Suggested skill: `redbox-generation-provider-development`.** Define the ReDBox provider adapter contract, AI SDK boundary, capability probing, structured-output normalisation, timeout/retry/error rules, secret redaction, outbound endpoint security, and shared conformance tests for OpenRouter/OpenAI-compatible/Google Vertex/Bedrock.
2. **Suggested skill: `redbox-secure-transient-artifacts`.** Define application-level envelope encryption, key references/rotation, TTL/native Mongo index verification, diagnostic retention/purge, content-safe logs, and threat-model tests.

These gaps do not block implementation, but the corresponding work should receive explicit security review rather than relying only on general service guidance.
