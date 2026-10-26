'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');

test('the hook author wiki builds and packs its documented v6 extension outside the portal', () => {
  const portal = path.resolve(__dirname, '../..');
  const guide = fs.readFileSync(path.join(portal, 'support/wiki/Redbox-Hook-Kit.md'), 'utf8');
  const command = guide.match(/```(?:sh|bash)\n([\s\S]*?)```/)[1];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-guide-'));
  try {
    const start = path.join(directory, 'portal');
    fs.mkdirSync(start);
    // Only expose built package inputs. npm must never write to the portal root.
    fs.symlinkSync(path.join(portal, 'packages'), path.join(start, 'packages'), 'dir');
    const result = spawnSync('bash', ['-euc', command], {
      cwd: start,
      env: {...process.env, NPM_CONFIG_OFFLINE: 'true', NPM_CONFIG_IGNORE_SCRIPTS: 'true'},
      encoding: 'utf8', timeout: 240000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const hook = path.join(directory, 'redbox-hook-demo-client');
    const registration = require(path.join(hook, 'dist/index.js')).registerRedboxExtension();
    assert.equal(registration.apiVersion, 1);
    assert.ok(fs.readdirSync(hook).some(file => file.endsWith('.tgz')));
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
