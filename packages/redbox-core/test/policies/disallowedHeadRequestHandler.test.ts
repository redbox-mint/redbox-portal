import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountAdminOperationRoutes } from '../../src/http/express/adminOperations';
import { mountQueryWriteRoutes } from '../../src/http/express/queryWrites';

describe('route-owned safe method handling', () => {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let reload: sinon.SinonStub, save: sinon.SinonStub, update: sinon.SinonStub, remove: sinon.SinonStub;
  beforeEach(async () => {
    reload = sinon.stub().resolves();
    save = sinon.stub().resolves();
    update = sinon.stub().resolves();
    remove = sinon.stub().resolves();
    f = await httpRouteFixture((router, input) => {
      mountAdminOperationRoutes(router, {
        ...input,
        settings: { createOrUpdateConfig: save },
        reloadTranslations: reload,
        invalidateAssets() {},
        audit: sinon.stub().resolves(),
      } as any);
      mountQueryWriteRoutes(router, {
        ...input,
        queries: { update, delete: remove },
        audit: sinon.stub().resolves(),
      } as any);
    });
  });
  afterEach(async () => {
    await f?.close();
  });
  it('rejects HEAD refresh with 405 and no side effects', async () => {
    const result = await f.request('/default/portal/api/admin/refreshCachedResources', { method: 'HEAD' });
    assert.equal(result.status, 405);
    assert.equal(result.headers.get('Allow'), 'GET');
    assert.equal(result.text, '');
    assert(!reload.called);
    assert(!save.called);
  });
  it('allows an explicit GET refresh', async () => {
    assert.equal((await f.request('/default/portal/api/admin/refreshCachedResources')).status, 200);
    assert(reload.calledOnce);
  });
  it('allows a validated POST configuration write', async () => {
    assert.equal((await f.request('/default/portal/api/admin/config/theme', { method: 'POST', body: {} })).status, 200);
    assert(save.calledOnce);
  });
  it('allows a validated PUT query write', async () => {
    assert.equal((await f.request('/default/portal/api/named-query/query-1', { method: 'PUT', body: {} })).status, 200);
    assert(update.calledOnce);
  });
  it('allows an explicit DELETE query mutation', async () => {
    assert.equal((await f.request('/default/portal/api/named-query/query-1', { method: 'DELETE' })).status, 200);
    assert(remove.calledOnce);
  });
});
