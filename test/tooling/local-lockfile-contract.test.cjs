'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
test('root lock resolves the exact Express version required by core', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'packages/redbox-core/package.json'), 'utf8'));
  const resolved = lock.packages['packages/redbox-core/node_modules/express'] ?? lock.packages['node_modules/express'];
  assert.equal(resolved?.version, manifest.dependencies.express);
});

for (const filename of [
  'package-lock.json',
  'packages/redbox-core/package-lock.json',
  'packages/redbox-dev-tools/package-lock.json',
  'packages/redbox-hook-dev/package-lock.json',
  'packages/sails-hook-redbox-storage-mongo/package-lock.json',
  'packages/sails-hook-redbox-pdfgen/package-lock.json',
]) {
  test(`${filename} retains current local package dependency contracts`, () => {
    const lock = JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8'));
    const targets = new Set(
      Object.values(lock.packages)
        .filter(entry => entry.link)
        .map(entry => entry.resolved)
    );
    assert(targets.size > 0, 'selected lockfile must contain local packages');
    for (const target of targets) {
      const manifest = JSON.parse(
        fs.readFileSync(path.resolve(root, path.dirname(filename), target, 'package.json'), 'utf8')
      );
      const snapshot = lock.packages[target];
      assert(snapshot, `missing local package snapshot: ${target}`);
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        assert.deepEqual(snapshot[section] ?? {}, manifest[section] ?? {}, `${target}: stale ${section}`);
      }
    }
  });
}
