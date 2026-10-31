'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../../..');
const config = yaml.load(fs.readFileSync(path.join(root, '.circleci/config.yml'), 'utf8'));
const jobs = ['web-assets-produce', 'web-assets-control-arm64', 'web-assets-shared-arm64'];

function evaluate(expression, values) {
  if (expression.and) return expression.and.every(item => evaluate(item, values));
  assert.ok(expression.equal, 'unknown condition');
  const [left, right] = expression.equal.map(value => (Object.hasOwn(values, value) ? values[value] : value));
  return left === right;
}

test('the shadow workflow is default-off and cannot run on publication or other branches', () => {
  assert.deepEqual(config.parameters.ci_web_assets_pilot, { type: 'boolean', default: false });
  const workflow = config.workflows.ci_web_assets_shadow;
  for (const enabled of [false, true])
    for (const rehearsal of [false, true])
      for (const branch of ['chore/circleci-performance', 'develop', 'dependabot/example'])
        for (const tag of ['', 'v1'])
          for (const npm of ['none', 'beta'])
            for (const docker of ['none', 'manual']) {
              const values = {
                '<< pipeline.parameters.ci_web_assets_pilot >>': enabled,
                '<< pipeline.parameters.ci_mocha_failure_rehearsal >>': rehearsal,
                '<< pipeline.git.branch >>': branch,
                '<< pipeline.git.tag >>': tag,
                '<< pipeline.parameters.npm_publish_mode >>': npm,
                '<< pipeline.parameters.docker_publish_mode >>': docker,
              };
              assert.equal(
                evaluate(workflow.when, values),
                enabled &&
                  !rehearsal &&
                  branch === 'chore/circleci-performance' &&
                  !tag &&
                  npm === 'none' &&
                  docker === 'none',
                JSON.stringify(values)
              );
            }
  assert.deepEqual(
    workflow.jobs.map(job => Object.keys(job)[0]),
    jobs
  );
  assert.deepEqual(workflow.jobs[2][jobs[2]].requires, [jobs[0]]);
  for (const job of workflow.jobs) {
    const filters = Object.values(job)[0].filters;
    assert.equal(filters.branches.only, 'chore/circleci-performance');
    assert.equal(filters.tags.ignore, '/.*/');
  }
});

test('existing workflows do not depend on the shadow jobs', () => {
  for (const [name, workflow] of Object.entries(config.workflows)) {
    if (name === 'ci_web_assets_shadow' || name === 'version') continue;
    for (const job of jobs) assert.equal(JSON.stringify(workflow).includes(job), false, `${name}: ${job}`);
  }
});

test('pilot uses native executors, disjoint workspace paths and no publication commands', () => {
  for (const [index, name] of jobs.entries()) {
    const job = config.jobs[name];
    assert.equal(job.machine.image, 'ubuntu-2404:current');
    assert.equal(job.machine.docker_layer_caching, false);
    assert.equal(job.resource_class, index ? 'arm.medium' : 'medium');
    const serialized = JSON.stringify(job.steps);
    assert.match(serialized, /circleci-pilot-runner\.cjs/);
    assert.match(serialized, /--kill-after=90s/);
    assert.match(serialized, /--grace-ms 75000/);
    assert.doesNotMatch(serialized, /docker-images\/test|docker-images\/pdfgen|docker push|--push/);
  }
  assert.ok(JSON.stringify(config.jobs[jobs[0]].steps).includes('redbox-web-assets-transfer'));
  for (const suite of [
    'ci-performance.test.cjs',
    'circleci-pilot.test.cjs',
    'circleci-pilot-runner.test.cjs',
    'circleci-pilot-config.test.cjs',
    'pilot.test.cjs',
  ])
    assert.ok(JSON.stringify(config.jobs[jobs[0]].steps).includes(suite), suite);
  assert.ok(JSON.stringify(config.jobs[jobs[2]].steps).includes('attach_workspace'));
  assert.equal(JSON.stringify(config.jobs[jobs[1]].steps).includes('attach_workspace'), false);
});
