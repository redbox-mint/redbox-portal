'use strict';

// Deliberately separate from normal suite startup. No network or publication calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const directory = '.tmp/ci-mocha-failure-rehearsal';
const fixture = 'test/integration/services/ci-mocha-failure-rehearsal.generated.test.ts';
const template = path.join(__dirname, 'ci-mocha-failure-rehearsal.fixture.txt');
const junit = '.tmp/junit/backend-mocha/backend-mocha.xml';
const lcov = 'coverage/mocha/lcov.info';
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const json = (name, value) => fs.writeFileSync(`${directory}/${name}.json`, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });

function guard(env = process.env) {
  assert.equal(env.CI_MOCHA_FAILURE_REHEARSAL_OPT_IN, 'true', 'Explicit pipeline opt-in required');
  assert.equal(env.CIRCLECI, 'true', 'Only a disposable CircleCI runner is authorized');
  assert.equal(env.CI, 'true');
  assert.equal(env.CIRCLE_JOB, 'test-mocha-failure-rehearsal');
  assert.ok(env.CIRCLE_WORKFLOW_ID && env.CIRCLE_BUILD_NUM, 'Workflow/job identity is required');
  assert.equal(env.CIRCLE_BRANCH, 'chore/circleci-performance');
  assert.equal(env.CIRCLE_TAG || '', '', 'Tags cannot rehearse');
  assert.equal(env.CI_MOCHA_FAILURE_REHEARSAL_NPM_MODE, 'none');
  assert.equal(env.CI_MOCHA_FAILURE_REHEARSAL_DOCKER_MODE, 'none');
  assert.equal(env.RBPORTAL_IMAGE, 'redbox-portal:test');
  for (const key of ['RBPORTAL_MOCHA_TEST_PATHS', 'COMPOSE_FILE', 'COMPOSE_PROFILES',
    'RBPORTAL_REUSE_PREBUILT_ASSETS', 'RBPORTAL_EXPECTED_IMAGE_REVISION', 'RBPORTAL_REMOTE_DEBUG']) {
    assert.ok(!env[key], `${key} must be unset; retain ordinary image-backed suite selection`);
  }
}

function ready() {
  guard();
  const identity = JSON.parse(fs.readFileSync(`${directory}/identity.json`));
  assert.equal(identity.revision, process.env.CIRCLE_SHA1);
  assert.equal(identity.job_number, process.env.CIRCLE_BUILD_NUM);
  assert.equal(hash(fixture), identity.fixture_sha256, 'Generated failure must be unchanged');
  assert.equal(hash(fixture), hash(template));
}

function prepare() {
  guard();
  // Never remove or overwrite source, reports, or another run's evidence.
  for (const file of [directory, fixture, junit, lcov]) {
    assert.ok(!fs.existsSync(file), `Refusing stale/colliding rehearsal path: ${file}`);
  }
  const revision = run('git', ['rev-parse', 'HEAD']);
  assert.match(revision, /^[a-f0-9]{40}$/);
  assert.equal(revision, process.env.CIRCLE_SHA1);
  run('git', ['diff', '--exit-code', 'HEAD', '--']);
  assert.equal(run('git', ['ls-files', '--others', '--exclude-standard', '-z']), '', 'Untracked source files are not permitted');
  const imageId = run('docker', ['image', 'inspect', '--format', '{{.Id}}', 'redbox-portal:test']);
  assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
  const archiveHash = run('sha256sum', ['/tmp/docker-images/test/redbox-portal-test.tar']).split(/\s/)[0];
  assert.match(archiveHash, /^[a-f0-9]{64}$/);
  const files = {};
  for (const file of ['.circleci/config.yml', 'package.json', 'package-lock.json',
    'support/integration-testing/docker-compose.mocha.yml', 'support/integration-testing/run-mocha-redbox.sh',
    'support/unit-testing/codecov/prepare-report.cjs']) files[file] = hash(file);
  fs.mkdirSync(directory, { recursive: true });
  json('identity', {
    revision, source_tree: run('git', ['rev-parse', 'HEAD^{tree}']),
    workflow_id: process.env.CIRCLE_WORKFLOW_ID, job_number: process.env.CIRCLE_BUILD_NUM,
    branch: process.env.CIRCLE_BRANCH, tag: process.env.CIRCLE_TAG || '',
    image_id: imageId, image_archive_sha256: archiveHash, fixture_sha256: hash(template),
    node: process.version, npm: run('npm', ['--version']), compose: run('docker', ['compose', 'version', '--short']),
    files,
  });
  fs.copyFileSync(template, fixture, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(template, `${directory}/injected-fixture.txt`, fs.constants.COPYFILE_EXCL);
}

function capture(stage) {
  ready();
  const entries = {};
  // Copy independently: retain LCOV even when JUnit is missing, and vice versa.
  for (const [name, source] of [['lcov.info', lcov], ['backend-mocha.xml', junit]]) {
    try {
      const destination = `${directory}/${stage}-${name}`;
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      entries[name] = { sha256: hash(destination), bytes: fs.statSync(destination).size };
    } catch (error) { entries[name] = { error: error.code || error.message }; }
  }
  json(stage, entries);
  assert.ok(Object.values(entries).every(entry => entry.bytes > 0), `${stage}: missing or empty reports; see retained evidence`);
}

function main([action, ...args]) {
  if (action === 'guard' && !args.length) guard();
  else if (action === 'prepare' && !args.length) prepare();
  else if (action === 'ready' && !args.length) ready();
  else if (['raw', 'prepared'].includes(action) && !args.length) capture(action);
  else if (action === 'record-status' && args.length === 2) {
    ready();
    const statuses = args.map(Number);
    assert.ok(statuses.every(status => Number.isInteger(status) && status >= 0 && status <= 255));
    json('suite-status', { command: 'timeout 1800s npm run test:mocha:ci', suite_exit: statuses[0], tee_exit: statuses[1] });
  } else throw new Error('Usage: ci-mocha-failure-rehearsal.cjs guard|prepare|ready|raw|prepared|record-status SUITE_EXIT TEE_EXIT');
}

module.exports = { guard, directory, fixture };
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`Mocha failure rehearsal rejected: ${error.message}`); process.exitCode = 1; }
}
