'use strict';
// Strip the pinned vendor examples, tests, and authoring artifacts from the
// installed image. The builder and published packages keep the full dependencies.
const fs = require('node:fs');
const path = require('node:path');
const artifacts = new Map([
  ['@fastify/session', { version: '11.1.6', paths: ['benchmark', 'examples', 'types/index.tst.ts'] }],
  ['@fastify/view', { version: '12.0.1', paths: ['benchmark'] }],
  ['express-interceptor', { version: '1.2.0', paths: ['examples', 'test'] }],
  ['light-my-request', { version: '6.8.0', paths: ['test'] }],
  ['openid-client', { version: '6.8.8', paths: ['build/passport.js', 'build/passport.js.map', 'build/passport.d.ts'] }],
  ['@prisma/orm-toolchain', { version: '8.0.0-rc.19', dependencies: ['prettier'], optionalPeers: ['vite'] }],
  ['c12', { version: '3.3.4', optionalPeers: ['magicast'] }],
  [
    'language-data-commons-vocabs',
    {
      version: '1.0.1',
      dependencies: ['mocha', 'chai'],
      paths: ['lib/langs.spec.js', 'lib/profiles.spec.js', 'lib/vocab.spec.js'],
    },
  ],
]);
function pruneRuntime(root) {
  const visited = new Set(),
    removed = [];
  function installed(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory)) {
      if (entry.startsWith('.')) continue;
      const file = path.join(directory, entry);
      if (entry.startsWith('@')) installed(file);
      else pkg(file);
    }
  }
  function pkg(directory) {
    directory = fs.realpathSync(directory);
    if (visited.has(directory)) return;
    visited.add(directory);
    const manifest = path.join(directory, 'package.json');
    if (!fs.existsSync(manifest)) return;
    const metadata = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const policy = artifacts.get(metadata.name);
    if (policy) {
      if (metadata.version !== policy.version)
        throw new Error('Review runtime artifacts for ' + metadata.name + '@' + metadata.version);
      for (const relative of policy.paths ?? []) {
        const file = path.join(directory, relative);
        if (fs.lstatSync(file, { throwIfNoEntry: false })) {
          fs.rmSync(file, { recursive: true });
          removed.push({ package: metadata.name, version: metadata.version, file });
        }
      }
      if (metadata.name === 'openid-client' && Object.hasOwn(metadata.exports, './passport')) {
        delete metadata.exports['./passport'];
        metadata.files = metadata.files.filter(file => !policy.paths.includes(file));
        fs.writeFileSync(manifest, JSON.stringify(metadata, null, 2) + '\n');
      }
      if (policy.dependencies || policy.optionalPeers) {
        for (const name of policy.dependencies ?? []) delete metadata.dependencies[name];
        for (const name of policy.optionalPeers ?? []) {
          delete metadata.peerDependencies[name];
          delete metadata.peerDependenciesMeta[name];
        }
        fs.writeFileSync(manifest, JSON.stringify(metadata, null, 2) + '\n');
      }
    }
    installed(path.join(directory, 'node_modules'));
  }
  installed(path.join(root, 'node_modules'));
  const packages = path.join(root, 'packages');
  if (fs.existsSync(packages))
    for (const entry of fs.readdirSync(packages)) installed(path.join(packages, entry, 'node_modules'));
  return removed;
}
module.exports = { pruneRuntime };

async function main() {
  const { auditRuntimeDependencies, pruneDevelopmentDependencies } = require('./runtime-dependencies.cjs');
  const root = process.cwd();
  const pruning = await pruneDevelopmentDependencies(root, pruneRuntime);
  const result = await auditRuntimeDependencies(root);
  console.log(JSON.stringify({ ...pruning, ...result }, null, 2));
  if (result.violations.length) process.exitCode = 1;
}

if (require.main === module) main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
