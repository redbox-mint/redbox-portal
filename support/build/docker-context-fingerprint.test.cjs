const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { inventory, fingerprint } = require('./docker-context-fingerprint.cjs');

function fixture(callback) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'docker-context-'));
  const write = (name, value = 'content') => {
    fs.mkdirSync(join(dir, name, '..'), { recursive: true });
    fs.writeFileSync(join(dir, name), value);
  };
  try { callback(dir, write); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('context excludes Git, transient CI outputs and nested dependency/build directories, with tarball exceptions', () => fixture((dir, write) => {
  write('.dockerignore', fs.readFileSync(join(__dirname, '../../.dockerignore')));
  for (const file of ['.git/HEAD', '.tmp/quota', '.circleci/config.yml', 'node_modules/a',
    'packages/a/node_modules/b', 'packages/a/dist/a.js', 'angular/.angular/cache/a',
    'no.tgz', 'build.log', 'test/result']) write(file);
  const tarball = 'packages/agenda-patched/agenda-6.2.6-redbox.1.tgz';
  write(tarball); write('api/service.ts');
  const files = inventory(dir).filter(row => row[1] === 'file').map(row => row[0]);
  assert.deepEqual(files, ['.dockerignore', 'api/service.ts', tarball]);
}));

test('ordered Docker patterns are root relative, support **, parent exclusions and negation', () => fixture((dir, write) => {
  write('.dockerignore', '# comment\n/root/\n*.log\n**/cache\nexclude\n!exclude/keep.txt\n[a-c]?.tmp\n');
  for (const file of ['root/a', 'a.log', 'nested/a.log', 'cache/a', 'nested/cache/a', 'exclude/keep.txt', 'exclude/drop.txt', 'ab.tmp']) write(file);
  assert.deepEqual(inventory(dir).filter(row => row[1] === 'file').map(row => row[0]),
    ['.dockerignore', 'exclude/keep.txt', 'nested/a.log']);
}));

test('fingerprint is stable across mtimes/ignored files, but detects content, modes, links, and empty directories', () => fixture((dir, write) => {
  write('.dockerignore', '.git\n.tmp\n'); write('source.ts');
  const first = fingerprint(dir);
  fs.utimesSync(join(dir, 'source.ts'), new Date(), new Date());
  write('.git/HEAD', 'different commit'); write('.tmp/metrics', 'different run');
  assert.equal(fingerprint(dir), first);
  write('source.ts', 'backend change'); assert.notEqual(fingerprint(dir), first);
  write('source.ts'); fs.chmodSync(join(dir, 'source.ts'), 0o755);
  assert.notEqual(fingerprint(dir), first); fs.chmodSync(join(dir, 'source.ts'), 0o644);
  fs.symlinkSync('source.ts', join(dir, 'link')); const linked = fingerprint(dir);
  fs.unlinkSync(join(dir, 'link')); fs.symlinkSync('other.ts', join(dir, 'link'));
  assert.notEqual(fingerprint(dir), linked);
  const beforeDir = fingerprint(dir); fs.mkdirSync(join(dir, 'empty'));
  assert.notEqual(fingerprint(dir), beforeDir);
  assert.throws(() => fingerprint(dir, join(dir, 'output')), /outside/);
}));
