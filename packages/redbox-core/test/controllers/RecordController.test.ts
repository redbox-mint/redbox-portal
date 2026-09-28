let expect: Chai.ExpectStatic;
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers } from '../../src/controllers/RecordController';
import { Controllers as AsynchControllers } from '../../src/controllers/AsynchController';
import { routes, RouteTargetObject } from '../../src/config/routes.config';

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
  let originalTranslationService: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalRecordTypesService = (global as any).RecordTypesService;
    originalWorkflowStepsService = (global as any).WorkflowStepsService;
    originalDashboardTypesService = (global as any).DashboardTypesService;
    originalFormsService = (global as any).FormsService;
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
      getForm: sinon.stub(),
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key: string) => ({
        'default-title': 'Site',
        'rdmp-title-label': 'RDMP',
        'dataRecord-title-label': 'Data Record',
        'workspaces': 'Workspaces',
      }[key] ?? key)),
    };

    controller = new Controllers.Record();
    controller.recordsService = {
      getMeta: sinon.stub(),
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

  for (const routeName of ['/:branding/:portal/record/view/:oid', '/:branding/:portal/record/view-orig/:oid']) {
    const route = routes[routeName] as RouteTargetObject;

    it(`renders an existing record through ${routeName} using one metadata lookup`, async () => {
      expect(route).to.include({ controller: 'RecordController', action: 'view' });
      const req = {
        param: sinon.stub().withArgs('oid').returns('oid-1'),
        session: { branding: 'default' },
        user: { username: 'alice', roles: [] },
        options: route,
      } as unknown as Sails.Req;
      const record = { redboxOid: 'oid-1', metaMetadata: { type: 'rdmp' }, metadata: { title: 'Saved title' } };
      const sendView = sinon.stub(controller, 'sendView');
      (controller.recordsService.getMeta as sinon.SinonStub).resolves(record);

      await controller.view(req, {} as Sails.Res);

      expect(sendView.calledOnce).to.be.true;
      expect(sendView.firstCall.args[2]).to.equal(route.locals?.view ?? 'record/view');
      expect(sendView.firstCall.args[3]).to.deep.equal({ title: 'Saved title | Site' });
      expect((controller.recordsService.getMeta as sinon.SinonStub).calledOnceWithExactly('oid-1')).to.be.true;
      expect((controller.recordsService.hasViewAccess as sinon.SinonStub).firstCall.args[3]).to.equal(record);
    });

    for (const missingRecord of [undefined, null, {}]) {
      it(`returns notFound for ${routeName} when metadata is ${JSON.stringify(missingRecord)}`, async () => {
        expect(route).to.include({ controller: 'RecordController', action: 'view' });
        const req = {
          param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'deleted-oid' : 'rdmp'),
          session: { branding: 'default' },
          options: { ...route, locals: { ...route.locals, localFormName: 'form-1' } },
        } as unknown as Sails.Req;
        const notFound = sinon.stub();
        const serverError = sinon.stub();
        const res = { notFound, serverError } as unknown as Sails.Res;
        const sendView = sinon.stub(controller, 'sendView');
        (controller.recordsService.getMeta as sinon.SinonStub).resolves(missingRecord);

        await controller.view(req, res);

        expect(notFound.calledOnceWithExactly()).to.be.true;
        expect(serverError.called).to.be.false;
        expect(sendView.called).to.be.false;
        expect((controller.recordsService.getMeta as sinon.SinonStub).calledOnceWithExactly('deleted-oid')).to.be.true;
        expect((controller.recordsService.hasViewAccess as sinon.SinonStub).called).to.be.false;
      });
    }

    for (const lookupError of [new Error('Storage unavailable'), new Error('Storage index not found'), { code: 500, message: 'Storage unavailable' }]) {
      it(`returns serverError for ${routeName} when lookup rejects with ${lookupError.message}`, async () => {
        const req = {
          param: sinon.stub().withArgs('oid').returns('oid-1'),
          session: { branding: 'default' },
          options: route,
        } as unknown as Sails.Req;
        const notFound = sinon.stub();
        const serverError = sinon.stub();
        const res = { notFound, serverError } as unknown as Sails.Res;
        const sendView = sinon.stub(controller, 'sendView');
        (controller.recordsService.getMeta as sinon.SinonStub).rejects(lookupError);

        await controller.view(req, res);

        expect(serverError.calledOnce).to.be.true;
        expect(notFound.called).to.be.false;
        expect(sendView.called).to.be.false;
        expect((controller.recordsService.hasViewAccess as sinon.SinonStub).called).to.be.false;
      });
    }

    it(`returns forbidden for ${routeName} when the record is inaccessible`, async () => {
      const req = {
        param: sinon.stub().withArgs('oid').returns('oid-1'),
        session: { branding: 'default' },
        options: route,
      } as unknown as Sails.Req;
      const forbidden = sinon.stub();
      const notFound = sinon.stub();
      const res = { forbidden, notFound } as unknown as Sails.Res;
      const sendView = sinon.stub(controller, 'sendView');
      (controller.recordsService.getMeta as sinon.SinonStub).resolves({ redboxOid: 'oid-1' });
      (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(false);

      await controller.view(req, res);

      expect(forbidden.calledOnce).to.be.true;
      expect(notFound.called).to.be.false;
      expect(sendView.called).to.be.false;
    });
  }

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

    expect((controller.recordsService.getResolvedPermissionsSummary as sinon.SinonStub).calledOnceWithExactly('oid-1')).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data).to.deep.equal({ edit: true, view: true });
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

  for (const missingRecord of [undefined, null, {}]) {
    for (const route of ['standard', 'named-form', 'record-type']) {
      it(`returns notFound for ${route} edit when the record lookup returns ${JSON.stringify(missingRecord)}`, async () => {
        const req = {
          param: sinon.stub().callsFake((name: string) => {
            if (name === 'oid') return 'deleted-oid';
            if (name === 'recordType' && route === 'record-type') return 'rdmp';
            return '';
          }),
          query: {},
          session: { branding: 'default' },
          options: { locals: route === 'named-form' ? { localFormName: 'form-1' } : {} },
        } as unknown as Sails.Req;
        const notFound = sinon.stub();
        const res = { notFound } as unknown as Sails.Res;
        const sendView = sinon.stub(controller, 'sendView');
        (controller.recordsService.getMeta as sinon.SinonStub).resolves(missingRecord);

        await controller.edit(req, res);

        expect(notFound.calledOnce).to.be.true;
        expect(sendView.called).to.be.false;
        expect((FormsService.getFormByName as sinon.SinonStub).called).to.be.false;
        expect((FormsService.getFormByStartingWorkflowStep as sinon.SinonStub).called).to.be.false;
      });
    }
  }

  it('returns a server error without rendering the editor when the record lookup fails', async () => {
    const req = {
      param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
      query: {},
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const serverError = sinon.stub();
    const notFound = sinon.stub();
    const res = { serverError, notFound } as unknown as Sails.Res;
    const sendView = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub).rejects(new Error('Storage unavailable'));

    await controller.edit(req, res);

    expect(serverError.calledOnce).to.be.true;
    expect(notFound.called).to.be.false;
    expect(sendView.called).to.be.false;
  });

  for (const apiVersion of ['1.0', '2.0']) {
    for (const edit of ['true', 'false']) {
      it(`returns a missing-record 404 for a deleted record's form (API ${apiVersion}, edit=${edit})`, async () => {
        const req = {
          param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'deleted-oid' : 'auto'),
          query: { apiVersion, edit },
          session: { branding: 'default' },
        } as unknown as Sails.Req;
        const status = sinon.stub().returnsThis();
        const json = sinon.stub().returnsThis();
        const res = { status, json, set: sinon.stub() } as unknown as Sails.Res;
        (controller.recordsService.getMeta as sinon.SinonStub).resolves(undefined);

        await controller.getForm(req, res);

        expect(status.calledOnceWithExactly(404)).to.be.true;
        expect(json.calledOnce).to.be.true;
        if (apiVersion === '1.0') {
          expect(json.firstCall.args[0]).to.include({ message: 'missing-record' });
        } else {
          expect(json.firstCall.args[0].errors[0]).to.include({ code: 'missing-record' });
        }
        expect((controller.recordsService.hasViewAccess as sinon.SinonStub).called).to.be.false;
      });
    }

    for (const edit of ['true', 'false']) {
      it(`returns missing-record when the record disappears after page rendering (API ${apiVersion}, edit=${edit})`, async () => {
        const req = {
          param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
          query: { apiVersion, edit },
          session: { branding: 'default' },
          options: {},
        } as unknown as Sails.Req;
        const status = sinon.stub().returnsThis();
        const json = sinon.stub().returnsThis();
        const res = { status, json, set: sinon.stub() } as unknown as Sails.Res;
        const sendView = sinon.stub(controller, 'sendView');
        const getMeta = controller.recordsService.getMeta as sinon.SinonStub;
        getMeta.onFirstCall().resolves({
          redboxOid: 'oid-1',
          metaMetadata: { type: 'rdmp', form: 'form-1' },
          metadata: { title: 'Saved title' },
        });
        getMeta.onSecondCall().resolves(undefined);
        (FormsService.getFormByName as sinon.SinonStub).returns(of({ configuration: { type: 'rdmp' } }));

        await controller[edit === 'true' ? 'edit' : 'view'](req, res);

        expect(sendView.calledOnce).to.be.true;
        expect(sendView.firstCall.args[2]).to.equal(edit === 'true' ? 'record/edit' : 'record/view');
        (controller.recordsService.hasViewAccess as sinon.SinonStub).resetHistory();

        await controller.getForm(req, res);

        expect(getMeta.calledTwice).to.be.true;
        expect(status.calledOnceWithExactly(404)).to.be.true;
        expect(json.calledOnce).to.be.true;
        if (apiVersion === '1.0') {
          expect(json.firstCall.args[0]).to.include({ message: 'missing-record' });
        } else {
          expect(json.firstCall.args[0].errors[0]).to.include({ code: 'missing-record' });
        }
        expect((FormsService.getForm as sinon.SinonStub).called).to.be.false;
        expect((controller.recordsService.hasEditAccess as sinon.SinonStub).called).to.be.false;
        expect((controller.recordsService.hasViewAccess as sinon.SinonStub).called).to.be.false;
      });

      for (const lookup of ['record', 'form']) {
        it(`keeps code-500 ${lookup} lookup failures as server errors (API ${apiVersion}, edit=${edit})`, async () => {
          const req = {
            param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : 'auto'),
            query: { apiVersion, edit },
            session: { branding: 'default' },
          } as unknown as Sails.Req;
          const status = sinon.stub().returnsThis();
          const json = sinon.stub().returnsThis();
          const res = { status, json, set: sinon.stub() } as unknown as Sails.Res;
          const lookupError = { error: { code: 500 }, message: 'Storage unavailable' };
          if (lookup === 'record') {
            (controller.recordsService.getMeta as sinon.SinonStub).rejects(lookupError);
          } else {
            (controller.recordsService.getMeta as sinon.SinonStub).resolves({ redboxOid: 'oid-1' });
            (FormsService.getForm as sinon.SinonStub).rejects(lookupError);
          }

          await controller.getForm(req, res);

          expect(status.calledOnceWithExactly(500)).to.be.true;
          expect(json.calledOnce).to.be.true;
          const payload = json.firstCall.args[0];
          expect(JSON.stringify(payload)).not.to.include('missing-record');
          if (apiVersion === '1.0') {
            expect(payload).to.include({ message: 'Error getting form definition', details: lookupError.message });
          } else {
            expect(payload.errors[0]).to.include({ title: 'Error getting form definition', detail: lookupError.message });
          }
        });
      }

      it(`preserves permission errors for an existing form (API ${apiVersion}, edit=${edit})`, async () => {
        const req = {
          param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : 'auto'),
          query: { apiVersion, edit },
          session: { branding: 'default' },
        } as unknown as Sails.Req;
        const status = sinon.stub().returnsThis();
        const json = sinon.stub().returnsThis();
        const res = { status, json, set: sinon.stub() } as unknown as Sails.Res;
        (controller.recordsService.getMeta as sinon.SinonStub).resolves({ redboxOid: 'oid-1' });
        const access = controller.recordsService[edit === 'true' ? 'hasEditAccess' : 'hasViewAccess'] as sinon.SinonStub;
        access.returns(false);

        await controller.getForm(req, res);

        expect(access.calledOnce).to.be.true;
        expect(status.calledOnceWithExactly(500)).to.be.true;
        if (apiVersion === '1.0') {
          expect(json.firstCall.args[0]).to.include({ message: 'view-error-no-permissions' });
        } else {
          expect(json.firstCall.args[0].errors[0]).to.include({ code: 'view-error-no-permissions' });
        }
        expect((FormsService.getForm as sinon.SinonStub).called).to.be.false;
      });
    }
  }

  for (const formSelection of ['named', 'saved']) {
    for (const recordType of ['rdmp', null]) {
      it(`uses saved record type ${JSON.stringify(recordType)} with a ${formSelection} form that has no configured type`, async () => {
        const req = {
          param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
          query: {},
          session: { branding: 'default' },
          options: { locals: formSelection === 'named' ? { localFormName: 'named-form' } : {} },
        } as unknown as Sails.Req;
        const sendView = sinon.stub(controller, 'sendView');
        (controller.recordsService.getMeta as sinon.SinonStub).resolves({
          redboxOid: 'oid-1',
          metaMetadata: { type: recordType, form: 'saved-form' },
          metadata: { title: 'Saved title' },
        });
        (FormsService.getFormByName as sinon.SinonStub).returns(of({ configuration: {} }));

        await controller.edit(req, {} as Sails.Res);

        expect(sendView.calledOnce).to.be.true;
        expect(sendView.firstCall.args[2]).to.equal('record/edit');
        expect(sendView.firstCall.args[3]).to.deep.include({
          oid: 'oid-1', recordType: recordType ?? '', title: 'Saved title | Site',
          formName: formSelection === 'named' ? 'named-form' : '',
        });
        expect((FormsService.getFormByName as sinon.SinonStub).calledOnceWithExactly(
          formSelection === 'named' ? 'named-form' : 'saved-form', true, 'brand-1',
        )).to.be.true;
        expect((controller.recordsService.getMeta as sinon.SinonStub).calledOnceWithExactly('oid-1')).to.be.true;
      });
    }
  }

  for (const formName of [undefined, null]) {
    it(`reports an unavailable form without mislabeling an existing record whose form is ${formName}`, async () => {
      const req = {
        param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
        query: { apiVersion: '2.0' },
        session: { branding: 'default' },
        options: {},
      } as unknown as Sails.Req;
      const status = sinon.stub().returnsThis();
      const json = sinon.stub().returnsThis();
      const notFound = sinon.stub();
      const res = { status, json, notFound, set: sinon.stub() } as unknown as Sails.Res;
      const sendView = sinon.stub(controller, 'sendView');
      (controller.recordsService.getMeta as sinon.SinonStub).resolves({
        redboxOid: 'oid-1', metaMetadata: { type: 'rdmp', form: formName },
      });
      (FormsService.getFormByName as sinon.SinonStub).returns(of(null));

      await controller.edit(req, res);

      expect((FormsService.getFormByName as sinon.SinonStub).calledOnceWithExactly('', true, 'brand-1')).to.be.true;
      expect(status.calledOnceWithExactly(404)).to.be.true;
      expect(json.firstCall.args[0].errors[0]).to.include({ detail: 'Form not found' });
      expect(JSON.stringify(json.firstCall.args[0])).not.to.include('missing-record');
      expect(notFound.called).to.be.false;
      expect(sendView.called).to.be.false;
      expect((controller.recordsService.getMeta as sinon.SinonStub).calledOnce).to.be.true;
    });
  }

  it('renders a named create form without looking up an existing record', async () => {
    const req = {
      param: sinon.stub().callsFake((name: string) => name === 'recordType' ? 'rdmp' : ''),
      query: {},
      session: { branding: 'default' },
      options: { locals: { localFormName: 'named-form' } },
    } as unknown as Sails.Req;
    const sendView = sinon.stub(controller, 'sendView');
    (FormsService.getFormByName as sinon.SinonStub).returns(of({ configuration: { type: 'rdmp' } }));

    await controller.edit(req, {} as Sails.Res);

    expect(sendView.calledOnce).to.be.true;
    expect(sendView.firstCall.args[3]).to.deep.include({ oid: '', recordType: 'rdmp', formName: 'named-form', title: 'Create RDMP | Site' });
    expect((controller.recordsService.getMeta as sinon.SinonStub).called).to.be.false;
  });

  it('uses saved metadata title on existing edit routes', async () => {
    const req = {
      param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
      query: {},
      session: { branding: 'default' },
      options: {},
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { type: 'rdmp', form: 'form-1' },
      metadata: { title: 'Saved title' },
    });
    (global as any).FormsService.getFormByName.returns(of({ configuration: { type: 'rdmp' } }));

    const rendered = new Promise<void>((resolve) => {
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
    expect((controller.recordsService.getMeta as sinon.SinonStub).calledOnce).to.be.true;
  });

  it('uses create record type title on create routes', async () => {
    const req = {
      param: sinon.stub().callsFake((name: string) => name === 'recordType' ? 'rdmp' : ''),
      query: {},
      session: { branding: 'default' },
      options: {},
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (global as any).FormsService.getFormByStartingWorkflowStep.returns(of({ configuration: { type: 'rdmp' } }));

    const rendered = new Promise<void>((resolve) => {
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
    expect((controller.recordsService.getMeta as sinon.SinonStub).called).to.be.false;
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
      redirect: sinon.stub()
    } as unknown as Sails.Res;
    (global as any).BrandingService.getFullPath = sinon.stub().returns('/default/rdmp');

    controller.redirectLegacyConsolidatedDashboard(req, res);

    expect((res.redirect as any).calledWith('/default/rdmp/dashboard-view/consolidated')).to.be.true;
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
    const generatedUrl = tusServer.options.generateUrl({
      _tusBaseUrl: '/default/rdmp/record/oid-1',
    }, {
      host: 'localhost:1500',
      path: '/uploads/attachments',
      id: 'file-123',
    });

    expect(generatedUrl).to.equal('//localhost:1500/default/rdmp/record/oid-1/attach/file-123');
  });

  it('normalizes routed attachment URLs when the base URL has a trailing slash', () => {
    (controller as any).initTusServer();
    const tusServer = (controller as any).tusServer;
    const generatedUrl = tusServer.options.generateUrl({
      _tusBaseUrl: '/default/rdmp/record/oid-1/',
    }, {
      host: 'localhost:1500',
      path: '/uploads/attachments',
      id: 'file-123',
    });

    expect(generatedUrl).to.equal('//localhost:1500/default/rdmp/record/oid-1/attach/file-123');
  });

  it('does not expose the internal TUS mount path in generated attachment URLs', () => {
    (controller as any).initTusServer();
    const tusServer = (controller as any).tusServer;
    const generatedUrl = tusServer.options.generateUrl({
      _tusBaseUrl: '/default/rdmp/record/oid-1',
    }, {
      host: 'localhost:1500',
      path: '/uploads/attachments',
      id: 'file-123',
    });

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
    const checkDiskSpaceStub = sinon.stub(checkDiskSpaceModule, 'default').resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
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
      param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : undefined),
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
    const checkDiskSpaceStub = sinon.stub(checkDiskSpaceModule, 'default').resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
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
      param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : undefined),
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
    const checkDiskSpaceStub = sinon.stub(checkDiskSpaceModule, 'default').resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
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
      param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : undefined),
    } as unknown as Sails.Req;
    const res = {
      setHeader: sinon.stub(),
      end: sinon.stub(),
      once: sinon.stub(),
    } as unknown as Sails.Res;

    await controller.doAttachment(req, res);

    expect(checkDiskSpaceStub.firstCall.args[0]).to.not.equal('/legacy/mongodb-disk');
  });

  it('uses the shared browser 404 response when an attachment is not in the record', async () => {
    (controller as any).tusServer = { handle: sinon.stub() };
    sinon.stub(controller as any, 'getRecord').returns(of({
      metaMetadata: { attachmentFields: [] },
      metadata: {},
    }));
    sinon.stub(controller as any, 'hasViewAccess').returns(of(true));

    const req = {
      method: 'GET',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach/file-missing',
      path: '/default/rdmp/record/oid-1/attach/file-missing',
      headers: { host: 'localhost:1500' },
      param: sinon.stub().callsFake((name: string) => ({ oid: 'oid-1', attachId: 'file-missing' }[name])),
    } as unknown as Sails.Req;
    const res = { notFound: sinon.stub() } as unknown as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.doAttachment(req, res);

    expect((res.notFound as any).calledOnce).to.equal(true);
    expect(sendRespStub.called).to.equal(false);
  });

  it('keeps the JSON 404 response for attachment API requests', async () => {
    (controller as any).tusServer = { handle: sinon.stub() };
    sinon.stub(controller as any, 'getRecord').returns(of({
      metaMetadata: { attachmentFields: [] },
      metadata: {},
    }));
    sinon.stub(controller as any, 'hasViewAccess').returns(of(true));

    const req = {
      method: 'GET',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach/file-missing',
      path: '/default/rdmp/record/oid-1/attach/file-missing',
      headers: { host: 'localhost:1500', 'x-source': 'jsclient' },
      param: sinon.stub().callsFake((name: string) => ({ oid: 'oid-1', attachId: 'file-missing' }[name])),
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.doAttachment(req, res);

    expect(sendRespStub.calledOnce).to.equal(true);
    expect(sendRespStub.firstCall.args[2]).to.deep.include({ status: 404 });
  });

  it('uses the shared browser 404 response when the attachment stream is missing', async () => {
    (controller as any).tusServer = { handle: sinon.stub() };
    sinon.stub(controller as any, 'getRecord').returns(of({
      metaMetadata: { attachmentFields: ['attachments'] },
      metadata: {
        attachments: [{ fileId: 'file-missing', name: 'missing.txt', mimeType: 'text/plain', size: '1' }],
      },
    }));
    sinon.stub(controller as any, 'hasViewAccess').returns(of(true));
    controller.datastreamService = {
      getDatastream: sinon.stub().rejects(new Error('attachment-not-found')),
    } as any;

    const req = {
      method: 'GET',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach/file-missing',
      path: '/default/rdmp/record/oid-1/attach/file-missing',
      headers: { host: 'localhost:1500' },
      param: sinon.stub().callsFake((name: string) => ({ oid: 'oid-1', attachId: 'file-missing' }[name])),
    } as unknown as Sails.Req;
    const res = {
      set: sinon.stub(),
      attachment: sinon.stub(),
      notFound: sinon.stub(),
    } as unknown as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.doAttachment(req, res);

    expect((res.notFound as any).calledOnce).to.equal(true);
    expect((res.set as any).called).to.equal(false);
    expect((res.attachment as any).called).to.equal(false);
    expect(sendRespStub.called).to.equal(false);
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
  ) => ({
    isSocket: true,
    session: { branding: 'default' },
    user,
    param: sinon.stub().callsFake((name: string) => values[name]),
  } as unknown as Sails.Req);

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
        join: sinon.stub().callsFake((_req: unknown, _roomId: string, callback: (error?: unknown) => void) => callback()),
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
    expect(sendResp.getCalls().some((call) => call.args[2]?.status === 403)).to.be.true;

    await controller.subscribe(makeRequest({ roomId: 'record-1' }, undefined), {} as Sails.Res);
    expect(sendResp.getCalls().filter((call) => call.args[2]?.status === 403)).to.have.length(3);

    const badRequest = sinon.stub();
    await controller.subscribe({ isSocket: false, param: sinon.stub() } as unknown as Sails.Req, { badRequest } as unknown as Sails.Res);
    expect(badRequest.calledOnce).to.be.true;

    recordsService.hasViewAccess.returns(true);
    (global as any).sails.sockets.join.callsFake((_req: unknown, _roomId: string, callback: (error: unknown) => void) => callback(new Error('join failed')));
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
    expect(sendResp.getCalls().some((call) => call.args[2]?.status === 403)).to.be.true;

    (global as any).AsynchsService.get.returns(of([]));
    controller.stop(makeRequest({ id: 'missing' }, undefined), {} as Sails.Res);
    expect((global as any).AsynchsService.finish.callCount).to.equal(1);
  });

  it('only updates jobs owned by the authenticated user', () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    (global as any).AsynchsService.get.returns(of([{ id: 'job-1', started_by: 'alice' }]));
    controller.update(makeRequest({
      id: 'job-1',
      relatedRecordId: 'record-1',
      taskType: 'export',
      status: 'running',
    }), {} as Sails.Res);
    expect((global as any).AsynchsService.update.calledOnce).to.be.true;

    (global as any).AsynchsService.get.returns(of([{ id: 'job-2', started_by: 'bob' }]));
    controller.update(makeRequest({ id: 'job-2' }), {} as Sails.Res);
    expect(sendResp.getCalls().some((call) => call.args[2]?.status === 403)).to.be.true;
  });
});
