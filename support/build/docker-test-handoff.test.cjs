const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const { createHash } = require('node:crypto');
const script = join(__dirname, 'docker-test-handoff.sh');
const id = `sha256:${'a'.repeat(64)}`;
const manifestId = `sha256:${'b'.repeat(64)}`;
const config = {
  architecture: 'amd64', os: 'linux',
  rootfs: { type: 'layers', diff_ids: [`sha256:${'c'.repeat(64)}`] },
  config: {
    Env: ['PATH=/usr/bin'], Cmd: ['node', 'app.js', ''], WorkingDir: '/opt/app',
    Labels: { empty: '' }, Volumes: { '/data': {} }, ExposedPorts: { '80/tcp': {} }, StopTimeout: 0,
  },
};
const configBytes = JSON.stringify(config);
const configDigest = `sha256:${createHash('sha256').update(configBytes).digest('hex')}`;
const inspected = {
  Id: configDigest, RepoTags: ['redbox-portal:test'], Os: 'linux', Architecture: 'amd64',
  RootFS: { Type: 'layers', Layers: config.rootfs.diff_ids }, Config: config.config,
};

function archiveFixture(tag = 'redbox-portal:test', configContent = configBytes) {
  const result = spawnSync('python3', ['-c', `
import io, json, sys, tarfile
with tarfile.open(fileobj=sys.stdout.buffer, mode='w|') as archive:
    for name, content in json.load(sys.stdin).items():
        data = content.encode()
        member = tarfile.TarInfo(name)
        member.size = len(data)
        archive.addfile(member, io.BytesIO(data))
`], { input: JSON.stringify({
    'manifest.json': JSON.stringify([{ Config: 'config.json', RepoTags: [tag], Layers: ['layer.tar'] }]),
    'config.json': configContent,
    'layer.tar': 'fixture layer bytes',
  }) });
  assert.equal(result.status, 0, result.stderr?.toString());
  return result.stdout;
}
const archive = archiveFixture();

function run(action, overrides = {}, metadata, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'test-handoff-'));
  const log = join(dir, 'calls');
  const file = join(dir, 'test-image.txt');
  const tar = join(dir, 'redbox-portal-test.tar');
  if (metadata !== undefined) writeFileSync(file, metadata);
  writeFileSync(join(dir, 'fixture.tar'), options.archive ?? archive);
  if (action === 'receive') writeFileSync(tar, options.archive ?? archive);
  writeFileSync(join(dir, 'docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$TEST_CALLS"
case "$1 $2" in
  'image inspect') printf '%s\\n' "$INSPECT_JSON" ;;
  'save -o') cp "$FIXTURE_ARCHIVE" "$3" ;;
esac
`, { mode: 0o755 });
  try {
    const result = spawnSync('bash', [script, action, dir], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_CALLS: log,
        FIXTURE_ARCHIVE: join(dir, 'fixture.tar'),
        INSPECT_JSON: JSON.stringify([options.image ?? inspected]),
        CIRCLE_BRANCH: 'chore/ci-build-speed', CIRCLE_TAG: '', ...overrides },
    });
    return { ...result, calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [],
      metadata: existsSync(file) ? readFileSync(file, 'utf8') : undefined,
      archive: existsSync(tar) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('branches save only test and verify the archive config, tag, rootfs and execution settings', () => {
  for (const overrides of [{}, { DOCKER_USER: '' }, { DOCKER_PASS: '' }, { CIRCLE_BRANCH: 'develop' }]) {
    const result = run('publish', overrides);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.metadata), {
      version: 1, config_digest: configDigest,
      archive_digest: `sha256:${createHash('sha256').update(archive).digest('hex')}`,
    });
    assert.equal(result.archive, true);
    assert.match(result.calls.find(c => c.startsWith('save ')), /redbox-portal-test.tar redbox-portal:test$/);
    assert.ok(result.calls.every(c => !/^(login|push|pull|manifest|buildx) /.test(c)));
    const received = run('receive', overrides, result.metadata);
    assert.equal(received.status, 0, received.stderr);
    assert.ok(received.calls.some(c => c.startsWith('load -i ')));
    assert.match(received.stdout, /Verified test tag, rootfs and execution configuration/);
  }
});

test('config and manifest image IDs can differ across stores in either direction', () => {
  for (const source of [configDigest, manifestId]) {
    const published = run('publish', {}, undefined, { image: { ...inspected, Id: source } });
    assert.equal(published.status, 0, published.stderr);
    for (const destination of [configDigest, manifestId]) {
      const received = run('receive', {}, published.metadata, {
        image: { ...inspected, Id: destination, Config: { ...inspected.Config, Hostname: '', Tty: false } },
      });
      assert.equal(received.status, 0, received.stderr);
    }
  }
});

test('corrupt archives and incorrect config digests fail before Docker load', () => {
  const published = run('publish');
  const metadata = JSON.parse(published.metadata);
  for (const [bytes, record] of [
    [Buffer.concat([archive, Buffer.from('changed')]), metadata],
    [archive, { ...metadata, config_digest: id }],
  ]) {
    const received = run('receive', {}, JSON.stringify(record), { archive: bytes });
    assert.notEqual(received.status, 0);
    assert.deepEqual(received.calls, []);
    assert.match(received.stderr, /checksum mismatch|config digest mismatch/);
  }
});

test('wrong loaded tags, platforms, layers and execution settings fail even with a matching ID', () => {
  const published = run('publish');
  for (const image of [
    { ...inspected, RepoTags: ['redbox-portal:runtime'] },
    { ...inspected, Id: 'invalid' },
    { ...inspected, Architecture: 'arm64' },
    { ...inspected, RootFS: { Type: 'layers', Layers: [id] } },
    { ...inspected, Config: { ...inspected.Config, Cmd: ['node', 'different.js'] } },
    { ...inspected, Config: { ...inspected.Config, Cmd: ['node', 'app.js'] } },
    { ...inspected, Config: { ...inspected.Config, Labels: {} } },
    { ...inspected, Config: { ...inspected.Config, Volumes: {} } },
    { ...inspected, Config: { ...inspected.Config, ExposedPorts: {} } },
    { ...inspected, Config: { ...inspected.Config, StopTimeout: null } },
  ]) {
    const received = run('receive', {}, published.metadata, { image });
    assert.notEqual(received.status, 0, JSON.stringify(image));
    assert.ok(received.calls.some(c => c.startsWith('load -i ')));
  }
});

test('producer rejects archives for another tag or config instead of recording their checksums', () => {
  for (const bytes of [archiveFixture('redbox-portal:runtime'),
    archiveFixture('redbox-portal:test', JSON.stringify({ ...config, config: { Cmd: ['wrong'] } }))]) {
    const result = run('publish', {}, 'stale metadata', { archive: bytes });
    assert.notEqual(result.status, 0);
    assert.equal(result.metadata, undefined);
  }
});

test('malformed/missing metadata fails before Docker, and failed producers remove stale metadata', () => {
  for (const metadata of [undefined, '', 'invalid\n', `${id}\nextra\n`, `$(touch /tmp/unsafe)\n`, '{}', '[]',
    JSON.stringify({ version: 1, archive_digest: id, config_digest: 'invalid' })]) {
    const result = run('receive', {}, metadata);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.calls, []);
  }
  const failed = run('publish', {}, 'stale metadata', { image: { ...inspected, Id: 'invalid' } });
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
