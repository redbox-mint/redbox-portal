import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { BrandingModel, PublicationPublishing } from '@researchdatabox/redbox-core';
import { APP_CONFIG_SECRET_MASK } from '@researchdatabox/redbox-core/dist/services/AppConfigService';

/** Exercises the loaded services and Waterline/native datastores, without replacing persistence. */
describe('Shared publication lifted configuration (PUB-18)', function () {
  this.timeout(30000);
  const brands = ['first', 'second'].map(name =>
    Object.assign(new BrandingModel(), { id: randomBytes(12).toString('hex'), name: `pub18-${name}` })
  );

  after(async () => {
    await AppConfig.destroy({ branding: brands.map(brand => brand.id), configKey: 'publicationPublishing' });
  });

  function configuration(secret: string) {
    const config = new PublicationPublishing();
    for (const id of ['main', 'sibling']) {
      config.destinations[id] = {
        provider: 'figshare',
        displayName: `Figshare ${id}`,
        enabled: false,
        archived: false,
        connection: { baseUrl: 'https://api.figshare.com', accountId: '123', token: secret },
        mapping: {},
        attachments: {},
        providerOptions: {},
        writeBack: {
          articleId: `metadata.${id}.articleId`,
          articleUrls: [`metadata.${id}.url`],
          status: `metadata.${id}.status`,
          error: `metadata.${id}.error`,
          syncState: `metadata.${id}.syncState`,
          allFilesUploaded: `metadata.${id}.allFilesUploaded`,
        },
      };
    }
    return { ...config };
  }

  it('persists independent same-provider destinations and masks credential round trips across brands', async () => {
    for (const [index, brand] of brands.entries()) {
      const secret = `pub18-disposable-${index}`;
      const response = await AppConfigService.createOrUpdateConfig(
        brand,
        'publicationPublishing',
        configuration(secret)
      );
      assert.equal(JSON.stringify(response).includes(secret), false);
      assert.ok(JSON.stringify(response).includes(APP_CONFIG_SECRET_MASK));
      const stored = await AppConfig.findOne({ branding: brand.id, configKey: 'publicationPublishing' });
      assert.ok(stored);
      assert.deepEqual(Object.keys(stored.configData.destinations).sort(), ['main', 'sibling']);
      assert.equal(stored.configData.processing.enabled, false);
      assert.equal(stored.configData.destinations.main.connection.token, secret);
      const masked = await AppConfigService.getAppConfigByBrandAndKey(brand.id, 'publicationPublishing');
      assert.ok(masked && typeof masked === 'object');
      await AppConfigService.createOrUpdateConfig(brand, 'publicationPublishing', { ...masked });
      const saved = await AppConfig.findOne({ branding: brand.id, configKey: 'publicationPublishing' });
      assert.equal(saved.configData.destinations.main.connection.token, secret);
    }
    const rotated = configuration('pub18-rotated');
    await AppConfigService.createOrUpdateConfig(brands[0], 'publicationPublishing', rotated);
    const first = await AppConfig.findOne({ branding: brands[0].id, configKey: 'publicationPublishing' });
    const second = await AppConfig.findOne({ branding: brands[1].id, configKey: 'publicationPublishing' });
    assert.equal(first.configData.destinations.main.connection.token, 'pub18-rotated');
    assert.equal(second.configData.destinations.main.connection.token, 'pub18-disposable-1');
    const read = await AppConfigService.getAppConfigByBrandAndKey(brands[0].id, 'publicationPublishing');
    assert.equal(JSON.stringify(read).includes('pub18-rotated'), false);
  });

  it('rejects unsafe publication settings before changing persisted credentials', async () => {
    await AppConfigService.createOrUpdateConfig(brands[0], 'publicationPublishing', configuration('pub18-original'));
    const before = await AppConfig.findOne({ branding: brands[0].id, configKey: 'publicationPublishing' });
    const invalid = configuration('pub18-must-not-persist');
    invalid.destinations.main.writeBack = { articleId: 'workflow.stage' };
    await assert.rejects(
      AppConfigService.createOrUpdateConfig(brands[0], 'publicationPublishing', invalid),
      /unsafe-output/
    );
    const after = await AppConfig.findOne({ branding: brands[0].id, configKey: 'publicationPublishing' });
    assert.deepEqual(after.configData, before.configData);
    assert.equal(JSON.stringify(after).includes('pub18-must-not-persist'), false);
  });
});
