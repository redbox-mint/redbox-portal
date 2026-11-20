'use strict';
// Vendor development artifacts are not part of the portal runtime. Keep the
// physical image free of their unused Express examples and Passport adapter,
// rather than exempting their require/type sites from the closure audit.
const fs = require('node:fs');
const path = require('node:path');
const artifacts = new Map([
  ['@fastify/session', { version: '11.1.6', paths: ['benchmark', 'examples', 'types/index.tst.ts'] }],
  ['@fastify/view', { version: '12.0.1', paths: ['benchmark'] }],
  ['express-interceptor', { version: '1.2.0', paths: ['examples', 'test'] }],
  ['light-my-request', { version: '6.8.0', paths: ['test'] }],
  ['openid-client', { version: '6.8.8', paths: ['build/passport.js', 'build/passport.js.map', 'build/passport.d.ts'] }],
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
      for (const relative of policy.paths) {
        const file = path.join(directory, relative);
        if (fs.existsSync(file)) {
          fs.rmSync(file, { recursive: true });
          removed.push({ package: metadata.name, version: metadata.version, file });
        }
      }
      if (metadata.name === 'openid-client' && Object.hasOwn(metadata.exports, './passport')) {
        delete metadata.exports['./passport'];
        metadata.files = metadata.files.filter(file => !policy.paths.includes(file));
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
if (require.main === module) console.log(JSON.stringify({ removed: pruneRuntime(process.cwd()) }, null, 2));
