import * as sinon from 'sinon';
import { Controllers } from '../../../src/controllers/webservice/FigshareCrosswalkController';
import {
  CrosswalkRevisionError,
  FigshareTransportError,
  RelationshipBoundaryError,
} from '../../../src/services/figshare-v2/vocabulary-errors';

let expect: Chai.ExpectStatic;

function makeReq(req: Record<string, unknown> = {}): Sails.Req {
  return {
    ...req,
    apiRequest: {
      params: (req.params ?? {}) as Record<string, unknown>,
      query: (req.query ?? {}) as Record<string, unknown>,
      body: req.body,
      files: {},
    },
  } as unknown as Sails.Req;
}

describe('Webservice FigshareCrosswalkController', () => {
  let controller: Controllers.FigshareCrosswalk;
  let service: Record<string, sinon.SinonStub>;
  let sendResp: sinon.SinonStub;
  const res = {} as Sails.Res;

  before(async () => {
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(() => {
    service = {
      listCrosswalks: sinon.stub().resolves({ data: [{ id: 'cw-1' }], meta: { total: 7, limit: 5, offset: 10 } }),
      getCrosswalk: sinon.stub().resolves({ id: 'cw-1', revision: 3 }),
      createCrosswalk: sinon.stub().resolves({ id: 'cw-2' }),
      getCrosswalkUsage: sinon.stub().resolves({ records: 4 }),
      listCrosswalkLocalEntries: sinon
        .stub()
        .resolves({ data: [{ id: 'e1' }], meta: { total: 1, limit: 0, offset: 0 } }),
      listCrosswalkMappings: sinon.stub().resolves({ data: [{ id: 'm1' }], meta: { total: 1, limit: 25, offset: 0 } }),
      saveMappings: sinon.stub().resolves({ id: 'cw-1', revision: 4 }),
      approveCrosswalk: sinon.stub().resolves({ id: 'cw-1', status: 'approved' }),
      deleteCrosswalk: sinon.stub().resolves(),
    };

    (global as any).sails = { log: { error: sinon.stub(), verbose: sinon.stub(), debug: sinon.stub() } };
    (global as any).FigshareVocabularyService = service;
    (global as any).BrandingService = {
      getBrandNameFromReq: sinon.stub().returns('default'),
      getBrand: sinon.stub().returns({ id: 'brand-1' }),
    };

    controller = new Controllers.FigshareCrosswalk();
    sendResp = sinon.stub(controller as any, 'sendResp');
    sinon.stub(controller as any, 'getNoCacheHeaders').returns({ 'Cache-Control': 'no-store' });
  });

  afterEach(() => {
    sinon.restore();
    delete (global as any).FigshareVocabularyService;
    delete (global as any).BrandingService;
    delete (global as any).sails;
  });

  describe('list', () => {
    it('forwards every supported filter', async () => {
      const req = makeReq({
        query: { q: 'anzsrc', status: 'approved', localVocabularyId: 'v-1', sourceId: 's1', limit: 5, offset: 10 },
      });

      await controller.list(req, res);

      expect(service.listCrosswalks.firstCall.args[0]).to.deep.equal({
        q: 'anzsrc',
        status: 'approved',
        localVocabularyId: 'v-1',
        sourceId: 's1',
        limit: 5,
        offset: 10,
      });
    });

    it('wraps the result in a list response with a computed page number', async () => {
      await controller.list(makeReq({ query: {} }), res);

      const data = sendResp.firstCall.args[2]?.data;
      expect(data.records).to.deep.equal([{ id: 'cw-1' }]);
      expect(data.summary.numFound).to.equal(7);
      expect(data.summary.start).to.equal(10);
      expect(data.summary.page).to.equal(3);
    });

    it('resolves the actor from the branding service and request user', async () => {
      const req = makeReq({ query: {} });
      (req as any).user = { id: 7, username: 'jane' };

      await controller.list(req, res);

      expect(service.listCrosswalks.firstCall.args[1]).to.deep.equal({ brandId: 'brand-1', userId: 'jane' });
    });

    it('falls back to the user id then to unknown', async () => {
      const req = makeReq({ query: {} });
      (req as any).user = { id: 7 };
      (global as any).BrandingService.getBrand.returns(undefined);

      await controller.list(req, res);

      expect(service.listCrosswalks.firstCall.args[1]).to.deep.equal({ brandId: '', userId: '7' });

      sendResp.resetHistory();
      service.listCrosswalks.resetHistory();

      await controller.list(makeReq({ query: {} }), res);

      expect(service.listCrosswalks.firstCall.args[1]).to.deep.equal({ brandId: '', userId: 'unknown' });
    });

    it('maps service errors to an error response', async () => {
      service.listCrosswalks.rejects(new Error('boom'));

      await controller.list(makeReq({ query: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(400);
      expect(sendResp.firstCall.args[2]?.displayErrors).to.deep.equal([{ title: 'Bad request', detail: 'boom' }]);
    });
  });

  describe('get', () => {
    it('returns the requested crosswalk', async () => {
      await controller.get(makeReq({ params: { id: 'cw-1' } }), res);

      expect(service.getCrosswalk.firstCall.args[0]).to.equal('cw-1');
      expect(sendResp.firstCall.args[2]?.data).to.deep.equal({ id: 'cw-1', revision: 3 });
    });

    it('coerces a missing id to an empty string', async () => {
      await controller.get(makeReq({ params: {} }), res);

      expect(service.getCrosswalk.firstCall.args[0]).to.equal('');
    });

    it('returns 404 for a cross-brand identifier', async () => {
      service.getCrosswalk.rejects(new RelationshipBoundaryError('not found'));

      await controller.get(makeReq({ params: { id: 'cw-1' } }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(404);
    });
  });

  describe('create', () => {
    it('creates the crosswalk and returns 201', async () => {
      const req = makeReq({ body: { name: 'ANZSRC map', localVocabularyId: 'v-1', sourceId: 's1' } });

      await controller.create(req, res);

      expect(service.createCrosswalk.firstCall.args[0]).to.deep.equal({
        name: 'ANZSRC map',
        localVocabularyId: 'v-1',
        sourceId: 's1',
      });
      expect(sendResp.firstCall.args[2]?.status).to.equal(201);
      expect(sendResp.firstCall.args[2]?.data).to.deep.equal({ id: 'cw-2' });
    });

    it('coerces a non-object body to empty strings', async () => {
      await controller.create(makeReq({ body: 'nope' }), res);

      expect(service.createCrosswalk.firstCall.args[0]).to.deep.equal({
        name: '',
        localVocabularyId: '',
        sourceId: '',
      });
    });

    it('maps service errors to an error response', async () => {
      service.createCrosswalk.rejects(new FigshareTransportError('unreachable'));

      await controller.create(makeReq({ body: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(502);
    });
  });

  describe('usage', () => {
    it('returns the usage summary', async () => {
      await controller.usage(makeReq({ params: { id: 'cw-1' } }), res);

      expect(service.getCrosswalkUsage.firstCall.args[0]).to.equal('cw-1');
      expect(sendResp.firstCall.args[2]?.data).to.deep.equal({ records: 4 });
    });

    it('maps service errors to an error response', async () => {
      service.getCrosswalkUsage.rejects(new Error('nope'));

      await controller.usage(makeReq({ params: { id: 'cw-1' } }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(400);
    });
  });

  describe('listLocalEntries', () => {
    it('coerces the revision to a number', async () => {
      const req = makeReq({
        params: { id: 'cw-1' },
        query: { q: 'bio', mapped: 'false', revision: '3', limit: 10, offset: 0 },
      });

      await controller.listLocalEntries(req, res);

      expect(service.listCrosswalkLocalEntries.firstCall.args[0]).to.equal('cw-1');
      expect(service.listCrosswalkLocalEntries.firstCall.args[1]).to.deep.equal({
        q: 'bio',
        mapped: 'false',
        revision: 3,
        limit: 10,
        offset: 0,
      });
    });

    it('leaves the revision undefined when absent and reports page 1 for a zero page size', async () => {
      await controller.listLocalEntries(makeReq({ params: { id: 'cw-1' }, query: {} }), res);

      expect(service.listCrosswalkLocalEntries.firstCall.args[1]).to.deep.include({ revision: undefined });
      expect(sendResp.firstCall.args[2]?.data.summary.page).to.equal(1);
    });

    it('maps service errors to an error response', async () => {
      service.listCrosswalkLocalEntries.rejects(new Error('nope'));

      await controller.listLocalEntries(makeReq({ params: { id: 'cw-1' }, query: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(400);
    });
  });

  describe('listMappings', () => {
    it('forwards the mapping filters', async () => {
      const req = makeReq({
        params: { id: 'cw-1' },
        query: { status: 'proposed', q: 'bio', revision: '2', limit: 25, offset: 0 },
      });

      await controller.listMappings(req, res);

      expect(service.listCrosswalkMappings.firstCall.args[1]).to.deep.equal({
        status: 'proposed',
        q: 'bio',
        revision: 2,
        limit: 25,
        offset: 0,
      });
    });

    it('leaves the revision undefined when absent', async () => {
      await controller.listMappings(makeReq({ params: { id: 'cw-1' }, query: {} }), res);

      expect(service.listCrosswalkMappings.firstCall.args[1]).to.deep.include({ revision: undefined });
    });

    it('maps service errors to an error response', async () => {
      service.listCrosswalkMappings.rejects(new Error('nope'));

      await controller.listMappings(makeReq({ params: { id: 'cw-1' }, query: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(400);
    });
  });

  describe('saveMappings', () => {
    it('normalises add and remove changes', async () => {
      const req = makeReq({
        params: { id: 'cw-1' },
        body: {
          revision: '3',
          changes: [
            { op: 'add', localEntryId: 'e1', figshareCategoryId: 'f1', matchType: 'exact', status: 'approved' },
            { op: 'remove', localEntryId: 'e2', figshareCategoryId: 'f2' },
            'not-an-object',
          ],
        },
      });

      await controller.saveMappings(req, res);

      expect(service.saveMappings.firstCall.args[0]).to.equal('cw-1');
      expect(service.saveMappings.firstCall.args[1]).to.deep.equal({
        revision: 3,
        changes: [
          { op: 'add', localEntryId: 'e1', figshareCategoryId: 'f1', matchType: 'exact', status: 'approved' },
          { op: 'remove', localEntryId: 'e2', figshareCategoryId: 'f2', matchType: undefined, status: undefined },
          { op: 'add', localEntryId: '', figshareCategoryId: '', matchType: undefined, status: undefined },
        ],
      });
    });

    it('treats an unrecognised op as an add', async () => {
      const req = makeReq({
        params: { id: 'cw-1' },
        body: { revision: 1, changes: [{ op: 'replace', localEntryId: 'e1', figshareCategoryId: 'f1' }] },
      });

      await controller.saveMappings(req, res);

      expect(service.saveMappings.firstCall.args[1].changes[0].op).to.equal('add');
    });

    it('defaults to no changes when the body omits them', async () => {
      await controller.saveMappings(makeReq({ params: { id: 'cw-1' }, body: { revision: 1 } }), res);

      expect(service.saveMappings.firstCall.args[1]).to.deep.equal({ revision: 1, changes: [] });
    });

    it('returns 409 when the revision moved', async () => {
      service.saveMappings.rejects(new CrosswalkRevisionError());

      await controller.saveMappings(makeReq({ params: { id: 'cw-1' }, body: { revision: 1 } }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(409);
    });
  });

  describe('approve', () => {
    it('approves at the supplied revision', async () => {
      await controller.approve(makeReq({ params: { id: 'cw-1' }, body: { revision: '3' } }), res);

      expect(service.approveCrosswalk.firstCall.args[0]).to.equal('cw-1');
      expect(service.approveCrosswalk.firstCall.args[1]).to.equal(3);
      expect(sendResp.firstCall.args[2]?.data).to.deep.equal({ id: 'cw-1', status: 'approved' });
    });

    it('maps service errors to an error response', async () => {
      service.approveCrosswalk.rejects(new CrosswalkRevisionError('stale'));

      await controller.approve(makeReq({ params: { id: 'cw-1' }, body: { revision: 1 } }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(409);
      expect(sendResp.firstCall.args[2]?.displayErrors[0].detail).to.equal('stale');
    });
  });

  describe('delete', () => {
    it('returns 204 with no body', async () => {
      await controller.delete(makeReq({ params: { id: 'cw-1' } }), res);

      expect(service.deleteCrosswalk.firstCall.args[0]).to.equal('cw-1');
      expect(sendResp.firstCall.args[2]?.status).to.equal(204);
      expect(sendResp.firstCall.args[2]?.data).to.be.undefined;
    });

    it('maps service errors to an error response', async () => {
      service.deleteCrosswalk.rejects(new RelationshipBoundaryError('not found'));

      await controller.delete(makeReq({ params: { id: 'cw-1' } }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(404);
    });
  });
});
