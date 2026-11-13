import { expect } from 'chai';
import { GenerationRunArtifactWLDef } from '../../src/waterline-models/GenerationRunArtifact';
import { Services as PersistenceServices } from '../../src/services/GenerationPersistenceService';

const definition = GenerationRunArtifactWLDef as any;

describe('Generation artifact retention dates', () => {
  it('derives a native TTL date from the operational ISO expiry', done => {
    const record: Record<string, any> = { expiresAt: '2099-01-01T00:00:00.123Z' };
    definition.beforeCreate(record, (error?: Error) => {
      expect(error).to.equal(undefined);
      expect(record.expiresAtDate).to.be.instanceOf(Date);
      expect(record.expiresAtDate.toISOString()).to.equal(record.expiresAt);
      done(error);
    });
  });

  it('resynchronizes the TTL date when diagnostic retention replaces operational expiry', done => {
    const record: Record<string, any> = { expiresAt: '2099-02-01T00:00:00.456Z', expiresAtDate: new Date(0) };
    definition.beforeUpdate(record, (error?: Error) => {
      expect(error).to.equal(undefined);
      expect(record.expiresAtDate.toISOString()).to.equal(record.expiresAt);
      done(error);
    });
  });

  it('preserves the existing TTL date during payload-only updates', done => {
    const record: Record<string, any> = { ciphertext: 'encrypted' };
    definition.beforeUpdate(record, (error?: Error) => {
      expect(error).to.equal(undefined);
      expect(record).not.to.have.property('expiresAtDate');
      done(error);
    });
  });
});

const mongoDescribe = process.env.REDBOX_GENERATION_MONGO_URL ? describe : describe.skip;
mongoDescribe('Generation artifact retention with native Mongo', function () {
  this.timeout(90000);
  const suffix = `${process.pid}_${Date.now()}`;
  const tableName = `generation_artifact_retention_${suffix}`;
  const runTable = `generation_retention_runs_${suffix}`;
  const provenanceTable = `generation_retention_provenance_${suffix}`;
  let orm: any;
  let model: any;
  let manager: any;
  let collection: any;
  let originals: Map<string, unknown>;

  before(async () => {
    const Waterline = require('waterline');
    const adapter = require('sails-mongo');
    orm = new Waterline();
    const attributes = structuredClone(definition.attributes);
    // Sails moves physical column hints into autoMigrations before Waterline initialization.
    for (const attribute of Object.values(attributes) as any[]) {
      if (attribute.columnType) {
        attribute.autoMigrations = { columnType: attribute.columnType };
        delete attribute.columnType;
      }
    }
    orm.registerModel(
      Waterline.Collection.extend({
        ...definition,
        tableName,
        datastore: 'generationRetentionTest',
        attributes: { ...attributes, id: { type: 'string', columnName: '_id' } },
      })
    );
    const ontology: any = await new Promise((resolve, reject) =>
      orm.initialize(
        {
          adapters: { mongo: adapter },
          datastores: { generationRetentionTest: { adapter: 'mongo', url: process.env.REDBOX_GENERATION_MONGO_URL } },
        },
        (error: Error | undefined, result: any) => (error ? reject(error) : resolve(result))
      )
    );
    model = ontology.collections.generationrunartifact;
    manager = adapter.datastores.generationRetentionTest.manager;
    collection = manager.collection(tableName);
    originals = new Map(
      ['GenerationRunArtifact', 'GenerationRun', 'GenerationFieldProvenance'].map(name => [
        name,
        Reflect.get(globalThis, name),
      ])
    );
    for (const [name, table] of [
      ['GenerationRunArtifact', tableName],
      ['GenerationRun', runTable],
      ['GenerationFieldProvenance', provenanceTable],
    ]) {
      Reflect.set(globalThis, name, { tableName: table, getDatastore: () => ({ manager }) });
    }
  });

  after(async () => {
    if (originals)
      for (const [name, value] of originals) {
        if (value === undefined) Reflect.deleteProperty(globalThis, name);
        else Reflect.set(globalThis, name, value);
      }
    if (manager)
      for (const table of [tableName, runTable, provenanceTable]) {
        await manager
          .collection(table)
          .drop()
          .catch((error: { code?: number }) => {
            if (error.code !== 26) throw error;
          });
      }
    if (orm)
      await new Promise<void>((resolve, reject) =>
        orm.teardown((error?: Error) => (error ? reject(error) : resolve()))
      );
  });

  beforeEach(async () => {
    await collection.deleteMany({});
  });

  function artifact(runId: string, expiresAt: string) {
    return {
      brandId: 'retention-test',
      runId,
      expiresAt,
      encryptionKeyId: 'test',
      iv: 'iv',
      authTag: 'tag',
      ciphertext: 'encrypted',
      contentKinds: ['candidate'],
    };
  }

  it('stores BSON dates through the actual adapter and synchronizes update expiry', async () => {
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    await model.create(artifact('native-date', expiresAt)).fetch();
    const raw = await collection.findOne({ runId: 'native-date' });
    expect(raw.expiresAt).to.equal(expiresAt);
    expect(raw.expiresAtDate).to.be.instanceOf(Date);
    expect(raw.expiresAtDate.toISOString()).to.equal(expiresAt);
    const diagnosticExpiry = new Date(Date.now() + 86400000).toISOString();
    await model.updateOne({ runId: 'native-date' }).set({ expiresAt: diagnosticExpiry });
    const updated = await collection.findOne({ runId: 'native-date' });
    expect(updated.expiresAtDate.toISOString()).to.equal(diagnosticExpiry);
  });

  it('migrates legacy string dates idempotently and Mongo TTL removes expired encrypted payloads', async () => {
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'generation_artifact_expiry_ttl' });
    const diagnosticExpiry = new Date(Date.now() + 86400000).toISOString();
    await collection.insertMany([
      artifact('legacy-future', diagnosticExpiry),
      artifact('legacy-expired', new Date(Date.now() - 60000).toISOString()),
      artifact('legacy-invalid', 'invalid'),
      { ...artifact('legacy-missing', diagnosticExpiry), expiresAt: undefined },
    ]);
    const service = new PersistenceServices.GenerationPersistenceService();
    await Promise.all([service.ensureIndexes(), service.ensureIndexes()]);
    await service.ensureIndexes();
    const retained = await collection.findOne({ runId: 'legacy-future' });
    expect(retained.expiresAtDate).to.be.instanceOf(Date);
    expect(retained.expiresAtDate.toISOString()).to.equal(diagnosticExpiry);
    expect(await collection.countDocuments({ runId: { $in: ['legacy-invalid', 'legacy-missing'] } })).to.equal(0);
    const indexes = await collection.listIndexes().toArray();
    expect(indexes.find((index: any) => index.name === 'generation_artifact_expiry_date_ttl')).to.include({
      expireAfterSeconds: 0,
    });
    expect(indexes.find((index: any) => index.name === 'generation_artifact_expiry_date_ttl').key).to.deep.equal({
      expiresAtDate: 1,
    });
    // The default Mongo TTL monitor interval is sixty seconds.
    expect(indexes.some((index: any) => index.name === 'generation_artifact_expiry_ttl')).to.equal(false);
    const deadline = Date.now() + 70000;
    while (await collection.findOne({ runId: 'legacy-expired' })) {
      if (Date.now() > deadline) throw new Error('Mongo TTL did not remove the expired artifact');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(await collection.countDocuments({ runId: 'legacy-future' })).to.equal(1);
  });
});
