#!/usr/bin/env node
// Local-only ARM64 measurement. Intentionally independent of promotion helpers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');

const BRANCH = 'chore/circleci-performance';
const TARGETS = ['runtime', 'runtime_pdfgen'];
const OUTPUT = '.tmp/ci-arm64-pilot';
const WORK = '.tmp/ci-arm64-pilot-work';
const STATE = '.tmp/ci-arm64-pilot-state.json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJSON = (filename, value) => fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);

function dockerEnvironment() {
  const environment = { ...process.env, DOCKER_CONFIG: path.resolve(WORK, 'docker-config'),
    DOCKER_HOST: 'unix:///var/run/docker.sock' };
  for (const key of ['DOCKER_AUTH_CONFIG', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH',
    'BUILDX_CONFIG', 'BUILDX_BUILDER', 'BUILDKIT_HOST']) delete environment[key];
  return environment;
}

function guard(environment, hostArchitecture) {
  assert.equal(environment.CIRCLE_BRANCH, BRANCH, 'Pilot requires the exact chore branch');
  assert.ok(!environment.CIRCLE_TAG, 'Pilot never runs on a tag');
  assert.match(environment.CIRCLE_SHA1 || '', /^[0-9a-f]{40}$/, 'Pilot requires a pipeline revision');
  assert.equal(hostArchitecture, 'arm64', 'Pilot requires a native ARM64 host');
}

function sourceMetadata(environment) {
  const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const revision = git(['rev-parse', 'HEAD']);
  assert.equal(revision, environment.CIRCLE_SHA1, 'Checkout must match the pipeline revision');
  assert.equal(git(['status', '--porcelain', '--untracked-files=normal']), '', 'Pilot requires a clean checkout');
  const files = git(['ls-files']).split('\n').filter(name =>
    /(^|\/)(package(-lock)?\.json|\.npmrc|\.nvmrc)$/.test(name) ||
    ['Dockerfile', '.dockerignore', 'support/build/ci-arm64-pilot.cjs',
      'support/build/ci-arm64-pilot.smoke.cjs'].includes(name));
  const hashes = Object.fromEntries(files.map(name => [name, sha256(fs.readFileSync(name))]));
  return { revision, pipeline_revision: environment.CIRCLE_SHA1,
    tree: git(['rev-parse', 'HEAD^{tree}']), checkout_clean: true,
    // Only hashes of these inputs are emitted; never npmrc contents or env dumps.
    input_sha256: hashes, input_set_sha256: sha256(JSON.stringify(hashes)) };
}

function imageDetails(image) {
  assert.equal(`${image.Os}/${image.Architecture}`, 'linux/arm64');
  assert.equal(image.Config.User, 'node');
  assert.equal(image.Config.WorkingDir, '/opt/redbox-portal');
  assert.deepEqual(image.Config.Entrypoint, ['docker-entrypoint.sh']);
  assert.deepEqual(image.Config.Cmd, ['node', 'app.js']);
  assert.ok(Object.hasOwn(image.Config.ExposedPorts || {}, '1337/tcp'));
  assert.ok(image.Config.Healthcheck?.Test?.length, 'Runtime healthcheck is present');
  // Do not serialize the whole inspect response: Config.Env can contain secrets.
  const allowed = new Set(['NODE_ENV', 'TZ', 'PUPPETEER_EXECUTABLE_PATH', 'PUPPETEER_PRODUCT', 'PUPPETEER_SKIP_DOWNLOAD']);
  return { id: image.Id, platform: 'linux/arm64', size_bytes: image.Size,
    user: image.Config.User, working_directory: image.Config.WorkingDir,
    entrypoint: image.Config.Entrypoint, command: image.Config.Cmd,
    exposed_ports: Object.keys(image.Config.ExposedPorts), healthcheck: image.Config.Healthcheck,
    environment: (image.Config.Env || []).filter(item => allowed.has(item.split('=')[0])),
    layer_count: image.RootFS?.Layers?.length ?? null };
}

// A bounded process runner: timeout/cancellation reaches Docker and its children.
function execute(command, args, { environment = process.env, input, timeoutMs = 60000,
  quiet = false, capture = false, onChild = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: environment, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', pending = '';
    const cached = new Set();
    let timedOut = false;
    let escalation;
    const stop = () => {
      if (escalation) return;
      try { if (child.pid) process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') reject(error); }
      // The leader can close while descendants still live with their stdio closed.
      // Keep the group ID and complete escalation before settling this command.
      escalation = new Promise(resolve => setTimeout(() => {
        try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') reject(error); }
        resolve();
      }, 5000));
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const count = line => { const match = /^#(\d+) CACHED(?: |$)/.exec(line); if (match) cached.add(match[1]); };
    child.stdout.on('data', bytes => {
      if (capture) stdout += bytes.toString();
      if (!quiet) process.stdout.write(bytes);
    });
    child.stderr.on('data', bytes => {
      if (capture) stderr += bytes.toString();
      if (!quiet) process.stderr.write(bytes);
      pending += bytes.toString();
      const lines = pending.split(/\r?\n/); pending = lines.pop(); lines.forEach(count);
    });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
    child.stdin.end(input);
    const finish = async () => { clearTimeout(timer); await escalation; onChild(null); };
    child.once('error', error => { finish().then(() => reject(error), reject); });
    child.once('close', async (code, signal) => {
      await finish(); if (pending) count(pending);
      const result = { code, signal, timed_out: timedOut, stdout, stderr, cached_operations: cached.size };
      if (code !== 0 || timedOut) {
        const error = new Error(`${command} failed (exit=${code}, signal=${signal}, timeout=${timedOut})`);
        error.result = result; reject(error);
      } else resolve(result);
    });
    onChild(child, stop);
  });
}

function resourceState() {
  const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  assert.match(state.id, /^[0-9a-f]{16}$/);
  return { ...state, builder: `ci-arm64-pilot-${state.id}`,
    images: TARGETS.map(target => `localhost/ci-arm64-pilot:${state.id}-${target}`),
    containers: TARGETS.map(target => `ci-arm64-pilot-${state.id}-${target}`) };
}

async function cleanup() {
  if (!fs.existsSync(STATE)) return [];
  const state = resourceState();
  const environment = dockerEnvironment();
  const failures = [];
  // Inspect first so a resource already removed by --rm or a prior cleanup is normal.
  const resources = [
    ...state.containers.map(name => [['container', 'inspect', name], ['container', 'rm', '-f', name]]),
    [['buildx', 'inspect', '--builder', state.builder], ['buildx', 'rm', '--force', state.builder]],
    ...state.images.map(name => [['image', 'inspect', name], ['image', 'rm', '-f', name]]),
  ];
  for (const [inspect, remove] of resources) {
    try { await execute('docker', inspect, { environment, quiet: true, capture: true, timeoutMs: 10000 }); }
    catch (error) {
      const result = error.result;
      const name = inspect.at(-1);
      const absent = inspect[0] === 'buildx' ? `ERROR: no builder "${name}" found` :
        `Error response from daemon: No such ${inspect[0]}: ${name}`;
      if (result?.code !== 1 || result.signal || result.timed_out || result.stderr.trim() !== absent) {
        failures.push(inspect.slice(0, 2).join(' '));
      }
      continue;
    }
    try { await execute('docker', remove, { environment, quiet: true, timeoutMs: 15000 }); }
    catch { failures.push(remove.slice(0, 2).join(' ')); }
  }
  // Keep builder metadata for the always-run retry if inspection or removal failed.
  if (!failures.length) fs.rmSync(WORK, { recursive: true, force: true });
  // Retain the non-secret ID for the always-run cleanup step to retry if needed.
  return failures;
}

async function run() {
  guard(process.env, os.arch());
  const source = sourceMetadata(process.env);
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.mkdirSync(path.join(WORK, 'docker-config'), { recursive: true, mode: 0o700 });
  // Fresh config prevents registry credential helpers/auth from being used.
  writeJSON(path.join(WORK, 'docker-config/config.json'), { auths: {} });
  writeJSON(STATE, { id: randomBytes(8).toString('hex') });
  const state = resourceState();
  const environment = dockerEnvironment();
  const report = { schema_version: 1, status: 'running', source,
    identity: Object.fromEntries(['CIRCLE_BRANCH', 'CIRCLE_WORKFLOW_ID', 'CIRCLE_BUILD_NUM', 'CIRCLE_JOB',
      'CI_RESOURCE_CLASS'].map(key => [key, process.env[key] || null])),
    executor: { host_architecture: os.arch(), host_node: process.version, platform: 'linux/arm64' },
    builder: { name: state.builder, driver: 'docker-container', fresh: true,
      persistent_cache: false, registry_cache: false },
    started_at: new Date().toISOString(), measurements: [], images: {},
    daemon_peak_memory_bytes: null, billed_credits: null };
  const flush = () => writeJSON(path.join(OUTPUT, 'report.json'), report);
  let stopActiveChild;
  let interrupted = false;
  const cancel = () => {
    interrupted = true;
    stopActiveChild?.();
  };
  process.on('SIGTERM', cancel); process.on('SIGINT', cancel);
  const docker = async (label, args, options = {}) => {
    assert.ok(!interrupted, 'Pilot interrupted');
    const record = { label, started_at: new Date().toISOString() };
    const start = process.hrtime.bigint();
    try {
      const result = await execute('docker', args, { environment,
        onChild: (child, stop) => { stopActiveChild = child ? stop : null; }, ...options });
      Object.assign(record, { exit_code: 0, cached_operations: result.cached_operations });
      assert.ok(!interrupted, 'Pilot interrupted');
      return result.stdout;
    } catch (error) {
      Object.assign(record, { exit_code: error.result?.code ?? 1, signal: error.result?.signal || null,
        timed_out: error.result?.timed_out || false });
      throw error;
    } finally {
      record.elapsed_seconds = Number(process.hrtime.bigint() - start) / 1e9;
      report.measurements.push(record); flush();
    }
  };
  flush();
  try {
    const info = JSON.parse(await docker('daemon-info', ['info', '--format', '{{json .}}'], { quiet: true, capture: true }));
    assert.ok(['aarch64', 'arm64'].includes(info.Architecture), 'Docker daemon must be native ARM64');
    assert.equal(info.OSType, 'linux');
    report.executor.docker_server_version = info.ServerVersion;
    report.executor.daemon_architecture = info.Architecture;
    report.executor.daemon_cpus = info.NCPU;
    report.executor.daemon_memory_bytes = info.MemTotal;
    report.executor.buildx_version = (await docker('buildx-version', ['buildx', 'version'], { quiet: true, capture: true })).trim();
    await docker('builder-create', ['buildx', 'create', '--name', state.builder, '--driver', 'docker-container']);
    await docker('builder-bootstrap', ['buildx', 'inspect', '--builder', state.builder, '--bootstrap'], { timeoutMs: 300000 });
    // Back-to-back builds on the same fresh builder; the PDF extension reuses runtime layers.
    for (const [index, target] of TARGETS.entries()) {
      await docker(`build-${target}`, ['buildx', 'build', '--builder', state.builder, '--platform', 'linux/arm64',
        '--progress', 'plain', '--target', target, '--tag', state.images[index], '--load', '.'], { timeoutMs: 45 * 60000 });
    }
    for (const [index, target] of TARGETS.entries()) {
      const metadata = JSON.parse(await docker(`inspect-${target}`, ['image', 'inspect', state.images[index]], { quiet: true, capture: true }));
      report.images[target] = imageDetails(metadata[0]); flush();
      const archive = path.join(WORK, `${target}.tar`);
      try {
        await docker(`archive-${target}`, ['image', 'save', '--output', archive, state.images[index]], { timeoutMs: 10 * 60000 });
        report.images[target].archive_bytes = fs.statSync(archive).size;
      } finally { fs.rmSync(archive, { force: true }); flush(); }
      const smoke = await docker(`smoke-${target}`, ['run', '--rm', '--pull=never', '--name', state.containers[index],
        '--network=none', '--platform', 'linux/arm64', '--entrypoint', 'node', '-i', state.images[index], '-', target],
      { quiet: true, capture: true, timeoutMs: 180000, input: fs.readFileSync(path.join(__dirname, 'ci-arm64-pilot.smoke.cjs')) });
      // Accept only the explicitly structured smoke result, not arbitrary package logs.
      const result = smoke.split('\n').find(line => line.startsWith('CI_ARM64_PILOT_RESULT='));
      assert.ok(result, 'Smoke check must produce a structured result');
      report.images[target].smoke = JSON.parse(result.slice('CI_ARM64_PILOT_RESULT='.length)); flush();
    }
    report.status = 'success';
  } catch (error) {
    report.status = interrupted ? 'interrupted' : 'failed';
    // Do not artifact child logs, command output, full environment or image Env.
    report.failure = error.message;
    throw error;
  } finally {
    report.cleanup_failures = await cleanup();
    process.removeListener('SIGTERM', cancel); process.removeListener('SIGINT', cancel);
    report.finished_at = new Date().toISOString(); flush();
  }
}

module.exports = { guard, sourceMetadata, imageDetails, execute, run, cleanup, TARGETS, BRANCH };
if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === 'run') await run();
    else if (mode === 'cleanup') {
      const failures = await cleanup();
      assert.equal(failures.length, 0, `Pilot cleanup incomplete: ${failures.join(', ')}`);
    }
    else throw new Error('Usage: ci-arm64-pilot.cjs run | cleanup');
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
