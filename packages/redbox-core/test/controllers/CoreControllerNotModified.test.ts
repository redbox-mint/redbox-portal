import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountRecordSchemaReadRoutes } from '../../src/http/express/recordSchemaReads';

describe('Record schema bodyless not-modified responses', function () {
  it('ends a 304 without serializing an API body for either API version', async function () {
    const etag = `"sha256:${'a'.repeat(64)}"`;
    const resolveCreate = sinon.stub().resolves({
      kind: 'resolved',
      digest: 'a'.repeat(64),
      metadata: { etag },
      document: { secret: 'must-not-be-sent' },
    });
    const fixture = await httpRouteFixture((router, input) =>
      mountRecordSchemaReadRoutes(router, {
        ...input,
        schemas: { resolveCreate, resolveUpdate: sinon.stub(), resolveImmutable: sinon.stub() },
      })
    );
    try {
      for (const version of ['1.0', '2.0']) {
        const response = await fixture.request('/default/portal/api/records/schemas/create/dataset', {
          headers: { 'X-ReDBox-Api-Version': version, 'If-None-Match': etag },
        });
        assert.equal(response.status, 304);
        assert.equal(response.text, '');
        assert.equal(response.headers.get('ETag'), etag);
        assert.equal(response.headers.get('Cache-Control'), 'private, no-cache');
        assert.match(response.headers.get('Vary')!, /Authorization/);
      }
      assert.equal(resolveCreate.callCount, 2);
    } finally {
      await fixture.close();
    }
  });
});
