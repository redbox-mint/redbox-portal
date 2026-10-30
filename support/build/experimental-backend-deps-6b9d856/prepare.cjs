#!/usr/bin/env node
'use strict';

// Intentionally standalone: no installed modules, working-tree inputs or CI hooks.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const BASELINE_PEER_SPECS = new Set(require('./peer-specs.json'));
const BASELINE_LOCK_SPECS = new Set(require('./lock-specs.json'));

const BASELINE = '6b9d8561781cc061579b6324e4a5356459b98df4';
const DOCKERFILE_SHA256 = 'f50fb5fea6677539b0b90d15b0810b913bdc4f0d54366e760dccf588fab1a2b6';
const IGNORE_SHA256 = '948be463ca994b00ed64b23ae3ec5a9764e7712af65af6297436d5f5a62ac33f';
const INSTALL_DIRS = ['', 'packages/agenda-sqs-backend', 'packages/sails-ng-common',
  'packages/raido', 'packages/rva-registry', 'packages/redbox-core',
  'packages/sails-hook-redbox-storage-mongo'];
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const fail = message => { throw new Error(message); };
const json = (files, name) => {
  if (!files.has(name)) fail(`Missing dependency input: ${name}`);
  return JSON.parse(files.get(name).data.toString());
};

// ONLY the pinned .dockerignore above is supported. Docker's bare patterns are
// root relative; **/ patterns also match at the root. Keep this policy small and
// tested against Docker rather than pretend to implement arbitrary ignore files.
function ignored(name) {
  if (/^packages\/agenda-patched\/agenda-6\.2\.[56]-redbox\.1\.tgz$/.test(name)) return false;
  const parts = name.split('/');
  if (['.dev', '.git', '.github', '.tmp', '.vscode', '.circleci', '.DS_Store',
    'Thumbs.db', 'docs', 'test', 'coverage'].includes(parts[0])) return true;
  if (/^[^/]*\.(log|tsbuildinfo|tgz)$/.test(parts[0])) return true;
  if (parts.some(p => ['node_modules', 'coverage', 'dist', '.angular'].includes(p))) return true;
  return ['support/development', 'support/integration-testing', 'support/unit-testing',
    'support/docs'].some(p => name === p || name.startsWith(`${p}/`));
}

function readCommit(repo, ref) {
  const git = args => execFileSync('git', ['-C', repo, ...args], { maxBuffer: 128 * 1024 * 1024 });
  const commit = git(['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim();
  const entries = git(['ls-tree', '-rz', commit]).toString().split('\0').filter(Boolean)
    .map(line => {
      const split = line.indexOf('\t');
      const meta = line.slice(0, split);
      const name = line.slice(split + 1);
      const [mode, type, oid] = meta.split(' ');
      if (/[\x00-\x1f\\]/.test(name) || path.posix.isAbsolute(name) || name.split('/').includes('..')) fail(`Unsupported path: ${name}`);
      // Submodules cannot silently disappear, even if future Git output changes.
      if (type !== 'blob' || !['100644', '100755'].includes(mode)) fail(`Unsupported Git input: ${name} (${mode})`);
      return { name, mode, oid };
    });
  const blobs = execFileSync('git', ['-C', repo, 'cat-file', '--batch'], {
    input: entries.map(e => e.oid).join('\n') + '\n', maxBuffer: 128 * 1024 * 1024,
  });
  let offset = 0;
  const files = new Map();
  for (const e of entries) {
    const end = blobs.indexOf(10, offset);
    const [oid, type, size] = blobs.subarray(offset, end).toString().split(' ');
    if (oid !== e.oid || type !== 'blob' || !/^\d+$/.test(size)) fail('Invalid git cat-file response');
    offset = end + 1;
    files.set(e.name, { mode: e.mode, data: Buffer.from(blobs.subarray(offset, offset + Number(size))) });
    offset += Number(size) + 1;
  }
  return { commit, files };
}

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
    if (!files.has(target)) fail(`Missing local tarball: ${target}`);
  } else if (!files.has(`${target}/package.json`)) fail(`Missing local package: ${target}`);
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
        const target = path.posix.normalize(path.posix.join(owner, bin));
        if (!target.startsWith(`${owner}/`) || !files.has(target)) fail(`Missing/unsupported local bin: ${name}: ${bin}`);
      }
    }
  }
}

function transformDockerfile(original) {
  if (sha256(original) !== DOCKERFILE_SHA256) fail('Dockerfile differs from the audited committed baseline');
  const marker = 'FROM base AS builder\n\nCOPY . .\n\n';
  const text = original.toString();
  const start = text.indexOf(marker);
  const run = start + marker.length;
  const end = text.indexOf('\n\n', run);
  if (start < 0 || !text.slice(run, end).startsWith('RUN npm ci --no-audit')) fail('Missing seven-install block');
  return text.slice(0, start) + 'FROM base AS backend_dependencies\n\n'
    + 'COPY --from=backend_dependency_inputs / /opt/redbox-portal/\n\n'
    + text.slice(run, end) + '\n\nFROM backend_dependencies AS builder\n\nCOPY . .'
    + text.slice(end);
}

function partition(allFiles) {
  if ([...allFiles.keys()].some(name => /(^|\/)Dockerfile\.dockerignore$/.test(name))) {
    fail('Unsupported Dockerfile-specific ignore override');
  }
  const original = allFiles.get('Dockerfile')?.data;
  const ignore = allFiles.get('.dockerignore')?.data;
  if (!ignore || sha256(ignore) !== IGNORE_SHA256) fail('.dockerignore differs from the audited committed baseline');
  const dockerfile = transformDockerfile(original || Buffer.alloc(0));
  const source = new Map([...allFiles].filter(([name]) => !ignored(name)));
  validateInputs(source);
  // All local-package source, not merely manifests. This intentionally trades
  // narrower cache hits for correct local links, packing and executable bins.
  const inputs = new Map([...source].filter(([name]) => name.startsWith('packages/')
    || ['package.json', 'package-lock.json', '.npmrc', '.npmignore'].includes(name)));
  const overlay = new Map([...source].filter(([name]) => !inputs.has(name)));
  return { source, inputs, overlay, dockerfile };
}

function fingerprint(files) {
  return sha256([...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, f]) =>
    `${name}\0${f.mode}\0${sha256(f.data)}\n`).join(''));
}

function writeFiles(dest, files) {
  for (const [name, file] of files) {
    const target = path.join(dest, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.data, { mode: file.mode === '100755' ? 0o755 : 0o644, flag: 'wx' });
  }
}

function prepare(repo, ref, out) {
  const { commit, files } = readCommit(repo, ref);
  const result = partition(files); // Validate everything before writing anything.
  fs.mkdirSync(out); // Never merge into/reuse an existing output directory.
  for (const name of ['source', 'inputs', 'overlay']) {
    fs.mkdirSync(path.join(out, name));
    writeFiles(path.join(out, name), result[name]);
  }
  fs.writeFileSync(path.join(out, 'BackendDeps.Dockerfile'), result.dockerfile, { flag: 'wx' });
  const report = {
    schema: 1, auditedBaseline: BASELINE, sourceCommit: commit,
    dockerfileSha256: DOCKERFILE_SHA256, dockerignoreSha256: IGNORE_SHA256,
    sourceFingerprint: fingerprint(result.source), inputFingerprint: fingerprint(result.inputs),
    overlayFingerprint: fingerprint(result.overlay),
    inputs: [...result.inputs.keys()].sort(),
    note: 'Git-only snapshot; ignores working-tree changes. No Docker build, cache export, publication or CI enabled.',
  };
  fs.writeFileSync(path.join(out, 'experiment.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}

if (require.main === module) {
  try {
    const [ref, output, ...extra] = process.argv.slice(2);
    if (!ref || !output || extra.length) fail('Usage: node prepare.cjs <committed-ref> <new-output-directory>');
    const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const report = prepare(repo, ref, path.resolve(output));
    process.stdout.write(JSON.stringify({ sourceCommit: report.sourceCommit, inputFingerprint: report.inputFingerprint,
      output: path.resolve(output) }, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`Backend dependency experiment refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { BASELINE, INSTALL_DIRS, sha256, ignored, readCommit, partition,
  fingerprint, prepare, transformDockerfile };
