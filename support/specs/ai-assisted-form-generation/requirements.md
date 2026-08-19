# AI-assisted form generation requirements and decisions

Status: proposed

Date: 2026-08-19

Audience: ReDBox product, engineering, institutional administrators, and POC presenters

## 1. Outcome

ReDBox will provide a generic, brand-isolated capability that uses a configured language-model provider to propose values for an explicit subset of fields in a ReDBox form. It will combine:

- metadata from authorised ReDBox source records;
- the current unsaved target-form state;
- a short, profile-defined context review;
- approved, versioned institutional knowledge; and
- a published Generation Profile that controls prompts, mappings, target fields, and safety rules.

The first customer-facing POC demonstrates a researcher starting from a synthetic Research Activity, creating a linked RDMP, reviewing pre-populated context, generating form-aware content through OpenRouter, seeing validated values populate the form, reviewing one deliberately flagged result, editing the result, saving through the normal form lifecycle, and reopening the saved RDMP with lightweight provenance intact.

The feature is not an RDMP generator baked into the form definition. RDMP generation is the first configured use of a general form-generation subsystem.

## 2. Product principles

1. **Form-aware, not document-first.** The result is a validated patch against specific ReDBox controls, not Markdown that is parsed into a record.
2. **Configuration outside normal form definitions.** Generation Profiles and Generation Bindings are database entities. Existing institutional forms do not acquire AI-specific field annotations.
3. **Explicit target allowlist.** Only selected, supported fields are described to the model or accepted from it. Everything else is completely excluded.
4. **The model never writes records.** It returns a structured candidate. ReDBox validates, maps, and applies it to the in-browser form; the researcher saves normally.
5. **The form lifecycle remains authoritative.** Existing validation, workflow, permissions, server-side hooks, identifiers, derived fields, and audit behaviour continue to operate normally.
6. **Researcher work is protected.** Empty fields may be populated. Existing values are preserved by default. The POC permits only one successful run for each new target-form creation intent.
7. **Grounding is inspectable.** Generated fields carry compact provenance and can expose the project facts or approved guidance used. Unsupported conclusions are flagged rather than disguised as facts.
8. **Providers are replaceable.** ReDBox keeps a domain adapter and capability contract while using the Vercel AI SDK for model invocation. A Generation Profile is separated from OpenRouter, Google Vertex AI/Gemini, AWS Bedrock, or another supported endpoint.
9. **Brand isolation is mandatory.** Profiles, connections, deployments, knowledge, runs, diagnostics, caches, and provenance are scoped by the authenticated brand.
10. **Data minimisation is the default.** The prompt contains only data explicitly authorised by the published profile. The model has no tools, browsing, database access, conversation history, or credentials.

## 3. Agreed decision ledger

| Area | Decision |
|---|---|
| Source data | Research Master, IRMA, Pure, and similar RIMS data are ingested as ordinary ReDBox Research Activity records. Generation reads the stored record rather than calling those products directly. |
| Initial source | A representative synthetic Research Activity containing all relevant project, data, access, storage, consent, sharing, and retention facts. |
| Initial target | A representative demonstration RDMP form, not a customer-specific production form. |
| Entry point | A `Create data management plan` runtime action on the Research Activity creates a new generation intent and opens a new linked RDMP form with the guided side panel. |
| Multiplicity | A Research Activity may be used to create multiple independent RDMPs. The system must not hide the source action merely because a linked RDMP already exists. |
| Run count | One successful generation per new RDMP creation intent in the POC. A failed attempt may be retried. A completed attempt cannot be run again. |
| Questionnaire | Five fixed, non-branching context fields. They are pre-populated from the Research Activity and remain editable for this run. No additional manual answer is required. Corrections do not write back to the Research Activity. |
| Generated sections | Data characteristics; collection and documentation; storage and security; access and responsibilities; sharing and preservation; retention and disposal. |
| Field mix | Both constrained controls and narrative fields, proving schema-aware population rather than document pasting. |
| Excluded targets | Attachments, maps, record selectors, workspace selectors, buttons, integration controls, identifiers, timestamps, workflow state, checksums, and other system-owned fields. |
| Result application | Valid results populate the form. Controls are marked dirty and participate in ordinary validation/save. One intentionally uncertain sharing result is populated with a conservative, profile-defined fallback and flagged for review. |
| Researcher control | The researcher may edit every generated result. A deliberate edit or `Mark reviewed` action clears the visible review flag while retaining original provenance. The flag is advisory in the POC and does not itself block normal form saving. |
| Re-run behaviour | Not present in the POC. The completed generation action disappears for that creation intent. |
| Provenance | Show a compact `AI generated` marker with expandable rationale and source references. Persist lightweight field provenance so it survives save/reload. A later edit displays `AI-assisted, edited`. |
| Progress | Show `Preparing context`, `Generating`, `Validating`, and `Populating form`. Do not stream partial model output into fields. |
| Triggering | Manual researcher action is the default. The capability participates in the typed form action/event system and is not automatically retriggered by its own field changes. |
| Form configuration | Do not encode the profile or AI mappings in institutional form configuration. Runtime actions and generation sessions are resolved from Generation Bindings. Ordinary form components may add local notices if required. |
| Administration | The full feature provides admin screens similar to vocabulary management. For the POC, profiles, bindings, deployments, connections, and knowledge are bootstrap-seeded persisted entities. |
| Publishing authority | An Admin may draft, test, publish, and retire configuration. No additional approval role or workflow is required. Published versions are immutable. |
| Provider | The POC calls OpenRouter. The exact model is deliberately selected near completion and stored as deployment configuration, not hard-coded. |
| Provider extensibility | The architecture uses the Vercel AI SDK behind installed ReDBox adapters and supports OpenRouter initially, followed by Google Vertex AI/Gemini, AWS Bedrock, and generic OpenAI-compatible protocols. Provider support is capability-tested rather than assumed from an SDK/provider name. |
| Credentials | Credentials and billing arrangements are provider-dependent. Database records contain a secret reference, never a secret value. The POC resolves an OpenRouter API key from environment/secret configuration. |
| Model tools | None. ReDBox constructs the prompt and the model returns a structured response. Retrieval and all data access are deterministic server responsibilities. |
| Knowledge | A fictional, approved policy pack for data classification, storage, retention, and sharing. No arbitrary web retrieval. |
| Missing evidence | Flag the affected result. A researcher may resolve it by editing or explicitly marking the field reviewed. |
| Retention | Keep durable non-content audit metadata. Raw prompts, source snapshots, retrieved text, raw responses, and pending patches are short-lived encrypted diagnostics, configurable down to zero retention. Default proposal: seven days; hard maximum: thirty days. |
| Learning from edits | Never use researcher corrections for training, prompt optimisation, analytics, or example collection. Use explicit admin-authored fixtures for evaluation. |
| SaaS | Enforce brand isolation in every query, queue job, cache key, index, diagnostic, and secret reference. Never accept the brand from request payloads. |
| Disclosure | The POC adds no hard-coded external-AI notice. Institutions can add notices with existing form components. Demo data is synthetic. |
| Delivery location | The capability is implemented in core, not as a hook. Development-only demo forms and records remain in `redbox-hook-dev`/development resources. |

## 4. Personas

### 4.1 Researcher

The researcher can view a Research Activity, create a new RDMP from it, verify the context that will be used, request generation, understand progress and failure, inspect flagged content and provenance, edit populated controls, and save through the normal lifecycle.

The researcher cannot change the provider, prompt, target allowlist, or approved knowledge and cannot use generation to read or write data beyond their existing permissions.

### 4.2 Brand administrator

In the complete feature, a brand administrator manages Generation Profiles, bindings, model connections/deployments, approved knowledge, fixture tests, and short-lived diagnostic access. The POC represents these configurations as persisted bootstrap data and does not require the management UI.

An administrator's authority ends at the current brand. Publishing is immediate and does not require a second approver.

### 4.3 Platform operator

The operator installs supported provider adapters, supplies secret-resolution mechanisms, constrains outbound endpoints, configures diagnostic encryption/retention, and applies database indexes. Brand administrators configure only installed capabilities.

## 5. Researcher workflows

### 5.1 Start a plan

1. The researcher opens an authorised Research Activity.
2. The form response contains a server-resolved `Create data management plan` runtime action because a published binding matches the brand, source record type, form mode, role, and workflow.
3. Selecting the action asks ReDBox to create a generation intent. The server rechecks source view access and target-create permission.
4. The server returns a URL for a new demonstration RDMP carrying only the opaque run/intent identifier.
5. The target form loads through the normal ReDBox route. Runtime context deterministically links the source activity and opens the generation side panel.

### 5.2 Review context and generate

1. The panel displays five pre-populated context fields derived from allowlisted Research Activity paths.
2. The researcher may correct those values for this run. The source Research Activity is not modified.
3. Selecting `Generate plan` submits the reviewed context and the current target-form snapshot.
4. The server freezes authorised source data, form state, configuration versions, and retrieved approved knowledge.
5. A background job calls the selected OpenRouter deployment with strict structured output.
6. The UI polls the run and shows bounded progress states. It never renders partial model output.

### 5.3 Validate and populate

1. ReDBox parses the structured response and rejects unknown fields, invalid evidence references, unsupported types, invalid vocabulary values, excess lengths, and profile violations.
2. Stable Generation Profile field IDs are mapped to current target-form controls.
3. A client-side three-way check compares the run snapshot, candidate, and current form value.
4. Valid values are applied silently as a batch, then exactly one normal field-change event is emitted for each changed control.
5. Generated controls become dirty and the complete form is revalidated.
6. Provenance markers appear beside generated fields. The sharing recommendation uses a conservative configured fallback and a visible `Review required` state because participant-consent conditions are incomplete.

### 5.4 Review, edit, and save

1. The researcher edits any generated value or marks the flagged result reviewed.
2. Edits are ordinary form edits. No edit is sent back to the provider or captured as training/evaluation data.
3. The researcher saves through the existing `form.save.requested` lifecycle.
4. On `form.save.success`, a generation effect commits the one-time generation receipt against the newly created record.
5. The server verifies brand, actor, target record, candidate hashes, and saved values before storing field provenance.
6. If provenance commit temporarily fails, the saved RDMP remains valid and the client retries the idempotent commit; the record save is never rolled back.

### 5.5 Reopen

1. The form loads normally.
2. The client retrieves lightweight provenance for the authorised record.
3. Unchanged values display `AI generated`; values whose current hash differs from the generated hash display `AI-assisted, edited`.
4. Raw prompts and responses are not required to render provenance and may already have expired.

## 6. Functional requirements

### 6.1 Configuration and versioning

- **FR-CFG-001** Generation Profiles, versions, bindings, model connections, model deployments, knowledge collections, and knowledge versions must be persisted and brand-scoped.
- **FR-CFG-002** A published Generation Profile version must be immutable. Editing it creates a new draft version.
- **FR-CFG-003** A run must pin the exact profile version, model deployment, knowledge versions, and binding used.
- **FR-CFG-004** Publishing must validate every target path against the referenced target form and reject unsupported or system-owned components.
- **FR-CFG-005** Publishing must reject source mappings, question mappings, or target paths outside the profile's explicit allowlists.
- **FR-CFG-006** The POC bootstrap loader must be deterministic, idempotent, and fail individual files without preventing Sails lift.
- **FR-CFG-007** Bootstrap connection data may contain a secret reference but must reject embedded secret values.
- **FR-CFG-008** The complete admin UI must offer a simple default editor and an advanced view for technical users.
- **FR-CFG-009** Admin fixture tests must be explicit synthetic cases; production researcher edits must never become fixtures automatically.

### 6.2 Runtime actions and lifecycle

- **FR-ACT-001** Runtime actions must be resolved by the server from published bindings and returned separately from the form definition.
- **FR-ACT-002** Action visibility must consider brand, user roles, record access, workflow, mode, source type, and target-create permission.
- **FR-ACT-003** The server must reauthorize every launch and run operation even if the client already displayed the action.
- **FR-ACT-004** The Research Activity action must remain available when other linked RDMPs exist.
- **FR-ACT-005** Each action selection creates an independent intent so multiple RDMPs can originate from the same Research Activity.
- **FR-ACT-006** A generation intent may have multiple failed provider attempts but only one successful completion.
- **FR-ACT-007** Generation must publish typed lifecycle events on the form event bus and update NgRx state through effects.
- **FR-ACT-008** Generation-produced field events must not retrigger generation.
- **FR-ACT-009** Target record creation and all later edits must use the normal ReDBox form save lifecycle.

### 6.3 Context and prompting

- **FR-CTX-001** Only profile-authorised fields from records the user may view may enter the run context.
- **FR-CTX-002** The run must store hashes/revision descriptors for every source and the starting target-form snapshot.
- **FR-CTX-003** Question defaults may be mapped from source data, but edits apply only to the run.
- **FR-CTX-004** The POC must present five fixed questions with no conditional branching.
- **FR-CTX-005** Source content and knowledge content must be marked as untrusted data in the prompt and kept distinct from system instructions.
- **FR-CTX-006** Prompt building must impose deterministic per-field, per-document, and total context limits.
- **FR-CTX-007** The prompt must not contain target definitions, source fields, hidden form values, credentials, or diagnostic data outside the profile allowlists.

### 6.4 Knowledge grounding

- **FR-KNW-001** Knowledge is supplied only from published, brand-scoped collection versions selected by the profile.
- **FR-KNW-002** The POC uses deterministic tag-based retrieval over a small fictional policy pack; the retrieval interface must permit later vector or external index adapters.
- **FR-KNW-003** Every knowledge chunk must have a stable identifier, document hash, authority, effective-date metadata, and classification.
- **FR-KNW-004** The model may cite only source/evidence IDs supplied in the request.
- **FR-KNW-005** The server must verify citations and derive grounding state; it must not trust a model-provided confidence or review flag.
- **FR-KNW-006** Binding requirements outrank institutional policy, approved service guidance, funder guidance, examples, and model inference in that order.
- **FR-KNW-007** The model has no web or retrieval tools. ReDBox performs retrieval before invocation.

### 6.5 Provider execution

- **FR-PRV-001** ReDBox provider adapters expose configuration schema, secret schema, capabilities, health check, invocation, timeout/cancellation, and usage metadata. They use Vercel AI SDK language models internally but do not expose SDK types outside the provider layer.
- **FR-PRV-002** The POC implements the OpenRouter adapter with the Vercel AI SDK core and OpenAI-compatible provider, using OpenRouter's chat-completions endpoint and strict JSON Schema response format.
- **FR-PRV-003** The selected OpenRouter model slug is deployment configuration and may be changed before the demo without code changes.
- **FR-PRV-004** Execution must require structured-output support and reject a deployment that cannot meet required profile capabilities.
- **FR-PRV-005** OpenRouter requests must set provider routing controls that require requested parameters. Data-collection/ZDR/fallback controls are explicit deployment policy, not implicit defaults hidden in code.
- **FR-PRV-006** ReDBox must locally parse and validate every response even when a provider claims strict schema enforcement.
- **FR-PRV-007** The durable run audit records requested and actual model/provider identifiers when available.
- **FR-PRV-008** The POC must not transparently switch models after a request starts. Transient retries use the same deployment.
- **FR-PRV-009** No provider adapter may expose tools to the model for this feature.
- **FR-PRV-010** AI SDK automatic retries, provider fallback, tools, and telemetry are disabled for generation runs. ReDBox owns retry, timeout, audit, and deployment-selection policy.

### 6.6 Candidate validation and application

- **FR-PAT-001** A candidate uses stable profile field IDs. Model output never contains writable ReDBox paths.
- **FR-PAT-002** The server maps stable IDs to allowlisted paths only after parsing.
- **FR-PAT-003** Unknown, duplicate, missing-required, or disallowed fields cause validation failure or an explicit non-applicable item; they are never silently accepted.
- **FR-PAT-004** Supported targets include simple text, textarea, sanitised rich text, boolean, ISO date, radio, checkbox, dropdown, bounded vocabulary/typeahead values, and groups/repeatables composed entirely of supported leaves.
- **FR-PAT-005** Attachments, maps, record selectors, workspaces, action buttons, integration components, and system-owned fields are never exposed as model targets.
- **FR-PAT-006** Default operation is `fill`. `replace`, `append`, `merge`, and `remove` require explicit future profile permission; `remove` is disabled in the POC.
- **FR-PAT-007** Existing non-empty values are preserved. The POC has no candidate replacement-review UI because it only generates during creation.
- **FR-PAT-008** The client must recheck values immediately before application and classify a changed target as a conflict.
- **FR-PAT-009** Batch application must mark controls dirty, leave them untouched, revalidate the form, and emit one ordinary field-change event per changed control plus one aggregate completion event.
- **FR-PAT-010** System identifiers, timestamps, relationships, workflow values, and derived fields remain the responsibility of deterministic lifecycle logic.

### 6.7 Provenance and review

- **FR-PRVNC-001** Field provenance stores the run, stable field ID, target path, generated value hash, evidence IDs, rationale, grounding state, and timestamps without storing the entire raw provider response.
- **FR-PRVNC-002** Provenance is committed only after successful target-record creation and must be idempotent.
- **FR-PRVNC-003** The client may display pending provenance before save.
- **FR-PRVNC-004** Current-value comparison determines whether a persisted generated field has subsequently been edited or removed.
- **FR-PRVNC-005** A user edit or explicit `Mark reviewed` action resolves a review flag but does not erase the original generation evidence.
- **FR-PRVNC-006** Provenance must never make generated fields read-only.

### 6.8 Diagnostics and audit

- **FR-AUD-001** Durable run audit contains identifiers, pinned versions, source/target references and hashes, actor, status/timestamps, validation/error codes, usage, and actual provider/model metadata.
- **FR-AUD-002** Durable audit must not contain prompts, raw source metadata, raw retrieved text, raw responses, or credentials.
- **FR-AUD-003** Diagnostic content is stored separately, encrypted, and deleted through a TTL policy after the configured period.
- **FR-AUD-004** Setting diagnostic retention to zero prevents diagnostic content persistence.
- **FR-AUD-005** The platform maximum diagnostic retention is thirty days; the proposed default is seven days.
- **FR-AUD-006** Normal application logs contain correlation IDs and safe error codes only. Prompt and response bodies are prohibited.

## 7. Non-functional requirements

### 7.1 Security and privacy

- **NFR-SEC-001** Derive brand from the authenticated request/session and reload it inside workers. Ignore any payload-supplied brand.
- **NFR-SEC-002** Every data access includes `brandId` and validates associated entities share that brand.
- **NFR-SEC-003** Workers reauthorize source access and target intent ownership before invoking a provider.
- **NFR-SEC-004** Secret values are resolved just in time, remain write-only, are redacted from errors, and never enter queue payloads.
- **NFR-SEC-005** Generic provider endpoints require HTTPS and operator-defined outbound allowlisting; redirects, loopback, private, link-local, and cloud-metadata targets are rejected unless explicitly operator-authorised.
- **NFR-SEC-006** Output strings are length-limited and sanitised for their destination. Rich content uses the existing DOM sanitisation boundary.
- **NFR-SEC-007** Model output cannot select an operation, path, provider, knowledge source, URL, or tool outside server-owned policy.
- **NFR-SEC-008** Synthetic data is used for the POC and its automated tests.

### 7.2 Reliability and concurrency

- **NFR-REL-001** Run state transitions use compare-and-set semantics so double-clicks, repeated polling, queue redelivery, and worker restarts are idempotent.
- **NFR-REL-002** Queue payloads contain only run and brand identifiers; workers reload authoritative state.
- **NFR-REL-003** A queued or running request has a configured deadline and becomes a terminal failure or cancellation without leaving the UI indefinitely busy.
- **NFR-REL-004** Poll responses support `Retry-After` or a client backoff policy.
- **NFR-REL-005** A failed provenance commit is retryable and cannot invalidate the saved record.
- **NFR-REL-006** Startup bootstrap is idempotent and never stores duplicate versions when content hashes match.

### 7.3 Performance and cost

- **NFR-PERF-001** The server enforces per-brand and per-user concurrent-run limits and configurable daily request/token ceilings.
- **NFR-PERF-002** Context preparation and retrieval are bounded by configured item/byte/token limits.
- **NFR-PERF-003** Run polling returns summaries; raw diagnostics require a separate admin-only request.
- **NFR-PERF-004** Manual generation is the POC default. No save hook automatically invokes a model.

### 7.4 Accessibility and usability

- **NFR-UX-001** The side panel traps focus while open, has a programmatic title, announces progress changes, is keyboard operable, and restores focus to its launcher.
- **NFR-UX-002** Closing the panel before submission is harmless. Closing while running does not apply partial output; reopening restores status.
- **NFR-UX-003** Errors are actionable and do not expose provider internals. The researcher can retry only after a failed attempt.
- **NFR-UX-004** Provenance badges are supplementary; review states are communicated by text and icon, not colour alone.
- **NFR-UX-005** All labels and status messages use translation keys.

### 7.5 Maintainability

- **NFR-MNT-001** Shared runtime contracts live in `@researchdatabox/sails-ng-common`; backend business logic lives in `@researchdatabox/redbox-core`.
- **NFR-MNT-002** No deliberate `any` casts are added to bypass generation contract typing.
- **NFR-MNT-003** New dependencies, if unavoidable, use exact pinned versions. The POC should use Node's built-in `fetch` and existing Zod where practical.
- **NFR-MNT-004** Provider-specific request/response types do not leak into profile, run, controller, or Angular contracts.

## 8. POC fixture definition

### 8.1 Synthetic Research Activity

The principal fixture describes a university-led human-participant project using semi-structured interviews and online surveys. It contains:

- project title and abstract;
- chief investigator and project team;
- funder, grant identifier, start/end dates;
- qualitative interview recordings/transcripts and quantitative survey exports;
- approximate volume;
- personal/sensitive classification;
- incomplete evidence about whether consent permits public sharing;
- collaborators and required access;
- approved institutional storage and backup intention;
- intended de-identification, repository, sharing, retention, and disposal details.

At least one second fixture should be included for automated evaluation, not necessarily the live presentation. It should use non-sensitive environmental observations so fixture tests prove profile behaviour is not hard-coded to human-subject data.

### 8.2 Fixed context review

The five fields are:

1. data types and approximate volume;
2. sensitivity and participant-consent constraints;
3. people who require access during the project;
4. intended storage and backup arrangements; and
5. sharing, repository, and retention intentions.

Each field shows its Research Activity-derived default. All are editable for the run. There is no conditional branching and no mandatory new information.

### 8.3 Target RDMP controls

The representative target includes, at minimum:

| Stable profile field ID | Representative control | Expected grounding |
|---|---|---|
| `data.summary` | textarea | project facts |
| `data.volumeBand` | dropdown enum | project facts |
| `data.sensitivity` | dropdown enum | project facts plus classification policy |
| `collection.documentationPlan` | textarea | project facts plus guidance |
| `storage.location` | dropdown enum | approved-service guidance |
| `storage.backupApproach` | radio/dropdown enum | approved-service guidance |
| `security.controls` | textarea | classification and storage policies |
| `access.roles` | bounded checkbox/dropdown values | project facts |
| `access.plan` | textarea | project facts plus policy |
| `sharing.intent` | radio enum | consent facts plus sharing policy |
| `sharing.plan` | textarea | consent facts, repository guidance, and fallback rule |
| `preservation.repositoryType` | dropdown enum | repository guidance |
| `retention.period` | dropdown enum | retention policy/funder facts |
| `disposal.plan` | textarea | retention and disposal policy |
| `responsibility.ownerRole` | dropdown enum | project facts |

The source relationship identifier is populated deterministically as runtime initial state and is not a generation target.

### 8.4 Fictional policy pack

- `demo-data-classification.md`
- `demo-approved-storage.md`
- `demo-retention-and-disposal.md`
- `demo-sharing-and-consent.md`

Each document declares a fictional institution name prominently, carries a stable document/chunk identifier, and is tagged to relevant target fields. Nothing should resemble binding legal advice or a real institution's current policy.

## 9. POC acceptance criteria

- **AC-POC-001** A Researcher can open either synthetic Research Activity and see the configured creation action.
- **AC-POC-002** Launching the action opens a new RDMP and an accessible side panel without creating a target database record yet.
- **AC-POC-003** The five context fields are pre-populated from the selected source and can be edited.
- **AC-POC-004** The source relationship is populated deterministically without being sent as a model target.
- **AC-POC-005** Submitting creates one queued run pinned to published configuration versions.
- **AC-POC-006** A real OpenRouter request is made when a valid secret and compatible configured model are present.
- **AC-POC-007** Automated tests can substitute a deterministic fake adapter; CI never requires an OpenRouter account.
- **AC-POC-008** The response uses strict structured output, is locally validated, and cannot address a field outside the allowlist.
- **AC-POC-009** The UI displays the four progress phases and never streams unvalidated text into the form.
- **AC-POC-010** Valid constrained and narrative values populate the expected controls, become dirty, and pass ordinary form validation.
- **AC-POC-011** Incomplete consent yields a populated conservative sharing statement and a visible review flag.
- **AC-POC-012** The researcher can edit any generated value and mark the flagged value reviewed.
- **AC-POC-013** A second successful run is refused for the same creation intent; a failed run can be retried.
- **AC-POC-014** The same Research Activity can launch another independent new RDMP.
- **AC-POC-015** Saving uses the normal create lifecycle, creates exactly one linked RDMP, and commits provenance idempotently.
- **AC-POC-016** Reopening the record displays provenance; editing a generated value and saving causes it to display as `AI-assisted, edited`.
- **AC-POC-017** Removing or tampering with a binding, source permission, brand, run ID, evidence ID, field ID, or receipt produces a safe 4xx response and no cross-brand data disclosure.
- **AC-POC-018** Logs contain correlation/status metadata but no source prompt or response body.
- **AC-POC-019** With diagnostic retention set to zero, encrypted input/candidate artifacts may exist only while operationally required to complete and commit the asynchronous run, then are deleted immediately; no raw diagnostic content remains retained. With diagnostic retention enabled, the retained diagnostic subset has an explicit expiry and can be purged immediately.
- **AC-POC-020** The live-model smoke test is opt-in; all standard suites pass with the fake adapter.

## 10. Explicit POC exclusions

- Full admin CRUD screens.
- Conditional questionnaire branching.
- Second-generation/rewrite workflow.
- Applying generated changes to an already saved target record.
- Automatic generation on create, save, workflow transition, or field change.
- Streaming provider output.
- Cross-model/provider fallback.
- Google Vertex AI/Gemini, AWS Bedrock, and generic OpenAI-compatible runtime adapters implemented through their Vercel AI SDK providers.
- Vector embeddings or an external vector database.
- Arbitrary web retrieval or model tools.
- Files, maps, record selectors, workspaces, integration controls, and system fields as targets.
- Updating the Research Activity from corrections made in the generation panel.
- Learning from researcher edits.
- DMPTool import/export compatibility.
- DMPChef as a service or dependency.

## 11. Post-POC scope

After the researcher experience is accepted:

1. Deliver admin management screens and draft/test/publish/version-history workflows.
2. Add Google Vertex AI/Gemini, AWS Bedrock, and generic OpenAI-compatible providers behind the same ReDBox capability contract.
3. Add profile test suites, comparison reports, and controlled model-deployment upgrades.
4. Add knowledge upload/preview/publish/reindex management and optional vector retrieval adapters.
5. Add saved-record regeneration with three-way merge and explicit replacement review.
6. Add optional binding triggers for other manual form actions; retain manual invocation as the default.
7. Add export/import of configuration that strips secrets and never crosses brands implicitly.

## 12. External protocol references

- OpenRouter chat completions and authentication: <https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request>
- OpenRouter structured outputs: <https://openrouter.ai/docs/guides/features/structured-outputs>
- OpenRouter provider routing and required-parameter/data controls: <https://openrouter.ai/docs/guides/routing/provider-selection>
- OpenRouter zero-data-retention controls: <https://openrouter.ai/docs/guides/features/zdr>
- Amazon Bedrock structured output (future adapter): <https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html>
- Vercel AI SDK provider architecture: <https://ai-sdk.dev/docs/foundations/providers-and-models>
- Vercel AI SDK structured output: <https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data>
- Vercel AI SDK Google Vertex provider: <https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex>
- Vercel AI SDK Amazon Bedrock provider: <https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock>
