import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { httpPagesFixture } from '../helpers/httpPagesFixture';
import { mountRecordSchemaReadRoutes } from '../../src/http/express/recordSchemaReads';
import { sendApiData, sendApiErrors } from '../../src/http/express/responses';
import { httpRecordReadsFixture } from '../helpers/httpRecordReadsFixture';

/** Response behavior belongs to the public response/page/schema owners. */
describe('Owned HTTP response contracts', function () {
  afterEach(() => sinon.restore());
  for (const [description, title, site, expected] of [
    ['formats Page | Site when page title is present', 'Page', 'Site', 'Page | Site'],
    ['falls back to site when page title is empty', '   ', 'Site', 'Site'],
    ['avoids Site | Site when page title matches site', 'Site', 'Site', 'Site'],
    ['uses selected brand translation for the site title', 'Page', 'Branded Site', 'Page | Branded Site'],
    ['uses selected brand translation for the page title key', 'Branded Dashboard', 'Site', 'Branded Dashboard | Site'],
  ]) {
    it(description, async function () {
      const f = await httpPagesFixture(pages => {
        pages.translate = (brand, _language, key) => {
          assert.equal(brand, 'default');
          return key === 'default-title' ? site : key === 'List of available services' ? title : key;
        };
      });
      try {
        const response = await f.request('/default/portal/availableServicesList');
        assert.equal(response.status, 200);
        assert.equal(response.text.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim(), expected);
      } finally {
        await f.close();
      }
    });
  }
  async function envelope(version: string, send: Parameters<typeof httpRouteFixture>[0]) {
    const f = await httpRouteFixture(send);
    try {
      return await f.request('/response', { headers: { 'X-ReDBox-Api-Version': version } });
    } finally {
      await f.close();
    }
  }
  it('sends v1 success data without an envelope', async function () {
    const r = await envelope('1.0', router => router.get('/response', (req, res) => sendApiData(req, res, { a: 1 })));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { a: 1 });
  });
  it('retains a route-selected v1 payload', async function () {
    const r = await envelope('1.0', router =>
      router.get('/response', (req, res) => sendApiData(req, res, { special: true }))
    );
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { special: true });
  });
  it('sends v1 public errors', async function () {
    const r = await envelope('1.0', router =>
      router.get('/response', (req, res) => sendApiErrors(req, res, 400, [{ title: 'T', detail: 'D' }]))
    );
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { message: 'T', details: 'D' });
  });
  it('sends v2 success data and owned record metadata', async function () {
    const f = await httpRecordReadsFixture();
    f.storage.getMeta.resolves({
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'brand-1' },
      metadata: { b: 2 },
      authorization: { view: ['alice'] },
    });
    try {
      const r = await f.request('/default/portal/record/metadata/oid-1', {
        headers: { 'X-ReDBox-Api-Version': '2.0' },
      });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.data, { b: 2 });
      assert.equal(r.body.meta.oid, 'oid-1');
    } finally {
      await f.close();
    }
  });
  it('sends v2 public error arrays', async function () {
    const r = await envelope('2.0', router =>
      router.get('/response', (req, res) => sendApiErrors(req, res, 500, [{ code: 'ERR' }]))
    );
    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { errors: [{ code: 'ERR' }], meta: {} });
  });
  it('uses an owned failure status rather than an untrusted display-error status', async function () {
    const r = await envelope('2.0', router =>
      router.get('/response', (req, res) => sendApiErrors(req, res, 500, [{ code: 'ERR', ...{ status: '200' } }]))
    );
    assert.equal(r.status, 500);
    assert.ok(r.body.errors);
  });
  it('sanitizes unexpected errors even when they claim status 200', async function () {
    const r = await envelope('2.0', router =>
      router.get('/response', () => {
        throw Object.assign(new Error('private exception'), { status: 200 });
      })
    );
    assert.equal(r.status, 500);
    assert.ok(!r.text.includes('private exception'));
  });
  async function schema(resolveCreate: sinon.SinonStub, version = '2.0', headers = {}) {
    const f = await httpRouteFixture((router, input) =>
      mountRecordSchemaReadRoutes(router, {
        ...input,
        schemas: { resolveCreate, resolveUpdate: sinon.stub(), resolveImmutable: sinon.stub() },
      })
    );
    try {
      return await f.request('/default/portal/api/records/schemas/create/dataset', {
        headers: { 'X-ReDBox-Api-Version': version, ...headers },
      });
    } finally {
      await f.close();
    }
  }
  const document = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { title: { type: 'string' } },
  };
  const resolved = (data: unknown) =>
    sinon
      .stub()
      .resolves({ kind: 'resolved', document: data, digest: 'a'.repeat(64), metadata: { etag: '"sha256:digest"' } });
  it('sends schema JSON raw with exact headers for both API versions', async function () {
    for (const version of ['1.0', '2.0']) {
      const r = await schema(resolved(document), version);
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, document);
      assert.match(r.headers.get('Content-Type')!, /^application\/schema\+json/);
      assert.equal(r.headers.get('ETag'), '"sha256:digest"');
      assert.match(r.headers.get('Vary')!, /Authorization/);
      assert.equal(r.body.data, undefined);
      assert.equal(r.body.meta, undefined);
    }
  });
  it('sends the same raw Problem Details body without an API envelope for both versions', async function () {
    const results = [];
    for (const version of ['1.0', '2.0']) {
      const r = await schema(sinon.stub().resolves({ kind: 'context-failed', failureKind: 'not-found' }), version);
      assert.equal(r.status, 404);
      assert.match(r.headers.get('Content-Type')!, /^application\/problem\+json/);
      assert.equal(r.body.code, 'record-schema.not-found');
      assert.equal(r.body.data, undefined);
      assert.equal(r.body.errors, undefined);
      assert.equal(r.body.meta, undefined);
      results.push(r.body);
    }
    assert.deepEqual(results[0], results[1]);
  });
  it('maps resolver errors to a safe raw unavailable response', async function () {
    const r = await schema(sinon.stub().rejects(new Error('internal-only')));
    assert.equal(r.status, 503);
    assert.equal(r.body.status, 503);
    assert.equal(r.body.code, 'record-schema.unavailable');
    assert.ok(!r.text.includes('internal-only'));
  });
  it('preserves an explicit safe unavailable result without serializing the private error', async function () {
    const r = await schema(sinon.stub().resolves({ kind: 'unavailable', error: new Error('private exception text') }));
    assert.equal(r.status, 503);
    assert.match(r.headers.get('Content-Type')!, /^application\/problem\+json/);
    assert.ok(!r.text.includes('private exception text'));
  });
  it('keeps raw media type owned by the schema route despite client negotiation', async function () {
    const r = await schema(resolved(document), '2.0', { Accept: 'text/html', 'Content-Type': 'text/html' });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('Content-Type')!, /^application\/schema\+json/);
    assert.deepEqual(r.body, document);
  });
  it('rejects raw strings and stream-like objects at runtime', async function () {
    for (const value of ['not-json-object', new Date('2026-01-01T00:00:00Z'), Readable.from(['not-a-json-document'])]) {
      const r = await schema(resolved(value), '1.0');
      assert.equal(r.status, 503);
      assert.equal(r.body.code, 'record-schema.unavailable');
      assert.match(r.headers.get('Content-Type')!, /^application\/problem\+json/);
    }
  });
  it('rejects nested values JSON serialization would silently rewrite', async function () {
    const getter = sinon.spy(() => 'hidden execution');
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: getter });
    for (const value of [{ values: new Array(1) }, { nested: accessor }, { value: Number.NaN }]) {
      const r = await schema(resolved(value), '1.0');
      assert.equal(r.status, 503);
      assert.equal(r.body.code, 'record-schema.unavailable');
    }
    sinon.assert.notCalled(getter);
  });
});
