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
const { guard, directory, fixture } = require('./ci-mocha-failure-rehearsal.cjs');

const root = path.resolve(__dirname, '../..');
const config = yaml.load(fs.readFileSync(path.join(root, '.circleci/config.yml'), 'utf8'));
const job = config.jobs['test-mocha-failure-rehearsal'];
const original = config.jobs['test-mocha'];
const branch = 'chore/circleci-performance';
const environment = {
  CIRCLECI: 'true', CI: 'true', CIRCLE_JOB: 'test-mocha-failure-rehearsal', CIRCLE_BRANCH: branch, CIRCLE_TAG: '',
  CIRCLE_SHA1: 'a'.repeat(40), CIRCLE_WORKFLOW_ID: 'synthetic-workflow', CIRCLE_BUILD_NUM: '123',
  CI_MOCHA_FAILURE_REHEARSAL_OPT_IN: 'true', CI_MOCHA_FAILURE_REHEARSAL_NPM_MODE: 'none',
  CI_MOCHA_FAILURE_REHEARSAL_DOCKER_MODE: 'none', RBPORTAL_IMAGE: 'redbox-portal:test',
};
const helper = path.join(__dirname, 'ci-mocha-failure-rehearsal.cjs');

test('removing only the rehearsal declarations reconstructs the entire pre-edit config', () => {
  const restored = structuredClone(config);
  delete restored.jobs['build-mocha-failure-rehearsal'];
  delete restored.jobs['test-mocha-failure-rehearsal'];
  delete restored.parameters.ci_mocha_failure_rehearsal;
  delete restored.workflows.mocha_failure_rehearsal;
  assert.equal(createHash('sha256').update(JSON.stringify(restored)).digest('hex'),
    require('./ci-mocha-failure-rehearsal.contract.json').original_config_sha256);
  assert.deepEqual(config.jobs['build-mocha-failure-rehearsal'], config.jobs.build);
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
  assert.deepEqual(invocations.map(item => item.name), ['build-mocha-failure-rehearsal',
    'test-mocha-failure-rehearsal', 'validation-complete-mocha-failure-rehearsal']);
  assert.deepEqual(invocations[1].requires, ['build-mocha-failure-rehearsal']);
  assert.deepEqual(invocations[2].requires, ['test-mocha-failure-rehearsal']);
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
  const suite = steps.find(s => s.run?.name === 'Run deliberately failing Mocha integration suite').run;
  assert.equal(suite.no_output_timeout, '30m');
  assert.equal(suite.command, 'bash support/build/ci-mocha-failure-rehearsal.sh');
});

test('runtime guard rejects missing opt-in, alternate events, publication modes and suite/image overrides', () => {
  assert.doesNotThrow(() => guard(environment));
  for (const [key, values] of Object.entries({
    CI_MOCHA_FAILURE_REHEARSAL_OPT_IN: [undefined, 'false', '1', 'TRUE'], CIRCLECI: [undefined, 'false'],
    CI: [undefined, 'false'], CIRCLE_JOB: [undefined, 'test-mocha'], CIRCLE_WORKFLOW_ID: [undefined],
    CIRCLE_BUILD_NUM: [undefined], CIRCLE_BRANCH: ['master', `${branch}-extra`, `${branch}\n`],
    CIRCLE_TAG: ['v5.0.0'], CI_MOCHA_FAILURE_REHEARSAL_NPM_MODE: [undefined, 'beta'],
    CI_MOCHA_FAILURE_REHEARSAL_DOCKER_MODE: [undefined, 'manual'], RBPORTAL_IMAGE: ['other:image'],
    RBPORTAL_MOCHA_TEST_PATHS: ['one.test.ts'], COMPOSE_FILE: ['override.yml'], COMPOSE_PROFILES: ['mount'],
    RBPORTAL_REUSE_PREBUILT_ASSETS: ['true'], RBPORTAL_EXPECTED_IMAGE_REVISION: ['a'.repeat(40)],
    RBPORTAL_REMOTE_DEBUG: ['9229'],
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

function sandbox() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-mocha-failure-rehearsal-test-'));
  const write = (file, content, executable = false) => {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), content, executable ? { mode: 0o755 } : {});
  };
  for (const extension of ['cjs', 'sh', 'fixture.txt']) write(`support/build/ci-mocha-failure-rehearsal.${extension}`,
    fs.readFileSync(path.join(__dirname, `ci-mocha-failure-rehearsal.${extension}`)));
  for (const file of ['.circleci/config.yml', 'package-lock.json',
    'support/integration-testing/docker-compose.mocha.yml', 'support/integration-testing/run-mocha-redbox.sh',
    'support/unit-testing/codecov/prepare-report.cjs']) write(file, 'synthetic provenance fixture');
  const script = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).scripts['test:mocha:ci'];
  write('package.json', JSON.stringify({ scripts: { 'test:mocha:ci': script } }));
  fs.mkdirSync(path.join(cwd, 'test/integration/services'), { recursive: true });
  write('bin/git', `#!/bin/sh\ncase "$*" in\n 'rev-parse HEAD') echo '${environment.CIRCLE_SHA1}';;\n 'rev-parse HEAD^{tree}') echo '${'b'.repeat(40)}';;\n 'diff --exit-code HEAD --'|'ls-files --others --exclude-standard -z') exit 0;;\n *) exit 99;;\nesac\n`, true);
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
  const execute = (command, args, extra = {}) => spawnSync(command, args, { cwd, env: { ...env, ...extra }, encoding: 'utf8', timeout: 30_000 });
  return { cwd, write, execute, clean: () => fs.rmSync(cwd, { recursive: true, force: true }) };
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
