import assert from 'node:assert/strict';
import sinon from 'sinon';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountVocabularyAdministrationRoutes } from '../../src/http/express/vocabularyAdministration';

describe('vocabulary entry validation before writes', () => {
  for (const prefix of ['admin', 'api']) {
    for (const bad of [
      { historical: 'invalid' },
      { order: -1 },
      { children: {} },
      { children: [{ historical: 'invalid' }] },
    ]) {
      it(`rejects ${prefix} invalid entries ${JSON.stringify(bad)} before update`, async () => {
        const update = sinon.stub().resolves({});
        const f = await httpRouteFixture((router, input) =>
          mountVocabularyAdministrationRoutes(router, {
            ...input,
            audit: async () => {},
            vocabulary: { getById: sinon.stub().resolves({ id: 'vocab', branding: 'brand-1' }), update } as any,
          })
        );
        try {
          const response = await f.request(`/default/portal/${prefix}/vocabulary/vocab`, {
            method: 'PUT',
            body: { entries: [{ label: 'valid' }, bad] },
          });
          assert.equal(response.status, 400);
          assert.equal(update.callCount, 0);
        } finally {
          await f.close();
          sinon.restore();
        }
      });
    }
  }
  it('retains valid nested entries and normalizes the supported legacy scalar fields', async () => {
    const update = sinon.stub().resolves({ id: 'vocab' });
    const f = await httpRouteFixture((router, input) =>
      mountVocabularyAdministrationRoutes(router, {
        ...input,
        audit: async () => {},
        vocabulary: { getById: sinon.stub().resolves({ id: 'vocab', branding: 'brand-1' }), update } as any,
      })
    );
    try {
      const response = await f.request('/default/portal/admin/vocabulary/vocab', {
        method: 'PUT',
        body: { entries: [{ label: ' Parent ', order: '2', children: [{ value: 12, historical: false }] }] },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(update.firstCall.args[1].entries, [
        { label: 'Parent', order: 2, children: [{ value: '12', historical: false }] },
      ]);
    } finally {
      await f.close();
      sinon.restore();
    }
  });
});
