import * as sinon from 'sinon';
import { Controllers } from '../../../src/controllers/webservice/FigshareVocabularyController';
import {
  CatalogueInvalidError,
  CrosswalkRevisionError,
  FigshareTransportError,
  FigshareVocabularyError,
  PreviewExpiredError,
  RelationshipBoundaryError,
  SnapshotTooLargeError,
  StalePreviewError,
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

describe('Webservice FigshareVocabularyController', () => {
  let controller: Controllers.FigshareVocabulary;
  let service: Record<string, sinon.SinonStub>;
  let sendResp: sinon.SinonStub;
  const res = {} as Sails.Res;

  before(async () => {
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(() => {
    service = {
      discoverTaxonomies: sinon.stub().resolves([{ taxonomyId: 't1' }]),
      listSources: sinon.stub().resolves({ data: [{ id: 's1' }], meta: { total: 3, limit: 10, offset: 20 } }),
      getSource: sinon.stub().resolves({ id: 's1', scope: 'institution', taxonomyId: 't1' }),
      listSourceCategories: sinon.stub().resolves({ data: [{ id: 'c1' }], meta: { total: 1, limit: 25, offset: 0 } }),
      cloneMirror: sinon.stub().resolves({ id: 'v-clone' }),
      listSyncRuns: sinon.stub().resolves({ data: [{ id: 'r1' }], meta: { total: 1, limit: 0, offset: 0 } }),
      createPreview: sinon.stub().resolves({ runId: 'run-1' }),
      getPreview: sinon.stub().resolves({ runId: 'run-1', proposals: [] }),
      applyPreview: sinon.stub().resolves({ runId: 'run-1', applied: 2 }),
    };

    (global as any).sails = { log: { error: sinon.stub(), verbose: sinon.stub(), debug: sinon.stub() } };
    (global as any).FigshareVocabularyService = service;
    (global as any).BrandingService = {
      getBrandNameFromReq: sinon.stub().returns('default'),
      getBrand: sinon.stub().returns({ id: 'brand-1' }),
    };

    controller = new Controllers.FigshareVocabulary();
    sendResp = sinon.stub(controller as any, 'sendResp');
    sinon.stub(controller as any, 'getNoCacheHeaders').returns({ 'Cache-Control': 'no-store' });
  });

  afterEach(() => {
    sinon.restore();
    delete (global as any).FigshareVocabularyService;
    delete (global as any).BrandingService;
    delete (global as any).sails;
  });

  describe('listCatalogues', () => {
    it('passes the requested scope through to the service', async () => {
      await controller.listCatalogues(makeReq({ query: { scope: 'institution' } }), res);

      expect(service.discoverTaxonomies.calledOnce).to.be.true;
      expect(service.discoverTaxonomies.firstCall.args[0]).to.deep.equal({ scope: 'institution' });
      expect(sendResp.firstCall.args[2]?.data).to.deep.equal([{ taxonomyId: 't1' }]);
      expect(sendResp.firstCall.args[2]?.headers).to.deep.equal({ 'Cache-Control': 'no-store' });
    });

    it('coerces a missing scope to an empty string', async () => {
      await controller.listCatalogues(makeReq(), res);

      expect(service.discoverTaxonomies.firstCall.args[0]).to.deep.equal({ scope: '' });
    });

    it('maps service errors to an error response', async () => {
      service.discoverTaxonomies.rejects(new CatalogueInvalidError('bad catalogue'));

      await controller.listCatalogues(makeReq({ query: { scope: 'group' } }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(422);
      expect(sendResp.firstCall.args[2]?.displayErrors).to.deep.equal([
        { title: 'Unprocessable request', detail: 'bad catalogue' },
      ]);
    });

    it('falls back to 400 for an unrecognised vocabulary error code', async () => {
      service.discoverTaxonomies.rejects(new FigshareVocabularyError('something-new' as any, 'unhandled'));

      await controller.listCatalogues(makeReq({ query: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(400);
      expect(sendResp.firstCall.args[2]?.displayErrors).to.deep.equal([{ title: 'Bad request', detail: 'unhandled' }]);
    });

    it('stringifies a non-Error rejection', async () => {
      service.discoverTaxonomies.returns(Promise.reject('plain failure'));

      await controller.listCatalogues(makeReq({ query: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(400);
    });
  });

  describe('actor context', () => {
    it('prefers the username over the numeric id', async () => {
      const req = makeReq({ query: {} });
      (req as any).user = { id: 42, username: 'jane' };

      await controller.listCatalogues(req, res);

      expect(service.discoverTaxonomies.firstCall.args[1]).to.deep.equal({ brandId: 'brand-1', userId: 'jane' });
    });

    it('falls back to the user id when no username is present', async () => {
      const req = makeReq({ query: {} });
      (req as any).user = { id: 42 };

      await controller.listCatalogues(req, res);

      expect(service.discoverTaxonomies.firstCall.args[1]).to.deep.equal({ brandId: 'brand-1', userId: '42' });
    });

    it('falls back to unknown actor and empty brand when neither resolves', async () => {
      (global as any).BrandingService.getBrand.returns(undefined);

      await controller.listCatalogues(makeReq({ query: {} }), res);

      expect(service.discoverTaxonomies.firstCall.args[1]).to.deep.equal({ brandId: '', userId: 'unknown' });
    });
  });

  describe('listSources', () => {
    it('forwards the filter and paging options', async () => {
      await controller.listSources(makeReq({ query: { q: 'anzsrc', scope: 'group', limit: 10, offset: 20 } }), res);

      expect(service.listSources.firstCall.args[0]).to.deep.equal({
        q: 'anzsrc',
        scope: 'group',
        limit: 10,
        offset: 20,
      });
    });

    it('wraps the result in a list response with a computed page number', async () => {
      await controller.listSources(makeReq({ query: {} }), res);

      const data = sendResp.firstCall.args[2]?.data;
      expect(data.records).to.deep.equal([{ id: 's1' }]);
      expect(data.summary.numFound).to.equal(3);
      expect(data.summary.start).to.equal(20);
      expect(data.summary.page).to.equal(3);
    });

    it('maps service errors to an error response', async () => {
      service.listSources.rejects(new Error('boom'));

      await controller.listSources(makeReq({ query: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(400);
    });
  });

  describe('getSource', () => {
    it('returns the requested source', async () => {
      await controller.getSource(makeReq({ params: { sourceId: 's1' } }), res);

      expect(service.getSource.firstCall.args[0]).to.equal('s1');
      expect(sendResp.firstCall.args[2]?.data).to.deep.include({ id: 's1' });
    });

    it('coerces a missing source id to an empty string', async () => {
      await controller.getSource(makeReq({ params: {} }), res);

      expect(service.getSource.firstCall.args[0]).to.equal('');
    });

    it('returns 404 when the source crosses a relationship boundary', async () => {
      service.getSource.rejects(new RelationshipBoundaryError('not yours'));

      await controller.getSource(makeReq({ params: { sourceId: 's1' } }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(404);
    });
  });

  describe('listSourceCategories', () => {
    it('converts the string flags to booleans', async () => {
      const req = makeReq({
        params: { sourceId: 's1' },
        query: { q: 'bio', includeHistorical: 'true', selectableOnly: 'true', limit: 25, offset: 0 },
      });

      await controller.listSourceCategories(req, res);

      expect(service.listSourceCategories.firstCall.args[0]).to.equal('s1');
      expect(service.listSourceCategories.firstCall.args[1]).to.deep.equal({
        q: 'bio',
        includeHistorical: true,
        selectableOnly: true,
        limit: 25,
        offset: 0,
      });
    });

    it('defaults the flags to false when absent', async () => {
      await controller.listSourceCategories(makeReq({ params: { sourceId: 's1' }, query: {} }), res);

      expect(service.listSourceCategories.firstCall.args[1]).to.deep.include({
        includeHistorical: false,
        selectableOnly: false,
      });
    });

    it('maps service errors to an error response', async () => {
      service.listSourceCategories.rejects(new SnapshotTooLargeError('too big'));

      await controller.listSourceCategories(makeReq({ params: { sourceId: 's1' }, query: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(422);
      expect(sendResp.firstCall.args[2]?.displayErrors[0].title).to.equal('Catalogue too large');
    });
  });

  describe('createSourcePreview', () => {
    it('derives the scope and taxonomy from the stored source', async () => {
      const req = makeReq({
        params: { sourceId: 's1' },
        body: { crosswalkId: 'cw-1', localVocabularyId: 'v-1' },
      });

      await controller.createSourcePreview(req, res);

      expect(service.createPreview.firstCall.args[0]).to.deep.equal({
        scope: 'institution',
        taxonomyId: 't1',
        sourceId: 's1',
        crosswalkId: 'cw-1',
        localVocabularyId: 'v-1',
      });
      expect(sendResp.firstCall.args[2]?.status).to.equal(201);
    });

    it('leaves the optional identifiers undefined when not supplied', async () => {
      await controller.createSourcePreview(makeReq({ params: { sourceId: 's1' }, body: {} }), res);

      expect(service.createPreview.firstCall.args[0]).to.deep.include({
        crosswalkId: undefined,
        localVocabularyId: undefined,
      });
    });

    it('treats a non-object body as an empty payload', async () => {
      await controller.createSourcePreview(makeReq({ params: { sourceId: 's1' }, body: ['nope'] }), res);

      expect(service.createPreview.firstCall.args[0]).to.deep.include({ crosswalkId: undefined });
    });

    it('maps service errors to an error response', async () => {
      service.createPreview.rejects(new FigshareTransportError('figshare down', 503));

      await controller.createSourcePreview(makeReq({ params: { sourceId: 's1' }, body: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(502);
      expect(sendResp.firstCall.args[2]?.displayErrors[0].title).to.equal('Figshare unavailable');
    });
  });

  describe('cloneSource', () => {
    it('creates the mirror clone and returns 201', async () => {
      const req = makeReq({ params: { sourceId: 's1' }, body: { name: 'Local ANZSRC', slug: 'local-anzsrc' } });

      await controller.cloneSource(req, res);

      expect(service.cloneMirror.firstCall.args[0]).to.equal('s1');
      expect(service.cloneMirror.firstCall.args[1]).to.deep.equal({ name: 'Local ANZSRC', slug: 'local-anzsrc' });
      expect(sendResp.firstCall.args[2]?.status).to.equal(201);
      expect(sendResp.firstCall.args[2]?.data).to.deep.equal({ id: 'v-clone' });
    });

    it('omits the slug when it is not supplied', async () => {
      await controller.cloneSource(makeReq({ params: { sourceId: 's1' }, body: { name: 'Local' } }), res);

      expect(service.cloneMirror.firstCall.args[1]).to.deep.equal({ name: 'Local', slug: undefined });
    });

    it('maps service errors to an error response', async () => {
      service.cloneMirror.rejects(new Error('duplicate slug'));

      await controller.cloneSource(makeReq({ params: { sourceId: 's1' }, body: { name: 'Local' } }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(400);
      expect(sendResp.firstCall.args[2]?.displayErrors[0].detail).to.equal('duplicate slug');
    });
  });

  describe('listSyncRuns', () => {
    it('forwards the source filter and paging', async () => {
      await controller.listSyncRuns(makeReq({ query: { sourceId: 's1', limit: 5, offset: 5 } }), res);

      expect(service.listSyncRuns.firstCall.args[0]).to.deep.equal({ sourceId: 's1', limit: 5, offset: 5 });
    });

    it('reports page 1 when the service returns a zero page size', async () => {
      await controller.listSyncRuns(makeReq({ query: {} }), res);

      expect(sendResp.firstCall.args[2]?.data.summary.page).to.equal(1);
    });

    it('maps service errors to an error response', async () => {
      service.listSyncRuns.rejects(new Error('nope'));

      await controller.listSyncRuns(makeReq({ query: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(400);
    });
  });

  describe('createPreview', () => {
    it('passes the full preview request through', async () => {
      const req = makeReq({
        body: {
          scope: 'group',
          taxonomyId: 't9',
          sourceId: 's1',
          crosswalkId: 'cw-1',
          localVocabularyId: 'v-1',
          createLocalClone: true,
          localCloneName: 'Clone',
          localCloneSlug: 'clone',
        },
      });

      await controller.createPreview(req, res);

      expect(service.createPreview.firstCall.args[0]).to.deep.equal({
        scope: 'group',
        taxonomyId: 't9',
        sourceId: 's1',
        crosswalkId: 'cw-1',
        localVocabularyId: 'v-1',
        createLocalClone: true,
        localCloneName: 'Clone',
        localCloneSlug: 'clone',
      });
      expect(sendResp.firstCall.args[2]?.status).to.equal(201);
    });

    it('defaults every optional field when the body is empty', async () => {
      await controller.createPreview(makeReq({ body: {} }), res);

      expect(service.createPreview.firstCall.args[0]).to.deep.equal({
        scope: '',
        taxonomyId: '',
        sourceId: undefined,
        crosswalkId: undefined,
        localVocabularyId: undefined,
        createLocalClone: false,
        localCloneName: undefined,
        localCloneSlug: undefined,
      });
    });

    it('maps service errors to an error response', async () => {
      service.createPreview.rejects(new CatalogueInvalidError('empty catalogue'));

      await controller.createPreview(makeReq({ body: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(422);
    });
  });

  describe('getPreview', () => {
    it('honours the diff view and filters', async () => {
      const req = makeReq({
        params: { runId: 'run-1' },
        query: {
          view: 'diff',
          changeClass: 'added',
          matchType: 'exact',
          q: 'bio',
          unresolvedOnly: 'true',
          historicalOnly: 'true',
          limit: 50,
          offset: 100,
        },
      });

      await controller.getPreview(req, res);

      expect(service.getPreview.firstCall.args[0]).to.equal('run-1');
      expect(service.getPreview.firstCall.args[1]).to.deep.equal({
        view: 'diff',
        changeClass: 'added',
        matchType: 'exact',
        q: 'bio',
        unresolvedOnly: true,
        historicalOnly: true,
        limit: 50,
        offset: 100,
      });
    });

    it('falls back to the proposals view and false flags', async () => {
      await controller.getPreview(makeReq({ params: { runId: 'run-1' }, query: { view: 'anything' } }), res);

      expect(service.getPreview.firstCall.args[1]).to.deep.include({
        view: 'proposals',
        unresolvedOnly: false,
        historicalOnly: false,
      });
    });

    it('returns 410 once the preview has expired', async () => {
      service.getPreview.rejects(new PreviewExpiredError());

      await controller.getPreview(makeReq({ params: { runId: 'run-1' }, query: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(410);
      expect(sendResp.firstCall.args[2]?.displayErrors[0].title).to.equal('Preview expired');
    });
  });

  describe('applyPreview', () => {
    it('normalises the approved proposals and manual mappings', async () => {
      const req = makeReq({
        params: { runId: 'run-1' },
        body: {
          remoteHash: 'hash-1',
          expectedRevision: '4',
          approvedProposalIds: ['p1', 2],
          manualMappings: [
            { localEntryId: 'e1', localEntryKey: 'key-1', figshareSourceIds: ['f1', 2] },
            { figshareSourceIds: 'not-an-array' },
            'not-an-object',
          ],
        },
      });

      await controller.applyPreview(req, res);

      expect(service.applyPreview.firstCall.args[0]).to.equal('run-1');
      expect(service.applyPreview.firstCall.args[1]).to.deep.equal({
        remoteHash: 'hash-1',
        expectedRevision: 4,
        approvedProposalIds: ['p1', '2'],
        manualMappings: [
          { localEntryId: 'e1', localEntryKey: 'key-1', figshareSourceIds: ['f1', '2'] },
          { localEntryId: undefined, localEntryKey: undefined, figshareSourceIds: [] },
          { localEntryId: undefined, localEntryKey: undefined, figshareSourceIds: [] },
        ],
      });
      expect(sendResp.firstCall.args[2]?.data).to.deep.equal({ runId: 'run-1', applied: 2 });
    });

    it('defaults the collections to empty arrays', async () => {
      await controller.applyPreview(makeReq({ params: { runId: 'run-1' }, body: {} }), res);

      expect(service.applyPreview.firstCall.args[1]).to.deep.equal({
        remoteHash: '',
        expectedRevision: undefined,
        approvedProposalIds: [],
        manualMappings: [],
      });
    });

    it('returns 409 when the preview is stale', async () => {
      service.applyPreview.rejects(new StalePreviewError());

      await controller.applyPreview(makeReq({ params: { runId: 'run-1' }, body: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(409);
    });

    it('returns 409 when the crosswalk revision moved', async () => {
      service.applyPreview.rejects(new CrosswalkRevisionError());

      await controller.applyPreview(makeReq({ params: { runId: 'run-1' }, body: {} }), res);

      expect(sendResp.firstCall.args[2]?.status).to.equal(409);
      expect(sendResp.firstCall.args[2]?.displayErrors[0].title).to.equal('Conflict');
    });
  });
});
