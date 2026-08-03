let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';

const MODEL_GLOBALS = [
  'FigshareVocabularyCrosswalk',
  'FigshareVocabularySource',
  'FigshareVocabularyCrosswalkMapping',
  'FigshareVocabularyCategory',
  'VocabularyEntry'
] as const;

/**
 * Covers the two read surfaces behind the manual mapping picker. Both exist so an
 * administrator can add a crosswalk edge by hand: one searches the mirrored Figshare
 * targets, the other searches local terms — including terms with no target, which never
 * appear in the mapping table.
 */
describe('FigshareVocabularyService mapping picker reads', function () {
  const BRAND = 'brand-1';
  const LOCAL_VOCAB = 'local-1';
  const ACTOR = { brandId: BRAND, userId: 'admin' };

  let service: any;
  let crosswalkFindOne: sinon.SinonStub;
  let sourceFindOne: sinon.SinonStub;
  let entryFind: sinon.SinonStub;
  let mappingFind: sinon.SinonStub;
  let categoryFind: sinon.SinonStub;

  const savedGlobals = new Map<string, unknown>();
  let createdSailsGlobal = false;

  /** Two live categories plus one retired upstream. */
  const CATEGORIES = [
    { id: 'cat-2', categoryId: 23818, sourceId: '300101', entry: 'mirror-entry-2', historical: false, selectable: true },
    { id: 'cat-1', categoryId: 23815, sourceId: '3001', entry: 'mirror-entry-1', historical: false, selectable: true },
    { id: 'cat-3', categoryId: 999, sourceId: '300199', entry: 'mirror-entry-3', historical: true, selectable: true }
  ];

  const MIRROR_ENTRIES = [
    { id: 'mirror-entry-1', label: 'Agricultural biotechnology' },
    { id: 'mirror-entry-2', label: 'Agricultural biotechnology diagnostics' },
    { id: 'mirror-entry-3', label: 'Retired term' }
  ];

  const LOCAL_ENTRIES = [
    { id: 'entry-1', vocabulary: LOCAL_VOCAB, value: '3001', label: 'Agricultural biotechnology', historical: false },
    { id: 'entry-2', vocabulary: LOCAL_VOCAB, value: '300101', label: 'Agricultural diagnostics', historical: false },
    { id: 'entry-3', vocabulary: LOCAL_VOCAB, value: '300102', label: 'Marine biotechnology', historical: false }
  ];

  beforeEach(function () {
    for (const name of MODEL_GLOBALS) {
      savedGlobals.set(name, (global as any)[name]);
    }

    crosswalkFindOne = sinon.stub().resolves({
      id: 'crosswalk-1',
      branding: BRAND,
      status: 'draft',
      workingRevision: 2,
      approvedRevision: 1,
      localVocabulary: LOCAL_VOCAB,
      figshareSource: 'source-1'
    });
    sourceFindOne = sinon.stub().resolves({ id: 'source-1', branding: BRAND, archived: false });
    entryFind = sinon.stub().callsFake(async (criteria: Record<string, unknown>) => {
      if (criteria.vocabulary != null) {
        return LOCAL_ENTRIES;
      }
      const ids = (criteria.id as string[]) ?? [];
      return MIRROR_ENTRIES.filter((entry) => ids.includes(entry.id));
    });
    mappingFind = sinon.stub().resolves([
      { localEntry: 'entry-1', figshareCategory: 'cat-1', revision: 2 },
      { localEntry: 'entry-1', figshareCategory: 'cat-2', revision: 2 }
    ]);
    categoryFind = sinon.stub().callsFake(async (criteria: Record<string, unknown>) =>
      CATEGORIES.filter((category) => criteria.historical === false ? category.historical === false : true));

    (global as any).FigshareVocabularyCrosswalk = { findOne: crosswalkFindOne };
    (global as any).FigshareVocabularySource = { findOne: sourceFindOne };
    (global as any).FigshareVocabularyCrosswalkMapping = { find: mappingFind };
    (global as any).FigshareVocabularyCategory = { find: categoryFind };
    (global as any).VocabularyEntry = { find: entryFind };

    createdSailsGlobal = (global as any).sails == null;
    if (createdSailsGlobal) {
      const { createMockSails } = require('./testHelper');
      (global as any).sails = createMockSails();
    }

    delete require.cache[require.resolve('../../src/services/FigshareVocabularyService')];
    const { Services } = require('../../src/services/FigshareVocabularyService');
    service = new Services.FigshareVocabularyService();
  });

  afterEach(function () {
    for (const name of MODEL_GLOBALS) {
      const previous = savedGlobals.get(name);
      if (previous === undefined) {
        delete (global as any)[name];
      } else {
        (global as any)[name] = previous;
      }
    }
    savedGlobals.clear();

    if (createdSailsGlobal) {
      delete (global as any).sails;
      createdSailsGlobal = false;
    }
    sinon.restore();
  });

  describe('listSourceCategories', function () {
    it('returns live targets titled from the mirrored entry, ordered by code', async function () {
      const result = await service.listSourceCategories('source-1', {}, ACTOR);

      expect(result.data.map((row: any) => row.sourceId)).to.deep.equal(['3001', '300101']);
      expect(result.data[0].title).to.equal('Agricultural biotechnology');
      expect(result.data[0].categoryId).to.equal(23815);
      expect(result.meta.total).to.equal(2);
    });

    it('hides historical targets unless they are explicitly requested', async function () {
      const excluded = await service.listSourceCategories('source-1', {}, ACTOR);
      expect(excluded.data.some((row: any) => row.historical)).to.equal(false);

      const included = await service.listSourceCategories('source-1', { includeHistorical: true }, ACTOR);
      expect(included.data.some((row: any) => row.historical)).to.equal(true);
    });

    it('searches titles as well as codes', async function () {
      const byTitle = await service.listSourceCategories('source-1', { q: 'diagnostics' }, ACTOR);
      expect(byTitle.data.map((row: any) => row.sourceId)).to.deep.equal(['300101']);

      const byCode = await service.listSourceCategories('source-1', { q: '23815' }, ACTOR);
      expect(byCode.data.map((row: any) => row.sourceId)).to.deep.equal(['3001']);
    });

    it('refuses to read a source from another brand', async function () {
      sourceFindOne.resolves(null);

      try {
        await service.listSourceCategories('source-1', {}, ACTOR);
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.match(/source not found/i);
        return;
      }
      expect.fail('Expected a rejection for a source outside the brand');
    });
  });

  describe('listCrosswalkLocalEntries', function () {
    it('annotates every local term with the targets it already has', async function () {
      const result = await service.listCrosswalkLocalEntries('crosswalk-1', {}, ACTOR);

      const byId = new Map(result.data.map((row: any) => [row.id, row.targetCount]));
      expect(byId.get('entry-1')).to.equal(2);
      expect(byId.get('entry-2')).to.equal(0);
      expect(result.meta.revision).to.equal(2);
      expect(result.meta.total).to.equal(3);
    });

    it('reaches terms with no target, which the mapping table never shows', async function () {
      const result = await service.listCrosswalkLocalEntries('crosswalk-1', { mapped: 'unmapped' }, ACTOR);

      expect(result.data.map((row: any) => row.id)).to.deep.equal(['entry-2', 'entry-3']);
    });

    it('filters to mapped terms on request', async function () {
      const result = await service.listCrosswalkLocalEntries('crosswalk-1', { mapped: 'mapped' }, ACTOR);

      expect(result.data.map((row: any) => row.id)).to.deep.equal(['entry-1']);
    });

    it('searches labels and values', async function () {
      const byLabel = await service.listCrosswalkLocalEntries('crosswalk-1', { q: 'marine' }, ACTOR);
      expect(byLabel.data.map((row: any) => row.id)).to.deep.equal(['entry-3']);

      const byValue = await service.listCrosswalkLocalEntries('crosswalk-1', { q: '300101' }, ACTOR);
      expect(byValue.data.map((row: any) => row.id)).to.deep.equal(['entry-2']);
    });

    it('counts targets against the requested revision', async function () {
      await service.listCrosswalkLocalEntries('crosswalk-1', { revision: 1 }, ACTOR);

      sinon.assert.calledWithMatch(mappingFind, { crosswalk: 'crosswalk-1', revision: 1 });
    });

    it('refuses to read a crosswalk from another brand', async function () {
      crosswalkFindOne.resolves(null);

      try {
        await service.listCrosswalkLocalEntries('crosswalk-1', {}, ACTOR);
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.match(/crosswalk not found/i);
        return;
      }
      expect.fail('Expected a rejection for a crosswalk outside the brand');
    });
  });
});
