import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import type { Request } from 'express';
import { createHttpAuthentication } from '../../src/http/express/authentication';
import type { HttpIdentity } from '../../src/http/express/identity';
import { httpPolicyFixture } from '../helpers/httpPolicyFixture';
import { requestContext } from '../../src/http/express/policies';

function authenticationFixture() {
  const f = httpPolicyFixture();
  const bearer = sinon.stub().resolves(false);
  const identity = { bearer, local: sinon.stub(), session: sinon.stub() } as unknown as HttpIdentity;
  const authentication = createHttpAuthentication(identity);
  const req = f.req as Request;
  req.isAuthenticated = (() => false) as Request['isAuthenticated'];
  return { ...f, bearer, authentication };
}
describe('application-owned web-service authentication', () => {
  it('reuses a validated actor when no explicit credential overrides it', async () => {
    const f = authenticationFixture();
    f.req.user = f.actor;
    f.req.isAuthenticated = (() => true) as Request['isAuthenticated'];
    assert.equal(await f.authentication.authenticate(f.req), f.actor);
    assert(!f.bearer.called);
  });
  it('attempts the installed bearer strategy for an anonymous request', async () => {
    const f = authenticationFixture();
    f.req.headers.authorization = 'Bearer fixture-token';
    assert.equal(await f.authentication.authenticate(f.req), false);
    assert(f.bearer.calledOnceWithExactly('fixture-token'));
  });
  it('places a successful bearer actor in explicit request context', async () => {
    const f = authenticationFixture();
    f.bearer.resolves(f.actor);
    f.req.headers.authorization = 'Bearer fixture-token';
    f.authenticate.callsFake(f.authentication.authenticate);
    await f.run('brandingandportal', 'iswebserviceauthenticated');
    assert.equal(requestContext(f.req).actor, f.actor);
    assert(f.next.calledOnce);
  });
  it('does not authenticate a false bearer result or fall back to a session', async () => {
    const f = authenticationFixture();
    f.req.headers.authorization = 'Bearer invalid';
    f.req.user = f.actor;
    f.req.isAuthenticated = (() => true) as Request['isAuthenticated'];
    assert.equal(await f.authentication.authenticate(f.req), false);
    assert(f.bearer.calledOnceWithExactly('invalid'));
  });
  it('propagates bearer provider errors instead of continuing as authenticated', async () => {
    const f = authenticationFixture();
    const error = new Error('Auth error');
    f.bearer.rejects(error);
    f.req.headers.authorization = 'Bearer failure';
    await assert.rejects(f.authentication.authenticate(f.req), value => value === error);
    assert(!f.next.called);
  });
});
