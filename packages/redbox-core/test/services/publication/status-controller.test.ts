import assert from 'node:assert/strict';
import type { Response } from 'express';
import * as sinon from 'sinon';
import { Controllers } from '../../../src/controllers/RecordAuditController';
import type { BuildResponseType } from '../../../src/model';
import { publicationLiveSummaries } from '../../../src/services/publication/status';
import { statusFixture } from '../../fixtures/publication/status';

class StatusController extends Controllers.RecordAudit {
  response?: BuildResponseType;
  protected override sendResp(_req: Sails.Req, res: Sails.Res, response?: BuildResponseType): Response {
    this.response = response;
    return res;
  }
}
describe('Publication status endpoint permissions and filters (PUB-13)', () => {
  const globals = new Map<string, unknown>();
  let controller: StatusController;
  let publication: sinon.SinonStub;
  let audit: sinon.SinonStub;
  let view: sinon.SinonStub;
  let getMeta: sinon.SinonStub;
  const req = (params: Record<string, string> = {}, admin = true): Sails.Req => {
    const request: Partial<Sails.Req> = {
      param: (key: string) => ({ oid: 'record', ...params })[key] ?? '',
      user: { roles: admin ? [{ name: 'Admin', branding: 'brand' }] : [] },
    };
    return request as Sails.Req;
  };
  const res = {} as Sails.Res;
  beforeEach(() => {
    const { state, config } = statusFixture();
    view = sinon.stub().returns(true);
    getMeta = sinon
      .stub()
      .resolves({ redboxOid: 'record', metaMetadata: { brandId: 'brand' }, publicationSource: state });
    publication = sinon.stub().callsFake(async (_brand, _oid, options) => ({
      shared: true,
      integrations: publicationLiveSummaries(state, [], config, options),
      ...(options.includeSignals ? { signals: { activeLeases: 0 } } : {}),
    }));
    audit = sinon.stub().resolves([
      { integrationName: 'doi', status: 'success', startedAt: '', traceId: 'legacy-doi' },
      { integrationName: 'figshare', status: 'success', startedAt: '', traceId: 'legacy-figshare' },
      { integrationName: 'oni', status: 'success', startedAt: '', traceId: 'legacy-oni' },
      { integrationName: 'custom', status: 'success', startedAt: '', traceId: 'custom' },
    ]);
    const values: Record<string, unknown> = {
      sails: { config: { brandingAware: () => ({}) }, services: { recordsservice: { getMeta, hasViewAccess: view } } },
      BrandingService: {
        getBrand: () => ({ id: 'brand', name: 'default' }),
        getDefault: () => ({ id: 'brand', name: 'default' }),
      },
      IntegrationAuditService: {
        getStatusSummaryWithOutcomes: audit,
        getTraceAuditLog: sinon.stub().resolves({ rows: [], total: 0 }),
      },
      PublicationService: { getRecordStatus: publication },
      TranslationService: { t: (key: string) => key },
    };
    for (const [name, value] of Object.entries(values)) {
      globals.set(name, Reflect.get(globalThis, name));
      Reflect.set(globalThis, name, value);
    }
    controller = new StatusController();
    controller.init();
  });
  afterEach(() => {
    for (const [name, value] of globals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name);
      else Reflect.set(globalThis, name, value);
    }
    globals.clear();
  });
  it('returns pending destinations with no audit history, preserving non-publication integrations', async () => {
    await controller.getIntegrationStatusData(req(), res);
    const data = controller.response?.data as {
      integrations: Array<{ integrationName: string; destinationId?: string; status: string }>;
    };
    assert.equal(data.integrations.length, 5);
    assert.deepEqual(
      data.integrations.filter(item => item.integrationName === 'figshare').map(item => item.destinationId),
      ['main', 'second']
    );
    assert.equal(data.integrations.find(item => item.integrationName === 'oni')?.status, 'pending');
    assert.ok(data.integrations.some(item => item.integrationName === 'doi'));
    assert.ok(data.integrations.some(item => item.integrationName === 'custom'));
  });
  it('excludes publication audit history before polling live destination status', async () => {
    await controller.getIntegrationStatusData(req(), res);
    assert.equal(audit.firstCall.args[0].excludeDestinationAudits, true);
    assert.deepEqual([...audit.firstCall.args[0].excludedIntegrationNames].sort(), ['figshare', 'oni']);
  });
  it('checks record brand and view permissions before any status/audit query, including destination selection', async () => {
    getMeta.resolves({ redboxOid: 'record', metaMetadata: { brandId: 'other' } });
    await controller.getIntegrationStatusData(req({ destinationId: 'main' }), res);
    assert.equal(controller.response?.status, 403);
    assert.equal(publication.callCount, 0);
    assert.equal(audit.callCount, 0);
    getMeta.resolves({ redboxOid: 'record', metaMetadata: { brandId: 'brand' } });
    view.returns(false);
    await controller.getIntegrationStatusData(req({ destinationId: 'main' }), res);
    assert.equal(controller.response?.status, 403);
    assert.equal(publication.callCount, 0);
    assert.equal(audit.callCount, 0);
  });
  it('rejects invalid destination IDs and passes exact brand/provider/destination filters', async () => {
    await controller.getIntegrationStatusData(req({ destinationId: '../../other' }), res);
    assert.equal(controller.response?.status, 400);
    assert.equal(publication.callCount, 0);
    audit.resolves([]);
    await controller.getIntegrationStatusData(req({ destinationId: 'second', integrationName: 'figshare' }), res);
    assert.deepEqual(publication.firstCall.args, [
      'brand',
      'record',
      { destinationId: 'second', integrationName: 'figshare', includeSignals: true },
    ]);
    assert.equal(audit.firstCall.args[0].brandId, 'brand');
    assert.equal(audit.firstCall.args[0].destinationId, 'second');
    const data = controller.response?.data as { integrations: Array<{ destinationId: string }> };
    assert.deepEqual(
      data.integrations.map(item => item.destinationId),
      ['second']
    );
  });
  it('shows safe status to record viewers and reserves operational signals for the brand admin', async () => {
    await controller.getIntegrationStatusData(req({}, false), res);
    assert.equal(publication.firstCall.args[2].includeSignals, false);
    assert.ok(!Object.hasOwn(controller.response?.data ?? {}, 'operationalSignals'));
    await controller.getIntegrationStatusData(req(), res);
    assert.ok(Object.hasOwn(controller.response?.data ?? {}, 'operationalSignals'));
  });
  it('enforces brand and record-view permission for destination audit history even for admins', async () => {
    getMeta.resolves({ redboxOid: 'record', metaMetadata: { brandId: 'other' } });
    await controller.getIntegrationAuditData(req({ destinationId: 'main' }), res);
    assert.equal(controller.response?.status, 403);
    getMeta.resolves({ redboxOid: 'record', metaMetadata: { brandId: 'brand' } });
    view.returns(false);
    await controller.getIntegrationAuditData(req({ destinationId: 'main' }), res);
    assert.equal(controller.response?.status, 403);
  });
});
