import { getEffectiveRelatedClientForm } from '../../src/related-records/effective-form';
import { RelatedDisplayWriteError } from '../../src/related-records/normalize-display-writes';
import { deletedRecordSummary } from '../../src/DeletedRecordSummary';
import { bulkDeletedRecordsBody } from '../../src/api-routes/groups/deleted-records';
import {createSinonStubLogger} from "../logger.test";

let expect: Chai.ExpectStatic;
import * as sinon from 'sinon';
import { firstValueFrom, of } from 'rxjs';
import { tmpdir } from 'node:os';
import { MemoryStore, Cookie } from 'express-session';
import { readRouteForm, routeFormContractName } from '../../src/RecordRouteForm';
import { Settings } from 'luxon';
import { Controllers } from '../../src/controllers/RecordController';
import { UserModel, RoleModel } from '../../src/model';
import { Services as RecordServices } from '../../src/services/RecordsService';
import { Services as FormServices } from '../../src/services/FormsService';
import { Services as ValidationServices } from '../../src/services/RecordValidationService';
import { Controllers as AsynchControllers } from '../../src/controllers/AsynchController';
import { RecordSaveResponse } from '../../src/RecordSaveResponse';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';
import { routes, RouteTargetObject } from '../../src/config/routes.config';
import { Services as FormConsistencyServices } from '../../src/services/FormRecordConsistencyService';
import { dataRecordProjectedMetadata, dataRecordProjectionForm } from '../fixtures/metadata-projection.fixtures';
import { buildNestedViewForm, nestedViewFixture } from '../fixtures/nested-view-metadata.fixtures';

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
      log: createSinonStubLogger(sinon),
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
    (global as any).WorkflowStepsService.getAllForRecordTypeIncludingHidden = sinon.stub().callsFake((...args) => (global as any).WorkflowStepsService.getAllForRecordType(...args));
    (global as any).DashboardTypesService = {
      getDashboardView: sinon.stub(),
    };
    (global as any).FormsService = {
      getFormByStartingWorkflowStep: sinon.stub(),
      getFormByName: sinon.stub(),
      buildClientFormConfig: sinon.stub(),
      discoverValidationOperations: sinon.stub(),
      getForm: sinon.stub(),
    };
    (global as any).FormRecordConsistencyService = {
      projectMetadataClientFormConfig: sinon.stub(),
      metadataForViewForm: new FormConsistencyServices.FormRecordConsistency().metadataForViewForm,
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

  it('maps a browser update transient display rejection to 400 on API v2 and keeps the v1 500', async () => {
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
    controller.recordsService = {
      getMeta: sinon.stub().resolves({ redboxOid: 'oid-1', metaMetadata: { brandId: 'brand-1', type: 'dataset', form: '' }, metadata: {}, authorization: {} }),
      hasEditAccess: sinon.stub().returns(true),
      updateMeta: sinon.stub().rejects(new RelatedDisplayWriteError()),
    } as any;
    const send = sinon.stub(controller as any, 'sendResp');
    const request = (apiVersion: string) => ({ body: { title: 'PRIVATE' }, headers: { 'x-redbox-api-version': apiVersion }, params: { oid: 'oid-1' }, query: {}, session: { branding: 'default' }, user: { username: 'tester' } });
    await (controller as any).updateInternal(request('2.0'), {});
    expect(send.firstCall.args[2].status).to.equal(400);
    expect(send.firstCall.args[2].displayErrors[0].code).to.equal('related-display-field-not-writable');
    expect(JSON.stringify(send.firstCall.args[2])).not.to.include('PRIVATE');
    // API v1 keeps its existing contract: non-conflict save failures are server errors.
    await (controller as any).updateInternal(request('1.0'), {});
    expect(send.secondCall.args[2].status).to.equal(500);
    expect(JSON.stringify(send.secondCall.args[2])).not.to.include('PRIVATE');
  });

  it('renders the admin Parties route with the existing party dashboard', () => {
    const sendView = sinon.stub(controller as any, 'sendView');
    const req = { options: { locals: {} }, param: sinon.stub(), session: { branding: 'default' } } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    controller.renderParties(req, res);
    expect(routes['get /:branding/:portal/admin/parties']).to.equal('RecordController.renderParties');
    expect(sendView.firstCall.args[2]).to.equal('dashboard');
    expect(sendView.firstCall.args[3]).to.include({ recordType: 'party', packageType: 'party', adminParties: true, showAdminSideBar: true });
  });

  describe('metadata update timestamps', () => {
    let originalZone: typeof Settings.defaultZone;

    beforeEach(() => {
      originalZone = Settings.defaultZone;
      Settings.defaultZone = 'Australia/Brisbane';
      sinon.stub(Date, 'now').returns(Date.parse('2026-09-24T04:30:00Z'));
    });

    afterEach(() => {
      Settings.defaultZone = originalZone;
    });

    it('passes a UTC save timestamp and the updated metadata to the record service', async () => {
      const brand = { id: 'brand-1' };
      const user = { username: 'user-1' };
      const record = {
        metaMetadata: { brandId: brand.id, createdOn: '2026-09-01T00:00:00Z' },
        metadata: { title: 'Original title' },
      };
      const metadata = { title: 'Updated title' };
      const saved = { success: true };
      const updateMeta = sinon.stub().resolves(saved);
      controller.recordsService.updateMeta = updateMeta;

      const result = await firstValueFrom((controller as any).saveMetadata(brand, 'oid-1', record, metadata, user));

      expect(result).to.equal(saved);
      expect(updateMeta.calledOnce).to.equal(true);
      expect(updateMeta.firstCall.args).to.deep.equal([
        brand,
        'oid-1',
        {
          metaMetadata: {
            brandId: brand.id,
            createdOn: '2026-09-01T00:00:00Z',
            lastSavedBy: user.username,
            lastSaveDate: '2026-09-24T04:30:00.000Z',
          },
          metadata,
        },
        user,
        true,
        true,
        {},
        { metadata, mode: 'pre-applied' },
      ]);
    });
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

  describe('view saved metadata authorization', () => {
    const round3Cases: Array<{ name: string; mutate: (data: any, saved: any) => void; check: (projected: any, response: any, saved: any) => void; retain?: boolean }> = [];
    for (const retain of [false, true]) {
      for (const location of ['top', 'nested', 'row']) {
        for (const value of ['workspace-secret', ['workspace-secret'], 42, false, null, { saved: 'workspace-secret' }]) {
          round3Cases.push({ name: `static content ${location} ${JSON.stringify(value)} retained=${retain}`, retain,
            mutate: (data, saved) => {
              const field = { name: 'workspaces', component: { class: 'ContentComponent', config: { content: 'Relationships' } } };
              const defs = location === 'top' ? data.componentDefinitions : location === 'nested'
                ? data.componentDefinitions[0].component.config.componentDefinitions
                : data.componentDefinitions[1].component.config.elementTemplate.component.config.componentDefinitions;
              defs.push(field);
              const target = location === 'top' ? saved : location === 'nested' ? saved.parent : saved.rows[0];
              target.workspaces = value;
            },
            check: (projected, response) => {
              const target = location === 'top' ? projected : location === 'nested' ? projected.parent : projected.rows[0];
              expect(target).not.to.have.property('workspaces');
              expect(JSON.stringify(response)).not.to.contain('workspace-secret');
              const parent = response.data?.componentDefinitions?.[0];
              if (retain && location === 'nested' && parent) expect(parent.model.config.value).not.to.have.property('workspaces');
            },
          });
        }
      }
    }
    for (const location of ['top', 'nested']) {
      for (const value of [[{ public: 'visible', restricted: 'malformed-role-secret' }], ['malformed-role-secret'], 'malformed-role-secret', 42, false, null]) {
        round3Cases.push({ name: `malformed transformed group ${location} ${JSON.stringify(value)}`,
          mutate: (_data, saved) => { if (location === 'top') saved.parent = value; else saved.parent.nested = value; },
          check: (projected, response) => {
            expect(location === 'top' ? projected : projected.parent).not.to.have.property(location === 'top' ? 'parent' : 'nested');
            expect(JSON.stringify(response)).not.to.contain('malformed-role-secret');
            const content = response.data?.componentDefinitions?.[0]?.component.config.content;
            if (content !== undefined) {
              expect(content).to.be.an('object');
              if (location === 'nested') expect(content).not.to.have.property('nested');
            }
          },
        });
      }
    }
    for (const retain of [false, true]) {
      round3Cases.push({ name: `whole nested optionObject leaves retained=${retain}`, retain,
        mutate: (data, saved) => {
          const leaf = { name: 'school', component: { class: 'TypeaheadInputComponent', config: { valueMode: 'optionObject' } }, model: { class: 'TypeaheadInputModel' } };
          const school = { label: 'School of Testing', value: 'TEST', sourceType: 'static', extra: { saved: true } };
          for (const group of [data.componentDefinitions[0], data.componentDefinitions[1].component.config.elementTemplate]) {
            group.component.config.componentDefinitions.push(structuredClone(leaf));
            group.component.config.componentDefinitions.find((c: any) => c.name === 'nested').component.config.componentDefinitions.push(structuredClone(leaf));
          }
          saved.parent.school = school; saved.parent.nested.school = school;
          saved.rows.forEach((row: any) => { row.school = school; row.nested.school = school; });
        },
        check: (projected, response, saved) => {
          expect(projected.parent.school).to.deep.equal(saved.parent.school);
          expect(projected.parent.nested.school).to.deep.equal(saved.parent.nested.school);
          projected.rows.forEach((row: any, i: number) => {
            expect(row.school).to.deep.equal(saved.rows[i].school);
            expect(row.nested.school).to.deep.equal(saved.rows[i].nested.school);
          });
          for (const secret of ['role-secret', 'mode-secret', 'server-secret']) expect(JSON.stringify(response)).not.to.contain(secret);
        },
      });
    }
    for (const endpoint of ['getForm', 'getMeta'] as const) {
      for (const scenario of round3Cases) {
        it(`round3 ${endpoint} ${scenario.name}`, async () => {
          const { data, metadata } = nestedViewFixture(scenario.retain ?? false);
          scenario.mutate(data, metadata);
          const form = { name: data.name, configuration: data };
          const record = { redboxOid: 'oid-1', metaMetadata: { brandId: 'brand-1', type: 'dataset', form: form.name }, metadata };
          (global as any).sails.config = { reusableFormDefinitions: {} };
          (global as any).sails.services = { formpayloadprehydrateservice: { build: sinon.stub().resolves({}) } };
          (global as any).FormsService.getForm.resolves(form);
          (global as any).FormsService.getFormByName.returns(of(form));
          (global as any).FormsService.discoverValidationOperations.resolves([]);
          (global as any).FormsService.buildClientFormConfig.callsFake(buildNestedViewForm);
          (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
          (controller.recordsService.getMeta as sinon.SinonStub).callsFake(async () => structuredClone(record));
          (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
          Object.assign(controller.recordsService, { getRecordFormFingerprint: sinon.stub().resolves('fingerprint') });
          const req = { param: sinon.stub().callsFake(name => name === 'oid' ? 'oid-1' : name === 'name' ? 'dataset' : undefined),
            query: { edit: 'false', apiVersion: '2.0' }, session: { branding: 'default' },
            user: { username: 'reader', roles: [{ name: 'Researcher' }] },
          } as unknown as Sails.Req;
          const sendResp = sinon.stub(controller as any, 'sendResp');
          await controller[endpoint](req, {} as Sails.Res);
          const response = sendResp.firstCall.args[2];
          expect(response.status).not.to.equal(500);
          scenario.check(endpoint === 'getForm' ? response.meta.runtimeContext.record.metadata : response.data, response, metadata);
        });
      }
    }

    for (const endpoint of ['getForm', 'getMeta'] as const) {
      for (const roles of [['Researcher', 'Guest'], ['Admin', 'Librarians', 'Researcher', 'Guest']]) {
        for (const scenario of ['leaf', 'rows', 'malformed-top', 'malformed-nested', 'string', 'empty', 'fallback']) {
          it(`round2 ${endpoint} whole response ${scenario} for ${roles}`, async () => {
            const { data, metadata } = nestedViewFixture(scenario.startsWith('malformed'));
            const saved = metadata as any;
            saved.information_steward = { name: 'School of Testing', code: 'TEST', extra: { saved: true } };
            saved.workspaces = [{ restricted: 'workspace-secret' }];
            (data.componentDefinitions as any[]).push({ name: 'information_steward',
              component: { class: 'TypeaheadInputComponent', config: { displayField: 'name' } },
              model: { class: 'TypeaheadInputModel' },
            }, { name: 'workspaces', component: { class: 'ContentComponent', config: { content: 'Relationships' } } });
            if (scenario === 'rows') saved.rows = [{ public: '', restricted: 'first-role-secret' }, { public: 'second' }];
            if (scenario === 'malformed-top') saved.parent = [{ public: 'visible', restricted: 'malformed-role-secret' }];
            if (scenario === 'malformed-nested') saved.parent.nested = [{ public: 'visible', restricted: 'malformed-role-secret' }];
            if (scenario === 'fallback') saved.parent = { restricted: 'fallback-role-secret' };
            const form = { name: data.name, configuration: data };
            const record = { redboxOid: 'oid-1', metaMetadata: { brandId: 'brand-1', type: 'dataset', form: form.name }, metadata };
            (global as any).sails.config = { reusableFormDefinitions: {} };
            (global as any).sails.services = { formpayloadprehydrateservice: { build: sinon.stub().resolves({}) } };
            (global as any).FormsService.getForm.resolves(form);
            (global as any).FormsService.getFormByName.returns(of(form));
            (global as any).FormsService.discoverValidationOperations.resolves([]);
            (global as any).FormsService.buildClientFormConfig.callsFake(async (...args) => {
              const built = await buildNestedViewForm(args[0], args[1], args[2], args[3]);
              if (scenario === 'string' || scenario === 'empty') {
                for (const node of built.componentDefinitions.slice(0, 2)) {
                  node.component.config.content = scenario === 'string' ? 'Display only' : '';
                }
              }
              return built;
            });
            (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
            (controller.recordsService.getMeta as sinon.SinonStub).callsFake(async () => structuredClone(record));
            (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
            Object.assign(controller.recordsService, { getRecordFormFingerprint: sinon.stub().resolves('fingerprint') });
            const req = { param: sinon.stub().callsFake(name => name === 'oid' ? 'oid-1' : name === 'name' ? 'dataset' : undefined),
              query: { edit: 'false', apiVersion: '2.0' }, session: { branding: 'default' },
              user: { username: 'reader', roles: roles.map(name => ({ name, branding: 'brand-1' })) },
            } as unknown as Sails.Req;
            const sendResp = sinon.stub(controller as any, 'sendResp');
            await controller[endpoint](req, {} as Sails.Res);
            const response = sendResp.firstCall.args[2];
            expect(response.status).not.to.equal(500);
            const projected = endpoint === 'getForm' ? response.meta.runtimeContext.record.metadata : response.data;
            const serialized = JSON.stringify(response);
            // Check the whole response before the leaf assertion, so malformed
            // retained model leaks are independently visible in the red run.
            expect(serialized).not.to.contain('workspace-secret');
            if (!roles.includes('Admin')) {
              expect(serialized).not.to.contain('role-secret');
              expect(serialized).not.to.contain('service-result');
              expect(serialized).not.to.contain('irds-result');
            }
            expect(serialized).not.to.contain('server-secret');
            if (scenario === 'rows' && !roles.includes('Admin')) {
              expect(projected.rows).to.deep.equal([{ public: 'second' }]);
            }
            expect(projected.information_steward).to.deep.equal(saved.information_steward);
            expect(serialized).to.contain('School of Testing');
            expect(projected).not.to.have.property('workspaces');
          });
        }
      }
    }

    for (const retain of [true, false]) {
      for (const roles of [['Researcher'], ['Admin']]) {
        for (const endpoint of ['getForm', 'getMeta'] as const) {
          it(`${endpoint} projects nested view metadata for ${roles}, retained containers=${retain}`, async () => {
            const { data, metadata, expected } = nestedViewFixture(retain);
            const form = { name: data.name, configuration: data };
            const record = {
              redboxOid: 'oid-1',
              metaMetadata: { brandId: 'brand-1', type: 'dataset', form: form.name },
              metadata,
            };
            (global as any).sails.config = { reusableFormDefinitions: {} };
            (global as any).sails.services = {
              formpayloadprehydrateservice: { build: sinon.stub().resolves({}) },
            };
            (global as any).FormsService.getForm.resolves(form);
            (global as any).FormsService.getFormByName.returns(of(form));
            (global as any).FormsService.discoverValidationOperations.resolves([]);
            (global as any).FormsService.buildClientFormConfig.callsFake(buildNestedViewForm);
            (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
            (controller.recordsService.getMeta as sinon.SinonStub).callsFake(async () => structuredClone(record));
            (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
            Object.assign(controller.recordsService, { getRecordFormFingerprint: sinon.stub().resolves('fingerprint') });
            const req = {
              param: sinon.stub().callsFake(name => name === 'oid' ? 'oid-1' : name === 'name' ? 'dataset' : undefined),
              query: { edit: 'false', apiVersion: '2.0' }, session: { branding: 'default' },
              user: { username: 'reader', roles: roles.map(name => ({ name, branding: 'brand-1' })) },
            } as unknown as Sails.Req;
            const sendResp = sinon.stub(controller as any, 'sendResp');
            await controller[endpoint](req, {} as Sails.Res);
            const response = sendResp.firstCall.args[2];
            expect(response.status).not.to.equal(500);
            const result = endpoint === 'getForm' ? response.meta.runtimeContext.record.metadata : response.data;
            expect(result).to.deep.equal(expected(roles));
            const serialized = JSON.stringify(response);
            for (const secret of ['mode-secret', 'server-secret', 'top-level-secret']) {
              expect(serialized).not.to.contain(secret);
            }
            expect(serialized.includes('role-secret')).to.equal(roles.includes('Admin'));
          });
        }
      }
    }

    for (const roles of [['Researcher'], ['Admin']]) {
      for (const mode of ['view', 'edit']) {
        it(`filters real ${mode} forms for ${roles} on both record endpoints`, async () => {
          const { ConstructFormConfigVisitor } = require('../../src/visitor/construct.visitor');
          const { ClientFormConfigVisitor } = require('../../src/visitor/client.visitor');
          const { nothingLogger } = require('@researchdatabox/sails-ng-common');
          const service = new FormConsistencyServices.FormRecordConsistency();
          (global as any).FormRecordConsistencyService = service;
          const fields = ['title', 'restricted', 'editOnly'].map((name) => ({
            name,
            component: { class: 'SimpleInputComponent', config: {} },
            model: { class: 'SimpleInputModel', config: {} },
            ...(name === 'restricted' ? { constraints: { authorization: { allowRoles: ['Admin'] } } } : {}),
            ...(name === 'editOnly' ? { constraints: { allowModes: ['edit'] } } : {}),
          }));
          const form = {
            name: 'dataset-draft',
            configuration: { type: 'dataset', name: 'dataset-draft', componentDefinitions: fields },
          };
          const record = {
            redboxOid: 'oid-1',
            metaMetadata: { brandId: 'brand-1', type: 'dataset', form: form.name },
            metadata: {
              title: 'Visible',
              restricted: 'restricted-secret',
              editOnly: 'edit-secret',
              serverOnly: 'server-secret',
            },
          };
          (global as any).sails.config = { reusableFormDefinitions: {} };
          (global as any).sails.services = {
            formpayloadprehydrateservice: { build: sinon.stub().resolves({}) },
          };
          (global as any).FormsService.getForm.resolves(form);
          (global as any).FormsService.getFormByName.returns(of(form));
          (global as any).FormsService.discoverValidationOperations.resolves([]);
          (global as any).FormsService.buildClientFormConfig.callsFake(
            async (data, formMode, userRoles, metadata) => {
              const constructed = await new ConstructFormConfigVisitor(nothingLogger).start({
                data,
                formMode,
                record: metadata,
              });
              return new ClientFormConfigVisitor(nothingLogger).start({
                form: constructed,
                formMode,
                userRoles,
              });
            },
          );
          (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
          (controller.recordsService.getMeta as sinon.SinonStub).callsFake(async () => structuredClone(record));
          (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(mode === 'edit');
          Object.assign(controller.recordsService, {
            getRecordFormFingerprint: sinon.stub().resolves('fingerprint'),
          });
          const req = {
            param: sinon
              .stub()
              .callsFake((name) => (name === 'oid' ? 'oid-1' : name === 'name' ? 'dataset' : undefined)),
            query: { edit: String(mode === 'edit'), apiVersion: '2.0' },
            session: { branding: 'default' },
            user: { username: 'reader', roles: roles.map((name) => ({ name, branding: 'brand-1' })) },
          } as unknown as Sails.Req;
          const sendResp = sinon.stub(controller as any, 'sendResp');
          await controller.getForm(req, {} as Sails.Res);
          const response = sendResp.firstCall.args[2];
          expect(response.status).not.to.equal(500);
          if (mode === 'view') {
            expect(response.meta.runtimeContext.record.metadata).to.deep.equal({
              title: 'Visible',
              ...(roles.includes('Admin') ? { restricted: 'restricted-secret' } : {}),
            });
            expect(JSON.stringify(response.meta)).not.to.contain('edit-secret');
            expect(JSON.stringify(response.meta)).not.to.contain('server-secret');
            expect(JSON.stringify(response.meta).includes('restricted-secret')).to.equal(
              roles.includes('Admin'),
            );
          } else {
            expect(response.meta.runtimeContext.record).not.to.have.property('metadata');
          }
          sendResp.resetHistory();
          await controller.getMeta(req, {} as Sails.Res);
          expect(sendResp.firstCall.args[2].data).to.deep.equal({
            title: 'Visible',
            ...(roles.includes('Admin') ? { restricted: 'restricted-secret' } : {}),
            ...(mode === 'edit' ? { editOnly: 'edit-secret' } : {}),
          });
          // Project before role/mode filtering: authorized related data cannot
          // make a field removed from the caller's form visible again.
          Object.assign(controller.recordsService, {
            getConsumerView: sinon.stub().callsFake(async (raw: any) => ({ ...raw,
              metadata: { ...raw.metadata, title: 'Current projected title',
                restricted: 'projected-role-secret', serverOnly: 'projected-server-secret' },
            })),
          });
          req.query.consumerView = 'true';
          sendResp.resetHistory();
          await controller.getMeta(req, {} as Sails.Res);
          expect(sendResp.firstCall.args[2].data).to.deep.equal({
            title: 'Current projected title',
            ...(roles.includes('Admin') ? { restricted: 'projected-role-secret' } : {}),
          });
          expect(JSON.stringify(sendResp.firstCall.args[2])).not.to.contain('projected-server-secret');
          expect(record.metadata.title).to.equal('Visible');
        });
      }
    }
  });

  describe("Data Record metadata projection", () => {
    function prepareProjection() {
      const service = new FormConsistencyServices.FormRecordConsistency();
      FormRecordConsistencyService = service;
      (FormsService.getFormByName as sinon.SinonStub).returns(
        of({ configuration: dataRecordProjectionForm }),
      );
      (FormsService.buildClientFormConfig as sinon.SinonStub).resolves(
        dataRecordProjectionForm,
      );
      (controller.recordsService.getMeta as sinon.SinonStub).resolves({
        redboxOid: "representative-data-record",
        metaMetadata: {
          type: "dataRecord",
          form: dataRecordProjectionForm.name,
          brandId: "brand-1",
        },
        metadata: {
          ...dataRecordProjectedMetadata,
          serverOnly: { credentials: "hidden" },
        },
      });
      const req = {
        param: sinon.stub().withArgs("oid").returns("representative-data-record"),
        query: {},
        user: { username: "researcher", roles: [{ name: "Researcher", branding: "brand-1" }] },
        session: { branding: "default" },
      } as unknown as Sails.Req;
      const response = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub(),
        set: sinon.stub().returnsThis(),
      };
      return { service, req, response };
    }

    it("returns 200 with Data Locations and Data Manager using the real projection and response path", async () => {
      const { req, response } = prepareProjection();

      await controller.getMeta(req, response as unknown as Sails.Res);

      expect(response.status.calledOnceWithExactly(200)).to.be.true;
      expect(response.json.calledOnceWithExactly(dataRecordProjectedMetadata)).to
        .be.true;
      expect(
        (
          FormsService.buildClientFormConfig as sinon.SinonStub
        ).firstCall.args.slice(1, 3),
      ).to.deep.equal(["edit", ["Researcher"]]);
    });

    it("returns 403 without projecting metadata when record view access is denied", async () => {
      const { service, req, response } = prepareProjection();
      const project = sinon.spy(service, "projectMetadataClientFormConfig");
      (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(false);

      await controller.getMeta(req, response as unknown as Sails.Res);

      expect(response.status.calledOnceWithExactly(403)).to.be.true;
      expect(project.notCalled).to.be.true;
      expect((FormsService.buildClientFormConfig as sinon.SinonStub).notCalled).to
        .be.true;
    });

    it("returns 500 without raw metadata when projection fails", async () => {
      const { service, req, response } = prepareProjection();
      sinon
        .stub(service, "projectMetadataClientFormConfig")
        .rejects(new Error("Invalid form schema"));

      await controller.getMeta(req, response as unknown as Sails.Res);

      expect(response.status.calledOnceWithExactly(500)).to.be.true;
      expect(response.json.firstCall.args[0]).to.have.property(
        "message",
        "Failed to filter metadata for this record.",
      );
      expect(JSON.stringify(response.json.firstCall.args[0])).not.to.contain(
        "serverOnly",
      );
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
      param: sinon.stub().callsFake((name: string) => (name === 'oid' ? 'oid-1' : '')),
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
        (controller.recordsService.hasEditAccess as sinon.SinonStub).resetHistory();

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
            (controller.recordsService.getMeta as sinon.SinonStub).resolves({
              redboxOid: 'oid-1',
              metaMetadata: { form: 'auto' },
            });
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

      it(`returns a versioned permission denial without loading the form (API ${apiVersion}, edit=${edit})`, async () => {
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
        if (edit !== 'true') expect((controller.recordsService.hasEditAccess as sinon.SinonStub).called).to.be.false;
        expect(status.calledOnceWithExactly(apiVersion === '1.0' ? 500 : 403)).to.be.true;
        if (apiVersion === '1.0') {
          expect(json.firstCall.args[0]).to.deep.equal({ message: 'view-error-no-permissions', details: '' });
        } else {
          expect(json.firstCall.args[0]).to.deep.equal({
            errors: [{ code: 'view-error-no-permissions', title: 'view-error-no-permissions' }], meta: {},
          });
        }
        expect((FormsService.getForm as sinon.SinonStub).called).to.be.false;
      });
    }
  }

  for (const formSelection of ['named', 'saved']) {
    for (const persona of ['view-only', 'outsider']) {
      it(`denies an existing ${formSelection} ${persona} edit page before form lookup or protected title rendering`, async () => {
        const req = {
          param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
          query: {},
          session: { branding: 'default' },
          user: { username: persona, roles: [{ name: 'Researcher' }] },
          options: { locals: formSelection === 'named' ? { localFormName: 'named-form' } : {} },
        } as unknown as Sails.Req;
        (controller.recordsService.getMeta as sinon.SinonStub).resolves({
          redboxOid: 'oid-1',
          metaMetadata: { type: 'rdmp', form: 'saved-form' },
          metadata: { title: 'Protected acceptance record title' },
        });
        (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
        (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(persona === 'view-only');
        const forbidden = sinon.stub();
        const res = { forbidden } as unknown as Sails.Res;
        const sendView = sinon.stub(controller, 'sendView');

        await controller.edit(req, res);

        expect(forbidden.calledOnceWithExactly()).to.equal(true);
        expect(sendView.notCalled).to.equal(true);
        expect((FormsService.getFormByName as sinon.SinonStub).notCalled).to.equal(true);
        expect((FormsService.getFormByStartingWorkflowStep as sinon.SinonStub).notCalled).to.equal(true);
        expect((controller.recordsService.hasEditAccess as sinon.SinonStub).calledOnce).to.equal(true);
        expect((controller.recordsService.hasViewAccess as sinon.SinonStub).notCalled).to.equal(true);
      });
    }

    for (const persona of ['owner', 'editor']) {
      for (const recordType of ['rdmp', null]) {
        it(`allows server-authorized ${persona} with saved record type ${JSON.stringify(recordType)} with a ${formSelection} form that has no configured type`, async () => {
          const req = {
            param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
            query: {},
            session: { branding: 'default' },
            user: { username: persona, roles: [{ name: 'Researcher' }] },
            options: { locals: formSelection === 'named' ? { localFormName: 'named-form' } : {} },
          } as unknown as Sails.Req;
          const sendView = sinon.stub(controller, 'sendView');
          (controller.recordsService.getMeta as sinon.SinonStub).resolves({
            redboxOid: 'oid-1',
            metaMetadata: { type: recordType, form: formSelection === 'named' ? 'named-form' : 'saved-form' },
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
          const editAccess = controller.recordsService.hasEditAccess as sinon.SinonStub;
          expect(editAccess.calledOnce).to.be.true;
          expect(editAccess.firstCall.args[1]).to.equal(req.user);
          expect(editAccess.firstCall.args[2]).to.equal(req.user?.roles);
          expect(editAccess.firstCall.args[0]).to.deep.equal({ id: 'brand-1', name: 'default' });
          expect(editAccess.firstCall.args[3]).to.deep.include({ redboxOid: 'oid-1', metadata: { title: 'Saved title' } });
        });
      }
    }
  }

  for (const selection of ['named', 'saved']) {
    for (const persona of ['owner', 'editor', 'admin', 'viewer', 'outsider', 'anonymous']) {
      it(`enforces real record ACLs for ${persona} on the ${selection} edit route despite spoofed query authority`, async () => {
        const originalRoles = Reflect.get(globalThis, 'RolesService');
        const role = Object.assign(new RoleModel(), { id: 'admin-role', name: 'Admin' });
        const user = persona === 'anonymous' ? undefined : Object.assign(new UserModel(), {
          username: persona, roles: persona === 'admin' ? [role] : [],
        });
        const authorized = ['owner', 'editor', 'admin'].includes(persona);
        Reflect.set(globalThis, 'RolesService', { getRole: (_brand: unknown, name: string) => name === 'Admin' ? role : undefined });
        try {
          const service = new RecordServices.Records();
          (controller.recordsService.hasEditAccess as sinon.SinonStub).callsFake(service.hasEditAccess.bind(service));
          (controller.recordsService.getMeta as sinon.SinonStub).resolves({
            redboxOid: 'oid-1',
            metaMetadata: { type: 'rdmp', form: selection === 'named' ? 'named-form' : 'saved-form' },
            authorization: { edit: ['owner', 'editor'], editRoles: ['Admin'], view: ['viewer'], viewRoles: [] },
            metadata: { title: 'Protected saved title' },
          });
          (FormsService.getFormByName as sinon.SinonStub).returns(of({ configuration: { type: 'rdmp' } }));
          const req = {
            param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : (!authorized && name === 'recordType' ? 'spoofed-type' : '')),
            query: { hasEditAccess: true, edit: 'true', roles: ['Admin'], runtimeContext: { record: { hasEditAccess: true } } },
            session: { branding: 'default' }, user,
            options: { locals: selection === 'named' ? { localFormName: 'named-form' } : {} },
          } as unknown as Sails.Req;
          const forbidden = sinon.stub();
          const sendView = sinon.stub(controller, 'sendView');
          await controller.edit(req, { forbidden } as unknown as Sails.Res);
          expect(forbidden.called).to.equal(!authorized);
          expect(sendView.called).to.equal(authorized);
          expect((FormsService.getFormByName as sinon.SinonStub).called).to.equal(authorized);
          expect((FormsService.getFormByStartingWorkflowStep as sinon.SinonStub).called).to.be.false;
          if (authorized) expect(sendView.firstCall.args[3]).to.include({ title: 'Protected saved title | Site' });
        } finally {
          Reflect.set(globalThis, 'RolesService', originalRoles);
        }
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
    expect((controller.recordsService.hasEditAccess as sinon.SinonStub).called).to.be.false;
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
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
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
    expect((controller.recordsService.getMeta as sinon.SinonStub).calledOnce).to.be.true;
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
    expect((controller.recordsService.getMeta as sinon.SinonStub).called).to.be.false;
  });

  it('maps only the browser operation query to validationOperation while preserving CRUD intent', async function () {
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
    const context = await (controller as any).saveContext(req, 'transition', parsed.value);

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

  it('normalizes browser tags, form fingerprints, and resolution linkage once', async function () {
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

    const parsed = await (controller as any).mutationSaveContext(req, 'oid-1', 'update', undefined, undefined, true);
    expect(parsed.valid).to.equal(true);
    expect(parsed.context.requestId).to.equal(requestId);
    expect(parsed.context.concurrency).to.deep.equal({
      entityTagSupplied: true,
      expectedRevision: 6,
      formFingerprint: 'form-fingerprint-1',
      resolution: 'client-manually-resolved',
      resolutionOfRequestId: priorRequestId,
    });

    const malformed = await (controller as any).mutationSaveContext(
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

  it('disables route-form rebase when conflict metadata is projected through the stored form', async function () {
    const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000016');
    result.outcome = 'not-saved';
    result.problems = [{ kind: 'conflict', phase: 'persistence', issues: [{ code: 'record-revision-stale' }] }];
    result.setConcurrencyMetadata({ currentRevision: 5, formFingerprint: `route:sha256:${'a'.repeat(64)}` });
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      revision: 5,
      metaMetadata: { brandId: 'brand-1', form: 'form-1' },
      metadata: { title: 'Latest', finaliseNotes: 'Concurrent alternate-form value' },
    });
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(true);
    (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(true);
    (FormsService.getFormByName as sinon.SinonStub).returns(of({ configuration: { componentDefinitions: [] } }));
    (FormsService.buildClientFormConfig as sinon.SinonStub).resolves({ componentDefinitions: [] });
    (FormRecordConsistencyService.projectMetadataClientFormConfig as sinon.SinonStub).resolves({ title: 'Latest' });
    await (controller as any).projectSafeSaveFailure({ user: { username: 'alice' } }, { id: 'brand-1' }, 'oid-1', result);
    expect(result.metadata).to.deep.equal({ title: 'Latest' });
    expect(result.concurrency?.currentRevision).to.equal(5);
    expect(result.concurrency?.formFingerprint).to.equal(undefined);
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
      query: { edit: 'true', roles: ['Superuser'], hasEditAccess: true, recordType: 'spoofed' },
      session: { branding: 'default' },
      user: { username: 'alice', roles: [{ name: 'Researcher' }, { name: 'Admin' }] },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getForm(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2].meta).to.deep.include({
      formFingerprint: 'form-fingerprint-1',
      recordType: 'dataset',
      oid: null,
      runtimeContext: { user: { roles: ['Researcher', 'Admin'] }, record: { type: 'dataset', hasEditAccess: false } },
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

  for (const roleNames of [undefined, [], ['Researcher'], ['Admin', 'Librarians']]) {
    for (const { editable, edit } of [
      { editable: true, edit: 'true' },
      { editable: true, edit: 'false' },
      { editable: false, edit: 'false' },
    ]) {
      for (const apiVersion of ['1.0', '2.0']) {
        it(`reports authoritative edit access ${editable} in mode ${edit} (API ${apiVersion}, roles ${JSON.stringify(roleNames)})`, async function () {
          const record = {
            redboxOid: 'oid-1',
            metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
            metadata: { title: 'Visible to both personas' },
          };
          const form = { name: 'dataset-draft', configuration: { type: 'dataset', componentDefinitions: [] } };
          const forms = {
            getForm: sinon.stub().resolves(form),
            buildClientFormConfig: sinon.stub().resolves(form.configuration),
            discoverValidationOperations: sinon.stub().resolves([]),
          };
          Reflect.set(globalThis, 'FormsService', forms);
          Reflect.set(globalThis, 'sails', {
            config: { reusableFormDefinitions: {} },
            services: { formpayloadprehydrateservice: { build: sinon.stub().resolves({}) } },
            log: createSinonStubLogger(sinon),
          });
          (controller.recordsService.getMeta as sinon.SinonStub).resolves(record);
          (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(editable);
          Object.assign(controller.recordsService, { getRecordFormFingerprint: sinon.stub().resolves('fingerprint') });
          forms.getForm.resolves(form);
          forms.buildClientFormConfig.resolves(form.configuration);
          forms.discoverValidationOperations.resolves([]);
          Reflect.set(globalThis, 'RecordTypesService', { get: sinon.stub().returns(of({ name: 'dataset' })) });
          const user =
            roleNames === undefined
              ? undefined
              : Object.assign(new UserModel(), {
                  username: 'reader-or-owner',
                  roles: roleNames.map(name => Object.assign(new RoleModel(), { id: `role-${name}`, name })),
                });
          const req = {
            param: sinon
              .stub()
              .callsFake((name: string) =>
                name === 'oid'
                  ? 'oid-1'
                  : name === 'name'
                    ? roleNames?.length
                      ? 'spoofed-route-type'
                      : 'auto'
                    : undefined
              ),
            query: {
              edit,
              apiVersion,
              roles: ['Admin'],
              recordType: 'spoofed',
              hasEditAccess: !editable,
              runtimeContext: { user: { roles: ['Admin'] }, record: { type: 'spoofed', hasEditAccess: !editable } },
            },
            session: { branding: 'default' },
            user,
          } as unknown as Sails.Req;
          const json = sinon.stub().returnsThis();
          const res = { status: sinon.stub().returnsThis(), json, set: sinon.stub() } as unknown as Sails.Res;

          await controller.getForm(req, res);

          expect(forms.buildClientFormConfig.firstCall.args[1]).to.equal(edit === 'true' ? 'edit' : 'view');
          if (apiVersion === '1.0') {
            // The native v1 contract returns only form data, without a metadata envelope.
            expect(json.firstCall.args[0]).to.deep.equal(form.configuration);
            return;
          }
          const meta = (
            json.firstCall.args[0] as {
              meta: {
                recordType: string;
                runtimeContext: { user: { roles: string[] }; record: { type: string; hasEditAccess: boolean } };
              };
            }
          ).meta;
          expect(meta.runtimeContext).to.deep.equal({
            user: { roles: roleNames ?? [] },
            record: { type: 'dataset', hasEditAccess: editable, ...(edit === 'false' ? { metadata: {} } : {}) },
          });
          expect(meta.recordType).to.equal('dataset');
          expect((controller.recordsService.hasEditAccess as sinon.SinonStub).calledOnce).to.equal(true);
          expect((controller.recordsService.hasViewAccess as sinon.SinonStub).callCount).to.equal(
            edit === 'true' ? 0 : 1
          );
          // Response metadata is per request, even when the form/service fixtures are reused.
          meta.runtimeContext.user.roles.push('Injected');
          meta.runtimeContext.record.hasEditAccess = !editable;
          await controller.getForm(req, res);
          const next = (json.secondCall.args[0] as { meta: typeof meta }).meta;
          expect(next.runtimeContext).to.deep.equal({
            user: { roles: roleNames ?? [] },
            record: { type: 'dataset', hasEditAccess: editable, ...(edit === 'false' ? { metadata: {} } : {}) },
          });
          expect(user?.roles.map(role => role.name) ?? []).to.deep.equal(roleNames ?? []);
        });
      }
    }
  }

  it('fingerprints the authoritative delivered form independently of target intent', async function () {
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

  describe('route-authorised finalise forms', () => {
    let record;
    let form;
    let currentStep;
    let transitionStep;
    let session;
    let sessionStore;
    let user;
    let sendResp;
    let sendView;
    let formName;
    let routeLocals;
    const load = async (oid = record.redboxOid, res = {} as Sails.Res) => {
      await controller.getForm(
        {
          param: name => (name === 'oid' ? oid : name === 'formName' ? formName : 'rdmp'),
          query: { edit: 'true' },
          session,
          sessionID: 'session-a',
          sessionStore,
          user,
        } as unknown as Sails.Req,
        res
      );
      return sendResp.lastCall.args[2];
    };
    const open = async (oid = record.redboxOid, requestSession = session, overrides: Partial<Sails.Req> = {}) =>
      controller.edit(
        {
          param: name =>
            name === 'oid' ? oid : name === 'recordType' && routeLocals.localFormName ? 'rdmp' : undefined,
          options: { locals: routeLocals },
          query: {},
          session: requestSession,
          sessionID: 'session-a',
          sessionStore,
          user,
          ...overrides,
        } as unknown as Sails.Req,
        { forbidden: sinon.stub() } as unknown as Sails.Res
      );

    beforeEach(() => {
      record = {
        redboxOid: 'oid-1',
        revision: 3,
        metaMetadata: { brandId: 'brand-1', type: 'rdmp', form: 'rdmp-draft' },
        metadata: { title: 'Draft' },
        workflow: { stage: 'draft' },
      };
      formName = 'rdmp-transition';
      routeLocals = { localFormName: formName };
      form = {
        id: 'form-1',
        name: formName,
        branding: 'brand-1',
        configuration: { type: 'rdmp', componentDefinitions: [] },
      };
      currentStep = { name: 'draft', config: { form: 'rdmp-draft', workflow: { stage: 'draft' } } };
      transitionStep = {
        name: 'transition-finalised',
        hidden: true,
        config: { form: formName, workflow: { stage: 'transition-finalised' } },
      };
      session = { branding: 'default', cookie: new Cookie() };
      sessionStore = new MemoryStore();
      user = { username: 'alice', roles: [] };
      (controller.recordsService.getMeta as sinon.SinonStub).resolves(record);
      (global as any).RecordTypesService.get.returns(of({ id: 'rt-1', name: 'rdmp' }));
      (global as any).BrandingService.getBrandById = sinon.stub().returns({ id: 'brand-1' });
      const service = new RecordServices.Records();
      controller.recordsService.hasTransitionRoleAuthorization = service.hasTransitionRoleAuthorization;
      controller.recordsService.getRecordFormFingerprint = service.getRecordFormFingerprint.bind(service);
      (global as any).WorkflowStepsService.get = sinon.stub().callsFake(() => of(currentStep));
      (global as any).WorkflowStepsService.getAllForRecordTypeIncludingHidden = sinon
        .stub()
        .callsFake(() => of([currentStep, transitionStep]));
      (global as any).WorkflowStepsService.getAllForRecordType.callsFake(() => of([currentStep]));
      (global as any).FormsService.getFormByName.callsFake(() => of(form));
      (global as any).FormsService.getForm.callsFake(async () => form);
      (global as any).FormsService.buildClientFormConfig.callsFake(async () => form.configuration);
      (global as any).FormsService.discoverValidationOperations.resolves([]);
      (global as any).sails.services = { formpayloadprehydrateservice: { build: sinon.stub().resolves({}) } };
      sendView = sinon.stub(controller, 'sendView');
      sendResp = sinon.stub(controller, 'sendResp');
      sinon.stub(controller, 'getApiVersion').returns('2.0');
    });

    for (const stage of ['draft', 'finalised']) {
      it(`loads the finalise transition form from ${stage} after the configured edit route authorises it`, async () => {
        record.workflow.stage = currentStep.name = currentStep.config.workflow.stage = stage;
        await open();
        const result = await load();
        expect(result.status).to.equal(undefined);
        expect(result.meta.formName).to.equal(formName);
        expect(result.meta.formFingerprint).to.match(/^route:sha256:[0-9a-f]{64}$/);
        expect(result.headers.ETag).to.equal(formatRecordEntityTag('oid-1', 3));
        expect((global as any).FormsService.getForm.firstCall.args[1]).to.equal(formName);
        expect(record.metaMetadata.form).to.equal('rdmp-draft');
        expect(record.workflow.stage).to.equal(stage);
        expect(
          (
            await readRouteForm(
              { session, sessionID: 'session-a', sessionStore, user } as unknown as Sails.Req,
              record.redboxOid,
              { fingerprint: result.meta.formFingerprint }
            )
          )?.fingerprint
        ).to.equal(result.meta.formFingerprint);
        expect(sendView.calledOnce).to.equal(true);
      });
    }

    for (const collision of [false, true]) {
      it(`loads a form from a persisted stage differing from its step name${collision ? ' despite a name collision' : ''}`, async () => {
        record.workflow.stage = currentStep.config.workflow.stage = 'under-review';
        currentStep.name = 'review-step';
        currentStep.config.workflow.next = [transitionStep.name];
        const other = {
          name: 'under-review',
          config: { form: 'other-form', workflow: { stage: 'other-stage', next: [] } },
        };
        const steps = [currentStep, transitionStep, ...(collision ? [other] : [])];
        (WorkflowStepsService.get as sinon.SinonStub).callsFake((_type, name) =>
          of(steps.find(step => step.name === name))
        );
        (WorkflowStepsService.getAllForRecordTypeIncludingHidden as sinon.SinonStub).returns(of(steps));

        await open();
        const result = await load();

        expect(sendView.calledOnce).to.equal(true);
        expect(result.status).to.equal(undefined);
        expect(result.meta.formName).to.equal(formName);
        expect(record.workflow.stage).to.equal('under-review');
      });
    }

    it('does not borrow a permissive edge list from an unrelated same-name step', async () => {
      record.workflow.stage = currentStep.config.workflow.stage = 'under-review';
      currentStep.name = 'review-step';
      currentStep.config.workflow.next = [];
      const other = {
        name: 'under-review',
        config: { form: 'other-form', workflow: { stage: 'other-stage', next: [transitionStep.name] } },
      };
      (WorkflowStepsService.get as sinon.SinonStub).returns(of(other));
      (WorkflowStepsService.getAllForRecordTypeIncludingHidden as sinon.SinonStub).returns(
        of([other, currentStep, transitionStep])
      );

      await open();

      expect(sendView.notCalled).to.equal(true);
      expect(sendResp.lastCall.args[2]).to.deep.include({
        status: 409,
        displayErrors: [{ code: 'form-definition-changed' }],
      });
    });

    it('retains the name default for a step without a configured persisted stage', async () => {
      delete currentStep.config.workflow.stage;
      await open();
      expect((await load()).meta.formName).to.equal(formName);
    });

    for (const scenario of ['distinct-form', 'same-form', 'no-matching-form']) {
      it(`${scenario === 'distinct-form' ? 'disambiguates' : 'rejects ambiguous'} steps sharing a persisted stage (${scenario})`, async () => {
        if (scenario === 'no-matching-form') currentStep.config.form = 'different-form';
        const other = {
          name: 'other-step',
          config: {
            form: scenario === 'same-form' ? record.metaMetadata.form : 'other-form',
            workflow: { stage: record.workflow.stage, next: [] },
          },
        };
        (WorkflowStepsService.getAllForRecordTypeIncludingHidden as sinon.SinonStub).returns(
          of([other, currentStep, transitionStep])
        );

        await open();

        if (scenario === 'distinct-form') {
          expect(sendView.calledOnce).to.equal(true);
          expect((await load()).meta.formName).to.equal(formName);
        } else {
          expect(sendView.notCalled).to.equal(true);
          expect(sendResp.lastCall.args[2]).to.deep.include({
            status: 409,
            displayErrors: [{ code: 'form-definition-changed' }],
          });
        }
      });
    }

    for (const scenario of ['wrong-type', 'unreachable', 'unconfigured', 'transition-role']) {
      it(`rejects an ineligible ${scenario} form at the edit-route boundary`, async () => {
        if (scenario === 'wrong-type') form.configuration.type = 'dataPublication';
        if (scenario === 'unreachable') currentStep.config.workflow.next = ['finalised'];
        if (scenario === 'unconfigured') transitionStep.config.form = 'other-form';
        if (scenario === 'transition-role') transitionStep.config.authorization = { transitionRoles: ['Admin'] };
        const store = sinon.spy(sessionStore, 'set');

        await open();

        expect(sendResp.lastCall?.args[2]).to.deep.include({
          status: 409,
          displayErrors: [{ code: 'form-definition-changed' }],
        });
        expect(sendView.notCalled).to.equal(true);
        expect(store.notCalled).to.equal(true);
      });
    }

    for (const missing of ['sessionID', 'sessionStore']) {
      it(`does not render an alternate form without ${missing} to hold its grant`, async () => {
        await open(record.redboxOid, session, { [missing]: undefined });

        expect(sendResp.lastCall?.args[2]).to.deep.include({
          status: 409,
          displayErrors: [{ code: 'form-definition-changed' }],
        });
        expect(sendView.notCalled).to.equal(true);
      });
    }

    it('discovers validation operations for an authorised alternate form without changing the stored context', async () => {
      form.configuration.name = formName;
      form.configuration.validationOperations = {
        submit: { label: 'Submit for review', enabledValidationGroups: ['all'] },
        adminOnly: { label: 'Private action', enabledValidationGroups: ['all'], roles: ['Admin'] },
      };
      const forms = new FormServices.Forms();
      const validation = new ValidationServices.RecordValidation();
      const discover = sinon.spy(validation, 'discoverOperations');
      Object.assign(sails.services, {
        recordsservice: controller.recordsService,
        recordvalidationservice: validation,
      });
      (FormsService.discoverValidationOperations as sinon.SinonStub).callsFake(
        forms.discoverValidationOperations.bind(forms)
      );
      (FormsService.getFormByName as sinon.SinonStub).callsFake(name =>
        of(
          name === formName
            ? form
            : {
                name,
                branding: 'brand-1',
                configuration: { name, type: 'rdmp', componentDefinitions: [] },
              }
        )
      );

      await open();
      const result = await load();

      expect(result.meta.validationOperations).to.deep.equal([{ name: 'submit', label: 'Submit for review' }]);
      expect(discover.calledOnce).to.equal(true);
      const candidate = discover.firstCall.args[0].candidate;
      expect(candidate.metaMetadata.form).to.equal('rdmp-draft');
      expect(routeFormContractName(discover.firstCall.args[0].routeFormContract, candidate)).to.equal(formName);
      expect(candidate.workflow).to.deep.equal({ stage: 'draft' });
      expect(record.metaMetadata.form).to.equal('rdmp-draft');
      expect(record.workflow).to.deep.equal({ stage: 'draft' });
    });

    for (const action of ['update', 'stepTo']) {
      it(`skips grant-store lookup for an ordinary fingerprint-protected ${action}`, async () => {
        formName = form.name = record.metaMetadata.form;
        const delivered = await load();
        const get = sinon
          .stub(sessionStore, 'get')
          .callsFake((_key, callback) => callback(new Error('Store unavailable')));
        const saved = new RecordSaveResponse('00000000-0000-4000-8000-000000000123');
        saved.outcome = 'saved';
        saved.success = true;
        const update = sinon.stub().resolves(saved);
        controller.recordsService.updateMeta = update;
        const req = {
          params: { oid: record.redboxOid, targetStep: 'finalised' },
          query: {},
          headers: {
            'if-match': delivered.headers.ETag,
            'x-redbox-form-fingerprint': delivered.meta.formFingerprint,
          },
          body: { title: 'Ordinary save' },
          session,
          sessionID: 'session-a',
          sessionStore,
          user,
        } as unknown as Sails.Req;

        if (action === 'stepTo') await controller.stepTo(req, {} as Sails.Res);
        else {
          const internal = controller as unknown as {
            updateInternal(req: Sails.Req, res: Sails.Res): Promise<unknown>;
          };
          await internal.updateInternal(req, {} as Sails.Res);
        }

        expect(get.notCalled).to.equal(true);
        expect(update.calledOnce).to.equal(true);
        expect(update.firstCall.args[8].routeForm).to.equal(undefined);
      });
    }

    for (const action of ['restoreRecord', 'destroyDeletedRecord'] as const) {
      for (const apiVersion of ['1.0', '2.0']) {
        for (const failure of ['snapshot', 'context', 'mutation']) {
          it(`sanitises ${action} ${failure} failures (API ${apiVersion})`, async () => {
            const error = new Error('private lifecycle diagnostics');
            (controller.getApiVersion as sinon.SinonStub).returns(apiVersion);
            controller.recordsService.getDeletedRecordMeta = sinon.stub().resolves(record);
            const mutation = sinon.stub().rejects(error);
            controller.recordsService[action] = mutation;
            if (failure === 'snapshot') {
              (controller.recordsService.getDeletedRecordMeta as sinon.SinonStub).rejects(error);
            }
            if (failure === 'context') {
              const internal = controller as unknown as { mutationSaveContext(): Promise<unknown> };
              sinon.stub(internal, 'mutationSaveContext').rejects(error);
            }
            const req = {
              param: () => record.redboxOid,
              params: { oid: record.redboxOid },
              query: {},
              headers: {},
              session,
              sessionID: 'session-a',
              sessionStore,
              user,
            } as unknown as Sails.Req;

            await controller[action](req, {} as Sails.Res);

            expect(sendResp.lastCall.args[2]).to.deep.equal(
              apiVersion === '1.0'
                ? {
                    status: 500,
                    v1: { message: '@record-save-failed' },
                  }
                : {
                    status: 500,
                    displayErrors: [{ code: 'record-save-failed', title: '@record-save-failed' }],
                  }
            );
            expect(mutation.callCount).to.equal(failure === 'mutation' ? 1 : 0);
            expect(JSON.stringify(sendResp.args)).not.to.include(error.message);
            expect(JSON.stringify((sails.log.error as sinon.SinonStub).args)).not.to.include(error.message);
          });
        }
      }
    }

    it('handles session-store failures on stepTo without saving or exposing error details', async () => {
      await open();
      const delivered = await load();
      const update = sinon.stub();
      controller.recordsService.updateMeta = update;
      sinon
        .stub(sessionStore, 'get')
        .callsFake((_key, callback) => callback(new Error('private session-store connection details')));
      const req = {
        params: { oid: record.redboxOid, targetStep: 'finalised' },
        query: { formName: record.metaMetadata.form },
        headers: {
          'if-match': formatRecordEntityTag(record.redboxOid, record.revision),
          'x-redbox-form-fingerprint': delivered.meta.formFingerprint,
        },
        body: { title: 'Finalise' },
        session,
        sessionID: 'session-a',
        sessionStore,
        user,
      } as unknown as Sails.Req;

      await controller.stepTo(req, {} as Sails.Res);

      expect(sendResp.lastCall.args[2]).to.deep.equal({
        status: 500,
        displayErrors: [{ code: 'record-save-failed', title: '@record-save-failed' }],
      });
      expect(update.notCalled).to.equal(true);
      expect(JSON.stringify(sendResp.args)).not.to.include('private session-store connection details');
      expect(JSON.stringify((sails.log.error as sinon.SinonStub).args)).not.to.include(
        'private session-store connection details'
      );
    });

    for (const operation of ['get', 'set'] as const) {
      for (const apiVersion of ['1.0', '2.0']) {
        it(`sanitises grant-store ${operation} failures during form delivery (API ${apiVersion})`, async () => {
          await open();
          const storeError = new Error('private grant-store diagnostics');
          if (operation === 'get') {
            sinon.stub(sessionStore, 'get').callsFake((_key, callback) => callback(storeError));
          } else {
            sinon.stub(sessionStore, 'set').callsFake((_key, _entry, callback) => callback(storeError));
          }
          (controller.getApiVersion as sinon.SinonStub).returns(apiVersion);
          sendResp.callThrough();
          const status = sinon.stub().returnsThis();
          const json = sinon.stub().returnsThis();
          const res = { status, json, set: sinon.stub() } as unknown as Sails.Res;

          const result = await load(record.redboxOid, res);

          expect(status.calledOnceWithExactly(500)).to.equal(true);
          expect(json.calledOnce).to.equal(true);
          expect(result.errors).to.equal(undefined);
          expect(result.displayErrors).to.deep.equal([{ title: 'Error getting form definition' }]);
          expect(JSON.stringify(json.firstCall.args[0])).not.to.include(storeError.message);
          expect(JSON.stringify(json.firstCall.args[0])).not.to.include(storeError.stack);
          expect(
            (sails.log.error as sinon.SinonStub).calledWith('record_route_form_store_failed', storeError)
          ).to.equal(true);
          expect(record.metaMetadata.form).to.equal('rdmp-draft');
          if (operation === 'get') expect((FormsService.getForm as sinon.SinonStub).notCalled).to.equal(true);
        });
      }
    }

    it('keeps the core default finalise route working with a different stored form', async () => {
      routeLocals = (routes['get /:branding/:portal/record/finalise/:recordType/edit/:oid'] as RouteTargetObject)
        .locals;
      formName = form.name = transitionStep.config.form = routeLocals.localFormName;
      await open();
      expect((await load()).meta.formName).to.equal('default-1.0-draft');
    });

    it('honors an explicit next stage', async () => {
      currentStep.config.workflow.next = 'transition-finalised';
      await open();
      expect((await load()).meta.formName).to.equal(formName);
    });

    it('allows a hidden finalise form whose save button targets an explicit next stage', async () => {
      currentStep.config.workflow.next = ['finalised'];
      const finalised = { name: 'finalised', config: { form: 'rdmp-finalised' } };
      (global as any).WorkflowStepsService.getAllForRecordTypeIncludingHidden.callsFake(() =>
        of([currentStep, transitionStep, finalised])
      );
      form.configuration.componentDefinitions = [
        {
          name: 'finalise',
          component: { class: 'SaveButtonComponent', config: { targetStep: 'finalised' } },
        },
      ];
      await open();
      const result = await load();
      expect(result.status).to.equal(undefined);
      expect(result.meta.formName).to.equal(formName);
    });

    it('resolves nested reusable save buttons when authorising a direct transition form', async () => {
      currentStep.config.workflow.next = ['finalised'];
      (global as any).WorkflowStepsService.getAllForRecordTypeIncludingHidden.callsFake(() =>
        of([currentStep, transitionStep, { name: 'finalised', config: { form: 'rdmp-finalised' } }])
      );
      sails.config.reusableFormDefinitions = {
        finaliseActions: [
          { name: 'finalise', component: { class: 'SaveButtonComponent', config: { targetStep: 'finalised' } } },
        ],
      };
      form.configuration.componentDefinitions = [
        {
          name: 'actions',
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: '',
                  overrides: { reusableFormName: 'finaliseActions' },
                  component: { class: 'ReusableComponent' },
                },
              ],
            },
          },
        },
      ];
      await open();
      expect((await load()).meta.formName).to.equal(formName);
    });

    for (const scenario of ['reachable', 'unreachable', 'role-restricted']) {
      it(`checks a hidden transition form's headerActions save target when ${scenario}`, async () => {
        currentStep.config.workflow.next = ['finalised'];
        const finalised = {
          name: 'finalised',
          config: {
            form: 'rdmp-finalised',
            authorization: { transitionRoles: scenario === 'role-restricted' ? ['Admin'] : [] },
          },
        };
        (WorkflowStepsService.getAllForRecordTypeIncludingHidden as sinon.SinonStub).returns(
          of([currentStep, transitionStep, finalised])
        );
        form.configuration.componentDefinitions = [
          {
            name: 'dataLocations',
            component: {
              class: 'PublishDataLocationSelectorComponent',
              config: {
                headerActions: [
                  {
                    name: 'finalise',
                    component: {
                      class: 'SaveButtonComponent',
                      config: { targetStep: scenario === 'unreachable' ? 'private' : 'finalised' },
                    },
                  },
                ],
              },
            },
          },
        ];

        await open();
        const result = await load();

        expect(result.status).to.equal(scenario === 'reachable' ? undefined : 409);
        if (scenario === 'reachable') expect(result.meta.formName).to.equal(formName);
        else expect(result.displayErrors).to.deep.equal([{ code: 'form-definition-changed' }]);
      });
    }

    for (const scenario of ['forbidden-target', 'target-role', 'non-hidden-form', 'metadata-target']) {
      it(`rejects a direct transition form with ${scenario}`, async () => {
        currentStep.config.workflow.next = ['finalised'];
        const target = { name: 'finalised', config: { form: 'rdmp-finalised', authorization: {} } };
        (global as any).WorkflowStepsService.getAllForRecordTypeIncludingHidden.callsFake(() =>
          of([currentStep, transitionStep, target])
        );
        const button = {
          name: 'finalise',
          component: { class: 'SaveButtonComponent', config: { targetStep: 'finalised' } },
        };
        form.configuration.componentDefinitions = [button];
        if (scenario === 'forbidden-target') button.component.config.targetStep = 'unreachable';
        if (scenario === 'target-role') target.config.authorization = { transitionRoles: ['Admin'] };
        if (scenario === 'non-hidden-form') transitionStep.hidden = false;
        if (scenario === 'metadata-target') {
          form.configuration.componentDefinitions = [];
          record.metadata.button = button;
        }
        await open();
        expect((await load()).status).to.equal(409);
      });
    }

    it('loads a legacy transition form without an explicit type', async () => {
      delete form.configuration.type;
      await open();
      const result = await load();
      expect(result.status).to.equal(undefined);
      expect(result.meta.formName).to.equal(formName);
    });

    it('retains grants across concurrent tabs with last-write-wins session snapshots', async () => {
      const other = { ...record, redboxOid: 'oid-2' };
      (controller.recordsService.getMeta as sinon.SinonStub).callsFake(async oid =>
        oid === other.redboxOid ? other : record
      );
      // express-session loads a separate snapshot for each overlapping request.
      const tabA = _.cloneDeep(session);
      const tabB = _.cloneDeep(session);
      await Promise.all([open(record.redboxOid, tabA), open(other.redboxOid, tabB)]);
      const persist = snapshot =>
        new Promise<void>((resolve, reject) =>
          sessionStore.set('session-a', snapshot, error => (error ? reject(error) : resolve()))
        );
      await persist(tabA);
      await persist(tabB);
      session = _.cloneDeep(tabB);
      expect((await load(record.redboxOid)).status).to.equal(undefined);
      expect((await load(other.redboxOid)).status).to.equal(undefined);
      const delivered = await Promise.all([load(record.redboxOid), load(other.redboxOid)]);
      for (const [index, oid] of [record.redboxOid, other.redboxOid].entries()) {
        const context = await (controller as any).saveContext(
          {
            params: { oid },
            query: {},
            headers: {},
            sessionID: 'session-a',
            sessionStore,
            session,
            user,
          },
          'transition',
          undefined,
          'finalised',
          { formFingerprint: delivered[index].meta.formFingerprint }
        );
        expect(context.routeForm?.oid).to.equal(oid);
      }
    });

    it('does not share route grants with another session or accept expired grants', async () => {
      await open();
      const req = { session, sessionID: 'session-b', sessionStore, user } as unknown as Sails.Req;
      expect(await readRouteForm(req, record.redboxOid, { formName })).to.equal(undefined);
      const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
      try {
        clock.tick(86_400_001);
        expect((await load()).status).to.equal(409);
      } finally {
        clock.restore();
      }
    });

    for (const scenario of [
      'no-route',
      'normal-edit',
      'wrong-type',
      'unreachable',
      'unconfigured',
      'transition-role',
      'tampered-name',
      'changed-stage',
      'changed-user',
    ]) {
      it(`returns 409 for ${scenario}`, async () => {
        if (scenario === 'normal-edit') routeLocals = {};
        if (scenario === 'wrong-type') form.configuration.type = 'dataPublication';
        if (scenario === 'unreachable') currentStep.config.workflow.next = 'finalised';
        if (scenario === 'unconfigured') transitionStep.config.form = 'other-form';
        if (scenario === 'transition-role') transitionStep.config.authorization = { transitionRoles: ['Admin'] };
        if (scenario !== 'no-route') await open();
        if (scenario === 'tampered-name') formName = 'client-selected';
        if (scenario === 'changed-stage') record.workflow.stage = 'other-stage';
        if (scenario === 'changed-user') user.username = 'bob';
        const result = await load();
        expect(result).to.include({ status: 409 });
        expect(result.displayErrors).to.deep.equal([{ code: 'form-definition-changed' }]);
        expect((global as any).FormsService.getForm.notCalled).to.equal(true);
        expect((FormsService.discoverValidationOperations as sinon.SinonStub).notCalled).to.equal(true);
      });
    }

    for (const action of ['update', 'stepTo']) {
      for (const tampered of [false, true]) {
        it(`${action} ${tampered ? 'rejects a tampered formName' : 'forwards only the session grant matched by the delivered fingerprint'}`, async () => {
          await open();
          const delivered = await load();
          // Another tab opens the same page, but has not requested its form yet.
          await open();
          const saved = new RecordSaveResponse('00000000-0000-4000-8000-000000000123');
          saved.oid = record.redboxOid;
          saved.outcome = 'saved';
          saved.success = true;
          const update = sinon.stub().resolves(saved);
          controller.recordsService.updateMeta = update;
          const req = {
            params: { oid: record.redboxOid, targetStep: 'finalised' },
            query: { targetStep: 'finalised', formName: tampered ? 'tampered-form' : formName },
            headers: {
              'if-match': delivered.headers.ETag,
              'x-redbox-form-fingerprint': delivered.meta.formFingerprint,
            },
            body: { title: 'Finalise' },
            session,
            sessionID: 'session-a',
            sessionStore,
            user,
          } as unknown as Sails.Req;
          if (action === 'stepTo') await controller.stepTo(req, {} as Sails.Res);
          else await (controller as any).updateInternal(req, {} as Sails.Res);
          if (tampered) {
            expect(sendResp.lastCall.args[2]).to.include({ status: 409 });
            expect(update.notCalled).to.equal(true);
          } else {
            expect(update.calledOnce).to.equal(true);
            expect(update.firstCall.args[8].routeForm).to.include({
              formName,
              fingerprint: delivered.meta.formFingerprint,
              oid: record.redboxOid,
            });
            expect(update.firstCall.args[8].concurrency.expectedRevision).to.equal(3);
          }
        });
      }
    }

    it('returns the existing no-permissions response and issues no grant without edit access', async () => {
      (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
      await open();
      expect(
        await readRouteForm(
          { session, sessionID: 'session-a', sessionStore, user } as unknown as Sails.Req,
          record.redboxOid,
          { formName }
        )
      ).to.equal(undefined);
      const result = await load();
      expect(result.status).to.equal(403);
      expect(result.displayErrors).to.deep.equal([{ code: 'view-error-no-permissions' }]);
    });
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
      getRecordsForDisplay: sinon.stub().resolves({
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
            deletedRecordMetadata: { metadata: { title: 'Deleted record' }, metaMetadata: { type: 'rdmp' } },
            deletedBy: { id: 'user-1', username: 'alice', brandId: 'brand-1' },
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

    expect(response.items[0]).to.deep.include({ oid: 'oid-1', revision: 12, recordType: 'rdmp', deletedBy: { id: 'user-1', username: 'alice' } });
  });

  it('only exposes an actor from the active brand and resolves available type labels', () => {
    const doc = { deletedRecordMetadata: { metaMetadata: { type: 'rdmp' } }, deletedBy: { brandId: 'other', username: 'private' } };
    expect(deletedRecordSummary(doc, 'brand-1', key => key === 'rdmp-title' ? 'Plans' : key)).to.deep.equal({ recordType: 'rdmp', recordTypeLabel: 'Plans', deletedBy: null });
    expect(deletedRecordSummary({}, 'brand-1', key => key)).to.deep.equal({ recordType: '', deletedBy: null });
  });

  it('bounds batches and rejects duplicates, invalid actions and missing preconditions', () => {
    const item = { oid: 'one', entityTag: formatRecordEntityTag('one', 3) };
    for (const body of [{ action: 'restore', items: [] }, { action: 'other', items: [item] }, { action: 'restore', items: [item, item] }, { action: 'destroy', items: [{ oid: 'one' }] }, { action: 'restore', items: Array.from({ length: 101 }, (_, i) => ({ ...item, oid: String(i) })) }]) {
      expect(bulkDeletedRecordsBody.safeParse(body).success).to.equal(false);
    }
    expect(bulkDeletedRecordsBody.safeParse({ action: 'restore', items: Array.from({ length: 100 }, (_, i) => ({ ...item, oid: String(i) })) }).success).to.equal(true);
  });

  for (const action of ['restore', 'destroy']) {
    it(`bulk ${action} checks each brand/edit permission and continues through failures and unknown outcomes`, async () => {
      const unavailable = new Set(['missing', 'other-brand']);
      const read = sinon.stub().callsFake(async (oid, brand) => unavailable.has(oid) ? null : { redboxOid: oid, metaMetadata: { brandId: brand.id } });
      const mutate = sinon.stub().callsFake(async (oid) => {
        if (oid === 'throw') throw new Error('private exception');
        return { outcome: oid === 'stale' ? 'not-saved' : 'saved', wasPersisted: () => oid !== 'stale', problems: oid === 'stale' ? [{ kind: 'conflict' }] : [] };
      });
      controller.recordsService = { getDeletedRecordMeta: read, hasEditAccess: (_brand, _user, _roles, record) => record.redboxOid !== 'denied', restoreRecord: mutate, destroyDeletedRecord: mutate } as any;
      const ids = ['ok', 'missing', 'denied', 'other-brand', 'stale', 'throw', 'last'];
      const req: any = { body: { action, items: ids.map(oid => ({ oid, entityTag: formatRecordEntityTag(oid, 3) })) }, headers: {}, params: {}, query: {}, user: { username: 'alice' }, session: { branding: 'default' } };
      const send = sinon.stub(controller as any, 'sendResp');
      await controller.bulkDeletedRecords(req, {} as any);
      expect(mutate.getCalls().map(call => call.args[0])).to.deep.equal(['ok', 'stale', 'throw', 'last']);
      for (const call of mutate.getCalls()) {
        expect(call.args[3]).to.include({ operation: action === 'restore' ? 'restore' : 'purge', routeFamily: 'browser' });
        expect(call.args[3].concurrency).to.include({ expectedRevision: 3 });
      }
      expect(read.getCalls().every(call => call.args[1].id === 'brand-1')).to.equal(true);
      expect(send.firstCall.args[2].v1.results.map(item => item.status)).to.deep.equal(['succeeded', 'failed', 'failed', 'failed', 'failed', 'unknown', 'succeeded']);
      expect(send.firstCall.args[2].v1.results[4].reason).to.equal('record-changed');
      expect(JSON.stringify(send.firstCall.args[2])).not.to.include('private exception');
    });
  }

  it('returns an invalid precondition for one item without dispatching its mutation', async () => {
    (controller.recordsService.getDeletedRecordMeta as sinon.SinonStub).resolves({ metaMetadata: { brandId: 'brand-1' } });
    const mutate = sinon.stub();
    Object.assign(controller.recordsService, { restoreRecord: mutate });
    const send = sinon.stub(controller as any, 'sendResp');
    await controller.bulkDeletedRecords({ body: { action: 'restore', items: [{ oid: 'one', entityTag: 'invalid' }] }, user: {}, session: { branding: 'default' } } as any, {} as any);
    expect(mutate.notCalled).to.equal(true);
    expect(send.firstCall.args[2].v1.results).to.deep.equal([{ oid: 'one', status: 'failed', reason: 'invalid-precondition' }]);
  });

  it('rejects malformed bulk input without reading or mutating records', async () => {
    const send = sinon.stub(controller as any, 'sendResp');
    await controller.bulkDeletedRecords({ body: { action: 'destroy', items: [] } } as any, {} as any);
    expect(send.firstCall.args[2].status).to.equal(400);
    expect((controller.recordsService.getDeletedRecordMeta as sinon.SinonStub).notCalled).to.equal(true);
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

  it('uses the record brand for form lookup and scopes form role names to the active brand', async () => {
    const formConfig = { componentDefinitions: [] };
    const clientFormConfig = { componentDefinitions: [{ name: 'title' }] };
    (global as any).sails.config = { reusableFormDefinitions: { shared: {} } };
    (global as any).FormsService.getFormByName.returns(of({ configuration: formConfig }));
    (global as any).FormsService.buildClientFormConfig.returns(clientFormConfig);
    const req = { user: { roles: [
      { name: 'researcher', branding: { id: 'fallback-brand' } },
      { name: 'admin', branding: 'record-brand' },
      { name: 'unscoped-admin' }, { name: '', branding: 'fallback-brand' }, {},
    ] } } as unknown as Sails.Req;
    const record = { metaMetadata: { brandId: 'record-brand' }, metadata: { title: 'A title' } };
    const brand = { id: 'fallback-brand', name: 'fallback' };

    const result = await getEffectiveRelatedClientForm(req, brand as any, record, 'form-1', false, 'edit');

    expect(result).to.equal(clientFormConfig);
    expect((global as any).FormsService.getFormByName.calledWith('form-1', false, 'record-brand')).to.be.true;
    expect(
      (global as any).FormsService.buildClientFormConfig.calledWith(
        formConfig,
        'edit',
        ['researcher'],
        record.metadata,
        { shared: {} },
        'fallback',
        sinon.match.any,
        { user: req.user, brand, record }
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
    (global as any).FormsService.getFormByName.returns(of({ configuration: clientFormConfig }));
    (global as any).FormsService.buildClientFormConfig.returns(clientFormConfig);
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
  class TestTusRecordController extends Controllers.Record {
    public override async checkDiskSpace(root: string) {
      return super.checkDiskSpace(root);
    }

    public getTusServer() {
      this.initTusServer();
      if (!this.tusServer) {
        throw new Error('TUS server was not initialized');
      }
      return this.tusServer;
    }
  }

  let controller: TestTusRecordController;
  let originalSails: any;
  let originalStorageManagerService: any;
  let originalBrandingService: any;
  let originalTranslationService: any;

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
      log: createSinonStubLogger(sinon),
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
    controller = new TestTusRecordController();
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

  it('configures a finite default TUS maximum even when legacy attachment config omits limits', () => {
    expect(new TestTusRecordController().getTusServer().options.maxSize).to.equal(1073741824);
  });

  it('uses record.maxUploadSize for the server and rejects an unbounded chunk configuration', () => {
    sails.config.record.maxUploadSize = 12345;
    expect(new TestTusRecordController().getTusServer().options.maxSize).to.equal(12345);
    sails.config.record.attachments.maxChunkSize = Infinity;
    expect(() => new TestTusRecordController().getTusServer()).to.throw('positive safe integers');
  });

  it('does not require record.attachments.file.directory when using the storage manager datastore', () => {
    (global as any).sails.config.record.attachments.file = undefined;
    (global as any).sails.config.record.attachments.stageDir = undefined;

    expect(() => (controller as any).initTusServer()).to.not.throw();
  });

  it('loads the ESM disk-space checker from the CommonJS controller', async () => {
    const diskSpace = await controller.checkDiskSpace(tmpdir());

    expect(diskSpace.free).to.be.a('number').and.to.be.at.least(0);
    expect(diskSpace.size).to.be.a('number').and.to.be.greaterThan(0);
    expect(diskSpace.diskPath).to.be.a('string');
  });

  it('checks disk space against the staging disk root for filesystem staging uploads', async () => {
    const checkDiskSpaceStub = sinon
      .stub(controller, 'checkDiskSpace')
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
    const checkDiskSpaceStub = sinon
      .stub(controller, 'checkDiskSpace')
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
    const checkDiskSpaceStub = sinon
      .stub(controller, 'checkDiskSpace')
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
