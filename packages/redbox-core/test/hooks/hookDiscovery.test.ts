import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverInstalledExtensions, loadExtensions } from '../../src/extensions';

describe('installed extension discovery and precedence', () => {
  let appPath: string;
  const dependencies = { 'redbox-hook-alpha': '1.0.0', 'redbox-hook-beta': '1.0.0', 'not-a-hook': '1.0.0' };
  const devDependencies = { '@scope/redbox-hook-gamma': '1.0.0' };
  async function manifest(priority?: unknown) {
    await fs.writeFile(path.join(appPath, 'package.json'), JSON.stringify({ dependencies, devDependencies, ...(priority === undefined ? {} : { hookLoadPriority: priority }) }));
  }
  beforeEach(async () => {
    appPath = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-extension-discovery-'));
    await manifest();
    for (const name of [...Object.keys(dependencies), ...Object.keys(devDependencies)]) {
      const root = path.join(appPath, 'node_modules', name);
      await fs.mkdir(root, { recursive: true });
      await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...(name === 'not-a-hook' ? {} : { redbox: { extension: '.' } }) }));
      await fs.writeFile(path.join(root, 'index.js'), 'exports.registerRedboxExtension = async () => ({ apiVersion: 1, views: ["views"] });');
    }
  });
  afterEach(async () => fs.rm(appPath, { recursive: true, force: true }));
  it('preserves descending-name lookup and explicit development allowlisting', async () => {
    const production = await loadExtensions(appPath);
    assert.deepEqual(production.providers.map(p => p.name), ['redbox-hook-alpha', 'redbox-hook-beta']);
    const development = await loadExtensions(appPath, { includeDevDependencies: true });
    assert.deepEqual(development.providers.map(p => p.name), ['@scope/redbox-hook-gamma', 'redbox-hook-alpha', 'redbox-hook-beta']);
    assert.deepEqual(development.views, ['redbox-hook-beta', 'redbox-hook-alpha', '@scope/redbox-hook-gamma'].map(name => path.join(appPath, 'node_modules', name, 'views')));
  });
  it('places listed hooks first for lookup and unlisted hooks after them', async () => {
    await manifest(['redbox-hook-alpha', '@scope/redbox-hook-gamma']);
    const result = await loadExtensions(appPath, { includeDevDependencies: true });
    assert.deepEqual(result.providers.map(p => p.name), ['redbox-hook-beta', '@scope/redbox-hook-gamma', 'redbox-hook-alpha']);
    assert.deepEqual(result.views, ['redbox-hook-alpha', '@scope/redbox-hook-gamma', 'redbox-hook-beta'].map(name => path.join(appPath, 'node_modules', name, 'views')));
  });
  it('deduplicates valid priorities and rejects invalid or undiscovered entries', async () => {
    await manifest(['redbox-hook-alpha', 'redbox-hook-alpha']);
    assert.deepEqual((await discoverInstalledExtensions(appPath)).hookLoadPriority, ['redbox-hook-alpha']);
    for (const entry of ['', 42]) {
      await manifest(['redbox-hook-alpha', entry]);
      await assert.rejects(loadExtensions(appPath), /hookLoadPriority must contain package names/);
    }
    await manifest(['redbox-hook-missing']);
    await assert.rejects(loadExtensions(appPath), /undiscovered extension/);
  });
  it('rejects a non-array priority before application acquisition', async () => {
    await manifest('redbox-hook-alpha');
    await assert.rejects(loadExtensions(appPath), /hookLoadPriority must contain package names/);
  });
});
