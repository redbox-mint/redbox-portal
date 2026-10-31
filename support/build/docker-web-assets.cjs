#!/usr/bin/env node
// Docker consumer of the existing integration asset contract. Never restamp an
// imported payload: the expected manifest digest comes from the trusted caller.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function prepare(command, mode, revision, digest, root = process.cwd()) {
  assert(['verify', 'integration'].includes(command), 'Command must be verify or integration');
  assert(['local', 'shared'].includes(mode), 'WEB_ASSETS must be local or shared');
  if (mode === 'local' && command === 'verify') return null;
  assert(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(revision || ''), 'SOURCE_REVISION must be a full lowercase Git revision');
  const assets = require('./integration-prebuilt-assets.cjs');
  if (mode === 'shared') {
    assert(/^[0-9a-f]{64}$/.test(digest || ''),
      'WEB_ASSETS_MANIFEST_SHA256 must be an independently trusted lowercase SHA-256');
    const bytes = fs.readFileSync(path.join(root, assets.MANIFEST));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), digest,
      'Trusted web asset manifest checksum mismatch');
  } else {
    // Preserve the ordinary integration-image path, which builds its own assets.
    assets.generate(root, revision);
  }
  return assets.verify(root, revision);
}

module.exports = { prepare };
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    assert(args.length === 4 || args.length === 5,
      'Usage: docker-web-assets.cjs verify|integration local|shared REVISION MANIFEST_SHA256 [ROOT]');
    const manifest = prepare(...args);
    console.log(manifest ? `Verified ${manifest.files.length} web assets for ${manifest.revision}` : 'Using locally built web assets');
  } catch (error) {
    console.error(`Docker web assets rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
