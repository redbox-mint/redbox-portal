#!/usr/bin/env node
'use strict';

// Standalone opt-in orchestration only. No CI API, Docker execution, cache
// fallback, registry writes, or executable configuration loaded from a request.
const fs = require('node:fs');
const path = require('node:path');
const { produce, consume, DESCRIPTOR } = require('./cli.cjs');
const { check, validRevision, sha256, json } = require('./identity.cjs');

const CONTRACT = 'redbox-shared-web-assets-pilot-v1';
const PLATFORMS = ['linux/amd64', 'linux/arm64'];
const TARGETS = ['runtime', 'runtime_pdfgen', 'test', 'integration_mocha', 'integration_playwright'];
const implementationSha256 = () => sha256(fs.readFileSync(__filename));

function fields(value, names, label) {
  check(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  check(Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)),
    `${label} requires exactly: ${names.join(', ')}`);
}

function digest(value, label) {
  check(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), `${label} must be a lowercase SHA-256`);
  return value;
}

function provenance(value) {
  fields(value, ['project', 'revision', 'pipeline', 'workflow', 'attempt'], 'identity');
  check(typeof value.project === 'string' && /^gh\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.project) &&
    value.project.length <= 256, 'identity.project must be gh/OWNER/REPO');
  validRevision(value.revision);
  for (const name of ['pipeline', 'attempt']) {
    check(Number.isSafeInteger(value[name]) && value[name] > 0, `identity.${name} must be a positive integer`);
  }
  check(typeof value.workflow === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.workflow),
    'identity.workflow must be a lowercase workflow UUID');
  return { project: value.project, revision: value.revision, pipeline: value.pipeline,
    workflow: value.workflow, attempt: value.attempt };
}

function nativePlatform(host = process) {
  const platform = host.platform === 'linux' ? { x64: 'linux/amd64', arm64: 'linux/arm64' }[host.arch] : null;
  check(platform, 'Pilot requires native Linux AMD64 or ARM64');
  return platform;
}

function absolute(value, label) {
  check(typeof value === 'string' && path.isAbsolute(value) && !/[\x00-\x1f\x7f]/.test(value),
    `${label} must be an absolute path without control characters`);
  return path.resolve(value);
}

function directory(value, label) {
  const resolved = absolute(fs.realpathSync(absolute(value, label)), label);
  check(fs.statSync(resolved).isDirectory(), `${label} must be a directory`);
  return resolved;
}

const inside = (parent, child) => child === parent || child.startsWith(`${parent}${path.sep}`);

function freshOutput(value, excluded) {
  const requested = absolute(value, 'output');
  const resolved = path.join(directory(path.dirname(requested), 'output parent'), path.basename(requested));
  // buildx --output uses CSV, independently of shell escaping. Commas in its
  // destination could introduce exporter options or invalid CSV quoting.
  check(!/[,"]/.test(resolved), 'output path cannot contain commas or double quotes (Docker exporter CSV)');
  try {
    fs.lstatSync(resolved); // Also reject dangling symlinks and empty directories.
    throw new Error(`output already exists: ${resolved}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const input of excluded) {
    check(!inside(input, resolved) && !inside(resolved, input), 'output must be separate from source and workspace inputs');
  }
  return resolved;
}

function readBytes(filename, limit) {
  const stat = fs.lstatSync(filename);
  check(stat.isFile() && stat.size <= limit, `Expected bounded regular file: ${filename}`);
  return fs.readFileSync(filename);
}

function descriptor(artifact, expected) {
  const bytes = readBytes(path.join(artifact, DESCRIPTOR), 16 * 1024 ** 2);
  check(sha256(bytes) === expected, 'Trusted descriptor checksum mismatch');
  const result = JSON.parse(bytes);
  digest(result.key, 'asset key');
  digest(result.manifestSha256, 'manifest checksum');
  check(result.producer?.platform === 'linux' && ['x64', 'arm64'].includes(result.producer.arch),
    'Missing or unsupported descriptor producer architecture');
  return result;
}

function assetIdentity(value) {
  return { key: digest(value.key, 'asset key'),
    descriptorSha256: digest(value.descriptorSha256, 'descriptor checksum'),
    manifestSha256: digest(value.manifestSha256, 'manifest checksum') };
}

function validateRequest(request, command) {
  const common = ['optIn', 'identity', 'root', 'output', 'platform'];
  fields(request, command === 'produce' ? common :
    [...common, 'artifact', 'receipt', 'receiptSha256', 'producerPlatform', 'target'], 'request');
  check(request.optIn === true, 'Explicit optIn: true is required');
  const identity = provenance(request.identity);
  check(request.platform === nativePlatform(), 'Requested platform must match the native pilot host');
  const root = directory(request.root, 'root');
  return { identity, root };
}

function reserve(output) {
  // An exclusive, private directory is also a failed-attempt marker. Never
  // reuse or delete it on error; only a completed receipt/plan means success.
  fs.mkdirSync(output, { mode: 0o700 });
  fs.chmodSync(output, 0o700);
}

function writeRecord(filename, value) {
  const bytes = json(value);
  fs.writeFileSync(filename, bytes, { flag: 'wx', mode: 0o400 });
  fs.chmodSync(filename, 0o400);
  return sha256(bytes);
}

async function producePilot(request, builder) {
  const { identity, root } = validateRequest(request, 'produce');
  const output = freshOutput(request.output, [root]);
  reserve(output);
  // The existing producer checks the complete clean source/toolchain identity,
  // builds in the caller's disposable checkout, and packages its own inventory.
  const result = await produce(root, identity.revision, path.join(output, 'artifact'), builder);
  const description = descriptor(result.directory, result.descriptorSha256);
  check(nativePlatform(description.producer) === request.platform, 'Producer architecture mismatch');
  check(description.identity.revision === identity.revision && description.key === result.key,
    'Producer result identity mismatch');
  const receipt = { schemaVersion: 1, contract: CONTRACT, implementationSha256: implementationSha256(),
    identity, producerPlatform: request.platform,
    assets: assetIdentity({ ...result, manifestSha256: description.manifestSha256 }) };
  const receiptPath = path.join(output, 'receipt.json');
  const receiptSha256 = writeRecord(receiptPath, receipt);
  return { receipt: receiptPath, receiptSha256, artifact: result.directory };
}

function buildInvocation(root, stage, output, identity, platform, target, manifestSha256) {
  return { command: 'docker', args: ['buildx', 'build', '--platform', platform, '--target', target,
    '--build-arg', 'WEB_ASSETS=shared', '--build-arg', `SOURCE_REVISION=${identity.revision}`,
    '--build-arg', `WEB_ASSETS_MANIFEST_SHA256=${manifestSha256}`,
    '--build-context', `web-assets=${stage}`,
    '--output', `type=oci,dest=${path.join(output, 'image.oci.tar')}`, root], cwd: root, shell: false };
}

async function preparePilot(request) {
  const { identity, root } = validateRequest(request, 'prepare');
  check(PLATFORMS.includes(request.producerPlatform), 'Explicit supported producerPlatform required');
  check(TARGETS.includes(request.target), 'Unsupported Docker target');
  digest(request.receiptSha256, 'independently trusted receiptSha256');
  const receiptPath = absolute(request.receipt, 'receipt');
  const bytes = readBytes(receiptPath, 64 * 1024);
  check(sha256(bytes) === request.receiptSha256, 'Trusted receipt checksum mismatch');
  const receipt = JSON.parse(bytes);
  fields(receipt, ['schemaVersion', 'contract', 'implementationSha256', 'identity', 'producerPlatform', 'assets'], 'receipt');
  check(receipt.schemaVersion === 1 && receipt.contract === CONTRACT, 'Unsupported pilot receipt contract');
  check(receipt.implementationSha256 === implementationSha256(), 'Pilot implementation mismatch');
  check(json(provenance(receipt.identity)) === json(identity), 'Source/workflow identity mismatch');
  check(receipt.producerPlatform === request.producerPlatform, 'Receipt producer architecture mismatch');
  fields(receipt.assets, ['key', 'descriptorSha256', 'manifestSha256'], 'receipt assets');
  const assets = assetIdentity(receipt.assets);
  const artifact = directory(request.artifact, 'artifact');
  const canonicalReceipt = fs.realpathSync(receiptPath);
  check(!inside(root, artifact) && !inside(artifact, root) && !inside(root, canonicalReceipt),
    'Workspace artifact and receipt must be separate from the source checkout');
  const description = descriptor(artifact, assets.descriptorSha256);
  check(nativePlatform(description.producer) === receipt.producerPlatform, 'Descriptor producer architecture mismatch');
  check(description.identity.revision === identity.revision && description.key === assets.key &&
    description.manifestSha256 === assets.manifestSha256, 'Descriptor/receipt asset identity mismatch');
  const output = freshOutput(request.output, [root, artifact, canonicalReceipt]);
  reserve(output);
  const stage = path.join(output, 'web-assets');
  // A required workspace miss is fatal. Never rebuild, select local assets,
  // derive expected hashes from the payload, or restamp metadata here.
  const restored = await consume(root, identity.revision, artifact, assets.descriptorSha256, stage);
  check(restored.key === assets.key && restored.descriptorSha256 === assets.descriptorSha256,
    'Restored asset identity mismatch');
  const plan = { schemaVersion: 1, contract: CONTRACT, implementationSha256: receipt.implementationSha256,
    identity, producerPlatform: receipt.producerPlatform, consumerPlatform: request.platform,
    receiptSha256: request.receiptSha256, assets, stage,
    invocation: buildInvocation(root, stage, output, identity, request.platform, request.target, assets.manifestSha256) };
  const planPath = path.join(output, 'plan.json');
  const planSha256 = writeRecord(planPath, plan);
  return { plan: planPath, planSha256, stage };
}

async function main(argv) {
  check(argv.length === 2 && ['produce', 'prepare'].includes(argv[0]),
    'Usage: node pilot.cjs produce|prepare ABSOLUTE_REQUEST.json');
  const request = JSON.parse(readBytes(absolute(argv[1], 'request'), 64 * 1024));
  return argv[0] === 'produce' ? producePilot(request) : preparePilot(request);
}

module.exports = { producePilot, preparePilot, nativePlatform, main };
if (require.main === module) main(process.argv.slice(2)).then(result => {
  process.stdout.write(json(result));
}).catch(error => {
  process.stderr.write(`Shared web asset pilot rejected: ${error.message}\n`);
  process.exitCode = 1;
});
