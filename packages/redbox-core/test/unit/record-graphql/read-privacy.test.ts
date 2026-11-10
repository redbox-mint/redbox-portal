import assert from 'node:assert/strict';
import { printSchema } from 'graphql';
import {
  RecordContractCompiler,
  RecordContractContributorRegistry,
  createCoreRecordContractContributors,
  recordContractPointer,
  type ContractNode,
  type ContractObjectNode,
  type RecordContractComponentContributor,
} from '../../../src/record-contract';
import { recordSchema } from '../../../src/config/recordSchema.config';
import { createRecordYoga } from '../../../src/record-graphql/schema';
import { metadataTypeName } from '../../../src/record-graphql/renderer';
import {
  gridCaller,
  gridContracts,
  gridEnvironment,
  gridRecord,
  type GridTestResponse,
} from '../../fixtures/record-grid.fixtures';

const scalar = (writeOnly = false): ContractNode => ({
  kind: 'scalar',
  scalarType: 'string',
  nullable: false,
  ...(writeOnly ? { annotations: { writeOnly: true } } : {}),
});
const object = (properties: Record<string, ContractNode>): ContractObjectNode => ({
  kind: 'object',
  properties,
  nullable: false,
  unknownProperties: 'allow',
});
const array = (items: ContractNode): ContractNode => ({ kind: 'array', items, nullable: false });

// Synthetic hook contributions pass through the actual contributor compiler.
async function harness(left: ContractNode, right: ContractNode, stored: unknown) {
  const contributor: RecordContractComponentContributor = {
    kind: 'component',
    key: 'graphql.conditional-privacy-fixture',
    version: '1',
    componentType: 'PrivacyHookComponent',
    ownedPointers: [''],
    nullability: 'non-null',
    compile: () => ({
      kind: 'node',
      node: {
        kind: 'conditional',
        nullable: false,
        condition: { kind: 'exists', pointer: recordContractPointer('') },
        thenNode: left,
        elseNode: right,
      },
    }),
  };
  const compiler = new RecordContractCompiler(
    new RecordContractContributorRegistry([
      ...createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' as const })),
      { contributor, source: 'hook', packageName: '@example/graphql-privacy' },
    ]),
    recordSchema.limits
  );
  const result = await compiler.compile({
    fieldMode: 'read',
    context: gridContracts()[0].context,
    form: {
      name: 'draft-form',
      type: 'grid-fixture',
      componentDefinitions: [
        { name: 'title', component: { class: 'SimpleInputComponent' } },
        { name: 'payload', component: { class: 'PrivacyHookComponent' } },
      ],
    },
  });
  assert.equal(result.kind, 'compiled', JSON.stringify(result));
  if (result.kind !== 'compiled') throw new Error('Expected a compiled fixture.');
  const record = gridRecord('a');
  record.metadata.payload = stored;
  const environment = gridEnvironment();
  environment.search = async () => ({ oids: ['a'], nextCursor: 'end', exhausted: true });
  let reads = 0;
  const { yoga, schema } = createRecordYoga(
    [result.contract],
    {
      getRecord: async () => {
        reads++;
        return record;
      },
      hasViewAccess: () => true,
    },
    { getGridEnvironment: async () => environment }
  );
  const query = async (selection: string) => {
    reads = 0;
    const fragment = `... on ${metadataTypeName(result.contract)} { ${selection} }`;
    const response = await yoga.fetch(
      'http://localhost/graphql',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/graphql-response+json' },
        body: JSON.stringify({
          query: `{
        record(oid:"a") { metadata { ${fragment} } }
        records(recordType:"grid-fixture",first:1) { nodes { metadata { ${fragment} } } }
        recordFields(recordType:"grid-fixture") { fields { id } }
      }`,
        }),
      },
      { caller: gridCaller }
    );
    const body: GridTestResponse = await response.json();
    return { body, status: response.status, reads };
  };
  return { query, schema };
}

describe('Conditional hook read privacy', () => {
  for (const reverse of [false, true]) {
    it(`keeps typed private paths excluded across branch order ${reverse}`, async () => {
      const branch = (privateFields: boolean) =>
        object({
          public: scalar(),
          secret: scalar(privateFields),
          nested: object({ public: scalar(), secret: scalar(privateFields) }),
          rows: array(object({ public: scalar(), secret: scalar(privateFields) })),
        });
      const h = await harness(branch(reverse), branch(!reverse), {
        public: 'visible',
        secret: 'private-value',
        nested: { public: 'visible', secret: 'private-value' },
        rows: [{ public: 'visible', secret: 'private-value' }],
      });
      const response = await h.query('payload { public nested { public } rows { public } }');
      assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
      const expected = { payload: { public: 'visible', nested: { public: 'visible' }, rows: [{ public: 'visible' }] } };
      assert.deepEqual(response.body.data?.record?.metadata, expected);
      assert.deepEqual(response.body.data?.records?.nodes[0].metadata, expected);
      assert.ok(response.body.data?.recordFields?.fields.every(field => !field.id.includes('secret')));
      assert.doesNotMatch(printSchema(h.schema), /\bsecret\b/);
      for (const selection of ['payload { secret }', 'payload { nested { secret } }', 'payload { rows { secret } }']) {
        const denied = await h.query(selection);
        assert.equal(denied.status, 400);
        assert.equal(denied.reads, 0);
        assert.ok(!JSON.stringify(denied.body).includes('private-value'));
      }
    });
    it(`closes nested opaque regions with private descendants across branch order ${reverse}`, async () => {
      const privateBranch = object({
        public: scalar(),
        ambiguous: object({ nested: object({ secret: scalar(true) }) }),
        rows: array(object({ secret: scalar(true) })),
      });
      const otherBranch = object({ public: scalar(), ambiguous: scalar(), rows: array(scalar()) });
      const h = await harness(reverse ? otherBranch : privateBranch, reverse ? privateBranch : otherBranch, {
        public: 'visible',
        ambiguous: { nested: { secret: 'private-value' } },
        rows: [{ secret: 'private-value' }],
      });
      const response = await h.query('payload { public rows }');
      assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
      assert.deepEqual(response.body.data?.record?.metadata, { payload: { public: 'visible', rows: [null] } });
      assert.deepEqual(response.body.data?.records?.nodes[0].metadata, {
        payload: { public: 'visible', rows: [null] },
      });
      assert.ok(response.body.data?.recordFields?.fields.every(field => !/secret|ambiguous/.test(field.id)));
      const denied = await h.query('payload { ambiguous }');
      assert.equal(denied.status, 400);
      assert.equal(denied.reads, 0);
    });
    it(`closes an opaque hook root with private descendants across branch order ${reverse}`, async () => {
      const privateBranch = object({ secret: scalar(true) });
      const otherBranch = scalar();
      const h = await harness(reverse ? otherBranch : privateBranch, reverse ? privateBranch : otherBranch, {
        secret: 'private-value',
      });
      const response = await h.query('title');
      assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
      assert.ok(response.body.data?.recordFields?.fields.every(field => !field.id.includes('payload')));
      assert.equal((await h.query('payload')).status, 400);
    });
  }
});
