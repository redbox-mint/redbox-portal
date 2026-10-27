'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
test('development preparation runs declared build scripts and builds the host', t => {
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
  const fixture = fs.mkdtempSync(path.join(root, '.tmp', 'development-prepare-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const bin = path.join(fixture, 'bin');
  fs.mkdirSync(bin);
  fs.copyFileSync(path.join(root, 'package.json'), path.join(fixture, 'package.json'));
  fs.writeFileSync(path.join(bin, 'sudo'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(
    path.join(bin, 'npm'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
const name = process.argv[3];
if (process.argv[2] !== 'run' || !Object.hasOwn(scripts, name)) process.exit(1);
fs.appendFileSync('builds.log', name + '\\n');
`,
    { mode: 0o755 }
  );
  const result = spawnSync('bash', [path.join(root, 'support/development/prepareLocalDev.sh')], {
    cwd: fixture,
    env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const builds = fs.readFileSync(path.join(fixture, 'builds.log'), 'utf8').trim().split('\n');
  assert(builds.includes('compile:host'));
  assert(builds.indexOf('compile:host') < builds.indexOf('compile:ng-apps'));
  assert.equal(builds.at(-1), 'webpack');
});
