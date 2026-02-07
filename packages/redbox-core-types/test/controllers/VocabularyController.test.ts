import { expect } from 'chai';
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
        rvaimportservice: {
          importRvaVocabulary: sinon.stub().resolves({ id: 'v2' }),
          syncRvaVocabulary: sinon.stub().resolves({ created: 1, updated: 0, skipped: 0, lastSyncedAt: 'now' })
        }
      },
      log: { error: sinon.stub(), verbose: sinon.stub(), debug: sinon.stub() }
    };
    controller = new Controllers.Vocabulary();
  });

  afterEach(() => {
    sinon.restore();
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
});
