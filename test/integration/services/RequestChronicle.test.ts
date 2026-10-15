import assert from 'node:assert/strict';
import supertest from 'supertest';
import { ControllerExports, Services } from '@researchdatabox/redbox-core';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';
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
  const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
  let captured: CapturedLog[] = [];
  let originalLog: Partial<Record<LogLevel, (...args: unknown[]) => void>> = {};
  let originalSettings: unknown;
  let anonymous: supertest.Agent;
  let admin: supertest.Agent;

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
    router.bind(warningPath, (_req, res) => {
      warningService.recordWarning();
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

  it('records request body errors in the event', async () => {
    const path = '/default/rdmp/user/update';
    const response = await admin
      .post(path)
      .set('X-Source', 'jsclient')
      .set('Content-Type', 'application/json')
      .send('{"details": ');
    await settle();

    const logged = events(path);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].event.res?.statusCode, response.status);
    if (response.status >= 500) {
      assert.ok(logged[0].event.errors, 'server errors are recorded in the event');
    }
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
});
