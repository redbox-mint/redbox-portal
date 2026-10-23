# P0 observed mappings

All rows below are actual source models loaded through Sails/Waterline on the
isolated standalone MongoDB capture. Every ordinary create has ObjectId `_id`,
string-facing returned `id`, ISO-string createdAt/updatedAt and only `_id`
index in the initial safe-mode phase. Attribute/column names, required/null,
default/validation configuration, every raw field and BSON type, associations,
and returned/serialized values are in `waterline-mongo8.ejson.models[Entity]`.
Defaults listed here are loaded declaration intent; the archive records which
values were actually written. Missing-required failures use the first required
attribute only; they are not exhaustive validators. No table is a SQL schema.

| Group | Entity | Datastore / physical collection | Loaded default fields | Callback surfaces | Required-field negative |
| --- | --- | --- | --- | --- | --- |
| S | AttachmentAccessAudit | mongodb / `attachmentaccessaudit` | — | — | E_INVALID_NEW_RECORD |
| S | AttachmentMetadata | mongodb / `attachmentmetadata` | isJournal, attemptCount, accessCount | beforeUpdate, beforeCreate | E_INVALID_NEW_RECORD |
| Q | AppConfig | mongodb / `appconfig` | — | — | E_INVALID_NEW_RECORD |
| J1 | AsynchProgress | mongodb / `asynchprogress` | — | — | E_INVALID_NEW_RECORD |
| B | BrandingConfig | mongodb / `brandingconfig` | version, hash, draftRevision | beforeCreate, beforeUpdate | no required field |
| B | BrandingConfigHistory | redboxStorage / `brandingconfighistory` | — | — | E_INVALID_NEW_RECORD |
| C | CacheEntry | mongodb / `cacheentry` | — | — | E_INVALID_NEW_RECORD |
| S | Counter | mongodb / `counter` | — | — | E_INVALID_NEW_RECORD |
| Q | DashboardConfiguration | mongodb / `dashboardconfiguration` | provenance | — | E_INVALID_NEW_RECORD |
| R | DashboardType | mongodb / `dashboardtype` | tableConfig, searchable, system | beforeCreate | E_INVALID_NEW_RECORD |
| V | FigshareVocabularyCategory | mongodb / `figsharevocabularycategory` | selectable, historical | beforeUpdate, beforeCreate | E_INVALID_NEW_RECORD |
| V | FigshareVocabularyCrosswalk | mongodb / `figsharevocabularycrosswalk` | status, workingRevision | beforeUpdate, beforeCreate | E_INVALID_NEW_RECORD |
| V | FigshareVocabularyCrosswalkMapping | mongodb / `figsharevocabularycrosswalkmapping` | status | beforeUpdate, beforeCreate | E_INVALID_NEW_RECORD |
| V | FigshareVocabularySource | mongodb / `figsharevocabularysource` | archived | beforeUpdate, beforeCreate | E_INVALID_NEW_RECORD |
| V | FigshareVocabularySyncRun | mongodb / `figsharevocabularysyncrun` | createLocalClone, state | beforeUpdate, beforeCreate | E_INVALID_NEW_RECORD |
| J4 | FigshareSync | mongodb / `figsharesync` | — | — | E_INVALID_NEW_RECORD |
| R | Form | mongodb / `form` | — | — | E_INVALID_NEW_RECORD |
| J2 | HarvestRecordEvent | mongodb / `harvestrecordevent` | operation, outcome, status | — | E_INVALID_NEW_RECORD |
| J2 | HarvestRun | mongodb / `harvestrun` | status, totalProcessed, created, updated, deleted, unchanged, failed, chunksProcessed, duplicateChunks | — | E_INVALID_NEW_RECORD |
| J2 | HarvestRunChunk | mongodb / `harvestrunchunk` | attempt, status, recordCount, totalProcessed, created, updated, deleted, unchanged, failed, duplicate | — | E_INVALID_NEW_RECORD |
| Q | I18nBundle | mongodb / `i18nbundle` | enabled, namespace | beforeCreate, beforeUpdate | E_INVALID_NEW_RECORD |
| Q | I18nTranslation | mongodb / `i18ntranslation` | namespace | beforeCreate, beforeUpdate | E_INVALID_NEW_RECORD |
| M | Migration | mongodb / `migration` | — | — | E_INVALID_NEW_RECORD |
| R | NamedQuery | mongodb / `namedquery` | expandRelations | beforeCreate | E_INVALID_NEW_RECORD |
| U | PathRule | mongodb / `pathrule` | — | — | E_INVALID_NEW_RECORD |
| R | RecordType | mongodb / `recordtype` | searchCore, searchable | beforeCreate | E_INVALID_NEW_RECORD |
| R | RBReport | mongodb / `report` | — | beforeCreate | E_INVALID_NEW_RECORD |
| U | Role | mongodb / `role` | — | — | E_INVALID_NEW_RECORD |
| J3 | SecurityEvent | mongodb / `securityevent` | — | — | E_INVALID_NEW_RECORD |
| J3 | SiemDeliveryAttempt | mongodb / `siemdeliveryattempt` | — | — | E_INVALID_NEW_RECORD |
| R | ThemeConfig | mongodb / `themeconfig` | — | — | no required field |
| U | User | mongodb / `user` | accountLinkState, loginDisabled | customToJSON, assignAccessToPendingRecords, beforeCreate, afterCreate, afterUpdate | E_INVALID_NEW_RECORD |
| U | UserLink | mongodb / `userlink` | — | — | E_INVALID_NEW_RECORD |
| U | UserAudit | mongodb / `useraudit` | — | — | E_INVALID_NEW_RECORD |
| V | Vocabulary | mongodb / `vocabulary` | type, source, slug | beforeUpdate, beforeCreate | E_INVALID_NEW_RECORD |
| V | VocabularyEntry | mongodb / `vocabularyentry` | order, historical | beforeUpdate, beforeCreate | E_INVALID_NEW_RECORD |
| R | WorkflowStep | mongodb / `workflowstep` | hidden | — | E_INVALID_NEW_RECORD |
| U | WorkspaceApp | mongodb / `workspaceapp` | — | — | E_INVALID_NEW_RECORD |
| J1 | WorkspaceAsync | mongodb / `workspaceasync` | — | — | E_INVALID_NEW_RECORD |
| R | WorkspaceType | mongodb / `workspacetype` | externallyProvisioned | — | E_INVALID_NEW_RECORD |
| S | Record | redboxStorage / `record` | revision, recordVersion | beforeUpdate, beforeCreate | no required field |
| S | DeletedRecord | redboxStorage / `deletedrecord` | revision, lifecycleState | beforeUpdate, beforeCreate | no required field |
| S | RecordAudit | redboxStorage / `recordaudit` | — | — | no required field |
| S | IntegrationAudit | redboxStorage / `integrationaudit` | — | — | no required field |
| S | RecordSchemaArtifact | redboxStorage / `recordschemaartifact` | — | — | E_INVALID_NEW_RECORD |
| S | RecordSchemaReference | redboxStorage / `recordschemareference` | — | — | E_INVALID_NEW_RECORD |

## Separate native/service phase

Native record create and permanent recordidentity rows are under `nativeStorage`.
recordidentity has ObjectId `_id`, string redboxOid/incarnationId/createdAt;
native active records use dateCreated/lastSaveDate strings rather than automatic
Waterline timestamps. Schema service writes use BSON Date createdAt/updatedAt
and pin expiresAt. These are actual source-service writes, before index setup.

`nativeOwners` records a later, explicit disposable service-init phase:
storage performInit/default configured indexes, dashboard unique branding,
SIEM event/attempt indexes, Figshare unique/partial/dispatch indexes and native
initial state, and secret lock claim/release string ID/BSON Date (no AWS call).
Its complete listIndexes results are separated by database/collection from the
initial safe-mode model indexes. No DDL ran on another database.

This is not fault/concurrency/production-index qualification. Agenda/session/
GridFS DDL and model-only J2 index intent remain future owner-specific probes.
