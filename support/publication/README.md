# Publication recovery CLI

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

Run from the deployed portal checkout with its matching compiled core and storage
packages. The loader reads normal environment/brand configuration and disables
Agenda startup in this process. Pause other deployed consumers and inspect
in-flight work before applying corrections.

Every command requires a current administrator for the explicit brand. Record
commands also check current edit access. `inspect` and `reconcile` only read;
corrections default to dry-run. Add `--apply --reason 'incident explanation'` only
after reviewing the dry-run. An active relevant worker or repository lease
refuses corrections. A correction taking longer than its two-minute ownership
window fails closed; inspect before retrying.

```bash
node support/publication/admin.js inspect --brand BRAND --username ADMIN --oid OID --destination DEST
node support/publication/admin.js reconcile --brand BRAND --username ADMIN --oid OID --destination DEST
node support/publication/admin.js pause --brand BRAND --username ADMIN
node support/publication/admin.js pause --brand BRAND --username ADMIN --destination DEST
node support/publication/admin.js resume --brand BRAND --username ADMIN --destination DEST
node support/publication/admin.js resume --brand BRAND --username ADMIN --oid OID --destination DEST
node support/publication/admin.js revoke --brand BRAND --username ADMIN --oid OID --destination DEST --approval APPROVAL_ID
node support/publication/admin.js repair --brand BRAND --username ADMIN --oid OID --destination DEST --repair REPAIR_ID --parameters '{"key":"value"}'
```

Brand/destination resume clears the operational pause. Configuration must also
permit processing; resume does not enable disabled/archived configuration or
change targets. Record resume requests another attempt for the current approval
and retains operation uncertainty, receipts, completion history and source
references. Revocation increments the entire fixed approval's epoch, including
its sibling destinations; it cannot withdraw an already public object.

`inspect` lists the adapter's supported repair IDs. Built-in repairs are:

- Both providers: `reconcile-evidence` persists the adapter's verified read-back
  checkpoints/journal outcomes. It performs no provider mutation, output
  projection or workflow advancement. Content reconciliation requires the sealed
  historical source and approval. Source-less migrated Figshare create/publication
  facts can instead be read back from their exact token or verified binding,
  owner and publication-version evidence. Unverifiable content operations remain
  quarantined; this grants no approval or runnable work.
- Figshare `link` / `relink`: numeric-string `articleId` and, for owner-based
  reads, numeric-string `ownerId`.
  The account and owner are verified. A migrated shared-only binding can gain
  verified provider evidence only for that same retained article and namespace;
  a known owner cannot change. Replacement requires resolved prior
  operations and no live managed receipts. Prior binding/checkpoint evidence is
  retained; a new binding does not establish current publication completion.
- Figshare `abandon-create` / `reset-publish`: `priorOperationSettled: true` and
  `evidenceReference`. This is an operator attestation backed by transport or
  provider investigation, not a timeout/lease-expiry assumption. Exact-token
  absence or verified private state is also checked. Retired evidence remains.
- Figshare `bind-file`: existing `receipt` key and numeric-string `fileId`. The completed
  hosted file must match the receipt's article, size and checksum; a link-only
  file must match the exact approved receipt URL and completed link identity.
- Figshare `resume-upload`: the same receipt/file parameters plus settled prior
  uploader attestation and `evidenceReference`. Files are never adopted by name.
  Both file repairs incorporate matching initialization receipts into the durable
  file checkpoint, so a confirmed initialization cannot block the remaining upload.
- Figshare `settle-file-operation`: exact `operationId`, existing `receipt`,
  `priorOperationSettled: true` and `evidenceReference`. Read-only absence of a
  plausible initialized file, exact still-created upload, or exact still-present
  completed owned file verifies non-application after prior-call settlement.
  Omit `operationId` only for an initialization intent before its host journal;
  any matching unresolved journal refuses that shortcut. The retired receipt
  and operation remain evidence. Confirmed operations cannot be reclassified.
- Figshare `settle-unapplied-update`: exact `operationId` and `intendedDigest`,
  `priorOperationSettled: true`, `nonApplicationVerified: true`, and
  `evidenceReference`. The administrator must retain positive external proof that
  this exact metadata/embargo request **did not apply** and is settled. A remote
  mismatch, expiry or acknowledgement alone is insufficient. The CLI verifies
  request/target/account/owner identity and audits the attestation; it sends
  nothing, changes no provider checkpoint and refuses confirmed operations.
- Oni `reconcile-initialization`: exact `operationId`. A valid storage root confirms
  initialization. A positively empty root **and workspace** additionally require
  a writer-quiescence receipt or `priorOperationSettled: true` with
  `evidenceReference` before recording non-application. Partial/unreadable roots
  refuse; this command never creates a root. Resume unchanged approved work only
  after applying the correction, or use a fresh eligible save if authority changed.
- Oni `reconcile-ocfl`: exact `operationId`; matching inventory/content proves a
  deposit. Positive non-application additionally needs an existing writer
  quiescence receipt or `priorOperationSettled: true` with `evidenceReference`.
  An unexplained head remains repair required.
- Oni `reconcile-ingestion`: exact `operationId`,
  `acknowledgementVerified: true`, `acceptedAt` and `evidenceReference`. The
  reference must document acceptance of this exact request for its confirmed
  deposit. Repository readiness alone is insufficient. Normal authorised
  execution still polls readiness; this correction does not declare indexing
  complete or object visibility verified.

Oni repairs also accept an already settled operation when the same verification
and evidence agree with its retained terminal outcome. This permits retry after
a lost administrative acknowledgement; contradictory outcomes or changed
acknowledgement/settlement evidence are refused without replacing prior facts.

Correction IDs, current actor/type, reason, scope and evidence references/digests
are retained in the publication correction journal. Interrupted corrections stay
visible for inspection. Keep referenced transport/provider investigation records
available for audit. CLI output omits credentials and prepared payloads.

Existing Figshare commands forward when supplied `--brand BRAND --destination DEST`:

```bash
node support/figshare/admin.js bind-file --brand BRAND --destination DEST --oid OID --username ADMIN --receipt RECEIPT --file-id FILE_ID
```

Unmigrated Figshare commands retain their legacy loader/service path. They also
require `--reason` when the CLI receives `--apply`. Shared-owned records cannot be
changed through legacy commands with implicit brand/destination selection.
Use the shared `migrate` command below for one-way conversion and authority-journal
recovery; the legacy `migrate` command cannot mutate shared-owned state.

## One-way brand migration

Run `migrate` with the same administrator/brand flags. It defaults to inventory
only; reports contain deterministic destination assignments, fingerprints,
translation/review categories and quarantine counts. Credentials and source
payloads are omitted. Supply the verified Figshare account ID explicitly; a
token is never treated as an account identity.

```bash
node support/publication/admin.js migrate --brand BRAND --username ADMIN --parameters '{"figshareAccountId":"ACCOUNT","serviceUsername":"publication-worker","stagingDisk":"durable"}'
```

Pause every deployed legacy/shared schedule and consumer, settle outstanding
network calls, review custom conditions and immediate Oni citation/error callers,
and keep the investigation reference. Applying also requires `consumersStopped:
true`, a nonempty `evidenceReference`, `--apply` and `--reason`. Supply accepted
manual review IDs as `reviews: {"review-ID":"review/reference"}`. Arbitrary
conditions remain unchanged; review does not rewrite their semantics. For
multiple Oni sites, prepare collision-free output paths using
`useExistingConfiguration: true` and explicit source-to-destination `assignments`
(`figshare` and `oni:SITE` keys). The normal configuration validator still applies.

The separate authority journal fences both frameworks while preparation is
incomplete. Re-run the same command after interruption; assignments, evidence and
operation IDs are stable. Source inventories may refresh during pause/drain only
before preparation/evidence copying starts. Subsequent drift blocks commit for
investigation. Successful migration commits shared authority atomically and
leaves processing and every destination disabled. Deleting AppConfig does not
restore legacy authority. There is no reverse or down migration.

Historical links and Oni object IDs are observations, with ingestion and
visibility unverified. Legacy pending saves have no sealed revision approval;
their requester/policy evidence is retained in quarantine and never promoted to
runnable work. Copying receipts, uncertain operations and audits grants no new
permission. Global verification failures block the brand; quarantined records and
conflicting writer groups remain fenced independently after brand commit. Keep
legacy rows and referenced investigation evidence read-only.

Migration evidence participates in the shared staging admission fence and cleanup
reference graph. Deletion tombstones reject copying; interrupted writes retain
pins. An interrupted source admission also remains fenced regardless of age.
After positively settling that stopped writer, pass its exact token from the
inventory's `sourceAdmissions` as `settledAdmissions: ["TOKEN"]`; the CLI records
the administrator, reason and settlement reference before releasing it.

Use `repair --repair release-migration-quarantine` with
`abandonHistoricalAuthority: true` and `evidenceReference` after resolving
historical operations/receipts through provider repairs. It defaults to dry-run
and never grants work, approval, completion or workflow advancement. It retains
the original quarantine/evidence with a correction reference. For a conflict,
first verify/link the selected owner through the provider repair; only that
owner can be released while the other claimants remain quarantined. Invalid,
orphaned or ambiguous source evidence stays quarantined until a compatible
provider repair establishes valid evidence; unresolved identities are never
cleared just because a former worker lease expired.

## Operator guides and examples

The wiki [cutover and recovery runbook](../wiki/Shared-Publication-Operations.md)
walks through inventory, stop/drain, manual reviews, replay, quarantine and
before/read-back/dry-run/apply/after evidence collection. The [configuration
guide](../wiki/Shared-Publication-Configuration.md) explains fixed targets,
approval/auto-sync, all/any and current versus historical destination status.
The [disabled configuration example](../documentation/examples/publication/configuration.json)
validates against the actual schema and registered provider configuration
boundaries in `npm run docs:test` and documentation generation.

No CLI option named `--dry-run` is needed: omission of `--apply` previews a
correction. `reconcile` reads provider evidence; `repair --repair reconcile-evidence`
persists verified evidence without remote mutations, outputs or completion.
Reserved/partially applied workflow decisions remain visible through inspection;
there is no administrative command to blindly replay transition hooks.

## Local readiness and copied-environment rehearsal

```bash
node support/publication/admin.js readiness --brand BRAND --username ADMIN
```

Readiness is read-only and administrator/brand checked. Exit 2 reports local
blockers, including missing capability, unsafe/missing unique indexes, uncommitted
authority, invalid configuration/provider/source state, unverified targets,
unavailable staging configuration, service access or unsettled admissions.
Pause, processing enablement, active owners and local quarantines are reported
separately. It neither repairs indexes nor certifies institutional connectivity,
multi-host disk access, stopped network calls or operator acceptance.

`rehearse.js` runs the real CLI contracts on a stopped, disposable copied
datastore/environment. It compares whole-copy legacy/source/audit inventories
programmatically and proves repeat application preserves converted evidence.
It requires an explicit disposable acknowledgement and a new restricted output
directory. The default only inventories; apply requires a reason. Stage 1 needs
the same reviewed migration parameters described above, stored in a JSON file.
Stage 2 verifies historical imports, mapping/approval attribution, audit references
and frozen revision resolution in addition to inventory/replay equivalence.

```bash
node support/publication/rehearse.js --disposable-copy --stage 1 --brand BRAND --username ADMIN --parameters /restricted/migration.json --evidence /restricted/stage1-rehearsal --apply --reason 'Reviewed copied-data rehearsal'
node support/publication/rehearse.js --disposable-copy --stage 2 --brand BRAND --username ADMIN --evidence /restricted/stage2-rehearsal --apply --reason 'Reviewed copied vocabulary rehearsal'
```

After interruption, retain the first `before.json` and resume into a new evidence
directory with `--baseline /restricted/first-attempt/before.json`. Source drift
fails comparisons; do not refresh a baseline to make them pass. The runner does
not seed data, stop consumers, enable destinations or enable vocabulary
administration. Do not point it at a live environment.

See the [stage-1 activation and forward-repair checklist](../wiki/Shared-Publication-Operations.md)
and separate [stage-2 release runbook](../wiki/Shared-Publication-Vocabularies.md)
for external acceptance evidence and deployed writer/drain requirements.

Superseded source and operation evidence is copied into the append-only native
`publicationhistory` collection before active journals are compacted. Include this
collection in backups and retain its staged inputs. It has no expiry or automatic
deletion policy. Active record journals keep recent settled operations and source
references, plus every unresolved operation and its recovery source. Shared
resource entries are archived only when matching completed record evidence proves
their follow-up work is settled; an acknowledged Oni rebuild awaiting readiness
remains live. New submissions stop at the journal capacity limit before any remote
call. Inspect and reconcile outstanding work rather than deleting evidence to
clear that limit. Archive growth and the cost of conservative cleanup scans still
need deployment sizing and monitoring.

The `publicationdestination` ledger reserves each brand/destination's provider and
remote target before a sealed request can be accepted, including before dispatch.
Reservations are permanent: a failed containing save does not make an already
prepared destination ID reusable for another remote target. Use a new destination
ID when changing a reserved target. The first write-capable configuration lookup
backfills older protected approvals in both active records and deletion snapshots
using indexed, projected cursors and writes a journaled
`publicationdestinationledger` marker only after every identity has been reserved.
Subsequent saves and jobs read the indexed ledger rather than reopening every
approved source in the brand. Failed or conflicting backfills
leave the marker absent and refuse processing; read-only inspection does not
create reservations or mark a backfill complete. Legacy cutover checks read only
the per-brand migration authority and never scan source records. Back up both
ledger collections with the migration journal and protected records, and drain
older application processes before deploying an upgrade that introduces the ledger.

Legacy vocabulary writer admissions also survive rejected operations: a transport
or datastore error does not prove that an issued write cannot still apply. Inspect
`legacyWriterAdmissions` in the conversion dry-run, confirm the owning process and
all writes have settled, then use the existing explicit stopped-writer settlement
parameters. Conversion cannot proceed while one of these admissions remains.

### Exact non-application of an Oni indexing request

`repair --repair settle-unapplied-ingestion` accepts only an exact retained
`oni.index.structural` or `oni.index.search` operation for the confirmed deposit.
Supply `operationId`, its exact `intendedDigest`, `nonApplicationVerified: true`,
`priorOperationSettled: true` and a nonempty `evidenceReference` in `--parameters`.
The reference must retain external proof that this specific rebuild never applied
and that its former call has stopped. Ready indexes, a timeout, a stopped worker
or an unchanged deposit alone cannot supply that proof. This uses the same trusted
administrator receipt boundary as Figshare's `settle-unapplied-update`.

Run dry-run first, then explicit apply with a reason. The correction retains both
journals and records non-application; it sends no request, grants no approval and
claims no completion. Confirmed/rejected outcomes cannot be downgraded. Resume
separately under the current approval to issue the first actual rebuild. If exact
external proof is unavailable, retain the barrier and investigate.

### Exact submission attestations

`inspect` reports each operation's `intendedDigest` and host-derived
`idempotencyKey`. Adapters declare key lookup or `no-remote-lookup`; the latter
must implement the host's `attest-operation` repair. Use explicit scope and a
current administrator with edit access, pause/drain competing work, then dry-run:

```bash
node support/publication/admin.js repair --brand BRAND --oid OID --destination DEST --username ADMIN --repair attest-operation --parameters '{"operationId":"OP","intendedDigest":"DIGEST","idempotencyKey":"rbpub-v1-KEY","outcome":"not_applied","priorOperationSettled":true,"nonApplicationVerified":true,"evidenceReference":"external-investigation/receipt"}'
```

Apply the reviewed correction with `--apply --reason 'Investigation and exact
receipt'`. For confirmation, supply `outcome: "confirmed"` and a nonempty
`externalReceipt` with the provider-required key/target/content/remote identity.
For Figshare/Oni also name the existing exact `providerRepair` and its required
parameters; the wrapper preserves that handler's read-back/proof requirements.
No receipt, expiry or lookup absence alone proves non-application. The combined
lease/revision CAS retains actor/reason/receipt digest/reference and refuses
conflicting replay. It creates no remote mutation, approval or completion.
Resume separately under current unchanged authority. See the
[adapter contract](../documentation/examples/publication-provider.md#operation-idempotency-and-external-attestations).
