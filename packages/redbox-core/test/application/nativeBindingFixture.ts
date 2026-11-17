import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { sourcePortal } from './sourcePortal';

/** Actual executable bootstrap with an offline API2 storage declaration. This
 * fixture is for input-binding checks; it never initializes business modules. */
export async function nativeBindingFixture(config: Record<string, unknown> = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm042-binding-'));
  try {
    const provider = path.join(directory, 'node_modules/offline-storage');
    await mkdir(provider, { recursive: true });
    for (const name of ['views', 'assets']) await mkdir(path.join(directory, name));
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ dependencies: { 'offline-storage': '1.0.0' } }));
    await writeFile(path.join(provider, 'package.json'), JSON.stringify({ name: 'offline-storage', main: 'index.cjs', redbox: { extension: '.' } }));
    await writeFile(path.join(provider, 'index.cjs'), `
      exports.registerRedboxExtension=()=>({apiVersion:2,modules:[{name:'storage',create(){throw Error('Offline binding must not initialize storage');}}]});
      exports.inspectPrismaStagedStorage=exports.ensurePrismaStagedStorageIndexes=async()=>[];
    `);
    const file = path.join(directory, 'config.cjs');
    await writeFile(file, 'module.exports=' + JSON.stringify(config));
    const portal = await sourcePortal.createApplication({ appPath: directory, files: { application: file }, env: { REDBOX_SESSION_SECRET: 'fm042-binding-synthetic-secret-at-least-32-characters' }, log: nothingLogger } as never);
    assert(portal.installation, 'Production API2 installation must be selected');
    return { portal, directory, async close() { await portal.application.stop(); await rm(directory, { recursive: true, force: true }); } };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
