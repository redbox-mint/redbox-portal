import * as sinon from 'sinon';
import { Controllers } from '../../../src/controllers/webservice/IntegrationAuditController';
import { allowedResource, asScopeKey, deniedResource, type AuthorizationDecision } from '../../../src/authorization';

let expect: Chai.ExpectStatic;

describe('Webservice IntegrationAuditController', () => {
  let controller: Controllers.IntegrationAudit;
  let originalSails: any;
  let originalIntegrationAuditService: any;
  let originalRecordsService: any;
  let originalLodash: any;

  before(async () => {
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalIntegrationAuditService = (global as any).IntegrationAuditService;
    originalRecordsService = (global as any).RecordsService;
    originalLodash = (global as any)._;

    (global as any).sails = {
      log: {
        error: sinon.stub(),
        verbose: sinon.stub(),
      },
    };
    (global as any).IntegrationAuditService = {
      getAuditLog: sinon.stub().resolves({ rows: [{ redboxOid: 'oid-1', status: 'success' }], total: 11 }),
    };
    const authorizationDecision: AuthorizationDecision = {
      allowed: true,
      reasonCode: 'allowed',
      requiredScope: asScopeKey('integration.audit.read'),
      brandId: 'brand-1',
    };
    (global as any).RecordsService = {
      getAuthorizedMeta: sinon.stub().resolves(
        allowedResource(authorizationDecision, {
          redboxOid: 'oid-1',
          metaMetadata: { brandId: 'brand-1' },
        })
      ),
    };
    (global as any)._ = require('lodash');

    controller = new Controllers.IntegrationAudit();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).IntegrationAuditService = originalIntegrationAuditService;
    (global as any).RecordsService = originalRecordsService;
    (global as any)._ = originalLodash;
  });

  it('returns paginated audit data', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    param.withArgs('status').returns('success');
    param.withArgs('dateFrom').returns('2025-01-01T00:00:00Z');
    param.withArgs('dateTo').returns('2025-01-02T00:00:00Z');
    param.withArgs('page').returns('2');
    param.withArgs('pageSize').returns('5');
    const req = {
      param,
      resourceAuthorization: {
        context: {},
        requiredScope: asScopeKey('integration.audit.read'),
        routeId: 'integration-audit',
      },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getAuditLog(req, res);

    expect((global as any).IntegrationAuditService.getAuditLog.calledOnce).to.be.true;
    expect((global as any).IntegrationAuditService.getAuditLog.firstCall.args[0]).to.include({
      oid: 'oid-1',
      status: 'success',
      page: 2,
      pageSize: 5,
    });
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data?.summary?.page).to.equal(2);
    expect(sendRespStub.firstCall.args[2]?.data?.summary?.numFound).to.equal(11);
    expect(sendRespStub.firstCall.args[2]?.data?.records).to.deep.equal([{ redboxOid: 'oid-1', status: 'success' }]);
    expect(
      (global as any).RecordsService.getAuthorizedMeta.calledOnceWith(
        sinon.match.object,
        asScopeKey('integration.audit.read'),
        'oid-1',
        'read'
      )
    ).to.be.true;
  });

  it('returns the same opaque denial before reading audit data for missing and cross-brand records', async () => {
    const deniedDecision: AuthorizationDecision = {
      allowed: false,
      reasonCode: 'resource-brand-mismatch',
      requiredScope: asScopeKey('record.read'),
      brandId: 'brand-1',
    };
    (global as any).RecordsService.getAuthorizedMeta.resolves(deniedResource(deniedDecision));
    const param = sinon.stub();
    param.withArgs('oid').returns('foreign-oid');
    const req = {
      param,
      resourceAuthorization: {
        context: {},
        requiredScope: asScopeKey('integration.audit.read'),
        routeId: 'integration-audit',
      },
    } as unknown as Sails.Req;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getAuditLog(req, {} as Sails.Res);

    expect((global as any).IntegrationAuditService.getAuditLog.called).to.be.false;
    expect(sendRespStub.firstCall.args[2]?.errors?.[0]).to.include({ status: 404 });
  });

  it('returns 400 for invalid status parameters', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    param.withArgs('status').returns('not-valid');
    const req = { param } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getAuditLog(req, res);

    expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    expect((global as any).IntegrationAuditService.getAuditLog.called).to.be.false;
  });

  it('returns 400 for invalid date parameters', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    param.withArgs('dateFrom').returns('not-a-date');
    const req = { param } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getAuditLog(req, res);

    expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    expect((global as any).IntegrationAuditService.getAuditLog.called).to.be.false;
  });

  it('returns 400 for invalid page parameters', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    param.withArgs('page').returns('0');
    const req = { param } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getAuditLog(req, res);

    expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
  });
});
