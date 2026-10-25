import { randomUUID } from 'node:crypto';
import { expect } from 'chai';
import { Collection, MongoClient } from 'mongodb';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';
import type { NamedQueryConfig, Services } from '../../src/services/NamedQueryService';

// Opt in to native Mongo regression coverage; never use the application database.
describe('NamedQueryService native Mongo date comparisons', function () {
  let client: MongoClient;
  let collection: Collection;
  let service: Services.NamedQueryService;
  let QueryConfig: typeof NamedQueryConfig;
  const brand = { id: 'date-test-brand', name: 'date-test-brand', css: '', roles: [] };
  const cutoff = '2016-10-25T12:30:51.151+10:00';
  const equalIds = ['equal-local', 'equal-z', 'equal-utc-offset', 'equal-other-offset', 'equal-bson'];
  const fixtures = [
    { id: 'before', value: '2016-10-25T12:30:51.150+10:00' },
    { id: 'equal-local', value: cutoff },
    { id: 'equal-z', value: '2016-10-25T02:30:51.151Z' },
    { id: 'equal-utc-offset', value: '2016-10-25T02:30:51.151+00:00' },
    { id: 'equal-other-offset', value: '2016-10-25T13:30:51.151+11:00' },
    { id: 'equal-bson', value: new Date('2016-10-25T02:30:51.151Z') },
    { id: 'after', value: '2016-10-25T02:30:51.152Z' },
    { id: 'date-only', value: '2016-10-25' },
    { id: 'null', value: null },
    { id: 'missing' },
    { id: 'invalid', value: 'invalid-date' },
  ];

  before(async function () {
    const url = process.env.NAMED_QUERY_TEST_MONGO_URL;
    if (!url) this.skip();
    client = new MongoClient(url);
    await client.connect();
    collection = client.db('redbox_named_query_regression').collection(`dates_${randomUUID().replace(/-/g, '')}`);
    const records = fixtures.map(fixture => ({
      redboxOid: fixture.id,
      metadata: { title: fixture.id },
      metaMetadata: { brandId: 'date-test-brand', ...(fixture.id === 'missing' ? {} : { lastSaveDate: fixture.value }) },
      ...(fixture.id === 'missing' ? {} : { lastSaveDate: fixture.value }),
    }));
    await collection.insertMany([
      ...records,
      { redboxOid: 'other-brand', metadata: { title: 'other-brand' }, metaMetadata: { brandId: 'other-brand' }, lastSaveDate: cutoff },
    ]);
  });

  beforeEach(function () {
    const model = { native: (callback: (error: Error | null, native: Collection) => void) => callback(null, collection) };
    setupServiceTestGlobals(createMockSails({ models: { record: model } }));
    Reflect.set(global, 'Record', model);
    const module: typeof import('../../src/services/NamedQueryService') = require('../../src/services/NamedQueryService');
    service = new module.Services.NamedQueryService();
    QueryConfig = module.NamedQueryConfig;
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    Reflect.deleteProperty(global, 'Record');
  });

  after(async function () {
    if (collection) await collection.drop();
    if (client) await client.close();
  });

  const query = async (operator: string, path = 'lastSaveDate', type: 'date' | 'string' = 'date', value: string | undefined = cutoff) => {
    const result = await service.performNamedQuery(
      'metaMetadata.brandId', {}, 'record', { [path]: null },
      new QueryConfig({ queryParams: { bound: { path, type, queryType: operator, format: 'ISODate', whenUndefined: 'ignore' } } }).queryParams,
      value === undefined ? {} : { bound: value }, brand, 0, 100,
    );
    expect(result.summary.numFound).to.equal(result.records.length);
    return result.records.map(record => record.oid).sort();
  };

  it('includes equivalent ISO offsets and BSON dates at an inclusive lower bound, preserving the millisecond boundary and brand', async function () {
    expect(await query('>=')).to.deep.equal([...equalIds, 'after'].sort());
  });

  it('excludes missing, null and invalid dates from an upper bound', async function () {
    expect(await query('<=')).to.deep.equal([...equalIds, 'before', 'date-only'].sort());
  });

  it('preserves strict comparisons at the same instant', async function () {
    expect(await query('>')).to.deep.equal(['after']);
    expect(await query('<')).to.deep.equal(['before', 'date-only']);
  });

  it('converts nested date fields without changing stored values', async function () {
    expect(await query('>=', 'metaMetadata.lastSaveDate')).to.deep.equal([...equalIds, 'after'].sort());
    expect((await collection.findOne({ redboxOid: 'equal-local' }))?.lastSaveDate).to.equal(cutoff);
    expect((await collection.findOne({ redboxOid: 'equal-bson' }))?.lastSaveDate).to.be.instanceOf(Date);
  });

  it('intersects upper and lower date bounds targeting the same field', async function () {
    const result = await service.performNamedQuery(
      'metaMetadata.brandId', {}, 'record', { lastSaveDate: null },
      new QueryConfig({ queryParams: {
        lower: { path: 'lastSaveDate', type: 'date', queryType: '>=', format: 'ISODate', whenUndefined: 'ignore', required: false, defaultValue: null, template: '' },
        upper: { path: 'lastSaveDate', type: 'date', queryType: '<=', format: 'ISODate', whenUndefined: 'ignore', required: false, defaultValue: null, template: '' },
      } }).queryParams,
      { lower: cutoff, upper: '2016-10-25T02:30:51.151Z' }, brand, 0, 100,
    );
    expect(result.records.map(record => record.oid).sort()).to.deep.equal([...equalIds].sort());
    expect(result.summary.numFound).to.equal(equalIds.length);
  });

  it('retains lexical comparison when a parameter is configured as a string', async function () {
    expect(await query('>=', 'lastSaveDate', 'string')).to.deep.equal(['equal-local', 'equal-other-offset', 'invalid']);
  });

  it('does not add a date restriction for an omitted ignored parameter', async function () {
    const result = await service.performNamedQuery(
      'metaMetadata.brandId', {}, 'record', { lastSaveDate: null },
      new QueryConfig({ queryParams: { bound: { path: 'lastSaveDate', type: 'date', queryType: '>=', format: 'ISODate', whenUndefined: 'ignore' } } }).queryParams,
      {}, brand, 0, 100,
    );
    expect(result.records.map(record => record.oid).sort()).to.deep.equal(fixtures.map(fixture => fixture.id).sort());
  });

  it('returns no matches for an invalid date bound', async function () {
    expect(await query('>=', 'lastSaveDate', 'date', 'invalid-bound')).to.deep.equal([]);
  });
});
