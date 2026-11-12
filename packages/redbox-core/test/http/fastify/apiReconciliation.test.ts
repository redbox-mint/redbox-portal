import assert from 'node:assert/strict';
import path from 'node:path';
import type { ResolvedPortalInstallation } from '../../../src/application/portal/installation';
import { referenceReadDeclarations } from '../../../src/http/referenceRoutes';
import { buildCoreApiOpenApiDocument } from '../../../src/api-routes/route-registry';

const audit = require(
  path.resolve(__dirname, '../../../../../support/specs/fastify-migration/evidence/reconcile-FM-028.cjs')
) as {
  offlineApplication(declarations?: typeof referenceReadDeclarations): Promise<{
    portal: { installation: ResolvedPortalInstallation };
    close(): Promise<void>;
  }>;
  reconcile(
    installation: ResolvedPortalInstallation,
    document?: ReturnType<typeof buildCoreApiOpenApiDocument>
  ): {
    counts: { api: number; migrated: number; intentionalOverrides: number; later: number };
  };
};

describe('FM-028 complete declaration/runtime/documentation reconciliation', function () {
  this.timeout(120000);
  let fixture: Awaited<ReturnType<typeof audit.offlineApplication>>;
  before(async () => {
    fixture = await audit.offlineApplication();
  });
  after(async () => {
    await fixture?.close();
  });
  it('resolves every migrated API once with the same executable contract and generated documentation', () => {
    assert.deepEqual(audit.reconcile(fixture.portal.installation).counts, {
      api: 152,
      migrated: 146,
      intentionalOverrides: 0,
      later: 6,
    });
  });
  it('rejects a missing runtime API instead of silently reclassifying it', () => {
    const installation = fixture.portal.installation;
    assert.throws(
      () =>
        audit.reconcile({
          ...installation,
          routePlan: {
            ...installation.routePlan,
            routes: installation.routePlan.routes.filter(
              route => route.declaration.name !== 'core-http-get-c77d797df7a446ba'
            ),
          },
        }),
      /API must resolve exactly once/
    );
  });
  it('rejects missing and altered generated operations', () => {
    const document = buildCoreApiOpenApiDocument();
    const operationPath = '/{branding}/{portal}/api/recordtypes';
    delete document.paths[operationPath].get;
    assert.throws(() => audit.reconcile(fixture.portal.installation, document), /152/);
    document.paths[operationPath].get = { summary: 'wrong operation' };
    assert.throws(() => audit.reconcile(fixture.portal.installation, document), /metadata drift/);
  });
  it('constructs no unused metadata pilot when only reference controllers are selected', async () => {
    const selected = await audit.offlineApplication(referenceReadDeclarations);
    try {
      assert(
        !selected.portal.installation.controllerPlan.controllers.some(
          controller => controller.declaration.name === 'webservice/RecordController'
        )
      );
    } finally {
      await selected.close();
    }
  });
});
