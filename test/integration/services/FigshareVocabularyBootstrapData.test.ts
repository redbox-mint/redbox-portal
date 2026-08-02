import { expect } from 'chai';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Exercises the declarative Figshare import end to end against the real datastore.
 *
 * The catalogue is served by the built-in fixture client (`sails.config.figshareDev`), so no
 * live Figshare call is made. What matters here is the shape of what lands in the database:
 * a read-only mirror, an editable clone, and an *approved* crosswalk - publishing rejects a
 * crosswalk that has no approved revision, so a draft one would make the bootstrap pointless.
 */
describe('Figshare vocabulary bootstrap data integration', function () {
  const SCOPE = 'public';
  const TAXONOMY_ID = '77';
  const CLONE_NAME = 'Bootstrap Figshare Clone';
  const CLONE_SLUG = 'bootstrap-figshare-clone';
  const CROSSWALK_NAME = 'Bootstrap Figshare Crosswalk';

  const CATEGORIES = [
    { id: 9001, title: 'Bootstrap Root', parent_id: 0, source_id: '77-A', taxonomy_id: 77, is_selectable: false, has_children: true },
    { id: 9002, title: 'Bootstrap Child One', parent_id: 9001, source_id: '77-A1', taxonomy_id: 77, is_selectable: true, has_children: false },
    { id: 9003, title: 'Bootstrap Child Two', parent_id: 9001, source_id: '77-A2', taxonomy_id: 77, is_selectable: true, has_children: false }
  ];

  let tempDir: string;
  let brandId: string;
  let brandName: string;
  let originalBootstrapPath: string | undefined;
  let originalFigshareDev: unknown;
  let originalBootstrapFigshareImports: boolean | undefined;
  let originalBrandConfig: unknown;
  let appConfigMap: Record<string, unknown>;

  const getService = (): { bootstrapData: () => Promise<void> } => {
    return sails.services.figsharevocabularyservice as { bootstrapData: () => Promise<void> };
  };

  const writeManifest = async (imports: unknown[]): Promise<void> => {
    await fs.writeFile(
      path.join(tempDir, 'vocabularies', 'figshare-imports.json'),
      JSON.stringify({ imports }),
      'utf8'
    );
  };

  const cleanup = async (): Promise<void> => {
    const sources = await FigshareVocabularySource.find({ scope: SCOPE, taxonomyId: TAXONOMY_ID });
    const sourceIds = sources.map((source: { id: string }) => String(source.id));
    const mirrorVocabularyIds = sources
      .map((source: { vocabulary?: string }) => source.vocabulary)
      .filter((id): id is string => Boolean(id))
      .map(String);
    const crosswalks = sourceIds.length > 0
      ? await FigshareVocabularyCrosswalk.find({ figshareSource: sourceIds })
      : [];
    const crosswalkIds = crosswalks.map((crosswalk: { id: string }) => String(crosswalk.id));

    if (crosswalkIds.length > 0) {
      await FigshareVocabularyCrosswalkMapping.destroy({ crosswalk: crosswalkIds });
      await FigshareVocabularyCrosswalk.destroy({ id: crosswalkIds });
    }
    if (sourceIds.length > 0) {
      await FigshareVocabularyCategory.destroy({ source: sourceIds });
      await FigshareVocabularySource.destroy({ id: sourceIds });
    }
    await FigshareVocabularySyncRun.destroy({ scope: SCOPE, taxonomyId: TAXONOMY_ID });

    const vocabularies = await Vocabulary.find({
      or: [
        { slug: CLONE_SLUG },
        { id: mirrorVocabularyIds }
      ]
    });
    const vocabularyIds = vocabularies.map((vocabulary: { id: string }) => String(vocabulary.id));
    if (vocabularyIds.length > 0) {
      await VocabularyEntry.destroy({ vocabulary: vocabularyIds });
      await Vocabulary.destroy({ id: vocabularyIds });
    }
  };

  before(async function () {
    this.timeout(60000);

    const defaultBrand = sails.services.brandingservice.getDefault();
    brandId = String(defaultBrand.id);
    brandName = String(defaultBrand.name);

    await cleanup();

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'figshare-bootstrap-'));
    await fs.mkdir(path.join(tempDir, 'vocabularies'), { recursive: true });
    await writeManifest([{
      scope: SCOPE,
      taxonomyId: TAXONOMY_ID,
      localCloneName: CLONE_NAME,
      localCloneSlug: CLONE_SLUG,
      crosswalkName: CROSSWALK_NAME
    }]);

    originalBootstrapPath = sails.config.bootstrap?.bootstrapDataPath;
    originalFigshareDev = sails.config.figshareDev;
    originalBootstrapFigshareImports = sails.config.vocab.bootstrapFigshareImports;

    sails.config.bootstrap = { ...(sails.config.bootstrap ?? {}), bootstrapDataPath: tempDir };
    sails.config.vocab.bootstrapFigshareImports = true;
    sails.config.figshareDev = {
      enabled: true,
      mode: 'fixture',
      fixtures: { categories: CATEGORIES }
    };

    // resolveFigshareVocabularyConfig() reads the per-brand application configuration, so the
    // brand needs a figsharePublishing block before the importer will do anything at all.
    appConfigMap = (sails.services.appconfigservice as any).brandingAppConfigMap;
    originalBrandConfig = appConfigMap[brandName];
    appConfigMap[brandName] = {
      ...(originalBrandConfig ?? {}) as Record<string, unknown>,
      figsharePublishing: {
        enabled: false,
        connection: { baseUrl: 'https://api.figshare.example/v2', token: '' }
      }
    };
  });

  after(async function () {
    this.timeout(60000);

    if (originalBrandConfig === undefined) {
      delete appConfigMap[brandName];
    } else {
      appConfigMap[brandName] = originalBrandConfig;
    }
    sails.config.bootstrap.bootstrapDataPath = originalBootstrapPath;
    sails.config.figshareDev = originalFigshareDev;
    sails.config.vocab.bootstrapFigshareImports = originalBootstrapFigshareImports;

    await cleanup();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('creates the mirror, the editable clone and an approved crosswalk', async function () {
    this.timeout(60000);

    await getService().bootstrapData();

    const source = await FigshareVocabularySource.findOne({
      branding: brandId,
      scope: SCOPE,
      taxonomyId: TAXONOMY_ID
    });
    expect(source, 'FigshareVocabularySource').to.exist;

    const mirror = await Vocabulary.findOne({ id: source.vocabulary });
    expect(mirror.source).to.equal('external');
    expect(mirror.figshareSourceKey).to.equal(`${brandId}:${SCOPE}:${TAXONOMY_ID}`);

    const categoryCount = await FigshareVocabularyCategory.count({ source: source.id });
    expect(categoryCount).to.equal(CATEGORIES.length);

    const clone = await Vocabulary.findOne({ slug: CLONE_SLUG });
    expect(clone, 'clone vocabulary').to.exist;
    expect(clone.source).to.not.equal('external');
    const cloneEntryCount = await VocabularyEntry.count({ vocabulary: clone.id });
    expect(cloneEntryCount).to.equal(CATEGORIES.length);

    const crosswalk = await FigshareVocabularyCrosswalk.findOne({ figshareSource: source.id });
    expect(crosswalk, 'crosswalk').to.exist;
    expect(crosswalk.name).to.equal(CROSSWALK_NAME);
    expect(String(crosswalk.localVocabulary)).to.equal(String(clone.id));
    expect(crosswalk.status).to.equal('approved');
    expect(Number(crosswalk.approvedRevision)).to.equal(Number(crosswalk.workingRevision));

    const approvedMappings = await FigshareVocabularyCrosswalkMapping.count({
      crosswalk: crosswalk.id,
      revision: crosswalk.approvedRevision,
      status: 'approved'
    });
    expect(approvedMappings).to.equal(CATEGORIES.length);
  });

  it('resolves record codes to Figshare category ids through the bootstrapped crosswalk', async function () {
    this.timeout(60000);

    const source = await FigshareVocabularySource.findOne({ scope: SCOPE, taxonomyId: TAXONOMY_ID });
    const crosswalk = await FigshareVocabularyCrosswalk.findOne({ figshareSource: source.id });

    const resolved = await sails.services.figsharevocabularyservice.resolveCategories({
      brandId,
      crosswalkId: String(crosswalk.id),
      sourceVocabularyId: String(crosswalk.localVocabulary),
      codes: ['77-A1', '77-A2']
    });

    expect(resolved.categoryIds).to.deep.equal([9002, 9003]);
    expect(resolved.unresolvedCodes).to.deep.equal([]);
  });

  it('is idempotent when bootstrapData is called repeatedly', async function () {
    this.timeout(60000);

    await getService().bootstrapData();

    const sourceCount = await FigshareVocabularySource.count({ scope: SCOPE, taxonomyId: TAXONOMY_ID });
    const cloneCount = await Vocabulary.count({ slug: CLONE_SLUG });
    const crosswalkCount = await FigshareVocabularyCrosswalk.count({ name: CROSSWALK_NAME });

    expect(sourceCount).to.equal(1);
    expect(cloneCount).to.equal(1);
    expect(crosswalkCount).to.equal(1);
  });
});
