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

describe('sync-translation command', async () => {
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

  function buildProgram() {
    const program = new commander.Command();
    program
      .name('redbox-dev-tools')
      .option('--root <path>')
      .option('--core-types-root <path>')
      .option('--angular-root <path>')
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

  function readJsonFile(path: string): unknown {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  }

  it('adds translation keys and meta from API', async () => {
    const program = buildProgram();

    // known paths
    const originalEnTranslationFile = path.resolve(inputOriginalPath, 'en', 'translation.json');
    const originalMetaFile = path.resolve(inputOriginalPath, 'meta.json');
    const originalHttpEntriesFile = path.resolve(inputOriginalPath, 'http-entries.json');
    const originalHttpTranslationFile = path.resolve(inputOriginalPath, 'http-translation.json');

    const targetEnTranslationFile = path.resolve(inputTargetPath, 'en', 'translation.json');
    const targetMetaFile = path.resolve(inputTargetPath, 'meta.json');

    const tempLangDefaultsDir = path.join(tempRoot, 'language-defaults');
    const tempEnDir = path.join(tempLangDefaultsDir, 'en');
    const tempEnTranslationFile = path.join(tempLangDefaultsDir, 'en', 'translation.json');
    const tempMetaFile = path.join(tempLangDefaultsDir, 'meta.json');

    // create temp dir and files
    fs.mkdirSync(tempEnDir, {recursive: true});
    fs.writeFileSync(tempEnTranslationFile, JSON.stringify(readJsonFile(originalEnTranslationFile)), 'utf8');
    fs.writeFileSync(tempMetaFile, JSON.stringify(readJsonFile(originalMetaFile)), 'utf8');

    // stub the fetch api
    setFetchStub([
      {
        // i18n/entries
        body: readJsonFile(originalHttpEntriesFile) as unknown[],
      },
      {
        // locales/en/translation.json
        body: readJsonFile(originalHttpTranslationFile) as Record<string, unknown>,
      },
    ]);

    await program.parseAsync(
      [
        'node', 'redbox-dev-tools',
        'sync-translation',
        '--api-base', 'https://localhost',
        '--language-defaults', tempLangDefaultsDir
      ],
      {from: 'node'}
    );

    const targetTranslation = readJsonFile(targetEnTranslationFile);
    const targetMeta = readJsonFile(targetMetaFile);

    const tempTranslation = readJsonFile(tempEnTranslationFile) as Record<string, unknown>;
    const tempMeta = readJsonFile(tempMetaFile) as Record<string, unknown>;

    expect(targetTranslation).to.eql(tempTranslation);
    expect(targetMeta).to.eql(tempMeta);

    expect(tempTranslation["@name-test1"]).to.eql("Name 1");
    expect(tempTranslation["@name-test2"]).to.eql("Name 2");
    expect(tempTranslation["@name-test3"]).to.eql("Name 3");

    expect(tempMeta["@name-test1"]).to.eql({
      "category": "name",
      "description": "Name for test 1.",
      "contentFormat": "plain"
    });
    expect(tempMeta["@name-test2"]).to.eql({
      "category": "name",
      "description": "Name for test 2.",
      "contentFormat": "plain"
    });
    expect(tempMeta["@name-test3"]).to.eql({
      "description": "Name for test 3."
    });

  });
});
