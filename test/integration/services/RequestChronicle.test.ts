import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { inspect } from 'node:util';
import { firstValueFrom } from 'rxjs';
import supertest from 'supertest';
import { ControllerExports, Controllers, Services } from '@researchdatabox/redbox-core';

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

class UploadController extends Controllers.Core.Controller {
  public recordFailure(req: Sails.Req, error: Error): void {
    this.updateChronicle(req, { controllerUploadOutcome: 'failed' }, [error]);
  }
}

/**
 * Checks the request chronicle through lifted Sails: the HTTP middleware, routing, policies, and controllers.
 */
describe('Request chronicle in lifted Sails', function () {
  this.timeout(60_000);

  const virtualPath = '/request-chronicle-virtual-test';
  const translationFailurePath = '/request-chronicle-translation-failure-test';
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
  let uploadDirectory: string;
  let markUploadStarted: () => void = () => {};

  before(async () => {
    const app = (sails.hooks.http as { app: Parameters<typeof supertest.agent>[0] }).app;
    const router = sails.router as unknown as {
      bind(path: string, handler: (req: Sails.Req, res: Sails.Res) => void): void;
    };
    const userController = ControllerExports.UserController as { info(req: Sails.Req, res: Sails.Res): void };
    // Call the migrated action through the virtual router without HTTP-only authentication/language policies.
    router.bind(virtualPath, (req, res) => {
      req.user = { username: 'virtual-test' } as Sails.Req['user'];
      userController.info(req, res);
    });
    const translationController = ControllerExports.TranslationController as {
      getBundleApp(req: Sails.Req, res: Sails.Res): Promise<unknown>;
    };
    router.bind(translationFailurePath, (req, res) => {
      req.params.branding = 'default';
      return translationController.getBundleApp(req, res);
    });
    for (const [index, servicePath] of servicePaths.entries()) {
      router.bind(servicePath, async (_req, res) => {
        await new Promise(resolve => setTimeout(resolve, index === 0 ? 20 : 1));
        const result = await EmailService.buildFromTemplateAsync(`missing-service-template-${index}`, {
          subject: 'PRIVATE SUBJECT',
          body: 'PRIVATE BODY',
        });
        // Keep the legacy HTTP 200 failure contract and let the service error retain the event.
        return res.json({ status: result.status });
      });
    }
    const warningService = new WarningService();
    const uploadController = new UploadController();
    uploadDirectory = mkdtempSync(join(tmpdir(), 'chronicle-sails-upload-'));
    router.bind(warningPath, (_req, res) => {
      warningService.recordWarning();
      res.json({ status: true });
    });
    router.bind(uploadPath, (req, res) => {
      req.file('attachment').upload({ dirname: uploadDirectory }, (parserError: unknown, files: unknown[]) => {
        const error = new Error('upload service failed');
        warningService.recordUploadFailure(files?.length ?? 0, error);
        uploadController.recordFailure(req, error);
        res.json({ uploaded: files?.length ?? 0, parserFailed: parserError !== null && parserError !== undefined });
      });
      markUploadStarted();
    });
    router.bind(rdmpPath, async (req, res) => {
      const record = { metaMetadata: { createdBy: 'admin' }, metadata: { description: 'PRIVATE RDMP DESCRIPTION' } };
      const user = { username: 'admin', token: 'PRIVATE STORED TOKEN HASH' };
      if (req.query.failure === 'true') {
        try {
          await firstValueFrom(
            RDMPService.runTemplates(
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
          return res.serverError(error);
        }
      }
      const options = { templates: [{ field: 'metadata.copied', template: '<%= record.metadata.description %>' }] };
      await firstValueFrom(RDMPService.runTemplates('privacy-rdmp', record, options, user));
      await firstValueFrom(RDMPService.assignPermissions('privacy-rdmp', record, {}, user));
      await firstValueFrom(RDMPService.complexAssignPermissions('privacy-rdmp', record, {}));
      res.json({ status: true });
    });
    anonymous = supertest.agent(app);
    admin = supertest.agent(app);
    await admin
      .post('/user/login_local')
      .set('X-Source', 'jsclient')
      .send({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' })
      .expect(200);

    const logConfig = sails.config.log as { requestChronicle?: unknown };
    originalSettings = logConfig.requestChronicle;
    // Retain every request, so each request produces an event.
    logConfig.requestChronicle = { successSampleRate: 1, successSampleExcludePattern: '' };

    const log = sails.log as unknown as Record<LogLevel, (...args: unknown[]) => void>;
    for (const level of levels) {
      const original = log[level];
      originalLog[level] = original;
      log[level] = (...args: unknown[]) => {
        captured.push({ level, args });
        return original.apply(sails.log, args);
      };
    }
  });

  after(() => {
    (sails.router as unknown as { unbind(path: string): void }).unbind(virtualPath);
    (sails.router as unknown as { unbind(path: string): void }).unbind(translationFailurePath);
    (sails.router as unknown as { unbind(path: string): void }).unbind(warningPath);
    (sails.router as unknown as { unbind(path: string): void }).unbind(uploadPath);
    (sails.router as unknown as { unbind(path: string): void }).unbind(rdmpPath);
    rmSync(uploadDirectory, { recursive: true, force: true });
    for (const servicePath of servicePaths) {
      (sails.router as unknown as { unbind(path: string): void }).unbind(servicePath);
    }
    (sails.config.log as { requestChronicle?: unknown }).requestChronicle = originalSettings;
    const log = sails.log as unknown as Record<LogLevel, (...args: unknown[]) => void>;
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
      .set('X-Source', 'jsclient')
      .set('Content-Type', 'application/json')
      .send('{"password":"PRIVATE MALFORMED PASSWORD",')
      .expect(500);
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
    const original = I18nEntriesService.getBundle;
    I18nEntriesService.getBundle = async () => {
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
      I18nEntriesService.getBundle = original;
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

  it('does not warn for virtual requests, which have no request chronicle', async () => {
    await new Promise<void>((resolve, reject) => {
      sails.request({ url: virtualPath, method: 'get' }, (err: unknown) => (err ? reject(err) : resolve()));
    });
    await settle();

    assert.deepEqual(chronicleWarnings(), []);
    assert.equal(
      captured.filter(item => item.args[1] === 'Request chronicle').length,
      0,
      'virtual requests do not produce events'
    );
  });

  it('retains a successful service warning as one warn event when success sampling is disabled', async () => {
    const logConfig = sails.config.log as { requestChronicle?: unknown };
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
    const attachment = Readable.from(
      (async function* () {
        yield Buffer.from('PRIVATE UPLOAD CONTENT');
        await uploadStarted;
        for (let index = 0; index < 4; index++) {
          await delay(20);
          yield Buffer.alloc(256 * 1024, 'x');
        }
      })()
    );
    const response = await anonymous
      .post(uploadPath)
      .field('marker', 'PRIVATE MARKER')
      .attach('attachment', attachment, 'test.txt')
      .expect(200);
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
