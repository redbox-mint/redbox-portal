import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import sinon from 'sinon';
import { createRecordYoga } from '../../../src/record-graphql/schema';
import { metadataTypeName } from '../../../src/record-graphql/renderer';
import { GRID_LIMITS } from '../../../src/record-graphql/grid-types';
import { buildCatalogue } from '../../../src/record-graphql/catalogue';
import { queryPlan } from '../../../src/record-graphql/collection';
import { gridHarness, gridCaller, gridEnvironment, gridContracts, object } from '../../fixtures/record-grid.fixtures';

const pageQuery = `query($after: String, $first: Int = 2, $stages: [String!]) { records(recordType: "grid-fixture", workflowStages: $stages, first: $first, after: $after) { nodes { oid workflowStep } hasNextPage endCursor } }`;

describe('Record grid catalogue and pagination', () => {
  it('reports only verified capabilities, stable IDs, labels, choices and workflow availability', () => {
    const env = gridEnvironment();
    const { catalogue } = buildCatalogue(gridContracts(), 'grid-fixture', [], env);
    const fields = new Map(catalogue.fields.map(field => [field.id, field]));
    assert.equal(fields.get('metadata:/title')?.label, 'Record title');
    assert.equal(fields.get('metadata:/title')?.sortable, true);
    assert.deepEqual(fields.get('metadata:/title')?.operators, ['EQ', 'CONTAINS', 'IPREFIX', 'IN', 'EXISTS']);
    assert.deepEqual(
      fields.get('metadata:/title')?.choices.map(choice => choice.value),
      ['first', 'second']
    );
    assert.equal(fields.get('metadata:/eventDate')?.scalarType, 'DATETIME');
    assert.deepEqual(fields.get('metadata:/details/note')?.operators, ['EQ', 'CONTAINS', 'IPREFIX', 'IN', 'EXISTS']);
    assert.equal(fields.get('metadata:/details/note')?.sortable, true);
    assert.equal(fields.get('metadata:/publication_note')?.availableInAllVariants, false);
    assert.equal(fields.get('metadata:/title')?.availableInAllVariants, true);
    assert.equal(fields.get('metadata:/secret'), undefined);
    assert.equal(fields.get('metadata:/undeclared'), undefined);
    assert.equal(fields.get('metadata:/people')?.repeating, true);
    assert.equal(fields.get('metadata:/people')?.unavailableReason, 'REPEATING_FIELD');
    assert.ok(
      catalogue.fields.some(field => field.repeating && !field.selectable && !field.filterable && !field.sortable)
    );
  });
  it('adds short labels, form hierarchy, repeating-child hints and friendly type labels without changing capabilities', async () => {
    const contracts = gridContracts().map(contract => ({
      ...contract,
      root: {
        ...contract.root,
        properties: {
          ...contract.root.properties,
          title: {
            ...contract.root.properties.title,
            annotations: {
              extensions: {
                'x-redbox-label': 'What is the complete title of this research project?',
                'x-redbox-short-label': 'Title',
                'x-redbox-group-path': ['@project-tab', 'Project details'],
              },
            },
          },
          people: {
            ...contract.root.properties.people,
            annotations: { extensions: { 'x-redbox-label': 'People', 'x-redbox-group-path': ['Project'] } },
          },
          amount: {
            ...contract.root.properties.amount,
            annotations: { extensions: { 'x-redbox-label': 'How much will the project cost?' } },
          },
        },
      },
    }));
    const env = { ...gridEnvironment(), recordTypeLabel: '@friendly-plan' };
    const { catalogue } = buildCatalogue(contracts, 'grid-fixture', [], env);
    const title = catalogue.fields.find(field => field.id === 'metadata:/title')!;
    assert.equal(title.label, 'What is the complete title of this research project?');
    assert.equal(title.displayLabel, 'Title');
    assert.equal(title.group, 'Project details');
    assert.deepEqual(title.groupPath, ['@project-tab', 'Project details']);
    assert.equal(catalogue.fields.find(field => field.id === 'metadata:/amount')!.displayLabel, 'Amount');
    assert.equal(
      catalogue.fields.find(field => field.id === 'metadata:/active')!.groupKey,
      '@data-grids-field-group-metadata'
    );
    const repeated = catalogue.fields.find(field => field.path === '/people/*/name')!;
    assert.equal(repeated.repeatingSubfield, true);
    assert.equal(repeated.repeatingGroupId, 'metadata:/people');
    assert.deepEqual(repeated.groupPath, ['Project', 'People']);
    assert.equal(repeated.selectable, false);
    assert.equal(catalogue.fields.find(field => field.id === 'metadata:/people')!.repeatingSubfield, false);
    assert.equal(catalogue.fields.find(field => field.id === 'record:oid')!.groupKey, '@data-grids-field-group-record');
    assert.equal(catalogue.recordTypeLabelKey, '@friendly-plan');
    assert.equal(
      catalogue.fields.some(field => field.id.includes('secret')),
      false
    );
    const h = gridHarness();
    const response = await h.query(
      '{recordFields(recordType:"grid-fixture"){recordTypeLabel recordTypeLabelKey fields{id displayLabel displayLabelKey group groupKey groupPath repeatingSubfield repeatingGroupId}}}'
    );
    assert.equal(response.body.errors, undefined);
  });
  it('derives sentence-case property labels and preserves configured choices and workflow labels', () => {
    const contracts = gridContracts().map(contract => ({
      ...contract,
      root: {
        ...contract.root,
        properties: {
          ...contract.root.properties,
          'uon:declarationDate': {
            kind: 'scalar' as const,
            scalarType: 'string' as const,
            nullable: true,
            annotations: { extensions: { 'x-redbox-label': 'uon:declarationDate' } },
          },
          'dmpt-data_collection_description': {
            kind: 'scalar' as const,
            scalarType: 'string' as const,
            nullable: true,
            annotations: { extensions: { 'x-redbox-label': '@dmpt-data_collection_description' } },
          },
          title: {
            ...contract.root.properties.title,
            annotations: { extensions: { 'x-redbox-choice-labels': [{ value: 'first', label: 'First plan' }] } },
          },
        },
      },
    }));
    const fields = buildCatalogue(contracts, 'grid-fixture', [], {
      ...gridEnvironment(),
      workflowLabels: [{ value: 'draft', label: 'Draft' }],
    }).catalogue.fields;
    assert.equal(fields.find(f => f.id === 'metadata:/uon:declarationDate')!.displayLabel, 'Declaration date');
    assert.equal(
      fields.find(f => f.id === 'metadata:/dmpt-data_collection_description')!.displayLabel,
      'Data collection description'
    );
    assert.equal(fields.find(f => f.id === 'metadata:/title')!.displayLabel, 'Title');
    assert.deepEqual(
      fields.find(f => f.id === 'metadata:/title')!.choices.find(c => c.value === 'first'),
      { value: 'first', label: 'First plan' }
    );
    assert.deepEqual(fields.find(f => f.id === 'record:workflowStep')!.choices, [{ value: 'draft', label: 'Draft' }]);
  });
  it('resolves only readable, requested vocabulary references within the caller brand', async () => {
    const contracts = gridContracts().map(contract => ({
      ...contract,
      root: {
        ...contract.root,
        properties: {
          ...contract.root.properties,
          title: {
            ...contract.root.properties.title,
            annotations: { extensions: { 'x-redbox-vocabulary': 'retention' } },
          },
          secret: {
            ...contract.root.properties.secret,
            annotations: { writeOnly: true, extensions: { 'x-redbox-vocabulary': 'secret' } },
          },
        },
      },
    }));
    const getChoiceLabels = sinon.stub().resolves([{ value: 'first', label: 'First plan' }]);
    const { yoga } = createRecordYoga(
      contracts,
      { getRecord: async () => undefined, hasViewAccess: () => false },
      { getGridEnvironment: async () => gridEnvironment(), getChoiceLabels }
    );
    const response = await yoga.fetch(
      'http://redbox/graphql',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: '{recordFields(recordType:"grid-fixture",ids:["metadata:/title"]){fields{id choices{label value}}}}',
        }),
      },
      { caller: gridCaller }
    );
    const result = await response.json();
    assert.equal(result.errors, undefined);
    assert.deepEqual(result.data.recordFields.fields[0].choices, [{ value: 'first', label: 'First plan' }]);
    assert.equal(getChoiceLabels.callCount, 1);
    assert.equal(getChoiceLabels.firstCall.args[0].brand.id, gridCaller.brand.id);
    assert.equal(getChoiceLabels.firstCall.args[1], 'retention');
  });
  it('projects declared repeated groups with pairing and nulls, and rejects repeated scalar operations', async () => {
    const h = gridHarness(['a', 'b', 'c']);
    h.records.get('a')!.metadata.people = [{ name: 'One' }, { name: null }];
    h.records.get('b')!.metadata.people = [];
    const field = buildCatalogue(gridContracts(), 'grid-fixture', [], h.environment).catalogue.fields.find(
      field => field.id === 'metadata:/people'
    )!;
    assert.equal(field.selectable, true);
    assert.equal(field.filterable, false);
    assert.equal(field.sortable, false);
    const result = await h.query(
      `{records(recordType:"grid-fixture",first:2){nodes{oid metadata{__typename ${field.selections.map(s => s.selection).join(' ')}}} hasNextPage endCursor}}`
    );
    assert.equal(result.body.errors, undefined);
    const rows = result.body.data!.records!.nodes;
    assert.equal(rows.length, 2);
    assert.deepEqual(Reflect.get(rows[0].metadata!, field.selections[0].responsePath[1]), [
      { name: 'One' },
      { name: null },
    ]);
    assert.deepEqual(Reflect.get(rows[1].metadata!, field.selections[0].responsePath[1]), []);
    assert.equal(result.body.data!.records!.hasNextPage, true);
    const rejected = await h.query(
      '{records(recordType:"grid-fixture",filters:[{field:"metadata:/people",exists:true}]){nodes{oid}}}'
    );
    assert.ok(rejected.body.errors?.length);
  });
  it('projects declared person objects with private children excluded and no scalar operations', async () => {
    const h = gridHarness(['a', 'b']);
    const contracts = gridContracts().map(contract => ({
      ...contract,
      root: {
        ...contract.root,
        properties: {
          ...contract.root.properties,
          person: {
            kind: 'object' as const,
            nullable: true,
            unknownProperties: 'allow' as const,
            properties: {
              name: { kind: 'scalar' as const, scalarType: 'string' as const, nullable: true },
              email: { kind: 'scalar' as const, scalarType: 'string' as const, nullable: true },
              private: {
                kind: 'scalar' as const,
                scalarType: 'string' as const,
                nullable: true,
                annotations: { writeOnly: true },
              },
            },
          },
        },
      },
    }));
    const catalogue = buildCatalogue(contracts, 'grid-fixture', [], h.environment).catalogue;
    const person = catalogue.fields.find(f => f.id === 'metadata:/person')!;
    const name = catalogue.fields.find(f => f.id === 'metadata:/person/name')!;
    assert.equal(person.selectable, true);
    assert.equal(person.repeating, false);
    assert.equal(person.filterable, false);
    assert.equal(person.sortable, false);
    assert.deepEqual(person.operators, []);
    assert.ok(!person.selections[0].selection.includes('private'));
    assert.equal(
      catalogue.fields.find(f => f.id === 'metadata:/person/private'),
      undefined
    );
    h.records.get('a')!.metadata.person = { name: 'One', email: null, private: 'secret', undeclared: 'secret' };
    h.records.get('b')!.metadata.person = null;
    const { yoga } = createRecordYoga(
      contracts,
      { getRecord: async oid => h.records.get(oid), hasViewAccess: () => true },
      { getGridEnvironment: async () => h.environment }
    );
    const response = await yoga.fetch(
      'http://redbox/graphql',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `{records(recordType:"grid-fixture", first:2){nodes{oid metadata{__typename ${[...person.selections, ...name.selections].map(s => s.selection).join(' ')}}} hasNextPage}}`,
        }),
      },
      { caller: gridCaller }
    );
    const result = await response.json();
    assert.equal(result.errors, undefined);
    const key = person.selections[0].responsePath[1];
    assert.deepEqual(
      result.data.records.nodes.map((row: { metadata: Record<string, unknown> }) => row.metadata[key]),
      [{ name: 'One', email: null }, null]
    );
    const rejected = await h.query(
      '{records(recordType:"grid-fixture",filters:[{field:"metadata:/details",exists:true}]){nodes{oid}}}'
    );
    assert.ok(rejected.body.errors?.length);
  });
  it('keeps nested repeated projections aligned and closes opaque regions', async () => {
    const h = gridHarness(['a']);
    const contracts = gridContracts().map<ReturnType<typeof gridContracts>[number]>(contract => {
      if (contract.root.kind !== 'object') throw Error('fixture');
      return {
        ...contract,
        root: {
          ...contract.root,
          properties: {
            ...contract.root.properties,
            people: {
              kind: 'array',
              nullable: true,
              items: {
                kind: 'object',
                nullable: true,
                unknownProperties: 'allow',
                properties: {
                  name: { kind: 'scalar', scalarType: 'string', nullable: true },
                  email: { kind: 'scalar', scalarType: 'string', nullable: true },
                  children: {
                    kind: 'array',
                    nullable: true,
                    items: {
                      kind: 'object',
                      nullable: true,
                      unknownProperties: 'allow',
                      properties: {
                        name: { kind: 'scalar', scalarType: 'string', nullable: true },
                        flags: {
                          kind: 'array',
                          nullable: true,
                          items: { kind: 'scalar', scalarType: 'boolean', nullable: true },
                        },
                      },
                    },
                  },
                  private: { kind: 'scalar', scalarType: 'string', nullable: true, annotations: { writeOnly: true } },
                },
              },
            },
            opaque: { kind: 'array', nullable: true, items: { kind: 'any', nullable: true } },
          },
        },
      };
    });
    const catalogue = buildCatalogue(contracts, 'grid-fixture', [], h.environment).catalogue;
    assert.equal(catalogue.fields.find(f => f.id === 'metadata:/opaque')!.selectable, false);
    const field = catalogue.fields.find(f => f.id === 'metadata:/people')!;
    assert.equal(field.selectable, true);
    assert.ok(!field.selections[0].selection.includes('private'));
    const people = [
      {
        name: 'One',
        email: 'one@example.invalid',
        children: [{ name: 'Child', flags: [false, true, null] }],
        private: 'hidden',
      },
      { name: 'Two', children: [] },
    ];
    h.records.get('a')!.metadata.people = people;
    const { yoga } = createRecordYoga(
      contracts,
      { getRecord: async oid => h.records.get(oid), hasViewAccess: () => true },
      { getGridEnvironment: async () => h.environment }
    );
    const response = await yoga.fetch(
      'http://redbox/graphql',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `{records(recordType:"grid-fixture"){nodes{oid metadata{__typename ${field.selections.map(s => s.selection).join(' ')}}}}}`,
        }),
      },
      { caller: gridCaller }
    );
    const result = await response.json();
    assert.equal(result.errors, undefined);
    assert.deepEqual(result.data.records.nodes[0].metadata[field.selections[0].responsePath[1]], [
      { name: 'One', email: 'one@example.invalid', children: [{ name: 'Child', flags: [false, true, null] }] },
      { name: 'Two', email: null, children: [] },
    ]);
  });
  it('returns stage-specific fragments and shares hydration with single-record aliases', async () => {
    const h = gridHarness(['a', 'b']);
    h.records.get('b')!.workflow.stage = 'published';
    h.records.get('b')!.metaMetadata.form = 'published-form';
    h.records.get('b')!.metadata.publication_note = 'published only';
    const catalogue = buildCatalogue(gridContracts(), 'grid-fixture', [], h.environment).catalogue;
    const column = catalogue.fields.find(field => field.id === 'metadata:/publication_note')!;
    assert.equal(column.availableInAllVariants, false);
    assert.equal(column.selections.length, 1);
    const response = await h.query(
      `{ records(recordType:"grid-fixture",first:2){nodes{oid metadata{__typename ${column.selections[0].selection}}} hasNextPage} one:record(oid:"a"){oid} two:record(oid:"a"){oid} }`
    );
    assert.equal(response.body.errors, undefined);
    assert.equal(h.reads.filter(oid => oid === 'a').length, 1);
    const rows = response.body.data?.records?.nodes;
    assert.ok(rows);
    assert.ok(rows[0].metadata && typeof rows[0].metadata === 'object');
    assert.equal(Reflect.get(rows[0].metadata, column.selections[0].responsePath[1]), undefined);
    assert.ok(rows[1].metadata && typeof rows[1].metadata === 'object');
    assert.equal(Reflect.get(rows[1].metadata, column.selections[0].responsePath[1]), 'published only');
  });
  it('does not query private values in inapplicable workflow or historical form variants', async () => {
    const env = gridEnvironment();
    const full = buildCatalogue(gridContracts(), 'grid-fixture', [], env).catalogue.fields.find(
      field => field.id === 'metadata:/publication_note'
    )!;
    assert.equal(full.selectable, true);
    assert.equal(full.filterable, false);
    assert.equal(full.sortable, false);
    assert.equal(full.unavailableReason, 'VARIANT_SCOPE_REQUIRED');
    assert.equal(
      buildCatalogue(gridContracts(), 'grid-fixture', ['published'], env).catalogue.fields.find(
        field => field.id === 'metadata:/publication_note'
      )?.filterable,
      true
    );
    const h = gridHarness(['a', 'historical', 'b']);
    h.records.get('historical')!.metaMetadata.form = 'unknown-historical-form';
    const response = await h.query(
      '{ records(recordType:"grid-fixture",filters:[{field:"metadata:/title",exists:true}],first:2){nodes{oid} hasNextPage} }'
    );
    assert.equal(response.body.errors, undefined);
    assert.deepEqual(
      response.body.data?.records?.nodes.map(row => row.oid),
      ['a', 'b']
    );
    assert.equal(response.body.data?.records?.hasNextPage, false);
  });
  it('returns discovery selections that work for mapped names and nested columns without guessing', async () => {
    const h = gridHarness(['a']);
    const response = await h.query(
      '{ recordFields(recordType:"grid-fixture", workflowStages:["draft"], ids:["metadata:/dc:title","metadata:/details/note"]) { fields { id selections { variant selection responsePath } } } }'
    );
    assert.equal(response.body.errors, undefined);
    const fields = response.body.data?.recordFields?.fields;
    assert.ok(fields);
    const query =
      '{ records(recordType:"grid-fixture", first:1) { nodes { metadata { ' +
      fields.map(field => field.selections[0].selection).join(' ') +
      ' } } } }';
    const result = await h.query(query);
    assert.equal(result.body.errors, undefined);
    const row = result.body.data?.records?.nodes[0];
    assert.ok(row);
    const get = (path: string[]) =>
      path.reduce<unknown>(
        (value, key) => (value && typeof value === 'object' ? Reflect.get(value, key) : undefined),
        row
      );
    assert.equal(get(fields[0].selections[0].responsePath), 'mapped');
    assert.equal(get(fields[1].selections[0].responsePath), 'nested');
  });
  it('paginates visible rows across inaccessible hits and retains an authorized lookahead', async () => {
    const h = gridHarness(['a', 'hidden-1', 'b', 'hidden-2', 'c', 'd']);
    h.denied.add('hidden-1');
    h.denied.add('hidden-2');
    const first = await h.query(pageQuery);
    assert.equal(first.body.errors, undefined);
    assert.deepEqual(
      first.body.data?.records?.nodes.map(row => row.oid),
      ['a', 'b']
    );
    assert.equal(first.body.data?.records?.hasNextPage, true);
    const after = first.body.data?.records?.endCursor;
    assert.ok(after);
    assert.ok(!Buffer.from(after, 'base64url').toString().includes('hidden'));
    const second = await h.query(pageQuery, { after });
    assert.equal(second.body.errors, undefined);
    assert.deepEqual(
      second.body.data?.records?.nodes.map(row => row.oid),
      ['c', 'd']
    );
    assert.equal(second.body.data?.records?.hasNextPage, false);
    assert.equal(second.body.data?.records?.endCursor, null);
    assert.ok(!JSON.stringify(first.body).includes('total'));
    assert.ok(!JSON.stringify(first.body).includes('hidden'));
  });
  it('fills pages across candidate batch boundaries and bounds denied scans without false metadata', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => String(i));
    const h = gridHarness(ids);
    for (const id of ids) if (id !== '49' && id !== '99' && id !== '100') h.denied.add(id);
    const first = await h.query(pageQuery);
    assert.deepEqual(
      first.body.data?.records?.nodes.map(row => row.oid),
      ['49', '99']
    );
    assert.equal(first.body.data?.records?.hasNextPage, true);
    const second = await h.query(pageQuery, { after: first.body.data?.records?.endCursor });
    assert.deepEqual(
      second.body.data?.records?.nodes.map(row => row.oid),
      ['100']
    );
    assert.equal(second.body.data?.records?.hasNextPage, false);
    const blocked = gridHarness(Array.from({ length: 500 }, (_, i) => String(i)));
    for (const id of blocked.records.keys()) blocked.denied.add(id);
    const result = await blocked.query(pageQuery);
    assert.equal(result.body.data?.records, null);
    assert.deepEqual(result.body.errors?.[0].path, ['records']);
    assert.equal(result.body.errors?.[0].extensions.code, 'COLLECTION_LIMIT');
    assert.equal(blocked.reads.length, 200);
    assert.equal(blocked.calls.length, 4);
  });
  it('checks current stored brand, type, stage and record permissions before boundaries', async () => {
    const h = gridHarness(['a', 'foreign', 'other-type', 'other-stage', 'b', 'hidden']);
    h.records.get('foreign')!.metaMetadata.brandId = 'foreign';
    h.records.get('other-type')!.metaMetadata.type = 'other';
    h.records.get('other-stage')!.workflow.stage = 'published';
    h.denied.add('hidden');
    const result = await h.query(pageQuery, { stages: ['draft'] });
    assert.deepEqual(
      result.body.data?.records?.nodes.map(row => row.oid),
      ['a', 'b']
    );
    assert.equal(result.body.data?.records?.hasNextPage, false);
  });
  it('restricts omitted and empty workflow scope before page boundaries and lookahead', async () => {
    for (const stages of [undefined, []]) {
      const h = gridHarness(['a', 'retired', 'published', 'retired-2', 'b']);
      for (const id of ['retired', 'retired-2']) h.records.get(id)!.workflow.stage = 'retired';
      h.records.get('published')!.workflow.stage = 'published';
      h.records.get('published')!.metaMetadata.form = 'published-form';
      const first = await h.query(pageQuery, { stages });
      assert.equal(first.body.errors, undefined);
      assert.deepEqual(
        first.body.data?.records?.nodes.map(row => row.oid),
        ['a', 'published']
      );
      assert.equal(first.body.data?.records?.hasNextPage, true);
      const next = await h.query(pageQuery, { stages, after: first.body.data?.records?.endCursor });
      assert.equal(next.body.errors, undefined);
      assert.deepEqual(
        next.body.data?.records?.nodes.map(row => row.oid),
        ['b']
      );
      assert.equal(next.body.data?.records?.hasNextPage, false);
      assert.deepEqual(h.calls[0].query.workflowStages, stages);
      const last = gridHarness(['a', 'retired']);
      last.records.get('retired')!.workflow.stage = 'retired';
      const exhausted = await last.query(pageQuery, { first: 1, stages });
      assert.equal(exhausted.body.data?.records?.hasNextPage, false);
      assert.equal(exhausted.body.data?.records?.endCursor, null);
    }
  });
  it('fails collection reads on storage outages while preserving single-record failure semantics', async () => {
    const h = gridHarness(['a']);
    const stub = sinon.stub(h.records, 'get').throws(new Error('storage-offline'));
    try {
      const collection = await h.query(pageQuery);
      assert.equal(collection.body.errors?.[0].extensions.code, 'STORAGE_UNAVAILABLE');
      assert.equal(collection.body.data?.records, null);
      const single = await h.query('{ record(oid:"a"){oid} }');
      assert.equal(single.body.errors?.[0].extensions.code, 'NOT_FOUND');
    } finally {
      stub.restore();
    }
  });
  it('invalidates tampered, scoped, expired and configuration-stale cursors', async () => {
    const h = gridHarness();
    const first = await h.query(pageQuery);
    const cursor = first.body.data?.records?.endCursor;
    assert.ok(cursor);
    for (const after of ['', 'x', cursor.slice(0, -4) + 'xxxx']) {
      const result = await h.query(pageQuery, { after });
      assert.equal(result.body.errors?.[0].extensions.code, 'INVALID_CURSOR');
    }
    for (const caller of [
      { ...gridCaller, portal: 'other' },
      { ...gridCaller, user: { username: 'other' } },
      { ...gridCaller, brand: { ...gridCaller.brand, id: 'other' } },
    ]) {
      assert.equal(
        (await h.query(pageQuery, { after: cursor }, caller)).body.errors?.[0].extensions.code,
        'INVALID_CURSOR'
      );
    }
    assert.equal(
      (await h.query(pageQuery, { after: cursor, first: 1 })).body.errors?.[0].extensions.code,
      'INVALID_CURSOR'
    );
    h.contracts[0] = { ...h.contracts[0], diagnostics: [{ code: 'changed', severity: 'warning', message: 'changed' }] };
    assert.equal((await h.query(pageQuery, { after: cursor })).body.errors?.[0].extensions.code, 'INVALID_CURSOR');
  });
  it('invalidates the retired Solr cursor format safely', async () => {
    const h = gridHarness();
    const domain = 'redbox-record-grid-cursor/1';
    const key = createHash('sha256').update(domain).update('\0').update(h.environment.cursorSecret!).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(domain));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify({ mark: '*', skip: 0, version: 1, scope: 'retired', expires: Date.now() + 10000 })),
      cipher.final(),
    ]);
    const after = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
    const response = await h.query(pageQuery, { after });
    assert.equal(response.body.errors?.[0].extensions.code, 'INVALID_CURSOR');
    assert.equal(h.calls.length, 0);
  });
  it('expires cursors and rechecks revoked visibility on later pages', async () => {
    const h = gridHarness(['a', 'b', 'c', 'd']);
    const first = await h.query(pageQuery);
    const cursor = first.body.data?.records?.endCursor;
    assert.ok(cursor);
    h.denied.add('c');
    const second = await h.query(pageQuery, { after: cursor });
    assert.deepEqual(
      second.body.data?.records?.nodes.map(row => row.oid),
      ['d']
    );
    assert.equal(second.body.data?.records?.hasNextPage, false);
    const clock = sinon.useFakeTimers({ now: Date.now() + GRID_LIMITS.cursorAgeMs + 1, toFake: ['Date'] });
    try {
      assert.equal((await h.query(pageQuery, { after: cursor })).body.errors?.[0].extensions.code, 'INVALID_CURSOR');
    } finally {
      clock.restore();
    }
  });
  it('does not expose write-only or undeclared fields through discovery or metadata selections', async () => {
    const h = gridHarness(['a']);
    const result = await h.query('{ recordFields(recordType:"grid-fixture") { fields { id } } }');
    assert.ok(!JSON.stringify(result.body).includes('secret'));
    assert.ok(!JSON.stringify(result.body).includes('undeclared'));
    const variant = h.schema.getTypeMap();
    const name = Object.keys(variant).find(
      name => name.startsWith('M_') && name.includes('_draft_') && !name.includes('_O_')
    );
    const invalid = await h.query(
      `{ records(recordType:"grid-fixture") { nodes { metadata { ... on ${name} { secret } } } } }`
    );
    assert.equal(invalid.status, 400);
    assert.equal(h.reads.length, 0);
  });
  it('keeps collection opaque regions closed without changing single-record JSON reads', async () => {
    const h = gridHarness(['a']);
    const contracts = gridContracts();
    const root = contracts[0].root;
    assert.equal(root.kind, 'object');
    if (root.kind !== 'object') throw new Error('fixture root');
    Object.defineProperty(root.properties, 'opaque', {
      value: { kind: 'any', nullable: true, reason: 'unsupported-component' },
      enumerable: true,
    });
    const { yoga } = createRecordYoga(
      contracts,
      {
        getRecord: async oid => h.records.get(oid),
        hasViewAccess: async () => true,
      },
      { getGridEnvironment: async () => h.environment }
    );
    h.records.get('a')!.metadata.opaque = { undeclared: 'private' };
    const name = metadataTypeName(contracts[0]);
    const response = await yoga.fetch(
      'http://localhost/graphql',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: `{ records(recordType:"grid-fixture"){nodes{metadata{... on ${name}{opaque}}}} record(oid:"a"){metadata{... on ${name}{opaque}}} }`,
        }),
      },
      { caller: gridCaller }
    );
    const body = await response.json();
    assert.equal(body.data.records.nodes[0].metadata.opaque, null);
    assert.deepEqual(body.data.record.metadata.opaque, { undeclared: 'private' });
    assert.equal(body.errors[0].extensions.code, 'UNDECLARED_METADATA');
  });
  it('rejects stale field IDs, unknown stages, extra collection aliases', async () => {
    const h = gridHarness();
    assert.equal(
      (await h.query('{ recordFields(recordType:"grid-fixture",ids:["metadata:/removed"]) { revision } }')).body
        .errors?.[0].extensions.code,
      'UNKNOWN_FIELD'
    );
    assert.equal(
      (await h.query(pageQuery, { stages: ['removed'] })).body.errors?.[0].extensions.code,
      'UNKNOWN_WORKFLOW_STAGE'
    );
    assert.equal(
      (
        await h.query(
          '{ a:records(recordType:"grid-fixture"){hasNextPage} b:records(recordType:"grid-fixture"){hasNextPage} }'
        )
      ).status,
      400
    );
    assert.equal(h.calls.length, 0);
  });
  it('bounds page sizes and rejects missing shared cursor configuration', async () => {
    const h = gridHarness();
    for (const first of [0, -1, 51])
      assert.equal((await h.query(pageQuery, { first })).body.errors?.[0].extensions.code, 'INVALID_PAGE_SIZE');
    h.environment.cursorSecret = undefined;
    assert.equal((await h.query(pageQuery)).body.errors?.[0].extensions.code, 'COLLECTION_UNAVAILABLE');
    assert.equal(h.calls.length, 0);
  });
});

describe('Typed grid search planning', () => {
  const env = gridEnvironment();
  const snapshot = buildCatalogue(gridContracts(), 'grid-fixture', [], env);
  const plan = (
    filters: Parameters<typeof queryPlan>[0]['filters'],
    sort: Parameters<typeof queryPlan>[0]['sort'] = []
  ) => queryPlan({ recordType: 'grid-fixture', filters, sort }, snapshot);
  it('normalizes typed values while keeping text literal and adding the OID tie break', () => {
    const result = plan(
      [
        { field: 'metadata:/title', eq: { text: '$x \" OR *:*' } },
        { field: 'metadata:/eventDate', gt: { dateTime: '2026-01-01T12:00:00+12:00' } },
      ],
      [{ field: 'metadata:/amount', direction: 'ASC' }]
    );
    assert.deepEqual(result.filters[0].values, ['$x \" OR *:*']);
    assert.deepEqual(result.filters[1].values, [Date.parse('2026-01-01T00:00:00Z')]);
    assert.deepEqual(result.sort, [
      { field: 'metadata:/amount', direction: 1 },
      { field: 'record:oid', direction: 1 },
    ]);
  });
  it('validates timestamp components before normalization for every date operator', async () => {
    const invalidDates = [
      '2026-01-01T00:00:00+99:99',
      '2026-01-01T00:00:00+24:00',
      '2026-01-01T00:00:00-01:60',
      '2026-01-01T24:00:00Z',
      '2026-01-01T24:00:00.000Z',
      '2026-01-01T00:60:00Z',
      '2026-01-01T00:00:60Z',
      '2026-00-01T00:00:00Z',
      '2026-01-00T00:00:00Z',
      '2026-01-01T00:00:00Z\n',
    ];
    for (const dateTime of invalidDates) {
      const invalidValue = { dateTime };
      for (const operation of [
        { eq: invalidValue },
        { in: [invalidValue] },
        { gt: invalidValue },
        { lt: invalidValue },
        { between: { from: { dateTime: '2026-01-01T00:00:00Z' }, to: invalidValue } },
      ])
        assert.throws(
          () => plan([{ field: 'metadata:/eventDate', ...operation }]),
          (error: unknown) =>
            error instanceof Error && Reflect.get(error, 'extensions')?.code === 'INVALID_FILTER_VALUE'
        );
    }
    const valid = plan([{ field: 'metadata:/eventDate', eq: { dateTime: '2026-01-02T23:59:59.999+23:59' } }]);
    assert.deepEqual(valid.filters[0].values, [Date.parse('2026-01-02T00:00:59.999Z')]);
    const h = gridHarness();
    const result = await h.query(
      'query($value:RecordFilterValue!){records(recordType:"grid-fixture",filters:[{field:"metadata:/eventDate",eq:$value}]){hasNextPage}}',
      { value: { dateTime: invalidDates[0] } }
    );
    assert.equal(result.body.errors?.[0].extensions.code, 'INVALID_FILTER_VALUE');
    assert.equal(h.calls.length, 0);
    assert.equal(h.reads.length, 0);
  });
  const invalid = [
    [{ field: 'metadata:/removed', eq: { text: 'x' } }],
    [{ field: 'metadata:/amount', eq: { text: 'x' } }],
    [{ field: 'metadata:/title', eq: { text: 'x', number: 1 } }],
    [{ field: 'metadata:/title', eq: { text: 'x' }, exists: true }],
    [{ field: 'metadata:/title', in: [] }],
    [{ field: 'metadata:/title', contains: '' }],
    [{ field: 'metadata:/title', eq: { text: 'x'.repeat(257) } }],
    [{ field: 'metadata:/active', exists: null }],
    [{ field: 'metadata:/eventDate', eq: { dateTime: '2026-02-30T00:00:00Z' } }],
    [{ field: 'metadata:/eventDate', eq: { dateTime: '2026-01-01' } }],
    [{ field: 'metadata:/amount', between: { from: { number: 5 }, to: { number: 1 } } }],
    Array.from({ length: 11 }, () => ({ field: 'metadata:/title', exists: true })),
  ];
  for (const filters of invalid)
    it('rejects unsupported, malformed, or oversized filters', () =>
      assert.throws(() => plan(filters as Parameters<typeof plan>[0])));
  it('rejects invalid sorts rather than silently ignoring them', () => {
    for (const sort of [
      [{ field: 'metadata:/people', direction: 'ASC' }],
      [{ field: 'metadata:/removed', direction: 'ASC' }],
      [{ field: 'metadata:/title', direction: 'SIDEWAYS' }],
      Array.from({ length: 4 }, () => ({ field: 'metadata:/title', direction: 'ASC' })),
    ])
      assert.throws(() => plan([], sort as Parameters<typeof plan>[1]));
  });
});
