import assert from 'node:assert/strict';
import { httpVocabularyFixture } from '../helpers/httpVocabularyFixture';
import { httpPagesFixture } from '../helpers/httpPagesFixture';

describe('Browser vocabulary operations through owned HTTP', () => {
  let f: Awaited<ReturnType<typeof httpVocabularyFixture>>;
  beforeEach(async () => {
    f = await httpVocabularyFixture();
  });
  afterEach(async () => {
    await f.close();
  });
  it('renders the vocabulary manager page', async () => {
    const pages = await httpPagesFixture();
    try {
      const response = await pages.request('/default/portal/admin/vocabulary/manager');
      assert.equal(response.status, 200);
      assert.match(response.text, /admin-vocabulary/);
    } finally {
      await pages.close();
    }
  });
  it('creates a vocabulary in the selected brand', async () => {
    const response = await f.request('/default/portal/admin/vocabulary', {
      method: 'POST',
      body: { name: 'Test', type: 'flat', source: 'local' },
    });
    assert.equal(response.status, 201);
    assert.deepEqual(response.body, { id: 'v1' });
    assert.equal(f.vocabulary.create.calledOnce, true);
    assert.equal(f.vocabulary.create.firstCall.args[0].branding, f.brand.id);
  });
  it('returns sanitized 500 for an unexpected create outage', async () => {
    f.vocabulary.create.rejects(new Error('PRIVATE-database-unavailable'));
    const response = await f.request('/default/portal/admin/vocabulary', {
      method: 'POST',
      body: { name: 'Test', type: 'flat', source: 'local' },
    });
    assert.equal(response.status, 500);
    assert(!response.text.includes('PRIVATE-database-unavailable'));
    assert.match(response.body.message, /Review current state/);
  });
  it('lists vocabularies with the browser list envelope and pagination summary', async () => {
    const response = await f.request('/default/portal/admin/vocabulary');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.records, []);
    assert.equal(response.body.summary.numFound, 0);
    assert.equal(response.body.summary.start, 0);
    assert.equal(response.body.summary.page, 1);
  });
});
