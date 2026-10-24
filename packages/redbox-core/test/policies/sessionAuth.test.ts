import assert from 'node:assert/strict';
import { httpPolicyFixture } from '../helpers/httpPolicyFixture';

describe('browser authenticated actor policy', () => {
  it('continues with an authenticated session actor', async () => {
    const f = httpPolicyFixture();
    await f.run('brandingandportal', 'browseractor', 'browserauthenticated');
    assert(f.next.calledOnce);
    assert(!f.response.redirect.called);
  });
  it('redirects an anonymous browser and retains its original target', async () => {
    const f = httpPolicyFixture();
    f.authenticate.resolves(false);
    await f.run('brandingandportal', 'browseractor', 'browserauthenticated');
    assert(!f.next.called);
    assert(f.response.redirect.calledOnceWithExactly('/default/portal/user/login'));
    assert.equal(f.req.session.redirUrl, f.req.originalUrl);
  });
  it('ignores legacy session.authenticated and session.user assertions', async () => {
    const f = httpPolicyFixture();
    f.authenticate.resolves(false);
    Object.assign(f.req.session, { authenticated: true, user: f.actor });
    await f.run('brandingandportal', 'browseractor', 'browserauthenticated');
    assert(!f.next.called);
    assert(f.response.redirect.calledOnce);
  });
});
