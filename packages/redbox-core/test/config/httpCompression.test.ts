import express from 'express';
import { gzipSync } from 'node:zlib';
import { http } from '../../src/config/http.config';

const request = require('supertest');
let expect: Chai.ExpectStatic;

describe('HTTP response compression', function () {
  let originalHttp: unknown;
  const text = 'Compressible portal response. '.repeat(200);

  before(async function () { ({ expect } = await import('chai')); });
  beforeEach(function () {
    originalHttp = (global as any).sails.config.http;
    (global as any).sails.config.http = { ...http, compression: { enabled: true } };
  });
  afterEach(function () { (global as any).sails.config.http = originalHttp; });

  function app(headers: Record<string, string> = {}, status = 200) {
    const server = express();
    server.use(http.middleware.compress as express.RequestHandler);
    server.get('/response', (_req, res) => {
      res.set({ 'Content-Type': 'text/plain', ...headers });
      res.status(status).send(headers['Content-Encoding'] ? gzipSync(text) : text);
    });
    return server;
  }

  it('defaults off behind the production nginx proxy and on in development, including docker', function () {
    const modulePath = require.resolve('../../src/config/http.config');
    const cached = require.cache[modulePath];
    const previous = process.env.NODE_ENV;
    try {
      for (const environment of ['production', 'development', 'docker', undefined]) {
        if (environment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = environment;
        delete require.cache[modulePath];
        expect(require(modulePath).http.compression.enabled, environment || 'unset')
          .to.equal(environment !== 'production');
      }
    } finally {
      require.cache[modulePath] = cached;
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('honors explicit nested Sails environment overrides in either direction', async function () {
    for (const enabled of [true, 'true', false, 'false']) {
      (global as any).sails.config.http.compression.enabled = enabled;
      const response = await request(app()).get('/response').set('Accept-Encoding', 'gzip');
      expect(response.headers['content-encoding']).to.equal(String(enabled) === 'true' ? 'gzip' : undefined);
      expect(response.text).to.equal(text);
    }
  });

  it('runs before routing and all static handlers', function () {
    for (const handler of ['router', 'hookStaticAssets', 'brandingAndPortalAwareStaticRouter', 'www']) {
      expect(http.middleware.order.indexOf('compress')).to.be.lessThan(http.middleware.order.indexOf(handler));
    }
  });

  it('negotiates gzip, varies by encoding and preserves security/session/cache headers', async function () {
    const response = await request(app({
      'Set-Cookie': 'session=existing; HttpOnly; SameSite=Lax',
      'Content-Security-Policy': "script-src 'nonce-test-nonce'",
      'Cache-Control': 'private, max-age=600',
      Vary: 'Origin',
    })).get('/response').set('Accept-Encoding', 'gzip').expect(200);
    expect(response.headers['content-encoding']).to.equal('gzip');
    expect(response.headers.vary).to.include('Origin').and.include('Accept-Encoding');
    expect(response.headers['set-cookie'][0]).to.include('session=existing');
    expect(response.headers['content-security-policy']).to.equal("script-src 'nonce-test-nonce'");
    expect(response.headers['cache-control']).to.equal('private, max-age=600');
    expect(response.text).to.equal(text);
  });

  it('supports identity negotiation and deployment opt-out', async function () {
    const identity = await request(app()).get('/response').set('Accept-Encoding', 'identity');
    expect(identity.headers['content-encoding']).to.equal(undefined);
    expect(identity.headers.vary).to.include('Accept-Encoding');
    (global as any).sails.config.http.compression.enabled = false;
    const disabled = await request(app()).get('/response').set('Accept-Encoding', 'gzip');
    expect(disabled.headers['content-encoding']).to.equal(undefined);
    expect(disabled.text).to.equal(text);
  });

  for (const headers of [
    { 'Content-Type': 'text/event-stream' },
    { 'Content-Disposition': 'attachment; filename="export.csv"' },
    { 'X-Accel-Buffering': 'no' },
    { 'Cache-Control': 'no-transform' },
    { 'Content-Type': 'image/png' },
  ]) {
    it(`leaves ${JSON.stringify(headers)} uncompressed`, async function () {
      const response = await request(app(headers)).get('/response').set('Accept-Encoding', 'gzip');
      expect(response.headers['content-encoding']).to.equal(undefined);
    });
  }

  it('preserves existing encoding and range responses', async function () {
    const encoded = await request(app({ 'Content-Encoding': 'gzip' }))
      .get('/response').set('Accept-Encoding', 'gzip');
    expect(encoded.headers['content-encoding']).to.equal('gzip');
    expect(encoded.text).to.equal(text);
    const ranged = await request(app({}, 206)).get('/response')
      .set('Accept-Encoding', 'gzip').set('Range', 'bytes=0-100');
    expect(ranged.headers['content-encoding']).to.equal(undefined);
  });
});
