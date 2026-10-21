# Queued Figshare synchronisation

For a brand committed to shared authority, Figshare runs through `PublicationService`, alongside Oni and hook providers. Source saves validate/seal a revision and fixed destinations; workers reconcile and mutate later. Protected `publicationSource` and destination-keyed `PublicationSync` rows are authoritative. Queue messages are identifier-only wake-ups, so lost/duplicate delivery does not grant or lose approval.

Read [shared configuration](Shared-Publication-Configuration) and [one-way cutover/recovery](Shared-Publication-Operations) before enabling processing. Unmigrated brands retain the legacy `figshareSyncIntent`/`FigshareSync` path and `figsharePublishing` settings. Committed brands use `publicationPublishing`; missing/disabled config never restores legacy authority.

## Source hooks and workflow

Existing Figshare validation/upload/create-update/wake aliases delegate to trusted shared acceptance for migrated brands. They return records without inline remote mutation. Events and destination choices come from configured source policies and migration assignments, never job article IDs/users or arbitrary hook options. Compatibility calls inside a save participate in its tracker; standalone calls reload and conditionally accept committed content only. Failed or ambiguous saves cannot become runnable by age.

Review old eligible-save triggers explicitly: `approval` authorizes one sealed revision and whole fixed set, while `auto-sync` authorizes fresh eligible revisions. Separate grant-stage/requester checks from current continuation restrictions. Changing mapped content or selected bytes invalidates older work. Status/link projections and the expected internal stage change preserve unchanged siblings. Local explicit approval rejects the entire set on validation failure; auto-sync failures are isolated per destination.

Shared workflow rules replace provider-owned transition jobs. `all` requires current completion from every fixed member, including disabled/archived members. `any` advances once on a currently eligible completion while unfinished approved siblings continue. It does not reapply their original grant-stage gate. Neither mode compensates by withdrawing successful remote publications. Current access, continuation, source/configuration identity and revocation still apply.

## Account, owner and remote identity

The destination records the actual token account ID separately from author `user_id` and create-as-owner identity. Impersonation retains operation-specific owner/token behavior. CI lookup uses institutional identifier first and exact email fallback only when permitted and the identifier is absent. Conflicting/ambiguous identifiers fail closed. Changing the CI never transfers an existing article.

Creation journals a provisional-title token and original API/account/owner context before transport. Exact-token recovery pages that context, verifies a unique result and retains hidden-create/failed-response evidence. A missing/404/invisible article or expired lease never permits a blind second create. API namespace/article identity has one managing owner across brands and destinations. Referenced destinations cannot be repointed; use a new destination ID for a different account/environment.

## Processing and files

`Publication-Dispatch` scans Mongo every 30 seconds and queues `Publication-SyncRecord` with brand/OID/destination only. The shared worker owns destination leases, heartbeat, retries, approval checks and operation journals. Before each mutation it verifies current authority, selected bytes, material mapping, target, edit permissions and provider locks. A lost owner cannot checkpoint or send another mutation; already-sent calls may finish and require read-only reconciliation.

The adapter retains actual customized metadata payload hashes, unmanaged custom fields and foreign files. Curation locks freeze metadata, assets, embargo and publication together. Both automatic publication modes wait for confirmed uploads; `manual` never submits publication. Review, manual-publication, upload and embargo waits consume no transport-failure attempt. Bounded durable retries and transport retries remain separate.

Selected bytes are sealed/staged with identities and checksum-backed managed receipts. Unchanged attachments can reuse verified identities; changes under the same filename do not establish equivalence or ownership. Deselection removes only receipt-owned remote files. Interrupted upload initialization/parts retain uncertainty and require verified repair before another uploader continues. Do not adopt files by name.

After provider-confirmed completion for the current approved generation, the shared framework replaces receipt-owned selected attachments at the configured `record.dataLocationsPath` with verified public Figshare download URLs. Unselected attachments, unrelated entries and their order are preserved. The adapter declares the narrow `attachment-to-url` post-completion content replacement capability; attachment fields are never status/link maintenance outputs. The conditional record write rechecks current destination obligations, including unimported or pending sibling work, and retries conflicts by reloading/revalidating. A durable admission fence for each destination generation seals the final completion decision against concurrent byte-consuming requests; read-only observations remain available. A new publication request uses a new generation rather than resuming byte-consuming work for the replaced generation. An unfinished sibling retains the attachments even after an `any` workflow transition; the dispatcher revisits replacement after it completes. The exact before/after array, source reference, approval/epoch, generation, destination, deterministic mutation ID and timestamp are retained in protected record evidence. This internal replacement preserves approval and does not republish the completed destination. Later user edits still invalidate approval normally.

Hosted-file publishing must be enabled (`attachments.assets.enableHostedFiles`, corresponding to legacy `assets.enableHostedFiles`) and public file accessibility must be verified before replacement. Embargoed/unavailable downloads defer replacement and schedule read-only maintenance; confirmed publication and workflow completion remain separate. Existing manual/automatic publication choices are unchanged. `assets.staging.cleanupPolicy` keeps its existing upload-temporary-file meaning: `deleteAfterSuccess` deletes those temporary copies after upload; `retainForRetry` retains them on success. Failed uploads clean up their temporary copies under either setting. It is not an on/off switch for record replacement or original-byte cleanup. Shared durable recovery staging always follows reference retention rules.

Replacement itself deletes no bytes. Figshare preparation retains a verified, durable staged copy before original bytes become reclaimable. The scheduled `Publication-StagingCleanup` path considers originals after `max(one hour, processing.cleanupMs)`, scans current and deleted records and every retained source/recovery manifest, and retains originals if recovery still depends on live bytes or evidence is unreadable/unknown. Durable admission pins never expire automatically. Cleanup installs an irreversible original-attachment tombstone before removal through the configured datastream service; retries finish interrupted removal without reopening admission. Source/lifecycle writes that would reintroduce a tombstoned attachment are rejected. Staged recovery bytes remain protected by their own manifest/reference fence. Pre-existing sources without registered original-byte identities are retained conservatively.

## Publication and status

Submission, acceptance and provider-confirmed publication are distinct. Uncertain publish calls are reconciled before another mutation. A private article during institutional/manual processing is a normal wait, not a failed publication. A readiness recovery clears only its own error episode; it cannot erase an exhausted source-sync failure.

Integration Status shows each named destination and current source separately, including ready work not yet imported. Confirmed Figshare publication counts for workflow only with matching current approval/source/binding and no unresolved work for that destination. Embargo/accessibility remains separate evidence. An old article URL or historical audit success cannot complete newer content. Logical audit episodes remain bounded across repeated waiting polls.

## Operations and customer hooks

Use the shared CLI for committed brands:

```bash
node support/publication/admin.js inspect --brand BRAND --username ADMIN --oid OID --destination DEST
node support/publication/admin.js reconcile --brand BRAND --username ADMIN --oid OID --destination DEST
node support/publication/admin.js repair --brand BRAND --username ADMIN --oid OID --destination DEST --repair bind-file --parameters '{"receipt":"RECEIPT_KEY","fileId":"789"}'
```

The repair above is a dry-run. Apply only after reviewing the result, with `--apply --reason 'INC-123 verified receipt/checksum'`. See the [complete recovery runbook](Shared-Publication-Operations) for account/owner linking, settlement attestations, multipart recovery, evidence reconciliation, pause/resume, revocation and quarantine release. Repairs refuse active relevant leases, retain journals/receipts and do not grant approval or publish. No recovery requires hand-editing Mongo.

Existing Figshare operator command names forward when given explicit brand, destination and OID:

```bash
node support/figshare/admin.js bind-file --brand BRAND --destination DEST --oid OID --username ADMIN --receipt RECEIPT_KEY --file-id 789
```

Unmigrated Figshare commands retain their legacy service path. The legacy `migrate` command cannot perform shared cutover; use `support/publication/admin.js migrate`. There is no rollback to legacy consumers after shared authority commits. Pause, retain evidence and repair forward.

Customer subclasses must review `getConfig`, `buildMetadataPayload`, `makeClient` and `syncMetadata` against the shared adapter. The actual service instance is used for these supported compatibility seams, so custom payloads and client context must participate in the sealed plan and recovery hashes. Hooks expecting immediate new article fields require adaptation to asynchronous status. Stage 1 retains Figshare vocabulary/crosswalk IDs, approved revisions and administration; broader vocabulary conversion is a later release.

See [technical contracts](Figshare-Service-Technical-Guide), [provider configuration](Configuring-Figshare-Publishing) and [provider development](Publication-Provider-Development).
