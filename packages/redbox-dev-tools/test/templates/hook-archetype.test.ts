const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const loadTs = require('../support/load-ts.cjs');

const packageRoot = fs.existsSync(path.resolve(__dirname, '..', '..', 'package.json'))
  ? path.resolve(__dirname, '..', '..')
  : path.resolve(__dirname, '..', '..', '..');
const testRoot = path.join(packageRoot, 'test');

describe('generateHookArchetype version resolution', () => {
  let tempRoot: string;
  let outputRoot: string;
  let modulePath: string;
  let siblingCoreRoot: string;

  beforeEach(() => {
    const tempParent = path.join(testRoot, '.tmp');
    fs.mkdirSync(tempParent, { recursive: true });

    tempRoot = fs.mkdtempSync(path.join(tempParent, 'hook-archetype-'));
    outputRoot = path.join(tempRoot, 'output');
    modulePath = path.join(tempRoot, 'src', 'templates', 'hook-archetype.ts');
    siblingCoreRoot = path.join(path.dirname(tempRoot), 'redbox-core');

    fs.mkdirSync(path.dirname(modulePath), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'templates', 'hook-archetype', 'standard'), { recursive: true });
    fs.copyFileSync(path.join(packageRoot, 'src', 'templates', 'hook-archetype.ts'), modulePath);
    fs.writeFileSync(
      path.join(tempRoot, 'templates', 'hook-archetype', 'standard', 'package.json.hbs'),
      '{\n  "redboxCoreVersion": {{json redboxCoreVersion}},\n  "redboxDevToolsVersion": {{json redboxDevToolsVersion}}\n}\n'
    );
  });

  afterEach(() => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch {
      // Ignore cache misses for cases where module loading failed.
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(siblingCoreRoot, { recursive: true, force: true });
  });

  function writePackageJson(packageJson: unknown) {
    fs.writeFileSync(path.join(tempRoot, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  }

  function loadHookArchetypeModule() {
    return loadTs(module, modulePath);
  }

  function readGeneratedPackageJson() {
    return JSON.parse(fs.readFileSync(path.join(outputRoot, 'package.json'), 'utf8')) as {
      redboxCoreVersion: string;
      redboxDevToolsVersion: string;
    };
  }

  it('uses published package metadata when sibling packages are not present', () => {
    writePackageJson({
      name: '@researchdatabox/redbox-dev-tools',
      version: '1.2.3',
      dependencies: {
        '@researchdatabox/redbox-core': '4.5.6',
      },
    });

    const hookArchetypeModule = loadHookArchetypeModule();
    hookArchetypeModule.generateHookArchetype({ cwd: outputRoot, packageName: 'pdfgen' });

    expect(readGeneratedPackageJson()).to.deep.equal({
      redboxCoreVersion: '4.5.6',
      redboxDevToolsVersion: '1.2.3',
    });
  });

  it('prefers sibling package versions over local file dependency specifiers', () => {
    writePackageJson({
      name: '@researchdatabox/redbox-dev-tools',
      version: '1.2.3',
      dependencies: {
        '@researchdatabox/redbox-core': 'file:../redbox-core',
      },
    });

    fs.mkdirSync(siblingCoreRoot, { recursive: true });
    fs.writeFileSync(
      path.join(siblingCoreRoot, 'package.json'),
      JSON.stringify({ name: '@researchdatabox/redbox-core', version: '9.8.7' }, null, 2)
    );

    const hookArchetypeModule = loadHookArchetypeModule();
    hookArchetypeModule.generateHookArchetype({ cwd: outputRoot, packageName: 'pdfgen' });

    expect(readGeneratedPackageJson()).to.deep.equal({
      redboxCoreVersion: '9.8.7',
      redboxDevToolsVersion: '1.2.3',
    });
  });
});