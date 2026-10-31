'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const yaml = require('js-yaml');
const config = yaml.load(fs.readFileSync('.circleci/config.yml', 'utf8'));
const candidate = fs.readFileSync('support/build/Dockerfile.combined-pilot', 'utf8');
const script = fs.readFileSync('support/build/ci-combined-pilot.sh', 'utf8');

test('combined experiment is opt-in and cannot publish', () => {
  assert.equal(config.parameters.ci_combined_build_pilot.default, false);
  const workflow = config.workflows.combined_build_shadow;
  assert.equal(workflow.jobs.length, 2);
  assert.deepEqual(workflow.jobs.map(j => j['combined-build-pilot'].variant), ['control', 'candidate']);
  const gate = JSON.stringify(workflow.when);
  for (const value of ['chore/circleci-performance', 'pipeline.git.tag', 'npm_publish_mode', 'docker_publish_mode', 'ci_web_assets_pilot'])
    assert.ok(gate.includes(value));
  assert.doesNotMatch(script, /--push|docker push|docker login/);
});

test('candidate overlaps production installation and retains test dependency overlay', () => {
  assert.match(candidate, /FROM backend_builder AS production_dependencies/);
  assert.match(candidate, /FROM builder AS test_dependencies/);
  assert.match(candidate, /COPY --from=test_dependencies --chown=node:node \/tmp\/test-node_modules/);
  assert.match(candidate, /COPY --from=test_dependencies --chown=node:node \/tmp\/test-package-node-modules/);
  assert.match(candidate, /ARG NG_BUILD_MAX_WORKERS=2/);
  assert.match(candidate, /type=cache,target=\/root\/\.npm,sharing=shared/);
  assert.match(script, /--no-cache/);
  assert.match(script, /docker-image-contract\.cjs/);
});
