import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { mutationDeclarations } from '../../../src/http/mutationRoutes';
import * as controllers from '../../../src/http/controllers/MutationControllers';
import { apiRouteRegistrations, composeRoutes, coreRouteName } from '../../../src/http/fastify/routes';
import { coreRoutePrecedence } from '../../../src/http/fastify/precedence';
import { portalHttpPolicies } from '../../../src/application/portal/httpPolicies';
import { nativePolicyNames } from '../../../src/http/fastify/policies';

describe('FM-026 production mutation scope and bindings', () => {
  it('binds the 55 inventory declarations once, excludes other tasks, and preserves request metadata', async () => {
    const inventory = JSON.parse(
      readFileSync(
        path.resolve(__dirname, '../../../../../support/specs/fastify-migration/evidence/FM-002.inventory.json'),
        'utf8'
      )
    );
    const rows = inventory.routes.filter(
      (row: { ownerTask: string; controller: string; action: string }) => row.ownerTask === 'FM-026'
    );
    assert.equal(rows.length, 55);
    assert.equal(mutationDeclarations.length, 55);
    const registrations = apiRouteRegistrations({
        declarations: mutationDeclarations,
        configuration: portalHttpPolicies(),
        provider: 'core',
      }),
      selected = new Set(registrations.map(item => item.declaration.name));
    const plan = await composeRoutes(registrations, {
      policyNames: nativePolicyNames,
      rootContext: '/portal',
      legacyOrder: true,
      precedence: coreRoutePrecedence.filter(item => selected.has(item.winner) && selected.has(item.over)),
    });
    const factories = Object.values(controllers).filter(value => typeof value === 'object' && 'actions' in value);
    assert.deepEqual([...selected].sort(), rows.map((row: { name: string }) => row.name).sort());
    for (const row of rows) {
      assert.equal(row.nativeBinding.count, 1);
      assert.equal(row.nativeBinding.migratedBy, row.action === 'updateMeta' ? 'FM-019' : 'FM-026');
      const binding = plan.routes.filter(item => item.declaration.name === row.name);
      assert.equal(binding.length, 1);
      const factory = factories.filter(
        item => item.name === row.controller && item.actions.some(action => action === row.action)
      );
      assert.equal(factory.length, 1, row.path);
      assert.equal(binding[0].declaration.action, row.action);
    }
    for (const route of mutationDeclarations) {
      const binding = plan.routes.find(item => item.declaration.name === coreRouteName(route.method, route.path))!;
      assert.strictEqual(binding.declaration.api, route);
    }
  });
});
