const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
import assert from 'node:assert/strict';
import { getConfigurationRepositories } from '@researchdatabox/redbox-core';

describe('Q best-effort synchronization and secret lease failures', () => {
  it('returns the committed entry and reloads even when the following bundle write fails', async () => {
    const repositories = getConfigurationRepositories(fixture.owner);
    const original = repositories.bundles.createBundle;
    const reload = require('sinon').stub(fixture.services.TranslationService, 'reloadResources');
    const brand = fixture.services.BrandingService.getDefault();
    const namespace = `q-failed-sync-${Date.now()}`;
    repositories.bundles.createBundle = async () => {
      throw new Error('Injected bundle synchronization failure');
    };
    try {
      const saved = await fixture.services.I18nEntriesService.setEntry(brand, 'en', namespace, 'retained', '');
      assert(saved?.id);
      assert.equal(reload.callCount, 1);
      assert.equal((await repositories.translations.findByUid(`${brand.id}:en:${namespace}:retained`))?.value, '');
      assert.equal(await repositories.bundles.findByUid(`${brand.id}:en:${namespace}`), null);
    } finally {
      repositories.bundles.createBundle = original;
      reload.restore();
      await repositories.translations.removeByUid(`${brand.id}:en:${namespace}:retained`);
    }
  });

  it('rejects a stale secret owner before another AWS or database write', async () => {
    const { createRequire } = require('node:module');
    const coreRequire = createRequire(require.resolve('@researchdatabox/redbox-core'));
    const { AppConfigSecrets } = coreRequire('./configuration/AppConfigSecrets');
    const { SecretsManagerClient } = coreRequire('@aws-sdk/client-secrets-manager');
    const sinon = require('sinon');
    const send = sinon.stub(SecretsManagerClient.prototype, 'send');
    const leases = getConfigurationRepositories(fixture.owner).secretLeases;
    const store = new AppConfigSecrets({
      provider: 'aws-secrets-manager',
      region: 'ap-southeast-2',
      namePrefix: 'q-integration',
    }, { leases: () => leases, log: fixture.log });
    let name: string | undefined;
    try {
      await assert.rejects(
        store.withBundleSave(`q-stale-${Date.now()}`, async lease => {
          name = lease.name;
          // Expire this test-owned lease, then let a different owner acquire it.
          assert(await leases.release(lease.name, lease.owner));
          await leases.acquire(lease.name, 'replacement', Date.now(), Date.now() + 120000);
          await store.checkBundleSave(lease);
        }),
        /lost|aborted/
      );
      assert.equal((await leases.inspect(name!))?.owner, 'replacement');
      assert.equal(send.callCount, 0);
    } finally {
      send.restore();
      if (name) await leases.release(name, 'replacement');
    }
  });
});
