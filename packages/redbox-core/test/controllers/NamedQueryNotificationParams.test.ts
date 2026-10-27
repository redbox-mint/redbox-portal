import { expect } from 'chai';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers as EmailControllers } from '../../src/controllers/EmailController';
import { Controllers as ReportControllers } from '../../src/controllers/webservice/ReportController';
import { executeNamedQueryRoute } from '../../src/api-routes/groups/reports';
import { sendNotificationRoute } from '../../src/api-routes/groups/notifications';
import { validateApiRouteRequest } from '../../src/api-routes/validation';
import { buildOpenApiDocument } from '../../src/api-routes/openapi';
import { createMockSails } from '../services/testHelper';

class TestEmail extends EmailControllers.Email {
  public override sendResp = sinon.stub();
  public override updateChronicle = sinon.stub();
}

class TestReport extends ReportControllers.Report {
  public override sendResp = sinon.stub();
  public override updateChronicle = sinon.stub();
}

describe('Named query and notification request parameters', function () {
  const names = ['sails', 'BrandingService', 'NamedQueryService'];
  let originals: unknown[];

  beforeEach(function () {
    originals = names.map(name => Reflect.get(globalThis, name));
    Reflect.set(globalThis, 'sails', createMockSails());
  });

  afterEach(function () {
    sinon.restore();
    names.forEach((name, index) => Reflect.set(globalThis, name, originals[index]));
  });

  it('preserves configured query keys through validation and the report controller', async function () {
    const query = {
      queryName: 'listRDMPProjectWithEndingDate',
      projectEndDateStart: '2026-10-21',
      projectEndDateDays: '30',
      start: '0',
      rows: '100',
    };
    const req = { query, session: { branding: 'default' } } as unknown as Sails.Req;
    const validated = validateApiRouteRequest(req, executeNamedQueryRoute);
    expect(validated.valid).to.equal(true);
    if (!validated.valid) throw new Error('Invalid query');
    expect(validated.query).to.deep.equal(query);
    req.apiRequest = validated;
    const brand = { id: 'brand-1' };
    const config = { queryParams: { projectEndDateStart: {}, projectEndDateDays: {} } };
    const perform = sinon.stub().resolves({ records: [] });
    Reflect.set(globalThis, 'BrandingService', { getBrand: () => brand });
    Reflect.set(globalThis, 'NamedQueryService', {
      getNamedQueryConfig: sinon.stub().resolves(config),
      performNamedQueryFromConfig: perform,
    });
    const controller = new TestReport();
    await controller.executeNamedQuery(req, {} as Sails.Res);
    expect(perform.calledOnceWithExactly(config, query, brand, 0, 100)).to.equal(true);
    expect(controller.sendResp.firstCall.args[2].status).to.equal(200);
  });

  it('documents named query pagination and configured parameters in OpenAPI', function () {
    const document = buildOpenApiDocument([executeNamedQueryRoute], { title: 'Reports', version: '1.0.0' });
    const operation = document.paths['/{branding}/{portal}/api/report/namedQuery'].get;
    expect(operation).to.have.property('description').that.contains('queryParams');
    expect(operation).to.have.property('parameters').that.is.an('array');
  });

  function sendNotification(body: Record<string, unknown>, validate = true) {
    const sendMessage = sinon.stub().returns(of({ success: true, msg: 'sent' }));
    sails.services.emailservice = {
      evaluateProperties: () => ({
        toRendered: 'to@example.com',
        subjectRendered: 'Subject',
        fromRendered: 'from@example.com',
        formatRendered: 'text',
        ccRendered: '',
        bccRendered: '',
        templateRendered: of({ status: 200, body: 'Body' }),
      }),
      sendMessage,
    };
    // Email templates resolve the tenant from the route-resolved brand, never the body.
    Reflect.set(globalThis, 'BrandingService', { getBrand: () => ({ id: 'brand-1' }) });
    const req = { body, options: { locals: { branding: 'default' } } } as unknown as Sails.Req;
    const validated = validateApiRouteRequest(req, sendNotificationRoute);
    expect(validated.valid).to.equal(true);
    if (!validated.valid) throw new Error('Invalid notification');
    req.apiRequest = validate ? validated : { params: {}, query: {}, body, files: {} };
    const controller = new TestEmail();
    controller.init();
    controller.sendNotification(req, {} as Sails.Res);
    expect(controller.sendResp.firstCall.args[2].status).to.equal(200);
    return { validated, sendMessage };
  }

  for (const validate of [true, false]) {
    it(`forwards only replyTo ${validate ? 'through route validation' : 'for in-process callers'}`, function () {
      const { sendMessage, validated } = sendNotification(
        {
          to: 'to@example.com',
          template: 'test',
          otherSendOptions: {
            replyTo: 'staffsupport-lib@uwa.edu.au',
            attachments: [{ path: '/etc/passwd' }],
            headers: { 'X-Test': 'unsafe' },
            to: 'attacker@example.com',
            subject: 'override',
          },
        },
        validate
      );
      if (validate)
        expect(validated.body).to.have.property('otherSendOptions').that.deep.equals({
          replyTo: 'staffsupport-lib@uwa.edu.au',
        });
      expect(sendMessage.firstCall.args).to.deep.equal([
        'to@example.com',
        'Body',
        'Subject',
        'from@example.com',
        'text',
        '',
        '',
        { replyTo: 'staffsupport-lib@uwa.edu.au' },
      ]);
    });
  }

  it('layers replyTo over configured default send options', function () {
    sails.config.emailnotification = {
      defaults: { otherSendOptions: { replyTo: 'default@example.com', headers: { 'X-Default': 'yes' } } },
    };
    const { sendMessage } = sendNotification({
      to: 'to@example.com',
      template: 'test',
      otherSendOptions: { replyTo: 'staffsupport-lib@uwa.edu.au' },
    });
    expect(sendMessage.firstCall.args[7]).to.deep.equal({
      replyTo: 'staffsupport-lib@uwa.edu.au',
      headers: { 'X-Default': 'yes' },
    });
  });

  it('retains service defaults when replyTo is omitted', function () {
    const { sendMessage } = sendNotification({
      to: 'to@example.com',
      template: 'test',
      otherSendOptions: { headers: {} },
    });
    expect(sendMessage.firstCall.args[7]).to.equal(undefined);
  });

  it('rejects non-string replyTo values', function () {
    const req = {
      body: { to: 'to@example.com', template: 'test', otherSendOptions: { replyTo: { path: '/etc/passwd' } } },
    } as unknown as Sails.Req;
    expect(validateApiRouteRequest(req, sendNotificationRoute).valid).to.equal(false);
  });
});
