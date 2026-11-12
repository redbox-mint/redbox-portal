import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { recordQueryReadDeclarations, recordReadRoutes, queryReadRoutes } from '../../../src/http/readRoutes';
import * as controllers from '../../../src/http/controllers/ReadControllers';
import { apiRouteRegistrations, composeRoutes, coreRouteName } from '../../../src/http/fastify/routes';
import { coreRoutePrecedence } from '../../../src/http/fastify/precedence';
import { portalHttpPolicies } from '../../../src/application/portal/httpPolicies';
import { nativePolicyNames } from '../../../src/http/fastify/policies';

describe('FM-024 production read scope and bindings', () => {
  it('binds the 45 new inventory declarations once, excludes the pilot, and preserves ALL/HEAD and request metadata', async () => {
    const inventory = JSON.parse(
      readFileSync(
        path.resolve(__dirname, '../../../../../support/specs/fastify-migration/evidence/FM-002.inventory.json'),
        'utf8'
      )
    );
    const rows = inventory.routes.filter(
      (row: { ownerTask: string; controller: string; action: string }) =>
        row.ownerTask === 'FM-024' && !(row.controller === 'webservice/RecordController' && row.action === 'getMeta')
    );
    assert.equal(rows.length, 45);
    assert.equal(recordQueryReadDeclarations.length, 45);
    assert.equal(recordReadRoutes.length, 21);
    assert.equal(queryReadRoutes.length, 25);
    const registrations = apiRouteRegistrations({
        declarations: recordQueryReadDeclarations,
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
      assert.equal(row.nativeBinding.migratedBy, 'FM-024');
      const binding = plan.routes.filter(item => item.declaration.name === row.name);
      assert.equal(binding.length, 1);
      const factory = factories.filter(
        item => item.name === row.controller && item.actions.some(action => action === row.action)
      );
      assert.equal(factory.length, 1, row.path);
      assert.equal(binding[0].declaration.action, row.action);
    }
    for (const route of recordQueryReadDeclarations) {
      const binding = plan.routes.find(item => item.declaration.name === coreRouteName(route.method, route.path))!;
      if (route.method !== 'all') assert.strictEqual(binding.declaration.api, route);
      else assert.equal(binding.declaration.method, 'all');
    }
    assert(
      !recordQueryReadDeclarations.some(
        route => route.controller === 'webservice/RecordController' && route.action === 'getMeta'
      )
    );
    assert(controllers.apiRecordReadController.actions.includes('getMeta'));
    assert(controllers.apiRecordReadController.actions.includes('updateMeta'));
    assert(controllers.recordReadController.actions.includes('getForm'));
  });
});
