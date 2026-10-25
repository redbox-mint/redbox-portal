import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountVocabularyIntegrationRoutes } from '../../src/http/express/vocabularyIntegrations';

describe('Optional RVA vocabulary version', () => {
  for (const prefix of ['api', 'admin']) {
    for (const action of ['import', 'sync']) {
      for (const versionId of ['', undefined, '123']) {
        it(`${prefix} ${action} preserves version ${JSON.stringify(versionId)}`, async () => {
          const rva = {
            importRvaVocabulary: sinon.stub().resolves({ id: 'vocab-1' }),
            syncRvaVocabulary: sinon.stub().resolves({ updated: 1 }),
          };
          const f = await httpRouteFixture((router, input) =>
            mountVocabularyIntegrationRoutes(router, {
              ...input,
              rva,
              vocabulary: { getById: sinon.stub().resolves({ id: 'vocab-1', branding: 'brand-1' }) },
              audit: async () => {},
            })
          );
          try {
            const response = await f.request(
              `/default/portal/${prefix}/vocabulary/${action === 'import' ? 'import' : 'vocab-1/sync'}`,
              {
                method: 'POST',
                body: {
                  ...(action === 'import' ? { rvaId: '1234' } : {}),
                  ...(versionId === undefined ? {} : { versionId }),
                },
              }
            );
            assert.equal(response.status, 200);
            assert.equal(
              rva[action === 'import' ? 'importRvaVocabulary' : 'syncRvaVocabulary'].firstCall.args[1],
              versionId || undefined
            );
          } finally {
            await f.close();
            sinon.restore();
          }
        });
      }
    }
  }
});
