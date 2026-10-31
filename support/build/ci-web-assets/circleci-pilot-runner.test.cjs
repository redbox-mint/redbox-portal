'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const {
  readContext,
  checkSource,
  dockerEnvironment,
  gitEnvironment,
  commandRunner,
  run,
} = require('./circleci-pilot-runner.cjs');
const { producerRecord, PROJECT, PRODUCER, CONTROL, CONSUMER, WORKFLOW } = require('./circleci-pilot.cjs');

const uuid = n => `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;
function environment() {
  return {
    CIRCLE_PROJECT_USERNAME: 'redbox-mint',
    CIRCLE_PROJECT_REPONAME: 'redbox-portal',
    CIRCLE_BRANCH: 'chore/circleci-performance',
    CIRCLE_TAG: '',
    CIRCLE_SHA1: 'a'.repeat(40),
    CIRCLE_WORKFLOW_ID: uuid(2),
    CIRCLE_WORKFLOW_JOB_ID: uuid(4),
    CIRCLE_BUILD_NUM: '4',
  };
}
const workflowIdentity = { pipeline_id: uuid(1), pipeline_number: 3 };

test('requires exact CircleCI source and workflow identity', () => {
  assert.throws(
    () => readContext(environment(), null, workflowIdentity),
    'no unreviewed configuration is approved'
  );
  assert.equal(
    readContext({ ...environment(), RB_PILOT_CONFIG_SHA256: 'b'.repeat(64) }, undefined, workflowIdentity).configurationSha256,
    readContext(environment(), undefined, workflowIdentity).configurationSha256,
    'pipeline environment cannot approve its own configuration'
  );
  assert.equal(readContext(environment(), 'b'.repeat(64), workflowIdentity).jobNumber, 4);
  for (const change of [
    { CIRCLE_PROJECT_USERNAME: 'other' },
    { CIRCLE_BRANCH: 'develop' },
    { CIRCLE_TAG: 'v1' },
    { CIRCLE_SHA1: 'short' },
    { CIRCLE_WORKFLOW_ID: 'wrong' },
    { CIRCLE_BUILD_NUM: '01' },
  ])
    assert.throws(() => readContext({ ...environment(), ...change }, 'b'.repeat(64), workflowIdentity));
  assert.throws(() => readContext(environment(), 'b'.repeat(64), { pipeline_id: 'bad', pipeline_number: 0 }));
});

test('rejects dirty, ignored or mismatched source checkouts', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-ci-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe', encoding: 'utf8' });
  git('init');
  fs.writeFileSync(path.join(root, 'file'), 'one');
  git('add', 'file');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
  const revision = git('rev-parse', 'HEAD').trim();
  const runner = commandRunner();
  await checkSource(root, { revision }, runner.call, process.env);
  await assert.rejects(checkSource(root, { revision: 'a'.repeat(40) }, runner.call, process.env));
  fs.writeFileSync(path.join(root, 'file'), 'changed');
  await assert.rejects(checkSource(root, { revision }, runner.call, process.env), /clean/);
  git('checkout', '--', 'file');
  fs.writeFileSync(path.join(root, 'new'), 'untracked');
  await assert.rejects(checkSource(root, { revision }, runner.call, process.env), /clean/);
  fs.unlinkSync(path.join(root, 'new'));
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored\nnode_modules/\n');
  git('add', '.gitignore');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'ignore');
  const next = git('rev-parse', 'HEAD').trim();
  fs.writeFileSync(path.join(root, 'ignored'), 'untrusted');
  await assert.rejects(checkSource(root, { revision: next }, runner.call, process.env), /ignored/);
  fs.unlinkSync(path.join(root, 'ignored'));
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, 'node_modules', 'typescript'), 'fixture');
  await assert.rejects(checkSource(root, { revision: next }, runner.call, process.env), /ignored/);
  await checkSource(root, { revision: next }, runner.call, process.env, true);
});

test('uses a local Docker daemon and excludes credentials and inherited builder settings', t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-ci-docker-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const result = dockerEnvironment(
    {
      PATH: '/bin',
      CIRCLE_TOKEN: 'secret',
      DOCKER_CONTEXT: 'remote',
      DOCKER_HOST: 'tcp://foreign',
      DOCKER_AUTH_CONFIG: 'secret',
      BUILDX_BUILDER: 'foreign',
      BUILDKIT_HOST: 'foreign',
      BUILDKIT_SOURCE_POLICY: '/tmp/foreign-policy.json',
    },
    work
  );
  assert.equal(result.DOCKER_HOST, 'unix:///var/run/docker.sock');
  assert.equal(result.DOCKER_CONFIG, path.join(work, 'docker-config'));
  assert.equal(result.BUILDKIT_PROGRESS, 'plain');
  for (const key of ['CIRCLE_TOKEN', 'DOCKER_CONTEXT', 'DOCKER_AUTH_CONFIG', 'BUILDX_BUILDER', 'BUILDKIT_HOST'])
    assert.equal(result[key], undefined);
  assert.equal(Object.hasOwn(result, 'BUILDKIT_SOURCE_POLICY'), false);
});

test('a disposable source clone excludes ignored executable inputs', async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-ci-clone-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const original = path.join(base, 'original'),
    clone = path.join(base, 'clone');
  fs.mkdirSync(original);
  const git = (...args) => execFileSync('git', ['-C', original, ...args], { stdio: 'pipe', encoding: 'utf8' });
  git('init');
  fs.writeFileSync(path.join(original, '.gitignore'), 'config/webpack.js\n');
  fs.mkdirSync(path.join(original, 'config'));
  fs.writeFileSync(path.join(original, 'tracked'), 'source');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
  const revision = git('rev-parse', 'HEAD').trim();
  fs.writeFileSync(path.join(original, 'config/webpack.js'), 'untrusted executable input');
  const runner = commandRunner(),
    env = gitEnvironment(process.env, base);
  await runner.call('git', ['clone', '--depth=1', '--no-local', '--no-hardlinks', '--no-checkout', '--', original, clone], {
    env,
    quiet: true,
    capture: true,
  });
  await runner.call('git', ['-C', clone, 'checkout', '--detach', revision], { env, quiet: true, capture: true });
  await checkSource(clone, { revision }, runner.call, env);
  assert.equal(fs.existsSync(path.join(clone, 'config/webpack.js')), false);
  assert.equal(fs.readFileSync(path.join(clone, 'tracked'), 'utf8'), 'source');
});

test('bounded command execution escalates when a child ignores TERM', async () => {
  const runner = commandRunner();
  const start = Date.now();
  await assert.rejects(
    runner.call(
      process.execPath,
      ['-e', "process.on('SIGTERM',()=>{}); console.log('ready'); setInterval(()=>{},1000)"],
      { env: process.env, capture: true, quiet: true, timeoutMs: 1000 }
    ),
    /timeout=true/
  );
  assert.ok(Date.now() - start < 10000, 'timed out child must be terminated');
});

function sharedRunFixture(t, variant = '') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-ci-run-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sourceRoot = path.join(base, 'checkout');
  fs.mkdirSync(sourceRoot);
  const work = path.join(base, 'work'),
    output = path.join(base, 'output'),
    transfer = path.join(base, 'transfer');
  const config = { source: 'reviewed', compiled: 'approved' };
  const approvedConfigurationSha256 = createHash('sha256')
    .update(`${JSON.stringify(config, null, 2)}\n`)
    .digest('hex');
  const env = { ...environment(), PATH: process.env.PATH, HOME: base, CIRCLE_TOKEN: 'secret' };
  if (variant.startsWith('producer')) {
    env.CIRCLE_BUILD_NUM = '11';
    env.CIRCLE_WORKFLOW_JOB_ID = uuid(3);
  }
  const ctx = readContext(env, approvedConfigurationSha256, workflowIdentity);
  const producer = {
    id: uuid(3),
    name: PRODUCER,
    job_number: 11,
    status: variant.startsWith('producer') ? 'running' : 'success',
    type: 'build',
    project_slug: PROJECT,
  };
  const consumer = {
    id: uuid(4),
    name: variant === 'control' ? CONTROL : CONSUMER,
    job_number: 4,
    status: 'running',
    type: 'build',
    project_slug: PROJECT,
  };
  const details = Object.fromEntries(
    [producer, consumer].map(job => [
      job.id,
      { ...job, project_id: uuid(5), pipeline_id: ctx.pipelineId, workflow_id: ctx.workflowId },
    ])
  );
  const receiptSha256 = 'd'.repeat(64),
    manifestSha256 = 'e'.repeat(64);
  const record = producerRecord({ ...ctx, jobId: producer.id, jobNumber: 11 }, producer.id, receiptSha256);
  const client = {
    workflow: async () => ({
      id: ctx.workflowId,
      pipeline_id: ctx.pipelineId,
      pipeline_number: ctx.pipelineNumber,
      project_slug: PROJECT,
      name: WORKFLOW,
      status: 'running',
    }),
    pipeline: async () => ({
      id: ctx.pipelineId,
      number: ctx.pipelineNumber,
      project_slug: PROJECT,
      errors: [],
      vcs: {
        revision: ctx.revision,
        branch: ctx.branch,
        provider_name: 'GitHub',
        origin_repository_url:
          variant === 'foreign' ? 'https://github.com/other/repo' : 'https://github.com/redbox-mint/redbox-portal',
        target_repository_url: 'https://github.com/redbox-mint/redbox-portal',
      },
    }),
    configuration: async () => config,
    jobs: async () => [producer, consumer],
    job: async id => details[id],
    artifact: async () => record,
  };
  const input = path.join(transfer, ctx.revision, ctx.workflowId, '11');
  if (!variant.startsWith('producer')) {
    fs.mkdirSync(input, { recursive: true });
    fs.writeFileSync(path.join(input, 'receipt.json'), JSON.stringify({ assets: { manifestSha256 } }));
  }
  const calls = [],
    cleaned = [];
  const runner = {
    cancelled: false,
    cancel() {
      this.cancelled = true;
    },
    async call(command, args, options = {}) {
      calls.push({ command, args, options });
      if (command === 'git' && args[0] === 'clone') fs.mkdirSync(args.at(-1));
      if (command === 'git' && args.includes('rev-parse')) return { stdout: `${ctx.revision}\n` };
      if (command === 'git' && args.includes('status')) return { stdout: '' };
      if (command === 'git' && args.includes('ls-files'))
        return { stdout: fs.existsSync(path.join(work, 'source/node_modules')) ? 'node_modules/\0' : '' };
      if (command === 'npm' && variant !== 'missing-typescript') {
        fs.mkdirSync(path.join(work, 'source/node_modules/typescript'), { recursive: true });
        fs.writeFileSync(path.join(work, 'source/node_modules/typescript/package.json'), '{}');
      }
      if (command === process.execPath && args[1] === 'produce') {
        const request = JSON.parse(fs.readFileSync(args[2], 'utf8'));
        fs.mkdirSync(request.output);
        if (variant === 'producer-cancelled') this.cancelled = true;
        return { stdout: JSON.stringify({ receiptSha256 }) };
      }
      if (command === process.execPath && args[1] === 'prepare') {
        const request = JSON.parse(fs.readFileSync(args[2], 'utf8'));
        fs.mkdirSync(output);
        const stage = path.join(output, 'web-assets');
        fs.mkdirSync(stage);
        const plan = {
          schemaVersion: 1,
          contract: 'redbox-shared-web-assets-pilot-v1',
          identity: request.identity,
          producerPlatform: 'linux/amd64',
          consumerPlatform: 'linux/arm64',
          receiptSha256,
          assets: { manifestSha256 },
          stage,
          invocation: {
            command: 'docker',
            args: [
              'buildx',
              'build',
              '--platform',
              'linux/arm64',
              '--target',
              'runtime',
              '--build-arg',
              'WEB_ASSETS=shared',
              '--build-arg',
              `SOURCE_REVISION=${ctx.revision}`,
              '--build-arg',
              `WEB_ASSETS_MANIFEST_SHA256=${manifestSha256}`,
              '--build-context',
              `web-assets=${stage}`,
              '--output',
              `type=oci,dest=${output}/image.oci.tar`,
              request.root,
            ],
            cwd: request.root,
            shell: false,
          },
        };
        if (variant === 'bad-plan') plan.invocation.args.push('--push');
        const bytes = Buffer.from(JSON.stringify(plan));
        const filename = path.join(output, 'plan.json');
        fs.writeFileSync(filename, bytes);
        return {
          stdout: JSON.stringify({ plan: filename, planSha256: createHash('sha256').update(bytes).digest('hex') }),
        };
      }
      if (command === '/bin/rm') fs.rmSync(args.at(-1), { recursive: true });
      if (command === 'docker' && args[0] === 'info') return { stdout: 'linux/aarch64\n' };
      if (command === 'docker' && args[0] === 'ps') return { stdout: '' };
      if (command === 'docker' && args[0] === 'buildx' && args[1] === 'create' && variant === 'create-fails')
        throw Error('create failed');
      if (
        command === 'docker' &&
        args[0] === 'buildx' &&
        args[1] === 'inspect' &&
        ['builder-fails', 'builder-and-cleanup-fail'].includes(variant)
      )
        throw Error('bootstrap failed');
      return { stdout: '' };
    },
  };
  const cleanup = async (command, args, options) => {
    cleaned.push({ command, args, options });
    if (variant === 'builder-and-cleanup-fail') throw Error('cleanup failed');
  };
  const options = {
    approvedConfigurationSha256,
    host: { platform: 'linux', arch: variant.startsWith('producer') ? 'x64' : 'arm64', version: 'v24.22.1' },
    sourceRoot,
    work,
    output,
    transfer,
    client,
    runner,
    cleanup,
  };
  return { env, options, calls, cleaned };
}

for (const [variant, message] of [
  ['foreign', /origin_repository_url|Expected values/],
  ['missing-typescript', /host TypeScript/],
  ['bad-plan', /Expected values/],
]) {
  test(`${variant} fails before Docker starts a builder`, async t => {
    const f = sharedRunFixture(t, variant);
    await assert.rejects(run('shared', f.env, f.options), message);
    assert.equal(
      f.calls.some(call => call.command === 'docker'),
      false
    );
    assert.equal(f.cleaned.length, 0);
  });
}

test('shared run validates and removes host dependencies before using and cleaning its builder', async t => {
  const f = sharedRunFixture(t);
  await run('shared', f.env, f.options);
  const npm = f.calls.findIndex(call => call.command === 'npm');
  const prepare = f.calls.findIndex(call => call.command === process.execPath && call.args[1] === 'prepare');
  const removal = f.calls.findIndex(call => call.command === '/bin/rm');
  const create = f.calls.findIndex(call => call.command === 'docker' && call.args[1] === 'create');
  const build = f.calls.findIndex(call => call.command === 'docker' && call.args[1] === 'build');
  assert.ok(npm < prepare && prepare < removal && removal < create && create < build);
  assert.equal(f.calls[build].options.env.CIRCLE_TOKEN, undefined);
  assert.equal(f.cleaned.length, 1);
  assert.equal(f.cleaned[0].args.at(-1), f.calls[create].args[3]);
});

test('cleans its own builder after bootstrap failure', async t => {
  const f = sharedRunFixture(t, 'builder-fails');
  await assert.rejects(run('shared', f.env, f.options), /bootstrap failed/);
  const create = f.calls.find(call => call.command === 'docker' && call.args[1] === 'create');
  assert.equal(f.cleaned.length, 1);
  assert.equal(f.cleaned[0].args.at(-1), create.args[3]);
  assert.equal(
    f.calls.some(call => call.command === 'docker' && call.args[1] === 'build'),
    false
  );
});

test('cleans its own builder even when creation reports failure', async t => {
  const f = sharedRunFixture(t, 'create-fails');
  await assert.rejects(run('shared', f.env, f.options), /create failed/);
  const create = f.calls.find(call => call.command === 'docker' && call.args[1] === 'create');
  assert.equal(f.cleaned.length, 1);
  assert.equal(f.cleaned[0].args.at(-1), create.args[3]);
});

test('retains both build and cleanup failures', async t => {
  const f = sharedRunFixture(t, 'builder-and-cleanup-fail');
  await assert.rejects(
    run('shared', f.env, f.options),
    /bootstrap failed; pilot builder cleanup failed: cleanup failed/
  );
});

test('producer writes its authenticated receipt without starting Docker', async t => {
  const f = sharedRunFixture(t, 'producer');
  await run('produce', f.env, f.options);
  assert.ok(fs.existsSync(path.join(f.options.work, 'producer-success.json')));
  assert.equal(
    f.calls.some(call => call.command === 'docker'),
    false
  );
  assert.equal(f.cleaned.length, 0);
});

test('a cancelled producer cannot record success after its child exits zero', async t => {
  const f = sharedRunFixture(t, 'producer-cancelled');
  await assert.rejects(run('produce', f.env, f.options), /interrupted/);
  assert.equal(fs.existsSync(path.join(f.options.work, 'producer-success.json')), false);
  assert.equal(
    f.calls.some(call => call.command === 'docker'),
    false
  );
});

test('control builds only the local runtime target and cleans its builder', async t => {
  const f = sharedRunFixture(t, 'control');
  await run('control', f.env, f.options);
  const build = f.calls.find(call => call.command === 'docker' && call.args[1] === 'build');
  assert.ok(build.args.includes('WEB_ASSETS=local'));
  assert.ok(build.args.includes('runtime'));
  assert.equal(build.args.includes('--push'), false);
  assert.equal(f.cleaned.length, 1);
});
