import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../../helpers/httpRouteFixture';
import { mountMetadataReadRoutes } from '../../../src/http/express/metadata';
import { mountConfigurationWriteRoutes } from '../../../src/http/express/configurationWrites';
import { configurationWriteRoutes } from '../../../src/http/express/configurationWrites';
import { metadataReadRoutes } from '../../../src/http/express/metadata';
import { pageRoutes } from '../../../src/http/express/pages';
import { Services as Dashboard } from '../../../src/dashboards/DashboardConfig';

const settings = {
  searchable: true,
  showStageTitle: true,
  tableConfig: { rowConfig: [], rowRulesConfig: [], groupRowConfig: [], groupRowRulesConfig: [], formatRules: {} },
};
describe('Dashboard configuration through owned HTTP', () => {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let service: Record<string, sinon.SinonStub>;
  beforeEach(async () => {
    service = {
      getTargetCatalogue: sinon.stub().resolves({ targets: [{ key: 'k' }], removed: [], fingerprint: 'fp' }),
      getTargetSettings: sinon.stub().resolves({ revision: 3 }),
      saveTargetSettings: sinon.stub().resolves({ revision: 4 }),
      validateTargetSettings: sinon.stub().resolves({ errors: [], warnings: [] }),
      previewCopy: sinon.stub().resolves({ changes: [] }),
      applyCopy: sinon.stub().resolves({ updated: 2 }),
      preflightLegacyMigration: sinon.stub().resolves([{ brand: { id: 'brand-1', name: 'default' } }]),
    };
    f = await httpRouteFixture((router, input) => {
      mountMetadataReadRoutes(router, { ...input, dashboardConfig: service } as any);
      mountConfigurationWriteRoutes(router, { ...input, dashboardConfig: service } as any);
    });
  });
  afterEach(async () => {
    await f.close();
  });
  const base = '/default/portal/api/dashboard-config';
  it('lists targets for the route brand without profiles', async () => {
    const response = await f.request(base + '/targets');
    assert.equal(response.status, 200);
    assert.equal(service.getTargetCatalogue.firstCall.args[0].id, f.brand.id);
    assert.deepEqual(response.body, { targets: [{ key: 'k' }], catalogueFingerprint: 'fp' });
  });
  it('does not fall back to the default brand for unknown brands', async () => {
    f.getBrand.resolves(undefined);
    assert.equal((await f.request('/other/portal/api/dashboard-config/targets')).status, 404);
    assert.equal(service.getTargetCatalogue.called, false);
  });
  it('delegates workflow reads and view saves with typed targets', async () => {
    assert.equal((await f.request(base + '/workflows/rdmp/draft')).status, 200);
    assert.equal(
      (await f.request(base + '/views/consolidated/main', { method: 'PUT', body: { expectedRevision: 3, settings } }))
        .status,
      200
    );
    assert.deepEqual(service.getTargetSettings.firstCall.args[1], {
      kind: 'workflow',
      recordType: 'rdmp',
      stage: 'draft',
    });
    assert.deepEqual(service.saveTargetSettings.firstCall.args[1], {
      kind: 'view',
      view: 'consolidated',
      step: 'main',
    });
    assert.deepEqual(service.saveTargetSettings.firstCall.args[2], {
      expectedRevision: 3,
      settings,
      validationFingerprint: undefined,
      acknowledgedWarningIds: undefined,
    });
  });
  it('rejects a non-object copy body', async () => {
    const response = await f.request(base + '/copy/apply', { method: 'POST', body: 'nope' });
    assert.equal(response.status, 400);
    assert.equal(service.applyCopy.called, false);
  });
  it('translates typed errors to status codes and structured v2 details', async () => {
    service.saveTargetSettings.rejects(
      new Dashboard.DashboardConfigError('warnings-require-review', 'Review warnings', {
        warnings: [{ id: 'w1' }],
        validationFingerprint: 'v',
      })
    );
    const response = await f.request(base + '/workflows/rdmp/draft', {
      method: 'PUT',
      body: { expectedRevision: 1, settings },
      headers: { 'x-redbox-api-version': '2.0' },
    });
    assert.equal(response.status, 409);
    assert.equal(response.body.errors[0].code, 'warnings-require-review');
    assert.deepEqual(response.body.meta, { warnings: [{ id: 'w1' }], validationFingerprint: 'v' });
  });
  it('passes the route brand to migration preflight', async () => {
    const response = await f.request(base + '/migration/preflight');
    assert.equal(response.status, 200);
    assert.equal(service.preflightLegacyMigration.firstCall.args[0].id, f.brand.id);
    assert.deepEqual(response.body.reports, [{ brand: { id: 'brand-1', name: 'default' } }]);
  });
  it('returns 410 and remediation for retired profile operations', async () => {
    const response = await f.request(base + '/defaults', { headers: { 'x-redbox-api-version': '2.0' } });
    assert.equal(response.status, 410);
    assert.equal(response.body.errors[0].code, 'legacy-operation-retired');
    assert.match(response.body.errors[0].detail, /\/api\/dashboard-config\/targets/);
  });
  it('declares matching admin operations with CSRF and no retired operation alias', () => {
    assert(pageRoutes.some(route => route.path.endsWith('/admin/dashboard-config') && route.action === 'editor'));
    for (const action of [
      'listTargets',
      'saveWorkflowTarget',
      'saveViewTarget',
      'validateSettings',
      'previewCopy',
      'applyCopy',
    ])
      assert(
        [...configurationWriteRoutes, ...metadataReadRoutes].some(
          route => route.path.includes('/admin/dashboard-config/') && route.action === action
        )
      );
    assert(
      ![...configurationWriteRoutes, ...metadataReadRoutes].some(
        route => route.path.includes('/admin/dashboard-config/') && route.action === 'retiredOperation'
      )
    );
  });
});
