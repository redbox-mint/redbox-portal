import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { createPortalApplication } from '../../src/application/portal/application';
import { persistenceStatus } from '../../src/persistence/runtime';

describe('production storage extension entrypoint', () => {
  it('reuses the discovered root-only ESM export without assuming /extension or constructing resources', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sr-storage-entry-'));
    try {
      const installed = join(directory, 'node_modules/root-storage');
      await mkdir(installed, { recursive: true });
      await writeFile(join(directory, 'package.json'), JSON.stringify({ dependencies: { 'root-storage': '1.0.0' } }));
      await writeFile(
        join(installed, 'package.json'),
        JSON.stringify({
          name: 'root-storage',
          version: '1.0.0',
          type: 'module',
          exports: { '.': './index.js' },
          redbox: { extension: '.' },
        })
      );
      await writeFile(
        join(installed, 'index.js'),
        `
        await Promise.resolve();
        export function registerRedboxExtension() { return { apiVersion: 1, modules: [{ name: 'storage', create() { throw new Error('Offline inspection cannot construct storage'); } }] }; }
        export function inspectPrismaStagedStorage() { throw new Error('Offline inspection cannot acquire storage'); }
        export function ensurePrismaStagedStorageIndexes() { throw new Error('Offline inspection cannot acquire storage'); }
      `
      );
      const portal = await createPortalApplication({
        appPath: directory,
        log: nothingLogger,
        env: { REDBOX_SESSION_SECRET: 'root-entrypoint-test-at-least-32-characters' },
      });
      assert.equal(typeof portal.preflight.inspectPrismaStagedStorage, 'function');
      assert.equal(portal.resolved.modules.find(item => item.declaration.name === 'storage')!.provider, 'root-storage');
      assert.equal(persistenceStatus(portal.owner).pools, 0);
      await portal.application.stop();
      assert.equal(persistenceStatus(portal.owner).pools, 0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
