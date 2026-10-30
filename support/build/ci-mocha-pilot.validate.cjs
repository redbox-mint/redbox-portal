'use strict';

// Read-only CircleCI compilation; all generated fixtures live outside the checkout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, '.circleci/config.yml'), 'utf8');
const config = yaml.load(source);
const contract = require('./ci-mocha-pilot.contract.json');
const original = contract['test-mocha'];
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-ci-mocha-expansions-'));
const branch = 'chore/circleci-performance';
const compileName = 'Install required ReDBox dependencies';
const compileStep = original.steps.find(step => step.run?.name === compileName);
const legacy = structuredClone(config);
Object.assign(legacy.jobs, contract);

// An optional pre-edit config proves that *every* other job, workflow, parameter,
// filter, dependency and publication setting is identical, not just selected fields.
if (process.argv[2]) {
  assert.deepEqual(legacy, yaml.load(fs.readFileSync(process.argv[2], 'utf8')),
    'Only the test-mocha compile wrapper and guarded Mocha/Playwright LCOV artifacts may change');
}

function cli(args) {
  return execFileSync('circleci', args, {
    cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 60_000,
  });
}

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
  // CLI branch inference cannot represent all event contexts. Substitute only the
  // two Git pipeline values into temporary fixtures; let CircleCI resolve all
  // actual conditions, parameters, reusable commands, workflows and matrices.
  const withEvent = text => text.replaceAll('<< pipeline.git.branch >>', JSON.stringify(gitBranch))
    .replaceAll('<< pipeline.git.tag >>', JSON.stringify(tag));
  const expand = (label, text) => {
    const input = path.join(directory, `${name}-${label}-input.yml`);
    fs.writeFileSync(input, withEvent(text));
    const output = cli(['config', 'process', input, '--pipeline-parameters', parameters]);
    fs.writeFileSync(path.join(directory, `${name}-${label}.yml`), output);
    return yaml.load(output);
  };
  const actual = expand('pilot', source);
  const expected = expand('legacy', yaml.dump(legacy, { lineWidth: -1, noRefs: true }));
  const skip = gitBranch === branch && !tag && npm === 'none' && docker === 'none';
  if (skip) {
    const steps = expected.jobs['test-mocha'].steps;
    assert.equal(steps.filter(step => step.run?.name === compileName).length, 1);
    expected.jobs['test-mocha'].steps = steps.filter(step => step.run?.name !== compileName);
    for (const name of Object.keys(contract)) {
      const suite = name.slice('test-'.length);
      const steps = expected.jobs[name].steps;
      const uploadIndex = steps.findIndex(step => step.run?.name === `Upload ${suite === 'mocha' ? 'Mocha' : 'Playwright'} code coverage`);
      assert.ok(uploadIndex >= 0);
      steps.splice(uploadIndex + 1, 0, { store_artifacts: {
        path: `coverage/${suite}/lcov.info`, destination: `ci-mocha-pilot/${suite}/lcov.info`,
      } });
    }
  }
  // The full graph must differ only by the omitted run and two guarded artifacts.
  assert.deepEqual(actual, expected, `${name}: unexpected processed config change`);
  if (!actual.jobs['test-mocha']) {
    assert.ok(npm !== 'none' || docker !== 'none', `${name}: Mocha unexpectedly absent`);
    const workflows = Object.keys(actual.workflows).filter(key => key !== 'version');
    assert.deepEqual(workflows, [docker === 'manual' ? 'docker_manual_publish' : 'npm_beta_publish']);
    console.log(`${name}: original publication workflow preserved; Mocha remains unscheduled; complete expanded config matches`);
    continue;
  }
  const count = actual.jobs['test-mocha'].steps.filter(step => step.run?.name === compileName).length;
  assert.equal(count, skip ? 0 : 1, name);
  if (count) assert.equal(actual.jobs['test-mocha'].steps.find(step => step.run?.name === compileName).run.command,
    compileStep.run.command);
  console.log(`${name}: ${count ? 'original jobs retained' : 'seven host compiles removed; both LCOV artifacts enabled'}; complete expanded config matches`);
}
console.log(`Validated ${cases.length} branch/tag/mode cases. Expansion evidence: ${directory}`);
