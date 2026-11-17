import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  compileCollectionPipeline,
  MongoRecordCollectionProvider,
  type GridStorageRequest,
} from '@researchdatabox/redbox-core';
const gridCaller: GridStorageRequest['caller'] = {
  brand: { id: 'brand-grid', name: 'default', css: '', roles: [] },
  portal: 'rdmp',
  user: { id: 'viewer', username: 'viewer' },
  roles: [],
};
const gridContracts = (): GridStorageRequest['contracts'] =>
  ['draft', 'published'].map((stage): GridStorageRequest['contracts'][number] => ({
    context: {
      brand: 'default',
      portal: 'rdmp',
      kind: 'update',
      operation: 'strict-all',
      enforcement: 'shadow',
      unknownProperties: 'allow',
      recordType: 'grid-fixture',
      workflowStep: stage,
      form: `${stage}-form`,
    },
    root: {
      kind: 'object',
      nullable: false,
      unknownProperties: 'allow',
      properties: {
        amount: { kind: 'scalar', scalarType: 'number', nullable: true },
        details: {
          kind: 'object',
          nullable: true,
          unknownProperties: 'allow',
          properties: { note: { kind: 'scalar', scalarType: 'string', nullable: true } },
        },
        'literal.key': { kind: 'scalar', scalarType: 'string', nullable: true },
      },
    },
    definitions: {},
    diagnostics: [],
    fieldOwners: {},
    validatorSummaries: [],
    completeness: 'complete',
  }));
const activeCursors = (client: import('mongodb').MongoClient) =>
  (client as unknown as { s: { activeCursors: Set<unknown> } }).s.activeCursors.size;

// Use the driver that actually supplies storage collections, not the core driver's BSON classes.
const drivers = ['sails-mongo', '@researchdatabox/redbox-core', undefined].map(owner => {
  const localRequire = owner ? createRequire(require.resolve(owner)) : require;
  return {
    name: owner ?? 'portal',
    driver: localRequire('mongodb') as typeof import('mongodb'),
    version: localRequire('mongodb/package.json').version,
  };
});

describe('Mongo collection index and deadline regressions', function () {
  this.timeout(30_000);
  let collection;
  const oid = (index: number) => `oid-${String(index).padStart(5, '0')}`;
  const request = (
    query: Partial<GridStorageRequest['query']> = {},
    after?: GridStorageRequest['after']
  ): GridStorageRequest => ({
    caller: gridCaller,
    contracts: gridContracts(),
    query: { recordType: 'grid-fixture', ...query },
    after,
    deadline: Date.now() + 5000,
  });
  const options = { collation: { locale: 'simple' } };
  const eq = (text: string) => ({ field: 'record:oid', eq: { text } });
  // Reconstruct the previous execution layout: no raw OID predicates/order,
  // with exactly the same normalized filters, keysets, nulls and output projection.
  function projectedPipeline(input: GridStorageRequest) {
    const pipeline = compileCollectionPipeline(input);
    pipeline[0].$match.$and = pipeline[0].$match.$and.filter(clause => !Object.hasOwn(clause, 'redboxOid'));
    const sort = [...(input.query.sort ?? [])];
    if (!sort.some(item => item.field === 'record:oid')) sort.push({ field: 'record:oid', direction: 'ASC' });
    const fields = [...new Set([...(input.query.filters ?? []), ...sort].map(item => item.field))];
    if (sort.length === 1 && input.after) {
      pipeline.splice(pipeline.findIndex(stage => '$project' in stage) + 1, 0, {
        $match: {
          $expr: {
            [sort[0].direction === 'ASC' ? '$gt' : '$lt']: [
              `$v${fields.indexOf('record:oid')}`,
              { $literal: input.after.keys[0] },
            ],
          },
        },
      });
    }
    const index = pipeline.findIndex(stage => '$sort' in stage);
    pipeline.splice(index, 1);
    pipeline.splice(
      pipeline.findIndex(stage => '$limit' in stage),
      0,
      {
        $sort: Object.fromEntries(
          sort.map(item => [`v${fields.indexOf(item.field)}`, item.direction === 'ASC' ? 1 : -1])
        ),
      }
    );
    return pipeline;
  }
  async function parity(input: GridStorageRequest) {
    const actual = await collection.aggregate(compileCollectionPipeline(input), options).toArray();
    assert.deepEqual(actual, await collection.aggregate(projectedPipeline(input), options).toArray());
    return actual;
  }
  function walk(value: unknown, predicate: (node: any) => boolean): any[] {
    if (!value || typeof value !== 'object') return [];
    return [...(predicate(value) ? [value] : []), ...Object.values(value).flatMap(child => walk(child, predicate))];
  }
  before(async () => {
    collection = Record.getDatastore().manager.collection(`graphql_willie_${randomUUID().replace(/-/g, '')}`);
    await collection.createIndex({ redboxOid: 1 }, { unique: true });
    await collection.insertMany(
      Array.from({ length: 10_000 }, (_, index) => ({
        redboxOid: oid(index),
        metaMetadata: { brandId: gridCaller.brand.id, type: 'grid-fixture', form: 'draft-form' },
        workflow: { stage: 'draft' },
        authorization: { view: ['viewer'] },
        metadata: {
          amount: index % 5 === 0 ? null : index % 3,
          title: 'same',
          details: { note: 'nested' },
          'details.note': 'literal',
          'literal.key': 'literal',
          literal: { key: 'traversed' },
        },
      }))
    );
  });
  after(async () => {
    await collection?.drop();
  });

  it('uses the OID index for EQ/IN and bounded ordered continuation without a blocking sort', async () => {
    for (const [label, input, expected, maxDocs] of [
      ['eq', request({ filters: [eq(oid(5000))] }), [oid(5000)], 1],
      [
        'in',
        request({ filters: [{ field: 'record:oid', in: [1, 5000, 9999].map(index => ({ text: oid(index) })) }] }),
        [oid(1), oid(5000), oid(9999)],
        3,
      ],
      ['default-first', request(), Array.from({ length: 50 }, (_, index) => oid(index)), 50],
      [
        'default-after',
        request({}, { keys: [oid(9000)] }),
        Array.from({ length: 50 }, (_, index) => oid(9001 + index)),
        50,
      ],
      [
        'asc-after',
        request({ sort: [{ field: 'record:oid', direction: 'ASC' }] }, { keys: [oid(9000)] }),
        Array.from({ length: 50 }, (_, index) => oid(9001 + index)),
        50,
      ],
      [
        'desc-after',
        request({ sort: [{ field: 'record:oid', direction: 'DESC' }] }, { keys: [oid(9000)] }),
        Array.from({ length: 50 }, (_, index) => oid(8999 - index)),
        50,
      ],
    ] as const) {
      const rows = await parity(input);
      assert.deepEqual(
        rows.map(row => row.oid),
        expected
      );
      const explain = await collection.aggregate(compileCollectionPipeline(input), options).explain('executionStats');
      const stats = walk(explain, node => node.executionStats?.totalDocsExamined !== undefined)[0].executionStats;
      const scans = walk(stats.executionStages, node => node.stage === 'IXSCAN');
      assert.ok(
        scans.some(scan => scan.indexName === 'redboxOid_1'),
        JSON.stringify(explain)
      );
      assert.equal(walk(stats.executionStages, node => node.stage === 'SORT').length, 0, JSON.stringify(stats));
      assert.ok(!(explain.stages ?? []).some(stage => '$sort' in stage), JSON.stringify(explain.stages));
      assert.ok(stats.totalDocsExamined <= maxDocs, JSON.stringify(stats));
      const baseline = await collection.aggregate(projectedPipeline(input), options).explain('executionStats');
      const before = walk(baseline, node => node.executionStats?.totalDocsExamined !== undefined)[0].executionStats;
      console.log(
        'OID_EXPLAIN',
        JSON.stringify({
          label,
          returned: rows.length,
          keys: stats.totalKeysExamined,
          docs: stats.totalDocsExamined,
          baselineDocs: before.totalDocsExamined,
          scans: scans.map(({ indexName, direction, indexBounds }) => ({ indexName, direction, indexBounds })),
        })
      );
    }
  });
  it('retains exact OID matching, scope defenses, metadata scalar/null meaning and compound OID direction', async () => {
    const samples = [
      { redboxOid: ['array-oid'], authorization: { view: ['viewer'] } },
      { redboxOid: 'denied', authorization: { view: [] } },
      { redboxOid: 'foreign', metaMetadata: { brandId: 'foreign', type: 'grid-fixture', form: 'draft-form' } },
      { redboxOid: 'wrong-type', metaMetadata: { brandId: gridCaller.brand.id, type: 'other', form: 'draft-form' } },
      { redboxOid: 'wrong-stage', workflow: { stage: 'other' } },
      { redboxOid: 'wrong-form', metaMetadata: { brandId: gridCaller.brand.id, type: 'grid-fixture', form: 'other' } },
    ];
    await collection.insertMany(
      samples.map(sample => ({
        metaMetadata: { brandId: gridCaller.brand.id, type: 'grid-fixture', form: 'draft-form' },
        workflow: { stage: 'draft' },
        authorization: { view: ['viewer'] },
        metadata: { amount: 1 },
        ...sample,
      }))
    );
    for (const sample of samples.slice(0, 5))
      assert.deepEqual(await parity(request({ filters: [eq(String(sample.redboxOid))] })), []);
    assert.deepEqual(
      await parity(request({ filters: [eq('wrong-form'), { field: 'metadata:/amount', exists: true }] })),
      []
    );
    for (const sort of [
      [
        { field: 'metadata:/amount', direction: 'ASC' },
        { field: 'record:oid', direction: 'DESC' },
      ],
      [
        { field: 'record:oid', direction: 'DESC' },
        { field: 'metadata:/amount', direction: 'ASC' },
      ],
    ] as const) {
      const query = {
        filters: [{ field: 'record:oid', in: Array.from({ length: 20 }, (_, index) => ({ text: oid(index) })) }],
        sort: [...sort],
      };
      const first = await parity(request(query));
      assert.equal(first.length, 20);
      if (sort[0].field === 'metadata:/amount')
        assert.deepEqual(
          first.slice(0, 4).map(row => row.oid),
          [oid(15), oid(10), oid(5), oid(0)]
        );
      else
        assert.deepEqual(
          first.map(row => row.oid),
          Array.from({ length: 20 }, (_, index) => oid(19 - index))
        );
      for (const row of first) {
        const rest = await parity(request(query, { keys: row.keys }));
        assert.deepEqual(
          rest.map(candidate => candidate.oid),
          first.slice(first.indexOf(row) + 1).map(candidate => candidate.oid)
        );
      }
    }
    assert.deepEqual(
      (
        await parity(request({ filters: [eq(oid(1)), { field: 'metadata:/details/note', eq: { text: 'nested' } }] }))
      ).map(row => row.oid),
      [oid(1)]
    );
    assert.deepEqual(
      await parity(request({ filters: [eq(oid(1)), { field: 'metadata:/details/note', eq: { text: 'literal' } }] })),
      []
    );
  });
  it('retains exact metadata keys containing dots', async () => {
    assert.deepEqual(
      (
        await parity(request({ filters: [eq(oid(1)), { field: 'metadata:/literal.key', eq: { text: 'literal' } }] }))
      ).map(row => row.oid),
      [oid(1)]
    );
    assert.deepEqual(
      await parity(request({ filters: [eq(oid(1)), { field: 'metadata:/literal.key', eq: { text: 'traversed' } }] })),
      []
    );
  });
  for (const { name, driver, version } of drivers) {
    it(`bounds selection and closes cursors across ${name}'s MongoDB ${version}`, async () => {
      const client = new driver.MongoClient('mongodb://127.0.0.1:1', { serverSelectionTimeoutMS: 30_000 });
      try {
        const start = Date.now();
        await assert.rejects(
          () =>
            new MongoRecordCollectionProvider(client.db('unavailable').collection('records')).executeRecordCollection({
              ...request(),
              deadline: start + 100,
            }),
          error => (error as any).extensions?.code === 'QUERY_TIMEOUT'
        );
        const elapsed = Date.now() - start;
        assert.ok(elapsed < 1000, `deadline exceeded by ${elapsed}ms`);
        assert.equal(activeCursors(client), 0);
        console.log('DRIVER_TIMEOUT', JSON.stringify({ name, version, elapsed, activeCursors: activeCursors(client) }));
      } finally {
        await client.close();
      }
      // Sails normalizes the datastore config and may remove its URL. Reuse
      // the actual manager's target for the independent driver compatibility read.
      const connected = new driver.MongoClient(Record.getDatastore().manager.client.s.url);
      try {
        await connected.connect();
        const page = await new MongoRecordCollectionProvider(
          connected.db(collection.dbName).collection(collection.collectionName)
        ).executeRecordCollection(request({ filters: [eq(oid(1))] }));
        assert.deepEqual(page.candidates, [{ oid: oid(1), keys: [oid(1)] }]);
        assert.equal(activeCursors(connected), 0);
      } finally {
        await connected.close();
      }
    });
  }
});
