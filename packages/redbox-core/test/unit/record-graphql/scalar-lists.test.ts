import assert from 'node:assert/strict';
import { GraphQLError } from 'graphql';
import type { Document } from 'mongodb';
import type { ContractNode, RecordContract } from '../../../src/record-contract';
import { recordContractPointer } from '../../../src/record-contract';
import { buildCatalogue } from '../../../src/record-graphql/catalogue';
import { queryPlan } from '../../../src/record-graphql/collection';
import { compileCollectionPipeline } from '../../../src/record-graphql/mongo';
import type { GridQuery, GridStorageRequest } from '../../../src/record-graphql/grid-types';
import { gridCaller, gridContracts, gridHarness, object } from '../../fixtures/record-grid.fixtures';

type ScalarNode = Extract<ContractNode, { kind: 'scalar' }>;
const scalar = (scalarType: 'string' | 'number' | 'integer' | 'boolean', extensions?: object): ScalarNode => ({
  kind: 'scalar',
  scalarType,
  nullable: true,
  ...(extensions ? { annotations: { extensions: extensions as never } } : {}),
});
const list = (items: ContractNode, annotations?: ContractNode['annotations']): ContractNode => ({
  kind: 'array',
  nullable: true,
  items,
  ...(annotations ? { annotations } : {}),
});
const dateTime = scalar('string', { 'x-redbox-format': 'date-time' });
const calendar = scalar('string', { 'x-redbox-format': 'date' });
/** Each variant's root properties; the draft and published variants are otherwise identical. */
function contracts(draft: Record<string, ContractNode>, published = draft): RecordContract[] {
  return gridContracts().map(contract => ({
    ...contract,
    root: object(contract.context.workflowStep === 'draft' ? draft : published),
  }));
}
function field(input: RecordContract[], id: string, stages: string[] = []) {
  const snapshot = buildCatalogue(input, 'grid-fixture', stages);
  return { field: snapshot.catalogue.fields.find(item => item.id === id), snapshot };
}
const code = (expected: string) => (error: unknown) =>
  error instanceof GraphQLError && error.extensions.code === expected;
function walk(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value)) visit(value as Record<string, unknown>);
  for (const child of Object.values(value)) walk(child, visit);
}
function operators(pipeline: Document[]): Set<string> {
  const found = new Set<string>();
  walk(pipeline, node => Object.keys(node).forEach(key => key.startsWith('$') && found.add(key)));
  return found;
}

describe('Declared scalar-list discovery', () => {
  it('reports LIST cardinality and element capabilities for root lists and lists inside plain objects', () => {
    const input = contracts({
      keywords: list(scalar('string')),
      scores: list(scalar('integer')),
      flags: list(scalar('boolean')),
      details: object({ codes: list(scalar('number')), note: scalar('string') }),
    });
    const { snapshot } = field(input, 'metadata:/keywords');
    const fields = new Map(snapshot.catalogue.fields.map(item => [item.id, item]));
    for (const [id, type, ops] of [
      ['metadata:/keywords', 'STRING', ['EQ', 'CONTAINS', 'IPREFIX', 'IN', 'EXISTS']],
      ['metadata:/scores', 'INTEGER', ['EQ', 'IN', 'GT', 'LT', 'BETWEEN', 'EXISTS']],
      ['metadata:/flags', 'BOOLEAN', ['EQ', 'IN', 'EXISTS']],
      ['metadata:/details/codes', 'NUMBER', ['EQ', 'IN', 'GT', 'LT', 'BETWEEN', 'EXISTS']],
    ] as const) {
      const item = fields.get(id)!;
      assert.equal(item.cardinality, 'LIST', id);
      assert.equal(item.repeating, true, id);
      assert.equal(item.scalarType, type, id);
      assert.equal(item.filterable, true, id);
      assert.equal(item.sortable, true, id);
      assert.equal(item.selectable, true, id);
      assert.equal(item.unavailableReason, null, id);
      assert.deepEqual(item.operators, ops, id);
      assert.deepEqual(snapshot.bindings.get(id)?.cardinality, 'LIST', id);
    }
    assert.deepEqual(snapshot.bindings.get('metadata:/details/codes')?.tokens, ['metadata', 'details', 'codes']);
    assert.equal(fields.get('metadata:/details/note')?.cardinality, 'SCALAR');
    assert.equal(fields.get('record:oid')?.cardinality, 'SCALAR');
    // Element entries remain unavailable, as before.
    const element = fields.get('metadata-list:["keywords",null]')!;
    assert.equal(element.filterable, false);
    assert.equal(element.sortable, false);
  });

  it('propagates item date formats and keeps date/date-time differences across variants incompatible', () => {
    for (const item of [dateTime, calendar]) {
      const { field: dates } = field(contracts({ dates: list(item) }), 'metadata:/dates');
      assert.equal(dates?.scalarType, 'DATETIME');
      assert.equal(dates?.filterable, true);
      assert.deepEqual(dates?.operators, ['EQ', 'IN', 'GT', 'LT', 'BETWEEN', 'EXISTS']);
    }
    for (const [left, right] of [
      [dateTime, calendar],
      [calendar, dateTime],
      [dateTime, scalar('string')],
      [scalar('string'), calendar],
    ]) {
      const input = contracts({ dates: list(left) }, { dates: list(right) });
      const { field: mixed, snapshot } = field(input, 'metadata:/dates');
      assert.equal(mixed?.scalarType, 'MIXED');
      assert.equal(mixed?.filterable, false);
      assert.equal(mixed?.sortable, false);
      assert.equal(snapshot.bindings.has('metadata:/dates'), false);
      assert.throws(
        () =>
          queryPlan({ recordType: 'grid-fixture', filters: [{ field: 'metadata:/dates', exists: true }] }, snapshot),
        code('UNSUPPORTED_FILTER')
      );
      const { field: narrowed } = field(input, 'metadata:/dates', ['draft']);
      assert.equal(narrowed?.scalarType, left === dateTime || left === calendar ? 'DATETIME' : 'STRING');
      assert.equal(narrowed?.filterable, true);
    }
    // Item format conflicts merged by the read compiler are not date lists.
    const conflict = field(
      contracts({ dates: list(scalar('string', { 'x-redbox-format-conflict': true })) }),
      'metadata:/dates'
    ).field;
    assert.equal(conflict?.scalarType, 'MIXED');
    assert.equal(conflict?.filterable, false);
  });

  it('rejects list/scalar and element-type differences between variants', () => {
    for (const [left, right] of [
      [list(scalar('string')), scalar('string')],
      [scalar('string'), list(scalar('string'))],
      [list(scalar('string')), list(scalar('number'))],
      [list(scalar('integer')), list(scalar('number'))],
    ]) {
      const { field: mixed, snapshot } = field(contracts({ tags: left }, { tags: right }), 'metadata:/tags');
      assert.equal(mixed?.scalarType, 'MIXED', JSON.stringify([left, right]));
      assert.equal(mixed?.filterable, false);
      assert.equal(mixed?.sortable, false);
      assert.equal(snapshot.bindings.has('metadata:/tags'), false);
    }
    const partial = field(contracts({ tags: list(scalar('string')) }, {}), 'metadata:/tags').field;
    assert.equal(partial?.availableInAllVariants, false);
    assert.equal(partial?.unavailableReason, 'VARIANT_SCOPE_REQUIRED');
    assert.equal(partial?.filterable, false);
  });

  it('carries list and item choices and vocabulary hints to the list field', () => {
    const input = contracts({
      colours: list(
        { ...scalar('string'), enum: ['red', 'blue'] },
        {
          extensions: {
            'x-redbox-choice-labels': [
              { label: 'Red', value: 'red' },
              { label: 'Blue', value: 'blue' },
            ],
            'x-redbox-vocabulary': 'colour-vocabulary',
          },
        }
      ),
    });
    const colours = field(input, 'metadata:/colours').field!;
    assert.deepEqual(colours.choices, [
      { label: 'Red', value: 'red' },
      { label: 'Blue', value: 'blue' },
    ]);
    assert.equal(colours.vocabulary, 'colour-vocabulary');
    const itemOnly = field(
      contracts({ colours: list({ ...scalar('string'), enum: ['green'] }) }),
      'metadata:/colours'
    ).field!;
    assert.deepEqual(itemOnly.choices, [{ label: 'green', value: 'green' }]);
  });

  it('excludes nested arrays, object lists, their children and private lists or items', () => {
    const privateItem: ContractNode = {
      ...scalar('string'),
      enum: ['private-choice'],
      annotations: { writeOnly: true },
    };
    const input = contracts({
      matrix: list(list(scalar('string'))),
      people: list(object({ name: scalar('string'), tags: list(scalar('string')) })),
      hiddenList: { ...list(scalar('string')), annotations: { writeOnly: true } },
      hiddenItems: list(privateItem),
      conditional: {
        kind: 'conditional',
        nullable: true,
        condition: { kind: 'exists', pointer: recordContractPointer('/switch') },
        thenNode: list(scalar('string')),
        elseNode: list(privateItem),
      },
    });
    const { snapshot } = field(input, 'metadata:/matrix');
    const fields = new Map(snapshot.catalogue.fields.map(item => [item.id, item]));
    for (const id of [
      'metadata:/matrix',
      'metadata-list:["matrix",null]',
      'metadata:/people',
      'metadata-list:["people",null,"name"]',
      'metadata-list:["people",null,"tags"]',
      'metadata:/hiddenItems',
      'metadata:/conditional',
    ]) {
      const item = fields.get(id);
      if (!item) continue;
      assert.equal(item.filterable, false, id);
      assert.equal(item.sortable, false, id);
      assert.equal(snapshot.bindings.has(id), false, id);
    }
    assert.ok(fields.has('metadata:/people'));
    assert.equal(fields.get('metadata:/people')?.unavailableReason, 'REPEATING_FIELD');
    assert.equal(fields.has('metadata:/hiddenList'), false);
    assert.ok(
      !snapshot.catalogue.fields.some(item => item.choices.some(choice => choice.value === 'private-choice')),
      'private item choices are not exposed'
    );
  });

  it('changes the catalogue revision when a field changes between scalar and list declarations', () => {
    const scalarRevision = field(contracts({ tags: scalar('string') }), 'metadata:/tags').snapshot.catalogue.revision;
    const listRevision = field(contracts({ tags: list(scalar('string')) }), 'metadata:/tags').snapshot.catalogue
      .revision;
    assert.notEqual(scalarRevision, listRevision);
  });

  it('exposes cardinality through GraphQL discovery and accepts list filters and sorts', async () => {
    const harness = gridHarness(
      ['a', 'b'],
      contracts({ title: scalar('string'), tags: list(scalar('string')), dates: list(dateTime) })
    );
    const discovery = await harness.query(
      `{ recordFields(recordType: "grid-fixture") { fields { id cardinality repeating filterable sortable } } }`
    );
    assert.equal(discovery.body.errors, undefined);
    const fields = discovery.body.data!.recordFields!.fields;
    assert.deepEqual(
      fields.find(item => item.id === 'metadata:/tags'),
      { id: 'metadata:/tags', cardinality: 'LIST', repeating: true, filterable: true, sortable: true }
    );
    assert.equal(fields.find(item => item.id === 'metadata:/title')?.cardinality, 'SCALAR');
    const page = await harness.query(
      `query($filters: [RecordFilterInput!], $sort: [RecordSortInput!]) {
        records(recordType: "grid-fixture", filters: $filters, sort: $sort) { nodes { oid } hasNextPage }
      }`,
      {
        filters: [
          { field: 'metadata:/tags', eq: { text: 'alpha' } },
          {
            field: 'metadata:/dates',
            between: { from: { dateTime: '2026-01-01T00:00:00Z' }, to: { dateTime: '2026-12-31T00:00:00Z' } },
          },
        ],
        sort: [{ field: 'metadata:/tags', direction: 'DESC' }],
      }
    );
    assert.equal(page.body.errors, undefined, JSON.stringify(page.body.errors));
    assert.deepEqual(harness.calls.at(-1)?.query.sort, [{ field: 'metadata:/tags', direction: 'DESC' }]);
  });
});

describe('Mongo scalar-list pipeline compilation', () => {
  const input = contracts({
    title: scalar('string'),
    tags: list(scalar('string')),
    scores: list(scalar('integer')),
    details: object({ 'dotted.codes': list(scalar('number')) }),
  });
  const request = (query: Omit<GridQuery, 'recordType'>, after?: GridStorageRequest['after']): GridStorageRequest => ({
    caller: gridCaller,
    contracts: input,
    query: { recordType: 'grid-fixture', ...query },
    after,
    deadline: Date.now() + 5000,
  });

  it('normalizes list elements without unwinding, flattening or truncating stored arrays', () => {
    const pipeline = compileCollectionPipeline(
      request({
        filters: [{ field: 'metadata:/details/dotted.codes', between: { from: { number: 1 }, to: { number: 2 } } }],
      })
    );
    const used = operators(pipeline);
    for (const forbidden of ['$unwind', '$slice', '$reduce', '$concatArrays', '$out', '$merge', '$lookup'])
      assert.equal(used.has(forbidden), false, forbidden);
    const project = pipeline.find(stage => '$project' in stage && 'oid' in stage.$project && 'l0' in stage.$project)!;
    const text = JSON.stringify(project.$project.l0);
    // Exact key traversal: the dotted name is one $getField literal.
    assert.ok(text.includes('{"$literal":"dotted.codes"}'), text);
    assert.ok(!text.includes('$metadata.details'), text);
    assert.ok(text.includes('"$isArray":"$$list"'), text);
    assert.ok(text.includes('"$filter"') && text.includes('"$map"'), text);
    const match = pipeline.find(stage => '$match' in stage && '$expr' in stage.$match)!;
    const filter = match.$match.$expr.$and[0];
    // BETWEEN evaluates both bounds against the same element.
    assert.deepEqual(filter, {
      $anyElementTrue: [
        {
          $map: {
            input: '$l0',
            as: 'element',
            in: { $and: [{ $gte: ['$$element', { $literal: 1 }] }, { $lte: ['$$element', { $literal: 2 }] }] },
          },
        },
      ],
    });
  });

  it('compiles any-element EQ/IN/text predicates and EXISTS as at least one valid element', () => {
    const filters = [
      { field: 'metadata:/tags', eq: { text: 'a' } },
      { field: 'metadata:/tags', in: [{ text: 'b' }, { text: 'c' }] },
      { field: 'metadata:/tags', contains: 'd' },
      { field: 'metadata:/tags', iprefix: 'e' },
      { field: 'metadata:/tags', exists: true },
      { field: 'metadata:/scores', exists: false },
      { field: 'metadata:/scores', gt: { number: 3 } },
    ];
    const pipeline = compileCollectionPipeline(request({ filters }));
    const clauses = pipeline.find(stage => '$match' in stage && '$expr' in stage.$match)!.$match.$expr.$and;
    assert.equal(clauses.length, filters.length);
    for (const clause of clauses.slice(0, 4)) assert.ok('$anyElementTrue' in clause, JSON.stringify(clause));
    assert.deepEqual(clauses[4], { $gt: [{ $size: '$l0' }, 0] });
    assert.deepEqual(clauses[5], { $eq: [{ $size: '$l1' }, 0] });
    assert.ok('$anyElementTrue' in clauses[6]);
    // Separate filters on the same list are independent element predicates.
    assert.equal(
      clauses.slice(0, 5).every((clause: Document) => JSON.stringify(clause).includes('$l0')),
      true
    );
  });

  for (const [direction, accumulator] of [
    ['ASC', '$min'],
    ['DESC', '$max'],
  ] as const)
    it(`sorts ${direction} by the ${accumulator} valid element and drops working arrays before sorting`, () => {
      const pipeline = compileCollectionPipeline(
        request({
          filters: [{ field: 'metadata:/tags', eq: { text: 'x' } }],
          sort: [{ field: 'metadata:/tags', direction }],
        })
      );
      const addFields = pipeline.findIndex(stage => '$addFields' in stage);
      const drop = pipeline.findIndex(stage => '$project' in stage && stage.$project.l0 === 0);
      const sort = pipeline.findIndex(stage => '$sort' in stage);
      const match = pipeline.findIndex(stage => '$match' in stage && '$expr' in stage.$match);
      assert.deepEqual(pipeline[addFields], { $addFields: { v0: { [accumulator]: '$l0' } } });
      assert.ok(addFields < match && match < drop && drop < sort, JSON.stringify(pipeline.map(Object.keys)));
      assert.deepEqual(pipeline[sort], { $sort: { v0: direction === 'ASC' ? 1 : -1, v1: 1 } });
      // The sort key is computed over all valid elements, not only the filtered one.
      assert.equal(JSON.stringify(pipeline[addFields]).includes('$$element'), false);
      const output = pipeline.at(-1)!.$project;
      assert.ok(JSON.stringify(output.keys).includes('$v0'));
    });

  it('validates list continuation keys as the exact scalar key type, allowing missing values as null', () => {
    const query = { sort: [{ field: 'metadata:/scores', direction: 'ASC' as const }] };
    for (const keys of [
      [3, 'oid-1'],
      [null, 'oid-1'],
    ])
      assert.doesNotThrow(() => compileCollectionPipeline(request(query, { keys })));
    for (const keys of [['3', 'oid-1'], [1.5, 'oid-1'], [[3], 'oid-1'], [3]])
      assert.throws(() => compileCollectionPipeline(request(query, { keys: keys as never })), code('INVALID_CURSOR'));
    const pipeline = compileCollectionPipeline(request(query, { keys: [3, 'oid-1'] }));
    const keyset = pipeline.find(stage => '$match' in stage && '$expr' in stage.$match)!.$match.$expr.$and.at(-1);
    assert.deepEqual(keyset, {
      $or: [
        { $and: [{ $gt: ['$v0', { $literal: 3 }] }] },
        { $and: [{ $eq: ['$v0', { $literal: 3 }] }, { $gt: ['$v1', { $literal: 'oid-1' }] }] },
      ],
    });
  });

  it('retains ACL-first, form/stage scoping for list predicates', () => {
    const pipeline = compileCollectionPipeline(request({ filters: [{ field: 'metadata:/tags', exists: true }] }));
    const scope = pipeline[0].$match.$and;
    assert.ok('$expr' in scope[0] && '$or' in scope[0].$expr, 'ACL is the first scope clause');
    assert.ok(
      scope.some(
        (clause: Document) => '$or' in clause && clause.$or.some((item: Document) => 'metaMetadata.form' in item)
      )
    );
  });
});
