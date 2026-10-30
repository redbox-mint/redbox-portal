'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const e = require('./prepare.cjs');
const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const original = e.readCommit(repo, e.BASELINE).files;
const baseline = e.partition(original);
const replace = (files, name, data, mode = '100644') => {
  const copy = new Map(files);
  copy.set(name, { mode, data: Buffer.from(data) });
  return copy;
};
const editJson = (name, edit) => {
  const value = JSON.parse(original.get(name).data);
  edit(value);
  return replace(original, name, JSON.stringify(value));
};

test('keeps toolchain, seven install commands and complete downstream Dockerfile byte-for-byte', () => {
  const text = original.get('Dockerfile').data.toString();
  const installs = text.slice(text.indexOf('RUN npm ci --no-audit'), text.indexOf('\n\nRUN cd packages/agenda-sqs-backend'));
  assert.equal((installs.match(/npm (ci|install) /g) || []).length, 7);
  assert.ok(baseline.dockerfile.includes(installs));
  assert.equal(baseline.dockerfile.split('FROM base AS backend_dependencies')[0], text.split('FROM base AS builder')[0]);
  const rest = '\n\nRUN cd packages/agenda-sqs-backend';
  assert.equal(baseline.dockerfile.slice(baseline.dockerfile.indexOf(rest)), text.slice(text.indexOf(rest)));
  assert.match(baseline.dockerfile, /FROM backend_dependencies AS builder\n\nCOPY \. \./);
});

test('backend and Angular source edits reuse dependency inputs but change the source overlay', () => {
  for (const file of ['api/backend-deps-experiment.cjs', 'typescript/backend-deps-experiment.ts', 'angular/backend-deps-experiment.ts']) {
    const changed = e.partition(replace(original, file, '// source change'));
    assert.equal(e.fingerprint(changed.inputs), e.fingerprint(baseline.inputs));
    assert.notEqual(e.fingerprint(changed.overlay), e.fingerprint(baseline.overlay));
  }
});

test('manifests, locks, complete local source, nested npm config, packing config, tarball and modes invalidate inputs', () => {
  for (const name of ['package.json', 'package-lock.json', '.npmrc',
    'packages/redbox-core/package-lock.json', 'packages/redbox-core/src/cache-input-probe.ts',
    'packages/sails-ng-common/.npmrc', 'packages/raido/.npmignore',
    'packages/agenda-patched/agenda-6.2.6-redbox.1.tgz']) {
    const before = original.get(name)?.data || Buffer.alloc(0);
    const data = name.endsWith('.json') ? Buffer.concat([before, Buffer.from('\n')])
      : name.endsWith('.npmrc') ? Buffer.concat([before, Buffer.from('\n# cache input test\n')])
        : Buffer.concat([before, Buffer.from('changed')]);
    const changed = e.partition(replace(original, name, data));
    assert.notEqual(e.fingerprint(changed.inputs), e.fingerprint(baseline.inputs), name);
  }
  const name = 'packages/redbox-dev-tools/bin/cli.js';
  const file = original.get(name);
  const changed = e.partition(replace(original, name, file.data, file.mode === '100755' ? '100644' : '100755'));
  assert.notEqual(e.fingerprint(changed.inputs), e.fingerprint(baseline.inputs));
});

test('overlay cannot undo npm lock changes, local bin chmods or local-package install outputs', () => {
  for (const name of baseline.inputs.keys()) assert.ok(!baseline.overlay.has(name), name);
  for (const name of ['package-lock.json', 'packages/redbox-core/package-lock.json',
    'packages/redbox-dev-tools/bin/cli.js', '.npmrc']) assert.ok(baseline.inputs.has(name), name);
  assert.ok(!baseline.source.has('packages/raido/dist/index.js'));
  assert.ok(!baseline.source.has('test/integration/services/RecordsService.test.ts'));
  assert.ok(baseline.inputs.has('packages/agenda-patched/agenda-6.2.6-redbox.1.tgz'));
});

test('fails closed for unsupported dependency inputs and configuration', () => {
  const cases = [
    replace(original, 'Dockerfile', 'FROM scratch'),
    replace(original, '.dockerignore', ''),
    replace(original, 'Dockerfile.dockerignore', 'packages/\n'),
    replace(original, '.npmrc', 'ignore-scripts=false\n'),
    replace(original, '.npmrc', 'registry=https://registry.npmjs.org/\n'),
    replace(original, 'packages/redbox-core/.npmrc', 'install-links=true\n'),
    replace(original, 'packages/sails-ng-common/.npmrc', 'registry=${CUSTOM_REGISTRY}\n'),
    replace(original, 'packages/sails-ng-common/.npmrc', 'userconfig=/secret\n'),
    replace(original, 'npm-shrinkwrap.json', '{}'),
    replace(original, 'packages/redbox-core/binding.gyp', '{}'),
    editJson('package.json', p => { p.workspaces = ['packages/*']; }),
    editJson('package.json', p => { p.scripts.prepare = 'node api/source-dependent.js'; }),
    editJson('packages/redbox-core/package.json', p => { p.scripts.postinstall = 'echo changed'; }),
    editJson('package.json', p => { p.dependencies.bad = 'file:../../outside'; }),
    editJson('package.json', p => { p.dependencies.bad = 'file:/packages/redbox-core'; }),
    editJson('package.json', p => { p.dependencies.bad = 'file:packages/missing'; }),
    editJson('package.json', p => { p.dependencies.bad = '^1.0.0'; }),
    ...['1.2.3-alpha.tgz', '1.2.3+alpha.tar.gz', '1.2.3-alpha.tar-gz'].map(spec => editJson('package.json', p => { p.dependencies.bad = spec; })),
    ...['1.2.3-alpha..beta', '1.2.3-alpha_beta', '9007199254740992.0.0', '1.2.3-01', `1.2.3-${'a'.repeat(251)}`].flatMap(spec => [
      editJson('package.json', p => { p.dependencies.bad = spec; }),
      editJson('package.json', p => { p.overrides.bad = spec; }),
    ]),
    editJson('package.json', p => { p.peerDependencies = { bad: '/api/outside.tgz' }; }),
    ...['.', '..', '...', '.alpha', '~', '-', '1.2.3-alpha.tar', '1.2.3-alpha.tgz', '1.2.3+alpha.tar.gz', '1.2.3-alpha.tar-gz', '1.2.3+alpha.tarXgz', 'x-alpha', '1.2.3-.', '1.0.0-alpha..beta', '>>1.2.3', '^^1.2.3', '9007199254740992.0.0', '~>1.2.3', ''].map(spec => editJson('package.json', p => { p.peerDependencies = { bad: spec }; })),
    editJson('package.json', p => { p.peerDependencies = { bad: 'git+https://github.com/example/pkg.git#main' }; }),
    editJson('package.json', p => { p.dependencies.bad = 'npm:typescript@5.9.3'; }),
    editJson('package.json', p => { p.overrides.bad = 'github:owner/repo#main'; }),
    editJson('package-lock.json', p => { p.lockfileVersion = 2; }),
    editJson('package-lock.json', p => { p.packages['node_modules/bad'] = { link: true, resolved: '../../outside' }; }),
    editJson('package-lock.json', p => { p.packages['node_modules/bad'] = { resolved: 'https://unknown.invalid/x.tgz' }; }),
    editJson('package-lock.json', p => { p.packages['node_modules/bad'] = { dependencies: { bad: 'file:../../outside' } }; }),
    editJson('package-lock.json', p => { p.packages['node_modules/bad'] = { dependencies: { bad: '/opt/redbox-portal/api/outside.tgz' } }; }),
    editJson('package-lock.json', p => { p.packages['node_modules/bad'] = { optionalDependencies: { bad: '1.2.3-alpha.tgz' } }; }),
    editJson('package-lock.json', p => { p.packages[''] .peerDependencies = { bad: 'file:packages/redbox-core' }; }),
    editJson('package-lock.json', p => { p.packages['node_modules/bad'] = { peerDependencies: { bad: '/api/outside.tgz' } }; }),
    ...['.', '..', '...', '.alpha', '1.2.3-alpha.tar', '1.2.3-alpha.tgz', '1.2.3+alpha.tar.gz'].map(spec => editJson('package-lock.json', p => { p.packages['node_modules/bad'] = { peerDependencies: { bad: spec } }; })),
    editJson('package-lock.json', p => { p.packages['node_modules/bad'] = { peerDependencies: { bad: 'github:example/pkg#main' } }; }),
  ];
  for (const files of cases) assert.throws(() => e.partition(files), /Unsupported|baseline|Missing/);
  const missing = new Map(original);
  missing.delete('packages/agenda-patched/agenda-6.2.6-redbox.1.tgz');
  assert.throws(() => e.partition(missing), /Missing local tarball/);
});

test('accepts audited baseline peer ranges', () => {
  for (const spec of ['^5.0.0-beta.5 || >=5.0.0', '^3 || ^4']) {
    const files = editJson('package.json', p => { p.peerDependencies = { example: spec }; });
    assert.doesNotThrow(() => e.partition(files));
  }
});

test('accepts exact prerelease and build versions at supported boundaries', () => {
  for (const spec of ['1.2.3-alpha.1+build.7', `1.2.3-${'a'.repeat(250)}`,
    '9007199254740991.0.0', '0.9007199254740991.0', '0.0.9007199254740991']) {
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'overrides']) {
      assert.doesNotThrow(() => e.partition(editJson('package.json', p => { p[field] ||= {}; p[field].example = spec; })), `${field}: ${spec}`);
    }
  }
  for (const spec of [`1.2.3-${'a'.repeat(251)}`, '9007199254740992.0.0',
    '0.9007199254740992.0', '0.0.9007199254740992']) {
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'overrides']) {
      assert.throws(() => e.partition(editJson('package.json', p => { p[field] ||= {}; p[field].example = spec; })), /Unsupported/, `${field}: ${spec}`);
    }
  }
});

test('materializes only the requested commit, records exact provenance, refuses output reuse', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-deps-unit-'));
  try {
    const out = path.join(temp, 'snapshot');
    const report = e.prepare(repo, e.BASELINE, out);
    assert.equal(report.sourceCommit, e.BASELINE);
    assert.equal(report.inputFingerprint, e.fingerprint(baseline.inputs));
    assert.deepEqual(fs.readFileSync(path.join(out, 'source/package.json')), original.get('package.json').data);
    assert.deepEqual(fs.readFileSync(path.join(out, 'source/Dockerfile')), original.get('Dockerfile').data);
    assert.equal(fs.statSync(path.join(out, 'inputs/packages/agenda-patched/rebuild.sh')).mode & 0o777, 0o755);
    assert.throws(() => e.prepare(repo, e.BASELINE, out), /EEXIST/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'experiment.json'))), report);
    assert.ok(!fs.existsSync(path.join(out, 'overlay/package-lock.json')));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
