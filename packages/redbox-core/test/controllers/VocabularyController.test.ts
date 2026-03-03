let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/VocabularyController';

describe('Ajax VocabularyController', () => {
  let controller: Controllers.Vocabulary;

  beforeEach(() => {
    (global as any).sails = {
      services: {
        vocabularyservice: {
          list: sinon.stub().resolves({ data: [], meta: { total: 0, limit: 25, offset: 0 } }),
          getById: sinon.stub().resolves({ id: 'v1' }),
          getTree: sinon.stub().resolves([]),
          create: sinon.stub().resolves({ id: 'v1' }),
          update: sinon.stub().resolves({ id: 'v1' }),
          delete: sinon.stub().resolves()
        },
        brandingservice: {
          getBrandNameFromReq: sinon.stub().returns('default'),
          getBrand: sinon.stub().returns({ id: 'default' })
        },
        rvaimportservice: {
          importRvaVocabulary: sinon.stub().resolves({ id: 'v2' }),
          syncRvaVocabulary: sinon.stub().resolves({ created: 1, updated: 0, skipped: 0, lastSyncedAt: 'now' })
        }
      },
      log: { error: sinon.stub(), verbose: sinon.stub(), debug: sinon.stub() }
    };
    controller = new Controllers.Vocabulary();
    (global as any).BrandingService = (global as any).sails.services.brandingservice;
    (global as any).VocabularyService = (global as any).sails.services.vocabularyservice;
    (global as any).RvaImportService = (global as any).sails.services.rvaimportservice;
  });

  afterEach(() => {
    sinon.restore();
    delete (global as any).BrandingService;
    delete (global as any).VocabularyService;
    delete (global as any).RvaImportService;
    delete (global as any).sails;
  });

  it('renders manager view', async () => {
    const req = {} as Sails.Req;
    const res = {} as Sails.Res;
    const sendView = sinon.stub(controller as any, 'sendView');

    await controller.manager(req, res);

    expect(sendView.calledOnce).to.be.true;
  });

  it('creates vocabulary', async () => {
    const req = { body: { name: 'Test', type: 'flat', source: 'local' }, session: { branding: 'default' } } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.create(req, res);

    expect(sendResp.calledOnce).to.be.true;
  });

  it('returns 500 with errors array when create throws unexpectedly', async () => {
    const req = { body: { name: 'Test', type: 'flat', source: 'local' }, session: { branding: 'default' } } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    (global as any).sails.services.vocabularyservice.create.rejects(new Error('database unavailable'));

    await controller.create(req, res);

    expect(sendResp.calledOnce).to.be.true;
    const payload = sendResp.firstCall.args[2];
    expect(payload?.status).to.equal(500);
    expect(payload?.errors).to.be.an('array');
    expect(payload?.errors?.[0]).to.be.instanceOf(Error);
  });

  it('lists vocabularies with wrapped data and meta', async () => {
    const req = { param: sinon.stub().returns(undefined), session: { branding: 'default' } } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.list(req, res);

    expect(sendResp.calledOnce).to.be.true;
    expect(sendResp.firstCall.args[2]?.data?.records).to.deep.equal([]);
    expect(sendResp.firstCall.args[2]?.data?.summary?.numFound).to.equal(0);
    expect(sendResp.firstCall.args[2]?.data?.summary?.start).to.equal(0);
    expect(sendResp.firstCall.args[2]?.data?.summary?.page).to.equal(1);
  });
});
