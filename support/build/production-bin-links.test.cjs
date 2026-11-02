const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

test('production local-package executables can be restored after a manifest-only install without lifecycle scripts', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'production-bin-links-'));
  const env = { ...process.env, NODE_ENV: 'production', npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false' };
  const npm = args => {
    const result = spawnSync('npm', args, { cwd: root, encoding: 'utf8',
      env });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    fs.mkdirSync(join(root, 'tools'));
    fs.writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'production-bin-fixture', version: '1.0.0',
      dependencies: { 'local-tools': 'file:./tools' },
      devDependencies: { '@researchdatabox/redbox-dev-tools': 'file:./dev-tools' },
      scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(\'lifecycle-ran\', \'yes\')"' } }));
    fs.writeFileSync(join(root, 'tools/package.json'), JSON.stringify({ name: 'local-tools', version: '1.0.0',
      bin: { 'local-tools': 'cli.js' } }));
    fs.mkdirSync(join(root, 'dev-tools'));
    const devTools = require('../../packages/redbox-dev-tools/package.json');
    fs.writeFileSync(join(root, 'dev-tools/package.json'), JSON.stringify({ name: devTools.name,
      version: '1.0.0', bin: devTools.bin }));
    npm(['install', '--package-lock-only', '--ignore-scripts']);
    npm(['ci', '--omit=dev', '--ignore-scripts']);
    const executable = join(root, 'node_modules/.bin/local-tools');
    assert.equal(fs.existsSync(executable), false);
    fs.writeFileSync(join(root, 'tools/cli.js'), '#!/usr/bin/env node\nconsole.log("local CLI ready");\n');
    for (const target of Object.values(devTools.bin)) {
      const file = join(root, 'dev-tools', target);
      fs.mkdirSync(join(file, '..'), { recursive: true });
      fs.writeFileSync(file, '#!/usr/bin/env node\n', { mode: 0o755 });
    }
    // Run the actual runtime rebuild instruction against a graph that omits dev
    // tools, as the portal's production dependency graph does.
    const dockerfile = fs.readFileSync(join(__dirname, '../../Dockerfile'), 'utf8');
    const runtime = dockerfile.split(' AS runtime\n')[1].split('FROM runtime AS')[0];
    const command = runtime.match(/^RUN npm rebuild --ignore-scripts(?:[^\n]*\\\n)*[^\n]*/m)[0].slice(4);
    const rebuilt = spawnSync('sh', ['-c', command], { cwd: root, encoding: 'utf8', env });
    assert.equal(rebuilt.status, 0, rebuilt.stdout + rebuilt.stderr);
    fs.accessSync(executable, fs.constants.X_OK);
    const cli = spawnSync(executable, [], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.stdout.trim(), 'local CLI ready');
    assert.equal(fs.existsSync(join(root, 'node_modules', devTools.name)), false);
    for (const name of Object.keys(devTools.bin)) {
      assert.equal(fs.existsSync(join(root, 'node_modules/.bin', name)), false);
    }
    assert.equal(fs.existsSync(join(root, 'lifecycle-ran')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
