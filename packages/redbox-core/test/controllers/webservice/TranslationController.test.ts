import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../../helpers/httpRouteFixture';
import { mountConfigurationWriteRoutes } from '../../../src/http/express/configurationWrites';

describe('Translation Express bundle writes', () => {
  it('preserves false query parameters when setting a bundle', async () => {
    const setBundle = sinon.stub().resolves({ id: 'bundle-1' });
    const f = await httpRouteFixture((router, input) =>
      mountConfigurationWriteRoutes(router, { ...input, translations: { setBundle } } as any)
    );
    try {
      const result = await f.request(
        '/default/portal/api/i18n/bundles/en/translation?splitToEntries=false&overwriteEntries=false',
        { method: 'POST', body: { data: { greeting: 'hello' } } }
      );
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { id: 'bundle-1' });
      assert(setBundle.calledOnce);
      assert.deepEqual(setBundle.firstCall.args[5], { splitToEntries: false, overwriteEntries: false });
      assert.equal(setBundle.firstCall.args[0].id, f.brand.id);
    } finally {
      await f.close();
    }
  });
});
