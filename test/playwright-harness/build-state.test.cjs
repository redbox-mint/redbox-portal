const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('persistent freshness ignores regenerated shims but detects authored source and toolchain changes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-playwright-build-state-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const script = path.join(root, 'support/integration-testing/playwright-build-state.cjs');
  await fs.mkdir(path.dirname(script), { recursive: true });
  await fs.copyFile('support/integration-testing/playwright-build-state.cjs', script);
  const write = async (file, value) => {
    const target = path.join(root, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, value);
  };
  const run = command => spawnSync(process.execPath, [script, command], { cwd: os.tmpdir(), encoding: 'utf8' });
  await write('angular/projects/form/src/app.ts', 'original source');
  assert.equal(run('write').status, 0);
  await write('api/form-config/index.js', 'generated during the next Sails lift');
  await write('config/recordtype.js', 'generated configuration');
  await write('assets/angular/form/browser/main.js', 'compiled output');
  // Compose overlays this directory with support/resources/development/bootstrap-data.
  // The underlying host contents must not make the same prepared stack stale.
  await write('bootstrap-data/records/party.json', 'hidden beneath the container bind mount');
  assert.equal(run('check').status, 0);
  for (const file of ['angular/projects/form/src/app.ts', 'packages/hook/src/playwright/catalogue.ts',
    'views/record.ejs', 'api/migrations/owned.js', 'config/env/integrationtest.js', '.nvmrc',
    'support/resources/development/bootstrap-data/records/party.json']) {
    await write(file, 'changed authored input');
    const stale = run('check');
    assert.equal(stale.status, 1, file);
    assert.match(stale.stderr, /Run npm run test:playwright:up/);
    assert.equal(run('write').status, 0);
    assert.equal(run('check').status, 0);
  }
});
