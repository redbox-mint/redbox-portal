'use strict';
// No Sails lift, bootstrap, schema synchronization, index creation or writes.
// Supply a Mongo read-only credential through the environment, never argv.
const { MongoClient, ObjectId } = require('mongodb');
const {
  RecordDefinitionMigrationService,
  historyRow,
} = require('../../packages/redbox-core/dist/services/RecordDefinitionMigrationService.js');
const {
  LegacyDatabaseMigrationError,
  assertLegacyMigrationData,
} = require('../../packages/redbox-core/dist/record-workflow-administration/legacyDatabaseMigration.js');
const ActionRegistry = require('../../packages/redbox-core/dist/action-registry/index.js');

function safeTimestamp(value) {
  // Accept valid BSON/native Dates after a BSON round-trip with safe
  // normalization; reject malformed (Invalid Date, forged prototype or extra
  // own properties) with bounded secret-free diagnostics. Non-Date values
  // are left for service-side contract validation.
  if (value instanceof Date) {
    if (
      Object.getPrototypeOf(value) !== Date.prototype ||
      Reflect.ownKeys(value).length !== 0 ||
      !Number.isFinite(Date.prototype.getTime.call(value))
    ) {
      throw new LegacyDatabaseMigrationError('$', 'invalid-artifact-timestamp');
    }
    try {
      return Date.prototype.toISOString.call(value);
    } catch {
      throw new LegacyDatabaseMigrationError('$', 'invalid-artifact-timestamp');
    }
  }
  return value;
}

function plain(row) {
  if (!row) return null;
  const result = { ...row, id: row._id instanceof ObjectId ? row._id.toHexString() : row._id };
  delete result._id;
  // Shared bounded enumeration normalizes every timestamp before the
  // non-JSON/unbounded guard so valid native Dates pass while malformed,
  // non-JSON and unbounded values still fail closed without secret leakage.
  for (const key of ['createdAt', 'updatedAt', 'retiredAt', 'publishedAt', 'occurredAt']) {
    if (result[key] !== undefined && result[key] !== null) result[key] = safeTimestamp(result[key]);
  }
  for (const key of ['branding', 'recordType', 'form']) {
    if (result[key] instanceof ObjectId) result[key] = result[key].toHexString();
  }
  return result;
}
function relation(id) {
  return ObjectId.isValid(id) ? { $in: [id, new ObjectId(id)] } : id;
}
function plainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}
const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
function failAuthority() {
  throw new LegacyDatabaseMigrationError('$.authority', 'invalid-authority');
}

(async () => {
  if (!process.env.RECORD_DEFINITION_PREFLIGHT_MONGO_URL) throw Error('missing-connection');
  const client = new MongoClient(process.env.RECORD_DEFINITION_PREFLIGHT_MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db();
    const registry = ActionRegistry.buildActionRegistry([
      ActionRegistry.actionRegistrationSource(
        '@researchdatabox/redbox-core',
        'actions/index',
        ActionRegistry.registerRedboxActions
      ),
    ]);
    async function rows(collection, filter, limit) {
      const cursor = db
        .collection(collection)
        .find(filter)
        .sort({ _id: 1 })
        .limit(limit + 1)
        .maxTimeMS(10000)
        .batchSize(1);
      const values = [];
      let bytes = 0;
      try {
        for await (const entry of cursor) {
          const value = plain(entry);
          assertLegacyMigrationData(value);
          bytes += Buffer.byteLength(JSON.stringify(value), 'utf8');
          if (values.length >= limit || bytes > 8_000_000) throw Error('catalog-bound-exceeded');
          values.push(value);
        }
      } finally {
        await cursor.close();
      }
      return values;
    }
    const reader = {
      recordTypes: () => rows('recordtype', {}, 256),
      workflowSteps: id => rows('workflowstep', { recordType: relation(id) }, 64),
      revisionAt: async (recordType, revisionNumber) =>
        plain(
          await db.collection('recorddefinitionrevision').findOne({ recordType: relation(recordType), revisionNumber })
        ),
      activeRevision: async id => plain(await db.collection('recorddefinitionrevision').findOne({ _id: id })),
      history: async criteria => {
        const filter = { ...criteria };
        if (filter.id) {
          filter._id = filter.id;
          delete filter.id;
        }
        if (filter.recordType) filter.recordType = relation(filter.recordType);
        return plain(await db.collection('recorddefinitionhistory').findOne(filter));
      },
      latestRetirement: async recordType => {
        const cursor = db
          .collection('recorddefinitionhistory')
          .find({ recordType: relation(recordType), operation: { $in: ['retire', 'unretire'] } })
          .sort({ resultingIdentityVersion: -1 })
          .limit(1);
        try {
          return plain(await cursor.next());
        } finally {
          await cursor.close();
        }
      },
      draft: async id => plain(await db.collection('recorddefinitiondraft').findOne({ _id: id })),
      histories: async recordType => {
        const cursor = db
          .collection('recorddefinitionhistory')
          .find({ recordType: relation(recordType) })
          .sort({ _id: 1 })
          .limit(513)
          .maxTimeMS(10000)
          .batchSize(1);
        const values = [];
        let bytes = 0;
        try {
          for await (const entry of cursor) {
            if (values.length >= 512) throw new LegacyDatabaseMigrationError('$', 'database-row-limit');
            const value = historyRow(plain(entry), `$.histories[${values.length}]`);
            bytes += Buffer.byteLength(JSON.stringify(value), 'utf8');
            if (bytes > 8_000_000) throw new LegacyDatabaseMigrationError('$', 'database-byte-limit');
            values.push(value);
          }
        } finally {
          await cursor.close();
        }
        return values;
      },
    };
    const authority = {
      async load({ brandId }) {
        const filter = { branding: relation(brandId) };
        const roles = await rows('role', filter, 512);
        const forms = await rows('form', filter, 256);
        const types = await rows('recordtype', filter, 512);
        const roleNames = [];
        for (const row of roles) {
          // Mongo array matching admits branding arrays containing the brand
          // alongside another brand. Require scalar validated ownership on every
          // authority row before projection, matching in-process preflight.
          if (typeof row.branding !== 'string' || row.branding !== brandId) failAuthority();
          if (typeof row.name !== 'string' || !REFERENCE_PATTERN.test(row.name)) failAuthority();
          roleNames.push(row.name);
        }
        if (new Set(roleNames).size !== roleNames.length) failAuthority();
        const formCapabilities = [];
        const seenForms = new Set();
        for (const row of forms) {
          if (typeof row.branding !== 'string' || row.branding !== brandId) failAuthority();
          if (typeof row.name !== 'string' || !REFERENCE_PATTERN.test(row.name)) failAuthority();
          if (!plainObject(row.configuration)) failAuthority();
          for (const key of ['validationOperations', 'validationGroups']) {
            if (row.configuration[key] !== undefined && !plainObject(row.configuration[key])) failAuthority();
          }
          if (seenForms.has(row.name)) failAuthority();
          seenForms.add(row.name);
          formCapabilities.push({
            reference: row.name,
            validationOperations: row.configuration?.validationOperations ?? {},
            validationGroups: row.configuration?.validationGroups ?? {},
          });
        }
        const typeKeys = [];
        for (const row of types) {
          if (typeof row.branding !== 'string' || row.branding !== brandId) failAuthority();
          if (typeof row.name !== 'string' || !KEY_PATTERN.test(row.name)) failAuthority();
          typeKeys.push(row.name);
        }
        return {
          actionRegistry: registry,
          roles: roleNames,
          forms: formCapabilities,
          availableRecordTypeKeys: typeKeys,
          storageCapabilityProvider: null,
          stageReferences: [],
        };
      },
    };
    const report = await new RecordDefinitionMigrationService(reader, authority).preflight();
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await client.close();
  }
})().catch(error => {
  process.stderr.write(
    error instanceof LegacyDatabaseMigrationError
      ? `${error.message}\n`
      : 'Record-definition preflight failed; verify connection, bounds and authority prerequisites.\n'
  );
  process.exitCode = 1;
});
