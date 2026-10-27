import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { createPortalApplication } from '../../src/application/portal/application';
import * as maintenance from '../../src/persistence/maintenance';
import * as identity from '../../src/persistence/identity/runtime';
import type { IdentityPersistenceInput } from '../../src/persistence/identity/runtime';

describe('production pending record access binding', () => {
  afterEach(() => sinon.restore());
  it('binds persistence user writes to the owned invitation mutation and propagates failures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sr-pending-access-'));
    try {
      const installed = join(directory, 'node_modules/test-storage');
      await mkdir(installed, { recursive: true });
      await writeFile(join(directory, 'package.json'), JSON.stringify({ dependencies: { 'test-storage': '1.0.0' } }));
      await writeFile(
        join(installed, 'package.json'),
        JSON.stringify({ main: 'index.cjs', redbox: { extension: '.' } })
      );
      await writeFile(
        join(installed, 'index.cjs'),
        `
        exports.registerRedboxExtension = () => ({ apiVersion: 1, modules: [{ name: 'storage', create() { throw Error('Must not initialize'); } }] });
        exports.inspectPrismaStagedStorage = exports.ensurePrismaStagedStorageIndexes = async () => [];
      `
      );
      sinon.stub(maintenance, 'prepareSelectedPersistenceIndexes').resolves({ ready: true } as any);
      for (const group of [
        'cache',
        'migration',
        'reference',
        'configuration',
        'progress',
        'harvest',
        'siem',
        'figshare',
      ]) {
        const module = require(`../../src/persistence/${group}/runtime`);
        sinon.stub(module, `initialize${group[0].toUpperCase() + group.slice(1)}Persistence`).resolves();
      }
      const boundary = new Error('identity binding observed');
      let binding: IdentityPersistenceInput | undefined;
      sinon.stub(identity, 'initializeIdentityPersistence').callsFake(async (_owner, input) => {
        binding = input;
        throw boundary;
      });
      const portal = await createPortalApplication({
        appPath: directory,
        log: nothingLogger,
        env: { REDBOX_SESSION_SECRET: 'pending-access-secret-at-least-32-characters' },
      });
      const assign = sinon.stub().resolves(2);
      sinon.stub(portal.data.users, 'get').returns({ findAndAssignAccessToRecords: assign } as any);
      await assert.rejects(portal.application.initialize(), error => error === boundary);
      assert.ok(binding, 'production startup must supply identity persistence effects');
      assert.equal(await binding.assignPendingAccess({ email: 'invited@example.invalid', id: 'user-id' }), 2);
      assert.deepEqual(assign.firstCall.args, ['invited@example.invalid', 'user-id']);
      const failure = new Error('invitation mutation failed');
      assign.rejects(failure);
      await assert.rejects(
        binding.assignPendingAccess({ email: 'invited@example.invalid', id: 'user-id' }),
        error => error === failure
      );
      await portal.application.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
