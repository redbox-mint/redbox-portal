const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const loadTs = require('../support/load-ts.cjs');
const packageRoot = fs.existsSync(path.resolve(__dirname, '..', '..', 'package.json'))
  ? path.resolve(__dirname, '..', '..')
  : path.resolve(__dirname, '..', '..', '..');
const sourceCliPath = path.join(packageRoot, 'src', 'cli.ts');
const tsNodeRegisterPath = path.join(packageRoot, 'node_modules', 'ts-node', 'register');
const hookArchetypeModule = loadTs(module, '../../src/templates/hook-archetype');

describe('hook dependency contract commands', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-contract-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function buildChildEnv() {
    const childEnv = { ...process.env };

    // nyc injects subprocess coverage hooks via NODE_OPTIONS and NYC_* env vars.
    // These command tests intentionally execute child CLIs that may exit non-zero,
    // and we only want to assert on those child statuses inside the test itself.
    // Stripping the coverage wrapper env keeps those expected child exits from
    // being reinterpreted as a parent process failure by nyc in CI.
    delete childEnv.NODE_OPTIONS;
    delete childEnv.NYC_CONFIG;
    delete childEnv.NYC_CWD;
    delete childEnv.NYC_PROCESS_ID;
    delete childEnv.NYC_PROCESSINFO_EXTERNAL_ID;
    delete childEnv.NYC_CONFIG_OVERRIDE;

    childEnv.TS_NODE_PROJECT = path.join(packageRoot, 'test', 'tsconfig.json');
    return childEnv;
  }

  function runCli(args: string[], cwd: string) {
    return childProcess.spawnSync('node', ['-r', tsNodeRegisterPath, sourceCliPath, ...args], {
      cwd,
      encoding: 'utf8',
      env: buildChildEnv(),
    });
  }

  it('renders a valid package.json when archetype descriptions contain quotes and newlines', () => {
    const hookRoot = path.join(tempRoot, 'generated-hook');
    fs.mkdirSync(hookRoot, { recursive: true });

    const description = 'A "quoted" hook description\nwith a second line';
    hookArchetypeModule.generateHookArchetype({
      cwd: hookRoot,
      packageName: 'redbox-hook-example',
      description,
      templateName: 'standard',
    });

    const generatedPackageJson = JSON.parse(fs.readFileSync(path.join(hookRoot, 'package.json'), 'utf8'));
    expect(generatedPackageJson.description).to.equal(description);
    expect(generatedPackageJson.name).to.equal('redbox-hook-example');
  });

  it('flags disallowed shared packages in check output', () => {
    fs.writeFileSync(
      path.join(tempRoot, 'package.json'),
      JSON.stringify({
        name: 'redbox-hook-check-fixture',
        version: '1.0.0',
        dependencies: {
          '@researchdatabox/sails-ng-common': '^1.0.0',
          '@researchdatabox/redbox-extra': '^1.0.0',
        },
        peerDependencies: {
          '@researchdatabox/redbox-dev-tools': '^4.5.1',
        },
      }, null, 2)
    );

    const result = runCli(['check'], tempRoot);

    expect(result.status).to.equal(1);
    expect(result.stderr).to.contain('dependencies.@researchdatabox/sails-ng-common');
    expect(result.stderr).to.contain('dependencies.@researchdatabox/redbox-extra');
    expect(result.stderr).to.contain('peerDependencies.@researchdatabox/redbox-dev-tools');
  });

  it('removes disallowed shared packages during migrate-hook-dependencies', () => {
    fs.writeFileSync(
      path.join(tempRoot, 'package.json'),
      JSON.stringify({
        name: 'redbox-hook-migrate-fixture',
        version: '1.0.0',
        dependencies: {
          '@researchdatabox/sails-ng-common': '^1.0.0',
          '@researchdatabox/redbox-extra': '^1.0.0',
          axios: '^1.0.0',
        },
        peerDependencies: {
          '@researchdatabox/redbox-dev-tools': '^4.5.1',
        },
      }, null, 2)
    );

    const result = runCli(['migrate-hook-dependencies'], tempRoot);
    const migratedPackageJson = JSON.parse(fs.readFileSync(path.join(tempRoot, 'package.json'), 'utf8'));

    expect(result.status).to.equal(0);
    expect(migratedPackageJson.dependencies).to.deep.equal({});
    expect(migratedPackageJson.peerDependencies['@researchdatabox/redbox-core']).to.equal('*');
    expect(migratedPackageJson.peerDependencies['@researchdatabox/redbox-dev-tools']).to.equal(undefined);
    expect(migratedPackageJson.devDependencies['@researchdatabox/redbox-dev-tools']).to.equal('*');
  });
});
