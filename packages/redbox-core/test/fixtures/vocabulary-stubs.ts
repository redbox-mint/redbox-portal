import { repositoryFixtures } from '../helpers/repositoryFixtures';
import * as sinon from 'sinon';
import * as runtime from '../../src/persistence/runtime';
import { repositoryFixtures as fixtures } from '../helpers/repositoryFixtures';
import { fixtureResult } from '../helpers/serviceRepositories';
/** Entity spies stay local to service tests; production persistence is never replaced by a model emulator. */
export function stubVocabularyPersistence(): void {
  const repository: Record<string, (...args: any[]) => Promise<any>> = {};
  const entities = { Vocabulary: 'Vocabulary', Entry: 'VocabularyEntry', Source: 'FigshareVocabularySource', Category: 'FigshareVocabularyCategory', Crosswalk: 'FigshareVocabularyCrosswalk', Mapping: 'FigshareVocabularyCrosswalkMapping', Run: 'FigshareVocabularySyncRun' };
  const filter = (entity: string, value: any) => {
    const { search, ...where } = value;
    if (search) where.or = (entity === 'Entry' ? ['label', 'value'] : ['name', 'slug']).map(key => ({ [key]: { contains: search } }));
    return where;
  };
  for (const [entity, name] of Object.entries(entities)) {
    repository['get' + entity] = async (lookup: object) => fixtureResult(fixtures[name].findOne(lookup));
    repository['list' + (entity === 'Entry' ? 'Entries' : entity === 'Category' ? 'Categories' : entity === 'Vocabulary' ? 'Vocabularies' : entity + 's')] = async (criteria: object, page: any = {}) => {
      let q = fixtures[name].find(filter(entity, criteria));
      if (page.sort !== undefined) q = q.sort(page.sort);
      if (page.offset !== undefined) q = q.skip(page.offset);
      if (page.limit !== undefined) q = q.limit(page.limit);
      return fixtureResult(q);
    };
    repository['count' + (entity === 'Entry' ? 'Entries' : entity === 'Category' ? 'Categories' : entity === 'Vocabulary' ? 'Vocabularies' : entity + 's')] = async (criteria: object) => fixtureResult(fixtures[name].count(filter(entity, criteria)));
    repository['create' + entity] = async (values: object) => { const q = fixtures[name].create(values); return fixtureResult(q?.fetch ? q.fetch() : q); };
    repository['revise' + entity] = async (id: string, values: object) => fixtureResult(fixtures[name].updateOne({ id }).set(values));
    repository['remove' + entity] = async (id: string) => fixtureResult(fixtures[name].destroyOne({ id }));
  }
  repository.createEntries = async (values: object[]) => { const q = fixtures.VocabularyEntry.createEach(values); return fixtureResult(q?.fetch ? q.fetch() : q); };
  repository.removeVocabularyEntries = async (vocabulary: string) => fixtureResult(fixtures.VocabularyEntry.destroy({ vocabulary }));
  repository.removeSourceCategories = async (source: string) => fixtureResult(fixtures.FigshareVocabularyCategory.destroy({ source }));
  repository.removeMappings = async (filter: object) => fixtureResult(fixtures.FigshareVocabularyCrosswalkMapping.destroy(filter));
  repository.changeRunState = async (id: string, state: string, values: object) => fixtureResult(fixtures.FigshareVocabularySyncRun.updateOne({ id, state }).set(values));
  repository.expirePreviews = async (branding: string, expiresAt: string) => fixtureResult(fixtures.FigshareVocabularySyncRun.update({ branding, state: 'previewed', expiresAt: { '<': expiresAt } }).set({ state: 'expired' }));
  sinon.stub(require('../../src/persistence/vocabulary/runtime'), 'getVocabularyRepositories').returns(repository as any);
}
