import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers } from '../../src/controllers/RecordAuditController';

describe('RecordAuditController', () => {
  let controller: Controllers.RecordAudit;
  let originalSails: any;
  let originalBrandingService: any;
  let originalFormsService: any;
  let originalFormRecordConsistencyService: any;
  let originalIntegrationAuditService: any;
  let originalTranslationService: any;
  let originalUnderscore: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalFormsService = (global as any).FormsService;
    originalFormRecordConsistencyService = (global as any).FormRecordConsistencyService;
    originalIntegrationAuditService = (global as any).IntegrationAuditService;
    originalTranslationService = (global as any).TranslationService;
    originalUnderscore = (global as any)._;

    (global as any).sails = {
      log: {
        verbose: sinon.stub(),
        error: sinon.stub(),
      },
      services: {
        recordsservice: {
          getMeta: sinon.stub().resolves({
            redboxOid: 'oid-1',
            metaMetadata: { form: 'rdmp-form', brandId: 'brand-1' },
            metadata: { contributors: [{ name: 'New Name' }] },
          }),
          hasViewAccess: sinon.stub().returns(true),
          getRecordAudit: sinon.stub().resolves([
            {
              id: 'audit-1',
              redboxOid: 'oid-1',
              action: 'created',
              createdAt: '2026-03-01T00:00:00Z',
              record: { workflow: { stageLabel: 'Draft' }, metadata: { contributors: [{ name: 'Old Name' }] } },
              user: {},
            },
            {
              id: 'audit-2',
              redboxOid: 'oid-1',
              action: 'updated',
              createdAt: '2026-03-02T00:00:00Z',
              record: { workflow: { stageLabel: 'Review' }, metadata: { contributors: [{ name: 'New Name' }] } },
              user: { username: 'editor', name: 'Editor', email: 'editor@example.com' },
            },
          ]),
          getResolvedPermissionsSummary: sinon.stub().resolves({
            edit: [{ username: 'editor', name: 'Editor', email: 'editor@example.com' }],
            view: [],
            editPending: [],
            viewPending: [],
            editRoles: ['Admin'],
            viewRoles: ['Researcher'],
          }),
        },
      },
    };
    (global as any)._ = require('lodash');
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getDefault: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any).FormsService = {
      getFormByName: sinon.stub().returns(of({
        configuration: [
          {
            name: 'contributors',
            component: { config: { label: 'Contributors' } },
            children: [
              { name: 'name', component: { config: { label: 'Contributor Name' } } },
            ],
          },
        ],
      })),
    };
    (global as any).FormRecordConsistencyService = {
      compareRecords: sinon.stub().returns([
        {
          kind: 'change',
          path: ['metadata', 'contributors', 0, 'name'],
          original: 'Old Name',
          changed: 'New Name',
        },
      ]),
    };
    (global as any).IntegrationAuditService = {
      getTraceAuditLog: sinon.stub().resolves({
        total: 1,
        rows: [{
          id: 'trace-1',
          traceId: 'trace-1',
          startedAt: '2026-03-03T00:00:00Z',
          completedAt: '2026-03-03T00:01:00Z',
          durationMs: 60000,
          status: 'success',
          actions: ['publish'],
          eventCount: 1,
          events: [{ id: 'integration-1', redboxOid: 'oid-1', startedAt: '2026-03-03T00:00:00Z', status: 'success', integrationAction: 'publish', traceId: 'trace-1', spanId: 'span-1', depth: 0, hasChildren: false }],
        }],
      }),
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key: string) => key),
    };

    controller = new Controllers.RecordAudit();
    controller.init();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any).FormsService = originalFormsService;
    (global as any).FormRecordConsistencyService = originalFormRecordConsistencyService;
    (global as any).IntegrationAuditService = originalIntegrationAuditService;
    (global as any).TranslationService = originalTranslationService;
    (global as any)._ = originalUnderscore;
  });

  it('returns 400 from render when oid is missing', async () => {
    const req = { param: sinon.stub().returns(''), options: { locals: {} }, session: { branding: 'default' } } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.render(req, res);

    assert.equal(sendResp.calledOnce, true);
    assert.equal(sendResp.firstCall.args[2]?.status, 400);
  });

  it('renders the host view for users with view access', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    const req = {
      param,
      options: { locals: { branding: 'default', portal: 'rdmp' } },
      session: { branding: 'default' },
      user: { roles: [{ name: 'Admin', branding: { id: 'brand-1' } }] },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendView = sinon.stub(controller as any, 'sendView');

    await controller.render(req, res);

    assert.equal(sendView.calledOnce, true);
    assert.equal((req as any).options.locals.oid, 'oid-1');
    assert.equal((req as any).options.locals.appName, 'record-audit');
    assert.equal((req as any).options.locals.isAdmin, true);
  });

  it('returns audit rows with diff metadata and wrapper data', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    param.withArgs('branding').returns('default');
    param.withArgs('portal').returns('rdmp');
    const req = {
      param,
      options: { locals: {} },
      session: { branding: 'default', portal: 'rdmp' },
      user: { roles: [] },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getAuditData(req, res);

    assert.equal(sendResp.calledOnce, true);
    const payload = sendResp.firstCall.args[2];
    assert.equal(payload?.data?.summary?.returnedCount, 2);
    assert.equal(payload?.data?.rawAuditUrl, '/default/rdmp/api/records/audit/oid-1');
    assert.equal(payload?.data?.records?.[0]?.actionLabelKey, '@record-audit-action-updated');
    assert.equal(payload?.data?.records?.[0]?.changeSummary?.changes?.[0]?.displayName, 'Contributor Name');
    assert.equal(payload?.data?.records?.[0]?.actor?.displayName, 'Editor');
    assert.equal(payload?.data?.records?.[1]?.changeSummary?.note, '@record-audit-note-update-only');
  });

  it('falls back to safe route segments when building the raw audit url', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    param.withArgs('branding').returns('../bad-brand');
    param.withArgs('portal').returns('rdmp');
    const req = {
      param,
      options: { locals: { branding: 'default' } },
      session: { branding: 'default', portal: 'rdmp' },
      user: { roles: [] },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getAuditData(req, res);

    assert.equal(sendResp.firstCall.args[2]?.data?.rawAuditUrl, '/default/rdmp/api/records/audit/oid-1');
  });

  it('blocks admin-only data for non-admin users', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    const req = {
      param,
      options: { locals: {} },
      session: { branding: 'default' },
      user: { roles: [{ name: 'Researcher', branding: { id: 'brand-1' } }] },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getPermissionsData(req, res);

    assert.equal(sendResp.calledOnce, true);
    assert.equal(sendResp.firstCall.args[2]?.status, 403);
  });

  it('returns paginated integration audit data for admins', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    param.withArgs('page').returns('2');
    param.withArgs('pageSize').returns('10');
    param.withArgs('status').returns('success');
    const req = {
      param,
      options: { locals: {} },
      session: { branding: 'default' },
      user: { roles: [{ name: 'Admin', branding: { id: 'brand-1' } }] },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getIntegrationAuditData(req, res);

    assert.equal((global as any).IntegrationAuditService.getTraceAuditLog.calledOnce, true);
    assert.equal(sendResp.firstCall.args[2]?.data?.summary?.page, 2);
    assert.equal(sendResp.firstCall.args[2]?.data?.summary?.pageSize, 10);
  });

  it('preserves the fallback integration audit id when a row id is missing', async () => {
    (global as any).IntegrationAuditService.getTraceAuditLog.resolves({
      total: 1,
      rows: [{
        id: undefined,
        traceId: 'trace-1',
        startedAt: '2026-03-03T00:00:00Z',
        status: 'success',
        actions: ['publish'],
        eventCount: 1,
        events: [{ id: undefined, redboxOid: 'oid-1', startedAt: '2026-03-03T00:00:00Z', status: 'success', integrationAction: 'publish', traceId: 'trace-1', spanId: 'span-1', depth: 0, hasChildren: false }],
      }],
    });

    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    param.withArgs('page').returns('2');
    param.withArgs('pageSize').returns('10');
    param.withArgs('status').returns('success');
    const req = {
      param,
      options: { locals: {} },
      session: { branding: 'default' },
      user: { roles: [{ name: 'Admin', branding: { id: 'brand-1' } }] },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getIntegrationAuditData(req, res);

    assert.equal(sendResp.firstCall.args[2]?.data?.records?.[0]?.id, 'trace-1');
    assert.equal(sendResp.firstCall.args[2]?.data?.records?.[0]?.events?.[0]?.id, 'trace-1:event:0');
  });

  it('rejects invalid integration audit statuses', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    param.withArgs('page').returns('1');
    param.withArgs('pageSize').returns('10');
    param.withArgs('status').returns('invalid-status');
    const req = {
      param,
      options: { locals: {} },
      session: { branding: 'default' },
      user: { roles: [{ name: 'Admin', branding: { id: 'brand-1' } }] },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getIntegrationAuditData(req, res);

    assert.equal((global as any).IntegrationAuditService.getTraceAuditLog.called, false);
    assert.deepEqual(sendResp.firstCall.args[2], {
      status: 400,
      displayErrors: [{ detail: 'Invalid integration audit status.' }],
    });
  });
});
