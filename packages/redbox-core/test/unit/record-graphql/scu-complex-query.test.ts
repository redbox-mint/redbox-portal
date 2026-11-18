import assert from 'node:assert/strict';
import type { ContractNode } from '../../../src/record-contract';
import { buildCatalogue } from '../../../src/record-graphql/catalogue';
import { gridHarness } from '../../fixtures/record-grid.fixtures';
import { scuGridContracts } from '../../fixtures/scu-grid.fixtures';

const scalar: ContractNode = { kind: 'scalar', scalarType: 'string', nullable: true };
const person: ContractNode = {
  kind: 'object',
  nullable: true,
  unknownProperties: 'declared',
  properties: Object.fromEntries(
    [
      'name',
      'email',
      'text_full_name',
      'username',
      'role',
      'orcid',
      'honorific',
      'ID',
      'given_name',
      'family_name',
      'full_name_honorific',
    ].map(key => [key, scalar])
  ),
};
const fields = [
  'contributor_author',
  'contributor_ci',
  'contributors',
  'contributors_data_manager',
  'contributors_external',
  'contributors_supervisor',
];
function harness() {
  const contracts = scuGridContracts().map(contract =>
    contract.context.recordType !== 'dataPublication'
      ? contract
      : {
          ...contract,
          root: {
            ...contract.root,
            properties: {
              ...contract.root.properties,
              ...Object.fromEntries(
                fields.map((key, index) => [key, index < 2 ? person : { kind: 'array' as const, nullable: true, items: person }])
              ),
            },
          },
        }
  );
  const h = gridHarness(['oid-a', 'oid-b', 'oid-c'], contracts);
  for (const [oid, record] of h.records)
    h.records.set(oid, {
      ...record,
      metaMetadata: { ...record.metaMetadata, type: 'dataPublication', form: 'dataPublication-1.0-draft' },
      metadata: Object.fromEntries(
        fields.map((key, index) => [key, index < 2 ? { name: 'Synthetic person' } : [{ name: 'Synthetic person' }]])
      ),
    });
  return h;
}
describe('SCU complex metadata selections across mutually exclusive variants', () => {
  it('executes six declared object/list contributors across four real publication stages', async () => {
    const h = harness();
    const catalogue = buildCatalogue(h.contracts, 'dataPublication', [], h.environment).catalogue;
    const selections = catalogue.fields
      .filter(field => fields.some(key => field.id === 'metadata:/' + key))
      .flatMap(field => field.selections.map(selection => selection.selection));
    const query =
      '{records(recordType:"dataPublication",first:25){nodes{oid metadata{__typename ' +
      selections.join(' ') +
      '}}hasNextPage endCursor}}';
    const response = await h.query(query);
    assert.equal(response.body.errors, undefined, JSON.stringify(response.body.errors));
    assert.equal(response.body.data?.records?.nodes.length, 3);
  });
  it('adds repeated concrete fragments instead of treating the same type as exclusive', async () => {
    const h = harness();
    const type = buildCatalogue(h.contracts, 'dataPublication', [], h.environment).catalogue.variants[0].typeName;
    const fragment = (prefix: string) =>
      '... on ' + type + ' {' + Array.from({ length: 110 }, (_, i) => prefix + i + ':title').join(' ') + '}';
    const response = await h.query(
      '{records(recordType:"dataPublication"){nodes{metadata{' + fragment('a') + ' ' + fragment('b') + '}}}}'
    );
    assert.equal(response.body.errors?.[0].extensions.code, 'QUERY_LIMIT');
  });
  it('still rejects more than 200 fields that can execute in the same variant', async () => {
    const h = harness();
    const response = await h.query(
      '{records(recordType:"dataPublication"){nodes{' +
        Array.from({ length: 201 }, (_, i) => 'a' + i + ':oid').join(' ') +
        '}}}'
    );
    assert.equal(response.body.errors?.[0].extensions.code, 'QUERY_LIMIT');
  });
});
