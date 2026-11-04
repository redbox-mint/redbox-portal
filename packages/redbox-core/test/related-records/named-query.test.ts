import { randomUUID } from 'node:crypto';
import { expect } from 'chai';
import { MongoClient, Collection } from 'mongodb';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from '../services/testHelper';

describe('declared named-query relations', function () {
  let client: MongoClient;
  let collection: Collection;
  let service: import('../../src/services/NamedQueryService').Services.NamedQueryService;
  let relation: { id: string; recordType: string; localField: string; foreignField: string; oidProperty?: string };
  const brand = { id: 'brand', name: 'brand', css: '', roles: [] };
  const user = { username: 'reader', roles: [] };
  const filter = (mongoQuery: Record<string, unknown>) => ({ rootRecordType: 'root', relationId: 'activities', mongoQuery });
  const run = (filters: unknown[] = [filter({ 'metadata.active': true })], params = {}, queryParams = {}, sort: unknown = [], start = 0) =>
    service.performNamedQueryFromConfig({ collectionName: 'record', mongoQuery: {}, resultObjectMapping: {}, queryParams, sort, relatedRecordFilters: filters } as any, params, brand, start, 1, user);
  before(async function () {
    const url = process.env.NAMED_QUERY_TEST_MONGO_URL;
    if (!url) this.skip();
    client = new MongoClient(url);
    await client.connect();
    collection = client.db(`rr17_${randomUUID().replace(/-/g, '')}`).collection('records');
  });
  beforeEach(async function () {
    await collection.deleteMany({});
    const record = (redboxOid: string, type: string, metadata: object, visible = true) => ({ redboxOid, metaMetadata: { brandId: 'brand', type }, metadata, authorization: { view: visible ? ['reader'] : ['hidden'] } });
    await collection.insertMany([
      record('a', 'activity', { active: true, date: '2026-01-01' }),
      record('b', 'activity', { active: false, date: '2027-01-01' }),
      record('hidden-source', 'activity', { active: true }, false),
      record('root-a', 'root', { activities: [{ oid: 'a' }, { oid: 'b' }] }),
      record('root-b', 'root', { activities: 'a' }),
      record('root-hidden', 'root', { activities: 'a' }, false),
      record('root-denied-source', 'root', { activities: 'hidden-source' }),
    ]);
    relation = { id: 'activities', recordType: 'activity', localField: 'metadata.activities', foreignField: 'redboxOid', oidProperty: 'oid' };
    const model = { native: (cb: Function) => cb(null, collection) };
    setupServiceTestGlobals(createMockSails({ models: { record: model }, services: { recordsservice: {
      getRecordTypeSummary: async () => ({ relatedTo: [relation] })
    } } }));
    Reflect.set(global, 'Record', model);
    const module = require('../../src/services/NamedQueryService');
    service = new module.Services.NamedQueryService();
  });
  afterEach(() => { cleanupServiceTestGlobals(); Reflect.deleteProperty(global, 'Record'); });
  after(async () => { if (client) { await client.db(collection.dbName).dropDatabase(); await client.close(); } });
  it('counts authorized roots before paging and sorts ties by OID', async () => {
    const result = await run();
    expect(result.summary.numFound).to.equal(2);
    expect(result.records.map(record => record.oid)).to.deep.equal(['root-a']);
    const next = await run(undefined, {}, {}, [], 1);
    expect(next.summary.numFound).to.equal(2);
    expect(next.records.map(record => record.oid)).to.deep.equal(['root-b']);
  });
  it('combines conditions on one source and reruns after source changes', async () => {
    const filters = [filter({ 'metadata.active': true }), filter({ 'metadata.date': { $gte: '2027' } })];
    expect((await run(filters)).summary.numFound).to.equal(0);
    await collection.updateOne({ redboxOid: 'a' }, { $set: { 'metadata.date': '2028-01-01' } });
    expect((await run(filters)).summary.numFound).to.equal(2);
    expect((await collection.findOne({ redboxOid: 'root-a' }))!.metadata).to.deep.equal({ activities: [{ oid: 'a' }, { oid: 'b' }] });
  });
  const rejects = async (work: Promise<unknown>, text: string) => {
    try { await work; throw new Error('expected rejection'); } catch (error) { expect(String(error)).to.contain(text); }
  };
  it('binds source-only date parameters without adding predicates to root metadata', async () => {
    const result = await run([filter({ 'metadata.date': null })], { cutoff: '2026-01-01T00:00:00Z' }, {
      cutoff: { path: 'metadata.date', type: 'date', queryType: '<=', format: 'ISODate', whenUndefined: 'ignore' }
    });
    expect(result.summary.numFound).to.equal(2);
  });
  it('excludes other tenants and source types before matching roots', async () => {
    await collection.insertMany([
      { redboxOid: 'foreign', metaMetadata: { brandId: 'other', type: 'activity' }, metadata: { active: true }, authorization: { view: ['reader'] } },
      { redboxOid: 'wrong-type', metaMetadata: { brandId: 'brand', type: 'other' }, metadata: { active: true }, authorization: { view: ['reader'] } },
      ...['foreign', 'wrong-type'].map(id => ({ redboxOid: `root-${id}`, metaMetadata: { brandId: 'brand', type: 'root' }, metadata: { activities: id }, authorization: { view: ['reader'] } }))
    ]);
    expect((await run()).summary.numFound).to.equal(2);
  });
  it('rejects operator injection through a request parameter', async () => {
    await rejects(run([filter({ 'metadata.active': null })], { value: { $ne: false } }, { value: { path: 'metadata.active', type: 'string' } }), 'literal values');
    await rejects(run([filter({ 'metadata.active': null })], { value: '[{"$ne":false}]' }, { value: { path: 'metadata.active', type: 'array' } }), 'literal values');
  });
  it('rejects template-selected operators from undeclared request parameters in source predicates', async () => {
    const params = { flag: 'unused', payload: { $ne: true } };
    const definitions = { flag: { path: 'metadata.active', type: 'string', template: 'paramMap.payload' } };
    await rejects(run([filter({ 'metadata.active': null })], params, definitions), 'literal values');
    await rejects(run([filter({ 'metadata.active': null })], { ...params, payload: ['a'] }, definitions), 'declared type');
    await rejects(run([filter({ 'metadata.active': null })], { ...params, payload: { 'a.b': true } }, definitions), 'literal values');
  });
  it('rejects template-selected operators in root predicates before configured operators are added', async () => {
    for (const queryType of ['', '$eq']) {
      await rejects(service.performNamedQueryFromConfig({
        collectionName: 'record', resultObjectMapping: {}, mongoQuery: { 'metadata.activities': null },
        relatedRecordFilters: [filter({ 'metadata.active': true })],
        queryParams: { flag: { path: 'metadata.activities', type: 'string', template: 'paramMap.payload', queryType } }
      } as any, { flag: 'unused', payload: { $ne: true } }, brand, 0, 10, user), 'literal values');
    }
  });
  it('rejects template-selected and direct operators in legacy queries without relation filters', async () => {
    const legacy = (params: Record<string, unknown>) => service.performNamedQueryFromConfig({
      collectionName: 'record', resultObjectMapping: {},
      mongoQuery: { 'metaMetadata.type': 'activity', 'metadata.active': null },
      queryParams: { flag: { path: 'metadata.active', type: 'string', template: 'paramMap.payload' } }
    } as any, params, brand, 0, 10, user);
    await rejects(legacy({ flag: 'unused', payload: { $ne: true } }), 'literal value');
    const direct = service.performNamedQueryFromConfig({
      collectionName: 'record', resultObjectMapping: {}, mongoQuery: { 'metaMetadata.type': 'activity' },
      queryParams: { title: { path: 'metadata.title', type: 'string' } }
    } as any, { title: { $exists: false } }, brand, 0, 10, user);
    await rejects(direct, 'literal value');
    // A literal template-selected value still matches as before.
    expect((await legacy({ flag: 'unused', payload: 'nothing' })).summary.numFound).to.equal(0);
  });
  it('accepts template-selected arrays of literals only for array parameters', async () => {
    const result = await run([filter({ redboxOid: null })], { flag: 'unused', payload: ['a'] }, {
      flag: { path: 'redboxOid', type: 'array', template: 'paramMap.payload', queryType: '$in' }
    });
    expect(result.summary.numFound).to.equal(2);
    await rejects(run([filter({ redboxOid: null })], { flag: 'unused', payload: [{ $ne: true }] }, {
      flag: { path: 'redboxOid', type: 'array', template: 'paramMap.payload', queryType: '$in' }
    }), 'literal values');
  });
  it('extracts reverse object-array foreign references with the shared normalizer', async () => {
    relation = { id: 'activities', recordType: 'activity', localField: 'redboxOid', foreignField: 'metadata.parents.oid' };
    await collection.updateOne({ redboxOid: 'a' }, { $set: { 'metadata.parents': [{ oid: 'root-a' }, { oid: 'root-b' }] } });
    await collection.updateOne({ redboxOid: 'hidden-source' }, { $set: { 'metadata.parents': [{ oid: 'root-denied-source' }] } });
    const result = await run();
    expect(result.summary.numFound).to.equal(2);
    expect(result.records.map(record => record.oid)).to.deep.equal(['root-a']);
  });
  it('skips matching sources with absent foreign fields', async () => {
    relation = { id: 'activities', recordType: 'activity', localField: 'redboxOid', foreignField: 'metadata.parentOid' };
    expect((await run()).summary.numFound).to.equal(0);
    await collection.updateOne({ redboxOid: 'a' }, { $set: { 'metadata.parentOid': 'root-a' } });
    // Another authorized matching source has no foreign field and contributes no IDs.
    await collection.updateOne({ redboxOid: 'b' }, { $set: { 'metadata.active': true } });
    expect((await run()).summary.numFound).to.equal(1);
  });
  it('rejects removed match options, aggregation and effective sorting', async () => {
    for (const match of ['any', 'exists', 'all']) await rejects(run([{ ...filter({}), match }]), 'Unsupported');
    await rejects(run([filter({ $expr: { $eq: [1, 1] } })]), 'Unsupported');
    await rejects(run(undefined, {}, {}, [{ 'relatedMetadata.activities.date': 'ASC' }]), 'Unsupported');
  });
  it('fails explicitly when source materialization overflows', async () => {
    await collection.insertMany(Array.from({ length: 1001 }, (_, i) => ({ redboxOid: `extra-${i}`, metaMetadata: { brandId: 'brand', type: 'activity' }, metadata: { active: true }, authorization: { view: ['reader'] } })));
    await rejects(run(), 'limit exceeded');
  });
});
