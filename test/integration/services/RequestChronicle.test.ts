import assert from 'node:assert/strict';
import supertest from 'supertest';

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

/**
 * Checks the request chronicle through lifted Sails: the HTTP middleware, routing, policies, and controllers.
 */
describe('Request chronicle in lifted Sails', function () {
  this.timeout(60_000);

  const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
  let captured: CapturedLog[] = [];
  let originalLog: Partial<Record<LogLevel, (...args: unknown[]) => void>> = {};
  let originalSettings: unknown;
  let anonymous: supertest.Agent;
  let admin: supertest.Agent;

  before(async () => {
    const app = (sails.hooks.http as { app: Parameters<typeof supertest.agent>[0] }).app;
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

  it('does not warn for virtual requests, which have no request chronicle', async () => {
    await new Promise<void>((resolve, reject) => {
      sails.request({ url: '/default/rdmp/locales/en/translation.json', method: 'get' }, (err: unknown) =>
        err ? reject(err) : resolve()
      );
    });
    await settle();

    assert.deepEqual(chronicleWarnings(), []);
    assert.equal(
      captured.filter(item => item.args[1] === 'Request chronicle').length,
      0,
      'virtual requests do not produce events'
    );
  });
});
