import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { GraphQLObjectType, GraphQLSchema, printSchema, graphql, buildSchema } from 'graphql';
import { createRecordYoga, QUERY_LIMITS } from '../../../src/record-graphql/schema';
import { fromTree, renderMetadata, hash, type WorkBudget } from '../../../src/record-graphql/renderer';
import { recordContractPointer, type ContractNode, type RecordContract } from '../../../src/record-contract';

function contract(root: RecordContract['root']): RecordContract {
  return {
    root,
    definitions: {},
    fieldOwners: {},
    validatorSummaries: [],
    diagnostics: [],
    completeness: 'complete',
    context: {
      brand: 'default',
      portal: 'rdmp',
      kind: 'update',
      recordType: 'fixture',
      workflowStep: 'draft',
      form: 'fixture-draft',
      operation: 'strict-all',
      unknownProperties: 'allow',
      enforcement: 'shadow',
    },
  };
}
const scalar: ContractNode = { kind: 'scalar', nullable: false, scalarType: 'string' };
const object = (properties: Record<string, ContractNode>): RecordContract['root'] => ({
  kind: 'object',
  nullable: false,
  unknownProperties: 'allow',
  properties,
});
const budget: WorkBudget = { consumeUnits: () => {}, consumeBytes: () => {} };

describe('GraphQL renderer and query bounds', () => {
  it('keeps incompatible conditional shapes explicitly opaque', () => {
    const node: ContractNode = {
      kind: 'conditional',
      nullable: false,
      condition: { kind: 'exists', pointer: recordContractPointer('/enabled') },
      thenNode: scalar,
      elseNode: object({ title: scalar }),
    };
    assert.deepEqual(fromTree(node), { kind: 'json', reason: 'incompatible-read-variants' });
  });
  it('uses collision-safe nested type identities for arbitrary stored names', () => {
    assert.notEqual(hash('/\ud800'), hash('/\ud801'));
    const { type } = renderMetadata(
      fromTree(object({ '\ud800': object({ value: scalar }), '\ud801': object({ value: scalar }) })),
      'Fixture'
    );
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({ name: 'Query', fields: { metadata: { type } } }),
    });
    assert.ok(printSchema(schema).includes('rb_00d8'));
    assert.ok(printSchema(schema).includes('rb_01d8'));
    assert.doesNotThrow(() => buildSchema(printSchema(schema)));
  });
  it('supports an empty configured form without creating an invalid empty object type', async () => {
    const { type } = renderMetadata(fromTree(object({})), 'EmptyMetadata');
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: { metadata: { type, resolve: () => ({ stored: 'legacy' }) } },
      }),
    });
    const result = await graphql({ schema, source: '{ metadata { value } }', contextValue: budget });
    assert.equal(result.errors, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(result.data)), { metadata: { value: { stored: 'legacy' } } });
  });
  it('retains nullable list siblings and indexed historical errors', async () => {
    const list = (items: ContractNode): ContractNode => ({ kind: 'array', nullable: true, items });
    const { type } = renderMetadata(
      fromTree(object({ tags: list(scalar), rows: list(object({ title: scalar })), matrix: list(list(scalar)) })),
      'HistoricalLists'
    );
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: {
          metadata: {
            type,
            resolve: () => ({
              tags: ['valid', 17, 'still-valid'],
              rows: [{ title: 'first' }, 17, { title: 'last' }],
              matrix: [['yes', 17], 42, ['last']],
            }),
          },
        },
      }),
    });
    const result = await graphql({
      schema,
      source: '{ metadata { tags rows { title } matrix } }',
      contextValue: budget,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(result.data)), {
      metadata: {
        tags: ['valid', null, 'still-valid'],
        rows: [{ title: 'first' }, null, { title: 'last' }],
        matrix: [['yes', null], null, ['last']],
      },
    });
    assert.deepEqual(
      result.errors?.map(error => error.path).sort(),
      [
        ['metadata', 'tags', 1],
        ['metadata', 'rows', 1],
        ['metadata', 'matrix', 0, 1],
        ['metadata', 'matrix', 1],
      ].sort()
    );
    assert.ok(result.errors?.every(error => error.extensions.code === 'HISTORICAL_VALUE_TYPE'));
    assert.ok(result.errors?.every(error => error.message === 'Stored value does not match the current field type.'));
  });
  it('bounds field-free cyclic and acyclic fragment graphs under an external timeout', async function () {
    this.timeout(8_000);
    const graph = (cycle: boolean) =>
      `query { ...F0 } ${Array.from({ length: 24 }, (_, i) => `fragment F${i} on Query { ...F${i === 23 ? (cycle ? 0 : 'missing') : i + 1} ...F${i === 23 ? (cycle ? 0 : 'missing') : i + 1} }`).join(' ')}`;
    const worker = new Worker(
      `
      const { workerData, parentPort } = require('node:worker_threads');
      const { createRecordYoga } = require(workerData.schemaPath);
      let reads = 0;
      const { yoga } = createRecordYoga([], { getRecord: async () => { reads++; throw new Error('Unexpected read'); }, hasViewAccess: () => true });
      (async () => {
        const results = [];
        for (const query of workerData.queries) {
          const response = await yoga.fetch('http://redbox/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/graphql-response+json' }, body: JSON.stringify({ query }) }, { caller: { brand: { id: 'default', name: 'default', css: '', roles: [] }, portal: 'rdmp', user: { username: 'viewer' }, roles: [] } });
          results.push({ status: response.status, body: await response.json() });
        }
        parentPort.postMessage({ reads, results });
      })().catch(error => { throw error; });
    `,
      {
        eval: true,
        execArgv: ['--no-experimental-strip-types', '-r', require.resolve('ts-node/register/transpile-only')],
        workerData: {
          schemaPath: require.resolve('../../../src/record-graphql/schema'),
          queries: [graph(true), graph(false)],
        },
      }
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await new Promise<{
        reads: number;
        results: { status: number; body: { errors: { extensions: { code: string } }[] } }[];
      }>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Fragment validation exceeded its external timeout.')), 5_000);
        worker.once('message', resolve);
        worker.once('error', reject);
        worker.once('exit', code => {
          if (code !== 0) reject(new Error(`Worker exited with ${code}`));
        });
      });
      assert.equal(result.reads, 0);
      for (const response of result.results) {
        assert.equal(response.status, 400);
        assert.ok(response.body.errors.some(error => error.extensions.code === 'QUERY_LIMIT'));
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      await worker.terminate();
    }
  });
  it('rejects excessive valid nesting, parser tokens and expanded fragments before reads', async () => {
    let node: ContractNode = scalar;
    for (let depth = 0; depth < 14; depth++) node = object({ child: node });
    let reads = 0;
    const { yoga, schema } = createRecordYoga([contract(object({ deep: node }))], {
      getRecord: async () => {
        reads++;
        throw new Error('Unexpected read');
      },
      hasViewAccess: () => true,
    });
    const name = Object.keys(schema.getTypeMap()).find(type => type.startsWith('M_') && !type.includes('_O_'));
    for (const query of [
      `{ record(oid:"record") { metadata { ... on ${name} { deep { ${'child { '.repeat(13)} child ${'} '.repeat(13)} } } } } }`,
      `{ record(oid:"record") { ${'oid '.repeat(QUERY_LIMITS.tokens)} } }`,
      `query { ...F0 } ${Array.from({ length: 12 }, (_, i) => `fragment F${i} on Query { ${i === 11 ? 'record(oid:"record") { oid }' : `...F${i + 1} ...F${i + 1}`} }`).join(' ')}`,
    ]) {
      const response = await yoga.fetch(
        'http://redbox/graphql',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/graphql-response+json' },
          body: JSON.stringify({ query }),
        },
        {
          caller: {
            brand: { id: 'brand-default', name: 'default', roles: [], css: '' },
            portal: 'rdmp',
            user: { username: 'viewer' },
            roles: [],
          },
        }
      );
      assert.equal(response.status, 400);
      assert.equal(reads, 0);
    }
  });
});
