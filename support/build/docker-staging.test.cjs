const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const script = join(__dirname, 'docker-staging.sh');
const sha = 'a'.repeat(40);
const layer = `sha256:${'1'.repeat(64)}`;
const testLayer = `sha256:${'2'.repeat(64)}`;
const testedId = `sha256:${'c'.repeat(64)}`;
const manifestDigest = `sha256:${'d'.repeat(64)}`;
const pinned = `example/portal@${manifestDigest}`;
const pipeline = '12345678-1234-1234-1234-123456789abc';
const staging = (variant, arch, commit = sha, run = pipeline) =>
  `example/portal:ci-staging-${commit}-${variant}-${arch}-${run}`;

function run(args, overrides = {}, scriptPath = script) {
  const directory = mkdtempSync(join(tmpdir(), 'docker-staging-'));
  const log = join(directory, 'calls');
  writeFileSync(join(directory, 'docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_TEST_LOG"
if [[ "$1" == login ]]; then cat >/dev/null; fi
if [[ "$1 $2" == 'image inspect' ]]; then
  if [[ "$*" == *'{{.Id}}'* ]]; then echo '${testedId}'
  elif [[ "$*" == *redbox-portal:runtime* ]]; then printf '%s\\n' '{"RootFS":{"Layers":["${layer}"]}}'
  else printf '%s\\n' '{"RootFS":{"Layers":["${layer}","${testLayer}"]}}'; fi
fi
if [[ "$1" == push ]]; then touch "$DOCKER_TEST_LOG.pushed"; fi
if [[ "$1 $2" == 'manifest inspect' ]]; then
  if [[ "\${FAIL_PREFLIGHT:-}" == 1 ]]; then echo 'registry connection failed' >&2; exit 1; fi
  if [[ "\${EXISTING_STAGE:-}" == 1 || -f "$DOCKER_TEST_LOG.pushed" ]]; then
    printf '{"config":{"digest":"%s"}}\\n' "\${STAGED_ID:-${testedId}}"
    exit 0
  fi
  echo 'no such manifest' >&2
  exit 1
fi
if [[ "$*" == *'imagetools inspect'* && "\${FAIL_INSPECT:-}" == 1 ]]; then exit 1; fi
if [[ "$*" == *'imagetools inspect --format {{json .Image}}'* ]]; then
  printf '{"rootfs":{"diff_ids":%s}}\\n' "\${STAGED_LAYERS:-[\\\"${layer}\\\"]}"
  exit 0
fi
if [[ "$*" == *'imagetools inspect --format'* ]]; then
  printf '{"digest":"%s"}\\n' "\${MANIFEST_DIGEST:-${manifestDigest}}"
fi
if [[ "$*" == *'imagetools inspect --raw'* ]]; then
  printf '{"config":{"digest":"%s"}}\\n' '${testedId}'
fi
if [[ "$*" == *'imagetools create'* && "\${FAIL_CREATE_ONCE:-}" == 1 && ! -f "$DOCKER_TEST_LOG.failed" ]]; then
  touch "$DOCKER_TEST_LOG.failed"
  exit 1
fi
`, { mode: 0o755 });
  try {
    const result = spawnSync('bash', [scriptPath, ...args], {
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
    ['runtime', 'arm64', 'runtime'],
    ['pdfgen', 'amd64', 'runtime_pdfgen'], ['pdfgen', 'arm64', 'runtime_pdfgen'],
  ]) {
    const result = run(['build', variant, arch]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.calls.includes('buildx create --name ci-cache --driver docker-container --use'));
    const build = result.calls.find(call => call.startsWith('buildx build '));
    assert.ok(build.includes(`--platform linux/${arch} --target ${target}`));
    assert.ok(build.includes(`--tag ${staging(variant, arch)} --push .`));
    assert.match(build, /--cache-from type=registry,ref=example\/portal:buildcache-v1-chore-ci-build-speed-[a-f0-9]{12}-/);
    assert.ok(build.includes('--cache-to type=registry,mode=max'));
    assert.ok(build.includes(`--cache-from type=registry,ref=example/portal:buildcache-v1-develop-`));
  }
});

test('reruns reuse existing staging images, and uncertain registry failures cannot overwrite tags', () => {
  const existing = run(['build', 'pdfgen', 'amd64'], { EXISTING_STAGE: '1' });
  assert.equal(existing.status, 0, existing.stderr);
  assert.deepEqual(existing.calls, [
    'login --username test-user --password-stdin',
    `manifest inspect ${staging('pdfgen', 'amd64')}`,
  ]);
  assert.match(existing.stdout, /Reusing existing staging image/);
  const failure = run(['build', 'pdfgen', 'amd64'], { FAIL_PREFLIGHT: '1' });
  assert.notEqual(failure.status, 0);
  assert.ok(failure.calls.every(call => !call.startsWith('build ') && !call.startsWith('push ')));
});

test('staging tags isolate commits and separate pipelines of the same commit', () => {
  const otherSha = 'b'.repeat(40);
  const otherPipeline = '87654321-1234-1234-1234-123456789abc';
  const first = run(['build', 'pdfgen', 'amd64']);
  const second = run(['build', 'pdfgen', 'amd64'], { CIRCLE_SHA1: otherSha });
  const third = run(['build', 'pdfgen', 'amd64'], { STAGING_RUN_ID: otherPipeline });
  assert.notEqual(first.calls.at(-1), second.calls.at(-1));
  assert.notEqual(first.calls.at(-1), third.calls.at(-1));
  assert.ok(third.calls.at(-1).includes(`--tag ${staging('pdfgen', 'amd64', sha, otherPipeline)} --push .`));
  assert.ok(staging('runtime', 'amd64').split(':')[1].length <= 128);
});

test('dry runs verify staging images and print exact promotion commands without writes', () => {
  for (const variant of ['runtime', 'pdfgen']) {
    const suffix = variant === 'pdfgen' ? '-pdfgen' : '';
    for (const arch of ['amd64', 'arm64']) {
      const result = run(['promote', variant, arch]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /DRY RUN/);
      assert.ok(result.stdout.includes(`docker buildx imagetools create --prefer-index=false --tag example/portal:chore-ci-build-speed${suffix}-${arch} ${pinned}`));
      assert.ok(result.calls.includes(`buildx imagetools inspect ${staging(variant, arch)}`));
      assert.ok(result.calls.includes(`buildx imagetools inspect --format {{json .Manifest}} ${staging(variant, arch)}`));
      assert.ok(result.calls.every(call => !call.includes('imagetools create')));
    }
    const manifest = run(['manifest', variant]);
    assert.equal(manifest.status, 0, manifest.stderr);
    assert.ok(manifest.stdout.includes(`docker buildx imagetools create --tag example/portal:chore-ci-build-speed${suffix} ${pinned} ${pinned}`));
    assert.ok(manifest.calls.includes(`buildx imagetools inspect --format {{json .Manifest}} ${staging(variant, 'arm64')}`));
    assert.ok(manifest.calls.every(call => !call.includes('imagetools create')));
  }
});

test('release branches promote to existing tags and assemble manifests from staging only', () => {
  for (const [branch, tag] of [['master', 'master'], ['develop', 'develop'], ['support/5.x', 'support-5.x']]) {
    for (const variant of ['runtime', 'pdfgen']) {
      const suffix = variant === 'pdfgen' ? '-pdfgen' : '';
      const image = run(['promote', variant, 'amd64'], { CIRCLE_BRANCH: branch });
      assert.equal(image.status, 0, image.stderr);
      assert.equal(image.calls.at(-1), `buildx imagetools create --prefer-index=false --tag example/portal:${tag}${suffix}-amd64 ${pinned}`);
      const manifest = run(['manifest', variant], { CIRCLE_BRANCH: branch });
      assert.equal(manifest.status, 0, manifest.stderr);
      assert.equal(manifest.calls.at(-1), `buildx imagetools create --tag example/portal:${tag}${suffix} ${pinned} ${pinned}`);
    }
  }
});

test('invalid identifiers and parameters fail before contacting Docker', () => {
  for (const overrides of [{ CIRCLE_SHA1: '' }, { CIRCLE_SHA1: 'abc' }, { STAGING_RUN_ID: '' }, { STAGING_RUN_ID: 'bad/tag' }]) {
    const result = run(['build', 'pdfgen', 'amd64'], overrides);
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

test('staging pushes runtime and verifies the digest-pinned registry layer prefix', () => {
  const result = run(['stage-tested', 'runtime', 'amd64']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.calls.includes(`tag redbox-portal:runtime ${staging('runtime', 'amd64')}`));
  assert.ok(result.calls.includes(`push ${staging('runtime', 'amd64')}`));
  assert.ok(result.calls.includes(`buildx imagetools inspect --format {{json .Image}} ${pinned}`));
  assert.match(result.stdout, /Verified runtime rootfs prefix: 1 of 2 tested layers/);
  const rebuilt = run(['build', 'runtime', 'amd64']);
  assert.notEqual(rebuilt.status, 0);
  assert.deepEqual(rebuilt.calls, []);
});

test('staging reruns reject unrelated, reordered, equal, longer, empty or malformed layers without overwriting tags', () => {
  for (const layers of [[], ['invalid'], [testLayer], [testLayer, layer], [layer, testLayer], [layer, testLayer, layer], null]) {
    const mismatch = run(['stage-tested', 'runtime', 'amd64'], { EXISTING_STAGE: '1', STAGED_LAYERS: JSON.stringify(layers) });
    assert.notEqual(mismatch.status, 0, JSON.stringify(layers));
    assert.ok(mismatch.calls.every(call => !call.startsWith('tag ') && !call.startsWith('push ')));
  }
  const reused = run(['stage-tested', 'runtime', 'amd64'], { EXISTING_STAGE: '1' });
  assert.equal(reused.status, 0, reused.stderr);
  assert.ok(reused.calls.every(call => !call.startsWith('tag ') && !call.startsWith('push ')));
  const uncertain = run(['stage-tested', 'runtime', 'amd64'], { FAIL_PREFLIGHT: '1' });
  assert.notEqual(uncertain.status, 0);
  assert.ok(uncertain.calls.every(call => !call.startsWith('tag ') && !call.startsWith('push ')));
  for (const overrides of [{ STAGED_LAYERS: JSON.stringify([testLayer]) }, { MANIFEST_DIGEST: 'invalid' }, { FAIL_INSPECT: '1' }]) {
    assert.notEqual(run(['stage-tested', 'runtime', 'amd64'], overrides).status, 0);
  }
});

test('builds without either Docker credential skip staging so forks can test', () => {
  for (const credentials of [{ DOCKER_USER: '', DOCKER_PASS: '' }, { DOCKER_USER: '' }, { DOCKER_PASS: '' }]) {
    const result = run(['stage-tested', 'runtime', 'amd64'], credentials);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Skipping tested-image staging push/);
    assert.deepEqual(result.calls, []);
  }
});

test('release branches fail tested-image staging without credentials instead of skipping verification', () => {
  for (const branch of ['develop', 'master', 'support/5.x']) {
    const result = run(['stage-tested', 'runtime', 'amd64'], { CIRCLE_BRANCH: branch, DOCKER_USER: '', DOCKER_PASS: '' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /required to stage the tested image on release branches/);
    assert.doesNotMatch(result.stdout, /Skipping tested-image staging push/);
    assert.deepEqual(result.calls, []);
  }
});

test('credential-free dry runs inspect anonymously and print commands; writes still require credentials', () => {
  for (const args of [['promote', 'runtime', 'amd64'], ['manifest', 'runtime'], ['promote', 'pdfgen', 'arm64']]) {
    const result = run(args, { DOCKER_USER: '', DOCKER_PASS: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /inspecting public staging images anonymously/);
    assert.ok(result.stdout.includes('docker buildx imagetools create'));
    assert.ok(result.calls.every(call => !call.startsWith('login ') && !call.includes('imagetools create')));
    const missing = run(args, { DOCKER_USER: '', DOCKER_PASS: '', FAIL_INSPECT: '1' });
    assert.notEqual(missing.status, 0);
    const write = run(args, { DOCKER_USER: '', DOCKER_PASS: '', CIRCLE_BRANCH: 'develop' });
    assert.notEqual(write.status, 0);
    assert.deepEqual(write.calls, []);
  }
});

test('invalid registry digests fail before a promotion command can be written', () => {
  const result = run(['promote', 'runtime', 'amd64'], { CIRCLE_BRANCH: 'develop', MANIFEST_DIGEST: 'invalid' });
  assert.notEqual(result.status, 0);
  assert.ok(result.calls.every(call => !call.includes('imagetools create')));
});

test('workflow stages the saved test image and removes the independent runtime amd64 build', () => {
  const config = readFileSync(join(__dirname, '../../.circleci/config.yml'), 'utf8');
  const build = config.split('  generate-api-docs:')[0];
  assert.match(build, /STAGING_RUN_ID: << pipeline.id >>/);
  assert.ok(build.indexOf('docker-staging.sh stage-tested runtime amd64') < build.indexOf('docker save -o'));
  assert.match(build, /docker save -o \/tmp\/docker-images\/redbox-portal-test.tar redbox-portal:test redbox-portal:runtime/);
  assert.match(build, /persist_to_workspace:/);
  assert.doesNotMatch(config, /stage-runtime-amd64/);
  assert.match(build, /stage_tested_image:\n        type: boolean\n        default: false/);
  assert.match(build, /condition: << parameters.stage_tested_image >>/);
  assert.equal((config.match(/stage_tested_image: true/g) || []).length, 1);
  const automatic = config.split('  build_test_gendocs_and_deploy:')[1].split('  build_test_dependabot:')[0];
  assert.match(automatic, /- build:\n          stage_tested_image: true/);
  const release = config.split('  release_build_test_gendocs_and_deploy:')[1];
  assert.doesNotMatch(release, /stage_tested_image: true/);
});

test('tag releases publish saved runtime; manual releases keep their runtime target', () => {
  const config = readFileSync(join(__dirname, '../../.circleci/config.yml'), 'utf8');
  assert.match(config, /docker tag redbox-portal:runtime "\$\{REPO\}:\$\{DEPLOY_TAG\}-amd64"/);
  assert.doesNotMatch(config, /docker tag redbox-portal:test/);
  assert.match(config, /docker-publish-amd64-variant.sh runtime ""/);
});

test('Buildx uses one Bake graph, isolated branch cache writes, develop fallback and read-only operation without credentials', () => {
  const ciBuild = join(__dirname, 'docker-build-ci.sh');
  const normal = run([], {}, ciBuild);
  assert.equal(normal.status, 0, normal.stderr);
  assert.equal(normal.calls.filter(call => call.startsWith('buildx bake ')).length, 1);
  assert.ok(normal.calls.includes('buildx create --name ci-cache --driver docker-container --use'));
  assert.match(normal.calls.at(-1), /test.cache-to=type=registry,mode=max/);
  for (const credentials of [{ DOCKER_USER: '' }, { DOCKER_PASS: '' }]) {
    const readonly = run([], credentials, ciBuild);
    assert.equal(readonly.status, 0, readonly.stderr);
    assert.ok(readonly.calls.every(call => !call.startsWith('login ')));
    assert.match(readonly.calls.at(-1), /cache-from/);
    assert.doesNotMatch(readonly.calls.at(-1), /cache-to/);
  }
  const weird = run([], { CIRCLE_BRANCH: 'Feature/Foo:bar with spaces?' }, ciBuild);
  const collision = run([], { CIRCLE_BRANCH: 'Feature-Foo-bar-with-spaces' }, ciBuild);
  assert.match(weird.calls.at(-1), /buildcache-v1-feature-foo-bar-with-spaces-[a-f0-9]{12}-amd64/);
  assert.notEqual(weird.calls.at(-1), collision.calls.at(-1));
  const develop = run([], { CIRCLE_BRANCH: 'develop' }, ciBuild);
  assert.equal((develop.calls.at(-1).match(/cache-from/g) || []).length, 1);
});
