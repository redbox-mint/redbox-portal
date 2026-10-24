import { RequestChronicleHelper } from '../../../packages/redbox-core/src/utilities/RequestChronicle';
const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
import { csrf } from '../../helpers/csrf';
import { StreamingMultipart } from '../../../packages/redbox-core/src/http/express/multipart';
import type { RequestHandler } from 'express';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { inspect } from 'node:util';
import { firstValueFrom } from 'rxjs';
import supertest from 'supertest';
import { Services } from '@researchdatabox/redbox-core';

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';
type CapturedLog = { level: LogLevel; args: unknown[] };
type ChronicleEvent = {
  requestId?: string;
  req?: { path?: string; method?: string };
  res?: { statusCode?: number; completed?: boolean };
  result?: { outcome?: string; classification?: string; severity?: string };
  errors?: Record<string, { message?: string }>;
  [key: string]: unknown;
};

class WarningService extends Services.Core.Service {
  public recordWarning(): void {
    this.updateChronicle({ serviceWarning: 'retained' }, [], 'warn');
  }

  public recordUploadFailure(fileCount: number, error: Error): void {
    this.updateChronicle({ serviceUploadFileCount: fileCount, serviceUploadOutcome: 'failed' }, [error]);
  }
}

class UploadHandler {
  public recordFailure(req: import('express').Request, error: Error): void {
    const helper = RequestChronicleHelper.fromReq(fixture.log, req);
    helper.addInfo({ controllerUploadOutcome: 'failed' });
    helper.addError(error);
  }
}

/**
 * Checks the selected host middleware, policies and async service capture over real HTTP.
 */
describe('Request chronicle in the application HTTP host', function () {
  this.timeout(60_000);

  const virtualPath = '/request-chronicle-virtual-test';
  const translationFailurePath = '/default/rdmp/app/i18n/bundles/en/translation';
  const servicePaths = ['/request-chronicle-service-first', '/request-chronicle-service-second'];
  const warningPath = '/request-chronicle-service-warning';
  const uploadPath = '/request-chronicle-service-upload';
  const rdmpPath = '/request-chronicle-rdmp-privacy';
  const levels: LogLevel[] = ['error', 'warn', 'info', 'debug', 'verbose'];
  let captured: CapturedLog[] = [];
  let originalLog: Partial<Record<LogLevel, (...args: unknown[]) => void>> = {};
  let originalSettings: unknown;
  let anonymous: supertest.Agent;
  let admin: supertest.Agent;
  let multipart: StreamingMultipart;
  let markUploadStarted: () => void = () => {};

  before(async () => {
    const app = fixture.server;
    const router = fixture.routes;
    for (const [index, servicePath] of servicePaths.entries()) {
      router.bind(servicePath, async (_req, res) => {
        await new Promise(resolve => setTimeout(resolve, index === 0 ? 20 : 1));
        const result = await fixture.services.EmailService.buildFromTemplateAsync(`missing-service-template-${index}`, {
          subject: 'PRIVATE SUBJECT',
          body: 'PRIVATE BODY',
        });
        // Keep the legacy HTTP 200 failure contract and let the service error retain the event.
        return res.json({ status: result.status });
      });
    }
    const warningService = new WarningService(fixture.log);
    const uploadController = new UploadHandler();
    multipart = new StreamingMultipart(fixture.services.StorageManagerService.stagingDisk(), {
      files: 1,
      fileSize: 2 * 1024 * 1024,
      fields: 2,
      fieldSize: 1024,
    });
    router.bind(warningPath, (_req, res) => {
      warningService.recordWarning();
      res.json({ status: true });
    });
    router.bind(uploadPath, async (req, res) => {
      const work = multipart.receive(req, async ({ files }) => {
        const error = new Error('upload service failed');
        warningService.recordUploadFailure(files.length, error);
        uploadController.recordFailure(req, error);
        res.json({ uploaded: files.length, parserFailed: false });
      });
      markUploadStarted();
      await work;
    });
    router.bind(rdmpPath, async (req, res) => {
      const record = { metaMetadata: { createdBy: 'admin' }, metadata: { description: 'PRIVATE RDMP DESCRIPTION' } };
      const user = { username: 'admin', token: 'PRIVATE STORED TOKEN HASH' };
      if (req.query.failure === 'true') {
        try {
          await firstValueFrom(
            fixture.services.RDMPService.runTemplates(
              'privacy-rdmp',
              record,
              {
                templates: [
                  {
                    field: 'metadata.copied',
                    template: () => {
                      throw new Error('PRIVATE TEMPLATE FAILURE');
                    },
                  },
                ],
              },
              user
            )
          );
        } catch (error) {
          return res.status(500).end();
        }
      }
      const options = { templates: [{ field: 'metadata.copied', template: '<%= record.metadata.description %>' }] };
      await firstValueFrom(fixture.services.RDMPService.runTemplates('privacy-rdmp', record, options, user));
      await firstValueFrom(fixture.services.RDMPService.assignPermissions('privacy-rdmp', record, {}, user));
      await firstValueFrom(fixture.services.RDMPService.complexAssignPermissions('privacy-rdmp', record, {}));
      res.json({ status: true });
    });
    anonymous = supertest.agent(app);
    admin = supertest.agent(app);
    const loginCsrf = await csrf(admin);
    await admin
      .post('/user/login_local')
      .set('X-CSRF-Token', loginCsrf)
      .set('X-Source', 'jsclient')
      .send({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' })
      .expect(200);

    const logConfig = fixture.config.log as { requestChronicle?: unknown };
    originalSettings = logConfig.requestChronicle;
    // Retain every request, so each request produces an event.
    logConfig.requestChronicle = { successSampleRate: 1, successSampleExcludePattern: '' };

    const log = fixture.log as unknown as Record<LogLevel, (...args: unknown[]) => void>;
    for (const level of levels) {
      const original = log[level];
      originalLog[level] = original;
      log[level] = (...args: unknown[]) => {
        captured.push({ level, args });
        return original.apply(fixture.log, args);
      };
    }
  });

  after(async () => {
    fixture.routes.unbind(virtualPath);
    fixture.routes.unbind(translationFailurePath);
    fixture.routes.unbind(warningPath);
    fixture.routes.unbind(uploadPath);
    fixture.routes.unbind(rdmpPath);
    await multipart?.close();
    for (const servicePath of servicePaths) {
      fixture.routes.unbind(servicePath);
    }
    (fixture.config.log as { requestChronicle?: unknown }).requestChronicle = originalSettings;
    const log = fixture.log as unknown as Record<LogLevel, (...args: unknown[]) => void>;
    for (const level of levels) {
      if (originalLog[level]) {
        log[level] = originalLog[level]!;
      }
    }
    originalLog = {};
  });

  beforeEach(() => {
    captured = [];
  });

  async function settle(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  function events(path: string): { level: LogLevel; event: ChronicleEvent }[] {
    return captured
      .filter(item => item.args[1] === 'Request chronicle')
      .map(item => ({ level: item.level, event: item.args[0] as ChronicleEvent }))
      .filter(item => item.event.req?.path === path);
  }

  function chronicleWarnings(): CapturedLog[] {
    return captured.filter(
      item => item.level === 'warn' && JSON.stringify(item.args).includes('Request Chronicle Helper')
    );
  }

  it('logs one event for a controller route behind policies, with the controller details', async () => {
    const path = '/default/rdmp/user/info';
    await admin.get(path).set('X-Source', 'jsclient').expect(200);
    await settle();

    const logged = events(path);
    assert.equal(logged.length, 1);
    const { event, level } = logged[0];
    assert.equal(level, 'info');
    assert.equal(event.res?.statusCode, 200);
    assert.equal(event.result?.outcome, 'success');
    assert.equal(typeof event.requestId, 'string');
    assert.equal(event.userInfoSuccess, true);
    assert.equal(event.userUsername, 'admin');
    assert.deepEqual(chronicleWarnings(), []);
  });

  it('logs an unmatched route as a client error, not at error level', async () => {
    const path = '/default/rdmp/request-chronicle-missing-page';
    await anonymous.get(path).expect(404);
    await settle();

    const logged = events(path);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].level, 'info');
    assert.equal(logged[0].event.result?.outcome, 'failure');
    assert.equal(logged[0].event.result?.classification, 'client-error');
  });

  it('keeps the profile update failure response contract', async () => {
    const path = '/default/rdmp/user/update';
    const response = await admin
      .post(path)
      .set('X-CSRF-Token', await csrf(admin))
      .set('X-Source', 'jsclient')
      .send({ details: { email: 'admin@example.edu.au' } })
      .expect(200);
    await settle();

    assert.deepEqual(response.body, { status: false, message: 'Error: name must not be null' });
    const logged = events(path);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].event.userDetailsUpdateSuccess, false);
  });

  it('records malformed JSON errors without exposing the body in any log', async () => {
    const path = '/default/rdmp/user/update';
    const response = await admin
      .post(path)
      .set('X-CSRF-Token', await csrf(admin))
      .set('X-Source', 'jsclient')
      .set('Content-Type', 'application/json')
      .send('{"password":"PRIVATE MALFORMED PASSWORD",')
      .expect(400);
    await settle();

    const logged = events(path);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].event.res?.statusCode, response.status);
    assert.equal(Object.values(logged[0].event.errors ?? {}).length, 1);
    assert.ok(!inspect(captured, { depth: null }).includes('PRIVATE MALFORMED PASSWORD'));
  });

  it('keeps safe RDMP summaries while excluding records and token hashes from every log level', async () => {
    await anonymous.get(rdmpPath).expect(200);
    await settle();
    const logged = events(rdmpPath);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].event.rdmpTemplateOid, 'privacy-rdmp');
    assert.equal(logged[0].event.rdmpTemplateCount, 1);
    assert.equal(logged[0].event.rdmpTemplateOutcome, 'success');
    assert.equal(logged[0].event.rdmpPermissionOid, 'privacy-rdmp');
    assert.ok(!inspect(captured, { depth: null }).includes('PRIVATE'));
  });

  it('excludes preview tokens from policy logs as well as the request chronicle', async () => {
    const token = 'PRIVATE-PREVIEW-TOKEN';
    await admin.get(`/default/rdmp/preview/${token}.css`);
    await settle();
    const logged = events('/default/rdmp/preview/REDACTED.css');
    assert.equal(logged.length, 1);
    assert.ok(!inspect(captured, { depth: null }).includes(token));
  });

  it('retains one RDMP template failure without logging template or user content', async () => {
    await anonymous.get(rdmpPath).query({ failure: 'true' }).expect(500);
    await settle();
    const logged = events(rdmpPath);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].event.rdmpTemplateOid, 'privacy-rdmp');
    assert.equal(logged[0].event.rdmpTemplateOutcome, 'failed');
    assert.equal(Object.values(logged[0].event.errors ?? {}).length, 1);
    assert.ok(!inspect(captured, { depth: null }).includes('PRIVATE'));
  });

  it('records a migrated translation failure once and redacts credentials in its message and stack', async () => {
    const original = fixture.services.I18nEntriesService.getBundle;
    fixture.services.I18nEntriesService.getBundle = async () => {
      throw new Error('Upstream rejected Authorization: Bearer private-runtime-token');
    };
    try {
      await admin.get(translationFailurePath).set('X-Source', 'jsclient').expect(500);
      await settle();
      const logged = events(translationFailurePath);
      assert.equal(logged.length, 1);
      assert.equal(logged[0].level, 'error');
      assert.equal(logged[0].event.translationGetBundleFailed, true);
      const errors = Object.values(logged[0].event.errors ?? {});
      assert.equal(errors.length, 1);
      assert.match(errors[0].message ?? '', /Authorization: Bearer REDACTED/);
      assert.ok(!JSON.stringify(logged[0].event).includes('private-runtime-token'));
      assert.deepEqual(chronicleWarnings(), []);
    } finally {
      fixture.services.I18nEntriesService.getBundle = original;
    }
  });

  it('isolates async service capture across simultaneous HTTP requests and retains HTTP 200 failures', async () => {
    const responses = await Promise.all(servicePaths.map(path => anonymous.get(path).expect(200)));
    await settle();
    const ids = new Set<string>();
    for (const [index, servicePath] of servicePaths.entries()) {
      assert.deepEqual(responses[index].body, { status: 500 });
      const logged = events(servicePath);
      assert.equal(logged.length, 1);
      const { event, level } = logged[0];
      assert.equal(level, 'error');
      assert.equal(event.result?.outcome, 'failure');
      assert.equal(event.emailTemplate, `missing-service-template-${index}`);
      assert.equal(event.emailTemplateOutcome, 'failed');
      assert.equal(Object.values(event.errors ?? {}).length, 1);
      assert.ok(!JSON.stringify(event).includes('PRIVATE'));
      ids.add(event.requestId ?? '');
    }
    assert.equal(ids.size, 2);
    assert.deepEqual(chronicleWarnings(), []);
  });

  it('does not warn or create HTTP events for service operations outside a request', async () => {
    await firstValueFrom(fixture.services.UsersService.getUserWithUsername('admin'));
    await settle();
    assert.deepEqual(chronicleWarnings(), []);
    assert.equal(events(virtualPath).length, 0, 'background operations do not produce HTTP events');
  });

  it('retains a successful service warning as one warn event when success sampling is disabled', async () => {
    const logConfig = fixture.config.log as { requestChronicle?: unknown };
    const settings = logConfig.requestChronicle;
    logConfig.requestChronicle = { successSampleRate: 0 };
    try {
      const response = await anonymous.get(warningPath).expect(200);
      await settle();
      assert.deepEqual(response.body, { status: true });
      const logged = events(warningPath);
      assert.equal(logged.length, 1);
      assert.equal(logged[0].level, 'warn');
      assert.equal(logged[0].event.serviceWarning, 'retained');
      assert.equal(logged[0].event.result?.classification, 'warning');
      assert.equal(logged[0].event.result?.outcome, 'success');
      assert.deepEqual(chronicleWarnings(), []);
    } finally {
      logConfig.requestChronicle = settings;
    }
  });

  it('captures service details and one rethrown error through multipart parsing and the file upload callback', async () => {
    const uploadStarted = new Promise<void>(resolve => {
      markUploadStarted = resolve;
    });
    const boundary = 'redbox-chronicle-streaming-fixture';
    const address = fixture.server.address();
    const request = httpRequest({ hostname: '127.0.0.1', port: address.port, path: uploadPath, method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` } });
    request.setTimeout(15_000, () => request.destroy(new Error('Multipart fixture request timed out')));
    const result = new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      request.once('error', reject);
      request.once('response', response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; });
        response.once('error', reject);
        response.once('end', () => {
          try { resolve({ status: response.statusCode!, body: JSON.parse(body) }); }
          catch (error) { reject(error); }
        });
      });
    });
    request.flushHeaders();
    request.write(`--${boundary}\r\nContent-Disposition: form-data; name="marker"\r\n\r\nPRIVATE MARKER\r\n`);
    request.write(`--${boundary}\r\nContent-Disposition: form-data; name="attachment"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\nPRIVATE UPLOAD CONTENT`);
    await uploadStarted;
    for (let index = 0; index < 4; index++) {
      await delay(20);
      request.write(Buffer.alloc(256 * 1024, 'x'));
    }
    request.end(`\r\n--${boundary}--\r\n`);
    const response = await result;
    assert.equal(response.status, 200);
    await settle();
    assert.deepEqual(response.body, { uploaded: 1, parserFailed: false });
    const logged = events(uploadPath);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].level, 'error');
    assert.equal(logged[0].event.serviceUploadFileCount, 1);
    assert.equal(logged[0].event.serviceUploadOutcome, 'failed');
    assert.equal(logged[0].event.controllerUploadOutcome, 'failed');
    assert.equal(Object.values(logged[0].event.errors ?? {}).length, 1);
    assert.ok(!JSON.stringify(logged[0].event).includes('PRIVATE'));
    assert.equal(captured.filter(item => item.args[1] === 'Service operation failed.').length, 0);
    assert.deepEqual(chronicleWarnings(), []);
  });
});
