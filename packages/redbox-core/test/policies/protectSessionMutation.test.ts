import { strict as assert } from 'node:assert';
import csrf = require('@sailshq/csurf');
import { describe, it } from 'mocha';

import { apiRoute } from '../../src/api-routes/route-factory';
import { scopeAuthorization } from '../../src/authorization';
import { buildContractApiPolicies } from '../../src/config/policies.config';
import { protectSessionMutation } from '../../src/policies/protectSessionMutation';

function request(overrides: Partial<Sails.Req> = {}): Sails.Req {
  return {
    method: 'POST',
    path: '/default/rdmp/api/authorization/roles',
    originalUrl: '/default/rdmp/api/authorization/roles',
    headers: {},
    body: {},
    query: {},
    session: {} as Sails.Req['session'],
    isAuthenticated: (() => true) as Sails.Req['isAuthenticated'],
    ...overrides,
  } as Sails.Req;
}

function responseCapture() {
  const state: { status?: number; body?: unknown } = {};
  const response = {
    status(status: number) {
      state.status = status;
      return this;
    },
    type() {
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as Sails.Res;
  return { response, state };
}

describe('protectSessionMutation policy', function () {
  it('requires the existing CSRF token for session-authenticated mutations', function () {
    const session = {} as Sails.Req['session'];
    const bootstrapRequest = request({ method: 'GET', session });
    let token = '';
    csrf()(bootstrapRequest, {} as Sails.Res, error => {
      assert.equal(error, undefined);
      token = (bootstrapRequest as Sails.Req & { csrfToken(): string }).csrfToken();
    });

    const validRequest = request({
      session,
      authorizationAuthMethod: 'session',
      headers: { 'x-csrf-token': token },
    });
    const { response } = responseCapture();
    let nextCalls = 0;
    protectSessionMutation(validRequest, response, () => nextCalls++);
    assert.equal(nextCalls, 1);

    const missingRequest = request({ session, authorizationAuthMethod: 'session' });
    const missing = responseCapture();
    protectSessionMutation(missingRequest, missing.response, () => assert.fail('missing CSRF reached next'));
    assert.equal(missing.state.status, 403);
  });

  it('exempts only a server-resolved valid bearer and rejects unresolved credentials', function () {
    const bearerRequest = request({ authorizationAuthMethod: 'bearer' });
    const bearer = responseCapture();
    let nextCalls = 0;
    protectSessionMutation(bearerRequest, bearer.response, () => nextCalls++);
    assert.equal(nextCalls, 1);

    const anonymousRequest = request({ authorizationAuthMethod: 'anonymous' });
    const anonymous = responseCapture();
    protectSessionMutation(anonymousRequest, anonymous.response, () => assert.fail('anonymous mutation reached next'));
    assert.equal(anonymous.state.status, 401);
  });

  it('never reflects query-string credentials in CSRF Problem Details', function () {
    const csrfRequest = request({
      path: undefined,
      originalUrl: '/default/rdmp/api/authorization/roles?access_token=credential-secret',
      authorizationAuthMethod: 'session',
    });
    const denied = responseCapture();

    protectSessionMutation(csrfRequest, denied.response, () => assert.fail('missing CSRF reached next'));

    assert.equal(denied.state.status, 403);
    assert.equal((denied.state.body as { instance?: string }).instance, '/default/rdmp/api/authorization/roles');
    assert.equal(JSON.stringify(denied.state.body).includes('credential-secret'), false);
  });

  it('bounds the public Problem Details instance path', function () {
    const denied = responseCapture();
    protectSessionMutation(
      request({ path: `/${'x'.repeat(3_000)}`, authorizationAuthMethod: 'session' }),
      denied.response,
      () => assert.fail('missing CSRF reached next')
    );

    assert.equal((denied.state.body as { instance: string }).instance.length, 2_048);
  });

  it('wires the policy only to unsafe authorization contract routes', function () {
    const mutation = apiRoute(
      'post',
      '/:branding/:portal/api/authorization/roles',
      'webservice/AuthorizationController',
      'createRole',
      undefined,
      { authorization: scopeAuthorization('authorization.role.manage') }
    );
    const read = apiRoute(
      'get',
      '/:branding/:portal/api/authorization/roles',
      'webservice/AuthorizationController',
      'listRoles',
      undefined,
      { authorization: scopeAuthorization('authorization.role.read') }
    );
    const policies = buildContractApiPolicies([mutation, read]);
    const controller = policies['webservice/AuthorizationController'] as Record<string, string[]>;

    assert.equal(controller.createRole.includes('protectSessionMutation'), true);
    assert.equal(controller.listRoles.includes('protectSessionMutation'), false);
    assert.ok(
      controller.createRole.indexOf('protectSessionMutation') <
        controller.createRole.indexOf('validateApiContractRequest')
    );
  });
});
