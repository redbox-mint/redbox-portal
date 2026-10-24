import * as sinon from 'sinon';
import { httpRouteFixture } from './httpRouteFixture';
import { mountVocabularyAdministrationRoutes } from '../../src/http/express/vocabularyAdministration';
import { mountVocabularyIntegrationRoutes } from '../../src/http/express/vocabularyIntegrations';

/** Explicit vocabulary ports behind the actual browser/API route owners. */
export async function httpVocabularyFixture() {
  const vocabulary = {
    list: sinon.stub().resolves({ data: [], meta: { total: 0, limit: 25, offset: 0 } }),
    getById: sinon.stub().resolves({ id: 'v1', branding: 'brand-1' }),
    getTree: sinon.stub().resolves([]),
    create: sinon.stub().resolves({ id: 'v1' }),
    update: sinon.stub().resolves({ id: 'v1' }),
    delete: sinon.stub().resolves(),
    reorderEntries: sinon.stub().resolves(0),
  };
  const rva = {
    importRvaVocabulary: sinon.stub().resolves({ id: 'v2' }),
    syncRvaVocabulary: sinon.stub().resolves({ created: 1, updated: 0, skipped: 0, lastSyncedAt: 'now' }),
  };
  const audit = sinon.stub().resolves();
  const f = await httpRouteFixture((router, input) => {
    mountVocabularyAdministrationRoutes(router, { ...input, vocabulary, audit });
    mountVocabularyIntegrationRoutes(router, { ...input, vocabulary, rva, audit });
  });
  return { ...f, vocabulary, rva, audit };
}
