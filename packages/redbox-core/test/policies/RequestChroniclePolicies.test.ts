import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import * as sinon from 'sinon';
import { checkAuth } from '../../src/policies/checkAuth';
import { contentSecurityPolicy } from '../../src/policies/contentSecurityPolicy';
import { createSinonStubLogger } from '../logger.test';

describe('Policy logging privacy', () => {
  const globals = new Map<string, unknown>();
  let logger: ReturnType<typeof createSinonStubLogger>;

  beforeEach(() => {
    for (const name of ['sails', 'BrandingService', 'RolesService', 'PathRulesService']) {
      globals.set(name, Reflect.get(globalThis, name));
    }
    logger = createSinonStubLogger(sinon);
    Reflect.set(globalThis, 'sails', { log: logger, config: {} });
    Reflect.set(globalThis, 'BrandingService', { getBrand: () => ({ name: 'default' }) });
    Reflect.set(globalThis, 'PathRulesService', { getRulesFromPath: () => undefined });
  });

  afterEach(() => {
    sinon.restore();
    for (const [name, value] of globals) Reflect.set(globalThis, name, value);
    globals.clear();
  });

  for (const policy of [checkAuth, contentSecurityPolicy]) {
    it(`${policy.name} excludes preview tokens without changing the requested path`, () => {
      const token = 'PRIVATE-PREVIEW-TOKEN';
      const path = `/default/rdmp/preview/${token}.css`;
      const req = { path, options: {}, session: { branding: 'default' }, isAuthenticated: () => true } as Sails.Req;
      const set = sinon.stub();
      const next = sinon.stub();
      policy(req, { set } as unknown as Sails.Res, next);
      sinon.assert.calledOnce(next);
      assert.equal(req.path, path);
      if (policy === contentSecurityPolicy) sinon.assert.called(set);
      const output = inspect(
        logger.verbose.getCalls().map(call => call.args),
        { depth: null }
      );
      assert.ok(!output.includes(token), 'Policy logs must exclude preview tokens');
      assert.ok(output.includes('/default/rdmp/preview/REDACTED.css'), 'Keep the safe path useful for diagnostics');
    });
  }
});
