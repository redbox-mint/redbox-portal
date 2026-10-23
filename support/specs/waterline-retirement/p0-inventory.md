# Waterline retirement: design-time inventory refresh

Inspected **2026-10-19**, source **`79c116fe0a6e07830ac1313d7403b4277b39e498`**,
branch `t3/waterline-retirement`. This is source discovery, not completed P0
implementation evidence. No deployment database was inspected. Reconfirm it at
P0 and before each group is promoted; private institution hooks remain unknown.

## Delta from the cache pilot

Compared with the pilot inventory's `f6668358d148e09f77fd335bd9941ddaa9dbe949`:

- The **40 core + six storage-hook entity definitions are unchanged**. The model
  directories, storage implementation/migration, TransactionUtils, model/datastore
  defaults, GridFSDriver and MigrationRunner have no source diff. Reuse the
  [pilot model/relationship/callback table](../prisma-cache-persistence/p0-inventory.md).
  Generated User/Role junction collections are additional physical data.
- The [43-model / 80 model-file-pair consumer index](../prisma-cache-persistence/evidence/direct-model-consumers.json)
  is historical. CacheService and both BrandingService preview paths now use
  `CacheEntryRepository`; runtime composition alone resolves the loaded cache
  model. Branding's other model calls remain, at shifted lines. All other files
  in that index have unchanged source. Do not reuse its CacheEntry call sites
  as current business-runtime access or regard its omissions as unused models.
- New persistence/configuration/bootstrap/build work supplies the pilot's lazy
  runtime, owned driver, contract artifacts, preflight, selector and cleanup.
  Cache defaults to Prisma; its Waterline adapter and model still exist.
  [P7](../prisma-cache-persistence/p7-status.md) remains blocked. The final review's
  [round 7](../prisma-cache-persistence/final-review.md#final-review-round-7)
  records no new issue, retaining the startup timing and Solr bootstrap concerns.
- `AGENTS.md` names absent `support/wiki/redbox-core.md`; read the actual
  [Redbox-Core-Types.md](../../wiki/Redbox-Core-Types.md), as the pilot also did.

The named-call index deliberately omits generic/dynamic access. This refresh
also read the following previously unenumerated dependencies; they are **not
new code changes**:

- [ReportsService](../../../packages/redbox-core/src/services/ReportsService.ts)
  returns `RBReport` from `getReportModel()` and queries through that helper.
  `RBReport` registers physical identity **`report`**, not `rbreport`.
- [NamedQueryService](../../../packages/redbox-core/src/services/NamedQueryService.ts)
  discovers models/branding attributes dynamically, executes related-collection
  filters, native record count/find and populated user-role reads. Its native
  record helper goes through configured storage. A named-call-only scan misses
  these readers of every configured query target.
- [DashboardConfigService](../../../packages/redbox-core/src/services/DashboardConfigService.ts)
  checks the Migration model to decide whether legacy dashboard initialization
  may proceed. Moving only MigrationRunner would leave that dependency behind.
- [Typeface backfill](../../../api/migrations/20260904000000-branding-typeface-backfill.js)
  uses BrandingConfig/History through `sails.models`; the
  [sidebar migration](../../../api/migrations/20261014T000000-admin-sidebar-text-color.js)
  deliberately uses their native collections to preserve variables outside the
  current callback allowlist. Both must run on a supported old upgrade path
  after ORM removal without depending on model globals.
- Dev tooling generates Waterline definitions and migration examples:
  `packages/redbox-dev-tools/src/generators/model.ts`, `generators/migration.ts`,
  `utils/config-helper.ts` and `cli.ts`. Retirement includes these extension
  surfaces and templates, not just root runtime dependencies.

## Exhaustive declared-model allocation

Names below are registration names. Core definitions are under
`packages/redbox-core/src/waterline-models/<Name>.ts`; the final six are under
`packages/sails-hook-redbox-storage-mongo/src/models/<Name>.ts`.
These are delivery groups, not promises of Prisma suitability.

| Group / phase | Models | Coupling and initial classification |
| --- | --- | --- |
| C / pilot + P11 | CacheEntry (1) | Completed transaction-free pilot; retain semantics and finish pilot P7. |
| M / P2 | Migration (1) | Startup ledger used before domain bootstraps and by dashboard initialization. |
| R / P3 | ThemeConfig, Form, RecordType, WorkflowStep, DashboardType, RBReport, NamedQuery, WorkspaceType (8) | Brand-scoped definitions; RecordType → WorkflowStep → Form; generated keys and shared bootstrap readers. ThemeConfig has no named core caller, but is exported/dynamically reachable. |
| Q / P4 | AppConfig, DashboardConfiguration, I18nBundle, I18nTranslation (4) | Configuration, legacy dashboard import and translation projections. Native secret lease and dashboard revision updates; bundle/entry synchronization is explicitly best effort today. |
| J1 / P5a | AsynchProgress, WorkspaceAsync (2) | Progress/status tracking; user, brand and record/type references without atomic cross-document writes. |
| J2 / P5b | HarvestRun, HarvestRunChunk, HarvestRecordEvent (3) | Run/chunk/event lineage, counters, deduplication and native conditional run updates; reads records in storage. |
| J3 / P5c | SecurityEvent, SiemDeliveryAttempt (2) | Capture plus delivery leases/retry/recovery/retention. Record enrichment crosses into storage. |
| J4 / P5d | FigshareSync (1) | Native durable state, revision/lease fencing and record-intent acknowledgment; distinct from Figshare vocabulary import. |
| U / P7 | User, Role, UserLink, UserAudit, PathRule, WorkspaceApp (6), plus generated junctions | **Transaction gated**: role membership, account linking/disabling, access effects and audit/security scope. |
| V / P8 | Vocabulary, VocabularyEntry, FigshareVocabularySource, FigshareVocabularyCategory, FigshareVocabularyCrosswalk, FigshareVocabularyCrosswalkMapping, FigshareVocabularySyncRun (7) | **Transaction gated**: hierarchy, managed mirrors, RVA imports, previews/applies/clones and revisioned crosswalk approval. |
| B / P9 | BrandingConfig, BrandingConfigHistory (2) | **Transaction gated**, spanning application and `redboxStorage` datastores; publication, restoration and retention with external fonts/logos. |
| S / P10 | AttachmentMetadata, AttachmentAccessAudit, Counter (3 core); Record, DeletedRecord, RecordAudit, IntegrationAudit, RecordSchemaArtifact, RecordSchemaReference (6 storage) | Storage identity/revision/lifecycle/schema/attachment protocols. Retain staged consistency; newly required atomic multi-document operations inherit the transaction gate. Counter is coupled to RDMP record mutation. |

Totals: **40 core, six storage, no omitted or multiply assigned entity**.
Most identities are lowercase names; `RBReport` is `report`. Defaults are
`mongodb` / `redbox-portal`, except BrandingConfigHistory and all six storage
models use `redboxStorage` / `redbox-storage`. Runtime overrides can change them.
Collection names, default ObjectId representation and string timestamp intent
are declarations until per-model raw fixtures verify the physical data.

## Transaction and relationship facts

[TransactionUtils](../../../packages/redbox-core/src/utilities/TransactionUtils.ts)
tries a datastore transaction and reruns work without a connection only for its
recognized unsupported-adapter error; it also runs without a transaction when
the method is absent. The **four importing modules** are:

- `VocabularyService.ts`: create/update/tree-related operations use the helper.
- `FigshareVocabularyService.ts`: apply preview, clone creation, mapping updates
  and approval use it, with explicit compensation on some nontransactional paths.
- `RvaImportService.ts`: entry upsert plus vocabulary version/sync metadata.
- `BrandingService.ts`: history insert plus version/draft-revision conditional
  publication, with bounded compensation on certified nonapplication outcomes.

`UsersService.ts` is additionally gated despite **not** importing the helper:
linkAccounts creates UserLink, merges/replaces memberships, changes alias/token
state, rewrites record authorizations and writes audit data. Current code is
not proof of atomicity. User create hashes a supplied password with bcryptjs
cost 10; service password updates hash separately. After create/update, the
model invokes pending-access assignment. `customToJSON` removes passwords.

The User/Role many-to-many uses HasMany on both sides; both currently specify
`dominant: true`. Capture the actual loaded Waterline junction identity, column
names, BSON reference types, indexes, duplicates and membership behavior rather
than guessing a join-table name. WorkspaceApp → User and PathRule → Role are
additional authorization relationships. Optional brand links permit global data.

Other relationships include BrandingConfig → roles; branded reference/config
rows; RecordType → WorkflowSteps and WorkflowStep → Form; I18nBundle → entries;
Vocabulary → entries and entry parent/children; the Figshare source/category/
crosswalk/mapping graph. The Figshare sync run's source/localVocabulary/crosswalk,
User.linkedPrimaryUserId/UserLink, DashboardConfiguration.branding, record OIDs,
job run/chunk IDs, actor identifiers and schema digests are **application
references**, even where the model has no association decorator.

## Native access and owners requiring replacement

| Current code | Persistence behavior / owner after retirement |
| --- | --- |
| `persistence/cache/{configuration,runtime,preflight}.ts` | Today reads loaded CacheEntry mapping, datastore manager database/credentials and adapter normalization. Replace that dependency with explicit mapping/config resolution before deleting any cache shim. Keep read-only inspection and explicit scoped index establishment. |
| `services/AppConfigSecrets.ts` | `appconfigsecretlocks`: string `_id`, BSON Date expiry, owner renewal/release and freshness tokens. Encapsulate behind lease operations; preserve AWS timeout/unknown-outcome behavior. This is not a JSON cache collection. |
| `services/DashboardConfigService.ts` | Unique branding index and conditional revision update of one aggregate. Preserve all-or-none multi-target copying within that document. |
| `services/HarvestRunService.ts` | Native run-counter operations and internal pkFactory ObjectId discovery. Replace with adapter-local ID conversion and atomic domain operations. |
| `services/siem/SiemDeliveryStore.ts` | Actual tableName/manager resolution, indexes, owner-token + unexpired-lease updates, retention and legacy processing recovery. |
| `services/figshare-v2/{worker,sync-store}.ts` | Fixed native `figsharesync`, unique OID and partial namespace/article index; CAS replacement, existing bounded retries, lease/dispatch claims, durable generations/receipts. Preserve replacement semantics explicitly. |
| `services/NamedQueryService.ts` | Dynamic model access and storage-native record count/find; preserve supported query language/scoping through a named-query execution module, not a model registry masquerading as a repository. |
| Storage `services/MongoStorageService.ts` and `services/recordSchemaPersistence.ts` | Native active/tombstone operations; undeclared **recordidentity** ledger; configured indexes; schema artifact/reference aggregation and authorization cursors; GridFS streams. Borrows Waterline redboxStorage today. |
| Storage `migrations/recordRevisionBackfill.ts` | Restart-safe bounded conditional bulk update; fills only missing/null revision/lifecycle fields. Registered entrypoint still needs loaded Record/DeletedRecord models. |
| `loader/MigrationRunner.ts`, root `api/migrations/*.js` | Umzug ledger plus historical migration consumers; preserve names, ordering, skip behavior and original failures, with repository-based execution. Unique ledger names do not make migration bodies exactly once across nodes. |
| `services/AgendaQueueService.ts` | Always obtains User manager, including history/index paths; backend can instead own an address-based client. Preserve explicit queue address and actual history location; eliminate User dependency. Queue jobs/history remain Agenda/native Mongo, not Prisma application models. |
| `middleware/redboxSession.ts`, `config/redboxSession.config.ts` | connect-mongo owns a separate session client, normally database `sessions`. Preserve TTL, cookie/login behavior and explicitly close the owned store on shutdown. |
| `storage/GridFSDriver.ts`, `services/StorageManagerService.ts` | Flydrive driver owns cached client/Db promises; static `dispose()` has **no production caller**. Wire disposal and establish per-app ownership so lowering one app cannot close another's clients. |
| `services/BrandingLogoService.ts` | Legacy application-DB GridFS reader owns an independent MongoClient, closes in finally. Retain read compatibility and effective connection selection. |

Existing SIEM/dashboard/Figshare/storage code creates indexes at startup or first
use. That differs from the pilot's inspect-only startup. The programme explicitly
moves required DDL to deployment preparation and verifies readiness before
writers start; document and rehearse this operator-visible change.

## Reproduction searches (read-only)

```bash
git diff f6668358d148e09f77fd335bd9941ddaa9dbe949 HEAD -- packages/redbox-core/src/waterline-models packages/sails-hook-redbox-storage-mongo/src
rg -n '@Entity|@BelongsTo|@HasMany|@Before|@After|customToJSON' packages/redbox-core/src/waterline-models packages/sails-hook-redbox-storage-mongo/src/models
rg -n 'TransactionUtils|runWithOptionalTransaction|usingConnection|\.transaction\(' packages/redbox-core/src packages/sails-hook-redbox-storage-mongo/src
rg -n 'getDatastore|sails\.models|MongoClient|GridFS|createIndex' packages/redbox-core/src packages/sails-hook-redbox-storage-mongo/src api/migrations
rg -n 'hasModels|registerRedboxModels|Waterline|sails-mongo|sails-hook-orm' packages/redbox-core/src packages/redbox-dev-tools/src packages/sails-hook-redbox-storage-mongo/src config
```

P0 must add machine-readable current consumers, relationship/physical mapping
and native-owner inventories, including generic variables, hook code, policies,
controllers, templates, tests, migrations and published package surfaces. A
zero-match named-call scan alone cannot establish retirement readiness.
