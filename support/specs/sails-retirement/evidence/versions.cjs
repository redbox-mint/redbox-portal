// Resolve packages from their actual consumers, without executing framework code.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const root = process.cwd();
const contexts = new Map([['root', path.join(root, 'package.json')], ['core', path.join(root, 'packages/redbox-core/package.json')]]);
const probes = [];
function resolvePackage(context, name) {
  const consumer = contexts.get(context);
  try {
    const resolver = createRequire(consumer);
    let entry;
    try { entry = resolver.resolve(`${name}/package.json`); }
    catch { entry = resolver.resolve(name); }
    let directory = path.dirname(entry);
    while (directory !== path.dirname(directory)) {
      const manifest = path.join(directory, 'package.json');
      if (fs.existsSync(manifest)) {
        const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        if (pkg.name === name) {
          const result = { context, name, version: pkg.version, manifest: path.relative(root, manifest), entry: path.relative(root, entry), engines: pkg.engines ?? null };
          if (name === '@uppy/companion') result.requests = { express: pkg.dependencies.express, session: pkg.dependencies['express-session'], socket: pkg.dependencies['socket.io'] };
          probes.push(result);
          return manifest;
        }
      }
      directory = path.dirname(directory);
    }
    throw new Error('Package manifest not found');
  } catch (error) {
    probes.push({ context, name, error: error.code || error.message });
  }
}
for (const context of ['root', 'core']) {
  for (const name of ['sails', '@uppy/companion', 'express', 'typescript', 'ts-node', 'mocha', '@prisma/client', 'prisma']) {
    const manifest = resolvePackage(context, name);
    if (manifest && ['sails', '@uppy/companion'].includes(name)) contexts.set(`${context}/${name}`, manifest);
  }
}
for (const context of [...contexts.keys()].filter(name => name.includes('/'))) {
  for (const name of ['express', 'express-session', 'socket.io', 'path-to-regexp']) resolvePackage(context, name);
}
console.log(JSON.stringify({ sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), node: process.version, npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(), platform: `${process.platform}/${process.arch}`, note: 'Installed tree resolution; different from declared/locked versions if a local install is stale. No application or framework was imported.', probes }, null, 2));
