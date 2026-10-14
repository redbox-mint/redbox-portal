declare var DashboardConfigService: any;
declare var DashboardConfiguration: any;
declare var BrandingService: any;

const dashboardMigration = require('@researchdatabox/redbox-core').DashboardConfigService;

/**
 * Exercises revision-conditioned writes against the real datastore. Mock-only
 * concurrency tests cannot show that two writers based on the same revision
 * cannot both succeed.
 */
describe('DashboardConfigService (datastore)', function () {
  const target = { kind: 'workflow', recordType: 'rdmp', stage: 'draft' };
  let brand: any;

  before(async function () {
    brand = BrandingService.getDefault();
    expect(DashboardConfigService.isReady()).to.equal(true);
  });

  async function current() {
    return DashboardConfigService.getTargetSettings(brand, target);
  }

  function withTitle(settings: any, title: string) {
    const next = JSON.parse(JSON.stringify(settings));
    next.tableConfig.rowConfig = [{ title, variable: 'metadata.title', template: '{{metadata.title}}' }];
    return next;
  }

  it('keeps exactly one brand document behind a unique index', async function () {
    const docs = await DashboardConfiguration.find({ branding: String(brand.id) });
    expect(docs).to.have.length(1);
    let duplicateRejected = false;
    try {
      await DashboardConfiguration.create({ branding: String(brand.id), revision: 1, configData: docs[0].configData });
    } catch (error) {
      duplicateRejected = true;
    }
    expect(duplicateRejected).to.equal(true);
  });

  it('lets only one of two concurrent saves based on the same revision succeed', async function () {
    const base = await current();
    const results = await Promise.allSettled([
      DashboardConfigService.saveTargetSettings(brand, target, { expectedRevision: base.revision, settings: withTitle(base.settings, 'Writer A') }),
      DashboardConfigService.saveTargetSettings(brand, target, { expectedRevision: base.revision, settings: withTitle(base.settings, 'Writer B') }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).to.have.length(1);
    expect(rejected).to.have.length(1);
    expect(rejected[0].reason.code).to.equal('stale-revision');

    const after = await current();
    expect(after.revision).to.equal(base.revision + 1);
    expect(['Writer A', 'Writer B']).to.include(after.settings.tableConfig.rowConfig[0].title);
  });

  it('applies a copy to every destination in one revision or to none', async function () {
    const destinations = [
      { kind: 'workflow', recordType: 'dataRecord', stage: 'draft' },
      { kind: 'workflow', recordType: 'dataPublication', stage: 'draft' },
    ];
    const preview = await DashboardConfigService.previewCopy(brand, { source: target, destinations, groups: ['columnsAndActions'] });
    const acknowledgedWarningIds = preview.warnings.map((w: any) => w.id);
    const result = await DashboardConfigService.applyCopy(brand, { ...preview, groups: ['columnsAndActions'], acknowledgedWarningIds });
    expect(result.updated).to.equal(2);
    expect(result.revision).to.equal(preview.expectedRevision + 1);

    // Replaying the same reviewed preview is stale and changes nothing.
    let code = '';
    try {
      await DashboardConfigService.applyCopy(brand, { ...preview, groups: ['columnsAndActions'], acknowledgedWarningIds });
    } catch (error: any) {
      code = error.code;
    }
    expect(code).to.equal('stale-preview');
    expect((await current()).revision).to.equal(result.revision);
  });

  it('creates one migrated document and preserves the first recovery snapshot on rerun', async function () {
    const suffix = Date.now().toString();
    const createdBrand = await BrandingConfig.create({ name: `dashboard-migration-${suffix}`, variables: {} }).fetch();
    const brandId = String(createdBrand.id);
    const previousDashboardViews = sails.config.dashboardview;
    const previousDashboardTypes = sails.config.dashboardtype;
    let legacyOverride: any;

    try {
      // Keep this test focused on persistence: the new brand has no workflow
      // stages, views or profiles to migrate, but it has legacy AppConfig data.
      sails.config.dashboardview = {};
      sails.config.dashboardtype = {};
      legacyOverride = await AppConfig.create({
        branding: brandId,
        configKey: dashboardMigration.DASHBOARD_LEGACY_OVERRIDE_KEY,
        configData: { recordTypes: {}, views: {} },
      }).fetch();

      await sails.services.dashboardconfigservice.migrateLegacyConfiguration();

      const docs = await DashboardConfiguration.find({ branding: brandId });
      expect(docs).to.have.length(1);
      expect(docs[0].revision).to.equal(1);
      const snapshots = await AppConfig.find({
        branding: brandId,
        configKey: dashboardMigration.DASHBOARD_LEGACY_SNAPSHOT_KEY,
      });
      expect(snapshots).to.have.length(1);
      const firstSnapshot = JSON.parse(JSON.stringify(snapshots[0].configData));
      expect(firstSnapshot.appConfigDashboardTableConfigRows).to.have.length(1);
      expect(firstSnapshot.appConfigDashboardTableConfigRows[0].configData).to.deep.equal({ recordTypes: {}, views: {} });

      await AppConfig.updateOne({ id: legacyOverride.id }).set({
        configData: { recordTypes: { changedAfterMigration: {} }, views: {} },
      });
      await sails.services.dashboardconfigservice.migrateLegacyConfiguration();

      const rerunDocs = await DashboardConfiguration.find({ branding: brandId });
      const rerunSnapshots = await AppConfig.find({
        branding: brandId,
        configKey: dashboardMigration.DASHBOARD_LEGACY_SNAPSHOT_KEY,
      });
      expect(rerunDocs).to.have.length(1);
      expect(rerunDocs[0].revision).to.equal(1);
      expect(rerunSnapshots).to.have.length(1);
      expect(rerunSnapshots[0].configData).to.deep.equal(firstSnapshot);
    } finally {
      sails.config.dashboardview = previousDashboardViews;
      sails.config.dashboardtype = previousDashboardTypes;
      await DashboardConfiguration.destroy({ branding: brandId });
      await AppConfig.destroy({ branding: brandId });
      await BrandingConfig.destroy({ id: brandId });
    }
  });
});
