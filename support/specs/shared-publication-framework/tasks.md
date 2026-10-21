# Shared publication framework: task checklist

Status: PUB-01–PUB-19 and PUB-22–PUB-24 are implemented. PUB-20, PUB-21 and PUB-25 items that require institutional staging, deployed customer hooks, production deployment or operator acceptance remain open; see [Shared-Publication-Operations](../../wiki/Shared-Publication-Operations.md) and [Shared-Publication-Vocabularies](../../wiki/Shared-Publication-Vocabularies.md) for the runbooks.

Contracts: [design.md](design.md). Delivery order, dependencies and verification commands: [implementation_plan.md](implementation_plan.md). Complete a task only when its acceptance criteria pass and its evidence is recorded. Do not mark a task complete merely because files or stubs exist.

New paths below are proposed. Existing paths are repository-relative. Tests belong with the behaviour they protect; the final regression task combines those checks rather than replacing them.

## Stage 1: shared processing, both providers and one-way migration

### PUB-01 — Baseline fixtures and compatibility inventory

Dependencies: none.

Primary areas: `packages/redbox-core/src/services/figshare-v2/`, `services/oni-v2/`, provider services, provider tests, `support/figshare/VERIFICATION.md`, configured/customer hooks.

- [x] Inventory public service methods, hook override seams, source policies, legacy queues, settings, write-back paths and vocabulary references.
- [x] Capture Figshare payload/identity/receipt/recovery fixtures and Oni crate/person/attachment/ingestion/return-shape fixtures from existing behaviour.
- [x] Document intentional differences from the baseline: scoped approval, explicit auto-sync, validation boundaries, Oni async timing and destination-aware status.
- [x] Create the implementation verification record with fixture provenance, test commands and customer hook-chain review requirements.

Acceptance: compatibility-sensitive behaviour is backed by executable fixtures; the rollout inventory distinguishes repository evidence from externally deployed hooks.

### PUB-02 — Shared contracts, service and registry

Dependencies: PUB-01.

Primary areas: new `packages/redbox-core/src/services/PublicationService.ts`, `services/publication/`, `model/storage/PublicationSyncModel.ts`, service/model exports and public types.

- [x] Define source revisions, approvals, auto-sync policies, intents, work keys, typed outcomes, completion evidence and versioned provider state.
- [x] Define the adapter/execution-context contract, configuration/secret metadata and provider-defined remote identity.
- [x] Implement PublicationService export/loader registration and built-in/hook registry setup; reject incompatible duplicate IDs before processing.
- [x] Classify supported extension points and add service/loader contract tests with no generated-shim hand edits.

Acceptance: typed contracts compile without type-bypassing casts, and a hook override can register a test adapter before registry freeze.

### PUB-03 — Unified AppConfig and destination validation

Dependencies: PUB-02.

Primary areas: new `configmodels/PublicationPublishing.ts`, `configmodels/ConfigModels.ts`, `AppConfigService.ts`, branding defaults/resolution and configuration tests.

- [x] Add schema/defaults for processing, named destinations, source policies and central workflow rules; default brand and new destination processing off.
- [x] Register provider schemas/secret paths through existing AppConfig facilities, including masking, secret references and brand overrides.
- [x] Validate stable destination IDs, provider references, non-empty workflow sets, durations and used-target identity changes.
- [x] Reject exact/ancestor/descendant/array-root write-back collisions and unsafe output paths.
- [x] Test credential rotation, target/account replacement rejection, archived-state retention and authoritative unified configuration without legacy fallback.

Acceptance: invalid/missing capabilities or unsafe destination configuration cannot be enabled; editing/redacting configuration never leaks or destroys credentials.

### PUB-04 — Shared bindings and sealed publication inputs

Dependencies: PUB-01, PUB-02.

Primary areas: `services/integration-v2/bindings.ts`, provider bindings/context builders, new `services/publication/source.ts` and staging helpers.

- [x] Consolidate path/Handlebars/JSONata primitives while preserving provider contexts, helper restrictions, null/default semantics and customer override outputs.
- [x] Implement canonical source descriptors, material configuration fingerprints, crosswalk revision pinning and related-record/person snapshots.
- [x] Allocate generated values once per request and verify repeatable Oni crate inputs/output.
- [x] Implement immutable attachment manifests, digest/version reuse and preflight staging/hash fallback when version identity is unavailable.
- [x] Verify staged input digests and shared-worker access; add reference-aware cleanup for abandoned preparation without deleting recovery inputs.
- [x] Test relevant versus maintenance-only changes, concurrent attachment rewrites and brand isolation.

Acceptance: prepared content is reproducible and approval cannot silently cover bytes or mapping inputs discovered later; ordinary drafts do not hash all attachments.

### PUB-05 — Publication state and resource stores

Dependencies: PUB-02.

Primary areas: new `waterline-models/PublicationSync.ts`, `PublicationResourceLease.ts`, `services/publication/store.ts`, model exports/types.

- [x] Implement destination-keyed sync rows, revision CAS, leases/heartbeats, due paging, dispatch claims and operation journals.
- [x] Create unique work and partial canonical remote-object indexes; fail clearly on duplicate managing bindings across records/brands/destinations.
- [x] Add resource ownership for shared repository root writes/indexing, with conditional renew/release and recovery evidence.
- [x] Implement versioned state decoding/upgrades without overwriting unknown evidence.
- [x] Run native-Mongo tests for contention, lease expiry/replacement, unbound rows, duplicate bindings and resource ownership.

Acceptance: only current owners mutate/checkpoint, remote objects have one manager and durable state remains recoverable without queue messages.

### PUB-06 — Atomic source storage and capability declaration

Dependencies: PUB-02, PUB-05.

Primary areas: `RecordWriteOptions.ts`, `RecordStorageConcurrency.ts`, `StorageService.ts`, record models, MongoStorageService and Mongo integration tests.

- [x] Add a versioned publication capability independent of strict record concurrency; validate the complete contract at enablement/runtime.
- [x] Add server-owned publication source state and trusted intent options; strip/reject untrusted attempts to supply them.
- [x] Atomically write source changes/invalidation and per-destination obligations with existing revision/lifecycle preconditions.
- [x] Implement per-save ready/abandon, exact-generation per-destination acknowledgement and bounded pending scans.
- [x] Prove successful-save recovery after interruption using durable outcome evidence; quarantine ambiguous completion and never promote known failed entries by age.
- [x] Cover overlapping success/failure, generation acknowledgement races and missing/unknown capability against real Mongo.

Acceptance: failed-save content cannot publish and no later successful obligation is erased by an older/failing save. CI runs, rather than skips, the real-Mongo cases.

### PUB-07 — Record saves, approvals and auto-sync

Dependencies: PUB-03, PUB-04, PUB-06.

Primary areas: RecordsService source preparation/finalisation seams, record-hook coordination, provider compatibility request entry points.

- [x] Generalise source preparation/finalisation and invalidate approvals on meaningful content changes even without a replacement request.
- [x] Grant approval from trusted configured events/hooks, retaining requester/approver/creator attribution and fixed destination scope.
- [x] Separate grant-stage/requester checks from current continuation/service checks; implement explicit auto-sync policy and revocation epochs.
- [x] Keep drafts saveable; reject explicit approval if any selected destination fails local validation; record auto-sync failures independently.
- [x] Make unfinished-save compatibility calls participate in the save tracker; standalone calls conditionally authorise only committed source.
- [x] Test no provider mutations on save, no forged authorisation, approver departure and source edits during preparation/finalisation.

Acceptance: source authority is explicit and durable, validation follows the agreed boundaries, and existing record concurrency/lifecycle contracts remain intact.

### PUB-08 — Shared dispatch and worker execution

Dependencies: PUB-03, PUB-05, PUB-06.

Primary areas: new `services/publication/dispatcher.ts`, `worker.ts`, `execution.ts`, queue bootstrap/Agenda registration.

- [x] Import obligations durably before exact-generation acknowledgement; keep sibling destinations independent and pagination fair.
- [x] Add identifier-only Publication-SyncRecord jobs, recovery scanning and safe paused-brand/destination backoff.
- [x] Extract leases, heartbeat, authority/configuration checks, cancellation, operation journalling and checkpoint ownership from Figshare.
- [x] Implement waiting/retry/repair outcomes, bounded retry episodes and mandatory reconciliation of uncertain mutations.
- [x] Retain read-only recovery evidence when approval is revoked or source is superseded; prevent further unauthorised mutations/workflow advancement.
- [x] Test missed/duplicate jobs, slow requests, lease loss, source/configuration changes, deletion and restart boundaries.

Acceptance: durable state determines work; lost delivery is recoverable; an obsolete worker cannot begin another mutation or checkpoint as owner.

### PUB-09 — Figshare adapter and legacy delegates

Dependencies: PUB-01, PUB-04, PUB-07, PUB-08.

Primary areas: FigshareService, `figshare-v2/`, new Figshare adapter, Figshare regression/integration tests.

- [x] Move generic lifecycle mechanics to the shared worker while keeping API/payload sequencing in the adapter.
- [x] Preserve actual custom payload mapping/override seams and owner/account impersonation semantics.
- [x] Preserve uncertain create/publication recovery, receipts, foreign-file protection, curation waits, manual publication and embargo checks.
- [x] Migrate/version provider state without dropping evidence; retain exclusive article binding.
- [x] Forward legacy methods/queues through deterministic destination assignments, ignoring stale authority in job payloads.
- [x] Run existing Figshare regressions and shared-worker fault cases; document intentional approval/status differences.

Acceptance: existing recovery safeguards pass through the shared worker, and legacy jobs cannot select a different destination or bypass current approval.

### PUB-10 — Prove OCFL reconciliation on supported storage

Dependencies: PUB-01.

Primary areas: `services/oni-v2/repository.ts`, `flydriveOcflStore.ts`, OCFL adapter types and repository/storage tests.

- [x] Identify and expose supported inventory/head/content reads from the pinned OCFL library through narrow typed wrappers.
- [x] Define the concrete evidence for desired content, expected prior head and confirmed non-application.
- [x] Build FS and S3-backed fixtures for lost responses, matching commits, unchanged heads, competing heads and unreadable/incomplete evidence.
- [x] Record the proven wrapper/library behaviour and fail closed when the outcome cannot be established.

Acceptance: tests distinguish safe resume/retry from repair-required uncertainty without a blind second REPLACE commit.

### PUB-11 — Oni adapter and asynchronous exportDataset

Dependencies: PUB-04, PUB-07, PUB-08, PUB-10.

Primary areas: OniService, `oni-v2/` crate/runtime/repository/ingestion, new Oni adapter and tests.

- [x] Implement prepared, submitted, OCFL-confirmed, ingestion and projection checkpoints using stable generated values and sealed attachments.
- [x] Reconcile an interrupted commit before retry; resume ingestion/write-back after confirmed OCFL success without an unnecessary version.
- [x] Serialize repository root/indexing operations through resource leases and ensure the ingestion run follows the relevant deposit.
- [x] Preserve creator/approver history and existing object IDs/URLs; use the current service identity for persistence.
- [x] Return the record from exportDataset after durable acceptance/save registration; move remote failures to status without fabricating immediate citation results.
- [x] Test every commit/ingestion/projection crash boundary, identity separation and explicit unverified object-visibility reporting.

Acceptance: Oni survives remote/persistence failures safely, and compatibility retains method/return shape with documented asynchronous timing.

### PUB-12 — Conditional projections and all/any workflow

Dependencies: PUB-07, PUB-08, PUB-09, PUB-11.

Primary areas: new `services/publication/writeback.ts` and `workflow.ts`, RecordsService internal mutation paths, WorkflowStepsService integration.

- [x] Apply allow-listed status/links using expected record revisions; reload/revalidate on conflict rather than replace stale snapshots.
- [x] Persist a deterministic workflow decision ID with the conditional stage change and preserve partial hook failure evidence.
- [x] Evaluate all/any against current completion and fixed approved destination sets; reject newer pending source work.
- [x] Preserve remaining authorisation after an any transition while retaining current permission/revocation checks.
- [x] Exempt only registered maintenance fields/expected internal stage changes; invalidate normally when hooks change publication content.
- [x] Test concurrent completions, overlapping output rejection, stage-gate continuation, stale saves and late historical outcomes.

Acceptance: one logical advancement occurs; any does not cancel siblings; framework writes neither loop nor authorise changed content.

### PUB-13 — Destination status, audit and operational signals

Dependencies: PUB-05, PUB-07, PUB-08.

Primary areas: RecordAuditController, IntegrationAuditService/model, current Figshare status helpers and status tests.

- [x] Add destination identity/revision/evidence to live status and optional audit metadata while preserving historical rows/non-publication integrations.
- [x] Overlay pending-but-unimported source work and support existing provider filters plus access-checked destination selection.
- [x] Separate work state, deposit/publication, ingestion, embargo/accessibility and verified/unverified visibility.
- [x] Bound audit events per logical episode; expose source/queue lag, waiting/retry/repair and lease/quarantine signals without payload/secret leakage.
- [x] Cover multiple same-provider destinations, no-audit pending work, legacy summaries and brand/view permissions.

Acceptance: each destination is distinguishable and current; old success or a URL cannot masquerade as completion of new content.

### PUB-14 — AppConfig and integration-status UI

Dependencies: PUB-03, PUB-13.

Primary areas: `angular/projects/researchdatabox/app-config/`, the existing integration-status form component, translations and UI tests.

- [x] Render unified destination configuration in the existing AppConfig editor with provider/capability-dependent sections and existing secret controls.
- [x] Preserve the current Figshare crosswalk editor/widget and binding references for stage 1.
- [x] Render multiple destination rows, pending/waiting/repair reasons, current links and accurate Oni completion/visibility labels.
- [x] Add translations and Angular tests for duplicate providers, disabled/misconfigured destinations, filters, masked credentials and actionable errors.
- [x] Verify the visible save/reload/status flow using the repository browser workflow or focused acceptance suite.

Acceptance: administrators can configure supported destinations and users can identify each publication outcome without seeing internal processing machinery.

### PUB-15 — Supported recovery CLI

Dependencies: PUB-09, PUB-11, PUB-12.

Primary areas: new `support/publication/admin.js`, PublicationService admin helpers, existing `support/figshare/admin.js`.

- [x] Implement inspect/reconcile, destination/brand pause-resume, approval revoke and supported binding/provider repairs.
- [x] Load normal configuration with queue startup disabled; enforce current administrator/edit access.
- [x] Default corrections to dry-run, require explicit apply/reason, and reject mutation under active relevant leases.
- [x] Retain forwarding Figshare commands and preserve uncertainty/receipt ownership on resume or repair.
- [x] Test cross-brand denial, active-owner refusal, uncertain-operation protection and audit attribution for each correction category.

Acceptance: each expected migration/runtime repair has a supported operation; operators need not delete state or hand-edit Mongo.

### PUB-16 — Idempotent one-way migration

Dependencies: PUB-03, PUB-06, PUB-09, PUB-11, PUB-12, PUB-15.

Primary areas: shared migration service/CLI, per-brand journal/authority model, legacy config/state conversion and migration fixtures.

- [x] Build non-secret inventory/dry-run reports with deterministic destination IDs, config/source fingerprints, hook translations and required manual reviews.
- [x] Add pause/drain fencing, disabled preparation, per-step durable progress and atomic committed brand authority.
- [x] Copy Figshare intents/bindings/receipts/operations/checkpoints/audits and Oni object/link provenance without inferring historical ingestion or authorisation.
- [x] Preserve stage 1 crosswalk IDs/history/editor references and classify historical links as observation-only where no source authority exists.
- [x] Quarantine affected records/destinations/conflicting writer groups; block brand activation for global capability/configuration/index/authority failures.
- [x] Prove repeated/interrupted runs do not regenerate IDs, duplicate operations, erase evidence or enable legacy/shared consumers together.

Acceptance: migration resumes and rolls forward from every interrupted boundary, with exactly one processing authority and no reverse/down implementation.

### PUB-17 — Third-provider hook extension proof

Dependencies: PUB-02, PUB-07, PUB-08, PUB-12, PUB-13.

Primary areas: test hook fixture, loader integration, provider contract tests and validated documentation examples.

- [x] Register a test-only provider through the real service-override/loader path rather than mutating a private test registry.
- [x] Give it a non-Figshare lifecycle, distinct remote identity, waiting/repair outcomes and configuration secret metadata.
- [x] Exercise source intent, dispatch, completion, status and all/any coordination through unchanged shared infrastructure.
- [x] Document adapter development and the later Pure extension boundary without inventing Pure API requirements.

Acceptance: the fixture adds no provider-specific persistence, dispatcher, queue or workflow branch.

### PUB-18 — Combined regression and failure injection

Dependencies: PUB-09, PUB-11, PUB-12, PUB-14, PUB-15, PUB-16, PUB-17.

Primary areas: core unit tests, real Mongo package tests, Docker-backed save/provider tests, Bruno and Angular suites.

- [x] Execute every applicable row of the implementation plan's verification matrix, with meaningful persisted/remote-effect assertions.
- [x] Add fault injection around source commit/finalisation, import/ack, lease loss, provider response/checkpoint and projection/workflow boundaries.
- [x] Verify destination/brand isolation, source/approval races, exclusive bindings, secret masking and permission changes end to end.
- [x] Preserve existing Figshare/Oni regressions and make intentional synchronous-to-background expectation changes explicit.
- [x] Record commands, versions, source commit and test/skip counts; require MONGO_TEST_URL for Mongo acceptance/CI.

Acceptance: no blocking invariant is represented only by a mock, skipped storage suite or unverified checklist claim.

### PUB-19 — Wiki and generated contracts

Dependencies: PUB-14, PUB-15, PUB-16, PUB-17.

Primary areas: `support/wiki/`, source extension metadata, `support/documentation/examples/`, generated references.

- [x] Document configuration, source approval/auto-sync, all/any behaviour, fixed target identity and destination-specific status.
- [x] Update Figshare/Oni operational guides for shared processing, Oni timing/completion semantics and customer hook review.
- [x] Publish one-way cutover, quarantine and CLI recovery runbooks with evidence-preserving examples.
- [x] Add validated provider/configuration examples and classify public/internal extension contracts appropriately.
- [x] Run route validation, documentation tests/audit/generation; account for wiki submodule changes in delivery.

Acceptance: an operator and hook author can complete their respective flows from the delivered documentation, with no obsolete rollback promise.

### PUB-20 — Rehearsal and real-provider staging gates

Dependencies: PUB-16, PUB-18, PUB-19.

Primary areas: disposable/copied migration fixtures, staging brands, verification record and operator acceptance reports.

- [ ] Rehearse repeated/interrupted migration on representative pending, failed, uncertain, duplicated and historical state.
- [ ] Compare pre/post evidence inventories and verify quarantine allows unaffected work only after global checks pass.
- [ ] Complete Figshare staging checks for distinct account/author identities, curation/manual publication, embargo and uploads/recovery.
- [ ] Complete Oni staging checks for supported storage, OCFL read-back, indexing after deposit and projection recovery.
- [ ] Review deployed customer hook chains, local service permissions and durable shared staging storage.

Acceptance: both adapters and the migration have recorded operational evidence; all system-wide blockers are resolved before production enablement.

### PUB-21 — Stage 1 release and brand activation

Dependencies: PUB-20.

Primary areas: compatible core/Mongo/hook/UI release set, deployment and activation runbook.

- [ ] Package/deploy compatible versions with processing disabled; verify capability/index/schema/registry readiness.
- [ ] Pause/drain, apply verified migration and commit authority for the selected brand; keep new destinations off until accepted.
- [ ] Enable explicitly, verify multi-destination status/workflow and monitor lag, leases, waiting/retry/repair and projection outcomes.
- [ ] Record operator acceptance, deployed versions and forward-repair procedure; retain legacy read-only and current operational evidence.

Acceptance: stage 1 operates for the accepted brand without overlapping consumers, hidden partial outcomes or a rollback dependency.

## Stage 2: shared vocabulary and crosswalk administration

### PUB-22 — Generalised vocabulary contracts

Dependencies: PUB-04, PUB-21.

Primary areas: shared vocabulary types/bindings, provider source adapters, approved revision contracts.

- [x] Define source vocabularies, namespaced target terms, revisions/approvals and generalised resolution outputs.
- [x] Preserve Figshare import scopes/history and convert to numeric category IDs only in its payload adapter.
- [x] Define permanent identity/translation compatibility and frozen publication-reference resolution.
- [x] Add schema/type/mapping fixtures spanning Figshare and non-numeric targets.

Acceptance: shared contracts express both provider needs without dropping historical or approval information.

### PUB-23 — Shared services and crosswalk conversion

Dependencies: PUB-22.

Primary areas: new shared vocabulary services/models/controllers, FigshareVocabularyService delegates and conversion CLI.

- [x] Implement generalised source import, target lookup, draft/revision approval and mapping resolution using existing access patterns.
- [x] Retain Figshare categories as a source adapter and legacy route/service/binding delegates.
- [x] Add one-way dry-run/apply migration preserving IDs or an explicit translation map, revisions, approvals, historical targets and audit links.
- [x] Prove repeated/interrupted conversion and resolution of frozen approvals against their original revisions.

Acceptance: conversion does not alter previously approved publication content or lose referenceability/history.

### PUB-24 — Shared administration UI

Dependencies: PUB-22, PUB-23.

Primary areas: existing admin-figshare-vocabulary embedded Angular project, AppConfig crosswalk controls, EJS mounting and translations.

- [x] Evolve existing administration into shared vocabulary/crosswalk management with provider/source-aware selectors.
- [x] Generalise term labels/identifiers and capability-dependent import/approval controls without assuming numeric Figshare categories.
- [x] Preserve existing links, access/CSRF protections, draft/approval flows and compatibility references.
- [x] Add Angular/API/browser checks for history, approvals, non-numeric targets, brand boundaries and legacy navigation.

Acceptance: administrators can manage shared crosswalks and revisit migrated history through the existing portal architecture.

### PUB-25 — Stage 2 verification and release

Dependencies: PUB-23, PUB-24.

Primary areas: shared vocabulary regression suites, migration rehearsal, wiki/generated references and release gates.

- [x] Verify mapping equivalence, frozen revision resolution, secret masking, brand isolation and provider-specific payload conversion.
- [x] Rehearse repeatable one-way crosswalk migration and validate historical approval/audit inventories.
- [x] Update wiki, generated contracts and validated examples; retain required legacy ID/route adapters.
- [ ] Record staging acceptance, release compatible packages/UI and activate shared administration through the forward-only runbook.

Acceptance: stage 2 is usable without republishing historical content or breaking stage 1 processing and recovery.

## Definition of done for the feature

- [ ] Stage 1 and stage 2 task acceptance evidence is recorded, with intentionally separate releases identified.
- [x] All 19 agreed design decisions are represented in implementation and meaningful verification.
- [x] Both providers retain their required safeguards and mapping results; the new approval/Oni timing behaviours are documented.
- [x] Storage/save/lease/remote-operation uncertainty is recoverable without evidence deletion or queue assumptions.
- [x] Migration is repeatable, single-authority and forward-only; operators can diagnose and repair supported failures.
- [x] The third provider proves the extension contract without infrastructure edits; Pure implementation remains separately scoped.
