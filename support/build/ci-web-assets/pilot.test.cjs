'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { test } = require('node:test');
const integration = require('../integration-prebuilt-assets.cjs');
const { TOOL_PACKAGES, sha256, json } = require('./identity.cjs');
const { producePilot, preparePilot, nativePlatform } = require('./pilot.cjs');

const cli = path.join(__dirname, 'pilot.cjs');
function put(root, filename, bytes) {
  const target = path.join(root, filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
}
function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function read(filename) { return JSON.parse(fs.readFileSync(filename)); }

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-asset-pilot-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'producer-source');
  fs.mkdirSync(root);
  const apps = [...integration.REQUIRED_APPS, 'form'];
  put(root, '.gitignore', 'assets/angular/\n.tmp/\n');
  put(root, '.nvmrc', process.versions.node);
  put(root, 'angular/.nvmrc', process.versions.node);
  put(root, 'angular/angular.json', json({ projects: Object.fromEntries(apps.map(name => [name, {
    architect: { build: { builder: '@angular/build:application' } },
  }])) }));
  put(root, 'backend.ts', '// immutable backend input\n');
  put(root, 'Dockerfile', 'FROM scratch AS runtime\n');
  put(root, 'assets/source.css', 'body { color: black; }');
  for (const [directory, names] of Object.entries(TOOL_PACKAGES)) {
    put(root, `${directory}/package.json`, json({ name: 'fixture', version: '1.0.0' }));
    put(root, `${directory}/package-lock.json`, json({ lockfileVersion: 3,
      packages: Object.fromEntries(names.map(name => [`node_modules/${name}`, { version: '1.2.3' }])) }));
  }
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, '-c', 'user.name=Pilot tests', '-c', 'user.email=pilot@example.invalid', 'commit', '-qm', 'synthetic inputs');
  const identity = { project: 'gh/example/redbox', revision: git(root, 'rev-parse', 'HEAD').trim(),
    pipeline: 123, workflow: '12345678-1234-1234-1234-123456789abc', attempt: 1 };
  const producer = { optIn: true, identity, platform: nativePlatform(), root, output: path.join(base, 'producer') };
  const builder = () => {
    for (const app of apps) {
      for (const prefix of [`assets/angular/${app}/browser`, `.tmp/public/angular/${app}/browser`]) {
        put(root, `${prefix}/index.html`, '<base href="/"><script type="module" src="main-A.js"></script>');
        put(root, `${prefix}/main-A.js`, 'import("./chunk-A.js");');
        put(root, `${prefix}/chunk-A.js`, 'export const ready = true;');
      }
    }
    for (const filename of integration.REQUIRED_WEBPACK) put(root, `.tmp/public/${filename}`, '/* synthetic production bundle */');
    put(root, '.tmp/public/fonts/synthetic.woff2', 'synthetic served font');
  };
  return { base, root, identity, producer, builder };
}

async function produced(t) {
  const f = fixture(t);
  f.result = await producePilot(f.producer, f.builder);
  f.consumerRoot = path.join(f.base, 'consumer-source');
  git(f.base, 'clone', '-q', f.root, f.consumerRoot);
  f.consumer = { optIn: true, identity: f.identity, platform: nativePlatform(), root: f.consumerRoot,
    output: path.join(f.base, 'consumer'), artifact: f.result.artifact, receipt: f.result.receipt,
    receiptSha256: f.result.receiptSha256, producerPlatform: nativePlatform(), target: 'runtime' };
  return f;
}

function editReceipt(f, transform) {
  const receipt = read(f.result.receipt);
  transform(receipt);
  // Simulate a separately authorized new trust anchor, so semantic provenance
  // checks must still reject an internally inconsistent but checksum-valid file.
  fs.chmodSync(f.result.receipt, 0o600);
  fs.writeFileSync(f.result.receipt, json(receipt));
  f.consumer.receiptSha256 = sha256(fs.readFileSync(f.result.receipt));
}

function command(request, f, name = 'prepare') {
  const filename = path.join(f.base, 'request.json');
  fs.writeFileSync(filename, json(request));
  return spawnSync(process.execPath, [cli, name, filename], { encoding: 'utf8' });
}

test('producer pins workflow, source, toolchain key and actual architecture in a separately hashed receipt', async t => {
  const f = fixture(t);
  const result = await producePilot(f.producer, f.builder);
  const receipt = read(result.receipt);
  const descriptor = read(path.join(result.artifact, 'artifact.json'));
  assert.equal(result.receiptSha256, sha256(fs.readFileSync(result.receipt)));
  assert.deepEqual(receipt.identity, f.identity);
  assert.equal(receipt.producerPlatform, nativePlatform());
  assert.equal(receipt.assets.key, descriptor.key);
  assert.equal(receipt.assets.manifestSha256, descriptor.manifestSha256);
  assert.equal(receipt.assets.descriptorSha256, sha256(fs.readFileSync(path.join(result.artifact, 'artifact.json'))));
  assert.equal(descriptor.identity.toolchain.node, process.versions.node);
  assert.equal(fs.statSync(f.producer.output).mode & 0o777, 0o700);
  assert.equal(fs.statSync(result.receipt).mode & 0o777, 0o400);
  await assert.rejects(producePilot(f.producer, () => assert.fail('must not rebuild')), /already exists/);
});

test('CLI prepare restores byte-identical assets to isolated output and emits only a local OCI build plan', async t => {
  const f = await produced(t);
  const before = git(f.consumerRoot, 'status', '--porcelain', '--ignored');
  const result = command(f.consumer, f);
  assert.equal(result.status, 0, result.stderr);
  const prepared = JSON.parse(result.stdout);
  const plan = read(prepared.plan);
  assert.equal(prepared.planSha256, sha256(fs.readFileSync(prepared.plan)));
  assert.deepEqual(plan.identity, f.identity);
  assert.equal(plan.receiptSha256, f.result.receiptSha256);
  assert.equal(plan.consumerPlatform, nativePlatform());
  assert.equal(plan.producerPlatform, nativePlatform());
  const manifest = integration.verify(prepared.stage, f.identity.revision);
  for (const entry of manifest.files) {
    assert.deepEqual(fs.readFileSync(path.join(prepared.stage, entry.path)), fs.readFileSync(path.join(f.root, entry.path)));
  }
  assert.equal(git(f.consumerRoot, 'status', '--porcelain', '--ignored'), before);
  assert.equal(fs.existsSync(path.join(f.consumerRoot, '.tmp')), false);
  assert.equal(fs.existsSync(path.join(f.consumerRoot, 'assets/angular')), false);
  assert.equal(fs.existsSync(path.join(f.consumer.output, 'image.oci.tar')), false, 'Docker is never executed');
  const digest = read(f.result.receipt).assets.manifestSha256;
  assert.deepEqual(plan.invocation, { command: 'docker', args: ['buildx', 'build', '--platform', nativePlatform(),
    '--target', 'runtime', '--build-arg', 'WEB_ASSETS=shared', '--build-arg', `SOURCE_REVISION=${f.identity.revision}`,
    '--build-arg', `WEB_ASSETS_MANIFEST_SHA256=${digest}`, '--build-context', `web-assets=${prepared.stage}`,
    '--output', `type=oci,dest=${path.join(f.consumer.output, 'image.oci.tar')}`, f.consumerRoot],
  cwd: f.consumerRoot, shell: false });
  assert.equal(fs.statSync(prepared.plan).mode & 0o777, 0o400);
  assert.equal(command(f.consumer, f).status, 1, 'rerun cannot overwrite output');
});

test('all documented Docker targets use the shared named context without tags, load or push', async t => {
  const f = await produced(t);
  for (const target of ['runtime_pdfgen', 'test', 'integration_mocha', 'integration_playwright']) {
    const prepared = await preparePilot({ ...f.consumer, target, output: path.join(f.base, target) });
    const args = read(prepared.plan).invocation.args;
    assert.equal(args[args.indexOf('--target') + 1], target);
    assert.equal(args.includes('--push') || args.includes('--load') || args.includes('--tag'), false);
  }
});

test('explicit opt-in, exact request fields and native platform are mandatory before producing', async t => {
  const f = fixture(t);
  for (const change of [{ optIn: false }, { optIn: 'true' }, { publish: true }, { platform: 'linux/s390x' },
    { platform: nativePlatform() === 'linux/amd64' ? 'linux/arm64' : 'linux/amd64' }, { root: '.' }]) {
    await assert.rejects(producePilot({ ...f.producer, ...change }, () => assert.fail('must not build')));
    assert.equal(fs.existsSync(f.producer.output), false);
  }
  assert.throws(() => nativePlatform({ platform: 'darwin', arch: 'arm64' }), /native Linux/);
  assert.throws(() => nativePlatform({ platform: 'linux', arch: 's390x' }), /native Linux/);
  assert.equal(nativePlatform({ platform: 'linux', arch: 'x64' }), 'linux/amd64');
  assert.equal(nativePlatform({ platform: 'linux', arch: 'arm64' }), 'linux/arm64');
});

test('failed producer leaves no success receipt and cannot reuse the failed attempt', async t => {
  const f = fixture(t);
  await assert.rejects(producePilot(f.producer, () => { throw new Error('synthetic build failure'); }), /build failure/);
  assert.deepEqual(fs.readdirSync(f.producer.output), []);
  await assert.rejects(producePilot(f.producer, f.builder), /already exists/);
});

test('consumer requires the independent receipt anchor and all expected provenance', async t => {
  const f = await produced(t);
  const changes = [
    { receiptSha256: '0'.repeat(64) }, { receiptSha256: '' }, { target: 'runtime --push' },
    { producerPlatform: 'linux/other' }, { producerPlatform: nativePlatform() === 'linux/amd64' ? 'linux/arm64' : 'linux/amd64' },
    ...['project', 'revision', 'pipeline', 'workflow', 'attempt'].map(key => ({ identity: { ...f.identity,
      [key]: { project: 'gh/other/repo', revision: 'a'.repeat(40), pipeline: 124,
        workflow: 'abcdefab-1234-1234-1234-123456789abc', attempt: 2 }[key] } })),
    { identity: { ...f.identity, pipeline: '123' } }, { identity: { ...f.identity, attempt: 0 } },
  ];
  for (const change of changes) {
    const result = command({ ...f.consumer, ...change }, f);
    assert.equal(result.status, 1, json(change));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /pilot rejected/);
    assert.equal(fs.existsSync(f.consumer.output), false);
  }
  const missing = { ...f.consumer };
  delete missing.receiptSha256;
  assert.equal(command(missing, f).status, 1);
});

test('receipt corruption, unsupported contract and helper drift fail before staging', async t => {
  const f = await produced(t);
  const original = fs.readFileSync(f.result.receipt);
  for (const transform of [r => { r.schemaVersion = 2; }, r => { r.contract = 'other'; },
    r => { r.implementationSha256 = 'a'.repeat(64); }, r => { delete r.identity.workflow; },
    r => { r.assets.key = 'b'.repeat(64); }, r => { r.assets.manifestSha256 = 'c'.repeat(64); },
    r => { r.assets.descriptorSha256 = 'd'.repeat(64); }, r => { r.extra = true; }]) {
    fs.chmodSync(f.result.receipt, 0o600);
    fs.writeFileSync(f.result.receipt, original);
    editReceipt(f, transform);
    await assert.rejects(preparePilot(f.consumer));
    assert.equal(fs.existsSync(f.consumer.output), false);
  }
  fs.writeFileSync(f.result.receipt, original);
  f.consumer.receiptSha256 = f.result.receiptSha256;
  fs.appendFileSync(f.result.receipt, ' ');
  await assert.rejects(preparePilot(f.consumer), /receipt checksum mismatch/);
});

test('descriptor architecture must agree with the authenticated receipt even with an updated descriptor checksum', async t => {
  const f = await produced(t);
  const filename = path.join(f.result.artifact, 'artifact.json');
  const description = read(filename);
  description.producer.arch = process.arch === 'x64' ? 'arm64' : 'x64';
  fs.writeFileSync(filename, json(description));
  editReceipt(f, r => { r.assets.descriptorSha256 = sha256(fs.readFileSync(filename)); });
  await assert.rejects(preparePilot(f.consumer), /Descriptor producer architecture mismatch/);
  assert.equal(fs.existsSync(f.consumer.output), false);
});

test('dirty source, corrupted archive and missing payload fail closed without a build plan or rebuild', async t => {
  const f = await produced(t);
  put(f.consumerRoot, 'backend.ts', '// changed input\n');
  await assert.rejects(preparePilot(f.consumer));
  assert.equal(fs.existsSync(path.join(f.consumer.output, 'plan.json')), false);
  git(f.consumerRoot, 'checkout', '--', 'backend.ts');
  const archive = path.join(f.result.artifact, 'assets.tar.gz');
  fs.appendFileSync(archive, 'corruption');
  await assert.rejects(preparePilot({ ...f.consumer, output: path.join(f.base, 'corrupt') }), /Archive size\/checksum mismatch/);
  assert.equal(fs.existsSync(path.join(f.base, 'corrupt/web-assets')), false);
  assert.equal(fs.existsSync(path.join(f.base, 'corrupt/plan.json')), false);
  fs.unlinkSync(archive);
  assert.equal(command({ ...f.consumer, output: path.join(f.base, 'missing') }, f).status, 1);
  assert.equal(fs.existsSync(path.join(f.base, 'missing/plan.json')), false);
});

test('existing files, dangling links, aliases into source and workspace overlap cannot be outputs', async t => {
  const f = await produced(t);
  const sentinel = path.join(f.base, 'sentinel');
  put(f.base, 'sentinel', 'preserve me');
  const dangling = path.join(f.base, 'dangling');
  fs.symlinkSync(path.join(f.base, 'absent'), dangling);
  const alias = path.join(f.base, 'source-alias');
  fs.symlinkSync(f.consumerRoot, alias);
  for (const output of [sentinel, dangling, f.base, path.join(f.consumerRoot, 'new-output'),
    path.join(alias, 'new-output'), path.join(f.result.artifact, 'new-output'),
    path.join(f.base, 'comma,push=true'), path.join(f.base, 'quote"in-output'), path.join(f.base, 'line\nbreak')]) {
    await assert.rejects(preparePilot({ ...f.consumer, output }));
  }
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve me');
  assert.equal(fs.lstatSync(dangling).isSymbolicLink(), true);
  assert.equal(fs.existsSync(path.join(f.consumerRoot, 'new-output')), false);
  assert.equal(fs.existsSync(path.join(f.base, 'comma,push=true')), false);
  assert.equal(fs.existsSync(path.join(f.base, 'quote"in-output')), false);
});

test('receipt and descriptor symlinks are rejected rather than followed', async t => {
  const f = await produced(t);
  const alias = path.join(f.base, 'receipt-alias');
  fs.symlinkSync(f.result.receipt, alias);
  await assert.rejects(preparePilot({ ...f.consumer, receipt: alias }), /regular file/);
  const descriptor = path.join(f.result.artifact, 'artifact.json');
  fs.renameSync(descriptor, path.join(f.base, 'descriptor.json'));
  fs.symlinkSync(path.join(f.base, 'descriptor.json'), descriptor);
  await assert.rejects(preparePilot(f.consumer), /regular file/);
});

test('shell metacharacters remain literal argv entries and no generated command is executed', async t => {
  const f = await produced(t);
  const output = path.join(f.base, 'spaces $(touch INJECTED) `touch INJECTED` ; echo nope');
  const result = command({ ...f.consumer, output }, f);
  assert.equal(result.status, 0, result.stderr);
  const prepared = JSON.parse(result.stdout);
  const plan = read(prepared.plan);
  assert.equal(plan.invocation.shell, false);
  assert.equal(plan.invocation.args.includes(`web-assets=${path.join(output, 'web-assets')}`), true);
  assert.equal(plan.invocation.args.includes(`type=oci,dest=${path.join(output, 'image.oci.tar')}`), true);
  for (const root of [f.base, f.consumerRoot, __dirname]) assert.equal(fs.existsSync(path.join(root, 'INJECTED')), false);
});

test('CLI usage, bad JSON and invalid produce requests fail without invoking any build', async t => {
  const f = fixture(t);
  for (const argv of [[], ['publish'], ['prepare', 'relative.json'], ['prepare', '/missing/request.json']]) {
    const result = spawnSync(process.execPath, [cli, ...argv], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
  }
  put(f.base, 'bad.json', '{');
  assert.equal(spawnSync(process.execPath, [cli, 'prepare', path.join(f.base, 'bad.json')]).status, 1);
  assert.equal(command({ ...f.producer, optIn: false }, f, 'produce').status, 1);
  assert.equal(fs.existsSync(f.producer.output), false);
});
