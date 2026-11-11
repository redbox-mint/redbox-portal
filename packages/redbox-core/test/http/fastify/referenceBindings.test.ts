import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { referenceReadDeclarations } from '../../../src/http/referenceRoutes';
import * as controllers from '../../../src/http/controllers/ReferenceControllers';
import { apiRouteRegistrations, composeRoutes } from '../../../src/http/fastify/routes';
import { coreRoutePrecedence } from '../../../src/http/fastify/precedence';
import { portalHttpPolicies } from '../../../src/application/portal/httpPolicies';
import { nativePolicyNames } from '../../../src/http/fastify/policies';
import { coreRouteName } from '../../../src/http/fastify/routes';

describe('FM-023 declaration-derived reference bindings', () => {
  it('binds precisely the 43 FM-002 routes to one named action, preserving policy and implicit HEAD', async () => {
    assert.equal(referenceReadDeclarations.length, 43);
    const inventory = JSON.parse(
      readFileSync(
        path.resolve(__dirname, '../../../../../support/specs/fastify-migration/evidence/FM-002.inventory.json'),
        'utf8'
      )
    );
    const rows = inventory.routes.filter((row: { ownerTask: string }) => row.ownerTask === 'FM-023');
    assert.equal(rows.length, 43);
    for (const row of rows) {
      assert.equal(row.nativeBinding.count, 1);
      assert.equal(row.selectedFactory, row.controller);
      assert.equal(row.nativeBinding.action, row.action);
    }

    const factories = Object.values(controllers).filter(value => typeof value === 'object' && 'actions' in value);
    const registrations = apiRouteRegistrations({
      declarations: referenceReadDeclarations,
      configuration: portalHttpPolicies(),
      provider: 'core',
    });
    const selected = new Set(registrations.map(item => item.declaration.name));
    const plan = await composeRoutes(registrations, {
      policyNames: nativePolicyNames,
      rootContext: '/portal',
      legacyOrder: true,
      precedence: coreRoutePrecedence.filter(item => selected.has(item.winner) && selected.has(item.over)),
    });
    assert.equal(plan.routes.length, 43);
    for (const route of referenceReadDeclarations) {
      const bound = plan.routes.filter(item => item.declaration.name === coreRouteName(route.method, route.path));
      assert.equal(bound.length, 1, route.path);
      const factory = factories.filter(
        item => item.name === route.controller && item.actions.some(action => action === route.action)
      );
      assert.equal(factory.length, 1, route.path);
      assert.strictEqual(bound[0].declaration.api, route);
      assert.equal(bound[0].effectiveCsrf ?? (bound[0].declaration.csrf ? 'protect' : 'none'), 'none');
    }
  });
});
