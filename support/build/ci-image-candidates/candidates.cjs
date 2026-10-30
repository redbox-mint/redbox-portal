'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const TARGETS = ['runtime', 'runtime_pdfgen'];
const PLATFORMS = ['linux/amd64', 'linux/arm64'];
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const revisionPattern = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const labels = {
  revision: 'org.opencontainers.image.revision',
  target: 'org.redbox.ci.target',
  identity: 'org.redbox.ci.identity',
};
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(condition, message) { if (!condition) throw new Error(message); }
function identity(value) {
  check(value && typeof value.revision === 'string' && revisionPattern.test(value.revision), 'revision must be a full Git SHA');
  check(Number.isSafeInteger(value.pipeline) && value.pipeline > 0, 'pipeline must be a positive ordering number');
  check(Number.isSafeInteger(value.attempt) && value.attempt > 0, 'attempt must be a positive rerun ordering number');
  check(typeof value.workflow === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value.workflow), 'workflow must be a safe unique identifier');
  return { revision: value.revision, pipeline: value.pipeline, workflow: value.workflow, attempt: value.attempt };
}
function platform(value) {
  check(PLATFORMS.includes(value), `unsupported native platform: ${value}`);
  return value;
}
function digest(value, name) { check(typeof value === 'string' && digestPattern.test(value), `${name} must be a SHA256 digest`); return value; }
function imageLabels(id, target) {
  return { [labels.revision]: id.revision, [labels.target]: target, [labels.identity]: sha256(json(id)) };
}
function location(root, id, nativePlatform) {
  id = identity(id);
  return path.resolve(root, 'v1', id.revision, String(id.pipeline), id.workflow, String(id.attempt), platform(nativePlatform).split('/')[1]);
}
async function readFile(file) {
  check((await fs.lstat(file)).isFile(), `expected regular file (no symlink): ${file}`);
  return fs.readFile(file);
}
async function fileDigest(file) {
  check((await fs.lstat(file)).isFile(), `expected regular archive (no symlink): ${file}`);
  const hash = crypto.createHash('sha256');
  const { createReadStream } = require('node:fs');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return `sha256:${hash.digest('hex')}`;
}
async function writeNew(file, value) {
  await fs.writeFile(file, value, { flag: 'wx', mode: 0o444 });
}
function assertImage(info, metadata) {
  check(info.id === metadata.imageId, 'loaded image ID differs from candidate');
  check(info.platform === metadata.platform, 'loaded image platform differs from candidate');
  for (const [key, value] of Object.entries(imageLabels(metadata.identity, metadata.target))) {
    check(info.labels?.[key] === value, `loaded image ${key} label mismatch`);
  }
}

// All effects are injected; preparation has no registry adapter or publishing credentials.
async function prepare(options, { docker, git }) {
  const id = identity(options.identity);
  const nativePlatform = platform(options.platform);
  check(['gzip', 'none'].includes(options.compression || 'gzip'), 'compression must be gzip or none');
  for (const key of ['node', 'npm', 'typescript']) {
    check(typeof options.toolchain?.[key] === 'string' && options.toolchain[key].length > 0,
      `declared compiler/toolchain version required: ${key}`);
  }
  if (options.assetSha256) digest(options.assetSha256, 'assetSha256');
  const context = path.resolve(options.context || '.');
  // Require a committed context. A refreshed Dependabot checkout must use its actual SHA.
  check(await git.revision(context) === id.revision, 'checkout revision mismatch');
  check(await git.clean(context), 'build context has tracked or untracked changes');
  check(await docker.nativePlatform() === nativePlatform, 'Docker daemon is not the requested native platform');
  const directory = location(options.root, id, nativePlatform);
  check(!context.startsWith(`${directory}${path.sep}`) && context !== directory &&
    !directory.startsWith(`${context}${path.sep}`), 'workspace output must be outside Docker source context');
  await fs.mkdir(path.dirname(directory), { recursive: true });
  // Never replace an attempt, including an interrupted/incomplete one.
  await fs.mkdir(directory);
  const started = Date.now();
  const builder = `rb-ci-${crypto.randomUUID()}`;
  const entries = [];
  const buildStarted = Date.now();
  let created = false;
  try {
    await docker.createBuilder(builder);
    created = true;
    const tools = { declared: options.toolchain, observed: await docker.versions(), helperNode: process.version };
    for (const target of TARGETS) {
      const reference = `redbox-ci-local:${sha256(json({ id, nativePlatform, target })).slice(7)}`;
      await docker.build({ builder, context, platform: nativePlatform, target, reference, labels: imageLabels(id, target) });
      const info = await docker.inspect(reference);
      digest(info.id, 'Docker image ID');
      const metadata = { schemaVersion: 1, identity: id, platform: nativePlatform, target, imageId: info.id, tools };
      assertImage(info, metadata);
      // Runs on the native producer, never via emulation in the promotion job.
      const evidence = await docker.evidence(info.id);
      digest(evidence.assetSha256, 'observed assetSha256');
      check(Number.isSafeInteger(evidence.assetFiles) && evidence.assetFiles > 0, 'runtime assets are missing');
      check(evidence.node === options.toolchain.node, 'observed runtime Node version differs from declared toolchain');
      check(!options.assetSha256 || options.assetSha256 === evidence.assetSha256, 'prepared asset checksum mismatch');
      check(!entries.length || entries[0].evidence.assetSha256 === evidence.assetSha256, 'runtime variants have different web assets');
      entries.push({ ...metadata, evidence });
    }
    check(await git.revision(context) === id.revision && await git.clean(context), 'source context changed during build');
    const buildMs = Date.now() - buildStarted;
    const compression = options.compression || 'gzip';
    const archiveName = compression === 'gzip' ? 'images.tar.gz' : 'images.tar';
    const archiveFile = path.join(directory, archiveName);
    const archiveStarted = Date.now();
    // A single docker-save stream deduplicates common runtime/PDF layers.
    await docker.save(entries.map(entry => entry.imageId), archiveFile, compression);
    const archive = { file: archiveName, compression, sha256: await fileDigest(archiveFile), bytes: (await fs.stat(archiveFile)).size };
    const catalog = { schemaVersion: 1, identity: id, platform: nativePlatform, archive, targets: {},
      timings: { buildMs, archiveAndHashMs: Date.now() - archiveStarted, preparationMs: Date.now() - started } };
    const checksumLines = [`${archive.sha256.slice(7)}  ${archive.file}`];
    for (const entry of entries) {
      await fs.mkdir(path.join(directory, entry.target));
      const file = `${entry.target}/metadata.json`;
      const data = json({ ...entry, archive });
      await writeNew(path.join(directory, file), data);
      catalog.targets[entry.target] = { file, sha256: sha256(data) };
      checksumLines.push(`${sha256(data).slice(7)}  ${file}`);
    }
    const catalogData = json(catalog);
    await writeNew(path.join(directory, 'candidate.json'), catalogData);
    checksumLines.push(`${sha256(catalogData).slice(7)}  candidate.json`);
    await writeNew(path.join(directory, 'checksums.sha256'), `${checksumLines.join('\n')}\n`);
    await writeNew(path.join(directory, 'complete'), `${sha256(catalogData)}\n`);
    return { directory, catalogSha256: sha256(catalogData), archiveBytes: archive.bytes, timings: catalog.timings };
  } finally {
    if (created) await docker.removeBuilder(builder);
  }
}

async function verify(options, { docker } = {}) {
  const id = identity(options.identity);
  const nativePlatform = platform(options.platform);
  digest(options.catalogSha256, 'trusted catalogSha256');
  const directory = path.resolve(options.directory);
  const catalogData = await readFile(path.join(directory, 'candidate.json'));
  check(sha256(catalogData) === options.catalogSha256, 'candidate metadata checksum mismatch');
  check((await readFile(path.join(directory, 'complete'))).toString().trim() === options.catalogSha256, 'incomplete candidate');
  const catalog = JSON.parse(catalogData);
  check(catalog.schemaVersion === 1, 'unsupported candidate schema');
  check(equal(identity(catalog.identity), id), 'candidate revision/workflow/attempt mismatch');
  check(catalog.platform === nativePlatform, 'candidate platform mismatch');
  check(equal(Object.keys(catalog.targets).sort(), [...TARGETS].sort()), 'candidate targets mismatch');
  const archive = catalog.archive;
  check(archive && ['gzip', 'none'].includes(archive.compression) &&
    archive.file === (archive.compression === 'gzip' ? 'images.tar.gz' : 'images.tar'), 'invalid archive path/compression');
  check(Number.isSafeInteger(archive.bytes) && archive.bytes > 0, 'invalid archive size');
  const archiveFile = path.join(directory, archive.file);
  check((await fs.lstat(archiveFile)).size === archive.bytes, 'archive size mismatch');
  check(await fileDigest(archiveFile) === archive.sha256, 'archive checksum mismatch');
  const entries = [];
  const checksumLines = [`${archive.sha256.slice(7)}  ${archive.file}`];
  for (const target of TARGETS) {
    const reference = catalog.targets[target];
    check(reference.file === `${target}/metadata.json`, 'invalid target metadata path');
    const data = await readFile(path.join(directory, reference.file));
    check(sha256(data) === reference.sha256, 'target metadata checksum mismatch');
    const entry = JSON.parse(data);
    check(entry.schemaVersion === 1 && equal(identity(entry.identity), id), 'target revision/workflow/attempt mismatch');
    check(entry.target === target, 'candidate target mismatch');
    check(entry.platform === nativePlatform, 'target platform mismatch');
    check(equal(entry.archive, archive), 'target archive mismatch');
    digest(entry.imageId, 'image ID');
    digest(entry.evidence?.assetSha256, 'asset checksum');
    check(entry.evidence.assetFiles > 0, 'missing asset evidence');
    check(!options.assetSha256 || entry.evidence.assetSha256 === options.assetSha256, 'asset checksum differs from expected assets');
    check(!entries.length || entries[0].evidence.assetSha256 === entry.evidence.assetSha256, 'variant asset checksum mismatch');
    entries.push(entry);
    checksumLines.push(`${reference.sha256.slice(7)}  ${reference.file}`);
  }
  checksumLines.push(`${options.catalogSha256.slice(7)}  candidate.json`);
  check((await readFile(path.join(directory, 'checksums.sha256'))).toString() === `${checksumLines.join('\n')}\n`, 'checksum inventory mismatch');
  if (options.load) {
    check(docker, 'Docker adapter is required to load candidates');
    await docker.load(archiveFile, archive.compression);
    for (const entry of entries) assertImage(await docker.inspect(entry.imageId), entry);
  }
  return { directory, catalogSha256: options.catalogSha256, catalog, entries };
}

function validatePolicy(policy) {
  const id = identity(policy.identity);
  check(['branch', 'release', 'rc', 'manual'].includes(policy.mode), 'invalid promotion mode');
  check(typeof policy.gitRef === 'string' && /^refs\/(heads|tags)\/[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(policy.gitRef) &&
    !policy.gitRef.includes('..') && !policy.gitRef.endsWith('/'), 'fully qualified Git ref required');
  check(policy.mode !== 'branch' || policy.gitRef.startsWith('refs/heads/'), 'branch promotion requires a branch ref');
  check(!['release', 'rc'].includes(policy.mode) || policy.gitRef.startsWith('refs/tags/'), 'release promotion requires a tag ref');
  check(typeof policy.repository === 'string' && /^(?:[a-z0-9.-]+(?::[0-9]+)?\/)?[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+$/.test(policy.repository), 'invalid registry repository');
  check(policy.tags && equal(Object.keys(policy.tags).sort(), [...TARGETS].sort()), 'both final target tags required');
  check(new Set(Object.values(policy.tags)).size === 2 && Object.values(policy.tags).every(tag => typeof tag === 'string' && /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/.test(tag)), 'invalid or duplicate destination tags');
  check(Array.isArray(policy.requiredChecks) && policy.requiredChecks.length > 0 &&
    new Set(policy.requiredChecks).size === policy.requiredChecks.length && policy.requiredChecks.every(name => typeof name === 'string' && name.length), 'explicit required validation checks required');
  return id;
}

async function planPromotion(options) {
  const { policy, gate } = options;
  const id = validatePolicy(policy);
  check(gate?.schemaVersion === 1 && gate.status === 'success', 'validation gate has not succeeded');
  check(equal(identity(gate.identity), id), 'validation gate identity mismatch');
  check(gate.policySha256 === sha256(json(policy)), 'gate policy checksum mismatch');
  check(policy.requiredChecks.every(name => gate.checks?.[name] === 'success'), 'required validation check did not succeed');
  check(Array.isArray(options.candidates) && options.candidates.length === 2, 'exactly two native candidate bundles required');
  check(equal(options.candidates.map(item => item.platform).sort(), PLATFORMS), 'AMD64 and ARM64 candidate pair required');
  check(gate.candidates && equal(Object.keys(gate.candidates).sort(), PLATFORMS), 'gate must bind both native candidate catalogs');
  const bundles = [];
  for (const candidate of options.candidates) {
    check(gate.candidates[candidate.platform] === candidate.catalogSha256, 'gate candidate checksum mismatch');
    bundles.push(await verify({ ...candidate, identity: id, load: false }));
  }
  const assets = bundles.flatMap(bundle => bundle.entries.map(entry => entry.evidence.assetSha256));
  check(assets.every(value => value === assets[0]), 'cross-architecture asset checksum mismatch');
  const fingerprint = sha256(json({ policy, catalogs: gate.candidates }));
  // Short unique tags carry a hash of the complete identity and catalog. Never read mutable architecture tags.
  const candidateTags = bundles.flatMap(bundle => bundle.entries.map(entry => ({
    platform: entry.platform, target: entry.target, imageId: entry.imageId,
    reference: `${policy.repository}:ci-${id.revision.slice(0, 12)}-${fingerprint.slice(7, 31)}-${entry.platform.split('/')[1]}-${entry.target.replace('_', '-')}`,
  })));
  const indexes = TARGETS.map(target => ({ target,
    reference: `${policy.repository}:ci-index-${fingerprint.slice(7, 39)}-${target.replace('_', '-')}`,
    destination: `${policy.repository}:${policy.tags[target]}` }));
  return { identity: id, fingerprint, policy, bundles, candidateTags, indexes,
    note: 'Plan only. Publication requires trusted authorization and an external exclusive coordinator.' };
}

// No default lock, no --unsafe bypass. A distributed coordinator is deliberately an integration prerequisite.
async function promote(options, { docker, git, registry, coordinator, authorize }) {
  check(typeof authorize === 'function', 'trusted gate authorization adapter required');
  check(typeof coordinator?.withExclusive === 'function', 'external exclusive promotion coordinator required');
  const plan = await planPromotion(options);
  check(await authorize({ policy: plan.policy, gate: options.gate, fingerprint: plan.fingerprint }) === true, 'trusted validation authorization rejected');
  return coordinator.withExclusive(plan.policy.repository, async lease => {
    check(typeof lease?.reserve === 'function' && typeof lease?.assertHeld === 'function' && typeof lease?.complete === 'function', 'invalid exclusive coordinator lease');
    const assertCurrent = async () => {
      await lease.assertHeld();
      check(await git.refRevision(plan.policy.gitRef) === plan.identity.revision, 'source ref is superseded or moved');
    };
    await assertCurrent();
    // Load and inspect EVERY image before ANY registry write. Never build in promotion.
    for (const bundle of plan.bundles) {
      await verify({ directory: bundle.directory, identity: plan.identity, platform: bundle.catalog.platform,
        catalogSha256: bundle.catalogSha256, load: true }, { docker });
    }
    // Durable high-water reservation before writes; it must also pin retries to this fingerprint.
    await lease.reserve({ identity: plan.identity, fingerprint: plan.fingerprint, destinations: Object.values(plan.policy.tags) });
    const images = [];
    for (const candidate of plan.candidateTags) {
      await assertCurrent();
      const pushed = await registry.push(candidate.imageId, candidate.reference);
      digest(pushed.digest, 'registry manifest digest');
      check(pushed.configDigest === candidate.imageId, 'pushed manifest config differs from verified local image ID');
      images.push({ ...candidate, manifestDigest: pushed.digest });
    }
    const manifests = [];
    // Prepare and verify BOTH immutable manifest lists before writing any release/branch tag.
    for (const { target, reference, destination } of plan.indexes) {
      const sources = images.filter(image => image.target === target).map(image => ({
        platform: image.platform, digest: image.manifestDigest, reference: `${plan.policy.repository}@${image.manifestDigest}`,
      }));
      await assertCurrent();
      const result = await registry.createIndex(reference, sources);
      digest(result.digest, 'multi-architecture manifest digest');
      check(equal([...result.sources].sort((a, b) => a.platform.localeCompare(b.platform)),
        sources.map(({ platform, digest }) => ({ platform, digest })).sort((a, b) => a.platform.localeCompare(b.platform))), 'manifest image pair mismatch');
      manifests.push({ target, digest: result.digest, sources, destination });
    }
    for (const manifest of manifests) {
      await assertCurrent();
      const published = await registry.pointTag(manifest.destination, `${plan.policy.repository}@${manifest.digest}`);
      check(published === manifest.digest, 'published tag digest differs from verified manifest');
    }
    const receipt = { schemaVersion: 1, identity: plan.identity, fingerprint: plan.fingerprint, images, manifests };
    await lease.complete(receipt);
    return receipt;
  });
}

module.exports = { TARGETS, PLATFORMS, labels, json, sha256, identity, location, prepare, verify, planPromotion, promote };
