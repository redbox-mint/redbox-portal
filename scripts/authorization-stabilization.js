#!/usr/bin/env node
'use strict';
const { readFileSync, statSync } = require('node:fs');

/** No lift, network, writes, report mutation or authorization-mode change. */
function probe(policyPath, evidencePath, verify, now = new Date()) {
  const read = path => {
    if (statSync(path).size > 32 * 1024 * 1024) throw new Error('Evidence exceeds the read-only probe limit.');
    return JSON.parse(readFileSync(path, 'utf8'));
  };
  return verify(read(policyPath), read(evidencePath), now);
}
module.exports = { probe };
if (require.main === module) {
  try {
    if (process.argv.length !== 4) throw new Error('Expected policy and evidence files.');
    const { verifyAuthorizationStabilization } = require('../packages/redbox-core/dist/authorization/stabilization');
    const result = probe(process.argv[2], process.argv[3], verifyAuthorizationStabilization);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.closed ? 0 : 2;
  } catch {
    process.stderr.write('Stabilization remains OPEN: invalid, missing, oversized or unavailable evidence/verifier.\n');
    process.exitCode = 2;
  }
}
