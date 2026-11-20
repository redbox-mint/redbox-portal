import assert from 'node:assert/strict';
import type { ResolvedPortalInstallation } from '../../../src/application/portal/installation';
import { deliverDynamicAsset, type DynamicPageAssetsInput } from '../../../src/pages/dynamicAssets';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { resolveRequestBrand, resolveRequestActor } from '../../../src/http/context';
import { HttpFailure } from '../../../src/http/fastify/errorBoundary';
const audit = require('../../../../../support/specs/fastify-migration/evidence/reconcile-FM-031.cjs') as {
  offlineApplication(): Promise<{ portal: { installation: ResolvedPortalInstallation }; close(): Promise<void> }>;
  reconcile(installation: ResolvedPortalInstallation, runtime?: unknown): { assetCounts: unknown };
};
describe('FM-031 complete production asset bindings', function () {
  this.timeout(120000);
  let fixture: Awaited<ReturnType<typeof audit.offlineApplication>>;
  before(async () => {
    fixture = await audit.offlineApplication();
  });
  after(async () => {
    await fixture?.close();
  });
  it('closes all 15 asset entries and the contained static boundary', () => {
    assert.deepEqual(audit.reconcile(fixture.portal.installation).assetCounts, {
      declarations: 15,
      migrated: 15,
      staticBoundaries: 1,
      laterAssetEntries: 0,
    });
  });
  for (const field of ['missing', 'policy', 'csrf', 'action'])
    it('rejects asset ' + field + ' drift', () => {
      const installation = fixture.portal.installation;
      const routes = installation.routePlan.routes.flatMap(route => {
        if (route.declaration.path !== '/:branding/:portal/dynamicAsset/formCompiledItems/:recordType{/:oid}')
          return [route];
        return field === 'missing'
          ? []
          : [
              {
                ...route,
                ...(field === 'policy'
                  ? { effectivePolicies: [] }
                  : field === 'csrf'
                    ? { effectiveCsrf: 'protect' }
                    : { declaration: { ...route.declaration, action: 'get' } }),
              },
            ];
      });
      assert.throws(() => audit.reconcile({ ...installation, routePlan: { ...installation.routePlan, routes } }));
    });
});
describe('FM-031 shared generated asset failures', () => {
  for (const status of [400, 403, 404])
    it('preserves typed ' + status + ' from form selection', async () => {
      const error = new HttpFailure(status);
      const request = { params: { oid: 'record' }, query: {}, session: {} } as unknown as FastifyRequest;
      resolveRequestBrand(request, { id: 'brand', name: 'default' }, 'rdmp');
      resolveRequestActor(request, { id: 'actor', username: 'actor', roles: [] });
      await assert.rejects(
        () =>
          deliverDynamicAsset(
            request,
            {} as FastifyReply,
            {
              loadRecord: async () => {
                throw error;
              },
            } as unknown as DynamicPageAssetsInput,
            'getFormCompiledItems'
          ),
        value => value === error
      );
    });
});
