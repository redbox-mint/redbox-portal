const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
import { fixtureRows, fixtureCreate, fixturePatchOne, fixtureRemove } from '../../helpers/persistenceFixtures';
declare var DashboardConfiguration: any;

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
    brand = fixture.services.BrandingService.getDefault();
    expect(fixture.services.DashboardConfigService.isReady()).to.equal(true);
  });

  async function current() {
    return fixture.services.DashboardConfigService.getTargetSettings(brand, target);
  }

  function withTitle(settings: any, title: string) {
    const next = JSON.parse(JSON.stringify(settings));
    next.tableConfig.rowConfig = [{ title, variable: 'metadata.title', template: '{{metadata.title}}' }];
    return next;
  }

  it('keeps exactly one brand document behind a unique index', async function () {
    const docs = await fixtureRows("DashboardConfiguration", { branding: String(brand.id) });
    expect(docs).to.have.length(1);
    let duplicateRejected = false;
    try {
      await fixtureCreate("DashboardConfiguration", { branding: String(brand.id), revision: 1, configData: docs[0].configData });
    } catch (error) {
      duplicateRejected = true;
    }
    expect(duplicateRejected).to.equal(true);
  });

  it('lets only one of two concurrent saves based on the same revision succeed', async function () {
    const base = await current();
    const results = await Promise.allSettled([
      fixture.services.DashboardConfigService.saveTargetSettings(brand, target, { expectedRevision: base.revision, settings: withTitle(base.settings, 'Writer A') }),
      fixture.services.DashboardConfigService.saveTargetSettings(brand, target, { expectedRevision: base.revision, settings: withTitle(base.settings, 'Writer B') }),
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
    const preview = await fixture.services.DashboardConfigService.previewCopy(brand, { source: target, destinations, groups: ['columnsAndActions'] });
    const acknowledgedWarningIds = preview.warnings.map((w: any) => w.id);
    const result = await fixture.services.DashboardConfigService.applyCopy(brand, { ...preview, groups: ['columnsAndActions'], acknowledgedWarningIds });
    expect(result.updated).to.equal(2);
    expect(result.revision).to.equal(preview.expectedRevision + 1);

    // Replaying the same reviewed preview is stale and changes nothing.
    let code = '';
    try {
      await fixture.services.DashboardConfigService.applyCopy(brand, { ...preview, groups: ['columnsAndActions'], acknowledgedWarningIds });
    } catch (error: any) {
      code = error.code;
    }
    expect(code).to.equal('stale-preview');
    expect((await current()).revision).to.equal(result.revision);
  });

  it('creates one migrated document and preserves the first recovery snapshot on rerun', async function () {
    const suffix = Date.now().toString();
    const createdBrand = await fixtureCreate("BrandingConfig", { name: `dashboard-migration-${suffix}`, variables: {} });
    const brandId = String(createdBrand.id);
    const previousDashboardViews = fixture.config.dashboardview;
    const previousDashboardTypes = fixture.config.dashboardtype;
    let legacyOverride: any;

    try {
      // Keep this test focused on persistence: the new brand has no workflow
      // stages, views or profiles to migrate, but it has legacy AppConfig data.
      fixture.config.dashboardview = {};
      fixture.config.dashboardtype = {};
      legacyOverride = await fixtureCreate("AppConfig", {
        branding: brandId,
        configKey: dashboardMigration.DASHBOARD_LEGACY_OVERRIDE_KEY,
        configData: { recordTypes: {}, views: {} },
      });

      await fixture.services.DashboardConfigService.migrateLegacyConfiguration();

      const docs = await fixtureRows("DashboardConfiguration", { branding: brandId });
      expect(docs).to.have.length(1);
      expect(docs[0].revision).to.equal(1);
      const snapshots = await fixtureRows("AppConfig", {
        branding: brandId,
        configKey: dashboardMigration.DASHBOARD_LEGACY_SNAPSHOT_KEY,
      });
      expect(snapshots).to.have.length(1);
      const firstSnapshot = JSON.parse(JSON.stringify(snapshots[0].configData));
      expect(firstSnapshot.appConfigDashboardTableConfigRows).to.have.length(1);
      expect(firstSnapshot.appConfigDashboardTableConfigRows[0].configData).to.deep.equal({ recordTypes: {}, views: {} });

      await fixturePatchOne("AppConfig", { id: legacyOverride.id }, {
        configData: { recordTypes: { changedAfterMigration: {} }, views: {} },
      });
      await fixture.services.DashboardConfigService.migrateLegacyConfiguration();

      const rerunDocs = await fixtureRows("DashboardConfiguration", { branding: brandId });
      const rerunSnapshots = await fixtureRows("AppConfig", {
        branding: brandId,
        configKey: dashboardMigration.DASHBOARD_LEGACY_SNAPSHOT_KEY,
      });
      expect(rerunDocs).to.have.length(1);
      expect(rerunDocs[0].revision).to.equal(1);
      expect(rerunSnapshots).to.have.length(1);
      expect(rerunSnapshots[0].configData).to.deep.equal(firstSnapshot);
    } finally {
      fixture.config.dashboardview = previousDashboardViews;
      fixture.config.dashboardtype = previousDashboardTypes;
      await fixtureRemove("DashboardConfiguration", { branding: brandId });
      await fixtureRemove("AppConfig", { branding: brandId });
      await fixtureRemove("BrandingConfig", { id: brandId });
    }
  });
});
