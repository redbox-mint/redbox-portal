import { attachSailsPersistenceLifecycle } from '../../src/compat/sails/persistenceLifecycle';
let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { buildRedboxSessionOptions, redboxSession } from '../../src/middleware/redboxSession';
import { createServer } from 'node:http';
import express from 'express';
import { initializePersistence, cleanupPersistence, persistenceOperation, persistenceReady } from '../../src/persistence/runtime';
import { createMockSails } from '../services/testHelper';

describe('Middleware: redboxSession', () => {

  it('should return a function', () => {
    const original = global.sails;
    try {
      global.sails = createMockSails();
      const middleware = redboxSession({ secret: 'test-secret' });
      expect(middleware).to.be.a('function');
    } finally {
      global.sails = original;
    }
  });

  it('should default session cookies to secure, httpOnly, and SameSite=Lax', () => {
    const options = buildRedboxSessionOptions({ secret: 'test-secret' });

    expect(options.cookie).to.deep.include({
      secure: true,
      httpOnly: true,
      sameSite: 'lax'
    });
  });

  it('should preserve explicit cookie overrides', () => {
    const options = buildRedboxSessionOptions({
      secret: 'test-secret',
      cookie: {
        secure: false,
        maxAge: 1234
      }
    });

    expect(options.cookie).to.deep.include({
      secure: false,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1234
    });
  });

  it('lets an accepted HTTP request finish persistence writes before shutdown', async () => {
    const original = global.sails;
    const app = createMockSails();
    global.sails = app;
    attachSailsPersistenceLifecycle(app);
    await initializePersistence(app);
    let release!: () => void, entered!: () => void;
    let written = false;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const web = express();
    web.use(redboxSession({ secret: 'test-secret', cookie: { secure: false } }));
    web.get('/', async (_req, res) => {
      entered();
      await pending;
      try {
        await persistenceOperation(app, async () => { written = true; });
        res.end('finished');
      } catch { res.status(500).end('unavailable'); }
    });
    const server = createServer(web);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Missing fixture address');
    const request = fetch(`http://127.0.0.1:${address.port}/`).then(response => response.text());
    await started;
    const shutdown = new Promise<void>((resolve, reject) => app.config.beforeShutdown!(error => error ? reject(error) : resolve()));
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(persistenceReady(app)).to.equal(true);
      release();
      expect(await request).to.equal('finished');
      await shutdown;
      expect(written).to.equal(true);
      expect(persistenceReady(app)).to.equal(false);
    } finally {
      release();
      await request.catch(() => {});
      await shutdown.catch(() => {});
      await new Promise<void>(resolve => server.close(() => resolve()));
      await cleanupPersistence(app);
      global.sails = original;
    }
  });
});
