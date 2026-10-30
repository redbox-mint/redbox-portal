const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../..');
const config = yaml.load(fs.readFileSync(path.join(root, '.circleci/config.yml'), 'utf8'));
const contract = JSON.parse(fs.readFileSync(path.join(root, '.circleci/validation-contract.json'), 'utf8'));
const independent = ['generate-api-docs', 'test-angular', 'test-sails-ng-common', 'test-redbox-core',
  'test-agenda-sqs-backend', 'test-rva-registry', 'test-redbox-dev-tools-cli', 'test-storage-mongo'];
const integrated = ['test-bruno-general', 'test-bruno-oidc', 'test-bruno-s3', 'test-playwright', 'test-mocha'];
const normal = 'build_test_gendocs_and_deploy';
const dependabot = 'build_test_dependabot';
const release = 'release_build_test_gendocs_and_deploy';

function jobs(workflow) {
  return workflow.jobs.map(job => typeof job === 'string' ? { job, name: job } :
    { job: Object.keys(job)[0], name: Object.values(job)[0]?.name || Object.keys(job)[0], ...Object.values(job)[0] });
}

function ancestors(list, name, visited = new Set()) {
  const job = list.find(item => item.name === name || item.matrix?.alias === name);
  assert.ok(job, `missing job ${name}`);
  for (const dependency of job.requires || []) {
    if (!visited.has(dependency)) {
      visited.add(dependency);
      ancestors(list, dependency, visited);
    }
  }
  return visited;
}

function matches(value, expression) {
  return Array.isArray(expression) ? expression.some(item => matches(value, item)) :
    expression.startsWith('/') ? new RegExp(expression.slice(1, -1)).test(value) : value === expression;
}

function included(job, branch, tag) {
  const filter = tag ? job.filters?.tags : job.filters?.branches;
  if (tag && !filter) return false;
  const value = tag || branch;
  return (!filter?.only || matches(value, filter.only)) && (!filter?.ignore || !matches(value, filter.ignore));
}

test('suite commands, coverage/failure handling, JUnit outputs, artifacts, and matrices are preserved', () => {
  for (const [name, expected] of Object.entries(contract.tests)) {
    const steps = config.jobs[name].steps;
    assert.deepEqual({
      runs: steps.filter(s => s.run && typeof s.run === 'object' && /^(Run |Upload |Type-check |Verify record|Test Agenda)/.test(s.run.name)).map(s => s.run),
      junit: steps.filter(s => s.store_test_results).map(s => s.store_test_results.path),
      artifacts: steps.filter(s => s.store_artifacts).map(s => s.store_artifacts.path),
    }, expected, name);
  }
  for (const [workflow, expected] of Object.entries(contract.workflows)) {
    const actual = jobs(config.workflows[workflow]);
    for (const original of expected) {
      const item = actual.find(j => j.job === original.job && j.name === (original.name || original.job));
      assert.ok(item, `${workflow}: ${original.job}`);
      assert.deepEqual(item.matrix, original.matrix);
      // Explicit Dependabot scoping is necessary after removing the build edge.
      if (workflow === normal && [...independent, ...integrated].includes(item.job) && !original.filters) {
        assert.deepEqual(item.filters, { branches: { ignore: '/^dependabot.*/' } });
      } else if (workflow === dependabot && [...independent, ...integrated].includes(item.job) && !original.filters) {
        assert.deepEqual(item.filters, { branches: { only: '/^dependabot.*/' }, tags: { ignore: '/.*/' } });
      } else if (workflow === normal && item.job === 'build-runtime-pdfgen') {
        for (const branch of ['master', 'develop', 'support/v5', 'feature/example', 'dependabot/npm/foo']) {
          assert.equal(included(item, branch), included(original, branch));
        }
        assert.ok(included(item, 'chore/circleci-performance'));
      } else assert.deepEqual(item.filters, original.filters, `${workflow}: ${item.name} filters`);
    }
  }
});

test('independent jobs and PDF preparation do not wait for an image; Dependabot still waits for refresh', () => {
  for (const workflow of [normal, dependabot, release]) {
    const list = jobs(config.workflows[workflow]);
    for (const name of independent) {
      const job = list.find(j => j.job === name);
      assert.deepEqual(job.requires || [], workflow === dependabot ? ['refresh-dependabot-package-locks'] : []);
      assert.ok(!config.jobs[name].steps.some(s => s.attach_workspace), name);
      assert.equal(config.jobs[name].steps[0], 'checkout-validation-source');
    }
    if (workflow !== dependabot) assert.deepEqual(list.find(j => j.job === 'build-runtime-pdfgen').requires || [], []);
    for (const name of integrated) assert.ok(ancestors(list, name).has('build'));
  }
});

test('automatic publication waits for every check and each archive has a real ancestor producer', () => {
  for (const workflow of [normal, release]) {
    const list = jobs(config.workflows[workflow]);
    const gate = list.find(j => j.job === 'validation-complete');
    assert.deepEqual(new Set(gate.requires), new Set([...independent, ...integrated]));
    for (const job of list.filter(j => /^(deploy|publish-|npm-publish)/.test(j.job))) {
      const parents = ancestors(list, job.name);
      assert.ok(parents.has('validation-complete'), `${workflow}: ${job.name}`);
      for (const check of [...independent, ...integrated]) assert.ok(parents.has(check));
      if (job.job.startsWith('deploy-runtime-pdfgen')) assert.ok(parents.has('build-runtime-pdfgen'));
    }
  }
  for (const workflow of [normal, dependabot, release]) {
    const list = jobs(config.workflows[workflow]);
    for (const job of list) {
      const parents = ancestors(list, job.name);
      const steps = config.jobs[job.job].steps;
      const loads = steps.filter(s => s.run?.command?.includes('docker load -i'));
      for (const load of loads) {
        const pdf = load.run.command.includes('/pdfgen/');
        assert.ok(parents.has(pdf ? 'build-runtime-pdfgen' : 'build'), job.name);
      }
      if (workflow === dependabot && (steps.includes('checkout-validation-source') || steps.includes('use-refreshed-revision'))) {
        assert.ok(parents.has('refresh-dependabot-package-locks'), job.name);
      }
    }
  }
  const testPaths = config.jobs.build.steps.find(s => s.persist_to_workspace).persist_to_workspace.paths;
  const pdfPaths = config.jobs['build-runtime-pdfgen'].steps.find(s => s.persist_to_workspace).persist_to_workspace.paths;
  assert.ok(testPaths.every(p => p.startsWith('docker-images/test/')));
  assert.ok(pdfPaths.every(p => p.startsWith('docker-images/pdfgen/')));
});

test('branch/tag cohorts keep all gate dependencies enabled and chore PDF never publishes', () => {
  for (const branch of ['feature/example', 'chore/circleci-performance', 'develop', 'master', 'support/v5']) {
    const list = jobs(config.workflows[normal]);
    for (const job of list.filter(j => included(j, branch))) {
      for (const parent of job.requires || []) {
        assert.ok(included(list.find(j => j.name === parent || j.matrix?.alias === parent), branch), `${branch}: ${job.name} -> ${parent}`);
      }
    }
    if (!['develop', 'master', 'support/v5'].includes(branch)) {
      assert.ok(list.filter(j => /^(deploy|publish-|generate-docs)/.test(j.job)).every(j => !included(j, branch)));
    }
  }
  const dep = jobs(config.workflows[dependabot]);
  for (const job of dep.filter(j => j.job === 'build' || independent.includes(j.job))) {
    assert.ok(included(job, 'dependabot/npm/foo'));
    assert.ok(!included(job, 'feature/example'));
  }
  for (const tag of ['v5.0.0', 'v5.0.0-RC1', 'v5.0.0-rc2']) {
    const list = jobs(config.workflows[release]);
    for (const job of list.filter(j => included(j, '', tag))) {
      for (const parent of job.requires || []) {
        assert.ok(included(list.find(j => j.name === parent || j.matrix?.alias === parent), '', tag), `${tag}: ${parent}`);
      }
    }
    assert.ok(included(list.find(j => j.name === 'test-playwright'), '', tag));
    assert.equal(included(list.find(j => j.name === 'npm-publish-backend'), '', tag), tag === 'v5.0.0');
    assert.equal(included(list.find(j => j.name === 'npm-publish-backend-rc'), '', tag), tag !== 'v5.0.0');
  }
});

test('Dependabot checkout uses the carried commit, not the original pipeline revision or moving branch', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-ci-source-'));
  const git = args => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git(['init']); git(['config', 'user.name', 'test']); git(['config', 'user.email', 'test@example.com']);
    git(['commit', '--allow-empty', '-m', 'original']); const original = git(['rev-parse', 'HEAD']);
    git(['commit', '--allow-empty', '-m', 'refreshed']); const refreshed = git(['rev-parse', 'HEAD']);
    git(['commit', '--allow-empty', '-m', 'later']);
    git(['remote', 'add', 'origin', directory]);
    const workspace = path.join(directory, 'workspace/source-revision');
    fs.mkdirSync(workspace, { recursive: true }); fs.writeFileSync(path.join(workspace, 'revision'), `${refreshed}\n`);
    const command = config.commands['use-refreshed-revision'].steps[0].when.steps[0].run.command
      .replace('/tmp/source-revision/revision', `${workspace}/revision`);
    const bashEnv = path.join(directory, 'bash-env');
    execFileSync('bash', ['-eo', 'pipefail', '-c', command], {
      cwd: directory, env: { ...process.env, CIRCLE_SHA1: original, BASH_ENV: bashEnv }, stdio: 'pipe',
    });
    assert.equal(git(['rev-parse', 'HEAD']), refreshed);
    const environment = fs.readFileSync(bashEnv, 'utf8');
    assert.ok(environment.includes(`CI_PIPELINE_REVISION=${original}`));
    assert.ok(environment.includes(`CIRCLE_SHA1=${refreshed}`));
    fs.writeFileSync(path.join(workspace, 'revision'), 'invalid\n');
    assert.throws(() => execFileSync('bash', ['-eo', 'pipefail', '-c', command], {
      cwd: directory, env: { ...process.env, CIRCLE_SHA1: original, BASH_ENV: bashEnv }, stdio: 'pipe',
    }));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

// Opt in after processing all modes with the CircleCI CLI; no network calls in unit tests.
test('CircleCI-processed modes expand matrices, preserve gate edges, and include refreshed checkout', {
  skip: !process.env.CIRCLECI_EXPANDED_DIR,
}, () => {
  const expanded = mode => yaml.load(fs.readFileSync(path.join(process.env.CIRCLECI_EXPANDED_DIR, `redbox-circleci-${mode}.yml`), 'utf8'));
  const regular = expanded('default');
  const dep = expanded('dependabot');
  const beta = expanded('beta');
  const manual = expanded('manual');
  assert.deepEqual(Object.keys(beta.workflows).filter(k => k !== 'version'), ['npm_beta_publish']);
  assert.deepEqual(Object.keys(manual.workflows).filter(k => k !== 'version'), ['docker_manual_publish']);
  assert.equal(beta.jobs['npm-publish-backend'].steps.at(-1).run.command.includes('NPM_RELEASE_KIND="beta"'), true);
  assert.equal(jobs(manual.workflows.docker_manual_publish).length, 6);
  for (const workflow of [normal, dependabot, release]) {
    const list = jobs(regular.workflows[workflow]);
    assert.equal(list.filter(j => j.job.startsWith('test-angular-')).length, 19);
    for (const job of list) {
      for (const parent of job.requires || []) assert.ok(list.some(j => j.name === parent), `${workflow}: ${parent}`);
    }
    if (workflow !== dependabot) {
      const gate = list.find(j => j.name === 'validation-complete');
      assert.equal(gate.requires.filter(n => n.startsWith('test-angular-')).length, 19);
      for (const name of ['test-playwright', 'test-rva-registry', 'generate-api-docs']) assert.ok(gate.requires.includes(name));
    }
  }
  for (const job of jobs(dep.workflows[dependabot]).filter(j => {
    const steps = config.jobs[j.job]?.steps || [];
    return steps.includes('checkout-validation-source') || steps.includes('use-refreshed-revision') || j.job.startsWith('test-angular-');
  })) {
    const steps = dep.jobs[job.job].steps;
    assert.equal(steps.filter(s => s.attach_workspace).length, 1, `${job.name} attaches workspace only once`);
    assert.ok(steps.some(s => s.attach_workspace?.at === '/tmp'), job.name);
    assert.ok(steps.some(s => s.run?.name === 'Check out exact refreshed Dependabot revision'), job.name);
    assert.ok(ancestors(jobs(dep.workflows[dependabot]), job.name).has('refresh-dependabot-package-locks'));
  }
});
