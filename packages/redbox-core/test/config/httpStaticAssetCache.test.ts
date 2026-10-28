import express from 'express';
import { rateLimit } from 'express-rate-limit';
import sinon from 'sinon';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { http, isImmutableAssetPath } from '../../src/config/http.config';
import { notFound } from '../../src/responses/notFound';

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
  '/locales/en/translation-core.json',
  '/android-chrome-192x192.png',
  '/favicon.ico',
  '/robots.txt',
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

  function app(rootContext = '', missingResponse?: 'json' | 'html' | 'fallback' | 'views-disabled'): express.Express {
    (global as any).sails.config.http.rootContext = rootContext;
    const server = express();
    server.set('views', path.join(appPath, 'views'));
    server.set('view engine', 'ejs');
    // Sails runs cacheControl before its root-context-aware static handlers.
    server.use(http.middleware.cacheControl as express.RequestHandler);
    // Model deployment under an Express mount/reverse proxy root context.
    const router = express.Router();
    // CodeQL js/missing-rate-limiting flagged the real branded router filesystem
    // lookups here (PR #5095, alert #154). Retain this modeled boundary and its
    // 429 test rather than suppressing analysis or replacing production routing.
    // This limiter belongs only to the standalone HTTP fixture.
    // Each deployment instance needs at most two requests (GET and revalidation).
    // Root dependencies include Express 4 types; this fixture uses core Express 5.
    router.use(rateLimit({ windowMs: 60000, limit: 3 }) as unknown as express.RequestHandler);
    router.use((_req, res, next) => {
      res.cookie('cache-test', 'session');
      next();
    });
    router.use(http.middleware.redirectNoCacheHeaders as express.RequestHandler);
    router.get('/angular/local-auth/browser/main-REDIRECT.js', (_req, res) => res.redirect('/login'));
    router.use(http.middleware.hookStaticAssets as express.RequestHandler);
    router.use(http.middleware.brandingAndPortalAwareStaticRouter as express.RequestHandler);
    router.use(serveStatic(publicDir, { maxAge: 31557600000 }));
    if (missingResponse) {
      router.use((req, res) => {
        const sailsReq = req as unknown as Sails.Req;
        sailsReq._sails = (global as any).sails;
        sailsReq.wantsJSON = missingResponse === 'json';
        sailsReq.options = {};
        // Adapt Sails' view API to Express/EJS, retaining the real repository
        // notFound -> sendView -> terminal fallback implementation.
        const sailsRes = res as unknown as Sails.Res;
        sailsRes.view = ((view: string, locals: object) => res.render(view, locals)) as typeof sailsRes.view;
        notFound.call({ req: sailsReq, res: sailsRes }, 'missing bundle');
      });
    }
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
      hooks: { views: true }, ng2: { use_bundled: false, apps: {} },
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

  for (const rootContext of ['', '/redbox', '/service/redbox']) {
    for (const assetRoot of ['core', 'hook']) {
      it(`honors configured no-store for fingerprinted bundles (${assetRoot}, context '${rootContext}')`, async function () {
        const url = bundles[0];
        write(assetRoot === 'core' ? publicDir : hookDir, url, 'explicitly private bundle');
        // Match the original request path, including a configured root context.
        (global as any).sails.config.custom.cacheControl.noCache = [`${rootContext}${url}`];
        const response = await request(app(rootContext)).get(`${rootContext}${url}?v=2`).expect(200);
        expect(response.headers['cache-control']).to.equal('no-cache, no-store');
        expect(response.headers.expires).to.equal(new Date(0).toUTCString());
        expect(response.headers.pragma).to.equal('no-cache');
        expect(response.headers['set-cookie']).to.include('cache-test=session; Path=/');
      });
    }

    for (const mode of ['json', 'html', 'fallback', 'views-disabled'] as const) {
      it(`does not cache a missing bundle and serves it when available (${mode}, context '${rootContext}')`, async function () {
        if (mode === 'html') {
          write(appPath, '/views/default/default/404.ejs', '<h1>Missing bundle</h1>');
        }
        if (mode === 'views-disabled') {
          (global as any).sails.config.hooks.views = false;
        }
        const server = app(rootContext, mode);
        const url = `${rootContext}${bundles[0]}?deploy=2`;
        const missing = await request(server).get(url).expect(404);
        expect(missing.headers['cache-control']).to.equal('no-cache, no-store, must-revalidate');
        expect(missing.headers.pragma).to.equal('no-cache');
        expect(missing.headers.expires).to.equal('0');
        expect(missing.text).to.equal(mode === 'html' ? '<h1>Missing bundle</h1>'
          : mode === 'fallback' ? '404 Not Found' : '"missing bundle"');

        write(publicDir, bundles[0], 'newly available bundle');
        const available = await request(server).get(url).expect(200);
        expect(available.text).to.equal('newly available bundle');
        expect(available.headers['cache-control']).to.equal('public, max-age=31536000, immutable');
        expect(available.headers.pragma).to.equal(undefined);
        expect(available.headers['set-cookie']).to.equal(undefined);
        expect(Date.parse(available.headers.expires)).to.be.greaterThan(Date.now() + 31535000000);
      });
    }
  }

  // Opt in after a real production build; no copied filename/hash fixtures.
  (process.env.REDBOX_ANGULAR_BROWSER_OUTPUT ? it : it.skip)('serves actual production build output with immutable bundle headers', async function () {
    const output = path.resolve(process.env.REDBOX_ANGULAR_BROWSER_OUTPUT!);
    const index = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    const entrypoints = Array.from(index.matchAll(/(?:src|href)="([^"/]+\.(?:js|css))"/g), match => match[1]);
    expect(entrypoints.length, 'production index entrypoints').to.be.greaterThan(0);
    const emittedBundles = fs.readdirSync(output).filter(file => ['.js', '.css'].includes(path.extname(file)));
    expect(emittedBundles, 'include entrypoints and lazy/shared chunks').to.include.members(entrypoints);
    expect(emittedBundles.length).to.be.greaterThan(entrypoints.length);
    for (const file of emittedBundles) {
      const bytes = fs.readFileSync(path.join(output, file));
      const url = `/angular/local-auth/browser/${file}`;
      write(publicDir, url, bytes.toString());
      const response = await request(app('/redbox')).get(`/redbox${url}`).expect(200);
      expect(response.headers['cache-control'], file).to.equal('public, max-age=31536000, immutable');
      expect(response.text, file).to.equal(bytes.toString());
    }
  });

  it('preserves revalidation through branded core fallback and ignores session lifetime for assets', async function () {
    write(publicDir, '/default/default/images/checklist.png', 'fallback');
    for (const maxAge of [0, undefined, 600000]) {
      (global as any).sails.config.session.cookie = { maxAge };
      const response = await request(app()).get('/brand/rdmp/images/checklist.png?deploy=2').expect(200);
      expect(response.headers['cache-control']).to.equal('no-cache');
    }
  });

  for (const assetRoot of ['core', 'hook']) {
    for (const fallback of ['default/rdmp', 'default/default']) {
      it(`revalidates branded fallback (${assetRoot}, ${fallback}, nested context)`, async function () {
        write(assetRoot === 'core' ? publicDir : hookDir, `/${fallback}/images/checklist.png`, 'fallback bytes');
        const url = '/service/redbox/brand/rdmp/images/checklist.png?deploy=2';
        const first = await request(app('/service/redbox')).get(url).expect(200);
        expect(first.headers['cache-control']).to.equal('no-cache');
        expect(first.body.toString()).to.equal('fallback bytes');
        await request(app('/service/redbox')).get(url).set('If-None-Match', first.headers.etag).expect(304);
      });
    }
  }

  it('supports explicit no-store policy for custom core static directories without treating extensions as static', async function () {
    write(publicDir, '/downloads/help.pdf', 'custom static file');
    (global as any).sails.config.custom.cacheControl.noCache = ['/downloads/help.pdf'];
    const response = await request(app('/redbox')).get('/redbox/downloads/help.pdf').expect(200);
    expect(response.headers['cache-control']).to.equal('no-cache, no-store');
    expect(response.body.toString()).to.equal('custom static file');
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
    // TranslationController and custom controller routes must not be classified
    // as static just because their URLs have a filename extension.
    for (const url of ['/default/rdmp/record', '/default/rdmp/locales/en/translation.json', '/reports/latest.csv']) {
      server.get(url, (_req, res) => res.send('dynamic response'));
      const response = await request(server).get(url).expect(200);
      expect(response.headers['cache-control'], url).to.equal('max-age=600, private');
    }
  });
});
