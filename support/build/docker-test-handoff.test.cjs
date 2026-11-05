const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const script = join(__dirname, 'docker-test-handoff.sh');
const id = `sha256:${'a'.repeat(64)}`;
const sha = 'c'.repeat(40);
const pipeline = '12345678-1234-1234-1234-123456789abc';

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
  'save -o') touch "$3" ;;
esac
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

test('all branches save only test regardless of credentials, and verify the loaded identity', () => {
  for (const overrides of [{}, { DOCKER_USER: '' }, { DOCKER_PASS: '' }, { CIRCLE_BRANCH: 'develop' }]) {
    const result = run('publish', overrides);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.metadata, `${id}\n`);
    assert.equal(result.archive, true);
    assert.match(result.calls.find(c => c.startsWith('save ')), /redbox-portal-test.tar redbox-portal:test$/);
    assert.ok(result.calls.every(c => !/^(login|push|pull|manifest|buildx) /.test(c)));
    const received = run('receive', overrides, result.metadata);
    assert.equal(received.status, 0, received.stderr);
    assert.ok(received.calls.some(c => c.startsWith('load -i ')));
    assert.notEqual(run('receive', { ...overrides, PULLED_ID: 'invalid' }, result.metadata).status, 0);
  }
});

test('malformed/missing metadata fails before Docker, and failed producers remove stale metadata', () => {
  for (const metadata of [undefined, '', 'invalid\n', `${id}\nextra\n`, `$(touch /tmp/unsafe)\n`]) {
    const result = run('receive', {}, metadata);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.calls, []);
  }
  const failed = run('publish', { PULLED_ID: 'invalid' }, 'stale metadata');
  assert.notEqual(failed.status, 0);
  assert.equal(failed.metadata, undefined);
});

test('v tags retain test and pristine runtime for legacy deployment', () => {
  const result = run('publish', { CIRCLE_TAG: 'v5.0.0', CIRCLE_BRANCH: '' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.calls.find(c => c.startsWith('save ')), /redbox-portal:test redbox-portal:runtime$/);
});

test('decoupled jobs retain workflow filters and only image consumers wait for build', () => {
  const config = readFileSync(join(__dirname, '../../.circleci/config.yml'), 'utf8');
  const independent = ['generate-api-docs', 'test-angular', 'test-sails-ng-common', 'test-redbox-core',
    'test-agenda-sqs-backend', 'test-rva-registry', 'test-redbox-dev-tools-cli', 'test-storage-mongo'];
  for (const [workflow, end, filter] of [
    ['build_test_gendocs_and_deploy', 'build_test_dependabot', 'normalBranchFilters'],
    ['build_test_dependabot', 'release_build_test_gendocs_and_deploy', 'dependabotFilters'],
  ]) {
    const body = config.split(`  ${workflow}:`)[1].split(`  ${end}:`)[0];
    for (const name of independent) {
      const job = body.match(new RegExp(`^      - ${name}:\\n([\\s\\S]*?)(?=^      - |$(?![\\s\\S]))`, 'm'))?.[1];
      assert.ok(job, `${workflow}/${name}`);
      assert.ok(job.includes(`filters: *${filter}`), `${workflow}/${name} filter`);
      assert.doesNotMatch(job, /^            - build$/m);
      if (filter === 'dependabotFilters') assert.match(job, /- refresh-dependabot-package-locks/);
    }
    for (const name of ['test-mocha', 'test-playwright', 'test-bruno-general', 'test-bruno-oidc', 'test-bruno-s3']) {
      assert.ok(body.includes(`      - ${name}:\n          requires:\n            - build\n`));
    }
  }
});

test('all automatic Docker release gates include every test and docs; manual publication retains its human gate', () => {
  const config = readFileSync(join(__dirname, '../../.circleci/config.yml'), 'utf8');
  for (const [workflow, end] of [
    ['build_test_gendocs_and_deploy', 'build_test_dependabot'],
    ['build_test_dependabot', 'release_build_test_gendocs_and_deploy'],
    ['release_build_test_gendocs_and_deploy', 'docker_manual_publish'],
  ]) {
    const body = config.split(`  ${workflow}:`)[1].split(`  ${end}:`)[0];
    const tests = [...body.matchAll(/^      - (test-[^:]+):/gm)].map(match => match[1]);
    const entries = body.split(/^      - (?=\S)/m).slice(1);
    const deploys = entries.map(entry => ({
      entry,
      key: entry.match(/^([^:\n]+):/)[1],
      name: entry.match(/^\s+name: (\S+)/m)?.[1],
    })).filter(({ key, name }) => key.startsWith('deploy') || name?.startsWith('deploy'));
    assert.ok(deploys.length > 0, `${workflow} has deploy gates`);
    for (const { entry, key, name } of deploys) {
      for (const required of [...tests, 'generate-api-docs']) {
        assert.ok(entry.includes(`            - ${required}\n`), `${workflow}/${name ?? key} needs ${required}`);
      }
    }
  }
  const manual = config.split('  docker_manual_publish:')[1].split('  npm_beta_publish:')[0];
  assert.doesNotMatch(manual, /test-|generate-api-docs|            - build/);
  assert.match(manual, /- publish-runtime-amd64\n            - publish-runtime-arm64/);
  assert.match(manual, /- publish-runtime-pdfgen-amd64\n            - publish-runtime-pdfgen-arm64/);
});
