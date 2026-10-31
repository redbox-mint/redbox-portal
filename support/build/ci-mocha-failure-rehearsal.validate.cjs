'use strict';

// Read-only CircleCI processing; never triggers a pipeline. Fixtures stay in /tmp.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, '.circleci/config.yml'), 'utf8');
const config = yaml.load(source);
const contract = require('./ci-mocha-failure-rehearsal.contract.json');
const [producer, failure, control, gate] = contract.paired_workflow_jobs;
const ordinary = structuredClone(config);
for (const name of [producer, failure, control]) delete ordinary.jobs[name];
delete ordinary.parameters.ci_mocha_failure_rehearsal;
delete ordinary.workflows.mocha_failure_rehearsal;
assert.equal(createHash('sha256').update(JSON.stringify(ordinary)).digest('hex'), contract.original_config_sha256);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-ci-mocha-rehearsal-expansions-'));
const cli = args => execFileSync('circleci', args, {
  cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 20 * 1024 * 1024,
});
process.stdout.write(cli(['config', 'validate', path.join(root, '.circleci/config.yml')]));
const branch = 'chore/circleci-performance';
const cases = [
  ['default-off', branch, '', false], ['paired', branch], ['suffix', `${branch}-extra`],
  ['nested', `${branch}/nested`], ['newline', `${branch}\n`], ['feature', 'feature/example'],
  ['dependabot', 'dependabot/npm/foo'], ['tag', branch, 'v5.0.0'],
  ['beta', branch, '', true, 'beta'], ['manual', branch, '', true, 'none', 'manual'],
];
for (const [name, gitBranch, tag = '', optIn = true, npm = 'none', docker = 'none'] of cases) {
  const expand = (label, text, parameters) => {
    const file = path.join(directory, `${name}-${label}-input.yml`);
    fs.writeFileSync(file, text.replaceAll('<< pipeline.git.branch >>', JSON.stringify(gitBranch))
      .replaceAll('<< pipeline.git.tag >>', JSON.stringify(tag)));
    const output = cli(['config', 'process', file, '--pipeline-parameters', JSON.stringify(parameters)]);
    fs.writeFileSync(path.join(directory, `${name}-${label}.yml`), output);
    return yaml.load(output);
  };
  const modes = { npm_publish_mode: npm, docker_publish_mode: docker };
  const actual = expand('paired', source, { ...modes, ci_mocha_failure_rehearsal: optIn });
  const expected = expand('ordinary', yaml.dump(ordinary, { noRefs: true, lineWidth: -1 }), modes);
  const eligible = optIn && gitBranch === branch && !tag && npm === 'none' && docker === 'none';
  const workflow = actual.workflows.mocha_failure_rehearsal;
  assert.equal(Boolean(workflow), eligible, name);
  if (eligible) {
    assert.deepEqual(workflow.jobs.map(item => Object.keys(item)[0]), contract.paired_workflow_jobs);
    for (const name of [failure, control]) {
      const invocation = workflow.jobs.find(item => item[name])[name];
      assert.deepEqual(invocation.requires, [producer]);
      assert.deepEqual(invocation.upstream, { [producer]: ['success'] });
    }
    const sentinel = workflow.jobs.find(item => item[gate])[gate];
    assert.deepEqual(sentinel.requires, [failure]);
    assert.deepEqual(sentinel.upstream, { [failure]: ['success'] });
    assert.ok(!actual.jobs[control].steps.some(step => /upload-process|Install codecov/.test(JSON.stringify(step))));
    delete actual.workflows.mocha_failure_rehearsal;
    for (const name of [producer, failure, control, gate]) delete actual.jobs[name];
  }
  assert.deepEqual(actual, expected, `${name}: ordinary expanded jobs/workflows/publication changed`);
  console.log(`${name}: paired workflow ${eligible ? 'enabled' : 'excluded'}; entire ordinary expansion unchanged`);
}
console.log(`Validated ${cases.length} cohorts; no pipelines started. Expansion evidence: ${directory}`);
