// Run inside the clean production image with only this verifier mounted read-only.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');

test('production image contains standalone exports, EJS views and every Angular application', async () => {
  assert.equal(process.version, 'v26.12.1');
  const npm = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
  assert.equal(npm, '11.20.0');
  assert.equal(process.env.NODE_ENV, 'production');
  assert.equal(global.sails, undefined);
  const root = '/opt/redbox-portal';
  assert.equal(process.cwd(), root);
  const { PageArtifacts } = require('@researchdatabox/redbox-core/http/express');
  const coreRequire = createRequire(require.resolve('@researchdatabox/redbox-core/http/express'));
  const storageRequire = createRequire(require.resolve('@researchdatabox/sails-hook-redbox-storage-mongo/extension'));
  assert.equal(coreRequire('mongodb/package.json').version, '7.7.0');
  assert.equal(storageRequire('mongodb/package.json').version, '7.7.0');
  // GridFS uses the pool owner's driver with IDs created in the storage hook.
  // A stale nested lock entry previously installed BSON 6 beside BSON 7.
  assert.doesNotThrow(() => coreRequire('mongodb').BSON.serialize({ id: new (storageRequire('mongodb').ObjectId)() }));
  for (const entry of ['application', 'configuration', 'extensions', 'record-types', 'maintenance']) {
    const name = '@researchdatabox/redbox-core/' + entry;
    assert(require.resolve(name).startsWith(root + '/packages/redbox-core/dist/'));
    assert(require(name));
  }
  const artifacts = new PageArtifacts([path.join(root, 'views')], [path.join(root, '.tmp/public')]);
  await artifacts.initialize();
  try {
    assert(artifacts.layout('default', 'rdmp'));
    for (const page of ['homepage', 'record/edit', 'record/view', 'record/search', 'admin/home', 'admin/users'])
      assert(artifacts.view(page, 'default', 'rdmp'), 'Missing installed EJS view: ' + page);
    // These are all 20 application projects in angular/angular.json at the
    // qualified source. The two libraries are consumed by the application builds.
    const applications = [
      'local-auth',
      'export',
      'dashboard',
      'report',
      'report-config',
      'manage-users',
      'record-audit',
      'admin-vocabulary',
      'admin-figshare-vocabulary',
      'dashboard-config-editor',
      'named-query-editor',
      'manage-roles',
      'form',
      'app-config',
      'deleted-records',
      'harvest-runs',
      'branding',
      'translation',
      'record-search',
      'siem-admin',
    ];
    for (const application of applications) {
      const hash = artifacts.bundleHash(application, 'main');
      assert(hash, 'Missing installed production bundle: ' + application);
      assert(existsSync(path.join(artifacts.assets[0], 'angular', application, 'browser', 'main-' + hash + '.js')));
    }
    assert(existsSync(path.join(root, 'node_modules/@researchdatabox/sails-hook-redbox-storage-mongo')));
    const bundled = process.env.SR_ARTIFACT_BUNDLED === 'true';
    assert.equal(existsSync(path.join(root, 'node_modules/redbox-hook-dev')), bundled);
    assert.equal(existsSync(path.join(root, 'packages/redbox-hook-dev')), bundled);
    for (const file of Object.keys(require.cache)) {
      assert(file.startsWith(root + '/'), 'Module outside the installed image: ' + file);
      assert(!file.endsWith('.ts'), 'Source TypeScript shortcut: ' + file);
      assert(!/\/node_modules\/sails\/|\/redbox-core\/dist\/(index|CoreBase)\.js$|\/compat\//.test(file), file);
    }
    console.log(
      JSON.stringify({ node: process.version, npm, applications: applications.length, views: 6, sails: false })
    );
  } finally {
    await artifacts.close();
  }
});
