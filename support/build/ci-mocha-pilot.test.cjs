'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../..');
const config = yaml.load(fs.readFileSync(path.join(root, '.circleci/config.yml'), 'utf8'));
const contract = require('./ci-mocha-pilot.contract.json');
const original = contract['test-mocha'];
const job = config.jobs['test-mocha'];
const branch = 'chore/circleci-performance';
const compileName = 'Install required ReDBox dependencies';
const compileStep = original.steps.find(step => step.run?.name === compileName);
const pilot = job.steps.find(step => step.unless)?.unless;

function condition(expression, values) {
  if (expression.and) return expression.and.every(item => condition(item, values));
  assert.ok(expression.equal, 'Unexpected condition must fail the contract');
  const [left, right] = expression.equal.map(value => Object.hasOwn(values, value) ? values[value] : value);
  return left === right;
}

test('only seven host compiles are conditional; the complete original Mocha job is preserved', () => {
  assert.ok(pilot);
  assert.deepEqual(pilot.steps, [compileStep]);
  assert.deepEqual({ ...job, steps: job.steps.flatMap(step => step.unless ? step.unless.steps : step.when ? [] : [step]) }, original);
  assert.deepEqual(compileStep.run.command.trim().split(' && '), [
    'sails-ng-common', 'raido', 'rva', 'agenda-sqs', 'core', 'storage-mongo', 'sails',
  ].map(name => `npm run compile:${name}`));
  assert.deepEqual(pilot.condition, { and: [
    { equal: [branch, '<< pipeline.git.branch >>'] },
    { equal: ['', '<< pipeline.git.tag >>'] },
    { equal: ['none', '<< pipeline.parameters.npm_publish_mode >>'] },
    { equal: ['none', '<< pipeline.parameters.docker_publish_mode >>'] },
  ] });
});

test('exact branch, tags and every publication mode select the original or pilot job', () => {
  for (const candidate of [branch, `${branch}-extra`, `${branch}/nested`, `prefix/${branch}`,
    `${branch}\n`, 'develop', 'master', 'support/v5', 'feature/example', 'dependabot/npm/foo', '']) {
    for (const tag of ['', 'v5.0.0', 'v5.0.0-RC1', branch]) {
      for (const npm of ['none', 'beta']) {
        for (const docker of ['none', 'manual']) {
          const skip = condition(pilot.condition, {
            '<< pipeline.git.branch >>': candidate, '<< pipeline.git.tag >>': tag,
            '<< pipeline.parameters.npm_publish_mode >>': npm,
            '<< pipeline.parameters.docker_publish_mode >>': docker,
          });
          const expected = candidate === branch && !tag && npm === 'none' && docker === 'none';
          assert.equal(skip, expected, JSON.stringify({ candidate, tag, npm, docker }));
          const steps = job.steps.flatMap(step => step.unless ? (skip ? [] : step.unless.steps) : step.when ? [] : [step]);
          assert.deepEqual(steps, original.steps.filter(step => !expected || step !== compileStep));
          for (const name of ['test-mocha', 'test-playwright']) {
            const artifact = config.jobs[name].steps.find(step => step.when).when;
            assert.equal(condition(artifact.condition, {
              '<< pipeline.git.branch >>': candidate, '<< pipeline.git.tag >>': tag,
              '<< pipeline.parameters.npm_publish_mode >>': npm,
              '<< pipeline.parameters.docker_publish_mode >>': docker,
            }), expected, `${name}: artifact eligibility`);
          }
        }
      }
    }
  }
});

test('both LCOV artifacts follow the unchanged always-run normalization/upload without hiding failures', () => {
  for (const [name, baseline] of Object.entries(contract)) {
    const suite = name.slice('test-'.length);
    const current = config.jobs[name];
    const conditional = current.steps.filter(step => step.when);
    assert.equal(conditional.length, 1);
    const artifact = conditional[0].when;
    assert.deepEqual(artifact.condition, pilot.condition);
    assert.deepEqual(artifact.steps, [{ store_artifacts: {
      path: `coverage/${suite}/lcov.info`, destination: `ci-mocha-pilot/${suite}/lcov.info`,
    } }]);
    const index = current.steps.indexOf(conditional[0]);
    const upload = current.steps[index - 1].run;
    assert.equal(upload.when, 'always');
    assert.match(upload.command, new RegExp(`prepare-report\\.cjs "\\./coverage/${suite}/lcov\\.info"`));
    assert.match(upload.command, /upload-process --fail-on-error/);
    assert.ok(!upload.command.includes('|| true'));
    assert.deepEqual({ ...current, steps: current.steps.flatMap(step =>
      step.unless ? step.unless.steps : step.when ? [] : [step]) }, baseline);
  }
});

test('real portal Compose rendering keeps all application builds and dependencies inside the image', () => {
  const rendered = spawnSync('docker', ['compose', '--env-file', '/dev/null', '--project-name', 'ci-mocha-pilot-contract',
    '--profile', 'portal', '-f', 'support/integration-testing/docker-compose.mocha.yml', 'config', '--format', 'json'], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
    env: { PATH: process.env.PATH, RBPORTAL_IMAGE: 'redbox-portal:test', CI: 'true' },
  });
  assert.ifError(rendered.error);
  assert.equal(rendered.status, 0, rendered.stderr);
  const services = JSON.parse(rendered.stdout).services;
  const portal = services.redboxportal;
  assert.equal(services['redboxportal-mount'], undefined);
  assert.equal(portal.image, 'redbox-portal:test');
  assert.deepEqual(portal.entrypoint, ['bash', '/opt/redbox-portal/support/integration-testing/run-mocha-redbox.sh']);
  // Exhaustive ledger: no root, packages, node_modules, assets, api, or other build mount.
  const mounts = {
    test: '/opt/redbox-portal/test', support: '/opt/redbox-portal/support',
    typescript: '/opt/redbox-portal/typescript', 'tsconfig.json': '/opt/redbox-portal/tsconfig.json',
    'coverage/mocha': '/tmp/coverage/mocha', '.tmp/junit/backend-mocha': '/opt/redbox-portal/.tmp/junit/backend-mocha',
    '.tmp/attachments': '/attachments',
    'support/integration-testing/recordtype-solr-multi-core-example.js': '/opt/redbox-portal/config/recordtype.js',
    'support/integration-testing/solr-multi-core-example.js': '/opt/redbox-portal/config/solr.js',
    'test/resources/config/emailnotification.js': '/opt/redbox-portal/config/emailnotification.js',
    'support/resources/development/bootstrap-data': '/opt/redbox-portal/bootstrap-data',
  };
  assert.deepEqual(portal.volumes.map(({ source, target, type, read_only }) => ({ source, target, type, read_only: !!read_only }))
    .sort((a, b) => a.target.localeCompare(b.target)),
    Object.entries(mounts).map(([source, target]) => ({ source: path.join(root, source), target, type: 'bind',
      read_only: source === 'support/resources/development/bootstrap-data' })).sort((a, b) => a.target.localeCompare(b.target)));
});

test('the actual CI command preserves test exit status through Compose cleanup', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-mocha-pilot-exit-'));
  try {
    const script = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts['test:mocha:ci'];
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ scripts: { 'test:mocha:ci': script } }));
    const bin = path.join(directory, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_LOG"
case " $* " in
  *" up "*) exit "$TEST_STATUS" ;;
  *" down "*) exit "$CLEANUP_STATUS" ;;
  *) exit 99 ;;
esac
`, { mode: 0o755 });
    const command = original.steps.find(step => step.run?.name === 'Run Mocha tests').run.command;
    for (const [testStatus, cleanupStatus] of [[0, 0], [23, 0], [0, 17], [23, 17]]) {
      const log = path.join(directory, 'docker.log');
      fs.writeFileSync(log, '');
      const result = spawnSync('bash', ['-eo', 'pipefail', '-c', command], {
        cwd: directory, encoding: 'utf8', timeout: 20_000,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DOCKER_LOG: log,
          TEST_STATUS: String(testStatus), CLEANUP_STATUS: String(cleanupStatus) },
      });
      assert.ifError(result.error);
      assert.equal(result.status, testStatus, result.stderr);
      const calls = fs.readFileSync(log, 'utf8').trim().split('\n');
      assert.equal(calls.length, 2);
      assert.match(calls[0], /--profile portal .* up --menu=false --abort-on-container-exit --exit-code-from redboxportal redboxportal$/);
      assert.match(calls[1], /--profile portal .* down -v --remove-orphans --timeout 180$/);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
