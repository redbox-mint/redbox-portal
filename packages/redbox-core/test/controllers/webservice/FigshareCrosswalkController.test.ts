import * as sinon from 'sinon';
import { httpRouteFixture } from '../../helpers/httpRouteFixture';
import {
  mountFigshareAdministrationRoutes,
  figshareAdministrationRoutes,
} from '../../../src/http/express/figshareAdministration';
import {
  CrosswalkRevisionError,
  FigshareTransportError,
  RelationshipBoundaryError,
} from '../../../src/services/figshare-v2/vocabulary-errors';

let expect: Chai.ExpectStatic;

describe('Webservice FigshareCrosswalkController', () => {
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
      listCrosswalks: sinon
        .stub()
        .resolves({ data: [{ id: '111111111111111111111111' }], meta: { total: 7, limit: 5, offset: 10 } }),
      getCrosswalk: sinon.stub().resolves({ id: '111111111111111111111111', revision: 3 }),
      createCrosswalk: sinon.stub().resolves({ id: 'cw-2' }),
      getCrosswalkUsage: sinon.stub().resolves({ records: 4 }),
      listCrosswalkLocalEntries: sinon
        .stub()
        .resolves({ data: [{ id: 'e1' }], meta: { total: 1, limit: 0, offset: 0 } }),
      listCrosswalkMappings: sinon.stub().resolves({ data: [{ id: 'm1' }], meta: { total: 1, limit: 25, offset: 0 } }),
      saveMappings: sinon.stub().resolves({ id: '111111111111111111111111', revision: 4 }),
      approveCrosswalk: sinon.stub().resolves({ id: '111111111111111111111111', status: 'approved' }),
      deleteCrosswalk: sinon.stub().resolves(),
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

  describe('list', () => {
    it('forwards every supported filter', async () => {
      const req = makeReq({
        query: {
          q: 'anzsrc',
          status: 'approved',
          localVocabularyId: 'v-1',
          sourceId: '333333333333333333333333',
          limit: 5,
          offset: 10,
        },
      });

      await request('list', req);

      expect(service.listCrosswalks.firstCall.args[0]).to.deep.equal({
        q: 'anzsrc',
        status: 'approved',
        localVocabularyId: 'v-1',
        sourceId: '333333333333333333333333',
        limit: 5,
        offset: 10,
      });
    });

    it('wraps the result in a list response with a computed page number', async () => {
      await request('list', makeReq({ query: {} }));

      const data = response.body.data;
      expect(data.records).to.deep.equal([{ id: '111111111111111111111111' }]);
      expect(data.summary.numFound).to.equal(7);
      expect(data.summary.start).to.equal(10);
      expect(data.summary.page).to.equal(3);
    });

    it('resolves the actor from the branding service and request user', async () => {
      const req = makeReq({ query: {} });
      (req as any).user = { id: 7, username: 'jane' };

      await request('list', req);

      expect(service.listCrosswalks.firstCall.args[1]).to.deep.equal({ brandId: 'brand-1', userId: 'jane' });
    });

    it('refuses unresolved brand and anonymous actor before domain access', async () => {
      fixture.getBrand.resolves(undefined);
      await request('list', makeReq({ query: {}, user: { id: 7 } }));
      expect(response.status).to.equal(404);
      expect(service.listCrosswalks.notCalled).to.equal(true);
      fixture.getBrand.resolves(fixture.brand);
      fixture.authenticate.resolves(undefined);
      await request('list', makeReq({ query: {} }));
      expect(response.status).to.equal(401);
      expect(service.listCrosswalks.notCalled).to.equal(true);
    });

    it('maps service errors to an error response', async () => {
      service.listCrosswalks.rejects(new Error('boom'));

      await request('list', makeReq({ query: {} }));

      expect(response.status).to.equal(500);
      expect(response.body.errors).to.deep.equal([
        { title: 'Operation failed', detail: 'Review current state before retrying.' },
      ]);
    });
  });

  it('refuses malformed pagination and revisions before accessing storage', async () => {
    for (const query of [
      { limit: '5x' },
      { limit: ' ' },
      { limit: '0' },
      { offset: '-1' },
      { offset: '2.5' },
      { revision: 'NaN' },
    ]) {
      await request('listLocalEntries', { params: { id: '111111111111111111111111' }, query });
      expect(response.status).to.equal(400);
      expect(service.listCrosswalkLocalEntries.notCalled).to.equal(true);
    }
  });

  describe('get', () => {
    it('returns the requested crosswalk', async () => {
      await request('get', makeReq({ params: { id: '111111111111111111111111' } }));

      expect(service.getCrosswalk.firstCall.args[0]).to.equal('111111111111111111111111');
      expect(response.body.data).to.deep.equal({ id: '111111111111111111111111', revision: 3 });
    });

    it('refuses an absent resource identifier before domain access', async () => {
      await request('get', makeReq({ params: {} }));
      expect(response.status).to.equal(400);
      expect(service.getCrosswalk.notCalled).to.equal(true);
    });

    it('returns 404 for a cross-brand identifier', async () => {
      service.getCrosswalk.rejects(new RelationshipBoundaryError('not found'));

      await request('get', makeReq({ params: { id: '111111111111111111111111' } }));

      expect(response.status).to.equal(404);
    });
  });

  describe('create', () => {
    it('creates the crosswalk and returns 201', async () => {
      const req = makeReq({
        body: { name: 'ANZSRC map', localVocabularyId: 'v-1', sourceId: '333333333333333333333333' },
      });

      await request('create', req);

      expect(service.createCrosswalk.firstCall.args[0]).to.deep.equal({
        name: 'ANZSRC map',
        localVocabularyId: 'v-1',
        sourceId: '333333333333333333333333',
      });
      expect(response.status).to.equal(201);
      expect(response.body.data).to.deep.equal({ id: 'cw-2' });
    });

    it('refuses a non-object body before creating a crosswalk', async () => {
      await request('create', makeReq({ body: 'nope' }));
      expect(response.status).to.equal(400);
      expect(service.createCrosswalk.notCalled).to.equal(true);
    });

    it('maps service errors to an error response', async () => {
      service.createCrosswalk.rejects(new FigshareTransportError('unreachable'));

      await request(
        'create',
        makeReq({ body: { name: 'Map', localVocabularyId: 'v-1', sourceId: '333333333333333333333333' } })
      );

      expect(response.status).to.equal(502);
    });
  });

  describe('usage', () => {
    it('returns the usage summary', async () => {
      await request('usage', makeReq({ params: { id: '111111111111111111111111' } }));

      expect(service.getCrosswalkUsage.firstCall.args[0]).to.equal('111111111111111111111111');
      expect(response.body.data).to.deep.equal({ records: 4 });
    });

    it('maps service errors to an error response', async () => {
      service.getCrosswalkUsage.rejects(new Error('nope'));

      await request('usage', makeReq({ params: { id: '111111111111111111111111' } }));

      expect(response.status).to.equal(500);
    });
  });

  describe('listLocalEntries', () => {
    it('coerces the revision to a number', async () => {
      const req = makeReq({
        params: { id: '111111111111111111111111' },
        query: { q: 'bio', mapped: 'false', revision: '3', limit: 10, offset: 0 },
      });

      await request('listLocalEntries', req);

      expect(service.listCrosswalkLocalEntries.firstCall.args[0]).to.equal('111111111111111111111111');
      expect(service.listCrosswalkLocalEntries.firstCall.args[1]).to.deep.equal({
        q: 'bio',
        mapped: 'false',
        revision: 3,
        limit: 10,
        offset: 0,
      });
    });

    it('leaves the revision undefined when absent and reports page 1 for a zero page size', async () => {
      await request('listLocalEntries', makeReq({ params: { id: '111111111111111111111111' }, query: {} }));

      expect(service.listCrosswalkLocalEntries.firstCall.args[1]).to.deep.include({ revision: undefined });
      expect(response.body.data.summary.page).to.equal(1);
    });

    it('maps service errors to an error response', async () => {
      service.listCrosswalkLocalEntries.rejects(new Error('nope'));

      await request('listLocalEntries', makeReq({ params: { id: '111111111111111111111111' }, query: {} }));

      expect(response.status).to.equal(500);
    });
  });

  describe('listMappings', () => {
    it('forwards the mapping filters', async () => {
      const req = makeReq({
        params: { id: '111111111111111111111111' },
        query: { status: 'proposed', q: 'bio', revision: '2', limit: 25, offset: 0 },
      });

      await request('listMappings', req);

      expect(service.listCrosswalkMappings.firstCall.args[1]).to.deep.equal({
        status: 'proposed',
        q: 'bio',
        revision: 2,
        limit: 25,
        offset: 0,
      });
    });

    it('leaves the revision undefined when absent', async () => {
      await request('listMappings', makeReq({ params: { id: '111111111111111111111111' }, query: {} }));

      expect(service.listCrosswalkMappings.firstCall.args[1]).to.deep.include({ revision: undefined });
    });

    it('maps service errors to an error response', async () => {
      service.listCrosswalkMappings.rejects(new Error('nope'));

      await request('listMappings', makeReq({ params: { id: '111111111111111111111111' }, query: {} }));

      expect(response.status).to.equal(500);
    });
  });

  describe('saveMappings', () => {
    it('normalises add and remove changes', async () => {
      const req = makeReq({
        params: { id: '111111111111111111111111' },
        body: {
          revision: '3',
          changes: [
            { op: 'add', localEntryId: 'e1', figshareCategoryId: 'f1', matchType: 'exact', status: 'approved' },
            { op: 'remove', localEntryId: 'e2', figshareCategoryId: 'f2' },
            'not-an-object',
          ],
        },
      });

      await request('saveMappings', req);
      expect(response.status).to.equal(400);
      expect(service.saveMappings.notCalled).to.equal(true);
      req.body.changes.pop();
      await request('saveMappings', req);

      expect(service.saveMappings.firstCall.args[0]).to.equal('111111111111111111111111');
      expect(service.saveMappings.firstCall.args[1]).to.deep.equal({
        revision: 3,
        changes: [
          { op: 'add', localEntryId: 'e1', figshareCategoryId: 'f1', matchType: 'exact', status: 'approved' },
          { op: 'remove', localEntryId: 'e2', figshareCategoryId: 'f2', matchType: undefined, status: undefined },
        ],
      });
    });

    it('treats an unrecognised op as an add', async () => {
      const req = makeReq({
        params: { id: '111111111111111111111111' },
        body: { revision: 1, changes: [{ op: 'replace', localEntryId: 'e1', figshareCategoryId: 'f1' }] },
      });

      await request('saveMappings', req);

      expect(service.saveMappings.firstCall.args[1].changes[0].op).to.equal('add');
    });

    it('requires explicit changes and accepts an empty changes list', async () => {
      await request('saveMappings', makeReq({ params: { id: '111111111111111111111111' }, body: { revision: 1 } }));
      expect(response.status).to.equal(400);
      expect(service.saveMappings.notCalled).to.equal(true);
      await request(
        'saveMappings',
        makeReq({ params: { id: '111111111111111111111111' }, body: { revision: 1, changes: [] } })
      );
      expect(service.saveMappings.firstCall.args[1]).to.deep.equal({ revision: 1, changes: [] });
    });

    it('returns 409 when the revision moved', async () => {
      service.saveMappings.rejects(new CrosswalkRevisionError());

      await request(
        'saveMappings',
        makeReq({ params: { id: '111111111111111111111111' }, body: { revision: 1, changes: [] } })
      );

      expect(response.status).to.equal(409);
    });
  });

  describe('approve', () => {
    it('approves at the supplied revision', async () => {
      await request('approve', makeReq({ params: { id: '111111111111111111111111' }, body: { revision: '3' } }));

      expect(service.approveCrosswalk.firstCall.args[0]).to.equal('111111111111111111111111');
      expect(service.approveCrosswalk.firstCall.args[1]).to.equal(3);
      expect(response.body.data).to.deep.equal({ id: '111111111111111111111111', status: 'approved' });
    });

    it('maps service errors to an error response', async () => {
      service.approveCrosswalk.rejects(new CrosswalkRevisionError('stale'));

      await request('approve', makeReq({ params: { id: '111111111111111111111111' }, body: { revision: 1 } }));

      expect(response.status).to.equal(409);
      expect(response.body.errors[0].detail).to.equal('stale');
    });
  });

  describe('delete', () => {
    it('returns 204 with no body', async () => {
      await request('delete', makeReq({ params: { id: '111111111111111111111111' } }));

      expect(service.deleteCrosswalk.firstCall.args[0]).to.equal('111111111111111111111111');
      expect(response.status).to.equal(204);
      expect(response.body).to.be.undefined;
    });

    it('maps service errors to an error response', async () => {
      service.deleteCrosswalk.rejects(new RelationshipBoundaryError('not found'));

      await request('delete', makeReq({ params: { id: '111111111111111111111111' } }));

      expect(response.status).to.equal(404);
    });
  });
});
