import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { GraphQLNonNull, GraphQLObjectType, GraphQLSchema, printSchema } from 'graphql';
import { renderRecordJsonSchema } from '../../../../packages/redbox-core/src/record-contract/json-schema-renderer';
import { recordContractPointer } from '../../../../packages/redbox-core/src/record-contract/json-pointer';
import type { ContractNode, RecordContract } from '../../../../packages/redbox-core/src/record-contract/types';
import { Services } from '../../../../packages/redbox-core/src/services/RecordsService';
import * as lodash from 'lodash';
import { readAuthorizedRecord, ReadError, type ReadCaller, type ReadPorts, type ReadRecord } from './access';
import { caller, compileForm, fixtureContracts, recordFor, richForm } from './fixtures';
import { createRecordYoga } from './graphql';
import { coverage, fieldName, fromJsonSchema, fromTree, metadataTypeName, renderMetadata } from './renderer';
import { projectMetadata, ProjectionError } from './projection';

Object.assign(globalThis, {
  _: lodash,
  RolesService: { getRole: (_brand: unknown, name: string) => ({ id: `${name}-id`, name }) },
});
const recordsService = new Services.Records();
let contracts: RecordContract[];
before(async () => {
  contracts = await fixtureContracts();
});

function harness(contractList: readonly RecordContract[] = contracts, input?: ReadRecord) {
  const record = input ?? recordFor(contractList[1]);
  let reads = 0;
  const ports: ReadPorts = {
    getMeta: async oid => {
      reads += 1;
      return oid === record.redboxOid ? record : null;
    },
    hasViewAccess: recordsService.hasViewAccess.bind(recordsService),
  };
  const { yoga, schema } = createRecordYoga(contractList, ports);
  async function query(query: string, currentCaller: ReadCaller = caller, variables?: Record<string, unknown>) {
    const response = await yoga.fetch(
      'http://localhost/graphql',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/graphql-response+json' },
        body: JSON.stringify({ query, variables }),
      },
      { caller: currentCaller }
    );
    return { status: response.status, body: await response.json() };
  }
  return { query, schema, ports, record, reads: () => reads };
}

test('matches typed and opaque coverage from both render paths for all six publication forms', () => {
  for (const contract of contracts) {
    const document = renderRecordJsonSchema(contract);
    const tree = fromTree(contract.root);
    const converted = fromJsonSchema(document, document.$defs);
    assert.deepEqual(
      coverage(converted).map(({ pointer, kind }) => ({ pointer, kind })),
      coverage(tree).map(({ pointer, kind }) => ({ pointer, kind })),
      contract.context.form
    );
    assert.equal(
      printSchema(
        createRecordYoga([contract], { getMeta: async () => null, hasViewAccess: () => false }).schema
      ).includes('union RecordMetadata'),
      true
    );
    const direct = renderMetadata(tree, metadataTypeName(contract));
    const indirect = renderMetadata(converted, metadataTypeName(contract));
    const schema = (type: GraphQLObjectType) =>
      new GraphQLSchema({ query: new GraphQLObjectType({ name: 'Query', fields: { metadata: { type } } }) });
    assert.equal(printSchema(schema(direct.type)), printSchema(schema(indirect.type)));
    for (const field of Object.values(direct.type.getFields())) assert.ok(!(field.type instanceof GraphQLNonNull));
  }
});

test('executes real draft, queued, and published stub contracts and richer nested/repeatable/hook fragments', async () => {
  for (const contract of contracts) {
    const fixture = harness(contracts, recordFor(contract));
    const extra = contract.context.form.startsWith('investigation')
      ? 'details { description } contributors { name } custom_hook_value { value } conditional_details { explanation review_score }'
      : '';
    const result = await fixture.query(
      `{ record(oid: "${contract.context.workflowStep}") { oid workflowStep form metadata { __typename ... on ${metadataTypeName(contract)} { title ${extra} } } } }`
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.errors, undefined, JSON.stringify(result.body));
    assert.equal(result.body.data.record.metadata.__typename, metadataTypeName(contract));
    assert.equal(fixture.reads(), 1);
  }
});

test('keeps omitted metadata nullable and historical enum values unchanged', async () => {
  const contract = contracts[1];
  const record = recordFor(contract);
  const fixture = harness(contracts, { ...record, metadata: { fixed_choice: 'a-retired-vocabulary-value' } });
  const result = await fixture.query(
    `{ record(oid: "draft") { metadata { ... on ${metadataTypeName(contract)} { title fixed_choice contributors { name } } } } }`
  );
  assert.equal(result.body.errors, undefined);
  assert.deepEqual(result.body.data.record.metadata, {
    title: null,
    fixed_choice: 'a-retired-vocabulary-value',
    contributors: null,
  });
});

test('reports safe partial errors for historical type mismatches and retains large integers', async () => {
  const record = recordFor(contracts[1]);
  const fixture = harness(contracts, {
    ...record,
    metadata: { title: 'Readable title', amount: 'old-number-string', count: 3_000_000_000 },
  });
  const result = await fixture.query(
    `{ record(oid: "draft") { metadata { ... on ${metadataTypeName(contracts[1])} { title amount count } } } }`
  );
  assert.deepEqual(result.body.data.record.metadata, { title: 'Readable title', amount: null, count: 3_000_000_000 });
  assert.equal(result.body.errors[0].extensions.code, 'HISTORICAL_VALUE_TYPE');
  assert.ok(!JSON.stringify(result.body).includes('old-number-string'));
  assert.deepEqual(projectMetadata(fixture.record.metadata, '/amount'), { amount: 'old-number-string' });
});

test('maps invalid and reserved names injectively without renaming stored values', async () => {
  const names = ['dc:title', 'dc/title', '9start', '__private', 'rb_64633a7469746c65', 'dc_title', 'é', '', 'a~b'];
  assert.equal(new Set(names.map(fieldName)).size, names.length);
  const fixture = harness();
  const selected = names.slice(0, 5).map(fieldName).join(' ');
  const result = await fixture.query(
    `{ record(oid: "draft") { metadata { ... on ${metadataTypeName(contracts[1])} { ${selected} custom_hook_value { ${fieldName('owner-id')} } } } } }`
  );
  assert.equal(result.body.errors, undefined);
  assert.equal(result.body.data.record.metadata[fieldName('dc:title')], fixture.record.metadata['dc:title']);
});

test('unregistered hooks remain explicitly opaque and incompatible branches use a JSON fallback', async () => {
  const contract = await compileForm(richForm('draft'), 'draft', false);
  assert.equal(contract.completeness, 'partial');
  assert.equal(fromTree(contract.root).kind, 'object');
  assert.ok(
    coverage(fromTree(contract.root)).some(entry => entry.pointer === '/custom_hook_value' && entry.kind === 'json')
  );
  const fixture = harness([contract], recordFor(contract));
  const result = await fixture.query(
    `{ record(oid: "draft") { metadata { ... on ${metadataTypeName(contract)} { custom_hook_value } } } }`
  );
  assert.equal(result.body.errors, undefined);
  const shape = fromTree({
    kind: 'conditional',
    nullable: false,
    condition: { kind: 'exists', pointer: recordContractPointer('/choice') },
    thenNode: { kind: 'scalar', scalarType: 'string', nullable: false },
    elseNode: { kind: 'array', nullable: false, items: { kind: 'scalar', scalarType: 'string', nullable: false } },
  });
  assert.deepEqual(shape, { kind: 'json', reason: 'incompatible-conditional-shapes' });
});

test('converts local definitions and conditional shapes while refusing unsupported JSON Schema shapes', () => {
  const node: ContractNode = {
    kind: 'object',
    nullable: true,
    unknownProperties: 'allow',
    definitionKey: 'contact/v1',
    properties: { email: { kind: 'scalar', scalarType: 'string', nullable: true } },
  };
  const contract: RecordContract = {
    ...contracts[1],
    root: { ...contracts[1].root, properties: { contact: node } },
    definitions: { 'contact/v1': node },
  };
  const document = renderRecordJsonSchema(contract);
  assert.deepEqual(
    coverage(fromJsonSchema(document, document.$defs)).map(({ pointer, kind }) => ({ pointer, kind })),
    coverage(fromTree(contract.root)).map(({ pointer, kind }) => ({ pointer, kind }))
  );
  assert.equal(fromJsonSchema({ oneOf: [{ type: 'string' }, { type: 'integer' }] }).kind, 'json');
  assert.equal(fromJsonSchema({ anyOf: [{ type: 'string' }, { type: 'number' }] }).kind, 'json');
  assert.deepEqual(fromTree({ kind: 'object', nullable: false, unknownProperties: 'allow', properties: {} }), {
    kind: 'json',
    reason: 'empty-object',
  });
});

test('recovers conditional fields inside repeatable rows from lifted JSON Schema branches', () => {
  const conditional: ContractNode = {
    kind: 'conditional',
    nullable: true,
    condition: { kind: 'exists', pointer: recordContractPointer('/choice') },
    thenNode: { kind: 'scalar', scalarType: 'string', nullable: false },
  };
  const contract: RecordContract = {
    ...contracts[1],
    root: {
      ...contracts[1].root,
      properties: {
        choice: { kind: 'scalar', scalarType: 'string', nullable: false },
        rows: {
          kind: 'array',
          nullable: true,
          items: { kind: 'object', nullable: false, unknownProperties: 'allow', properties: { detail: conditional } },
        },
      },
    },
  };
  const document = renderRecordJsonSchema(contract);
  assert.deepEqual(
    coverage(fromJsonSchema(document, document.$defs)).map(({ pointer, kind }) => ({ pointer, kind })),
    coverage(fromTree(contract.root)).map(({ pointer, kind }) => ({ pointer, kind }))
  );
});

test('resolves a second record type through its exact workflow and form union member', async () => {
  const form = richForm('draft');
  const contract = await compileForm({ ...form, type: 'dataRecord', name: 'investigation-data-record-draft' }, 'draft');
  const fixture = harness([...contracts, contract], recordFor(contract));
  const response = await fixture.query(
    `{ record(oid: "draft") { recordType metadata { __typename ... on ${metadataTypeName(contract)} { title } } } }`
  );
  assert.equal(response.body.errors, undefined);
  assert.equal(response.body.data.record.recordType, 'dataRecord');
  assert.equal(response.body.data.record.metadata.__typename, metadataTypeName(contract));
});

test('denies non-viewers and cross-brand reads using the real RecordsService permission check', async () => {
  const fixture = harness();
  for (const [currentCaller, code] of [
    [{ ...caller, user: { username: 'stranger', roles: [] } }, 'RECORD_FORBIDDEN'],
    [{ ...caller, brand: { ...caller.brand, id: 'another-brand' } }, 'RECORD_NOT_FOUND'],
  ] as const) {
    const result = await fixture.query('{ record(oid: "draft") { oid } }', currentCaller);
    assert.equal(result.body.data.record, null);
    assert.equal(result.body.errors[0].extensions.code, code);
    await assert.rejects(
      () => readAuthorizedRecord(fixture.ports, currentCaller, 'draft'),
      error => error instanceof ReadError && error.code === code
    );
  }
  const missing = await fixture.query('{ record(oid: "absent") { oid } }');
  assert.equal(missing.body.errors[0].extensions.code, 'RECORD_NOT_FOUND');
});

test('grants readers, editors, and brand roles according to existing record permissions', async () => {
  const original = recordFor(contracts[1]);
  for (const authorization of [
    { view: ['reader'], edit: [], viewRoles: [], editRoles: [] },
    { view: [], edit: ['reader'], viewRoles: [], editRoles: [] },
    { view: [], edit: [], viewRoles: ['Viewer'], editRoles: [] },
  ]) {
    const fixture = harness(contracts, { ...original, authorization });
    const result = await fixture.query('{ record(oid: "draft") { oid } }', {
      ...caller,
      user: { ...caller.user, roles: [{ id: 'Viewer-id', name: 'Viewer' }] },
    });
    assert.equal(result.body.errors, undefined);
  }
});

test('deduplicates concurrent aliases within each request and reauthorizes later requests', async () => {
  const fixture = harness();
  const query = '{ a: record(oid: "draft") { oid } b: record(oid: "draft") { form } }';
  const result = await fixture.query(query);
  assert.equal(result.body.errors, undefined);
  assert.equal(fixture.reads(), 1);
  await fixture.query(query);
  assert.equal(fixture.reads(), 2);
  const denied = await fixture.query(query, { ...caller, user: { username: 'stranger', roles: [] } });
  assert.equal(denied.body.data.a, null);
  assert.equal(denied.body.data.b, null);
  assert.equal(fixture.reads(), 3);
});

test('rejects excessive aliases, expanded fragments, depth, tokens, mutations, discovery and multiple operations before storage reads', async () => {
  const fixture = harness();
  const queries = [
    `{ ${Array.from({ length: 6 }, (_, i) => `a${i}: record(oid: "draft") { oid }`).join(' ')} }`,
    `query { record(oid: "draft") { ...F ...F ...F } } fragment F on Record { ${Array.from({ length: 80 }, (_, i) => `a${i}: oid`).join(' ')} }`,
    `{ record(oid: "draft") { ${'metadata {'.repeat(14)} __typename ${'}'.repeat(14)} } }`,
    `{ ${Array.from({ length: 2_100 }, (_, i) => `a${i}: __typename`).join(' ')} }`,
    'mutation { record(oid: "draft") { oid } }',
    '{ __schema { queryType { name } } }',
    'query A { record(oid: "draft") { oid } } query B { record(oid: "draft") { oid } }',
    'query { record(oid: "draft") { ...F } } fragment F on Record { ...F }',
  ];
  for (const query of queries) {
    const result = await fixture.query(query);
    assert.ok(result.body.errors?.length, query.slice(0, 80));
  }
  assert.equal(fixture.reads(), 0);
});

test('rejects oversized variables and HTTP batch requests before storage reads', async () => {
  const fixture = harness();
  const result = await fixture.query('query($id: ID!) { record(oid: $id) { oid } }', caller, {
    id: 'x'.repeat(70_000),
  });
  assert.ok(result.body.errors?.length);
  assert.equal(fixture.reads(), 0);
  const { yoga } = createRecordYoga(contracts, fixture.ports);
  const batch = await yoga.fetch(
    'http://localhost/graphql',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ query: '{ record(oid: "draft") { oid } }' }]),
    },
    { caller }
  );
  assert.equal(batch.status, 400);
  assert.equal(fixture.reads(), 0);
});

test('bounds selected list size and aggregate stored-value work', async () => {
  const original = recordFor(contracts[1]);
  const fixture = harness(contracts, {
    ...original,
    metadata: { contributors: Array.from({ length: 1_001 }, () => ({ name: 'A' })) },
  });
  const result = await fixture.query(
    `{ record(oid: "draft") { metadata { ... on ${metadataTypeName(contracts[1])} { contributors { name } } } } }`
  );
  assert.equal(result.body.errors[0].extensions.code, 'QUERY_LIMIT');
  const many = harness(contracts, {
    ...original,
    metadata: { contributors: Array.from({ length: 1_000 }, () => ({ name: 'A' })) },
  });
  const expensive = await many.query(
    `{ record(oid: "draft") { metadata { ... on ${metadataTypeName(contracts[1])} { ${Array.from({ length: 12 }, (_, i) => `a${i}: contributors { name }`).join(' ')} } } } }`
  );
  assert.ok(
    expensive.body.errors.some((error: { extensions: { code: string } }) => error.extensions.code === 'QUERY_LIMIT'),
    JSON.stringify(expensive.body.errors.slice(0, 3))
  );
});

test('enforces depth bounds for a structurally valid nested query before storage access', async () => {
  let node: ContractNode = { kind: 'scalar', nullable: false, scalarType: 'string' };
  for (let i = 0; i < 14; i += 1)
    node = { kind: 'object', nullable: false, unknownProperties: 'allow', properties: { nested: node } };
  const contract: RecordContract = { ...contracts[1], root: { ...contracts[1].root, properties: { deep: node } } };
  const fixture = harness([contract], recordFor(contract));
  const query = `{ record(oid: "draft") { metadata { ... on ${metadataTypeName(contract)} { deep { ${'nested { '.repeat(13)} nested ${'} '.repeat(13)} } } } } }`;
  const result = await fixture.query(query);
  assert.equal(result.body.errors[0].extensions.code, 'QUERY_LIMIT');
  assert.equal(fixture.reads(), 0);
});

test('configuration changes keep variant names stable, change the schema, and reject stale fields', async () => {
  const before = contracts[1];
  const updatedForm = richForm('draft');
  const after = await compileForm(
    { ...updatedForm, componentDefinitions: updatedForm.componentDefinitions.filter(field => field.name !== 'amount') },
    'draft'
  );
  assert.equal(metadataTypeName(before), metadataTypeName(after));
  const earlier = harness([before], recordFor(before));
  const current = harness([after], recordFor(after));
  assert.notEqual(printSchema(earlier.schema), printSchema(current.schema));
  const result = await current.query(
    `{ record(oid: "draft") { metadata { ... on ${metadataTypeName(after)} { amount } } } }`
  );
  assert.equal(result.status, 400);
  assert.equal(current.reads(), 0);
});

test('fails a stale or unknown form contract without guessing the union member', async () => {
  const original = recordFor(contracts[1]);
  const fixture = harness(contracts, { ...original, metaMetadata: { ...original.metaMetadata, form: 'removed-form' } });
  const result = await fixture.query('{ record(oid: "draft") { oid metadata { __typename } } }');
  assert.equal(result.body.data.record.oid, 'draft');
  assert.equal(result.body.data.record.metadata, null);
  assert.equal(result.body.errors[0].extensions.code, 'UNRESOLVED_READ_CONTRACT');
});

test('projects nested and repeatable values without altering the default or stored metadata', () => {
  const metadata = {
    title: 'T',
    details: { description: 'D', hidden: 'H' },
    contributors: [{ name: 'A', email: 'a' }, { email: 'b' }],
    'dc/title': 'mapped',
    amount: 'legacy-string',
  };
  const snapshot = structuredClone(metadata);
  assert.equal(projectMetadata(metadata), metadata);
  assert.deepEqual(projectMetadata(metadata, '/title,/details/description,/contributors/name,/dc~1title'), {
    title: 'T',
    details: { description: 'D' },
    contributors: [{ name: 'A' }, {}],
    'dc/title': 'mapped',
  });
  assert.deepEqual(projectMetadata(metadata, '/contributors/name,/contributors'), {
    contributors: metadata.contributors,
  });
  assert.deepEqual(projectMetadata(metadata, '/does-not-exist'), {});
  assert.deepEqual(metadata, snapshot);
  for (const fields of [
    '',
    'title',
    '/bad~2pointer',
    Array.from({ length: 51 }, () => '/title').join(','),
    `/${Array(13).fill('a').join('/')}`,
  ])
    assert.throws(() => projectMetadata(metadata, fields), ProjectionError);
  assert.deepEqual(projectMetadata(metadata, '/__proto__,/constructor'), {});
});
