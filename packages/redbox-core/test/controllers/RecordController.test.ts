let expect: Chai.ExpectStatic;
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers } from '../../src/controllers/RecordController';
import { Controllers as AsynchControllers } from '../../src/controllers/AsynchController';
import { RecordSaveResponse } from '../../src/RecordSaveResponse';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';

before(async () => {
  expect = (await import('chai')).expect;
});

describe('RecordController getWorkflowSteps', () => {
  let controller: Controllers.Record;
  let originalSails: any;
  let originalBrandingService: any;
  let originalRecordTypesService: any;
  let originalWorkflowStepsService: any;
  let originalDashboardTypesService: any;
  let originalFormsService: any;
  let originalFormRecordConsistencyService: any;
  let originalTranslationService: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalRecordTypesService = (global as any).RecordTypesService;
    originalWorkflowStepsService = (global as any).WorkflowStepsService;
    originalDashboardTypesService = (global as any).DashboardTypesService;
    originalFormsService = (global as any).FormsService;
    originalFormRecordConsistencyService = (global as any).FormRecordConsistencyService;
    originalTranslationService = (global as any).TranslationService;

    (global as any).sails = {
      config: {},
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
    };
    (global as any)._ = require('lodash');
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any).RecordTypesService = {
      get: sinon.stub(),
    };
    (global as any).WorkflowStepsService = {
      getAllForRecordType: sinon.stub(),
    };
    (global as any).DashboardTypesService = {
      getDashboardView: sinon.stub(),
    };
    (global as any).FormsService = {
      getFormByStartingWorkflowStep: sinon.stub(),
      getFormByName: sinon.stub(),
      buildClientFormConfig: sinon.stub(),
      discoverValidationOperations: sinon.stub(),
    };
    (global as any).FormRecordConsistencyService = {
      projectMetadataClientFormConfig: sinon.stub(),
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake(
        (key: string) =>
          ({
            'default-title': 'Site',
            'rdmp-title-label': 'RDMP',
            'dataRecord-title-label': 'Data Record',
            workspaces: 'Workspaces',
          })[key] ?? key
      ),
    };

    controller = new Controllers.Record();
    controller.recordsService = {
      getMeta: sinon.stub(),
      getDeletedRecordMeta: sinon.stub(),
      hasViewAccess: sinon.stub().returns(true),
      hasEditAccess: sinon.stub().returns(true),
      getAttachments: sinon.stub(),
      getResolvedPermissionsSummary: sinon.stub(),
    } as any;
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any).RecordTypesService = originalRecordTypesService;
    (global as any).WorkflowStepsService = originalWorkflowStepsService;
    (global as any).DashboardTypesService = originalDashboardTypesService;
    (global as any).FormsService = originalFormsService;
    (global as any).FormRecordConsistencyService = originalFormRecordConsistencyService;
    (global as any).TranslationService = originalTranslationService;
  });

  it('renders record view with saved metadata title', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { type: 'rdmp' },
      metadata: { title: 'Saved title' },
    });

    await controller.view(req, res);

    expect(sendViewStub.calledOnce).to.be.true;
    expect(sendViewStub.firstCall.args[2]).to.equal('record/view');
    expect(sendViewStub.firstCall.args[3]).to.deep.equal({ title: 'Saved title | Site' });
  });

  it('falls back to record type label for record view when metadata title is empty', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { type: 'rdmp' },
      metadata: { title: '   ' },
    });

    await controller.view(req, res);

    expect(sendViewStub.calledOnce).to.be.true;
    expect(sendViewStub.firstCall.args[3]).to.deep.equal({ title: 'RDMP | Site' });
  });

  it('falls back to oid for record view when metadata title and record type are missing', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: {},
      metadata: { title: '' },
    });

    await controller.view(req, res);

    expect(sendViewStub.calledOnce).to.be.true;
    expect(sendViewStub.firstCall.args[3]).to.deep.equal({ title: 'oid-1 | Site' });
  });

  it('preserves existing error path when record metadata fetch fails for view', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = { serverError: sinon.stub() } as unknown as Sails.Res;
    (controller.recordsService.getMeta as sinon.SinonStub).rejects(new Error('boom'));

    await controller.view(req, res);

    expect((res.serverError as any).calledOnce).to.be.true;
  });

  it('returns badRequest when record oid is empty', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('   '),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {
      badRequest: sinon.stub(),
    } as unknown as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');

    await controller.view(req, res);

    expect((res.badRequest as any).calledOnce).to.be.true;
    expect(sendViewStub.called).to.be.false;
    expect((controller.recordsService.getMeta as sinon.SinonStub).called).to.be.false;
  });

  it('returns forbidden when view access is denied', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {
      forbidden: sinon.stub(),
    } as unknown as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { type: 'rdmp' },
      metadata: { title: 'Saved title' },
    });
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(false);

    await controller.view(req, res);

    expect((res.forbidden as any).calledOnce).to.be.true;
    expect(sendViewStub.called).to.be.false;
    expect((controller.recordsService.getMeta as sinon.SinonStub).calledOnce).to.be.true;
  });

  it('returns notFound when record metadata lookup reports a missing record', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {
      notFound: sinon.stub(),
    } as unknown as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub).rejects(new Error('Record not found: oid-1'));

    await controller.view(req, res);

    expect((res.notFound as any).calledOnce).to.be.true;
    expect(sendViewStub.called).to.be.false;
  });

  it('returns server error when attachment listing fails', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      session: { branding: 'default' },
      user: { username: 'alice' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'brand-1', type: 'rdmp' },
    });
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(true);
    (controller.recordsService.getAttachments as sinon.SinonStub).rejects(new Error('boom'));

    await controller.getAttachments(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.include({ status: 500 });
  });

  it('returns resolved permissions when the user can view the record', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      user: { username: 'alice' },
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'brand-1' },
    });
    (controller.recordsService.getResolvedPermissionsSummary as sinon.SinonStub).resolves({
      edit: true,
      view: true,
    });

    await controller.getPermissions(req, res);

    expect((controller.recordsService.getResolvedPermissionsSummary as sinon.SinonStub).calledOnceWithExactly('oid-1'))
      .to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data).to.deep.equal({ edit: true, view: true });
  });

  it('returns revision metadata and ETag on an authorized browser record read', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      query: {},
      user: { username: 'alice' },
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const record = {
      redboxOid: 'oid-1',
      revision: 3,
      metaMetadata: { brandId: 'brand-1' },
      metadata: { title: 'Current' },
    };
    (controller.recordsService.getMeta as sinon.SinonStub).resolves(record);
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getMeta(req, {} as Sails.Res);

    expect(sendResp.firstCall.args[2]).to.deep.equal({
      data: record.metadata,
      meta: { oid: 'oid-1', revision: 3, entityTag: formatRecordEntityTag('oid-1', 3) },
      v1: record.metadata,
      headers: { ETag: formatRecordEntityTag('oid-1', 3) },
    });
  });

  it('rejects permission requests when the user cannot view the record', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      user: { username: 'alice' },
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'brand-1' },
    });
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(false);

    await controller.getPermissions(req, res);

    expect((controller.recordsService.getResolvedPermissionsSummary as sinon.SinonStub).called).to.be.false;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(403);
  });

  it('returns not found when permission metadata does not exist', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      user: { username: 'alice' },
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves(null);

    await controller.getPermissions(req, res);

    expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
  });

  it('uses saved metadata title on existing edit routes', async () => {
    const req = {
      param: sinon.stub().callsFake((name: string) => (name === 'oid' ? 'oid-1' : '')),
      query: {},
      session: { branding: 'default' },
      options: {},
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub)
      .onFirstCall()
      .resolves({
        redboxOid: 'oid-1',
        metaMetadata: { type: 'rdmp', form: 'form-1' },
        metadata: { title: 'Saved title' },
      })
      .onSecondCall()
      .resolves({
        redboxOid: 'oid-1',
        metaMetadata: { type: 'rdmp', form: 'form-1' },
        metadata: { title: 'Saved title' },
      });
    (global as any).FormsService.getFormByName.returns(of({ configuration: { type: 'rdmp' } }));

    const rendered = new Promise<void>(resolve => {
      sendViewStub.callsFake(() => {
        resolve();
        return undefined;
      });
    });

    controller.edit(req, res);
    await rendered;

    expect(sendViewStub.calledOnce).to.be.true;
    expect(sendViewStub.firstCall.args[2]).to.equal('record/edit');
    expect(sendViewStub.firstCall.args[3]).to.deep.include({ title: 'Saved title | Site' });
  });

  it('uses create record type title on create routes', async () => {
    const req = {
      param: sinon.stub().callsFake((name: string) => (name === 'recordType' ? 'rdmp' : '')),
      query: {},
      session: { branding: 'default' },
      options: {},
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (global as any).FormsService.getFormByStartingWorkflowStep.returns(of({ configuration: { type: 'rdmp' } }));

    const rendered = new Promise<void>(resolve => {
      sendViewStub.callsFake(() => {
        resolve();
        return undefined;
      });
    });

    controller.edit(req, res);
    await rendered;

    expect(sendViewStub.calledOnce).to.be.true;
    expect(sendViewStub.firstCall.args[2]).to.equal('record/edit');
    expect(sendViewStub.firstCall.args[3]).to.deep.include({ title: 'Create RDMP | Site' });
  });

  it('maps only the browser operation query to validationOperation while preserving CRUD intent', function () {
    const req = {
      params: { targetStep: 'route-step' },
      query: { operation: ' submit ' },
      headers: {},
      options: { locals: { portal: '  tenant-portal  ' } },
      body: {
        operation: 'body-must-not-control-validation',
        portal: 'forged-body-portal',
        targetStep: 'body-step',
        validationBypass: { mode: 'bypass' },
        schemaOperation: 'forged-operation',
        ifMatch: `"sha256:${'b'.repeat(64)}"`,
        schemaOutcome: { digest: 'b'.repeat(64) },
      },
      param: sinon.stub().callsFake((name: string) => (name === 'operation' ? 'body-operation' : 'body-step')),
    } as unknown as Sails.Req;
    const parsed = (controller as any).publicValidationOperation(req);
    const context = (controller as any).saveContext(req, 'transition', parsed.value);

    expect(parsed).to.deep.equal({ valid: true, value: 'submit' });
    expect(context.operation).to.equal('transition');
    expect(context.validationOperation).to.equal('submit');
    expect(context.schemaOperation).to.equal('submit');
    expect(context.portal).to.equal('tenant-portal');
    expect(context.ifMatch).to.equal(undefined);
    expect(context).not.to.have.property('schemaOutcome');
    expect(context.validationBypass).to.equal(undefined);
    expect(context.validationRequestParameters).to.deep.equal({ targetStep: 'route-step' });
    expect((req.param as sinon.SinonStub).notCalled).to.equal(true);
    expect((controller as any).publicValidationOperation({ query: {} })).to.deep.equal({ valid: true });
    expect(
      (controller as any).publicValidationOperation({
        query: { operation: 'bad operation' },
      })
    ).to.deep.equal({ valid: false });
  });

  it('keeps the literal v1 failure body while exposing typed v2 failures', function () {
    const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000010');
    result.outcome = 'not-saved';
    result.problems = [
      {
        kind: 'validation',
        phase: 'pre-save',
        issues: [{ message: '@validation-failed' }],
      },
    ];
    const sendResp = sinon.stub(controller as any, 'sendResp');

    (controller as any).sendSaveFailure(
      { headers: { 'X-ReDBox-Api-Version': '1.0' } },
      {},
      result,
      'Failed to save record'
    );
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 500,
      v1: { message: 'Failed to save record' },
    });

    sendResp.resetHistory();
    (controller as any).sendSaveFailure(
      { headers: { 'X-ReDBox-Api-Version': '2.0' } },
      {},
      result,
      'Failed to save record'
    );
    expect(sendResp.firstCall.args[2]).to.deep.include({
      status: 400,
      displayErrors: [{ title: '@validation-failed' }],
    });
    expect(sendResp.firstCall.args[2]).not.to.have.property('v1');
  });

  it('normalizes browser tags, form fingerprints, and resolution linkage once', function () {
    const entityTag = formatRecordEntityTag('oid-1', 6);
    const requestId = '00000000-0000-4000-8000-000000000011';
    const priorRequestId = '00000000-0000-4000-8000-000000000012';
    const req = {
      params: { oid: 'oid-1' },
      query: { merge: 'true' },
      headers: {
        'if-match': entityTag,
        'x-redbox-form-fingerprint': 'form-fingerprint-1',
        'x-redbox-save-request-id': requestId,
        'x-redbox-concurrency-resolution': 'client-manually-resolved',
        'x-redbox-resolution-of-request-id': priorRequestId,
      },
    } as unknown as Sails.Req;

    const parsed = (controller as any).mutationSaveContext(req, 'oid-1', 'update', undefined, undefined, true);
    expect(parsed.valid).to.equal(true);
    expect(parsed.context.requestId).to.equal(requestId);
    expect(parsed.context.concurrency).to.deep.equal({
      entityTagSupplied: true,
      expectedRevision: 6,
      formFingerprint: 'form-fingerprint-1',
      resolution: 'client-manually-resolved',
      resolutionOfRequestId: priorRequestId,
    });

    const malformed = (controller as any).mutationSaveContext(
      { headers: { 'if-match': `W/${entityTag}` } },
      'oid-1',
      'update',
      undefined,
      undefined,
      true
    );
    expect(malformed).to.deep.equal({
      valid: false,
      code: 'record-if-match-invalid',
      header: 'If-Match',
    });
  });

  it('maps certified browser concurrency outcomes without status inference', function () {
    const cases = [
      ['record-precondition-required', 428],
      ['record-revision-stale', 412],
      ['form-definition-changed', 409],
    ] as const;
    const entityTag = formatRecordEntityTag('oid-1', 8);
    const sendResp = sinon.stub(controller as any, 'sendResp');

    for (const [code, status] of cases) {
      sendResp.resetHistory();
      const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000013');
      result.outcome = 'not-saved';
      result.problems = [{ kind: 'conflict', phase: 'pre-save', issues: [{ code, message: `@${code}` }] }];
      result.setConcurrencyMetadata({ revision: 8, currentRevision: 8, entityTag });
      (controller as any).sendSaveFailure({ headers: { 'x-redbox-api-version': '2.0' } }, {}, result, 'Save failed');
      expect(sendResp.firstCall.args[2]).to.deep.include({
        status,
        headers: { ETag: entityTag },
        displayErrors: [{ code, title: `@${code}` }],
      });
      expect(sendResp.firstCall.args[2].meta).to.include({ outcome: 'not-saved' });
    }

    sendResp.resetHistory();
    const malformed = new RecordSaveResponse('00000000-0000-4000-8000-000000000014');
    malformed.outcome = 'unknown';
    (controller as any).sendSaveFailure(
      { headers: { 'x-redbox-api-version': '2.0' } },
      {},
      malformed,
      'Malformed failure'
    );
    expect(sendResp.firstCall.args[2].status).to.equal(500);
  });

  it('projects latest conflict metadata only while browser view access remains', async function () {
    const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000015');
    result.outcome = 'not-saved';
    result.problems = [
      {
        kind: 'conflict',
        phase: 'persistence',
        issues: [{ code: 'record-revision-stale', message: '@record-revision-stale' }],
      },
    ];
    result.setProjectedMetadata({ attackerCandidate: 'must-not-return' });
    const latest = {
      redboxOid: 'oid-1',
      revision: 4,
      metaMetadata: { brandId: 'brand-1', form: 'form-1' },
      metadata: { title: 'Latest', hidden: 'must-not-return' },
    };
    (controller.recordsService.getMeta as sinon.SinonStub).resolves(latest);
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(true);
    (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
    (global as any).FormsService.getFormByName.returns(of({ configuration: { componentDefinitions: [] } }));
    (global as any).FormsService.buildClientFormConfig.resolves({ componentDefinitions: [] });
    (global as any).FormRecordConsistencyService.projectMetadataClientFormConfig.resolves({ title: 'Latest' });

    expect(
      await (controller as any).projectSafeSaveFailure(
        { user: { username: 'alice' } },
        { id: 'brand-1' },
        'oid-1',
        result
      )
    ).to.equal(true);
    expect(result.metadata).to.deep.equal({ title: 'Latest' });
    expect(result.concurrency?.revision).to.equal(4);
    expect((global as any).FormsService.buildClientFormConfig.firstCall.args[1]).to.equal('view');
    expect((global as any).FormRecordConsistencyService.projectMetadataClientFormConfig.firstCall.args[2]).to.equal(
      'view'
    );

    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(false);
    result.setProjectedMetadata({ attackerCandidate: 'must-not-return' });
    expect(
      await (controller as any).projectSafeSaveFailure(
        { user: { username: 'alice' } },
        { id: 'brand-1' },
        'oid-1',
        result
      )
    ).to.equal(false);
    expect(result.metadata).to.equal(null);
    expect(result.concurrency).to.equal(undefined);
  });

  it('never falls back to unrestricted conflict metadata when no safe form projection exists', async function () {
    const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000016');
    result.outcome = 'not-saved';
    result.problems = [
      {
        kind: 'conflict',
        phase: 'pre-save',
        issues: [{ code: 'record-revision-stale', message: '@record-revision-stale' }],
      },
    ];
    result.setProjectedMetadata({ candidateSecret: true });
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      revision: 5,
      metaMetadata: { brandId: 'brand-1', form: 'missing-form' },
      metadata: { unrestrictedSecret: true },
    });
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(true);
    (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
    (global as any).FormsService.getFormByName.returns(of(undefined));

    expect(
      await (controller as any).projectSafeSaveFailure(
        { user: { username: 'alice' } },
        { id: 'brand-1' },
        'oid-1',
        result
      )
    ).to.equal(true);
    expect(result.metadata).to.equal(null);
    expect(result.concurrency?.revision).to.equal(5);
  });

  it('returns a private browser lifecycle conflict when tombstone view permission was revoked', async function () {
    const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000017');
    result.outcome = 'not-saved';
    result.problems = [
      {
        kind: 'conflict',
        phase: 'persistence',
        issues: [{ code: 'record-lifecycle-operation-conflict', message: '@record-lifecycle-operation-conflict' }],
      },
    ];
    result.setProjectedMetadata({ staleDeletedValue: 'must-not-return' });
    result.setConcurrencyMetadata({ revision: 7, entityTag: formatRecordEntityTag('oid-1', 7) });
    (controller.recordsService.getMeta as sinon.SinonStub).resolves(null);
    (controller.recordsService.getDeletedRecordMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      revision: 13,
      metaMetadata: { brandId: 'brand-1', form: 'form-1' },
      metadata: { deletedSecret: 'must-not-return' },
    });
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(false);
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await (controller as any).sendLifecycleResult(
      { user: { username: 'alice' }, headers: { 'x-redbox-api-version': '2.0' } },
      {},
      { id: 'brand-1' },
      'oid-1',
      result,
      'Lifecycle conflict'
    );

    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 403,
      displayErrors: [{ code: 'not-authorised' }],
    });
    expect(result.metadata).to.equal(null);
    expect(result.concurrency).to.equal(undefined);
  });

  it('returns the stable W04 fingerprint with generated browser form metadata', async function () {
    const form = {
      id: 'form-1',
      name: 'dataset-draft',
      branding: 'brand-1',
      configuration: { type: 'dataset', componentDefinitions: [] },
    };
    (global as any).sails.config = { reusableFormDefinitions: {}, validators: { definitions: [] } };
    (global as any).sails.services = {
      formpayloadprehydrateservice: { build: sinon.stub().resolves({}) },
    };
    (global as any).FormsService.getFormByStartingWorkflowStep.returns(of(form));
    (global as any).FormsService.buildClientFormConfig.resolves(form.configuration);
    (global as any).FormsService.discoverValidationOperations.resolves([]);
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
    (global as any).WorkflowStepsService.getFirst = sinon
      .stub()
      .returns(of({ name: 'draft', config: { form: 'dataset-draft' } }));
    (controller.recordsService as any).getRecordFormFingerprint = sinon.stub().returns('form-fingerprint-1');
    const req = {
      param: sinon
        .stub()
        .callsFake((name: string) => (name === 'name' ? 'dataset' : name === 'formName' ? 'dataset-draft' : undefined)),
      query: { edit: 'true' },
      session: { branding: 'default' },
      user: { username: 'alice', roles: [] },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getForm(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2].meta).to.deep.include({
      formFingerprint: 'form-fingerprint-1',
      recordType: 'dataset',
      oid: null,
    });
    // A create has no stored record, so its contract is the starting step the
    // save will apply, not the form object this route happened to load.
    const createArgs = (controller.recordsService as any).getRecordFormFingerprint.firstCall.args;
    expect(createArgs[0]).to.deep.equal({
      metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      workflow: { stage: 'draft' },
    });
    expect(createArgs[1]).to.deep.equal({ name: 'dataset' });
    expect(createArgs[2]).to.equal(undefined);
    expect(createArgs[3]).to.equal(form);
  });

  it('fingerprints the authoritative delivered form and preserves target intent', async function () {
    const currentRec = {
      redboxOid: 'oid-1',
      revision: 3,
      metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      metadata: { title: 'Current' },
      workflow: { stage: 'draft' },
    };
    const recordType = { name: 'dataset' };
    const targetStep = { name: 'published', config: { form: 'dataset-published' } };
    (global as any).sails.config = { reusableFormDefinitions: {}, validators: { definitions: [] } };
    (global as any).sails.services = {
      formpayloadprehydrateservice: { build: sinon.stub().resolves({}) },
    };
    (controller.recordsService.getMeta as sinon.SinonStub).resolves(currentRec);
    (controller.recordsService as any).hasEditAccess = sinon.stub().returns(true);
    (global as any).FormsService.getForm = sinon
      .stub()
      .resolves({ id: 'form-1', name: 'dataset-draft', branding: 'brand-1', configuration: { type: 'dataset' } });
    (global as any).FormsService.buildClientFormConfig.resolves({ type: 'dataset' });
    (global as any).FormsService.discoverValidationOperations.resolves([]);
    (global as any).RecordTypesService.get.returns(of(recordType));
    (global as any).WorkflowStepsService.get = sinon.stub().returns(of(targetStep));
    (controller.recordsService as any).getRecordFormFingerprint = sinon.stub().resolves('form-fingerprint-2');
    const req = {
      param: sinon
        .stub()
        .callsFake((name: string) =>
          name === 'oid' ? 'oid-1' : name === 'formName' ? 'dataset-draft' : name === 'name' ? 'dataset' : undefined
        ),
      query: { edit: 'true', targetStep: 'published' },
      session: { branding: 'default' },
      user: { username: 'alice', roles: [] },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getForm(req, {} as Sails.Res);

    const args = (controller.recordsService as any).getRecordFormFingerprint.firstCall.args;
    expect(args[0]).to.equal(currentRec);
    expect(args[1]).to.deep.equal(recordType);
    expect(args[2]).to.deep.equal(targetStep);
    expect(args[3]).to.deep.include({ id: 'form-1', name: 'dataset-draft', branding: 'brand-1' });
    expect(sendResp.firstCall.args[2].meta).to.deep.include({
      formFingerprint: 'form-fingerprint-2',
      revision: 3,
      entityTag: formatRecordEntityTag('oid-1', 3),
    });
    expect(sendResp.firstCall.args[2].headers).to.deep.equal({ ETag: formatRecordEntityTag('oid-1', 3) });
  });

  it('rejects a caller-selected form that differs from the stored authoritative form', async function () {
    const currentRec = {
      redboxOid: 'oid-1',
      revision: 3,
      metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      metadata: { title: 'Current' },
      workflow: { stage: 'draft' },
    };
    (controller.recordsService.getMeta as sinon.SinonStub).resolves(currentRec);
    (controller.recordsService as any).hasEditAccess = sinon.stub().returns(true);
    (controller.recordsService as any).getRecordFormFingerprint = sinon.stub();
    (global as any).FormsService.getForm = sinon.stub();
    const req = {
      param: sinon
        .stub()
        .callsFake((name: string) =>
          name === 'oid' ? 'oid-1' : name === 'formName' ? 'client-selected' : name === 'name' ? 'dataset' : undefined
        ),
      query: { edit: 'true' },
      session: { branding: 'default' },
      user: { username: 'alice', roles: [] },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getForm(req, {} as Sails.Res);

    expect(sendResp.firstCall.args[2]).to.deep.include({
      status: 409,
      displayErrors: [{ code: 'form-definition-changed' }],
    });
    expect((global as any).FormsService.getForm.notCalled).to.equal(true);
    expect((controller.recordsService as any).getRecordFormFingerprint.notCalled).to.equal(true);
  });

  it('includes the authoritative revision on browser actionable list rows', async function () {
    controller.recordsService = {
      getRecords: sinon.stub().resolves({
        isSuccessful: () => true,
        totalItems: 1,
        items: [
          {
            redboxOid: 'oid-1',
            revision: 11,
            metadata: { title: 'Record' },
            dateCreated: '2026-01-01T00:00:00Z',
            lastSaveDate: '2026-01-02T00:00:00Z',
          },
        ],
      }),
      hasEditAccess: sinon.stub().returns(true),
    } as any;

    const response = await (controller as any).getRecords(undefined, 'dataset', 0, 10, { username: 'alice' }, [], {
      id: 'brand-1',
    });

    expect(response.items[0]).to.deep.include({ oid: 'oid-1', revision: 11, hasEditAccess: true });
  });

  it('includes the tombstone revision on browser deleted-record list rows', async function () {
    controller.recordsService = {
      getDeletedRecords: sinon.stub().resolves({
        isSuccessful: () => true,
        totalItems: 1,
        items: [
          {
            redboxOid: 'oid-1',
            revision: 12,
            deletedRecordMetadata: { metadata: { title: 'Deleted record' } },
            dateDeleted: '2026-01-03T00:00:00Z',
          },
        ],
      }),
    } as any;

    const response = await (controller as any).getDeletedRecords(
      undefined,
      'dataset',
      0,
      10,
      { username: 'alice' },
      [],
      { id: 'brand-1' }
    );

    expect(response.items[0]).to.deep.include({ oid: 'oid-1', revision: 12 });
  });

  it('preserves the form-configuration failure response before operation discovery', async function () {
    (global as any).FormsService.getFormByStartingWorkflowStep.returns(
      of({
        name: 'dataset-draft',
        configuration: null,
      })
    );
    const req = {
      param: sinon
        .stub()
        .callsFake((name: string) => (name === 'name' ? 'dataset' : name === 'formName' ? 'dataset-draft' : undefined)),
      query: { edit: 'true' },
      session: { branding: 'default' },
      user: { username: 'alice', roles: [] },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getForm(req, {} as Sails.Res);

    const message = 'Form configuration not found for form dataset-draft, record type dataset, oid null';
    expect(
      sendResp.calledOnceWith(req, sinon.match.any, {
        status: 500,
        displayErrors: [{ detail: message }],
        v1: { message },
      })
    ).to.equal(true);
    expect((global as any).FormsService.buildClientFormConfig.called).to.equal(false);
    expect((global as any).FormsService.discoverValidationOperations.called).to.equal(false);
  });

  it('returns 400 when record type is missing after normalization', async () => {
    const req = {
      param: sinon.stub().returns('   '),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getWorkflowSteps(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.equal({
      status: 400,
      displayErrors: [{ detail: 'Record Type is required' }],
    });
    expect((global as any).RecordTypesService.get.called).to.be.false;
    expect((global as any).WorkflowStepsService.getAllForRecordType.called).to.be.false;
  });

  it('returns 400 when record type is invalid', async () => {
    const req = {
      param: sinon.stub().returns('dataset'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (global as any).RecordTypesService.get.returns(of(null));

    await controller.getWorkflowSteps(req, res);

    expect((global as any).BrandingService.getBrand.calledWith('default')).to.be.true;
    expect((global as any).RecordTypesService.get.calledWith(sinon.match({ id: 'brand-1' }), 'dataset')).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.equal({
      status: 400,
      displayErrors: [{ detail: 'Record Type provided is not valid' }],
    });
    expect((global as any).WorkflowStepsService.getAllForRecordType.called).to.be.false;
  });

  it('returns workflow steps for a valid trimmed record type', async () => {
    const req = {
      param: sinon.stub().returns(' dataset '),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    const recordType = { id: 'rt-1', name: 'dataset' };
    const wfSteps = [{ name: 'draft' }, { name: 'review' }];
    (global as any).RecordTypesService.get.returns(of(recordType));
    (global as any).WorkflowStepsService.getAllForRecordType.returns(of(wfSteps));

    await controller.getWorkflowSteps(req, res);

    expect((global as any).RecordTypesService.get.calledWith(sinon.match({ id: 'brand-1' }), 'dataset')).to.be.true;
    expect((global as any).WorkflowStepsService.getAllForRecordType.calledWith(recordType)).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.equal({ data: wfSteps });
  });

  it('returns dashboard view metadata for a valid dashboard view', async () => {
    const req = {
      param: sinon.stub().withArgs('dashboardView').returns('consolidated'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    const dashboardView = {
      name: 'consolidated',
      titleLabelKey: 'consolidated',
      dashboardType: 'consolidated',
      sourceRecordType: 'rdmp',
      showAdminSideBar: true,
      steps: [
        {
          name: 'consolidated',
          sourceRecordType: 'rdmp',
          fetchMode: 'allForRecordType',
          dashboardTable: { rowConfig: [] },
        },
      ],
    };
    (global as any).DashboardTypesService.getDashboardView.returns(dashboardView);

    await controller.getDashboardView(req, res);

    expect((global as any).DashboardTypesService.getDashboardView.calledWithExactly('consolidated')).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2].data).to.deep.include({
      name: 'consolidated',
      titleLabelKey: 'consolidated',
      dashboardType: 'consolidated',
      sourceRecordType: 'rdmp',
      showAdminSideBar: true,
    });
    expect(sendRespStub.firstCall.args[2].data.steps).to.deep.equal([
      {
        name: 'consolidated',
        sourceRecordType: 'rdmp',
        sourceWorkflowStage: undefined,
        fetchMode: 'allForRecordType',
        dashboardTable: { rowConfig: [] },
        baseRecordType: undefined,
      },
    ]);
  });

  it('returns 404 when dashboard view config is malformed', async () => {
    const req = {
      param: sinon.stub().withArgs('dashboardView').returns('malformed'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (global as any).DashboardTypesService.getDashboardView.returns({
      titleLabelKey: 'malformed',
      dashboardType: 'consolidated',
      sourceRecordType: 'rdmp',
      steps: [],
    });

    await controller.getDashboardView(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.equal({
      status: 404,
      displayErrors: [{ detail: 'Dashboard view provided is not valid' }],
    });
  });

  it('redirects the legacy consolidated dashboard route', () => {
    const req = {} as Sails.Req;
    const res = {
      redirect: sinon.stub(),
    } as unknown as Sails.Res;
    (global as any).BrandingService.getFullPath = sinon.stub().returns('/default/rdmp');

    controller.redirectLegacyConsolidatedDashboard(req, res);

    expect((res.redirect as any).calledWith('/default/rdmp/dashboard-view/consolidated')).to.be.true;
  });

  it('builds an effective client form config with the record brand and user roles', async () => {
    const formConfig = { componentDefinitions: [] };
    const clientFormConfig = { componentDefinitions: [{ name: 'title' }] };
    (global as any).sails.config = { reusableFormDefinitions: { shared: {} } };
    (global as any).FormsService.getFormByName.returns(of({ configuration: formConfig }));
    (global as any).FormsService.buildClientFormConfig.returns(clientFormConfig);
    const req = { user: { roles: [{ name: 'admin' }, { name: '' }, {}] } } as unknown as Sails.Req;
    const record = { metaMetadata: { brandId: 'record-brand' }, metadata: { title: 'A title' } };
    const brand = { id: 'fallback-brand', name: 'fallback' };

    const result = await (controller as any).getEffectiveClientFormConfig(req, brand, record, 'form-1', false, 'edit');

    expect(result).to.equal(clientFormConfig);
    expect((global as any).FormsService.getFormByName.calledWith('form-1', false, 'record-brand')).to.be.true;
    expect(
      (global as any).FormsService.buildClientFormConfig.calledWith(
        formConfig,
        'edit',
        ['admin'],
        record.metadata,
        { shared: {} },
        'fallback',
        sinon.match.any,
        { user: req.user, brand }
      )
    ).to.be.true;
  });

  it('returns no post-save metadata when syncing is not applicable', async () => {
    (global as any).sails.config = { record: { form: { returnMetadataOnSave: true } } };
    const req = {} as Sails.Req;
    const brand = { id: 'brand-1', name: 'default' };

    expect(await (controller as any).getPostSaveMetadata(req, brand, null, null)).to.equal(null);
    expect(await (controller as any).getPostSaveMetadata(req, brand, { metadata: {} }, { name: 'next' })).to.equal(
      null
    );
    expect(
      await (controller as any).getPostSaveMetadata(req, brand, { metadata: {}, metaMetadata: {} }, null)
    ).to.equal(null);
    (global as any).sails.config.record.form.returnMetadataOnSave = false;
    expect(
      await (controller as any).getPostSaveMetadata(
        req,
        brand,
        {
          metadata: {},
          metaMetadata: { form: 'form-1' },
        },
        null
      )
    ).to.equal(null);
  });

  it('projects post-save metadata and handles projection failures', async () => {
    (global as any).sails.config = { record: { form: { returnMetadataOnSave: true } }, reusableFormDefinitions: {} };
    const req = {} as Sails.Req;
    const brand = { id: 'brand-1', name: 'default' };
    const savedRecord = { redboxOid: 'oid-1', metaMetadata: { form: 'form-1' }, metadata: { title: 'server title' } };
    const clientFormConfig = { componentDefinitions: [] };
    sinon.stub(controller as any, 'getEffectiveClientFormConfig').resolves(clientFormConfig);
    (global as any).FormRecordConsistencyService.projectMetadataClientFormConfig.resolves({ title: 'projected' });

    expect(await (controller as any).getPostSaveMetadata(req, brand, savedRecord, null)).to.deep.equal({
      title: 'projected',
    });

    (global as any).FormRecordConsistencyService.projectMetadataClientFormConfig.rejects(
      new Error('projection failed')
    );
    expect(await (controller as any).getPostSaveMetadata(req, brand, savedRecord, null)).to.equal(null);
    expect((global as any).sails.log.error.calledOnce).to.be.true;
  });

  it('routes browser stepTo through the authoritative transition save boundary', async () => {
    const currentRecord = {
      redboxOid: 'oid-1',
      revision: 4,
      metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      metadata: { title: 'Before' },
      workflow: { stage: 'draft' },
      authorization: { edit: ['tester'] },
    };
    const nextStep = {
      name: 'review',
      config: {
        form: 'dataset-review',
        workflow: { stage: 'review' },
        authorization: { transitionRoles: ['Researcher'] },
      },
    };
    const saved = new RecordSaveResponse('00000000-0000-4000-8000-000000000123');
    saved.oid = 'oid-1';
    saved.outcome = 'saved';
    saved.success = true;
    const updateMeta = sinon.stub().resolves(saved);
    const legacyPremutation = sinon.stub();
    controller.recordsService = {
      getMeta: sinon.stub().resolves(currentRecord),
      hasEditAccess: sinon.stub().returns(true),
      updateMeta,
      setWorkflowStepRelatedMetadata: legacyPremutation,
    } as any;
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
    (global as any).WorkflowStepsService.get = sinon.stub().returns(of(nextStep));
    const params: Record<string, unknown> = {
      oid: 'oid-1',
      targetStep: 'review',
    };
    const req = {
      body: { title: 'After', targetStep: 'body-step', operation: 'body-operation' },
      headers: {
        'if-match': formatRecordEntityTag('oid-1', 4),
        'x-redbox-form-fingerprint': 'current-form-fingerprint',
      },
      params,
      query: { operation: 'submit' },
      session: { branding: 'default' },
      user: { username: 'tester', roles: [{ name: 'Researcher' }] },
      param: sinon
        .stub()
        .callsFake((name: string) =>
          name === 'targetStep' ? 'body-step' : name === 'operation' ? 'body-operation' : params[name]
        ),
    } as unknown as Sails.Req;
    sinon.stub(controller as any, 'getApiVersion').returns('1.0');
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.stepTo(req, {} as Sails.Res);

    expect(legacyPremutation.notCalled).to.equal(true);
    expect(updateMeta.calledOnce).to.equal(true);
    expect(updateMeta.firstCall.args.slice(0, 8)).to.deep.equal([
      { id: 'brand-1', name: 'default' },
      'oid-1',
      currentRecord,
      req.user,
      true,
      true,
      nextStep,
      {
        metadata: { title: 'After', targetStep: 'body-step', operation: 'body-operation' },
        mode: 'replace',
      },
    ]);
    expect(currentRecord.workflow.stage).to.equal('draft');
    expect(currentRecord.metaMetadata.form).to.equal('dataset-draft');
    expect(updateMeta.firstCall.args[8]).to.deep.include({
      routeFamily: 'browser',
      operation: 'transition',
      targetStep: 'review',
      validationOperation: 'submit',
      validationRequestParameters: { targetStep: 'review' },
    });
    expect(updateMeta.firstCall.args[8].concurrency).to.deep.equal({
      entityTagSupplied: true,
      expectedRevision: 4,
      formFingerprint: 'current-form-fingerprint',
    });
    expect((req.param as sinon.SinonStub).notCalled).to.equal(true);
    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2].v1).to.deep.equal({
      success: true,
      oid: 'oid-1',
      message: '',
      data: undefined,
      metadata: null,
      details: undefined,
      totalItems: 0,
      items: [],
    });
  });

  it('does not let browser update body metadata initiate a transition or validation operation', async () => {
    const currentRecord = {
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      metadata: { title: 'Before' },
      workflow: { stage: 'draft' },
      authorization: { edit: ['tester'] },
    };
    const saved = new RecordSaveResponse('00000000-0000-4000-8000-000000000124');
    saved.oid = 'oid-1';
    saved.outcome = 'saved';
    saved.success = true;
    const updateMeta = sinon.stub().resolves(saved);
    controller.recordsService = {
      getMeta: sinon.stub().resolves(currentRecord),
      hasEditAccess: sinon.stub().returns(true),
      updateMeta,
    } as any;
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
    (global as any).WorkflowStepsService.get = sinon.stub();
    const req = {
      body: { title: 'After', targetStep: 'published', operation: 'publish' },
      headers: {},
      params: { oid: 'oid-1' },
      query: {},
      session: { branding: 'default' },
      user: { username: 'tester' },
      param: sinon
        .stub()
        .callsFake((name: string) =>
          name === 'targetStep' ? 'published' : name === 'operation' ? 'publish' : undefined
        ),
    } as unknown as Sails.Req;
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');
    sinon.stub(controller as any, 'sendResp');

    await (controller as any).updateInternal(req, {} as Sails.Res);

    expect((global as any).WorkflowStepsService.get.notCalled).to.equal(true);
    expect(updateMeta.calledOnce).to.equal(true);
    expect(updateMeta.firstCall.args[7]).to.deep.equal({ metadata: req.body, mode: 'replace' });
    expect(updateMeta.firstCall.args[7].metadata).to.equal(req.body);
    const context = updateMeta.firstCall.args[8];
    expect(context).to.include({ routeFamily: 'browser', operation: 'update' });
    expect(context.concurrency).to.deep.equal({ entityTagSupplied: false });
    expect(context.targetStep).to.equal(undefined);
    expect(context.validationOperation).to.equal(undefined);
    expect(context.validationRequestParameters).to.deep.equal({});
    expect((req.param as sinon.SinonStub).notCalled).to.equal(true);
  });

  it('preserves strict, stale, and form-drift statuses on browser update routes', async () => {
    const cases = [
      { code: 'record-precondition-required', status: 428, headers: {} },
      {
        code: 'record-revision-stale',
        status: 412,
        headers: {
          'if-match': formatRecordEntityTag('oid-1', 4),
          'x-redbox-form-fingerprint': 'current-form-fingerprint',
        },
      },
      {
        code: 'form-definition-changed',
        status: 409,
        headers: {
          'if-match': formatRecordEntityTag('oid-1', 5),
          'x-redbox-form-fingerprint': 'old-form-fingerprint',
        },
      },
    ] as const;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));

    for (const testCase of cases) {
      sendResp.resetHistory();
      const currentRecord = {
        redboxOid: 'oid-1',
        revision: 5,
        metaMetadata: { brandId: 'brand-1', type: 'dataset', form: '' },
        metadata: { title: 'Current' },
        authorization: { edit: ['tester'], view: ['tester'] },
      };
      const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000126');
      result.outcome = 'not-saved';
      result.problems = [
        {
          kind: 'conflict',
          phase: 'pre-save',
          issues: [{ code: testCase.code, message: `@${testCase.code}` }],
        },
      ];
      result.setConcurrencyMetadata({
        revision: 5,
        entityTag: formatRecordEntityTag('oid-1', 5),
        ...(testCase.code === 'form-definition-changed' ? { formFingerprint: 'current-form-fingerprint' } : {}),
      });
      const updateMeta = sinon.stub().resolves(result);
      controller.recordsService = {
        getMeta: sinon.stub().resolves(currentRecord),
        hasEditAccess: sinon.stub().returns(true),
        hasViewAccess: sinon.stub().returns(true),
        updateMeta,
      } as any;
      const req = {
        body: { title: 'Rejected' },
        headers: { 'x-redbox-api-version': '2.0', ...testCase.headers },
        params: { oid: 'oid-1' },
        query: {},
        session: { branding: 'default' },
        user: { username: 'tester' },
      } as unknown as Sails.Req;

      await (controller as any).updateInternal(req, {} as Sails.Res);

      expect(sendResp.firstCall.args[2].status, testCase.code).to.equal(testCase.status);
      expect(sendResp.firstCall.args[2].meta.outcome).to.equal('not-saved');
      expect(updateMeta.firstCall.args[8].concurrency.entityTagSupplied).to.equal(
        testCase.code !== 'record-precondition-required'
      );
    }
  });

  it('rejects malformed and wildcard browser tags before record work', async () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');
    const getMeta = sinon.stub();
    const updateMeta = sinon.stub();
    controller.recordsService = { getMeta, updateMeta } as any;

    for (const ifMatch of [`W/${formatRecordEntityTag('oid-1', 5)}`, '*']) {
      sendResp.resetHistory();
      await (controller as any).updateInternal(
        {
          body: { title: 'Rejected' },
          headers: { 'x-redbox-api-version': '2.0', 'if-match': ifMatch },
          params: { oid: 'oid-1' },
          query: {},
          session: { branding: 'default' },
          user: { username: 'tester' },
        },
        {}
      );
      expect(sendResp.firstCall.args[2]).to.deep.equal({
        status: 400,
        displayErrors: [{ code: 'record-if-match-invalid', source: { header: 'If-Match' } }],
      });
    }
    expect(getMeta.notCalled).to.equal(true);
    expect(updateMeta.notCalled).to.equal(true);
  });

  it('passes the raw browser merge delta to RecordsService with array replacement semantics', async () => {
    const currentRecord = {
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      metadata: {
        retained: 'keep',
        nested: { retained: true, values: [{ id: 'stored-nested' }] },
        values: [{ id: 'stored' }],
      },
      workflow: { stage: 'draft' },
      authorization: { edit: ['tester'] },
    };
    const rawDelta = {
      nested: { incoming: true, values: [{ id: 'incoming-nested' }] },
      values: [{ id: 'incoming' }],
    };
    const saved = new RecordSaveResponse('00000000-0000-4000-8000-000000000126');
    saved.oid = 'oid-1';
    saved.outcome = 'saved';
    saved.success = true;
    const updateMeta = sinon.stub().resolves(saved);
    controller.recordsService = {
      getMeta: sinon.stub().resolves(currentRecord),
      hasEditAccess: sinon.stub().returns(true),
      updateMeta,
    } as any;
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
    const req = {
      body: rawDelta,
      headers: {},
      params: { oid: 'oid-1' },
      query: { merge: 'true' },
      session: { branding: 'default' },
      user: { username: 'tester' },
    } as unknown as Sails.Req;
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');
    sinon.stub(controller as any, 'sendResp');

    await (controller as any).updateInternal(req, {} as Sails.Res);

    expect(updateMeta.calledOnce).to.equal(true);
    expect(updateMeta.firstCall.args[7]).to.deep.equal({
      metadata: rawDelta,
      mode: 'merge',
      arrayMergeMode: 'replace',
    });
    expect(updateMeta.firstCall.args[7].metadata).to.equal(rawDelta);
    expect(currentRecord.metadata).to.deep.equal({
      retained: 'keep',
      nested: { retained: true, values: [{ id: 'stored-nested' }] },
      values: [{ id: 'stored' }],
    });
  });

  it('does not let browser create body metadata initiate a transition', async () => {
    const saved = new RecordSaveResponse('00000000-0000-4000-8000-000000000125');
    saved.oid = 'oid-created';
    saved.outcome = 'saved';
    saved.success = true;
    const create = sinon.stub().resolves(saved);
    controller.recordsService = {
      create,
      getMeta: sinon.stub().resolves({ redboxOid: 'oid-created', metadata: {}, metaMetadata: {} }),
    } as any;
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
    const req = {
      body: { title: 'Created', targetStep: 'published', operation: 'publish' },
      headers: {},
      params: { recordType: 'dataset' },
      query: {},
      session: { branding: 'default' },
      user: { username: 'tester' },
      param: sinon
        .stub()
        .callsFake((name: string) =>
          name === 'targetStep' ? 'published' : name === 'operation' ? 'publish' : undefined
        ),
    } as unknown as Sails.Req;
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');
    sinon.stub(controller as any, 'sendResp');

    await (controller as any).createInternal(req, {} as Sails.Res);

    expect(create.calledOnce).to.equal(true);
    expect(create.firstCall.args[6]).to.equal(undefined);
    const context = create.firstCall.args[7];
    expect(context).to.include({ routeFamily: 'browser', operation: 'create' });
    expect(context.targetStep).to.equal(undefined);
    expect(context.validationOperation).to.equal(undefined);
    expect(context.validationRequestParameters).to.deep.equal({ recordType: 'dataset' });
    expect((req.param as sinon.SinonStub).notCalled).to.equal(true);
  });

  it('returns safe missing and authorization responses for browser update and delete lookups', async () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');
    const updateMeta = sinon.stub();
    const deleteRecord = sinon.stub();
    const getMeta = sinon.stub().resolves(null);
    const hasEditAccess = sinon.stub().returns(true);
    controller.recordsService = {
      getMeta,
      hasEditAccess,
      updateMeta,
      delete: deleteRecord,
    } as any;
    const baseRequest = {
      body: { title: 'Rejected' },
      headers: {},
      params: { oid: 'oid-1' },
      query: {},
      session: { branding: 'default' },
      user: { username: 'tester' },
      param: sinon.stub().withArgs('oid').returns('oid-1'),
    } as unknown as Sails.Req;

    await (controller as any).updateInternal(baseRequest, {} as Sails.Res);
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 404,
      displayErrors: [{ code: 'missing-record' }],
    });

    sendResp.resetHistory();
    await controller.delete(baseRequest, {} as Sails.Res);
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 404,
      displayErrors: [{ code: 'missing-record' }],
    });
    expect(updateMeta.notCalled).to.equal(true);
    expect(deleteRecord.notCalled).to.equal(true);

    getMeta.resetBehavior();
    getMeta.rejects(new Error('private lookup failure'));
    sendResp.resetHistory();
    await (controller as any).updateInternal(baseRequest, {} as Sails.Res);
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 404,
      displayErrors: [{ code: 'missing-record' }],
    });

    sendResp.resetHistory();
    await controller.delete(baseRequest, {} as Sails.Res);
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 404,
      displayErrors: [{ code: 'missing-record' }],
    });
    expect(JSON.stringify(sendResp.args)).not.to.include('private lookup failure');

    getMeta.resetBehavior();
    getMeta.resolves({
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'brand-1', type: 'dataset' },
      metadata: {},
      authorization: {},
    });
    hasEditAccess.returns(false);
    sendResp.resetHistory();
    await (controller as any).updateInternal(baseRequest, {} as Sails.Res);
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 403,
      displayErrors: [{ code: 'not-authorised' }],
    });

    sendResp.resetHistory();
    await controller.delete(baseRequest, {} as Sails.Res);
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 403,
      displayErrors: [{ code: 'edit-error-no-permissions' }],
    });
    expect(updateMeta.notCalled).to.equal(true);
    expect(deleteRecord.notCalled).to.equal(true);
  });

  it('sanitizes unexpected browser update and transition failures', function () {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');

    (controller as any).sendUnexpectedSaveFailure(
      { headers: {} },
      {},
      'update',
      new Error('database password is secret')
    );

    const envelope = sendResp.firstCall.args[2];
    expect(JSON.stringify(envelope)).not.to.include('database password');
    expect(envelope).to.deep.equal({
      status: 500,
      displayErrors: [{ code: 'record-save-failed', title: '@record-save-failed' }],
    });
    const logPayload = (global as any).sails.log.error.firstCall.args;
    expect(JSON.stringify(logPayload)).not.to.include('database password');
    expect(logPayload[1]).to.deep.include({ action: 'update', error_type: 'Error' });
  });
});

describe('RecordController TUS URL generation', () => {
  let controller: Controllers.Record;
  let originalSails: any;
  let originalStorageManagerService: any;
  let originalBrandingService: any;
  let originalTranslationService: any;
  let originalCheckDiskSpace: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalStorageManagerService = (global as any).StorageManagerService;
    originalBrandingService = (global as any).BrandingService;
    originalTranslationService = (global as any).TranslationService;
    (global as any).sails = {
      config: {
        record: {
          attachments: {
            store: 'file',
            path: '/uploads/attachments',
            file: {
              directory: '/tmp/redbox-test-attachments',
            },
          },
          diskSpaceThreshold: 100,
          mongodbDisk: '/legacy/mongodb-disk',
        },
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
    };
    (global as any)._ = require('lodash');
    (global as any).StorageManagerService = {
      stagingDisk: sinon.stub().returns({}),
      getStagingDiskConfig: sinon.stub().returns({
        driver: 'fs',
        config: { root: '/tmp/storage-manager-staging' },
      }),
    };
    (global as any).BrandingService = {
      getBrandAndPortalPath: sinon.stub().returns('/default/rdmp'),
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((value: string) => value),
    };
    controller = new Controllers.Record();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).StorageManagerService = originalStorageManagerService;
    (global as any).BrandingService = originalBrandingService;
    (global as any).TranslationService = originalTranslationService;
  });

  it('returns routed attachment URLs instead of the internal TUS mount path', () => {
    (controller as any).initTusServer();
    const tusServer = (controller as any).tusServer;
    const generatedUrl = tusServer.options.generateUrl(
      {
        _tusBaseUrl: '/default/rdmp/record/oid-1',
      },
      {
        host: 'localhost:1500',
        path: '/uploads/attachments',
        id: 'file-123',
      }
    );

    expect(generatedUrl).to.equal('//localhost:1500/default/rdmp/record/oid-1/attach/file-123');
  });

  it('normalizes routed attachment URLs when the base URL has a trailing slash', () => {
    (controller as any).initTusServer();
    const tusServer = (controller as any).tusServer;
    const generatedUrl = tusServer.options.generateUrl(
      {
        _tusBaseUrl: '/default/rdmp/record/oid-1/',
      },
      {
        host: 'localhost:1500',
        path: '/uploads/attachments',
        id: 'file-123',
      }
    );

    expect(generatedUrl).to.equal('//localhost:1500/default/rdmp/record/oid-1/attach/file-123');
  });

  it('does not expose the internal TUS mount path in generated attachment URLs', () => {
    (controller as any).initTusServer();
    const tusServer = (controller as any).tusServer;
    const generatedUrl = tusServer.options.generateUrl(
      {
        _tusBaseUrl: '/default/rdmp/record/oid-1',
      },
      {
        host: 'localhost:1500',
        path: '/uploads/attachments',
        id: 'file-123',
      }
    );

    expect(generatedUrl).to.not.include('/uploads/attachments');
    expect(generatedUrl).to.include('/default/rdmp/record/oid-1/attach/file-123');
  });

  it('uses the StorageManager staging disk datastore for the tus server', () => {
    (controller as any).initTusServer();

    expect((global as any).StorageManagerService.stagingDisk.calledOnce).to.equal(true);
    expect((controller as any).tusServer.datastore.constructor.name).to.equal('TusStorageManagerDataStore');
  });

  it('does not require record.attachments.file.directory when using the storage manager datastore', () => {
    (global as any).sails.config.record.attachments.file = undefined;
    (global as any).sails.config.record.attachments.stageDir = undefined;

    expect(() => (controller as any).initTusServer()).to.not.throw();
  });

  it('checks disk space against the staging disk root for filesystem staging uploads', async () => {
    const checkDiskSpaceModule = require('check-disk-space');
    const checkDiskSpaceStub = sinon
      .stub(checkDiskSpaceModule, 'default')
      .resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
    const handleStub = sinon.stub();
    (controller as any).tusServer = { handle: handleStub };
    sinon.stub(controller as any, 'getRecord').returns(of({}));
    sinon.stub(controller as any, 'hasEditAccess').returns(of(true));

    const req = {
      method: 'POST',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach',
      path: '/default/rdmp/record/oid-1/attach',
      headers: {
        host: 'localhost:1500',
        'upload-length': '1000',
      },
      param: sinon.stub().callsFake((name: string) => (name === 'oid' ? 'oid-1' : undefined)),
    } as unknown as Sails.Req;
    const res = {
      setHeader: sinon.stub(),
      end: sinon.stub(),
      once: sinon.stub(),
    } as unknown as Sails.Res;

    await controller.doAttachment(req, res);

    expect(checkDiskSpaceStub.calledOnceWith('/tmp/storage-manager-staging')).to.equal(true);
    expect(handleStub.calledOnce).to.equal(true);
  });

  it('skips local disk-space checks for non-filesystem staging uploads', async () => {
    const checkDiskSpaceModule = require('check-disk-space');
    const checkDiskSpaceStub = sinon
      .stub(checkDiskSpaceModule, 'default')
      .resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
    (global as any).StorageManagerService.getStagingDiskConfig.returns({
      driver: 's3',
      config: { bucket: 'uploads', key: 'AK', secret: 'SK', region: 'ap-southeast-2' },
    });
    const handleStub = sinon.stub();
    (controller as any).tusServer = { handle: handleStub };
    sinon.stub(controller as any, 'getRecord').returns(of({}));
    sinon.stub(controller as any, 'hasEditAccess').returns(of(true));

    const req = {
      method: 'POST',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach',
      path: '/default/rdmp/record/oid-1/attach',
      headers: {
        host: 'localhost:1500',
        'upload-length': '1000',
      },
      param: sinon.stub().callsFake((name: string) => (name === 'oid' ? 'oid-1' : undefined)),
    } as unknown as Sails.Req;
    const res = {
      setHeader: sinon.stub(),
      end: sinon.stub(),
      once: sinon.stub(),
    } as unknown as Sails.Res;

    await controller.doAttachment(req, res);

    expect(checkDiskSpaceStub.called).to.equal(false);
    expect(handleStub.calledOnce).to.equal(true);
  });

  it('does not use record.mongodbDisk for tus disk-space validation', async () => {
    const checkDiskSpaceModule = require('check-disk-space');
    const checkDiskSpaceStub = sinon
      .stub(checkDiskSpaceModule, 'default')
      .resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
    const handleStub = sinon.stub();
    (controller as any).tusServer = { handle: handleStub };
    sinon.stub(controller as any, 'getRecord').returns(of({}));
    sinon.stub(controller as any, 'hasEditAccess').returns(of(true));

    const req = {
      method: 'POST',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach',
      path: '/default/rdmp/record/oid-1/attach',
      headers: {
        host: 'localhost:1500',
        'upload-length': '1000',
      },
      param: sinon.stub().callsFake((name: string) => (name === 'oid' ? 'oid-1' : undefined)),
    } as unknown as Sails.Req;
    const res = {
      setHeader: sinon.stub(),
      end: sinon.stub(),
      once: sinon.stub(),
    } as unknown as Sails.Res;

    await controller.doAttachment(req, res);

    expect(checkDiskSpaceStub.firstCall.args[0]).to.not.equal('/legacy/mongodb-disk');
  });
});

describe('AsynchController authorization', () => {
  let controller: AsynchControllers.Asynch;
  let originalSails: any;
  let originalBrandingService: any;
  let originalAsynchsService: any;

  const makeRequest = (
    values: Record<string, unknown>,
    user: Record<string, unknown> | undefined = { username: 'alice', roles: [] }
  ) =>
    ({
      isSocket: true,
      session: { branding: 'default' },
      user,
      param: sinon.stub().callsFake((name: string) => values[name]),
    }) as unknown as Sails.Req;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalAsynchsService = (global as any).AsynchsService;
    (global as any)._ = require('lodash');
    (global as any).BrandingService = { getBrand: sinon.stub().returns({ id: 'brand-1' }) };
    (global as any).AsynchsService = {
      get: sinon.stub().returns(of([])),
      finish: sinon.stub().returns(of([{ id: 'job-1', relatedRecordId: 'record-1' }])),
      update: sinon.stub().returns(of([{ id: 'job-1', relatedRecordId: 'record-1' }])),
    };
    (global as any).sails = {
      log: { verbose: sinon.stub() },
      services: {
        recordsservice: {
          getMeta: sinon.stub(),
          hasViewAccess: sinon.stub().returns(true),
        },
      },
      sockets: {
        join: sinon
          .stub()
          .callsFake((_req: unknown, _roomId: string, callback: (error?: unknown) => void) => callback()),
        broadcast: sinon.stub(),
      },
    };
    controller = new AsynchControllers.Asynch();
    sinon.stub(controller as any, 'getNoCacheHeaders').returns({});
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any).AsynchsService = originalAsynchsService;
  });

  it('resolves and authorizes direct, progress, and composite rooms', async () => {
    const recordsService = (global as any).sails.services.recordsservice;
    recordsService.getMeta.callsFake(async (oid: string) => {
      if (oid === 'record-1') {
        return { redboxOid: oid };
      }
      throw new Error('not found');
    });
    (global as any).AsynchsService.get.callsFake(({ id }: { id: string }) =>
      of(id === 'job-1' ? [{ id, relatedRecordId: 'record-1' }] : [])
    );
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.subscribe(makeRequest({ roomId: 'record-1' }), {} as Sails.Res);
    await controller.subscribe(makeRequest({ roomId: 'job-1' }), {} as Sails.Res);
    await controller.subscribe(makeRequest({ roomId: 'record-1-export' }), {} as Sails.Res);

    expect(recordsService.hasViewAccess.callCount).to.equal(3);
    expect((global as any).sails.sockets.join.callCount).to.equal(3);
    expect(sendResp.thirdCall.args[2].data.status).to.be.true;
  });

  it('rejects invalid subscription attempts and reports join errors', async () => {
    const recordsService = (global as any).sails.services.recordsservice;
    recordsService.getMeta.rejects(new Error('not found'));
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.subscribe(makeRequest({ roomId: 'unknown-room' }), {} as Sails.Res);
    expect(sendResp.firstCall.args[2].data.status).to.be.false;

    recordsService.getMeta.resolves({ redboxOid: 'record-1' });
    recordsService.hasViewAccess.returns(false);
    await controller.subscribe(makeRequest({ roomId: 'record-1' }), {} as Sails.Res);
    expect(sendResp.getCalls().some(call => call.args[2]?.status === 403)).to.be.true;

    await controller.subscribe(makeRequest({ roomId: 'record-1' }, undefined), {} as Sails.Res);
    expect(sendResp.getCalls().filter(call => call.args[2]?.status === 403)).to.have.length(3);

    const badRequest = sinon.stub();
    await controller.subscribe(
      { isSocket: false, param: sinon.stub() } as unknown as Sails.Req,
      { badRequest } as unknown as Sails.Res
    );
    expect(badRequest.calledOnce).to.be.true;

    recordsService.hasViewAccess.returns(true);
    (global as any).sails.sockets.join.callsFake((_req: unknown, _roomId: string, callback: (error: unknown) => void) =>
      callback(new Error('join failed'))
    );
    await controller.subscribe(makeRequest({ roomId: 'record-1' }), {} as Sails.Res);
    expect(sendResp.callCount).to.equal(4);
  });

  it('only stops jobs owned by the authenticated user', () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    (global as any).AsynchsService.get.returns(of([{ id: 'job-1', started_by: 'alice' }]));
    controller.stop(makeRequest({ id: 'job-1' }), {} as Sails.Res);
    expect((global as any).AsynchsService.finish.calledOnce).to.be.true;

    (global as any).AsynchsService.get.returns(of([{ id: 'job-2', started_by: 'bob' }]));
    controller.stop(makeRequest({ id: 'job-2' }), {} as Sails.Res);
    expect(sendResp.getCalls().some(call => call.args[2]?.status === 403)).to.be.true;

    (global as any).AsynchsService.get.returns(of([]));
    controller.stop(makeRequest({ id: 'missing' }, undefined), {} as Sails.Res);
    expect((global as any).AsynchsService.finish.callCount).to.equal(1);
  });

  it('only updates jobs owned by the authenticated user', () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    (global as any).AsynchsService.get.returns(of([{ id: 'job-1', started_by: 'alice' }]));
    controller.update(
      makeRequest({
        id: 'job-1',
        relatedRecordId: 'record-1',
        taskType: 'export',
        status: 'running',
      }),
      {} as Sails.Res
    );
    expect((global as any).AsynchsService.update.calledOnce).to.be.true;

    (global as any).AsynchsService.get.returns(of([{ id: 'job-2', started_by: 'bob' }]));
    controller.update(makeRequest({ id: 'job-2' }), {} as Sails.Res);
    expect(sendResp.getCalls().some(call => call.args[2]?.status === 403)).to.be.true;
  });
});
