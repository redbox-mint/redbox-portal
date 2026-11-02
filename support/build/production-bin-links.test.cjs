const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

test('production local-package executables can be restored after a manifest-only install without lifecycle scripts', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'production-bin-links-'));
  const npm = args => {
    const result = spawnSync('npm', args, { cwd: root, encoding: 'utf8',
      env: { ...process.env, npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false' } });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    fs.mkdirSync(join(root, 'tools'));
    fs.writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'production-bin-fixture', version: '1.0.0',
      dependencies: { 'local-tools': 'file:./tools' },
      scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(\'lifecycle-ran\', \'yes\')"' } }));
    fs.writeFileSync(join(root, 'tools/package.json'), JSON.stringify({ name: 'local-tools', version: '1.0.0',
      bin: { 'local-tools': 'cli.js' } }));
    npm(['install', '--package-lock-only', '--ignore-scripts']);
    npm(['ci', '--omit=dev', '--ignore-scripts']);
    const executable = join(root, 'node_modules/.bin/local-tools');
    assert.equal(fs.existsSync(executable), false);
    fs.writeFileSync(join(root, 'tools/cli.js'), '#!/usr/bin/env node\nconsole.log("local CLI ready");\n');
    npm(['rebuild', '--ignore-scripts']);
    fs.accessSync(executable, fs.constants.X_OK);
    const cli = spawnSync(executable, [], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.stdout.trim(), 'local CLI ready');
    assert.equal(fs.existsSync(join(root, 'lifecycle-ran')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
