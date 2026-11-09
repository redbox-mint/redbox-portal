import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
import * as sinon from 'sinon';
import { Services as AdminServices } from '@researchdatabox/redbox-core/dist/services/EmailTemplateAdminService';
import { Services as RecordServices } from '@researchdatabox/redbox-core/dist/services/RecordsService';
import { Services as RoleServices } from '@researchdatabox/redbox-core/dist/services/RolesService';
import { Services } from '../../src/services/MongoStorageService';
import { storage as storageConfig } from '../../src/config/storage';

const mongoUrl = process.env.MONGO_TEST_URL;
const describeMongo = mongoUrl ? describe : describe.skip;

// Real core search + record authorization + Mongo adapter, without Solr or a
// lifted portal. Each run owns and removes only its uniquely named database.
describeMongo('Email preview record search with real Mongo storage', function () {
  this.timeout(30_000);
  let client: MongoClient;
  let databaseName: string;
  let collection: any;
  let storage: Services.MongoStorageService;
  let admin: AdminServices.EmailTemplateAdmin;
  let globals: Map<string, unknown>;
  let sandbox: sinon.SinonSandbox;
  const brand: any = {
    id: 'brand-a',
    name: 'a',
    roles: [
      { id: 'a-reader', name: 'Reader' },
      { id: 'a-editor', name: 'Editor' },
    ],
  };
  const foreign: any = { id: 'brand-b', name: 'b', roles: [{ id: 'b-reader', name: 'Reader' }] };
  const user: any = { username: 'reader', roles: [brand.roles[0], brand.roles[1]] };
  const search = (query = '', page = 1, who = user, brandId = brand.id) =>
    admin.searchPreviewRecords(brandId, who, query, page);
  const row = (oid: string, title: string, authorization: any = { view: ['reader'] }, brandId = brand.id) => ({
    _id: new ObjectId(),
    redboxOid: oid,
    metadata: { title },
    metaMetadata: { brandId, type: 'rdmp' },
    authorization,
  });

  before(async () => {
    globals = new Map(
      ['sails', 'BrandingConfig', 'BrandingService', 'RecordsService', 'RolesService', 'Record'].map(name => [
        name,
        (global as any)[name],
      ])
    );
    client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    databaseName = `redbox_email_preview_${randomUUID().replaceAll('-', '')}`;
    collection = client.db(databaseName).collection('record');
    await collection.createIndexes(storageConfig.mongodb.indices);
    storage = new Services.MongoStorageService();
    storage.recordCol = collection;
    admin = new AdminServices.EmailTemplateAdmin();
    (global as any).sails = {
      ...(globals.get('sails') as any),
      config: {
        ...(globals.get('sails') as any).config,
        storage: { serviceName: 'storage' },
        search: { serviceName: 'solr' },
      },
      services: {
        storage,
        solr: {
          searchFuzzy: () => {
            throw new Error('Solr unavailable');
          },
        },
      },
    };
    (global as any).BrandingConfig = { findOne: async ({ id }: any) => [brand, foreign].find(item => item.id === id) };
    (global as any).BrandingService = { getBrandById: (id: string) => [brand, foreign].find(item => item.id === id) };
    (global as any).Record = { tableName: 'record' };
    (global as any).RecordsService = new RecordServices.Records().exports();
    (global as any).RolesService = new RoleServices.Roles().exports();
  });
  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    await collection.deleteMany({});
  });
  afterEach(() => sandbox.restore());
  after(async () => {
    if (client) {
      if (databaseName) await client.db(databaseName).dropDatabase();
      await client.close();
    }
    for (const [name, value] of globals ?? []) {
      if (value === undefined) delete (global as any)[name];
      else (global as any)[name] = value;
    }
  });

  it('finds title substrings containing spaces and punctuation without relying on available or fresh Solr', async () => {
    const wanted = row('title-oid', 'SCU research: water, land & people (2026).');
    await collection.insertMany([wanted, row('other', 'Unrelated')]);
    const solr = sandbox.spy((global as any).sails.services.solr, 'searchFuzzy');
    assert.deepEqual((await search('research: water, land & people')).records, [
      { oid: wanted.redboxOid, title: wanted.metadata.title },
    ]);
    assert.equal(solr.callCount, 0);
    solr.restore();
    const stale = sandbox.stub((global as any).sails.services.solr, 'searchFuzzy').resolves({
      records: [{ storage_id: 'stale-phantom', metadata_title: 'PRIVATE' }],
      totalItems: 999,
    });
    assert.deepEqual((await search('WATER, LAND')).records, [{ oid: wanted.redboxOid, title: wanted.metadata.title }]);
    assert.equal(stale.callCount, 0);
    await collection.updateOne({ redboxOid: wanted.redboxOid }, { $set: { 'metadata.title': 'Fresh Mongo title' } });
    assert.deepEqual((await search('Fresh Mongo')).records, [{ oid: wanted.redboxOid, title: 'Fresh Mongo title' }]);
    assert.deepEqual((await search('water, land')).records, []);
  });

  it('matches exact redboxOid of any syntax and never confuses or returns the Mongo ID', async () => {
    const wanted = row('custom oid:/[42]', 'Title without the identifier');
    await collection.insertMany([wanted, row('prefix-custom oid:/[42]-suffix', 'Other')]);
    const result = await search(wanted.redboxOid);
    assert.deepEqual(result, {
      records: [{ oid: wanted.redboxOid, title: wanted.metadata.title }],
      page: 1,
      hasMore: false,
    });
    assert.ok(!JSON.stringify(result).includes(wanted._id.toHexString()));
    assert.deepEqual((await search(wanted._id.toHexString())).records, []);
    assert.deepEqual((await search('custom oid:/[4')).records, []);
  });

  it('treats every regex metacharacter literally', async () => {
    const literal = '.*+?^${}()|[]\\';
    await collection.insertMany([row('literal', `A ${literal} search`), row('decoy', 'A anything search')]);
    assert.deepEqual(
      (await search(literal)).records.map(record => record.oid),
      ['literal']
    );
    assert.deepEqual(
      (await search('[')).records.map(record => record.oid),
      ['literal']
    );
  });

  it('isolates brands for title, exact OID and empty queries, and hides absent and forbidden OIDs alike', async () => {
    await collection.insertMany([
      row('a', 'Shared title'),
      row('b', 'Shared title', undefined, foreign.id),
      row('private', 'PRIVATE', { view: ['someone-else'] }),
    ]);
    assert.deepEqual(
      (await search('Shared title')).records.map(record => record.oid),
      ['a']
    );
    assert.deepEqual(
      (await search()).records.map(record => record.oid),
      ['a']
    );
    const empty = { records: [], page: 1, hasMore: false };
    for (const oid of ['b', 'private', 'nonexistent']) assert.deepEqual(await search(oid), empty);
    assert.deepEqual(
      (await search('', 1, user, foreign.id)).records.map(record => record.oid),
      ['b']
    );
  });

  it('preserves view and edit grants for users and brand role IDs, including legacy flattened ACLs', async () => {
    const flattened = { ...row('05-flat', 'Flat', undefined), authorization_view: ['reader'] };
    delete flattened.authorization;
    await collection.insertMany([
      row('01-view', 'View', { view: ['reader'] }),
      row('02-edit', 'Edit', { edit: ['reader'] }),
      row('03-view-role', 'Role view', { viewRoles: ['Reader'] }),
      row('04-edit-role', 'Role edit', { editRoles: ['Editor'] }),
      flattened,
      row('06-private', 'PRIVATE', { view: ['someone-else'] }),
      { ...row('07-nested-wins', 'PRIVATE', {}), authorization_view: ['reader'] },
    ]);
    assert.deepEqual(
      (await search()).records.map(record => record.oid),
      ['01-view', '02-edit', '03-view-role', '04-edit-role', '05-flat']
    );
    // A same-named foreign role must not grant view of this brand's records.
    const foreignRoleUser = { username: 'outsider', roles: foreign.roles } as any;
    assert.deepEqual((await search('', 1, foreignRoleUser)).records, []);
    // Canonical IDs, rather than caller-provided names/branding, decide grants.
    const idOnlyUser = { username: 'outsider', roles: [{ id: 'a-editor' }] } as any;
    assert.deepEqual(
      (await search('', 1, idOnlyUser)).records.map(record => record.oid),
      ['04-edit-role']
    );
  });

  it('paginates only accessible results in stable OID order and hides inaccessible lookahead', async () => {
    const documents = Array.from({ length: 65 }, (_, i) =>
      row(
        `page-${String(i).padStart(3, '0')}`,
        `Page ${i}`,
        i % 3 === 0 ? { edit: ['reader'] } : { view: ['someone-else'] }
      )
    );
    await collection.insertMany(documents.reverse());
    const expected = documents
      .filter(record => record.authorization.edit)
      .map(record => record.redboxOid)
      .sort();
    const pages = await Promise.all([1, 2, 3, 4].map(page => search('', page)));
    assert.deepEqual(
      pages.map(page => page.records.map(record => record.oid)),
      [expected.slice(0, 10), expected.slice(10, 20), expected.slice(20), []]
    );
    assert.deepEqual(
      pages.map(page => page.hasMore),
      [true, true, false, false]
    );
    assert.deepEqual(await search('', 2), pages[1]);
    await collection.deleteMany({ redboxOid: { $gte: expected[20] } });
    // There are ten visible rows on page two; the remaining hidden rows do not
    // turn hasMore on, and deleting them makes no observable difference.
    const before = await search('', 2);
    assert.equal(before.records.length, 10);
    assert.equal(before.hasMore, false);
    await collection.deleteMany({ 'authorization.view': 'someone-else' });
    assert.deepEqual(await search('', 2), before);
  });

  it('fills page offsets and lookahead after authoritative permission overrides reject entire candidate batches', async () => {
    await collection.insertMany(
      Array.from({ length: 123 }, (_, i) => row(`hook-${String(i).padStart(3, '0')}`, `Hook ${i}`))
    );
    const real = (global as any).RecordsService.hasViewAccess;
    sandbox
      .stub((global as any).RecordsService, 'hasViewAccess')
      .callsFake((...args: any[]) => real(...args) && Number(args[3].redboxOid.slice(-3)) >= 101);
    const first = await search();
    const second = await search('', 2);
    const third = await search('', 3);
    assert.deepEqual(
      first.records.map(record => record.oid),
      Array.from({ length: 10 }, (_, i) => `hook-${101 + i}`)
    );
    assert.deepEqual(
      second.records.map(record => record.oid),
      Array.from({ length: 10 }, (_, i) => `hook-${111 + i}`)
    );
    assert.deepEqual(
      third.records.map(record => record.oid),
      ['hook-121', 'hook-122']
    );
    assert.deepEqual([first.hasMore, second.hasMore, third.hasMore], [true, true, false]);
  });

  it('uses bounded brand-scoped OID queries, excludes Mongo IDs and never requests a count', async () => {
    await collection.insertMany([row('index-a', 'A'), row('index-b', 'B')]);
    const count = sandbox.spy(collection, 'countDocuments');
    const find = sandbox.spy(collection, 'find');
    assert.equal((await search()).records.length, 2);
    assert.equal(count.callCount, 0);
    const [filter, options] = find.firstCall.args as any;
    assert.equal(filter['metaMetadata.brandId'], brand.id);
    assert.deepEqual(options.sort, { redboxOid: 1 });
    assert.ok(options.limit > 0 && options.limit <= 100);
    assert.equal(options.projection._id, 0);
    assert.equal(options.maxTimeMS, 5000);
    const indexes = await collection.indexes();
    assert.ok(indexes.some((index: any) => index.key['metaMetadata.brandId'] === 1 && index.key.redboxOid === 1));
    const plan = await collection.find(filter, options).explain('executionStats');
    assert.ok(JSON.stringify(plan.queryPlanner.winningPlan).includes('metaMetadata.brandId_1_redboxOid_1'));
  });
});
