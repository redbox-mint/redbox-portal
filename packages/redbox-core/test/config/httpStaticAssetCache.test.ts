import express from 'express';
import { rateLimit } from 'express-rate-limit';
import sinon from 'sinon';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { http, isImmutableAssetPath } from '../../src/config/http.config';

const request = require('supertest');
// Use the same serve-static dependency and configuration as Sails' www middleware.
const sailsRequire = createRequire(require.resolve('sails'));
const serveStatic = sailsRequire('serve-static');
let expect: Chai.ExpectStatic;

// Angular production build examples; see angular.json's application builder and
// outputHashing: all (build-angular 20.3.41 / esbuild 0.28.1). The names below
// were emitted by ng build @researchdatabox/local-auth --configuration production.
// These are a naming convention, not content verification.
const bundles = [
  '/angular/local-auth/browser/main-IJTXDIZ5.js',
  '/angular/local-auth/browser/polyfills-5CFQRCPP.js',
  '/angular/local-auth/browser/chunk-WEQAUKNS.js',
  '/angular/local-auth/browser/styles-5INURTSO.css',
];
const unversioned = [
  '/default/rdmp/images/checklist.png',
  '/js/redbox-progress.js',
  '/styles/bootstrap.css',
  '/angular/local-auth/browser/main.js',
  '/angular/local-auth/browser/main-abcdefgh.js',
  '/angular/local-auth/browser/main-ijtxdiz5.js',
  '/angular/local-auth/browser/main-a1b2c3d4.js',
  '/angular/local-auth/browser/main-IJTXDIZ5.js.map',
  '/angular/local-auth/browser/main-ABC12345.js',
  '/angular/local-auth/browser/main-ABC234567.js',
  '/angular/local-auth/browser/checklist.js',
  '/images/main-IJTXDIZ5.js',
  '/js/main-IJTXDIZ5.js',
];

describe('static asset cache policy over HTTP', function () {
  let appPath: string;
  let originalConfig: any;
  let publicDir: string;
  let hookDir: string;

  function write(root: string, url: string, bytes: string): void {
    const target = path.join(root, url);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }

  function app(rootContext = ''): express.Express {
    (global as any).sails.config.http.rootContext = rootContext;
    const server = express();
    // Model deployment under an Express mount/reverse proxy root context.
    const router = express.Router();
    // Keep request-triggered filesystem work bounded in this standalone fixture.
    // Each deployment instance needs at most two requests (GET and revalidation).
    router.use(rateLimit({ windowMs: 60000, limit: 3 }));
    router.use(http.middleware.cacheControl as express.RequestHandler);
    router.use(http.middleware.redirectNoCacheHeaders as express.RequestHandler);
    router.get('/angular/local-auth/browser/main-REDIRECT.js', (_req, res) => res.redirect('/login'));
    router.use(http.middleware.hookStaticAssets as express.RequestHandler);
    router.use(http.middleware.brandingAndPortalAwareStaticRouter as express.RequestHandler);
    router.use(serveStatic(publicDir, { maxAge: 31557600000 }));
    server.use(rootContext || '/', router);
    return server;
  }

  before(async function () {
    ({ expect } = await import('chai'));
  });

  beforeEach(function () {
    originalConfig = (global as any).sails.config;
    appPath = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-cache-5029-'));
    publicDir = path.join(appPath, '.tmp/public');
    hookDir = path.join(appPath, 'node_modules/redbox-hook-cache/assets');
    write(appPath, '/package.json', JSON.stringify({ dependencies: { 'redbox-hook-cache': '1.0.0' } }));
    write(appPath, '/node_modules/redbox-hook-cache/package.json', JSON.stringify({
      name: 'redbox-hook-cache', main: 'index.js', sails: { isHook: true },
    }));
    write(appPath, '/node_modules/redbox-hook-cache/index.js', 'module.exports = {};');
    (global as any).sails.config = {
      ...originalConfig, appPath, http: { rootContext: '' },
      session: { cookie: { maxAge: 600000 } }, custom: { cacheControl: { noCache: [] } },
    };
  });

  afterEach(function () {
    (global as any).sails.config = originalConfig;
    fs.rmSync(appPath, { recursive: true, force: true });
  });

  it('limits immutable eligibility to the production Angular browser bundle convention', function () {
    for (const url of bundles) {
      expect(isImmutableAssetPath(url), url).to.equal(true);
      expect(isImmutableAssetPath(`/default/rdmp${url}?v=anything`), url).to.equal(true);
    }
    for (const url of unversioned) {
      expect(isImmutableAssetPath(url), url).to.equal(false);
    }
  });

  for (const rootContext of ['', '/redbox']) {
    for (const assetRoot of ['core', 'hook']) {
      it(`revalidates stable URLs across two deployments (${assetRoot}, context '${rootContext}')`, async function () {
        const root = assetRoot === 'core' ? publicDir : hookDir;
        for (const url of unversioned) {
          write(root, url, '"deployment one"');
          const first = await request(app(rootContext)).get(`${rootContext}${url}?v=1`).expect(200);
          expect(first.headers['cache-control'], url).to.equal('no-cache');
          expect(first.headers.expires, url).to.equal(new Date(0).toUTCString());
          expect(first.headers.etag, url).to.be.a('string');
          await request(app(rootContext)).get(`${rootContext}${url}?v=1`)
            .set('If-None-Match', first.headers.etag).expect(304);

          // A second server instance serves a new deployment at the SAME URL.
          // Different lengths avoid filesystem timestamp granularity affecting ETags.
          write(root, url, '"deployment two with changed bytes"');
          const second = await request(app(rootContext)).get(`${rootContext}${url}?v=1`)
            .set('If-None-Match', first.headers.etag).expect(200);
          expect(second.headers['cache-control'], url).to.equal('no-cache');
          expect(second.headers.etag, url).not.to.equal(first.headers.etag);
          expect((second.text ?? second.body.toString()), url).to.equal('"deployment two with changed bytes"');
        }
      });

      it(`retains immutable headers after file serving (${assetRoot}, context '${rootContext}')`, async function () {
        for (const url of bundles.flatMap(url => [url, `/default/rdmp${url}`])) {
          write(assetRoot === 'core' ? publicDir : hookDir, url, 'fingerprinted bundle');
          const response = await request(app(rootContext)).get(`${rootContext}${url}?v=1`).expect(200);
          expect(response.headers['cache-control'], url).to.equal('public, max-age=31536000, immutable');
          expect(response.headers.pragma, url).to.equal(undefined);
          expect(Date.parse(response.headers.expires)).to.be.greaterThan(Date.now() + 31535000000);
        }
      });
    }
  }

  it('preserves revalidation through branded core fallback and ignores session lifetime for assets', async function () {
    write(publicDir, '/default/default/images/checklist.png', 'fallback');
    for (const maxAge of [0, undefined, 600000]) {
      (global as any).sails.config.session.cookie = { maxAge };
      const response = await request(app()).get('/brand/rdmp/images/checklist.png?deploy=2').expect(200);
      expect(response.headers['cache-control']).to.equal('no-cache');
    }
  });

  it('rejects excess requests before the fixture performs branded filesystem lookups', async function () {
    write(publicDir, '/default/default/images/checklist.png', 'fallback');
    const brandedRouter = sinon.spy(http.middleware, 'brandingAndPortalAwareStaticRouter');
    try {
      const server = app();
      for (let i = 0; i < 3; i++) {
        await request(server).get('/brand/rdmp/images/checklist.png').expect(200);
      }
      expect(brandedRouter.callCount).to.equal(3);
      await request(server).get('/brand/rdmp/images/checklist.png').expect(429);
      expect(brandedRouter.callCount).to.equal(3);
    } finally {
      brandedRouter.restore();
    }
  });

  it('preserves explicitly configured no-store headers for stable assets', async function () {
    write(publicDir, '/js/redbox-progress.js', 'private asset');
    (global as any).sails.config.custom.cacheControl.noCache = ['/js/redbox-progress.js'];
    const response = await request(app()).get('/js/redbox-progress.js').expect(200);
    expect(response.headers['cache-control']).to.equal('no-cache, no-store');
  });

  it('recognizes the configured root context before it is removed by routing', async function () {
    write(publicDir, bundles[0], 'bundle');
    const server = express();
    (global as any).sails.config.http.rootContext = '/redbox/';
    server.use(http.middleware.cacheControl as express.RequestHandler);
    server.use('/redbox', serveStatic(publicDir));
    const response = await request(server).get(`/redbox${bundles[0]}?v=2`).expect(200);
    expect(response.headers['cache-control']).to.equal('public, max-age=31536000, immutable');
  });

  it('lets redirect headers override immutable caching', async function () {
    const response = await request(app()).get('/angular/local-auth/browser/main-REDIRECT.js').expect(302);
    expect(response.headers['cache-control']).to.equal('no-cache, no-store, must-revalidate');
    expect(response.headers.expires).to.equal('0');
  });

  it('retains the existing private cache policy for dynamic routes', async function () {
    const server = app();
    server.get('/default/rdmp/record', (_req, res) => res.send('record'));
    const response = await request(server).get('/default/rdmp/record').expect(200);
    expect(response.headers['cache-control']).to.equal('max-age=600, private');
  });
});
