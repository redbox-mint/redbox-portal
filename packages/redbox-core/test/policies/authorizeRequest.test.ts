import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';

import {
  asScopeKey,
  freezeAuthorizationContext,
  scopeAuthorization,
  type AuthorizationContext,
} from '../../src/authorization';
import { authorizeRequest } from '../../src/policies/authorizeRequest';
import type { AuthorizationRolloutResult } from '../../src/services/AuthorizationRolloutService';

function context(category: 'anonymous' | 'authenticated'): AuthorizationContext {
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: {
      category,
      authMethod: category === 'anonymous' ? 'anonymous' : 'session',
      active: true,
      ...(category === 'anonymous' ? {} : { userId: 'user-1' }),
    },
    brand: { id: 'brand-1', name: 'default', exists: true, authorized: true },
  });
}

function deniedResult(): AuthorizationRolloutResult {
  return {
    allowed: false,
    reasonCode: 'scope-missing',
    mode: 'enforce',
    enforcedBy: 'scope',
    legacyAllowed: true,
    scopeDecision: {
      allowed: false,
      reasonCode: 'scope-missing',
      requiredScope: asScopeKey('record.read'),
    },
  };
}

function request(principal: AuthorizationContext, accept: string, path = '/default/rdmp/record/view/one'): Sails.Req {
  return {
    method: 'GET',
    path,
    originalUrl: path,
    headers: { accept },
    query: {},
    session: {} as Sails.Req['session'],
    authorization: principal,
    options: {
      authorization: scopeAuthorization('record.read'),
      routeId: 'GET /:branding/:portal/record/view/:oid (RecordController#view)',
    },
    isAuthenticated: (() => principal.principal.category !== 'anonymous') as Sails.Req['isAuthenticated'],
  } as unknown as Sails.Req;
}

function responseCapture() {
  const state: { status?: number; body?: unknown; headers?: Record<string, unknown> } = {};
  const response = {
    status(status: number) {
      state.status = status;
      return this;
    },
    type() {
      return this;
    },
    set(headers: Record<string, unknown>) {
      state.headers = headers;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as Sails.Res;
  return { response, state };
}

describe('authorizeRequest policy', function () {
  let originalServices: Sails.Application['services'];
  let originalGetActions: Sails.Application['getActions'];

  beforeEach(function () {
    originalServices = sails.services;
    originalGetActions = sails.getActions;
    sails.services = {
      authorizationrolloutservice: { evaluateRequest: () => deniedResult() },
    };
  });

  afterEach(function () {
    sails.services = originalServices;
    sails.getActions = originalGetActions;
  });

  it('redirects only an anonymous browser HTML route', function () {
    let redirected = false;
    sails.getActions = () => ({ 'user/redirlogin': () => (redirected = true) });
    const req = request(context('anonymous'), 'text/html');
    const { response, state } = responseCapture();

    authorizeRequest(req, response, () => assert.fail('denied request reached next'));

    assert.equal(redirected, true);
    assert.equal(state.status, undefined);
  });

  it('returns Problem Details instead of redirecting for an anonymous JSON request', function () {
    sails.getActions = () => ({ 'user/redirlogin': () => assert.fail('JSON request redirected') });
    const req = request(context('anonymous'), 'application/json');
    const { response, state } = responseCapture();

    authorizeRequest(req, response, () => assert.fail('denied request reached next'));

    assert.equal(state.status, 401);
    assert.equal((state.body as { code: string }).code, 'authentication-required');
    assert.equal(typeof (state.body as { requestId: string }).requestId, 'string');
  });

  it('returns a bounded 403 for an authenticated principal without exposing the missing scope', function () {
    const req = request(context('authenticated'), 'application/json');
    const { response, state } = responseCapture();

    authorizeRequest(req, response, () => assert.fail('denied request reached next'));

    assert.equal(state.status, 403);
    assert.equal((state.body as { code: string }).code, 'access-denied');
    assert.equal(JSON.stringify(state.body).includes('record.read'), false);
  });

  it('preserves record-schema forbidden Problem Details', function () {
    const req = request(context('authenticated'), 'application/json', '/default/rdmp/api/records/schemas/digest');
    const { response, state } = responseCapture();

    authorizeRequest(req, response, () => assert.fail('denied schema request reached next'));

    assert.equal(state.status, 403);
    assert.equal((state.body as { code: string }).code, 'record-schema.forbidden');
    assert.equal(state.headers?.['Content-Type'], 'application/problem+json');
  });
});
