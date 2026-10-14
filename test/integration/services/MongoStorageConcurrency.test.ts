const { Services } = require('../../../packages/sails-hook-redbox-storage-mongo/src/services/MongoStorageService');

describe('Mongo storage concurrency across service instances', function () {
  this.timeout(60_000);

  const createdOids: string[] = [];
  let recordCollection: any;
  let tombstoneCollection: any;
  let firstService: any;
  let secondService: any;

  before(function () {
    const db = Record.getDatastore().manager;
    recordCollection = db.collection(Record.tableName);
    tombstoneCollection = db.collection(DeletedRecord.tableName);
    firstService = new Services.MongoStorageService();
    secondService = new Services.MongoStorageService();
    firstService.recordCol = recordCollection;
    firstService.deletedRecordCol = tombstoneCollection;
    secondService.recordCol = recordCollection;
    secondService.deletedRecordCol = tombstoneCollection;
  });

  afterEach(async function () {
    const oids = createdOids.splice(0, createdOids.length);
    if (oids.length === 0) return;
    await recordCollection.deleteMany({ redboxOid: { $in: oids } });
    await tombstoneCollection.deleteMany({ redboxOid: { $in: oids } });
  });

  function record(oid: string, revision = 0) {
    return {
      redboxOid: oid,
      revision,
      metaMetadata: { brandId: 'default', type: 'rdmp' },
      metadata: { title: 'baseline' },
      workflow: { stage: 'draft' },
      authorization: {},
    };
  }

  it('allows exactly one CAS winner from one shared Mongo revision', async function () {
    const oid = `mongo-cas-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    createdOids.push(oid);
    await recordCollection.insertOne(record(oid));
    const brand = { id: 'default' };
    const options = { precondition: { expectedRevision: 0, requireRevision: true } };

    const results = await Promise.all([
      firstService.updateMeta(
        brand,
        oid,
        { metaMetadata: { brandId: 'default', type: 'rdmp' }, metadata: { title: 'first' } },
        undefined,
        options
      ),
      secondService.updateMeta(
        brand,
        oid,
        { metaMetadata: { brandId: 'default', type: 'rdmp' }, metadata: { title: 'second' } },
        undefined,
        options
      ),
    ]);

    expect(results.filter(result => result.applicationState === 'applied')).to.have.length(1);
    expect(results.filter(result => result.nonApplicationReason === 'stale-revision')).to.have.length(1);
    const stored = await recordCollection.findOne({ redboxOid: oid });
    expect(stored.revision).to.equal(1);
    expect(['first', 'second']).to.include(stored.metadata.title);
  });

  it('allows only one update/removal winner from the same Mongo revision', async function () {
    const oid = `mongo-remove-race-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    createdOids.push(oid);
    await recordCollection.insertOne(record(oid));
    const brand = { id: 'default' };
    const options = { precondition: { expectedRevision: 0, requireRevision: true } };

    const results = await Promise.all([
      firstService.removeActiveRecord(brand, oid, options),
      secondService.updateMeta(
        brand,
        oid,
        { metaMetadata: { brandId: 'default', type: 'rdmp' }, metadata: { title: 'racing update' } },
        undefined,
        options
      ),
    ]);

    expect(results.filter(result => result.applicationState === 'applied')).to.have.length(1);
    expect(results.filter(result => result.applicationState === 'not-applied')).to.have.length(1);
    const stored = await recordCollection.findOne({ redboxOid: oid });
    if (stored) expect(stored.revision).to.equal(1);
  });
});
