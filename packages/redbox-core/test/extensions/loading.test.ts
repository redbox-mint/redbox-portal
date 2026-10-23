import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverInstalledExtensions, extensionRegistration, loadExtensionModule } from '../../src/extensions/loading';

describe('installed async extensions', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'redbox-extensions-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  async function fixture(name: string, manifest: object, source: string) {
    const directory = path.join(root, 'node_modules', name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', main: './index.js', redbox: { extension: '.' }, ...manifest })
    );
    await writeFile(path.join(directory, 'index.js'), source);
  }
  it('uses import conditions, hidden manifests and awaited ESM top-level initialization', async () => {
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { 'esm-hook': '1.0.0' } }));
    await fixture(
      'esm-hook',
      { type: 'module', exports: { import: './index.js', require: './missing.cjs' } },
      'await new Promise(r => setTimeout(r, 10)); export function registerRedboxExtension() { return { apiVersion: 1, awaited: true }; }'
    );
    const { extensions } = await discoverInstalledExtensions(root);
    assert.equal(extensions.length, 1);
    const registration = extensionRegistration(await loadExtensionModule(extensions[0]), extensions[0].name);
    assert.deepEqual(registration(), { apiVersion: 1, awaited: true });
  });
  it('normalizes CommonJS, ESM default objects and default registration functions', async () => {
    for (const [name, manifest, source] of [
      ['cjs-hook', {}, 'module.exports = { registerRedboxExtension: () => 1 }'],
      ['esm-default', { type: 'module' }, 'export default { registerRedboxExtension: () => 1 }'],
      ['esm-function', { type: 'module' }, 'export default () => 1'],
    ] as const) {
      await fixture(name, manifest, source);
    }
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { 'cjs-hook': '1.0.0', 'esm-default': '1.0.0', 'esm-function': '1.0.0' } })
    );
    for (const extension of (await discoverInstalledExtensions(root)).extensions)
      assert.equal(extensionRegistration(await loadExtensionModule(extension), extension.name)(), 1);
  });
  it('reports missing/invalid public entries and contracts without exposing module errors', async () => {
    await fixture('broken', { exports: './missing.js' }, '');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { broken: '1.0.0' } }));
    const { extensions } = await discoverInstalledExtensions(root);
    await assert.rejects(loadExtensionModule(extensions[0]), /Extension broken: public entrypoint/);
    await fixture('broken', {}, 'throw new Error("secret-token-value")');
    await assert.rejects(
      loadExtensionModule(extensions[0]),
      error => error instanceof Error && !error.message.includes('secret-token-value')
    );
    assert.throws(() => extensionRegistration({}, 'broken'), /export registerRedboxExtension/);
    assert.throws(
      () => extensionRegistration({ registerRedboxExtension: () => 1, default: () => 2 }, 'broken'),
      /ambiguous/
    );
  });
  it('includes development packages only when explicitly requested and requires installed dependencies', async () => {
    await fixture('dev-hook', {}, 'module.exports = {}');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ devDependencies: { 'dev-hook': '1.0.0' } }));
    assert.equal((await discoverInstalledExtensions(root)).extensions.length, 0);
    assert.equal((await discoverInstalledExtensions(root, { includeDevDependencies: true })).extensions.length, 1);
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { absent: '1.0.0' } }));
    await assert.rejects(discoverInstalledExtensions(root), /Extension absent: declared dependency is not installed/);
  });
});
