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
 * Covers the publishing-side resolution surface: `resolveCrosswalkValues` (which backs the
 * `crosswalk` binding kind) and `getCrosswalkUsage` (which arms the delete guard).
 *
 * `resolveCategories` had no unit coverage before, so its assertions here also lock in the
 * pre-existing behaviour the refactor had to preserve.
 */
describe('FigshareVocabularyService crosswalk resolution', function () {
  const BRAND = 'brand-1';
  const LOCAL_VOCAB = 'local-1';

  let service: any;
  let crosswalkFindOne: sinon.SinonStub;
  let sourceFindOne: sinon.SinonStub;
  let entryFind: sinon.SinonStub;
  let mappingFind: sinon.SinonStub;
  let categoryFind: sinon.SinonStub;

  const savedGlobals = new Map<string, unknown>();
  let createdSailsGlobal = false;
  let savedServices: unknown;

  /** Two live categories plus one retired upstream. */
  const CATEGORIES = [
    { id: 'cat-1', categoryId: 25508, sourceId: 'src-1', entry: 'mirror-entry-1', historical: false },
    { id: 'cat-2', categoryId: 25509, sourceId: 'src-2', entry: 'mirror-entry-2', historical: false },
    { id: 'cat-3', categoryId: 99, sourceId: 'src-99', entry: 'mirror-entry-3', historical: true }
  ];

  const LOCAL_ENTRIES = [
    { id: 'entry-1', vocabulary: LOCAL_VOCAB, value: '0101', valueLower: '0101', identifier: 'for/0101', label: 'Hydrology' },
    { id: 'entry-2', vocabulary: LOCAL_VOCAB, value: '0102', valueLower: '0102', identifier: 'for/0102', label: 'Agronomy' }
  ];

  const MIRROR_ENTRIES = [
    { id: 'mirror-entry-1', label: 'Agricultural hydrology' },
    { id: 'mirror-entry-2', label: 'Agronomy' }
  ];

  function stubEntryFind() {
    // The local vocabulary lookup and the mirrored-label lookup both hit VocabularyEntry.
    entryFind.callsFake(async (criteria: Record<string, unknown>) => {
      if (criteria.vocabulary != null) {
        return LOCAL_ENTRIES;
      }
      const ids = (criteria.id as string[]) ?? [];
      return MIRROR_ENTRIES.filter((entry) => ids.includes(entry.id));
    });
  }

  beforeEach(function () {
    for (const name of MODEL_GLOBALS) {
      savedGlobals.set(name, (global as any)[name]);
    }

    crosswalkFindOne = sinon.stub().resolves({
      id: 'crosswalk-1',
      branding: BRAND,
      status: 'approved',
      approvedRevision: 1,
      localVocabulary: LOCAL_VOCAB,
      figshareSource: 'source-1'
    });
    sourceFindOne = sinon.stub().resolves({ id: 'source-1', branding: BRAND, archived: false });
    entryFind = sinon.stub();
    stubEntryFind();
    mappingFind = sinon.stub().resolves([
      { localEntry: 'entry-1', figshareCategory: 'cat-1' },
      { localEntry: 'entry-2', figshareCategory: 'cat-2' }
    ]);
    categoryFind = sinon.stub().resolves(CATEGORIES);

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
    savedServices = (global as any).sails.services;

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
    } else {
      (global as any).sails.services = savedServices;
    }
    sinon.restore();
  });

  function resolveInput(overrides: Record<string, unknown> = {}) {
    return {
      brandId: BRAND,
      crosswalkId: 'crosswalk-1',
      sourceVocabularyId: LOCAL_VOCAB,
      codes: ['0101', '0102'],
      ...overrides
    };
  }

  async function expectRejection(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
    try {
      await promise;
    } catch (error) {
      expect(error instanceof Error ? error.message : String(error)).to.match(pattern);
      return;
    }
    expect.fail(`Expected a rejection matching ${pattern}`);
  }

  describe('output modes', function () {
    it('emits numerically sorted category ids for categoryId output', async function () {
      mappingFind.resolves([
        { localEntry: 'entry-2', figshareCategory: 'cat-2' },
        { localEntry: 'entry-1', figshareCategory: 'cat-1' }
      ]);

      const result = await service.resolveCrosswalkValues(resolveInput({ outputs: 'categoryId' }));

      expect(result.values).to.deep.equal([25508, 25509]);
      expect(result.unresolvedCodes).to.deep.equal([]);
    });

    it('emits Figshare source ids in input-code order for sourceId output', async function () {
      const result = await service.resolveCrosswalkValues(resolveInput({ outputs: 'sourceId' }));

      expect(result.values).to.deep.equal(['src-1', 'src-2']);
    });

    it('emits mirrored entry labels for label output', async function () {
      const result = await service.resolveCrosswalkValues(resolveInput({ outputs: 'label' }));

      expect(result.values).to.deep.equal(['Agricultural hydrology', 'Agronomy']);
    });

    /**
     * The mapping resolved and only the display label is missing, so the code must not
     * be reported as unresolved — falling back keeps the value usable.
     */
    it('falls back to the source id and warns when a mirrored label is missing', async function () {
      entryFind.callsFake(async (criteria: Record<string, unknown>) => {
        if (criteria.vocabulary != null) {
          return LOCAL_ENTRIES;
        }
        return [{ id: 'mirror-entry-1', label: 'Agricultural hydrology' }];
      });

      const result = await service.resolveCrosswalkValues(resolveInput({ outputs: 'label' }));

      expect(result.values).to.deep.equal(['Agricultural hydrology', 'src-2']);
      expect(result.unresolvedCodes).to.deep.equal([]);
      sinon.assert.calledWithMatch((global as any).sails.log.warn, /src-2 has no mirrored label/);
    });

    it('defaults to categoryId output when none is supplied', async function () {
      const result = await service.resolveCrosswalkValues(resolveInput());

      expect(result.values).to.deep.equal([25508, 25509]);
    });

    it('matches codes by identifier as well as value', async function () {
      const result = await service.resolveCrosswalkValues(
        resolveInput({ codes: ['for/0101'], outputs: 'sourceId' })
      );

      expect(result.values).to.deep.equal(['src-1']);
      expect(result.unresolvedCodes).to.deep.equal([]);
    });

    it('reports codes with no local entry as unresolved', async function () {
      const result = await service.resolveCrosswalkValues(resolveInput({ codes: ['0101', '9999'] }));

      expect(result.values).to.deep.equal([25508]);
      expect(result.unresolvedCodes).to.deep.equal(['9999']);
    });

    it('returns empty without querying when there are no codes', async function () {
      const result = await service.resolveCrosswalkValues(resolveInput({ codes: [] }));

      expect(result.values).to.deep.equal([]);
      expect(result.normalizedCodes).to.deep.equal([]);
      sinon.assert.notCalled(entryFind);
    });
  });

  describe('historical targets', function () {
    beforeEach(function () {
      mappingFind.resolves([
        { localEntry: 'entry-1', figshareCategory: 'cat-1' },
        { localEntry: 'entry-2', figshareCategory: 'cat-3' }
      ]);
    });

    for (const outputs of ['categoryId', 'sourceId', 'label'] as const) {
      it(`excludes historical categories from values and reports them for ${outputs} output`, async function () {
        const result = await service.resolveCrosswalkValues(resolveInput({ outputs }));

        expect(result.values).to.have.lengthOf(1);
        expect(result.historicalTargets).to.deep.equal([
          { code: '0102', categoryId: 99, sourceId: 'src-99' }
        ]);
        // A historical mapping still resolved, so its code is not unresolved.
        expect(result.unresolvedCodes).to.deep.equal([]);
      });
    }
  });

  describe('guards', function () {
    it('rejects a crosswalk without an approved revision', async function () {
      crosswalkFindOne.resolves({
        id: 'crosswalk-1',
        branding: BRAND,
        status: 'draft',
        approvedRevision: null,
        localVocabulary: LOCAL_VOCAB,
        figshareSource: 'source-1'
      });

      await expectRejection(service.resolveCrosswalkValues(resolveInput()), /no approved revision/);
    });

    it('rejects a crosswalk whose local vocabulary does not match', async function () {
      await expectRejection(
        service.resolveCrosswalkValues(resolveInput({ sourceVocabularyId: 'other-vocab' })),
        /maps a different local vocabulary/
      );
    });

    it('rejects an archived Figshare source', async function () {
      sourceFindOne.resolves({ id: 'source-1', branding: BRAND, archived: true });

      await expectRejection(service.resolveCrosswalkValues(resolveInput()), /source behind the configured crosswalk is unavailable/);
    });

    it('rejects an unknown crosswalk', async function () {
      crosswalkFindOne.resolves(null);

      await expectRejection(service.resolveCrosswalkValues(resolveInput()), /crosswalk not found/);
    });
  });

  /** The narrow legacy surface must keep behaving exactly as before the refactor. */
  describe('resolveCategories', function () {
    it('still returns sorted numeric category ids', async function () {
      const result = await service.resolveCategories(resolveInput());

      expect(result.categoryIds).to.deep.equal([25508, 25509]);
      expect(result.unresolvedCodes).to.deep.equal([]);
      expect(result.historicalTargets).to.deep.equal([]);
    });

    it('still reports historical targets separately', async function () {
      mappingFind.resolves([{ localEntry: 'entry-2', figshareCategory: 'cat-3' }]);

      const result = await service.resolveCategories(resolveInput());

      expect(result.categoryIds).to.deep.equal([]);
      expect(result.historicalTargets).to.deep.equal([
        { code: '0102', categoryId: 99, sourceId: 'src-99' }
      ]);
    });
  });

  /**
   * A crosswalk can now be referenced from any binding, so usage detection has to walk
   * the whole config. If this returns nothing the deleteCrosswalk guard silently disarms.
   */
  describe('getCrosswalkUsage', function () {
    function withConfig(figsharePublishing: unknown) {
      (global as any).sails.services = {
        appconfigservice: {
          getAppConfigurationForBrand: sinon.stub().returns({ figsharePublishing })
        }
      };
    }

    const binding = {
      kind: 'crosswalk',
      source: { kind: 'path', path: 'metadata.forCodes' },
      sourceVocabularyId: LOCAL_VOCAB,
      crosswalkId: 'crosswalk-1',
      outputs: 'categoryId'
    };

    it('detects a crosswalk binding on the categories source', async function () {
      withConfig({ metadata: { categories: { source: binding } } });

      const usage = await service.getCrosswalkUsage('crosswalk-1', { brandId: BRAND });

      expect(usage).to.deep.equal([{
        brandName: BRAND,
        configKey: 'figsharePublishing',
        bindingPath: 'metadata.categories.source',
        outputs: 'categoryId',
        sourceVocabularyId: LOCAL_VOCAB
      }]);
    });

    /** The capability the old `categories.crosswalkId` check could not see at all. */
    it('detects a crosswalk binding on keywords', async function () {
      withConfig({ metadata: { keywords: { ...binding, outputs: 'label' } } });

      const usage = await service.getCrosswalkUsage('crosswalk-1', { brandId: BRAND });

      expect(usage).to.have.lengthOf(1);
      expect(usage[0].bindingPath).to.equal('metadata.keywords');
      expect(usage[0].outputs).to.equal('label');
    });

    it('reports every referencing binding, including inside arrays', async function () {
      withConfig({
        metadata: {
          categories: { source: binding },
          customFields: [
            { figshareField: 'Discipline', value: { ...binding, outputs: 'sourceId' } }
          ]
        },
        authors: { lookup: [{ matchBy: 'email', value: binding }] }
      });

      const usage = await service.getCrosswalkUsage('crosswalk-1', { brandId: BRAND });

      expect(usage.map((entry: any) => entry.bindingPath).sort()).to.deep.equal([
        'authors.lookup.0.value',
        'metadata.categories.source',
        'metadata.customFields.0.value'
      ]);
    });

    it('ignores crosswalk bindings that reference a different crosswalk', async function () {
      withConfig({ metadata: { categories: { source: { ...binding, crosswalkId: 'crosswalk-2' } } } });

      expect(await service.getCrosswalkUsage('crosswalk-1', { brandId: BRAND })).to.deep.equal([]);
    });

    it('returns no usage when the config has no crosswalk bindings', async function () {
      withConfig({ metadata: { categories: { source: { kind: 'path', path: 'metadata.forCodes' } } } });

      expect(await service.getCrosswalkUsage('crosswalk-1', { brandId: BRAND })).to.deep.equal([]);
    });

    it('returns no usage when the brand has no Figshare publishing config', async function () {
      withConfig(undefined);

      expect(await service.getCrosswalkUsage('crosswalk-1', { brandId: BRAND })).to.deep.equal([]);
    });
  });
});
