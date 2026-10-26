const { expect } = require('chai');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..');
const cliPath = path.join(packageRoot, 'src', 'cli.ts');
const tsNodeRegister = require.resolve('ts-node/register');
const tsNodeProject = path.join(packageRoot, 'tsconfig.json');

// Runs the real CLI entry in a subprocess so the commander dependency is
// exercised through the same CommonJS require path the published bin uses.
// dist/ is not built during tests, so the TS source is run via ts-node.
function runCli(args: string[], cwd = packageRoot) {
  return spawnSync(process.execPath, ['--require', tsNodeRegister, cliPath, ...args], {
    cwd,
    encoding: 'utf8' as const,
    env: {
      ...process.env,
      TS_NODE_PROJECT: tsNodeProject,
      TS_NODE_TRANSPILE_ONLY: 'true',
    },
  });
}

describe('cli smoke test', function () {
  this.timeout(60000);
  let tempRoot: string | undefined;

  afterEach(() => {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('compiles a converted hook through the shared base without a hoisted tsconfig package', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-isolated-config-'));
    fs.mkdirSync(path.join(tempRoot, 'src'));
    fs.writeFileSync(path.join(tempRoot, 'src/index.ts'), 'export const supportedMajor: number = 26;\n');
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({name:'redbox-hook-config-proof',type:'commonjs'}));
    const packageLink = path.join(tempRoot,'node_modules/@researchdatabox/redbox-dev-tools');
    fs.mkdirSync(path.dirname(packageLink),{recursive:true});
    fs.symlinkSync(packageRoot,packageLink,'dir');
    const fixtureRequire = require('node:module').createRequire(path.join(tempRoot,'package.json'));
    expect(() => fixtureRequire.resolve('@tsconfig/node24/tsconfig.json')).to.throw();
    const config = {extends:'@tsconfig/node24/tsconfig.json',compilerOptions:{outDir:'dist',types:[]},include:['src/**/*.ts']};
    const file = path.join(tempRoot,'tsconfig.json');
    const compile = () => spawnSync(process.execPath,
      ['--require',tsNodeRegister,path.join(packageRoot,'src/bin/run-hook-tsc.ts'),'-p','tsconfig.json'],
      {cwd:tempRoot,encoding:'utf8',env:{...process.env,TS_NODE_PROJECT:tsNodeProject,TS_NODE_TRANSPILE_ONLY:'true'}});
    fs.writeFileSync(file,JSON.stringify(config));
    const legacy = compile();
    expect(legacy.status).to.not.equal(0);
    expect(legacy.stdout+legacy.stderr).to.contain("@tsconfig/node24/tsconfig.json");
    config.extends = '@researchdatabox/redbox-dev-tools/config/tsconfig.base.json';
    fs.writeFileSync(file,JSON.stringify(config));
    const converted = compile();
    expect(converted.status).to.equal(0,converted.stdout+converted.stderr);
    expect(fs.existsSync(path.join(tempRoot,'dist/index.js'))).to.equal(true);
  });

  it('generates the initial v6 extension through the public init command', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-v6-init-'));
    const result = runCli(['init', 'demo-client', '--template', 'v6'], tempRoot);
    expect(result.status).to.equal(0, result.stderr);
    const pkg = JSON.parse(fs.readFileSync(path.join(tempRoot, 'package.json'), 'utf8'));
    expect(pkg.redbox.extension).to.equal('.');
    expect(pkg.sails).to.equal(undefined);
    expect(result.stdout).to.contain('matching v6 core');
    expect(result.stdout).to.contain('README.md');
    expect(result.stdout).to.contain('npm run build');
    const checked = runCli(['check'], tempRoot);
    expect(checked.status).to.equal(0, checked.stderr);
    expect(runCli(['migrate-hook-dependencies'], tempRoot).status).to.equal(0);
    const migrated = JSON.parse(fs.readFileSync(path.join(tempRoot, 'package.json'), 'utf8'));
    expect(migrated.devDependencies.typescript).to.equal(pkg.devDependencies.typescript);
    expect(runCli(['check'], tempRoot).status).to.equal(0);
  });

  it('should print help for the full command tree and exit 0', () => {
    const result = runCli(['--help']);
    expect(result.status).to.equal(0, result.stderr);
    expect(result.stdout).to.contain('Usage: redbox-dev-tools');
    expect(result.stdout).to.contain('migrate-form-config');
    expect(result.stdout).to.contain('generate|g');
  });

  it('should print the package version', () => {
    const result = runCli(['--version']);
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));

    expect(result.status).to.equal(0, result.stderr);
    expect(result.stdout.trim()).to.equal(pkg.version);
  });

  it('should dispatch to a subcommand action', () => {
    const result = runCli(['completion', 'bash']);
    expect(result.status).to.equal(0, result.stderr);
    expect(result.stdout).to.contain('complete -F _redbox_dev_tools_completion redbox-dev-tools');
  });

  it('should reject an unknown command with a non-zero exit code', () => {
    const result = runCli(['not-a-real-command']);
    expect(result.status).to.not.equal(0);
    expect(result.stderr).to.contain('unknown command');
  });

  it('should allow the generated hook dependency contract', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-dev-tools-cli-'));
    fs.writeFileSync(
      path.join(tempRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'redbox-hook-demo',
          peerDependencies: {
            '@researchdatabox/redbox-core': '4.5.1',
          },
          devDependencies: {
            '@researchdatabox/redbox-core': '4.5.1',
            '@researchdatabox/redbox-dev-tools': '4.5.1',
          },
          dependencies: {},
        },
        null,
        2
      )
    );

    const result = runCli(['check'], tempRoot);
    expect(result.status).to.equal(0, result.stderr);
    expect(result.stdout).to.contain('Hook dependency contract looks good');
  });
  it('pins historical ranges when migrating shared hook dependencies', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-pins-'));
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
      name: 'redbox-hook-demo',
      peerDependencies: { '@researchdatabox/redbox-core': '*' },
      devDependencies: { '@researchdatabox/redbox-core': '^4.5.1', '@researchdatabox/redbox-dev-tools': '~4.5.1' },
    }));
    const result = runCli(['migrate-hook-dependencies'], tempRoot);
    expect(result.status).to.equal(0, result.stderr);
    const migrated = JSON.parse(fs.readFileSync(path.join(tempRoot, 'package.json'), 'utf8'));
    expect(migrated.peerDependencies['@researchdatabox/redbox-core']).to.equal(require('@researchdatabox/redbox-core/package.json').version);
    expect(migrated.devDependencies['@researchdatabox/redbox-core']).to.equal(require('@researchdatabox/redbox-core/package.json').version);
    expect(migrated.devDependencies['@researchdatabox/redbox-dev-tools']).to.equal(require('../package.json').version);
    expect(runCli(['check'], tempRoot).status).to.equal(0);
  });

  it('rejects nonexact custom dependency versions in the hook check', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-range-'));
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
      name: 'redbox-hook-demo', dependencies: { 'example-hook-dependency': '^1.2.3' },
    }));
    const result = runCli(['check'], tempRoot);
    expect(result.status).to.equal(1);
    expect(result.stderr).to.contain('exact version required');
  });

  it('refuses a dependency-clean legacy hook when checking a v6 conversion', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-v6-metadata-'));
    const file = path.join(tempRoot, 'package.json');
    const pkg: any = { name: 'redbox-hook-institution', sails: { isHook: true, hasServices: true } };
    fs.writeFileSync(file, JSON.stringify(pkg));
    expect(runCli(['check'], tempRoot).status).to.equal(0);
    let result = runCli(['check', '--v6'], tempRoot);
    expect(result.status).to.equal(1);
    expect(result.stderr).to.contain('sails: remove legacy hook discovery metadata');
    expect(result.stderr).to.contain('redbox.extension');
    delete pkg.sails;
    pkg.redbox = { extension: './extension' };
    fs.writeFileSync(file, JSON.stringify(pkg));
    result = runCli(['check', '--v6'], tempRoot);
    expect(result.status).to.equal(1);
    expect(result.stderr).to.contain('exports: expose');
    pkg.exports = { './extension': { default: './dist/index.js' } };
    fs.writeFileSync(file, JSON.stringify(pkg));
    expect(runCli(['check', '--v6'], tempRoot).status).to.equal(0);
    pkg.sails = { isHook: true };
    fs.writeFileSync(file, JSON.stringify(pkg));
    expect(runCli(['check'], tempRoot).status).to.equal(1);
  });

  it('checks runtime export targets, including Node root export shorthand', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-v6-exports-'));
    fs.mkdirSync(path.join(tempRoot, 'dist'));
    for (const file of ['index.js', 'index.cjs'])
      fs.writeFileSync(path.join(tempRoot, 'dist', file), 'exports.registerRedboxExtension = () => ({apiVersion: 1});');
    fs.writeFileSync(path.join(tempRoot, 'dist/index.mjs'), 'export const registerRedboxExtension = () => ({apiVersion: 1});');
    fs.writeFileSync(path.join(tempRoot, 'dist/index.d.ts'), 'export declare function registerRedboxExtension(): unknown;');
    for (const [exports, accepted] of [
      [{'.': null}, false],
      [{'.': {types: './dist/index.d.ts'}}, false],
      [{'.': './dist/index.d.ts'}, false],
      [{'.': '../outside.js'}, false],
      [{'.': {default: null, node: './dist/index.js'}}, false],
      [{'.': {node: null, default: './dist/index.js'}}, false],
      [{'.': ['./dist/index.d.ts', './dist/index.js']}, false],
      [{'.': './dist/index.js', default: './dist/index.js'}, false],
      ['./dist/index.js', true],
      [{'.': {custom: null, default: './dist/index.js'}}, true],
      [{'.': [null, '../outside.js', './dist/index.js']}, true],
      [{node: {require: './dist/index.cjs'}, types: './dist/index.d.ts'}, false],
      [{node: {import: './dist/index.cjs'}, types: './dist/index.d.ts'}, true],
      [{'.': {import: './dist/index.mjs', require: './dist/index.cjs'}}, true],
    ]) {
      fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
        name: 'redbox-hook-exports', redbox: {extension: '.'}, exports,
      }));
      const result = runCli(['check', '--v6'], tempRoot);
      expect(result.status).to.equal(accepted ? 0 : 1, JSON.stringify(exports) + result.stderr);
      const loaded = spawnSync(process.execPath, ['-e',
        "import('redbox-hook-exports').then(m => {if (typeof m.registerRedboxExtension !== 'function') process.exit(2)}).catch(() => process.exit(1))"],
        {cwd:tempRoot, encoding:'utf8'});
      expect(loaded.status === 0).to.equal(accepted, JSON.stringify(exports) + loaded.stderr);
    }
  });

  it('rejects retired globals and the old functions include in hook EJS before runtime', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-v6-views-'));
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
      name: 'redbox-hook-views', redbox: {extension: '.'}, exports: {'.': './dist/index.js'},
    }));
    const views = path.join(tempRoot, 'views/default/default');
    fs.mkdirSync(views, {recursive: true});
    fs.writeFileSync(path.join(views, 'homepage.ejs'), '<h1>Home</h1>\n<%= TranslationService.t("welcome") %>\n<%= BrandingService.getBrandAndPortalPath(req) %>');
    fs.writeFileSync(path.join(views, 'login.ejs'), '<% include("../../../functions") %>');
    fs.writeFileSync(path.join(views, 'edit.ejs'), '<%= CacheService.getNgAppFileHash("form", "main") %>');
    fs.writeFileSync(path.join(views, 'legacy.ejs'), '<%= sails.config.appUrl %>');
    const result = runCli(['check', '--v6'], tempRoot);
    expect(result.status).to.equal(1, result.stdout + result.stderr);
    for (const expected of ['homepage.ejs:2', 'TranslationService', 'BrandingService', 'login.ejs:1', 'functions', 'CacheService', 'sails'])
      expect(result.stderr).to.contain(expected);
    // Neutral metadata also enables the conversion checks without the flag.
    expect(runCli(['check'], tempRoot).status).to.equal(1);
  });

  it('allows current page locals, installed partials and inert mentions of retired APIs', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-v6-current-views-'));
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
      name: 'redbox-hook-views', redbox: {extension: '.'}, exports: {'.': './dist/index.js'},
    }));
    const views = path.join(tempRoot, 'views/default/default');
    fs.mkdirSync(views, {recursive: true});
    fs.writeFileSync(path.join(views, 'homepage.ejs'), [
      'TranslationService is retired. <script>const BrandingService = "browser only";</script>',
      '<%# TranslationService.t("comment"); include("../../../functions"); %>',
      '<%%= TranslationService.t("escaped EJS") %>',
      '<% const label = "TranslationService.t"; /* BrandingService.getRootContext() */ %>',
      '<%= page.t("welcome") %><a href="<%= page.base %>">Home</a>',
      '<%- include("layout/menu.ejs") %><%- superPartial("/layout/logo.ejs") %>',
    ].join('\n'));
    const result = runCli(['check', '--v6'], tempRoot);
    expect(result.status).to.equal(0, result.stderr);
  });

  it('rejects retired framework dependencies even with a neutral manifest and runtime export', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-v6-framework-deps-'));
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
      name:'redbox-hook-framework', redbox:{extension:'.'}, exports:{'.':'./dist/index.js'},
      dependencies:{'sails':'1.5.17'}, optionalDependencies:{'@other/sails-hook-example':'1.0.0'},
      peerDependencies:{'waterline':'0.15.2'},
    }));
    const result = runCli(['check', '--v6'], tempRoot);
    expect(result.status).to.equal(1, result.stdout+result.stderr);
    for (const entry of ['dependencies.sails', 'optionalDependencies.@other/sails-hook-example', 'peerDependencies.waterline'])
      expect(result.stderr).to.contain(entry);
  });

});
