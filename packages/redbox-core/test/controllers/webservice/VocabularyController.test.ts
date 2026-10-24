import assert from 'node:assert/strict';
import { httpVocabularyFixture } from '../../helpers/httpVocabularyFixture';

describe('API vocabulary operations through owned HTTP', () => {
  let f: Awaited<ReturnType<typeof httpVocabularyFixture>>;
  beforeEach(async () => {
    f = await httpVocabularyFixture();
  });
  afterEach(async () => {
    await f.close();
  });
  it('lists vocabularies with pagination metadata', async () => {
    const response = await f.request('/default/portal/api/vocabulary');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.records, []);
    assert.equal(response.body.summary.numFound, 0);
    assert.equal(response.body.summary.start, 0);
    assert.equal(response.body.summary.page, 1);
  });
  it('returns vocabulary details and its tree after verifying the stored brand', async () => {
    const response = await f.request('/default/portal/api/vocabulary/v1');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { vocabulary: { id: 'v1', branding: f.brand.id }, entries: [] });
    assert.equal(f.vocabulary.getTree.calledOnceWithExactly('v1'), true);
  });
  it('returns a sanitized actionable 400 if RVA import fails', async () => {
    f.rva.importRvaVocabulary.rejects(
      new Error('RVA version 199 has no current concept tree artefact. PRIVATE provider credential')
    );
    const response = await f.request('/default/portal/api/vocabulary/import', {
      method: 'POST',
      body: { rvaId: '141' },
    });
    assert.equal(response.status, 400);
    assert.match(response.body.message, /import or sync failed.*reviewing the vocabulary/);
    assert(!response.text.includes('PRIVATE'));
    assert.equal(f.rva.importRvaVocabulary.calledOnce, true);
  });
});
