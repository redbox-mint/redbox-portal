#!/usr/bin/env node
'use strict';

// Offline, opt-in cleanup. A generated banner alone never authorizes deletion.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

async function reconcile(appPath, manifest, apply = false) {
  const root = await fs.realpath(appPath);
  const results = [];
  const candidates = manifest.files.filter(entry => entry.generatedHeader && !entry.tracked);
  for (const entry of candidates) {
    if (!/^(?:api\/(?:controllers|services|policies|middleware|responses|form-config|models)\/[\w./-]+|config\/[\w.-]+\.js)$/.test(entry.file) || entry.file.split('/').includes('..')) {
      throw new Error('Invalid generated-file manifest path');
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid generated-file digest');
  }
  for (const entry of candidates) {
    const file = path.join(root, entry.file);
    let state = 'missing';
    try {
      const stat = await fs.lstat(file);
      // Reject symlinks in every path component, including parent directories.
      if (!stat.isFile() || await fs.realpath(file) !== file) state = 'preserved';
      else {
        const digest = createHash('sha256').update(await fs.readFile(file)).digest('hex');
        state = digest === entry.sha256 ? 'exact' : 'preserved';
        if (state === 'exact' && apply) {
          await fs.unlink(file);
          state = 'removed';
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    results.push({ file: entry.file, state });
  }
  return results;
}

module.exports = { reconcile };
if (require.main === module) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const positional = args.filter(value => value !== '--apply');
  if (positional.length !== 2 || args.some(value => value.startsWith('--') && value !== '--apply')) {
    console.error('Usage: node retire-v5-shims.cjs <application-directory> <trusted-generated-file-manifest.json> [--apply]');
    process.exitCode = 2;
  } else {
    fs.readFile(positional[1], 'utf8')
      .then(JSON.parse)
      .then(manifest => reconcile(positional[0], manifest, apply))
      .then(results => {
        console.log(JSON.stringify({ apply, results }, null, 2));
        if (results.some(result => result.state === 'preserved')) process.exitCode = 2;
      })
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
