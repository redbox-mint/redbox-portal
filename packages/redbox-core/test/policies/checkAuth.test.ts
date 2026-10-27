import assert from 'node:assert/strict';
import { httpPolicyFixture } from '../helpers/httpPolicyFixture';
import {
  RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_VARY,
} from '../../src/api-routes/record-schema-response';

describe('explicit path authorization', () => {
  it('returns 404 before path checks when branding is not found', async () => {
    const f = httpPolicyFixture();
    f.getBrand.resolves(null);
    await f.run('brandingandportal', 'checkauth');
    assert(f.response.status.calledOnceWithExactly(404));
    assert(!f.getRulesFromPath.called);
  });
  it('calls next when no path rules exist', async () => {
    const f = httpPolicyFixture();
    await f.run('brandingandportal', 'checkauth');
    assert(f.next.calledOnce);
    assert(!f.canRead.called);
  });
  it('calls next when current brand roles can read the path', async () => {
    const f = httpPolicyFixture();
    f.getRulesFromPath.returns([{ role: 'role-1' }]);
    f.authenticate.resolves({ ...f.actor, roles: [...f.actor.roles, { id: 'foreign', brandId: 'other' }] });
    await f.run('brandingandportal', 'checkauth');
    assert(f.next.calledOnce);
    assert.deepEqual(f.canRead.firstCall.args[1], f.actor.roles);
  });
  it('returns 403 and awaits failure capture when the authenticated actor cannot read', async () => {
    const f = httpPolicyFixture();
    f.getRulesFromPath.returns([{}]);
    f.canRead.returns(false);
    const capture = Promise.withResolvers<void>();
    f.emitRequestFailure.returns(capture.promise);
    let done = false;
    const work = f.run('brandingandportal', 'checkauth').then(() => {
      done = true;
    });
    while (!f.emitRequestFailure.called) await Promise.resolve();
    assert(!done);
    assert(!f.response.status.called);
    capture.resolve();
    await work;
    assert(f.response.status.calledOnceWithExactly(403));
    assert(!f.next.called);
    assert.deepEqual(f.emitRequestFailure.firstCall.args, [f.req, 'authorization.failure', 'AuthorizationPolicy']);
  });
  it('returns 403 JSON for anonymous JSON path denial', async () => {
    const f = httpPolicyFixture();
    f.authenticate.resolves(false);
    f.getRulesFromPath.returns([{}]);
    f.canRead.returns(false);
    f.req.headers['content-type'] = 'application/json';
    await f.run('brandingandportal', 'checkauth');
    assert(f.response.status.calledOnceWithExactly(403));
    assert.deepEqual(f.response.json.firstCall.args[0], { message: 'Access Denied' });
    assert(!f.next.called);
  });
  it('redirects an anonymous HTML path denial to login and retains its URL', async () => {
    const f = httpPolicyFixture();
    f.authenticate.resolves(false);
    f.getRulesFromPath.returns([{}]);
    f.canRead.returns(false);
    f.req.headers['content-type'] = 'text/html';
    await f.run('brandingandportal', 'checkauth');
    assert(f.response.redirect.calledOnceWithExactly('/default/portal/user/login'));
    assert.equal(f.req.session.redirUrl, f.req.originalUrl);
    assert(!f.emitRequestFailure.called);
  });
  for (const authenticated of [true, false]) {
    it(`returns schema Problem Details on ${authenticated ? 'authenticated' : 'anonymous'} path denial`, async () => {
      const f = httpPolicyFixture();
      if (!authenticated) f.authenticate.resolves(false);
      const path = '/default/portal/api/records/schemas/create/dataset';
      Reflect.set(f.req, 'path', path);
      f.getRulesFromPath.returns([{}]);
      f.canRead.returns(false);
      await f.run('brandingandportal', 'checkrecordschemaauth');
      assert(f.response.status.calledOnceWithExactly(403));
      assert(!f.response.redirect.called);
      assert(!f.next.called);
      assert.equal(f.headers['cache-control'], RECORD_SCHEMA_RESPONSE_CACHE_CONTROL);
      assert.equal(f.headers.vary, RECORD_SCHEMA_RESPONSE_VARY);
      assert.equal(f.headers['content-type'], RECORD_SCHEMA_PROBLEM_MEDIA_TYPE);
      assert.deepEqual(f.response.json.firstCall.args[0], {
        type: 'https://redboxresearchdata.com/problems/record-schema-forbidden',
        title: 'Record schema request is not authorized',
        status: 403,
        detail: 'The record schema request is not authorized.',
        instance: path,
        code: 'record-schema.forbidden',
      });
    });
  }
  it('uses an explicit guest role for an anonymous actor', async () => {
    const f = httpPolicyFixture();
    f.authenticate.resolves(false);
    f.getRulesFromPath.returns([{}]);
    const guest = { id: 'guest' };
    f.defaultUnauthenticatedRole.returns(guest);
    await f.run('brandingandportal', 'checkauth');
    assert.deepEqual(f.canRead.firstCall.args[1], [guest]);
    assert(f.next.calledOnce);
  });
  it('does not let an old Companion authorization flag bypass current path authorization', async () => {
    const f = httpPolicyFixture();
    f.authenticate.resolves(false);
    f.getRulesFromPath.returns([{}]);
    f.canRead.returns(false);
    f.req.headers['content-type'] = 'application/json';
    Reflect.set(f.req, 'companionAttachmentUploadAuthorized', true);
    await f.run('brandingandportal', 'checkauth');
    assert(f.getBrand.calledOnce);
    assert(f.canRead.calledOnce);
    assert(f.response.status.calledOnceWithExactly(403));
    assert(!f.next.called);
  });
});
