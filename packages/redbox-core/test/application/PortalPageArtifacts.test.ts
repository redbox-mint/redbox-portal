import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PageArtifacts } from '../../src/pages/Artifacts';
import { referenceProductionFixture } from '../http/fastify/referenceProductionFixture';
import { referenceReadDeclarations } from '../../src/http/referenceRoutes';

describe('production page artifact precedence', () => {
  it('asserts the complete asset order across sources, specificity, generated routes and bundle selection', async function () {
    // The serial HTTP/filesystem precedence matrix exceeds the unit suite's five-second budget.
    this.timeout(120_000);
    for (const explicit of [false, true]) {
      const pageOptions: { assetRoots?: string[] } = {};
      let roots: string[] = [];
      const write = async (file: string, bytes: string) => {
        await mkdir(join(file, '..'), { recursive: true });
        await writeFile(file, bytes);
      };
      const f = await referenceProductionFixture(true, { '*': true }, undefined, {
        declarations: referenceReadDeclarations, pages: pageOptions, rootContext: '',
        artifacts: async (directory, provider) => {
          const compiled = join(directory, '.tmp/public');
          const high = join(provider, 'hook-high'), low = join(provider, 'hook-low');
          const source = join(directory, 'assets');
          const application = [join(directory, 'application-high'), join(directory, 'application-low')];
          for (const root of [compiled, high, low, source, ...application]) await mkdir(root, { recursive: true });
          const file = join(provider, 'index.cjs');
          await writeFile(file, (await readFile(file, 'utf8')).replace('apiVersion:', "assets:['hook-high','hook-low'],apiVersion:"));
          if (explicit) pageOptions.assetRoots = application;
          roots = [...(explicit ? application : [compiled]), high, low, source];
        },
      });
      try {
        assert.equal(f.host.constructor.name, 'FastifyHost');
        const pages = (f.portal as any).installation.pages;
        const artifacts: PageArtifacts = pages.artifacts;
        assert.deepEqual(artifacts.assets, roots);
        const brand = { ...f.otherBrand, css: '', logo: { storageKey: 'logo' } };
        // Byte-producing ports are fixtures; all route selection, policies,
        // precedence and delivery use the real installed native controllers.
        Object.assign(Reflect.get(pages.delivery, 'input'), {
          repository: () => ({ getBrand: async () => brand }),
          theme: { generate: () => ({ css: 'body { color: red; }', hash: 'theme' }) },
          typeface: { readFace: async () => Buffer.from('stored-font') },
          logos: { getBinaryAsync: async () => Buffer.from('stored-logo'),
            getCurrentFaviconBinary: async () => ({ buffer: Buffer.from('stored-favicon'), favicon: {} }) },
          branding: { fetchPreview: async () => ({ css: 'preview-css', hash: 'preview' }) },
        });
        pages.dynamic.config.appUrl = 'http://configured.example';
        const base = f.url;
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
                url: '/other/rdmp/' + resource,
                candidates: ['other/rdmp/', 'default/rdmp/', 'default/default/'].map(prefix => prefix + resource),
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
            ['/other/rdmp/styles/theme.css', 'body{color:red}'],
            ['/other/rdmp/preview/token.css', 'preview-css'],
            ['/other/rdmp/images/logo', 'stored-logo'],
            ['/other/rdmp/images/favicon', 'stored-favicon'],
            ['/fonts/branding/other/' + 'a'.repeat(64) + '.woff2', 'stored-font'],
            ['/other/rdmp/dynamic/apiClientConfig', 'http://configured.example'],
            ['/other/rdmp/api-docs.json', 'openapi'],
          ]) {
            for (const root of roots) await write(join(root, url.slice(1)), 'static-shadow');
            const response = await fetch(base + url);
            assert.equal(response.status, 200);
            assert((await response.text()).includes(expected));
          }
          brand.css = 'body { color: blue; }';
          // A publication changes the generated theme, even with static shadows present.
          const published = await fetch(base + '/other/rdmp/styles/theme.css');
          assert.equal(await published.text(), 'body{color:#00f}');
      } finally { await f.close(); }
    }
  });
});
