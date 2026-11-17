import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import { Controllers, mapGenerationModelAdminError } from '../../src/controllers/GenerationModelAdminController';
import { GenerationError } from '../../src/model/generation';
import { routes } from '../../src/config/routes.config';
import { auth } from '../../src/config/auth.config';
import { policies } from '../../src/config/policies.config';
import { generationModelAdminRoutes } from '../../src/api-routes/groups/ai-models';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from '../services/testHelper';

const actions = ['page','overview','createConnection','updateConnection','testConnection','createModel','newVersion','updateDraft','publish','retire','tryPrompt'];
describe('Generation model Admin HTTP boundary', () => {
  let req: any, res: any, controller: Controllers.GenerationModelAdmin, service: any;
  let originals: Map<string, unknown>;
  beforeEach(() => {
    originals = new Map(['BrandingService','RolesService'].map(name => [name, Reflect.get(globalThis, name)]));
    setupServiceTestGlobals(createMockSails());
    controller = new Controllers.GenerationModelAdmin();
    (global as any).BrandingService = { getBrand: (name: string) => name === 'brand-a' ? { id: 'a' } : { id: 'b' } };
    (global as any).RolesService = { getAdmin: (brand: any) => ({ id: 'admin-' + brand.id }) };
    req = { params: { branding: 'brand-a', portal: 'rdmp', connectionId: 'connection', deploymentId: 'version' },
      body: {}, query: {}, isAuthenticated: () => true, user: { id: 'actor', roles: [{ id: 'admin-a' }] } };
    res = { set: sinon.stub().returnsThis(), status: sinon.stub().returnsThis(), json: sinon.stub().returnsThis() };
    service = Object.fromEntries(['adminOverview','saveAdminConnection','testConnectionDraft','createModel','newDeploymentVersion',
      'updateDeploymentDraft','publishDeployment','retireDeployment','tryPrompt'].map(name => [name, sinon.stub().resolves({ ok: true })]));
    sails.services.generationmodelservice = service;
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
  it('derives brand and actor from route/session only and returns raw JSON', async () => {
    req.body = { brandId: 'b', actorId: 'forged', value: 'draft' };
    await controller.createModel(req, res);
    assert.deepEqual(service.createModel.firstCall.args, ['a', req.body, 'actor']);
    assert.deepEqual(res.json.lastCall.args[0], { ok: true });
    assert.equal(res.set.firstCall.args[0]['Cache-Control'], 'no-store');
    req.params.branding = 'brand-b';
    await controller.createModel(req, res);
    assert.equal(res.status.lastCall.args[0], 403); assert.equal(service.createModel.callCount, 1);
  });
  it('returns translated 409 errors without provider messages, bodies or secrets', async () => {
    service.updateDeploymentDraft.rejects(new GenerationError('GENERATION_TARGET_CONFLICT', 'PRIVATE BODY'));
    await controller.updateDraft(req, res);
    assert.equal(res.status.lastCall.args[0], 409);
    assert.deepEqual(res.json.lastCall.args[0], { error: { code: 'GENERATION_TARGET_CONFLICT',
      messageKey: 'ai-models-error-generation-target-conflict', retryable: false } });
    const unknown = mapGenerationModelAdminError(new Error('PRIVATE BODY AND SECRET'));
    assert.equal(unknown.status, 503); assert.equal(JSON.stringify(unknown).includes('PRIVATE'), false);
  });
  it('has translations for every error emitted by the installed provider adapters', () => {
    const translations = require('../../../../language-defaults/en/translation.json');
    for (const code of ['GENERATION_PROFILE_INVALID', 'GENERATION_DEPLOYMENT_INCOMPATIBLE', 'GENERATION_OUTPUT_PARSE_FAILED',
      'GENERATION_PROVIDER_AUTH_FAILED', 'GENERATION_PROVIDER_RATE_LIMITED', 'GENERATION_PROVIDER_TIMEOUT', 'GENERATION_PROVIDER_UNAVAILABLE'] as const) {
      const mapped = mapGenerationModelAdminError(new GenerationError(code, 'PRIVATE'));
      assert.equal(typeof translations[mapped.body.error.messageKey], 'string');
    }
  });
  it('declares every route with CSRF/session auth and excludes bearer promotion', () => {
    assert.equal(generationModelAdminRoutes.length, 10);
    for (const route of generationModelAdminRoutes) {
      assert.equal(route.csrf, true); assert.deepEqual(route.security, [{ sessionAuth: [] }]);
      assert.ok(routes[route.method + ' ' + route.path]); assert.ok(route.responses?.[409]);
    }
    const configured = policies.GenerationModelAdminController as any;
    assert.ok(configured['*'].includes('generationModelAdmin'));
    assert.equal(configured['*'].includes('isWebServiceAuthenticated'), false);
    assert.ok(configured.page.indexOf('checkAuth') < configured.page.indexOf('generationModelAdmin'));
    for (const path of ['/:branding/:portal/admin/ai-models', '/:branding/:portal/app/ai-models(/*)']) {
      assert.ok(auth.rules.some(rule => rule.path === path && rule.role === 'Admin'));
    }
  });
  it('parses AI model JSON with a bounded body and safe malformed-request errors', async () => {
    const express = require('express'); const supertest = require('supertest');
    const { http } = require('../../src/config/http.config');
    const app = express(); app.use(http.middleware.myBodyParser);
    app.post('/a/p/app/ai-models/try-prompt', (_req: any, res: any) => res.json({ ok: true }));
    for (const [body, status] of [['{"PRIVATE BODY":broken}',400], [JSON.stringify({ prompt: 'x'.repeat(512001) }),413]] as const) {
      const response = await supertest(app).post('/a/p/app/ai-models/try-prompt').set('Content-Type','application/json').send(body);
      assert.equal(response.status, status); assert.equal(JSON.stringify(response.body).includes('PRIVATE'), false);
      assert.equal(response.body.error.code, 'GENERATION_REQUEST_INVALID');
    }
  });
});
