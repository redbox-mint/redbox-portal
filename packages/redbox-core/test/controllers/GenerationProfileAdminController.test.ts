import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import { ControllerExports, ControllerNames } from '../../src/controllers';
import { Policies } from '../../src/policies';
import { generationModelAdmin } from '../../src/policies/generationModelAdmin';
import { Controllers } from '../../src/controllers/GenerationProfileAdminController';
import { routes } from '../../src/config/routes.config';
import { auth } from '../../src/config/auth.config';
import { policies } from '../../src/config/policies.config';
import { generationProfileAdminRoutes } from '../../src/api-routes/groups/ai-profiles';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from '../services/testHelper';

const actions = ['page','overview','create','save','publish','newVersion','duplicate','discard','remove','retire','runTests'];
describe('Generation profile Admin HTTP boundary', () => {
  let req: any, res: any, controller: Controllers.GenerationProfileAdmin, service: any;
  let originals: Map<string, unknown>;
  beforeEach(() => {
    originals = new Map(['BrandingService','RolesService'].map(name => [name, Reflect.get(globalThis, name)]));
    setupServiceTestGlobals(createMockSails());
    controller = new Controllers.GenerationProfileAdmin();
    (global as any).BrandingService = { getBrand: (name: string) => name === 'brand-a' ? { id: 'a' } : { id: 'b' } };
    (global as any).RolesService = { getAdmin: (brand: any) => ({ id: 'admin-' + brand.id }) };
    req = { params: { branding: 'brand-a', portal: 'rdmp', key: 'profile', versionId: 'version' },
      body: {}, query: {}, isAuthenticated: () => true, user: { id: 'actor', roles: [{ id: 'admin-a' }] } };
    res = { set: sinon.stub().returnsThis(), status: sinon.stub().returnsThis(), json: sinon.stub().returnsThis() };
    service = Object.fromEntries(['overview','create','save','publish','newVersion','duplicate','discard','remove','retire','runTests'].map(name => [name, sinon.stub().resolves({ ok: true })]));
    sails.services.generationprofileadminservice = service;
  });
  afterEach(() => {
    sinon.restore(); cleanupServiceTestGlobals();
    for (const [name, value] of originals) value === undefined ? Reflect.deleteProperty(globalThis, name) : Reflect.set(globalThis, name, value);
  });
  for (const role of ['Researcher','Librarians','foreign Admin','anonymous']) {
    for (const action of actions) {
      it(`denies ${role} on ${action}`, async () => {
        req.user.roles = [{ id: role === 'foreign Admin' ? 'admin-b' : role }];
        if (role === 'anonymous') req.isAuthenticated = () => false;
        await (controller as any)[action](req, res);
        assert.equal(res.status.lastCall.args[0], 403);
        assert.equal(res.json.lastCall.args[0].error.code, 'GENERATION_SOURCE_FORBIDDEN');
        assert.ok(Object.values(service).every((method: any) => method.callCount === 0));
      });
    }
  }
  it('explicitly opts the admin view into initial asset delivery', () => {
    sails.config.generation = { enabled: false } as typeof sails.config.generation;
    const view = sinon.stub(controller, 'sendView');
    controller.page(req, res);
    assert.equal(view.firstCall.args[2], 'admin/ai-profiles');
    assert.deepEqual(view.firstCall.args[3], {
      pageTitleKey: 'ai-profiles-title', adminInitialStyles: true, generationEnabled: false,
    });
  });
  it('derives brand and actor from route/session only and returns raw JSON', async () => {
    req.body = { brandId: 'b', actorId: 'forged', value: 'draft' };
    await controller.create(req, res);
    assert.deepEqual(service.create.firstCall.args, ['a', req.body, 'actor']);
    assert.deepEqual(res.json.lastCall.args[0], { ok: true });
    assert.equal(res.set.firstCall.args[0]['Cache-Control'], 'no-store');
    req.params.branding = 'brand-b';
    await controller.create(req, res);
    assert.equal(res.status.lastCall.args[0], 403); assert.equal(service.create.callCount, 1);
  });
  it('exports the Admin controller and policy for pre-lift shim generation', () => {
    assert.ok(ControllerNames.includes('GenerationProfileAdminController'));
    const exported = ControllerExports.GenerationProfileAdminController as Record<string, unknown>;
    for (const action of actions) assert.equal(typeof exported[action], 'function', action);
    assert.equal(Policies.generationModelAdmin, generationModelAdmin);
  });
  it('declares every route with CSRF/session auth and excludes bearer promotion', () => {
    assert.equal(generationProfileAdminRoutes.length, 10);
    for (const route of generationProfileAdminRoutes) {
      assert.equal(route.csrf, true); assert.deepEqual(route.security, [{ sessionAuth: [] }]);
      assert.ok(routes[route.method + ' ' + route.path]); assert.ok(route.responses?.[409]);
    }
    const configured = policies.GenerationProfileAdminController as any;
    assert.ok(configured['*'].includes('generationModelAdmin'));
    assert.equal(configured['*'].includes('isWebServiceAuthenticated'), false);
    assert.ok(configured.page.indexOf('checkAuth') < configured.page.indexOf('generationModelAdmin'));
    for (const path of ['/:branding/:portal/admin/ai-profiles', '/:branding/:portal/app/ai-profiles(/*)']) {
      assert.ok(auth.rules.some(rule => rule.path === path && rule.role === 'Admin'));
    }
  });
  it('parses AI model JSON with a bounded body and safe malformed-request errors', async () => {
    const express = require('express'); const supertest = require('supertest');
    const { http } = require('../../src/config/http.config');
    const app = express(); app.use(http.middleware.myBodyParser);
    app.post('/a/p/app/ai-profiles/try-prompt', (_req: any, res: any) => res.json({ ok: true }));
    for (const [body, status] of [['{"PRIVATE BODY":broken}',400], [JSON.stringify({ prompt: 'x'.repeat(512001) }),413]] as const) {
      const response = await supertest(app).post('/a/p/app/ai-profiles/try-prompt').set('Content-Type','application/json').send(body);
      assert.equal(response.status, status); assert.equal(JSON.stringify(response.body).includes('PRIVATE'), false);
      assert.equal(response.body.error.code, 'GENERATION_REQUEST_INVALID');
    }
  });
});
