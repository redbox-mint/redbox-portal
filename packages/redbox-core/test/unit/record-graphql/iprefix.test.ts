import assert from 'node:assert/strict';
import { buildCatalogue } from '../../../src/record-graphql/catalogue';
import { queryPlan } from '../../../src/record-graphql/collection';
import { gridContracts, gridEnvironment, gridHarness } from '../../fixtures/record-grid.fixtures';

describe('Contract-derived literal prefix capability', () => {
  it('advertises IPREFIX on readable scalar strings without index configuration', () => {
    const snapshot = buildCatalogue(gridContracts(), 'grid-fixture', [], gridEnvironment());
    for (const id of ['metadata:/title', 'metadata:/details/note', 'metadata:/dc:title', 'record:oid'])
      assert.ok(snapshot.catalogue.fields.find(field => field.id === id)?.operators.includes('IPREFIX'));
    for (const id of ['metadata:/secret', 'metadata:/people', 'metadata:/active', 'metadata:/publication_note'])
      assert.ok(!snapshot.catalogue.fields.find(field => field.id === id)?.operators.includes('IPREFIX'));
    const plan = queryPlan(
      { recordType: 'grid-fixture', filters: [{ field: 'metadata:/title', iprefix: 'UON-ΟΣ*' }] },
      snapshot
    );
    assert.deepEqual(plan.filters[0].values, ['UON-ΟΣ*']);
  });
  it('rejects empty, null, malformed and oversized prefixes before storage reads', async () => {
    const h = gridHarness();
    for (const prefix of ['', null, '\ud800', 'a'.repeat(257), 'é'.repeat(129)]) {
      const response = await h.query(
        'query($prefix:String){records(recordType:"grid-fixture",filters:[{field:"metadata:/title",iprefix:$prefix}]){hasNextPage}}',
        { prefix }
      );
      assert.equal(response.body.errors?.[0].extensions.code, 'INVALID_FILTER_VALUE');
    }
    assert.equal(h.calls.length, 0);
  });
});
