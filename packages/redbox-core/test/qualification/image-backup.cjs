// Verify the actual checkpoint payload, including layers that Docker may omit
// when only a locally cached OCI index remains. This is a read-only verifier.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createReadStream } = require('node:fs');
const { stat } = require('node:fs/promises');
const { createHash } = require('node:crypto');
(async () => {
  const archive = process.argv[2];
  assert(archive, 'Supply the saved image archive');
  const tar = args => {
    const result = spawnSync('tar', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(result.status, 0, 'Image archive must be a readable complete tar');
    return result.stdout;
  };
  const files = new Set(tar(['-tf', archive]).trim().split('\n'));
  const manifests = JSON.parse(tar(['-xOf', archive, 'manifest.json']));
  assert.equal(manifests.length, 1, 'Checkpoint selects one platform');
  const manifest = manifests[0];
  assert(files.has(manifest.Config), 'Saved image is missing its configuration payload');
  assert(manifest.Layers.length > 0, 'Saved image must contain filesystem layers');
  for (const layer of manifest.Layers) assert(files.has(layer), 'Saved image is missing a referenced filesystem layer');
  const config = JSON.parse(tar(['-xOf', archive, manifest.Config]));
  assert.equal(config.architecture, 'amd64');
  assert.equal(config.os, 'linux');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  console.log(JSON.stringify({ checks: 1, platform: 'linux/amd64', layers: manifest.Layers.length, bytes: (await stat(archive)).size, sha256: hash.digest('hex'), completePayload: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
