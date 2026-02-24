let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/FormVocabularyController';

describe('FormVocabularyController', () => {
  let controller: Controllers.FormVocabulary;

  const makeReq = (params: Record<string, unknown> = {}, extras: Record<string, unknown> = {}): Sails.Req => {
    return {
      param: (name: string) => params[name],
      session: { branding: 'default' },
      user: { username: 'user', roles: [{ name: 'Researcher' }] },
      ...extras,
    } as unknown as Sails.Req;
  };

  beforeEach(() => {
    (global as any).sails = {
      log: { verbose: sinon.stub(), error: sinon.stub(), debug: sinon.stub() },
      services: {
        vocabularyservice: {
          getByIdOrSlug: sinon.stub(),
          getEntries: sinon.stub(),
          getChildren: sinon.stub(),
        },
        vocabservice: {
          findRecords: sinon.stub(),
        },
        brandingservice: {
          getBrand: sinon.stub().returns({ id: 'default' }),
        },
      },
      config: { auth: { defaultBrand: 'default' } },
    };
    (global as any).VocabularyService = (global as any).sails.services.vocabularyservice;
    (global as any).VocabService = (global as any).sails.services.vocabservice;
    (global as any).BrandingService = (global as any).sails.services.brandingservice;

    controller = new Controllers.FormVocabulary();
  });

  afterEach(() => {
    sinon.restore();
    delete (global as any).VocabularyService;
    delete (global as any).VocabService;
    delete (global as any).BrandingService;
    delete (global as any).sails;
  });

  it('returns 400 for get when vocabIdOrSlug is missing', async () => {
    const req = makeReq({ branding: 'default', vocabIdOrSlug: '' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.get(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.status).to.equal(400);
    expect(sendResp.firstCall.args[2]?.displayErrors?.[0]?.code).to.equal('invalid-vocabulary-id-or-slug');
  });

  it('returns vocabulary from get', async () => {
    (global as any).VocabularyService.getByIdOrSlug.resolves({ id: 'v1', name: 'Access rights', slug: 'access-rights' });
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'access-rights' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.get(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.data?.id).to.equal('v1');
    expect(sendResp.firstCall.args[2]?.data?.slug).to.equal('access-rights');
  });

  it('returns 404 from get when vocab is missing', async () => {
    (global as any).VocabularyService.getByIdOrSlug.resolves(null);
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'missing' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.get(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.status).to.equal(404);
    expect(sendResp.firstCall.args[2]?.displayErrors?.[0]?.code).to.equal('vocabulary-not-found');
  });

  it('returns 400 for entries when pagination params are invalid', async () => {
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'x', limit: 'abc' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.entries(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.status).to.equal(400);
    expect(sendResp.firstCall.args[2]?.displayErrors?.[0]?.code).to.equal('invalid-query-params');
  });

  it('returns entries with meta from entries action', async () => {
    (global as any).VocabularyService.getEntries.resolves({
      entries: [{ id: 'e1', label: 'Open', value: 'open' }],
      meta: { total: 1, limit: 200, offset: 0, vocabularyId: 'v1' },
    });
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'access-rights', search: 'op' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.entries(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.data).to.have.length(1);
    expect(sendResp.firstCall.args[2]?.meta?.vocabularyId).to.equal('v1');
  });

  it('returns 400 for children when vocabIdOrSlug is missing', async () => {
    const req = makeReq({ branding: 'default', vocabIdOrSlug: '' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.children(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.status).to.equal(400);
    expect(sendResp.firstCall.args[2]?.displayErrors?.[0]?.code).to.equal('invalid-vocabulary-id-or-slug');
  });

  it('returns children with metadata from children action', async () => {
    (global as any).VocabularyService.getChildren.resolves({
      entries: [{ id: 'e1', label: 'Science', value: '01', notation: '01', parent: null, hasChildren: true }],
      meta: { vocabularyId: 'v1', parentId: null, total: 1 },
    });
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'anzsrc-2020-for' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.children(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.data).to.have.length(1);
    expect(sendResp.firstCall.args[2]?.meta?.vocabularyId).to.equal('v1');
    expect(sendResp.firstCall.args[2]?.meta?.parentId).to.equal(null);
    expect((global as any).VocabularyService.getChildren.calledWith('default', 'anzsrc-2020-for', undefined)).to.equal(true);
  });

  it('returns nested children when parentId is provided', async () => {
    (global as any).VocabularyService.getChildren.resolves({
      entries: [{ id: 'e2', label: 'Pure Mathematics', value: '0101', notation: '0101', parent: 'e1', hasChildren: false }],
      meta: { vocabularyId: 'v1', parentId: 'e1', total: 1 },
    });
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'anzsrc-2020-for', parentId: 'e1' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.children(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.status).to.equal(undefined);
    expect(sendResp.firstCall.args[2]?.meta?.parentId).to.equal('e1');
    expect((global as any).VocabularyService.getChildren.calledWith('default', 'anzsrc-2020-for', 'e1')).to.equal(true);
  });

  it('returns 404 from children when vocab is missing', async () => {
    (global as any).VocabularyService.getChildren.resolves(null);
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'missing' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.children(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.status).to.equal(404);
    expect(sendResp.firstCall.args[2]?.displayErrors?.[0]?.code).to.equal('vocabulary-not-found');
  });

  it('returns 400 invalid-parent-id from children when service rejects with invalid parent', async () => {
    const error = new Error('invalid parent') as Error & { code?: string };
    error.code = 'invalid-parent-id';
    (global as any).VocabularyService.getChildren.rejects(error);
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'anzsrc-2020-for', parentId: 'does-not-exist' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.children(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.status).to.equal(400);
    expect(sendResp.firstCall.args[2]?.displayErrors?.[0]?.code).to.equal('invalid-parent-id');
  });

  it('returns 500 vocabulary-children-failed from children on unexpected error', async () => {
    (global as any).VocabularyService.getChildren.rejects(new Error('boom'));
    const req = makeReq({ branding: 'default', vocabIdOrSlug: 'anzsrc-2020-for', parentId: 'e1' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.children(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.status).to.equal(500);
    expect(sendResp.firstCall.args[2]?.displayErrors?.[0]?.code).to.equal('vocabulary-children-failed');
  });

  it('returns 400 for getRecords when params are invalid', async () => {
    const req = makeReq({ queryId: '', start: '-1', rows: '0' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getRecords(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.status).to.equal(400);
    expect(sendResp.firstCall.args[2]?.displayErrors?.[0]?.code).to.equal('invalid-query-params');
  });

  it('proxies getRecords to VocabService.findRecords', async () => {
    (global as any).VocabService.findRecords.resolves({ response: { docs: [] } });
    const req = makeReq({ queryId: 'related', search: 'abc', start: '0', rows: '10' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getRecords(req, {} as Sails.Res);

    expect((global as any).VocabService.findRecords.calledOnce).to.equal(true);
    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.data?.response).to.not.equal(undefined);
  });

  it('returns 500 and query-vocab-failed when getRecords throws', async () => {
    (global as any).VocabService.findRecords.rejects(new Error('failed'));
    const req = makeReq({ queryId: 'related', start: '0', rows: '10' });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getRecords(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]?.status).to.equal(500);
    expect(sendResp.firstCall.args[2]?.displayErrors?.[0]?.code).to.equal('query-vocab-failed');
  });
});
