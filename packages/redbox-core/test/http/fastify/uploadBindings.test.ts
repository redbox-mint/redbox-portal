import assert from 'node:assert/strict';
import { uploadDeclarations } from '../../../src/http/uploadRoutes';
import { coreRouteName } from '../../../src/http/fastify/routes';
import { StaticOwnershipTable } from '../../../src/http/fastify/staticOwnership';
import type { ResolvedPortalInstallation } from '../../../src/application/portal/installation';
const audit: {
  offlineApplication(): Promise<{ portal: { installation: ResolvedPortalInstallation }; close(): Promise<void> }>;
} = require('../../../../../support/specs/fastify-migration/evidence/reconcile-FM-031.cjs');
describe('FM-034 production upload selection', function () {
  this.timeout(120000);
  let f: Awaited<ReturnType<typeof audit.offlineApplication>>;
  before(async () => {
    f = await audit.offlineApplication();
  });
  after(async () => {
    await f?.close();
  });
  for (const declaration of uploadDeclarations)
    it(declaration.method + ' ' + declaration.path + ' selects a real action ahead of static', () => {
      const installation = f.portal.installation,
        name = coreRouteName(declaration.method, declaration.path);
      const selected = installation.routePlan.routes.filter(row => row.declaration.name === name);
      assert.equal(selected.length, 1);
      const factories = installation.controllerPlan.controllers.filter(
        row => row.declaration.name === declaration.controller
      );
      assert.equal(factories.length, 1);
      assert(factories[0].declaration.actions.includes(declaration.action));
      const table = new StaticOwnershipTable(
        installation.ownership.declarations,
        installation.policyConfiguration,
        '/portal',
        installation.routePlan,
        []
      );
      assert(table.snapshot().find(row => row.name === name)?.selected);
    });
});
