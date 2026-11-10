import assert from 'node:assert/strict';
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
    assert.deepEqual(fromTree(node), { kind: 'json', reason: 'incompatible-conditional-shapes' });
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
