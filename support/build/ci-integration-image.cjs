#!/usr/bin/env node
// Content smoke check for the opt-in portal images, not a replacement for suites.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');

function inventory(directory) {
  const files = [];
  function visit(relative) {
    const filename = path.join(directory, relative);
    const stat = fs.lstatSync(filename);
    assert(!stat.isSymbolicLink(), `Unexpected fixture symlink: ${filename}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(filename).sort()) visit(path.join(relative, name));
    } else {
      assert(stat.isFile(), `Unexpected fixture entry: ${filename}`);
      files.push([relative, createHash('sha256').update(fs.readFileSync(filename)).digest('hex')]);
    }
  }
  visit('');
  return files;
}

function verify(suite, revision, root = process.cwd()) {
  assert(['mocha', 'playwright'].includes(suite), 'Suite must be mocha or playwright');
  root = path.resolve(root);
  assert(!fs.existsSync(path.join(root, '.git')), 'Integration image must not contain a checkout');
  const load = createRequire(path.join(root, 'package.json'));
  const assets = load('./support/build/integration-prebuilt-assets.cjs').verify(root, revision);
  const required = [
    'package.json', 'package-lock.json', '.sailsrc', 'app.js', 'app.integrationtest.js',
    'tsconfig.json', 'typescript/styles.d.ts', 'typescript/assets/default/default/js/client-script.ts',
    'test/bootstrap.test.ts', 'test/integration/.mocharc.js',
    'test/integration/services/FormRecordConsistencyService.test.ts',
    'test/integration/services/VocabularyBootstrapData.test.ts',
    'packages/redbox-core/test/fixtures/metadata-projection.fixtures.ts',
    'packages/redbox-core/src/index.ts', 'packages/redbox-core/dist/index.js',
    'packages/redbox-core/dist/index.d.ts', 'packages/redbox-core/dist/index.d.ts.map',
    'packages/redbox-dev-tools/config/tsconfig.base.json',
    'support/integration-testing/run-mocha-redbox.sh',
    'support/integration-testing/run-playwright-redbox.sh',
    'support/integration-testing/install-redbox-dependencies-if-writable.sh',
    'support/development/compileDevAngular.sh', 'support/build/compileProductionAngular.sh',
    'config/env/integrationtest.js', 'angular/angular.json',
  ];
  for (const relative of required) {
    assert(fs.statSync(path.join(root, relative)).isFile(), `Missing payload: ${relative}`);
  }
  for (const name of ['typescript', 'ts-node/register', 'mocha', 'chai', 'sinon', 'mocha-junit-reporter', 'nyc',
    '@tsconfig/node24/tsconfig.json', '@types/node/package.json', '@types/mocha/package.json',
    '@types/chai/package.json', '@types/sinon/package.json']) load.resolve(name);
  for (const name of ['mocha', 'nyc', 'ts-node', 'tsc']) {
    fs.accessSync(path.join(root, 'node_modules/.bin', name), fs.constants.X_OK);
  }
  const manifest = load('./package.json');
  const lock = load('./package-lock.json');
  assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies, 'Root dependency lock differs');
  assert.deepEqual(lock.packages[''].devDependencies, manifest.devDependencies, 'Root dev dependency lock differs');
  const packages = [];
  for (const [name, spec] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (!/^(file:|\.\.?\/)/.test(spec) || spec.endsWith('.tgz')) continue;
    const directory = fs.realpathSync(path.resolve(root, spec.replace(/^file:/, '')));
    const search = load.resolve.paths(name) || [];
    const linked = search.map(base => path.join(base, name)).find(candidate => fs.existsSync(candidate));
    assert(linked, `Missing local dependency: ${name}`);
    assert.equal(fs.realpathSync(linked), directory, `Local dependency link differs: ${name}`);
    const local = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
    if (local.main) assert(fs.statSync(path.resolve(directory, local.main)).isFile(), `Missing local entrypoint: ${name}`);
    packages.push(name);
  }
  const core = load('@researchdatabox/redbox-core');
  createRequire(load.resolve('@researchdatabox/redbox-core'))('@uppy/companion');
  load('redbox-hook-dev');
  assert.equal(typeof core.generateAllShims, 'function');
  assert.deepEqual(inventory(path.join(root, 'bootstrap-data')),
    inventory(path.join(root, 'support/resources/development/bootstrap-data')),
    'Bootstrap fixtures must replace the production tree exactly');
  const configs = { emailnotification: 'test/resources/config/emailnotification.js' };
  if (suite === 'mocha') {
    configs.recordtype = 'support/integration-testing/recordtype-solr-multi-core-example.js';
    configs.solr = 'support/integration-testing/solr-multi-core-example.js';
  }
  for (const [name, source] of Object.entries(configs)) {
    assert.deepEqual(load(`./config/${name}.js`)[name], load(`./${source}`)[name],
      `Effective ${suite} config differs: ${name}`);
  }
  for (const relative of ['.', 'api', 'config', 'bootstrap-data', '.tmp', '.tmp/junit/backend-mocha',
    'attachments', 'reports', 'coverage/mocha', 'coverage/playwright']) {
    // Actually create/delete a file: mode bits alone do not prove this user's access.
    const filename = path.join(root, relative, `.ci-integration-write-${process.pid}`);
    fs.writeFileSync(filename, '', { flag: 'wx' });
    fs.unlinkSync(filename);
  }
  return { suite, revision, assets: assets.files.length, localPackages: packages, uid: process.getuid(), gid: process.getgid() };
}

module.exports = { verify, inventory };
if (require.main === module) {
  try {
    const [command, suite, revision, root] = process.argv.slice(2);
    assert(command === 'verify' && process.argv.length >= 5 && process.argv.length <= 6,
      'Usage: ci-integration-image.cjs verify mocha|playwright FULL_GIT_REVISION [ROOT]');
    console.log(JSON.stringify(verify(suite, revision, root)));
  } catch (error) {
    console.error(`Integration image rejected: ${error.stack}`);
    process.exitCode = 1;
  }
}
