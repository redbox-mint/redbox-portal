#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { identity, sha256, json, check } = require('./identity.cjs');
const { pack, unpack, fileHash } = require('./archive.cjs');
const { build } = require('./prepare.cjs');

const ARCHIVE = 'assets.tar.gz';
const DESCRIPTOR = 'artifact.json';
const inside = (parent, child) => child === parent || child.startsWith(`${parent}${path.sep}`);
const validator = () => require('../integration-prebuilt-assets.cjs');

function outsideCheckout(root, destination) {
  root = fs.realpathSync(root);
  const absolute = path.resolve(destination);
  check(!fs.existsSync(absolute), `Destination already exists: ${absolute}`);
  // Parent must exist. Resolve symlinks before checking boundaries or writing.
  const resolved = path.join(fs.realpathSync(path.dirname(absolute)), path.basename(absolute));
  check(!inside(root, resolved) && !inside(resolved, root), 'Destination must be separate from the source checkout');
  return resolved;
}

async function produce(root, revision, destination, builder = build) {
  root = fs.realpathSync(root);
  destination = outsideCheckout(root, destination);
  const before = identity(root, revision);
  await builder(root, before);
  check(json(identity(root, revision)) === json(before), 'Source/toolchain changed during build');
  const assets = validator();
  const manifest = assets.generate(root, revision);
  const temporary = fs.mkdtempSync(path.join(path.dirname(destination), '.web-assets-produce-'));
  try {
    const metadata = [assets.MANIFEST, assets.IMAGE_IDENTITY].map(filename => {
      const bytes = fs.readFileSync(path.join(root, filename));
      return { path: filename, size: bytes.length, sha256: sha256(bytes) };
    });
    await pack(root, [...metadata, ...manifest.files], path.join(temporary, ARCHIVE));
    assets.verify(root, revision);
    check(json(identity(root, revision)) === json(before), 'Source/toolchain changed during packaging');
    const descriptor = {
      schemaVersion: 1, identity: before, key: sha256(json(before)),
      producer: { platform: process.platform, arch: process.arch },
      portableTo: ['linux/amd64', 'linux/arm64'],
      archive: { filename: ARCHIVE, size: fs.statSync(path.join(temporary, ARCHIVE)).size,
        sha256: await fileHash(path.join(temporary, ARCHIVE)) },
      // Reuse the integration manifest's inventory; do not define another one.
      manifestSha256: metadata[0].sha256,
    };
    const bytes = json(descriptor);
    const checksum = sha256(bytes);
    fs.writeFileSync(path.join(temporary, DESCRIPTOR), bytes, { flag: 'wx' });
    fs.writeFileSync(path.join(temporary, `${DESCRIPTOR}.sha256`), `${checksum}  ${DESCRIPTOR}\n`, { flag: 'wx' });
    fs.renameSync(temporary, destination);
    return { key: descriptor.key, descriptorSha256: checksum, directory: destination };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

async function consume(root, revision, artifact, expectedChecksum, destination) {
  root = fs.realpathSync(root);
  if (destination) destination = outsideCheckout(root, destination);
  check(typeof expectedChecksum === 'string' && /^[a-f0-9]{64}$/.test(expectedChecksum),
    'Expected artifact.json SHA-256 from the trusted producer/workspace');
  const descriptorPath = path.join(artifact, DESCRIPTOR);
  check(fs.lstatSync(descriptorPath).isFile(), 'Descriptor must be a regular file');
  check(fs.statSync(descriptorPath).size < 16 * 1024 ** 2, 'Descriptor too large');
  const bytes = fs.readFileSync(descriptorPath);
  check(sha256(bytes) === expectedChecksum, 'Artifact descriptor checksum mismatch');
  const descriptor = JSON.parse(bytes);
  const expected = identity(root, revision);
  check(descriptor.schemaVersion === 1 && json(descriptor.identity) === json(expected) &&
    descriptor.key === sha256(json(expected)), 'Asset revision/source/toolchain/flags mismatch');
  check(json(descriptor.portableTo) === json(['linux/amd64', 'linux/arm64']), 'Invalid asset platform contract');
  check(descriptor.archive?.filename === ARCHIVE, 'Invalid archive filename');
  const archivePath = path.join(artifact, ARCHIVE);
  check(fs.lstatSync(archivePath).isFile(), 'Archive must be a regular file');
  check(fs.statSync(archivePath).size === descriptor.archive.size &&
    await fileHash(archivePath) === descriptor.archive.sha256, 'Archive size/checksum mismatch');
  const parent = destination ? path.dirname(destination) : os.tmpdir();
  const temporary = fs.mkdtempSync(path.join(parent, '.web-assets-consume-'));
  // A private empty directory plus regular-file-only extraction prevents link
  // attacks and leaves the checkout/destination intact on every validation miss.
  fs.chmodSync(temporary, 0o700);
  try {
    await unpack(archivePath, temporary);
    const assets = validator();
    check(sha256(fs.readFileSync(path.join(temporary, assets.MANIFEST))) === descriptor.manifestSha256,
      'Integration manifest checksum mismatch');
    const manifest = assets.verify(temporary, revision);
    check(json(identity(root, revision)) === json(expected), 'Source/toolchain changed during restore');
    if (destination) fs.renameSync(temporary, destination);
    return { key: descriptor.key, descriptorSha256: expectedChecksum,
      files: manifest.files.length, directory: destination || null };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

async function main(args) {
  const [command, revision, root, artifact, checksum, destination] = args;
  check(['key', 'produce', 'verify', 'restore'].includes(command),
    'Usage: key REV ROOT | produce REV ROOT NEW_ARTIFACT_DIR | verify REV ROOT ARTIFACT_DIR SHA256 | restore REV ROOT ARTIFACT_DIR SHA256 NEW_STAGE_DIR');
  const length = { key: 3, produce: 4, verify: 5, restore: 6 }[command];
  check(args.length === length, `Wrong arguments for ${command}`);
  if (command === 'key') console.log(sha256(json(identity(root, revision))));
  else if (command === 'produce') console.log(json(await produce(root, revision, artifact)));
  else {
    try {
      console.log(json(await consume(root, revision, artifact, checksum, destination)));
    } catch (error) {
      console.error(`WEB_ASSETS_CACHE_MISS: ${error.message}. Rebuild with produce in the asset producer; never restamp or reuse this payload.`);
      process.exitCode = 10;
    }
  }
}

module.exports = { produce, consume, outsideCheckout, ARCHIVE, DESCRIPTOR };
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(`Web asset build rejected: ${error.message}`);
  process.exitCode = 1;
});
