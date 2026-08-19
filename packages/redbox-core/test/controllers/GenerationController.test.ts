import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/GenerationController';

let expect: Chai.ExpectStatic;

before(async () => {
  expect = (await import('chai')).expect;
});

describe('GenerationController', () => {
  let controller: Controllers.Generation;
  let originalSails: unknown;
  let originalBrandingService: unknown;
  let runService: Record<string, sinon.SinonStub>;
  let provenanceService: Record<string, sinon.SinonStub>;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    runService = {
      launch: sinon.stub().resolves({ runId: 'run-1', status: 'questionsPending' }),
      getForActor: sinon.stub().resolves({ runId: 'run-1', status: 'completed' }),
      execute: sinon.stub().resolves({ runId: 'run-1', status: 'queued' }),
      requestCancel: sinon.stub().resolves({ runId: 'run-1', status: 'cancelRequested' }),
      commit: sinon.stub().resolves({ runId: 'run-1', status: 'committed' }),
    };
    provenanceService = {
      getForRecord: sinon.stub().resolves([]),
      review: sinon.stub().resolves({ id: 'provenance-1', reviewState: 'reviewed' }),
    };
    (global as any).sails = {
      config: {},
      services: {
        generationrunservice: runService,
        generationprovenanceservice: provenanceService,
      },
      log: {
        verbose: sinon.stub(), debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(),
        error: sinon.stub(), trace: sinon.stub(),
      },
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    controller = new Controllers.Generation();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
  });

  function request(params: Record<string, unknown> = {}, body: unknown = {}): Sails.Req {
    return {
      body,
      user: { id: 'user-1', username: 'researcher', roles: [{ name: 'Researcher' }] },
      session: { branding: 'default', portal: 'rdmp' },
      param: sinon.stub().callsFake((name: string) => params[name]),
    } as unknown as Sails.Req;
  }

  it('launches a brand-scoped run and returns the v2 creation response', async () => {
    const req = request({ branding: 'default', portal: 'rdmp' }, {
      bindingKey: 'activity-to-rdmp', sourceOid: 'activity-1',
    });
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.launch(req, res);

    expect(runService.launch.calledOnce).to.equal(true);
    expect(runService.launch.firstCall.args[0]).to.deep.include({
      bindingKey: 'activity-to-rdmp', sourceOid: 'activity-1',
    });
    expect(runService.launch.firstCall.args[0].actor).to.deep.include({
      brandId: 'brand-1', branding: 'default', portal: 'rdmp', userId: 'user-1',
    });
    expect(sendResp.firstCall.args[2]).to.deep.include({ status: 201 });
  });

  it('rejects malformed execution input before calling the run service', async () => {
    const req = request({ id: 'run-1' }, {
      answers: 'not-an-array', targetForm: { recordType: 'rdmp', mode: 'update' }, targetDraft: {},
    });
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.execute(req, {} as Sails.Res);

    expect(runService.execute.called).to.equal(false);
    expect(sendResp.firstCall.args[2].status).to.equal(400);
    expect(sendResp.firstCall.args[2].data.error).to.deep.include({
      code: 'GENERATION_REQUEST_INVALID', retryable: false,
    });
  });

  it('does not expose unexpected service errors in the response', async () => {
    runService.getForActor.rejects(new Error('provider response contained private project data'));
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getRun(request({ id: 'run-1' }), {} as Sails.Res);

    const payload = sendResp.firstCall.args[2];
    expect(payload.status).to.equal(503);
    expect(payload.data.error).to.deep.include({ code: 'GENERATION_PROVIDER_UNAVAILABLE', retryable: false });
    expect(JSON.stringify(payload)).not.to.contain('private project data');
    expect((global as any).sails.log.error.calledOnce).to.equal(true);
  });

  it('requires an authenticated brand session before resolving services', async () => {
    (global as any).BrandingService.getBrand.returns(undefined);
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getProvenance(request({ oid: 'record-1' }), {} as Sails.Res);

    expect(provenanceService.getForRecord.called).to.equal(false);
    expect(sendResp.firstCall.args[2]).to.deep.include({ status: 403 });
    expect(sendResp.firstCall.args[2].data.error.code).to.equal('GENERATION_SOURCE_FORBIDDEN');
  });

  it('validates commit review identifiers before dispatch', async () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.commit(request({ id: 'run-1' }, {
      targetOid: 'target-1', candidateDigest: 'digest', reviewedFieldIds: [42],
    }), {} as Sails.Res);

    expect(runService.commit.called).to.equal(false);
    expect(sendResp.firstCall.args[2].status).to.equal(409);
    expect(sendResp.firstCall.args[2].data.error.code).to.equal('GENERATION_COMMIT_INVALID');
  });
});
