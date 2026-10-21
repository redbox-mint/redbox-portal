# Publication extension boundary

`PublicationService` is exported through the core service index; `PublicationSync` is exported through the Waterline model index. The normal loader generates both shims. Constructors do not register providers or start jobs.

## Adapter trust and failure model

Provider adapters are **trusted in-process code installed by the institution**.
They may be buggy; they are not treated as hostile. The framework checks the
supported adapter boundary to stop honest mistakes from accepting invalid state
or duplicating or falsely confirming remote work:

- A caught or ignored framework refusal still rejects that invocation's later
  callbacks and returned state. Pending writes recheck the refusal after async
  validation. Previously accepted evidence and already-sent requests remain;
  refusal does not roll back remote effects.
- Operation proof must match the durable work, provider, target, approval,
  generation, digest and remote identity. Foreign, stale, missing or contradictory
  proof cannot acknowledge work or supply current completion. Unknown outcomes
  require read-only reconciliation or supported repair before another mutation;
  a timeout alone never permits a non-idempotent retry.
- Callback admission closes when the adapter's returned promise settles. Retained
  contexts and detached timers cannot start later host work. Inputs, callback
  arguments and accepted JSON results are copied, so accidental mutation of a
  reused object does not rewrite host authority or an accepted checkpoint.

Legitimate async work is supported: await remote I/O and host callbacks inside
`synchronise`, `observe`, `reconcile` or a repair, and await the whole
`withResourceLease` callback before returning. The invocation stays open while
that work is awaited. Local state objects may be reused and edited between
**awaited** checkpoints; each checkpoint receives its own snapshot. Editing a
local object alone is not persistence. Allocate stable non-secret preparation
values under `<providerId>:<destinationId>:`; existing allocations are reused,
not overwritten. Do not carry execution capabilities into a later invocation.

The adapter remains responsible for accurate provider-specific decoding,
read-back, receipt verification and routing every mutation through `mutate`.
The framework validates evidence identity; it cannot independently establish a
remote fact that only the adapter/API can observe, promise remote transactions,
or cancel an already-sent request. Deliberate in-process subversion, including
reflective access to internals, monkey-patching, intentionally forged
framework-owned objects or bypassing callbacks with raw mutations, is out of
scope. These safeguards are correctness checks for buggy integrations, not a
security sandbox for untrusted plugins.

## Provider registration

A hook overrides `PublicationService` through `registerRedboxServices()` / `ServiceExports`, subclasses `PublicationService.Services.Publication`, calls `super.configureProviders()` and calls protected `registerProvider(adapter)` in `configureProviders()`. Bootstrap freezes the registry, rejects duplicate IDs and registers provider schemas plus `destinations.*.<secretPath>` metadata before AppConfig bootstrap. Registration is not an HTTP or Sails-shim action. See the basic hook/loader fixture under `test/services/publication/service.test.ts` and the end-to-end fixture under `packages/sails-hook-redbox-storage-mongo/test/integration/PublicationHook.test.ts` (repository-relative).

Supported contracts are in `contracts.ts`: provider definitions, typed execution adapters, sealed-source references/descriptors, byte identities, policy/approval attribution, per-save intents, operation uncertainty, canonical remote identities, outcomes and completion/status evidence. Runtime JSON must be narrowed by the adapter. Registry wrappers validate configuration/prepared inputs and explicitly decode or upgrade state; future/invalid versions fail without modifying the original evidence. `prepareSource` cannot mutate a provider; execution uses host-supplied authority, checkpoint, journal, cancellation and resource-lease methods. The adapter owns its state and lifecycle; the shared model does not require Figshare article phases.

The supported hook-facing service surface is provider registration (`configureProviders` / `registerProvider`), `getProviders`, local `validateConfiguration`, and configured `acceptRequest` hooks inside a containing save. The host also exports implemented source, dispatch, worker, cleanup, status, administration and migration methods for core/CLI use; their `@internal` classification is intentional. Exported TypeScript symbols and Sails shim methods alone do not grant hook ownership of protected source state or authority.

Both executable built-ins register through FigshareService and OniService. Configuration-only definitions retain `executionAvailable: false` until a complete adapter is registered. Enablement requires the complete storage capability version 1, committed shared brand authority and adapter-verified target fingerprints. Shared authority resolves through the independent durable migration journal; invalid/missing unified configuration fails instead of falling back to legacy settings. Native destination reservations, protected approvals (including ready work not yet imported), bindings and operation evidence retain used provider/target identity. Unused destinations can change/remove; used destinations must remain disabled or archived when retired.

Credential rotation and display names do not change a verified non-secret target. Actual account/repository changes do. Figshare checks the real token account; Oni verifies canonical physical FS/S3 storage identity, including aliases. A different target requires a new destination ID. Archived destinations retain evidence and fixed approved scope, cannot be enabled and are unavailable for new selection.

Operator-facing [configuration](https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Configuration), [cutover/recovery](https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Operations) and [provider development](https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development) pages describe the shipped boundaries. The complete disabled configuration under `support/documentation/examples/publication/configuration.json` is validated against the real unified schema and registered adapters by documentation tests and generation. Configuration validation does not certify credentials, staging access or activation.

A future Pure adapter implements these contracts, including its own configuration validation, source dependencies, target/object identity, versioned state, reconciliation, synchronisation, observation, completion evidence and supported repairs. Its actual API capabilities and recovery guarantees require investigation; no Pure lifecycle or guessed API fields are imposed here. The executable [accession adapter guide](../../../../../support/documentation/examples/publication-provider.md) and real-Mongo `PublicationHook.test.ts` prove third-provider processing through an actual discovered hook and generated shim (PUB-17), including independent waiting/repair outcomes and central all/any workflow. The fixture adds no provider-specific storage, queue, dispatcher or workflow branch.

## Sealed preparation and native ownership (PUB-04/PUB-05)

`integration-v2/bindings.ts` owns the simple binding types, validation and evaluation primitives. Provider wrappers keep their contexts and compatibility: Figshare escapes Handlebars and applies null-to-default path handling; Oni preserves null path values, unescaped Handlebars and its Effect service override.

`sealPublicationSource` accepts trusted source dependencies, brand/version-labelled related/person snapshots, verified targets and approved crosswalk snapshots. It sorts destinations, preserves array/attachment order, removes only registered maintenance outputs, excludes processing/connection settings and registered secret paths, and fingerprints material mapping/selection/options, target identity, managed fields, mapping contracts and pinned crosswalk content. Allocate generated values once with `allocatePublicationGeneratedValues`, persist them in the descriptor and reuse them; Oni's crate builder accepts that fixed `publicationTimestamp`.

Construct `PublicationStaging` with the configured durable Flydrive disk (`StorageManagerService.disk(name)`), accessible to every eligible worker. It writes immutable brand-scoped keys, verifies SHA-256 read-back, reuses trustworthy digests/immutable versions and stages/hashes unidentified attachments with concurrent-change checks. Opening a live digest-only source stages and verifies it before exposing bytes. The reference digest hashes exact stored bytes; the versioned content digest excludes random staging locations. Draft record saves do not invoke this preparation helper.

Pass `new PublicationStagingFence(db)` as the third `PublicationStaging` argument in production. The native `publicationstagingreference` collection uses its built-in unique `_id` for the hash of disk/key. Durable admissions pin the complete immutable manifest graph; source saves, lifecycle snapshot/restore writes, work/recovery imports, provider/resource checkpoints and administrative repairs use the same fence. Streams retain a pin until close. Admissions advance the generation, so even an admission that finishes during a cleanup scan defeats its deletion CAS. A journaled majority-acknowledged tombstone permanently rejects further admissions before the object-store delete; a restarted cleaner can retry deletion safely.

Agenda's Mongo-backed `Publication-StagingCleanup` job runs every five minutes and does no work unless shared publication processing is enabled for that brand. It applies a grace period of at least one hour (or `processing.cleanupMs`, when greater), then checks protected source state, deleted-record recovery, all sync/current/recovery/provider/operation evidence, shared resource journals and corrections by disk/key. The service supplies the actual source-model collection names and refuses reclamation if source writers use a different fence datastore. Immutable graph edges retain transitive staged attachments. Missing evidence/read failures retain inputs. All retained references count, including quarantined, revoked, completed and uncertain work. Pins left by interrupted/ambiguous admission never expire automatically, and pre-fence/unregistered files are retained because they have no complete admission history. An unregistered graph on a retained manifest also prevents deletion of managed objects because it may hide attachment references. Admission of an opaque pre-fence manifest conservatively pins the entire existing managed set; any existing tombstone rejects that admission because its hidden children cannot be certified. Fresh staged UUIDs stay private until their graph registration completes. Such inputs require investigation rather than time-based reclamation. All processes and extensions must use the fenced APIs before processing and reclamation are enabled; drain older writers during rollout. The generic `publicationStagingReferences` helper remains available for callers that supply an equivalent fence; production cleanup uses the durable Mongo implementation. Institution-wide staging access remains an activation check.

`PublicationSyncStore` owns native `publicationsync` indexes and immutable `publicationdestination` target reservations. Call `ensureIndexes` before using a store. Work is keyed by brand/OID/destination; every checkpoint requires the current revision and an unexpired owner/token. Renewals and release also advance the revision. Reacquisition always creates a new token, even for the same owner name. Due paging and dispatch cooldowns remain durable without queue messages. Provider-state checkpoints go through the registered decoder/upgrader; invalid/future versions remain untouched. Current source references and historical recovery references survive source replacement.

Binding uniqueness uses provider/canonical namespace/object identity across all brands and destinations; unbound rows are excluded. `PublicationBindingConflict` distinguishes ownership conflicts. `PublicationResourceStore` protects shared repository resources across brands with the same lease/CAS discipline and preserves submitted/uncertain operation evidence after expiry/release. Journals retain operation identity and prior evidence, reject regressions and require reconciliation before another mutation is submitted. Workers and adapters enforce current source authority and actual remote namespace identity before mutation.

## Atomic source storage (PUB-06)

`StorageServiceCapabilities.publication: 1` is independent of strict record concurrency. `hasFullPublicationStorageCapability` / `assertFullPublicationStorageCapability` require the version token and the entire method contract; method presence alone or an unknown version fails closed. Mongo advertises support only after native storage/index initialization. Enablement, dispatch and worker execution use the actual adapter, rather than a numeric token supplied with configuration.

`publicationSource` is protected record state. Ordinary Waterline/native creates strip incoming state; native updates ignore submitted state and conservatively invalidate existing authority alongside the content write. Public mutation-option normalization drops `publicationIntent` and `maintenance`. Only trusted server preparation supplies `PublicationWriteIntent`: the expected source revision, unique save token, content/approval classification and validated fixed-destination approvals. Approval-only writes cannot change content. Prepared writes use exact snapshot/source CAS as well as existing record revision/version and brand preconditions. Restoring a lifecycle snapshot advances source identity and quarantines its prior requests instead of reactivating them.

A source write creates `initialising` save entries, never ready work. After **all synchronous save work and sealed source/dependency validation succeeds**, the PUB-07 tracker calls `recordPublicationSaveSuccess` with its durable decision identity, source revision and `publicationRecordDigest(committedRecord)`. Storage independently verifies the committed content and exact obligations. `readyPublicationIntent` separately finalises that token only while this evidence and current identity still match. `abandonPublicationIntent` retains failure evidence, revokes only that save's authority and cannot erase a newer or independent successful obligation.

`recoverPublicationIntents` uses age only to select interrupted candidates. Durable successful-save evidence and matching current content/generations permit readiness; absent or mismatched proof produces `quarantined`. Abandoned entries never become ready. A lost completion-marker response is recoverable from persisted evidence in another service instance. The legacy Figshare readiness/age-recovery API remains unchanged for unmigrated brands; it does not certify shared publication success.

`pendingPublicationIntents` and recovery scan by brand/OID with an exclusive cursor and a required limit of 1–500. The source retains unimported/superseded obligations until exact acknowledgement by destination, generation, approval ID/epoch, source revision and descriptor reference. A stale acknowledgement cannot clear newer work or sibling destinations. Only acknowledged successful save entries retire. Source state is bounded to 64 save entries and 256 KiB; excess requests fail before writing, with an actionable import/repair error, rather than evicting evidence.

`setPublicationRecordFields` accepts trusted allowed metadata child paths, exact record/source revisions and current approval/destination/generation coordinates. It atomically stores narrow outputs and protected coordinator decisions, retaining source authority and sibling save fingerprints. Generic whole-record `maintenance` flags and legacy field writes do not provide this exemption. PUB-12 supplies registered output resolution and conditional workflow transitions below.

## Trusted record saves and compatibility requests (PUB-07)

RecordsService creates a process-local save capability and associates it with the existing save tracker and hook operation. Configured `onCreate`, `onUpdate` and `onTransitionWorkflow` events select source policies; JSON options cannot supply a session, grant expression, destination set, requester identity or ready state. `PublicationService.acceptRequest` can be used as a configured hook within that containing save. The request uses the verified current save actor and records separate requester/approver/creator attribution snapshots. Grant checks reload the actual requester and current edit access. Continuation checks use the persisted current approval, configured continuation rule and current local service identity; they do not reload the historical approver. Requester-dependent `user` expressions belong in grant conditions and are rejected in continuation conditions.

An `approval` policy validates and seals its entire fixed destination set before persistence. Any local failure rejects the request. An `auto-sync` policy prepares destinations independently, retaining safe per-destination failure codes while valid siblings proceed. Ordinary drafts do not invoke provider preparation or attachment hashing. Source resolution defers invalid provider configuration to that selected destination's preparation, so a broken mapping does not prevent unrelated drafts or valid auto-sync siblings. AppConfig saves still validate every provider configuration strictly; the source-only context flag does not grant authority. Every meaningful content write invalidates prior authority even when no new request is granted. Save bookkeeping (`metaMetadata.lastSaveDate`/`lastSavedBy`) is exempt. Registered publication projections and expected workflow changes use the narrow PUB-12 path below. Native storage independently rejects preservation of changed content. Explicit revocation writes conditionally advance an approval epoch and disable its pending intents.

After synchronous hooks, attachments and indexing succeed, finalisation reloads and conditionally verifies the committed source. It refreshes current configuration, checks grant-policy/material configuration and seals dependencies again using the request's fixed generated values. Changed synchronous hook content is prepared from the final committed snapshot; concurrent source or dependency/configuration changes cannot make the earlier snapshot ready. Only then is durable successful-save evidence recorded and that save token readied. Failed synchronous work abandons only its own tokens. A lost success-marker/readiness response retains recoverable evidence rather than overwriting it as failure. Provider mutation methods are never called during source preparation or finalisation.

Figshare validation/upload and Oni export compatibility methods call `acceptProviderRequest`. Unmigrated brands retain their existing paths. Within a tracked save the call registers its configured entry-point event and waits for the containing outcome. Outside a save it requires a configured matching-provider policy, reloads committed content (ignoring the caller's record/options), revalidates dependencies/configuration, and conditionally accepts only that exact committed snapshot. Oni returns the record after acceptance without fabricating immediate citation fields. Executable Figshare and Oni adapters consume the sealed inputs through the shared worker. `wakeRecord` sends brand/OID identifiers to the PUB-08 dispatcher; a failed wake-up does not erase the scan-visible ready source obligation.

Configure `processing.stagingDisk` to a durable shared Flydrive disk before approving content. Adapters can implement `describeSource` to declare related/person inputs, attachment byte identities, mapping versions, managed fields and approved crosswalk resolution. Attachment selection without this dependency contract fails closed. The internal `sourceConfigurationContext` resolves committed shared authority, verified targets, deterministic assignments and used destinations from durable evidence. Absence of a committed journal retains legacy authority; posted configuration and test overrides are not production authority.

## Conditional outputs and central workflow (PUB-12)

Providers declare their exact status/link outputs through `sourceMaintenancePaths` and call `context.project(fields)`. The host checks the registered paths, current approval/source, continuation policy, local service permissions and worker lease before each attempt. Each conflict reloads the record and revalidates authority before a narrow expected-revision write. Oni's existing citation seam delegates here; Figshare reuses its write-back formatter. Output registration includes provider defaults and rejects overlap between destinations, including ancestor and array roots. Preparation freezes all resolvable destination outputs in `publication:outputs`, so independently sealed sibling requests can continue after another destination projects its links. Invalid unselected drafts acquire no exemption and cannot block source preparation; runtime configuration validation remains strict.

Approval also freezes applicable workflow rules. The coordinator counts only current provider completion, bindings and exact approval/source generations, with no pending or uncertain work for the counted destination. `all` retains every fixed member; `any` can advance while siblings still process the same approved content. A later rule cannot adopt an older approval. The conditional source write reserves a deterministic decision before hooks; the normal `RecordsService.updateMetaInternal` transition commits the expected stage and decision together. Only the exact host-computed workflow/form/permission/context changes normalize to the approved input. Hook edits to publication content invalidate normally and grant no replacement approval. Remaining `any` work keeps current continuation, revocation, configuration and service-access checks without rerunning its original grant-stage gate.

Completion persists `workflowPending`; worker and dispatcher evaluate it independently of remote retries. Native `publicationworkflowdecision` history retains immutable decision identity and monotonic outcomes. Reserved or partially applied transitions are never automatically replayed, including lost acknowledgements and hook failures; The recovery CLI exposes inspection; no command blindly replays side-effecting workflow hooks. A process interrupted after reservation can therefore leave a `started` decision requiring repair even if no hook ran. This conservative boundary avoids repeating an unverified side effect.

`PublicationProvider.postCompletionReplacement` registers one narrow `attachment-to-url` content mutation with a configured path and receipt field. The host accepts only ordered attachment substitutions with unchanged unrelated fields, verifies current completion and obligations again inside conditional storage, and persists exact before/after evidence in protected `contentReplacements`. Runtime capability objects cannot be forged by posted JSON or hook maintenance flags. Record conflicts reload/revalidate; the dispatcher retries local settlement independently of remote processing. Per-generation decisions in `publicationcontentadmission` interlock with byte-consuming `store.request` admissions and close the read/write race on standalone Mongo. New source generations have distinct decisions; read-only observations remain available. A crashed local replacement creates no admission pin of its own. Exact recorded results normalize to approved inputs for validation, preserving approvals without republishing. Ordinary edits and altered replacement outputs still invalidate normally. Storage must explicitly certify `publicationContentReplacement: 1`.

## Dispatch and guarded execution (PUB-08)

Agenda registers recurring Mongo-backed `Publication-Dispatch` (30 seconds), `Publication-StagingCleanup` (five minutes) and ordinary `Publication-SyncRecord` jobs. The service exports `dispatch()` and `executeRecord(job)`. Bootstrap still only configures/freezes the registry. Default processing is disabled; brand authority is legacy until the one-way journal commits. Figshare aliases resolve deterministic migration assignments for shared brands, ignoring stale job authority.

The dispatcher recovers interrupted saves only through the certified storage contract, scans ready obligations by exclusive brand/OID cursors, imports each destination durably and then acknowledges its exact generation/source identity. A sibling import failure cannot acknowledge or block successful siblings. Due scans page by time/OID/destination, claim a durable 30-second delivery cooldown and send only `{brandId, oid, destinationId}`. Queue failures retain obligations. Paused or invalid destinations back off five minutes without being marked processed. Source recovery uses the existing one-hour selection threshold; elapsed time never substitutes for successful-save evidence.

`PublicationExecution` serialises checkpoint CAS operations and renews ownership independently of slow source validation or transports, with a fresh conditional lease token for each owner. Import/request/dispatch can advance the row revision independently: a conflict reloads the row, verifies ownership and revalidates authority before retrying. It does not infer lease loss from revision alone. A newer request cannot be consumed, checkpointed or relabelled by the old worker. Heartbeats renew through slow provider calls, attempt cancellation when authority changes and retain ownership long enough to journal already-sent outcomes. Lost owners cannot checkpoint, renew, release a successor's lease or start another mutation.

Every mutation must use `context.mutate(operation, send)`. It checks the current record, institutional approval epoch, destination generation, continuation policy, local service/edit access, fixed verified target, material mapping, declared related inputs, selected byte identities and ownership; it then persists `submitted` before invoking `send`. Use `context.signal` in the transport. `mutate` does **not** infer confirmed application from a returned HTTP response: the adapter calls `context.journal({...operation, outcome: 'confirmed' | 'not_applied' | 'rejected', evidence})` from provider evidence. Throws/aborts after invoking the transport retain `uncertain`; a guard that stops before invoking it certifies `not_applied` while ownership remains valid. A restart also treats `submitted` as unresolved. Operation IDs cannot be reused to send again.

Before synchronisation, submitted, uncertain and confirmed-but-uncheckpointed operations enter the provider's read-only `reconcile` method. Its execution context has `recovery: true`, all operation coordinates and sealed `recoverySources` for obsolete requests. Mutation is forbidden in reconciliation and observation. The context identifies `workKind` so adapters can distinguish synchronisation, observation and authorised maintenance. Confirmed historical outcomes may be journalled under the current lease, including after revocation/source replacement; they cannot complete newer content or advance workflow. The provider's recovery outcome is respected, and a later due run resumes from confirmed state. Unresolved uncertainty cannot become completion or silently authorise another create/commit.

Use `context.checkpoint(state, [operationId, ...])` to atomically persist decoded/versioned provider state and acknowledge the confirmed receipts incorporated into it. Omitting IDs preserves every pending acknowledgement. The host-owned `operation.checkpointed` flag cannot be set through `journal`/`mutate`; changes to confirmed evidence require a new acknowledgement. Pending receipts and their sealed sources survive new approvals and journal compaction, force read-only reconciliation, block new mutations (including the same kind under a new approval), and cannot satisfy completion. Acknowledge only after retaining the exact remote identity/checkpoint or verifying no remaining provider follow-up; never acknowledge an ignored receipt merely to clear a barrier. A rejected/not-applied outcome requires positive provider/non-send evidence and retains its history. Administrative repair results may provide `checkpointedOperationIds` under the same atomic state/journal installation and validation. Existing confirmations without the host flag conservatively enter reconciliation. Drain older workers during upgrade and update hook adapters to acknowledge incorporated operations; an older hook cannot bypass this barrier and may require repair until updated. Figshare can incorporate historical confirmed operations covered by a completed synchronization checkpoint after verifying the retained article identity/owner and managed-file ownership or deletion. Oni can verify confirmed historical deposits against immutable version inventories and recover compacted indexing entries from retained acceptance receipts under the repository lease. These proofs settle historical follow-up only; they cannot supply current completion or settle submitted/uncertain requests.

Use `context.checkpoint(state)` for state-only progress, `context.bind(binding)` for exclusive canonical ownership, and `context.openAttachment(id, logicalPath)` for selected sealed bytes. The latter opens an immutable version or stages/verifies a digest-only live source before returning its stream. Do not reopen mutable bytes independently for upload. Host-owned descriptors/state/operations are copied before exposing them to adapters. Preparation stores reserved per-destination `prepared` and `selection` snapshots; adapters must use different related-input names. Attachment selection/order, mapping-context versions, managed fields and live dependency identities are revalidated. Current credentials stay runtime-only and are excluded from material approvals. Evidence must contain only explicit non-secret facts: never persist credentials, raw transport responses/errors, signed URLs or client/request objects. All mutating calls, even idempotent maintenance, belong inside `mutate`; read-only client calls alone may run outside it. Reuse provider-supported idempotency keys with the same intended content, and reconcile authoritative outcomes rather than blindly repeating uncertain submissions.

`withResourceLease(namespace, resourceKey, run)` serialises actual shared provider resources across records/brands, renews them alongside record ownership and mirrors mutation intents/results into the durable resource journal. The callback receives prior resource operations and a guarded journal for reconciling existing evidence while retaining its original work identity. A resource's unresolved operation blocks new mutation even after expiry. Declare resource capability and hold the canonical resource scope around the entire read/reconcile/write sequence, not just its final transport. Providers must reopen the same resource scope when reconciling its operation. A record lease cannot serialize a shared repository/root/index. Positive writer quiescence is separate from lease expiry; rebuild acceptance is separate from readiness. A later resource owner may record reconciliation evidence for an existing operation; it cannot submit new operations for another brand or change the original work coordinates. Resource entries store only brand/OID/destination work coordinates, independently of provider-state size. Legacy whole-row work copies are retained in immutable history before the leased token/revision CAS narrows their live coordinates; operation identity and evidence remain unchanged.

Provider outcomes retain independent retry episodes for synchronise/observe/maintenance. Waiting does not consume attempts; observation recovery cannot erase an exhausted source-sync failure. Retryable failures use bounded exponential backoff/jitter and rate-limit hints; exhaustion retains visible work/evidence with no due time until authorised recovery or a fresh eligible request. Repair outcomes retain the provider's safe evidence in bounded episode summaries. Completion requires matching approval/generation/source digest and the exclusive bound remote identity. Registered projections and workflow use the coordinator above; access-checked destination status and the supported administrative CLI retain separate current/historical evidence.

## Oni durable execution and compatibility (PUB-11)

The Oni execution adapter is registered through `OniService.publicationAdapterHooks()`. It retains service configuration/repository override dispatch, while requiring verified recovery reads and the approved physical repository. The shared path uses the sealed mapping result rather than invoking the legacy all-in-one `runPublishDataset` or `ingestDataset` overrides. Review subclasses of those methods before migration; migrate custom build/index behaviour to the adapter contract. Existing unmigrated brands retain their legacy execution path. Registration does not enable processing: defaults remain disabled, and shared authority still requires the migration gate.

For a shared-authority brand, `exportDataset(oid, record, options, user)` returns its record after durable acceptance, or registration with its containing save. Its signature and hook-chain return shape are unchanged. It does not wait for the deposit/indexing or fabricate a citation. Local explicit-approval errors can still reject the request. Remote OCFL/indexing/projection failures appear in destination status and durable work evidence. Hooks that inspect a newly created citation immediately after this call or catch synchronous remote exceptions need migration review. Existing citations may remain while new content is pending; status identifies whether their completion evidence covers the current request.

Preparation seals the actual crate, logical attachment selection, stable publication timestamp and distinct creator/approver person snapshots. The worker does not reload a departed approver to recreate history. Attachment identities include the parent record OID; cross-brand parents are rejected and related parent revisions are checked. Digest-only live attachments are staged and verified before any bytes are exposed to the repository writer. Citation URLs already stored at the configured output path and the existing namespace/OID object identifiers are preserved. Current local service permissions are checked separately, and conditional projection records that service identity as the persistence actor.

The provider checkpoints `prepared`, `submitted`, `confirmed`, `ingestion` and `projection`. An operation intent records the expected inventory/head and intended complete content manifest before a commit. Read-back must prove the exact crate and attachment manifest. A lost response is reconciled before further mutation; confirmed deposits resume indexing or projection without another OCFL version. An unchanged head permits resubmission only with a positive receipt proving all prior writer I/O settled successfully. Expired leases, rejected SDK calls and timeouts do not provide that receipt. Conflicting/incomplete evidence stops for repair.

A repository resource lease spans initialization, root-collection creation, dataset commit, indexing and projection. The namespace comes from the verified FS real path or S3 endpoint/bucket/prefix, so disk aliases and virtual OCFL root labels cannot create competing managers. The resource journal retains original work identity when a later record reconciles a previous writer. Resource-only intents whose record intent is absent can be closed using the host's durable resource→record→send ordering. No uncertain transport outcome is discarded on that basis.

Structural and search rebuild acknowledgements and readiness are separate checkpoints. Polling resumes after an acknowledged request. An unknown POST outcome requires repair; a pre-existing ready index cannot prove that request was accepted. Completion means confirmed intended deposit plus configured repository indexing (or indexing explicitly not required). **Object visibility remains unverified**: the configured repository-level API does not establish discoverability of this object/version. A confirmed deposit followed by a projection failure retries only the guarded projection; the shared PUB-12 coordinator evaluates workflow after the guarded projection and confirmed completion.

Original attachment cleanup is part of the scheduled fenced cleanup path, separate from staging-copy reclamation. Figshare seals a durable recovery copy and registers a distinct original-byte identity before replacement. After the grace period, cleanup reopens retained source/recovery manifests and verifies current/deleted-record references. Admission pins, missing graphs and un-staged recovery inputs retain originals. An irreversible original tombstone precedes configured datastream removal; subsequent reference admissions fail. The original tombstone does not tombstone or delete the staged recovery copy. Pre-fence originals remain retained. `assets.staging.cleanupPolicy` continues to control only temporary upload copies, and disabling hosted-file publishing prevents attachment replacement.

## Operation idempotency and external attestations

Every adapter declares `mutationRecovery.mode`: `idempotency-key` or
`no-remote-lookup`. Registration rejects a missing/unknown declaration. Drain older workers and update
hook adapters before deploying this required contract addition. A provider
without remote key lookup must also implement `attestOperation`; registration
rejects a description-only fallback. This declaration concerns general lookup of
unknown submissions by the framework key; it does not remove exact provider
read-back or require an API to accept an unsupported idempotency header.

The host calls `context.mutate(operation, async key => send(key))`. The versioned
`rbpub-v1-…` key derives from the durable work/provider/fixed-target and operation
identity (ID, kind, approval/epoch/generation, intended digest and submission
time). The host persists the read-only `operation.idempotencyKey` in both
record and shared-resource journals before sending. Later resource owners use
that retained key across records, destinations, brands and fixed targets; they
never derive an earlier writer's key from their own coordinates. Adapter journal
updates cannot replace it, and a new `mutate` ignores any supplied key.
`context.idempotencyKey(operation)` retrieves the identical key during
read-only reconciliation, including historical requests. Evidence, outcome,
acknowledgement, credentials and worker leases do not change it. Retain the exact
operation across transport retries; a different intended mutation requires a new
operation identity. A certified non-application retires that operation; a later
authorized attempt gets a new ID/key. Never use a destination ID, content digest
alone, clock time or a newly allocated recovery UUID as an idempotency key.

A key-capable adapter sends this key, verifies returned key/target/digest identity,
and uses authoritative key lookup in `reconcile`. Lookup failure, a conflicting
receipt, or absence while an earlier request could still arrive retains
`repair_required`; it never authorizes a blind second submission. The accession
example sends `Idempotency-Key` and reads
`GET /repositories/<repository>/operations/<key>`. Its remote fixture atomically
reuses one accession for duplicate keys and refuses a different dossier for an
existing key. A lost response is resolved with a GET, then normal current
authority gates binding, projection and completion.

For a provider without key lookup, an unobservable submitted/uncertain call stays
`repair_required`. The supported CLI fallback is `repair --repair attest-operation`
with explicit brand/OID/destination/admin, default dry-run and `--apply --reason`
for persistence. Parameters identify `operationId`, `intendedDigest`,
`idempotencyKey`, `outcome`, `priorOperationSettled: true` and a nonempty
`evidenceReference`. Confirmation additionally supplies a nonempty
`externalReceipt`; non-application requires `nonApplicationVerified: true`.
The adapter's `attestOperation` validates the receipt's exact remote identity and
intended mutation using its own evidence rules. The host preserves immutable
journal identity, records a receipt digest/reference, owns record/resource leases,
rechecks current administrator/edit/source authority and installs state/journals
by CAS. The correction records actor, reason and evidence digest before the write;
identical replay is safe, conflicting replay or terminal downgrade refuses.
Attestation sends nothing and cannot manufacture approval or current completion.
Resume is separate and still requires current unchanged approval. Referenced
external documents and positive former-call settlement are trusted operator
attestations, not facts the CLI can independently certify.

Figshare and Oni declare `no-remote-lookup`: neither currently accepts the
framework key for every mutation or provides general lookup by it. Their existing
verified recovery is retained. Figshare uses exact provisional create tokens,
owner/binding/version/payload/file evidence; Oni uses verified OCFL inventory and
writer evidence plus exact indexing receipts/readiness. Their attestation handler
requires `providerRepair` naming an existing operation-specific repair and applies
that repair's existing proof requirements as well as the host requirements above.
Their positive `externalReceipt` envelope identifies `operationId` and
`intendedDigest`; an Oni indexing receipt also carries the same `acceptedAt`
used by `reconcile-ingestion`. Provider read-back/acknowledgement checks still run.
Existing named repairs remain supported with their verified arguments. No header,
blind retry, OCFL version or inferred index acknowledgement is added.

## Shared operation evidence binding

Adapters supply `PublicationOperationEvidence` as `operation.confirmation` when
journalling `confirmed`, `not_applied` or `rejected`. Use
`publicationOperationEvidence(work, operation, observedRemote)` to construct the
coordinates, then supply the actual returned key and content digest when the
provider reports them. Keep the provider-specific read-back/settlement checks
that establish application, ownership and writer quiescence. The helper does not
verify a remote effect or turn intended values into observed facts.

The host independently compares operation ID/key, provider/fixed target,
brand/record/destination, original approval/epoch/generation, intended digest and
the operation's bound remote namespace/object. It performs the same check before
checkpoint acknowledgement, administrative installation and shared-resource
settlement. New intents retain a host-owned `identity` alongside the key so a
later resource owner uses the original work coordinates. Once an initially
unbound create is confirmed, its first verified remote identity remains bound to
that operation, including after an explicit relink.

Completed outcomes additionally supply `evidence.operations`, with one fresh
structured proof per retained confirmed operation. The framework checks this
set even when every operation was previously checkpointed. Missing, duplicated,
unrelated or mismatched proof cannot complete work. A mismatch yields
`repair_required`; `operationEvidenceFailures` retains the rejected report
separately without overwriting intent, outcomes, provider state or acknowledgement.
No private receipt is copied to public status or ordinary logs. Applied
administrative verification also records a mismatch; dry-run remains read-only.

Legacy journals need no in-place rewrite. Complete historical coordinates
(including the explicit empty approval/epoch zero used by migration) can be
matched to fresh provider-verified evidence. A missing old key is derived only
as a deterministic correlation value; it does not claim a header was sent or
that the remote API supports key lookup. Missing intent fields or an unavailable
original shared-resource scope are refused with evidence retained, never filled
from the current approval. An old completion without structured operation proof
remains historical until verified again. Source-less legacy operations still
require the supported read-only administrative recovery and cannot acquire
current authority or completion. Drain older workers and update third-party
adapters to supply this contract before deploying the compatible core/Mongo set.

## Upgrading to provider contract version 2

Structured operation evidence is a required **version 2** adapter contract.
Set `contractVersion: 2` only after implementing `operation.confirmation` for
confirmed, not-applied and rejected results, `evidence.operations` for every
retained confirmed operation, and the same proof in reconciliation, resource
recovery and administrative repairs/attestations. Both definition-only and
executable registration reject version 1 with an upgrade message before
processing. `stateVersion`, source encoding, AppConfig schema and `rbpub-v1-…`
transport keys retain their own versions; do not rewrite them to upgrade an adapter.

Pause acceptance and processing, **drain older workers** and settle outstanding
calls across all deployed processes before installing the compatible core,
Mongo and hook set. Preserve source descriptors, journals, receipts and recovery
bytes. Upgrade and test every third-party adapter before restarting workers;
changing its version number alone does not implement the proof contract.

A sealed version-1 approval remains historical and cannot authorize a mutation
under version 2: current-source validation reports `material_configuration_changed`.
Read-only reconciliation and supported administrative repairs may retain verified
historical evidence, using the operation's original coordinates. Incomplete
legacy proof remains refused. Obtain a fresh approval (or a fresh eligible
explicit auto-sync event) under version 2 before further mutation or current
completion; do not relabel a sealed descriptor or copy current approval fields
onto an old operation. Old completion without matching proof cannot advance
workflow or replace attachments. Resume only after registry/readiness and the
fresh-request/recovery checks pass with the older consumers stopped.

A framework validation refusal ends the current adapter invocation. Catching a
refused authority, journal, binding, checkpoint, projection or resource callback
does not authorize another checkpoint or the invocation's returned state. The
host retains its first refusal and gates persistence independently. Ordinary
transport failures still use typed retry/wait outcomes. Preserve valid receipts
and use a fresh worker invocation or a supported administrative repair after
resolving a refusal; do not catch it and continue the same proposal. Framework
transport bookkeeping and diagnostic/lease cleanup remain host-owned.
The host closes callback admission as soon as the adapter returns, then drains
work already admitted before accepting returned state. A callback attempted
during that drain retains a refusal; timers and retained contexts cannot reopen
the invocation. Pending checkpoints, journals, projections and audit writes
recheck the host verdict after asynchronous validation and before persistence.
Previously accepted evidence is retained; a later refused proposal does not
roll it back.

Configuration, preparation, execution, repair, status and state-upgrade inputs
are isolated copies. Returned JSON and callback arguments are copied when
accepted, including resource journals and operator-attestation scope. Mutating
a retained object cannot change host authority, forge a checkpoint or redirect
an operator's selected operation. Await every host callback before returning;
use a new invocation for further work.

During successful preparation, an adapter may allocate non-secret generated
values under `<providerId>:<destinationId>:`. The host copies only new keys in
that namespace; existing allocations, timestamps and other destinations remain
protected. Reuse those allocations for stable historical attribution and retries.
A failed callback never authorizes returned state. The host can schedule a
fresh attempt after a datastore failure or resource contention while preserving
all prior state and operation evidence.
