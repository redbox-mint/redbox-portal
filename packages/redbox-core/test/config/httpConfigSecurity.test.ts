import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import express from 'express';
import supertest from 'supertest';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { ApplicationRuntime } from '../../src/application';
import { escapeHtmlText } from '@researchdatabox/sails-ng-common';
import {
  buildCompanionSendTokenConfig,
  buildCompanionSendTokenHtml,
  isImmutableAssetPath,
  PageArtifacts,
  mountStaticPageArtifacts,
  applyPageHeaders,
  ExpressHost,
  HttpIdentity,
  prepareHttpMiddleware,
  httpErrorHandler,
} from '../../src/http/express';

let expect!: Chai.ExpectStatic;

describe('HTTP config security helpers', function () {
  before(async function () {
    ({ expect } = await import('chai'));
  });

  describe('Companion send-token response', function () {
    it('should escape malicious provider values out of inert HTML text content', function () {
      const appUrl = 'https://portal.example.edu/default/rdmp';
      const provider = 'drive</script><script>alert(1)</script>';
      const html = buildCompanionSendTokenHtml(appUrl, provider);
      const expectedConfigJson = escapeHtmlText(JSON.stringify(buildCompanionSendTokenConfig(appUrl, provider)));

      expect(html).to.include('<div hidden id="companion-send-token-config">');
      expect(html).not.to.include('drive</script><script>alert(1)</script>');
      expect(html).to.include(expectedConfigJson);
    });

    it('should normalize configured appUrl to an origin', function () {
      const config = buildCompanionSendTokenConfig('https://portal.example.edu/default/rdmp?x=1', 'drive');

      expect(config.targetOrigin).to.equal('https://portal.example.edu');
      expect(config.provider).to.equal('drive');
      expect(config.secureCookie).to.equal(true);
    });

    it('should keep invalid appUrl as inert data without executing injected HTML', function () {
      const html = buildCompanionSendTokenHtml('"><img src=x onerror=alert(1)>', 'drive');

      expect(html).not.to.include('"><img src=x onerror=alert(1)>');
      expect(html).to.include('&quot;targetOrigin&quot;:&quot;\\&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&quot;');
    });

    it('should mark HTTPS send-token cookies as Secure', function () {
      const appUrl = 'https://portal.example.edu';
      const provider = 'onedrive';
      const html = buildCompanionSendTokenHtml(appUrl, provider);
      const expectedConfigJson = escapeHtmlText(JSON.stringify(buildCompanionSendTokenConfig(appUrl, provider)));

      expect(html).to.include("config.secureCookie?'; Secure':''");
      expect(html).to.include(expectedConfigJson);
    });
  });

  describe('declared static routing path protection', () => {
    let directory: string;
    let artifacts: PageArtifacts;
    beforeEach(async () => {
      directory = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-static-path-'));
      await fs.mkdir(path.join(directory, 'default/rdmp_portal-1/assets'), { recursive: true });
      await fs.writeFile(path.join(directory, 'default/rdmp_portal-1/assets/app.js'), 'safe');
      artifacts = new PageArtifacts([directory], [directory]);
    });
    afterEach(async () => fs.rm(directory, { recursive: true, force: true }));
    function request() {
      const app = express();
      mountStaticPageArtifacts(app, artifacts);
      return supertest(app);
    }
    it('accepts simple branding and portal segments', async () => {
      expect((await request().get('/default/rdmp_portal-1/assets/app.js').expect(200)).text).to.equal('safe');
    });
    it('rejects malicious branding and portal segments', async () => {
      for (const name of ['../default', '%2e%2e', 'default<script>', ''])
        expect(artifacts.find(artifacts.assets, `${name}/rdmp/assets/app.js`)).to.equal(undefined);
    });
    it('excludes query data from resource paths and rejects traversal', async () => {
      expect((await request().get('/default/rdmp_portal-1/assets/app.js?cache=1').expect(200)).text).to.equal('safe');
      for (const name of ['../secrets.txt', '%2e%2e/secrets.txt', '/absolute/path', 'assets/%2e%2e/secrets.txt'])
        expect(artifacts.find(artifacts.assets, name)).to.equal(undefined);
    });
    it('resolves assets only under declared roots', () => {
      expect(artifacts.find(artifacts.assets, 'default/rdmp_portal-1/assets/app.js')).to.equal(
        path.join(directory, 'default/rdmp_portal-1/assets/app.js')
      );
      expect(artifacts.find(artifacts.assets, 'default/../../secrets.txt')).to.equal(undefined);
    });
    it('marks only fingerprinted static paths immutable', () => {
      expect(isImmutableAssetPath('/default/default/angular/form/browser/main-ABC123DEF.js')).to.equal(true);
      expect(isImmutableAssetPath('/default/default/angular/form/browser/styles-ABC123DEF.css')).to.equal(true);
      for (const name of [
        '/default/default/js/index.bundle.js',
        '/default/default/js/jquery.min.js',
        '/default/default/images/logo.png',
        '/api/main-ABC123DEF.js',
      ])
        expect(isImmutableAssetPath(name)).to.equal(false);
    });
  });

  describe('owned cache-control response headers', () => {
    function headers(
      pathname: string,
      session: { cookie?: { maxAge?: number } } | false = { cookie: { maxAge: 600000 } },
      noCache: string[] = [],
      publicUrl = 'https://portal.example.edu'
    ) {
      const app = express();
      app.use((req, res) => {
        applyPageHeaders(
          req,
          res,
          { sessionMaxAgeMs: session ? session.cookie?.maxAge : undefined, noCache, publicUrl },
          true
        );
        res.end();
      });
      return supertest(app).get(pathname);
    }
    it('preserves immutable caching for fingerprinted Angular artifacts', async () => {
      const response = await headers('/default/default/angular/form/browser/main-ABC123DEF.js');
      expect(response.headers['cache-control']).to.equal('public, max-age=31536000, immutable');
      expect(response.headers.pragma).to.equal(undefined);
      expect(response.headers['cross-origin-opener-policy']).to.equal('same-origin-allow-popups');
    });
    it('preserves private session-age caching for unversioned bundles', async () => {
      const response = await headers('/default/default/js/index.bundle.js');
      expect(response.headers['cache-control']).to.equal('max-age=600, private');
      expect(response.headers.pragma).to.equal('no-cache');
      expect(response.headers['cross-origin-opener-policy']).to.equal('same-origin-allow-popups');
    });
    it('omits the HTTPS-only opener policy on a configured HTTP origin despite forwarded protocol headers', async () => {
      const response = await headers('/default/default/js/index.bundle.js', false, [], 'http://redboxportal:1500').set(
        'X-Forwarded-Proto',
        'https'
      );
      expect(response.headers['cross-origin-opener-policy']).to.equal(undefined);
      expect(response.headers['cache-control']).to.equal('max-age=31536000, private');
    });
    it('retains the opener policy for a configured HTTPS origin despite forwarded HTTP headers', async () => {
      const response = await headers('/default/default/js/index.bundle.js').set('X-Forwarded-Proto', 'http');
      expect(response.headers['cross-origin-opener-policy']).to.equal('same-origin-allow-popups');
    });
    for (const { description, session, expected } of [
      { description: 'zero-age fallback', session: { cookie: { maxAge: 0 } }, expected: 'max-age=31536000, private' },
      { description: 'positive cookie age', session: { cookie: { maxAge: 600000 } }, expected: 'no-cache, no-store' },
      { description: 'unset cookie age', session: { cookie: {} }, expected: 'no-cache, no-store' },
      { description: 'unset cookie config', session: {}, expected: 'no-cache, no-store' },
      { description: 'no cookie lifetime', session: false as const, expected: 'no-cache, no-store' },
    ])
      it(`honors configured no-cache suffixes with ${description}`, async () => {
        expect(
          (await headers('/default/default/js/index.bundle.js', session, ['/js/index.bundle.js'])).headers[
            'cache-control'
          ]
        ).to.equal(expected);
      });
  });

  describe('explicit raw parser mounts', () => {
    let host: ExpressHost;
    let url: string;
    afterEach(async () => host?.stop());
    async function fixture(exclusions: string[]) {
      const owner = { config: {}, log: nothingLogger };
      host = new ExpressHost(new ApplicationRuntime(owner), {
        owner,
        hostname: '127.0.0.1',
        port: 0,
        prepare: async router => {
          await prepareHttpMiddleware(router, {
            owner,
            identity: new HttpIdentity({
              one: async () => null,
              verifyPassword: async () => false,
              findByApiTokenHash: async () => null,
            }),
            session: { secret: 'parser-fixture-at-least-32-characters', cookie: { secure: false } },
            log: nothingLogger,
            parserExclusions: exclusions,
          });
          router.use(express.raw({ type: 'application/json' }));
          router.use((req, res) =>
            res.json({
              raw: Buffer.isBuffer(req.body),
              value: Buffer.isBuffer(req.body) ? req.body.toString() : req.body,
            })
          );
          router.use(httpErrorHandler(nothingLogger));
        },
      });
      await host.initialize();
      await host.activate();
      url = `http://127.0.0.1:${host.address()!.port}`;
    }
    async function post(pathname: string) {
      const response = await fetch(url + pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"value":"kept"}',
      });
      expect(response.status).to.equal(200);
      return response.json() as Promise<{ raw: boolean; value: unknown }>;
    }
    it('matches explicit raw mount boundaries, case and query/trailing slash handling', async () => {
      await fixture(['/default/rdmp/raw']);
      for (const pathname of [
        '/default/rdmp/raw',
        '/default/rdmp/raw/oid-1',
        '/DEFAULT/RDMP/raw?foo=bar',
        '/default/rdmp/raw/',
      ])
        expect((await post(pathname)).raw).to.equal(true);
      expect((await post('/default/rdmp/raw-other')).raw).to.equal(false);
      expect((await post('/raw')).raw).to.equal(false);
    });
    it('supports additional authored raw mounts beside upload mounts', async () => {
      await fixture(['/default/rdmp/raw', '/default/rdmp/hook/callback']);
      expect((await post('/default/rdmp/hook/callback')).raw).to.equal(true);
      expect((await post('/default/rdmp/raw')).raw).to.equal(true);
      expect((await post('/hook/callback')).raw).to.equal(false);
      expect((await post('/default/rdmp/hook/other')).raw).to.equal(false);
    });
    it('reads exclusions from application inputs without global configuration', async () => {
      await fixture(['/default/rdmp/hook/callback']);
      expect(await post('/default/rdmp/hook/callback')).to.deep.equal({ raw: true, value: '{"value":"kept"}' });
    });
    it('delegates non-matching requests to the owned Express parser', async () => {
      await fixture(['/default/rdmp/hook/callback']);
      expect(await post('/default/rdmp/hook/other')).to.deep.equal({ raw: false, value: { value: 'kept' } });
    });
  });
});
