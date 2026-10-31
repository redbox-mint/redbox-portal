'use strict';
// Dependency guards carried forward from experimental-backend-deps-6b9d856.
// Keep the earlier experiment untouched; pin its reviewed inventories explicitly.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fail = message => { throw new Error(message); };
function inventory(name, hash) {
  const bytes = fs.readFileSync(path.join(__dirname, '../experimental-backend-deps-6b9d856', name));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== hash) fail(`Changed baseline inventory: ${name}`);
  return new Set(JSON.parse(bytes));
}
const BASELINE_PEER_SPECS = inventory('peer-specs.json', '697185881834caa0beb188b46706da1896e864e5d21d9e28d12454645f4bbce0');
const BASELINE_LOCK_SPECS = inventory('lock-specs.json', '56f3c9fbd4f0a749efdf363d59371d9dc8be80b9a0facbfa7d4b59ed517a45b4');
// Audited delta in the dirty root lock: tsrs and its platform optional packages.
BASELINE_LOCK_SPECS.add('0.20.1-ts7.1.0-beta');
const INSTALL_DIRS = ['', 'packages/agenda-sqs-backend', 'packages/sails-ng-common',
  'packages/raido', 'packages/rva-registry', 'packages/redbox-core',
  'packages/sails-hook-redbox-storage-mongo'];
const json = (files, name) => {
  const file = files.get(name);
  if (!file || file.type !== 'file') fail(`Missing dependency input: ${name}`);
  return JSON.parse(file.data.toString());
};

function validateNpmrc(name, data) {
  // Values with environment substitution, auth, redirects, arbitrary npm options,
  // install-links, userconfig, omit, workspace or lifecycle overrides are unsafe.
  const allowed = {
    'save-exact': ['true'], 'save-prefix': [''], 'ignore-scripts': ['true'],
    provenance: ['false'], registry: ['https://registry.npmjs.org/'],
    'audit-level': ['moderate'], 'strict-peer-deps': ['true'],
  };
  const seen = new Set();
  for (const line of data.toString().split(/\r?\n/)) {
    if (!line.trim() || /^[;#]/.test(line.trim())) continue;
    const match = /^([a-z-]+)=(.*)$/.exec(line);
    if (!match || !allowed[match[1]]?.includes(match[2]) || seen.has(match[1])) {
      fail(`Unsupported npm configuration in ${name}: ${line.split('=')[0]}`);
    }
    seen.add(match[1]);
  }
}

function localPath(owner, spec, files, directoryOnly = false) {
  const value = spec.replace(/^file:/, '');
  const target = path.posix.normalize(path.posix.join(owner, value));
  if (path.posix.isAbsolute(value) || !/^packages\/[^/]+(?:\/[^/]+\.tgz)?$/.test(target)) {
    fail(`Unsupported local dependency: ${owner || '.'} -> ${spec}`);
  }
  if (target.endsWith('.tgz') && !directoryOnly) {
    if (files.get(target)?.type !== 'file') fail(`Missing local tarball: ${target}`);
  } else if (files.get(`${target}/package.json`)?.type !== 'file') fail(`Missing local package: ${target}`);
  return target;
}

function validateSpec(owner, spec, files) {
  if (typeof spec !== 'string') fail(`Unsupported dependency spec in ${owner}`);
  if (/^(file:|\.\.?\/)/.test(spec)) return localPath(owner, spec, files);
  // Match npm-package-arg's file suffix detection, including its wildcard dot.
  if (/[.](?:tgz|tar.gz|tar)$/i.test(spec)) fail(`Unsupported dependency spec in ${owner || '.'}: ${spec}`);
  // Accept a conservative subset of npm's exact SemVer versions. In particular,
  // malformed identifiers and oversized version components can be npm tags.
  const version = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(spec);
  if (version && spec.length <= 256 && version.slice(1, 4).every(part => Number.isSafeInteger(Number(part)))
      && (!version[4] || version[4].split('.').every(part => !/^\d+$/.test(part) || /^(0|[1-9]\d*)$/.test(part)))) return;
  if (/^git\+https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git#[a-f0-9]{40}$/.test(spec)) return;
  fail(`Unsupported dependency spec in ${owner || '.'}: ${spec}`);
}

function validatePeerSpec(owner, spec, files) {
  if (typeof spec !== 'string') fail(`Unsupported peer dependency in ${owner}`);
  if (!BASELINE_PEER_SPECS.has(spec)) fail(`Unsupported peer dependency spec in ${owner || '.'}: ${spec}`);
  if (/^(file:|\.\.?\/)/.test(spec)) return localPath(owner, spec, files);
}

function validateInputs(files) {
  for (const dir of INSTALL_DIRS) {
    json(files, `${dir ? `${dir}/` : ''}package.json`);
    json(files, `${dir ? `${dir}/` : ''}package-lock.json`);
  }
  if (!files.has('.npmrc')) fail('Missing root .npmrc');
  if (!/^ignore-scripts=true\r?$/m.test(files.get('.npmrc').data.toString())) {
    fail('Unsupported root lifecycle configuration: ignore-scripts=true is required');
  }
  for (const [name, file] of files) {
    if (file.type !== 'file') continue;
    // Frontend/support install inputs remain in their original downstream steps.
    if (name.includes('/') && !name.startsWith('packages/')) continue;
    if (/(^|\/)(npm-shrinkwrap\.json|binding\.gyp|\.yarnrc[^/]*|pnpm-workspace\.yaml)$/.test(name)) {
      fail(`Unsupported dependency configuration: ${name}`);
    }
    if (/(^|\/)\.npmrc$/.test(name)) validateNpmrc(name, file.data);
    if (!/(^|\/)package(?:-lock)?\.json$/.test(name)) continue;
    const data = json(files, name);
    const owner = path.posix.dirname(name) === '.' ? '' : path.posix.dirname(name);
    if (name.endsWith('package-lock.json')) {
      if (data.lockfileVersion !== 3 || !data.packages) fail(`Unsupported lockfile: ${name}`);
      for (const [location, entry] of Object.entries(data.packages)) {
        if (entry.link) localPath(owner, entry.resolved, files, true);
        else if (entry.resolved?.startsWith('file:')) localPath(owner, entry.resolved, files);
        else if (entry.resolved && !/^https:\/\/registry\.npmjs\.org\/[^?#\s]+$/.test(entry.resolved)
          && !/^git\+(https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)[\w./-]+\.git#[a-f0-9]{40}$/.test(entry.resolved)) {
          fail(`Unsupported lock resolution: ${name}: ${location}`);
        }
        for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
          for (const spec of Object.values(entry[field] || {})) {
            const context = path.posix.normalize(path.posix.join(owner, location));
            if (field === 'peerDependencies' && !BASELINE_PEER_SPECS.has(spec)) fail(`Unsupported peer dependency in ${name}: ${location}`);
            if (field !== 'peerDependencies' && !BASELINE_LOCK_SPECS.has(spec)) fail(`Unsupported lock dependency in ${name}: ${location}`);
            if (/^(file:|\.\.?\/)/.test(spec)) {
              if (context !== '.' && !/^packages\/[^/]+$/.test(context)) {
                fail(`Unsupported local dependency inside installed package: ${name}: ${location}`);
              }
              localPath(context === '.' ? '' : context, spec, files);
            }
          }
        }
      }
    } else {
      if (data.workspaces || data.bundleDependencies || data.bundledDependencies || data.directories) {
        fail(`Unsupported package layout: ${name}`);
      }
      for (const event of ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare']) {
        if (data.scripts?.[event]) fail(`Unsupported local lifecycle input: ${name}: ${event}`);
      }
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        for (const spec of Object.values(data[field] || {})) validateSpec(owner, spec, files);
      }
      for (const spec of Object.values(data.peerDependencies || {})) {
        validatePeerSpec(owner, spec, files);
      }
      const overrides = value => {
        if (typeof value === 'string') validateSpec(owner, value, files);
        else if (value && typeof value === 'object') Object.values(value).forEach(overrides);
        else fail(`Unsupported override in ${name}`);
      };
      if (data.overrides) overrides(data.overrides);
      const bins = typeof data.bin === 'string' ? [data.bin] : Object.values(data.bin || {});
      for (const bin of bins) {
        if (typeof bin !== 'string' || path.posix.isAbsolute(bin)) fail(`Unsupported local bin: ${name}`);
        const target = path.posix.normalize(path.posix.join(owner, bin));
        if (!target.startsWith(`${owner}/`) || files.get(target)?.type !== 'file') fail(`Missing/unsupported local bin: ${name}: ${bin}`);
      }
    }
  }
}

module.exports = { INSTALL_DIRS, validateInputs };
