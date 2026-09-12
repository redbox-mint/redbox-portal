#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const stamp = path.join(root, '.tmp/playwright/build-stamp');
const excluded = new Set(['node_modules', 'dist', 'coverage', '.angular', '.tmp', '.git', 'out-tsc']);
// Compose overlays bootstrap-data with the development fixtures below. Hash
// their source path so host commands and the prepared container see the same inputs.
const roots = ['packages', 'angular', 'config', 'api', 'tasks', 'scripts', 'views', 'assets',
  'support/integration-testing', 'support/build', 'support/resources/development/bootstrap-data',
  'package.json', 'package-lock.json', '.nvmrc', 'Dockerfile', '.dockerignore',
  'app.ts', 'app.js', 'app.integrationtest.js', 'tsconfig.json', 'webpack.config.js'];

function files(relative) {
  const normalized = relative.split(path.sep).join('/');
  // The loader regenerates these after preparation. Hash their typed sources,
  // while retaining authored migrations and environment config in the stamp.
  if (/^api\/(controllers|models|services|policies|middleware|responses|form-config|shims)\/.*\.js$/.test(normalized) ||
      (/^config\/[^/]+\.js$/.test(normalized) && normalized !== 'config/form.js') ||
      normalized === 'assets/angular') return [];
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) return [];
  if (!stat.isDirectory()) return [relative];
  return fs.readdirSync(absolute).filter(name => !excluded.has(name)).flatMap(name => files(path.join(relative, name)));
}

function fingerprint() {
  const hash = crypto.createHash('sha256');
  for (const relative of roots.flatMap(files).sort()) {
    hash.update(relative).update('\0').update(fs.readFileSync(path.join(root, relative))).update('\0');
  }
  return hash.digest('hex');
}

function bundleManifest() {
  const workspace = JSON.parse(fs.readFileSync(path.join(root, 'angular/angular.json'), 'utf8'));
  return Object.entries(workspace.projects).filter(([, project]) => project.projectType === 'application').map(([name, project]) => {
    const output = project.architect?.build?.options?.outputPath;
    const base = typeof output === 'string' ? output : output?.base;
    if (!base) throw new Error(`No build output for ${name}`);
    const browser = typeof output === 'object' ? (output.browser ?? 'browser') : 'browser';
    const directory = path.relative(root, path.resolve(root, 'angular', base, browser));
    if (directory.startsWith('..')) throw new Error(`Bundle output escapes checkout: ${name}`);
    return { name, directory };
  });
}

try {
  const command = process.argv[2];
  if (command === 'manifest') {
    const target = path.join(root, '.tmp/playwright/application-bundles.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(bundleManifest(), null, 2));
  } else if (command === 'write') {
    let revision = 'unavailable';
    try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Git metadata may be outside a mounted worktree. */ }
    fs.mkdirSync(path.dirname(stamp), { recursive: true });
    fs.writeFileSync(stamp, JSON.stringify({ fingerprint: fingerprint(), revision, preparedAt: new Date().toISOString() }, null, 2));
  } else if (command === 'check') {
    if (!fs.existsSync(stamp) || JSON.parse(fs.readFileSync(stamp, 'utf8')).fingerprint !== fingerprint())
      throw new Error('Mounted application sources or build configuration changed. Run npm run test:playwright:up to prepare them.');
  } else throw new Error('Usage: playwright-build-state.cjs {manifest|write|check}');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
