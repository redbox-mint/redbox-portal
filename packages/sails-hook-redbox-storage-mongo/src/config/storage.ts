export const storage = {
  serviceName: 'mongostorageservice',
  mongodb: {
    indices: [
      { key: { harvestId: 1 } },
      { key: { harvestId: 1, 'metaMetadata.brandId': 1, 'metaMetadata.type': 1 } },
      { key: { dateCreated: 1 } },
      { key: { dateCreated: -1 } },
      { key: { lastSaveDate: 1 } },
      { key: { lastSaveDate: -1 } },
      { key: { 'metaMetadata.brandId': 1 } },
      { key: { 'metaMetadata.type': 1 } },
      { key: { 'metaMetadata.createdOn': 1 } },
      { key: { 'metaMetadata.createdOn': -1 } },
      { key: { 'metaMetadata.lastSaveDate': 1 } },
      { key: { 'metaMetadata.lastSaveDate': -1 } },
      // Active create/restore classification relies on duplicate-key facts;
      // keep the native Mongo index explicit as well as the Waterline model
      // constraint. One single-field index serves both scan directions.
      { key: { redboxOid: 1 }, unique: true },
    ],
    // Every tombstone lookup starts from the OID, so it leads the compound
    // keys; the brand is a filter on the single document the OID selects. The
    // lifecycle key supports scanning for interrupted staged operations.
    deletedRecordIndices: [
      { key: { redboxOid: 1 }, unique: true },
      { key: { lifecycleState: 1, 'lifecycleOperation.requestId': 1 } },
      { key: { 'deletedRecordMetadata.metaMetadata.brandId': 1, redboxOid: 1 } },
      { key: { brandId: 1, redboxOid: 1 } },
    ],
    // A committed incarnation is intentionally never purged. The only safe
    // exception is an unused create reservation released after a certified
    // non-write and authoritative empty-state checks.
    recordIdentityIndices: [{ key: { redboxOid: 1 }, unique: true }],
  },
};
