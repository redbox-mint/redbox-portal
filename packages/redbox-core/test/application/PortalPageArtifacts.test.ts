import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type RequestHandler } from 'express';
import sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { PortalHttp } from '../../src/application/portal/http';
import { PageArtifacts } from '../../src/pages/Artifacts';
import {
  mountStaticPageArtifacts,
  mountBrandingDeliveryRoutes,
  mountDynamicPageAssets,
} from '../../src/http/express/pageAssets';
import * as persistence from '../../src/persistence/branding/runtime';
import { createHttpPolicies } from '../../src/http/express/policies';

describe('production page artifact precedence', () => {
  it('asserts the complete asset order across sources, specificity, generated routes and bundle selection', async function () {
    // The serial HTTP/filesystem precedence matrix exceeds the unit suite's five-second budget.
    this.timeout(30_000);
    const directory = await mkdtemp(join(tmpdir(), 'sr-portal-assets-'));
    const sandbox = sinon.createSandbox();
    sandbox.stub(persistence, 'getBrandingRepository').returns({} as never);
    const compiled = join(directory, '.tmp/public');
    const high = join(directory, 'hook-high');
    const low = join(directory, 'hook-low');
    const source = join(directory, 'assets');
    const explicit = [join(directory, 'application-high'), join(directory, 'application-low')];
    const write = async (file: string, bytes: string) => {
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, bytes);
    };
    try {
      await mkdir(join(directory, 'views'));
      for (const root of [compiled, high, low, source, ...explicit]) await mkdir(root, { recursive: true });
      for (const applicationRoots of [undefined, explicit]) {
        const server = createServer();
        let http: PortalHttp | undefined;
        try {
          const portal = {
            owner: {},
            log: nothingLogger,
            resolved: { views: [], assets: [high, low] },
            config: {
              companion: { enabled: false },
              branding: {},
              record: { maxUploadSize: 1000 },
              server: { rootContext: '', publicUrl: 'http://localhost:1500' },
            },
            data: {
              disks: { get: () => ({ stagingDisk: () => ({}), getStagingDiskConfig: () => ({ driver: 's3' }) }) },
              records: { get: () => ({}) },
              progress: { get: () => ({}) },
            },
          };
          http = new PortalHttp(portal as never, { appPath: directory, assetRoots: applicationRoots });
          await http.initialize();
          const artifacts: PageArtifacts = Reflect.get(http, 'artifacts');
          const roots = [...(applicationRoots ?? [compiled]), high, low, source];
          assert.deepEqual(artifacts.assets, roots);
          const router = express();
          router.use((req, _res, next) => {
            req.session = {} as never;
            next();
          });
          const pass: RequestHandler = (_req, _res, next) => next();
          const policies = {
            ...createHttpPolicies({
              branding: { getBrand: async () => ({ id: 'brand', name: 'institution' }) } as never,
              portals: ['rdmp'],
            } as never),
            browseractor: pass,
            checkauth: pass,
            nocache: pass,
          };
          const brand = { id: 'brand', name: 'institution', css: '', logo: { storageKey: 'logo' } };
          mountBrandingDeliveryRoutes(router, {
            artifacts,
            policies,
            policyConfiguration: { '*': true },
            csrf: { protect: pass } as never,
            delivery: {
              repository: () => ({ getBrand: async () => brand }),
              theme: { generate: () => ({ css: 'body { color: red; }', hash: 'theme' }) },
              typeface: { readFace: async () => Buffer.from('stored-font') },
              logos: {
                getBinaryAsync: async () => Buffer.from('stored-logo'),
                getCurrentFaviconBinary: async () => ({ buffer: Buffer.from('stored-favicon'), favicon: {} }),
              },
              branding: { fetchPreview: async () => ({ css: 'preview-css', hash: 'preview' }) },
              staticAssets: { imageType: 'image/png', faviconType: 'image/png' },
              log: nothingLogger,
            } as never,
          });
          mountDynamicPageAssets(router, {
            artifacts,
            policies,
            policyConfiguration: { '*': true },
            config: { appUrl: 'http://configured.example' },
            defaultBrand: 'institution',
            defaultPortal: 'rdmp',
          } as never);
          mountStaticPageArtifacts(router, artifacts);
          server.on('request', router);
          await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
          const address = server.address();
          assert(address && typeof address !== 'string');
          const base = `http://127.0.0.1:${address.port}`;
          const rows = [
            // Every legacy hook-static folder, including compiled/generated app output.
            ...[
              'js/index.bundle.js',
              'styles/style.min.css',
              'images/logo.png',
              'fonts/face.woff2',
              'angular/form/browser/main-HASH.js',
              'icons/HASH.svg',
            ].flatMap(resource => [
              {
                url: '/institution/rdmp/' + resource,
                candidates: ['institution/rdmp/', 'default/rdmp/', 'default/default/'].map(prefix => prefix + resource),
              },
              { url: '/' + resource, candidates: [resource] },
            ]),
            // Other files copied/synced to the public tree have the same root order.
            ...[
              'favicon.ico',
              'favicon-32x32.png',
              'apple-touch-icon.png',
              'site.webmanifest',
              'robots.txt',
              'locales/en/translation.json',
              'node_modules/vendor/script.js',
            ].map(resource => ({ url: '/' + resource, candidates: [resource] })),
          ];
          for (const row of rows) {
            const files = row.candidates.flatMap(candidate =>
              roots.map((root, index) => ({
                file: join(root, candidate),
                bytes: `${candidate}:source-${index}`,
              }))
            );
            for (const entry of files) await write(entry.file, entry.bytes);
            // Removing each winner proves every lower level, not just the first result.
            for (const entry of files) {
              const response = await fetch(base + row.url);
              assert.equal(response.status, 200, row.url);
              assert.equal(await response.text(), entry.bytes, `${row.url}: ${entry.file}`);
              await rm(entry.file);
            }
            assert.equal((await fetch(base + row.url)).status, 404, row.url);
          }
          for (const root of roots)
            await write(join(root, 'angular/example/browser/main-' + roots.indexOf(root) + '.js'), 'bundle');
          for (const root of roots) {
            assert.equal(artifacts.bundleHash('example', 'main'), String(roots.indexOf(root)));
            await rm(join(root, 'angular/example/browser/main-' + roots.indexOf(root) + '.js'));
          }
          for (const [url, expected] of [
            ['/institution/rdmp/styles/theme.css', 'body{color:red}'],
            ['/institution/rdmp/preview/token.css', 'preview-css'],
            ['/institution/rdmp/images/logo', 'stored-logo'],
            ['/institution/rdmp/images/favicon', 'stored-favicon'],
            ['/fonts/branding/institution/' + 'a'.repeat(64) + '.woff2', 'stored-font'],
            ['/institution/rdmp/dynamic/apiClientConfig', 'http://configured.example'],
            ['/institution/rdmp/api-docs.json', 'openapi'],
          ]) {
            for (const root of roots) await write(join(root, url.slice(1)), 'static-shadow');
            const response = await fetch(base + url);
            assert.equal(response.status, 200);
            assert((await response.text()).includes(expected));
          }
          brand.css = 'body { color: blue; }';
          // A publication changes the generated theme, even with static shadows present.
          const published = await fetch(base + '/institution/rdmp/styles/theme.css');
          assert.equal(await published.text(), 'body{color:#00f}');
        } finally {
          if (server.listening)
            await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
          await http?.close();
        }
      }
    } finally {
      sandbox.restore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
