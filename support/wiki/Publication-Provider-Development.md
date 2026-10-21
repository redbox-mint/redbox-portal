# Developing publication providers

Register an adapter by overriding `PublicationService` through the normal hook loader. Extend `PublicationService.Services.Publication`, call `super.configureProviders()` and `this.registerProvider(adapter)` from protected `configureProviders()`, then export `registerRedboxServices()` and `ServiceExports`. The hook package declares `sails.hasServices: true`. Compose any already-installed PublicationService override so its providers remain registered. Bootstrap freezes IDs and registers schemas and wildcard secret metadata before AppConfig loads. Never edit generated `api/` shims or install a parallel dispatcher.

The [executable provider guide](https://github.com/redbox-mint/redbox-portal/blob/master/support/documentation/examples/publication-provider.md) and [TypeScript adapter](https://github.com/redbox-mint/redbox-portal/blob/master/support/documentation/examples/publication-provider.ts) implement a fictional test-only accession review API. The compile-checked example runs through a discovered hook, generated shim, real Mongo save/dispatch/status and `all`/`any` workflow fixtures. It is an extension example, not a deployable product integration or a source of production authority evidence. The [disabled Figshare/Oni configuration example](https://github.com/redbox-mint/redbox-portal/blob/master/support/documentation/examples/publication/configuration.json) validates the actual unified schema and adapter configuration boundaries.

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

## Adapter responsibilities

Implement `PublicationProvider<Config, State, Prepared>` with runtime validation for configuration, versioned state and sealed prepared inputs. Preserve unknown/future evidence on rejection; upgrades must retain pending operations. Declare a canonical target fingerprint and object namespace/ID independent of destination labels and credentials. Verify actual account/repository identity, including aliases, before activation. Migration currently verifies the built-in Figshare/Oni providers; a production third provider also needs compatible durable target-verification/cutover integration. Do not copy the test fixture's unconditional authority override.

Prepare deterministic non-secret inputs locally. Declare consumed related records, people, approved crosswalk revisions, selection/order and attachment identities through `describeSource` where needed. Allocate generated values once and reuse them. Register exact status/link maintenance paths through `sourceMaintenancePaths`; this does not authorize arbitrary content exemptions. Consume sealed inputs and `context.openAttachment` for approved bytes at execution, with runtime credentials separately in `context.credentials`.

Send every mutation through `context.mutate(operation, send)`, honoring `context.signal`. The host persists submitted intent and checks current source, approval, continuation, access, target and lease; a successful HTTP response alone does not confirm application. Journal provider evidence explicitly, checkpoint decoded state, bind exclusive ownership and project only registered outputs. Use `withResourceLease` for repository-wide writes or indexing. Lease expiry never erases prior uncertainty.

Reconcile submitted/uncertain operations read-only before a new mutation. Lost responses require provider-specific proof of application or positive non-application; when proof is unavailable return `repair_required`. `observe` and `summariseStatus` must respect read-only boundaries; the latter uses checkpointed evidence only and never makes network requests. Completion identifies exact approval epoch, source generation/digest and bound remote object. Deposit, publication, configured ingestion and visibility evidence are distinct.

Declare supported repair IDs and implement their `run` handlers when deployable recovery is supported. Repair contexts allow verified read-back and retained evidence, not remote mutations or invented completion. The accession example implements key lookup and a validated external-attestation fallback; the no-lookup contract fixture proves the same audited CLI boundary. Persistence, leases, retries, authority and central workflow belong to the host; no provider branch belongs in record storage or shared dispatch.

## Public and internal contracts

The [generated reference](https://redbox-mint.github.io/redbox-portal/) publishes the classified PublicationService registration/hook surface, provider/execution/source/repair contracts and unified configuration contracts. `@extensionPoint` explains supported extension semantics; `@public` preserves TypeDoc visibility; `@internal` excludes worker, source-save, administration, migration and storage implementation boundaries. An exported TypeScript symbol or Sails shim method alone is not a supported hook override. Source policy and protected approval types describe host-owned evidence, not JSON grants that hooks may manufacture.

Validate changes with `npm run docs:test`, `npm run docs:audit`, `npm run docs:generate`, `npm run validate:api-routes` and the example typecheck described in the executable guide. Provider implementations additionally require their actual storage/remote-boundary tests. Pure remains a subsequent adapter: investigate the deployed API's authentication, identity, idempotency/read-back, managed fields, visibility and limits before implementing it. No guessed Pure fields or lifecycle are part of this framework.

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

## Shared operation evidence binding

Supply `PublicationOperationEvidence` in `operation.confirmation` for confirmed,
not-applied and rejected settlements. `publicationOperationEvidence` constructs
work/operation provenance; use observed remote identity and any returned key or
digest. The host compares exact operation ID/key, provider/target,
brand/record/destination, original approval/epoch/generation, intended digest and
bound remote identity. Provider read-back still establishes the remote effect;
the helper itself is not proof of application.

Completion must include `evidence.operations` for every retained confirmed
operation, even if checkpointed. The same host check governs journal settlement,
checkpoint acknowledgement, completion, resource recovery and administrative
installation. Mismatches require repair and preserve the rejected report outside
the authoritative operation journal. Legacy evidence is matched against its
retained historical coordinates or safely refused if incomplete; it is never
filled from a newer approval. A derived legacy key is correlation only, not proof
that a header was sent. Older completion without structured operation proof is
historical until verified again. Drain workers and update hook adapters before
upgrading. Full semantics and an executable example are in the linked provider
guide and core publication README.

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
