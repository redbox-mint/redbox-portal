import { figshareVocabularyInput } from '../helpers/figshareVocabularyInput';
import { createDomainFixture } from './testHelper';
let environment: any;
import { repositoryFixtures } from '../helpers/repositoryFixtures';
import {stubVocabularyPersistence} from '../fixtures/vocabulary-stubs';
let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';

const MODEL_GLOBALS = [
  'FigshareVocabularySource',
  'FigshareVocabularyCrosswalk',
  'Vocabulary',
  'FigshareVocabularyCategory',
  'VocabularyEntry'
] as const;

/**
 * Covers how a preview request is bound to existing records.
 *
 * These are the guards that keep a brand from mirroring the same catalogue twice and that
 * let the Sources screen refresh a mirror without nominating a local target.
 */
describe('FigshareVocabularyService preview mode resolution', function () {
  const BRAND = 'brand-1';
  let FigshareVocabularyService: any;
  let sourceFindOne: sinon.SinonStub;
  let crosswalkFindOne: sinon.SinonStub;
  let vocabularyFindOne: sinon.SinonStub;

  const existingSource = {
    id: 'source-1',
    branding: BRAND,
    scope: 'public',
    taxonomyId: '100',
    vocabulary: 'mirror-1'
  };

  const localVocabulary = {
    id: 'local-1',
    branding: BRAND,
    name: 'figgy',
    source: 'local'
  };

  function resolve(input: Record<string, unknown>) {
    return FigshareVocabularyService.resolvePreviewMode(input, BRAND);
  }

  // Repository spies are shared by these focused suites; restore each captured entry.
  const savedFixtures = new Map<string, unknown>();

  beforeEach(function () {
    stubVocabularyPersistence();
    environment = createDomainFixture();
    for (const name of MODEL_GLOBALS) {
      savedFixtures.set(name, repositoryFixtures[name]);
    }

    sourceFindOne = sinon.stub().resolves(null);
    crosswalkFindOne = sinon.stub().resolves(null);
    vocabularyFindOne = sinon.stub().resolves(localVocabulary);

    repositoryFixtures.FigshareVocabularySource = { findOne: sourceFindOne };
    repositoryFixtures.FigshareVocabularyCrosswalk = { findOne: crosswalkFindOne };
    repositoryFixtures.Vocabulary = { findOne: vocabularyFindOne };
    repositoryFixtures.FigshareVocabularyCategory = { find: sinon.stub().resolves([]) };
    repositoryFixtures.VocabularyEntry = { find: sinon.stub().resolves([]) };

    delete require.cache[require.resolve('../../src/services/FigshareVocabularyService')];
    const { Services } = require('../../src/services/FigshareVocabularyService');
    FigshareVocabularyService = new Services.FigshareVocabularyService(figshareVocabularyInput(environment));
  });

  afterEach(function () {
    for (const name of MODEL_GLOBALS) {
      const previous = savedFixtures.get(name);
      if (previous === undefined) {
        delete repositoryFixtures[name];
      } else {
        repositoryFixtures[name] = previous;
      }
    }
    savedFixtures.clear();
    sinon.restore();
  });

  it('resynchronises an existing mirror when only a source is supplied', async function () {
    sourceFindOne.resolves(existingSource);

    const mode = await resolve({ scope: 'public', taxonomyId: '100', sourceId: 'source-1' });

    expect(mode.source).to.deep.equal(existingSource);
    expect(mode.localVocabulary).to.equal(null);
    expect(mode.createLocalClone).to.equal(false);
  });

  it('reuses the brand mirror for a catalogue that has already been imported', async function () {
    sourceFindOne.resolves(existingSource);

    const mode = await resolve({ scope: 'public', taxonomyId: '100', localVocabularyId: 'local-1' });

    expect(sourceFindOne.calledWithMatch({ branding: BRAND, scope: 'public', taxonomyId: '100' })).to.equal(true);
    expect(mode.source).to.deep.equal(existingSource);
  });

  it('reuses the existing crosswalk for a local vocabulary already paired with the mirror', async function () {
    const existingCrosswalk = { id: 'crosswalk-1', branding: BRAND, workingRevision: 3 };
    sourceFindOne.resolves(existingSource);
    crosswalkFindOne.resolves(existingCrosswalk);

    const mode = await resolve({ scope: 'public', taxonomyId: '100', localVocabularyId: 'local-1' });

    expect(crosswalkFindOne.calledWithMatch({
      branding: BRAND,
      localVocabulary: 'local-1',
      figshareSource: 'source-1'
    })).to.equal(true);
    expect(mode.crosswalk).to.deep.equal(existingCrosswalk);
  });

  it('leaves the source unbound when the catalogue has never been imported', async function () {
    const mode = await resolve({ scope: 'public', taxonomyId: '100', localVocabularyId: 'local-1' });

    expect(mode.source).to.equal(null);
    expect(mode.crosswalk).to.equal(null);
    expect(mode.localVocabulary).to.deep.equal(localVocabulary);
  });

  it('still requires a local target for a catalogue with no existing mirror', async function () {
    let caught: any = null;
    try {
      await resolve({ scope: 'public', taxonomyId: '100' });
    } catch (error) {
      caught = error;
    }

    expect(caught).to.not.equal(null);
    expect(caught.code).to.equal('catalogue-invalid');
  });

  it('rejects a request that both selects a local vocabulary and asks for a clone', async function () {
    let caught: any = null;
    try {
      await resolve({ scope: 'public', taxonomyId: '100', localVocabularyId: 'local-1', createLocalClone: true });
    } catch (error) {
      caught = error;
    }

    expect(caught).to.not.equal(null);
    expect(caught.code).to.equal('catalogue-invalid');
  });
});
