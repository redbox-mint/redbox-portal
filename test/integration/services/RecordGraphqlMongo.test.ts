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

  it('includes legacy padded brand IDs using the runtime authorization trim rules', async () => {
    const samples = [
      ['legacy-brand', ' brand-grid '],
      ['unicode-brand', '\uFEFF\u00A0brand-grid\u2028'],
      ['foreign-brand', ' foreign '],
      ['nul-brand', '\0brand-grid\0'],
      ['array-brand', ['brand-grid']],
      ['missing-brand', null],
    ] as const;
    await collection.insertMany(
      samples.map(([redboxOid, brandId]) => ({
        redboxOid,
        metaMetadata: { brandId, type: 'grid-fixture', form: 'draft-form' },
        workflow: { stage: 'draft' },
        authorization: { view: ['viewer'] },
      }))
    );
    try {
      for (const brandId of ['brand-grid', ' brand-grid ']) {
        const input = request({
          filters: [{ field: 'record:oid', in: samples.map(([text]) => ({ text })) }],
        });
        const page = await new MongoRecordCollectionProvider(collection).executeRecordCollection({
          ...input,
          caller: { ...gridCaller, brand: { ...gridCaller.brand, id: brandId } },
        });
        assert.deepEqual(
          page.candidates.map(candidate => candidate.oid),
          ['legacy-brand', 'unicode-brand']
        );
      }
    } finally {
      await collection.deleteMany({ redboxOid: { $in: samples.map(([oid]) => oid) } });
    }
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

describe('Mongo declared scalar-list collections', function () {
  this.timeout(120_000);
  type Node = GridStorageRequest['contracts'][number]['root']['properties'][string];
  const scalar = (scalarType: 'string' | 'number' | 'integer' | 'boolean', format?: string): Node => ({
    kind: 'scalar',
    scalarType,
    nullable: true,
    ...(format ? { annotations: { extensions: { 'x-redbox-format': format } } } : {}),
  });
  const list = (items: Node): Node => ({ kind: 'array', nullable: true, items });
  const contracts = (): GridStorageRequest['contracts'] =>
    gridContracts().map(contract => ({
      ...contract,
      root: {
        ...contract.root,
        properties: {
          amount: scalar('number'),
          tags: list(scalar('string')),
          scores: list(scalar('integer')),
          amounts: list(scalar('number')),
          flags: list(scalar('boolean')),
          dates: list(scalar('string', 'date-time')),
          days: list(scalar('string', 'date')),
          details: {
            kind: 'object',
            nullable: true,
            unknownProperties: 'allow',
            properties: { codes: list(scalar('string')) },
          },
          'literal.list': list(scalar('string')),
        },
      },
    }));
  let collection;
  const suffix = randomUUID().slice(0, 8);
  const id = (key: string) => `list-${key}-${suffix}`;
  const base = (oid: string, metadata: object, overrides: object = {}) => ({
    redboxOid: oid,
    metaMetadata: { brandId: gridCaller.brand.id, type: 'grid-fixture', form: 'draft-form' },
    workflow: { stage: 'draft' },
    authorization: { view: ['viewer'] },
    metadata,
    ...overrides,
  });
  const request = (
    query: Partial<GridStorageRequest['query']> = {},
    after?: GridStorageRequest['after']
  ): GridStorageRequest => ({
    caller: gridCaller,
    contracts: contracts(),
    query: { recordType: 'grid-fixture', ...query },
    after,
    deadline: Date.now() + 5000,
  });
  const provider = () => new MongoRecordCollectionProvider(collection);
  const semantic = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11'].map(id);
  const scope = { field: 'record:oid', in: semantic.map(text => ({ text })) };
  async function oids(filters: object[]): Promise<string[]> {
    const page = await provider().executeRecordCollection(request({ filters: [scope, ...filters] as never }));
    return page.candidates.map(candidate => candidate.oid);
  }
  /** Walk every storage page with the real continuation keys. */
  async function walkPages(
    query: Partial<GridStorageRequest['query']>
  ): Promise<{ oid: string; keys: NonNullable<GridStorageRequest['after']>['keys'] }[]> {
    const seen: { oid: string; keys: NonNullable<GridStorageRequest['after']>['keys'] }[] = [];
    let after: GridStorageRequest['after'];
    for (let page = 0; page < 100; page++) {
      const result = await provider().executeRecordCollection(request(query, after));
      seen.push(...result.candidates);
      if (result.exhausted) return seen;
      after = { keys: result.candidates.at(-1)!.keys };
    }
    throw new Error('Pagination did not terminate');
  }
  before(async () => {
    collection = Record.getDatastore().manager.collection(`graphql_lists_${randomUUID().replace(/-/g, '')}`);
    await collection.createIndex({ redboxOid: 1 }, { unique: true });
    await collection.insertMany([
      base(id('s01'), {
        tags: ['alpha', 'beta'],
        scores: [5, 1, 9],
        amounts: [1.5, -2],
        flags: [true],
        dates: ['2026-01-10T00:00:00Z', new Date('2026-03-01T00:00:00Z')],
        days: ['2026-02-01'],
        details: { codes: ['x1'] },
        'literal.list': ['dot'],
      }),
      base(id('s02'), {
        tags: ['Alphabet'],
        scores: [3],
        amounts: [10],
        flags: [false, true],
        dates: ['2026-06-01T12:00:00+10:00'],
        days: ['2026-02-30'],
        details: { codes: [] },
        // Implicit traversal trap: not the declared literal "literal.list" key.
        literal: { list: ['trap'] },
      }),
      base(id('s03'), { tags: 'alpha', scores: 4, flags: true, dates: '2026-03-01T00:00:00Z', details: 'x1' }),
      base(id('s04'), { tags: [], scores: [], 'details.codes': ['x1'], details: { codes: null } }),
      base(id('s05'), { tags: null, scores: null, details: null }),
      base(id('s06'), {}),
      base(id('s07'), {
        tags: [null, 'gamma', 7, { a: 'alpha' }, ['alpha']],
        scores: [null, '8', 2.5, Number.NaN, Number.POSITIVE_INFINITY, 6, [1], 2 ** 53, true],
        amounts: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '1', 7, [9]],
        flags: ['true', 0, null, [true]],
        dates: [
          '2026-13-01T00:00:00Z',
          'not a date',
          1767225600000,
          '2026-02-30T00:00:00Z',
          '2026-01-01T24:00:00Z',
          ['2026-03-01T00:00:00Z'],
        ],
        days: ['2026-02-01T00:00:00', null],
        details: [{ codes: ['x1'] }],
      }),
      base(id('s08'), { tags: ['alpha'], scores: [1] }, { authorization: { view: ['someone-else'] } }),
      base(
        id('s09'),
        { tags: ['alpha'], scores: [1] },
        {
          metaMetadata: { brandId: gridCaller.brand.id, type: 'grid-fixture', form: 'other-form' },
        }
      ),
      base(id('s10'), { tags: ['delta', 'alpha'], scores: [2, 8] }),
      base(id('s11'), { scores: [5] }),
    ]);
  });
  after(async () => {
    await collection?.drop();
  });

  it('matches any valid element for EQ, IN, CONTAINS and IPREFIX without flattening or coercion', async () => {
    const tags = 'metadata:/tags';
    assert.deepEqual(await oids([{ field: tags, eq: { text: 'alpha' } }]), [id('s01'), id('s10')]);
    assert.deepEqual(await oids([{ field: tags, in: [{ text: 'gamma' }, { text: 'beta' }] }]), [id('s01'), id('s07')]);
    assert.deepEqual(await oids([{ field: tags, contains: 'lph' }]), [id('s01'), id('s02'), id('s10')]);
    assert.deepEqual(await oids([{ field: tags, iprefix: 'ALPHA' }]), [id('s01'), id('s02'), id('s10')]);
    assert.deepEqual(await oids([{ field: tags, iprefix: 'alphab' }]), [id('s02')]);
    assert.deepEqual(await oids([{ field: 'metadata:/scores', eq: { number: 6 } }]), [id('s07')]);
    // The string '8' is never coerced; only s10's numeric element matches.
    assert.deepEqual(await oids([{ field: 'metadata:/scores', eq: { number: 8 } }]), [id('s10')]);
    assert.deepEqual(await oids([{ field: 'metadata:/flags', eq: { boolean: false } }]), [id('s02')]);
    assert.deepEqual(await oids([{ field: 'metadata:/flags', eq: { boolean: true } }]), [id('s01'), id('s02')]);
  });
  it('treats EXISTS as at least one valid element and missing/null/empty/non-array/invalid as none', async () => {
    assert.deepEqual(await oids([{ field: 'metadata:/tags', exists: true }]), [
      id('s01'),
      id('s02'),
      id('s07'),
      id('s10'),
    ]);
    assert.deepEqual(await oids([{ field: 'metadata:/tags', exists: false }]), [
      id('s03'),
      id('s04'),
      id('s05'),
      id('s06'),
      id('s11'),
    ]);
    assert.deepEqual(await oids([{ field: 'metadata:/flags', exists: true }]), [id('s01'), id('s02')]);
    assert.deepEqual(await oids([{ field: 'metadata:/dates', exists: true }]), [id('s01'), id('s02')]);
    // A legacy zone-less timestamp is UTC, as for scalars; the impossible calendar day is not.
    assert.deepEqual(await oids([{ field: 'metadata:/days', exists: true }]), [id('s01'), id('s07')]);
    assert.deepEqual(await oids([{ field: 'metadata:/amounts', exists: true }]), [id('s01'), id('s02'), id('s07')]);
  });
  it('requires one element inside both BETWEEN bounds while separate filters may match different elements', async () => {
    const scores = 'metadata:/scores';
    assert.deepEqual(await oids([{ field: scores, between: { from: { number: 3 }, to: { number: 7 } } }]), [
      id('s01'),
      id('s02'),
      id('s07'),
      id('s11'),
    ]);
    assert.deepEqual(await oids([{ field: scores, between: { from: { number: 2 }, to: { number: 4 } } }]), [
      id('s02'),
      id('s10'),
    ]);
    assert.deepEqual(
      await oids([
        { field: scores, gt: { number: 1 } },
        { field: scores, lt: { number: 5 } },
      ]),
      [id('s01'), id('s02'), id('s10')]
    );
    // Non-finite and non-numeric elements never satisfy numeric ranges.
    assert.deepEqual(await oids([{ field: 'metadata:/amounts', gt: { number: 5 } }]), [id('s02'), id('s07')]);
    assert.deepEqual(await oids([{ field: 'metadata:/amounts', lt: { number: -1 } }]), [id('s01')]);
  });
  it('normalizes date-time and calendar elements strictly, ignoring invalid, numeric and nested values', async () => {
    const dates = 'metadata:/dates';
    assert.deepEqual(
      await oids([
        {
          field: dates,
          between: { from: { dateTime: '2026-02-15T00:00:00Z' }, to: { dateTime: '2026-03-15T00:00:00Z' } },
        },
      ]),
      [id('s01')]
    );
    assert.deepEqual(await oids([{ field: dates, gt: { dateTime: '2026-05-31T00:00:00Z' } }]), [id('s02')]);
    assert.deepEqual(await oids([{ field: dates, eq: { dateTime: '2026-01-10T10:00:00+10:00' } }]), [id('s01')]);
    assert.deepEqual(await oids([{ field: 'metadata:/days', eq: { dateTime: '2026-02-01T00:00:00Z' } }]), [
      id('s01'),
      id('s07'),
    ]);
  });
  it('uses exact declared keys for lists inside objects and dotted names', async () => {
    assert.deepEqual(await oids([{ field: 'metadata:/details/codes', eq: { text: 'x1' } }]), [id('s01')]);
    assert.deepEqual(await oids([{ field: 'metadata:/details/codes', exists: false }]), [
      id('s02'),
      id('s03'),
      id('s04'),
      id('s05'),
      id('s06'),
      id('s07'),
      id('s10'),
      id('s11'),
    ]);
    assert.deepEqual(await oids([{ field: 'metadata:/literal.list', eq: { text: 'dot' } }]), [id('s01')]);
    assert.deepEqual(await oids([{ field: 'metadata:/literal.list', eq: { text: 'trap' } }]), []);
  });
  it('excludes ACL-denied and out-of-scope records before list predicates and sorting', async () => {
    for (const filter of [
      { field: 'metadata:/tags', eq: { text: 'alpha' } },
      { field: 'metadata:/scores', eq: { number: 1 } },
    ]) {
      const all = await provider().executeRecordCollection(
        request({ filters: [filter] as never, sort: [{ field: 'metadata:/tags', direction: 'ASC' }] })
      );
      const found = all.candidates.map(candidate => candidate.oid);
      assert.ok(!found.includes(id('s08')) && !found.includes(id('s09')), JSON.stringify(found));
    }
  });
  for (const direction of ['ASC', 'DESC'] as const)
    it(`sorts ${direction} by the ${direction === 'ASC' ? 'minimum' : 'maximum'} valid element with null and OID ties`, async () => {
      const rows = await walkPages({ filters: [scope] as never, sort: [{ field: 'metadata:/scores', direction }] });
      const order = rows.map(row => row.oid);
      const keyed = [
        // [oid, min, max] from valid elements only.
        ['s01', 1, 9],
        ['s02', 3, 3],
        ['s03', null, null],
        ['s04', null, null],
        ['s05', null, null],
        ['s06', null, null],
        ['s07', 6, 6],
        ['s10', 2, 8],
        ['s11', 5, 5],
      ] as const;
      const expected = [...keyed]
        .map(([key, min, max]) => ({ oid: id(key), key: direction === 'ASC' ? min : max }))
        .sort((a, b) => {
          if (a.key !== b.key) {
            if (a.key === null) return direction === 'ASC' ? -1 : 1;
            if (b.key === null) return direction === 'ASC' ? 1 : -1;
            return direction === 'ASC' ? a.key - b.key : b.key - a.key;
          }
          return a.oid < b.oid ? -1 : 1;
        });
      assert.deepEqual(
        order,
        expected.map(row => row.oid)
      );
      assert.deepEqual(
        rows.map(row => row.keys[0]),
        expected.map(row => row.key)
      );
      // Sorting is independent of which element a filter matched.
      const filtered = await provider().executeRecordCollection(
        request({
          filters: [scope, { field: 'metadata:/scores', eq: { number: 2 } }] as never,
          sort: [{ field: 'metadata:/scores', direction }],
        })
      );
      assert.deepEqual(filtered.candidates[0].keys, [direction === 'ASC' ? 2 : 8, id('s10')]);
    });
  it('continues exact multi-page list and compound keysets, including null groups and OID ties', async () => {
    const tie = `tie-${suffix}`;
    const docs = Array.from({ length: 173 }, (_, index) => {
      const oid = `${tie}-${String(index).padStart(4, '0')}`;
      const pick = index % 7;
      const value =
        pick === 0
          ? undefined
          : pick === 1
            ? []
            : pick === 2
              ? ['x', 7]
              : [`k${index % 5}`, `k${(index * 3) % 5}`, ...(index % 2 ? [null] : [])];
      return base(oid, {
        ...(value === undefined ? {} : { tags: value }),
        scores: index % 4 === 0 ? [] : [index % 3, 10 + (index % 3)],
        amount: index % 5 === 0 ? null : index % 4,
      });
    });
    await collection.insertMany(docs);
    for (const direction of ['ASC', 'DESC'] as const) {
      const all = await walkPages({ sort: [{ field: 'metadata:/tags', direction }] });
      const mine = all.filter(row => row.oid.startsWith(tie));
      const expected = docs
        .map(doc => {
          const values = (Array.isArray(doc.metadata.tags) ? doc.metadata.tags : []).filter(
            (value: unknown): value is string => typeof value === 'string'
          );
          const key = values.length ? [...values].sort()[direction === 'ASC' ? 0 : values.length - 1] : null;
          return { oid: doc.redboxOid, key };
        })
        .sort((a, b) => {
          if (a.key !== b.key) {
            if (a.key === null) return direction === 'ASC' ? -1 : 1;
            if (b.key === null) return direction === 'ASC' ? 1 : -1;
            return (a.key < b.key ? -1 : 1) * (direction === 'ASC' ? 1 : -1);
          }
          return a.oid < b.oid ? -1 : 1;
        });
      assert.deepEqual(
        mine.map(row => row.oid),
        expected.map(row => row.oid),
        direction
      );
      assert.equal(new Set(all.map(row => row.oid)).size, all.length, 'no duplicates across pages');
      assert.ok(all.length > 50 * 3, 'multiple storage pages were walked');
      // The global order is monotonic in the projected key, then OID.
      for (let index = 1; index < all.length; index++) {
        const [left, right] = [all[index - 1], all[index]];
        const a = left.keys[0] as string | null;
        const b = right.keys[0] as string | null;
        if (a === b) assert.ok(left.oid < right.oid, JSON.stringify([left, right]));
        else if (direction === 'ASC') assert.ok(a === null || (b !== null && a < b), JSON.stringify([left, right]));
        else assert.ok(b === null || (a !== null && a > b), JSON.stringify([left, right]));
      }
    }
    for (const sort of [
      [
        { field: 'metadata:/tags', direction: 'ASC' },
        { field: 'metadata:/scores', direction: 'DESC' },
      ],
      [
        { field: 'metadata:/scores', direction: 'DESC' },
        { field: 'metadata:/amount', direction: 'ASC' },
      ],
    ] as const) {
      const compare = (a: { keys: unknown[] }, b: { keys: unknown[] }): number => {
        for (let index = 0; index < a.keys.length; index++) {
          const left = a.keys[index] as string | number | null;
          const right = b.keys[index] as string | number | null;
          if (left === right) continue;
          const order = left === null ? -1 : right === null ? 1 : left < right ? -1 : 1;
          return order * (sort[index]?.direction === 'DESC' ? -1 : 1);
        }
        return 0;
      };
      const expected = docs
        .map((doc, index) => {
          const tags = (doc.metadata.tags ?? []).filter((value): value is string => typeof value === 'string');
          const minimumTag = tags.length ? [...tags].sort()[0] : null;
          const maximumScore = index % 4 === 0 ? null : 10 + (index % 3);
          return {
            oid: doc.redboxOid,
            keys:
              sort[0].field === 'metadata:/tags'
                ? [minimumTag, maximumScore, doc.redboxOid]
                : [maximumScore, doc.metadata.amount, doc.redboxOid],
          };
        })
        .sort(compare);
      const all = await walkPages({ sort: [...sort] });
      const mine = all.filter(row => row.oid.startsWith(tie));
      assert.deepEqual(mine, expected, JSON.stringify(sort));
      assert.ok(all.length > 50 * 3, 'compound ordering crosses multiple page boundaries');
      assert.equal(new Set(all.map(row => row.oid)).size, all.length, 'no compound-page duplicates');
      for (let index = 1; index < all.length; index++)
        assert.ok(compare(all[index - 1], all[index]) < 0, JSON.stringify([all[index - 1], all[index]]));
      // Resume explicitly inside both missing-key groups and valid compound ties,
      // even when the regular page boundary does not fall on that exact group.
      for (const row of [
        mine.find(row => row.keys[0] === null)!,
        mine.find(row => row.keys[0] !== null && row.keys[1] === null)!,
        mine.find(
          (row, index) =>
            index > 0 && row.keys[0] === mine[index - 1].keys[0] && row.keys[1] === mine[index - 1].keys[1]
        )!,
      ]) {
        const resumed = await provider().executeRecordCollection(request({ sort: [...sort] }, { keys: row.keys }));
        const next = all.findIndex(candidate => candidate.oid === row.oid) + 1;
        assert.deepEqual(resumed.candidates, all.slice(next, next + 50));
      }
    }
    await collection.deleteMany({ redboxOid: { $regex: `^${tie}` } });
  });
  it('processes large stored lists without truncation within the bounded page and deadline', async () => {
    const big = `big-${suffix}`;
    const records = 200;
    const elements = 5_000;
    await collection.insertMany(
      Array.from({ length: records }, (_, index) =>
        base(`${big}-${String(index).padStart(4, '0')}`, {
          // The only matching and maximal element is last, so truncation would change results.
          scores: [...Array.from({ length: elements - 1 }, (_, n) => (n % 1000) + 1), index === 137 ? 1_000_000 : 0],
          tags: [...Array.from({ length: elements - 1 }, (_, n) => `v${n % 100}`), index === 42 ? 'needle' : 'hay'],
        })
      )
    );
    const huge = `${big}-huge`;
    await collection.insertOne(
      base(huge, { tags: [...Array.from({ length: 100_000 }, (_, n) => `h${n}`), 'needle-tail'] })
    );
    try {
      const timings: Record<string, number> = {};
      const time = async <T>(label: string, run: () => Promise<T>) => {
        const start = Date.now();
        const result = await run();
        timings[label] = Date.now() - start;
        return result;
      };
      const needle = await time('eq-last-element', () =>
        provider().executeRecordCollection(request({ filters: [{ field: 'metadata:/tags', eq: { text: 'needle' } }] }))
      );
      assert.deepEqual(
        needle.candidates.map(row => row.oid),
        [`${big}-0042`]
      );
      const tail = await time('eq-after-100k-elements', () =>
        provider().executeRecordCollection(
          request({ filters: [{ field: 'metadata:/tags', eq: { text: 'needle-tail' } }] })
        )
      );
      assert.deepEqual(
        tail.candidates.map(row => row.oid),
        [huge]
      );
      const top = await time('desc-max-sort', () =>
        provider().executeRecordCollection(
          request({
            filters: [{ field: 'metadata:/scores', gt: { number: 999 } }],
            sort: [{ field: 'metadata:/scores', direction: 'DESC' }],
          })
        )
      );
      assert.deepEqual(top.candidates[0], { oid: `${big}-0137`, keys: [1_000_000, `${big}-0137`] });
      assert.equal(top.candidates.length, 50);
      const explain = await collection
        .aggregate(
          compileCollectionPipeline(
            request({
              filters: [{ field: 'metadata:/scores', gt: { number: 999 } }],
              sort: [{ field: 'metadata:/scores', direction: 'DESC' }],
            })
          ),
          { collation: { locale: 'simple' }, allowDiskUse: false }
        )
        .explain('executionStats');
      const text = JSON.stringify(explain);
      assert.ok(!text.includes('$unwind'), 'no unwind');
      assert.ok(!/"usedDisk":\s*true/.test(text), 'no disk spill');
      console.log(
        'SCALAR_LIST_LARGE',
        JSON.stringify({ records, elements, hugeElements: 100_001, timings, storageTimeoutMs: 5000 })
      );
    } finally {
      await collection.deleteMany({ redboxOid: { $regex: `^${big}` } });
    }
  });
});
