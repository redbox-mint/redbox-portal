import assert from 'node:assert/strict';
import { request } from 'node:http';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { ApplicationRuntime } from '../../src/application';
import { ExpressHost, HttpIdentity, prepareHttpMiddleware, httpErrorHandler } from '../../src/http/express';
import * as runtime from '../../src/persistence/runtime';

describe('accepted HTTP session loading during shutdown', () => {
  afterEach(() => sinon.restore());
  it('allows a partially received POST to load its Mongo session after quiesce', async () => {
    const owner = { config: {}, log: nothingLogger };
    const store = Object.assign(new session.MemoryStore(), { collectionP: Promise.resolve({}), close: async () => {} });
    sinon.stub(MongoStore, 'create').returns(store as any);
    sinon.stub(runtime, 'mongoSessionDatabase').resolves({ client: {} } as any);
    const admitted = Promise.withResolvers<void>();
    let actions = 0;
    const host = new ExpressHost(new ApplicationRuntime(owner), {
      owner,
      hostname: '127.0.0.1',
      port: 0,
      prepare: async router => {
        router.use((_req, _res, next) => {
          admitted.resolve();
          next();
        });
        await prepareHttpMiddleware(router, {
          owner,
          log: nothingLogger,
          identity: new HttpIdentity({
            one: sinon.stub().resolves(null),
            verifyPassword: sinon.stub().resolves(false),
            findByApiTokenHash: sinon.stub().resolves(null),
          }),
          session: {
            adapter: 'mongo',
            mongoUrl: 'mongodb://fixture/sessions',
            secret: 'shutdown-session-secret-at-least-32-characters',
            cookie: { secure: false },
          },
        });
        router.post('/submit', (req, res) => {
          actions++;
          res.json(req.body);
        });
        router.use(httpErrorHandler(nothingLogger));
      },
    });
    await host.initialize();
    await host.activate();
    const body = JSON.stringify({ value: 'accepted' });
    const result = Promise.withResolvers<{ status: number; body: string }>();
    const sending = request(
      {
        hostname: '127.0.0.1',
        port: host.address()!.port,
        path: '/submit',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      response => {
        let text = '';
        response.on('data', chunk => {
          text += chunk;
        });
        response.on('end', () => result.resolve({ status: response.statusCode!, body: text }));
      }
    );
    sending.on('error', result.reject);
    try {
      sending.write(body.slice(0, 5));
      await admitted.promise;
      const stopping = host.stop();
      sending.end(body.slice(5));
      const response = await result.promise;
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.body), { value: 'accepted' });
      assert.equal(actions, 1);
      await stopping;
    } finally {
      sending.destroy();
      await host.stop();
    }
  });
});
