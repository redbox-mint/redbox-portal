import assert from 'node:assert/strict';
import { httpPolicyFixture } from '../helpers/httpPolicyFixture';

describe('authenticated HTTP actor policy', () => {
  it('calls next for an authoritative authenticated actor', async () => {
    const f = httpPolicyFixture();
    await f.run('brandingandportal', 'iswebserviceauthenticated');
    assert(f.next.calledOnce);
    assert(!f.response.status.called);
  });
  it('returns 401 and a Bearer challenge for an anonymous API request', async () => {
    const f = httpPolicyFixture();
    f.authenticate.resolves(false);
    await f.run('brandingandportal', 'iswebserviceauthenticated');
    assert(!f.next.called);
    assert(f.response.status.calledOnceWithExactly(401));
    assert.deepEqual(f.response.json.firstCall.args[0], { message: 'Authentication required', details: '' });
    assert.equal(f.headers['www-authenticate'], 'Bearer');
  });
});
