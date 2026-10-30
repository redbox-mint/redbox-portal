// Isolated contract tests: no registry, browser, Codecov upload or real install.
// Run with: node --test support/build/angular-performance.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-angular-performance-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  function write(name, text, executable = false) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, { mode: executable ? 0o755 : 0o644 });
  }
  for (const file of ['support/build/compileProductionAngular.sh', 'support/build/angular-dependencies.cjs', 'support/unit-testing/angular/testAngular.sh']) {
    write(file, fs.readFileSync(path.join(root, file)));
  }
  const projects = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'angular/angular.json'))).projects)
    .map(name => name.replace('@researchdatabox/', ''));
  for (const project of projects) fs.mkdirSync(path.join(dir, 'angular/projects/researchdatabox', project), { recursive: true });
  write('angular/package.json', JSON.stringify({ dependencies: { local: 'file:../packages/local' } }));
  write('angular/package-lock.json', '{}');
  write('angular/.nvmrc', '24.22.1\n');
  write('packages/local/package.json', '{"version":"1.0.0"}');
  write('home/.nvm/nvm.sh', 'nvm() { return "${NVM_FAIL:-0}"; }\n');
  write('bin/sudo', '#!/bin/bash\nexec "$@"\n', true);
  write('bin/git', '#!/bin/bash\nprintf "%s\\n" "$FIXTURE"\n', true);
  write('bin/npm', `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('10.9.8'); process.exit(0); }
if (args[0] === 'config') { console.log(JSON.stringify({'install-links': process.env.npm_config_install_links === 'true', omit: process.env.npm_config_omit || '', config: fs.existsSync('.npmrc') ? fs.readFileSync('.npmrc', 'utf8') : ''})); process.exit(0); }
fs.appendFileSync(process.env.EVENTS, JSON.stringify(['npm', ...args])+'\\n');
if (process.env.INSTALL_FAIL) process.exit(Number(process.env.INSTALL_FAIL));
if (args[0] === 'ci') fs.rmSync('node_modules', {recursive:true, force:true});
for (const pkg of ['esbuild', '@angular/build', 'rollup', 'ng-packagr', 'ng-packagr/node_modules/esbuild']) {
  const dir = path.join('node_modules', pkg);
  fs.mkdirSync(dir, {recursive:true});
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name:pkg, main:'index.js'}));
  fs.writeFileSync(path.join(dir, 'index.js'), path.basename(pkg) === 'esbuild' ? "let failed=false; exports.transformSync = () => { if(failed) throw Error('service no longer running'); try { return require('fs').readFileSync(__dirname+'/native-ready'); } catch(e) { failed=true; throw e; } };" : '');
}
fs.writeFileSync('node_modules/esbuild/native-ready', 'native');
fs.writeFileSync('node_modules/ng-packagr/node_modules/esbuild/native-ready', 'native');
fs.mkdirSync('node_modules/.bin', {recursive:true});
fs.copyFileSync(path.join(process.env.FIXTURE, 'bin/ng'), 'node_modules/.bin/ng');
fs.chmodSync('node_modules/.bin/ng', 0o755);
if (!fs.existsSync('node_modules/local')) fs.symlinkSync('../../packages/local', 'node_modules/local');
fs.writeFileSync('node_modules/.package-lock.json', JSON.stringify({packages:{'node_modules/esbuild':{}, 'node_modules/@angular/build':{}, 'node_modules/rollup':{}, 'node_modules/ng-packagr':{}, 'node_modules/ng-packagr/node_modules/esbuild':{}, 'node_modules/local':{link:true}}}));
`, true);
  write('bin/ng', `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.EVENTS, JSON.stringify(['ng', ...args])+'\\n');
if (process.env.NG_FAIL && args.includes('@researchdatabox/'+process.env.FAIL_APP)) process.exit(Number(process.env.NG_FAIL));
if (args[0] === 't') {
 const app = args.find(arg => arg.startsWith('@researchdatabox/')).split('/')[1];
 const dir = 'projects/researchdatabox/'+app+'/coverage';
 fs.mkdirSync(dir, {recursive:true});
 fs.writeFileSync(dir+'/coverage-final.json', '{}');
}
`, true);
  write('support/unit-testing/codecov/prepare-report.cjs', `require('fs').appendFileSync(process.env.EVENTS, JSON.stringify(['prepare', ...process.argv.slice(2)])+'\\n'); process.exit(Number(process.env.PREPARE_FAIL || 0));`);
  write('events', '');
  function run(command, extra = {}) {
    return spawnSync('bash', ['-c', `
function /tmp/.codecov-cli/codecov() {
  node -e 'require("fs").appendFileSync(process.env.EVENTS, JSON.stringify(["codecov", ...process.argv.slice(1)])+"\\n")' -- "$@"
  return "\${UPLOAD_FAIL:-0}"
}
${command}`], {
      cwd: dir, encoding: 'utf8', env: { ...process.env,
        HOME: path.join(dir, 'home'), PATH: path.join(dir, 'bin') + ':' + process.env.PATH,
        FIXTURE: dir, EVENTS: path.join(dir, 'events'), CI: 'true',
        CODECOV_TOKEN: 'test-token', CIRCLE_BUILD_NUM: '123', CIRCLE_BRANCH: 'test', ...extra }
    });
  }
  return { dir, write, run, projects, events: () => fs.readFileSync(path.join(dir, 'events'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) };
}
function succeeds(result) { assert.equal(result.status, 0, result.stdout + result.stderr); }
const common = 'source support/build/compileProductionAngular.sh portal-ng-common';
const custom = 'source support/build/compileProductionAngular.sh portal-ng-form-custom';
const dashboard = 'source support/unit-testing/angular/testAngular.sh dashboard';

test('CI source chain installs once, builds both libraries, preserves cwd and every report option', t => {
  const f = fixture(t);
  succeeds(f.run(`${common} && test "$PWD" = "$FIXTURE/angular" && cd .. && ${custom} && cd .. && ${dashboard} && test "$PWD" = "$FIXTURE/angular" && echo caller-continued`));
  const events = f.events();
  assert.deepEqual(events.filter(e => e[0] === 'npm'), [['npm', 'ci', '--ignore-scripts', '--strict-peer-deps', '--no-audit']]);
  assert.deepEqual(events.filter(e => e[0] === 'ng'), [
    ['ng', 'b', '@researchdatabox/portal-ng-common', '--configuration', 'production'],
    ['ng', 'b', '@researchdatabox/portal-ng-form-custom', '--configuration', 'production'],
    ['ng', 't', '--browsers=ChromeHeadlessNoSandbox', '@researchdatabox/dashboard', '--no-watch', '--no-progress', '--code-coverage']
  ]);
  assert.deepEqual(events.find(e => e[0] === 'prepare'), ['prepare', './projects/researchdatabox/dashboard/coverage/coverage-final.json', 'angular']);
  const upload = events.find(e => e[0] === 'codecov');
  assert.equal(upload[upload.indexOf('--network-root-folder') + 1], f.dir);
  for (const option of ['--fail-on-error', '--disable-search', 'frontend-dashboard', 'job-123-test', './projects/researchdatabox/dashboard/coverage/coverage-final.json']) assert.ok(upload.includes(option), option);
  assert.ok(fs.existsSync(path.join(f.dir, 'home/project/.tmp/junit/frontend-dashboard')));
});

test('separate CircleCI steps reuse dependencies across chmod -R 777', t => {
  const f = fixture(t);
  f.write('home/.nvm/nvm.sh', `nvm() {
    node -e 'require("fs").appendFileSync(process.env.EVENTS, JSON.stringify(["nvm", process.argv[1], process.cwd(), process.env.NVM_DIR])+"\\n")' "$1"
  }\n`);
  f.write('install-state.cjs', `
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const installed = JSON.parse(fs.readFileSync('node_modules/.package-lock.json'));
const stats = Object.keys(installed.packages).sort().map(name => {
  const stat = fs.statSync(path.join(name, 'package.json'), { bigint: true });
  return [fs.realpathSync(name), String(stat.ino), String(stat.size), String(stat.mtimeNs)];
});
const stat = fs.statSync('node_modules/esbuild/package.json', { bigint: true });
fs.writeFileSync(process.argv[2], JSON.stringify({
  shell: process.argv[3], cwd: process.cwd(), nvm: process.env.NVM_DIR,
  node: [process.version, process.versions.modules, process.platform, process.arch, process.execPath],
  environment: [process.env.CI, process.env.npm_config_fetch_timeout, process.env.npm_config_loglevel],
  config: digest(JSON.parse(execFileSync('npm', ['config', 'list', '--json', '--ignore-scripts', '--strict-peer-deps', '--no-audit'], { encoding: 'utf8' }))),
  installed: digest(stats), mode: Number(stat.mode) & 0o777, ctime: String(stat.ctimeNs),
  receipt: JSON.parse(fs.readFileSync('node_modules/.redbox-angular-install.json'))
}));
`);
  const environment = { npm_config_fetch_timeout: '60000', npm_config_loglevel: 'http' };
  const snapshot = name => `node "$FIXTURE/install-state.cjs" "$FIXTURE/${name}.json" "$$"`;
  const builds = f.run(`${common} && cd .. && ${custom} && ${snapshot('before')}`, environment);
  succeeds(builds);
  // Each CircleCI run step starts a fresh shell in the project root. Its setup
  // step chmods the entire checkout, including installed package manifests.
  succeeds(f.run('sudo mkdir -p .tmp/attachments/staging && sudo chmod -R 777 .', environment));
  const tests = f.run(`chmod +x support/unit-testing/angular/testAngular.sh && ${dashboard} && ${snapshot('after')}`, environment);
  succeeds(tests);
  const before = JSON.parse(fs.readFileSync(path.join(f.dir, 'before.json')));
  const after = JSON.parse(fs.readFileSync(path.join(f.dir, 'after.json')));
  assert.notEqual(before.shell, after.shell);
  assert.notEqual(before.mode, 0o777);
  assert.equal(after.mode, 0o777);
  assert.notEqual(before.ctime, after.ctime);
  for (const key of ['cwd', 'nvm', 'node', 'environment', 'config', 'installed', 'receipt']) {
    assert.deepEqual(after[key], before[key], key);
  }
  assert.equal(after.cwd, path.join(f.dir, 'angular'));
  assert.equal(after.nvm, path.join(f.dir, 'home/.nvm'));
  assert.deepEqual(after.environment, ['true', '60000', 'http']);
  assert.deepEqual(f.events().filter(e => e[0] === 'nvm'),
    ['install', 'use', 'install', 'use', 'install', 'use'].map(command => ['nvm', command, after.cwd, after.nvm]));
  assert.equal(builds.stdout.split('Reusing verified Angular dependencies').length - 1, 1);
  assert.equal(tests.stdout.split('Reusing verified Angular dependencies').length - 1, 1);
  assert.deepEqual(f.events().filter(e => e[0] === 'npm'), [['npm', 'ci', '--ignore-scripts', '--strict-peer-deps', '--no-audit']]);
});

test('standalone tests retain npm install; a subsequent production call requires npm ci', t => {
  const f = fixture(t);
  succeeds(f.run(`${dashboard} && cd .. && ${common}`));
  assert.deepEqual(f.events().filter(e => e[0] === 'npm').map(e => e[1]), ['install', 'ci']);
});

test('copied local packages retain standalone installs instead of reusing stale content', t => {
  const f = fixture(t);
  succeeds(f.run(`${common} && cd .. && ${custom}`, { npm_config_install_links: 'true' }));
  assert.equal(f.events().filter(e => e[0] === 'npm').length, 2);
});

test('complete build and test discovery retains both prerequisites, every app and coverage flags', t => {
  const f = fixture(t);
  succeeds(f.run('source support/build/compileProductionAngular.sh && cd .. && source support/unit-testing/angular/testAngular.sh'));
  const builds = f.events().filter(e => e[0] === 'ng' && e[1] === 'b').map(e => e[2].split('/')[1]);
  assert.deepEqual(builds.slice(0, 2), ['portal-ng-common', 'portal-ng-form-custom']);
  assert.deepEqual([...builds].sort(), [...f.projects].sort());
  const tested = f.events().filter(e => e[0] === 'ng' && e[1] === 't').map(e => e.find(v => v.startsWith('@researchdatabox/')).split('/')[1]);
  assert.deepEqual([...tested].sort(), f.projects.filter(p => p !== 'portal-ng-form-custom').sort());
  const flags = f.events().filter(e => e[0] === 'codecov').map(e => e[e.indexOf('--flag') + 1]);
  assert.deepEqual([...flags].sort(), tested.map(p => p === 'portal-ng-common' ? 'frontend-core-lib' : 'frontend-' + p).sort());
});

test('changed install inputs or damaged native dependencies reinstall; source edits do not', t => {
  const f = fixture(t);
  succeeds(f.run(common));
  f.write('angular/projects/researchdatabox/dashboard/source.ts', 'changed source');
  succeeds(f.run(common));
  assert.equal(f.events().filter(e => e[0] === 'npm').length, 1);
  for (const [name, text] of [
    ['angular/package-lock.json', '{"changed":true}'],
    ['angular/package.json', '{"dependencies":{"local":"file:../packages/local"},"version":"2"}'],
    ['angular/.npmrc', 'install-links=true'],
    ['angular/.nvmrc', '26.8.1'],
    ['packages/local/package.json', '{"version":"2.0.0"}'],
    ['support/build/angular-dependencies.cjs', fs.readFileSync(path.join(root, 'support/build/angular-dependencies.cjs'), 'utf8') + '\n// changed helper\n'],
    ['angular/node_modules/.package-lock.json', '{"packages":{}}']
  ]) {
    const before = f.events().filter(e => e[0] === 'npm').length;
    f.write(name, text);
    succeeds(f.run(common));
    assert.equal(f.events().filter(e => e[0] === 'npm').length, before + 1, name);
  }
  for (const name of ['esbuild/native-ready', 'ng-packagr/node_modules/esbuild/native-ready', '@angular/build/package.json', 'local']) {
    const before = f.events().filter(e => e[0] === 'npm').length;
    fs.rmSync(path.join(f.dir, 'angular/node_modules', name), { force: true });
    succeeds(f.run(common));
    assert.equal(f.events().filter(e => e[0] === 'npm').length, before + 1, name);
  }
  const beforeReplacement = f.events().filter(e => e[0] === 'npm').length;
  f.write('angular/node_modules/.bin/ng', '#!/bin/bash\nexit 73\n', true);
  succeeds(f.run(common));
  assert.equal(f.events().filter(e => e[0] === 'npm').length, beforeReplacement + 1);
  const before = f.events().filter(e => e[0] === 'npm').length;
  succeeds(f.run(common, { npm_config_omit: 'optional' }));
  assert.equal(f.events().filter(e => e[0] === 'npm').length, before + 1);
});

test('failures propagate when sourced in an && chain, without later builds or uploads', t => {
  for (const [extra, status, forbidden] of [
    [{ INSTALL_FAIL: '17' }, 17, 'ng'],
    [{ NVM_FAIL: '19' }, 19, 'npm'],
    [{ NG_FAIL: '23', FAIL_APP: 'portal-ng-common' }, 23, 'codecov']
  ]) {
    const f = fixture(t);
    const result = f.run(`${common} && cd .. && ${custom} && echo should-not-run`, extra);
    assert.equal(result.status, status, result.stdout + result.stderr);
    assert.ok(!result.stdout.includes('should-not-run'));
    assert.ok(!f.events().some(e => e[0] === forbidden));
    assert.ok(!f.events().some(e => e.includes('@researchdatabox/portal-ng-form-custom')));
  }
  const f = fixture(t);
  const result = f.run('source support/build/compileProductionAngular.sh && echo should-not-run', { NG_FAIL: '41', FAIL_APP: 'portal-ng-form-custom' });
  assert.equal(result.status, 41, result.stdout + result.stderr);
  assert.equal(f.events().filter(e => e[0] === 'ng').length, 2);
  for (const [extra, status, forbidden] of [
    [{ NG_FAIL: '29', FAIL_APP: 'dashboard' }, 29, 'prepare'],
    [{ PREPARE_FAIL: '31' }, 31, 'codecov'],
    [{ UPLOAD_FAIL: '37' }, 37, 'never']
  ]) {
    const f = fixture(t);
    const result = f.run(`${dashboard} && echo should-not-run`, extra);
    assert.equal(result.status, status, result.stdout + result.stderr);
    assert.ok(!result.stdout.includes('should-not-run'));
    assert.ok(!f.events().some(e => e[0] === forbidden));
  }
});
