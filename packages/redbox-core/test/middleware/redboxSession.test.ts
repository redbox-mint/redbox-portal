import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as sinon from 'sinon';
import MongoStore from 'connect-mongo';
let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { buildRedboxSessionOptions, composeHttpSession } from '../../src/http/express/session';
import { drainHttpRequests, runHttpRequestHandler } from '../../src/middleware/requestLifetime';
import { createServer } from 'node:http';
import express from 'express';
import { initializePersistence, cleanupPersistence, persistenceOperation, persistenceReady } from '../../src/persistence/runtime';
import { createDomainFixture } from '../services/testHelper';

describe('Middleware: redboxSession', () => {

  it('should return a function', () => {
    const owned = composeHttpSession({ secret: 'test-secret' });
    expect(owned.middleware).to.be.a('function');

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
    const app = createDomainFixture();
    await initializePersistence(app);
    let release!: () => void, entered!: () => void;
    let written = false;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const web = express();
    web.use(composeHttpSession({ secret: 'test-secret', cookie: { secure: false } }, app).middleware);
    web.get('/', (req, res) => runHttpRequestHandler(req, async () => {
      entered();
      await pending;
      try {
        await persistenceOperation(app, async () => { written = true; });
        res.end('finished');
      } catch { res.status(500).end('unavailable'); }
    }));
    const server = createServer(web);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Missing fixture address');
    const request = fetch(`http://127.0.0.1:${address.port}/`).then(response => response.text());
    await started;
    const shutdown = drainHttpRequests(app).then(() => cleanupPersistence(app));
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
    }
  });
  it('rejects per-request cookie functions instead of dropping them', () => {
    expect(() => composeHttpSession({ secret: 'test-secret', cookie: () => ({ secure: true }) } as never)).to.throw(
      TypeError,
      /cookie must be an object/
    );
  });

  it('rejects a cookie function before creating a Mongo session store', () => {
    const create = sinon.stub(MongoStore, 'create');
    try {
      expect(() => composeHttpSession({ adapter: 'mongo', secret: 'test-secret', cookie: () => ({ secure: true }) } as never))
        .to.throw(TypeError, /cookie must be an object/);
      expect(create.called).to.equal(false);
    } finally {
      create.restore();
    }
  });

  describe('session cookie transport', () => {
    let server: http.Server;
    let port: number;

    // Without an Express trust proxy setting, session-level proxy trust decides HTTPS detection.
    // With one, the proxy option is left unset (as in the shipped configuration) so express-session
    // falls back to Express's req.secure.
    const listen = (
      cookie: Record<string, unknown>,
      transport: { proxy?: boolean; trustProxy?: boolean } = { proxy: true }
    ) => new Promise<void>(resolve => {
      const owned = composeHttpSession({ secret: 'test-secret', cookie, ...('proxy' in transport ? { proxy: transport.proxy } : {}) } as never);
      const app = express();
      app.set('trust proxy', transport.trustProxy === true);
      app.use(owned.middleware);
      app.get('/', (req, res) => {
        (req as unknown as { session: Record<string, unknown> }).session.started = true;
        res.end('ok');
      });
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });

    const setCookie = (forwardedProto?: string) => new Promise<string[]>((resolve, reject) => {
      const headers = forwardedProto ? { 'x-forwarded-proto': forwardedProto } : {};
      http.get({ host: '127.0.0.1', port, path: '/', headers }, res => {
        res.resume();
        res.on('end', () => resolve(res.headers['set-cookie'] ?? []));
      }).on('error', reject);
    });

    afterEach(done => {
      server.close(() => done());
    });

    it('marks the cookie Secure over HTTPS when the configuration disables secure cookies', async () => {
      await listen({ secure: false });
      const cookies = await setCookie('https');
      expect(cookies).to.have.lengthOf(1);
      expect(cookies[0]).to.match(/;\s*Secure/i);
    });

    it('still issues a session cookie over plain HTTP when the configuration disables secure cookies', async () => {
      await listen({ secure: false });
      const cookies = await setCookie();
      expect(cookies).to.have.lengthOf(1);
      expect(cookies[0]).to.not.match(/;\s*Secure/i);
    });

    it('uses Express trust proxy when the session proxy option is unset', async () => {
      await listen({ secure: false }, { trustProxy: true });
      expect((await setCookie('https'))[0]).to.match(/;\s*Secure/i);
      expect((await setCookie())[0]).to.not.match(/;\s*Secure/i);
    });

    it('does not trust a forwarded protocol when no proxy is trusted', async () => {
      await listen({ secure: false }, { trustProxy: false });
      const cookies = await setCookie('https');
      expect(cookies).to.have.lengthOf(1);
      expect(cookies[0]).to.not.match(/;\s*Secure/i);
    });

    it('ignores the forwarded protocol when session proxy trust is disabled', async () => {
      await listen({ secure: false }, { proxy: false, trustProxy: true });
      const cookies = await setCookie('https');
      expect(cookies).to.have.lengthOf(1);
      expect(cookies[0]).to.not.match(/;\s*Secure/i);
    });

    it('never issues the default secure cookie over plain HTTP', async () => {
      await listen({});
      expect(await setCookie()).to.have.lengthOf(0);
      expect((await setCookie('https'))[0]).to.match(/;\s*Secure/i);
    });
  });

});
