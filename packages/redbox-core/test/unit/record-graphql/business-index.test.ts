import assert from 'node:assert/strict';
import { buildCatalogue } from '../../../src/record-graphql/catalogue';
import { gridContracts, gridEnvironment } from '../../fixtures/record-grid.fixtures';

describe('Business metadata capabilities with Mongo collections', () => {
  it('exposes declared business scalars without Solr opt-in mappings', () => {
    const fields = buildCatalogue(gridContracts(), 'grid-fixture', [], gridEnvironment()).catalogue.fields;
    for (const id of ['metadata:/title', 'metadata:/amount', 'metadata:/active', 'metadata:/eventDate', 'metadata:/dc:title']) {
      const field = fields.find(item => item.id === id)!;
      assert.equal(field.filterable, true, id);
      assert.equal(field.sortable, true, id);
      assert.ok(field.operators.includes('EQ'), id);
    }
  });
  it('keeps repeating and private fields unavailable to Mongo scalar predicates', () => {
    const contracts = gridContracts();
    for (const contract of contracts)
      contract.root.properties.tags = { kind: 'array', nullable: true, items: { kind: 'scalar', scalarType: 'string', nullable: true } };
    const fields = buildCatalogue(contracts, 'grid-fixture', [], gridEnvironment()).catalogue.fields;
    const tags = fields.find(item => item.id === 'metadata:/tags')!;
    assert.equal(tags.filterable, false);
    assert.equal(tags.sortable, false);
    assert.equal(fields.some(item => item.id === 'metadata:/secret'), false);
  });
});
