import assert from 'node:assert/strict';
import { httpPolicyFixture } from '../helpers/httpPolicyFixture';
import { applyPageHeaders } from '../../src/http/express/pageHeaders';

describe('explicit no-cache and page-header ownership', () => {
  it('sets complete no-store headers on a protected HTTP response', async () => {
    const f = httpPolicyFixture();
    await f.run('nocache');
    assert.match(f.headers['cache-control'], /no-store/);
    assert.match(f.headers['cache-control'], /no-cache/);
    assert.equal(f.headers.pragma, 'no-cache');
    assert.equal(f.headers.expires, '0');
    assert.equal(f.headers['surrogate-control'], 'no-store');
    assert(f.next.calledOnce);
  });
  it('retains private session-age caching for an unprotected page', () => {
    const f = httpPolicyFixture();
    applyPageHeaders(f.req, f.res, { sessionMaxAgeMs: 60000 });
    assert.equal(f.headers['cache-control'], 'max-age=60, private');
  });
  it('sets no-store for an explicitly configured page suffix', () => {
    const f = httpPolicyFixture();
    applyPageHeaders(f.req, f.res, { noCache: ['/page'] });
    assert.equal(f.headers['cache-control'], 'no-cache, no-store');
  });
  it('retains private caching for an unmatched page suffix', () => {
    const f = httpPolicyFixture();
    applyPageHeaders(f.req, f.res, { noCache: ['/other'] });
    assert.equal(f.headers['cache-control'], 'max-age=31536000, private');
  });
  it('does not depend on a framework view-local flag', async () => {
    const f = httpPolicyFixture();
    Object.assign(f.req, { options: { locals: { view: null } } });
    await f.run('nocache');
    assert.match(f.headers['cache-control'], /no-store/);
  });
  it('always calls next without requiring globals or page locals', async () => {
    const f = httpPolicyFixture();
    await f.run('nocache');
    assert(f.next.calledOnceWithExactly());
  });
});
