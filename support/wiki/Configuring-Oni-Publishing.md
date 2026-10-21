# Configuring Oni publishing

After brand cutover, configure Oni as named destinations under `publicationPublishing`, in the existing AppConfig editor. `oniPublishing` applies only to unmigrated brands; `sails.config.datapubs` is no longer read. Follow [shared configuration](Shared-Publication-Configuration) and the [one-way cutover/recovery runbook](Shared-Publication-Operations).

The [validated disabled example](https://github.com/redbox-mint/redbox-portal/blob/master/support/documentation/examples/publication/configuration.json) includes an Oni destination with explicit storage, ingestion and collision-free outputs. Its endpoint/account/token markers and disks are illustrative and do not grant processing authority. Tests validate both the unified schema and the real Oni configuration decoder.

## Site configuration and storage

One named destination represents one Oni site. `connection` holds the former site's `publicUrl`, `useCleanUrl`, Flydrive `storage` and `ingestion`. `mapping` retains Oni graph/binding structure; `attachments` retains its selection settings. `providerOptions` carries `rootCollection` and `metadata`, including `targetRepoNamespace` in the root-collection configuration. Register all three central `writeBack` keys: `citationUrlPath`, `citationDoiPath`, `publicationErrorPath`. Several sites require separate output paths; no two destinations may own overlapping metadata/array roots.

Configure repository disks with `StorageManagerService` in `sails.config.storage.disks`; keep actual S3 credentials in deployment configuration/secret storage. `connection.storage` references `diskName`, `prefix`, virtual `rootPath`, `workspacePath`, `tempDir` and `keyEncoding` with `driver: "flydrive"`. Shared Oni supports verified FS and S3 backends. Physical FS real paths or S3 endpoint/bucket/prefix establish repository identity; disk aliases and virtual root labels cannot bypass shared writer ownership. Repository storage and durable shared publication staging are separate concerns.

Set `connection.ingestion.adminToken` through AppConfig's masked secret control. Leave `forceReindex` false for normal publishing unless the deployed Oni requires a full structural/search rebuild. Changing a used target/repository requires a new destination ID. Migration verifies the actual storage backend, not just its configured label.

## Acceptance, completion and visibility

`OniService.exportDataset(oid, record, options, user)` preserves its signature and record return shape. For a shared brand it returns after durable acceptance, or registration with a containing save; it does not wait for OCFL, indexing or write-back. It does not fabricate a new citation or return a job descriptor. Local explicit-approval validation can reject the request. Remote failures appear in destination status instead of synchronous remote exceptions from the hook.

Review callers that inspect immediate citations, catch remote failures or force repeated exports. Existing citations may remain while new content is pending; current/historical status identifies their revision. Source requester, actual historical approver and creator snapshots remain distinct from the local background persistence identity. A departed approver alone does not cancel institutional approval.

Source acceptance seals actual crate output, selected bytes, logical paths and generated publication timestamp. The worker then checkpoints prepared/submitted/confirmed deposit, ingestion and projection. It verifies exact OCFL inventory and the complete crate/file manifest. After a confirmed deposit, ingestion or projection failure resumes the missing steps without an unnecessary new REPLACE version. Do not use `forceRun` or delete checkpoints to repeat a deposit.

A lost commit response is reconciled read-only. Matching exact content confirms the existing version; positive non-application also requires evidence that all prior writer I/O has settled. Lease expiry, a timeout or a rejected storage Promise cannot supply that evidence. A different/unexplained head or incomplete reads stop for repair. Repository resource leases serialize root collection, dataset and indexing operations across records/brands.

When ingestion is enabled, structural/search rebuild acceptance and readiness have separate checkpoints after the relevant confirmed deposit. An acknowledged rebuild resumes polling. An unknown POST outcome requires repair even if an old index reports ready. Completion is the intended confirmed OCFL content plus configured indexing, or indexing explicitly not required, followed by guarded projection/coordinator evaluation. Repository readiness is not proof of this object's discoverability: **object visibility remains unverified**. The Integration Status component displays deposit, indexing and visibility separately for each destination.

## Recovery and customer hooks

Use the shared CLI to inspect/read back a specific destination:

```bash
node support/publication/admin.js inspect --brand BRAND --username ADMIN --oid OID --destination DEST
node support/publication/admin.js reconcile --brand BRAND --username ADMIN --oid OID --destination DEST
```

The [recovery runbook](Shared-Publication-Operations) covers `reconcile-evidence`, `reconcile-initialization`, `reconcile-ocfl`, exact-request `reconcile-ingestion`, pause/resume/revoke and migration quarantine release. Corrections default to dry-run, require current admin/edit access and refuse active worker/repository owners. Only reviewed corrections receive `--apply --reason`; unknown outcomes and original investigation evidence remain retained. There is no supported return to legacy workers after cutover.

Inventory deployed `createRepository`, `runPublishDataset` and `ingestDataset` subclasses. The shared adapter retains compatible configuration/repository dispatch but uses sealed mapping and checkpointed indexing; it does not invoke legacy all-in-one `runPublishDataset`/`ingestDataset` overrides. Port required customization through the [supported provider boundary](Publication-Provider-Development) and verify recovery reads/canonical repository identity. Review hook order, site assignments, grant/continuation expressions, service edit access and immediate return/error assumptions before activation.

For much older `datapubs` settings, first move `rootCollection`, `metadata` and `sites` into valid legacy `oniPublishing`: `sites.<name>.url` becomes `publicUrl`, `dir` becomes the structured Flydrive storage object, `metadata.jsonld_filename` becomes `jsonldFilename`, and `DEFAULT_IRI_PREFS` becomes `defaultIriPrefs`. Removed render/HTML/datapub/related-work settings are not accepted; configure related works, funders and subjects in `mapping.graphEntities`. Then use shared migration inventory/apply; historical IDs/links do not establish ingestion, visibility or new approval.
