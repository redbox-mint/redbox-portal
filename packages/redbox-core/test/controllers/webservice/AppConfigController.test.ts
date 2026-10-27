import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../../helpers/httpRouteFixture';
import { mountConfigurationReadRoutes } from '../../../src/http/express/configuration';
import { mountConfigurationWriteRoutes } from '../../../src/http/express/configurationWrites';

describe('AppConfig Express override lifecycle', () => {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let service: Record<string, sinon.SinonStub>;
  beforeEach(async () => {
    service = {
      getAppConfigByBrandAndKey: sinon.stub().resolves({ enabled: false }),
      hasConfigOverride: sinon.stub(),
      resetConfigOverride: sinon.stub().resolves({ enabled: false }),
    };
    f = await httpRouteFixture((router, input) => {
      mountConfigurationReadRoutes(router, { ...input, appConfigs: service } as any);
      mountConfigurationWriteRoutes(router, { ...input, appConfigs: service } as any);
    });
  });
  afterEach(async () => {
    await f?.close();
  });
  for (const overridden of [false, true])
    it(`reports the ${overridden ? 'persisted override' : 'default'} source without changing the body`, async () => {
      service.hasConfigOverride.resolves(overridden);
      const result = await f.request('/default/portal/api/appconfig/systemMessage');
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { enabled: false });
      assert.equal(result.headers.get('X-ReDBox-Config-Source'), overridden ? 'override' : 'default');
      assert(service.getAppConfigByBrandAndKey.calledOnceWithExactly(f.brand.id, 'systemMessage'));
    });
  it('resets only the validated key in the current brand', async () => {
    const result = await f.request('/default/portal/api/appconfig/systemMessage', { method: 'DELETE' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { enabled: false });
    assert.equal(result.headers.get('X-ReDBox-Config-Source'), 'default');
    assert.equal(service.resetConfigOverride.firstCall.args[0].id, f.brand.id);
    assert.equal(service.resetConfigOverride.firstCall.args[1], 'systemMessage');
  });
  it('does not acknowledge a failed reset or expose the storage error', async () => {
    service.resetConfigOverride.rejects(new Error('PRIVATE-Storage unavailable'));
    const result = await f.request('/default/portal/api/appconfig/systemMessage', { method: 'DELETE' });
    assert.equal(result.status, 500);
    assert(!result.text.includes('PRIVATE'));
    assert.equal(result.headers.get('X-ReDBox-Config-Source'), null);
  });
});
