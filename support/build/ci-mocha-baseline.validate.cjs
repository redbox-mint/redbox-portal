'use strict';

// Compile locally; only CircleCI's read-only public orb resolution uses the network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, '.circleci/config.yml'), 'utf8');
const config = yaml.load(source);
const normal = 'build_test_gendocs_and_deploy';
const branch = 'chore/circleci-performance';
const invocation = config.workflows[normal].jobs.find(job => job['test-mocha-baseline']);
const candidate = config.workflows[normal].jobs.find(job => job['test-mocha'])['test-mocha'];
const evidence = candidate['post-steps'][0].when.steps;
const previous = structuredClone(config);
delete previous.jobs['test-mocha-baseline'];
previous.workflows[normal].jobs = previous.workflows[normal].jobs.filter(job => !job['test-mocha-baseline']);
for (const workflow of Object.values(previous.workflows)) {
  for (const job of workflow.jobs || []) {
    if (job['test-mocha']) delete job['test-mocha']['post-steps'];
  }
}
const reference = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : yaml.dump(previous, { noRefs: true, lineWidth: -1 });
assert.deepEqual(previous, yaml.load(reference), 'Only baseline job/invocation and candidate post-steps may change');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-ci-mocha-baseline-expansions-'));
const cli = args => execFileSync('circleci', args, {
  cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 60_000,
});
process.stdout.write(cli(['config', 'validate', path.join(root, '.circleci/config.yml')]));
const cases = [
  ['chore', branch], ['suffix', `${branch}-extra`], ['nested', `${branch}/nested`],
  ['prefix', `prefix/${branch}`], ['newline', `${branch}\n`],
  ['develop', 'develop'], ['master', 'master'], ['support', 'support/v5'],
  ['feature', 'feature/example'], ['dependabot', 'dependabot/npm/foo'], ['empty', ''],
  ['release', '', 'v5.0.0'], ['rc', '', 'v5.0.0-RC1'], ['chore-tag', branch, 'v5.0.0'],
  ['beta', branch, '', 'beta'], ['manual', branch, '', 'none', 'manual'],
  ['both-modes', branch, '', 'beta', 'manual'],
];

for (const [name, gitBranch, tag = '', npm = 'none', docker = 'none'] of cases) {
  const parameters = JSON.stringify({ npm_publish_mode: npm, docker_publish_mode: docker });
  const expand = (label, text) => {
    const input = path.join(directory, `${name}-${label}-input.yml`);
    fs.writeFileSync(input, text.replaceAll('<< pipeline.git.branch >>', JSON.stringify(gitBranch))
      .replaceAll('<< pipeline.git.tag >>', JSON.stringify(tag)));
    const output = cli(['config', 'process', input, '--pipeline-parameters', parameters]);
    fs.writeFileSync(path.join(directory, `${name}-${label}.yml`), output);
    return yaml.load(output);
  };
  const actual = expand('baseline', source);
  const before = expand('before', reference);
  const workflow = actual.workflows[normal];
  const automatic = npm === 'none' && docker === 'none';
  const eligible = gitBranch === branch && !tag && automatic;
  if (automatic) {
    assert.ok(workflow);
    assert.deepEqual(workflow.jobs.find(job => job['test-mocha-baseline']), {
      'test-mocha-baseline': { ...invocation['test-mocha-baseline'], upstream: { build: ['success'] } },
    });
    assert.deepEqual(actual.jobs['test-mocha-baseline'].steps.find(step => step.run?.name === 'Run Mocha tests'),
      before.jobs['test-mocha'].steps.find(step => step.run?.name === 'Run Mocha tests'));
    // CircleCI processes branch filters but applies them at scheduling time.
    // Pin the exact literal branch + reject every tag; the workflow pins both modes.
    const filters = invocation['test-mocha-baseline'].filters;
    assert.deepEqual(filters, { branches: { only: branch }, tags: { ignore: '/.*/' } });
    assert.equal(automatic && gitBranch === filters.branches.only && !tag, eligible);
    const steps = actual.jobs['test-mocha'].steps;
    if (eligible) assert.deepEqual(steps.slice(-evidence.length), evidence);
    else assert.ok(!steps.some(step => step.run?.name === 'Record matched Mocha candidate identity'));
    // Remove only the deliberate additions, then compare the entire processed graph.
    if (eligible) steps.splice(-evidence.length);
    workflow.jobs = workflow.jobs.filter(job => !job['test-mocha-baseline']);
    delete actual.jobs['test-mocha-baseline'];
  } else {
    assert.ok(!workflow);
    assert.ok(!actual.jobs['test-mocha-baseline']);
  }
  assert.deepEqual(actual, before, `${name}: unexpected full expansion change`);
  console.log(`${name}: baseline ${eligible ? 'enabled' : 'excluded'}; original jobs, gates and publication preserved`);
}
console.log(`Validated ${cases.length} branch/tag/mode pairs. Expansion evidence: ${directory}`);
