# Shared publication framework: detailed design

Status: agreed design; implementation has not started.

Related documents:

- [Proposal and scope](../../../shared-publication-framework-for-figshare-and-oni.md)
- [Implementation plan](implementation_plan.md)
- [Task checklist](tasks.md)

This document defines the intended behaviour and contracts. The implementation plan defines delivery order; the checklist tracks executable work. Proposed types, filenames, configuration examples and command names below are design targets, not existing APIs.

## 1. Purpose and delivery boundary

Extract Figshare's durable publication processing into a shared framework and migrate Figshare and Oni to it. A record may target several named destinations, including several destinations using the same provider. Each destination has independent authorisation, work, remote identity, recovery evidence and status. Workflow advancement is coordinated centrally.

Deliver in two stages:

1. **Processing and migration:** shared lifecycle, Figshare and Oni adapters, unified configuration in the existing AppConfig editor, scoped authorisation, Mongo persistence, multi-destination workflow, status reporting, supported recovery CLI and one-way migration. Existing Figshare crosswalk administration and identifiers remain usable through adapters.
2. **Shared vocabulary administration:** generalised vocabulary/target-term/crosswalk contracts and administration, preserving approved revisions, history, references and provider mapping results.

Expose a provider extension contract suitable for subsequent integrations such as Elsevier Pure. Implement Pure separately. A test-only third provider must prove extensibility without provider branches in record persistence, dispatch or workflow code.

Withdrawal, remote deletion of publications, historical bulk republishing, bidirectional synchronisation and a general remote conflict-resolution interface are outside scope. Provider-owned managed-file removal remains supported where it is part of existing synchronisation; it is distinct from deleting a publication.

## 2. Current implementation and the changes required

### 2.1 Figshare

The relevant implementation lives in [FigshareService](../../../packages/redbox-core/src/services/FigshareService.ts), [figshare-v2](../../../packages/redbox-core/src/services/figshare-v2/README.md), [FigshareSyncModel](../../../packages/redbox-core/src/model/storage/FigshareSyncModel.ts) and the Mongo storage hook. The [queued synchronisation guide](../../wiki/Figshare-Queued-Synchronisation.md) explains the current operation and recovery model.

Current saves persist protected `figshareSyncIntent` data alongside record metadata. Finalisation marks successful saves ready or abandons failed save entries. The dispatcher imports ready generations into durable sync state before acknowledging the source intent. Queue messages are wake-ups; durable state survives missed or duplicate delivery.

The worker already implements leases, heartbeats, source-generation checks, uncertain create/publication evidence, managed-file receipts, curation waits, impersonation, guarded projections and confirmed-publication workflow checks. Preserve these guarantees while changing their ownership and keys.

Current source policy is **eligible-save authorisation**, not approval of immutable content. [source-intent.ts](../../../packages/redbox-core/src/services/figshare-v2/source-intent.ts) stores policy identity, execution condition and requester, then checks current hook configuration and current record eligibility. This feature adds explicit approval scope; it must not merely rename existing state.

Current [sync-store.ts](../../../packages/redbox-core/src/services/figshare-v2/sync-store.ts) has one row per OID and exclusive `(API namespace, articleId)` bindings. Replace the row key for multiple destinations while preserving exclusive remote ownership across destination rows.

### 2.2 Oni

[OniService.exportDataset](../../../packages/redbox-core/src/services/OniService.ts) currently builds a crate, writes OCFL, optionally ingests the repository, persists metadata and returns the updated record. Remote failures can reject the save hook with `RBValidationError`. Its [runtime](../../../packages/redbox-core/src/services/oni-v2/runtime.ts) and [repository](../../../packages/redbox-core/src/services/oni-v2/repository.ts) do not provide durable, cross-process operation reconciliation.

The crate builder generates publication timestamps and reads people/related records; the repository opens attachment streams during execution. Stable retry content therefore requires a sealed source description and persisted generated values, rather than rebuilding from whatever happens to be current on each attempt.

The [ingestion implementation](../../../packages/redbox-core/src/services/oni-v2/ingestion.ts) rebuilds structural and search indexes and accepts repository-level readiness. That is not evidence that this object/version is publicly discoverable. Preserve the existing ingestion baseline and report its evidence accurately.

### 2.3 Shared host contracts

- Add services and models through their core export indexes so redbox-loader generates shims. Do not hand-edit generated `api/` shims. Follow [Services Architecture](../../wiki/Services-Architecture.md).
- Extend [RecordWriteOptions](../../../packages/redbox-core/src/RecordWriteOptions.ts), [StorageService](../../../packages/redbox-core/src/StorageService.ts) and [RecordStorageConcurrency](../../../packages/redbox-core/src/RecordStorageConcurrency.ts), preserving existing revision and lifecycle mutation contracts.
- Register configuration through [ConfigModels](../../../packages/redbox-core/src/configmodels/ConfigModels.ts) and use [AppConfigService](../../../packages/redbox-core/src/services/AppConfigService.ts) for brand overrides, secret references and masking.
- Extend [RecordAuditController](../../../packages/redbox-core/src/controllers/RecordAuditController.ts) and [IntegrationAuditService](../../../packages/redbox-core/src/services/IntegrationAuditService.ts). The current Figshare live summary is a useful extraction seam; there is no separate existing IntegrationStatusService to replace.

## 3. Behavioural invariants

1. A failed save never authorises publication of that failed save's content.
2. Every remote mutation belongs to one current destination request and a valid approval or explicit auto-sync policy.
3. Approval covers a source content revision, selected attachment versions, material mapping/configuration and a fixed destination set. Queue delivery is not authorisation.
4. A new source revision cannot silently inherit an old approval. Auto-sync is an explicit policy that can authorise a fresh revision.
5. Status, link and approved internal workflow writes cannot create a publication feedback loop or revoke otherwise unchanged outstanding work.
6. Work and failures are destination-specific. An `all` or `any` workflow rule changes local advancement, not the independence of remote outcomes.
7. At most one managing binding owns a provider-defined remote object across all brands, records and destinations in the deployment's publication datastore.
8. A worker with a lost lease cannot checkpoint or begin another mutation. Requests already sent may still complete and must be reconciled.
9. Unknown remote outcomes are evidence to investigate, not permission to repeat non-idempotent operations.
10. Completion is current provider-confirmed evidence for the approved request. Historical links or an audit success alone cannot satisfy a new request.
11. Migration is one-way, repeatable and evidence-preserving. Recovery pauses, reconciles, repairs and rolls forward.

## 4. Architecture and responsibilities

Introduce `PublicationService` and focused modules under `packages/redbox-core/src/services/publication/`. Keep orchestration in one service with internal modules, rather than creating a new framework of independently registered services.

The service exports bootstrap, provider registration, configuration validation, source-request preparation, durable request acceptance, wake-up, dispatch, worker execution, status and authorised administrative operations. Exact exported names are fixed during the contract task and documented as extension points. Existing provider methods delegate through this boundary.

Responsibilities are divided as follows:

- **RecordsService and storage:** trusted request construction, atomic source writes/invalidation, save finalisation, exact-generation acknowledgement and conditional record projections.
- **PublicationService:** registry, source/approval checks, scheduling, leases, operation journal, retries, audit lifecycle, workflow evaluation and recovery orchestration.
- **Provider adapters:** configuration narrowing, mapping context, payload/crate construction, remote identity, API sequencing, reconciliation, provider checkpoints and observation semantics.
- **Existing AppConfig/status surfaces:** configuration and user-visible results. They do not start remote work simply by rendering a page.
- **Recovery CLI:** access-checked commands invoking the same service contracts as workers, with processing startup disabled in its application process.

Native Mongo collections remain the processing store, matching Figshare's current implementation. This change does not add an ORM, queue backend or publication persistence platform.

## 5. Configuration and destination identity

### 5.1 Unified AppConfig

Add `publicationPublishing`, versioned independently from provider-state versions. It contains:

- `schemaVersion`;
- shared processing defaults and the per-brand local service identity;
- named `destinations`, keyed by stable ID;
- source policies referencing configured record events/hooks;
- central workflow rules with a stable rule ID, record type, destination list, target stage and `completion: 'all' | 'any'`.

A destination contains `provider`, a display name, processing enablement, connection settings, provider-specific mapping, attachment selection, write-back paths and provider lifecycle options. Provider schemas retain their distinct payload structure; sharing binding types does not flatten Oni configuration into Figshare configuration.

Illustrative configuration envelope; provider sections must be populated and validated against their schemas before enablement:

```json
{
  "schemaVersion": 1,
  "processing": {
    "enabled": false,
    "serviceUsername": "publication-worker",
    "serviceUserType": "local",
    "coalesceMs": 5000,
    "leaseMs": 120000,
    "heartbeatMs": 20000,
    "maxAttempts": 5,
    "retryBaseMs": 60000,
    "observationMs": 120000,
    "cleanupMs": 300000
  },
  "destinations": {
    "figshare-main": {
      "provider": "figshare",
      "displayName": "Institutional Figshare",
      "enabled": false,
      "connection": {},
      "mapping": {},
      "attachments": {},
      "writeBack": {},
      "providerOptions": {}
    },
    "oni-research": {
      "provider": "oni",
      "displayName": "Research repository",
      "enabled": false,
      "connection": {},
      "mapping": {},
      "attachments": {},
      "writeBack": {},
      "providerOptions": {}
    }
  },
  "sourcePolicies": [],
  "workflow": {
    "rules": [
      {
        "id": "data-publication-complete",
        "recordType": "dataPublication",
        "destinations": ["figshare-main", "oni-research"],
        "completion": "all",
        "targetStage": "published"
      }
    ]
  }
}
```

Carry the existing Figshare processing defaults into initial shared defaults and preserve migrated overrides. Validate positive durations and `leaseMs >= 3 * heartbeatMs`. Readiness waits and retry episodes remain separate; avoid multiplying transport retries and durable attempts into an uncontrolled retry storm.

### 5.2 Fixed remote targets

A destination's ID is stable within its brand. Once referenced by approval, binding or operation evidence, it cannot be reassigned to a different provider or remote target. Providers compute a canonical target fingerprint from non-secret identity-bearing settings: for example the Figshare API environment/account context or Oni storage root and repository identity.

Changing targets requires a new destination ID. Credential rotation, compatible endpoint aliases and display-name changes may retain identity only when the adapter verifies that the remote target remains the same. A different credential resolving to a different account must not silently adopt old bindings.

Disabling processing pauses mutations and retains state. Archiving removes a destination from new selection but retains old approvals, binding ownership, history and repair evidence. An approved `all` set does not shrink when an administrator disables or archives a destination; revise/revoke the request explicitly if the desired set changes.

### 5.3 Validation and secrets

Reject unknown providers, duplicate/invalid IDs, missing destinations in workflow rules, empty destination sets, invalid bindings and unsafe write-back paths. Reject overlapping write-back paths across destinations, including ancestor/descendant and array-root conflicts; two destinations cannot independently replace `metadata.links` and `metadata.links.oni`.

Use the existing AppConfig secret metadata and secret-store mechanisms, including wildcard paths for named destinations. Provider registration supplies its secret paths/schema; hook providers must receive the same masking behaviour as built-ins. Never persist resolved credentials in approvals, plans, queue messages, audit summaries or migration reports. Operational settings and credential values are excluded from content-approval fingerprints; remote target identity is included.

Brand-level unified configuration is authoritative once cutover commits. A missing/invalid provider section then produces a configuration error; it does not reactivate legacy configuration. Legacy configuration is read only for unmigrated brands.

## 6. Source content and authorisation

### 6.1 Approval and auto-sync policies

Existing configured workflow transitions/hooks grant approval. There is no new approval interface in stage 1. Trusted server code resolves the destination set and evaluates requester-dependent grant conditions when handling the source event.

Each source policy has a stable ID and mode:

- **approval:** the event authorises exactly the prepared source revision and destination set;
- **auto-sync:** an explicitly configured eligible save can authorise a fresh source revision for its destination set.

Store requester, actual approver, creator where required, policy ID/version and non-secret attribution snapshots. Do not substitute the background service user for the historical approver. Approval is institutional: disabling the original requester does not itself revoke it. Current service permissions, current continuation policy and explicit revocation remain enforceable.

Separate grant conditions from continuation conditions. A source-stage condition such as `workflow.stage === 'queued'` can gate granting approval without cancelling outstanding approved destinations when the framework advances the record to `published`. Current security/business restrictions that must remain true belong in continuation checks. Migration may translate known declarative cases, but arbitrary customer hook expressions require review; do not strip stage clauses through an unsafe string rewrite.

### 6.2 Content identity

Do not use raw `recordVersion` as approval identity: all record writes can increment it, including link/status maintenance. Keep storage revision tokens for conditional writes and a separate monotonically increasing publication source revision for meaningful source changes.

Prepare a non-secret, canonical source descriptor containing:

- relevant source metadata and snapshots of related-record/person inputs consumed by the mapping;
- the sorted destination set and per-destination target identity;
- material mapping/selection/embargo configuration and approved crosswalk revision references;
- selected attachment identity, logical path, size and immutable version or content digest;
- deterministic generated values needed to reproduce output, including Oni publication timestamps;
- the mapping-context/adapter contract version and the scope of fields managed remotely.

Hash the descriptor with a versioned canonical encoding. Preserve array order where it affects provider output. Providers may narrow declared dependencies; arbitrary expressions must conservatively include every input they can consume. Unrelated operational fields, secrets, defined status/link outputs and the framework's expected workflow projection are not content inputs for that request.

Persist prepared source descriptors on the configured durable Flydrive staging disk and store their digest/reference in protected source state. Use brand-scoped immutable keys and verify digests when reopening. This avoids duplicating potentially large snapshots/manifests in every record or destination row. A staging disk must be accessible to all eligible workers and survive process restarts; process-local temporary files are insufficient for distributed deployment.

Attachment approval must refer to identifiable bytes. Reuse trustworthy upload digests or immutable datastore version tokens. If neither exists, preflight stages/hashes the selected stream and checks for concurrent change before accepting approval. Ordinary draft saves do not hash every attachment. Explicit approval can incur this local preparation cost; auto-sync preparation failures are recorded per destination and cannot produce runnable authorisation for unidentified content. Sharing prepared bytes across destinations avoids duplicate staging.

Once accepted, adapters consume the sealed descriptor and matching bytes, not fresh mutable inputs. Re-check current source identity before each mutation. A later source change invalidates old work even though the old prepared snapshot remains available for reconciliation. Changes outside normal save paths are detected by referenced-version/fingerprint validation; where the storage cannot establish a stable version, use verified staged bytes rather than assuming a live stream is unchanged.

Generated timestamps are allocated once per request and reused on retries. Remote lookup results needed to translate semantic inputs into provider IDs are checkpointed before mutation; do not let a retry silently select a different external identity. Material adapter/configuration changes invalidate pending approval unless an explicitly tested, content-preserving version migration proves equivalence.

### 6.3 Save-time validation

Ordinary draft saves remain available under existing form/record validation. Publication mapping errors are not a new blanket prohibition on saving drafts.

An explicit approval event locally validates all selected destinations before granting the set. Any local failure rejects that approval; no destination from it becomes runnable. Auto-sync validates and records errors independently, allowing valid destinations to proceed while invalid destinations show an actionable status. No provider mutation occurs in preflight.

Persisting a content change invalidates older approvals even if it creates no new valid request. Otherwise a draft edit or invalid auto-sync save could leave an old worker authorised to publish stale content. Server-owned maintenance writes are exempt only through the narrow classification in section 10.

### 6.4 Revocation and in-flight calls

Revocation is an audited change to the protected approval epoch/state. Workers check it before each mutation, attempt transport cancellation and stop later mutations. Do not lock the record throughout remote processing.

A call already sent may succeed after source change, revocation or lease loss. Reconciliation may record that historical outcome but cannot treat it as completion for newer content, resume mutations under revoked approval or advance the newer workflow. Revocation does not withdraw an already public publication.

## 7. Durable data and storage capability

### 7.1 Protected record source state

Add a server-owned `publicationSource` field and `publicationIntent` internal write option. Incoming record JSON and ordinary hook options cannot manufacture or overwrite these fields.

The protected record state holds:

- schema version and publication source revision;
- approval IDs/epochs with policy, destination-set, source-descriptor references and attribution;
- per-destination requested generation and pending/readiness information;
- save-token entries needed to finalise or abandon individual overlapping saves;
- central workflow decision identity for idempotent advancement.

Store only bounded current authorisation/intent data here. Older operational evidence and audits remain in processing/audit stores. Do not evict an unimported obligation to bound the document; use backpressure and an actionable failure before the record's document limit is approached.

Every content save atomically writes source invalidation and any new intents alongside source metadata. Generations advance per affected destination; one failed overlapping save must not erase a later successful save's obligation. Importers match exact destination generations and source/approval identity.

### 7.2 PublicationSync

Introduce a `PublicationSync` model/native collection with unique `(brandId, oid, destinationId)`. Each row contains:

- schema version, provider ID and provider-state version;
- source generation, approval ID/epoch and content/configuration digests;
- monotonic store revision, lease owner/token/expiry and dispatch cooldown;
- requested/processed obligations and due times for synchronise, observe and authorised provider maintenance;
- status, waiting reason and bounded retry episode;
- binding identity and denormalised canonical remote identity for uniqueness;
- operation journal/checkpoints and adapter-owned provider state;
- current completion evidence, links and audit correlation;
- correction history references.

Keep Figshare create/publish evidence, receipts and ownership semantics inside typed Figshare provider state. Do not translate every Figshare phase into a mandatory phase for all providers. Persist old evidence byte-for-byte where possible, with versioned conversion where required.

Indexes cover the unique work key, due work, expired ownership/recovery and a partial unique `(providerId, remoteNamespace, remoteObjectId)` binding key. Missing bindings do not participate in the partial unique index. All reads/writes verify brand ownership even when an index is global.

Provider namespace canonicalisation must describe the actual remote resource, not merely a configurable destination label. Figshare uniqueness retains API namespace/article identity across account and brand labels. Oni uses the actual OCFL repository namespace/object identity. Two destinations for the same record cannot both manage the same remote object.

### 7.3 Shared provider resources

Oni root-collection maintenance and repository-wide indexing are shared across records. A destination-record lease alone cannot protect them. Add a small `PublicationResourceLease` collection/helper keyed by provider, canonical namespace and resource key. It provides the same conditional ownership/heartbeat guarantees as record work and carries resource-operation recovery evidence where necessary.

Adapters request resource ownership through the shared execution context. Root collection writes and ingestion runs are serialised for their repository; unrelated repositories and ordinary record work remain independent. Expiry changes who may acquire a lease; it never deletes uncertain resource-operation evidence. Initially perform an ingestion run after that request's confirmed OCFL commit. Coalescing many requests into one rebuild is optional later optimisation, requiring proof that the run covers each included commit.

### 7.4 Capability contract

Extend `StorageServiceCapabilities` with a versioned `publication` capability, independent of `recordConcurrency`. Version 1 certifies atomic source/invalidation writes, per-save ready/abandon, exact-generation acknowledgement, bounded pending scans, safe interrupted-save recovery and conditional output projections.

Mongo is the initial supported implementation. Capability checks run before enablement, on source request acceptance and at dispatcher/worker boundaries. Missing/unknown capability prevents publication processing with a clear error. Method presence alone is insufficient. Ordinary non-publication record operations remain governed by their existing capabilities.

Use existing strict record concurrency and lifecycle preconditions where applicable. Do not weaken them or turn this feature into a new general concurrency policy for every record type.

## 8. Save, dispatch and worker algorithms

### 8.1 Source commit and readiness

1. Resolve brand authority, provider registry and enabled source policies; classify the operation as content, approval, revocation or trusted maintenance.
2. Prepare and validate the candidate source descriptor without provider mutation. Stage required immutable inputs; their existence alone does not grant authority.
3. Construct trusted write options containing invalidation, approval/auto-sync evidence and per-destination requests. An explicit approval with local errors produces no grant.
4. Atomically persist record metadata and protected source state using current storage/lifecycle preconditions. Track a unique save token while synchronous hooks and save effects are incomplete.
5. Finalise only that save's entry as ready when the save tracker reports complete and committed source/dependency identity still matches the prepared descriptor. If synchronous hooks changed publication inputs, prepare and validate the resulting committed source before granting ready authority; an earlier snapshot must not become runnable against different final content. On known failure, abandon that entry and retain conservative invalidation/evidence.
6. Request a best-effort wake-up after durable acceptance. Wake-up failure leaves scan-visible pending work.

Review interrupted-save recovery as a correctness gate. A timeout alone is not proof that a save succeeded. Recover a stale initialising entry only from durable successful-save evidence and matching source identity; explicitly abandoned/failed saves are never promoted. If current save tracking cannot prove success after a crash, add durable save-outcome evidence or quarantine the entry. Preserve the liveness of proven successful saves without weakening the failed-save invariant.

Standalone compatibility calls may authorise only a committed source record after current access/policy checks and a conditional source-state write. A call made inside an unfinished save must register with that save's tracker, not publish or mark the intent ready independently. Do not enqueue an arbitrary caller-supplied record snapshot before its save commits.

### 8.2 Import and wake-up

1. Scan ready source entries with stable pagination, including records left pending by missed wake-ups.
2. Idempotently import each destination obligation into its sync row, preserving any newer generation already present.
3. Acknowledge only the imported destination generation after durable import. Importing one destination must not acknowledge its siblings.
4. Dispatch due rows through `Publication-SyncRecord` jobs containing identifiers only: brand, OID and destination ID. Messages do not carry users, credentials, payloads or authoritative approval state.
5. Rescan durable due work when a delivery is lost. Duplicate deliveries compete for the same lease and cannot duplicate ownership.

Bound scans and avoid starving later rows behind paused brands/destinations. Pause delays dispatch without marking work processed or discarding evidence.

### 8.3 Worker execution

1. Load the current record and destination, validate brand/provider identity and capability, then acquire the conditional destination lease.
2. Resolve the current local service identity and its edit access; load the current approval/auto-sync scope and continuation policy.
3. Verify source, attachment and material configuration identity. Use the sealed inputs; resolve runtime credentials separately.
4. Reconcile prior submitted/uncertain operations before deciding whether a new mutation is allowed.
5. Before every mutation, assert record existence, current authorisation epoch/source generation, current service/edit permissions, configuration identity, relevant provider locks and lease ownership. Persist operation intent before the external call.
6. Execute the provider step with cancellation/heartbeat support. Persist confirmed results/checkpoints under the same ownership token and expected row revision.
7. Apply current-generation link/status projections conditionally; evaluate central workflow completion if applicable.
8. Persist a typed outcome and the next due time, close terminal audit episodes once, and release ownership conditionally.

A record deletion cancels further mutation and retains remote evidence; it does not delete the remote publication. A restored or moved record cannot automatically adopt an earlier approval from a different lifecycle/brand.

### 8.4 Outcomes and retry policy

The provider contract returns `completed`, `waiting`, `retryable_failure` or `repair_required`, with evidence and a safe next-check suggestion. Generic status also includes queued, running, retrying, failed, superseded, revoked and paused states where applicable.

- Waiting for manual Figshare publication, curation or an embargo is not a failed transport attempt.
- Retryable failures use a bounded episode, backoff/jitter and provider rate-limit hints. Preserve migrated settings; default durable attempts remain five.
- A successful readiness observation clears its recovered observation-error episode without erasing an unfinished source-sync failure.
- Exhausted failures remain visible and require an authorised resume or fresh eligible request. Resume does not erase uncertain-operation evidence.
- Operation uncertainty must be reconciled even when the HTTP error class would otherwise be retryable. No generic automatic retry of creates, publishes or OCFL commits after an unknown outcome.

## 9. Provider extension contract

Register built-ins through `PublicationService` and expose a protected registration/extension method for the existing `registerRedboxServices` override mechanism. Bootstrap freezes provider IDs; reject duplicate incompatible registrations. A hook override extends the core service and registers its adapter before processing starts.

Adapters supply:

- stable provider ID and state/contract versions;
- configuration schema, secret metadata and supported capabilities;
- local source validation and deterministic source preparation;
- canonical target/remote-object identities;
- read/reconcile, synchronise and observe entry points;
- typed binding/checkpoint/state decoding and explicit state upgrades;
- completion evidence and provider-specific repair descriptions/actions.

Conceptual boundary:

```typescript
interface PublicationProvider<Config, State, PreparedSource> {
  readonly id: string;
  readonly stateVersion: number;
  validateConfiguration(value: unknown): ValidationResult<Config>;
  prepareSource(input: SourcePreparationInput<Config>): Promise<ValidationResult<PreparedSource>>;
  reconcile(context: ProviderExecution<Config, State, PreparedSource>): Promise<ProviderOutcome<State>>;
  synchronise(context: ProviderExecution<Config, State, PreparedSource>): Promise<ProviderOutcome<State>>;
  observe(context: ProviderExecution<Config, State, PreparedSource>): Promise<ProviderOutcome<State>>;
}
```

The execution context supplies sealed inputs, runtime credentials, cancellation, checkpointing, guarded mutation/journalling, resource leases and audit summaries. Providers cannot bypass authority checks by calling a raw client from a save hook. Runtime JSON is narrowed/validated at the adapter boundary; do not use `any` casts to evade contracts.

Do not add Pure-specific phases or guessed fields. Document what a subsequent Pure adapter would implement and which real API capabilities require investigation. The test provider deliberately uses a lifecycle unlike Figshare's article/upload flow.

## 10. Write-back and central workflow

Apply outputs through the current internal record-mutation/concurrency APIs with expected revision and allowed field paths. On a stale write, reload and verify approval/source identity before retrying a narrow projection. Never replace a whole stale record to save one URL.

Trusted maintenance classification covers only registered status/link fields and the coordinator's expected workflow projection. It does not grant arbitrary hooks an exemption from source invalidation. If transition hooks change mapped metadata, selected attachments or another publication input, that is a real content change and must create/invalidate source work normally.

Record the coordinator decision ID with the workflow change under the record's conditional write. Derive it from rule/version, approval set and target stage so competing destination workers apply one logical transition. If the target is already reached for that decision, subsequent evaluations are idempotent. Preserve partial-transition failure evidence; do not blindly replay side-effecting hooks.

Evaluate rules using the approved destination set and expected current content identities:

- `all`: every listed destination has current completion evidence;
- `any`: at least one listed destination has current completion evidence.

For both policies, require current continuation/service permissions, no newer pending source revision and no unresolved source work for the destination being counted complete. Outstanding work for the **same** approved request in other destinations does not block `any`.

The coordinator's stage change preserves remaining approvals and does not reapply their original grant-stage gate. Continue synchronising them until completion, explicit revocation, relevant content change or lost current permissions. Keep partial success visible; neither rule promises a transaction across remote services or triggers compensating withdrawal.

Historical completion remains history after a new revision. Do not automatically move a record backward in workflow when a later auto-sync fails; show that the latest content is pending/failed separately. New workflow rules cannot silently reinterpret an old approval's destination set.

## 11. Figshare adapter

Extract shared mechanics first and wrap the current Figshare modules with minimal sequencing changes. Preserve custom hook/service override behaviour, including the actual customised metadata payload used for equivalence and recovery hashes.

Required retained behaviour:

- verified token/account context and create-as-owner impersonation, preserving the bound owner;
- exclusive article identity and provisional create-token recovery;
- uncertain creates/publications never repeated blindly;
- receipt-owned file lifecycle, checksums, unchanged-file optimisation and explicit interrupted-upload repair;
- unmanaged custom fields and foreign files retained;
- curation lock waits across metadata, files, embargo and publication;
- existing manual/automatic publication modes and embargo/accessibility interpretation;
- confirmed remote publication before counting the destination complete.

ReDBox is authoritative for the fields/files explicitly managed by its approved plan. An authorised sync can overwrite remote edits to those fields when provider locks allow. Do not introduce bidirectional merge or a new conflict interface.

Legacy Figshare service/queue methods resolve the migrated destination and delegate. Old jobs carrying article IDs/users may be accepted for compatibility, but their payloads cannot override current binding or authorisation. Resolve the original destination from migration metadata; ambiguity requires repair rather than guessing the first configured Figshare destination.

## 12. Oni adapter

### 12.1 Checkpointed sequence

Use provider-specific checkpoints:

1. `prepared`: sealed crate inputs, generated values, logical file manifest and intended content hash are durable;
2. `ocfl_submitted`: operation ID, repository/object identity, expected prior inventory/head and desired hash are durable before commit;
3. `ocfl_confirmed`: read-back proves the stored object content matches the intended crate and file manifest; record the actual version/inventory evidence;
4. `ingestion_confirmed` or `ingestion_not_required`: configured repository indexing has completed after the confirmed deposit;
5. `projection_confirmed`: current links/status have been conditionally persisted.

The adapter's confirmed deposit plus configured ingestion satisfies provider completion. Local projection failure does not cause another OCFL write: retry projection from preserved evidence, and do not advance workflow until the current guarded record update can be evaluated safely.

### 12.2 OCFL recovery

Extend the OCFL wrapper with verified inventory/head/content reads supported by the pinned OCFL library and Flydrive driver. The implementation must prove these reads against FS and S3-backed fixtures before enabling the adapter.

When an interrupted commit is found:

- matching desired crate and attachment manifest confirms the existing version; continue to ingestion/projection;
- positively confirmed non-application with unchanged expected head permits retry under current authorisation;
- a different/unexplained head or incomplete evidence requires repair; do not create another `REPLACE` version just because the previous call timed out.

Use the prepared attachment bytes and stable publication timestamp for retries. Existing historical object identifiers and URLs are preserved. Do not label an old object ingested merely because it exists.

Serialize shared root-collection mutations and ingestion with repository resource leases. A global index reporting ready before this request's deposit cannot satisfy its ingestion step. Repository-level readiness after a requested rebuild remains weaker than object-level visibility and must be labelled accordingly.

### 12.3 Identities and compatibility

Keep source requester, actual approver and creator snapshots distinct from the configured background persistence identity. Preserve the existing RO-Crate history/person mapping, with fixtures covering distinct users and a departed approver.

`exportDataset` retains its method/signature and record return shape. It resolves after durable request acceptance (or registration with the containing save), not after remote completion. Do not fabricate a citation URL or return a job descriptor where a hook expects a record. Local explicit-approval validation can still reject; remote errors appear in background status.

Existing links may remain on the record while a new request is pending, but status identifies which revision they describe. Customer hooks that inspect immediate citations or depend on remote exceptions require review and migration before activation. No synchronous-publication fallback is provided.

## 13. Bindings, mappings and crosswalk stages

### 13.1 Shared primitives in stage 1

Consolidate the `path`, Handlebars and JSONata binding definitions, validation and evaluation under the existing `integration-v2` utilities. Keep provider context builders and output construction separate.

Preserve null/default/empty-string handling, expression evaluation behaviour, allowed helpers and async JSONata results with golden mapping fixtures. Figshare contributor bindings sometimes run against a contributor, while Oni mappings use a crate context; do not replace these with one uniform record root.

Keep Figshare crosswalk resolution and the existing editor operational through compatibility adapters. Resolve/pin approved revision references in prepared source evidence. A later change to the approved pointer must not silently change an existing approval's output.

### 13.2 Shared vocabulary administration in stage 2

Introduce shared vocabulary source, target-term and approved crosswalk revision contracts. Target identity is a namespaced string, not an integer category ID. Provider payload adapters may still convert verified Figshare terms to numeric API category IDs.

Retain Figshare category import as a source adapter, including account/public scope and historical target handling. Provide generalised resolution and administration through core services/controllers and embedded Angular projects, following existing app/service patterns rather than introducing a new SPA.

Migrate IDs unchanged where possible; otherwise persist an explicit brand-scoped translation map used by legacy bindings and routes. Preserve drafts, revisions, approval identity, approval time, historical terms and audit links. Frozen publication approvals continue resolving their original crosswalk revisions after migration.

Stage 2 has a separate dry-run/apply/verification gate and also rolls forward only. Stage 1 does not rename/drop the Figshare vocabulary collections or require the new editor to operate.

## 14. Status, audits and recovery

### 14.1 Existing integration status interface

Extend the access-checked status response with destination ID/name, provider, approval/source revision, work status, waiting/repair reason, retry timing, links and completion evidence. Render one distinguishable destination entry, not one provider row that overwrites its siblings.

Overlay ready-but-unimported intents so a user sees pending work immediately after a save/reload. Preserve existing non-publication integration summaries and historical Figshare/Oni integration names. Legacy provider filters return relevant destination rows; optional destination filtering remains access-checked.

Distinguish completed deposit/publication, embargo/accessibility, ingestion and visibility. In particular, an Oni success badge must not claim object discoverability without evidence. Do not infer latest success solely from an old citation URL.

### 14.2 Audit and observability

Correlate by brand, record, destination, approval, source generation, operation ID and provider. Maintain one logical audit context per work episode and bounded terminal/publication events. Polling waits do not generate repeated failure audits. Preserve historical audit rows; add identity fields without rewriting old history.

Expose queue/source lag, oldest pending age, active leases, waiting reasons, retry/repair counts and migration quarantine counts. Keep payloads, credentials and private prepared snapshots out of user-facing summaries and ordinary logs. Audit correction actor, reason and evidence references.

### 14.3 Recovery CLI

Add `support/publication/admin.js` following the existing Figshare admin loader pattern. Proposed operations: `inspect`, `reconcile`, `pause`, `resume`, `revoke`, `link`/`relink` where supported, provider-specific repair, and migration dry-run/apply. Commands identify brand, OID and destination explicitly unless operating on a whole brand.

Require a current administrator and relevant record edit access for mutations. `inspect` and `reconcile` are read-only. Corrections default to dry-run and require explicit apply/reason. Pause/drain competing consumers and refuse repairs while an active worker/resource lease owns the operation.

Resume preserves prior uncertainty and file ownership receipts. Repair cannot infer file ownership from names, discard unknown outcomes, repoint destination identity or manufacture publication success. Keep existing Figshare operator command names as forwarding adapters where their semantics remain valid.

## 15. One-way migration and activation

Use a versioned, per-brand migration journal with deterministic destination-ID assignments, source fingerprints, conversion progress, conflict/quarantine reports and verification counts. Keep this journal separate from user-editable AppConfig so a config edit cannot erase cutover authority. Its committed authority marker determines whether shared or legacy processing owns a brand.

Migration stages:

1. **Inventory/dry-run:** read configuration, hook/site references, storage capabilities, state schemas, bindings, receipts, unresolved operations, Oni object IDs, write-back collisions and crosswalk references. Report explicit auto-sync translations and custom hook review requirements. Never display secrets.
2. **Pause/drain:** stop all consumers/schedules for the brand across deployed processes and prevent new publication acceptance during the cutover window. Allow ordinary draft saves only where source handling remains safely fenced. Wait for leases/in-flight calls to settle; inspect uncertain calls.
3. **Prepare:** create destination assignments and unified configuration with processing disabled. Verify target identities, service access, required indexes and staging storage. An uncommitted preparation marker keeps both new processing and accidental authority switching fenced.
4. **Convert:** idempotently copy source intents, sync state, bindings, receipts, checkpoints, retry/audit context and operation uncertainty. Keep legacy rows read-only as evidence; do not run their workers. Use deterministic migration IDs and conditional progress writes so restart cannot overwrite newer converted evidence.
5. **Verify/commit authority:** compare inventories and evidence counts/hashes, classify eligible pending work, detect duplicates and quarantine affected record/destination groups. Commit the brand authority marker only after global checks pass. Once committed, unified configuration is authoritative even while processing remains disabled.
6. **Stage/activate:** verify representative real-provider scenarios, then explicitly enable the brand/destinations. Record operator acceptance and monitor lag, retries, repairs and projections.

One uncertain record/destination does not block unaffected work once brand-wide requirements pass. Duplicate remote writers quarantine the entire conflicting group until ownership is resolved. A missing capability, invalid configuration/secret registration, unsafe index or ambiguous brand authority blocks activation for the brand.

Migrate existing authorisation deliberately: known ongoing save-triggered policies become explicit auto-sync policies; genuinely authorised pending work retains its requester and policy provenance. Historical links without such authority are observation-only and cannot trigger new writes or workflow advancement. Unknown historical Oni ingestion remains unknown until checked through the configured flow.

Repeated dry-run/apply produces stable IDs and no duplicate operations, history or approvals. Once cut over, repairs roll forward using a compatible shared worker. There is no reverse converter, `down` migration or supported return to legacy consumers. Backups remain disaster-recovery assets, not a promise of safe application rollback over remote operations.

## 16. Acceptance and implementation constraints

Stage 1 is accepted only when both providers pass equivalent pre-existing behaviour plus the new approval, multi-destination, migration and crash-recovery cases in the [implementation plan](implementation_plan.md). Preserve existing Figshare safeguards as release gates rather than treating passing shared unit tests as a substitute.

Prove Oni OCFL reconciliation on the pinned library/storage drivers, publication input reproducibility, failed-save handling after process interruption, and the `any` continuation case. These are implementation gates, not unresolved product decisions.

Use exact dependency versions if a dependency change proves necessary. Prefer existing Mongo, Flydrive, hashing, schema, queue and integration utilities; do not add a dependency merely to rename existing functionality.

Operational wiki pages and generated configuration/extension references are delivery artifacts. This specification is the design record; operator-facing instructions belong under `support/wiki/` and generated contract metadata belongs in source as described by [Generated Reference Documentation](../../wiki/Generated-Reference-Documentation.md).

## 17. Decision traceability

These decisions are fixed inputs to implementation. Technical verification gates establish how to deliver them safely; they do not silently weaken the agreed behaviour.

| Decision | Required behaviour                                                                         | Design sections | Main tasks     |
| -------- | ------------------------------------------------------------------------------------------ | --------------- | -------------- |
| D01      | Processing first; shared crosswalk administration follows                                  | 1, 13           | PUB-21–PUB-25  |
| D02      | Approval covers source revision and destination set; auto-sync is explicit                 | 6               | PUB-04, PUB-07 |
| D03      | Independent remote outcomes; completion policy gates local workflow                        | 3, 10           | PUB-12, PUB-13 |
| D04      | One-way migration and forward repair only                                                  | 15              | PUB-16, PUB-20 |
| D05      | Unified AppConfig first; existing Figshare crosswalk administration retained initially     | 5, 13           | PUB-03, PUB-14 |
| D06      | Material content/configuration changes need fresh authority; operational changes do not    | 6.2             | PUB-04, PUB-07 |
| D07      | Remaining approved destinations continue after an any transition                           | 10              | PUB-12         |
| D08      | Quarantine local ambiguity while allowing globally safe work                               | 15              | PUB-15, PUB-16 |
| D09      | Existing configured events/hooks grant approval; no new approval UI initially              | 6.1             | PUB-07         |
| D10      | Approver departure alone does not revoke institutional approval                            | 6.1, 12.3       | PUB-07, PUB-11 |
| D11      | Oni completion is intended OCFL content plus configured ingestion; visibility is separate  | 12.1, 14.1      | PUB-11, PUB-13 |
| D12      | Supported recovery CLI is sufficient for the first release                                 | 14.3            | PUB-15         |
| D13      | Reconcile late requests after cancellation without locking records throughout publication  | 6.4, 8          | PUB-08, PUB-18 |
| D14      | Draft, explicit approval and auto-sync have distinct validation boundaries                 | 6.3             | PUB-07         |
| D15      | A used destination ID retains its remote target                                            | 5.2             | PUB-03, PUB-05 |
| D16      | ReDBox owns managed content; preserve unmanaged content and provider locks                 | 11, 12          | PUB-09, PUB-11 |
| D17      | Oni keeps method/record shape with durable acceptance and asynchronous results             | 12.3            | PUB-11, PUB-19 |
| D18      | Mongo initially; require explicit storage capabilities and refuse unsafe fallbacks         | 7.4             | PUB-06         |
| D19      | One managing binding per provider-defined remote object across destinations/brands/records | 7.2             | PUB-05, PUB-16 |
