import { expect } from 'chai';
import * as sinon from 'sinon';
import * as path from 'node:path';

describe('Vocabulary bootstrap data integration', function () {
  let importStub: sinon.SinonStub;
  let originalBootstrapPath: string | undefined;
  let originalBootstrapRvaImports: boolean | undefined;

  const getVocabularyService = (): { bootstrapData: () => Promise<void> } => {
    return sails.services.vocabularyservice as { bootstrapData: () => Promise<void> };
  };

  const cleanupBootstrapVocabularies = async (): Promise<void> => {
    const existing = await Vocabulary.find({
      or: [
        { slug: 'anzsrc-toa' },
        { source: 'rva', sourceId: ['316', '317'] }
      ]
    });
    const ids = existing.map((vocabulary: { id: string }) => vocabulary.id);
    if (ids.length > 0) {
      await VocabularyEntry.destroy({ vocabulary: ids });
      await Vocabulary.destroy({ id: ids });
    }
  };

  before(async function () {
    this.timeout(60000);
    await cleanupBootstrapVocabularies();

    originalBootstrapPath = sails.config.vocab.bootstrapDataPath;
    originalBootstrapRvaImports = sails.config.vocab.bootstrapRvaImports;
    sails.config.vocab.bootstrapDataPath = path.resolve(process.cwd(), 'bootstrap-data/vocabularies');
    sails.config.vocab.bootstrapRvaImports = true;

    importStub = sinon.stub(sails.services.rvaimportservice, 'importRvaVocabulary').callsFake(
      async (rvaId: string, versionId?: string, branding?: string) => {
        const existing = await Vocabulary.findOne({ source: 'rva', sourceId: rvaId });
        if (existing) {
          return existing;
        }

        return await Vocabulary.create({
          name: `RVA ${rvaId}`,
          slug: `rva-${rvaId}`,
          source: 'rva',
          sourceId: rvaId,
          sourceVersionId: versionId || 'test-version',
          branding: branding || sails.services.brandingservice.getDefault()
        }).fetch();
      }
    );
  });

  after(async function () {
    importStub.restore();
    sails.config.vocab.bootstrapDataPath = originalBootstrapPath;
    sails.config.vocab.bootstrapRvaImports = originalBootstrapRvaImports;
    await cleanupBootstrapVocabularies();
  });

  it('creates local and RVA vocabularies on first bootstrap', async function () {
    this.timeout(60000);

    await getVocabularyService().bootstrapData();

    const local = await Vocabulary.findOne({ slug: 'anzsrc-toa' });
    expect(local).to.exist;

    const entryCount = await VocabularyEntry.count({ vocabulary: local?.id });
    expect(entryCount).to.equal(4);

    const importedCount = await Vocabulary.count({ source: 'rva', sourceId: ['316', '317'] });
    expect(importedCount).to.equal(2);
    expect(importStub.callCount).to.equal(2);
  });

  it('is idempotent when bootstrapData is called repeatedly', async function () {
    this.timeout(60000);

    await getVocabularyService().bootstrapData();

    const localCount = await Vocabulary.count({ slug: 'anzsrc-toa' });
    const importedCount = await Vocabulary.count({ source: 'rva', sourceId: ['316', '317'] });

    expect(localCount).to.equal(1);
    expect(importedCount).to.equal(2);
    expect(importStub.callCount).to.equal(2);
  });
});
