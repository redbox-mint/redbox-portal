// Explicit fresh-stack DDL for qualified persistence groups (C, M, R, Q, J2, J3, J4, V and full S).
// MongoDB runs this only on an empty /data/db. Existing volumes use:
// npm run persistence:indexes -- --inspect  (then explicitly --ensure).
// No document cleanup, index removal, model discovery or startup synchronization.
const application = db.getSiblingDB('redbox-portal');
for (const [collection, name] of [
  ['cacheentry', 'cacheentry_name_unique'],
  ['migration', 'migration_name_unique'],
]) {
  application
    .getCollection(collection)
    .createIndex({ name: 1 }, { unique: true, name, collation: { locale: 'simple' } });
}
for (const collection of ['recordtype', 'dashboardtype', 'report', 'namedquery']) {
  application
    .getCollection(collection)
    .createIndex({ key: 1 }, { unique: true, name: `${collection}_key_unique`, collation: { locale: 'simple' } });
}

application
  .getCollection('dashboardconfiguration')
  .createIndex({ branding: 1 }, { unique: true, name: 'branding_1', collation: { locale: 'simple' } });
for (const collection of ['i18nbundle', 'i18ntranslation']) {
  application
    .getCollection(collection)
    .createIndex({ uid: 1 }, { unique: true, name: `${collection}_uid_unique`, collation: { locale: 'simple' } });
}

// J2 lineage/query indexes, including dimensions and hash/attempt uniqueness.
application
  .getCollection('harvestrun')
  .createIndex(
    { brandId: 1, recordType: 1, sourceName: 1, sourceRunId: 1 },
    { name: 'brandId_1_recordType_1_sourceName_1_sourceRunId_1', unique: true, collation: { locale: 'simple' } }
  );
application
  .getCollection('harvestrun')
  .createIndex(
    { brandId: 1, startedAt: 1 },
    { name: 'brandId_1_startedAt_1', unique: false, collation: { locale: 'simple' } }
  );
application
  .getCollection('harvestrun')
  .createIndex({ status: 1 }, { name: 'status_1', unique: false, collation: { locale: 'simple' } });
application
  .getCollection('harvestrun')
  .createIndex({ recordType: 1 }, { name: 'recordType_1', unique: false, collation: { locale: 'simple' } });
application
  .getCollection('harvestrunchunk')
  .createIndex(
    { runId: 1, contentHash: 1, attempt: 1 },
    { name: 'runId_1_contentHash_1_attempt_1', unique: true, collation: { locale: 'simple' } }
  );
application
  .getCollection('harvestrunchunk')
  .createIndex(
    { runId: 1, contentHash: 1, status: 1 },
    { name: 'runId_1_contentHash_1_status_1', unique: false, collation: { locale: 'simple' } }
  );
application
  .getCollection('harvestrunchunk')
  .createIndex(
    { runId: 1, chunkIndex: 1 },
    { name: 'runId_1_chunkIndex_1', unique: false, collation: { locale: 'simple' } }
  );
application
  .getCollection('harvestrunchunk')
  .createIndex(
    { runId: 1, submittedAt: 1 },
    { name: 'runId_1_submittedAt_1', unique: false, collation: { locale: 'simple' } }
  );
application
  .getCollection('harvestrecordevent')
  .createIndex(
    { runId: 1, brandId: 1, createdAt: -1 },
    { name: 'runId_1_brandId_1_createdAt_-1', unique: false, collation: { locale: 'simple' } }
  );
application
  .getCollection('harvestrecordevent')
  .createIndex(
    { runId: 1, brandId: 1, outcome: 1, createdAt: -1 },
    { name: 'runId_1_brandId_1_outcome_1_createdAt_-1', unique: false, collation: { locale: 'simple' } }
  );
application
  .getCollection('harvestrecordevent')
  .createIndex(
    { runId: 1, brandId: 1, operation: 1, createdAt: -1 },
    { name: 'runId_1_brandId_1_operation_1_createdAt_-1', unique: false, collation: { locale: 'simple' } }
  );
application
  .getCollection('harvestrecordevent')
  .createIndex(
    { runId: 1, brandId: 1, chunkId: 1, createdAt: 1 },
    { name: 'runId_1_brandId_1_chunkId_1_createdAt_1', unique: false, collation: { locale: 'simple' } }
  );
application
  .getCollection('harvestrecordevent')
  .createIndex(
    { harvestId: 1, recordType: 1, brandId: 1 },
    { name: 'harvestId_1_recordType_1_brandId_1', unique: false, collation: { locale: 'simple' } }
  );
application
  .getCollection('harvestrecordevent')
  .createIndex({ oid: 1 }, { name: 'oid_1', unique: false, collation: { locale: 'simple' } });

// J3 capture uniqueness, polling/recovery/retention and history. No TTL deletion.
application.getCollection("securityevent").createIndex({"eventId": 1},{"name": "eventId_1", "unique": true, "collation": {"locale": "simple"}});
application.getCollection("securityevent").createIndex({"brandId": 1, "deliveryState": 1, "nextEligibleAt": 1, "occurredAt": 1},{"name": "brandId_1_deliveryState_1_nextEligibleAt_1_occurredAt_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("securityevent").createIndex({"brandId": 1, "occurredAt": -1},{"name": "brandId_1_occurredAt_-1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("securityevent").createIndex({"brandId": 1, "deliveryState": 1, "leaseExpiresAt": 1},{"name": "brandId_1_deliveryState_1_leaseExpiresAt_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("securityevent").createIndex({"brandId": 1, "deliveryState": 1, "terminalAt": 1},{"name": "brandId_1_deliveryState_1_terminalAt_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("securityevent").createIndex({"brandId": 1, "deliveryState": 1, "updatedAt": 1},{"name": "brandId_1_deliveryState_1_updatedAt_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("siemdeliveryattempt").createIndex({"eventId": 1, "destinationId": 1},{"name": "eventId_1_destinationId_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("siemdeliveryattempt").createIndex({"brandId": 1, "startedAt": -1},{"name": "brandId_1_startedAt_-1", "unique": false, "collation": {"locale": "simple"}});

// J4 full OID, partial binding and millisecond dispatch.
application.getCollection("figsharesync").createIndex({"oid": 1},{"name": "oid_1", "unique": true, "collation": {"locale": "simple"}});
application.getCollection("figsharesync").createIndex({"namespace": 1, "articleId": 1},{"name": "namespace_1_articleId_1", "unique": true, "collation": {"locale": "simple"}, "partialFilterExpression": {"articleId": {"$type": "string"}, "namespace": {"$type": "string"}}});
application.getCollection("figsharesync").createIndex({"nextActionAt": 1, "dispatchUntil": 1},{"name": "nextActionAt_1_dispatchUntil_1", "unique": false, "collation": {"locale": "simple"}});

// P10 staged S: declared attachment uniqueness and existing native schema/audit indexes.
application.getCollection("attachmentmetadata").createIndex({"storageKey": 1},{"name": "storageKey_1", "unique": true, "collation": {"locale": "simple"}});
application.getCollection("attachmentmetadata").createIndex({"oid": 1, "fileId": 1},{"name": "oid_1_fileId_1", "unique": true, "collation": {"locale": "simple"}});
application.getCollection("attachmentmetadata").createIndex({"oid": 1},{"name": "oid_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("attachmentaccessaudit").createIndex({"oid": 1, "accessedAt": -1},{"name": "oid_1_accessedAt_-1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("attachmentaccessaudit").createIndex({"storageKey": 1, "accessedAt": -1},{"name": "storageKey_1_accessedAt_-1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("attachmentaccessaudit").createIndex({"action": 1, "accessedAt": -1},{"name": "action_1_accessedAt_-1", "unique": false, "collation": {"locale": "simple"}});
const stagedStorage = db.getSiblingDB('redbox-storage');
stagedStorage.getCollection("recordschemaartifact").createIndex({"digest": 1},{"name": "digest_1", "unique": true, "collation": {"locale": "simple"}});
stagedStorage.getCollection("recordschemareference").createIndex({"referenceKey": 1},{"name": "referenceKey_1", "unique": true, "collation": {"locale": "simple"}});
stagedStorage.getCollection("recordschemareference").createIndex({"digest": 1, "kind": 1},{"name": "record_schema_reference_digest_kind", "collation": {"locale": "simple"}});
stagedStorage.getCollection("recordschemareference").createIndex({"digest": 1, "kind": 1, "brand": 1, "portal": 1, "referenceKey": 1},{"name": "record_schema_reference_grant_lookup", "collation": {"locale": "simple"}});
stagedStorage.getCollection("recordschemareference").createIndex({"digest": 1, "kind": 1, "brand": 1, "portal": 1, "schemaKind": 1, "recordType": 1, "operation": 1, "oid": 1},{"name": "record_schema_reference_authorization_lookup", "collation": {"locale": "simple"}});
stagedStorage.getCollection("recordschemareference").createIndex({"digest": 1, "kind": 1, "brand": 1, "portal": 1, "schemaKind": 1, "recordType": 1, "operation": 1, "referenceKey": 1},{"name": "record_schema_reference_authorization_cursor_lookup", "collation": {"locale": "simple"}});
stagedStorage.getCollection("recordschemareference").createIndex({"oid": 1, "kind": 1},{"name": "record_schema_reference_oid_kind", "sparse": true, "collation": {"locale": "simple"}});
stagedStorage.getCollection("recordschemareference").createIndex({"kind": 1, "expiresAt": 1},{"name": "record_schema_reference_pin_expiry", "partialFilterExpression": {"kind": "pin"}, "collation": {"locale": "simple"}});
stagedStorage.getCollection("recordaudit").createIndex({"redboxOid": 1, "createdAt": 1},{"name": "redboxOid_1_createdAt_1", "collation": {"locale": "simple"}});

// V: nonunique lookup indexes preserve safe-mode Waterline behaviour.
// Entity-declared uniqueness was never installed by the loaded baseline.
application.getCollection("vocabulary").createIndex({"branding": 1, "slug": 1},{"name": "branding_1_slug_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("vocabulary").createIndex({"rvaSourceKey": 1},{"name": "rvaSourceKey_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("vocabulary").createIndex({"figshareSourceKey": 1},{"name": "figshareSourceKey_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("vocabularyentry").createIndex({"vocabulary": 1, "labelLower": 1},{"name": "vocabulary_1_labelLower_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("vocabularyentry").createIndex({"vocabulary": 1, "valueLower": 1},{"name": "vocabulary_1_valueLower_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("vocabularyentry").createIndex({"vocabulary": 1, "identifier": 1},{"name": "vocabulary_1_identifier_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularysource").createIndex({"branding": 1, "scope": 1, "taxonomyId": 1},{"name": "branding_1_scope_1_taxonomyId_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularysource").createIndex({"vocabulary": 1},{"name": "vocabulary_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularysource").createIndex({"branding": 1, "lastSyncedAt": 1},{"name": "branding_1_lastSyncedAt_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularycategory").createIndex({"source": 1, "sourceId": 1},{"name": "source_1_sourceId_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularycategory").createIndex({"source": 1, "categoryId": 1},{"name": "source_1_categoryId_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularycategory").createIndex({"entry": 1},{"name": "entry_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularycategory").createIndex({"source": 1, "historical": 1, "selectable": 1},{"name": "source_1_historical_1_selectable_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularycrosswalk").createIndex({"branding": 1, "name": 1},{"name": "branding_1_name_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularycrosswalk").createIndex({"localVocabulary": 1, "figshareSource": 1, "status": 1},{"name": "localVocabulary_1_figshareSource_1_status_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularycrosswalkmapping").createIndex({"crosswalk": 1, "revision": 1, "localEntry": 1, "figshareCategory": 1},{"name": "crosswalk_1_revision_1_localEntry_1_figshareCategory_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularycrosswalkmapping").createIndex({"crosswalk": 1, "revision": 1, "status": 1, "localEntry": 1},{"name": "crosswalk_1_revision_1_status_1_localEntry_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularycrosswalkmapping").createIndex({"figshareCategory": 1},{"name": "figshareCategory_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularysyncrun").createIndex({"source": 1, "createdAt": -1},{"name": "source_1_createdAt_-1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularysyncrun").createIndex({"state": 1, "expiresAt": 1},{"name": "state_1_expiresAt_1", "unique": false, "collation": {"locale": "simple"}});
application.getCollection("figsharevocabularysyncrun").createIndex({"branding": 1, "createdAt": -1},{"name": "branding_1_createdAt_-1", "unique": false, "collation": {"locale": "simple"}});

// B keeps its two datastore owners and safe-mode duplicate semantics.
application.getCollection("brandingconfig").createIndex({name:1},{name:"name_1",unique:false,collation:{locale:"simple"}});
stagedStorage.getCollection("brandingconfighistory").createIndex({branding:1,version:1},{name:"branding_1_version_1",unique:false,collation:{locale:"simple"}});

// Full S (ADR 0004 phase 7): the former native startup indexes now use explicit preparation.
application.getCollection("counter").createIndex({name:1},{name:"name_1",unique:true,collation:{locale:"simple"}});
stagedStorage.getCollection("record").createIndex({"harvestId": 1},{"name": "harvestId_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("record").createIndex({"harvestId": 1, "metaMetadata.brandId": 1, "metaMetadata.type": 1},{"name": "harvestId_1_metaMetadata.brandId_1_metaMetadata.type_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("record").createIndex({"dateCreated": 1},{"name": "dateCreated_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("record").createIndex({"dateCreated": -1},{"name": "dateCreated_-1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("record").createIndex({"lastSaveDate": 1},{"name": "lastSaveDate_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("record").createIndex({"lastSaveDate": -1},{"name": "lastSaveDate_-1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("record").createIndex({"metaMetadata.brandId": 1},{"name": "metaMetadata.brandId_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("record").createIndex({"metaMetadata.type": 1},{"name": "metaMetadata.type_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("record").createIndex({"metaMetadata.createdOn": 1},{"name": "metaMetadata.createdOn_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("record").createIndex({"metaMetadata.createdOn": -1},{"name": "metaMetadata.createdOn_-1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("record").createIndex({"metaMetadata.lastSaveDate": 1},{"name": "metaMetadata.lastSaveDate_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("record").createIndex({"metaMetadata.lastSaveDate": -1},{"name": "metaMetadata.lastSaveDate_-1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("record").createIndex({"redboxOid": 1},{"unique": true, "name": "redboxOid_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("deletedrecord").createIndex({"redboxOid": 1},{"unique": true, "name": "redboxOid_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("deletedrecord").createIndex({"lifecycleState": 1, "lifecycleOperation.requestId": 1},{"name": "lifecycleState_1_lifecycleOperation.requestId_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("deletedrecord").createIndex({"deletedRecordMetadata.metaMetadata.brandId": 1, "redboxOid": 1},{"name": "deletedRecordMetadata.metaMetadata.brandId_1_redboxOid_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("deletedrecord").createIndex({"brandId": 1, "redboxOid": 1},{"name": "brandId_1_redboxOid_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("recordidentity").createIndex({"redboxOid": 1},{"unique": true, "name": "redboxOid_1", "collation": {"locale": "simple"}});
stagedStorage.getCollection("record").createIndex({"figshareSyncIntent.pending": 1, "figshareSyncIntent.readiness": 1, "figshareSyncIntent.requestedAt": 1},{"name": "figshareSyncIntent.pending_1_figshareSyncIntent.readiness_1_figshareSyncIntent.requestedAt_1", "collation": {"locale": "simple"}});
