'use strict';

// Deliberately separate from normal suite startup. No network or publication calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');

const controlJob = 'test-mocha-failure-rehearsal-control';
const producerJob = 'build-mocha-failure-rehearsal';
const directory = process.env.CIRCLE_JOB === controlJob
  ? '.tmp/ci-mocha-failure-rehearsal-control' : '.tmp/ci-mocha-failure-rehearsal';
const authorizationDirectory = `${directory}-authorization`;
const cleanupCompose = `${authorizationDirectory}/compose.yml`;
const producerDirectory = '.tmp/ci-mocha-failure-rehearsal-producer';
const receipt = '/tmp/docker-images/test/mocha-rehearsal-producer.json';
const requiredInputs = ['.circleci/config.yml', 'Dockerfile', '.dockerignore', '.nvmrc',
  'package.json', 'package-lock.json', '.npmrc', 'tsconfig.json',
  'test/bootstrap.test.ts', 'test/integration/.mocharc.js', 'support/build/integration-prebuilt-assets.cjs',
  'support/integration-testing/docker-compose.mocha.yml', 'support/integration-testing/run-mocha-redbox.sh',
  'support/unit-testing/codecov/prepare-report.cjs',
  'support/build/ci-mocha-failure-rehearsal.fixture.txt',
  'support/build/ci-mocha-failure-rehearsal.cjs', 'support/build/ci-mocha-failure-rehearsal.sh'];
const fixture = 'test/integration/services/ci-mocha-failure-rehearsal.generated.test.ts';
const template = path.join(__dirname, 'ci-mocha-failure-rehearsal.fixture.txt');
const junit = '.tmp/junit/backend-mocha/backend-mocha.xml';
const lcov = 'coverage/mocha/lcov.info';
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 30_000, killSignal: 'SIGKILL' }).trim();
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const json = (name, value) => fs.writeFileSync(`${directory}/${name}.json`, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });

function guard(env = process.env) {
  assert.equal(env.CI_MOCHA_FAILURE_REHEARSAL_OPT_IN, 'true', 'Explicit pipeline opt-in required');
  assert.equal(env.CIRCLECI, 'true', 'Only a disposable CircleCI runner is authorized');
  assert.equal(env.CI, 'true');
  assert.ok(['test-mocha-failure-rehearsal', controlJob, producerJob].includes(env.CIRCLE_JOB), 'Wrong rehearsal role');
  assert.ok(env.CIRCLE_WORKFLOW_ID && env.CIRCLE_BUILD_NUM && env.CIRCLE_WORKFLOW_JOB_ID, 'Workflow/job identity is required');
  assert.match(env.CIRCLE_BUILD_NUM, /^[1-9][0-9]*$/, 'Invalid job number');
  assert.equal(env.CIRCLE_BRANCH, 'chore/circleci-performance');
  assert.equal(env.CIRCLE_TAG || '', '', 'Tags cannot rehearse');
  assert.equal(env.CI_MOCHA_FAILURE_REHEARSAL_NPM_MODE, 'none');
  assert.equal(env.CI_MOCHA_FAILURE_REHEARSAL_DOCKER_MODE, 'none');
  assert.equal(env.RBPORTAL_IMAGE, 'redbox-portal:test');
  for (const key of ['RBPORTAL_MOCHA_TEST_PATHS', 'COMPOSE_FILE', 'COMPOSE_PROFILES',
    'COMPOSE_PROJECT_NAME', 'COMPOSE_ENV_FILES', 'RBPORTAL_REUSE_PREBUILT_ASSETS', 'RBPORTAL_EXPECTED_IMAGE_REVISION', 'RBPORTAL_REMOTE_DEBUG',
    'RUN_LIVE_INTEGRATION_TESTS', 'MOCHA_FILE', 'MOCHA_OPTIONS', 'NODE_OPTIONS', 'NYC_CONFIG',
    'MOCHA_GREP', 'MOCHA_INVERT', 'MOCHA_REQUIRE']) {
    assert.ok(!env[key], `${key} must be unset; retain ordinary image-backed suite selection`);
  }
}

// Save cleanup authority before identity/image/input checks. This snapshot is
// bound to measured input before launch; later source changes cannot redirect down.
function authorize() {
  guard();
  assert.notEqual(process.env.CIRCLE_JOB, producerJob);
  fs.mkdirSync('.tmp', { recursive: true });
  fs.mkdirSync(authorizationDirectory, { recursive: false });
  fs.copyFileSync('support/integration-testing/docker-compose.mocha.yml', cleanupCompose, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(cleanupCompose, 0o444);
  fs.writeFileSync(`${authorizationDirectory}/authorization.json`, JSON.stringify({
    job_name: process.env.CIRCLE_JOB, job_id: process.env.CIRCLE_WORKFLOW_JOB_ID,
    workflow_id: process.env.CIRCLE_WORKFLOW_ID, project_name: 'integration-testing', compose_sha256: hash(cleanupCompose),
  }), { flag: 'wx' });
}

function authorized() {
  const receipt = JSON.parse(fs.readFileSync(`${authorizationDirectory}/authorization.json`));
  assert.ok(['test-mocha-failure-rehearsal', controlJob].includes(receipt.job_name));
  for (const [field, key] of [['job_name', 'CIRCLE_JOB'], ['job_id', 'CIRCLE_WORKFLOW_JOB_ID'],
    ['workflow_id', 'CIRCLE_WORKFLOW_ID']]) assert.equal(receipt[field], process.env[key], 'Wrong cleanup/diagnostic authority');
  assert.equal(receipt.project_name, 'integration-testing', 'Wrong authorized project');
  assert.equal(hash(cleanupCompose), receipt.compose_sha256, 'Changed authorized cleanup definition');
}

function validation() {
  try { ready(); return { valid: true }; }
  catch (error) { return { valid: false, error: error.message }; }
}

function requireValidation(result) {
  assert.ok(result.valid, `Evidence validation failed: ${result.error}`);
}

function localIdentity() {
  guard();
  const revision = run('git', ['rev-parse', 'HEAD']);
  assert.match(revision, /^[a-f0-9]{40}$/);
  assert.equal(revision, process.env.CIRCLE_SHA1);
  const imageId = run('docker', ['image', 'inspect', '--format', '{{.Id}}', 'redbox-portal:test']);
  assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
  const archiveHash = run('sha256sum', ['/tmp/docker-images/test/redbox-portal-test.tar']).split(/\s/)[0];
  assert.match(archiveHash, /^[a-f0-9]{64}$/);
  // Hash actual relevant mounted inputs as well as the committed tree. Never
  // trust another job's claimed hashes instead of measuring this checkout.
  const tracked = run('git', ['ls-files', '-z', '--', 'test', 'typescript', 'config',
    'support/integration-testing', 'support/unit-testing', 'support/resources/development/bootstrap-data']);
  const files = {};
  for (const file of [...new Set([...requiredInputs, ...tracked.split('\0').filter(Boolean)])].sort()) files[file] = hash(file);
  const sourceTree = run('git', ['rev-parse', 'HEAD^{tree}']);
  assert.match(sourceTree, /^[a-f0-9]{40}$/);
  return {
    schema_version: 2, job_name: process.env.CIRCLE_JOB, job_id: process.env.CIRCLE_WORKFLOW_JOB_ID,
    revision, source_tree: sourceTree,
    workflow_id: process.env.CIRCLE_WORKFLOW_ID, job_number: process.env.CIRCLE_BUILD_NUM,
    branch: process.env.CIRCLE_BRANCH, tag: process.env.CIRCLE_TAG || '',
    image_id: imageId, image_archive_sha256: archiveHash, fixture_sha256: hash(template),
    files,
  };
}

function sameProducer(identity, producer) {
  assert.equal(producer.schema_version, 2);
  assert.equal(producer.job_name, producerJob);
  assert.ok(typeof producer.job_id === 'string' && producer.job_id);
  assert.match(producer.job_number, /^[1-9][0-9]*$/);
  assert.notEqual(identity.job_id, producer.job_id, 'Consumer and producer job IDs must differ');
  assert.notEqual(identity.job_number, producer.job_number, 'Consumer and producer job numbers must differ');
  for (const key of ['revision', 'source_tree', 'workflow_id', 'branch', 'tag', 'image_id',
    'image_archive_sha256', 'fixture_sha256', 'files']) assert.deepEqual(identity[key], producer[key], `Producer mismatch: ${key}`);
}

function cleanSource() {
  run('git', ['diff', '--exit-code', 'HEAD', '--']);
  assert.equal(run('git', ['ls-files', '--others', '--exclude-standard', '-z']), '', 'Untracked source files are not permitted');
}

function producer() {
  guard();
  assert.equal(process.env.CIRCLE_JOB, producerJob);
  cleanSource();
  const identity = localIdentity();
  fs.mkdirSync('.tmp', { recursive: true });
  fs.mkdirSync(producerDirectory, { recursive: false });
  const data = `${JSON.stringify(identity, null, 2)}\n`;
  fs.writeFileSync(`${producerDirectory}/identity.json`, data, { flag: 'wx' });
  fs.writeFileSync(receipt, data, { flag: 'wx' });
}

function ready() {
  guard();
  assert.notEqual(process.env.CIRCLE_JOB, producerJob);
  const identity = JSON.parse(fs.readFileSync(`${directory}/identity.json`));
  const measured = localIdentity();
  for (const key of Object.keys(measured)) assert.deepEqual(identity[key], measured[key], `Changed identity: ${key}`);
  assert.equal(hash(`${directory}/producer.json`), identity.producer_identity_sha256);
  sameProducer(measured, JSON.parse(fs.readFileSync(`${directory}/producer.json`)));
  if (process.env.CIRCLE_JOB === controlJob) {
    assert.ok(!fs.existsSync(fixture), 'Control must never contain the injected fixture');
  } else {
    assert.equal(hash(fixture), identity.fixture_sha256, 'Generated failure must be unchanged');
    assert.equal(hash(fixture), hash(template));
  }
}

function prepare() {
  guard();
  authorized();
  assert.notEqual(process.env.CIRCLE_JOB, producerJob);
  for (const file of [directory, fixture, junit, lcov]) {
    assert.ok(!fs.existsSync(file), `Refusing stale/colliding rehearsal path: ${file}`);
  }
  cleanSource();
  const identity = localIdentity();
  assert.equal(hash(cleanupCompose), identity.files['support/integration-testing/docker-compose.mocha.yml'],
    'Authorized cleanup definition differs from measured input');
  sameProducer(identity, JSON.parse(fs.readFileSync(receipt)));
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(receipt, `${directory}/producer.json`, fs.constants.COPYFILE_EXCL);
  json('identity', { ...identity, producer_identity_sha256: hash(`${directory}/producer.json`),
    node: process.version, npm: run('npm', ['--version']), compose: run('docker', ['compose', 'version', '--short']) });
  if (process.env.CIRCLE_JOB !== controlJob) {
    fs.copyFileSync(template, fixture, fs.constants.COPYFILE_EXCL);
    fs.copyFileSync(template, `${directory}/injected-fixture.txt`, fs.constants.COPYFILE_EXCL);
  }
}

function capture(stage) {
  authorized();
  fs.mkdirSync(directory, { recursive: true });
  const checked = validation();
  const entries = { validation: checked };
  // Copy independently: retain LCOV even when JUnit is missing, and vice versa.
  for (const [name, source] of [['lcov.info', lcov], ['backend-mocha.xml', junit]]) {
    try {
      const destination = `${directory}/${stage}-${name}`;
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      entries[name] = { sha256: hash(destination), bytes: fs.statSync(destination).size };
    } catch (error) { entries[name] = { error: error.code || error.message }; }
  }
  json(stage, entries);
  requireValidation(checked);
  assert.ok(['lcov.info', 'backend-mocha.xml'].every(name => entries[name].bytes > 0), `${stage}: missing or empty reports; see retained evidence`);
}

// Linux runners can retain orphan zombies until init reaps them. Count only
// executable group members: kill(0) alone also reports those dead processes.
function groupAlive(pgid) {
  return fs.readdirSync('/proc').some(pid => {
    if (!/^[0-9]+$/.test(pid)) return false;
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(') ') + 2).split(' ');
      return Number(fields[2]) === pgid && !['Z', 'X'].includes(fields[0]);
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes(error.code)) return false;
      throw error;
    }
  });
}

// The supervisor stays outside the detached group. A leader exit is not group
// completion; surviving workers get TERM then KILL even after a zero exit.
function boundedSpawn(command, args, { logFile, env = process.env, timeoutMs = 240_000, killAfterMs = 5_000 }) {
  const fd = logFile ? fs.openSync(logFile, 'wx') : null;
  return new Promise(resolve => {
    let child;
    let deadline;
    let escalation;
    let reaping;
    let poll;
    let exited = false;
    let stopping = false;
    let finished = false;
    const result = { timeout_ms: timeoutMs, kill_after_ms: killAfterMs, exit: null, signal: null, timed_out: false, descendants_survived: false, group_remaining: false };
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      clearTimeout(escalation);
      clearTimeout(reaping);
      clearInterval(poll);
      child?.unref();
      resolve(result);
    };
    const kill = signal => {
      try { process.kill(-child.pid, signal); }
      catch (error) { if (error.code !== 'ESRCH') result.error = error.message; }
    };
    const stop = () => {
      if (stopping) return;
      stopping = true;
      kill('SIGTERM');
      escalation = setTimeout(() => {
        kill('SIGKILL');
        reaping = setTimeout(() => {
          result.group_remaining = groupAlive(child.pid);
          if (!exited) result.error = 'Leader exit was not observed after SIGKILL';
          finish();
        }, 1_000);
      }, killAfterMs);
    };
    try {
      child = spawn(command, args, { env, detached: true, stdio: fd === null ? 'inherit' : ['ignore', fd, fd] });
    } catch (error) {
      if (fd !== null) fs.closeSync(fd);
      result.error = error.message;
      finish();
      return;
    }
    if (fd !== null) fs.closeSync(fd);
    child.once('error', error => { result.error = error.message; finish(); });
    child.once('exit', (code, signal) => {
      exited = true;
      result.exit = code;
      result.signal = signal;
      if (groupAlive(child.pid)) {
        result.descendants_survived = true;
        stop();
      } else finish();
    });
    poll = setInterval(() => {
      if (exited && !groupAlive(child.pid)) finish();
    }, 25);
    deadline = setTimeout(() => {
      result.timed_out = true;
      stop();
    }, timeoutMs);
  });
}

function composeEnvironment() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('COMPOSE_')));
  env.COMPOSE_DISABLE_ENV_FILE = 'true';
  env.RBPORTAL_IMAGE = 'redbox-portal:test';
  return env;
}

const composeArgs = ['compose', '--project-name', 'integration-testing', '--project-directory', './support/integration-testing',
  '--profile', 'portal', '-f', cleanupCompose];

// Only the rehearsal prepends this adapter to PATH. Preserve the ordinary npm
// script and up/down status semantics, replacing its mutable Compose arguments
// for BOTH operations. Recheck authority before every invocation, not readiness.
async function composeProxy(args) {
  authorized();
  assert.deepEqual(args.slice(0, 5), ['compose', '--profile', 'portal', '-f', './support/integration-testing/docker-compose.mocha.yml']);
  assert.ok(['up', 'down'].includes(args[5]), 'Unexpected rehearsal Compose operation');
  const child = spawn(process.env.REHEARSAL_DOCKER, [...composeArgs, ...args.slice(5)],
    { env: composeEnvironment(), stdio: 'inherit' });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 128 + osSignal(signal) : 1); resolve(); });
  });
}

function osSignal(signal) { return require('node:os').constants.signals[signal] || 1; }

function recordStatus(suiteExit, teeExit, supervision) {
  authorized();
  fs.mkdirSync(directory, { recursive: true });
  const checked = validation();
  json('suite-status', { command: supervision ? 'npm run test:mocha:ci' : 'timeout 1800s npm run test:mocha:ci', suite_exit: suiteExit,
    tee_exit: teeExit, compose_sha256: hash(cleanupCompose), project_name: 'integration-testing',
    ...(supervision ? { supervision } : {}), validation: checked });
  requireValidation(checked);
}

async function suite() {
  console.log("Rehearsal: checking suite authorization and inputs");
  authorized();
  try { ready(); }
  catch (error) { recordStatus(null, null); throw error; }
  const docker = process.env.PATH.split(path.delimiter).map(dir => path.resolve(dir, 'docker')).find(file => {
    try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; }
  });
  assert.ok(docker, 'Docker executable required');
  const adapter = `${authorizationDirectory}/bin`;
  fs.mkdirSync(adapter);
  // Absolute, shell-quoted paths are required: checkout paths may contain spaces.
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  fs.writeFileSync(`${adapter}/docker`, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(__filename)} compose-proxy "$@"\n`, { flag: 'wx', mode: 0o755 });
  const env = { ...composeEnvironment(), REHEARSAL_DOCKER: docker, PATH: `${path.resolve(adapter)}:${process.env.PATH}` };
  // Both npm and tee live in the bounded group. The parent writes final status
  // even if TERM/KILL prevents the pipeline from saving its own PIPESTATUS.
  const statusesFile = `${directory}/pipeline-status.json`;
  const pipeline = `set -uo pipefail; npm run test:mocha:ci 2>&1 | tee ${quote(`${directory}/suite.log`)}; statuses=("\${PIPESTATUS[@]}"); printf '[%s,%s]\\n' "\${statuses[0]}" "\${statuses[1]}" > ${quote(statusesFile)}`;
  console.log('Rehearsal: starting bounded suite');
  const result = await boundedSpawn('bash', ['-c', pipeline], { env, timeoutMs: 1_800_000 });
  console.log('Rehearsal: suite group finished; recording status');
  let statuses = [result.timed_out ? 124 : (result.exit || (result.signal ? 128 + osSignal(result.signal) : 1)), null];
  if (fs.existsSync(statusesFile)) statuses = JSON.parse(fs.readFileSync(statusesFile));
  const failedGroup = result.timed_out || result.descendants_survived || result.group_remaining || result.error || result.signal;
  if (result.timed_out) statuses[0] = 124;
  let recorded = true;
  try { recordStatus(...statuses, result); }
  catch (error) { recorded = false; console.error(error.message); }
  process.exitCode = statuses[0] || (!recorded || failedGroup || statuses[1] !== 0 || process.env.CIRCLE_JOB !== controlJob ? 1 : 0);
}

async function teardown() {
  authorized();
  fs.mkdirSync(directory, { recursive: true });
  const args = [...composeArgs, 'down', '-v', '--remove-orphans', '--timeout', '180'];
  const env = composeEnvironment();
  const result = await boundedSpawn('docker', args, { logFile: `${directory}/teardown.log`, env });
  const checked = validation();
  json('teardown-status', { command: ['docker', ...args], compose_sha256: hash(cleanupCompose), ...result, validation: checked });
  requireValidation(checked);
  assert.ok(result.exit === 0 && !result.signal && !result.error && !result.timed_out && !result.descendants_survived && !result.group_remaining,
    'Always-run teardown failed; inspect retained log/status');
}

async function main([action, ...args]) {
  if (action === 'suite' && !args.length) await suite();
  else if (action === 'compose-proxy') await composeProxy(args);
  else if (action === 'producer' && !args.length) producer();
  else if (action === 'teardown' && !args.length) await teardown();
  else if (action === 'authorize' && !args.length) authorize();
  else if (action === 'guard' && !args.length) guard();
  else if (action === 'prepare' && !args.length) prepare();
  else if (action === 'ready' && !args.length) ready();
  else if (['raw', 'prepared'].includes(action) && !args.length) capture(action);
  else if (action === 'record-status' && args.length === 2) {
    const notRun = args.every(arg => arg === 'not-run');
    const statuses = notRun ? [null, null] : args.map(Number);
    assert.ok(notRun || statuses.every(status => Number.isInteger(status) && status >= 0 && status <= 255));
    recordStatus(...statuses);
  } else throw new Error('Usage: ci-mocha-failure-rehearsal.cjs producer|suite|compose-proxy|teardown|guard|authorize|prepare|ready|raw|prepared|record-status SUITE_EXIT TEE_EXIT');
}

// Keep the historical exported failure path stable when safeguard tests run
// inside the control job; runtime actions use the private role-specific path.
module.exports = { guard, directory: '.tmp/ci-mocha-failure-rehearsal', fixture, requiredInputs };
if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`Mocha failure rehearsal rejected: ${error.message}`); process.exitCode = 1;
  });
}
