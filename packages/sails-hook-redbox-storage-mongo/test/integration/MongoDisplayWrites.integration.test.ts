import { MongoClient } from 'mongodb';
import { of, firstValueFrom } from 'rxjs';
import * as lodash from 'lodash';
import { rejects } from 'node:assert/strict';
const { expect } = require('chai');
const { Services } = require('../../src/services/MongoStorageService');

const mongoUrl = process.env.MONGO_CONCURRENCY_TEST_URL;
(mongoUrl ? describe : describe.skip)('Mongo transient display batch persistence integration', function () {
  this.timeout(30_000);
  let client: MongoClient;
  let databaseName: string;
  let records: any;
  let identities: any;
  let service: any;
  const globals = ['sails', '_', 'RecordTypesService', 'FormsService', 'WorkflowStepsService'];
  const previous = new Map<string, any>();
  const recordType = {
    name: 'plan',
    relatedTo: [
      {
        id: 'activity',
        recordType: 'activity',
        localField: 'metadata.activity',
        foreignField: 'redboxOid',
        resolution: { metadataFields: ['/title'] },
      },
    ],
  };
  before(async function () {
    for (const key of globals) previous.set(key, (global as any)[key]);
    const logger = { verbose() {}, debug() {}, info() {}, warn() {}, error() {}, trace() {} };
    Object.assign(global, {
      _: lodash,
      sails: { config: { log: { createNamespaceLogger: () => logger, customLogger: logger } }, log: logger },
      RecordTypesService: { get: (_brand: any, type: string) => of(type === 'plan' ? recordType : { name: type }) },
      FormsService: {
        getFormByName: () =>
          of({
            configuration: {
              componentDefinitions: [
                {
                  name: 'display',
                  component: { class: 'SimpleInputComponent' },
                  relatedDisplay: { relationId: 'activity' },
                },
              ],
            },
          }),
      },
      WorkflowStepsService: { getAllForRecordType: () => of([{ name: 'draft', config: { form: 'plan-form' } }]) },
    });
    client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 5_000 });
    await client.connect();
    databaseName = `redbox_display_writes_${process.pid}_${Date.now()}`;
    const db = client.db(databaseName);
    records = db.collection('record');
    identities = db.collection('recordidentity');
    const tombstones = db.collection('deletedrecord');
    await records.createIndex({ redboxOid: 1 }, { unique: true });
    await identities.createIndex({ redboxOid: 1 }, { unique: true });
    await tombstones.createIndex({ redboxOid: 1 }, { unique: true });
    service = new Services.MongoStorageService();
    service.getNativeRecordCollection = () => records;
    service.getNativeRecordIdentityCollection = () => identities;
    service.getNativeTombstoneCollection = () => tombstones;
  });
  after(async function () {
    try {
      if (client && databaseName) await client.db(databaseName).dropDatabase();
    } finally {
      if (client) await client.close();
      for (const key of globals) {
        if (previous.get(key) === undefined) delete (global as any)[key];
        else (global as any)[key] = previous.get(key);
      }
    }
  });
  beforeEach(async function () {
    await records.deleteMany({});
    await identities.deleteMany({});
  });
  const row = (oid: string, activity: any) => ({
    redboxOid: oid,
    metaMetadata: { brandId: 'test-brand' },
    metadata: { activity, display: 'local input' },
    relatedMetadata: { ignored: true },
  });
  it('rejects an active second row without inserting or claiming the first row', async function () {
    await rejects(
      () => service.createBatch('plan', [row('first', null), row('second', 'source')], ''),
      /related-display-batch-not-supported/
    );
    expect(await records.countDocuments({})).to.equal(0);
    expect(await identities.countDocuments({})).to.equal(0);
  });
  it('rejects a later non-workflow declared form before any native insert or identity claim', async function () {
    const forms = (global as any).FormsService;
    const original = forms.getFormByName;
    const declared = await firstValueFrom(original());
    forms.getFormByName = (name: string) =>
      of(name === 'declared-extra-form' ? declared : { configuration: { componentDefinitions: [] } });
    try {
      const first = row('first', null),
        second = row('second', 'source');
      Object.assign(first.metaMetadata, { form: 'ordinary-form' });
      Object.assign(second.metaMetadata, { form: 'declared-extra-form' });
      await rejects(() => service.createBatch('plan', [first, second], ''), /related-display-batch-not-supported/);
      expect(await records.countDocuments({})).to.equal(0);
      expect(await identities.countDocuments({})).to.equal(0);
    } finally {
      forms.getFormByName = original;
    }
  });
  it('rejects an invalid second reference without any partial write', async function () {
    await rejects(
      () => service.createBatch('plan', [row('first', null), row('second', { bad: 'source' })], ''),
      /related-reference-invalid/
    );
    expect(await records.countDocuments({})).to.equal(0);
    expect(await identities.countDocuments({})).to.equal(0);
  });
  it('persists unlinked local input and strips runtime data through real native inserts', async function () {
    const result = await service.createBatch('plan', [row('first', null), row('second', '')], 'redboxOid');
    expect(result.applicationState).to.equal('applied');
    expect(await records.countDocuments({})).to.equal(2);
    for (const record of await records.find({}).toArray()) {
      expect(record.metadata.display).to.equal('local input');
      expect(record).not.to.have.property('relatedMetadata');
    }
  });
  it('preserves unconfigured batch behavior with selected reference-like data', async function () {
    const result = await service.createBatch('legacy', [row('first', 'source')], 'redboxOid');
    expect(result.applicationState).to.equal('applied');
    expect((await records.findOne({ redboxOid: 'first' })).metadata.display).to.equal('local input');
  });
});
