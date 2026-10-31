#!/usr/bin/env node
'use strict';

// Executes only the isolated, default-off CircleCI shadow workflow. Nothing in
// this runner publishes an image or writes to a shared image workspace path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { execute } = require('../ci-arm64-pilot.cjs');
const { CircleCIReadClient } = require('../ci-image-candidates/circleci-authorize.cjs');
const {
  PRODUCER,
  CONTROL,
  context,
  identity,
  producerRecord,
  authenticateCurrent,
  authenticateProducer,
  verifyPlan,
} = require('./circleci-pilot.cjs');

const TRANSFER = '/tmp/redbox-web-assets-transfer';
const WORK = '/tmp/redbox-web-assets-pilot';
const OUTPUT = '/tmp/redbox-web-assets-pilot-output';
const ARTIFACT_ORIGINS = [
  'https://output.circle-artifacts.com',
  'https://circleci-tasks-prod.s3.us-east-1.amazonaws.com',
];
// Set only after the exact source and compiled pilot configuration have been
// independently reviewed. Environment variables and pipeline parameters are
// not independent approval of the configuration that supplied them.
const APPROVED_CONFIG_SHA256 = null;

function positive(value, label) {
  assert.match(value || '', /^[1-9][0-9]*$/, `${label} must be a positive integer`);
  const number = Number(value);
  assert.ok(Number.isSafeInteger(number), `${label} exceeds safe integer range`);
  return number;
}

function readContext(env, approvedConfigurationSha256 = APPROVED_CONFIG_SHA256, workflow = {}) {
  return context({
    project: `gh/${env.CIRCLE_PROJECT_USERNAME}/${env.CIRCLE_PROJECT_REPONAME}`,
    branch: env.CIRCLE_BRANCH,
    tag: env.CIRCLE_TAG || '',
    revision: env.CIRCLE_SHA1,
    pipelineId: workflow.pipeline_id,
    workflowId: env.CIRCLE_WORKFLOW_ID,
    jobId: env.CIRCLE_WORKFLOW_JOB_ID,
    configurationSha256: approvedConfigurationSha256,
    pipelineNumber: workflow.pipeline_number,
    jobNumber: positive(env.CIRCLE_BUILD_NUM, 'job number'),
  });
}

function dockerEnvironment(env, work) {
  assert.ok(env.PATH, 'PATH is required');
  const result = {
    PATH: env.PATH,
    HOME: work,
    DOCKER_HOST: 'unix:///var/run/docker.sock',
    DOCKER_CONFIG: path.join(work, 'docker-config'),
    BUILDKIT_PROGRESS: 'plain',
  };
  fs.mkdirSync(result.DOCKER_CONFIG, { mode: 0o700 });
  return result;
}

function gitEnvironment(env, work) {
  return {
    PATH: env.PATH,
    HOME: work,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
  };
}

function pilotEnvironment(env, work) {
  const result = { PATH: env.PATH, HOME: env.HOME || work, NG_BUILD_MAX_WORKERS: '2', NODE_OPTIONS: '' };
  for (const name of ['NVM_DIR', 'TMPDIR']) if (env[name]) result[name] = env[name];
  return result;
}

function writeRecord(filename, value) {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o400 });
}

// Commands run sequentially. process.chdir is scoped to the child invocation;
// execute uses a process group and escalates TERM to KILL after its deadline.
function commandRunner() {
  let stop,
    cancelled = false;
  const cancel = () => {
    cancelled = true;
    if (stop) stop();
  };
  const call = async (command, args, options = {}) => {
    if (cancelled) throw new Error('pilot interrupted');
    const previous = process.cwd();
    try {
      if (options.cwd) process.chdir(options.cwd);
      const result = await execute(command, args, {
        environment: options.env,
        timeoutMs: options.timeoutMs || 30000,
        capture: !!options.capture,
        quiet: !!options.quiet,
        onChild: (_child, terminate) => {
          stop = terminate;
        },
      });
      if (cancelled) throw new Error('pilot interrupted');
      return result;
    } finally {
      stop = undefined;
      process.chdir(previous);
    }
  };
  return {
    call,
    cancel,
    get cancelled() {
      return cancelled;
    },
  };
}

async function checkCheckout(root, ctx, call, env) {
  const git = async args => (await call('git', ['-C', root, ...args], { env, capture: true, quiet: true })).stdout;
  assert.equal((await git(['rev-parse', 'HEAD'])).trim(), ctx.revision);
  assert.equal(
    (await git(['status', '--porcelain', '--untracked-files=normal'])).trim(),
    '',
    'pilot checkout must be clean'
  );
}

async function checkSource(root, ctx, call, env, allowNodeModules = false) {
  await checkCheckout(root, ctx, call, env);
  const git = async args => (await call('git', ['-C', root, ...args], { env, capture: true, quiet: true })).stdout;
  const ignored = (await git(['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']))
    .split('\0')
    .filter(Boolean);
  assert.ok(
    ignored.every(name => allowNodeModules && (name === 'node_modules/' || name.startsWith('node_modules/'))),
    'unexpected ignored input in isolated source'
  );
}

async function nativeBuilder(env, work, jobNumber, call) {
  const dockerEnv = dockerEnvironment(env, work);
  const info = (
    await call('docker', ['info', '--format', '{{.OSType}}/{{.Architecture}}'], {
      env: dockerEnv,
      capture: true,
      quiet: true,
    })
  ).stdout.trim();
  assert.ok(['linux/aarch64', 'linux/arm64'].includes(info), `Docker daemon is not native ARM64: ${info}`);
  const name = `rb-assets-pilot-${jobNumber}-${randomBytes(16).toString('hex')}`;
  const existing = (
    await call('docker', ['ps', '-aq', '--filter', `name=^/buildx_buildkit_${name}0$`], {
      env: dockerEnv,
      capture: true,
      quiet: true,
    })
  ).stdout.trim();
  assert.equal(existing, '', 'pilot builder container already exists');
  return { name, dockerEnv };
}

async function run(mode, env = process.env, options = {}) {
  assert.ok(['produce', 'control', 'shared'].includes(mode), 'expected produce, control or shared');
  const host = options.host || process;
  assert.equal(host.platform, 'linux');
  assert.equal(host.arch, mode === 'produce' ? 'x64' : 'arm64', 'wrong native pilot architecture');
  assert.equal(host.version, 'v24.22.1', 'asset identity requires Node 24.22.1');
  const approved = options.approvedConfigurationSha256 ?? APPROVED_CONFIG_SHA256;
  assert.match(approved || '', /^[a-f0-9]{64}$/, 'pilot configuration has not been independently approved');
  assert.ok(env.CIRCLE_TOKEN, 'CIRCLE_TOKEN with read access is required to authenticate pilot metadata');
  assert.match(env.CIRCLE_WORKFLOW_ID || '', /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  const client =
    options.client || new CircleCIReadClient({ token: env.CIRCLE_TOKEN, artifactOrigins: ARTIFACT_ORIGINS });
  const ctx = readContext(env, approved, await client.workflow(env.CIRCLE_WORKFLOW_ID));
  const trusted =
    mode === 'shared'
      ? await authenticateProducer(client, ctx)
      : await authenticateCurrent(client, ctx, mode === 'produce' ? PRODUCER : CONTROL);
  const originalRoot = fs.realpathSync(options.sourceRoot || process.cwd());
  const work = options.work || WORK,
    transfer = options.transfer || TRANSFER,
    output = options.output || OUTPUT;
  fs.mkdirSync(work, { mode: 0o700 });
  const gitEnv = gitEnvironment(env, work),
    pilotEnv = pilotEnvironment(env, work);
  const runner = options.runner || commandRunner();
  const cancel = () => runner.cancel();
  process.once('SIGTERM', cancel);
  process.once('SIGINT', cancel);
  let builder,
    attempted = false,
    failure;
  try {
    await checkCheckout(originalRoot, ctx, runner.call, gitEnv);
    const root = path.join(work, 'source');
    await runner.call('git', ['clone', '--no-local', '--no-hardlinks', '--no-checkout', '--', originalRoot, root], {
      env: gitEnv,
      timeoutMs: 10 * 60 * 1000,
    });
    await runner.call('git', ['-C', root, 'checkout', '--detach', ctx.revision], { env: gitEnv, timeoutMs: 120000 });
    await checkSource(root, ctx, runner.call, gitEnv);
    const pilot = path.join(root, 'support/build/ci-web-assets/pilot.cjs');
    if (mode === 'produce') {
      const parent = path.join(transfer, ctx.revision, ctx.workflowId);
      fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
      const request = {
        optIn: true,
        identity: identity(ctx, ctx.jobNumber),
        root,
        output: path.join(parent, String(ctx.jobNumber)),
        platform: 'linux/amd64',
      };
      const requestPath = path.join(work, 'produce-request.json');
      writeRecord(requestPath, request);
      const result = JSON.parse(
        (
          await runner.call(process.execPath, [pilot, 'produce', requestPath], {
            env: pilotEnv,
            cwd: root,
            capture: true,
            timeoutMs: 90 * 60 * 1000,
          })
        ).stdout
      );
      if (runner.cancelled) throw new Error('pilot interrupted');
      writeRecord(path.join(work, 'producer-success.json'), producerRecord(ctx, ctx.jobId, result.receiptSha256));
      return;
    }
    let invocation;
    if (mode === 'shared') {
      // The restore validator requires host TypeScript. Install it only after
      // producer authentication, inside the disposable source clone.
      await runner.call('npm', ['ci', '--ignore-scripts', '--strict-peer-deps'], {
        env: {
          ...pilotEnv,
          npm_config_userconfig: path.join(root, 'support/build/ci-web-assets/empty.npmrc'),
          npm_config_globalconfig: '/dev/null',
        },
        cwd: root,
        timeoutMs: 30 * 60 * 1000,
      });
      await checkSource(root, ctx, runner.call, gitEnv, true);
      assert.ok(fs.existsSync(path.join(root, 'node_modules/typescript/package.json')), 'host TypeScript is required');
      const input = path.join(transfer, ctx.revision, ctx.workflowId, String(trusted.identity.attempt));
      const receipt = path.join(input, 'receipt.json');
      const request = {
        optIn: true,
        identity: trusted.identity,
        root,
        output,
        platform: 'linux/arm64',
        artifact: path.join(input, 'artifact'),
        receipt,
        receiptSha256: trusted.receiptSha256,
        producerPlatform: 'linux/amd64',
        target: 'runtime',
      };
      const requestPath = path.join(work, 'prepare-request.json');
      writeRecord(requestPath, request);
      const result = JSON.parse(
        (
          await runner.call(process.execPath, [pilot, 'prepare', requestPath], {
            env: pilotEnv,
            cwd: root,
            capture: true,
            timeoutMs: 10 * 60 * 1000,
          })
        ).stdout
      );
      const receiptData = JSON.parse(fs.readFileSync(receipt, 'utf8'));
      invocation = verifyPlan(fs.readFileSync(result.plan), result.planSha256, {
        identity: trusted.identity,
        receiptSha256: trusted.receiptSha256,
        manifestSha256: receiptData.assets.manifestSha256,
        output,
        root,
      });
      // The host install is needed only for restore validation. Remove this
      // owned tree before Docker reads the source, even if a future ignore
      // rule accidentally includes some of its files in the build context.
      const dependencies = path.join(root, 'node_modules');
      const dependencyStat = fs.lstatSync(dependencies);
      assert.ok(dependencyStat.isDirectory() && !dependencyStat.isSymbolicLink());
      await runner.call('/bin/rm', ['-rf', '--', dependencies], { env: gitEnv, timeoutMs: 5 * 60 * 1000 });
      await checkSource(root, ctx, runner.call, gitEnv);
    } else {
      fs.mkdirSync(output, { mode: 0o700 });
      invocation = {
        command: 'docker',
        args: [
          'buildx',
          'build',
          '--platform',
          'linux/arm64',
          '--target',
          'runtime',
          '--build-arg',
          'WEB_ASSETS=local',
          '--build-arg',
          `SOURCE_REVISION=${ctx.revision}`,
          '--output',
          `type=oci,dest=${path.join(output, 'image.oci.tar')}`,
          root,
        ],
        cwd: root,
        shell: false,
      };
    }
    // No builder is started until source, producer, receipt and plan checks pass.
    builder = await nativeBuilder(env, work, ctx.jobNumber, runner.call);
    attempted = true;
    await runner.call('docker', ['buildx', 'create', '--name', builder.name, '--driver', 'docker-container'], {
      env: builder.dockerEnv,
      timeoutMs: 60000,
    });
    await runner.call('docker', ['buildx', 'inspect', builder.name, '--bootstrap'], {
      env: builder.dockerEnv,
      timeoutMs: 5 * 60 * 1000,
    });
    builder.dockerEnv.BUILDX_BUILDER = builder.name;
    await runner.call(invocation.command, invocation.args, {
      env: builder.dockerEnv,
      cwd: invocation.cwd,
      timeoutMs: 100 * 60 * 1000,
    });
  } catch (error) {
    failure = error;
  } finally {
    if (attempted) {
      try {
        // A fresh random name and pre-creation absence check scope deletion to
        // this job, including a create that failed after allocating resources.
        await (options.cleanup || execute)('docker', ['buildx', 'rm', '--force', builder.name], {
          environment: builder.dockerEnv,
          timeoutMs: 60000,
        });
      } catch (error) {
        failure = new Error(`${failure ? `${failure.message}; ` : ''}pilot builder cleanup failed: ${error.message}`);
      }
    }
    process.removeListener('SIGTERM', cancel);
    process.removeListener('SIGINT', cancel);
  }
  if (failure) throw failure;
  if (runner.cancelled) throw new Error('pilot interrupted');
}

module.exports = {
  readContext,
  checkSource,
  dockerEnvironment,
  gitEnvironment,
  pilotEnvironment,
  commandRunner,
  nativeBuilder,
  run,
};
if (require.main === module)
  run(process.argv[2]).catch(error => {
    console.error(`CircleCI web asset pilot rejected: ${error.message}`);
    process.exitCode = 1;
  });
