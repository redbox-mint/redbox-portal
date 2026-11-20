import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { session } from './mutationDifferentialSupport';
import { referenceOrigin, referenceProductionFixture } from './referenceProductionFixture';
import { getBrandingRepository } from '../../../src/persistence/branding/runtime';
import { isImmutableAssetPath } from '../../../src/pages/headers';
import { brandingOperationRoutes } from '../../../src/http/integrationRoutes';
import { getCacheEntryRepository } from '../../../src/persistence/cache/runtime';
import { csp } from '../../../src/config/csp.config';

/** Preserve the production assertions formerly mixed into the legacy font
 * adapter unit suite. Requests now traverse the installed native composition. */
describe('Branding public font delivery and layouts (native production)', function () {
  this.timeout(120000);
  let f: Awaited<ReturnType<typeof referenceProductionFixture>>;
  let faceSha: string;
  const fontBytes = () =>
    readFileSync(path.resolve(__dirname, '../../../../../test/resources/fonts/test-font-regular.woff2'));
  const target = (sha = faceSha, branding = 'default') => `${f.url}/fonts/branding/${branding}/${sha}.woff2`;
  const get = (url: string, init: RequestInit = {}) =>
    fetch(url, {
      ...init,
      redirect: 'manual',
      headers: { Accept: 'application/json', ...init.headers },
    });
  beforeEach(async () => {
    f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: brandingOperationRoutes,
      pages: {},
      rootContext: '',
    });
    await getBrandingRepository(f.owner).reviseBrand(f.brand.id, {
      css: 'body { color: red; }',
      hash: 'publication-hash',
    });
    faceSha = createHash('sha256').update(fontBytes()).digest('hex');
    await f.data.disks
      .get()
      .primaryDisk()
      .put(f.data.reference.typeface.get().storageKey(f.brand.id, faceSha), fontBytes());
  });
  afterEach(async () => {
    sinon.restore();
    await f?.close();
  });
  it('serves public font bytes with immutable same-origin headers', async () => {
    const response = await get(target());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'font/woff2');
    assert.equal(response.headers.get('etag'), `"${faceSha}"`);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('content-length'), String(fontBytes().length));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fontBytes());
  });
  it('answers HEAD with headers and no body, and 304 on matching ETag', async () => {
    const head = await get(target(), { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('etag'), `"${faceSha}"`);
    const cached = await get(target(), { headers: { 'If-None-Match': `"${faceSha}"` } });
    assert.equal(cached.status, 304);
    assert.equal(await cached.text(), '');
  });
  it('returns 404 without substitution for bad hash, unknown brand, absent, and corrupt objects', async () => {
    for (const url of [target('not-a-hash'), target(faceSha, 'nope'), target('a'.repeat(64))]) {
      const response = await get(url, { headers: { 'If-None-Match': `"${faceSha}"` } });
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.notEqual(response.headers.get('content-type'), 'font/woff2');
      assert.equal(response.headers.get('etag'), null);
      assert(!(await response.text()).includes('woff2'));
    }
    await f.data.disks
      .get()
      .primaryDisk()
      .put(f.data.reference.typeface.get().storageKey(f.brand.id, faceSha), Buffer.from('tampered'));
    const corrupt = await get(target(), { headers: { 'If-None-Match': `"${faceSha}"` } });
    assert.equal(corrupt.status, 404);
    assert.equal(corrupt.headers.get('cache-control'), 'no-store');
    assert.notEqual(corrupt.headers.get('content-type'), 'font/woff2');
    assert.equal(corrupt.headers.get('etag'), null);
    await corrupt.text();
  });
  it('evicts least recently used font bytes when the cache exceeds 16 MiB', async () => {
    const hashes: string[] = [];
    for (let i = 0; i < 9; i++) {
      const bytes = Buffer.concat([fontBytes(), Buffer.alloc(2 * 1024 * 1024 - 58 - fontBytes().length)]);
      bytes[bytes.length - 1] = i;
      const hash = createHash('sha256').update(bytes).digest('hex');
      hashes.push(hash);
      await f.data.disks.get().primaryDisk().put(f.data.reference.typeface.get().storageKey(f.brand.id, hash), bytes);
    }
    const reads = sinon.spy(f.data.reference.typeface.get(), 'readFace');
    const serve = async (i: number) => {
      const r = await get(target(hashes[i]));
      assert.equal(r.status, 200);
      await r.arrayBuffer();
    };
    for (let i = 0; i < 8; i++) await serve(i);
    assert.equal(reads.callCount, 8);
    await serve(0);
    assert.equal(reads.callCount, 8);
    await serve(8);
    await serve(0);
    assert.equal(reads.callCount, 9);
    await serve(1);
    assert.equal(reads.callCount, 10);
  });
  it('derives the theme ETag without rewriting publication state', async () => {
    const repository = getBrandingRepository(f.owner),
      before = await repository.getBrand({ name: 'default' });
    const response = await get(f.url + '/default/rdmp/styles/theme.css', {
      headers: { Authorization: 'Bearer pilot-api-token' },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('etag')!, /^W\/".+"$/);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=300, must-revalidate');
    await response.text();
    assert.deepEqual(await repository.getBrand({ name: 'default' }), before);
  });
  it('serves immutable theme CSS when the request pins the current publication hash', async () => {
    for (const [version, expected] of [
      ['publication-hash', 'public, max-age=31536000, immutable'],
      ['outdated-hash', 'public, max-age=300, must-revalidate'],
    ]) {
      const response = await get(f.url + '/default/rdmp/styles/theme.css?v=' + version, {
        headers: { Authorization: 'Bearer pilot-api-token' },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), expected);
      await response.text();
    }
  });
  for (const [title, body, status] of [
    ['creates public preview tokens bound to the current draft revision', { expectedDraftRevision: 0 }, 200],
    ['keeps legacy preview requests bound to the current draft revision', undefined, 200],
    ['rejects preview token creation on a stale draft revision with 409', { expectedDraftRevision: 99 }, 409],
  ] as const)
    it(title, async () => {
      const credentials = await session(f);
      const response = await get(f.url + '/default/rdmp/preview', {
        method: 'POST',
        headers: {
          ...credentials,
          Origin: referenceOrigin,
          Authorization: 'Bearer pilot-api-token',
          'X-Redbox-Api-Version': '2.0',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.equal(response.status, status);
      const result = (await response.json()) as { data: { token: string } };
      const repository = getCacheEntryRepository(f.owner);
      if (status === 200) {
        assert.match(result.data.token, /^[0-9a-f]{32}$/);
        const entry = await repository.findByName('branding-preview:' + result.data.token);
        assert(entry);
        assert.equal((entry.data as { revision: number }).revision, 0);
      } else assert(JSON.stringify(result).includes('branding-conflict'));
    });
  it('recognises public font paths as static assets with same-origin font CSP', () => {
    assert(isImmutableAssetPath(`/fonts/branding/default/${'a'.repeat(64)}.woff2`));
    assert(csp.directives['font-src']!.includes("'self'"));
  });
});
