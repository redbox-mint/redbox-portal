import assert from 'node:assert/strict';
import { datastreamReadRoutes } from '../../../src/http/datastreamRoutes';
import { coreRouteName } from '../../../src/http/fastify/routes';
import { StaticOwnershipTable } from '../../../src/http/fastify/staticOwnership';
import type { ResolvedPortalInstallation } from '../../../src/application/portal/installation';
const audit: {
  offlineApplication(): Promise<{ portal: { installation: ResolvedPortalInstallation }; close(): Promise<void> }>;
} = require('../../../../../support/specs/fastify-migration/evidence/reconcile-FM-031.cjs');
const inventory: {
  routes: { ownerTask: string; name: string }[];
} = require('../../../../../support/specs/fastify-migration/evidence/FM-002.inventory.json');

describe('FM-033 production download selection', function () {
  this.timeout(120000);
  let fixture: Awaited<ReturnType<typeof audit.offlineApplication>>;
  before(async () => {
    fixture = await audit.offlineApplication();
  });
  after(async () => {
    await fixture?.close();
  });
  for (const declaration of datastreamReadRoutes)
    it(declaration.path + ' selects one real action ahead of static artifacts', () => {
      const installation = fixture.portal.installation;
      const name = coreRouteName(declaration.method, declaration.path);
      assert.equal(inventory.routes.filter(row => row.ownerTask === 'FM-033' && row.name === name).length, 1);
      const route = installation.routePlan.routes.find(row => row.declaration.name === name);
      assert(route);
      assert.equal(route.declaration.api, declaration);
      const factories = installation.controllerPlan.controllers.filter(
        row => row.declaration.name === route.declaration.controller
      );
      assert.equal(factories.length, 1);
      assert(factories[0].declaration.actions.includes(route.declaration.action));
      const ownership = new StaticOwnershipTable(
        installation.ownership.declarations,
        installation.policyConfiguration,
        '/portal',
        installation.routePlan,
        []
      );
      const owner = ownership.snapshot().find(row => row.name === name);
      assert(owner?.selected);
      if ('headBehavior' in declaration) {
        assert.equal(route.declaration.head?.kind, 'none', 'HEAD remains the following TUS owner');
        assert(owner.headFallsThrough);
      } else assert(installation.routePlan.bindings.some(row => row.route === route && row.method === 'HEAD'));
    });
});
