# Figshare Service Technical Guide

Figshare's shared adapter owns provider sequencing; `PublicationService` owns source approval, dispatch, leases, guarded mutations, retries, status and central workflow. Start with [queued synchronization](Figshare-Queued-Synchronisation), [configuration](Shared-Publication-Configuration) and [cutover/recovery](Shared-Publication-Operations). The old inline pipeline is not the save-hook contract for a committed brand.

## Implementation boundaries

The implementation is in `packages/redbox-core/src/services/FigshareService.ts` and `services/figshare-v2/publication-{adapter,config,context,source,state,admin}.ts`, supported by the existing identity, metadata, managed-assets, embargo, publish and write-back modules. Provider state version 2 retains the complete legacy row under `legacy`, including receipts, operation/checkpoint/correction history and unknown JSON. Unsupported state versions fail without rewriting evidence.

`PublicationSync` keys work by brand/OID/destination. Canonical provider namespace/article identity enforces one managing binding across the deployment. Destination labels, owner labels and credentials cannot create a second managing owner. Submitted/uncertain operations are durable evidence even after lease loss, revocation or source replacement.

## Service compatibility and extension seams

`createUpdateFigshareArticle`, `uploadFilesToFigshareArticle`, `validateFigshareRecord` and `wakeFigshareRecord` delegate to shared acceptance/wake handling for committed brands. Record saves perform local validation and finalization, not remote API work. Returned records need not contain a newly created article ID or URL yet. `syncRecordWithFigshare`, old worker jobs and publish/workflow aliases resolve backend migration assignments and wake stored work; stale queued article/user fields cannot choose a target or grant authority. Ambiguous assignments fail closed.

`publicationAdapterHooks()` binds the actual service instance, preserving `getConfig`, `buildMetadataPayload`, `makeClient` and `syncMetadata` overrides. Review deployed overrides before cutover: the real outgoing payload, account context and hashes must be retained. Legacy phase helpers still exist for implementation compatibility; calling raw phases from a save hook is not a supported bypass of shared authority or journalling. Extend the [provider contract](Publication-Provider-Development) when adding another integration. Use generated shims from the normal loader.

## Provider configuration and sequencing

A shared destination reconstructs provider defaults without consulting legacy AppConfig. `mapping` contributes metadata/authors/categories; `attachments` contributes selection/assets; `providerOptions` contributes article/impersonation/embargo/record options. Registered central outputs include article ID/URLs and status/error/state/upload-marker defaults. Legacy `workflow.transitionJob` is disabled in the reconstructed config; central rules own advancement.

Preparation is local: seal actual mapped content, approved crosswalk revisions, attribution and attachment identities. Execution verifies token account independently of author `user_id` and creation owner. It journals create/update/upload/embargo/publish intent before transport, uses exact-token create recovery, protects foreign files/unmanaged fields and waits for curation/manual publication as appropriate. JSON impersonation uses request bodies and read/delete impersonation uses query parameters; binary uploader traffic receives neither API credentials nor impersonation parameters.

Mutations use the host guard and cancellation signal. Returned HTTP success requires explicit provider evidence before journalling confirmation. Unknown outcomes reconcile read-only; another create or publish cannot follow merely because a call timed out. Managed-file repair verifies receipt ownership, article identity, size and checksum. Completion requires current confirmed remote publication; embargo/accessibility and historical links are reported separately.

The shared worker projects registered narrow outputs under current record/source checks. Figshare separately declares a narrow post-completion `attachment-to-url` content replacement capability. The PUB-12 conditional write rechecks current completion and sibling obligations and atomically retains exact mutation evidence without invalidating approval. Original-byte deletion is performed only by the scheduled fenced cleanup path after recovery-copy and reference checks. See [queued synchronisation](Figshare-Queued-Synchronisation) for timing, configuration and retention semantics.

## Mapping and crosswalk compatibility

Path, Handlebars and async JSONata primitives live under `integration-v2`; provider context builders remain separate. Figshare keeps escaped Handlebars and its null/default behavior. Contributor bindings evaluate a contributor root with brand context, while record metadata bindings evaluate the record. Crosswalk bindings retain `sourceVocabularyId`, `crosswalkId`, a simple nested `source` binding and `outputs: categoryId | label | sourceId`. Category payloads require `categoryId`. Prepared approval pins the approved revision; moving the approved pointer cannot change retry output.

## Figshare Vocabulary Bootstrap Imports

`FigshareVocabularyService.bootstrapData()` is a headless driver over the same public methods
the admin import wizard uses. It reads
`<bootstrap.bootstrapDataPath>/vocabularies/figshare-imports.json` and, for each declared
`{ scope, taxonomyId, localCloneName, localCloneSlug?, crosswalkName? }` entry:

1. Skips the entry when a `FigshareVocabularySource` already exists for
   `{ branding, scope, taxonomyId }` — the idempotency key, equivalent to the `rvaSourceKey`
   check in `VocabularyService.processRvaImportsFile`.
2. Calls `createPreview({ ..., createLocalClone: true })`.
3. Reads the resulting `FigshareVocabularySyncRun` row directly and collects the
   `preselected` proposal ids. In clone mode every proposal is a `clone:<sourceId>` identity
   match. It deliberately does not page `getPreview()`, which caps at `MAX_PAGE_SIZE` (200)
   per page while a real taxonomy runs to thousands of categories.
4. Calls `applyPreview()`, which creates the mirror `Vocabulary` (`source: 'external'`), the
   `FigshareVocabularySource`, the `FigshareVocabularyCategory` rows, the clone vocabulary,
   the crosswalk, and the mapping edges inside one transaction.
5. Renames the crosswalk when `crosswalkName` is supplied, via `uniqueCrosswalkName()` to
   respect the unique `{ branding, name }` index.
6. Calls `approveCrosswalk()`. This step is load-bearing: `writeMappingEdges` creates mappings
   with `status: 'proposed'`, and `resolveCategories()` rejects any crosswalk that lacks an
   approved revision, so an unapproved crosswalk would be useless to publishing.

Ordering constraint: the importer is invoked from `coreBootstrap()` **after**
`appconfigservice.bootstrap()`, not alongside `vocabularyservice.bootstrapData()`. Figshare
connection settings are resolved from the per-brand application configuration via
`resolveFigshareVocabularyConfig()`, which is not populated until AppConfig has bootstrapped.
`VocabularyService.bootstrapData()` therefore skips `figshare-imports.json` explicitly rather
than misreading it as a vocabulary definition.

Operational guarantees:

- Nothing throws. A missing file is a silent no-op, a malformed file is logged, and a failing
  entry is logged and skipped without affecting the remaining entries.
- Each entry is wrapped in `promiseWithTimeout` (`packages/redbox-core/src/utilities/PromiseUtils.ts`,
  shared with the RVA importer) so a hung catalogue request cannot stall the lift.
- `vocab.bootstrapFigshareImports: false` disables the feature; the actor recorded on all
  created records is `bootstrap-data`.

A crosswalk binding's `crosswalkId` stores a database id and is therefore not portable between
environments — bootstrapping creates the crosswalk, but an administrator still selects it per
environment on the Categories binding.

## Publishing Resolution

`FigshareVocabularyService` exposes two resolution methods, both reading only the crosswalk's
**approved** revision. They share a private `resolveCrosswalkTargets()` that holds every
fail-closed guard: approved status and a non-null `approvedRevision`,
`crosswalk.localVocabulary === sourceVocabularyId`, and a non-archived Figshare source. Each
raises `RelationshipBoundaryError`.

| Method | Returns |
|---|---|
| `resolveCategories({brandId, crosswalkId, sourceVocabularyId, codes})` | `{categoryIds, unresolvedCodes, historicalTargets}` — the narrow legacy surface |
| `resolveCrosswalkValues({..., outputs})` | `{values, normalizedCodes, unresolvedCodes, historicalTargets}` — backs the `crosswalk` binding kind |

`values` per output mode:

- `categoryId` — `FigshareVocabularyCategory.categoryId`, deduped and numerically sorted.
- `sourceId` — `category.sourceId`, deduped, in input-code order.
- `label` — `FigshareVocabularyCategory` has no label column, so labels come via its `entry`
  foreign key to `VocabularyEntry.label`, batch-loaded in one query. A missing entry or blank
  label falls back to `sourceId` with a warning: the mapping *did* resolve, so it must not be
  reported as an unresolved code.

Historical (upstream-retired) categories are excluded from `values` in all three modes and
reported in `historicalTargets`; the caller decides whether that is fatal. A code that maps
only to historical categories is therefore not "unresolved".

`resolveCrosswalkValues` must stay listed in `_exportedMethods` — `bindings.ts` reaches it
through the sails global, so omitting it fails at runtime while still type-checking.

`getCrosswalkUsage()` walks the entire `figsharePublishing` config for objects with
`kind === 'crosswalk'` matching the id, returning a dotted `bindingPath` per hit. Any binding
can reference a crosswalk now, so a targeted check would miss references and silently disarm
the `deleteCrosswalk` guard.

## Verification

Core Figshare regression coverage remains in `test/services/figshare-*.test.ts`, `test/services/FigshareService.test.ts`, `test/services/figshare-v2/` and the shared `test/services/publication/` suites. Native shared-worker/provider/recovery coverage is in storage-mongo's `PublicationWorker`, `FigsharePublication`, `PublicationWorkflow`, `PublicationAdmin` and `PublicationMigration` integration suites. Use the repository [automated-test guide](ReDBox-Automated-Tests) and require disposable Mongo configuration for storage acceptance. These suites use fixtures; they do not replace real institutional staging or deployed-hook acceptance.
