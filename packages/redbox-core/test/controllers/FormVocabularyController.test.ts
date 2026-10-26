import { expect } from 'chai';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountFormVocabularyRoutes, formVocabularyRoutes } from '../../src/http/express/formVocabulary';

describe('Form vocabulary through owned HTTP routes', () => {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let vocabulary: any;
  let lookups: any;
  const makeReq = (params: Record<string, unknown> = {}, extras: Record<string, unknown> = {}) => ({
    params,
    body: extras.body,
  });
  beforeEach(async () => {
    vocabulary = {
      getByIdOrSlug: sinon.stub(),
      getEntries: sinon.stub(),
      getChildren: sinon.stub(),
      expandPaths: sinon.stub(),
    };
    lookups = { findRecords: sinon.stub(), findInExternalService: sinon.stub(), findInServiceLookup: sinon.stub() };
    f = await httpRouteFixture((router, input) =>
      mountFormVocabularyRoutes(router, { ...input, vocabulary, lookups, users: { findUsersWithName: sinon.stub() } })
    );
  });
  afterEach(async () => {
    await f.close();
  });
  async function request(action: string, input: ReturnType<typeof makeReq>) {
    const route = formVocabularyRoutes.find(route => route.action === action)!;
    const values = { ...input.params, branding: 'default', portal: 'portal' };
    const path = route.path.replace(/:([A-Za-z0-9_]+)/g, (_match, name) =>
      encodeURIComponent(String(values[name] ?? ''))
    );
    const query = new URLSearchParams(
      Object.entries(values)
        .filter(([key]) => !route.path.includes(':' + key))
        .map(([key, value]) => [key, String(value)])
    );
    return f.request(path + '?' + query, {
      method: route.method.toUpperCase(),
      body: input.body,
      headers: { 'x-redbox-api-version': '2.0' },
    });
  }

  it('returns route 404 for get when vocabIdOrSlug is missing', async () => {
    const req = makeReq({ branding: 'default', vocabIdOrSlug: '' });

    const response = await request('get', req);

    expect(response.status).to.equal(404);
    expect(
      [
        vocabulary.getByIdOrSlug,
        vocabulary.getChildren,
        lookups.findInExternalService,
        lookups.findInServiceLookup,
      ].every(stub => !stub.called)
    ).to.equal(true);
  });

  it('returns vocabulary from get', async () => {
    vocabulary.getByIdOrSlug.resolves({ id: 'v1', name: 'Access rights', slug: 'access-rights' });
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'access-rights' });

    const response = await request('get', req);

    expect(response.body.data?.id).to.equal('v1');
    expect(response.body.data?.slug).to.equal('access-rights');
  });

  it('returns 404 from get when vocab is missing', async () => {
    vocabulary.getByIdOrSlug.resolves(null);
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'missing' });

    const response = await request('get', req);

    expect(response.status).to.equal(404);
    expect(response.body.errors?.[0]?.code).to.equal('vocabulary-not-found');
  });

  it('returns 400 for entries when pagination params are invalid', async () => {
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'x', limit: 'abc' });

    const response = await request('entries', req);

    expect(response.status).to.equal(400);
    expect(response.body.errors?.[0]?.code).to.equal('invalid-query-params');
  });

  it('returns entries with meta from entries action', async () => {
    vocabulary.getEntries.resolves({
      entries: [{ id: 'e1', label: 'Open', value: 'open' }],
      meta: { total: 1, limit: 200, offset: 0, vocabularyId: 'v1' },
    });
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'access-rights', search: 'op' });

    const response = await request('entries', req);

    expect(response.body.data).to.have.length(1);
    expect(response.body.meta?.vocabularyId).to.equal('v1');
  });

  it('forwards includeHistoricalValues to entries service when requested', async () => {
    vocabulary.getEntries.resolves({
      entries: [{ id: 'e1', label: 'Open', value: 'open' }],
      meta: { total: 1, limit: 200, offset: 0, vocabularyId: 'v1' },
    });
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'access-rights', includeHistoricalValues: 'true' });

    const response = await request('entries', req);

    expect(vocabulary.getEntries.firstCall.args[2]?.includeHistoricalValues).to.equal(true);
  });

  it('returns route 404 for children when vocabIdOrSlug is missing', async () => {
    const req = makeReq({ branding: 'default', vocabIdOrSlug: '' });

    const response = await request('children', req);

    expect(response.status).to.equal(404);
    expect(
      [
        vocabulary.getByIdOrSlug,
        vocabulary.getChildren,
        lookups.findInExternalService,
        lookups.findInServiceLookup,
      ].every(stub => !stub.called)
    ).to.equal(true);
  });

  it('returns children with metadata from children action', async () => {
    vocabulary.getChildren.resolves({
      entries: [{ id: 'e1', label: 'Science', value: '01', notation: '01', parent: null, hasChildren: true }],
      meta: { vocabularyId: 'v1', parentId: null, total: 1 },
    });
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'anzsrc-2020-for' });

    const response = await request('children', req);

    expect(response.body.data).to.have.length(1);
    expect(response.body.meta?.vocabularyId).to.equal('v1');
    expect(response.body.meta?.parentId).to.equal(null);
    expect(vocabulary.getChildren.calledWith(f.brand.id, 'anzsrc-2020-for', null)).to.equal(true);
  });

  it('returns nested children when parentId is provided', async () => {
    vocabulary.getChildren.resolves({
      entries: [
        { id: 'e2', label: 'Pure Mathematics', value: '0101', notation: '0101', parent: 'e1', hasChildren: false },
      ],
      meta: { vocabularyId: 'v1', parentId: 'e1', total: 1 },
    });
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'anzsrc-2020-for', parentId: 'e1' });

    const response = await request('children', req);

    expect(response.status).to.equal(200);
    expect(response.body.meta?.parentId).to.equal('e1');
    expect(vocabulary.getChildren.calledWith(f.brand.id, 'anzsrc-2020-for', 'e1')).to.equal(true);
  });

  it('returns 404 from children when vocab is missing', async () => {
    vocabulary.getChildren.resolves(null);
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'missing' });

    const response = await request('children', req);

    expect(response.status).to.equal(404);
    expect(response.body.errors?.[0]?.code).to.equal('vocabulary-not-found');
  });

  it('returns 400 invalid-parent-id from children when service rejects with invalid parent', async () => {
    const error = new Error('invalid parent') as Error & { code?: string };
    error.code = 'invalid-parent-id';
    vocabulary.getChildren.rejects(error);
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'anzsrc-2020-for', parentId: 'does-not-exist' });

    const response = await request('children', req);

    expect(response.status).to.equal(400);
    expect(response.body.errors?.[0]?.code).to.equal('invalid-parent-id');
  });

  it('returns 500 vocabulary-children-failed from children on unexpected error', async () => {
    vocabulary.getChildren.rejects(new Error('boom'));
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'anzsrc-2020-for', parentId: 'e1' });

    const response = await request('children', req);

    expect(response.status).to.equal(500);
    expect(response.body.errors?.[0]?.code).to.equal('vocabulary-children-failed');
  });

  it('returns 400 for getRecords when params are invalid', async () => {
    const req = makeReq({ queryId: 'related', start: '-1', rows: '0' });

    const response = await request('getRecords', req);

    expect(response.status).to.equal(400);
    expect(response.body.errors?.[0]?.code).to.equal('invalid-query-params');
  });

  it('proxies getRecords to FormVocabularyService.findRecords', async () => {
    lookups.findRecords.resolves({ response: { docs: [] } });
    const req = makeReq({ queryId: 'related', search: 'abc', start: '0', rows: '10' });

    const response = await request('getRecords', req);

    expect(lookups.findRecords.calledOnce).to.equal(true);
    expect(response.body.data?.response).to.not.equal(undefined);
  });

  it('returns 500 and query-vocab-failed when getRecords throws', async () => {
    lookups.findRecords.rejects(new Error('failed'));
    const req = makeReq({ queryId: 'related', start: '0', rows: '10' });

    const response = await request('getRecords', req);

    expect(response.status).to.equal(500);
    expect(response.body.errors?.[0]?.code).to.equal('query-vocab-failed');
  });

  it('returns 404 when getRecords query config is not found', async () => {
    const error = new Error('missing query') as Error & { code?: string };
    error.code = 'query-vocab-not-configured';
    lookups.findRecords.rejects(error);
    const req = makeReq({ queryId: 'missing', start: '0', rows: '10' });

    const response = await request('getRecords', req);

    expect(response.status).to.equal(404);
    expect(response.body.errors?.[0]?.code).to.equal('query-vocab-not-configured');
  });

  it('returns route 404 for externalEntries when provider is missing', async () => {
    const req = makeReq({ provider: '' }, { body: { options: { query: 'Aus' } } });

    const response = await request('externalEntries', req);

    expect(response.status).to.equal(404);
    expect(
      [
        vocabulary.getByIdOrSlug,
        vocabulary.getChildren,
        lookups.findInExternalService,
        lookups.findInServiceLookup,
      ].every(stub => !stub.called)
    ).to.equal(true);
  });

  it('proxies externalEntries to FormVocabularyService.findInExternalService', async () => {
    lookups.findInExternalService.resolves({ response: { docs: [{ utf8_name: ['Australia'] }] } });
    const req = makeReq({ provider: 'geonamesCountries' }, { body: { options: { query: 'Aus' } } });

    const response = await request('externalEntries', req);

    expect(
      lookups.findInExternalService.calledOnceWith('geonamesCountries', {
        options: { query: 'Aus' },
        postBody: undefined,
      })
    ).to.equal(true);
    expect(response.body.data?.response).to.not.equal(undefined);
  });

  it('returns 500 and query-vocab-failed when externalEntries throws', async () => {
    lookups.findInExternalService.rejects(new Error('failed'));
    const req = makeReq({ provider: 'geonamesCountries' }, { body: { options: { query: 'Aus' } } });

    const response = await request('externalEntries', req);

    expect(response.status).to.equal(500);
    expect(response.body.errors?.[0]?.code).to.equal('query-vocab-failed');
  });

  it('returns 404 when external provider config is not found', async () => {
    const error = new Error('missing external provider') as Error & { code?: string };
    error.code = 'external-vocab-not-configured';
    lookups.findInExternalService.rejects(error);
    const req = makeReq({ provider: 'missing' }, { body: { options: { query: 'Aus' } } });

    const response = await request('externalEntries', req);

    expect(response.status).to.equal(404);
    expect(response.body.errors?.[0]?.code).to.equal('external-vocab-not-configured');
  });

  it('returns 500 when external provider config is invalid', async () => {
    const error = new Error('bad external provider config') as Error & { code?: string };
    error.code = 'external-vocab-invalid-config';
    lookups.findInExternalService.rejects(error);
    const req = makeReq({ provider: 'broken' }, { body: { options: { query: 'Aus' } } });

    const response = await request('externalEntries', req);

    expect(response.status).to.equal(500);
    expect(response.body.errors?.[0]?.code).to.equal('external-vocab-invalid-config');
  });

  it('returns route 404 for serviceEntries when params are invalid', async () => {
    const req = makeReq({ serviceId: '' }, { body: { start: -1, rows: 0 } });

    const response = await request('serviceEntries', req);

    expect(response.status).to.equal(404);
    expect(
      [
        vocabulary.getByIdOrSlug,
        vocabulary.getChildren,
        lookups.findInExternalService,
        lookups.findInServiceLookup,
      ].every(stub => !stub.called)
    ).to.equal(true);
  });

  it('returns 404 when service lookup is not configured', async () => {
    const error = new Error('missing') as Error & { code?: string };
    error.code = 'service-lookup-not-configured';
    lookups.findInServiceLookup.rejects(error);
    const req = makeReq(
      { branding: 'default', portal: 'portal', serviceId: 'missing' },
      { body: { search: 'jan', start: 0, rows: 25 } }
    );

    const response = await request('serviceEntries', req);

    expect(response.status).to.equal(404);
    expect(response.body.errors?.[0]?.code).to.equal('service-lookup-not-configured');
  });

  it('proxies serviceEntries to FormVocabularyService.findInServiceLookup', async () => {
    lookups.findInServiceLookup.resolves({
      data: [{ label: 'Jane Doe', value: 'party-1', sourceType: 'service' }],
      meta: { total: 1 },
    });
    const req = makeReq(
      { branding: 'default', portal: 'portal', serviceId: 'contributors' },
      { body: { search: 'jan', start: 5, rows: 10 } }
    );

    const response = await request('serviceEntries', req);

    expect(lookups.findInServiceLookup.calledOnce).to.equal(true);
    expect(lookups.findInServiceLookup.firstCall.args[0]).to.equal('contributors');
    expect(lookups.findInServiceLookup.firstCall.args[1]).to.include({
      search: 'jan',
      start: 5,
      rows: 10,
      branding: 'default',
      portal: 'portal',
    });
    expect(response.body.data).to.have.length(1);
    expect(response.body.meta?.total).to.equal(1);
  });

  it('returns 500 when service lookup target is invalid', async () => {
    const error = new Error('bad target') as Error & { code?: string };
    error.code = 'service-lookup-invalid-target';
    lookups.findInServiceLookup.rejects(error);
    const req = makeReq(
      { branding: 'default', portal: 'portal', serviceId: 'contributors' },
      { body: { search: 'jan', start: 0, rows: 25 } }
    );

    const response = await request('serviceEntries', req);

    expect(response.status).to.equal(500);
    expect(response.body.errors?.[0]?.code).to.equal('service-lookup-invalid-target');
  });

  it('returns 500 when service lookup response is invalid', async () => {
    const error = new Error('bad response') as Error & { code?: string };
    error.code = 'service-lookup-invalid-response';
    lookups.findInServiceLookup.rejects(error);
    const req = makeReq(
      { branding: 'default', portal: 'portal', serviceId: 'contributors' },
      { body: { search: 'jan', start: 0, rows: 25 } }
    );

    const response = await request('serviceEntries', req);

    expect(response.status).to.equal(500);
    expect(response.body.errors?.[0]?.code).to.equal('service-lookup-invalid-response');
  });
});
