# Shared publication cutover and recovery

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

Cutover is one-way per brand. The independent migration journal fences both frameworks during preparation and commits shared authority only after verification. Keep legacy rows, audits, receipts and investigation evidence read-only. There is no reverse converter, down migration or supported return to legacy consumers after cutover. Backups are disaster-recovery assets; restoring application state cannot undo remote operations.

Use this runbook with [configuration](Shared-Publication-Configuration), [Figshare](Figshare-Queued-Synchronisation), [Oni](Configuring-Oni-Publishing) and the repository's [CLI reference](https://github.com/redbox-mint/redbox-portal/blob/master/support/publication/README.md). Run commands from the deployed checkout with matching compiled core, Mongo storage and hook packages and normal environment/brand configuration. The loader disables Agenda only in its own process; it does not stop other workers.

## Stage and review before cutover

1. Record deployed package versions, stored AppConfig, source/hook order, policy IDs, destination/site assignments and evidence inventories. Preserve backups and a durable incident/change reference. Rehearse repeated and interrupted migration on a disposable representative copy.
2. Review every deployed customer hook, rather than relying on repository search. Review Figshare `getConfig`, `buildMetadataPayload`, `makeClient`, `syncMetadata` customizations; they must preserve actual outgoing payload and recovery hashes. Review Oni `createRepository`, `runPublishDataset`, `ingestDataset` subclasses: the shared path uses sealed mapping and checkpointed indexing, so legacy all-in-one overrides are not called. Migrate their behavior through the supported adapter boundary.
3. Review Oni callers that read immediate citation fields, catch synchronous remote errors or rely on `forceRun` rewriting a deposit. `exportDataset` now returns a record after durable acceptance/save registration. Local approval validation can reject; remote failures are asynchronous destination status. Do not add a synchronous fallback.
4. Review arbitrary grant/continuation expressions manually. Known save-trigger policies become explicit auto-sync; arbitrary expressions are retained verbatim. A stage gate appropriate at grant can cancel siblings after `any` if left in continuation. Record deliberate policy decisions and review references; acknowledging a review does not rewrite a condition.
5. Verify the local service account's current edit access, complete storage capability, native indexes, actual Figshare token account/owner identity, Oni physical repository and durable staging from every worker host. Test real Figshare curation/manual publication/embargo/multipart recovery and real Oni FS/S3 read-back and configured indexing. Automated fixtures do not certify institutional credentials or remote visibility.

The shared Figshare adapter applies its registered attachment-to-URL content replacement only after current approved completion and settlement of sibling obligations. It retains exact mutation evidence and preserves approval without republishing. Source bytes are reclaimed separately through the scheduled fence after a verified recovery copy exists; pins, live references, unstaged recovery dependencies and unknown evidence retain originals. Review the configuration/timing and drain older writers before enabling cleanup; see [Figshare queued synchronisation](Figshare-Queued-Synchronisation). Institution-specific staging and deployed-hook acceptance remain activation gates.

## Inventory, fence, convert and commit

`migrate` is the migration CLI command; there is no separate executable or `--dry-run` flag. Omitting `--apply` performs inventory only. Replace uppercase placeholders from the actual report and keep command outputs in a restricted evidence directory outside transient logs:

```bash
node support/publication/admin.js migrate --brand BRAND --username ADMIN --parameters '{"figshareAccountId":"ACCOUNT","serviceUsername":"publication-worker","stagingDisk":"publication-staging"}' > migration-inventory.json
```

Reports include deterministic assignments, source/configuration fingerprints, manual review IDs/categories, global failures, counts and quarantines, without resolved credentials or prepared payloads. `figshareAccountId` must be the independently verified token account ID, not an author `user_id` or a guessed credential identity. Omit it for an Oni-only brand. Use exact review IDs from `manualReviews`, each mapped to the retained review reference.

Stop all deployed legacy/shared consumers and schedules for the brand. Prevent new publication acceptance, drain leases and positively settle outstanding transport/storage calls. Lease expiry alone does not settle a remote call. Where shared authority already exists, use the pause command below as an additional persistent control. Do not depend on that command for an unmigrated brand whose unified configuration is unavailable.

After the inventory is accepted and all requested reviews have references, run the reviewed apply command:

```bash
node support/publication/admin.js migrate --brand BRAND --username ADMIN --parameters '{"figshareAccountId":"ACCOUNT","serviceUsername":"publication-worker","stagingDisk":"publication-staging","consumersStopped":true,"evidenceReference":"changes/CHG-123/drain","reviews":{"REVIEW_ID":"changes/CHG-123/hook-review"}}' --apply --reason 'CHG-123 reviewed one-way cutover' > migration-apply.json
```

Use `{}` for `reviews` only when inventory reports no required reviews. `consumersStopped` and `evidenceReference` are explicit attestations backed by retained investigation records, not commands that stop consumers. Global capability/configuration/index/authority/access/verification failures block commit. Correct their cause while retaining the fence and evidence, then rerun the same reviewed command. Inventory may refresh while paused/draining only before preparation/evidence copying starts; subsequent source/configuration drift blocks for investigation instead of rebasing copied authority.

For multiple Oni sites or custom outputs, prepare valid disabled `publicationPublishing` AppConfig first, with collision-free output paths. Inventory and apply with `useExistingConfiguration: true` and explicit assignments. Source keys are `figshare` and `oni:SITE`; values are actual destination IDs in that prepared config:

```bash
node support/publication/admin.js migrate --brand BRAND --username ADMIN --parameters '{"useExistingConfiguration":true,"assignments":{"figshare":"figshare-main","oni:public":"oni-research"}}' > migration-prepared-inventory.json
```

The prepared config supplies service/staging/account settings in this mode. Repeat these same parameters for apply, adding `consumersStopped`, `evidenceReference`, all reported `reviews`, `--apply` and `--reason`. Do not rename deterministic assignments after evidence copying begins.

Migration reads historical article IDs, state projections and citation links from the effective destination's configured paths. Preserve those legacy evidence paths when preparing configuration; substituting the example's new paths does not move old values. Compare the inventory with the pre-cutover record/link inventory. If resolving output collisions would omit historical evidence, keep cutover disabled until a compatible migration/repair retains it. Do not guess a site's identity or silently copy one citation to several destinations.

Interrupted source admissions stay pinned regardless of age. If inventory reports `sourceAdmissions`, positively settle that exact stopped writer first. Only then add `settledAdmissions: ["EXACT_TOKEN_FROM_REPORT"]` to the migration parameters with its settlement `evidenceReference`. The CLI journals actor, reason, tokens and reference before releasing admissions. Never clear pins, migration rows or leases manually to bypass uncertainty.

Repeated apply resumes stable IDs/progress/evidence after interruption. A committed replay returns `alreadyCommitted: true`; it does not reconvert or re-enable processing. Verify `authority: "shared"`, counts, quarantines and retained fingerprints against the accepted inventory. Migration leaves processing and every destination disabled. Complete staging acceptance, then explicitly enable the accepted destinations and processing through AppConfig and clear any independent operational pause. Unified config remains authoritative even when missing, invalid or disabled; fix it forward.

## Inspect and pause

Every command requires a current administrator for the explicit brand; record commands also check current edit access. `inspect` works even when configuration cannot be resolved. `reconcile` performs read-only provider investigation and requires existing destination work; it does not persist a repair. Neither accepts `--apply`.

```bash
node support/publication/admin.js inspect --brand BRAND --username ADMIN > publication-brand-inspect.json
node support/publication/admin.js inspect --brand BRAND --username ADMIN --oid OID --destination DEST > publication-before.json
node support/publication/admin.js reconcile --brand BRAND --username ADMIN --oid OID --destination DEST > publication-readback.json
node support/publication/admin.js pause --brand BRAND --username ADMIN
node support/publication/admin.js pause --brand BRAND --username ADMIN --apply --reason 'INC-123 stop new publication mutations'
```

Corrections default to dry-run. The first pause above previews its scope; only the applied command persists it. Add `--destination DEST` for destination-wide pause. Pause has no record scope. Stop/drain other consumers before corrections; current worker/repository leases also refuse them. A two-minute administrative ownership window expires closed. If a correction is interrupted, inspect the retained correction journal and provider evidence before retrying.

Save before/read-back/dry-run/apply/after output under distinct filenames. Retain the underlying provider/transport evidence referenced by the correction, not merely CLI output. Do not delete uncertain journals, receipts, source descriptors, legacy rows or staging pins to force a retry. Late remote outcomes after revocation/source change may be retained historically; they cannot complete newer content.

## Reconcile evidence, repair and resume

`inspect` lists supported provider repair IDs. Use `repair --repair ID --parameters JSON`; repair names are not top-level shared CLI commands. Preview a repair, review its read-back, then apply the identical scope/parameters with a reason:

```bash
node support/publication/admin.js repair --brand BRAND --username ADMIN --oid OID --destination DEST --repair reconcile-evidence > publication-repair-preview.json
node support/publication/admin.js repair --brand BRAND --username ADMIN --oid OID --destination DEST --repair reconcile-evidence --apply --reason 'INC-123 persist verified read-back' > publication-repair-applied.json
node support/publication/admin.js inspect --brand BRAND --username ADMIN --oid OID --destination DEST > publication-after.json
```

`reconcile-evidence` persists verified checkpoints/journal outcomes, with no remote mutation, output projection, completion grant or workflow advancement. Sealed historical source evidence must remain available. Older confirmed receipts may be incorporated from retained provider proof even after later approved work changes the remote state: Figshare uses a completed synchronization checkpoint plus verified article identity/ownership; Oni verifies the exact immutable version inventory or retained index acceptance/readiness. A compacted repository index receipt is restored under its resource lease before further reconciliation. Submitted/uncertain operations still require their own conclusive outcome evidence. Other built-in repairs are:

- Figshare `link` / `relink`: `{"articleId":"123","ownerId":"456"}`. Numeric-string identities are verified against the actual account/owner and exclusive binding. Replacement requires resolved prior operations and no live managed receipts; previous binding/checkpoints remain retained. Linking alone establishes no current completion.
- Figshare `abandon-create` / `reset-publish`: `{"priorOperationSettled":true,"evidenceReference":"incidents/INC-123/settlement"}`. Requires positive prior-call settlement plus exact-token absence or verified private/non-curated state. Retired evidence remains. An invisible object or elapsed lease is insufficient.
- Figshare `bind-file`: `{"receipt":"RECEIPT_KEY","fileId":"789"}`. Verifies the existing article-owned receipt and completed file identity. Hosted files require size/checksum proof; link-only files require the exact approved receipt URL. Names never establish file ownership. Both file repairs incorporate and acknowledge matching initialization journals only after verifying the owned remote file.
- Figshare `resume-upload`: the same receipt/file parameters plus `priorOperationSettled: true` and `evidenceReference`. Stop and positively settle the former uploader first; verification resumes the owned upload rather than initializing another file.
- Figshare `settle-unapplied-update`: `{"operationId":"EXACT_OPERATION_ID","intendedDigest":"EXACT_INTENDED_DIGEST","priorOperationSettled":true,"nonApplicationVerified":true,"evidenceReference":"incidents/INC-123/provider-non-application-receipt"}`. Only submitted/uncertain metadata or embargo set/clear requests qualify. Obtain and retain positive external evidence proving that this exact request did **not apply**, as well as that its former invocation is settled. The operation ID/digest must match that evidence. A stopped process, expired lease, remote mismatch, or an acknowledgement alone is insufficient; updates may have applied and subsequently changed. This is an explicit administrator attestation, like an exact external indexing acknowledgement: the CLI verifies recorded request/target/account/owner identity, audits the evidence reference, and records non-application without sending, changing provider checkpoints, approving or completing work. It cannot reclassify a confirmed operation. If no positive proof exists, retain uncertainty and investigate/restore provider access; do not attest by inference.
- Figshare `settle-file-operation`: `{"operationId":"EXACT_OPERATION_ID","receipt":"RECEIPT_KEY","priorOperationSettled":true,"evidenceReference":"incidents/INC-123/non-application"}`. For a submitted/uncertain initialization, completion or deletion, positively settle the exact former request first. Read-only verification requires no plausible initialized file, the exact still-created upload, or the exact still-present completed owned file, respectively. Initialization receipts are retained in history; completion/deletion receipts retain ownership for normal authorized continuation. If an initialization intent stopped before its host journal, omit `operationId`; any matching unresolved journal refuses this shortcut. Confirmed operations cannot be reclassified. A still-present file never proves deletion succeeded. Missing, contradictory or inaccessible evidence refuses; an applied outcome uses ordinary reconciliation instead. The repair sends nothing and grants no approval/completion.
- Oni `reconcile-initialization`: `{"operationId":"EXACT_OPERATION_ID"}` for an existing storage-initialization journal. Read-only inspection can confirm a valid root. A positively empty root and workspace require a persisted writer-quiescence receipt or `priorOperationSettled: true` plus `evidenceReference` before recording non-application. Partial, inaccessible or nonempty roots/workspaces refuse; restore/verify the repository before retrying. The repair never creates a root or grants approval.
- Oni `reconcile-ocfl`: `{"operationId":"EXACT_OPERATION_ID"}`. Exact inventory/content can confirm a deposit. Confirming non-application additionally needs a persisted writer-quiescence receipt or `priorOperationSettled: true` with `evidenceReference`. Unexplained heads remain repair required; no blind REPLACE follows a timeout.
- Oni `reconcile-ingestion`: `{"operationId":"EXACT_OPERATION_ID","acknowledgementVerified":true,"acceptedAt":"2026-10-19T12:00:00Z","evidenceReference":"incidents/INC-123/index-ack"}`. Replace the illustrative timestamp with the actual acceptance time, at or after submission. Evidence must identify this exact rebuild and confirmed deposit. The repair records acknowledgement only; authorized execution still polls readiness. It does not verify object visibility.

After a reviewed correction, preview and apply record resume:

```bash
node support/publication/admin.js resume --brand BRAND --username ADMIN --oid OID --destination DEST
node support/publication/admin.js resume --brand BRAND --username ADMIN --oid OID --destination DEST --apply --reason 'INC-123 retry current approved work after reconciliation'
```

Record resume retains operation uncertainty, receipts, historical completion and source references. It does not approve newer content. A brand/destination resume (omit `--oid`, optionally keep `--destination`) clears its operational pause; clear both scopes if both were paused. Configuration must also permit processing. Resume never enables disabled/archived destinations or changes target identity.

Revoke by exact approval ID from inspection:

```bash
node support/publication/admin.js revoke --brand BRAND --username ADMIN --oid OID --destination DEST --approval APPROVAL_ID
node support/publication/admin.js revoke --brand BRAND --username ADMIN --oid OID --destination DEST --approval APPROVAL_ID --apply --reason 'INC-123 revoke the fixed approval scope'
```

Revocation advances the whole fixed approval's epoch, including sibling destinations. It does not withdraw an already public object. Reserved/partially applied workflow decisions remain visible on inspection. There is no CLI repair to blindly replay side-effecting transition hooks; retain evidence and investigate with a compatible forward fix.

## Migration quarantine

Legacy pending saves have no sealed source-revision approval. Migration retains requester/policy/save evidence in quarantine without granting runnable work. Historical links and Oni object IDs are observations; ingestion and visibility remain unverified. Duplicate writer groups quarantine every claimant, including legacy peers in other brands. A local quarantine can isolate unsafe work after brand-wide checks pass; global failures continue to block the brand.

Resolve historical operations and receipts through the provider repairs above. For a conflict, verify/link the chosen owner first; only it can be released while other claimants remain fenced. Then preview and apply the explicit historical-authority abandonment:

```bash
node support/publication/admin.js repair --brand BRAND --username ADMIN --oid OID --destination DEST --repair release-migration-quarantine --parameters '{"abandonHistoricalAuthority":true,"evidenceReference":"incidents/INC-123/resolved-historical-evidence"}'
node support/publication/admin.js repair --brand BRAND --username ADMIN --oid OID --destination DEST --repair release-migration-quarantine --parameters '{"abandonHistoricalAuthority":true,"evidenceReference":"incidents/INC-123/resolved-historical-evidence"}' --apply --reason 'INC-123 release selected owner after verified settlement'
```

Release retains original quarantine reasons/evidence and adds a correction reference. It grants no work, approval, completion or workflow advancement. Fresh work needs a new eligible sealed request. Invalid/orphaned/ambiguous evidence remains quarantined until compatible repair establishes valid ownership and evidence; age is not a repair.

Monitor destination status, source/queue lag, oldest pending age, active leases, waiting/retry/repair and quarantine counts after explicit activation. On problems, pause, reconcile and repair forward with a compatible shared worker. Keep stage-2 vocabulary conversion separate: stage 1 retains existing Figshare vocabulary IDs, approved revisions, history and editor references.

## Readiness, copied-environment rehearsal and activation evidence

Use matching compiled core/storage/hook packages and UI assets. Record the source
commit, exact package versions and asset hashes; do not pair a new worker with an
older source-storage hook. The read-only readiness command checks the current
brand administrator, full storage capability, matching datastore, native unique
indexes (including repository resources), configuration, provider schema/registry
and state versions, committed authority, verified target fingerprints, current
local service access, staging-disk configuration and unsettled source admissions.
It reports disabled processing, operational pause, active owners and quarantine
counts separately. Exit 2 means local blockers; exit 1 means the command failed.
It never repairs indexes, enables processing or calls a remote provider:

```bash
node support/publication/admin.js readiness --brand BRAND --username ADMIN > readiness-before-enable.json
```

A local pass does not establish token validity, multi-host storage accessibility,
network quiescence or operator acceptance. Verified target fingerprints are retained
migration evidence; changing credentials requires the real-account check below.
Quarantine alone is not a brand-wide failure. A missing/unsafe unique index is.
Processing may be enabled only after both local and external gates pass.

The reusable rehearsal runner invokes the real administrative CLI/service against
the normal configuration. Run only on an isolated disposable copy with workers
stopped. It does not seed records, change targets or enable anything. Parameters
are read from a restricted JSON file containing the reviewed migration options:

```bash
node support/publication/rehearse.js --disposable-copy --stage 1 --brand BRAND --username ADMIN --parameters /restricted/migration-parameters.json --evidence /restricted/rehearsal-stage1-preview
node support/publication/rehearse.js --disposable-copy --stage 1 --brand BRAND --username ADMIN --parameters /restricted/migration-parameters.json --evidence /restricted/rehearsal-stage1-apply --apply --reason 'CHG-123 disposable copied-data rehearsal'
```

It records repeated dry-runs, before/after whole-copy legacy/source/audit count and
hash inventories, committed conversion, converted-evidence inventory and replay.
Assertions fail if any legacy row changes, processing/destinations are enabled by
migration, global failures remain, or a replay rewrites evidence. Include pending,
failed/abandoned saves, uncertain create/publication/upload outcomes, duplicated
writers, historical-only links/Oni identifiers and more than one brand in the copy.
After interrupting a converter, resume into a new evidence directory with
`--baseline /restricted/first-attempt/before.json`. Preserve that original baseline,
failed receipts and drain evidence. Investigate drift; do not overwrite inventories
until comparisons pass. The runner exports hashes/counts and safe reports, never
raw records, sealed payloads or resolved credentials. Store reports as restricted
operational evidence nevertheless.

After accepted rehearsal and real staging, deploy the matching package/asset set
with processing and destinations off. Stop/drain every old and new consumer,
capture inventory, apply migration, verify committed authority and readiness, and
record quarantine decisions. Explicitly enable accepted destinations and brand
processing in AppConfig, verify the masked reload and then apply brand/destination
resume where paused. Do not enable quarantined work by clearing evidence. Grant a
fresh eligible sealed request to the accepted nonproduction canary record. Verify
each destination, current source/generation, links and `all`/`any` workflow outcome.

## Institutional stage-1 checklist (external gates)

These gates remain open until an institution operator records actual evidence:

- [ ] Figshare identity: staging API/account, token account ID, bound owner,
  create-as-owner context and distinct creator/approver/author IDs. Retain redacted
  requests and read-back IDs; never retain tokens in the acceptance report.
- [ ] Figshare lifecycle: receipt-owned multipart uploads/checksum, interrupted
  upload/create/publish reconciliation, no duplicate remote object/file, unmanaged
  fields/files retained, curation locks across all mutations, manual publication,
  automatic publication and embargo/accessibility changes. Record request and
  operation IDs, receipts, before/read-back/after status and remote mutation counts.
- [ ] Oni physical storage: each supported deployed FS/S3 configuration, canonical
  repository/object identity, exact inventory/head/content read-back after lost
  response, quiescence evidence before retrying non-application, and no unnecessary
  version after confirmed commit. Retain inventory/version/hash and interruption logs.
- [ ] Oni indexing/projection: exact rebuild accepted after its deposit, shared
  root/repository contention, readiness timestamps and projection-failure recovery.
  Record object-search visibility separately; repository-ready is not object visibility.
- [ ] Deployed hooks: package/version/commit, actual hook order, policy IDs and
  grant/continuation semantics; Figshare payload/client overrides, Oni override and
  immediate citation/error callers; output/array paths and vocabulary pins.
  Record reviewer, changed callers and accepted asynchronous behavior per brand.
- [ ] All hosts: actual local service identity and current edit access; matching
  storage capability/index/schema/registry checks; durable staging write/read and
  digest verification from every eligible worker host; older writers drained and
  lease/admission/cleanup fence behavior under the deployed topology. Keep host,
  version, namespace, digest and timestamp receipts.
- [ ] Copied customer-data rehearsal: copy/backup identity, pre/post/replay
  inventories, interrupted boundaries, quarantine/conflict-owner decisions and
  proof that an unsafe global gate blocks everyone until repaired, followed by
  fresh unaffected work after commit. Disposable synthetic fixtures supplement this.
- [ ] Production release: compatible package/asset IDs, stopped/drained consumers,
  migration/authority/readiness receipts, explicit AppConfig enablement and masked
  reload, operator acceptance, release/change ID and enabled brands/destinations.
- [ ] Real-brand observation: record initial and agreed observation-window values
  for source/queue lag, oldest pending age, active leases, waiting/retry/repair and
  quarantine counts, current projections and one logical workflow decision. Name
  monitoring owner, thresholds, review times and incident escalation reference.

## Forward repair after activation

On a failed canary, unexplained lag, schema/capability/index error or uncertain
remote call, apply pause and stop/drain affected consumers. Preserve readiness,
source/work/operation IDs, before/read-back/dry-run/apply/after reports and provider
transport evidence. A pause cannot cancel a request already sent. Reconcile its
outcome, retain historical evidence after revocation and use the supported scoped
repairs above. Resolve global faults before any brand resumes; local quarantine
can remain while unaffected work proceeds after those checks pass. Deploy a
compatible forward fix, rerun readiness and accepted canaries, then explicitly
resume and record operator sign-off. Never delete journals, reset authority,
restore legacy workers or blindly repeat non-idempotent operations. Keep legacy
data read-only and retain the original release and repair inventories.

Stage 2 has a separate [vocabulary conversion and activation runbook](Shared-Publication-Vocabularies).
