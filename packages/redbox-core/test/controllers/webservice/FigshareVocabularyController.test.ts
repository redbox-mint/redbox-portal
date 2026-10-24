import * as sinon from 'sinon';
import { httpRouteFixture } from '../../helpers/httpRouteFixture';
import {
  mountFigshareAdministrationRoutes,
  figshareAdministrationRoutes,
} from '../../../src/http/express/figshareAdministration';
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

describe('Webservice FigshareVocabularyController', () => {
  let fixture: Awaited<ReturnType<typeof httpRouteFixture>>;
  let response: Awaited<ReturnType<typeof fixture.request>>;
  const makeReq = (value: any = {}) => value;
  async function request(action: string, value: any) {
    const route = figshareAdministrationRoutes.find(route => route.action === action)!;
    const params = { branding: 'default', portal: 'portal', ...value.params };
    const path = route.path.replace(/:([A-Za-z]+)/g, (_match, key) => encodeURIComponent(params[key] ?? 'missing'));
    const query = new URLSearchParams(Object.entries(value.query ?? {}).map(([key, value]) => [key, String(value)]));
    if (value.user)
      fixture.authenticate.resolves({
        ...fixture.actor,
        ...value.user,
        id: String(value.user.id),
        username: value.user.username ?? String(value.user.id),
        roles: [{ brandId: fixture.brand.id, name: 'Admin' }],
      });
    response = await fixture.request(path + '?' + query, {
      method: route.method.toUpperCase(),
      body: value.body,
      headers: { 'X-ReDBox-Api-Version': '2.0' },
    });
  }
  let service: Record<string, sinon.SinonStub>;

  before(async () => {
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(async () => {
    service = {
      discoverTaxonomies: sinon.stub().resolves([{ taxonomyId: 't1' }]),
      listSources: sinon
        .stub()
        .resolves({ data: [{ id: '333333333333333333333333' }], meta: { total: 3, limit: 10, offset: 20 } }),
      getSource: sinon.stub().resolves({ id: '333333333333333333333333', scope: 'institution', taxonomyId: 't1' }),
      listSourceCategories: sinon.stub().resolves({ data: [{ id: 'c1' }], meta: { total: 1, limit: 25, offset: 0 } }),
      cloneMirror: sinon.stub().resolves({ id: 'v-clone' }),
      listSyncRuns: sinon.stub().resolves({ data: [{ id: 'r1' }], meta: { total: 1, limit: 0, offset: 0 } }),
      createPreview: sinon.stub().resolves({ runId: '222222222222222222222222' }),
      getPreview: sinon.stub().resolves({ runId: '222222222222222222222222', proposals: [] }),
      applyPreview: sinon.stub().resolves({ runId: '222222222222222222222222', applied: 2 }),
    };

    fixture = await httpRouteFixture((router, input) =>
      mountFigshareAdministrationRoutes(router, {
        ...input,
        vocabulary: service as any,
        audit: sinon.stub().resolves(),
      })
    );
  });

  afterEach(async () => {
    await fixture.close();
    sinon.restore();
  });

  describe('listCatalogues', () => {
    it('passes the requested scope through to the service', async () => {
      await request('listCatalogues', makeReq({ query: { scope: 'institution' } }));

      expect(service.discoverTaxonomies.calledOnce).to.be.true;
      expect(service.discoverTaxonomies.firstCall.args[0]).to.deep.equal({ scope: 'institution' });
      expect(response.body.data).to.deep.equal([{ taxonomyId: 't1' }]);
      expect(response.headers.get('Cache-Control')).to.equal('no-cache, private');
    });

    it('requires a catalogue scope before domain access', async () => {
      await request('listCatalogues', makeReq());
      expect(response.status).to.equal(400);
      expect(service.discoverTaxonomies.notCalled).to.equal(true);
    });

    it('maps service errors to an error response', async () => {
      service.discoverTaxonomies.rejects(new CatalogueInvalidError('bad catalogue'));

      await request('listCatalogues', makeReq({ query: { scope: 'group' } }));

      expect(response.status).to.equal(422);
      expect(response.body.errors).to.deep.equal([{ title: 'Unprocessable request', detail: 'bad catalogue' }]);
    });

    it('falls back to 400 for an unrecognised vocabulary error code', async () => {
      service.discoverTaxonomies.rejects(new FigshareVocabularyError('something-new' as any, 'unhandled'));

      await request('listCatalogues', makeReq({ query: { scope: 'institution' } }));

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.deep.equal([{ title: 'Bad request', detail: 'unhandled' }]);
    });

    it('sanitizes a non-Error rejection', async () => {
      service.discoverTaxonomies.callsFake(async () => {
        throw 'plain failure';
      });

      await request('listCatalogues', makeReq({ query: { scope: 'institution' } }));

      expect(response.status).to.equal(500);
    });
  });

  describe('actor context', () => {
    it('prefers the username over the numeric id', async () => {
      const req = makeReq({ query: { scope: 'institution' } });
      (req as any).user = { id: 42, username: 'jane' };

      await request('listCatalogues', req);

      expect(service.discoverTaxonomies.firstCall.args[1]).to.deep.equal({ brandId: 'brand-1', userId: 'jane' });
    });

    it('falls back to the user id when no username is present', async () => {
      const req = makeReq({ query: { scope: 'institution' } });
      (req as any).user = { id: 42 };

      await request('listCatalogues', req);

      expect(service.discoverTaxonomies.firstCall.args[1]).to.deep.equal({ brandId: 'brand-1', userId: '42' });
    });

    it('refuses unresolved brand and anonymous actor', async () => {
      fixture.getBrand.resolves(undefined);
      await request('listCatalogues', makeReq({ query: { scope: 'institution' } }));
      expect(response.status).to.equal(404);
      expect(service.discoverTaxonomies.notCalled).to.equal(true);
      fixture.getBrand.resolves(fixture.brand);
      fixture.authenticate.resolves(undefined);
      await request('listCatalogues', makeReq({ query: { scope: 'institution' } }));
      expect(response.status).to.equal(401);
      expect(service.discoverTaxonomies.notCalled).to.equal(true);
    });
  });

  describe('listSources', () => {
    it('forwards the filter and paging options', async () => {
      await request('listSources', makeReq({ query: { q: 'anzsrc', scope: 'group', limit: 10, offset: 20 } }));

      expect(service.listSources.firstCall.args[0]).to.deep.equal({
        q: 'anzsrc',
        scope: 'group',
        limit: 10,
        offset: 20,
      });
    });

    it('wraps the result in a list response with a computed page number', async () => {
      await request('listSources', makeReq({ query: {} }));

      const data = response.body.data;
      expect(data.records).to.deep.equal([{ id: '333333333333333333333333' }]);
      expect(data.summary.numFound).to.equal(3);
      expect(data.summary.start).to.equal(20);
      expect(data.summary.page).to.equal(3);
    });

    it('maps service errors to an error response', async () => {
      service.listSources.rejects(new Error('boom'));

      await request('listSources', makeReq({ query: {} }));

      expect(response.status).to.equal(500);
    });
  });

  describe('getSource', () => {
    it('returns the requested source', async () => {
      await request('getSource', makeReq({ params: { sourceId: '333333333333333333333333' } }));

      expect(service.getSource.firstCall.args[0]).to.equal('333333333333333333333333');
      expect(response.body.data).to.deep.include({ id: '333333333333333333333333' });
    });

    it('refuses an absent source identifier before domain access', async () => {
      await request('getSource', makeReq({ params: {} }));
      expect(response.status).to.equal(400);
      expect(service.getSource.notCalled).to.equal(true);
    });

    it('returns 404 when the source crosses a relationship boundary', async () => {
      service.getSource.rejects(new RelationshipBoundaryError('not yours'));

      await request('getSource', makeReq({ params: { sourceId: '333333333333333333333333' } }));

      expect(response.status).to.equal(404);
    });
  });

  describe('listSourceCategories', () => {
    it('converts the string flags to booleans', async () => {
      const req = makeReq({
        params: { sourceId: '333333333333333333333333' },
        query: { q: 'bio', includeHistorical: 'true', selectableOnly: 'true', limit: 25, offset: 0 },
      });

      await request('listSourceCategories', req);

      expect(service.listSourceCategories.firstCall.args[0]).to.equal('333333333333333333333333');
      expect(service.listSourceCategories.firstCall.args[1]).to.deep.equal({
        q: 'bio',
        includeHistorical: true,
        selectableOnly: true,
        limit: 25,
        offset: 0,
      });
    });

    it('defaults the flags to false when absent', async () => {
      await request('listSourceCategories', makeReq({ params: { sourceId: '333333333333333333333333' }, query: {} }));

      expect(service.listSourceCategories.firstCall.args[1]).to.deep.include({
        includeHistorical: false,
        selectableOnly: false,
      });
    });

    it('maps service errors to an error response', async () => {
      service.listSourceCategories.rejects(new SnapshotTooLargeError('too big'));

      await request('listSourceCategories', makeReq({ params: { sourceId: '333333333333333333333333' }, query: {} }));

      expect(response.status).to.equal(422);
      expect(response.body.errors[0].title).to.equal('Catalogue too large');
    });
  });

  describe('createSourcePreview', () => {
    it('derives the scope and taxonomy from the stored source', async () => {
      const req = makeReq({
        params: { sourceId: '333333333333333333333333' },
        body: { crosswalkId: '111111111111111111111111', localVocabularyId: 'v-1' },
      });

      await request('createSourcePreview', req);

      expect(service.createPreview.firstCall.args[0]).to.deep.equal({
        scope: 'institution',
        taxonomyId: 't1',
        sourceId: '333333333333333333333333',
        crosswalkId: '111111111111111111111111',
        localVocabularyId: 'v-1',
      });
      expect(response.status).to.equal(201);
    });

    it('leaves the optional identifiers undefined when not supplied', async () => {
      await request('createSourcePreview', makeReq({ params: { sourceId: '333333333333333333333333' }, body: {} }));

      expect(service.createPreview.firstCall.args[0]).to.deep.include({
        crosswalkId: undefined,
        localVocabularyId: undefined,
      });
    });

    it('treats a non-object body as an empty payload', async () => {
      await request(
        'createSourcePreview',
        makeReq({ params: { sourceId: '333333333333333333333333' }, body: ['nope'] })
      );

      expect(service.createPreview.firstCall.args[0]).to.deep.include({ crosswalkId: undefined });
    });

    it('maps service errors to an error response', async () => {
      service.createPreview.rejects(new FigshareTransportError('figshare down', 503));

      await request('createSourcePreview', makeReq({ params: { sourceId: '333333333333333333333333' }, body: {} }));

      expect(response.status).to.equal(502);
      expect(response.body.errors[0].title).to.equal('Figshare unavailable');
    });
  });

  describe('cloneSource', () => {
    it('creates the mirror clone and returns 201', async () => {
      const req = makeReq({
        params: { sourceId: '333333333333333333333333' },
        body: { name: 'Local ANZSRC', slug: 'local-anzsrc' },
      });

      await request('cloneSource', req);

      expect(service.cloneMirror.firstCall.args[0]).to.equal('333333333333333333333333');
      expect(service.cloneMirror.firstCall.args[1]).to.deep.equal({ name: 'Local ANZSRC', slug: 'local-anzsrc' });
      expect(response.status).to.equal(201);
      expect(response.body.data).to.deep.equal({ id: 'v-clone' });
    });

    it('omits the slug when it is not supplied', async () => {
      await request(
        'cloneSource',
        makeReq({ params: { sourceId: '333333333333333333333333' }, body: { name: 'Local' } })
      );

      expect(service.cloneMirror.firstCall.args[1]).to.deep.equal({ name: 'Local', slug: undefined });
    });

    it('maps service errors to an error response', async () => {
      service.cloneMirror.rejects(new Error('duplicate slug'));

      await request(
        'cloneSource',
        makeReq({ params: { sourceId: '333333333333333333333333' }, body: { name: 'Local' } })
      );

      expect(response.status).to.equal(500);
      expect(response.body.errors[0].detail).to.equal('Review current state before retrying.');
    });
  });

  describe('listSyncRuns', () => {
    it('forwards the source filter and paging', async () => {
      await request('listSyncRuns', makeReq({ query: { sourceId: '333333333333333333333333', limit: 5, offset: 5 } }));

      expect(service.listSyncRuns.firstCall.args[0]).to.deep.equal({
        sourceId: '333333333333333333333333',
        limit: 5,
        offset: 5,
      });
    });

    it('reports page 1 when the service returns a zero page size', async () => {
      await request('listSyncRuns', makeReq({ query: {} }));

      expect(response.body.data.summary.page).to.equal(1);
    });

    it('maps service errors to an error response', async () => {
      service.listSyncRuns.rejects(new Error('nope'));

      await request('listSyncRuns', makeReq({ query: {} }));

      expect(response.status).to.equal(500);
    });
  });

  describe('createPreview', () => {
    it('passes the full preview request through', async () => {
      const req = makeReq({
        body: {
          scope: 'group',
          taxonomyId: 't9',
          sourceId: '333333333333333333333333',
          crosswalkId: '111111111111111111111111',
          localVocabularyId: 'v-1',
          createLocalClone: true,
          localCloneName: 'Clone',
          localCloneSlug: 'clone',
        },
      });

      await request('createPreview', req);

      expect(service.createPreview.firstCall.args[0]).to.deep.equal({
        scope: 'group',
        taxonomyId: 't9',
        sourceId: '333333333333333333333333',
        crosswalkId: '111111111111111111111111',
        localVocabularyId: 'v-1',
        createLocalClone: true,
        localCloneName: 'Clone',
        localCloneSlug: 'clone',
      });
      expect(response.status).to.equal(201);
    });

    it('defaults every optional field with required scope and taxonomy', async () => {
      await request('createPreview', makeReq({ body: { scope: 'institution', taxonomyId: 't1' } }));

      expect(service.createPreview.firstCall.args[0]).to.deep.equal({
        scope: 'institution',
        taxonomyId: 't1',
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

      await request('createPreview', makeReq({ body: { scope: 'institution', taxonomyId: 't1' } }));

      expect(response.status).to.equal(422);
    });
  });

  describe('getPreview', () => {
    it('honours the diff view and filters', async () => {
      const req = makeReq({
        params: { runId: '222222222222222222222222' },
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

      await request('getPreview', req);

      expect(service.getPreview.firstCall.args[0]).to.equal('222222222222222222222222');
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
      await request(
        'getPreview',
        makeReq({ params: { runId: '222222222222222222222222' }, query: { view: 'anything' } })
      );

      expect(service.getPreview.firstCall.args[1]).to.deep.include({
        view: 'proposals',
        unresolvedOnly: false,
        historicalOnly: false,
      });
    });

    it('returns 410 once the preview has expired', async () => {
      service.getPreview.rejects(new PreviewExpiredError());

      await request('getPreview', makeReq({ params: { runId: '222222222222222222222222' }, query: {} }));

      expect(response.status).to.equal(410);
      expect(response.body.errors[0].title).to.equal('Preview expired');
    });
  });

  describe('applyPreview', () => {
    it('normalises the approved proposals and manual mappings', async () => {
      const req = makeReq({
        params: { runId: '222222222222222222222222' },
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

      await request('applyPreview', req);
      expect(response.status).to.equal(400);
      expect(service.applyPreview.notCalled).to.equal(true);
      req.body.approvedProposalIds = ['p1', '2'];
      req.body.manualMappings = [{ localEntryId: 'e1', localEntryKey: 'key-1', figshareSourceIds: ['f1', '2'] }, {}];
      await request('applyPreview', req);

      expect(service.applyPreview.firstCall.args[0]).to.equal('222222222222222222222222');
      expect(service.applyPreview.firstCall.args[1]).to.deep.equal({
        remoteHash: 'hash-1',
        expectedRevision: 4,
        approvedProposalIds: ['p1', '2'],
        manualMappings: [
          { localEntryId: 'e1', localEntryKey: 'key-1', figshareSourceIds: ['f1', '2'] },
          { localEntryId: undefined, localEntryKey: undefined, figshareSourceIds: [] },
        ],
      });
      expect(response.body.data).to.deep.equal({ runId: '222222222222222222222222', applied: 2 });
    });

    it('defaults the collections to empty arrays', async () => {
      await request(
        'applyPreview',
        makeReq({ params: { runId: '222222222222222222222222' }, body: { remoteHash: 'hash' } })
      );

      expect(service.applyPreview.firstCall.args[1]).to.deep.equal({
        remoteHash: 'hash',
        expectedRevision: undefined,
        approvedProposalIds: [],
        manualMappings: [],
      });
    });

    it('returns 409 when the preview is stale', async () => {
      service.applyPreview.rejects(new StalePreviewError());

      await request(
        'applyPreview',
        makeReq({ params: { runId: '222222222222222222222222' }, body: { remoteHash: 'hash' } })
      );

      expect(response.status).to.equal(409);
    });

    it('returns 409 when the crosswalk revision moved', async () => {
      service.applyPreview.rejects(new CrosswalkRevisionError());

      await request(
        'applyPreview',
        makeReq({ params: { runId: '222222222222222222222222' }, body: { remoteHash: 'hash' } })
      );

      expect(response.status).to.equal(409);
      expect(response.body.errors[0].title).to.equal('Conflict');
    });
  });
});
