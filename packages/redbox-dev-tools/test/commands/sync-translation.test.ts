const {expect} = require('chai');
const fs = require('fs');
const path = require('path');
const commander = require('commander');
const sinon = require('sinon');

const loadTs = require('../support/load-ts.cjs');
const syncTranslationCommand = loadTs(module, '../../src/commands/sync-translation');
const packageRoot = fs.existsSync(path.resolve(__dirname, '..', '..', 'package.json'))
  ? path.resolve(__dirname, '..', '..')
  : path.resolve(__dirname, '..', '..', '..');
const testRoot = path.join(packageRoot, 'test');

describe('sync-translation command', () => {
  let tempRoot: string;
  let syncTranslationResources: string;

  beforeEach(() => {
    tempRoot = path.join(testRoot, '.tmp', 'sync-translation');
    fs.rmSync(tempRoot, {recursive: true, force: true});
    fs.mkdirSync(tempRoot, {recursive: true});

    syncTranslationResources = path.join(testRoot, 'resources', 'sync-translation');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, {recursive: true, force: true});
    sinon.restore();
  });

  function readJsonFile(path: string): unknown {
    try {
      return JSON.parse(fs.readFileSync(path, 'utf8'));
    } catch {
      return undefined;
    }
  }

  function buildProgram() {
    const program = new commander.Command();
    program
      .name('redbox-dev-tools')
      .option('--dry-run', 'Print intended changes without writing files', false);
    syncTranslationCommand.registerSyncTranslationCommand(program);
    return program;
  }

  function setFetchStub(opts?: {
    body: Record<string, unknown> | unknown[],
    status?: number,
    statusText?: string,
    headers?: Record<string, string>
  }[]) {
    opts = opts ?? [];
    const callback = sinon.stub();
    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      callback.onCall(i).returns(Promise.resolve(
        new Response(JSON.stringify(opt.body),
          {status: opt.status, statusText: opt.statusText, headers: opt.headers}
        )))
    }
    callback.onCall(opts.length).throws("No fetch stub for this call");
    (global as any).fetch = callback;
  }

  function setupTestData() {
    // input files
    const input01EnTranslationFile = path.resolve(syncTranslationResources, 'input-01-en-translation.json');
    const input01TestTranslationFile = path.resolve(syncTranslationResources, 'input-01-test-translation.json');
    const input01MetaFile = path.resolve(syncTranslationResources, 'input-01-meta.json');
    const input02EnTranslationFile = path.resolve(syncTranslationResources, 'input-02-en-translation.json');
    const input02TestTranslationFile = path.resolve(syncTranslationResources, 'input-02-test-translation.json');
    const input02MetaFile = path.resolve(syncTranslationResources, 'input-02-meta.json');
    const inputHttpEntriesFile = path.resolve(syncTranslationResources, 'input-http-entries.json');
    const inputHttpTranslationFile = path.resolve(syncTranslationResources, 'input-http-translation.json');

    // input data
    const input01EnTranslationData = readJsonFile(input01EnTranslationFile);
    const input01TestTranslationData = readJsonFile(input01TestTranslationFile);
    const input01MetaData = readJsonFile(input01MetaFile);
    const input02EnTranslationData = readJsonFile(input02EnTranslationFile);
    const input02TestTranslationData = readJsonFile(input02TestTranslationFile);
    const input02MetaData = readJsonFile(input02MetaFile);
    const inputHttpEntriesData = readJsonFile(inputHttpEntriesFile);
    const inputHttpTranslationData = readJsonFile(inputHttpTranslationFile);

    // output paths
    const outputEnTranslationFile = path.resolve(syncTranslationResources, 'output-en-translation.json');
    const outputTestTranslationFile = path.resolve(syncTranslationResources, 'output-test-translation.json');
    const outputMetaFile = path.resolve(syncTranslationResources, 'output-meta.json');

    // output data
    const outputEnTranslationData = readJsonFile(outputEnTranslationFile);
    const outputTestTranslationData = readJsonFile(outputTestTranslationFile);
    const outputMetaData = readJsonFile(outputMetaFile);

    // temp / result paths
    const tempLangDefaults01Dir = path.join(tempRoot, 'language-defaults-01');
    const tempEn01Dir = path.join(tempLangDefaults01Dir, 'en');
    const tempEnTranslation01File = path.join(tempEn01Dir, 'translation.json');
    const tempTest01Dir = path.join(tempLangDefaults01Dir, 'test');
    const tempTestTranslation01File = path.join(tempTest01Dir, 'translation.json');
    const tempMeta01File = path.join(tempLangDefaults01Dir, 'meta.json');

    const tempLangDefaults02Dir = path.join(tempRoot, 'language-defaults-02');
    const tempEn02Dir = path.join(tempLangDefaults02Dir, 'en');
    const tempEnTranslation02File = path.join(tempEn02Dir, 'translation.json');
    const tempTest02Dir = path.join(tempLangDefaults02Dir, 'test');
    const tempTestTranslation02File = path.join(tempTest02Dir, 'translation.json');
    const tempMeta02File = path.join(tempLangDefaults02Dir, 'meta.json');

    const tempLangDefaultsResultDir = path.join(tempRoot, 'language-defaults');
    const tempEnResultDir = path.join(tempLangDefaultsResultDir, 'en');
    const tempEnTranslationResultFile = path.join(tempEnResultDir, 'translation.json');
    const tempTestResultDir = path.join(tempLangDefaultsResultDir, 'test');
    const tempTestTranslationResultFile = path.join(tempTestResultDir, 'translation.json');
    const tempMetaResultFile = path.join(tempLangDefaultsResultDir, 'meta.json');

    // create temp dirs and files

    // input 1
    fs.mkdirSync(tempEn01Dir, {recursive: true});
    fs.writeFileSync(tempEnTranslation01File, JSON.stringify(input01EnTranslationData), 'utf8');
    fs.mkdirSync(tempTest01Dir, {recursive: true});
    fs.writeFileSync(tempTestTranslation01File, JSON.stringify(input01TestTranslationData), 'utf8');
    fs.writeFileSync(tempMeta01File, JSON.stringify(input01MetaData), 'utf8');

    // input 2
    fs.mkdirSync(tempEn02Dir, {recursive: true});
    fs.writeFileSync(tempEnTranslation02File, JSON.stringify(input02EnTranslationData), 'utf8');
    fs.mkdirSync(tempTest02Dir, {recursive: true});
    fs.writeFileSync(tempTestTranslation02File, JSON.stringify(input02TestTranslationData), 'utf8');
    fs.writeFileSync(tempMeta02File, JSON.stringify(input02MetaData), 'utf8');

    // result
    fs.mkdirSync(tempEnResultDir, {recursive: true});
    fs.writeFileSync(tempEnTranslationResultFile, JSON.stringify({}), 'utf8');
    fs.mkdirSync(tempTestResultDir, {recursive: true});
    fs.writeFileSync(tempTestTranslationResultFile, JSON.stringify({}), 'utf8');
    fs.writeFileSync(tempMetaResultFile, JSON.stringify({}), 'utf8');

    return {
      input01EnTranslationFile,
      input01TestTranslationFile,
      input01MetaFile,
      input02EnTranslationFile,
      input02TestTranslationFile,
      input02MetaFile,
      inputHttpEntriesFile,
      inputHttpTranslationFile,
      input01EnTranslationData,
      input01TestTranslationData,
      input01MetaData,
      input02EnTranslationData,
      input02TestTranslationData,
      input02MetaData,
      inputHttpEntriesData,
      inputHttpTranslationData,
      outputEnTranslationFile,
      outputMetaFile,
      outputTestTranslationFile,
      outputEnTranslationData,
      outputTestTranslationData,
      outputMetaData,
      tempLangDefaults01Dir,
      tempEn01Dir,
      tempEnTranslation01File,
      tempTest01Dir,
      tempTestTranslation01File,
      tempMeta01File,
      tempLangDefaults02Dir,
      tempEn02Dir,
      tempEnTranslation02File,
      tempTest02Dir,
      tempTestTranslation02File,
      tempMeta02File,
      tempLangDefaultsResultDir,
      tempEnResultDir,
      tempEnTranslationResultFile,
      tempTestResultDir,
      tempTestTranslationResultFile,
      tempMetaResultFile,
    }
  }

  function readResultFiles(opts: {
    tempEnTranslation01File: string,
    tempTestTranslation01File: string,
    tempMeta01File: string,
    tempEnTranslation02File: string,
    tempTestTranslation02File: string,
    tempMeta02File: string,
    tempEnTranslationResultFile: string,
    tempTestTranslationResultFile: string,
    tempMetaResultFile: string,
  }) {
    return {
      tempEnTranslation01Data: readJsonFile(opts.tempEnTranslation01File),
      tempTestTranslation01Data: readJsonFile(opts.tempTestTranslation01File),
      tempMeta01Data: readJsonFile(opts.tempMeta01File),
      tempEnTranslation02Data: readJsonFile(opts.tempEnTranslation02File),
      tempTestTranslation02Data: readJsonFile(opts.tempTestTranslation02File),
      tempMeta02Data: readJsonFile(opts.tempMeta02File),
      tempEnTranslationResultData: readJsonFile(opts.tempEnTranslationResultFile),
      tempTestTranslationResultData: readJsonFile(opts.tempTestTranslationResultFile),
      tempMetaResultData: readJsonFile(opts.tempMetaResultFile),
    };
  }

  function setupTestExample() {
    const program = buildProgram();

    const setupFiles = setupTestData();

    // stub the fetch api
    setFetchStub([
      {
        // i18n/entries
        body: setupFiles.inputHttpEntriesData as unknown[],
      },
      {
        // locales/en/translation.json
        body: setupFiles.inputHttpTranslationData as Record<string, unknown>,
      },
    ]);

    const cmds = [
      'node',
      'redbox-dev-tools',
      'sync-translation',
      '--api-base', 'https://localhost',
      '--language-defaults', setupFiles.tempLangDefaults01Dir,
      '--language-defaults', setupFiles.tempLangDefaults02Dir,
    ];

    return {
      program,
      setupFiles,
      cmds
    }
  }

  it('writes translation keys and meta from API in language-defaults format', async () => {
    const {program, setupFiles, cmds} = setupTestExample();
    await program.parseAsync(
      [
        ...cmds,
        '--output', setupFiles.tempLangDefaultsResultDir,
        '--format', 'language-defaults',
      ],
      {from: 'node'}
    );

    const resultFiles = readResultFiles(setupFiles);

    expect(setupFiles.outputEnTranslationData).to.deep.eql(resultFiles.tempEnTranslationResultData);
    expect(setupFiles.outputTestTranslationData).to.deep.eql(resultFiles.tempTestTranslationResultData);
    expect(setupFiles.outputMetaData).to.deep.eql(resultFiles.tempMetaResultData);
  });

  it('writes translation keys and meta from API in migration-data format', async () => {
    const {program, cmds} = setupTestExample();
    const migrationFile = path.join(tempRoot, 'migration-data.json');
    await program.parseAsync(
      [
        ...cmds,
        '--output', migrationFile,
        '--format', 'migration-data',
      ],
      {from: 'node'}
    );

    const migrationData = readJsonFile(migrationFile);

    expect(migrationData).to.deep.eql({
      test: 1,
    });

  });

  it('does not write files in dry run', async () => {
    const {program, setupFiles, cmds} = setupTestExample();
    await program.parseAsync(
      [
        ...cmds,
        '--dry-run',
        '--output', setupFiles.tempLangDefaultsResultDir,
        '--format', 'language-defaults'
      ],
      {from: 'node'}
    );

    const resultFiles = readResultFiles(setupFiles);

    // no changes to temp result files
    expect({}).to.deep.eql(resultFiles.tempEnTranslationResultData);
    expect({}).to.deep.eql(resultFiles.tempTestTranslationResultData);
    expect({}).to.deep.eql(resultFiles.tempMetaResultData);

    // no changes to temp input files
    expect(readJsonFile(setupFiles.tempEnTranslation01File)).to.deep.eql(resultFiles.tempEnTranslation01Data);
    expect(readJsonFile(setupFiles.tempTestTranslation01File)).to.deep.eql(resultFiles.tempTestTranslation01Data);
    expect(readJsonFile(setupFiles.tempMeta01File)).to.deep.eql(resultFiles.tempMeta01Data);
    expect(readJsonFile(setupFiles.tempEnTranslation02File)).to.deep.eql(resultFiles.tempEnTranslation02Data);
    expect(readJsonFile(setupFiles.tempTestTranslation02File)).to.deep.eql(resultFiles.tempTestTranslation02Data);
    expect(readJsonFile(setupFiles.tempMeta02File)).to.deep.eql(resultFiles.tempMeta02Data);
  });
});
