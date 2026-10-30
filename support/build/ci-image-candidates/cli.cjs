#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { prepare, verify, planPromotion, promote, json, sha256 } = require('./candidates.cjs');
const { DockerAdapter, GitAdapter, RegistryAdapter } = require('./adapters.cjs');

async function main(args) {
  const [command, file, adapterFile, ...extra] = args;
  if (!['prepare', 'verify', 'plan', 'promote', 'policy-digest'].includes(command) || !file || extra.length ||
    (command !== 'promote' && adapterFile)) {
    throw new Error('Usage: node cli.cjs prepare|verify|plan|policy-digest CONFIG.json\n       node cli.cjs promote CONFIG.json TRUSTED-ADAPTER.cjs');
  }
  const options = JSON.parse(await fs.readFile(file, 'utf8'));
  if (command === 'policy-digest') return sha256(json(options));
  if (command === 'plan') return planPromotion(options);
  const docker = new DockerAdapter();
  const git = new GitAdapter();
  if (command === 'prepare') return prepare(options, { docker, git });
  if (command === 'verify') return verify(options, { docker });
  if (!adapterFile) throw new Error('promote requires a trusted coordinator/authorization adapter; use plan for a read-only preview');
  // This is executable trusted policy code, never a workspace-supplied adapter from a build job.
  const { coordinator, authorize } = require(path.resolve(adapterFile));
  return promote(options, { docker, git, registry: new RegistryAdapter(), coordinator, authorize });
}
if (require.main === module) main(process.argv.slice(2)).then(result => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}).catch(error => {
  process.stderr.write(`ci-image-candidates: ${error.message}\n`);
  process.exitCode = 1;
});
module.exports = { main };
