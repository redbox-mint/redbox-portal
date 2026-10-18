# Shared publication framework: implementation plan

Status: ready for implementation; no implementation tasks are complete.

Depends on [design.md](design.md). Executable work is tracked in [tasks.md](tasks.md). The design owns behavioural decisions; this plan owns sequencing, integration points and verification. Task IDs are shared by both documents.

## 1. Delivery strategy

Stage 1 must ship a complete operational path for Figshare and Oni: acceptance of authorised source work, durable execution, independent destination outcomes, central workflow, visible status, recovery and one-way migration. It must not depend on the stage 2 crosswalk editor.

Build and test the shared infrastructure with processing disabled. Move Figshare through the new boundary with its existing behaviour characterised before converting Oni. Neither a renamed worker nor a successful happy-path deposit is sufficient for activation.

Three foundations gate the rest:

1. The provider/source/storage contracts must preserve current extension behaviour and separate approval from source eligibility.
2. Storage must prove atomic invalidation, successful-save readiness and crash recovery against real MongoDB.
3. Oni must prove that the pinned OCFL library and both storage paths can observe/reconcile an interrupted commit without blindly creating another version.

Tests accompany each task. Final integration exercises combinations and failure boundaries; it is not the point at which foundational tests are first written.

## 2. Task dependencies and delivery units

The dependency column means the preceding tasks must have established their contracts and passing acceptance evidence. Preserve serial ownership of heavily shared files such as RecordsService, StorageService, model export indexes and AppConfig registration while integrating changes.

| Task   | Deliverable                                         | Depends on                                             | Stage |
| ------ | --------------------------------------------------- | ------------------------------------------------------ | ----- |
| PUB-01 | Baseline fixtures and compatibility inventory       | None                                                   | 1     |
| PUB-02 | Shared contracts, registry and service registration | PUB-01                                                 | 1     |
| PUB-03 | Unified configuration, identity checks and secrets  | PUB-02                                                 | 1     |
| PUB-04 | Binding primitives and sealed source preparation    | PUB-01, PUB-02                                         | 1     |
| PUB-05 | Processing stores, indexes and resource leases      | PUB-02                                                 | 1     |
| PUB-06 | Atomic source storage and capability checks         | PUB-02, PUB-05                                         | 1     |
| PUB-07 | Save orchestration and scoped authorisation         | PUB-03, PUB-04, PUB-06                                 | 1     |
| PUB-08 | Dispatcher and shared worker lifecycle              | PUB-03, PUB-05, PUB-06                                 | 1     |
| PUB-09 | Figshare adapter and compatibility delegation       | PUB-01, PUB-04, PUB-07, PUB-08                         | 1     |
| PUB-10 | OCFL reconciliation proof                           | PUB-01                                                 | 1     |
| PUB-11 | Oni adapter and background compatibility            | PUB-04, PUB-07, PUB-08, PUB-10                         | 1     |
| PUB-12 | Conditional projections and central workflow        | PUB-07, PUB-08, PUB-09, PUB-11                         | 1     |
| PUB-13 | Destination status, audits and observability        | PUB-05, PUB-07, PUB-08                                 | 1     |
| PUB-14 | Existing AppConfig and status UI integration        | PUB-03, PUB-13                                         | 1     |
| PUB-15 | Recovery CLI and provider repairs                   | PUB-09, PUB-11, PUB-12                                 | 1     |
| PUB-16 | One-way migration and authority journal             | PUB-03, PUB-06, PUB-09, PUB-11, PUB-12, PUB-15         | 1     |
| PUB-17 | Hook-provided third-provider contract proof         | PUB-02, PUB-07, PUB-08, PUB-12, PUB-13                 | 1     |
| PUB-18 | Cross-layer regression and failure injection        | PUB-09, PUB-11, PUB-12, PUB-14, PUB-15, PUB-16, PUB-17 | 1     |
| PUB-19 | Operational wiki and generated references           | PUB-14, PUB-15, PUB-16, PUB-17                         | 1     |
| PUB-20 | Migration rehearsal and provider staging acceptance | PUB-16, PUB-18, PUB-19                                 | 1     |
| PUB-21 | Stage 1 release and monitored activation            | PUB-20                                                 | 1     |
| PUB-22 | Shared vocabulary/crosswalk contracts               | PUB-04, PUB-21                                         | 2     |
| PUB-23 | Shared vocabulary services and one-way conversion   | PUB-22                                                 | 2     |
| PUB-24 | Shared crosswalk administration UI                  | PUB-22, PUB-23                                         | 2     |
| PUB-25 | Stage 2 verification, documentation and release     | PUB-23, PUB-24                                         | 2     |

Land reviewed, compilable changes in these dependency groups. A deployable build may contain disabled infrastructure before all stage 1 tasks land, but brand cutover/processing enablement requires PUB-20. Do not activate a production Figshare-only halfway migration as a substitute for proving both adapters.

## 3. Phase A: establish evidence and contracts

### PUB-01: characterise current behaviour

Inventory Figshare/Oni services, configured hooks, custom override entry points, processing settings, binding paths, legacy queue names, vocabulary references and current tests. Include deployed/customer hooks in the rollout inventory; repository search alone cannot certify their absence.

Use existing Figshare tests under `packages/redbox-core/test/services/figshare-*`, `test/integration/services/FigshareQueued.test.ts` and Mongo `FigshareIntent.test.ts`. Capture Oni crate output, FS/S3 repository behaviour, identities, ingestion failures and the return/error assumptions in `OniService.test.ts`.

Add golden fixtures for actual provider payloads and mapping contexts, not copies of the mapping implementation. Record which behaviours intentionally change: scoped approval, explicit auto-sync policy, Oni timing, validation boundaries and multi-destination status. Keep a release verification record under this specification when implementation begins.

Exit: fixtures expose the behaviours to preserve and external hook review is a visible rollout requirement.

### PUB-02 and PUB-03: define the public seams

Create typed provider/source/operation/status contracts, `PublicationService`, its core export registration and loader-compatible model registration. Classify supported extension surfaces for generated documentation. Preserve provider-specific state decoders/versioning.

Implement `PublicationPublishing.ts`, ConfigModels registration and existing branding-aware resolution. Register provider schemas and secret paths before accepting enabled configuration. Include immutable used-destination target checks, source-policy modes, central workflow rules and conflicting write-back validation.

Adapt the existing AppConfig schema/form adapter facilities; do not build a new publication administration application in this phase. Retain legacy Figshare crosswalk widgets where referenced.

Exit: unknown providers and unsafe configurations fail clearly, processing defaults off, secret round-trips preserve masking/references, and generated shims resolve the service correctly.

### PUB-04: deterministic inputs and binding compatibility

Extract only common path/Handlebars/JSONata mechanics into `services/integration-v2/`. Keep provider context construction and crosswalk adaptation at the boundary. Preserve existing helper allow-lists, default-value semantics and override evaluation through fixtures.

Implement versioned source-descriptor canonicalisation, selected attachment manifests, reusable immutable staging and generated-value allocation. Pin crosswalk revisions and snapshot related records/people used by mappings. Runtime credentials never enter the sealed descriptor.

Add reliable digest/version reuse and a staging/hash fallback for attachments without immutable identity. Draft saves must not acquire the cost of hashing all files. Prepared blobs created for failed/uncommitted requests are reclaimed only after checking all source/work/recovery references and an appropriate grace period.

Exit: retries produce the same intended content, mapping fixtures are equivalent and relevant source/configuration changes are detected while defined maintenance fields are excluded.

### PUB-10: prove OCFL reads and recovery early

Use the pinned `@ocfl/ocfl` package and current Flydrive integration. Determine the concrete inventory/head/content read APIs and extend the narrow repository wrapper rather than reaching into undocumented internals from the worker.

Demonstrate matching content after a simulated lost commit response, positively unchanged head/non-application, unexpected competing head, incomplete inventory and repository read failure. Cover FS and S3-backed operation. Record actual evidence fields and their stability in focused fixtures/notes.

Exit: the adapter can prove when it should resume after an existing commit and when it must stop for repair. If the library/driver cannot provide that proof, processing remains disabled while the implementation is corrected; blind `REPLACE` retry is not an acceptable substitute.

## 4. Phase B: establish durable processing

### PUB-05: stores and ownership

Add `PublicationSync`, the native Mongo store and scoped indexes. Copy the existing revision/lease discipline and generalise keys to brand/OID/destination. Preserve a partial unique canonical remote-object key and explicit conflict errors. Add the small resource-lease store used by Oni repository operations.

Use atomic compare-and-swap for every checkpoint/lease update. Prove that expired/replaced owners cannot write, that unbound rows do not collide, and that a duplicate remote binding is rejected across brands and destinations.

Exit: duplicate workers and shared-resource contenders have one owner; all evidence survives a restart independently of the queue.

### PUB-06: storage capability and source intents

Add a versioned `publication` capability to the existing capability contract and implement it in MongoStorageService. Extend the trusted write options and storage write paths to atomically persist source invalidation and per-destination requests. Reject client-supplied protected publication fields.

Implement bounded scans, save-token finalisation/abandonment, exact-generation acknowledgements and interrupted-save recovery. Explicitly audit the existing stale-initialising recovery heuristic: a clock threshold alone must not promote a failed or incompletely verified save. Add durable successful-save evidence where needed, preserving existing lifecycle/concurrency result semantics.

Exit: real-Mongo tests prove no failed save's content can become publishable, no successful concurrent obligation is lost and missing capability refuses processing before accepting unreliable work.

### PUB-07: RecordsService integration

Replace the provider-specific Figshare prepare/finalise seams with shared handling, retaining legacy aliases for unmigrated brands. Distinguish explicit approval, auto-sync, invalidation, revocation and trusted maintenance. Preserve grant versus continuation conditions and attribution snapshots.

Explicit approvals preflight all selected destinations; auto-sync records per-destination errors. A normal content save invalidates old requests even when it creates no replacement. Compatibility service calls inside hooks participate in the save tracker; standalone calls operate conditionally on committed source.

Exit: ordinary drafts remain saveable, authorisation cannot be forged through HTTP/hook JSON, requester departure alone does not revoke authority, and saves never perform provider mutations.

### PUB-08: dispatcher and worker

Extract intent import, due scanning, dispatch cooldown, leases, heartbeat, bounded retry episodes, operation journal and guarded execution from Figshare. Introduce identifier-only `Publication-SyncRecord` wake-ups and keep durable state authoritative.

Reconcile prior submitted operations before retrying mutations. Re-check source, approval epoch, target/material configuration, service permission, deletion and ownership before each mutation. Keep observation/reconciliation possible when further mutations are forbidden, with access-checked historical evidence persistence.

Exit: missing delivery, duplicate delivery, slow calls, expired leases, cancellation and process termination have deterministic safe outcomes. No provider-specific branch is required in the worker or storage code.

## 5. Phase C: migrate provider behaviour

### PUB-09: Figshare adapter

Wrap the existing metadata, identity, assets, embargo and publish modules. Move generic orchestration ownership without rewriting working provider sequencing. Route existing customise/override seams through the adapter and use actual outgoing payload hashes.

Translate Figshare state into versioned provider state without discarding create/publish evidence or receipts. Retain create-owner identity, exclusive remote ownership, foreign-file protection, manual publication waits, curation locks and interrupted-upload repair.

Keep existing service/queue names as delegates. Resolve legacy jobs through deterministic migration assignments, not destination order or user/article fields from old queue payloads.

Exit: existing regression fixtures pass with documented intentional differences only; uncertain create/publication and lost-upload recovery remain safe on the shared worker.

### PUB-11: Oni adapter

Split build/commit/ingestion/projection into persisted checkpoints. Consume sealed crate inputs and attachment bytes, use the PUB-10 inventory evidence and protect shared repository writes/indexing with resource leases.

Record `ocfl_submitted` before calling the commit API. After a crash, read and compare the object before deciding whether another write is permitted. Ingestion or record-persistence failure after a confirmed commit resumes from that checkpoint without a fresh OCFL version.

Convert `exportDataset` to durable acceptance while preserving the returned record shape and hook chaining. Keep historical approver/creator separate from the current local service identity. Update tests that intentionally depended on synchronous citations or remote exceptions.

Exit: every crash boundary has a tested recovery path, existing identifiers/metadata mapping remain stable, and status accurately separates deposit, ingestion and visibility evidence.

## 6. Phase D: workflow and operational surfaces

### PUB-12: narrow projections and workflow coordination

Implement allowed-path, expected-revision projections through existing internal mutation APIs. Retry stale projections only after rechecking current approval/source identity. Classify expected framework writes narrowly; a hook that changes publication inputs must still invalidate pending work.

Implement `all`/`any`, an atomic workflow decision identity and correct handling of newer source work. Count only current confirmed evidence. Outstanding same-request destinations continue after `any` advancement and do not reapply their old grant-stage gate.

Exit: concurrent completions cannot produce duplicate logical transitions or overwrite source content. Partial hook/transition failures are preserved for repair instead of blindly replayed.

### PUB-13 and PUB-14: status and existing UI

Replace the Figshare-only live overlay in RecordAuditController with destination-aware publication status. Retain non-publication integrations and legacy integration-name filters. Add optional destination identity to audit summaries without collapsing multiple destinations of the same provider.

Update the embedded Angular integration-status component and existing AppConfig application. Display destination labels, pending/waiting/retry/repair reasons, completion evidence and links. Users need actionable status rather than internal leases, raw checkpoints or secrets. Review translations and status empty states.

Exit: access checks protect every destination result; pending-but-unimported work is visible; two Figshare destinations render separately; Oni completion never implies unverified discovery.

### PUB-15: recovery CLI

Build the shared CLI using the normal application configuration with queue startup disabled. Implement read-only inspection/reconciliation, explicit pause/resume/revoke and supported provider binding/operation repairs. Forward compatible existing Figshare commands.

Require admin/edit access, dry-run/apply, correction reasons and idle relevant leases for mutation. Confirm that a repair never deletes uncertainty as a shortcut or causes an old approval to authorise newer content.

Exit: an operator can diagnose and repair each quarantinable condition expected during migration without editing Mongo documents manually.

## 7. Phase E: migration and stage 1 acceptance

### PUB-16: deterministic one-way migration

Implement an independently durable per-brand journal and authority marker. Add inventory/dry-run, pause/drain verification, disabled preparation, versioned conversion, evidence verification and authority commit. A partially prepared AppConfig alone cannot switch ownership.

Convert known hook/site references and auto-sync behaviour explicitly; flag arbitrary continuation expressions, synchronous customer-hook assumptions and ambiguous destinations. Carry Figshare state/evidence and Oni identifiers without guessing historical ingestion. Preserve old collections as read-only evidence.

Quarantine affected record/destination conflict groups; block whole-brand activation for capability/configuration/index/authority failures. Repeated and interrupted runs must preserve stable destination IDs, evidence and completed progress. Stage 1 leaves legacy crosswalk storage/editor references intact.

Exit: migration can resume after every write boundary, and exactly one framework owns a cut-over brand. No rollback/down path exists.

### PUB-17: provider extensibility proof

Register a test adapter through an actual hook service override using the supported loader path. Give it a non-Figshare lifecycle and distinct completion/repair behaviour. Run it through save intent, dispatch, independent destination processing, status and central workflow without changes to those layers.

Exit: adding the provider changes registration/adapter/test code only. Publish the contract and document Pure as a subsequent provider implementation, without speculative Pure API promises.

### PUB-18: integrated failure matrix

Exercise the matrix in section 9 against actual storage and stubbed provider boundaries. Retain existing suites and make intentional expectation changes explicit in their assertions.

Exit: every accepted invariant has evidence at the appropriate layer. Skipped real-Mongo cases cannot be presented as passing storage acceptance.

### PUB-19: delivery documentation

Update operational wiki pages for configuration, adapters, migration, recovery and status. Update Figshare/Oni pages to describe the shared worker and changed Oni timing. Add validated configuration/hook examples and extension classification metadata; regenerate references and audit their coverage.

Exit: an operator can stage, cut over and recover using documented commands, and a hook developer can register a provider from a validated example.

### PUB-20 and PUB-21: rehearsal and activation

Rehearse on a representative copied dataset with pending work, failed save entries, duplicate bindings, uncertain operations, legacy crosswalk revisions and historical Oni links. Run migration twice, interrupt it, resume it and compare evidence inventories.

Verify real Figshare account/author distinctions, curation/manual publication, embargo and multipart recovery in staging. Verify real Oni storage, OCFL read-back and configured ingestion. Review customer hook chains and service access before accepting the brand.

Release the core, matching Mongo package, hooks and UI as a compatible set with processing disabled. After rehearsal acceptance, cut over one brand, then explicitly enable its destinations. Record source lag, waiting/retry/repair counts and projection results against the baseline. On problems, pause and repair forward; retain all evidence.

Exit: stage 1 acceptance is recorded, both providers have operational evidence, and processing ownership is unambiguous.

## 8. Phase F: shared vocabulary administration

### PUB-22: generalised contracts

Define provider-neutral sources, namespaced target terms, revision/approval semantics and binding outputs. Keep Figshare numeric category conversion at its API boundary and preserve existing source scopes/context behaviour.

### PUB-23: services and data conversion

Implement shared vocabulary services/resolution, retain Figshare imports as an adapter and convert data one-way with dry-run reports. Preserve identities or a permanent explicit translation map, revision histories, approvals and frozen publication references. Keep legacy service/route aliases working through the shared implementation.

### PUB-24: existing Angular administration migration

Evolve the embedded Figshare vocabulary application into shared publication vocabulary administration. Generalise labels/selectors without imposing Figshare term shapes on other providers. Retain capability-dependent import/edit controls and current access/CSRF protections.

### PUB-25: release the second stage

Prove mapping equivalence, historical/frozen revision resolution, repeated migration and brand isolation. Update wiki and generated references, verify the UI and activate the new administration path. Do not remove compatibility references required by persisted configurations.

Exit: shared administration is usable without changing previously approved publication content or losing crosswalk history.

## 9. Verification matrix

| Scenario                                             | Required result                                                                              | Primary evidence                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Concurrent source saves                              | Correct source content/generations; no successful obligation erased by failed sibling        | Mongo package integration + RecordsService integration |
| Explicit save failure                                | Failed content never becomes runnable, including after recovery scan                         | Real-Mongo save/finalisation fault injection           |
| Stop before/after successful-save finalisation       | Proven success recovered; ambiguous outcome quarantined; known failure never promoted by age | Process interruption/integration                       |
| Import stops before acknowledgement                  | Reimport is idempotent; only correct destination generation acknowledged                     | Store/dispatcher integration                           |
| Lost/duplicate queue delivery                        | Durable due scan recovers; one active owner                                                  | Worker/store integration                               |
| Source edit or revocation during HTTP                | No later mutation; late result recorded historically, not counted for new content            | Provider stub + lease/source race tests                |
| Lost lease during upload/commit                      | Old worker cannot checkpoint or start another mutation; successor reconciles                 | Failure-injection tests                                |
| Credentials rotate                                   | Same target remains approved; material target change rejected                                | Config/adapter identity tests                          |
| Mapping/crosswalk/selected bytes change              | Old approval invalidated; explicit auto-sync may authorise fresh work                        | Preparation + save/worker integration                  |
| Status/link/internal stage write                     | No feedback loop; remaining same-request approvals preserved                                 | Workflow + real save tests                             |
| Hook changes mapped data during transition           | Normal invalidation occurs; maintenance cannot hide change                                   | RecordsService/workflow integration                    |
| Approver disabled                                    | Approval retained; current service/policy still enforced                                     | Identity/worker tests                                  |
| Local validation failure                             | Draft saves work; explicit set rejected; auto-sync failure isolated                          | Save/hook integration                                  |
| Figshare uncertain create/publish                    | No blind second operation; correct verified recovery/repair                                  | Existing regression + stub/institution staging         |
| Figshare interrupted upload/curation/embargo         | Receipt ownership and current waiting semantics preserved                                    | Existing assets/runtime tests + staging                |
| Oni commit succeeds, response lost                   | Existing matching version recognised; no unnecessary new version                             | OCFL FS/S3 recovery fixtures                           |
| Oni ingestion/projection fails after commit          | Resume only missing steps; links/evidence retained safely                                    | Oni + real storage integration                         |
| Two records ingest one Oni repository                | Shared resource is owned safely; no earlier run satisfies a later deposit                    | Resource-lease + ingestion integration                 |
| Repository index ready, object visibility unverified | Completion accurately labels its evidence                                                    | Oni status/API/UI tests                                |
| Two destinations bind one remote object              | Unique managing binding rejects conflict across brands                                       | Native Mongo index integration                         |
| `all` partial success                                | Successful publication retained; workflow waits                                              | Multi-destination integration                          |
| `any` partial success                                | Workflow advances once; unfinished approved destinations continue                            | Workflow race + save integration                       |
| Newer source pending                                 | Historical completion cannot advance current workflow                                        | Multi-destination race integration                     |
| Missing storage capability                           | Enablement/request/dispatch refuse processing clearly                                        | Capability/config integration                          |
| Migration repeated/interrupted                       | Stable IDs/progress/evidence; one active authority                                           | Migration fixtures + full rehearsal                    |
| Historical links only                                | Observation without automatic new publication or inferred ingestion                          | Migration/worker tests                                 |
| Secret masking and status access                     | No credentials/private payload leakage; brand/access boundaries hold                         | AppConfig, Bruno and Angular tests                     |
| Third hook provider                                  | End-to-end processing without infrastructure provider branches                               | Hook-loader contract integration                       |
| Stage 2 crosswalk conversion                         | History/approval/frozen-reference equivalence                                                | Vocabulary service, migration and UI tests             |

## 10. Commands and evidence collection

Use the current package scripts as the command source of truth; some older wiki examples predate the `:ci` script names. These commands are implementation verification requirements, not checks already run for this specification.

Focused backend builds and tests:

```bash
npm run compile:core
npm run compile:storage-mongo
npm run test:core
npm --prefix packages/sails-hook-redbox-storage-mongo run test:compile
npm run test:storage-mongo
```

Run storage integration inside the Docker development/test environment with `MONGO_TEST_URL` pointing at its disposable Mongo service. Without that setting some package integration tests skip; require it in CI and inspect test counts. Do not point destructive fixtures at a persistent development or production database.

Existing mounted save/provider integration paths:

```bash
RBPORTAL_MOCHA_TEST_PATHS="test/integration/services/RecordsService.test.ts test/integration/services/FigshareQueued.test.ts" npm run test:mocha:mount
```

Add the new publication/Oni integration files to that selection when created. CI runs the appropriate complete suites:

```bash
npm run compile:all
npm run test:mocha:ci
npm run test:bruno
npm run test:bruno:general:ci
npm run test:angular
npm run test:sails-ng-common
npm run lint
```

During UI development use the mounted Bruno general suite and the repository's documented browser-verification workflow. Add focused browser acceptance for multiple destinations and current status if unit/API checks cannot verify the visible flow.

For changed contracts, routes and documentation:

```bash
npm run validate:api-routes
npm run docs:test
npm run docs:audit
npm run docs:generate
```

Record commands, source commit, versions, environment, test counts/skips and results in the implementation verification record. Attach migration inventories and non-secret provider staging evidence. No broad repeated runs are required after unchanged checks pass; rerun affected layers after relevant code/configuration changes.

## 11. Release gates and risk ownership

The blocking release risks are: unsafe successful-save recovery, unidentifiable attachment content, missing OCFL reconciliation evidence, unnoticed custom hook compatibility changes, ambiguous remote binding ownership and overlapping consumers. Each has a named task and acceptance evidence above.

Scope boundaries are explicit: stage 1 needs dependable CLI repair and existing status/configuration surfaces; stage 2 owns shared crosswalk administration; Pure owns its later adapter implementation. Do not expand the first release into general concurrency-policy replacement, distributed remote transactions or a new synchronisation platform.

If a gate fails, keep affected processing disabled, retain evidence and fix the implementation. Local quarantines may isolate particular records/destinations, but a systemic storage/authority failure blocks the brand. After cutover, only compatible forward recovery is supported.
