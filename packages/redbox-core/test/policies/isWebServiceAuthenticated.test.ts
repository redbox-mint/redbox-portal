import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';

import { isWebServiceAuthenticated } from '../../src/policies/isWebServiceAuthenticated';
import { isAuthenticated } from '../../src/policies/isAuthenticated';
import { freezeAuthorizationContext } from '../../src/authorization';
import { asScopeKey, createScopeRegistry } from '../../src/authorization';
import { Services as AuthorizationServices } from '../../src/services/AuthorizationService';

interface ResponseCapture {
  readonly response: Sails.Res;
  readonly state: { status?: number; contentType?: string; body?: unknown };
}

function responseCapture(): ResponseCapture {
  const state: { status?: number; contentType?: string; body?: unknown } = {};
  const response = {
    status(status: number) {
      state.status = status;
      return this;
    },
    type(contentType: string) {
      state.contentType = contentType;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as Sails.Res;
  return { response, state };
}

function request(overrides: Partial<Sails.Req> = {}): Sails.Req {
  return {
    method: 'GET',
    path: '/default/rdmp/api/example',
    originalUrl: '/default/rdmp/api/example',
    headers: {},
    query: {},
    session: {} as Sails.Req['session'],
    isAuthenticated: (() => false) as Sails.Req['isAuthenticated'],
    ...overrides,
  } as Sails.Req;
}

function installPassport(result: Error | Record<string, unknown> | false, info?: unknown): void {
  sails.config.passport = {
    authenticate:
      (
        _strategy: string,
        callback: (error: Error | null, user: Record<string, unknown> | false, info: unknown) => void
      ) =>
      (req: Sails.Req, _res: Sails.Res) => {
        if (result instanceof Error) callback(result, false, undefined);
        else callback(null, result, info);
        return req;
      },
  } as unknown as Sails.ConfigObject['passport'];
}

describe('isWebServiceAuthenticated policy', function () {
  it('preserves an authenticated session when no Authorization header is supplied', function () {
    const req = request({ isAuthenticated: (() => true) as Sails.Req['isAuthenticated'] });
    const { response } = responseCapture();
    let nextCalls = 0;

    isWebServiceAuthenticated(req, response, () => nextCalls++);

    assert.equal(nextCalls, 1);
    assert.equal(req.authorizationAuthMethod, 'session');
  });

  it('marks an unauthenticated request anonymous when no Authorization header is supplied', function () {
    const req = request();
    const { response } = responseCapture();
    let nextCalls = 0;

    isWebServiceAuthenticated(req, response, () => nextCalls++);

    assert.equal(nextCalls, 1);
    assert.equal(req.authorizationAuthMethod, 'anonymous');
  });

  it('rejects a malformed supplied header even when a valid session exists', function () {
    const req = request({
      headers: { authorization: 'Basic abc' },
      isAuthenticated: (() => true) as Sails.Req['isAuthenticated'],
    });
    const { response, state } = responseCapture();
    let nextCalls = 0;

    isWebServiceAuthenticated(req, response, () => nextCalls++);

    assert.equal(nextCalls, 0);
    assert.equal(state.status, 401);
    assert.equal(state.contentType, 'application/problem+json');
    assert.equal((state.body as { code: string }).code, 'authorization.invalid-credential');
  });

  it('rejects a Passport error or false result instead of falling through to Guest', function () {
    for (const result of [new Error('lookup failed'), false] as const) {
      installPassport(result);
      const req = request({ headers: { authorization: 'Bearer supplied-token' } });
      const { response, state } = responseCapture();
      let nextCalls = 0;

      isWebServiceAuthenticated(req, response, () => nextCalls++);

      assert.equal(nextCalls, 0);
      assert.equal(state.status, 401);
      assert.equal((state.body as { code: string }).code, 'authorization.invalid-credential');
    }
  });

  it('prefers a valid explicit bearer over a serialized browser session', function () {
    const bearerUser = { id: 'bearer-user', username: 'integration' };
    installPassport(bearerUser);
    const req = request({
      headers: { authorization: 'Bearer supplied-token' },
      user: { id: 'session-user', username: 'browser' },
      isAuthenticated: (() => true) as Sails.Req['isAuthenticated'],
    });
    const { response } = responseCapture();
    let nextCalls = 0;

    isWebServiceAuthenticated(req, response, () => nextCalls++);

    assert.equal(nextCalls, 1);
    assert.equal(req.authorizationAuthMethod, 'bearer');
    assert.deepEqual(req.user, bearerUser);
  });

  it('preserves a validated Passport scope ceiling into context resolution and denies scopes above it', async function () {
    installPassport({ id: 'bearer-user', username: 'integration' }, { scopeKeys: ['portal.home.read'] });
    const req = request({
      headers: { authorization: 'Bearer supplied-token' },
      params: { branding: 'default' },
    });
    const { response } = responseCapture();
    let nextCalls = 0;

    isWebServiceAuthenticated(req, response, () => nextCalls++);
    assert.equal(nextCalls, 1);
    assert.deepEqual(req.authorizationTokenScopeCeiling, ['portal.home.read']);

    const registry = createScopeRegistry([
      {
        sourceType: 'core',
        sourcePackage: '@researchdatabox/redbox-core',
        sourceVersion: 'test',
        definitions: [
          { key: asScopeKey('portal.home.read'), label: 'Home', description: 'Read home.', risk: 'read' },
          { key: asScopeKey('record.read'), label: 'Records', description: 'Read records.', risk: 'read' },
        ],
      },
    ]);
    const service = new AuthorizationServices.AuthorizationService({
      getRegistry: () => registry,
      resolveBrand: async () => ({ id: 'brand-1', name: 'default' }),
      findUser: async () => ({ id: 'bearer-user', username: 'integration', accountLinkState: 'active' }),
      findAssignments: async () => [
        {
          id: 'assignment-1',
          principalId: 'bearer-user',
          role: 'role-1',
          branding: 'brand-1',
          source: 'manual',
          sourceKey: 'manual',
          status: 'active',
          sourcePresent: true,
        },
      ],
      findRoles: async () => [
        {
          id: 'role-1',
          name: 'Reader',
          key: 'Reader',
          branding: 'brand-1',
          contextType: 'brand',
          protectedKind: 'none',
          status: 'active',
        },
      ],
      findTemplateRevisions: async () => [],
      findRoleScopeOverrides: async () => [
        { id: 'override-1', role: 'role-1', scopeKey: 'portal.home.read', effect: 'add' },
        { id: 'override-2', role: 'role-1', scopeKey: 'record.read', effect: 'add' },
      ],
      recordBrandId: () => undefined,
      recordAclAllows: () => false,
    });
    const context = await service.resolveRequestContext(req);

    assert.deepEqual(context.grantedScopeKeys, ['portal.home.read', 'record.read']);
    assert.deepEqual(context.effectiveScopeKeys, ['portal.home.read']);
    assert.equal(service.authorizeAction(context, asScopeKey('record.read')).reasonCode, 'token-scope-ceiling');
  });

  it('rejects malformed Passport scope ceilings before context construction', function () {
    for (const scopeKeys of ['record.read', ['record.read', 42], ['Record.Read']] as const) {
      installPassport({ id: 'bearer-user' }, { scopeKeys });
      const req = request({ headers: { authorization: 'Bearer supplied-token' } });
      const { response, state } = responseCapture();

      isWebServiceAuthenticated(req, response, () => assert.fail('malformed ceiling reached context policy'));

      assert.equal(state.status, 401);
      assert.equal((state.body as { code: string }).code, 'authorization.invalid-credential');
      assert.equal(req.authorizationTokenScopeCeiling, undefined);
    }
  });

  it('accepts the case-insensitive Bearer authentication scheme', function () {
    installPassport({ id: 'bearer-user' });
    const req = request({ headers: { authorization: 'bearer supplied-token' } });
    const { response } = responseCapture();
    let nextCalls = 0;

    isWebServiceAuthenticated(req, response, () => nextCalls++);

    assert.equal(nextCalls, 1);
    assert.equal(req.authorizationAuthMethod, 'bearer');
  });

  it('rejects a bearer credential resolving to a disabled effective user', function () {
    installPassport({ id: 'disabled', loginDisabled: true });
    const req = request({ headers: { authorization: 'Bearer supplied-token' } });
    const { response, state } = responseCapture();

    isWebServiceAuthenticated(req, response, () => assert.fail('disabled bearer reached next'));

    assert.equal(state.status, 401);
    assert.equal((state.body as { code: string }).code, 'authorization.invalid-credential');
  });
});

describe('isAuthenticated policy', function () {
  it('accepts an active bearer principal from the resolved authorization context', function () {
    const req = request({
      authorization: freezeAuthorizationContext({
        contextType: 'brand',
        principal: { category: 'legacy-bearer', authMethod: 'bearer', active: true, userId: 'bearer-user' },
        brand: { id: 'brand-1', name: 'default', exists: true, authorized: true },
      }),
    });
    const { response } = responseCapture();
    let nextCalls = 0;

    isAuthenticated(req, response, () => nextCalls++);

    assert.equal(nextCalls, 1);
  });

  it('returns a typed 401 for an anonymous resolved principal', function () {
    const req = request({
      authorization: freezeAuthorizationContext({
        contextType: 'brand',
        principal: { category: 'anonymous', authMethod: 'anonymous', active: true },
        brand: { id: 'brand-1', name: 'default', exists: true, authorized: true },
      }),
    });
    const { response, state } = responseCapture();

    isAuthenticated(req, response, () => assert.fail('anonymous request reached next'));

    assert.equal(state.status, 401);
    assert.equal((state.body as { code: string }).code, 'authorization.authentication-required');
  });
});
