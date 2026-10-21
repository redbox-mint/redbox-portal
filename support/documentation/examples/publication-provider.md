# Developing a publication adapter in a hook

`publication-provider.ts` is a compile-checked, executable adapter for a **fictional accession review API used only in tests**. It is not a supported remote product integration. Its HTTP fixture is `packages/sails-hook-redbox-storage-mongo/test/fixtures/accessionServer.ts`. The real-Mongo `PublicationHook.test.ts` discovers a temporary hook package, generates its service shim, then runs the adapter through the unchanged record save, dispatcher, worker, status and workflow services.

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

Declare `sails.hasServices: true` in the hook's package metadata. Export `registerRedboxServices()` and `ServiceExports`. Extend `PublicationService.Services.Publication`, call `super.configureProviders()` and register your adapter before bootstrap freezes the provider IDs:

<!-- publication-provider-registration:start -->

```typescript
export class AccessionPublication extends PublicationService.Services.Publication {
  protected override configureProviders(): void {
    super.configureProviders();
    this.registerProvider(accessionProvider);
  }
}
export function registerRedboxServices() {
  return { PublicationService: new AccessionPublication().exports() };
}
export const ServiceExports = registerRedboxServices();
```

<!-- publication-provider-registration:end -->

Use the normal loader to discover the installed hook and generate shims. Never edit `api/services/PublicationService.js`, mutate a registry, or register a second dispatcher. Hook precedence selects one PublicationService override; when an installation already overrides it, extend/compose that implementation so its existing providers remain registered. Bootstrap registers adapter schemas and wildcard `destinations.*.<secretPath>` metadata with AppConfig. This registration grants no source authority and does not enable processing.

Implement these boundaries for the actual provider:

- Validate unknown runtime configuration, prepared inputs and versioned state. Reject unsupported future versions while retaining evidence; explicit upgrades must preserve pending operations. The example accepts an empty initial state, then stores `submitted` or `accepted` with an accession receipt.
- Define a canonical target and remote object identity. This fixture uses endpoint origin plus repository for the target, and an accession namespace/string ID for ownership. Credentials and destination labels cannot create a second owner of the same object. In a real integration, verify the actual account/repository behind credentials and aliases before the migration authority seam certifies that target.
- Prepare deterministic non-secret inputs locally. The fixture seals a title dossier. Implement `describeSource` for consumed related records, people, crosswalks or selected attachments; use `context.openAttachment` to read approved bytes. Never resolve credentials or call the remote provider during source preparation. Declare only exact status/link output paths as maintenance.
- Send **every** remote mutation through `context.mutate`, including idempotent updates, file removal and repository/index maintenance. Do not call a mutating client in preflight, observation, reconciliation or a save hook. Journal only narrow non-secret facts from provider-confirmed evidence; never copy credentials, raw HTTP responses/errors, signed URLs or request objects into evidence. The accession fixture submits a dossier and polls an independent review decision. Pending review consumes no transport retry. Accepted receipts bind the accession, project its URL conditionally and return completion for the exact approval/generation/source digest. Visibility remains unverified.
- Reconcile uncertain calls read-only before another mutation. The fictional API correlates submissions through the host idempotency key: read-only lookup recovers a lost submission response without repeating the create. Conflicting dossier receipts also require repair. Repair descriptions advertise adapter capabilities; they do not install an administrative repair handler. Implement actual authorized repair behavior through `PublicationRepair.run` and the read-only `PublicationRepairContext` when adding a deployable provider. The shared CLI dispatches only registered executable repair handlers.
- Incorporate each confirmed result with `await context.checkpoint(state, [operation.id])`. This atomically persists the decoded state and the host acknowledgement for those confirmed IDs. A checkpoint without IDs does not settle the journal. The host forces `submitted`, `uncertain`, and confirmed-but-unacknowledged operations into read-only `reconcile` on every later run, including under a fresh approval, and blocks further mutations until they are resolved. Do not acknowledge a receipt until the state retains its remote identity/checkpoint or verified read-back has established that no further provider follow-up is needed. Acknowledge historical receipts only after checking their original coordinates and retained sealed inputs. Operator repairs use `checkpointedOperationIds` with the same obligation.
- Recover a confirmed submission from its journal if the following state checkpoint was lost. Retain the exact accession across approvals and read its current receipt before counting completion. Compare dossier content, rather than ordering independent generation counters: a different dossier requires repair because this fictional API has no update operation. Unknown submissions require exact key lookup or an audited external attestation before another authorized attempt.
- For shared repository/root/index state, declare `resourceLeases: true` and put the whole read/reconcile/mutate sequence inside `context.withResourceLease(canonicalNamespace, resourceKey, ...)`. Reopen the identical scope in reconciliation. Resolve prior resource evidence before writing; an expired lease or transport timeout does not prove the former writer stopped. Repository-wide rebuild acknowledgement and readiness need separate durable evidence, as Oni demonstrates. A record lease alone cannot protect shared resources. This fictional accession API has no repository-wide mutations and declares no such resource capability.
- Use provider idempotency keys when supported, retaining the key and exact intended digest before send. A key or unchanged read-back alone does not justify retrying an uncertain non-idempotent submission: establish its authoritative outcome and prior writer quiescence, or require repair. The fixture looks up the durable host key and refuses missing or contradictory proof.
- Summarize only checkpointed evidence in `summariseStatus`; rendering status must not poll the remote service. Keep payloads, private state and credentials out of public status/audit summaries. Let the host own persistence, leases, queue delivery, bounded retries and `all`/`any` workflow decisions.

The integration fixture supplies shared-authority and verified-target test evidence by overriding `sourceConfigurationContext`. Production hooks must use the durable migration/target verification boundary; copying the fixture's unconditional authority would bypass an activation gate. No deployment configuration, migration authority or processing default is changed by this example.

## Subsequent Pure integration

Pure is a separate adapter implementation. It must establish configuration/secrets, source dependencies and attribution, canonical target/object ownership, versioned state, guarded mutations, reconciliation, observation, completion evidence and authorized repairs against the supported contract. Investigation with the actual deployed Pure API must establish authentication/account identity, available stable identifiers, managed fields, mutation semantics, idempotency/read-back evidence, publication/visibility semantics and rate limits. These are investigation topics, not assumed API capabilities or required Pure fields/phases. This accession fixture makes no Pure API promises and implements no Pure integration.

Validation:

```bash
npm run docs:test
npm run docs:audit
npm run docs:generate
node_modules/.bin/tsc --noEmit -p support/documentation/examples/tsconfig.json
MONGO_TEST_URL=<disposable-mongo-url> NODE_OPTIONS=--no-experimental-strip-types npm --prefix packages/sails-hook-redbox-storage-mongo test -- --grep 'PUB-17' --timeout 30000
```

Use a disposable Mongo database and the repository's documented Node 24 environment. An absent Mongo URL or skipped suite is not acceptance evidence.

## Configuration and generated contracts

Use the [complete disabled Figshare/Oni configuration](publication/configuration.json)
for the actual unified envelope, source approval/auto-sync policies, fixed
nonoverlapping outputs and central workflow rule. `npm run docs:test` and the
audit/generation commands validate it using `PublicationService.validateConfiguration`
and the registered adapters. This checks local structure and provider decoding,
not real target credentials, deployed service access or shared staging readiness.

The generated catalogue publishes the classified provider/execution/preparation/
repair and configuration contracts, the protected registration methods and the
validated source examples. Internal save, authority, worker, migration and CLI
methods remain core-owned despite TypeScript/Sails exports. Use `@extensionPoint`
with extension semantics for supported contracts, `@public` for TypeDoc visibility
and `@internal` for implementation details. See the wiki [provider guide](../../wiki/Publication-Provider-Development.md)
and [one-way operations runbook](../../wiki/Shared-Publication-Operations.md).

The production migration target-verification boundary currently supports Figshare
and Oni. A production third provider needs compatible durable cutover/verified-target
integration as well as an adapter; the test fixture's authority override must not
be copied into deployment code.

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
Subsequent reads by accession ID also require the retained operation key; matching
content and accession alone cannot settle a contradictory receipt or count it complete.
The returned dossier must match the retained operation's intended digest as well
as the current approved dossier. A newer approval cannot reinterpret an old key
as proof of different content.

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

## Framework-checked operation evidence

The example supplies `PublicationOperationEvidence` through
`operation.confirmation` for each journal settlement, including external
attestation and certified non-application. `publicationOperationEvidence` builds
the operation/work coordinates; the accession receipt supplies the actual
returned key, dossier digest and remote accession. The host compares these
against durable intent, so observation and reconciliation share the same check.
The example separately verifies that the dossier matches the current approved
source, because a historical operation cannot authorize different current content.

Completion supplies `evidence.operations` for all retained confirmed operations.
The host rechecks every proof before completion, including previously acknowledged
receipts, and validates stored proof before checkpoint acknowledgements. It also
checks administrative repairs and original-owner shared-resource receipts.
A mismatch becomes `repair_required`, preserving the rejected report separately
from the unchanged operation journal. Missing legacy fields fail safely; complete
legacy coordinates may be matched to fresh provider evidence without inventing
an approval, a remote key lookup or current completion. See the core
[operation evidence contract](../../../packages/redbox-core/src/services/publication/README.md#shared-operation-evidence-binding).
