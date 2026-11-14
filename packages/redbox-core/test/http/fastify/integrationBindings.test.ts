import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { integrationDeclarations } from '../../../src/http/integrationRoutes';
import * as controllers from '../../../src/http/controllers/IntegrationControllers';
import { apiRouteRegistrations, composeRoutes } from '../../../src/http/fastify/routes';
import { coreRoutePrecedence } from '../../../src/http/fastify/precedence';
import { portalHttpPolicies } from '../../../src/application/portal/httpPolicies';
import { nativePolicyNames } from '../../../src/http/fastify/policies';
describe('FM-027 declaration-derived production integration bindings', () => {
  it('binds all 70 assigned declarations once and retains complete API inventory closure after FM-034', async () => {
    const inventory = JSON.parse(
      readFileSync(
        path.resolve(__dirname, '../../../../../support/specs/fastify-migration/evidence/FM-002.inventory.json'),
        'utf8'
      )
    );
    const rows = inventory.routes.filter((r: { ownerTask: string }) => r.ownerTask === 'FM-027');
    assert.equal(rows.length, 70);
    assert.equal(integrationDeclarations.length, 70);
    const registrations = apiRouteRegistrations({
        declarations: integrationDeclarations,
        configuration: portalHttpPolicies(),
        provider: 'core',
      }),
      names = new Set(registrations.map(r => r.declaration.name));
    const plan = await composeRoutes(registrations, {
      policyNames: nativePolicyNames,
      rootContext: '/portal',
      legacyOrder: true,
      precedence: coreRoutePrecedence.filter(r => names.has(r.winner) && names.has(r.over)),
    });
    const factories = Object.values(controllers).filter(value => typeof value === 'object' && 'actions' in value);
    assert.deepEqual([...names].sort(), rows.map((r: { name: string }) => r.name).sort());
    for (const row of rows) {
      assert.equal(row.nativeBinding.count, 1);
      assert.equal(plan.routes.filter(r => r.declaration.name === row.name).length, 1);
      assert.equal(factories.filter(f => f.name === row.controller && f.actions.some(a => a === row.action)).length, 1);
    }
    const remaining = inventory.routes.filter(
      (r: { kind: string; nativeBinding?: object }) => r.kind === 'api' && !r.nativeBinding
    );
    assert.equal(remaining.length, 0);
  });
});
