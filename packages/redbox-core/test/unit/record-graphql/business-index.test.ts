import assert from 'node:assert/strict';
import { buildCatalogue } from '../../../src/record-graphql/catalogue';
import { gridContracts, gridEnvironment } from '../../fixtures/record-grid.fixtures';

describe('Business metadata capabilities with Mongo collections', () => {
  it('exposes declared business scalars without Solr opt-in mappings', () => {
    const fields = buildCatalogue(gridContracts(), 'grid-fixture', [], gridEnvironment()).catalogue.fields;
    for (const id of [
      'metadata:/title',
      'metadata:/amount',
      'metadata:/active',
      'metadata:/eventDate',
      'metadata:/dc:title',
    ]) {
      const field = fields.find(item => item.id === id)!;
      assert.equal(field.filterable, true, id);
      assert.equal(field.sortable, true, id);
      assert.ok(field.operators.includes('EQ'), id);
    }
  });
  it('exposes declared scalar lists with LIST cardinality and keeps object lists and private fields unavailable', () => {
    const contracts = gridContracts();
    for (const contract of contracts)
      Object.assign(contract.root.properties, {
        tags: { kind: 'array', nullable: true, items: { kind: 'scalar', scalarType: 'string', nullable: true } },
      });
    const fields = buildCatalogue(contracts, 'grid-fixture', [], gridEnvironment()).catalogue.fields;
    const tags = fields.find(item => item.id === 'metadata:/tags')!;
    assert.equal(tags.cardinality, 'LIST');
    assert.equal(tags.filterable, true);
    assert.equal(tags.sortable, true);
    const people = fields.find(item => item.id === 'metadata:/people')!;
    assert.equal(people.cardinality, 'LIST');
    assert.equal(people.filterable, false);
    assert.equal(people.sortable, false);
    assert.equal(people.unavailableReason, 'REPEATING_FIELD');
    assert.equal(
      fields.some(item => item.id === 'metadata:/secret'),
      false
    );
  });
});
