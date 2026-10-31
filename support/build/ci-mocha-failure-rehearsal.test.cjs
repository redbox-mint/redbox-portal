'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const yaml = require('js-yaml');
const { guard, directory, fixture, requiredInputs } = require('./ci-mocha-failure-rehearsal.cjs');

const root = path.resolve(__dirname, '../..');
const config = yaml.load(fs.readFileSync(path.join(root, '.circleci/config.yml'), 'utf8'));
const job = config.jobs['test-mocha-failure-rehearsal'];
const original = config.jobs['test-mocha'];
const branch = 'chore/circleci-performance';
const environment = {
  CIRCLECI: 'true', CI: 'true', CIRCLE_JOB: 'test-mocha-failure-rehearsal', CIRCLE_BRANCH: branch, CIRCLE_TAG: '',
  CIRCLE_WORKFLOW_JOB_ID: 'suite-id', CIRCLE_SHA1: 'a'.repeat(40), CIRCLE_WORKFLOW_ID: 'synthetic-workflow', CIRCLE_BUILD_NUM: '123',
  CI_MOCHA_FAILURE_REHEARSAL_OPT_IN: 'true', CI_MOCHA_FAILURE_REHEARSAL_NPM_MODE: 'none',
  CI_MOCHA_FAILURE_REHEARSAL_DOCKER_MODE: 'none', RBPORTAL_IMAGE: 'redbox-portal:test',
};
const helper = path.join(__dirname, 'ci-mocha-failure-rehearsal.cjs');

test('removing only the rehearsal declarations reconstructs the entire pre-edit config', () => {
  const restored = structuredClone(config);
  delete restored.jobs['build-mocha-failure-rehearsal'];
  delete restored.jobs['test-mocha-failure-rehearsal'];
  delete restored.jobs['test-mocha-failure-rehearsal-control'];
  delete restored.parameters.ci_mocha_failure_rehearsal;
  delete restored.workflows.mocha_failure_rehearsal;
  assert.equal(createHash('sha256').update(JSON.stringify(restored)).digest('hex'),
    require('./ci-mocha-failure-rehearsal.contract.json').original_config_sha256);
  const producer = config.jobs['build-mocha-failure-rehearsal'];
  const restoredProducer = structuredClone(producer);
  restoredProducer.environment = config.jobs.build.environment;
  restoredProducer.steps = restoredProducer.steps.filter(step => !step.run?.name.includes('rehearsal') &&
    step.store_artifacts?.destination !== 'ci-mocha-failure-rehearsal-producer');
  restoredProducer.steps.find(step => step.persist_to_workspace).persist_to_workspace.paths.pop();
  assert.deepEqual(restoredProducer, config.jobs.build);
  assert.ok(producer.steps.findIndex(step => step.run?.name === 'Save Docker image') <
    producer.steps.findIndex(step => step.run?.command.endsWith('.cjs producer')));
  assert.deepEqual(config.parameters.ci_mocha_failure_rehearsal, { type: 'boolean', default: false });
});

test('the workflow opts in only on the exact chore/no-tag/no-publication cohort; it has no publication job', () => {
  const workflow = config.workflows.mocha_failure_rehearsal;
  assert.equal(workflow.when.and.length, 5);
  for (const optIn of [true, false]) for (const candidate of [branch, `${branch}-extra`, `${branch}/nested`,
    `prefix/${branch}`, `${branch}\n`, '', 'master', 'develop', 'support/v5', 'dependabot/npm/foo', 'feature/example']) {
    for (const tag of ['', 'v5.0.0', 'v5.0.0-RC1']) for (const npm of ['none', 'beta']) for (const docker of ['none', 'manual']) {
      const values = { '<< pipeline.parameters.ci_mocha_failure_rehearsal >>': optIn,
        '<< pipeline.git.branch >>': candidate, '<< pipeline.git.tag >>': tag,
        '<< pipeline.parameters.npm_publish_mode >>': npm, '<< pipeline.parameters.docker_publish_mode >>': docker };
      const selected = workflow.when.and.every(({ equal: [left, right] }) => left === values[right]);
      assert.equal(selected, optIn && candidate === branch && tag === '' && npm === 'none' && docker === 'none');
    }
  }
  const invocations = workflow.jobs.map(item => ({ name: Object.keys(item)[0], ...Object.values(item)[0] }));
  assert.deepEqual(invocations.map(item => item.name),
    require('./ci-mocha-failure-rehearsal.contract.json').paired_workflow_jobs);
  assert.deepEqual(invocations[1].requires, ['build-mocha-failure-rehearsal']);
  assert.deepEqual(invocations[2].requires, ['build-mocha-failure-rehearsal']);
  assert.deepEqual(invocations[3].requires, ['test-mocha-failure-rehearsal']);
  for (const item of invocations) assert.deepEqual(item.filters, { branches: { only: branch }, tags: { ignore: '/.*/' } });
  for (const [name, flow] of Object.entries(config.workflows)) {
    if (name === 'mocha_failure_rehearsal') continue;
    assert.ok(!JSON.stringify(flow).includes('failure-rehearsal'), `${name} must be unchanged`);
  }
});

test('rehearsal keeps image setup, suite timeout, always-run fatal coverage upload and JUnit storage', () => {
  const steps = job.steps;
  for (const name of ['Use patched Node.js from .nvmrc', 'Load Docker image', 'Point compose at tested image',
    'Install npm dependencies', 'Install codecov', 'Setup test directories', 'Upload Mocha code coverage']) {
    assert.deepEqual(steps.find(s => s.run?.name === name), original.steps.find(s => s.run?.name === name), name);
  }
  assert.ok(!JSON.stringify(job).includes('npm run compile:'));
  assert.deepEqual(steps.find(s => s.store_test_results), { store_test_results: { path: '.tmp/junit' } });
  const raw = steps.findIndex(s => s.run?.name === 'Retain raw failure reports before coverage preparation');
  const upload = steps.findIndex(s => s.run?.name === 'Upload Mocha code coverage');
  const prepared = steps.findIndex(s => s.run?.name === 'Retain prepared failure reports and evidence');
  assert.ok(raw < upload && upload < prepared && prepared < steps.findIndex(s => s.store_artifacts));
  for (const index of [raw, upload, prepared]) assert.equal(steps[index].run.when, 'always');
  assert.equal(steps.find(s => s.run?.name === 'Authorize isolated Mocha failure rehearsal').run.command,
    'node support/build/ci-mocha-failure-rehearsal.cjs authorize');
  const suite = steps.find(s => s.run?.name === 'Run deliberately failing Mocha integration suite').run;
  assert.equal(suite.no_output_timeout, '35m');
  assert.equal(suite.command, 'bash support/build/ci-mocha-failure-rehearsal.sh');
});

test('runtime guard rejects missing opt-in, alternate events, publication modes and suite/image overrides', () => {
  assert.doesNotThrow(() => guard(environment));
  for (const [key, values] of Object.entries({
    CI_MOCHA_FAILURE_REHEARSAL_OPT_IN: [undefined, 'false', '1', 'TRUE'], CIRCLECI: [undefined, 'false'],
    CI: [undefined, 'false'], CIRCLE_JOB: [undefined, 'test-mocha'], CIRCLE_WORKFLOW_ID: [undefined],
    CIRCLE_BUILD_NUM: [undefined], CIRCLE_WORKFLOW_JOB_ID: [undefined], CIRCLE_BRANCH: ['master', `${branch}-extra`, `${branch}\n`],
    CIRCLE_TAG: ['v5.0.0'], CI_MOCHA_FAILURE_REHEARSAL_NPM_MODE: [undefined, 'beta'],
    CI_MOCHA_FAILURE_REHEARSAL_DOCKER_MODE: [undefined, 'manual'], RBPORTAL_IMAGE: ['other:image'],
    RBPORTAL_MOCHA_TEST_PATHS: ['one.test.ts'], COMPOSE_FILE: ['override.yml'], COMPOSE_PROFILES: ['mount'], COMPOSE_PROJECT_NAME: ['other-project'], COMPOSE_ENV_FILES: ['other.env'],
    RBPORTAL_REUSE_PREBUILT_ASSETS: ['true'], RBPORTAL_EXPECTED_IMAGE_REVISION: ['a'.repeat(40)],
    RBPORTAL_REMOTE_DEBUG: ['9229'], RUN_LIVE_INTEGRATION_TESTS: ['true', 'false'],
    MOCHA_FILE: ['elsewhere.xml'], NODE_OPTIONS: ['--require=other.cjs'],
  })) for (const value of values) assert.throws(() => guard({ ...environment, [key]: value }), `${key}=${value}`);
});

test('no publication invocation in any enabled workflow can select the eligible rehearsal event', () => {
  const values = { '<< pipeline.parameters.ci_mocha_failure_rehearsal >>': true,
    '<< pipeline.git.branch >>': branch, '<< pipeline.git.tag >>': '',
    '<< pipeline.parameters.npm_publish_mode >>': 'none', '<< pipeline.parameters.docker_publish_mode >>': 'none' };
  const enabled = condition => !condition || (condition.and ? condition.and.every(enabled) :
    condition.equal[0] === values[condition.equal[1]]);
  const matches = pattern => Array.isArray(pattern) ? pattern.some(matches) :
    pattern.startsWith('/') ? new RegExp(pattern.slice(1, -1)).test(branch) : pattern === branch;
  const included = invocation => {
    const filter = typeof invocation === 'string' ? undefined : Object.values(invocation)[0]?.filters?.branches;
    return (!filter?.only || matches(filter.only)) && (!filter?.ignore || !matches(filter.ignore));
  };
  for (const [name, workflow] of Object.entries(config.workflows)) {
    if (!enabled(workflow.when)) continue;
    for (const invocation of workflow.jobs) {
      const jobName = typeof invocation === 'string' ? invocation : Object.keys(invocation)[0];
      if (!/^(deploy|publish-|npm-publish|generate-docs)/.test(jobName)) continue;
      if (!included(invocation)) continue;
      // Existing Dependabot deploy invocations ignore Dependabot, but every
      // required suite is Dependabot-only. CircleCI does not execute a job
      // when ALL of its dependencies have been filtered out. Preserve this
      // existing behavior; a partially filtered requires list is insufficient.
      const dependencies = Object.values(invocation)[0]?.requires || [];
      assert.ok(dependencies.length > 0 && dependencies.every(dependency => {
        const parent = workflow.jobs.find(item => typeof item === 'string' ? item === dependency :
          Object.keys(item)[0] === dependency || Object.values(item)[0]?.name === dependency ||
          Object.values(item)[0]?.matrix?.alias === dependency);
        assert.ok(parent, `Missing ${dependency}`);
        return !included(parent);
      }), `${name}: ${jobName} could publish`);
    }
  }
});

function sandbox({ shortTeardown = false, shortSuite = false, realCompose = false, slowPhases = false, removeFinishPhase = false } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-mocha-failure-rehearsal-test-'));
  const write = (file, content, executable = false) => {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), content, executable ? { mode: 0o755 } : {});
  };
  for (const extension of ['cjs', 'sh', 'fixture.txt']) write(`support/build/ci-mocha-failure-rehearsal.${extension}`,
    fs.readFileSync(path.join(__dirname, `ci-mocha-failure-rehearsal.${extension}`)));
  for (const file of requiredInputs) {
    if (!fs.existsSync(path.join(cwd, file))) write(file, 'synthetic provenance fixture');
  }
  if (realCompose) write('support/integration-testing/docker-compose.mocha.yml',
    fs.readFileSync(path.join(root, 'support/integration-testing/docker-compose.mocha.yml')));
  write('.gitignore', '.tmp/\nproducer-receipt.json\n');
  const script = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).scripts['test:mocha:ci'];
  write('package.json', JSON.stringify({ scripts: { 'test:mocha:ci': script } }));
  fs.mkdirSync(path.join(cwd, 'test/integration/services'), { recursive: true });
  write('bin/git', `#!/bin/sh\ncase "$*" in\n 'rev-parse HEAD') echo '${environment.CIRCLE_SHA1}';;\n 'rev-parse HEAD^{tree}') echo '${'b'.repeat(40)}';;\n 'diff --exit-code HEAD --'|'ls-files --others --exclude-standard -z'|ls-files*) exit 0;;\n *) exit 99;;\nesac\n`, true);
  write('bin/sha256sum', `#!/bin/sh\necho '${'c'.repeat(64)}  synthetic-archive'\n`, true);
  write('bin/docker', `#!/usr/bin/env bash
case "$*" in
  'image inspect --format {{.Id}} redbox-portal:test') echo 'sha256:${'d'.repeat(64)}';;
  'compose version --short') echo '2.40.0';;
  *' up '*) echo 'SYNTHETIC Docker up' >> "$DOCKER_LOG"; echo 'synthetic suite output'; exit "$TEST_STATUS";;
  *' down '*) echo 'SYNTHETIC Docker down' >> "$DOCKER_LOG"; echo 'synthetic teardown output'; exit "$CLEANUP_STATUS";;
  *) exit 99;;
esac
`, true);
  const env = { PATH: `${cwd}/bin:${process.env.PATH}`, ...environment, DOCKER_LOG: `${cwd}/docker.log` };
  const localHelper = path.join(cwd, 'support/build/ci-mocha-failure-rehearsal.cjs');
  fs.writeFileSync(localHelper, fs.readFileSync(localHelper, 'utf8')
    .replace('/tmp/docker-images/test/mocha-rehearsal-producer.json', `${cwd}/producer-receipt.json`)
    .replace('timeoutMs = 240_000, killAfterMs = 5_000', shortTeardown ?
      'timeoutMs = 700, killAfterMs = 150' : 'timeoutMs = 240_000, killAfterMs = 5_000')
    .replace('timeoutMs: 1_800_000', shortSuite ? 'timeoutMs: 1_500' : 'timeoutMs: 1_800_000')
    .replace("  console.log('Rehearsal: suite group finished; recording status');", removeFinishPhase ? '' : "  console.log('Rehearsal: suite group finished; recording status');")
    .replace('  try { ready(); }', slowPhases ? '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);\n  try { ready(); }' : '  try { ready(); }')
    .replace('  try { recordStatus(...statuses, result); }', slowPhases ? '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);\n  try { recordStatus(...statuses, result); }' : '  try { recordStatus(...statuses, result); }'));
  const execute = (command, args, extra = {}) => spawnSync(command,
    args.map(arg => arg === helper ? localHelper : arg), { cwd, env: { ...env, ...extra }, encoding: 'utf8', timeout: 30_000 });
  const prepareProducer = (extra = {}) => {
    fs.rmSync(path.join(cwd, '.tmp/ci-mocha-failure-rehearsal-producer'), { recursive: true, force: true });
    fs.rmSync(path.join(cwd, 'producer-receipt.json'), { force: true });
    const result = execute(process.execPath, [helper, 'producer'], { ...extra,
      CIRCLE_JOB: 'build-mocha-failure-rehearsal', CIRCLE_BUILD_NUM: '122', CIRCLE_WORKFLOW_JOB_ID: 'build-id' });
    assert.equal(result.status, 0, result.stderr);
  };
  prepareProducer();
  for (const role of [{}, { CIRCLE_JOB: 'test-mocha-failure-rehearsal-control',
    CIRCLE_WORKFLOW_JOB_ID: 'control-id', CIRCLE_BUILD_NUM: '124' }]) {
    const result = execute(process.execPath, [helper, 'authorize'], role);
    assert.equal(result.status, 0, result.stderr);
  }
  return { cwd, write, execute, prepareProducer, clean: () => fs.rmSync(cwd, { recursive: true, force: true }) };
}

test('real npm/Compose shell command and wrapper preserve nonzero status through teardown and tee (controlled Docker)', () => {
  for (const [suite, cleanup] of [[23, 0], [23, 17], [0, 17], [124, 0]]) {
    const s = sandbox();
    try {
      assert.equal(s.execute(process.execPath, [helper, 'prepare']).status, 0);
      const result = s.execute('bash', ['support/build/ci-mocha-failure-rehearsal.sh'],
        { TEST_STATUS: String(suite), CLEANUP_STATUS: String(cleanup) });
      assert.equal(result.status, suite || 1, result.stderr);
      const report = JSON.parse(fs.readFileSync(path.join(s.cwd, directory, 'suite-status.json')));
      assert.equal(report.suite_exit, suite);
      assert.equal(report.tee_exit, 0);
      assert.deepEqual(fs.readFileSync(path.join(s.cwd, 'docker.log'), 'utf8').trim().split('\n'),
        ['SYNTHETIC Docker up', 'SYNTHETIC Docker down']);
      assert.match(fs.readFileSync(path.join(s.cwd, directory, 'suite.log'), 'utf8'), /synthetic teardown output/);
    } finally { s.clean(); }
  }
});

test('prepare refuses collisions/default-off and ready refuses an altered failure fixture', () => {
  for (const collision of [directory, fixture, '.tmp/junit/backend-mocha/backend-mocha.xml', 'coverage/mocha/lcov.info']) {
    const s = sandbox();
    try {
      s.write(collision, 'existing data');
      assert.notEqual(s.execute(process.execPath, [helper, 'prepare']).status, 0);
      assert.equal(fs.readFileSync(path.join(s.cwd, collision), 'utf8'), 'existing data');
    } finally { s.clean(); }
  }
  const s = sandbox();
  try {
    assert.notEqual(s.execute(process.execPath, [helper, 'prepare'], { CI_MOCHA_FAILURE_REHEARSAL_OPT_IN: 'false' }).status, 0);
    assert.ok(!fs.existsSync(path.join(s.cwd, fixture)));
    assert.equal(s.execute(process.execPath, [helper, 'prepare']).status, 0);
    s.write(fixture, 'changed');
    assert.notEqual(s.execute(process.execPath, [helper, 'ready']).status, 0);
  } finally { s.clean(); }
});

test('real Git cleanliness check runs before recursive permission changes', () => {
  const job = config.jobs['test-mocha-failure-rehearsal'];
  const steps = job.steps.filter(step => step.run).map(step => step.run.name);
  assert.ok(steps.indexOf('Prepare isolated deliberate integration failure') < steps.indexOf('Setup test directories'));
  for (const dirty of ['clean', 'mode', 'untracked']) {
    const s = sandbox();
    try {
      fs.unlinkSync(path.join(s.cwd, 'bin/git'));
      const git = (...args) => {
        const result = s.execute('git', args);
        assert.equal(result.status, 0, result.stderr);
        return result.stdout.trim();
      };
      git('init', '-q');
      git('config', 'user.name', 'Rehearsal Test');
      git('config', 'user.email', 'rehearsal@example.invalid');
      git('config', 'core.filemode', 'true');
      git('add', '.');
      git('commit', '-qm', 'fixture');
      const revision = git('rev-parse', 'HEAD');
      s.prepareProducer({ CIRCLE_SHA1: revision });
      if (dirty === 'mode') fs.chmodSync(path.join(s.cwd, 'package-lock.json'), 0o777);
      if (dirty === 'untracked') s.write('test/integration/services/untracked.test.ts', 'unexpected test');
      const result = s.execute(process.execPath, [helper, 'prepare'], { CIRCLE_SHA1: revision });
      assert.equal(result.status === 0, dirty === 'clean', result.stderr);
      assert.equal(fs.existsSync(path.join(s.cwd, fixture)), dirty === 'clean');
    } finally { s.clean(); }
  }
});

test('the unchanged default Bash test glob discovers the injected fixture without enabling globstar', () => {
  const s = sandbox();
  try {
    assert.equal(s.execute(process.execPath, [helper, 'prepare']).status, 0);
    const startup = fs.readFileSync(path.join(root, 'support/integration-testing/run-mocha-redbox.sh'), 'utf8');
    const assignment = startup.split('\n').find(line => line.trim() === 'test_args=(test/integration/**/*.test.ts)');
    assert.ok(assignment, 'Keep the normal discovery assignment unchanged');
    const result = s.execute('bash', ['-c', `shopt -u globstar\n${assignment}\nprintf '%s\\n' "\${test_args[@]}"`]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.trim().split('\n').includes(fixture));
  } finally { s.clean(); }
});

test('failure template reaches the deliberate assertion only after bootstrap (unit simulation)', () => {
  const ts = require('typescript');
  const source = fs.readFileSync(path.join(__dirname, 'ci-mocha-failure-rehearsal.fixture.txt'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  for (const lifted of [true, false]) {
    const context = { exports: {}, describe: (_name, fn) => fn(), it: (_name, fn) => fn(),
      require: name => name === 'sails' ? { isLifted: lifted, services: { recordsservice: {} } } : require(name) };
    assert.throws(() => vm.runInNewContext(output, context), lifted ? /intentional integration assertion/ : /successful Sails bootstrap/);
  }
});

test('the unchanged coverage shell fails on normalization or uploader failure', () => {
  const s = sandbox();
  try {
    s.write('bin/sudo', '#!/bin/sh\n"$@"\n', true);
    s.write('bin/node', '#!/bin/sh\nexit "$NORMALIZE_STATUS"\n', true);
    s.write('bin/codecov', '#!/bin/sh\necho attempted >> "$CODECOV_LOG"\nexit "$UPLOAD_STATUS"\n', true);
    fs.mkdirSync(path.join(s.cwd, 'coverage'), { recursive: true });
    const command = job.steps.find(step => step.run?.name === 'Upload Mocha code coverage').run.command
      .replace('/tmp/.codecov-cli/codecov', `${s.cwd}/bin/codecov`);
    for (const [normalize, upload] of [[0, 0], [0, 31], [7, 0]]) {
      const log = path.join(s.cwd, 'upload.log');
      fs.rmSync(log, { force: true });
      const result = s.execute('bash', ['-eo', 'pipefail', '-c', command],
        { NORMALIZE_STATUS: String(normalize), UPLOAD_STATUS: String(upload), CODECOV_LOG: log });
      assert.equal(result.status, normalize || upload, result.stderr);
      assert.equal(fs.existsSync(log), normalize === 0);
    }
  } finally { s.clean(); }
});

test('independent Python verifier rejects incomplete, skipped, timed-out or corrupted report evidence', () => {
  const s = sandbox();
  const marker = 'CI_MOCHA_FAILURE_REHEARSAL_2026';
  const verifier = path.join(__dirname, 'ci-mocha-failure-rehearsal.verify.py');
  const lcov = 'SF:packages/redbox-core/dist/services/RecordsService.js\nDA:1,1\nLF:1\nLH:1\nend_of_record\n';
  const junit = `<testsuites><testsuite><testcase name="deliberate ${marker}"><failure message="${marker}: intentional integration assertion"/></testcase><testcase name="ordinary integration test"/></testsuite></testsuites>`;
  try {
    assert.equal(s.execute(process.execPath, [helper, 'prepare']).status, 0);
    s.write(`${directory}/suite.log`, 'SYNTHETIC suite and teardown log');
    assert.equal(s.execute(process.execPath, [helper, 'record-status', '23', '0']).status, 0);
    s.write('coverage/mocha/lcov.info', lcov);
    // Missing JUnit still preserves LCOV and a useful error manifest.
    assert.notEqual(s.execute(process.execPath, [helper, 'raw']).status, 0);
    assert.equal(fs.readFileSync(path.join(s.cwd, directory, 'raw-lcov.info'), 'utf8'), lcov);
    fs.rmSync(path.join(s.cwd, directory, 'raw.json'));
    fs.rmSync(path.join(s.cwd, directory, 'raw-lcov.info'));
    s.write('.tmp/junit/backend-mocha/backend-mocha.xml', junit);
    for (const stage of ['raw', 'prepared']) assert.equal(s.execute(process.execPath, [helper, stage]).status, 0);
    const verify = () => s.execute('python3', [verifier, directory]);
    const passing = verify();
    assert.equal(passing.status, 0, passing.stderr);
    assert.match(passing.stdout, /remain UNVERIFIED/);
    // These API responses are synthetic fixtures, not recorded CircleCI results.
    const evidence = 'synthetic-circle-evidence';
    const api = (name, data) => s.write(`${evidence}/${name}.json`, JSON.stringify(data));
    api('workflow', { id: environment.CIRCLE_WORKFLOW_ID, name: 'mocha_failure_rehearsal', status: 'failed' });
    const jobs = { items: [
      { name: 'build-mocha-failure-rehearsal', status: 'success', id: 'build-id' },
      { name: 'test-mocha-failure-rehearsal', status: 'failed', job_number: 123, id: 'suite-id' },
      { name: 'validation-complete-mocha-failure-rehearsal', status: 'not_run', id: 'gate-id',
        started_at: '2026-10-31T00:01:19Z', stopped_at: '2026-10-31T00:01:19Z',
        requires: { 'suite-id': ['success'] }, dependencies: ['suite-id'] },
    ] };
    api('workflow-jobs', jobs);
    api('job-details', { vcs_revision: environment.CIRCLE_SHA1, build_num: 123, status: 'failed',
      workflows: { workflow_id: environment.CIRCLE_WORKFLOW_ID, job_id: 'suite-id' }, steps: [{ actions: [
        { name: 'Run deliberately failing Mocha integration suite', status: 'failed', exit_code: 23 },
        { name: 'Upload Mocha code coverage', status: 'success' },
      ] }] });
    api('artifacts', { items: fs.readdirSync(path.join(s.cwd, directory)).map(name => ({ path: `ci-mocha-failure-rehearsal/${name}` })) });
    api('tests', { items: [{ name: `deliberate ${marker}`, result: 'failure' }] });
    const verifyCircle = () => s.execute('python3', [verifier, directory, '--circle-evidence', evidence]);
    assert.equal(verifyCircle().status, 0);
    jobs.items.push({ ...jobs.items[2], status: 'running', id: 'duplicate-gate-id' });
    api('workflow-jobs', jobs);
    assert.notEqual(verifyCircle().status, 0, 'Duplicate job names cannot be collapsed');
    jobs.items.pop();
    jobs.items[2].id = 'build-id';
    api('workflow-jobs', jobs);
    assert.notEqual(verifyCircle().status, 0, 'Duplicate workflow job IDs cannot be accepted');
    jobs.items[2].id = 'gate-id';
    jobs.items[1].id = 'substituted-suite-id';
    jobs.items[2].requires = { 'substituted-suite-id': ['success'] };
    jobs.items[2].dependencies = ['substituted-suite-id'];
    api('workflow-jobs', jobs);
    assert.notEqual(verifyCircle().status, 0, 'Workflow suite ID must match job details');
    jobs.items[1].id = 'suite-id';
    jobs.items[2].requires = { 'suite-id': ['success'] };
    jobs.items[2].dependencies = ['suite-id'];
    jobs.items[2].status = 'success';
    api('workflow-jobs', jobs);
    assert.notEqual(verifyCircle().status, 0, 'A successful gate invalidates the rehearsal');
    jobs.items[2].status = 'not_run';
    jobs.items[2].requires = { 'suite-id': ['failed'] };
    api('workflow-jobs', jobs);
    assert.notEqual(verifyCircle().status, 0, 'A failure-dependent gate is not a success gate');
    jobs.items[2].requires = { 'suite-id': ['success'] };
    jobs.items[2].dependencies = ['other-id'];
    api('workflow-jobs', jobs);
    assert.notEqual(verifyCircle().status, 0, 'A mismatched dependency cannot prove the gate');
    jobs.items[2].dependencies = ['suite-id'];
    jobs.items.push({ name: 'publish-manifest', status: 'not_run', id: 'publisher-id' });
    api('workflow-jobs', jobs);
    const publisherResult = verifyCircle();
    assert.notEqual(publisherResult.status, 0, 'Even a dormant publisher invalidates workflow isolation');
    assert.match(publisherResult.stderr, /Unexpected jobs, missing gate, or publication path/);
    const replaceReport = (name, text) => {
      s.write(`${directory}/prepared-${name}`, text);
      const file = path.join(s.cwd, directory, 'prepared.json');
      const manifest = JSON.parse(fs.readFileSync(file));
      manifest[name] = { bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') };
      fs.writeFileSync(file, JSON.stringify(manifest));
    };
    replaceReport('backend-mocha.xml', junit.replace(`${marker}: intentional integration assertion`, 'Sails bootstrap failed'));
    assert.notEqual(verify().status, 0, 'A matching test name alone does not prove the deliberate assertion');
    replaceReport('backend-mocha.xml', '<testsuites><broken>');
    assert.notEqual(verify().status, 0, 'Malformed XML must fail independently of hashes');
    replaceReport('backend-mocha.xml', junit);
    replaceReport('lcov.info', 'SF:fixture.js\nend_of_record\n');
    assert.notEqual(verify().status, 0, 'Non-application/empty coverage must fail independently of hashes');
    replaceReport('lcov.info', lcov);
    for (const status of [0, 124, 137]) {
      s.write(`${directory}/suite-status.json`, JSON.stringify({ command: 'timeout 1800s npm run test:mocha:ci', suite_exit: status, tee_exit: 0 }));
      assert.notEqual(verify().status, 0, `suite status ${status}`);
    }
    s.write(`${directory}/suite-status.json`, JSON.stringify({ command: 'timeout 1800s npm run test:mocha:ci', suite_exit: 23, tee_exit: 0 }));
    s.write(`${directory}/prepared-lcov.info`, 'corrupted');
    assert.notEqual(verify().status, 0);
  } finally { s.clean(); }
});

test('green control retains ordinary image-backed execution and fatal normalization, with no Codecov upload', () => {
  const control = config.jobs['test-mocha-failure-rehearsal-control'];
  assert.deepEqual(control.environment, job.environment);
  for (const name of ['Use patched Node.js from .nvmrc', 'Load Docker image', 'Point compose at tested image',
    'Install npm dependencies', 'Setup test directories']) {
    assert.deepEqual(control.steps.find(step => step.run?.name === name), job.steps.find(step => step.run?.name === name));
  }
  assert.ok(!JSON.stringify(control).includes('codecov --') && !JSON.stringify(control).includes('Install codecov'));
  assert.ok(!JSON.stringify(control).includes('npm run compile:'));
  assert.deepEqual(control.steps.find(step => step.store_test_results), { store_test_results: { path: '.tmp/junit' } });
  const names = control.steps.map(step => step.run?.name);
  const suite = control.steps.find(step => step.run?.name === 'Run ordinary Mocha green control suite').run;
  assert.equal(suite.no_output_timeout, '35m');
  assert.equal(suite.command, 'bash support/build/ci-mocha-failure-rehearsal.sh');
  const ordered = ['Tear down rehearsal containers and retain status', 'Retain raw control reports before coverage preparation',
    'Normalize Mocha control coverage without upload', 'Retain prepared control reports and evidence'];
  assert.deepEqual(names.filter(name => ordered.includes(name)), ordered);
  for (const name of ordered) assert.equal(control.steps.find(step => step.run?.name === name).run.when, 'always');
  const normalize = control.steps.find(step => step.run?.name === ordered[2]).run.command;
  assert.match(normalize, /prepare-report.cjs "\.\/coverage\/mocha\/lcov.info"/);
  const s = sandbox();
  try {
    s.write('bin/sudo', '#!/bin/sh\n"$@"\n', true);
    s.write('bin/node', '#!/bin/sh\nexit 37\n', true);
    fs.mkdirSync(path.join(s.cwd, 'coverage'), { recursive: true });
    assert.equal(s.execute('bash', ['-eo', 'pipefail', '-c', normalize]).status, 37);
  } finally { s.clean(); }
});

const controlEnvironment = { CIRCLE_JOB: 'test-mocha-failure-rehearsal-control',
  CIRCLE_WORKFLOW_JOB_ID: 'control-id', CIRCLE_BUILD_NUM: '124' };
const controlDirectory = '.tmp/ci-mocha-failure-rehearsal-control';
const producerDirectory = '.tmp/ci-mocha-failure-rehearsal-producer';

test('consumers reject missing or mismatched producer measurements, and ready remeasures inputs/image', () => {
  const s = sandbox();
  const receiptFile = path.join(s.cwd, 'producer-receipt.json');
  const receipt = fs.readFileSync(receiptFile);
  try {
    for (const role of [{}, controlEnvironment]) {
      for (const [field, value] of [['revision', 'e'.repeat(40)], ['source_tree', 'e'.repeat(40)],
        ['image_archive_sha256', 'e'.repeat(64)], ['image_id', `sha256:${'e'.repeat(64)}`],
        ['workflow_id', 'another-workflow'], ['job_id', role.CIRCLE_WORKFLOW_JOB_ID || 'suite-id'],
        ['job_number', role.CIRCLE_BUILD_NUM || '123'], ['job_name', 'build'], ['files', {}]]) {
        fs.writeFileSync(receiptFile, JSON.stringify({ ...JSON.parse(receipt), [field]: value }));
        assert.notEqual(s.execute(process.execPath, [helper, 'prepare'], role).status, 0, `${role.CIRCLE_JOB}: ${field}`);
        assert.ok(!fs.existsSync(path.join(s.cwd, fixture)));
      }
      fs.rmSync(receiptFile);
      assert.notEqual(s.execute(process.execPath, [helper, 'prepare'], role).status, 0, 'Missing receipt must fail');
      fs.writeFileSync(receiptFile, receipt);
    }
    assert.equal(s.execute(process.execPath, [helper, 'prepare'], controlEnvironment).status, 0);
    assert.ok(!fs.existsSync(path.join(s.cwd, fixture)));
    s.write('package-lock.json', 'altered actual input');
    assert.notEqual(s.execute(process.execPath, [helper, 'ready'], controlEnvironment).status, 0);
  } finally { s.clean(); }
});

test('green wrapper preserves zero/nonzero/timeout status and teardown independently fails closed', () => {
  for (const [suite, cleanup] of [[0, 0], [23, 0], [124, 0], [0, 17]]) {
    const s = sandbox();
    const env = { ...controlEnvironment, TEST_STATUS: String(suite), CLEANUP_STATUS: String(cleanup) };
    try {
      assert.equal(s.execute(process.execPath, [helper, 'prepare'], env).status, 0);
      const result = s.execute('bash', ['support/build/ci-mocha-failure-rehearsal.sh'], env);
      assert.equal(result.status, suite, result.stderr);
      const status = JSON.parse(fs.readFileSync(path.join(s.cwd, controlDirectory, 'suite-status.json')));
      assert.equal(status.suite_exit, suite);
      assert.equal(status.tee_exit, 0);
      const teardown = s.execute(process.execPath, [helper, 'teardown'], env);
      assert.equal(teardown.status === 0, cleanup === 0);
      const retained = JSON.parse(fs.readFileSync(path.join(s.cwd, controlDirectory, 'teardown-status.json')));
      assert.equal(retained.exit, cleanup);
      assert.match(fs.readFileSync(path.join(s.cwd, controlDirectory, 'teardown.log'), 'utf8'), /synthetic teardown output/);
      s.write(fixture, 'unexpected fixture');
      assert.notEqual(s.execute(process.execPath, [helper, 'ready'], env).status, 0);
    } finally { s.clean(); }
  }
});

test('post-start input/identity/fixture failures retain status, independent reports and safe authorized cleanup', () => {
  for (const role of [{}, controlEnvironment]) for (const mutation of ['input', 'compose', 'identity', 'fixture', 'override']) {
    for (const suiteExit of [0, 23]) {
      const s = sandbox();
      const dir = role.CIRCLE_JOB ? controlDirectory : directory;
      const env = { ...role, TEST_STATUS: String(suiteExit), CLEANUP_STATUS: '0' };
      const read = name => fs.readFileSync(path.join(s.cwd, dir, name), 'utf8');
      try {
        assert.equal(s.execute(process.execPath, [helper, 'prepare'], env).status, 0);
        // Change inputs DURING up, after wrapper ready has succeeded. The real
        // npm shell still performs its own down and returns the original status.
        const mutations = {
          input: 'echo changed > package-lock.json',
          compose: 'echo changed > support/integration-testing/docker-compose.mocha.yml',
          identity: `echo '{}' > ${dir}/identity.json`,
          fixture: `echo changed > ${fixture}`,
          override: 'echo changed > tsconfig.json',
        };
        const dockerFile = path.join(s.cwd, 'bin/docker');
        fs.writeFileSync(dockerFile, fs.readFileSync(dockerFile, 'utf8').replace(
          "echo 'synthetic suite output'; exit", `${mutations[mutation]}; echo 'synthetic suite output'; exit`));
        const suite = s.execute('bash', ['support/build/ci-mocha-failure-rehearsal.sh'], env);
        assert.equal(suite.status, suiteExit || 1, suite.stderr);
        const status = JSON.parse(read('suite-status.json'));
        assert.equal(status.suite_exit, suiteExit);
        assert.equal(status.tee_exit, 0);
        assert.equal(status.validation.valid, false);
        assert.ok(status.validation.error);
        assert.match(read('suite.log'), /synthetic suite output/);
        s.write('coverage/mocha/lcov.info', 'RAW diagnostic LCOV');
        // Missing JUnit must still retain LCOV under failed input validation.
        assert.notEqual(s.execute(process.execPath, [helper, 'raw'], env).status, 0);
        assert.equal(read('raw-lcov.info'), 'RAW diagnostic LCOV');
        const raw = JSON.parse(read('raw.json'));
        assert.equal(raw.validation.valid, false);
        assert.equal(raw['backend-mocha.xml'].error, 'ENOENT');
        assert.ok(raw['lcov.info'].bytes > 0);
        s.write('.tmp/junit/backend-mocha/backend-mocha.xml', '<diagnostic/>');
        assert.notEqual(s.execute(process.execPath, [helper, 'prepared'], env).status, 0);
        assert.equal(read('prepared-backend-mocha.xml'), '<diagnostic/>');
        assert.equal(JSON.parse(read('prepared.json')).validation.valid, false);
        const cleanupEnv = mutation === 'override' ? { ...env, COMPOSE_FILE: 'evil.yml',
          COMPOSE_PROJECT_NAME: 'other-project', COMPOSE_ENV_FILES: 'evil.env' } : env;
        // Record actual arguments/environment consumed by the cleanup process.
        fs.writeFileSync(dockerFile, fs.readFileSync(dockerFile, 'utf8').replace(
          "echo 'synthetic teardown output'", `echo "$*"; for key in COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_ENV_FILES; do if [[ -v "$key" ]]; then echo "$key=unexpected"; fi; done; echo 'synthetic teardown output'`));
        const cleanup = s.execute(process.execPath, [helper, 'teardown'], cleanupEnv);
        assert.notEqual(cleanup.status, 0, 'Validation failure must remain fatal even when down succeeds');
        const teardown = JSON.parse(read('teardown-status.json'));
        assert.equal(teardown.exit, 0);
        assert.equal(teardown.validation.valid, false);
        assert.ok(teardown.validation.error);
        assert.equal(teardown.timed_out, false);
        assert.match(read('teardown.log'), /--project-name integration-testing/);
        assert.match(read('teardown.log'), /-authorization\/compose.yml down -v --remove-orphans --timeout 180/);
        assert.doesNotMatch(read('teardown.log'), /COMPOSE_FILE=|COMPOSE_PROJECT_NAME=|COMPOSE_ENV_FILES=/);
        assert.equal(fs.readFileSync(path.join(s.cwd, 'docker.log'), 'utf8').match(/Docker down/g).length, 2);
      } finally { s.clean(); }
    }
  }
});

test('failed preparation/preflight retains an honest not-run status and cleanup; missing authorization permits no cleanup', () => {
  const s = sandbox();
  try {
    s.write('package-lock.json', 'changed before prepare');
    assert.notEqual(s.execute(process.execPath, [helper, 'prepare']).status, 0);
    const suite = s.execute('bash', ['support/build/ci-mocha-failure-rehearsal.sh']);
    assert.notEqual(suite.status, 0);
    const status = JSON.parse(fs.readFileSync(path.join(s.cwd, directory, 'suite-status.json')));
    assert.equal(status.suite_exit, null);
    assert.equal(status.tee_exit, null);
    assert.equal(status.validation.valid, false);
    assert.ok(!fs.existsSync(path.join(s.cwd, 'docker.log')), 'No suite was launched');
    assert.notEqual(s.execute(process.execPath, [helper, 'teardown'], { CLEANUP_STATUS: '0' }).status, 0);
    assert.match(fs.readFileSync(path.join(s.cwd, 'docker.log'), 'utf8'), /Docker down/);
    fs.rmSync(path.join(s.cwd, 'docker.log'));
    fs.rmSync(path.join(s.cwd, `${directory}-authorization`), { recursive: true });
    assert.notEqual(s.execute(process.execPath, [helper, 'teardown']).status, 0);
    assert.ok(!fs.existsSync(path.join(s.cwd, 'docker.log')));
    assert.notEqual(s.execute(process.execPath, [helper, 'raw']).status, 0);
    assert.ok(!fs.existsSync(path.join(s.cwd, directory, 'raw.json')));
  } finally { s.clean(); }
});

test('authorized cleanup snapshot renders the ordinary Compose project, services, mounts and networks', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-mocha-cleanup-compose-'));
  const source = 'support/integration-testing/docker-compose.mocha.yml';
  const snapshot = path.join(temporary, 'compose.yml');
  try {
    fs.copyFileSync(path.join(root, source), snapshot);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('COMPOSE_')));
    env.COMPOSE_DISABLE_ENV_FILE = 'true';
    env.RBPORTAL_IMAGE = 'redbox-portal:test';
    const render = args => {
      const result = spawnSync('docker', ['compose', ...args, '--profile', 'portal', 'config', '--format', 'json'],
        { cwd: root, env, encoding: 'utf8', timeout: 10_000 });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    const ordinary = render(['-f', source]);
    const cleanup = render(['--project-name', 'integration-testing', '--project-directory',
      './support/integration-testing', '-f', snapshot]);
    assert.equal(ordinary.name, 'integration-testing');
    assert.deepEqual(cleanup, ordinary);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('teardown spawn errors and zero-exit timeout handlers fail; SIGTERM-resistant descendants receive bounded SIGKILL', () => {
  for (const mode of ['spawn-error', 'zero-on-term', 'ignore-term', 'leader-exits']) {
    const s = sandbox({ shortTeardown: true });
    try {
      assert.equal(s.execute(process.execPath, [helper, 'prepare']).status, 0);
      const docker = path.join(s.cwd, 'bin/docker');
      if (mode === 'spawn-error') fs.rmSync(docker);
      else {
        const child = `process.on('SIGTERM', () => { ${mode === 'zero-on-term' ? 'process.exit(0);' : ''} });
           const child = require('node:child_process').spawn(process.execPath, ['-e',
             "process.on('SIGTERM', () => {}); console.log('descendant ' + process.pid); setInterval(() => {}, 100);"], { stdio: 'inherit' });
           console.log('parent ' + process.pid); ${mode === 'leader-exits' ? "child.once('spawn', () => setTimeout(() => process.exit(0), 150));" : ''} setInterval(() => {}, 100);`;
        s.write('cleanup-child.cjs', child);
        fs.writeFileSync(docker, fs.readFileSync(docker, 'utf8').replace(
          "echo 'synthetic teardown output'; exit", `exec '${process.execPath}' cleanup-child.cjs; exit`));
      }
      const started = Date.now();
      const result = s.execute(process.execPath, [helper, 'teardown'],
        mode === 'spawn-error' ? { PATH: path.join(s.cwd, 'bin') } : {});
      assert.notEqual(result.status, 0, mode);
      assert.ok(Date.now() - started < 5_000, 'Termination must be bounded');
      const status = JSON.parse(fs.readFileSync(path.join(s.cwd, directory, 'teardown-status.json')));
      if (mode === 'spawn-error') assert.match(status.error, /ENOENT/);
      else {
        assert.equal(status.validation.valid, true);
        assert.equal(status.timed_out, mode !== 'leader-exits');
        assert.equal(status.group_remaining, false);
        if (mode === 'leader-exits') {
          assert.equal(status.exit, 0);
          assert.equal(status.descendants_survived, true);
        } else if (mode === 'zero-on-term') assert.equal(status.exit, 0, 'Reproduce a timeout handler that exits successfully');
        else assert.equal(status.signal, 'SIGKILL');
        {
          const log = fs.readFileSync(path.join(s.cwd, directory, 'teardown.log'), 'utf8');
          const pids = [...log.matchAll(/(?:parent|descendant) ([0-9]+)/g)].map(match => match[1]);
          assert.equal(pids.length, 2, log);
          for (const pid of pids) {
            try { assert.match(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'), /\) Z /, 'Surviving process'); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
          }
        }
      }
    } finally {
      const logPath = path.join(s.cwd, directory, 'teardown.log');
      if (fs.existsSync(logPath)) {
        const log = fs.readFileSync(logPath, 'utf8');
        for (const match of log.matchAll(/(?:parent|descendant) ([0-9]+)/g)) {
          try { process.kill(Number(match[1]), 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
        }
      }
      s.clean();
    }
  }
});

function assertStopped(pids) {
  assert.ok(pids.length > 0, 'Expected recorded real child PIDs');
  for (const pid of pids) {
    try { assert.match(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'), /\) [ZX] /, `Surviving process ${pid}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

test('real Compose renders both npm operations and standalone down against the pinned original after project/source/env mutation', () => {
  const located = spawnSync('which', ['docker'], { encoding: 'utf8' });
  assert.equal(located.status, 0, located.stderr);
  const docker = located.stdout.trim();
  for (const role of [{}, controlEnvironment]) {
    const s = sandbox({ realCompose: true });
    const dir = role.CIRCLE_JOB ? controlDirectory : directory;
    const env = { ...role, TEST_STATUS: '23', CLEANUP_STATUS: '0' };
    try {
      assert.equal(s.execute(process.execPath, [helper, 'prepare'], env).status, 0);
      // Use the real Compose parser only. Never contact a daemon or start services.
      s.write('render.cjs', `
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const operation = args.includes('up') ? 'up' : 'down';
const flags = args.slice(0, args.indexOf(operation));
const rendered = spawnSync(${JSON.stringify(docker)}, [...flags, 'config', '--format', 'json'],
  { encoding: 'utf8', env: process.env, timeout: 10000 });
if (rendered.status !== 0) { console.error(rendered.stderr); process.exit(99); }
fs.appendFileSync('rendered.jsonl', JSON.stringify({ operation, args, config: JSON.parse(rendered.stdout),
  overrides: ['COMPOSE_PROJECT_NAME', 'COMPOSE_FILE', 'COMPOSE_ENV_FILES'].filter(key => process.env[key]) }) + '\\n');
if (operation === 'up') {
  fs.writeFileSync('support/integration-testing/docker-compose.mocha.yml', 'name: victim-project\\nservices:\\n  victim:\\n    image: busybox\\n');
  fs.writeFileSync('support/integration-testing/.env', 'COMPOSE_PROJECT_NAME=env-victim\\nCOMPOSE_FILE=evil.yml\\n');
}
process.exit(operation === 'up' ? 23 : 0);
`);
      const file = path.join(s.cwd, 'bin/docker');
      let stub = fs.readFileSync(file, 'utf8');
      stub = stub.replace("echo 'synthetic suite output'; exit", ` '${process.execPath}' render.cjs "$@"; echo 'synthetic suite output'; exit`)
        .replace("echo 'synthetic teardown output'; exit", ` '${process.execPath}' render.cjs "$@" || exit 99; echo 'synthetic teardown output'; exit`);
      fs.writeFileSync(file, stub);
      const suite = s.execute('bash', ['support/build/ci-mocha-failure-rehearsal.sh'], env);
      assert.equal(suite.status, 23, suite.stderr);
      const status = JSON.parse(fs.readFileSync(path.join(s.cwd, dir, 'suite-status.json')));
      assert.equal(status.suite_exit, 23);
      assert.equal(status.tee_exit, 0);
      assert.equal(status.validation.valid, false);
      const cleanup = s.execute(process.execPath, [helper, 'teardown'], { ...env,
        COMPOSE_PROJECT_NAME: 'another-victim', COMPOSE_FILE: 'evil.yml', COMPOSE_ENV_FILES: 'evil.env' });
      assert.notEqual(cleanup.status, 0, 'Post-run source validation must still fail');
      const renders = fs.readFileSync(path.join(s.cwd, 'rendered.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      assert.deepEqual(renders.map(item => item.operation), ['up', 'down', 'down']);
      for (const item of renders) {
        assert.equal(item.config.name, 'integration-testing');
        assert.deepEqual(item.config, renders[0].config);
        assert.ok(item.config.services.redboxportal);
        assert.ok(!item.config.services.victim);
        assert.deepEqual(item.overrides, []);
        assert.equal(item.args[item.args.indexOf('-f') + 1], `${dir}-authorization/compose.yml`);
      }
    } finally { s.clean(); }
  }
});

test('suite supervisor bounds resistant npm/output children and captures status after leader exit without leaking workers', () => {
  for (const mode of ['ignore-term', 'leader-exits', 'output-worker', 'missing-phase']) {
    const s = sandbox({ shortTeardown: true, shortSuite: true, slowPhases: true, removeFinishPhase: mode === 'missing-phase' });
    const pids = [];
    try {
      assert.equal(s.execute(process.execPath, [helper, 'prepare'], controlEnvironment).status, 0);
      s.write('suite-child.cjs', `
const fs = require('node:fs');
const { spawn } = require('node:child_process');
process.on('SIGTERM', () => {});
fs.appendFileSync('process-pids', process.pid + '\\n');
const worker = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); require('node:fs').appendFileSync('process-pids', process.pid + String.fromCharCode(10)); setInterval(() => {}, 100);"],
  { stdio: ${JSON.stringify(mode === 'ignore-term' ? 'inherit' : 'ignore')} });
console.log('real suite parent ' + process.pid);
${mode === 'leader-exits' ? "worker.once('spawn', () => setTimeout(() => process.exit(0), 200));" : ''}
setInterval(() => {}, 100);
`);
      if (mode === 'output-worker') {
        // An output descendant can retain the outer tool's pipe even after
        // npm/tee's leaders have exited; it must share the same deadline/group.
        s.write('bin/tee', `#!/bin/sh\ncat > "$1"\nexec '${process.execPath}' suite-child.cjs\n`, true);
      } else {
        const docker = path.join(s.cwd, 'bin/docker');
        fs.writeFileSync(docker, fs.readFileSync(docker, 'utf8').replace(
          "echo 'synthetic suite output'; exit", `exec '${process.execPath}' suite-child.cjs; exit`));
      }
      // Model CircleCI's inactivity watchdog independently of the supervisor.
      // Its shortened limit retains the production timeout's generous margin.
      s.write('watchdog.cjs', `
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const child = spawn('bash', ['support/build/ci-mocha-failure-rehearsal.sh'], { stdio: ['ignore', 'pipe', 'pipe'] });
let timer;
const reset = () => { clearTimeout(timer); timer = setTimeout(() => { fs.writeFileSync('watchdog-fired', 'yes'); child.kill('SIGKILL'); }, 2200); };
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { if (data.toString().includes('Rehearsal:')) reset(); process.stderr.write(data); });
reset();
child.on('close', (code, signal) => { clearTimeout(timer); process.exit(code ?? (signal ? 1 : 0)); });
`);
      const started = Date.now();
      const result = s.execute(process.execPath, ['watchdog.cjs'],
        { ...controlEnvironment, TEST_STATUS: '0', CLEANUP_STATUS: '0' });
      const fired = fs.existsSync(path.join(s.cwd, 'watchdog-fired'));
      if (mode === 'missing-phase') {
        assert.equal(fired, true, 'Negative control must trigger the inactivity watchdog');
        assert.ifError(result.error);
        assert.ok(Date.now() - started < 6000, 'Watchdog wrapper must exit promptly');
        continue;
      }
      assert.equal(fired, false, 'Inactivity watchdog preempted supervision');
      pids.push(...fs.readFileSync(path.join(s.cwd, 'process-pids'), 'utf8').trim().split('\n'));
      assert.ok(Date.now() - started < 6000, `Unbounded ${mode}: ${result.stderr}`);
      assert.equal(result.status, mode === 'leader-exits' ? 1 : 124, result.stderr);
      const status = JSON.parse(fs.readFileSync(path.join(s.cwd, controlDirectory, 'suite-status.json')));
      assert.equal(status.validation.valid, true);
      assert.equal(status.supervision.group_remaining, false);
      assert.equal(status.supervision.timed_out, mode !== 'leader-exits');
      if (mode === 'leader-exits') {
        assert.equal(status.suite_exit, 0, 'Retain the original successful npm exit, but fail supervision');
        assert.equal(status.tee_exit, 0);
        assert.equal(status.supervision.descendants_survived, true);
      } else {
        assert.equal(status.suite_exit, 124);
        assert.equal(status.tee_exit, null, 'Do not invent PIPESTATUS after the group was terminated');
      }
      assert.equal(pids.length, 2, 'Both the real leader and worker must have started');
      assertStopped(pids);
    } finally {
      // Test failures must never leave the adversarial workers running.
      const pidFile = path.join(s.cwd, 'process-pids');
      if (fs.existsSync(pidFile)) pids.push(...fs.readFileSync(pidFile, 'utf8').trim().split('\n').filter(Boolean));
      for (const pid of new Set(pids)) { try { process.kill(Number(pid), 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
      s.clean();
    }
  }
});

test('explicit paired verifier authenticates identities, exact emitted multisets and skips; historical mode remains separate', () => {
  const s = sandbox();
  const verifier = path.join(__dirname, 'ci-mocha-failure-rehearsal.verify.py');
  const marker = 'CI_MOCHA_FAILURE_REHEARSAL_2026';
  const title = `deliberate image-backed integration failure ${marker}`;
  // Two identical ordinary identities intentionally exercise multiset counts.
  const ordinary = '<testsuite name="ordinary suite" file="test/integration/services/ordinary.test.ts" tests="4" failures="0"><testcase name="ordinary test" classname="ordinary"/><testcase name="ordinary test" classname="ordinary"/></testsuite>';
  const deliberate = `<testsuite name="CI Mocha compilation-removal failure rehearsal" tests="1" failures="1"><testcase name="CI Mocha compilation-removal failure rehearsal ${title}" classname="${title}"><failure message="${marker}: intentional integration assertion"/></testcase></testsuite>`;
  const junit = (control) => `<testsuites tests="${control ? 4 : 5}" skipped="2" failures="${control ? 0 : 1}">${ordinary}${control ? '' : deliberate}</testsuites>`;
  const lcov = 'SF:packages/redbox-core/dist/services/RecordsService.js\nDA:1,1\nLF:1\nLH:1\nend_of_record\n';
  const read = file => fs.readFileSync(path.join(s.cwd, file));
  const json = file => JSON.parse(read(file));
  const verify = (extra = []) => s.execute('python3', [verifier, directory, '--paired',
    '--control-directory', controlDirectory, '--producer-directory', producerDirectory, ...extra]);
  const mutate = (file, change, message, extra = []) => {
    const before = read(file);
    try {
      const value = json(file);
      change(value);
      s.write(file, JSON.stringify(value));
      const result = verify(extra);
      assert.notEqual(result.status, 0, message);
    } finally { s.write(file, before); }
  };
  const replaceReport = (dir, text) => {
    for (const stage of ['raw', 'prepared']) {
      s.write(`${dir}/${stage}-backend-mocha.xml`, text);
      const manifest = json(`${dir}/${stage}.json`);
      manifest['backend-mocha.xml'] = { bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') };
      s.write(`${dir}/${stage}.json`, JSON.stringify(manifest));
    }
  };
  try {
    for (const [isControl, env, dir] of [[false, {}, directory], [true, controlEnvironment, controlDirectory]]) {
      assert.equal(s.execute(process.execPath, [helper, 'prepare'], env).status, 0);
      assert.equal(s.execute('bash', ['support/build/ci-mocha-failure-rehearsal.sh'],
        { ...env, TEST_STATUS: isControl ? '0' : '1', CLEANUP_STATUS: '0' }).status, isControl ? 0 : 1);
      assert.equal(s.execute(process.execPath, [helper, 'teardown'], { ...env, CLEANUP_STATUS: '0' }).status, 0);
      s.write('coverage/mocha/lcov.info', lcov);
      s.write('.tmp/junit/backend-mocha/backend-mocha.xml', junit(isControl));
      for (const stage of ['raw', 'prepared']) assert.equal(s.execute(process.execPath, [helper, stage], env).status, 0);
      for (const file of [fixture, 'coverage/mocha/lcov.info', '.tmp/junit/backend-mocha/backend-mocha.xml']) fs.rmSync(path.join(s.cwd, file), { force: true });
    }
    const result = verify();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Skipped identities remain UNVERIFIED/);
    assert.equal(s.execute('python3', [verifier, directory]).status, 0, 'Historical report mode still works');
    assert.notEqual(s.execute('python3', [verifier, directory, '--paired']).status, 0);
    assert.notEqual(s.execute('python3', [verifier, directory, '--control-directory', controlDirectory]).status, 0);
    for (const file of [`${controlDirectory}/identity.json`, `${directory}/identity.json`, `${producerDirectory}/identity.json`]) {
      for (const field of ['revision', 'source_tree', 'image_id', 'image_archive_sha256', 'workflow_id', 'job_id', 'files']) {
        mutate(file, value => { delete value[field]; }, `Missing ${field}`);
      }
    }
    for (const [field, value] of [['revision', 'e'.repeat(40)], ['source_tree', 'e'.repeat(40)],
      ['image_id', `sha256:${'e'.repeat(64)}`], ['image_archive_sha256', 'e'.repeat(64)],
      ['job_id', 'suite-id'], ['job_number', '123'], ['fixture_sha256', 'e'.repeat(64)], ['compose', 'different']]) {
      mutate(`${controlDirectory}/identity.json`, identity => { identity[field] = value; }, `Changed ${field}`);
    }
    mutate(`${controlDirectory}/identity.json`, identity => { identity.files['package-lock.json'] = 'e'.repeat(64); }, 'Input mismatch');
    mutate(`${controlDirectory}/producer.json`, identity => { identity.job_id = 'other-producer'; }, 'Receipt mismatch');
    mutate(`${controlDirectory}/teardown-status.json`, value => { value.exit = 17; }, 'Failed teardown');
    mutate(`${controlDirectory}/teardown-status.json`, value => { value.descendants_survived = true; }, 'Surviving cleanup worker');
    mutate(`${controlDirectory}/suite-status.json`, value => { value.supervision.descendants_survived = true; }, 'Surviving suite worker');
    mutate(`${controlDirectory}/teardown-status.json`, value => { value.error = 'spawn error despite exit zero'; }, 'Teardown error');
    mutate(`${controlDirectory}/teardown-status.json`, value => { value.timed_out = true; }, 'Teardown timeout despite exit zero');
    mutate(`${controlDirectory}/teardown-status.json`, value => { value.compose_sha256 = 'e'.repeat(64); }, 'Wrong cleanup definition');
    for (const name of ['suite-status', 'raw', 'prepared', 'teardown-status']) {
      mutate(`${controlDirectory}/${name}.json`, value => { value.validation.valid = false; }, 'Failed evidence validation');
      mutate(`${controlDirectory}/${name}.json`, value => { delete value.validation; }, 'Missing evidence validation');
    }
    mutate(`${controlDirectory}/suite-status.json`, value => { value.suite_exit = 1; }, 'Non-green control');
    const contradictions = [
      // Global tests/skips and emitted identities stay identical: one suite
      // undercounts, a case-free suite compensates. Global-only checks passed.
      text => text.replace(ordinary, ordinary.replace('tests="4"', 'tests="0"') +
        '<testsuite name="compensating empty suite" tests="4" failures="0"/>'),
      text => text.replace(ordinary, ordinary.replace('tests="4"', 'tests="4" skipped="0"')),
      text => text.replace(ordinary, ordinary.replace('tests="4"', 'tests="4" skipped="99"')),
      text => text.replace(ordinary, ordinary.replace('failures="0"', 'failures="1"'))
        .replace(deliberate, deliberate.replace('failures="1"', 'failures="0"')),
      text => text.replace('failures="0"', 'failures="0" errors="1"'),
      text => text.replace('<testcase name="ordinary test" classname="ordinary"/>',
        '<testcase name="ordinary test" classname="ordinary"><skipped/><skipped/></testcase>'),
    ];
    for (const contradict of contradictions) {
      replaceReport(controlDirectory, contradict(junit(true)));
      replaceReport(directory, contradict(junit(false)));
      assert.notEqual(verify().status, 0, 'Contradictory suite metadata must fail even with equal paired emitted multisets');
    }
    // Support explicit pending cases as well as the default omitted cases.
    const emittedPending = ordinary.replace('tests="4"', 'tests="4" skipped="2"').replace('</testsuite>',
      '<testcase name="pending one" classname="ordinary"><skipped/></testcase>' +
      '<testcase name="pending two" classname="ordinary"><skipped/></testcase></testsuite>');
    for (const isControl of [false, true]) replaceReport(isControl ? controlDirectory : directory,
      junit(isControl).replace(ordinary, emittedPending));
    assert.equal(verify().status, 0, verify().stderr);
    replaceReport(controlDirectory, junit(true));
    replaceReport(directory, junit(false));
    const alternatives = [junit(true).replace('skipped="2"', 'skipped="3"'),
      junit(true).replace('ordinary test', 'different test'), // Equal count, different identity.
      junit(true).replace('<testcase name="ordinary test" classname="ordinary"/>', ''), // Multiplicity.
      junit(true).replace(' classname="ordinary"', ''),
      junit(true).replace(' tests="4"', ''),
      junit(true).replace('skipped="2"', 'skipped="unknown"'),
      junit(true).replace('tests="4"', 'tests="5"'),
      junit(true).replace('<testcase name="ordinary test" classname="ordinary"/>', '<testcase name="ordinary test" classname="ordinary"><failure message="unrelated"/></testcase>')];
    for (const text of alternatives) {
      replaceReport(controlDirectory, text);
      assert.notEqual(verify().status, 0, text);
    }
    replaceReport(controlDirectory, junit(true));
    replaceReport(directory, junit(false).replace(`classname="${title}"`, 'classname="forged deliberate identity"'));
    assert.notEqual(verify().status, 0, 'Marker/assertion alone must not authenticate the emitted identity');
    replaceReport(directory, junit(false));
    // Independent supplied API evidence is synthetic; none is fetched or sent.
    const evidence = 'paired-circle-evidence';
    const api = (name, value) => s.write(`${evidence}/${name}.json`, JSON.stringify(value));
    const producer = json(`${producerDirectory}/identity.json`);
    const failure = json(`${directory}/identity.json`);
    const control = json(`${controlDirectory}/identity.json`);
    api('workflow', { id: producer.workflow_id, name: 'mocha_failure_rehearsal', status: 'failed' });
    const jobs = { items: [
      { name: producer.job_name, id: producer.job_id, job_number: 122, status: 'success' },
      ...[failure, control].map(item => ({ name: item.job_name, id: item.job_id, job_number: Number(item.job_number),
        status: item === failure ? 'failed' : 'success', requires: { [producer.job_id]: ['success'] }, dependencies: [producer.job_id] })),
      { name: 'validation-complete-mocha-failure-rehearsal', id: 'gate-id', job_number: 125, status: 'not_run',
        started_at: '2026-10-31T00:01:19Z', requires: { [failure.job_id]: ['success'] }, dependencies: [failure.job_id] },
    ] };
    api('workflow-jobs', jobs);
    const details = (identity, status, actions) => ({ vcs_revision: identity.revision, build_num: Number(identity.job_number), status,
      workflows: { workflow_id: identity.workflow_id, job_id: identity.job_id }, steps: [{ actions }] });
    const completed = names => names.map(name => ({ name, status: 'success', exit_code: 0 }));
    api('job-details', details(failure, 'failed', [
      { name: 'Run deliberately failing Mocha integration suite', status: 'failed', exit_code: 1 },
      ...completed(['Upload Mocha code coverage', 'Tear down rehearsal containers and retain status',
        'Retain raw failure reports before coverage preparation', 'Retain prepared failure reports and evidence']),
    ]));
    api('producer-job-details', details(producer, 'success', completed(['Record independently measured rehearsal producer identity'])));
    api('control-job-details', details(control, 'success', completed(['Run ordinary Mocha green control suite',
      'Normalize Mocha control coverage without upload', 'Tear down rehearsal containers and retain status',
      'Retain raw control reports before coverage preparation', 'Retain prepared control reports and evidence'])));
    for (const [prefix, dir, destination] of [['', directory, 'ci-mocha-failure-rehearsal'],
      ['producer-', producerDirectory, 'ci-mocha-failure-rehearsal-producer'], ['control-', controlDirectory, 'ci-mocha-failure-rehearsal-control']]) {
      api(`${prefix}artifacts`, { items: fs.readdirSync(path.join(s.cwd, dir)).map(name => ({ path: `${destination}/${name}` })) });
    }
    api('tests', { items: [{ name: title, result: 'failure' }] });
    api('control-tests', { items: [{ name: 'ordinary test', result: 'success' }] });
    const flags = ['--circle-evidence', evidence];
    assert.equal(verify(flags).status, 0, verify(flags).stderr);
    const modifyApi = (name, change, message) => mutate(`${evidence}/${name}.json`, change, message, flags);
    modifyApi('workflow-jobs', value => { value.items[2].dependencies = ['another-producer']; }, 'Different producer edge');
    modifyApi('workflow-jobs', value => { value.items[2].requires = { 'other-producer': ['success'] }; }, 'Different producer success requirement');
    modifyApi('workflow-jobs', value => { value.items[3].status = 'success'; }, 'Successful gate');
    modifyApi('workflow-jobs', value => { value.items[2].status = 'failed'; }, 'Failed control');
    modifyApi('workflow-jobs', value => { value.items[2].id = 'suite-id'; }, 'Duplicate API job ID');
    modifyApi('workflow-jobs', value => { value.items[2].job_number = 123; }, 'Duplicate API job number');
    modifyApi('workflow-jobs', value => { value.items[2].name = failure.job_name; }, 'Duplicate API job name');
    modifyApi('workflow-jobs', value => { value.items.push({ name: 'publish-manifest', id: 'publish', job_number: 126 }); }, 'Publisher');
    modifyApi('control-job-details', value => { value.workflows.job_id = 'wrong-id'; }, 'Control API identity');
    modifyApi('control-job-details', value => { value.steps[0].actions.push({ name: 'Upload Mocha code coverage', status: 'success' }); }, 'Duplicate upload');
    modifyApi('control-job-details', value => { value.steps[0].actions[1].status = 'failed'; }, 'Failed normalization');
    modifyApi('control-artifacts', value => { value.items.pop(); }, 'Missing control artifact');
    modifyApi('producer-artifacts', value => { value.items = []; }, 'Missing producer artifact');
    modifyApi('control-tests', value => { value.next_page_token = 'more'; }, 'Incomplete pagination');
    modifyApi('control-tests', value => { value.items = []; }, 'Missing control JUnit ingestion');
    assert.equal(verify(flags).status, 0, 'All mutations restored');
    // Exercise the installed reporter's real title/classname/totals layout,
    // including pending tests that it omits from emitted testcase elements.
    const template = fs.readFileSync(path.join(__dirname, 'ci-mocha-failure-rehearsal.fixture.txt'), 'utf8');
    const compiled = require('typescript').transpileModule(template, {
      compilerOptions: { module: require('typescript').ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    for (const isControl of [false, true]) {
      s.write('reporter-test.cjs', `describe('ordinary suite', function () {
        it('ordinary test', function () {}); it('ordinary test', function () {});
        it.skip('pending one', function () {}); it.skip('pending two', function () {});
      });\n` + (isControl ? '' : `new Function('require', 'exports', ${JSON.stringify(compiled)})(
        name => name === 'sails' ? { isLifted: true, services: { recordsservice: {} } } : require(name), {});`));
      const emitted = s.execute(process.execPath, [path.join(root, 'node_modules/mocha/bin/mocha.js'),
        '--no-config', '--no-package', '--reporter', path.join(root, 'node_modules/mocha-junit-reporter'),
        '--reporter-option', 'mochaFile=reporter.xml', 'reporter-test.cjs']);
      assert.equal(emitted.status, isControl ? 0 : 1, emitted.stderr);
      replaceReport(isControl ? controlDirectory : directory, read('reporter.xml').toString());
    }
    assert.equal(verify().status, 0, verify().stderr);
  } finally { s.clean(); }
});
