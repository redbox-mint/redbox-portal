'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { gzipSync, gunzipSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { prepare, verify, planPromotion, promote, sha256, json, TARGETS, PLATFORMS } = require('./candidates.cjs');
const { DockerAdapter, GitAdapter, RegistryAdapter, assetEvidenceScript } = require('./adapters.cjs');
const { main } = require('./cli.cjs');

const source = 'a'.repeat(40);
const initialIdentity = { revision: source, pipeline: 100, workflow: 'workflow-100', attempt: 1 };
const toolchain = { node: '26.12.1', npm: '11.6.2', typescript: '5.9.3' };

class FakeDocker {
  constructor() { this.platform = 'linux/amd64'; this.images = new Map(); this.events = []; this.assetSha256 = sha256('web assets'); }
  async nativePlatform() { return this.platform; }
  async createBuilder(builder) { this.events.push(['createBuilder', builder]); }
  async removeBuilder(builder) { this.events.push(['removeBuilder', builder]); }
  async versions() { return { docker: 'fake-docker', buildx: 'fake-buildx' }; }
  async build(options) {
    this.events.push(['build', options]);
    if (this.failBuild) throw new Error('build failed');
    const info = { id: sha256(json(options.labels) + options.platform), platform: options.platform, labels: options.labels };
    this.images.set(options.reference, info);
    this.images.set(info.id, info);
  }
  async inspect(reference) {
    const info = structuredClone(this.images.get(reference));
    if (this.badInspect && reference.startsWith('sha256:')) return this.badInspect(info);
    return info;
  }
  async evidence() { return { node: toolchain.node, assetSha256: this.assetSha256, assetFiles: 5 }; }
  async save(ids, file, compression) {
    this.events.push(['save', ids]);
    const data = Buffer.from(json(ids.map(id => this.images.get(id))));
    await fs.writeFile(file, compression === 'gzip' ? gzipSync(data) : data, { flag: 'wx' });
  }
  async load(file, compression) {
    this.events.push(['load']);
    if (this.failLoad) throw new Error('load failed');
    const data = await fs.readFile(file);
    for (const info of JSON.parse((compression === 'gzip' ? gunzipSync(data) : data).toString())) this.images.set(info.id, info);
  }
}
class FakeGit {
  constructor(revision = source) { this.head = revision; this.isClean = true; }
  async revision() { return this.head; }
  async refRevision() { return this.head; }
  async clean() { return this.isClean; }
}
class FakeRegistry {
  constructor() { this.events = []; this.tags = new Map(); }
  async push(id, reference) {
    this.events.push(['push', reference]);
    if (this.failPush) throw new Error('push failed');
    return { digest: sha256(`manifest:${id}`), configDigest: this.badConfig ? sha256('wrong image') : id };
  }
  async createIndex(reference, sources) {
    this.events.push(['createIndex', reference, sources]);
    if (this.failIndex) throw new Error('index failed');
    return { digest: sha256(json(sources)), sources: sources.map(({ platform, digest }) => ({
      platform, digest: this.badPair ? sha256('foreign workflow') : digest,
    })) };
  }
  async pointTag(destination, sourceRef) {
    this.events.push(['pointTag', destination, sourceRef]);
    this.tags.set(destination, sourceRef);
    return sourceRef.split('@')[1];
  }
}
// A deterministic in-memory exclusive coordinator exercises the REQUIRED external contract.
// It is not shipped as a distributed lock implementation.
class FakeCoordinator {
  constructor() { this.pending = Promise.resolve(); this.reservations = new Map(); this.receipts = []; }
  async withExclusive(key, callback) {
    const previous = this.pending;
    let release;
    this.pending = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      return await callback({
        assertHeld: async () => { if (this.lost) throw new Error('exclusive ownership lost'); },
        reserve: async reservation => {
          for (const destination of reservation.destinations) {
            const last = this.reservations.get(`${key}:${destination}`);
            const next = reservation.identity;
            if (last) {
              const old = last.identity;
              if (next.pipeline < old.pipeline || next.pipeline === old.pipeline && next.attempt < old.attempt) throw new Error('stale promotion');
              if (next.pipeline === old.pipeline && next.attempt === old.attempt && last.fingerprint !== reservation.fingerprint) throw new Error('attempt fingerprint changed');
            }
          }
          for (const destination of reservation.destinations) this.reservations.set(`${key}:${destination}`, reservation);
        },
        complete: async receipt => { this.receipts.push(receipt); },
      });
    } finally { release(); }
  }
}

async function fixture(t, id = initialIdentity) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-candidates-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const docker = new FakeDocker();
  const git = new FakeGit(id.revision);
  const candidates = [];
  for (const platform of PLATFORMS) {
    docker.platform = platform;
    const result = await prepare({ identity: id, platform, toolchain, root: path.join(temp, 'workspace'),
      context: path.join(temp, 'source') }, { docker, git });
    candidates.push({ ...result, platform });
  }
  const policy = { identity: id, mode: 'branch', gitRef: 'refs/heads/develop', repository: 'example.invalid/team/portal',
    tags: { runtime: 'develop', runtime_pdfgen: 'develop-pdfgen' }, requiredChecks: ['playwright', 'native-amd64', 'native-arm64', 'pdf-smoke', 'docs'] };
  const gate = { schemaVersion: 1, status: 'success', identity: id, policySha256: sha256(json(policy)),
    checks: Object.fromEntries(policy.requiredChecks.map(name => [name, 'success'])),
    candidates: Object.fromEntries(candidates.map(item => [item.platform, item.catalogSha256])) };
  const options = { candidates, policy, gate };
  const registry = new FakeRegistry();
  const coordinator = new FakeCoordinator();
  const adapters = { docker, git, registry, coordinator, authorize: async () => true };
  return { temp, docker, git, candidates, options, adapters, registry, coordinator };
}

test('one native builder per architecture, both targets, one deduplicated archive, and immutable attempt paths', async t => {
  const f = await fixture(t);
  const builds = f.docker.events.filter(([event]) => event === 'build').map(([, options]) => options);
  assert.equal(builds.length, 4);
  assert.equal(builds[0].builder, builds[1].builder);
  assert.equal(builds[2].builder, builds[3].builder);
  assert.notEqual(builds[0].builder, builds[2].builder);
  assert.deepEqual(builds.map(item => item.target), [...TARGETS, ...TARGETS]);
  assert.equal(f.docker.events.filter(([event]) => event === 'save').length, 2);
  for (const candidate of f.candidates) {
    assert.match(candidate.directory, /[a-f0-9]{40}\/100\/workflow-100\/1\/(amd64|arm64)$/);
    const result = await verify({ ...candidate, identity: initialIdentity, load: true }, f.adapters);
    assert.equal(result.entries.length, 2);
    assert.equal(result.catalog.archive.bytes, candidate.archiveBytes);
    assert.deepEqual(result.entries[0].tools.declared, toolchain);
    assert.ok(result.catalog.timings.archiveAndHashMs >= 0);
  }
  f.docker.platform = 'linux/amd64';
  await assert.rejects(prepare({ identity: initialIdentity, platform: 'linux/amd64', toolchain,
    root: path.join(f.temp, 'workspace'), context: path.join(f.temp, 'source') }, f.adapters), /EEXIST/);
  assert.equal(f.registry.events.length, 0);
});

test('preparation fails on dirty, wrong revision, non-native context and cleans up failed builder', async t => {
  const f = await fixture(t);
  const options = { identity: initialIdentity, platform: 'linux/amd64', toolchain,
    root: path.join(f.temp, 'other'), context: path.join(f.temp, 'source') };
  f.git.isClean = false;
  await assert.rejects(prepare(options, f.adapters), /changes/);
  f.git.isClean = true;
  f.git.head = 'b'.repeat(40);
  await assert.rejects(prepare(options, f.adapters), /revision mismatch/);
  f.git.head = source;
  await assert.rejects(prepare(options, f.adapters), /not the requested native/);
  f.docker.platform = 'linux/amd64';
  f.docker.failBuild = true;
  await assert.rejects(prepare(options, f.adapters), /build failed/);
  assert.equal(f.docker.events.at(-1)[0], 'removeBuilder');
  assert.equal(f.registry.events.length, 0);
});

test('missing assets or wrong declared runtime version prevent a completed candidate', async t => {
  const f = await fixture(t);
  f.docker.platform = 'linux/amd64';
  const options = { identity: initialIdentity, platform: 'linux/amd64', toolchain,
    root: path.join(f.temp, 'missing-assets'), context: path.join(f.temp, 'source') };
  f.docker.evidence = async () => ({ node: toolchain.node, assetSha256: sha256('empty'), assetFiles: 0 });
  await assert.rejects(prepare(options, f.adapters), /assets are missing/);
  f.docker.evidence = async () => ({ node: '20.0.0', assetSha256: sha256('web'), assetFiles: 1 });
  await assert.rejects(prepare({ ...options, root: path.join(f.temp, 'wrong-node') }, f.adapters), /Node version/);
  assert.equal(f.registry.events.length, 0);
});

test('uncompressed bundles are supported and source changes during preparation fail', async t => {
  const f = await fixture(t);
  f.docker.platform = 'linux/amd64';
  const options = { identity: initialIdentity, platform: 'linux/amd64', toolchain, compression: 'none',
    root: path.join(f.temp, 'uncompressed'), context: path.join(f.temp, 'source') };
  const result = await prepare(options, f.adapters);
  const verified = await verify({ ...result, identity: initialIdentity, platform: 'linux/amd64', load: true }, f.adapters);
  assert.equal(verified.catalog.archive.file, 'images.tar');
  const original = f.docker.build.bind(f.docker);
  f.docker.build = async input => { await original(input); f.git.isClean = false; };
  await assert.rejects(prepare({ ...options, root: path.join(f.temp, 'changed') }, f.adapters), /changed during build/);
});

test('archive corruption is rejected before docker load or any registry operation', async t => {
  const f = await fixture(t);
  const archive = path.join(f.candidates[0].directory, 'images.tar.gz');
  const bytes = await fs.readFile(archive);
  bytes[4] ^= 1;
  await fs.writeFile(archive, bytes);
  await assert.rejects(promote(f.options, f.adapters), /archive checksum/);
  assert.equal(f.docker.events.filter(([event]) => event === 'load').length, 0);
  assert.equal(f.registry.events.length, 0);
});

test('target metadata, catalog tampering and checksum inventory tampering are rejected', async t => {
  for (const file of ['runtime/metadata.json', 'candidate.json', 'checksums.sha256']) {
    const f = await fixture(t);
    const pathname = path.join(f.candidates[0].directory, file);
    await fs.chmod(pathname, 0o644); // Deliberately bypass the read-only artifact mode.
    await fs.appendFile(pathname, ' ');
    await assert.rejects(planPromotion(f.options), /checksum/);
  }
});

test('trusted hash is required; wrong revision/platform/target and asset identity fail closed', async t => {
  const f = await fixture(t);
  const options = { ...f.candidates[0], identity: initialIdentity };
  await assert.rejects(verify({ ...options, catalogSha256: undefined }), /trusted catalogSha256/);
  await assert.rejects(verify({ ...options, identity: { ...initialIdentity, revision: 'b'.repeat(40) } }), /revision/);
  await assert.rejects(verify({ ...options, platform: 'linux/arm64' }), /platform mismatch/);
  await assert.rejects(verify({ ...options, assetSha256: sha256('wrong assets') }), /expected assets/);
  for (const modify of [info => ({ ...info, id: sha256('wrong image') }),
    info => ({ ...info, platform: 'linux/arm64' }), info => ({ ...info, labels: { ...info.labels, 'org.redbox.ci.target': 'test' } })]) {
    f.docker.badInspect = modify;
    await assert.rejects(verify({ ...options, load: true }, f.adapters), /image|platform|target/);
  }
});

test('incomplete candidate, duplicate architecture and different workflow pairs cannot promote', async t => {
  const f = await fixture(t);
  await assert.rejects(planPromotion({ ...f.options, candidates: [f.candidates[0], f.candidates[0]] }), /pair required/);
  const other = await fixture(t, { ...initialIdentity, workflow: 'different-workflow' });
  const mixed = { ...f.options, candidates: [f.candidates[0], other.candidates[1]], gate: {
    ...f.options.gate, candidates: { ...f.options.gate.candidates, 'linux/arm64': other.candidates[1].catalogSha256 },
  } };
  await assert.rejects(planPromotion(mixed), /workflow/);
  await fs.unlink(path.join(f.candidates[0].directory, 'complete'));
  await assert.rejects(promote(f.options, f.adapters), /ENOENT/);
  assert.equal(f.registry.events.length, 0);
});

test('coerced or duplicate destination tags cannot promote', async t => {
  const f = await fixture(t);
  for (const tags of [{ runtime: ['develop'], runtime_pdfgen: ['develop'] },
    { runtime: 'develop', runtime_pdfgen: 'develop' }]) {
    await assert.rejects(planPromotion({ ...f.options, policy: { ...f.options.policy, tags } }), /destination tags/);
  }
  assert.equal(f.registry.events.length, 0);
});

test('failed, missing or unauthorized validation gates do not write release OR candidate tags', async t => {
  const f = await fixture(t);
  for (const gate of [null, { ...f.options.gate, status: 'failed' },
    { ...f.options.gate, checks: { ...f.options.gate.checks, playwright: 'failed' } },
    { ...f.options.gate, checks: {} }, { ...f.options.gate, candidates: {} },
    { ...f.options.gate, policySha256: sha256('different release tags') }]) {
    await assert.rejects(promote({ ...f.options, gate }, f.adapters), /gate|validation/);
  }
  await assert.rejects(promote(f.options, { ...f.adapters, authorize: async () => false }), /authorization rejected/);
  await assert.rejects(promote(f.options, { ...f.adapters, authorize: undefined }), /authorization adapter/);
  await assert.rejects(promote(f.options, { ...f.adapters, coordinator: undefined }), /exclusive/);
  assert.equal(f.registry.events.length, 0);
});

test('load failures and moved branch or release refs stop all publishing', async t => {
  const f = await fixture(t);
  f.docker.failLoad = true;
  await assert.rejects(promote(f.options, f.adapters), /load failed/);
  f.docker.failLoad = false;
  f.git.head = 'b'.repeat(40);
  await assert.rejects(promote(f.options, f.adapters), /superseded/);
  assert.equal(f.registry.events.length, 0);
});

test('successful promotion loads all images, never builds, pins architecture manifests by registry digest', async t => {
  const f = await fixture(t);
  const priorBuilds = f.docker.events.filter(([event]) => event === 'build').length;
  const plan = await planPromotion(f.options);
  assert.equal(f.registry.events.length, 0);
  assert.equal(plan.candidateTags.length, 4);
  assert.ok(plan.candidateTags.every(item => item.reference.includes(':ci-')));
  const receipt = await promote(f.options, f.adapters);
  assert.equal(f.docker.events.filter(([event]) => event === 'build').length, priorBuilds);
  assert.equal(f.docker.events.filter(([event]) => event === 'load').length, 2);
  assert.deepEqual(f.registry.events.map(([event]) => event), ['push', 'push', 'push', 'push', 'createIndex', 'createIndex', 'pointTag', 'pointTag']);
  assert.equal(receipt.images.length, 4);
  for (const manifest of receipt.manifests) {
    assert.deepEqual(manifest.sources.map(item => item.platform).sort(), PLATFORMS);
    assert.ok(manifest.sources.every(item => /@sha256:[a-f0-9]{64}$/.test(item.reference)));
    assert.equal(f.registry.tags.get(manifest.destination), `${f.options.policy.repository}@${manifest.digest}`);
  }
  assert.notEqual(receipt.images[0].imageId, receipt.images[0].manifestDigest);
  assert.equal(f.coordinator.receipts.length, 1);
});

test('concrete durable coordinator plugs into promotion without external services', async t => {
  const f = await fixture(t);
  const { FilesystemCoordinator } = require('./coordinator.cjs');
  f.adapters.coordinator = new FilesystemCoordinator({ root: path.join(f.temp, 'shared-test-state'), scope: 'shared-posix' });
  assert.equal((await promote(f.options, f.adapters)).manifests.length, 2);
  assert.equal((await promote(f.options, f.adapters)).manifests.length, 2);
});

test('bad pushed image identity, wrong manifest pair or index failure cannot update final tags', async t => {
  for (const flag of ['badConfig', 'badPair', 'failIndex', 'failPush']) {
    const f = await fixture(t);
    f.registry[flag] = true;
    await assert.rejects(promote(f.options, f.adapters), /differs|pair mismatch|failed/);
    assert.equal(f.registry.events.filter(([event]) => event === 'pointTag').length, 0);
  }
});

test('a second final-tag failure is explicitly non-atomic and the reservation still blocks older attempts', async t => {
  const f = await fixture(t);
  const point = f.registry.pointTag.bind(f.registry);
  let updates = 0;
  f.registry.pointTag = async (...args) => {
    if (++updates === 2) throw new Error('second destination update failed');
    return point(...args);
  };
  await assert.rejects(promote(f.options, f.adapters), /second destination/);
  assert.equal(f.registry.tags.size, 1);
  assert.equal(f.coordinator.reservations.size, 2);
  assert.equal(f.coordinator.receipts.length, 0);
});

test('overlapping new/old revisions and earlier reruns cannot overwrite a newer published branch', async t => {
  const old = await fixture(t);
  const newer = await fixture(t, { revision: 'b'.repeat(40), pipeline: 101, workflow: 'workflow-101', attempt: 1 });
  old.adapters.coordinator = newer.coordinator;
  old.adapters.registry = newer.registry;
  let entered;
  const acquired = new Promise(resolve => { entered = resolve; });
  const exclusive = newer.coordinator.withExclusive.bind(newer.coordinator);
  newer.coordinator.withExclusive = (...args) => {
    const result = exclusive(...args);
    entered();
    return result;
  };
  // Concurrent requests are serialized. Even a ref rollback to the old revision cannot bypass the watermark.
  const first = promote(newer.options, newer.adapters);
  await acquired;
  const second = promote(old.options, old.adapters);
  const results = await Promise.allSettled([first, second]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.match(results[1].reason.message, /stale/);
  assert.equal(newer.registry.events.filter(([event]) => event === 'pointTag').length, 2);
  const rerun = await fixture(t, { ...newer.options.policy.identity, attempt: 2 });
  rerun.adapters.coordinator = newer.coordinator;
  await promote(rerun.options, rerun.adapters);
  await assert.rejects(promote(newer.options, newer.adapters), /stale/);
});

test('retries pin the same attempt fingerprint and lost coordinator ownership fails closed', async t => {
  const f = await fixture(t);
  await promote(f.options, f.adapters);
  await promote(f.options, f.adapters);
  assert.equal(f.coordinator.receipts.length, 2);
  const changed = structuredClone(f.options);
  changed.policy.requiredChecks.push('extra-validation');
  changed.gate.checks['extra-validation'] = 'success';
  changed.gate.policySha256 = sha256(json(changed.policy));
  await assert.rejects(promote(changed, f.adapters), /fingerprint changed/);
  const writes = f.registry.events.length;
  f.coordinator.lost = true;
  await assert.rejects(promote(f.options, f.adapters), /ownership lost/);
  assert.equal(f.registry.events.length, writes);
});

test('branch, RC, release and explicitly gated manual plans use the same validation contract', async t => {
  const f = await fixture(t);
  for (const [mode, gitRef] of [['branch', 'refs/heads/support/5'], ['release', 'refs/tags/v5.0.0'], ['rc', 'refs/tags/v5.0.0-RC1'], ['manual', 'refs/heads/develop']]) {
    const options = structuredClone(f.options);
    options.policy.mode = mode;
    options.policy.gitRef = gitRef;
    options.gate.policySha256 = sha256(json(options.policy));
    assert.equal((await planPromotion(options)).policy.mode, mode);
    assert.equal((await promote(options, { ...f.adapters, coordinator: new FakeCoordinator() })).images.length, 4);
  }
  const config = path.join(f.temp, 'plan.json');
  await fs.writeFile(config, json(f.options));
  assert.equal((await main(['plan', config])).candidateTags.length, 4);
  await assert.rejects(main(['promote', config]), /trusted coordinator/);
  await assert.rejects(main(['unknown', config]), /Usage/);
});

test('concrete Docker adapter commands share a named builder and never use --push during preparation', async () => {
  const calls = [];
  const execute = async (command, args) => { calls.push([command, args]); return ''; };
  const docker = new DockerAdapter(execute);
  await docker.createBuilder('one-builder');
  for (const target of TARGETS) await docker.build({ builder: 'one-builder', context: '/source', platform: 'linux/arm64',
    target, reference: `local:${target}`, labels: { revision: source } });
  await docker.removeBuilder('one-builder');
  assert.ok(calls.every(([command]) => command === 'docker'));
  assert.ok(calls.every(([, args]) => !args.includes('--push')));
  const builds = calls.filter(([, args]) => args[1] === 'build').map(([, args]) => args);
  assert.equal(builds.length, 2);
  assert.ok(builds.every(args => args.includes('--load') && args[args.indexOf('--builder') + 1] === 'one-builder'));
});

test('concrete Docker archive streams round-trip gzip/none and reject corrupt gzip without real Docker', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-archive-streams-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { EventEmitter } = require('node:events');
  const { PassThrough } = require('node:stream');
  const payload = Buffer.from('fake docker save tar payload\n'.repeat(1000));
  let loaded;
  let killed = false;
  const docker = new DockerAdapter(undefined, (command, args) => {
    assert.equal(command, 'docker');
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.kill = () => { killed = true; child.stdin.destroy(); child.stdout.destroy(); child.emit('close', 1); };
    if (args[1] === 'save') {
      process.nextTick(() => {
        child.stdout.end(payload);
        child.stdout.once('end', () => child.emit('close', 0));
      });
    } else {
      const chunks = [];
      child.stdin.on('data', chunk => chunks.push(chunk));
      child.stdin.once('finish', () => { loaded = Buffer.concat(chunks); child.emit('close', 0); });
    }
    return child;
  });
  for (const compression of ['gzip', 'none']) {
    const file = path.join(directory, compression);
    await docker.save([sha256('image')], file, compression);
    assert.deepEqual(compression === 'gzip' ? gunzipSync(await fs.readFile(file)) : await fs.readFile(file), payload);
    await docker.load(file, compression);
    assert.deepEqual(loaded, payload);
  }
  const corrupt = path.join(directory, 'corrupt.gz');
  await fs.writeFile(corrupt, 'not gzip');
  await assert.rejects(docker.load(corrupt, 'gzip'), /header|gzip/);
  assert.equal(killed, true);
});

test('concrete builder cleans up when bootstrap fails and push without a digest fails closed', async () => {
  const calls = [];
  const docker = new DockerAdapter(async (command, args) => {
    calls.push(args);
    if (args.includes('--bootstrap')) throw new Error('bootstrap failed');
    return '';
  });
  await assert.rejects(docker.createBuilder('builder'), /bootstrap failed/);
  assert.deepEqual(calls.at(-1), ['buildx', 'rm', 'builder']);
  const registry = new RegistryAdapter(async () => 'push output without a manifest digest');
  await assert.rejects(registry.push(sha256('image'), 'example.invalid/team/portal:ci-unique'), /immutable registry manifest digest/);
});

test('concrete Git adapter checks ignored input, and resolves annotated release tags by peeled commit', async () => {
  const responses = ['', 'config/local.js\n', `${'c'.repeat(40)}\trefs/tags/v5.0.0\n${source}\trefs/tags/v5.0.0^{}\n`];
  const calls = [];
  const git = new GitAdapter('origin', async (command, args) => { calls.push([command, args]); return responses.shift(); });
  assert.equal(await git.clean('/source'), false);
  assert.equal(await git.refRevision('refs/tags/v5.0.0'), source);
  assert.ok(calls[2][1].includes('refs/tags/v5.0.0^{}'));
});

test('Git adapter rejects hidden index flags even when status reports a clean checkout', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-ci-hidden-index-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM scratch\n');
  git('add', 'Dockerfile');
  git('commit', '-qm', 'fixture');
  const adapter = new GitAdapter();
  assert.equal(await adapter.clean(dir), true);
  git('update-index', '--assume-unchanged', 'Dockerfile');
  await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM modified\n');
  assert.equal(git('status', '--porcelain').toString(), '');
  assert.equal(await adapter.clean(dir), false);
  git('update-index', '--no-assume-unchanged', 'Dockerfile');
  await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM scratch\n');
  git('update-index', '--skip-worktree', 'Dockerfile');
  assert.equal(await adapter.clean(dir), false);
});

test('Git adapter disables fsmonitor when verifying source cleanliness', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-ci-fsmonitor-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM scratch\n');
  git('add', 'Dockerfile');
  git('commit', '-qm', 'fixture');
  const hook = path.join(dir, '.git', 'fsmonitor-hook');
  await fs.writeFile(hook, '#!/bin/sh\nprintf "token\\0"\n', { mode: 0o755 });
  git('config', 'core.fsmonitor', hook);
  git('status', '--porcelain');
  git('update-index', '--fsmonitor-valid', 'Dockerfile');
  await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM modified\n');
  assert.equal(git('status', '--porcelain').toString(), '');
  assert.equal(await new GitAdapter().clean(dir), false);
});

test('Git adapter ignores lenient repository settings when checking tracked content and type', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-ci-strict-git-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM scratch\n');
  await fs.symlink('Dockerfile', path.join(dir, 'link'));
  git('add', 'Dockerfile', 'link');
  git('commit', '-qm', 'fixture');
  const adapter = new GitAdapter();
  const stat = await fs.stat(path.join(dir, 'Dockerfile'));
  git('config', 'core.trustctime', 'false');
  await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM altered\n');
  await fs.utimes(path.join(dir, 'Dockerfile'), stat.atime, stat.mtime);
  assert.equal(await adapter.clean(dir), false);
  await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM scratch\n');
  git('config', 'core.filemode', 'false');
  await fs.chmod(path.join(dir, 'Dockerfile'), 0o755);
  assert.equal(await adapter.clean(dir), false);
  await fs.chmod(path.join(dir, 'Dockerfile'), 0o644);
  git('config', 'core.symlinks', 'false');
  await fs.unlink(path.join(dir, 'link'));
  await fs.writeFile(path.join(dir, 'link'), 'Dockerfile');
  assert.equal(await adapter.clean(dir), false);
});

test('Git adapter detects untracked files concealed by case-insensitive configuration', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-ci-case-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM scratch\n');
  git('add', 'Dockerfile'); git('commit', '-qm', 'fixture'); git('config', 'core.ignorecase', 'true');
  await fs.writeFile(path.join(dir, 'dockerfile'), 'unexpected source\n');
  assert.equal(git('status', '--porcelain').toString(), '');
  assert.equal(await new GitAdapter().clean(dir), false);
});

test('Git adapter refuses submodules whose nested source cannot be fully attested', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-ci-submodule-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const child = path.join(dir, 'child'); const parent = path.join(dir, 'parent');
  await fs.mkdir(child); await fs.mkdir(parent);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  for (const repo of [child, parent]) {
    git(repo, 'init', '-q'); git(repo, 'config', 'user.email', 'test@example.invalid'); git(repo, 'config', 'user.name', 'Test');
  }
  await fs.writeFile(path.join(child, '.gitignore'), 'local.js\n');
  await fs.writeFile(path.join(child, 'source.js'), 'initial\n');
  git(child, 'add', '.'); git(child, 'commit', '-qm', 'child');
  git(parent, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', child, 'nested');
  git(parent, 'commit', '-qam', 'parent');
  await fs.writeFile(path.join(parent, 'nested', 'local.js'), 'ignored input\n');
  assert.equal(git(parent, 'status', '--porcelain').toString(), '');
  assert.equal(await new GitAdapter().clean(parent), false);
});

test('concrete registry adapter records push digest and constructs indexes from immutable references', async () => {
  const configDigest = sha256('local image config');
  const manifestDigest = sha256('registry manifest');
  const indexDigest = sha256('registry index');
  const sources = PLATFORMS.map(platform => ({ platform, digest: sha256(platform), reference: `example.invalid/team/portal@${sha256(platform)}` }));
  const calls = [];
  const registry = new RegistryAdapter(async (command, args) => {
    calls.push(args);
    if (args[1] === 'push') return `tag: digest: ${manifestDigest} size: 1234\n`;
    if (args.includes('--format')) return JSON.stringify({ digest: indexDigest });
    if (args.includes('--raw')) return JSON.stringify(args[3].includes(manifestDigest)
      ? { config: { digest: configDigest } }
      : { manifests: sources.map(item => ({ digest: item.digest, platform: { os: 'linux', architecture: item.platform.split('/')[1] } })) });
    return '';
  });
  assert.deepEqual(await registry.push(configDigest, 'example.invalid/team/portal:ci-unique'), { digest: manifestDigest, configDigest });
  assert.equal((await registry.createIndex('example.invalid/team/portal:ci-index', sources)).digest, indexDigest);
  assert.equal(await registry.pointTag('example.invalid/team/portal:develop', `example.invalid/team/portal@${indexDigest}`), indexDigest);
  const create = calls.find(args => args[2] === 'create');
  assert.deepEqual(create.slice(-2), sources.map(item => item.reference));
  assert.ok(calls.some(args => args.includes(`example.invalid/team/portal@${manifestDigest}`)));
});

test('asset evidence enumerates real runtime payloads deterministically and rejects symlinks', () => {
  // Run the exact in-image script against a fake fs, without Docker or an actual runtime tree.
  const vm = require('node:vm');
  function execute(names, symlink = false) {
    let result;
    const fakeFs = { readdirSync: () => names, lstatSync: file => ({ isDirectory: () => false,
      isFile: () => !symlink || !file.endsWith('a.js') }), readFileSync: file => Buffer.from(path.basename(file)) };
    vm.runInNewContext(assetEvidenceScript, { require: name => name === 'node:fs' ? fakeFs : require(name),
      process, console: { log: text => { result = JSON.parse(text); } } });
    return result;
  }
  assert.deepEqual(execute(['b.css', 'a.js']), execute(['a.js', 'b.css']));
  assert.notEqual(execute(['a.js']).assetSha256, execute(['b.css']).assetSha256);
  assert.throws(() => execute(['a.js'], true), /Non-regular asset/);
});
