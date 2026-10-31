'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const e = require('./prepare.cjs');
const { file, fixture, replace, editJson } = require('./fixtures.cjs');
const original = fixture();
const baseline = e.partition(original);
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'backend-copy-boundary-'));

test('audited identities, exact seven installs, all original stages/targets and downstream web paths survive', () => {
  const recipe = original.get('Dockerfile').data;
  assert.equal(e.sha256(recipe), e.DOCKERFILE_SHA256);
  assert.equal(e.sha256(original.get('.dockerignore').data), e.IGNORE_SHA256);
  assert.equal((e.INSTALL_BLOCK.match(/npm (ci|install) /g) || []).length, 7);
  const text = recipe.toString(), candidate = baseline.dockerfile;
  const boundary = 'FROM base AS backend_builder\n\nCOPY . .\n\n';
  assert.ok(candidate.startsWith(text.slice(0, text.indexOf(boundary))));
  assert.equal(candidate.split(e.INSTALL_BLOCK).length, 2);
  const suffix = text.slice(text.indexOf(e.INSTALL_BLOCK) + e.INSTALL_BLOCK.length);
  assert.equal(candidate.slice(candidate.indexOf('\n\nRUN cd packages/agenda-sqs-backend')), suffix);
  assert.match(candidate, /FROM scratch AS backend_dependency_inputs/);
  assert.match(candidate, /FROM backend_dependencies AS backend_builder\n\nCOPY \. \./);
  const stages = value => value.match(/^FROM .*$/gm);
  assert.deepEqual(stages(candidate).filter(s => !/ AS backend_dependenc/.test(s))
    .map(s => s.replace('FROM backend_dependencies AS backend_builder', 'FROM base AS backend_builder')), stages(text));
  assert.ok(candidate.endsWith('# Keep the vanilla (pristine) runtime image as the default build target.\nFROM runtime\n'));
});

test('only package/root install inputs cross the boundary; test/support inputs stay included downstream', () => {
  for (const name of e.ROOT_INPUTS) assert.ok(baseline.inputs.has(name));
  for (const name of baseline.source.keys()) {
    assert.notEqual(baseline.inputs.has(name), baseline.overlay.has(name), name);
    if (name === 'packages' || name.startsWith('packages/')) assert.ok(baseline.inputs.has(name), name);
  }
  assert.ok(baseline.overlay.has('test/fixture.txt'));
  assert.ok(baseline.overlay.has('support/integration-testing/fixture.txt'));
  assert.ok(!baseline.source.has('assets/angular/host-output.js'));
  assert.ok(!baseline.inputs.has('packages/raido/dist/host.js'));
  assert.ok(!baseline.source.has('Dockerfile'));
});

test('backend/Angular/source-only changes affect overlay but not dependency fingerprints', () => {
  for (const name of ['api/source.txt', 'typescript/source.ts', 'angular/source.ts']) {
    const next = e.partition(replace(original, name, 'changed\n'));
    assert.equal(e.fingerprint(next.inputs), e.fingerprint(baseline.inputs), name);
    assert.notEqual(e.fingerprint(next.overlay), e.fingerprint(baseline.overlay), name);
  }
});

test('manifest/lock/config/package source/tarball bytes, additions, removals and modes invalidate dependency inputs', () => {
  for (const name of ['package.json', 'package-lock.json', '.npmrc', '.npmignore',
    'packages/redbox-core/package-lock.json', 'packages/raido/.npmignore', 'packages/raido/source.txt',
    'packages/agenda-patched/agenda-6.2.6-redbox.1.tgz']) {
    const next = e.partition(replace(original, name, Buffer.concat([original.get(name).data, Buffer.from('\n')])));
    assert.notEqual(e.fingerprint(next.inputs), e.fingerprint(baseline.inputs), name);
  }
  const added = replace(original, 'packages/raido/new.txt', 'new source');
  const deleted = new Map(original);
  deleted.delete('packages/raido/source.txt');
  const mode = replace(original, 'packages/redbox-dev-tools/bin/cli.js', original.get('packages/redbox-dev-tools/bin/cli.js').data, 0o755);
  const dirMode = new Map(original);
  dirMode.set('packages/raido/empty', { type: 'directory', mode: 0o700 });
  for (const next of [added, deleted, mode, dirMode]) {
    assert.notEqual(e.fingerprint(e.partition(next).inputs), e.fingerprint(baseline.inputs));
    assert.equal(e.fingerprint(e.partition(next).overlay), e.fingerprint(baseline.overlay));
  }
});

test('pinned ignore semantics cover representative root/nested patterns and retained exceptions', () => {
  const excluded = ['.git/config', '.circleci/config.yml', 'Dockerfile', '.dockerignore', 'root.tgz', 'root.log',
    'root.tsbuildinfo', 'docs/a', 'support/docs/a', 'assets/angular/a', 'packages/a/node_modules/x',
    'packages/a/dist/x', 'nested/.env', 'nested/.env.local', 'nested/.aws/x', 'nested/.ssh/x',
    'nested/.git/x', 'nested/.dev/x', 'nested/.angular/x', 'nested/coverage/x', 'nested/.nyc_output/x',
    'nested/a.key', 'nested/a.pem', 'nested/config/local.js', 'config/local.ts', '.redbox-ci/a',
    'test-results/a', 'playwright-report/a', 'support/build/.test-a/x', 'support/build/nested/.test-a',
    'support/build/.integration-assets-test-a/x'];
  const included = ['packages/agenda-patched/agenda-6.2.5-redbox.1.tgz', 'packages/agenda-patched/agenda-6.2.6-redbox.1.tgz',
    'packages/a/other.tgz', 'nested/root.log', 'nested/root.tsbuildinfo', 'nested/.tmp/a', 'nested/.DS_Store',
    'nested/Thumbs.db', 'nested/docs/a', 'nested/Dockerfile', 'test/a', 'support/integration-testing/a',
    'support/build/nested/.integration-assets-test-a', 'assets/angular-other/a'];
  for (const name of excluded) assert.equal(e.ignored(name), true, name);
  for (const name of included) assert.equal(e.ignored(name), false, name);
});

test('changed recipe/ignore, ambiguous boundaries and Dockerfile-specific overrides fail closed', () => {
  const recipe = original.get('Dockerfile').data.toString();
  for (const next of [replace(original, 'Dockerfile', recipe + '\n'),
    replace(original, 'Dockerfile', recipe.replace('npm ci --no-audit', 'npm ci --ignore-scripts')),
    replace(original, 'Dockerfile', recipe + '\n' + e.INSTALL_BLOCK),
    replace(original, '.dockerignore', original.get('.dockerignore').data + '\n'),
    replace(original, 'Dockerfile.dockerignore', 'packages\n')]) {
    assert.throws(() => e.partition(next), /audited|override|boundary/);
  }
});

test('missing inputs, unsupported npm layouts/specs/config and local source lifecycle hooks are rejected', () => {
  for (const name of [...e.ROOT_INPUTS, 'packages/redbox-core/package-lock.json']) {
    const next = new Map(original); next.delete(name);
    assert.throws(() => e.partition(next), /Missing/);
  }
  for (const next of [replace(original, '.npmrc', 'ignore-scripts=false\n'),
    replace(original, 'packages/raido/.npmrc', 'install-links=true\n'),
    replace(original, 'packages/raido/.npmrc', 'registry=${OTHER_REGISTRY}\n'),
    replace(original, 'packages/raido/.npmrc', 'userconfig=/elsewhere\n'),
    replace(original, 'packages/raido/binding.gyp', '{}'), replace(original, 'npm-shrinkwrap.json', '{}'),
    editJson(original, 'package.json', p => { p.workspaces = ['packages/*']; }),
    editJson(original, 'packages/raido/package.json', p => { p.scripts = { prepare: 'node ../../api/read-source.js' }; }),
    editJson(original, 'packages/redbox-dev-tools/package.json', p => { p.bin = { bad: '/bin/cli.js' }; }),
    editJson(original, 'packages/redbox-dev-tools/package.json', p => { p.bin = { bad: '../raido/empty' }; }),
    editJson(original, 'package.json', p => { p.dependencies = { bad: 'file:../../outside' }; }),
    editJson(original, 'package.json', p => { p.dependencies = { bad: '^1.0.0' }; }),
    editJson(original, 'package-lock.json', p => { p.packages['node_modules/bad'] = { resolved: 'https://unknown.invalid/x.tgz' }; })]) {
    assert.throws(() => e.partition(next), /Unsupported|Missing/);
  }
});

test('working-tree snapshot includes dirty/untracked files and modes, keeps the control and refuses reuse', () => {
  const dir = temp();
  try {
    const root = path.join(dir, 'checkout'), out = path.join(dir, 'run');
    e.writeFiles(root, original);
    fs.writeFileSync(path.join(root, 'api/source.txt'), 'dirty backend');
    fs.writeFileSync(path.join(root, 'packages/raido/untracked.txt'), 'untracked local input');
    fs.chmodSync(path.join(root, 'packages/raido/source.txt'), 0o604);
    const report = e.prepare(root, out);
    assert.equal(report.sourceKind, 'explicit-working-tree');
    assert.equal(report.sourceCommit, undefined);
    assert.equal(fs.readFileSync(path.join(out, 'overlay/api/source.txt'), 'utf8'), 'dirty backend');
    assert.equal(fs.readFileSync(path.join(out, 'inputs/packages/raido/untracked.txt'), 'utf8'), 'untracked local input');
    assert.equal(fs.statSync(path.join(out, 'inputs/packages/raido/source.txt')).mode & 0o777, 0o604);
    assert.equal(fs.statSync(path.join(out, 'inputs/packages/raido/empty')).mode & 0o777, 0o750);
    assert.deepEqual(fs.readFileSync(path.join(out, 'source/Dockerfile')), original.get('Dockerfile').data);
    assert.deepEqual(fs.readFileSync(path.join(out, 'source/.dockerignore')), original.get('.dockerignore').data);
    for (const name of e.ROOT_INPUTS) assert.ok(!fs.existsSync(path.join(out, 'overlay', name)));
    assert.ok(!fs.existsSync(path.join(out, 'overlay/packages')));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'experiment.json'))), report);
    assert.equal(report.inputFingerprint, e.fingerprint(e.readWorkingTree(path.join(out, 'inputs'))));
    assert.throws(() => e.prepare(root, out), /EEXIST/);
    assert.throws(() => e.prepare(root, path.join(root, 'output')), /outside/);
    fs.symlinkSync(root, path.join(dir, 'alias'));
    assert.throws(() => e.prepare(root, path.join(dir, 'alias/output')), /outside/);
    fs.appendFileSync(path.join(root, 'Dockerfile'), '\n');
    assert.throws(() => e.prepare(root, path.join(dir, 'refused')), /audited/);
    assert.ok(!fs.existsSync(path.join(dir, 'refused')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('included symlinks, special files, special modes and unsafe paths fail without producing output', () => {
  const dir = temp();
  try {
    const root = path.join(dir, 'checkout'), out = path.join(dir, 'run');
    e.writeFiles(root, original);
    fs.symlinkSync('source.txt', path.join(root, 'api/link'));
    assert.throws(() => e.prepare(root, out), /symlink/);
    assert.ok(!fs.existsSync(out));
    fs.unlinkSync(path.join(root, 'api/link'));
    execFileSync('mkfifo', [path.join(root, 'api/pipe')]);
    assert.throws(() => e.prepare(root, out), /special input/);
    assert.ok(!fs.existsSync(out));
    fs.unlinkSync(path.join(root, 'api/pipe'));
    fs.chmodSync(path.join(root, 'api/source.txt'), 0o4644);
    assert.throws(() => e.prepare(root, out), /special mode/);
    assert.ok(!fs.existsSync(out));
    const invalid = new Map(original); invalid.set('api/link', { type: 'symlink', mode: 0o777 });
    assert.throws(() => e.partition(invalid), /filesystem/);
    assert.throws(() => e.partition(replace(original, '../escape', 'bad')), /path/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CLI requires explicit working-tree selection and refuses without creating output', () => {
  const dir = temp();
  try {
    const root = path.join(dir, 'checkout'), out = path.join(dir, 'run');
    e.writeFiles(root, original);
    const tool = path.join(__dirname, 'prepare.cjs');
    const absentOptIn = spawnSync(process.execPath, [tool, root, out], { encoding: 'utf8' });
    assert.equal(absentOptIn.status, 1);
    assert.match(absentOptIn.stderr, /Usage/);
    assert.ok(!fs.existsSync(out));
    const valid = spawnSync(process.execPath, [tool, '--working-tree', root, out], { encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).sourceKind, 'explicit-working-tree');
    const reused = spawnSync(process.execPath, [tool, '--working-tree', root, out], { encoding: 'utf8' });
    assert.equal(reused.status, 1);
    assert.match(reused.stderr, /EEXIST/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('write preserves exact file/dir modes despite host umask and fingerprint ignores mtime/order', () => {
  const dir = temp(), mask = process.umask(0o077);
  try {
    const dest = path.join(dir, 'files');
    e.writeFiles(dest, new Map([['empty', { type: 'directory', mode: 0o751 }], ['bin', file('x', 0o754)]]));
    assert.equal(fs.statSync(path.join(dest, 'bin')).mode & 0o777, 0o754);
    assert.equal(fs.statSync(path.join(dest, 'empty')).mode & 0o777, 0o751);
    assert.equal(e.fingerprint(original), e.fingerprint(new Map([...original].reverse())));
    const before = e.fingerprint(e.readWorkingTree(dest));
    fs.utimesSync(path.join(dest, 'bin'), new Date(0), new Date(0));
    assert.equal(e.fingerprint(e.readWorkingTree(dest)), before);
  } finally { process.umask(mask); fs.rmSync(dir, { recursive: true, force: true }); }
});
