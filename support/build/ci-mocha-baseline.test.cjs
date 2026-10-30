'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { test } = require('node:test');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../..');
const config = yaml.load(fs.readFileSync(path.join(root, '.circleci/config.yml'), 'utf8'));
const original = require('./ci-mocha-pilot.contract.json')['test-mocha'];
const normal = 'build_test_gendocs_and_deploy';
const branch = 'chore/circleci-performance';
const baseline = config.jobs['test-mocha-baseline'];
const candidate = config.workflows[normal].jobs.find(job => job['test-mocha'])['test-mocha'];

test('matched baseline preserves the complete original job apart from coverage publication and evidence', () => {
  const expected = structuredClone(original);
  const upload = expected.steps.findIndex(step => step.run?.name === 'Upload Mocha code coverage');
  const normalization = expected.steps[upload].run.command.split('/tmp/.codecov-cli/codecov')[0];
  expected.steps.splice(upload, 1,
    { run: { name: 'Normalize baseline Mocha coverage', when: 'always', command: normalization } },
    { run: { name: 'Record matched Mocha baseline identity', when: 'always', command: 'node support/build/ci-mocha-baseline.cjs baseline' } },
    { store_artifacts: { path: 'coverage/mocha/lcov.info', destination: 'ci-mocha-baseline/baseline/lcov.info' } },
    { store_artifacts: { path: '.tmp/junit/backend-mocha', destination: 'ci-mocha-baseline/baseline/junit' } },
    { store_artifacts: { path: '.tmp/ci-mocha-baseline', destination: 'ci-mocha-baseline/baseline/identity' } });
  assert.deepEqual(baseline, expected);
  assert.deepEqual(candidate.requires, ['build']);
  assert.equal(baseline.steps.filter(step => step.run?.command?.includes('docker load -i')).length, 1);
  assert.ok(!JSON.stringify(baseline).includes('upload-process'), 'No duplicate Codecov publication');
});

test('only the automatic exact chore cohort schedules baseline and candidate evidence; nothing depends on baseline', () => {
  let invocations = 0;
  for (const [name, workflow] of Object.entries(config.workflows)) {
    if (!workflow.jobs) continue;
    for (const job of workflow.jobs) {
      const settings = typeof job === 'string' ? {} : Object.values(job)[0];
      assert.ok(!(settings.requires || []).includes('test-mocha-baseline'), `${name}: baseline must never gate`);
      if (job['test-mocha']) assert.deepEqual(settings['post-steps'], candidate['post-steps'],
        'Identical guarded post-steps prevent CircleCI from renaming reused test-mocha jobs');
      if (!job['test-mocha-baseline']) continue;
      invocations += 1;
      assert.equal(name, normal);
      assert.deepEqual(settings, {
        requires: ['build'],
        filters: { branches: { only: branch }, tags: { ignore: '/.*/' } },
      });
    }
  }
  assert.equal(invocations, 1);
  assert.deepEqual(config.workflows[normal].when, { and: [
    { equal: ['none', '<< pipeline.parameters.npm_publish_mode >>'] },
    { equal: ['none', '<< pipeline.parameters.docker_publish_mode >>'] },
  ] });
  const evidence = candidate['post-steps'];
  assert.equal(evidence.length, 1);
  assert.deepEqual(evidence[0].when.condition, config.jobs['test-mocha'].steps.find(step => step.unless).unless.condition);
  assert.deepEqual(evidence[0].when.steps, [
    { run: { name: 'Record matched Mocha candidate identity', when: 'always', command: 'node support/build/ci-mocha-baseline.cjs candidate' } },
    { store_artifacts: { path: '.tmp/junit/backend-mocha', destination: 'ci-mocha-baseline/candidate/junit' } },
    { store_artifacts: { path: '.tmp/ci-mocha-baseline', destination: 'ci-mocha-baseline/candidate/identity' } },
  ]);
  const guard = evidence[0].when.condition;
  for (const gitBranch of [branch, `${branch}-extra`, `${branch}/nested`, `prefix/${branch}`, `${branch}\n`,
    'develop', 'master', 'support/v5', 'feature/example', 'dependabot/npm/foo', '']) {
    for (const tag of ['', 'v5.0.0', 'v5.0.0-RC1', branch]) {
      for (const npm of ['none', 'beta']) {
        for (const docker of ['none', 'manual']) {
          const values = {
            '<< pipeline.git.branch >>': gitBranch, '<< pipeline.git.tag >>': tag,
            '<< pipeline.parameters.npm_publish_mode >>': npm, '<< pipeline.parameters.docker_publish_mode >>': docker,
          };
          const enabled = guard.and.every(item => item.equal[0] === values[item.equal[1]]);
          const scheduled = gitBranch === branch && !tag && npm === 'none' && docker === 'none';
          assert.equal(enabled, scheduled, JSON.stringify(values));
        }
      }
    }
  }
});

test('identity evidence matches the image/revision and fails visibly on missing reports or a mismatched checkout', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-mocha-baseline-evidence-'));
  try {
    const bin = path.join(directory, 'bin');
    fs.mkdirSync(bin);
    const revision = 'a'.repeat(40);
    const image = `sha256:${'b'.repeat(64)}`;
    fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nprintf '%s\\n' '${revision}'\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/sh\ncase "$*" in
      'image inspect --format {{.Id}} redbox-portal:test') printf '%s\\n' '${image}' ;;
      'compose version --short') printf '%s\\n' '2.40.0' ;;
      *) exit 99 ;;
    esac\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\nprintf "%s\\n" "11.0.0"\n', { mode: 0o755 });
    for (const file of ['package-lock.json', '.nvmrc', '.circleci/config.yml',
      'support/integration-testing/docker-compose.mocha.yml', 'support/integration-testing/run-mocha-redbox.sh',
      'support/unit-testing/codecov/prepare-report.cjs', 'coverage/mocha/lcov.info', '.tmp/junit/backend-mocha/backend-mocha.xml']) {
      fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      fs.writeFileSync(path.join(directory, file), `fixture ${file}\n`);
    }
    const archive = path.join(directory, 'test.tar');
    fs.writeFileSync(archive, 'same image archive');
    const helper = path.join(__dirname, 'ci-mocha-baseline.cjs');
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CIRCLE_SHA1: revision,
      RBPORTAL_IMAGE: 'redbox-portal:test', CIRCLE_WORKFLOW_ID: 'same-workflow' };
    const run = (role, overrides = {}) => spawnSync(process.execPath, [helper, role, archive], {
      cwd: directory, env: { ...env, ...overrides }, encoding: 'utf8',
    });
    const read = () => JSON.parse(fs.readFileSync(path.join(directory, '.tmp/ci-mocha-baseline/identity.json')));
    assert.equal(run('candidate').status, 0);
    const first = read();
    assert.equal(run('baseline').status, 0);
    assert.deepEqual(read(), { ...first, role: 'baseline' });
    assert.equal(first.image_id, image);
    assert.equal(first.revision, revision);
    assert.equal(first.workflow_id, 'same-workflow');
    assert.equal(first.image_archive_sha256, require('node:crypto').createHash('sha256').update('same image archive').digest('hex'));
    assert.notEqual(run('baseline', { CIRCLE_SHA1: 'c'.repeat(40) }).status, 0);
    assert.notEqual(run('baseline', { RBPORTAL_IMAGE: 'other:image' }).status, 0);
    fs.writeFileSync(path.join(directory, 'coverage/mocha/lcov.info'), '');
    assert.notEqual(run('baseline').status, 0);
    fs.writeFileSync(path.join(directory, 'coverage/mocha/lcov.info'), 'restored report');
    fs.unlinkSync(path.join(directory, '.tmp/junit/backend-mocha/backend-mocha.xml'));
    assert.notEqual(run('baseline').status, 0);
    assert.notEqual(run('unknown').status, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('baseline runs the unchanged failing suite command without masking its status', () => {
  const run = baseline.steps.find(step => step.run?.name === 'Run Mocha tests').run;
  assert.deepEqual(run, original.steps.find(step => step.run?.name === 'Run Mocha tests').run);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-mocha-baseline-failure-'));
  try {
    fs.writeFileSync(path.join(directory, 'npm'), '#!/bin/sh\nexit 23\n', { mode: 0o755 });
    assert.throws(() => execFileSync('bash', ['-eo', 'pipefail', '-c', run.command], {
      cwd: directory, env: { ...process.env, PATH: `${directory}:${process.env.PATH}` }, stdio: 'pipe',
    }), error => error.status === 23);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
