import assert from 'node:assert/strict';
import express from 'express';
import { apiHttpDeclarations } from '../../src/http/express/apiManifest';
import { registerCoreApiRoutes } from '../../src/api-routes/route-registry';
import { mountBrandingOperationRoutes } from '../../src/http/express/brandingOperations';

describe('owned API declaration coverage and offline policy binding', () => {
  it('covers every registered API contract exactly once with an explicit owned adapter declaration', () => {
    const declared = new Map<string, number>();
    for (const route of apiHttpDeclarations) {
      const key = route.method.toUpperCase() + ' ' + route.path;
      declared.set(key, (declared.get(key) ?? 0) + 1);
    }
    const missing = registerCoreApiRoutes().filter(
      route => declared.get(route.method.toUpperCase() + ' ' + route.path) !== 1
    );
    assert.deepEqual(
      missing.map(route => route.method + ' ' + route.path),
      []
    );
    assert.deepEqual(
      [...declared].filter(([, count]) => count !== 1),
      []
    );
    console.log(
      'Owned API declarations: ' +
        declared.size +
        '; registered contracts: ' +
        registerCoreApiRoutes().length +
        '; missing/duplicate: 0.'
    );
  });
  it('rejects an unbound action policy before registering any route or executing domain work', () => {
    const router = express.Router();
    const input: Parameters<typeof mountBrandingOperationRoutes>[1] = {
      branding: null!,
      csrf: null!,
      policies: {},
      policyConfiguration: { '*': false, 'webservice/BrandingController': { publish: ['unbound'] } },
      log: null!,
      audit: async () => {
        throw new Error('No audit before binding');
      },
    };
    assert.throws(() => mountBrandingOperationRoutes(router, input), /policy/i);
    assert.equal(router.stack.length, 0);
  });
});
