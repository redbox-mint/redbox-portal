'use strict';

const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');

const buildTool =
  /^(?:@angular(?:-devkit)?\/(?:build(?:-angular|-webpack)?|cli|compiler-cli)|@oxlint\/[^/]+|@playwright\/[^/]+|@rolldown\/[^/]+|@vitest\/[^/]+|@researchdatabox\/redbox-dev-tools|redbox-dev-tools|_?mocha|chai|vite|vitest|rolldown|lightningcss(?:-.+)?|magicast|oxlint(?:-tsgolint)?|prettier|playwright(?:-core)?|karma(?:-.+)?|webpack-dev-server|nyc)$/;

function readLock(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  if (lock.lockfileVersion !== 3 || !lock.packages?.['']) throw new Error('Expected a v3 portal lockfile');
  return lock.packages;
}

// Use the resolver shipped with the pinned npm toolchain, including its
// version, alias, git and contextual override rules.
function npmRequire() {
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    const cli = path.join(directory, 'npm');
    if (fs.existsSync(cli)) {
      const manifest = path.join(path.dirname(fs.realpathSync(cli)), '..', 'package.json');
      if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).name === 'npm')
        return createRequire(path.resolve(manifest));
    }
  }
  throw new Error('Cannot locate the installed npm toolchain');
}

function matches(edge, parse) {
  if (!edge.to || edge.peerLocal) return false;
  // Local link specs are relative to the linked package. Arborist can
  // interpret a repo-relative file spec at the root when an inherited
  // override only changes descendants of the dependency.
  const from = edge.spec === edge.rawSpec ? edge.from.realpath : edge.from.root.realpath;
  const request = parse.resolve(edge.name, edge.spec, from);
  if (request.type === 'directory')
    return edge.to.isLink && edge.to.realpath === request.fetchSpec;
  return edge.valid;
}

async function productionPaths(root, packages) {
  const load = npmRequire();
  const Arborist = load('@npmcli/arborist');
  const parse = load('npm-package-arg');
  const actual = await new Arborist({ path: root, forceActual: true }).loadActual();
  const reachable = new Set();
  const optionalProduction = new Set();
  const pending = [{ node: actual, optional: false }];

  while (pending.length) {
    const { node, optional } = pending.pop();
    const key = node.location;
    const record = packages[key];
    if (!record || record.dev || packages[node.target.location]?.dev ||
        (optional ? optionalProduction : reachable).has(key)) continue;
    reachable.add(key);
    if (optional) optionalProduction.add(key);
    if (node.isLink) {
      pending.push({ node: node.target, optional });
      continue;
    }
    for (const edge of node.edgesOut.values())
      if (!edge.dev && matches(edge, parse))
        pending.push({ node: edge.to, optional: optional || edge.optional });
  }
  return { reachable, optionalProduction };
}

async function installedDevelopmentPaths(root, packages) {
  const { optionalProduction } = await productionPaths(root, packages);
  return new Map(
    Object.entries(packages).flatMap(([key, record]) => {
      if (record.dev || (record.link && packages[record.resolved]?.dev)) return [[key, 'dev']];
      if (record.devOptional && !optionalProduction.has(key)) return [[key, 'devOptional']];
      return [];
    })
  );
}

function lockPath(root, key) {
  if (!key || path.isAbsolute(key) || key.split('/').includes('..')) throw new Error(`Unsafe lock path: ${key}`);
  return path.join(root, key);
}

async function auditRuntimeDependencies(root, applicationRoot = root) {
  root = fs.realpathSync(root);
  applicationRoot = fs.realpathSync(applicationRoot);
  const development = await installedDevelopmentPaths(applicationRoot, readLock(applicationRoot));
  const visited = new Set();
  const locations = new Map();
  const violations = [];
  const modulePath = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/@.][^/]*)$/;
  const binPath = /(?:^|\/)node_modules\/\.bin\/([^/]+)$/;

  function inspect(file, physical, name) {
    if (locations.has(file)) return;
    const manifest = path.join(physical, 'package.json');
    const pkg = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')) : {};
    locations.set(file, { file, name: pkg.name ?? name, version: pkg.version });
    const keys = new Set([path.relative(applicationRoot, file), path.relative(applicationRoot, physical)]);
    for (const key of keys) {
      const flag = development.get(key);
      if (flag) violations.push({ file, name: pkg.name ?? name, version: pkg.version, lockPath: key, reason: flag });
    }
    if (buildTool.test(name) || buildTool.test(pkg.name ?? ''))
      violations.push({ file, name: pkg.name ?? name, version: pkg.version, reason: 'build/test tooling' });
  }

  function walk(file, entry) {
    const bin = binPath.exec(file)?.[1];
    if (bin && buildTool.test(bin)) violations.push({ file, name: bin, reason: 'build/test CLI' });
    if (!entry.isDirectory() && !entry.isSymbolicLink()) return;
    const name = modulePath.exec(file)?.[1];
    const localPackage = /^packages\/[^/]+$/.test(path.relative(applicationRoot, file));
    const physical = fs.existsSync(file) ? fs.realpathSync(file) : file;
    if (root !== '/' && physical !== root && !physical.startsWith(root + path.sep)) return;
    if (name || localPackage) inspect(file, physical, name ?? path.basename(file));
    if (!fs.existsSync(physical) || !fs.statSync(physical).isDirectory() || visited.has(physical)) return;
    if (root === '/' && ['/proc', '/sys', '/dev'].includes(physical)) return;
    visited.add(physical);
    for (const child of fs.readdirSync(physical, { withFileTypes: true })) walk(path.join(physical, child.name), child);
  }

  walk(root, fs.statSync(root));
  // Check the lexical lock paths as well. The filesystem walk visits the
  // physical children of each directory once, even if multiple links reach it.
  for (const [key] of development) {
    const file = lockPath(applicationRoot, key);
    if (fs.lstatSync(file, { throwIfNoEntry: false })) inspect(file, file, path.basename(file));
  }
  return { inspectedLocations: locations.size, violations };
}

function removePaths(root, keys) {
  const removed = [];
  for (const key of keys) {
    const target = lockPath(root, key);
    if (!fs.lstatSync(target, { throwIfNoEntry: false })) continue;
    // Remove children with their parent. A directory link is removed without following it.
    fs.rmSync(target, { recursive: true });
    removed.push(key);
  }
  return removed;
}

function removeDanglingBins(root) {
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      if (entry.isSymbolicLink() && path.basename(directory) === '.bin' && !fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  walk(root);
}

async function pruneDevelopmentDependencies(root, pruneVendorArtifacts) {
  const packages = readLock(root);
  const development = removePaths(root, (await installedDevelopmentPaths(root, packages)).keys());
  const vendorArtifacts = pruneVendorArtifacts(root);
  const { reachable } = await productionPaths(root, packages);
  // An extension install can restore vendor build dependencies and their
  // hoisted children even after their manifest edges have been removed.
  const detached = removePaths(root, Object.keys(packages).filter(key => key && !reachable.has(key)));
  removeDanglingBins(root);
  return { development, vendorArtifacts, detached };
}

module.exports = { auditRuntimeDependencies, pruneDevelopmentDependencies };
