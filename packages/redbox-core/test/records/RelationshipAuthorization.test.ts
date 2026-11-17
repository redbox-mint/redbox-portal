import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { filterRelationshipGraph } from '../../src/records/relationships';
import { hasViewAccess } from '../../src/records/access';
import { BrandingModel } from '../../src/model/storage/BrandingModel';

describe('Record relationship authorization', () => {
  const brand = Object.assign(new BrandingModel(), { id: 'brand-1', name: 'default' });
  const getRelatedRecords = sinon.stub();
  const record = (redboxOid: string) => ({ redboxOid, metaMetadata: { brandId: brand.id, type: 'rdmp' }, metadata: { title: `Private metadata for ${redboxOid}` }, authorization: { view: ['alice'], viewRoles: ['Researcher'] } });
  it('enforces root authorization in the shared domain filter too', async () => {
    const candidate = { ...record('root'), authorization: {} };
    const graph = { rootOid: 'root', relatedObjects: { rdmp: [candidate] }, edges: [], omittedByAccess: {} };
    const result = await filterRelationshipGraph(brand, { username: 'alice' }, graph, async (selected, actor, row) =>
      hasViewAccess(selected, actor!, [], row)
    );
    assert.deepEqual(result.relatedObjects, {});
    sinon.assert.notCalled(getRelatedRecords);
  });

});
