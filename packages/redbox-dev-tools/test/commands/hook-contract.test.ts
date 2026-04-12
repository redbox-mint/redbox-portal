let expect: typeof import('chai').expect;
let fs: typeof import('fs');
let os: typeof import('os');
let path: typeof import('path');
let childProcess: typeof import('child_process');
let hookArchetypeModule: typeof import('../../src/templates/hook-archetype');

describe('hook dependency contract commands', () => {
  let tempRoot: string;

  before(async () => {
    ({ expect } = await import('chai'));
    fs = require('fs');
    os = require('os');
    path = require('path');
    childProcess = require('child_process');
    hookArchetypeModule = require('../../src/templates/hook-archetype');
  });

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-contract-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function runCli(args: string[], cwd: string) {
    const packageRoot = path.resolve(__dirname, '..', '..');
    const cliPath = path.join(packageRoot, 'src', 'cli.ts');
    const tsNodeRegisterPath = path.join(packageRoot, 'node_modules', 'ts-node', 'register');
    return childProcess.spawnSync('node', ['-r', tsNodeRegisterPath, cliPath, ...args], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        TS_NODE_PROJECT: path.join(packageRoot, 'test', 'tsconfig.json'),
      },
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