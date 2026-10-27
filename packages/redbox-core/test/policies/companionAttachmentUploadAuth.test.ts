import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountCompanionRoutes, type CompanionUploads } from '../../src/http/express/companion';
import { mountResumableUploadRoutes } from '../../src/http/express/resumableUploads';

// Shared-secret/network hints cannot replace actor, brand or record authorization in v6.
// Only provider delivery is stubbed; the actual HTTP mount and policies execute.
describe('Companion attachment admission through owned HTTP routes', () => {
  let fixture: Awaited<ReturnType<typeof httpRouteFixture>>;
  let remoteAddress: string;
  let bypass: unknown;
  const deliver = sinon.stub();
  beforeEach(async () => {
    remoteAddress = '127.0.0.1';
    bypass = undefined;
    deliver.reset();
    deliver.callsFake((req, res) => {
      bypass = Reflect.get(req, 'companionAttachmentUploadAuthorized');
      res.json({ delivered: true });
    });
    fixture = await httpRouteFixture((router, input) => {
      router.use((req, _res, next) => {
        Object.defineProperty(req.socket, 'remoteAddress', { configurable: true, get: () => remoteAddress });
        next();
      });
      mountCompanionRoutes(router, {
        ...input,
        path: '/companion',
        context: () => ({ branding: 'default', portal: 'portal' }),
        uploads: { handle: deliver } as unknown as CompanionUploads,
        audit: async () => {},
      });
      mountResumableUploadRoutes(router, { ...input, uploads: { handle: deliver } });
      router.delete('/ordinary', (_req, res) => res.json({ ordinary: true }));
    });
    fixture.authenticate.resolves(false);
  });
  afterEach(async () => {
    await fixture.close();
  });
  const path = '/default/portal/companion/record/record-1/attach';
  async function denied(headers: Record<string, string> = {}, method = 'POST', suffix = '') {
    const result = await fixture.request(path + suffix, { method, headers });
    assert.equal(result.status, 401);
    assert.equal(result.headers.get('www-authenticate'), 'Bearer');
    assert.equal(deliver.called, false);
    assert.equal(bypass, undefined);
  }
  function authenticated() {
    fixture.authenticate.resolves(fixture.actor);
  }
  it('allows authenticated ordinary upload requests through current authorization', async () => {
    authenticated();
    const result = await fixture.request(path, { method: 'POST' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { delivered: true });
    assert.equal(deliver.calledOnce, true);
    assert.equal(bypass, undefined);
  });
  it('rejects anonymous creates without a shared secret', async () => {
    await denied();
  });
  it('rejects anonymous creates with an invalid secret', async () => {
    await denied({ 'x-companion-secret': 'wrong' });
  });
  it('rejects anonymous public-origin creates with a valid secret', async () => {
    remoteAddress = '203.0.113.5';
    await denied({ 'x-companion-secret': 'companion-secret-value' });
  });
  it('requires actor authentication even for local IPv6 and a valid secret', async () => {
    remoteAddress = '::1';
    await denied({ 'x-companion-secret': 'companion-secret-value' });
    authenticated();
    assert.equal(
      (await fixture.request(path, { method: 'POST', headers: { 'x-companion-secret': 'companion-secret-value' } }))
        .status,
      200
    );
    assert.equal(bypass, undefined);
  });
  it('requires actor authentication through private proxy chains', async () => {
    remoteAddress = '172.18.0.5';
    await denied({
      'x-companion-secret': 'companion-secret-value',
      'x-forwarded-for': '10.0.2.15, 172.18.0.5',
      'x-real-ip': '10.0.2.15',
    });
  });
  it('requires actor authentication for IPv4-mapped IPv6 peers', async () => {
    remoteAddress = '::ffff:192.168.107.1';
    await denied({ 'x-companion-secret': 'companion-secret-value' });
  });
  it('rejects anonymous requests through a proxy chain containing public addresses', async () => {
    remoteAddress = '172.18.0.5';
    await denied({ 'x-companion-secret': 'companion-secret-value', 'x-forwarded-for': '203.0.113.10' });
  });
  it('requires actor authentication regardless of RFC 7239 Forwarded headers', async () => {
    await denied({ 'x-companion-secret': 'companion-secret-value', forwarded: 'for="[::1]";proto=https;by=127.0.0.1' });
  });
  for (const method of ['PATCH', 'HEAD']) {
    it(`requires authenticated brand membership for ${method} resume requests`, async () => {
      await denied({ 'x-companion-secret': 'companion-secret-value' }, method, '/upload-id');
      fixture.authenticate.resolves({ ...fixture.actor, roles: [] });
      assert.equal((await fixture.request(path + '/upload-id', { method })).status, 403);
      assert.equal(deliver.called, false);
      authenticated();
      assert.equal((await fixture.request(path + '/upload-id', { method })).status, 200);
      assert.equal(deliver.calledOnce, true);
      assert.equal(bypass, undefined);
    });
  }
  it('leaves unrelated DELETE routes unaffected by provider headers', async () => {
    assert.deepEqual(
      (
        await fixture.request('/ordinary', {
          method: 'DELETE',
          headers: { 'x-companion-secret': 'companion-secret-value' },
        })
      ).body,
      { ordinary: true }
    );
    assert.equal(deliver.called, false);
    await fixture
      .request('/companion/drive/list/root', { headers: { 'x-companion-secret': 'companion-secret-value' } })
      .then(result => assert.equal(result.status, 401));
  });
});
