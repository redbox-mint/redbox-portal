const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const script = join(__dirname, 'docker-test-handoff.sh');
const id = `sha256:${'a'.repeat(64)}`;
const digest = `sha256:${'b'.repeat(64)}`;
const pinned = `example/portal@${digest}`;
const sha = 'c'.repeat(40);
const pipeline = '12345678-1234-1234-1234-123456789abc';
const staging = `example/portal:ci-staging-${sha}-test-amd64-${pipeline}`;

function run(action, overrides = {}, metadata) {
  const dir = mkdtempSync(join(tmpdir(), 'test-handoff-'));
  const log = join(dir, 'calls');
  const file = join(dir, 'test-image.txt');
  if (metadata !== undefined) writeFileSync(file, metadata);
  writeFileSync(join(dir, 'docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$TEST_CALLS"
case "$1 $2" in
  'login --username') cat >/dev/null ;;
  'image inspect') echo "\${PULLED_ID:-${id}}" ;;
  'manifest inspect')
    if [[ "\${PREFLIGHT:-missing}" == existing ]]; then echo '{}'
    elif [[ "\${PREFLIGHT:-missing}" == missing ]]; then echo 'manifest unknown' >&2; exit 1
    else echo 'registry unavailable' >&2; exit 1; fi ;;
  'buildx imagetools')
    if [[ "\${FAIL_INSPECT:-}" == 1 ]]; then exit 1; fi
    if [[ "$*" == *--raw* ]]; then printf '{"config":{"digest":"%s"}}\\n' "\${CONFIG_ID:-${id}}"
    else printf '{"digest":"%s"}\\n' "\${MANIFEST_DIGEST:-${digest}}"; fi ;;
  'save -o') touch "$3" ;;
esac
if [[ "$1" == pull && "\${FAIL_PULL:-}" == 1 ]]; then exit 1; fi
`, { mode: 0o755 });
  try {
    const result = spawnSync('bash', [script, action, dir], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_CALLS: log,
        REPO: 'example/portal', CIRCLE_BRANCH: 'chore/ci-build-speed', CIRCLE_TAG: '',
        CIRCLE_SHA1: sha, STAGING_RUN_ID: pipeline,
        DOCKER_USER: 'test-user', DOCKER_PASS: 'test-password', ...overrides },
    });
    return { ...result, calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [],
      metadata: existsSync(file) ? readFileSync(file, 'utf8') : undefined,
      archive: existsSync(join(dir, 'redbox-portal-test.tar')) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('publishes immutable staging, verifies pinned config ID and persists digest metadata without a tar', () => {
  const result = run('publish');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.calls.includes(`push ${staging}`));
  assert.ok(result.calls.includes(`buildx imagetools inspect --raw ${pinned}`));
  assert.equal(result.metadata, `registry\n${id}\n${pinned}\n`);
  assert.equal(result.archive, false);
  assert.ok(result.calls.every(c => !c.startsWith('save ')));
});

test('reruns reuse test tags only with identical config; registry errors fail closed', () => {
  const existing = run('publish', { PREFLIGHT: 'existing' });
  assert.equal(existing.status, 0, existing.stderr);
  assert.ok(existing.calls.every(c => !c.startsWith('push ') && !c.startsWith('tag ')));
  for (const overrides of [{ PREFLIGHT: 'error' }, { MANIFEST_DIGEST: 'invalid' },
    { CONFIG_ID: `sha256:${'d'.repeat(64)}`, PREFLIGHT: 'existing' }, { FAIL_INSPECT: '1' },
    { CIRCLE_SHA1: 'bad' }, { STAGING_RUN_ID: 'bad' }]) {
    const result = run('publish', overrides, 'stale metadata');
    assert.notEqual(result.status, 0, JSON.stringify(overrides));
    assert.equal(result.metadata, undefined);
    assert.ok(result.calls.every(c => !c.startsWith('save ')));
    if (overrides.PREFLIGHT) assert.ok(result.calls.every(c => !c.startsWith('push ')));
  }
});

test('forks missing either credential save only test and verify its identity after load', () => {
  for (const creds of [{ DOCKER_USER: '' }, { DOCKER_PASS: '' }, { DOCKER_USER: '', DOCKER_PASS: '' }]) {
    const result = run('publish', creds);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.metadata, `workspace\n${id}\n-\n`);
    assert.equal(result.archive, true);
    const save = result.calls.find(c => c.startsWith('save '));
    assert.match(save, /redbox-portal-test.tar redbox-portal:test$/);
    assert.ok(result.calls.every(c => !c.startsWith('login ') && !c.startsWith('push ')));
    const received = run('receive', creds, result.metadata);
    assert.equal(received.status, 0, received.stderr);
    assert.ok(received.calls.some(c => c.startsWith('load -i ')));
    assert.ok(received.calls.every(c => !c.startsWith('pull ')));
    assert.notEqual(run('receive', { ...creds, PULLED_ID: 'invalid' }, result.metadata).status, 0);
    for (const branch of ['master', 'develop', 'support/5.x']) {
      assert.notEqual(run('publish', { ...creds, CIRCLE_BRANCH: branch }).status, 0);
    }
  }
});

test('authenticated receive pulls only by digest and verifies both pulled and compose image IDs', () => {
  const result = run('receive', {}, `registry\n${id}\n${pinned}\n`);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [
    'login --username test-user --password-stdin', `pull ${pinned}`,
    `image inspect --format {{.Id}} ${pinned}`, `tag ${pinned} redbox-portal:test`,
    'image inspect --format {{.Id}} redbox-portal:test',
  ]);
  for (const overrides of [{ PULLED_ID: `sha256:${'e'.repeat(64)}` }, { FAIL_PULL: '1' }, { DOCKER_USER: '' }, { DOCKER_PASS: '' }]) {
    const failed = run('receive', overrides, `registry\n${id}\n${pinned}\n`);
    assert.notEqual(failed.status, 0);
    assert.ok(failed.calls.every(c => !c.startsWith('tag ') && !c.startsWith('load ')));
  }
});

test('malformed metadata, mutable tags, other repositories and missing metadata fail before Docker', () => {
  for (const metadata of [undefined, '', `registry\n${id}\nexample/portal:latest\n`,
    `registry\n${id}\nother/portal@${digest}\n`, `registry\ninvalid\n${pinned}\n`,
    `workspace\n${id}\n${pinned}\n`, `unknown\n${id}\n-\n`,
    `registry\n${id}\n${pinned}\nextra\n`]) {
    const result = run('receive', {}, metadata);
    assert.notEqual(result.status, 0, metadata);
    assert.deepEqual(result.calls, []);
  }
});

test('v tags retain the runtime archive for legacy deployment with either transport', () => {
  const registry = run('publish', { CIRCLE_TAG: 'v5.0.0', CIRCLE_BRANCH: '' });
  assert.equal(registry.status, 0, registry.stderr);
  assert.match(registry.calls.find(c => c.startsWith('save ')), /redbox-portal-test.tar redbox-portal:runtime$/);
  const fork = run('publish', { CIRCLE_TAG: 'v5.0.0', CIRCLE_BRANCH: '', DOCKER_USER: '' });
  assert.equal(fork.status, 0, fork.stderr);
  assert.match(fork.calls.find(c => c.startsWith('save ')), /redbox-portal:test redbox-portal:runtime$/);
});
