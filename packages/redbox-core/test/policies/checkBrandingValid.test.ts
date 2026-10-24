import assert from 'node:assert/strict';
import { httpPolicyFixture } from '../helpers/httpPolicyFixture';
import { requestContext } from '../../src/http/express/policies';

describe('authoritative brand and portal validation', () => {
  it('allows a persisted brand', async () => {
    const f = httpPolicyFixture();
    await f.run('brandingandportal');
    assert(f.next.calledOnce);
    assert(!f.response.status.called);
  });
  it('allows a custom persisted brand', async () => {
    const f = httpPolicyFixture();
    f.req.params.branding = 'custom';
    f.getBrand.resolves({ id: 'custom-id', name: 'custom' });
    await f.run('brandingandportal');
    assert.equal(requestContext(f.req).brand.id, 'custom-id');
  });
  it('returns 404 for an unknown brand without default-brand disclosure', async () => {
    const f = httpPolicyFixture();
    f.getBrand.resolves(null);
    await f.run('brandingandportal');
    assert(f.response.status.calledOnceWithExactly(404));
    assert(!f.next.called);
    assert.throws(() => requestContext(f.req));
    assert.deepEqual(f.req.session, {});
  });
  it('validates route params independently of transport-looking URL prefixes', async () => {
    const f = httpPolicyFixture();
    Reflect.set(f.req, 'path', '/socket/io/default/portal/page');
    await f.run('brandingandportal');
    assert(f.next.calledOnce);
    assert.equal(requestContext(f.req).brand.id, f.brand.id);
    f.req.params.branding = 'bad/name';
    await f.run('brandingandportal');
    assert(f.response.status.calledOnceWithExactly(404));
  });
  it('rejects absent brand params without a repository read', async () => {
    const f = httpPolicyFixture();
    delete f.req.params.branding;
    await f.run('brandingandportal');
    assert(f.response.status.calledOnceWithExactly(404));
    assert(!f.getBrand.called);
  });
  it('allows a brand/portal root but rejects an unsupported portal', async () => {
    const f = httpPolicyFixture();
    Reflect.set(f.req, 'path', '/default/portal');
    await f.run('brandingandportal');
    assert(f.next.calledOnce);
    f.req.params.portal = 'unsupported';
    await f.run('brandingandportal');
    assert(f.response.status.calledOnceWithExactly(404));
    assert(!f.next.called);
  });
});
