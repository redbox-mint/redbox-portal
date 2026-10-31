'use strict';
// Real host npm, synthetic packages only, offline, in disposable directories.
// This deliberately does NOT claim Docker/BuildKit or application graph parity.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const e = require('./prepare.cjs');
const { fixture, editJson, replace } = require('./fixtures.cjs');

test('offline synthetic seven-install control/candidate parity: lifecycle, real links/bins, modes and lock effects', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-copy-offline-'));
  try {
    const home = path.join(temp, 'home');
    fs.mkdirSync(home);
    fs.writeFileSync(path.join(home, 'user-config'), '');
    fs.writeFileSync(path.join(home, 'global-config'), '');
    // Do not import host npm/global credentials/config, caches, NODE_OPTIONS or
    // npm lifecycle flags. Offline is a test-only environment control.
    const env = { PATH: process.env.PATH, HOME: home, LANG: 'C.UTF-8',
      npm_config_cache: path.join(home, 'cache'), npm_config_offline: 'true',
      npm_config_userconfig: path.join(home, 'user-config'),
      npm_config_globalconfig: path.join(home, 'global-config'),
      npm_config_fund: 'false', npm_config_update_notifier: 'false' };
    const run = (cmd, args, cwd, extraEnv = {}) => execFileSync(cmd, args, {
      cwd, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 120000,
      maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const fixtureRoot = path.join(temp, 'fixture');
    let files = fixture();
    files = editJson(files, 'package.json', p => {
      p.dependencies = {
        'fixture-raido': 'file:packages/raido',
      };
    });
    files = editJson(files, 'packages/raido/package.json', p => {
      p.dependencies = { 'lifecycle-probe': 'file:../agenda-patched/agenda-6.2.6-redbox.1.tgz' };
      p.bin = { 'fixture-cli': 'bin/cli.js' };
    });
    files = replace(files, 'packages/raido/bin/cli.js', '#!/usr/bin/env node\nconsole.log("fixture-bin-ok");\n', 0o644);
    e.writeFiles(fixtureRoot, files);
    const tarRoot = path.join(temp, 'tarball');
    fs.mkdirSync(path.join(tarRoot, 'package'), { recursive: true });
    fs.writeFileSync(path.join(tarRoot, 'package/package.json'), JSON.stringify({
      name: 'lifecycle-probe', version: '1.0.0', scripts: { install: 'node install.cjs' },
    }));
    fs.writeFileSync(path.join(tarRoot, 'package/install.cjs'),
      'require("fs").appendFileSync(process.env.INIT_CWD + "/probe.log", "ran\\n");\n');
    const tarball = path.join(fixtureRoot, 'packages/agenda-patched/agenda-6.2.6-redbox.1.tgz');
    run('tar', ['-czf', tarball, '-C', tarRoot, 'package'], temp);
    fs.chmodSync(tarball, 0o644);
    for (const dir of [...e.INSTALL_DIRS, 'packages/redbox-dev-tools']) {
      run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--offline', '--no-audit'],
        path.join(fixtureRoot, dir));
    }
    const parts = e.partition(e.readWorkingTree(fixtureRoot));
    const control = path.join(temp, 'control'), candidate = path.join(temp, 'candidate');
    const overlay = path.join(temp, 'overlay');
    e.writeFiles(control, parts.source);
    e.writeFiles(candidate, parts.inputs);
    e.writeFiles(overlay, parts.overlay);
    const shellBlock = e.INSTALL_BLOCK.slice('RUN '.length);
    const install = root => {
      run('bash', ['-o', 'pipefail', '-c', shellBlock], root);
      // A permitted install-time lock rewrite is a sentinel: the overlay must
      // retain it. npm itself has already chmodded and linked the real bin.
      const lockPath = path.join(root, 'package-lock.json');
      const lock = JSON.parse(fs.readFileSync(lockPath));
      lock.fixtureInstallState = true;
      fs.writeFileSync(lockPath, JSON.stringify(lock));
    };
    install(control);
    install(candidate);
    // Local tar extraction preserves directory/file permissions for this
    // filesystem model. It does not exercise BuildKit's COPY implementation.
    const copyContext = (context, name) => {
      const archive = path.join(temp, name);
      run('tar', ['-cf', archive, '-C', context, '.'], temp);
      run('tar', ['-xpf', archive, '-C', candidate], temp);
    };
    copyContext(overlay, 'overlay.tar');
    for (const root of [control, candidate]) {
      assert.ok(!fs.existsSync(path.join(root, 'probe.log')), 'root ignore-scripts must survive');
      assert.equal(fs.readFileSync(path.join(root, 'packages/raido/probe.log'), 'utf8'), 'ran\n',
        'nested npm invocation must retain its lifecycle behavior');
      assert.equal(fs.lstatSync(path.join(root, 'node_modules/fixture-raido')).isSymbolicLink(), true);
      const bin = path.join(root, 'node_modules/.bin/fixture-cli');
      assert.equal(fs.lstatSync(bin).isSymbolicLink(), true);
      assert.equal(fs.statSync(bin).mode & 0o111, 0o111, 'npm executable chmod must survive overlay');
      assert.equal(run(bin, [], root).trim(), 'fixture-bin-ok');
      assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'))).fixtureInstallState, true);
      assert.equal(fs.statSync(path.join(root, 'packages/raido/source.txt')).mode & 0o777, 0o640);
      assert.equal(fs.statSync(path.join(root, 'packages/raido/empty')).mode & 0o777, 0o750);
    }
    const snapshot = root => {
      const rows = [];
      const walk = rel => {
        for (const name of fs.readdirSync(path.join(root, rel)).sort()) {
          const relative = path.posix.join(rel, name), abs = path.join(root, relative);
          const stat = fs.lstatSync(abs), mode = stat.mode & 0o777;
          if (stat.isSymbolicLink()) rows.push([relative, 'link', fs.readlinkSync(abs)]);
          else if (stat.isDirectory()) { rows.push([relative, 'directory', mode]); walk(relative); }
          else rows.push([relative, 'file', mode, e.sha256(fs.readFileSync(abs))]);
        }
      };
      walk('');
      return rows;
    };
    assert.deepEqual(snapshot(candidate), snapshot(control), 'complete synthetic filesystem parity');
    // Negative control: re-copying the full original context really does revert
    // both the lock sentinel and bin chmod. Keep this regression visible.
    const unsafe = path.join(temp, 'unsafe-full-overlay');
    e.writeFiles(unsafe, parts.source);
    copyContext(unsafe, 'unsafe.tar');
    assert.equal(JSON.parse(fs.readFileSync(path.join(candidate, 'package-lock.json'))).fixtureInstallState, undefined);
    assert.equal(fs.statSync(path.join(candidate, 'packages/raido/bin/cli.js')).mode & 0o777, 0o644);
    assert.notDeepEqual(snapshot(candidate), snapshot(control));
    console.log(`Synthetic host-only parity: ${snapshot(control).length} entries; ${process.version}; npm ${run('npm', ['--version'], temp).trim()}; ${process.platform}/${process.arch}. No Docker evidence.`);
  } catch (error) {
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
