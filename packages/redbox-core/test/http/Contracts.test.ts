import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { getMergedApiRoutes } from '../../src/api-routes/route-registry';
import { getRecordTypeRoute } from '../../src/api-routes/groups/recordtypes';
import { validateApiRouteRequest } from '../../src/api-routes/validation';

describe('standalone HTTP contracts', () => {
  it('validates minimal inputs, missing and repeated names, and declared fallback precedence', () => {
    assert.equal(validateApiRouteRequest({ query: { name: 'dataset' } }, getRecordTypeRoute).valid, true);
    assert.equal(validateApiRouteRequest({}, getRecordTypeRoute).valid, false);
    assert.equal(validateApiRouteRequest({ query: { name: ['a', 'b'] } }, getRecordTypeRoute).valid, false);
    const route = {
      ...getRecordTypeRoute,
      request: {
        query: z.object({ name: z.string() }),
        legacyParamFallbacks: { name: ['params', 'body'] as const },
      },
    };
    for (const [input, expected] of [
      [{ params: { name: 'path' }, query: { name: 'query' }, body: { name: 'body' } }, 'query'],
      [{ params: { name: 'path' }, body: { name: 'body' } }, 'path'],
      [{ body: { name: 'body' } }, 'body'],
    ] as const) {
      const validated = validateApiRouteRequest(input, route);
      assert(validated.valid);
      assert.equal(validated.query.name, expected);
    }
    assert.equal(validateApiRouteRequest({ body: { name: 'body' } }, getRecordTypeRoute).valid, false);
  });

  it('isolates injected registries', () => {
    const custom = { ...getRecordTypeRoute, path: '/custom', action: 'custom' };
    assert(getMergedApiRoutes({ apiRoutesHooks: [() => [custom]] }).includes(custom));
    assert(!getMergedApiRoutes({}).includes(custom));
  });

  it('imports compiled validation/contracts with Sails loading forbidden', function () {
    this.timeout(10_000);
    execFileSync(process.execPath, [
      '-e',
      String.raw`
      const assert = require('node:assert/strict');
      const Module = require('node:module');
      const load = Module._load;
      Module._load = function(name, ...args) {
        if (name === 'sails' || name.startsWith('sails/')) throw Error('Sails load forbidden');
        return load.call(this, name, ...args);
      };
      require('./dist/api-routes/validation');
      require('./dist/api-routes/groups/recordtypes');
      require('./dist/api-routes/route-registry').getMergedApiRoutes({});
      assert.equal(global.sails, undefined);
      assert.equal(Object.keys(require.cache).some(p => /\/node_modules\/sails\//.test(p)), false);
    `,
    ]);
  });
});
