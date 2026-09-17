import { expect } from 'chai';
import { randomUUID } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
import { Services } from '../../src/services/MongoStorageService';

const mongoUrl = process.env.MONGO_TEST_URL;
const describeMongo = mongoUrl ? describe : describe.skip;

describeMongo('Record pagination with MongoDB', function () {
  this.timeout(30_000);

  const recordCount = 3068;
  const pageSize = 20;
  const brand = { id: 'pagination-test', name: 'Pagination test', css: '', roles: [] };
  const username = 'pagination-user';
  const databaseName = `redbox_pagination_test_${randomUUID().replace(/-/g, '')}`;
  let client: MongoClient;
  let service: Services.MongoStorageService;
  let originalRecord: unknown;
  let originalExportPageSize: number;

  // Large groups of equal timestamps cross page boundaries. OIDs deliberately
  // run opposite to _id order so the tie-breaker is observable.
  const fixtures = Array.from({ length: recordCount }, (_, index) => ({
    _id: new ObjectId(index.toString(16).padStart(24, '0')),
    redboxOid: `record-${String(recordCount - index).padStart(4, '0')}`,
    lastSaveDate: index < recordCount / 2 ? '2026-09-02T00:00:00Z' : '2026-09-01T00:00:00Z',
    metaMetadata: { brandId: brand.id, type: 'rdmp', packageType: 'rdmp' },
    authorization: { view: [username] },
  }));
  const expectedOids = fixtures.map(record => record.redboxOid);

  before(async function () {
    originalRecord = Reflect.get(global, 'Record');
    Reflect.set(global, 'Record', { tableName: 'record' });
    originalExportPageSize = sails.config.record.export.maxRecords;
    sails.config.record.export.maxRecords = pageSize;
    client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const database = client.db(databaseName);
    service = new Services.MongoStorageService();
    service.recordCol = database.collection('record');
    service.deletedRecordCol = database.collection('deletedrecord');
    await service.recordCol.insertMany(fixtures);
    await service.deletedRecordCol.insertMany(fixtures.map(record => ({
      _id: record._id,
      redboxOid: record.redboxOid,
      lastSaveDate: record.lastSaveDate,
      deletedRecordMetadata: record,
    })));
  });

  after(async function () {
    if (originalRecord === undefined) Reflect.deleteProperty(global, 'Record');
    else Reflect.set(global, 'Record', originalRecord);
    sails.config.record.export.maxRecords = originalExportPageSize;
    if (client) {
      // Drop only the uniquely named database created by this test run.
      await client.db(databaseName).dropDatabase();
      await client.close();
    }
  });

  for (const method of ['getRecords', 'getDeletedRecords'] as const) {
    for (const sort of [undefined, 'lastSaveDate:1']) {
      it(`${method} returns every record once with ${sort ?? 'default sorting'}`, async function () {
        const oids: unknown[] = [];
        // Read the partial final page and the empty page after it.
        for (let start = 0; start < recordCount + pageSize; start += pageSize) {
          const result = await service[method](
            undefined, undefined, start, pageSize, username, [], brand,
            undefined, undefined, sort
          );
          expect(result.totalItems).to.equal(recordCount);
          oids.push(...result.items.map(record => record.redboxOid));
          if (start >= recordCount) expect(result.items).to.have.length(0);
        }
        expect(oids).to.have.length(recordCount);
        expect(new Set(oids).size).to.equal(recordCount);
        const expectedOrder = sort
          ? [...expectedOids.slice(recordCount / 2), ...expectedOids.slice(0, recordCount / 2)]
          : expectedOids;
        expect(oids).to.deep.equal(expectedOrder);
      });
    }
  }

  for (const format of ['csv', 'json']) {
    it(`exports every record once as ${format} when timestamps tie`, async function () {
      let output = '';
      for await (const chunk of service.exportAllPlans(username, [], brand, format, null, null, 'rdmp')) {
        output += String(chunk);
      }
      let oids: string[];
      if (format === 'json') {
        const result: { records: { redboxOid: string }[] } = JSON.parse(output);
        oids = result.records.map(record => record.redboxOid);
      } else {
        // Fixture OIDs and column names contain no commas or line breaks.
        const [header, ...rows] = output.trim().split(/\r?\n/);
        const oidColumn = header.split(',').indexOf('"redboxOid"');
        expect(oidColumn).to.be.greaterThan(-1);
        oids = rows.map(row => JSON.parse(row.split(',')[oidColumn]));
      }
      expect(oids).to.have.length(recordCount);
      expect(new Set(oids).size).to.equal(recordCount);
      expect(oids).to.deep.equal(expectedOids);
    });
  }
});
