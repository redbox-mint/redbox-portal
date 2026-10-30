#!/usr/bin/env node
// Called from angular/ after nvm use. This is an install receipt, not an asset
// cache: sources and built libraries must still be compiled by the caller.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');

const receipt = 'node_modules/.redbox-angular-install.json';
const mode = process.argv[2];
if (!['ci', 'install'].includes(mode)) {
  throw new Error('Expected Angular install mode: ci or install');
}

function fingerprint() {
  const hash = crypto.createHash('sha256');
  const add = value => hash.update(JSON.stringify(value));
  const file = filename => {
    add(path.resolve(filename));
    add(fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : null);
  };
  file(__filename);
  file('package-lock.json');
  file('npm-shrinkwrap.json');
  file('.nvmrc');
  // Effective config includes project/user/global npmrc and npm_config_* flags,
  // including omit/include, install-links and registry. Only its digest is saved.
  const config = JSON.parse(execFileSync('npm', ['config', 'list', '--json', '--ignore-scripts', '--strict-peer-deps', '--no-audit'], { encoding: 'utf8' }));
  // Copied file: packages need source-content validation as well as metadata.
  // Keep their standalone install behavior rather than reusing a stale copy.
  if (config['install-links']) return null;
  add(config);
  add(execFileSync('npm', ['--version'], { encoding: 'utf8' }));
  add([process.version, process.versions.modules, process.platform, process.arch, process.execPath]);

  const visited = new Set();
  function localInputs(directory) {
    directory = fs.realpathSync(directory);
    if (visited.has(directory)) return;
    visited.add(directory);
    for (const name of ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', '.npmrc']) {
      file(path.join(directory, name));
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
    for (const spec of Object.values({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies })) {
      if (!spec.startsWith('file:')) continue;
      const target = path.resolve(directory, spec.slice(5));
      if (fs.statSync(target).isDirectory()) localInputs(target);
      else add([target, fs.readFileSync(target).toString('base64')]);
    }
  }
  localInputs('.');

  // npm's hidden lock describes the installed tree. Also check package identity
  // and timestamps so a removed/replaced dependency or local link invalidates it.
  file('node_modules/.package-lock.json');
  const installed = JSON.parse(fs.readFileSync('node_modules/.package-lock.json'));
  for (const name of Object.keys(installed.packages).sort()) {
    const manifest = path.join(name, 'package.json');
    if (!fs.existsSync(manifest)) {
      add([name, null]); // Optional packages for other platforms may be absent.
      continue;
    }
    const stat = fs.statSync(manifest, { bigint: true });
    add([fs.realpathSync(name), String(stat.ino), String(stat.size), String(stat.mtimeNs)]);
  }
  fs.accessSync('node_modules/.bin/ng', fs.constants.X_OK);
  // An executable can be replaced without touching its package manifest.
  add(fs.readFileSync('node_modules/.bin/ng').toString('base64'));
  // ignore-scripts relies on optional native packages. Check both the explicit
  // esbuild dependency and the Angular builder's potentially different version.
  // Probe in a separate process. A failed esbuild service caches its failure in
  // the loaded module, even after npm restores the binary in this process.
  const probe = `const {createRequire} = require('node:module');
    const root = process.argv[1]; const requireHere = createRequire(root);
    const builder = requireHere.resolve('@angular/build');
    for (const from of [root, builder, requireHere.resolve('ng-packagr')]) {
      const esbuild = createRequire(from)('esbuild');
      try { esbuild.transformSync('const ready = true;'); }
      finally { if (typeof esbuild.stop === 'function') esbuild.stop(); }
    }
    createRequire(builder)('rollup');`;
  execFileSync(process.execPath, ['-e', probe, path.resolve('package.json')], { stdio: 'pipe' });
  return hash.digest('hex');
}

let current;
try {
  current = fingerprint();
  const saved = JSON.parse(fs.readFileSync(receipt));
  // A standalone test's npm install must not substitute for a clean npm ci.
  if (current !== null && saved.fingerprint === current && (mode === 'install' || saved.mode === 'ci')) {
    console.log('Reusing verified Angular dependencies');
    process.exit(0);
  }
} catch {
  // Missing, changed or incomplete installation: preserve standalone setup.
}
fs.rmSync(receipt, { force: true });
const args = [mode, '--ignore-scripts', '--strict-peer-deps'];
if (mode === 'ci') args.push('--no-audit');
const result = spawnSync('npm', args, { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
fs.writeFileSync(receipt, JSON.stringify({ mode, fingerprint: fingerprint() }) + '\n');
