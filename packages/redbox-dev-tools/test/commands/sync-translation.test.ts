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

  /**
   * Read the file at filepath as JSON.
   * Returns undefined if the file does not exist.
   * Throws any file reading or JSON parsing error.
   * @param filepath The path to the file.
   */
  function readJsonFile(filepath: string): unknown | undefined {
    let content: string;
    try {
      content = fs.readFileSync(filepath, {encoding: 'utf8'}) ?? '';
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        // If the error indicates the path does not exist, return undefined.
        return undefined;
      }
      // Re-throw any other error
      throw err;
    }

    return JSON.parse(content);
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
    const temp01LangDefaultsDir = path.join(tempRoot, '01-language-defaults');
    const temp01EnDir = path.join(temp01LangDefaultsDir, 'en');
    const temp01EnTranslationFile = path.join(temp01EnDir, 'translation.json');
    const temp01TestDir = path.join(temp01LangDefaultsDir, 'test');
    const temp01TestTranslationFile = path.join(temp01TestDir, 'translation.json');
    const temp01MetaFile = path.join(temp01LangDefaultsDir, 'meta.json');

    const temp02LangDefaultsDir = path.join(tempRoot, '02-language-defaults');
    const temp02EnDir = path.join(temp02LangDefaultsDir, 'en');
    const temp02EnTranslationFile = path.join(temp02EnDir, 'translation.json');
    const temp02TestDir = path.join(temp02LangDefaultsDir, 'test');
    const temp02TestTranslationFile = path.join(temp02TestDir, 'translation.json');
    const temp02MetaFile = path.join(temp02LangDefaultsDir, 'meta.json');

    const tempLangDefaultsResultDir = path.join(tempRoot, 'language-defaults');
    const tempEnResultDir = path.join(tempLangDefaultsResultDir, 'en');
    const tempEnTranslationResultFile = path.join(tempEnResultDir, 'translation.json');
    const tempTestResultDir = path.join(tempLangDefaultsResultDir, 'test');
    const tempTestTranslationResultFile = path.join(tempTestResultDir, 'translation.json');
    const tempMetaResultFile = path.join(tempLangDefaultsResultDir, 'meta.json');

    // create temp dirs and files

    // input 1
    fs.mkdirSync(temp01EnDir, {recursive: true});
    fs.writeFileSync(temp01EnTranslationFile, JSON.stringify(input01EnTranslationData), 'utf8');
    fs.mkdirSync(temp01TestDir, {recursive: true});
    fs.writeFileSync(temp01TestTranslationFile, JSON.stringify(input01TestTranslationData), 'utf8');
    fs.writeFileSync(temp01MetaFile, JSON.stringify(input01MetaData), 'utf8');

    // input 2
    fs.mkdirSync(temp02EnDir, {recursive: true});
    fs.writeFileSync(temp02EnTranslationFile, JSON.stringify(input02EnTranslationData), 'utf8');
    fs.mkdirSync(temp02TestDir, {recursive: true});
    fs.writeFileSync(temp02TestTranslationFile, JSON.stringify(input02TestTranslationData), 'utf8');
    fs.writeFileSync(temp02MetaFile, JSON.stringify(input02MetaData), 'utf8');

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
      temp01LangDefaultsDir,
      temp01EnDir,
      temp01EnTranslationFile,
      temp01TestDir,
      temp01TestTranslationFile,
      temp01MetaFile,
      temp02LangDefaultsDir,
      temp02EnDir,
      temp02EnTranslationFile,
      temp02TestDir,
      temp02TestTranslationFile,
      temp02MetaFile,
      tempLangDefaultsResultDir,
      tempEnResultDir,
      tempEnTranslationResultFile,
      tempTestResultDir,
      tempTestTranslationResultFile,
      tempMetaResultFile,
    }
  }

  function readResultFiles(opts: {
    temp01EnTranslationFile: string,
    temp01TestTranslationFile: string,
    temp01MetaFile: string,
    temp02EnTranslationFile: string,
    temp02TestTranslationFile: string,
    temp02MetaFile: string,
    tempEnTranslationResultFile: string,
    tempTestTranslationResultFile: string,
    tempMetaResultFile: string,
  }) {
    return {
      temp01EnTranslationData: readJsonFile(opts.temp01EnTranslationFile),
      temp01TestTranslationData: readJsonFile(opts.temp01TestTranslationFile),
      temp01MetaData: readJsonFile(opts.temp01MetaFile),
      temp02EnTranslationData: readJsonFile(opts.temp02EnTranslationFile),
      temp02TestTranslationData: readJsonFile(opts.temp02TestTranslationFile),
      temp02MetaData: readJsonFile(opts.temp02MetaFile),
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
      '--language-defaults', setupFiles.temp01LangDefaultsDir,
      '--language-defaults', setupFiles.temp02LangDefaultsDir,
      '--api-base', 'https://localhost',
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
    expect(undefined).to.deep.eql(resultFiles.tempEnTranslationResultData);
    expect(undefined).to.deep.eql(resultFiles.tempTestTranslationResultData);
    expect(undefined).to.deep.eql(resultFiles.tempMetaResultData);

    // no changes to temp input files
    expect(setupFiles.input01EnTranslationData).to.deep.eql(resultFiles.temp01EnTranslationData);
    expect(setupFiles.input01TestTranslationData).to.deep.eql(resultFiles.temp01TestTranslationData);
    expect(setupFiles.input01MetaData).to.deep.eql(resultFiles.temp01MetaData);
    expect(setupFiles.input02EnTranslationData).to.deep.eql(resultFiles.temp02EnTranslationData);
    expect(setupFiles.input02TestTranslationData).to.deep.eql(resultFiles.temp02TestTranslationData);
    expect(setupFiles.input02MetaData).to.deep.eql(resultFiles.temp02MetaData);
  });

  it('should follow precedence order with later items overwriting earlier items', async () => {
    const program = buildProgram();
    const setupFiles = setupTestData();
    setFetchStub([
      // Set "@name-test3" value and meta, to be overwritten by input-01 en
      {
        // http://localhost/1/i18n/entries
        body: [
          {
            "locale": "en",
            "key": "@name-test1",
            "category": "api-base-1",
          },
          {
            "locale": "en",
            "key": "@name-test2",
            "category": "name",
            "description": "Name for test 2.",
            "contentFormat": "plain"
          },
          {
            "locale": "en",
            "key": "@name-test3",
            "category": "api-base-3",
          },
        ],
      },
      {
        // http://localhost/1/locales/en/translation.json
        body: {
          "@name-test1": "api-base-1 <a href='https://localhost'>localhost</a>",
          "@name-test2": "Name 2",
          "@name-test3": "api-base-3",
        },
      },
      // overwrite @name-test6 value and meta from input-02 en
      {
        // http://localhost/2/i18n/entries
        body: [
          {
            "locale": "en",
            "key": "@name-test6",
            "category": "api-base-6",
          },
        ],
      },
      {
        // http://localhost/2/locales/en/translation.json
        body: {
          "@name-test6": "api-base-6",
        },
      },
    ]);

    await program.parseAsync(
      ['node',
        'redbox-dev-tools',
        'sync-translation',
        '--api-base', 'https://localhost/1',
        '--language-defaults', setupFiles.temp01LangDefaultsDir,
        '--language-defaults', setupFiles.temp02LangDefaultsDir,
        '--api-base', 'https://localhost/2',
        '--output', setupFiles.tempLangDefaultsResultDir,
      ],
      {from: 'node'}
    );

    const resultFiles = readResultFiles(setupFiles);

    expect(resultFiles.tempEnTranslationResultData).to.deep.eql({
      "@name-test1": "api-base-1 <a href='https://localhost'>localhost</a>",
      "@name-test2": "Name 2",
      "@name-test3": "Name 3",
      "@name-test4": "",
      "@name-test5": "Name 5",
      "@name-test6": "api-base-6"
    });
    expect(resultFiles.tempTestTranslationResultData).to.deep.eql({
      "@name-test1": "",
      "@name-test2": "abc 123",
      "@name-test3": "",
      "@name-test4": "qwe 456",
      "@name-test5": "",
      "@name-test6": "Name 6",
    });
    expect(resultFiles.tempMetaResultData).to.deep.eql({
        "@name-test1": {
          "category": "naming",
          "contentFormat": "html",
          "description": "Name for test 1."
        },
        "@name-test2": {
          "category": "name",
          "description": "Name for test 2.",
          "contentFormat": "plain"
        },
        "@name-test3": {
          "category": "api-base-3",
          "description": "Name for test 3."
        },
        "@name-test4": {
          "category": "name",
          "description": "Translation for @name-test4"
        },
        "@name-test5": {
          "category": "name",
          "description": "Translation for @name-test5"
        },
        "@name-test6": {
          "category": "api-base-6",
          "description": "Name for test 6."
        }
      }
    );
  });
});
