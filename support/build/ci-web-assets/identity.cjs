const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { gunzipSync } = require('node:zlib');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
function check(ok, message) { if (!ok) throw new Error(message); }
function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}
function validRevision(value) {
  check(typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value), 'Expected a full lowercase Git revision');
  return value;
}

// Supply the same explicit build environment on either native architecture.
// User/global npm config and arbitrary inherited build flags cannot affect it.
function flags(env = process.env) {
  check(!env.BUILD_PORTAL_NG_FORM_CUSTOM || env.BUILD_PORTAL_NG_FORM_CUSTOM === 'false',
    'External custom form sources are unsupported; commit them and version the contract first');
  const workers = env.NG_BUILD_MAX_WORKERS || '2';
  check(/^[1-9][0-9]*$/.test(workers), 'Invalid NG_BUILD_MAX_WORKERS');
  const nodeOptions = env.NODE_OPTIONS || '';
  // Preloads, loaders and configuration files can import mutable code outside
  // the checkout. Support only resource limits with no referenced inputs.
  check(typeof nodeOptions === 'string' && nodeOptions.trim().split(/\s+/).filter(Boolean)
    .every(option => /^--(?:max-old-space-size|max-semi-space-size)=[1-9][0-9]*$/.test(option)),
  'Unsupported NODE_OPTIONS: use only --max-old-space-size=N or --max-semi-space-size=N');
  return {
    CI: 'true', NODE_ENV: 'docker', REDBOX_ASSET_MODE: 'production',
    WEBPACK_CSS_MINI: 'true', WEBPACK_ENABLE_CSS_MINI_PLUGIN: 'false', WEBPACK_SKIP: 'false',
    BUILD_PORTAL_NG_FORM_CUSTOM: 'false', NG_BUILD_MAX_WORKERS: workers,
    NODE_OPTIONS: nodeOptions, TZ: 'UTC', LANG: 'C', LC_ALL: 'C',
  };
}
function buildEnv(selectedFlags, sourceDateEpoch, env = process.env) {
  const result = { ...selectedFlags, SOURCE_DATE_EPOCH: String(sourceDateEpoch),
    npm_config_userconfig: path.join(__dirname, 'empty.npmrc'), npm_config_globalconfig: '/dev/null' };
  for (const name of ['PATH', 'HOME', 'NVM_DIR', 'TMPDIR', 'SYSTEMROOT']) {
    if (env[name] !== undefined) result[name] = env[name];
  }
  return result;
}

const TOOL_PACKAGES = {
  '.': ['typescript', 'sass', 'sass-loader', 'css-loader', 'mini-css-extract-plugin', 'redoc'],
  angular: ['@angular/cli', '@angular/build', '@angular/core', '@angular/compiler-cli', 'typescript', 'ng-packagr', 'esbuild'],
  'packages/redbox-core': ['typescript', 'webpack', 'copy-webpack-plugin', 'css-minimizer-webpack-plugin'],
};
function tools(root) {
  const result = {};
  for (const [directory, names] of Object.entries(TOOL_PACKAGES)) {
    const lock = JSON.parse(fs.readFileSync(path.join(root, directory, 'package-lock.json')));
    check(lock.lockfileVersion >= 2, `Unsupported lockfile: ${directory}`);
    for (const name of names) {
      const version = lock.packages?.[`node_modules/${name}`]?.version;
      check(typeof version === 'string', `Missing locked tool: ${directory}:${name}`);
      result[`${directory}:${name}`] = version;
    }
  }
  return result;
}

function inspectLocalTarball(filename) {
  // A tracked tarball is not necessarily a closed input: npm reads embedded
  // shrinkwraps; the outer lock's hasShrinkwrap is not a content guarantee.
  // Reject them outright rather than resolve paths relative to an extraction
  // location that differs from the source archive's directory. Only accept a
  // small, fully inspected npm-pack format; extensions/links could rename or
  // alias metadata. No extraction, npm dependencies or lifecycle scripts here.
  const limit = 64 * 1024 ** 2;
  const reject = message => check(false, `Unsupported local dependency tarball (${filename}): ${message}`);
  check(fs.statSync(filename).size <= limit, `Local dependency tarball exceeds ${limit} bytes: ${filename}`);
  let bytes = fs.readFileSync(filename);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    let result;
    try { result = gunzipSync(bytes, { maxOutputLength: limit, info: true }); }
    catch { reject('invalid gzip or expanded size exceeds limit'); }
    if (result.engine.bytesWritten !== bytes.length) reject('unconsumed gzip trailing data');
    bytes = result.buffer;
  }
  const requireThat = (ok, message) => { if (!ok) reject(message); };
  function field(block, offset, length) {
    const raw = block.subarray(offset, offset + length);
    const end = raw.indexOf(0);
    requireThat(end === -1 || raw.subarray(end).every(byte => byte === 0), 'ambiguous header string');
    const value = raw.subarray(0, end === -1 ? length : end);
    const decoded = value.toString('utf8');
    requireThat(Buffer.from(decoded).equals(value), 'invalid UTF-8 header');
    return decoded;
  }
  function octal(block, offset, length) {
    const raw = block.subarray(offset, offset + length);
    const value = raw.toString('ascii');
    requireThat(raw.every(byte => byte < 128) && /^[0-7]+[\0 ]*$/.test(value), 'invalid octal header');
    return parseInt(value, 8);
  }
  const seen = new Set();
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const block = bytes.subarray(offset, offset + 512);
    if (block.every(byte => byte === 0)) {
      requireThat(bytes.length - offset >= 1024 && bytes.length % 512 === 0 &&
        bytes.subarray(offset).every(byte => byte === 0), 'invalid tar trailer or trailing payload');
      requireThat(seen.has('package/package.json'), 'missing package/package.json');
      return;
    }
    const sum = block.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
    requireThat(octal(block, 148, 8) === sum, 'header checksum mismatch');
    requireThat(block.subarray(257, 265).equals(Buffer.from('ustar\0' + '00')), 'only plain ustar supported');
    const type = block[156];
    requireThat([0, 48, 53].includes(type) && field(block, 157, 100) === '',
      'only regular files/directories supported (no links or extensions)');
    const prefix = field(block, 345, 155);
    let name = `${prefix ? `${prefix}/` : ''}${field(block, 0, 100)}`;
    if (type === 53) name = name.replace(/\/$/, '');
    requireThat(!/[\\\x00-\x1f\x7f]/.test(name) && name.split('/').every(part => part && part !== '.' && part !== '..') &&
      (name.startsWith('package/') || (name === 'package' && type === 53)), 'unsafe package path');
    requireThat(!seen.has(name) && seen.size < 10000, 'duplicate entry or too many entries');
    seen.add(name);
    requireThat(name !== 'package/package.json' || type === 0 || type === 48, 'package manifest must be regular');
    requireThat(path.posix.basename(name).toLowerCase() !== 'npm-shrinkwrap.json', 'embedded npm-shrinkwrap.json');
    const size = octal(block, 124, 12);
    requireThat(size <= limit && (type !== 53 || size === 0), 'invalid entry size');
    const end = offset + 512 + size;
    offset += 512 + Math.ceil(size / 512) * 512;
    requireThat(offset <= bytes.length && bytes.subarray(end, offset).every(byte => byte === 0), 'truncated entry or invalid padding');
  }
  reject('missing tar trailer');
}

function localDependencies(root, files) {
  const tracked = new Set(files.map(file => file.path));
  const inspectedTarballs = new Set();
  const inside = target => target === root || target.startsWith(`${root}${path.sep}`);
  const dependencyFields = new Set(['dependencies', 'devDependencies', 'optionalDependencies',
    'peerDependencies', 'requires', 'overrides']);
  function local(value, resolved = false) {
    // npm checks explicit filesystem forms before URLs, then accepts slash
    // paths and bare archive names. A lock's resolved field is already a fetch
    // location, so even a single directory name (or owner/repo) is a path there.
    if (/^(?:file:|git\+file:|[.]|~\/|[/\\]|[a-z]:)/i.test(value)) return true;
    // Match npm's protocol syntax, not arbitrary URI schemes or scp-like
    // strings: npm can treat those URL-looking strings as local paths too.
    if (/^(?:git[+])?[a-z]+:/i.test(value)) return false;
    if (resolved) return true;
    // npm's owner/repo shorthand denotes hosted Git, except malformed escapes
    // make its hosted-Git parser fall back to a local filesystem path.
    if (/^[^.@\s:/][^@\s:/]*\/[^@\s:/#]+(?:#.*)?$/.test(value)) {
      try { decodeURIComponent(value); return false; }
      catch { return true; }
    }
    return value.includes('/') || /\.(?:tgz|tar\.gz|tar)$/i.test(value);
  }
  function target(directory, value) {
    // Keep the accepted subset unambiguous without depending on npm's private
    // parser. npm treats percent signs, URL punctuation, home expansion and
    // file:/../ spellings differently from fileURLToPath/path.resolve. Reject
    // those forms rather than checking a different file from the one npm reads.
    const reference = value.replace(/^file:/, '');
    check(!/^(?:git\+file:|file:|~(?:\/|$)|[a-z]:)/i.test(reference) &&
      !/[\\%?#\x00-\x1f\x7f]/.test(reference) && !/^\/{1,3}\.\.?(?:\/|$)/.test(reference),
    `Unsupported local dependency path: ${value}`);
    const absolute = path.resolve(directory, reference);
    check(inside(absolute), `External local dependency: ${value}`);
    const real = fs.realpathSync(absolute);
    check(inside(real), `External local dependency (symlink escape): ${value}`);
    check(real === absolute, `Local dependency must be tracked without symlink aliases: ${value}`);
    const relative = path.relative(root, real).split(path.sep).join('/');
    const directoryTarget = fs.statSync(real).isDirectory();
    check(directoryTarget ? tracked.has(`${relative ? `${relative}/` : ''}package.json`) : tracked.has(relative),
      `Local dependency must be tracked: ${value}`);
    // Inspect every file target, not just *.tgz or hasShrinkwrap lock entries.
    if (!directoryTarget && !inspectedTarballs.has(real)) {
      inspectLocalTarball(real);
      inspectedTarballs.add(real);
    }
  }
  function scan(value, directory, lockDirectory = directory, lock = false, specifications = false) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string') {
        const locked = lock && !specifications && ['resolved', 'version'].includes(key);
        if ((specifications || locked) && local(child, locked && key === 'resolved')) {
          target(locked ? lockDirectory : directory, child);
        }
      } else scan(child, directory, lockDirectory, lock,
        dependencyFields.has(key) ? key : specifications === 'overrides' ? 'overrides' : false);
    }
    if (value.link === true) {
      check(typeof value.resolved === 'string', 'Local dependency link has no target');
      target(lockDirectory, value.resolved);
    }
  }
  // Inspect every tracked manifest, including local packages reached only
  // transitively. Lock entries may also introduce local targets independently.
  for (const file of files.filter(file => /(?:^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json)$/.test(file.path))) {
    const directory = path.dirname(path.join(root, file.path));
    const data = JSON.parse(fs.readFileSync(path.join(root, file.path)));
    if (path.basename(file.path) === 'package.json') scan(data, directory);
    else {
      const { packages, ...rest } = data;
      scan(rest, directory, directory, true);
      for (const [location, entry] of Object.entries(packages || {})) {
        check(inside(path.resolve(directory, location)), `External local dependency location: ${location}`);
        const localPackage = !location.split('/').includes('node_modules');
        if (localPackage && location) target(directory, location);
        scan(entry, path.resolve(directory, location), directory, true);
      }
    }
  }
}

function identity(root, revision, env = process.env) {
  validRevision(revision);
  root = fs.realpathSync(root);
  check(git(root, 'rev-parse', 'HEAD').trim() === revision, 'Checkout revision mismatch');
  check(git(root, 'rev-parse', '--show-toplevel').trim() === root, 'ROOT must be the checkout root');
  // Includes staged changes. Never stamp a clean revision onto a dirty checkout.
  git(root, 'diff', '--quiet', revision, '--');
  const untracked = git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
  check(untracked.every(filename => ['.redbox-ci/integration-assets.json', '.redbox-ci/integration-image.json'].includes(filename)),
    'Untracked source inputs: use a clean disposable CI checkout');
  const files = git(root, 'ls-tree', '-rz', '--full-tree', revision).split('\0').filter(Boolean).map(entry => {
    const match = /^(100644|100755) blob ([a-f0-9]+)\t([\s\S]+)$/.exec(entry);
    check(match, 'Source links/submodules are unsupported; vendor immutable build inputs first');
    const filename = path.join(root, match[3]);
    check(fs.lstatSync(filename).isFile(), `Not a source file: ${match[3]}`);
    return { path: match[3], mode: match[1], sha256: sha256(fs.readFileSync(filename)) };
  });
  localDependencies(root, files);
  const nodeVersion = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
  const angularNode = fs.readFileSync(path.join(root, 'angular/.nvmrc'), 'utf8').trim().replace(/^v/, '');
  check(/^\d+\.\d+\.\d+$/.test(nodeVersion) && nodeVersion === angularNode,
    'Root and Angular .nvmrc must select the same exact Node version');
  check(process.versions.node === nodeVersion, `Select Node ${nodeVersion} before building or consuming assets`);
  const selectedFlags = flags(env);
  const sourceDateEpoch = git(root, 'show', '-s', '--format=%ct', revision).trim();
  const npm = execFileSync('npm', ['--version'], { cwd: root, encoding: 'utf8',
    env: buildEnv(selectedFlags, sourceDateEpoch, env) }).trim();
  // Bind the code actually executing too, even if a caller invokes this helper
  // from a tooling checkout while pointing ROOT at a different source checkout.
  const implementation = ['cli.cjs', 'identity.cjs', 'archive.cjs', 'prepare.cjs', 'empty.npmrc',
    '../integration-prebuilt-assets.cjs'].map(filename => ({
    path: filename, sha256: sha256(fs.readFileSync(path.join(__dirname, filename))),
  }));
  return {
    schemaVersion: 1, contract: 'redbox-production-web-assets-v1', revision,
    sourceSha256: sha256(json(files)), inputs: files, implementation,
    toolchain: { node: nodeVersion, npm, tools: tools(root) },
    flags: selectedFlags, sourceDateEpoch,
    steps: ['prepare.cjs', 'compileProductionAngular.sh', 'npm run webpack'],
  };
}

module.exports = { identity, localDependencies, inspectLocalTarball, flags, buildEnv, TOOL_PACKAGES, validRevision, sha256, json, check };
