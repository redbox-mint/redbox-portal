import { MongoClient } from 'mongodb';
// Runtime import keeps the shared fixture outside this package's test rootDir.
const { createRelatedRecordsFixtures } = require('../../../redbox-core/test/fixtures/related-records.fixtures');
import * as lodash from 'lodash';
const { expect } = require('chai');
const { Services } = require('../../src/services/MongoStorageService');

const mongoUrl = process.env.MONGO_CONCURRENCY_TEST_URL;
(mongoUrl ? describe : describe.skip)('Mongo authorized relation reads integration', function () {
  this.timeout(30_000);
  let client: MongoClient;
  let databaseName: string;
  let records: any;
  let service: any;
  let fixtures: ReturnType<typeof createRelatedRecordsFixtures>;
  let previousSails: any;
  let previousLodash: any;

  before(async function () {
    // Self-contained even when another suite has removed its Sails globals.
    previousSails = (global as any).sails;
    previousLodash = (global as any)._;
    const logger = { verbose() {}, debug() {}, info() {}, warn() {}, error() {}, trace() {} };
    (global as any)._ = lodash;
    (global as any).sails = {
      config: { log: { createNamespaceLogger: () => logger, customLogger: logger } },
      log: logger,
    };
    client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 5_000 });
    await client.connect();
    databaseName = `redbox_related_test_${process.pid}_${Date.now()}`;
    records = client.db(databaseName).collection('record');
    await records.createIndex({ redboxOid: 1 }, { unique: true });
    service = new Services.MongoStorageService();
    service.getNativeRecordCollection = () => records;
  });

  after(async function () {
    try {
      if (client && databaseName) await client.db(databaseName).dropDatabase();
    } finally {
      if (client) await client.close();
      (global as any).sails = previousSails;
      (global as any)._ = previousLodash;
    }
  });

  beforeEach(async function () {
    fixtures = createRelatedRecordsFixtures();
    await records.deleteMany({});
    await records.insertMany(fixtures.activeRecords);
  });

  function query(overrides = {}) {
    return {
      context: {
        brand: { id: fixtures.tenants.primary },
        audience: 'api',
        user: {
          username: fixtures.users.reader.username,
          roles: [{ name: fixtures.roles.reader, branding: fixtures.tenants.primary }],
        },
      },
      recordType: 'related-activity',
      foreignField: 'redboxOid',
      values: [fixtures.ids.activityB, fixtures.ids.activityA],
      limit: 50,
      ...overrides,
    };
  }
  const oids = result => result.records.map(record => record.redboxOid);

  it('excludes denied, missing, deleted, cross-tenant and wrong-type sources before limits', async function () {
    const result = await service.findRecordsByRelation(
      query({
        values: [...fixtures.references.unavailable, fixtures.ids.root, fixtures.ids.activityA],
        limit: 1,
      })
    );
    expect(oids(result)).to.deep.equal([fixtures.ids.activityA]);
    expect(result).to.include({ complete: true, overflow: false });
    const none = await service.findRecordsByRelation(query({ values: fixtures.references.unavailable, limit: 1 }));
    expect(oids(none)).to.deep.equal([]);
    expect(none).to.include({ complete: true, overflow: false });
  });

  it('preserves scalar and configured object-array reference order, deduplicating identifiers', async function () {
    expect(oids(await service.findRecordsByRelation(query({ values: [fixtures.references.scalar] })))).to.deep.equal([
      fixtures.ids.activityA,
    ]);
    const values = service.extractRelationshipLocalValues(
      { metadata: { refs: fixtures.references.array } },
      { localField: 'metadata.refs', oidProperty: 'oid' }
    );
    expect(oids(await service.findRecordsByRelation(query({ values })))).to.deep.equal(
      fixtures.references.expectedOrder
    );
  });

  it('matches reverse scalar and object-array foreign fields in deterministic OID order', async function () {
    await records.updateOne(
      { redboxOid: fixtures.ids.activityA },
      { $set: { 'metadata.plan': fixtures.ids.root, 'metadata.plans': [{ oid: fixtures.ids.root }] } }
    );
    await records.updateOne(
      { redboxOid: fixtures.ids.activityB },
      { $set: { 'metadata.plans': [{ oid: fixtures.ids.root }] } }
    );
    const reverse = query({ foreignField: 'metadata.plans.oid', values: [fixtures.ids.root] });
    expect(oids(await service.findRecordsByRelation(reverse))).to.deep.equal([
      fixtures.ids.activityA,
      fixtures.ids.activityB,
    ]);
    expect(
      oids(await service.findRecordsByRelation(query({ foreignField: 'metadata.plan', values: [fixtures.ids.root] })))
    ).to.deep.equal([fixtures.ids.activityA]);
  });

  it('reports limit+1 overflow and complete exact-limit results', async function () {
    const overflow = await service.findRecordsByRelation(query({ limit: 1 }));
    expect(overflow).to.include({ complete: false, overflow: true });
    expect(overflow.records).to.have.length(1);
    expect(await service.findRecordsByRelation(query({ limit: 2 }))).to.include({ complete: true, overflow: false });
  });

  for (const permission of ['viewRoles', 'editRoles']) {
    for (const populated of [false, true]) {
      it(`allows role-only ${permission} with ${populated ? 'populated' : 'primitive'} branding`, async function () {
        await records.updateOne({ redboxOid: fixtures.ids.activityA }, {
          $set: { authorization: { [permission]: [fixtures.roles.reader] } },
        });
        const roleQuery = query({ values: [fixtures.ids.activityA] });
        const role = roleQuery.context.user.roles[0] as { branding: unknown };
        role.branding = populated ? { id: fixtures.tenants.primary } : fixtures.tenants.primary;
        expect(oids(await service.findRecordsByRelation(roleQuery))).to.deep.equal([fixtures.ids.activityA]);
        role.branding = populated ? { id: fixtures.tenants.other } : fixtures.tenants.other;
        expect(oids(await service.findRecordsByRelation(roleQuery))).to.deep.equal([]);
      });
    }
  }

  it('honors tenant-scoped roles and edit access using the list read ACL', async function () {
    await records.updateOne(
      { redboxOid: fixtures.ids.activityA },
      {
        $set: {
          authorization: { editRoles: [fixtures.roles.reader] },
        },
      }
    );
    expect(oids(await service.findRecordsByRelation(query({ values: [fixtures.ids.activityA] })))).to.deep.equal([
      fixtures.ids.activityA,
    ]);
    const deniedQuery = query({ values: [fixtures.ids.activityA] });
    deniedQuery.context.user.roles[0].branding = fixtures.tenants.other;
    expect(oids(await service.findRecordsByRelation(deniedQuery))).to.deep.equal([]);
  });

  it('preserves explicit indexes in literal-key paths, including nested arrays and numeric object keys', async function () {
    await records.updateOne(
      { redboxOid: fixtures.ids.activityA },
      {
        $set: {
          metadata: {
            'literal.key': [{ oid: 'first' }, { oid: 'second' }],
            refs: [{ oid: 'first', '0': { oid: 'numeric-field' } }, { oid: 'second' }],
            objectRefs: { '0': { oid: 'object-zero' } },
            'nested.key': [[{ oid: 'nested' }]],
            'object.key': { '0': { oid: 'object-zero' } },
          },
        },
      }
    );
    const cases: [string, string, boolean][] = [
      ['metadata["literal.key"][0].oid', 'first', true],
      ['metadata["literal.key"][0].oid', 'second', false],
      ['metadata["literal.key"][1].oid', 'second', true],
      ['metadata["literal.key"][2].oid', 'first', false],
      ['metadata["literal.key"][2147483648].oid', 'first', false],
      ['metadata.refs[0].oid', 'first', true],
      ['metadata.refs[0].oid', 'numeric-field', false],
      ['metadata.objectRefs[0].oid', 'object-zero', true],
      ['metadata["literal.key"].oid', 'second', true],
      ['metadata["nested.key"][0][0].oid', 'nested', true],
      ['metadata["object.key"][0].oid', 'object-zero', true],
    ];
    for (const [foreignField, value, expectedMatch] of cases) {
      const result = await service.findRecordsByRelation(query({ foreignField, values: [value] }));
      expect(oids(result), `${foreignField} = ${value}`).to.deep.equal(expectedMatch ? [fixtures.ids.activityA] : []);
      expect(result).to.include({ complete: true, overflow: false });
    }
  });

  it('matches quoted literal keys with Lodash path semantics', async function () {
    expect(
      oids(
        await service.findRecordsByRelation(
          query({
            foreignField: 'metadata["literal.key"]',
            values: ['literal dot'],
          })
        )
      )
    ).to.deep.equal([fixtures.ids.activityA]);
  });
});
