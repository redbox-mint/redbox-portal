import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import nodemailer = require('nodemailer');
import { Services as Email } from '../../src/integrations/Email';
import { executeNamedQueryRoute } from '../../src/api-routes/groups/reports';
import { sendNotificationRoute } from '../../src/api-routes/groups/notifications';
import { validateApiRouteRequest } from '../../src/api-routes/validation';
import { buildOpenApiDocument } from '../../src/api-routes/openapi';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountQueryReadRoutes } from '../../src/http/express/queryReads';
import { mountIntegrationOperationRoutes } from '../../src/http/express/integrationOperations';
import { createSinonStubLogger } from '../logger.test';

describe('Named query and notification parameters through owned HTTP', () => {
  afterEach(() => {
    sinon.restore();
  });
  it('preserves configured query keys through validation and query execution', async () => {
    const query = {
      queryName: 'listRDMPProjectWithEndingDate',
      projectEndDateStart: '2026-10-21',
      projectEndDateDays: '30',
      start: '0',
      rows: '100',
    };
    const config = { queryParams: { projectEndDateStart: {}, projectEndDateDays: {} } };
    const perform = sinon.stub().resolves({ records: [] });
    const f = await httpRouteFixture((router, input) =>
      mountQueryReadRoutes(router, {
        ...input,
        queries: { getNamedQueryConfig: sinon.stub().resolves(config), performNamedQueryFromConfig: perform },
      } as any)
    );
    try {
      const validated = validateApiRouteRequest({ query }, executeNamedQueryRoute);
      assert(validated.valid);
      assert.deepEqual(validated.query, query);
      const response = await f.request('/default/portal/api/report/namedQuery?' + new URLSearchParams(query));
      assert.equal(response.status, 200);
      assert.equal(perform.calledOnce, true);
      assert.deepEqual(perform.firstCall.args.slice(0, 2), [config, query]);
      assert.equal(perform.firstCall.args[2].id, f.brand.id);
      assert.deepEqual(perform.firstCall.args.slice(3), [0, 100]);
    } finally {
      await f.close();
    }
  });
  it('documents pagination and configured query parameters in OpenAPI', () => {
    const document = buildOpenApiDocument([executeNamedQueryRoute], { title: 'Reports', version: '1.0.0' });
    const operation = document.paths['/{branding}/{portal}/api/report/namedQuery'].get;
    assert.match(operation.description, /queryParams/);
    assert(Array.isArray(operation.parameters));
  });
  async function notification(body: Record<string, unknown>, defaults: Record<string, unknown> = {}, version = '1.0') {
    const sendMail = sinon.stub().resolves({ messageId: 'fixture-id' });
    sinon.stub(nodemailer, 'createTransport').returns({ sendMail } as any);
    const email = new Email.Email({
      config: {
        defaults: { subject: 'Subject', from: 'from@example.com', format: 'text', otherSendOptions: defaults },
        settings: { enabled: true, serverOptions: {} },
      } as any,
      log: createSinonStubLogger(sinon),
      templateContext: {},
      resolveHook: () => {
        throw new Error('No hook');
      },
      retainFollowup: () => {},
    });
    sinon
      .stub(email, 'evaluateProperties')
      .returns({
        toRendered: 'to@example.com',
        subjectRendered: 'Subject',
        fromRendered: 'from@example.com',
        formatRendered: 'text',
        ccRendered: '',
        bccRendered: '',
        templateRendered: of({ status: 200, body: 'Body' }),
      } as any);
    const send = sinon.spy(email, 'sendMessage');
    const f = await httpRouteFixture((router, input) =>
      mountIntegrationOperationRoutes(router, { ...input, email, audit: async () => {} } as any)
    );
    try {
      const response = await f.request('/default/portal/api/sendNotification', {
        method: 'POST',
        body,
        headers: { 'x-redbox-api-version': version },
      });
      assert.equal(response.status, 200);
      assert.equal(sendMail.calledOnce, true);
      return { sendMail, send };
    } finally {
      await f.close();
    }
  }
  for (const version of ['1.0', '2.0']) {
    it(`forwards only public replyTo in API ${version}`, async () => {
      const body = {
        to: 'to@example.com',
        template: 'test',
        otherSendOptions: {
          replyTo: 'staffsupport-lib@uwa.edu.au',
          attachments: [{ path: '/etc/passwd' }],
          headers: { 'X-Test': 'unsafe' },
          to: 'attacker@example.com',
          subject: 'override',
        },
      };
      const validated = validateApiRouteRequest({ body }, sendNotificationRoute);
      assert(validated.valid);
      assert.deepEqual(Reflect.get(Object(validated.body), 'otherSendOptions'), {
        replyTo: 'staffsupport-lib@uwa.edu.au',
      });
      const { send, sendMail } = await notification(body, {}, version);
      assert.deepEqual(send.firstCall.args, [
        'to@example.com',
        'Body',
        'Subject',
        'from@example.com',
        'text',
        '',
        '',
        { replyTo: 'staffsupport-lib@uwa.edu.au' },
      ]);
      assert.deepEqual(sendMail.firstCall.args[0], {
        to: 'to@example.com',
        text: 'Body',
        subject: 'Subject',
        from: 'from@example.com',
        cc: '',
        bcc: '',
        replyTo: 'staffsupport-lib@uwa.edu.au',
      });
    });
  }
  it('layers public replyTo over trusted default send options', async () => {
    const { sendMail } = await notification(
      { to: 'to@example.com', template: 'test', otherSendOptions: { replyTo: 'staffsupport-lib@uwa.edu.au' } },
      { replyTo: 'default@example.com', headers: { 'X-Default': 'yes' } }
    );
    assert.equal(sendMail.firstCall.args[0].replyTo, 'staffsupport-lib@uwa.edu.au');
    assert.deepEqual(sendMail.firstCall.args[0].headers, { 'X-Default': 'yes' });
  });
  it('retains service defaults when public replyTo is omitted', async () => {
    const { send, sendMail } = await notification(
      { to: 'to@example.com', template: 'test', otherSendOptions: { headers: {} } },
      { replyTo: 'default@example.com', headers: { 'X-Default': 'yes' } }
    );
    assert.equal(send.firstCall.args[7], undefined);
    assert.equal(sendMail.firstCall.args[0].replyTo, 'default@example.com');
    assert.deepEqual(sendMail.firstCall.args[0].headers, { 'X-Default': 'yes' });
  });
  it('rejects non-string replyTo before delivery', () => {
    assert.equal(
      validateApiRouteRequest(
        { body: { to: 'to@example.com', template: 'test', otherSendOptions: { replyTo: { path: '/etc/passwd' } } } },
        sendNotificationRoute
      ).valid,
      false
    );
  });
});
