const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const script = join(__dirname, 'docker-staging.sh');
const sha = 'a'.repeat(40);
const pipeline = '12345678-1234-1234-1234-123456789abc';
const staging = (variant, arch, commit = sha, run = pipeline) =>
  `example/portal:ci-staging-${commit}-${variant}-${arch}-${run}`;

function run(args, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'docker-staging-'));
  const log = join(directory, 'calls');
  writeFileSync(join(directory, 'docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_TEST_LOG"
if [[ "$1" == login ]]; then cat >/dev/null; fi
if [[ "$1 $2" == 'manifest inspect' ]]; then
  if [[ "\${FAIL_PREFLIGHT:-}" == 1 ]]; then echo 'registry connection failed' >&2; exit 1; fi
  if [[ "\${EXISTING_STAGE:-}" == 1 ]]; then exit 0; fi
  echo 'no such manifest' >&2
  exit 1
fi
if [[ "$*" == *'imagetools inspect'* && "\${FAIL_INSPECT:-}" == 1 ]]; then exit 1; fi
if [[ "$*" == *'imagetools create'* && "\${FAIL_CREATE_ONCE:-}" == 1 && ! -f "$DOCKER_TEST_LOG.failed" ]]; then
  touch "$DOCKER_TEST_LOG.failed"
  exit 1
fi
`, { mode: 0o755 });
  try {
    const result = spawnSync('bash', [script, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        DOCKER_TEST_LOG: log,
        REPO: 'example/portal',
        CIRCLE_SHA1: sha,
        CIRCLE_BRANCH: 'chore/ci-build-speed',
        CIRCLE_TAG: '',
        STAGING_RUN_ID: pipeline,
        DOCKER_USER: 'test-user',
        DOCKER_PASS: 'test-password',
        DOCKER_MANIFEST_CREATE_MAX_ATTEMPTS: '2',
        DOCKER_MANIFEST_CREATE_BASE_DELAY_SECONDS: '0',
        ...overrides,
      },
    });
    let calls = [];
    try { calls = readFileSync(log, 'utf8').trim().split('\n'); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return { ...result, calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('only exact automatic release branches enable promotion; tags cannot bypass the gate', () => {
  for (const branch of ['master', 'develop', 'support/5.x', 'support/nested/fix']) {
    assert.equal(run(['can-promote'], { CIRCLE_BRANCH: branch }).status, 0, branch);
  }
  for (const branch of ['', 'chore/ci-build-speed', 'feature/develop', 'develop/fix', 'master-copy', 'support']) {
    assert.notEqual(run(['can-promote'], { CIRCLE_BRANCH: branch, CIRCLE_TAG: 'v5.0.0' }).status, 0, branch);
  }
});

test('staging builds preserve each published Docker target and push only the staging tag', () => {
  for (const [variant, arch, target] of [
    ['runtime', 'amd64', 'test'], ['runtime', 'arm64', 'runtime'],
    ['pdfgen', 'amd64', 'runtime_pdfgen'], ['pdfgen', 'arm64', 'runtime_pdfgen'],
  ]) {
    const result = run(['build', variant, arch]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.calls, [
      'login --username test-user --password-stdin',
      `manifest inspect ${staging(variant, arch)}`,
      `build --progress plain --platform linux/${arch} --target ${target} --tag ${staging(variant, arch)} .`,
      `push ${staging(variant, arch)}`,
    ]);
  }
});

test('reruns reuse existing staging images, and uncertain registry failures cannot overwrite tags', () => {
  const existing = run(['build', 'runtime', 'amd64'], { EXISTING_STAGE: '1' });
  assert.equal(existing.status, 0, existing.stderr);
  assert.deepEqual(existing.calls, [
    'login --username test-user --password-stdin',
    `manifest inspect ${staging('runtime', 'amd64')}`,
  ]);
  assert.match(existing.stdout, /Reusing existing staging image/);
  const failure = run(['build', 'runtime', 'amd64'], { FAIL_PREFLIGHT: '1' });
  assert.notEqual(failure.status, 0);
  assert.ok(failure.calls.every(call => !call.startsWith('build ') && !call.startsWith('push ')));
});

test('staging tags isolate commits and separate pipelines of the same commit', () => {
  const otherSha = 'b'.repeat(40);
  const otherPipeline = '87654321-1234-1234-1234-123456789abc';
  const first = run(['build', 'runtime', 'amd64']);
  const second = run(['build', 'runtime', 'amd64'], { CIRCLE_SHA1: otherSha });
  const third = run(['build', 'runtime', 'amd64'], { STAGING_RUN_ID: otherPipeline });
  assert.notEqual(first.calls.at(-1), second.calls.at(-1));
  assert.notEqual(first.calls.at(-1), third.calls.at(-1));
  assert.equal(third.calls.at(-1), `push ${staging('runtime', 'amd64', sha, otherPipeline)}`);
  assert.ok(staging('runtime', 'amd64').split(':')[1].length <= 128);
});

test('dry runs verify staging images and print exact promotion commands without writes', () => {
  for (const variant of ['runtime', 'pdfgen']) {
    const suffix = variant === 'pdfgen' ? '-pdfgen' : '';
    for (const arch of ['amd64', 'arm64']) {
      const result = run(['promote', variant, arch]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /DRY RUN/);
      assert.ok(result.stdout.includes(`docker buildx imagetools create --prefer-index=false --tag example/portal:chore-ci-build-speed${suffix}-${arch} ${staging(variant, arch)}`));
      assert.deepEqual(result.calls, [
        'login --username test-user --password-stdin',
        `buildx imagetools inspect ${staging(variant, arch)}`,
      ]);
    }
    const manifest = run(['manifest', variant]);
    assert.equal(manifest.status, 0, manifest.stderr);
    assert.ok(manifest.stdout.includes(`docker buildx imagetools create --tag example/portal:chore-ci-build-speed${suffix} ${staging(variant, 'amd64')} ${staging(variant, 'arm64')}`));
    assert.equal(manifest.calls.length, 3);
    assert.ok(manifest.calls.every(call => !call.includes('imagetools create')));
  }
});

test('release branches promote to existing tags and assemble manifests from staging only', () => {
  for (const [branch, tag] of [['master', 'master'], ['develop', 'develop'], ['support/5.x', 'support-5.x']]) {
    for (const variant of ['runtime', 'pdfgen']) {
      const suffix = variant === 'pdfgen' ? '-pdfgen' : '';
      const image = run(['promote', variant, 'amd64'], { CIRCLE_BRANCH: branch });
      assert.equal(image.status, 0, image.stderr);
      assert.equal(image.calls.at(-1), `buildx imagetools create --prefer-index=false --tag example/portal:${tag}${suffix}-amd64 ${staging(variant, 'amd64')}`);
      const manifest = run(['manifest', variant], { CIRCLE_BRANCH: branch });
      assert.equal(manifest.status, 0, manifest.stderr);
      assert.equal(manifest.calls.at(-1), `buildx imagetools create --tag example/portal:${tag}${suffix} ${staging(variant, 'amd64')} ${staging(variant, 'arm64')}`);
    }
  }
});

test('invalid identifiers and parameters fail before contacting Docker', () => {
  for (const overrides of [{ CIRCLE_SHA1: '' }, { CIRCLE_SHA1: 'abc' }, { STAGING_RUN_ID: '' }, { STAGING_RUN_ID: 'bad/tag' }]) {
    const result = run(['build', 'runtime', 'amd64'], overrides);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.calls, []);
  }
  for (const args of [['build', 'unknown', 'amd64'], ['promote', 'runtime', 'x86'], ['unknown', 'runtime']]) {
    const result = run(args);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.calls, []);
  }
});

test('missing staging images fail closed, including in dry runs', () => {
  for (const branch of ['develop', 'chore/ci-build-speed']) {
    const result = run(['promote', 'runtime', 'amd64'], { CIRCLE_BRANCH: branch, FAIL_INSPECT: '1' });
    assert.notEqual(result.status, 0);
    assert.ok(result.calls.every(call => !call.includes('imagetools create')));
  }
});

test('transient registry creation failures are retried', () => {
  const result = run(['manifest', 'pdfgen'], { CIRCLE_BRANCH: 'develop', FAIL_CREATE_ONCE: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.filter(call => call.includes('imagetools create')).length, 2);
});
