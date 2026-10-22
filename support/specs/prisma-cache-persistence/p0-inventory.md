# P0 persistence inventory

Source baseline: `f6668358d148e09f77fd335bd9941ddaa9dbe949` on `next`, inspected 2026-10-19 (Adelaide).
Scope is the checked-in portal and bundled hooks, not private institution installations.
No existing deployment database was inspected or modified. Runtime overrides must be
inventoried separately at each institution before Prisma activation.

## Models, relationships and lifecycle callbacks

The following 40 core definitions and six storage-hook definitions exhaust the
`@Entity` declarations in `packages/*/src`. Identities are the default physical
collection names; hooks can replace them. Core exports live in
`packages/redbox-core/src/waterline-models/index.ts`; storage exports live in
`packages/sails-hook-redbox-storage-mongo/src/models/index.ts`.
The shared `models.config.ts` defaults supply `id` (string, column `_id`),
automatic string `createdAt`/`updatedAt`, `migrate: safe` and
fetch-on-create/update/createEach. No checked-in model overrides the primary key.
Timestamp declaration exceptions include HarvestRecordEvent's required string
`createdAt` and RecordSchemaArtifact/RecordSchemaReference's explicit automatic
string timestamps with `columnType: datetime`. These are declarations, not proof
of physical types across all models or an institution's indexes. P0 established
the physical representation of CacheEntry only; see the real fixture separately.

Paths below are relative to the repository root. B = BelongsTo, H = HasMany;
association options and callback handler names are preserved from source.

| Definition | Identity / datastore | Relationships | Lifecycle callbacks |
| --- | --- | --- | --- |
| `packages/redbox-core/src/waterline-models/AppConfig.ts` | `appconfig` / `mongodb` | branding: B('brandingconfig', { required: true }) | none |
| `packages/redbox-core/src/waterline-models/AsynchProgress.ts` | `asynchprogress` / `mongodb` | branding: B('brandingconfig', { required: true }) | none |
| `packages/redbox-core/src/waterline-models/AttachmentAccessAudit.ts` | `attachmentaccessaudit` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/AttachmentMetadata.ts` | `attachmentmetadata` / `mongodb` | none | BeforeCreate(beforeCreate); BeforeUpdate(beforeUpdate) |
| `packages/redbox-core/src/waterline-models/BrandingConfig.ts` | `brandingconfig` / `mongodb` | roles: H('role', 'branding') | BeforeUpdate(handleBeforeUpdate); BeforeCreate(handleBeforeCreate) |
| `packages/redbox-core/src/waterline-models/BrandingConfigHistory.ts` | `brandingconfighistory` / `redboxStorage` | branding: B('brandingconfig', { required: true }) | none |
| `packages/redbox-core/src/waterline-models/CacheEntry.ts` | `cacheentry` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/Counter.ts` | `counter` / `mongodb` | branding: B('brandingconfig') | none |
| `packages/redbox-core/src/waterline-models/DashboardConfiguration.ts` | `dashboardconfiguration` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/DashboardType.ts` | `dashboardtype` / `mongodb` | branding: B('brandingconfig', { required: true }) | BeforeCreate(assignKey) |
| `packages/redbox-core/src/waterline-models/FigshareSync.ts` | `figsharesync` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/FigshareVocabularyCategory.ts` | `figsharevocabularycategory` / `mongodb` | source: B('figsharevocabularysource', { required: true }); entry: B('vocabularyentry', { required: true }) | BeforeCreate(beforeCreate); BeforeUpdate(beforeUpdate) |
| `packages/redbox-core/src/waterline-models/FigshareVocabularyCrosswalk.ts` | `figsharevocabularycrosswalk` / `mongodb` | branding: B('brandingconfig', { required: true }); localVocabulary: B('vocabulary', { required: true }); figshareSource: B('figsharevocabularysource', { required: true }) | BeforeCreate(beforeCreate); BeforeUpdate(beforeUpdate) |
| `packages/redbox-core/src/waterline-models/FigshareVocabularyCrosswalkMapping.ts` | `figsharevocabularycrosswalkmapping` / `mongodb` | crosswalk: B('figsharevocabularycrosswalk', { required: true }); localEntry: B('vocabularyentry', { required: true }); figshareCategory: B('figsharevocabularycategory', { required: true }) | BeforeCreate(beforeCreate); BeforeUpdate(beforeUpdate) |
| `packages/redbox-core/src/waterline-models/FigshareVocabularySource.ts` | `figsharevocabularysource` / `mongodb` | branding: B('brandingconfig', { required: true }); vocabulary: B('vocabulary', { required: true }) | BeforeCreate(beforeCreate); BeforeUpdate(beforeUpdate) |
| `packages/redbox-core/src/waterline-models/FigshareVocabularySyncRun.ts` | `figsharevocabularysyncrun` / `mongodb` | branding: B('brandingconfig', { required: true }) | BeforeCreate(beforeCreate); BeforeUpdate(beforeUpdate) |
| `packages/redbox-core/src/waterline-models/Form.ts` | `form` / `mongodb` | branding: B('brandingconfig', { required: true }) | none |
| `packages/redbox-core/src/waterline-models/HarvestRecordEvent.ts` | `harvestrecordevent` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/HarvestRun.ts` | `harvestrun` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/HarvestRunChunk.ts` | `harvestrunchunk` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/I18nBundle.ts` | `i18nbundle` / `mongodb` | branding: B('brandingconfig'); entries: H('i18ntranslation', 'bundle') | BeforeUpdate(beforeUpdate); BeforeCreate(beforeCreate) |
| `packages/redbox-core/src/waterline-models/I18nTranslation.ts` | `i18ntranslation` / `mongodb` | branding: B('brandingconfig'); bundle: B('i18nbundle') | BeforeUpdate(beforeUpdate); BeforeCreate(beforeCreate) |
| `packages/redbox-core/src/waterline-models/Migration.ts` | `migration` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/NamedQuery.ts` | `namedquery` / `mongodb` | branding: B('brandingconfig', { required: true }) | BeforeCreate(setKey) |
| `packages/redbox-core/src/waterline-models/PathRule.ts` | `pathrule` / `mongodb` | role: B('role', { required: true }); branding: B('brandingconfig', { required: true }) | none |
| `packages/redbox-core/src/waterline-models/RBReport.ts` | `report` / `mongodb` | branding: B('brandingconfig', { required: true }) | BeforeCreate(assignKey) |
| `packages/redbox-core/src/waterline-models/RecordType.ts` | `recordtype` / `mongodb` | branding: B('brandingconfig', { required: true }); workflowSteps: H('workflowStep', 'recordType') | BeforeCreate(assignKey) |
| `packages/redbox-core/src/waterline-models/Role.ts` | `role` / `mongodb` | branding: B('brandingconfig'); users: H('user', 'roles', { dominant: true }) | none |
| `packages/redbox-core/src/waterline-models/SecurityEvent.ts` | `securityevent` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/SiemDeliveryAttempt.ts` | `siemdeliveryattempt` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/ThemeConfig.ts` | `themeconfig` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/User.ts` | `user` / `mongodb` | workspaceApps: H('workspaceApp', 'user'); roles: H('role', 'users', { dominant: true }) | AfterUpdate(handleAfterMutation); AfterCreate(handleAfterMutation); BeforeCreate(hashPassword) |
| `packages/redbox-core/src/waterline-models/UserAudit.ts` | `useraudit` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/UserLink.ts` | `userlink` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/Vocabulary.ts` | `vocabulary` / `mongodb` | branding: B('brandingconfig', { required: true }); entries: H('vocabularyentry', 'vocabulary') | BeforeCreate(beforeCreate); BeforeUpdate(beforeUpdate) |
| `packages/redbox-core/src/waterline-models/VocabularyEntry.ts` | `vocabularyentry` / `mongodb` | vocabulary: B('vocabulary', { required: true }); parent: B('vocabularyentry'); children: H('vocabularyentry', 'parent') | BeforeCreate(beforeCreate); BeforeUpdate(beforeUpdate) |
| `packages/redbox-core/src/waterline-models/WorkflowStep.ts` | `workflowstep` / `mongodb` | form: B('form'); recordType: B('recordType') | none |
| `packages/redbox-core/src/waterline-models/WorkspaceApp.ts` | `workspaceapp` / `mongodb` | user: B('user', { required: true }) | none |
| `packages/redbox-core/src/waterline-models/WorkspaceAsync.ts` | `workspaceasync` / `mongodb` | none | none |
| `packages/redbox-core/src/waterline-models/WorkspaceType.ts` | `workspacetype` / `mongodb` | branding: B('brandingconfig', { required: true }) | none |
| `packages/sails-hook-redbox-storage-mongo/src/models/DeletedRecord.ts` | `deletedrecord` / `redboxStorage` | none | BeforeCreate(normalizeTombstoneLifecycle); BeforeUpdate(stripTombstoneRevision) |
| `packages/sails-hook-redbox-storage-mongo/src/models/IntegrationAudit.ts` | `integrationaudit` / `redboxStorage` | none | none |
| `packages/sails-hook-redbox-storage-mongo/src/models/Record.ts` | `record` / `redboxStorage` | none | BeforeCreate(normalizeServerRevision); BeforeUpdate(stripServerRevision) |
| `packages/sails-hook-redbox-storage-mongo/src/models/RecordAudit.ts` | `recordaudit` / `redboxStorage` | none | none |
| `packages/sails-hook-redbox-storage-mongo/src/models/RecordSchemaArtifact.ts` | `recordschemaartifact` / `redboxStorage` | none | none |
| `packages/sails-hook-redbox-storage-mongo/src/models/RecordSchemaReference.ts` | `recordschemareference` / `redboxStorage` | none | none |

Callback consequences matter beyond cache: User hashes passwords on create and
assigns pending record access after create/update; BrandingConfig normalizes and
validates CSS variables; I18n models normalize keys; dashboard/record/report/named
query callbacks assign keys; vocabulary, Figshare vocabulary and attachment
callbacks validate/normalize input. Storage Record/DeletedRecord protect revisions
and tombstone state. None of these are authorized for migration by the cache pilot.
Role/User HasMany associations cause Waterline junction-model generation beyond
the 46 declared models. Other identifier fields (e.g. linkedPrimaryUserId,
record OIDs, vocabulary slugs, audit IDs) are application references rather than
Waterline associations; PostgreSQL needs an explicit model for these too.

## Direct model and native access

[evidence/direct-model-consumers.json](evidence/direct-model-consumers.json)
records 43 named models and 80 model/file pairs, with operation names and line
numbers. It inventories named calls rather than payloads. Generic model variables
and runtime `sails.models` lookups are also used: inspect `TransactionUtils.ts`,
service helpers, `loader/MigrationRunner.ts`, `bootstrap.ts` and the native paths
below before widening scope. Generated `api/models` files are outputs, not an
additional model source. Static line numbers refer to the source baseline.

- Application/reference models are used directly by their corresponding core
  services: Users/Roles, Forms/RecordTypes/WorkflowSteps, AppConfig/Branding,
  DashboardConfig/DashboardTypes, I18nEntries/Translation, Vocabulary/
  FigshareVocabulary/RvaImport, HarvestRun, Workspace/WorkspaceTypes/Asynchs,
  NamedQuery, Reports, AttachmentMetadata and audit/SIEM services. Some controllers
  also query models; the attached index includes these, not only services.
- `services/AppConfigSecrets.ts` uses the loaded AppConfig datastore manager's
  `appconfigsecretlocks` collection (native lease/ownership operations).
- `services/DashboardConfigService.ts` uses the loaded DashboardConfiguration
  manager and native `createIndex` to enforce brand uniqueness.
- `services/HarvestRunService.ts` uses native `harvestrun` collection access for
  conditional updates; `services/siem/SiemDeliveryStore.ts` uses the loaded
  SecurityEvent/SiemDeliveryAttempt managers/table names for native indexes,
  delivery leases and event state operations. These do not use the cache.
- `services/figshare-v2/worker.ts` uses FigshareSync's manager for native durable
  job state. Vocabulary/FigshareVocabulary/RvaImport and BrandingService pass
  loaded datastores to `utilities/TransactionUtils.ts`, which uses Waterline
  transactions when available and documented nontransactional paths otherwise.
- `sails-hook-redbox-storage-mongo/src/services/MongoStorageService.ts` uses
  Record/DeletedRecord/RecordAudit/IntegrationAudit/schema models and native
  managers for atomic revision operations, cursors, schema artifact/reference
  operations, indexes and GridFS. `migrations/recordRevisionBackfill.ts` uses the
  loaded Record manager/table names for native backfills. This is record storage,
  not application CacheEntry storage.
- `services/BrandingLogoService.ts` opens an independent native MongoClient for
  legacy application-DB GridFS reads and closes it in `finally`; Buffers go to
  that service's own memory map, not CacheEntry.
- `storage/GridFSDriver.ts` owns cached MongoClient/Db promises keyed by URL and
  database; it resolves the configured datastore (default `mongodb`) and bucket
  (default `fs`). `StorageManagerService.ts` composes Flydrive disks.
  GridFSDriver exposes static `dispose()` to close its cached clients, but a
  repo-wide source search found no call to it; shutdown wiring is not established
  by this inventory. BSON Date/ObjectId/binary use here is expected, and outside
  the JSON-only cache repository boundary.

## Datastores, owners and shared server impact

- `config/datastores.config.ts`: `mongodb` defaults to
  `mongodb://localhost:27017/redbox-portal`; `redboxStorage` defaults to
  `mongodb://mongodb:27017/redbox-storage`. The two logical datastores are distinct.
  Sails ORM/sails-mongo own both loaded datastore connections. Consumers borrowing
  `.manager` do not own those clients. `BrandingConfigHistory` explicitly uses
  `redboxStorage` despite being a core branding model.
- `services/AgendaQueueService.ts`: Agenda 6.2.6 / @agendajs/mongo-backend 4.0.3
  uses the application URL, configured queue db address, or User's manager. A
  URL-backed backend may own another pool; a manager-backed backend borrows
  Waterline's. Agenda's native job collection is not a Waterline model. Stop
  lifecycle and the optional SQS backend remain separate from cache.
- `middleware/redboxSession.ts` and `config/redboxSession.config.ts`: connect-mongo
  6.0.0 creates the express-session store, with its own client from `mongoUrl`,
  default `mongodb://mongodb:27017/sessions`. Its TTL/session index semantics must
  survive shared MongoDB upgrades. It is not the `mongodb` datastore connection.
- Legacy `skipper-gridfs` remains a dependency; the current active GridFS paths
  are MongoStorageService, the Flydrive GridFS driver and legacy branding reads.
  Do not equate npm dependency presence with an observed production upload path.
- `support/development/docker-compose.yml` explicitly points application DB,
  redboxStorage and sessions at the same `mongodb` service in separate databases.
  Mocha/Bruno/Playwright stacks also share their stack's MongoDB service across
  these users. Generated hook archetypes and PDFgen stacks do likewise. Existing
  running local development has a MongoDB 7 image label, but P0 did not query
  its server or connect to its database.
  Server upgrades therefore need smoke tests for all these clients, independent
  of which models migrate to Prisma.

## CacheEntry consumers and institution extension points (P0.2)

The exhaustive core query surface from `rg -n -i 'cacheentry|cacheservice'
packages/*/src typescript api config` is:

1. `services/CacheService.ts:61,87,91,94`: get uses findOne(name); set uses
   findOne(name), then update(name) or create. Public reads are Observables,
   writes void. Update is the loaded model's multi-update, not an upsert.
2. `services/BrandingService.ts:638,661,675,679,683`: draft preview create,
   retained-version preview create, token findOne(name), expired destroy(id),
   successful destroy(id). Both creation paths await persistence.
3. `services/IntegrationNotificationService.ts:117,127,137,149,163`: the only
   core CacheService get/set consumer; key
   `intnotif:<brandId-or-none>:<redboxOid>:<lowercased-integrationName>`, states
   `{failedAt: ISO string, expiresAt: ISO string}` and reset `null` with TTL zero.
   No Date instance is passed to CacheService by this producer.
4. `waterline-models/CacheEntry.ts`, its `index.ts` export and `WaterlineModels`
   map expose the definition/class/attributes/global model; `model/storage/
   CacheEntryModel.ts` and its barrel expose the older structural cache type.
   `services/index.ts` exports CacheService and its lazy service getter.
5. `bootstrap.ts:153` calls cacheservice.bootstrap. EJS views and the dev-tools
   Angular generator call getNgAppFileHash; that map uses the filesystem, not
   CacheEntry. `hooks/hookDiscovery.ts`'s HookDiscoveryCacheEntry is an unrelated
   memory-cache type. No core migration or bundled hook queries CacheEntry.

Test-only direct calls/doubles are in the existing CacheService, BrandingService,
BrandingServiceLifecycle, ConfigService and BrandingFontDelivery unit tests,
`test/setup.ts`, `test/integration/globals.d.ts`, and the root BrandingService
integration test that backdates previews. New P0 tests add explicit test-only
references; migrate their doubles/fixtures at the appropriate later phase.

Supported customization routes requiring institution review:

- `sails.hasModels: true` + `registerRedboxModels().CacheEntry` replaces the whole
  core definition (`loader/index.ts:451-460,754-783`), not only callbacks.
  Hook processing order/root hookLoadPriority selects the winning hook. No
  checked-in bundled hook supplies a CacheEntry override; private hooks unknown.
- A replacement can change datastore, tableName/collection, primaryKey, `_id`
  representation, JSON field shape, timestamp defaults, extra attributes,
  lifecycle callbacks, custom methods and validation. Effective model defaults
  and `config/env/*` / Sails environment settings can also redirect connections.
  The Waterline bridge must use the loaded model and preserve update cardinality
  and callback behavior. Prisma activation requires explicit migration review.
- `registerRedboxServices` can replace CacheService/BrandingService/notification
  service behavior; hooks can call globals or `sails.models.cacheentry` directly.
  Public package exports include the current Waterline definition. Retaining
  registration/shims during development does not make callbacks execute in Prisma.
- CacheService accepts `unknown`, while the model TypeScript `data` annotation is
  narrower than its Waterline JSON runtime (primitives work in the fixture).
  There is no strict JSON validation today. No checked-in persisted producer
  supplies BSON/Buffer/Date/BigInt/function/cycles. That is not evidence about
  institution hooks or existing data. The native-inserted synthetic legacy-BSON
  fixture demonstrates values a MongoDB collection can contain; it is not an
  institution-data discovery. Report such values before activation, never coerce
  or rewrite them automatically.

## Scope carried forward

CacheEntry is relationship-free and has no core lifecycle callbacks, making it
a bounded pilot. Later decisions are required for reference/configuration data,
then users/relationships/transactions, then record storage/native MongoDB users.
PostgreSQL needs physical ID/schema/index/timestamp mapping, relationship and
transaction design, data migration and explicit replacements for GridFS, session,
queue and native collection operations; a cache interface does not supply those.
