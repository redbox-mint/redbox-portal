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
  let inputOriginalPath: string;
  let inputTargetPath: string;

  beforeEach(() => {
    tempRoot = path.join(testRoot, '.tmp', 'sync-translation');
    fs.rmSync(tempRoot, {recursive: true, force: true});
    fs.mkdirSync(tempRoot, {recursive: true});

    const syncTranslationResources = path.join(testRoot, 'resources', 'sync-translation');
    inputOriginalPath = path.join(syncTranslationResources, 'original');
    inputTargetPath = path.join(syncTranslationResources, 'target');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, {recursive: true, force: true});
    sinon.restore();
  });

  function readJsonFile(path: string): unknown {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
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

  function setupTempFiles() {
    // known paths
    const originalEnTranslationFile = path.resolve(inputOriginalPath, 'en', 'translation.json');
    const originalTestTranslationFile = path.resolve(inputOriginalPath, 'test', 'translation.json');
    const originalMetaFile = path.resolve(inputOriginalPath, 'meta.json');
    const originalHttpEntriesFile = path.resolve(inputOriginalPath, 'http-entries.json');
    const originalHttpTranslationFile = path.resolve(inputOriginalPath, 'http-translation.json');

    const targetEnTranslationFile = path.resolve(inputTargetPath, 'en', 'translation.json');
    const targetTestTranslationFile = path.resolve(inputTargetPath, 'test', 'translation.json');
    const targetMetaFile = path.resolve(inputTargetPath, 'meta.json');

    const tempLangDefaultsDir = path.join(tempRoot, 'language-defaults');
    const tempEnDir = path.join(tempLangDefaultsDir, 'en');
    const tempEnTranslationFile = path.join(tempLangDefaultsDir, 'en', 'translation.json');
    const tempTestDir = path.join(tempLangDefaultsDir, 'test');
    const tempTestTranslationFile = path.join(tempLangDefaultsDir, 'test', 'translation.json');
    const tempMetaFile = path.join(tempLangDefaultsDir, 'meta.json');

    const originalEnTranslationData = readJsonFile(originalEnTranslationFile);
    const originalTestTranslationData = readJsonFile(originalTestTranslationFile);
    const originalMetaData = readJsonFile(originalMetaFile);

    // create temp dir and files
    fs.mkdirSync(tempEnDir, {recursive: true});
    fs.writeFileSync(tempEnTranslationFile, JSON.stringify(readJsonFile(originalEnTranslationFile)), 'utf8');

    fs.mkdirSync(tempTestDir, {recursive: true});
    fs.writeFileSync(tempTestTranslationFile, JSON.stringify(readJsonFile(originalTestTranslationFile)), 'utf8');

    fs.writeFileSync(tempMetaFile, JSON.stringify(readJsonFile(originalMetaFile)), 'utf8');

    return {
      originalEnTranslationFile,
      originalTestTranslationFile,
      originalMetaFile,
      originalHttpEntriesFile,
      originalHttpTranslationFile,
      targetEnTranslationFile,
      targetTestTranslationFile,
      targetMetaFile,
      tempLangDefaultsDir,
      tempEnDir,
      tempEnTranslationFile,
      tempTestDir,
      tempTestTranslationFile,
      tempMetaFile,
      originalEnTranslationData,
      originalTestTranslationData,
      originalMetaData,
    }
  }

  function readResultFiles(opts: {
    targetEnTranslationFile: string,
    targetTestTranslationFile: string,
    targetMetaFile: string,
    tempEnTranslationFile: string,
    tempTestTranslationFile: string,
    tempMetaFile: string,
  }) {
    const targetEnTranslation = readJsonFile(opts.targetEnTranslationFile);
    const targetTestTranslation = readJsonFile(opts.targetTestTranslationFile);
    const targetMeta = readJsonFile(opts.targetMetaFile);

    const tempEnTranslationData = readJsonFile(opts.tempEnTranslationFile) as Record<string, unknown>;
    const tempTestTranslationData = readJsonFile(opts.tempTestTranslationFile) as Record<string, unknown>;
    const tempMetaData = readJsonFile(opts.tempMetaFile) as Record<string, unknown>;

    return {
      targetEnTranslation,
      targetTestTranslation,
      targetMeta,
      tempEnTranslationData,
      tempTestTranslationData,
      tempMetaData,
    }
  }

  it('adds translation keys and meta from API', async () => {
    const program = buildProgram();

    const setupFiles = setupTempFiles();

    // stub the fetch api
    setFetchStub([
      {
        // i18n/entries
        body: readJsonFile(setupFiles.originalHttpEntriesFile) as unknown[],
      },
      {
        // locales/en/translation.json
        body: readJsonFile(setupFiles.originalHttpTranslationFile) as Record<string, unknown>,
      },
    ]);

    await program.parseAsync(
      [
        'node',
        'redbox-dev-tools',
        'sync-translation',
        '--api-base', 'https://localhost',
        '--language-defaults', setupFiles.tempLangDefaultsDir,
        '--output', setupFiles.tempLangDefaultsDir,
        '--format', 'language-defaults',
      ],
      {from: 'node'}
    );

    const resultFiles = readResultFiles(setupFiles);

    expect(resultFiles.tempEnTranslationData).to.eql(resultFiles.targetEnTranslation);
    expect(resultFiles.tempTestTranslationData).to.eql(resultFiles.targetTestTranslation);
    expect(resultFiles.tempMetaData).to.eql(resultFiles.targetMeta);

    expect(Object.keys(resultFiles.tempEnTranslationData)).to.have.length(3);
    expect(resultFiles.tempEnTranslationData["@name-test1"]).to.eql("Name 1 <a href=\"https://qcif.edu.au\">link</a>");
    expect(resultFiles.tempEnTranslationData["@name-test2"]).to.eql("Name 2");
    expect(resultFiles.tempEnTranslationData["@name-test3"]).to.eql("Name 3");
    expect(resultFiles.tempEnTranslationData["@name-test4"]).to.eql("");

    expect(Object.keys(resultFiles.tempMetaData)).to.have.length(4);
    expect(resultFiles.tempMetaData["@name-test1"]).to.eql({
      "category": "naming",
      "description": "Name for test 1.",
      "contentFormat": "html"
    });
    expect(resultFiles.tempMetaData["@name-test2"]).to.eql({
      "category": "name",
      "description": "Name for test 2.",
      "contentFormat": "plain"
    });
    expect(resultFiles.tempMetaData["@name-test3"]).to.eql({
      "category": "name",
      "description": "Name for test 3."
    });
    expect(resultFiles.tempMetaData["@name-test4"]).to.eql({
      "category": "name",
      "description": "Translation for @name-test4"
    });

  });

  it('does not write files in dry run', async () => {
    const program = buildProgram();

    const setupFiles = setupTempFiles();

    // stub the fetch api
    setFetchStub([
      {
        // i18n/entries
        body: readJsonFile(setupFiles.originalHttpEntriesFile) as unknown[],
      },
      {
        // locales/en/translation.json
        body: readJsonFile(setupFiles.originalHttpTranslationFile) as Record<string, unknown>,
      },
    ]);

    await program.parseAsync(
      [
        'node',
        'redbox-dev-tools',
        'sync-translation',
        '--dry-run',
        '--api-base', 'https://localhost',
        '--language-defaults', setupFiles.tempLangDefaultsDir,
        '--output', setupFiles.tempLangDefaultsDir,
        '--format', 'language-defaults'
      ],
      {from: 'node'}
    );

    const resultFiles = readResultFiles(setupFiles);

    expect(setupFiles.originalEnTranslationData).to.eql(resultFiles.tempEnTranslationData);
    expect(setupFiles.originalTestTranslationData).to.eql(resultFiles.tempTestTranslationData);
    expect(setupFiles.originalMetaData).to.eql(resultFiles.tempMetaData);

    expect(Object.keys(resultFiles.tempEnTranslationData)).to.have.length(2);
    expect(resultFiles.tempEnTranslationData["@name-test1"]).to.eql("");
    expect(resultFiles.tempEnTranslationData["@name-test3"]).to.eql("Name 3");

    expect(Object.keys(resultFiles.tempTestTranslationData)).to.have.length(2);
    expect(resultFiles.tempTestTranslationData["@name-test2"]).to.eql("abc 123");
    expect(resultFiles.tempTestTranslationData["@name-test4"]).to.eql("qwe 456");

    expect(Object.keys(resultFiles.tempMetaData)).to.have.length(2);
    expect(resultFiles.tempMetaData["@name-test1"]).to.eql({
      "description": "Name for test 1.",
      "category": "naming"
    });
    expect(resultFiles.tempMetaData["@name-test3"]).to.eql({
      "description": "Name for test 3."
    });

  });
});
