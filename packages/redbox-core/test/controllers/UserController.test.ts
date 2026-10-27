import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { httpPagesFixture } from '../helpers/httpPagesFixture';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountAuthenticationRoutes } from '../../src/http/express/login';
import { HttpIdentity } from '../../src/http/express/identity';
import { safeIdentityRow } from '../../src/persistence/identity/safety';
import { mountFormVocabularyRoutes } from '../../src/http/express/formVocabulary';
import { installOidcAuthentication } from '../../src/http/express/identityProviders';

describe('Owned user HTTP routes', function () {
  afterEach(() => sinon.restore());
  it('sends the login view', async function () {
    const f = await httpPagesFixture();
    try {
      const response = await f.request('/default/portal/user/login');
      assert.equal(response.status, 200);
      assert.match(response.text, /local-auth/);
    } finally {
      await f.close();
    }
  });
  it('returns user info without token', async function () {
    const row = {
      id: '123',
      name: 'Test User',
      username: 'tester',
      token: 'secret',
      roles: [{ id: 'role-1', name: 'Researcher', branding: 'brand-1' }],
    };
    const one = sinon.stub().callsFake(async () => safeIdentityRow(row, 'user'));
    const identity = new HttpIdentity({ one, verifyPassword: sinon.stub(), findByApiTokenHash: sinon.stub() });
    const f = await httpRouteFixture(router => {
      router.use((req, _res, next) => {
        req.user = { id: '123' };
        req.session = {} as typeof req.session;
        next();
      });
      mountAuthenticationRoutes(router, {
        identity,
        passport: { authenticate: sinon.stub() },
        defaultBrand: 'default',
        defaultPortal: 'portal',
        validContext: () => true,
        brandId: () => 'brand-1',
        postLoginPath: () => '/default/portal/home',
        audit: sinon.stub().resolves(),
        loginFailure: sinon.stub().resolves(),
        csrf: (_req, _res, next) => next(),
      });
    });
    try {
      const response = await f.request('/default/portal/user/info');
      assert.equal(response.status, 200);
      assert.equal(response.body.user.id, '123');
      assert.equal(response.body.user.name, 'Test User');
      assert.equal(response.body.user.token, undefined);
      assert.ok(!response.text.includes('secret'));
      sinon.assert.calledWith(one, 'user', { id: '123' });
    } finally {
      await f.close();
    }
  });
  it('searches for users and returns mapped results', async function () {
    const findUsersWithName = sinon
      .stub()
      .returns(of([{ id: '1', name: 'User 1', username: 'user1', email: 'u1@test.com' }]));
    const f = await httpRouteFixture((router, input) =>
      mountFormVocabularyRoutes(router, {
        ...input,
        vocabulary: {} as any,
        lookups: {} as any,
        users: { findUsersWithName },
      })
    );
    try {
      const response = await f.request('/default/portal/user/find?name=test&source=local');
      assert.equal(response.status, 200);
      sinon.assert.calledWithExactly(findUsersWithName, 'test', 'brand-1', 'local');
      assert.deepEqual(response.body, [{ id: '1', name: 'User 1', username: 'user1' }]);
    } finally {
      await f.close();
    }
  });
  it('keeps OIDC configuration secrets and tokens out of discovery diagnostics', async function () {
    const use = sinon.stub();
    const opts = {
      issuer: 'invalid issuer',
      client: { client_id: 'safe-client-id', client_secret: 'do-not-log-this' },
      access_token: 'do-not-log-this-token',
    };
    await assert.rejects(
      installOidcAuthentication({
        passport: { use },
        accounts: {} as any,
        config: { active: ['oidc'], oidc: { opts, discoverAttemptsMax: 1 } } as any,
        brand: sinon.stub(),
      }),
      error => {
        assert.equal(String(error), 'Error: OIDC discovery failed');
        assert.ok(!String(error).includes('do-not-log-this'));
        assert.ok(!String(error).includes('do-not-log-this-token'));
        return true;
      }
    );
    sinon.assert.notCalled(use);
  });
});
