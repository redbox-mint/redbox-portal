import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/GenerationController';
import { generation } from '../../src/config/generation.config';
import { GenerationError } from '../../src/model/generation';
import { mkdtemp, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
      addDocument: sinon.stub().resolves({ runId: 'run-1', documents: [{ id: 'document-1' }] }),
      removeDocument: sinon.stub().resolves({ runId: 'run-1', documents: [] }),
    };
    provenanceService = {
      getForRecord: sinon.stub().resolves([]),
      review: sinon.stub().resolves({ id: 'provenance-1', reviewState: 'reviewed' }),
    };
    (global as any).sails = {
      config: { generation: structuredClone(generation) },
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

  it('allows document-only launch without accepting a blank source identifier', async () => {
    const sendResp = sinon.stub(controller as unknown as { sendResp: (...args: unknown[]) => unknown }, 'sendResp');
    await controller.launch(request({}, { bindingKey: 'documents' }), {} as Sails.Res);
    expect(runService.launch.firstCall.args[0]).not.to.have.property('sourceOid');
    await controller.launch(request({}, { bindingKey: 'documents', sourceOid: ' ' }), {} as Sails.Res);
    expect(runService.launch.calledOnce).to.equal(true);
    expect(sendResp.lastCall.args[2]).to.have.property('status', 400);
  });

  it('authorizes before receiving a document and removes the temporary original', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'generation-upload-test-'));
    const fd = join(directory, 'upload');
    await writeFile(fd, 'Synthetic grant');
    const upload = sinon.stub().callsFake((_options: unknown, callback: (error: unknown, files: unknown[]) => void) => callback(null, [{ fd, filename: 'grant.txt' }]));
    const req = request({ id: 'run-1' });
    Reflect.set(req, '_fileparser', {});
    Reflect.set(req, 'file', () => ({ upload }));
    const sendResp = sinon.stub(controller as unknown as { sendResp: (...args: unknown[]) => unknown }, 'sendResp');
    runService.addDocument.callsFake(async (_actor: unknown, _runId: string, filename: string, bytes: Buffer) => {
      expect(filename).to.equal('grant.txt');
      expect(bytes.toString()).to.equal('Synthetic grant');
      return { runId: 'run-1', documents: [{ id: 'document-1' }] };
    });
    try {
      await controller.addDocument(req, {} as Sails.Res);
      expect(runService.getForActor.calledBefore(upload)).to.equal(true);
      expect(runService.addDocument.calledOnce).to.equal(true);
      expect(sendResp.firstCall.args[2]).to.have.property('status', 201);
      expect(await stat(fd).then(() => true, () => false)).to.equal(false);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('does not receive or parse uploads for an unauthorized run', async () => {
    runService.getForActor.rejects(new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Denied'));
    const upload = sinon.stub();
    const req = request({ id: 'run-1' });
    Reflect.set(req, '_fileparser', {});
    Reflect.set(req, 'file', () => ({ upload }));
    const sendResp = sinon.stub(controller as unknown as { sendResp: (...args: unknown[]) => unknown }, 'sendResp');
    await controller.addDocument(req, {} as Sails.Res);
    expect(upload.called).to.equal(false);
    expect(runService.addDocument.called).to.equal(false);
    expect(sendResp.firstCall.args[2]).to.have.property('status', 403);
  });
});
