import assert from 'node:assert/strict';
import { httpPolicyFixture } from '../helpers/httpPolicyFixture';
import { requestContext } from '../../src/http/express/policies';

describe('brandingAndPortal explicit request context', () => {
  it('resolves branding from the route to an authoritative brand snapshot', async () => {
    const f = httpPolicyFixture();
    await f.run('brandingandportal');
    assert.equal(requestContext(f.req).brand, f.brand);
    assert.deepEqual(f.getBrand.firstCall.args, [{ name: 'default' }, true]);
  });
  it('resolves a configured portal', async () => {
    const f = httpPolicyFixture();
    f.req.params.portal = 'other';
    await f.run('brandingandportal');
    assert.equal(requestContext(f.req).portal, 'other');
  });
  it('resolves both brand and portal together', async () => {
    const f = httpPolicyFixture();
    f.req.params.branding = 'custom';
    f.req.params.portal = 'other';
    const custom = { id: 'custom-id', name: 'custom' };
    f.getBrand.resolves(custom);
    await f.run('brandingandportal');
    assert.deepEqual(requestContext(f.req), { brand: custom, portal: 'other' });
    assert(Object.isFrozen(requestContext(f.req)));
  });
  it('does not trust a preexisting branding session snapshot', async () => {
    const f = httpPolicyFixture();
    Object.assign(f.req.session, { branding: 'foreign' });
    await f.run('brandingandportal');
    assert.equal(requestContext(f.req).brand.id, f.brand.id);
    assert.equal(f.req.session.branding, 'foreign');
  });
  it('does not trust a preexisting portal session snapshot', async () => {
    const f = httpPolicyFixture();
    Object.assign(f.req.session, { portal: 'foreign' });
    await f.run('brandingandportal');
    assert.equal(requestContext(f.req).portal, 'portal');
    assert.equal(f.req.session.portal, 'foreign');
  });
  it('requires no framework options/locals object', async () => {
    const f = httpPolicyFixture();
    await f.run('brandingandportal');
    assert(f.next.calledOnce);
    assert.equal(Reflect.get(f.req, 'options'), undefined);
  });
  it('resolves context without creating a session', async () => {
    const f = httpPolicyFixture();
    Reflect.deleteProperty(f.req, 'session');
    await f.run('brandingandportal');
    assert(f.next.calledOnce);
    assert.equal(Reflect.get(f.req, 'session'), undefined);
  });
  it('rejects missing route brand and portal rather than inventing defaults', async () => {
    const f = httpPolicyFixture();
    f.req.params = {};
    await f.run('brandingandportal');
    assert(f.response.status.calledOnceWithExactly(404));
    assert(!f.next.called);
    assert(!f.getBrand.called);
  });
});
