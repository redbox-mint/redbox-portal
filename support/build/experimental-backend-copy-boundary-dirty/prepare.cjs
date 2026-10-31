#!/usr/bin/env node
'use strict';

// Explicit local experiment. No Docker/npm/CI invocation or checkout mutation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { INSTALL_DIRS, validateInputs } = require('./validate-inputs.cjs');
const DOCKERFILE_SHA256 = '179aff0705261a4d6d00ee3793722528b674c8b8eb8c599973b402ff5d1d063c';
const IGNORE_SHA256 = '2e14c1fad4ffe98e558fcb9214023db58ffd7494ac2fddee84dbdea155692a6b';
const ROOT_INPUTS = ['package.json', 'package-lock.json', '.npmrc', '.npmignore'];
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const fail = message => { throw new Error(message); };
const INSTALL_BLOCK = [
  "RUN npm ci --no-audit",
  " && (cd packages/agenda-sqs-backend && npm ci --no-audit)",
  " && (cd packages/sails-ng-common && npm ci --no-audit)",
  " && (cd packages/raido && npm ci --no-audit)",
  " && (cd packages/rva-registry && npm ci --no-audit)",
  " && (cd packages/redbox-core && npm install --no-save --no-audit)",
  " && (cd packages/sails-hook-redbox-storage-mongo && npm ci --no-audit)",
].join(" \\\n");

// This models ONLY audited/dockerignore, never arbitrary Docker ignore syntax.
// Bare patterns are root relative; **/ patterns also match at the root. Apply
// to each ancestor so a directory pattern excludes its descendants as Docker does.
function ignored(name) {
  if (/^packages\/agenda-patched\/agenda-6\.2\.[56]-redbox\.1\.tgz$/.test(name)) return false;
  const parts = name.split('/');
  if (['.dev', '.git', '.github', '.tmp', '.vscode', '.circleci', 'Dockerfile', '.dockerignore',
    '.DS_Store', 'Thumbs.db', 'docs', 'coverage', '.redbox-ci', '.angular', 'test-results',
    'playwright-report'].includes(parts[0])) return true;
  if (/^[^/]*\.(log|tsbuildinfo|tgz)$/.test(parts[0])) return true;
  if (parts.some(p => ['node_modules', 'coverage', 'dist', '.angular', '.git', '.dev', '.env',
    '.aws', '.ssh', '.nyc_output'].includes(p) || p.startsWith('.env.') || /\.(pem|key)$/.test(p))) return true;
  if (['support/docs', 'assets/angular'].some(p => name === p || name.startsWith(`${p}/`))) return true;
  if (parts.some((part, i) => i > 0 && parts[i - 1] === 'config' && ['local.js', 'local.ts'].includes(part))) return true;
  if (name.startsWith('support/build/')) {
    if (parts.slice(2).some(p => p.startsWith('.test-'))) return true;
    if (parts[2].startsWith('.integration-assets-test-')) return true;
  }
  return false;
}

function validateName(name) {
  if (!name || /[\x00-\x1f\x7f\\]/.test(name) || path.posix.isAbsolute(name)
      || name.split('/').some(p => !p || p === '.' || p === '..')) fail(`Unsupported path: ${name}`);
}

function transformDockerfile(original) {
  if (sha256(original) !== DOCKERFILE_SHA256) fail('Dockerfile differs from the audited dirty recipe');
  const text = original.toString();
  const before = 'FROM base AS backend_builder\n\nCOPY . .\n\n';
  const needle = before + INSTALL_BLOCK;
  if (text.split(needle).length !== 2) fail('Expected exactly one audited seven-install boundary');
  const replacement = '# Empty fallback prevents an omitted named context from resolving a registry image.\n'
    + 'FROM scratch AS backend_dependency_inputs\n\n'
    + 'FROM base AS backend_dependencies\n\n'
    + 'COPY --from=backend_dependency_inputs / /opt/redbox-portal/\n\n'
    + INSTALL_BLOCK + '\n\nFROM backend_dependencies AS backend_builder\n\nCOPY . .';
  return text.replace(needle, replacement);
}

function partition(files) {
  const recipe = files.get('Dockerfile');
  const ignore = files.get('.dockerignore');
  if (!recipe || recipe.type !== 'file') fail('Missing Dockerfile');
  if (!ignore || ignore.type !== 'file' || sha256(ignore.data) !== IGNORE_SHA256) {
    fail('.dockerignore differs from the audited dirty policy');
  }
  const dockerfile = transformDockerfile(recipe.data);
  const source = new Map();
  for (const [name, file] of files) {
    validateName(name);
    if (/(^|\/)Dockerfile\.dockerignore$/.test(name)) fail('Unsupported Dockerfile-specific ignore override');
    if (ignored(name)) continue;
    if (!['file', 'directory'].includes(file.type) || !Number.isInteger(file.mode)
        || file.mode < 0 || file.mode > 0o777 || (file.type === 'file' && !Buffer.isBuffer(file.data))) {
      fail(`Unsupported filesystem entry: ${name}`);
    }
    source.set(name, file);
  }
  for (const name of ROOT_INPUTS) {
    if (source.get(name)?.type !== 'file') fail(`Missing dependency input: ${name}`);
  }
  validateInputs(source);
  const inputs = new Map([...source].filter(([name]) => ROOT_INPUTS.includes(name)
    || name === 'packages' || name.startsWith('packages/')));
  const overlay = new Map([...source].filter(([name]) => !inputs.has(name)));
  return { source, inputs, overlay, dockerfile };
}

function fingerprint(files) {
  const rows = [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([name, file]) => [name, file.type, file.mode, file.type === 'file' ? sha256(file.data) : null]);
  return sha256(JSON.stringify(rows));
}

// lstat/O_NOFOLLOW and before/after metadata checks reject observed races and
// unsupported links/devices. Two full scans catch added/deleted/changed inputs.
// This cannot make a live working tree atomic: use a quiescent checkout.
function readWorkingTree(root) {
  const files = new Map();
  const same = (a, b) => ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs'].every(k => a[k] === b[k]);
  const walk = rel => {
    const abs = path.join(root, rel);
    const before = fs.lstatSync(abs, { bigint: true });
    if (!before.isDirectory()) fail(`Unsupported directory: ${rel || '.'}`);
    for (const item of fs.readdirSync(abs).sort()) {
      const name = rel ? `${rel}/${item}` : item;
      validateName(name);
      if (ignored(name) && !['Dockerfile', '.dockerignore'].includes(name)) continue;
      const target = path.join(root, name);
      const stat = fs.lstatSync(target, { bigint: true });
      const mode = Number(stat.mode & 0o777n);
      if (stat.mode & 0o7000n) fail(`Unsupported special mode: ${name}`);
      if (stat.isDirectory()) {
        files.set(name, { type: 'directory', mode });
        walk(name);
      } else if (stat.isFile()) {
        const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
          if (!same(stat, fs.fstatSync(fd, { bigint: true }))) fail(`Source changed during read: ${name}`);
          const data = fs.readFileSync(fd);
          if (!same(stat, fs.fstatSync(fd, { bigint: true }))) fail(`Source changed during read: ${name}`);
          files.set(name, { type: 'file', mode, data });
        } finally { fs.closeSync(fd); }
      } else fail(`Unsupported symlink or special input: ${name}`);
    }
    if (!same(before, fs.lstatSync(abs, { bigint: true }))) fail(`Source directory changed during read: ${rel || '.'}`);
  };
  walk('');
  return files;
}

function writeFiles(dest, files) {
  fs.mkdirSync(dest);
  const directories = [...files].filter(([, f]) => f.type === 'directory')
    .sort(([a], [b]) => a.split('/').length - b.split('/').length);
  for (const [name] of directories) fs.mkdirSync(path.join(dest, name), { recursive: true });
  for (const [name, file] of files) {
    if (file.type !== 'file') continue;
    const target = path.join(dest, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.data, { flag: 'wx', mode: file.mode });
    fs.chmodSync(target, file.mode); // Preserve modes even with a restrictive umask.
  }
  for (const [name, file] of directories.reverse()) fs.chmodSync(path.join(dest, name), file.mode);
}

function prepare(root, output) {
  root = fs.realpathSync(root);
  output = path.resolve(output);
  // Resolve the parent to catch symlink aliases back into the checkout.
  const parent = fs.realpathSync(path.dirname(output));
  output = path.join(parent, path.basename(output));
  const rel = path.relative(root, output);
  if (!rel || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel))) {
    fail('Output must be outside the source tree');
  }
  const files = readWorkingTree(root);
  const result = partition(files); // Validate everything before writing anything.
  if (fingerprint(files) !== fingerprint(readWorkingTree(root))) fail('Source changed between snapshot scans');
  fs.mkdirSync(output); // Never merge into/reuse output, including symlink output.
  const control = new Map(result.source);
  for (const name of ['Dockerfile', '.dockerignore']) control.set(name, files.get(name));
  writeFiles(path.join(output, 'source'), control);
  writeFiles(path.join(output, 'inputs'), result.inputs);
  writeFiles(path.join(output, 'overlay'), result.overlay);
  fs.writeFileSync(path.join(output, 'BackendDeps.Dockerfile'), result.dockerfile, { flag: 'wx' });
  const report = {
    schema: 1, sourceKind: 'explicit-working-tree', sourceRoot: root,
    dockerfileSha256: DOCKERFILE_SHA256, dockerignoreSha256: IGNORE_SHA256,
    candidateDockerfileSha256: sha256(result.dockerfile),
    sourceFingerprint: fingerprint(result.source), inputFingerprint: fingerprint(result.inputs),
    overlayFingerprint: fingerprint(result.overlay),
    entries: [...result.source].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, f]) => ({
      name, type: f.type, mode: f.mode, sha256: f.type === 'file' ? sha256(f.data) : null,
      partition: result.inputs.has(name) ? 'inputs' : 'overlay',
    })),
    note: 'Dirty and untracked Docker-included files; no Git commit provenance or build/cache/performance claim.',
  };
  fs.writeFileSync(path.join(output, 'experiment.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}

if (require.main === module) {
  try {
    const [opt, root, output, ...extra] = process.argv.slice(2);
    if (opt !== '--working-tree' || !root || !output || extra.length) {
      fail('Usage: node prepare.cjs --working-tree <source-root> <new-output-directory>');
    }
    const report = prepare(root, output);
    process.stdout.write(JSON.stringify({ sourceKind: report.sourceKind, inputFingerprint: report.inputFingerprint,
      entries: report.entries.length, output: path.resolve(output) }, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`Backend COPY-boundary experiment refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { DOCKERFILE_SHA256, IGNORE_SHA256, INSTALL_BLOCK, INSTALL_DIRS, ROOT_INPUTS,
  sha256, ignored, partition, fingerprint, readWorkingTree, writeFiles, prepare, transformDockerfile };
