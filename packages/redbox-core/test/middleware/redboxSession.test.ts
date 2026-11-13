let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { buildRedboxSessionOptions, redboxSession } from '../../src/middleware/redboxSession';

describe('Middleware: redboxSession', () => {

  it('should return a function', () => {
    const middleware = redboxSession({ secret: 'test-secret' });
    expect(middleware).to.be.a('function');
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

  it('rejects per-request cookie functions instead of dropping them', () => {
    expect(() => redboxSession({ secret: 'test-secret', cookie: () => ({ secure: true }) } as never)).to.throw(
      TypeError,
      /cookie must be an object/
    );
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
      const middleware = redboxSession({ secret: 'test-secret', cookie, ...('proxy' in transport ? { proxy: transport.proxy } : {}) } as never);
      const app = express();
      app.set('trust proxy', transport.trustProxy === true);
      app.use(middleware);
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
