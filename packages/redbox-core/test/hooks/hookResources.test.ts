import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadInstalledExtensionProvidersV2, resolveExtensionsV2 } from '../../src/extensions/v2';
import { PageArtifacts } from '../../src/pages/Artifacts';

async function loadResources(appPath: string, options: { includeDevDependencies?: boolean } = {}) {
  const installed = await loadInstalledExtensionProvidersV2(appPath, options);
  return resolveExtensionsV2(installed.providers, {
    hookLoadPriority: installed.hookLoadPriority,
    bindings: [],
    routing: { policyNames: [] },
  });
}

describe('declared extension page resources', () => {
  let appPath: string;
  const dependencies = {
    'redbox-hook-alpha': '1.0.0',
    'redbox-hook-beta': '1.0.0',
    'redbox-hook-empty': '1.0.0',
    'not-a-hook': '1.0.0',
  };
  async function manifest(hookLoadPriority: string[] = []) {
    await fs.writeFile(
      path.join(appPath, 'package.json'),
      JSON.stringify({ dependencies, devDependencies: { 'redbox-hook-dev-only': '1.0.0' }, hookLoadPriority })
    );
  }
  async function write(file: string, content: string) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  beforeEach(async () => {
    appPath = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-extension-resources-'));
    await manifest();
    for (const name of [...Object.keys(dependencies), 'redbox-hook-dev-only']) {
      const root = path.join(appPath, 'node_modules', name);
      await write(
        path.join(root, 'package.json'),
        JSON.stringify({
          name,
          version: '1.0.0',
          main: 'index.js',
          ...(name === 'not-a-hook' ? {} : { redbox: { extension: '.' } }),
        })
      );
      const declarations = name.endsWith('empty') ? {} : { views: ['views'], assets: ['assets'] };
      await write(
        path.join(root, 'index.js'),
        'exports.registerRedboxExtension = () => (' + JSON.stringify({ apiVersion: 2, ...declarations }) + ');'
      );
      for (const directory of ['views', 'assets']) await fs.mkdir(path.join(root, directory));
    }
  });
  afterEach(async () => fs.rm(appPath, { recursive: true, force: true }));
  it('uses explicit resource declarations from dependency and enabled development extensions', async () => {
    const result = await loadResources(appPath, { includeDevDependencies: true });
    assert.deepEqual(
      result.views.map(root => path.basename(path.dirname(root))),
      ['redbox-hook-dev-only', 'redbox-hook-beta', 'redbox-hook-alpha']
    );
    assert.deepEqual(
      result.assets.map(root => path.basename(path.dirname(root))),
      ['redbox-hook-dev-only', 'redbox-hook-beta', 'redbox-hook-alpha']
    );
  });
  it('returns resource roots in runtime override order', async () => {
    const result = await loadResources(appPath);
    for (const kind of ['views', 'assets'] as const)
      assert.deepEqual(
        result[kind],
        ['redbox-hook-beta', 'redbox-hook-alpha'].map(name => path.join(appPath, 'node_modules', name, kind))
      );
  });
  it('resolves a later package before an earlier package for the same view', async () => {
    for (const name of ['redbox-hook-alpha', 'redbox-hook-beta'])
      await write(path.join(appPath, 'node_modules', name, 'views/default/default/homepage.ejs'), name);
    const result = await loadResources(appPath);
    const artifacts = new PageArtifacts(result.views, result.assets);
    assert.equal(
      artifacts.view('homepage', 'default', 'default'),
      path.join(appPath, 'node_modules/redbox-hook-beta/views/default/default/homepage.ejs')
    );
  });
  it('resolves listed priorities before unlisted view and asset roots', async () => {
    await manifest(['redbox-hook-alpha']);
    for (const name of ['redbox-hook-alpha', 'redbox-hook-beta']) {
      await write(path.join(appPath, 'node_modules', name, 'views/default/default/homepage.ejs'), name);
      await write(path.join(appPath, 'node_modules', name, 'assets/styles/client-branding.css'), name);
    }
    const result = await loadResources(appPath);
    const artifacts = new PageArtifacts(result.views, result.assets);
    assert.equal(
      artifacts.view('homepage', 'default', 'default'),
      path.join(appPath, 'node_modules/redbox-hook-alpha/views/default/default/homepage.ejs')
    );
    assert.equal(
      artifacts.find(result.assets, 'styles/client-branding.css'),
      path.join(appPath, 'node_modules/redbox-hook-alpha/assets/styles/client-branding.css')
    );
  });
  it('resolves declared assets and rejects traversal, encoded escape and outside-root symlinks', async () => {
    const root = path.join(appPath, 'node_modules/redbox-hook-alpha/assets');
    await write(path.join(root, 'styles/client-branding.css'), 'body{}');
    await write(path.join(appPath, 'secret.txt'), 'private');
    await fs.symlink(path.join(appPath, 'secret.txt'), path.join(root, 'escape.txt'));
    const result = await loadResources(appPath);
    const artifacts = new PageArtifacts(result.views, result.assets);
    assert.equal(
      artifacts.find(result.assets, 'styles/client-branding.css'),
      path.join(root, 'styles/client-branding.css')
    );
    for (const name of ['../secret.txt', '%2e%2e/secret.txt', 'escape.txt'])
      assert.equal(artifacts.find(result.assets, name), undefined);
    assert.equal(artifacts.view('default/default/%2e%2e/secret', 'default', 'default'), undefined);
  });
});
