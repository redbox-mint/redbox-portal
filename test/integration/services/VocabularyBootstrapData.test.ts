const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
import { fixtureRows, fixtureRemove, fixtureRow, fixtureCreate, fixtureCount } from '../../helpers/persistenceFixtures';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as path from 'node:path';

describe('Vocabulary bootstrap data integration', function () {
  let importStub: sinon.SinonStub;
  let originalBootstrapPath: string | undefined;
  let originalBootstrapRvaImports: boolean | undefined;

  const getVocabularyService = (): { bootstrapData: () => Promise<void> } => {
    return fixture.services.VocabularyService as { bootstrapData: () => Promise<void> };
  };

  const cleanupBootstrapVocabularies = async (): Promise<void> => {
    const existing = await fixtureRows("Vocabulary", {
      or: [
        { slug: 'anzsrc-toa' },
        { source: 'rva', sourceId: ['316', '317'] }
      ]
    });
    const ids = existing.map((vocabulary: { id: string }) => vocabulary.id);
    if (ids.length > 0) {
      await fixtureRemove("VocabularyEntry", { vocabulary: ids });
      await fixtureRemove("Vocabulary", { id: ids });
    }
  };

  before(async function () {
    this.timeout(60000);
    await cleanupBootstrapVocabularies();

    // The service reads fixture.config.bootstrap.bootstrapDataPath and appends 'vocabularies'
    // itself; the previous fixture.config.vocab.bootstrapDataPath override was never consulted.
    originalBootstrapPath = fixture.config.bootstrap?.bootstrapDataPath;
    originalBootstrapRvaImports = fixture.config.vocab.bootstrapRvaImports;
    fixture.config.bootstrap = {
      ...(fixture.config.bootstrap ?? {}),
      bootstrapDataPath: path.resolve(process.cwd(), 'bootstrap-data')
    };
    fixture.config.vocab.bootstrapRvaImports = true;

    importStub = sinon.stub(fixture.services.RvaImportService, 'importRvaVocabulary').callsFake(
      async (rvaId: string, versionId?: string, branding?: string) => {
        const existing = await fixtureRow("Vocabulary", { source: 'rva', sourceId: rvaId });
        if (existing) {
          return existing;
        }

        return await fixtureCreate("Vocabulary", {
          name: `RVA ${rvaId}`,
          slug: `rva-${rvaId}`,
          source: 'rva',
          sourceId: rvaId,
          sourceVersionId: versionId || 'test-version',
          branding: branding || fixture.services.BrandingService.getDefault()
        });
      }
    );
  });

  after(async function () {
    importStub.restore();
    fixture.config.bootstrap.bootstrapDataPath = originalBootstrapPath;
    fixture.config.vocab.bootstrapRvaImports = originalBootstrapRvaImports;
    await cleanupBootstrapVocabularies();
  });

  it('creates local and RVA vocabularies on first bootstrap', async function () {
    this.timeout(60000);

    await getVocabularyService().bootstrapData();

    const local = await fixtureRow("Vocabulary", { slug: 'anzsrc-toa' });
    expect(local).to.exist;

    const entryCount = await fixtureCount("VocabularyEntry", { vocabulary: local?.id });
    expect(entryCount).to.equal(4);

    const importedCount = await fixtureCount("Vocabulary", { source: 'rva', sourceId: ['316', '317'] });
    expect(importedCount).to.equal(2);
    expect(importStub.callCount).to.equal(2);
  });

  it('is idempotent when bootstrapData is called repeatedly', async function () {
    this.timeout(60000);

    await getVocabularyService().bootstrapData();

    const localCount = await fixtureCount("Vocabulary", { slug: 'anzsrc-toa' });
    const importedCount = await fixtureCount("Vocabulary", { source: 'rva', sourceId: ['316', '317'] });

    expect(localCount).to.equal(1);
    expect(importedCount).to.equal(2);
    expect(importStub.callCount).to.equal(2);
  });
});
