const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const yaml = require('js-yaml');
const { guard, sourceMetadata, imageDetails, execute, BRANCH } = require('./ci-arm64-pilot.cjs');
const { checkAngularBundles } = require('./ci-arm64-pilot.smoke.cjs');
const root = path.resolve(__dirname, '../..');
const config = yaml.load(fs.readFileSync(path.join(root, '.circleci/config.yml'), 'utf8'));
const jobName = 'arm64-timing-pilot';
const workflowName = 'arm64_timing_pilot';
const job = config.jobs[jobName];

function condition(expression, branch, npm = 'none', docker = 'none') {
  if (expression.and) return expression.and.every(item => condition(item, branch, npm, docker));
  const values = { '<< pipeline.git.branch >>': branch,
    '<< pipeline.parameters.npm_publish_mode >>': npm,
    '<< pipeline.parameters.docker_publish_mode >>': docker };
  assert.ok(expression.equal, 'Unexpected condition must fail the contract');
  return expression.equal.map(value => values[value] ?? value).every((value, _, items) => value === items[0]);
}

function included(invocation, branch, tag = '') {
  if (tag) return false; // Assert the exact unconditional tag exclusion below.
  return invocation.filters.branches.only === branch;
}

test('only the exact chore branch and automatic mode can schedule the isolated pilot', () => {
  const workflow = config.workflows[workflowName];
  assert.deepEqual(workflow.jobs, [{ [jobName]: { filters: {
    branches: { only: BRANCH }, tags: { ignore: '/.*/' },
  } } }]);
  const invocation = workflow.jobs[0][jobName];
  for (const branch of [BRANCH, 'chore/circleci-performance-extra', 'chore/circleci-performance/nested',
    'prefix/chore/circleci-performance', 'chore/circleci-performance\n', 'develop', 'master',
    'support/v5', 'feature/example', 'dependabot/npm/foo', '']) {
    assert.equal(condition(workflow.when, branch) && included(invocation, branch), branch === BRANCH, branch);
    for (const [npm, docker] of [['beta', 'none'], ['none', 'manual'], ['beta', 'manual']]) {
      assert.equal(condition(workflow.when, branch, npm, docker), false);
    }
  }
  for (const tag of ['v5.0.0', 'v5.0.0-RC1', BRANCH]) assert.equal(included(invocation, BRANCH, tag), false);
  const references = Object.entries(config.workflows).flatMap(([name, workflow]) =>
    (workflow.jobs || []).filter(item => item === jobName || Object.hasOwn(item, jobName)).map(() => name));
  assert.deepEqual(references, [workflowName]);
});

test('no existing gate, test, publish or Dependabot job depends on the pilot', () => {
  assert.deepEqual(job.machine, { image: 'ubuntu-2404:current', docker_layer_caching: false });
  assert.equal(job.resource_class, 'arm.medium');
  for (const [name, workflow] of Object.entries(config.workflows)) {
    if (name === workflowName) continue;
    assert.ok(!JSON.stringify(workflow).includes(jobName), name);
  }
  assert.ok(!job.steps.some(step => step.attach_workspace || step.persist_to_workspace ||
    step.add_ssh_keys || step.setup_remote_docker));
  const buildRun = job.steps.find(step => step.run?.name === 'Time native runtime and PDF builds without publishing').run;
  assert.equal(buildRun.command, 'timeout --signal=TERM --kill-after=45s 100m node support/build/ci-arm64-pilot.cjs run');
  assert.ok(job.steps.some(step => step.run?.when === 'always' &&
    step.run.command === 'node support/build/ci-arm64-pilot.cjs cleanup'));
  assert.equal(job.steps.length, 4, 'No extra credential, upload or publishing steps');
  assert.equal(job.steps[0], 'checkout');
  assert.deepEqual(job.steps.at(-1), { store_artifacts: { path: '.tmp/ci-arm64-pilot', destination: 'ci-arm64-pilot' } });
  assert.ok(config.jobs.build.steps.some(step => step.run?.command?.includes('ci-arm64-pilot.test.cjs')));
});

test('runtime guard rejects wrong branches, tags, revisions and non-native hosts before Docker', () => {
  const environment = { CIRCLE_BRANCH: BRANCH, CIRCLE_SHA1: 'a'.repeat(40) };
  guard(environment, 'arm64');
  for (const patch of [{ CIRCLE_BRANCH: 'develop' }, { CIRCLE_BRANCH: `${BRANCH}-extra` },
    { CIRCLE_TAG: 'v5.0.0' }, { CIRCLE_SHA1: 'invalid' }]) {
    assert.throws(() => guard({ ...environment, ...patch }, 'arm64'));
  }
  assert.throws(() => guard(environment, 'x64'));
});

test('image report asserts runtime settings and drops arbitrary environment values', () => {
  const metadata = { Os: 'linux', Architecture: 'arm64', Id: 'sha256:123', Size: 42,
    Config: { User: 'node', WorkingDir: '/opt/redbox-portal', Entrypoint: ['docker-entrypoint.sh'],
      Cmd: ['node', 'app.js'], ExposedPorts: { '1337/tcp': {} },
      Env: ['NODE_ENV=production', 'TZ=Australia/Brisbane', 'TOKEN=never-artifact-this', 'PATH=/bin'],
      Healthcheck: { Test: ['CMD', 'curl'] } }, RootFS: { Layers: ['a', 'b'] } };
  const details = imageDetails(metadata);
  assert.equal(details.layer_count, 2);
  assert.deepEqual(details.environment, ['NODE_ENV=production', 'TZ=Australia/Brisbane']);
  assert.ok(!JSON.stringify(details).includes('never-artifact-this'));
  assert.throws(() => imageDetails({ ...metadata, Architecture: 'amd64' }));
  assert.throws(() => imageDetails({ ...metadata, Config: { ...metadata.Config, User: 'root' } }));
});

test('metadata identifies the actual source, hashes inputs, and rejects stale or dirty checkouts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-arm64-pilot-source-'));
  const git = args => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: 'pipe' }).trim();
  const initial = process.cwd();
  try {
    git(['init']); git(['config', 'user.name', 'test']); git(['config', 'user.email', 'test@example.com']);
    fs.writeFileSync(path.join(directory, 'Dockerfile'), 'FROM scratch\n');
    fs.writeFileSync(path.join(directory, '.npmrc'), 'secret-fixture-value\n');
    git(['add', '.']); git(['commit', '-m', 'fixture']);
    const revision = git(['rev-parse', 'HEAD']);
    process.chdir(directory);
    const source = sourceMetadata({ CIRCLE_SHA1: revision });
    assert.equal(source.revision, revision);
    assert.match(source.input_sha256['.npmrc'], /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(source).includes('secret-fixture-value'));
    assert.throws(() => sourceMetadata({ CIRCLE_SHA1: 'a'.repeat(40) }));
    fs.writeFileSync('unexpected-source.js', 'untracked\n');
    assert.throws(() => sourceMetadata({ CIRCLE_SHA1: revision }));
    fs.unlinkSync('unexpected-source.js');
    fs.appendFileSync('Dockerfile', '# changed\n');
    assert.throws(() => sourceMetadata({ CIRCLE_SHA1: revision }));
  } finally { process.chdir(initial); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('bounded command runner preserves failures, counts cached operations, and kills stalled commands', async () => {
  const good = await execute(process.execPath, ['-e', 'console.log("ok"); console.error("#3 CACHED"); console.error("#3 CACHED")'],
    { capture: true, quiet: true });
  assert.equal(good.stdout.trim(), 'ok'); assert.equal(good.cached_operations, 1);
  await assert.rejects(execute(process.execPath, ['-e', 'process.exit(23)'], { quiet: true }),
    error => error.result.code === 23);
  await assert.rejects(execute(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { quiet: true, timeoutMs: 100 }),
    error => error.result.timed_out);
});

test('smoke check validates nonempty Angular browser bundles in the production layout', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-arm64-pilot-angular-'));
  try {
    for (const application of ['record', 'search']) {
      for (const prefix of ['assets/angular', '.tmp/public/angular']) {
        const browser = path.join(directory, prefix, application, 'browser');
        fs.mkdirSync(browser, { recursive: true });
        fs.writeFileSync(path.join(browser, 'main-ABC123.js'), 'console.log("bundle");');
      }
    }
    assert.equal(checkAngularBundles(directory), 2);
    const browser = path.join(directory, '.tmp/public/angular/search/browser');
    const bundle = path.join(browser, 'main-ABC123.js');
    fs.writeFileSync(bundle, '');
    assert.throws(() => checkAngularBundles(directory), /search served browser bundle/);
    fs.rmSync(bundle);
    fs.mkdirSync(bundle);
    assert.throws(() => checkAngularBundles(directory), /search served browser bundle/);
    fs.rmSync(bundle, { recursive: true });
    fs.writeFileSync(path.join(browser, '..', 'main-old.js'), 'stale root bundle');
    assert.throws(() => checkAngularBundles(directory), /search served browser bundle/);
    fs.rmSync(browser, { recursive: true });
    assert.throws(() => checkAngularBundles(directory), { code: 'ENOENT' });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('timeout kills a surviving process group after its leader and output streams close', {
  skip: process.platform !== 'linux',
}, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-arm64-pilot-timeout-'));
  const ready = path.join(directory, 'descendant.pid');
  let descendant;
  try {
    const script = `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', ${JSON.stringify(`
        process.on('SIGTERM', () => {});
        require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid));
        setInterval(() => {}, 1000);
      `)}], { stdio: 'ignore' });
      // Exit promptly on TERM, leaving a descendant with no inherited pipes.
      process.on('SIGTERM', () => process.exit(0));
      setInterval(() => {}, 1000);
    `;
    const start = Date.now();
    await assert.rejects(execute(process.execPath, ['-e', script], { quiet: true, timeoutMs: 1000 }),
      error => error.result.timed_out && error.result.code === 0);
    descendant = Number(fs.readFileSync(ready, 'utf8'));
    assert.ok(Date.now() - start >= 6000, 'Runner waits for group escalation after leader close');
    // Linux can retain an orphan zombie briefly; it is dead, even if kill(pid, 0) succeeds.
    let alive = true;
    const deadline = Date.now() + 1000;
    while (alive && Date.now() < deadline) {
      try {
        const stat = fs.readFileSync(`/proc/${descendant}/stat`, 'utf8');
        alive = !['Z', 'X'].includes(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0]);
      } catch (error) { if (error.code === 'ENOENT') alive = false; else throw error; }
      if (alive) await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(alive, false, 'TERM-resistant descendant must no longer run');
  } finally {
    if (!descendant && fs.existsSync(ready)) descendant = Number(fs.readFileSync(ready, 'utf8'));
    if (descendant) {
      try { process.kill(descendant, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

// Enable after real CLI expansion, including a fixture with the chore branch value.
test('expanded CircleCI config keeps the pilot isolated and out of every other cohort', {
  skip: !process.env.CIRCLECI_EXPANDED_DIR,
}, () => {
  const directory = process.env.CIRCLECI_EXPANDED_DIR;
  for (const mode of ['dependabot', 'beta', 'manual', 'chore-beta', 'chore-manual', 'feature', 'develop', 'empty', 'near-branch']) {
    const expanded = yaml.load(fs.readFileSync(path.join(directory, `redbox-circleci-${mode}.yml`), 'utf8'));
    assert.ok(!expanded.workflows[workflowName], mode);
  }
  const expanded = yaml.load(fs.readFileSync(path.join(directory, 'redbox-circleci-chore.yml'), 'utf8'));
  assert.deepEqual(expanded.workflows[workflowName].jobs, config.workflows[workflowName].jobs);
  assert.equal(expanded.jobs[jobName].resource_class, 'arm.medium');
  // With no explicit fixture value, the CLI may infer this checkout's branch.
  const regular = yaml.load(fs.readFileSync(path.join(directory, 'redbox-circleci-default.yml'), 'utf8'));
  if (regular.workflows[workflowName]) {
    assert.deepEqual(regular.workflows[workflowName].jobs, config.workflows[workflowName].jobs);
  }
});

// Exercise the actual orchestration, not just command strings. This executable
// rejects any operation outside the pilot's local Docker protocol.
function fixture(failure = '') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-arm64-pilot-docker-'));
  const bin = path.join(directory, 'bin'); fs.mkdirSync(bin);
  const docker = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(process.env.DOCKER_CONFIG + '/config.json'));
if (JSON.stringify(config) !== '{"auths":{}}' || process.env.DOCKER_AUTH_CONFIG || process.env.DOCKER_CONTEXT ||
    process.env.DOCKER_HOST !== 'unix:///var/run/docker.sock') process.exit(90);
fs.appendFileSync('calls.jsonl', JSON.stringify({ args, config: process.env.DOCKER_CONFIG }) + '\\n');
if (args[1] === 'inspect' && !args.includes('--bootstrap') && process.env.CI_ARM64_PILOT_FIXTURE_CLEANUP) {
  const mode = process.env.CI_ARM64_PILOT_FIXTURE_CLEANUP;
  if (mode === 'absent') console.error(args[0] === 'buildx' ? 'ERROR: no builder "' + args.at(-1) + '" found' :
    'Error response from daemon: No such ' + args[0] + ': ' + args.at(-1));
  else if (mode === 'daemon') console.error('Cannot connect to the Docker daemon at unix:///var/run/docker.sock');
  else if (mode === 'permission') console.error('permission denied while trying to connect to the Docker daemon socket');
  else if (mode === 'signal') process.kill(process.pid, 'SIGTERM');
  process.exit(1);
}
if (args[0] === 'buildx' && args[1] === 'rm' && process.env.CI_ARM64_PILOT_FIXTURE_FAIL === 'cleanup') process.exit(28);
if (args[0] === 'info') console.log(JSON.stringify({Architecture: 'aarch64', OSType: 'linux', ServerVersion: 'fixture', NCPU: 4, MemTotal: 1024}));
else if (args[0] === 'buildx' && args[1] === 'version') console.log('fixture buildx');
else if (args[0] === 'buildx' && ['create', 'inspect', 'rm'].includes(args[1])) {}
else if (args[0] === 'buildx' && args[1] === 'build') {
  if (args.includes('--push') || !args.includes('--load') || args.includes('--cache-to')) process.exit(91);
  if (process.env.CI_ARM64_PILOT_FIXTURE_FAIL === args[args.indexOf('--target') + 1]) process.exit(27);
  console.error('#3 CACHED');
} else if (args[0] === 'image' && args[1] === 'inspect') console.log(JSON.stringify([{
  Os: 'linux', Architecture: 'arm64', Id: 'sha256:fixture', Size: 123,
  Config: { User: 'node', WorkingDir: '/opt/redbox-portal', Entrypoint: ['docker-entrypoint.sh'],
    Cmd: ['node', 'app.js'], ExposedPorts: {'1337/tcp': {}}, Healthcheck: { Test: ['CMD', 'curl'] },
    Env: ['NODE_ENV=production', 'SENSITIVE_ENV=must-never-appear-in-report'] }, RootFS: {Layers: ['a']}
}]));
else if (args[0] === 'image' && args[1] === 'save') fs.writeFileSync(args[args.indexOf('--output') + 1], 'archive-fixture');
else if (args[0] === 'run') {
  if (!args.includes('--network=none') || !args.includes('--pull=never')) process.exit(92);
  process.stdin.resume();
  process.stdin.on('end', () => console.log('CI_ARM64_PILOT_RESULT=' + JSON.stringify({target: args.at(-1), native_smoke: true})));
} else if (args[0] === 'container' && args[1] === 'inspect') {
  console.error('Error response from daemon: No such container: ' + args.at(-1)); process.exit(1);
}
else if (['container', 'image'].includes(args[0]) && args[1] === 'rm') {}
else process.exit(93);
`;
  fs.writeFileSync(path.join(bin, 'docker'), docker, { mode: 0o755 });
  fs.writeFileSync(path.join(directory, 'Dockerfile'), 'FROM scratch\n');
  const git = args => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: 'pipe' }).trim();
  git(['init']); git(['config', 'user.name', 'test']); git(['config', 'user.email', 'test@example.com']);
  git(['add', '.']); git(['commit', '-m', 'fixture']);
  const environment = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CIRCLE_BRANCH: BRANCH,
    CIRCLE_TAG: '', CIRCLE_SHA1: git(['rev-parse', 'HEAD']), DOCKER_AUTH_CONFIG: 'secret-fixture',
    DOCKER_CONTEXT: 'must-not-use-this-context', DOCKER_HOST: 'tcp://must-not-use-this-host:2375',
    CI_ARM64_PILOT_FIXTURE_FAIL: failure };
  // The build job running these tests is normally AMD64. Override only the host
  // probe in this child; the real guard and native-daemon assertions still run.
  const script = `require('node:os').arch = () => 'arm64'; require(${JSON.stringify(path.join(__dirname, 'ci-arm64-pilot.cjs'))}).run().catch(() => { process.exitCode = 1; });`;
  return { directory, environment, cleanup: () => execFileSync(process.execPath,
    [path.join(__dirname, 'ci-arm64-pilot.cjs'), 'cleanup'], {
      cwd: directory, env: environment, stdio: 'pipe', timeout: 20000,
    }), run: () => execFileSync(process.execPath, ['-e', script], {
    cwd: directory, env: environment, stdio: 'pipe', timeout: 20000,
  }) };
}

test('cleanup accepts confirmed absence but preserves metadata and fails on uncertain inspection', () => {
  for (const mode of ['absent', 'daemon', 'permission', 'unknown', 'signal', 'missing-cli']) {
    const setup = fixture();
    const work = path.join(setup.directory, '.tmp/ci-arm64-pilot-work');
    const state = path.join(setup.directory, '.tmp/ci-arm64-pilot-state.json');
    const config = path.join(work, 'docker-config/config.json');
    try {
      fs.mkdirSync(path.dirname(config), { recursive: true });
      fs.writeFileSync(config, '{"auths":{}}');
      fs.writeFileSync(state, JSON.stringify({ id: '0123456789abcdef' }));
      setup.environment.CI_ARM64_PILOT_FIXTURE_CLEANUP = mode;
      if (mode === 'missing-cli') setup.environment.PATH = path.join(setup.directory, 'missing-bin');
      if (mode === 'absent') {
        setup.cleanup();
        assert.equal(fs.existsSync(work), false);
        const calls = fs.readFileSync(path.join(setup.directory, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
        assert.equal(calls.length, 5);
        assert.ok(calls.every(call => call.args[1] === 'inspect'));
      } else {
        assert.throws(setup.cleanup, error => error.status === 1, mode);
        assert.equal(fs.readFileSync(config, 'utf8'), '{"auths":{}}', mode);
        assert.equal(JSON.parse(fs.readFileSync(state)).id, '0123456789abcdef', mode);
        if (mode !== 'missing-cli') {
          const calls = fs.readFileSync(path.join(setup.directory, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
          assert.equal(calls.length, 5);
          assert.ok(calls.every(call => call.args[1] === 'inspect'));
          setup.environment.CI_ARM64_PILOT_FIXTURE_CLEANUP = 'absent';
          setup.cleanup();
          assert.equal(fs.existsSync(work), false, 'A later confirmed cleanup can remove retained metadata');
        }
      }
    } finally { fs.rmSync(setup.directory, { recursive: true, force: true }); }
  }
});

test('cleanup retains builder metadata when resource removal fails', () => {
  const setup = fixture('cleanup');
  try {
    setup.run();
    const report = JSON.parse(fs.readFileSync(path.join(setup.directory, '.tmp/ci-arm64-pilot/report.json')));
    assert.deepEqual(report.cleanup_failures, ['buildx rm']);
    assert.ok(fs.existsSync(path.join(setup.directory, '.tmp/ci-arm64-pilot-work/docker-config/config.json')));
    assert.throws(setup.cleanup, error => error.status === 1);
  } finally { fs.rmSync(setup.directory, { recursive: true, force: true }); }
});

test('full pilot builds both targets once on one fresh builder and only produces local outputs', () => {
  const setup = fixture();
  try {
    setup.run();
    const reportText = fs.readFileSync(path.join(setup.directory, '.tmp/ci-arm64-pilot/report.json'), 'utf8');
    const report = JSON.parse(reportText);
    const calls = fs.readFileSync(path.join(setup.directory, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const builds = calls.filter(call => call.args[0] === 'buildx' && call.args[1] === 'build');
    assert.equal(builds.length, 2);
    assert.deepEqual(builds.map(call => call.args[call.args.indexOf('--target') + 1]), ['runtime', 'runtime_pdfgen']);
    for (const { args } of builds) {
      assert.equal(args[args.indexOf('--builder') + 1], report.builder.name);
      assert.equal(args[args.indexOf('--platform') + 1], 'linux/arm64');
      assert.match(args[args.indexOf('--tag') + 1], /^localhost\/ci-arm64-pilot:[a-f0-9]{16}-runtime(_pdfgen)?$/);
      assert.ok(args.includes('--load'));
      assert.ok(!args.some(arg => /push|registry|cache-(from|to)|secret|ssh|build-arg/.test(arg)));
    }
    assert.equal(calls.filter(call => call.args[0] === 'buildx' && call.args[1] === 'create').length, 1);
    assert.ok(calls.every(call => !['login', 'push', 'tag', 'manifest'].includes(call.args[0])));
    assert.equal(report.status, 'success');
    for (const image of Object.values(report.images)) {
      assert.equal(image.archive_bytes, Buffer.byteLength('archive-fixture'));
      assert.ok(image.smoke.native_smoke);
    }
    assert.ok(!reportText.includes('must-never-appear-in-report'));
    assert.ok(report.measurements.filter(item => item.label.startsWith('build-')).every(item => item.cached_operations === 1));
    assert.ok(report.measurements.every(item => item.elapsed_seconds >= 0));
    assert.ok(!fs.existsSync(path.join(setup.directory, '.tmp/ci-arm64-pilot-work')));
    assert.deepEqual(fs.readdirSync(path.join(setup.directory, '.tmp/ci-arm64-pilot')), ['report.json']);
  } finally { fs.rmSync(setup.directory, { recursive: true, force: true }); }
});

test('failed PDF build returns failure, retains prior timing and cleans up without publishing', () => {
  const setup = fixture('runtime_pdfgen');
  try {
    assert.throws(setup.run);
    const report = JSON.parse(fs.readFileSync(path.join(setup.directory, '.tmp/ci-arm64-pilot/report.json')));
    assert.equal(report.status, 'failed');
    assert.equal(report.measurements.find(item => item.label === 'build-runtime').exit_code, 0);
    assert.equal(report.measurements.find(item => item.label === 'build-runtime_pdfgen').exit_code, 27);
    const calls = fs.readFileSync(path.join(setup.directory, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(calls.some(call => call.args[0] === 'buildx' && call.args[1] === 'rm'));
    assert.ok(calls.every(call => !['login', 'push', 'tag', 'manifest'].includes(call.args[0])));
    assert.ok(!fs.existsSync(path.join(setup.directory, '.tmp/ci-arm64-pilot-work')));
  } finally { fs.rmSync(setup.directory, { recursive: true, force: true }); }
});
