let expect: Chai.ExpectStatic;
import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/RenderViewController';

before(async () => {
  expect = (await import('chai')).expect;
});

describe('RenderViewController', () => {
  let controller: Controllers.RenderView;
  let originalTranslationService: unknown;

  beforeEach(() => {
    originalTranslationService = (global as any).TranslationService;
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key: string) => ({
        'default-title': 'Site',
        'welcome-title': 'Welcome',
      }[key] ?? key)),
    };
    controller = new Controllers.RenderView();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).TranslationService = originalTranslationService;
  });

  it('formats translated pageTitleKey into title local', () => {
    const req = { options: { locals: { view: 'homepage', pageTitleKey: 'welcome-title' } } } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');

    controller.render(req, res);

    expect(sendViewStub.calledOnce).to.be.true;
    expect(sendViewStub.firstCall.args[2]).to.equal('homepage');
    expect(sendViewStub.firstCall.args[3]).to.deep.equal({ title: 'Welcome | Site' });
  });

  it('supports literal pageTitle', () => {
    const req = { options: { locals: { view: 'getAdvice', pageTitle: 'Get advice' } } } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');

    controller.render(req, res);

    expect(sendViewStub.calledOnce).to.be.true;
    expect(sendViewStub.firstCall.args[3]).to.deep.equal({ title: 'Get advice | Site' });
  });
});
