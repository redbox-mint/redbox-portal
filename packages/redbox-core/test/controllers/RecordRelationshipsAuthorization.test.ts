import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRecordReadsFixture } from '../helpers/httpRecordReadsFixture';
import { filterRelationshipGraph } from '../../src/records/relationships';
import { hasViewAccess } from '../../src/records/access';
import type { RecordRelationshipGraph } from '../../src/RecordsService';
import { BrandingModel } from '../../src/model/storage/BrandingModel';

describe('Record relationship authorization', () => {
  const brand = Object.assign(new BrandingModel(), { id: 'brand-1', name: 'default' });
  let f: Awaited<ReturnType<typeof httpRecordReadsFixture>>;
  let getMeta: sinon.SinonStub, getRelatedRecords: sinon.SinonStub;
  let response: Awaited<ReturnType<typeof f.request>>;
  let oid: string;
  async function request() {
    response = await f.request(`/default/portal/record/${oid}/relatedRecords?relationshipDepth=0`, {
      headers: { 'X-ReDBox-Api-Version': '2.0' },
    });
  }

  function record(oid: string, brandId = brand.id) {
    return {
      redboxOid: oid,
      metaMetadata: { brandId, type: 'rdmp' },
      metadata: { title: `Private metadata for ${oid}` },
      authorization: { view: ['alice'], viewRoles: ['Researcher'] },
    };
  }

  beforeEach(async () => {
    f = await httpRecordReadsFixture();
    getMeta = f.storage.getMeta.resolves(record('root'));
    getRelatedRecords = f.storage.getRelatedRecords.resolves({
      rootOid: 'root',
      relatedObjects: { rdmp: [record('root')] },
      edges: [],
      omittedByAccess: {},
    });
    oid = 'root';
  });
  afterEach(async () => {
    await f.close();
    sinon.restore();
  });

  it('rejects an inaccessible root before traversing, including at depth zero', async () => {
    getMeta.resolves({ ...record('root'), authorization: {} });
    await request();
    assert.equal(response.status, 403);
    sinon.assert.notCalled(getRelatedRecords);
  });

  it('rejects a foreign-tenant root even when usernames or role names grant access', async () => {
    getMeta.resolves(record('root', 'brand-2'));
    await request();
    assert.equal(response.status, 404);
    sinon.assert.notCalled(getRelatedRecords);
  });

  it('does not traverse a root without a stored tenant', async () => {
    getMeta.resolves({ redboxOid: 'root', metadata: {} });
    await request();
    assert.equal(response.status, 404);
    sinon.assert.notCalled(getRelatedRecords);
  });

  it('rejects a missing OID before loading metadata', async () => {
    oid = '';
    await request();
    assert.equal(response.status, 404);
    sinon.assert.notCalled(getMeta);
    sinon.assert.notCalled(getRelatedRecords);
  });

  it('returns 404 for a missing root', async () => {
    getMeta.resolves(null);
    await request();
    assert.equal(response.status, 404);
    sinon.assert.notCalled(getRelatedRecords);
  });

  it('handles storage failures without returning a graph', async () => {
    const storageError = new Error('Storage unavailable');
    getMeta.rejects(storageError);
    await request();
    sinon.assert.calledOnceWithExactly(getMeta, 'root');
    assert.equal(response.status, 500);
    assert.ok(!response.text.includes(storageError.message));
    sinon.assert.calledWith(f.log.error, storageError);
    assert.equal(response.body.data, undefined);
    sinon.assert.notCalled(getRelatedRecords);
  });

  it('enforces root authorization in the shared domain filter too', async () => {
    const candidate = { ...record('root'), authorization: {} };
    const graph = { rootOid: 'root', relatedObjects: { rdmp: [candidate] }, edges: [], omittedByAccess: {} };
    const result = await filterRelationshipGraph(brand, { username: 'alice' }, graph, async (selected, actor, row) =>
      hasViewAccess(selected, actor!, [], row)
    );
    assert.deepEqual(result.relatedObjects, {});
    sinon.assert.notCalled(getRelatedRecords);
  });

  it('preserves the legacy graph response for an authorized root', async () => {
    await request();
    sinon.assert.calledOnceWithExactly(getMeta, 'root');
    assert.equal(getRelatedRecords.firstCall.args[2].depth, 0);
    assert.deepEqual(response.body.data, {
      rootOid: 'root',
      relatedObjects: { rdmp: [record('root')] },
      edges: [],
      omittedByAccess: {},
      processedRelationships: ['rdmp'],
    });
  });

  it('filters unauthorized and foreign-tenant nodes and edges in both directions', async () => {
    const edge = (sourceOid: string, targetOid: string) => ({
      relationId: 'related',
      sourceOid,
      targetOid,
      targetRecordType: 'rdmp',
    });
    const allowedEdges = [edge('root', 'allowed'), edge('allowed', 'root')];
    const graph: RecordRelationshipGraph = {
      rootOid: 'root',
      relatedObjects: { rdmp: [record('root'), record('allowed'), record('denied'), record('foreign', 'brand-2')] },
      edges: [...allowedEdges, edge('root', 'denied'), edge('denied', 'root'), edge('foreign', 'allowed')],
      omittedByAccess: {},
    };
    getRelatedRecords.resolves(graph);
    (graph.relatedObjects.rdmp[2] as any).authorization = {};

    await request();

    const data = response.body.data;
    assert.deepEqual(data.relatedObjects.rdmp, [record('root'), record('allowed')]);
    assert.deepEqual(data.edges, allowedEdges);
    assert.deepEqual(data.omittedByAccess, { related: 3 });
  });

  it('does not exempt the root returned by traversal from access checks', async () => {
    getRelatedRecords.resolves({
      rootOid: 'root',
      relatedObjects: { rdmp: [{ ...record('root'), authorization: {} }] },
      edges: [],
      omittedByAccess: {},
    });
    await request();
    assert.deepEqual(response.body.data.relatedObjects, {});
  });
});
