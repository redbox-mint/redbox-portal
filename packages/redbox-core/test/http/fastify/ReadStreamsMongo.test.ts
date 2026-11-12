import sinon from 'sinon';
import * as sessions from '../../../src/http/fastify/session';
const { NativeMongoSessionStore } = sessions;
import { rawRequest } from './securityFixture';
import { referenceOrigin } from './referenceProductionFixture';
import assert from 'node:assert/strict';
import { Agent, request } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { setTimeout as pause } from 'node:timers/promises';
import { referenceProductionFixture } from './referenceProductionFixture';
import { recordQueryReadDeclarations } from '../../../src/http/readRoutes';
import { addDataStreamsRoute } from '../../../src/api-routes/groups/records';
import { persistenceStatus } from '../../../src/persistence/runtime';
import { retainedReadExpress } from './retainedReadExpress';
import { nothingLogger } from '@researchdatabox/sails-ng-common';

type StreamObservation = {
  response: { status: number; headers: Record<string, unknown>; text: string; aborted?: boolean } | { error: string };
  destroyed: boolean;
  closed: boolean;
  disposed: boolean;
  produced: number;
};
const streamCases = ['/api/export/record/download/', '/export/record/download/'].flatMap(path =>
  ['json', 'csv'].flatMap(format =>
    ['GET', 'HEAD'].flatMap(method =>
      ['before-byte', 'mid-stream', 'empty', 'client-abort', 'normal'].flatMap(failure =>
        ['1.0', '2.0'].map(version => ({ path: path + format, method, failure, version }))
      )
    )
  )
);

/** Keep the HEAD socket open until the source settles: a bodyless client end
 * must not itself cancel a delayed server-side source error. */
async function observeStream(
  f: Awaited<ReturnType<typeof referenceProductionFixture>>,
  scenario: (typeof streamCases)[number]
): Promise<StreamObservation> {
  const started = Promise.withResolvers<void>(), closed = Promise.withResolvers<void>();
  let disposed = false, produced = 0;
  const source = new Readable({
    read() {
      started.resolve();
      if (scenario.failure === 'before-byte')
        void pause(25).then(() => this.destroy(new Error('secret stream before first byte')));
      else if (scenario.failure === 'empty') this.push(null);
      else if (scenario.failure === 'normal') {
        produced++;
        this.push(Buffer.from('[{"unicode":"研究 🌏"}]'));
        this.push(null);
      }
      else if (scenario.failure === 'mid-stream' && produced === 0) {
        produced++;
        this.push(Buffer.from('['));
        void pause(25).then(() => this.destroy(new Error('secret stream after first byte')));
      }
    },
    destroy(error, done) {
      disposed = true;
      done(error);
    },
  });
  source.on('error', () => {});
  source.once('close', () => closed.resolve());
  const storage = f.data.storage(), original = Object.getOwnPropertyDescriptor(storage, 'exportAllPlans');
  Object.defineProperty(storage, 'exportAllPlans', { configurable: true, value: () => source });
  const agent = new Agent({ keepAlive: true });
  let client: ReturnType<typeof request> | undefined;
  try {
    const response = await new Promise<StreamObservation['response']>(resolve => {
      client = request(f.url + '/default/rdmp' + scenario.path + '?recType=dataRecord', {
        method: scenario.method, agent,
        headers: { Authorization: 'Bearer pilot-api-token', 'X-ReDBox-API-Version': scenario.version },
      }, res => {
        const chunks: Buffer[] = [], headers: Record<string, unknown> = { ...res.headers };
        for (const name of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[name];
        const complete = (aborted = false) => resolve({
          status: res.statusCode!, headers, text: Buffer.concat(chunks).toString(), ...(aborted ? { aborted: true } : {}),
        });
        res.on('data', chunk => chunks.push(chunk));
        res.on('aborted', () => complete(true));
        res.on('error', () => complete(true));
        res.on('end', () => complete());
      });
      client.setTimeout(10000, () => client!.destroy(new Error('HTTP timeout')));
      client.on('error', error => resolve({ error: (error as NodeJS.ErrnoException).code ?? error.message }));
      client.end();
      if (scenario.failure === 'client-abort')
        void started.promise.then(() => client!.destroy(new Error('client cancelled export')));
    });
    await Promise.race([closed.promise, pause(2000).then(() => { throw new Error('Export source did not close'); })]);
    return { response, destroyed: source.destroyed, closed: source.closed, disposed, produced };
  } finally {
    client?.destroy();
    agent.destroy();
    source.destroy();
    if (original) Object.defineProperty(storage, 'exportAllPlans', original);
    else Reflect.deleteProperty(storage, 'exportAllPlans');
  }
}

describe('FM-024 retained GET/HEAD export stream differential', function () {
  this.timeout(120000);
  const observations = new Map<string, StreamObservation[]>();
  const key = (scenario: (typeof streamCases)[number]) => Object.values(scenario).join(' ');
  before(async () => {
    const retained = await retainedReadExpress();
    try {
      for (const mode of ['retained', 'express', 'fastify'] as const) {
        const f = await referenceProductionFixture(mode === 'fastify', undefined, mode === 'retained' ? retained.install : undefined, {
          declarations: recordQueryReadDeclarations,
        });
        try {
          for (const scenario of streamCases) {
            const rows = observations.get(key(scenario)) ?? [];
            rows.push(await observeStream(f, scenario));
            observations.set(key(scenario), rows);
          }
        } finally {
          await f.close();
          assert.equal(persistenceStatus(f.owner).pools, 0);
        }
      }
    } finally {
      await retained.close();
    }
    if (process.env.FM024_STREAM_REPORT)
      await writeFile(process.env.FM024_STREAM_REPORT, JSON.stringify(Object.fromEntries(observations), null, 2));
  });
  for (const scenario of streamCases)
    it(key(scenario), () => {
      const rows = observations.get(key(scenario));
      assert(rows && rows.length === 3);
      assert.deepEqual(rows[1], rows[0], 'Current Express must match retained stream behavior');
      if (scenario.failure === 'before-byte') {
        const response = rows[2].response;
        assert('status' in response);
        assert.equal(response.status, 500);
        assert.equal(response.aborted, undefined);
        assert.equal(response.headers['content-disposition'], undefined);
        assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
        const expected = scenario.version === '2.0'
          ? '{"errors":[{"detail":"Internal server error"}],"meta":{}}'
          : '{"message":"Internal server error","details":""}';
        assert.equal(response.headers['content-length'], String(Buffer.byteLength(expected)));
        assert.equal(response.text, scenario.method === 'HEAD' ? '' : expected);
      } else {
        // HEAD now mirrors GET's framing instead of the preceding empty HEAD
        // hook. All other status/header/body/disposal observations stay exact.
        const current = structuredClone(rows[2]);
        if (scenario.method === 'HEAD' && 'status' in current.response) {
          delete current.response.headers['transfer-encoding'];
          if (scenario.failure === 'empty') delete current.response.headers['content-length'];
        }
        assert.deepEqual(current, rows[0], 'Fastify must retain the remaining stream behavior');
      }
      for (const row of rows) {
        assert(row.destroyed && row.closed && row.disposed, 'Every source must be disposed');
        if (row === rows[2] && scenario.failure === 'before-byte') continue;
        if (scenario.failure === 'before-byte' || (scenario.failure === 'mid-stream' && scenario.method === 'HEAD'))
          assert.deepEqual(row.response, { error: 'ECONNRESET' });
        else if (scenario.failure === 'client-abort') assert.deepEqual(row.response, { error: 'client cancelled export' });
        else {
          assert('status' in row.response);
          assert.equal(row.response.status, 200);
          assert.match(String(row.response.headers['content-disposition']), /attachment/);
          assert.equal(row.response.text, scenario.method === 'HEAD' ? '' : scenario.failure === 'normal' ? '[{"unicode":"研究 🌏"}]' : scenario.failure === 'mid-stream' ? '[' : '');
          assert.equal(row.response.aborted, scenario.failure === 'mid-stream' && scenario.method === 'GET' ? true : undefined);
        }
      }
      if (scenario.method === 'HEAD' && ['before-byte', 'empty', 'normal'].includes(scenario.failure)) {
        const get = observations.get(key({ ...scenario, method: 'GET' }))?.[2].response;
        assert(get && 'status' in get && 'status' in rows[2].response);
        assert.equal(rows[2].response.status, get.status);
        assert.deepEqual(rows[2].response.headers, get.headers, 'HEAD must carry all GET headers');
        assert.equal(rows[2].response.text, '');
      }
    });
});

/** Real production host/session/policy/send stages: the injected domain source
 * observes consumption and disposal, without replacing HTTP dispatch. */
describe('FM-024 export ownership through the production bootstrap', function () {
  this.timeout(60000);
  for (const path of ['/api/export/record/download/json', '/export/record/download/json']) {
    it(path + ' retains backpressure and an asynchronous source finalizer through disconnect and stop', async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, {
        declarations: [...recordQueryReadDeclarations, addDataStreamsRoute],
      });
      const storage = f.data.storage(),
        original = Object.getOwnPropertyDescriptor(storage, 'exportAllPlans');
      const finalizing = Promise.withResolvers<void>(),
        release = Promise.withResolvers<void>();
      let produced = 0,
        finalized = false;
      const source = Readable.from(
        (async function* () {
          try {
            for (let index = 0; index < 2048; index++) {
              produced++;
              yield Buffer.alloc(65536, 97);
            }
          } finally {
            finalizing.resolve();
            await release.promise;
            finalized = true;
          }
        })(),
        { highWaterMark: 65536, objectMode: false }
      );
      Object.defineProperty(storage, 'exportAllPlans', { configurable: true, value: () => source });
      let response: import('node:http').IncomingMessage | undefined;
      const receiving = Promise.withResolvers<void>();
      const client = request(
        f.url + '/default/rdmp' + path + '?recType=dataRecord',
        { headers: { Authorization: 'Bearer pilot-api-token' } },
        res => {
          response = res;
          assert.equal(res.statusCode, 200);
          res.pause();
          receiving.resolve();
        }
      );
      client.on('error', () => {});
      client.end();
      try {
        await receiving.promise;
        await pause(100);
        assert(produced > 0);
        assert(produced < 256, 'paused client must bound domain production');
        client.destroy();
        response?.destroy();
        await finalizing.promise;
        let stopped = false;
        const stopping = f.host.stop().then(() => {
          stopped = true;
        });
        await pause(50);
        assert.equal(stopped, false);
        assert(persistenceStatus(f.owner).pools > 0, 'accepted export still borrows Mongo');
        release.resolve();
        await stopping;
        assert.equal(finalized, true);
        assert.equal(persistenceStatus(f.owner).pools, 0);
        assert.equal(source.destroyed, true);
      } finally {
        release.resolve();
        client.destroy();
        response?.destroy();
        if (original) Object.defineProperty(storage, 'exportAllPlans', original);
        else Reflect.deleteProperty(storage, 'exportAllPlans');
        await f.close();
      }
    });
  }
  for (const path of ['/api/export/record/download/', '/export/record/download/'])
    for (const format of ['json', 'csv'])
      for (const method of ['GET', 'HEAD'])
        for (const failure of ['session-touch', 'session-save', 'replacement'] as const)
          it(`${method} ${path}${format} disposes its source after ${failure} and drains before closing Mongo`, async () => {
            // Inject faults at the real production session/send stage. The wrapper
            // always runs its original preparation; registration/dispatch stay owned
            // by createPortalFastifyHost and the resolved installation.
            const prepareSessions = sessions.prepareNativeSessions;
            const f = await referenceProductionFixture(
              true,
              undefined,
              () => {
                const stub = sinon.stub(sessions, 'prepareNativeSessions').callsFake(async (...args) => {
                  const result = await prepareSessions(...args);
                  const [app] = args;
                  if (failure === 'session-save')
                    app.addHook('preHandler', async request => {
                      if (request.url.includes('/export/')) Reflect.set(request.session, 'exportAttempt', true);
                    });
                  if (failure === 'replacement')
                    app.addHook('onSend', async (request, _reply, payload) =>
                      request.url.includes('/export/') ? Buffer.from('replacement') : payload
                    );
                  return result;
                });
                return () => stub.restore();
              },
              { declarations: recordQueryReadDeclarations }
            );
            const storage = f.data.storage(),
              original = Object.getOwnPropertyDescriptor(storage, 'exportAllPlans');
            const disposing = Promise.withResolvers<void>(),
              release = Promise.withResolvers<void>();
            let disposed = false,
              produced = false;
            const source = new Readable({
              read() {
                if (!produced) {
                  produced = true;
                  this.push(Buffer.alloc(65536, 97));
                }
              },
              destroy(error, done) {
                disposing.resolve();
                void release.promise.then(() => {
                  disposed = true;
                  done(error);
                });
              },
            });
            let fault: sinon.SinonStub | undefined;
            try {
              const token = await rawRequest(f.url + '/csrfToken', 'GET');
              const cookie = String(token.headers['set-cookie'][0]).split(';')[0];
              const login = await rawRequest(
                f.url + '/user/login_local',
                'POST',
                'application/x-www-form-urlencoded',
                new URLSearchParams({
                  username: 'pilot-admin',
                  password: 'pilot-password',
                  _csrf: JSON.parse(token.text)._csrf,
                }).toString(),
                { Cookie: cookie, Origin: referenceOrigin }
              );
              assert.equal(login.status, 302);
              const authenticated = String(login.headers['set-cookie'][0]).split(';')[0];
              Object.defineProperty(storage, 'exportAllPlans', { configurable: true, value: () => source });
              if (failure === 'session-save')
                fault = sinon
                  .stub(NativeMongoSessionStore.prototype, 'compareAndSet')
                  .callsFake((_id, _generation, _session, callback) =>
                    callback(new Error('secret export session-store fault'))
                  );
              if (failure === 'session-touch')
                fault = sinon
                  .stub(NativeMongoSessionStore.prototype, 'touch')
                  .callsFake((_id, _session, callback) => callback(new Error('secret export session-store fault')));
              const response = await rawRequest(
                f.url + '/default/rdmp' + path + format + '?recType=dataRecord',
                method,
                undefined,
                '',
                { Cookie: authenticated }
              );
              assert.equal(response.status, failure === 'replacement' ? 200 : 500);
              assert.equal(
                response.text,
                method === 'HEAD' ? '' : failure === 'replacement' ? 'replacement' : '{"message":"Internal server error","details":""}'
              );
              if (method === 'HEAD' && failure === 'replacement') {
                assert.equal(response.headers['content-length'], String(Buffer.byteLength('replacement')));
                assert.equal(response.headers['transfer-encoding'], undefined);
              }
              if (fault) {
                assert.equal(fault.callCount, 1);
                assert.equal(response.headers['set-cookie'], undefined);
              }
              await Promise.race([
                disposing.promise,
                pause(2000).then(() => {
                  throw new Error('Source was left open after response handoff');
                }),
              ]);
              assert.equal(source.destroyed, true);
              assert.equal(disposed, false);
              let stopped = false;
              const stopping = f.host.stop().then(() => {
                stopped = true;
              });
              await pause(50);
              assert.equal(stopped, false, 'source disposal must retain request ownership');
              assert(persistenceStatus(f.owner).pools > 0);
              release.resolve();
              await stopping;
              assert.equal(disposed, true);
              assert.equal(source.closed, true);
              assert.equal(persistenceStatus(f.owner).pools, 0);
            } finally {
              fault?.restore();
              release.resolve();
              source.destroy();
              if (original) Object.defineProperty(storage, 'exportAllPlans', original);
              else Reflect.deleteProperty(storage, 'exportAllPlans');
              await f.close();
            }
          });
});

describe('FM-024 post-EOF export disposal through the production bootstrap', function () {
  this.timeout(60000);
  const getHeaders = new Map<string, Record<string, unknown>>();
  for (const path of ['/api/export/record/download/', '/export/record/download/'])
    for (const format of ['json', 'csv'])
      for (const empty of [false, true])
        for (const version of ['1.0', '2.0'])
          for (const method of ['GET', 'HEAD'])
            it(`${method} ${path}${format} v${version} ${empty ? 'empty' : 'nonempty'} keeps its complete response and logs disposal failure once`, async () => {
              const logs: unknown[] = [], unhandled: unknown[] = [];
              const rejected = (error: unknown) => { unhandled.push(error); };
              process.on('unhandledRejection', rejected);
              const f = await referenceProductionFixture(true, undefined, undefined, {
                declarations: recordQueryReadDeclarations,
                log: { ...nothingLogger, warn: (record: unknown) => { logs.push(record); } },
              });
              const storage = f.data.storage(), original = Object.getOwnPropertyDescriptor(storage, 'exportAllPlans');
              const disposing = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
              const body = empty ? '' : '[{"unicode":"研究 🌏","value":null}]';
              let disposed = false;
              const source = new Readable({
                read() {
                  if (body) this.push(Buffer.from(body));
                  this.push(null);
                },
                destroy(_error, done) {
                  disposing.resolve();
                  void release.promise.then(() => pause(25)).then(() => {
                    disposed = true;
                    done(new Error('secret cursor finaliser failure after EOF'));
                  });
                },
              });
              Object.defineProperty(storage, 'exportAllPlans', { configurable: true, value: () => source });
              try {
                const response = await Promise.race([
                  rawRequest(f.url + '/default/rdmp' + path + format + '?recType=dataRecord', method, undefined, '', {
                    Authorization: 'Bearer pilot-api-token', 'X-ReDBox-API-Version': version,
                  }),
                  pause(2000).then(() => { throw new Error('Response waited for post-EOF disposal'); }),
                ]);
                assert.equal(response.status, 200);
                assert.equal(response.text, method === 'HEAD' ? '' : body);
                assert.match(String(response.headers['content-disposition']), /attachment/);
                const headers: Record<string, unknown> = { ...response.headers };
                for (const name of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[name];
                const key = `${path}${format} ${empty} ${version}`;
                if (method === 'GET') getHeaders.set(key, headers);
                else assert.deepEqual(headers, getHeaders.get(key), 'HEAD must carry all GET headers');
                await disposing.promise;
                assert.equal(source.readableEnded, true);
                assert.equal(disposed, false);
                let stopped = false;
                const stopping = f.host.stop().then(() => { stopped = true; });
                await pause(50);
                assert.equal(stopped, false, 'close still owns pending source disposal after a complete response');
                assert(persistenceStatus(f.owner).pools > 0);
                release.resolve();
                await stopping;
                await pause(25);
                assert.equal(disposed, true);
                assert.equal(source.destroyed, true);
                assert.equal(source.closed, true);
                assert.equal(persistenceStatus(f.owner).pools, 0);
                assert.deepEqual(unhandled, []);
                const failures = logs.filter(record => typeof record === 'string' && record.startsWith('{"code":"HTTP_STREAM_DISPOSAL_FAILED"'));
                assert.deepEqual(failures, [JSON.stringify({
                  code: 'HTTP_STREAM_DISPOSAL_FAILED', level: 'error',
                  path: '/portal/default/rdmp' + path + format, requestId: 'req-1',
                })]);
                assert(!JSON.stringify(logs).includes('secret'));
                assert(!logs.includes('HTTP_POST_SEND_FAILURE'));
                assert(!logs.includes('HTTP_REQUEST_FAILED'));
              } finally {
                release.resolve();
                source.destroy();
                if (original) Object.defineProperty(storage, 'exportAllPlans', original);
                else Reflect.deleteProperty(storage, 'exportAllPlans');
                try { await f.close(); }
                finally { process.off('unhandledRejection', rejected); }
              }
            });
});
