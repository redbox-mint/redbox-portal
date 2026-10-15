import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import * as sinon from 'sinon';
import { checkAuth } from '../../src/policies/checkAuth';
import { contentSecurityPolicy } from '../../src/policies/contentSecurityPolicy';
import { noCache } from '../../src/policies/noCache';
import { createSinonStubLogger } from '../logger.test';

describe('Policy logging privacy', () => {
  const globals = new Map<string, unknown>();
  let logger: ReturnType<typeof createSinonStubLogger>;

  beforeEach(() => {
    for (const name of ['sails', 'BrandingService', 'RolesService', 'PathRulesService']) {
      globals.set(name, Reflect.get(globalThis, name));
    }
    logger = createSinonStubLogger(sinon);
    Reflect.set(globalThis, 'sails', { log: logger, config: { views: { noCache: [] } } });
    Reflect.set(globalThis, 'BrandingService', { getBrand: () => ({ name: 'default' }) });
    Reflect.set(globalThis, 'PathRulesService', { getRulesFromPath: () => undefined });
  });

  afterEach(() => {
    sinon.restore();
    for (const [name, value] of globals) Reflect.set(globalThis, name, value);
    globals.clear();
  });

  for (const policy of [checkAuth, contentSecurityPolicy, noCache]) {
    it(`${policy.name} excludes preview tokens without changing the requested path`, () => {
      const token = 'PRIVATE-PREVIEW-TOKEN';
      const path = `/default/rdmp/preview/${token}.css`;
      const req = { path, options: {}, session: { branding: 'default' }, isAuthenticated: () => true } as Sails.Req;
      const set = sinon.stub();
      const next = sinon.stub();
      policy(req, { set, setHeader: set } as unknown as Sails.Res, next);
      sinon.assert.calledOnce(next);
      assert.equal(req.path, path);
      if (policy === contentSecurityPolicy || policy === noCache) sinon.assert.called(set);
      const output = inspect(
        logger.verbose.getCalls().map(call => call.args),
        { depth: null }
      );
      assert.ok(!output.includes(token), 'Policy logs must exclude preview tokens');
      assert.ok(output.includes('/default/rdmp/preview/REDACTED.css'), 'Keep the safe path useful for diagnostics');
    });
  }

  it('noCache redacts a preview path when view components keep their cache behavior', () => {
    const req: Partial<Sails.Req> = {
      path: '/default/rdmp/preview/PRIVATE-PREVIEW-TOKEN.css',
      options: { locals: { view: 'preview' } },
    };
    const setHeader = sinon.stub();
    const next = sinon.stub();
    noCache(req as Sails.Req, { setHeader } as unknown as Sails.Res, next);
    sinon.assert.calledOnce(next);
    sinon.assert.notCalled(setHeader);
    const output = inspect(
      logger.verbose.getCalls().map(call => call.args),
      { depth: null }
    );
    assert.ok(!output.includes('PRIVATE-PREVIEW-TOKEN'));
    assert.ok(output.includes('/default/rdmp/preview/REDACTED.css'));
  });
});
