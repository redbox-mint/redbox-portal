import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';

import {
  createAuthorizationAuditEvent,
  AUTHORIZATION_AUDIT_SCHEMA_VERSION,
} from '../../src/services/AuthorizationAuditService';
import { isWebServiceAuthenticated } from '../../src/policies/isWebServiceAuthenticated';
import { protectSessionMutation } from '../../src/policies/protectSessionMutation';
import { sendAuthorizationProblem } from '../../src/policies/authorization-response';

/**
 * Phase 12.3 sentinel coverage: a planted bearer credential must never surface
 * in Problem Details bodies, problem instances, CSRF denials, or audit events.
 */
describe('bearer credential leakage sentinel', function () {
  const SENTINEL = 'sentinel-bearer-0f3c9a71c2b84d5e';

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
    const state: { status?: number; body?: unknown; headers?: Record<string, unknown> } = {};
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

  function installPassport(result: Error | Record<string, unknown> | false): void {
    sails.config.passport = {
      authenticate:
        (_strategy: string, callback: (error: unknown, user: unknown, info?: unknown) => void) =>
        (req: Sails.Req, _res: Sails.Res) => {
          if (result instanceof Error) callback(result, false, undefined);
          else callback(null, result, undefined);
          return req;
        },
    } as unknown as Sails.ConfigObject['passport'];
  }

  it('never echoes an invalid supplied bearer credential in Problem Details', function () {
    installPassport(false);
    for (const header of [`Bearer ${SENTINEL}`, `Basic ${SENTINEL}`, `Bearer`, `bearer  ${SENTINEL}`]) {
      const req = request({ headers: { authorization: header } });
      const { response, state } = responseCapture();

      isWebServiceAuthenticated(req, response, () => assert.fail('invalid credential reached next'));

      assert.equal(state.status, 401);
      assert.equal(JSON.stringify(state.body).includes(SENTINEL), false, `leaked for scheme: ${header.split(' ')[0]}`);
      assert.equal(JSON.stringify(state.body).includes('invalid-or-irrelevant'), false);
    }
  });

  it('keeps query-string credentials out of problem instances', function () {
    const req = request({ query: { token: SENTINEL, api_key: SENTINEL } });
    const { response, state } = responseCapture();

    sendAuthorizationProblem(req, response, 403, 'authorization.scope-denied', 'Access is denied.');

    assert.equal(state.status, 403);
    const serialized = JSON.stringify(state.body);
    assert.equal(serialized.includes(SENTINEL), false);
  });

  it('keeps credentials out of CSRF denial Problem Details', function () {
    const req = request({
      authorizationAuthMethod: 'session',
      query: { token: SENTINEL },
      headers: {},
    });
    const { response, state } = responseCapture();

    protectSessionMutation(req, response, () => assert.fail('missing CSRF reached next'));

    assert.equal(state.status, 403);
    assert.equal(JSON.stringify(state.body).includes(SENTINEL), false);
  });

  it('redacts bearer-shaped sentinels from audit before/after payloads', () => {
    const event = createAuthorizationAuditEvent(
      {
        eventType: 'role.updated',
        actorType: 'user',
        actorId: 'user-1',
        authMethod: 'legacy-bearer',
        brandId: 'brand-1',
        targetType: 'role',
        targetId: 'role-1',
        requestId: 'request-1',
        before: { token: SENTINEL, safe: { status: 'active' } },
        after: { authorization: `Bearer ${SENTINEL}`, safe: { status: 'active' } },
      },
      'succeeded',
      { eventId: () => '00000000-0000-4000-8000-000000000001', now: () => new Date('2026-08-28T00:00:00.000Z') }
    );

    assert.equal(event.schemaVersion, AUTHORIZATION_AUDIT_SCHEMA_VERSION);
    const serialized = JSON.stringify(event);
    assert.equal(serialized.includes(SENTINEL), false);
    assert.deepEqual(event.before, { safe: { status: 'active' } });
    assert.deepEqual(event.after, { safe: { status: 'active' } });
  });
});
