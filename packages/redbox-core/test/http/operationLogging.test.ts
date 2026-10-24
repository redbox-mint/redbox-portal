import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { httpRecordReadsFixture } from '../helpers/httpRecordReadsFixture';
import { mountQueryWriteRoutes } from '../../src/http/express/queryWrites';
import { BrandingDelivery } from '../../src/http/express/brandingDelivery';
import { httpAction } from '../../src/http/express/middleware';

describe('HTTP operation failure log boundaries', () => {
  const failure = new Error('PRIVATE database credentials', { cause: { token: 'PRIVATE provider token' } });

  it('sanitizes failed record reads in the response and logger', async () => {
    const f = await httpRecordReadsFixture();
    f.storage.getMeta.rejects(failure);
    try {
      const response = await f.request('/default/portal/api/records/metadata/record-1');
      assert.equal(response.status, 500);
      assert(!response.text.includes('PRIVATE'));
      sinon.assert.calledOnceWithExactly(f.log.error, 'Record read failed');
    } finally {
      await f.close();
    }
  });

  it('sanitizes failed definition writes in the response and logger', async () => {
    const create = sinon.stub().rejects(failure);
    const f = await httpRouteFixture((router, input) =>
      mountQueryWriteRoutes(router, { ...input, queries: { create } } as any)
    );
    try {
      const response = await f.request('/default/portal/api/named-query', {
        method: 'POST',
        body: { name: 'review' },
      });
      assert.equal(response.status, 500);
      sinon.assert.calledOnce(create);
      assert(!response.text.includes('PRIVATE'));
      sinon.assert.calledOnceWithExactly(f.log.error, 'Definition mutation failed');
    } finally {
      await f.close();
    }
  });

  for (const [method, message, status] of [
    ['renderCss', 'Error serving CSS', 500],
    ['renderFont', 'Error serving font', 404],
  ] as const) {
    it(`sanitizes ${method} repository failures in the response and logger`, async () => {
      const getBrand = sinon.stub().rejects(failure);
      const f = await httpRouteFixture((router, input) => {
        const delivery = new BrandingDelivery({ ...input, repository: () => ({ getBrand }) } as any);
        router.get(
          '/:branding/:sha256',
          httpAction(async (req, res) => {
            await delivery[method](req, res);
          })
        );
      });
      try {
        const response = await f.request('/default/' + 'a'.repeat(64));
        assert.equal(response.status, status);
        sinon.assert.calledOnce(getBrand);
        assert(!response.text.includes('PRIVATE'));
        sinon.assert.calledOnceWithExactly(f.log.error, message);
      } finally {
        await f.close();
      }
    });
  }
});
