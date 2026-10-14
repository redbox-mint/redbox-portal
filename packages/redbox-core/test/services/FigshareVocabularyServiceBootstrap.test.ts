let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';

const MODEL_GLOBALS = [
  'FigshareVocabularySource',
  'FigshareVocabularySyncRun',
  'FigshareVocabularyCrosswalk'
] as const;

/**
 * Covers the declarative Figshare import driven by
 * `bootstrap-data/vocabularies/figshare-imports.json`.
 *
 * The contract this suite protects: a bootstrap importer must never be able to fail the
 * Sails lift, must be idempotent across restarts, and must leave behind an *approved*
 * crosswalk - a draft one is useless to publishing, which refuses any crosswalk without an
 * approved revision.
 */
describe('FigshareVocabularyService bootstrap data', function () {
  const BRAND = 'brand-1';

  let service: any;
  let configModule: any;
  let sourceFindOne: sinon.SinonStub;
  let syncRunFindOne: sinon.SinonStub;
  let crosswalkFindOne: sinon.SinonStub;
  let crosswalkSet: sinon.SinonStub;
  let crosswalkUpdateOne: sinon.SinonStub;
  let createPreview: sinon.SinonStub;
  let applyPreview: sinon.SinonStub;
  let approveCrosswalk: sinon.SinonStub;
  let readFile: sinon.SinonStub;
  let logError: sinon.SinonStub;

  const savedGlobals = new Map<string, unknown>();
  let savedVocabConfig: unknown;
  let savedBootstrapConfig: unknown;
  let savedServices: unknown;
  let savedLog: any;
  /** True when this suite created the sails global and must therefore remove it. */
  let createdSailsGlobal = false;

  const IMPORT_ITEM = {
    scope: 'public',
    taxonomyId: '100',
    localCloneName: 'Figshare Categories (FOR)',
    localCloneSlug: 'figshare-categories-for'
  };

  /** Two preselected identity proposals plus one that must not be auto-approved. */
  const RUN_PROPOSALS = [
    { proposalId: 'clone:100.1', preselected: true },
    { proposalId: 'clone:100.2', preselected: true },
    { proposalId: 'label:100.3', preselected: false }
  ];

  function writeManifest(imports: unknown): void {
    readFile.resolves(JSON.stringify({ imports }));
  }

  beforeEach(function () {
    for (const name of MODEL_GLOBALS) {
      savedGlobals.set(name, (global as any)[name]);
    }

    sourceFindOne = sinon.stub().resolves(null);
    syncRunFindOne = sinon.stub().resolves({ id: 'run-1', proposals: RUN_PROPOSALS });
    crosswalkFindOne = sinon.stub().resolves(null);
    crosswalkSet = sinon.stub().resolves(undefined);
    crosswalkUpdateOne = sinon.stub().returns({ set: crosswalkSet });

    (global as any).FigshareVocabularySource = { findOne: sourceFindOne };
    (global as any).FigshareVocabularySyncRun = { findOne: syncRunFindOne };
    (global as any).FigshareVocabularyCrosswalk = {
      findOne: crosswalkFindOne,
      updateOne: crosswalkUpdateOne
    };

    // Don't depend on another spec file having installed the sails global first —
    // suite ordering left this undefined when the whole suite runs.
    createdSailsGlobal = (global as any).sails == null;
    if (createdSailsGlobal) {
      const { createMockSails } = require('./testHelper');
      (global as any).sails = createMockSails();
    }

    const sails = (global as any).sails;
    savedVocabConfig = sails.config.vocab;
    savedBootstrapConfig = sails.config.bootstrap;
    savedServices = sails.services;
    savedLog = sails.log;

    sails.config.vocab = {};
    sails.config.bootstrap = { bootstrapDataPath: '/app/bootstrap-data' };
    sails.services = { brandingservice: { getDefault: () => ({ id: BRAND, name: 'default' }) } };
    logError = sinon.stub();
    sails.log = { ...savedLog, error: logError };

    // The service calls resolveFigshareVocabularyConfig() at call time via the module
    // object, so stubbing the cached module reaches it without re-requiring.
    configModule = require('../../src/services/figshare-v2/config');
    sinon.stub(configModule, 'resolveFigshareVocabularyConfig').returns({
      connection: { baseUrl: 'https://api.figshare.com/v2', token: 'tok' },
      runtime: { mode: 'fixture' }
    });

    delete require.cache[require.resolve('../../src/services/FigshareVocabularyService')];
    const { Services } = require('../../src/services/FigshareVocabularyService');
    service = new Services.FigshareVocabularyService();

    readFile = sinon.stub().resolves(JSON.stringify({ imports: [IMPORT_ITEM] }));
    sinon.stub(service, 'getBootstrapFileOps').returns({ readFile });

    createPreview = sinon.stub(service, 'createPreview').resolves({
      runId: 'run-1',
      remoteHash: 'hash-1'
    });
    applyPreview = sinon.stub(service, 'applyPreview').resolves({
      crosswalkId: 'crosswalk-1',
      crosswalkRevision: 1
    });
    approveCrosswalk = sinon.stub(service, 'approveCrosswalk').resolves({ id: 'crosswalk-1' });
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
      const sails = (global as any).sails;
      sails.config.vocab = savedVocabConfig;
      sails.config.bootstrap = savedBootstrapConfig;
      sails.services = savedServices;
      sails.log = savedLog;
    }

    sinon.restore();
  });

  it('imports a declared taxonomy as a clone and approves the resulting crosswalk', async function () {
    await service.bootstrapData();

    expect(createPreview.calledOnce).to.equal(true);
    expect(createPreview.firstCall.args[0]).to.deep.equal({
      scope: 'public',
      taxonomyId: '100',
      createLocalClone: true,
      localCloneName: 'Figshare Categories (FOR)',
      localCloneSlug: 'figshare-categories-for'
    });
    expect(createPreview.firstCall.args[1]).to.deep.equal({ brandId: BRAND, userId: 'bootstrap-data' });

    expect(applyPreview.calledOnce).to.equal(true);
    expect(applyPreview.firstCall.args[0]).to.equal('run-1');
    expect(applyPreview.firstCall.args[1].remoteHash).to.equal('hash-1');

    expect(approveCrosswalk.calledOnce).to.equal(true);
    expect(approveCrosswalk.firstCall.args[0]).to.equal('crosswalk-1');
    expect(approveCrosswalk.firstCall.args[1]).to.equal(1);

    expect(createPreview.calledBefore(applyPreview)).to.equal(true);
    expect(applyPreview.calledBefore(approveCrosswalk)).to.equal(true);
  });

  it('approves only the preselected identity proposals', async function () {
    await service.bootstrapData();

    expect(applyPreview.firstCall.args[1].approvedProposalIds).to.deep.equal([
      'clone:100.1',
      'clone:100.2'
    ]);
  });

  it('renames the crosswalk when the manifest supplies a name', async function () {
    writeManifest([{ ...IMPORT_ITEM, crosswalkName: 'ANZSRC FOR → Figshare' }]);

    await service.bootstrapData();

    expect(crosswalkUpdateOne.calledOnceWith({ id: 'crosswalk-1' })).to.equal(true);
    expect(crosswalkSet.firstCall.args[0]).to.deep.equal({
      name: 'ANZSRC FOR → Figshare',
      updatedBy: 'bootstrap-data'
    });
  });

  it('suffixes a requested crosswalk name that is already taken for the brand', async function () {
    writeManifest([{ ...IMPORT_ITEM, crosswalkName: 'Taken' }]);
    crosswalkFindOne.onFirstCall().resolves({ id: 'other' });

    await service.bootstrapData();

    expect(crosswalkSet.firstCall.args[0].name).to.equal('Taken (2)');
  });

  it('leaves the auto-generated crosswalk name alone when none is supplied', async function () {
    await service.bootstrapData();

    expect(crosswalkUpdateOne.called).to.equal(false);
  });

  it('skips a catalogue that has already been imported for the brand', async function () {
    sourceFindOne.resolves({ id: 'source-1', branding: BRAND, scope: 'public', taxonomyId: '100' });

    await service.bootstrapData();

    expect(sourceFindOne.calledWithMatch({ branding: BRAND, scope: 'public', taxonomyId: '100' })).to.equal(true);
    expect(createPreview.called).to.equal(false);
    expect(approveCrosswalk.called).to.equal(false);
  });

  it('does nothing when bootstrapFigshareImports is disabled', async function () {
    (global as any).sails.config.vocab = { bootstrapFigshareImports: false };

    await service.bootstrapData();

    expect(readFile.called).to.equal(false);
    expect(createPreview.called).to.equal(false);
  });

  it('skips quietly when Figshare is not configured for the default brand', async function () {
    configModule.resolveFigshareVocabularyConfig.returns(null);

    await service.bootstrapData();

    expect(createPreview.called).to.equal(false);
    expect(logError.called).to.equal(false);
  });

  it('treats a missing manifest as a no-op rather than an error', async function () {
    const missing: NodeJS.ErrnoException = new Error('no such file');
    missing.code = 'ENOENT';
    readFile.rejects(missing);

    await service.bootstrapData();

    expect(createPreview.called).to.equal(false);
    expect(logError.called).to.equal(false);
  });

  it('logs and continues when the manifest is malformed', async function () {
    readFile.resolves('{ not json');

    await service.bootstrapData();

    expect(logError.called).to.equal(true);
    expect(createPreview.called).to.equal(false);
  });

  it('logs and continues when imports is not an array', async function () {
    readFile.resolves(JSON.stringify({ imports: 'nope' }));

    await service.bootstrapData();

    expect(logError.called).to.equal(true);
    expect(createPreview.called).to.equal(false);
  });

  it('skips items with an invalid scope, missing taxonomy, or missing clone name', async function () {
    writeManifest([
      { ...IMPORT_ITEM, scope: 'private' },
      { ...IMPORT_ITEM, taxonomyId: '' },
      { ...IMPORT_ITEM, localCloneName: '' }
    ]);

    await service.bootstrapData();

    expect(createPreview.called).to.equal(false);
    expect(logError.callCount).to.equal(3);
  });

  it('does not let one failing import abort the remaining items', async function () {
    writeManifest([
      { ...IMPORT_ITEM, taxonomyId: '100' },
      { ...IMPORT_ITEM, taxonomyId: '200' }
    ]);
    createPreview.onFirstCall().rejects(new Error('figshare unreachable'));

    await service.bootstrapData();

    expect(createPreview.callCount).to.equal(2);
    expect(approveCrosswalk.calledOnce).to.equal(true);
    expect(logError.called).to.equal(true);
  });

  it('reports an apply that produced no crosswalk instead of throwing', async function () {
    applyPreview.resolves({ crosswalkId: null });

    await service.bootstrapData();

    expect(approveCrosswalk.called).to.equal(false);
    expect(logError.called).to.equal(true);
  });
});
