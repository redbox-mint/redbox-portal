import assert from 'node:assert/strict';
import * as lodash from 'lodash';
import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/RecordController';
import { RecordsService, RecordRelationshipGraph } from '../../src/RecordsService';
import { BrandingModel } from '../../src/model/storage/BrandingModel';

describe('Record relationship authorization', () => {
  const brand = Object.assign(new BrandingModel(), { id: 'brand-1', name: 'default' });
  class TestRecordController extends Controllers.Record {
    public override sendResp = sinon.stub();
  }
  let controller: TestRecordController;
  let getMeta: sinon.SinonStub;
  let getRelatedRecords: sinon.SinonStub;
  let hasViewAccess: sinon.SinonStub;
  let sendResp: sinon.SinonStub;
  let req: Sails.Req;
  let res: Sails.Res;
  let savedGlobals: Record<string, unknown>;

  function record(oid: string, brandId = brand.id) {
    return {
      redboxOid: oid,
      metaMetadata: { brandId, type: 'rdmp' },
      metadata: { title: `Private metadata for ${oid}` },
      authorization: { view: ['alice'], viewRoles: ['Researcher'] },
    };
  }

  beforeEach(() => {
    savedGlobals = {
      sails: Reflect.get(globalThis, 'sails'),
      _: Reflect.get(globalThis, '_'),
    };
    Object.assign(globalThis, {
      sails: { log: { verbose: sinon.stub() } },
      _: lodash,
    });
    controller = new TestRecordController();
    getMeta = sinon.stub().resolves(record('root'));
    getRelatedRecords = sinon.stub().resolves({
      rootOid: 'root',
      relatedObjects: { rdmp: [record('root')] },
      edges: [],
      omittedByAccess: {},
    });
    hasViewAccess = sinon.stub().returns(true);
    controller.recordsService = { getMeta, getRelatedRecords, hasViewAccess } as unknown as RecordsService;
    sinon.stub(controller as unknown as { getReqBrand(): BrandingModel }, 'getReqBrand').returns(brand);
    sendResp = controller.sendResp;
    req = {
      param: (name: string) => (name === 'oid' ? 'root' : undefined),
      query: { relationshipDepth: '0' },
      user: { username: 'alice', roles: [{ id: 'researcher-1', name: 'Researcher' }] },
    } as unknown as Sails.Req;
    res = {} as Sails.Res;
  });

  afterEach(() => {
    sinon.restore();
    Object.assign(globalThis, savedGlobals);
  });

  it('rejects an inaccessible root before traversing, including at depth zero', async () => {
    hasViewAccess.returns(false);
    await controller.getRelatedRecords(req, res);
    assert.equal(sendResp.firstCall.args[2].status, 403);
    sinon.assert.notCalled(getRelatedRecords);
    sinon.assert.calledOnce(sendResp);
  });

  it('rejects a foreign-tenant root even when usernames or role names grant access', async () => {
    getMeta.resolves(record('root', 'brand-2'));
    await controller.getRelatedRecords(req, res);
    assert.equal(sendResp.firstCall.args[2].status, 404);
    sinon.assert.notCalled(hasViewAccess);
    sinon.assert.notCalled(getRelatedRecords);
  });

  it('does not traverse a root without a stored tenant', async () => {
    getMeta.resolves({ redboxOid: 'root', metadata: {} });
    await controller.getRelatedRecords(req, res);
    assert.equal(sendResp.firstCall.args[2].status, 404);
    sinon.assert.notCalled(getRelatedRecords);
  });

  it('rejects a missing OID before loading metadata', async () => {
    req.param = (() => '') as Sails.Req['param'];
    await controller.getRelatedRecords(req, res);
    assert.equal(sendResp.firstCall.args[2].status, 400);
    sinon.assert.notCalled(getMeta);
    sinon.assert.notCalled(getRelatedRecords);
  });

  it('returns 404 for a missing root', async () => {
    getMeta.resolves(null);
    await controller.getRelatedRecords(req, res);
    assert.equal(sendResp.firstCall.args[2].status, 404);
    sinon.assert.notCalled(getRelatedRecords);
  });

  it('handles storage failures without returning a graph', async () => {
    const storageError = new Error('Storage unavailable');
    getMeta.rejects(storageError);
    await controller.getRelatedRecords(req, res);
    sinon.assert.calledOnceWithExactly(getMeta, 'root');
    assert.equal(sendResp.firstCall.args[2].status, 500);
    assert.deepEqual(sendResp.firstCall.args[2].errors, [storageError]);
    assert.equal(sendResp.firstCall.args[2].data, undefined);
    sinon.assert.notCalled(getRelatedRecords);
  });

  it('enforces root authorization for internal callers too', async () => {
    hasViewAccess.returns(false);
    const result = await controller.getRelatedRecordsInternal(req, res);
    assert.equal(result, undefined);
    assert.equal(sendResp.firstCall.args[2].status, 403);
    sinon.assert.notCalled(getRelatedRecords);
  });

  it('preserves the legacy graph response for an authorized root', async () => {
    await controller.getRelatedRecords(req, res);
    sinon.assert.calledOnceWithExactly(getMeta, 'root');
    sinon.assert.calledOnce(sendResp);
    assert.equal(getRelatedRecords.firstCall.args[2].depth, 0);
    assert.deepEqual(sendResp.firstCall.args[2].data, {
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
    hasViewAccess.callsFake((_brand, _user, _roles, candidate) => candidate.redboxOid !== 'denied');

    await controller.getRelatedRecords(req, res);

    const response = sendResp.firstCall.args[2].data;
    assert.deepEqual(response.relatedObjects.rdmp, [record('root'), record('allowed')]);
    assert.deepEqual(response.edges, allowedEdges);
    assert.deepEqual(response.omittedByAccess, { related: 3 });
  });

  it('does not exempt the root returned by traversal from access checks', async () => {
    hasViewAccess.onFirstCall().returns(true);
    hasViewAccess.onSecondCall().returns(false);
    await controller.getRelatedRecords(req, res);
    assert.deepEqual(sendResp.firstCall.args[2].data.relatedObjects, {});
  });
});
