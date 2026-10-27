'use strict';
// Usage: node .../reconcile-retirement-inventory.cjs <SR-001-rerun.json> <AST-closure.json>
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-inventory.json'), 'utf8'));
const current = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const closure = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
assert.equal(current.sourceCommit, closure.commit);
assert.equal(closure.executableViolations, 0);
assert.equal(closure.forbiddenDependencyEntries, 0);
assert.equal(current.unclassified.length, 0);
const tracked = new Set(
  execFileSync('git', ['ls-tree', '-r', '--name-only', current.sourceCommit], { encoding: 'utf8' }).trim().split('\n')
);
const candidates = new Map(current.entries.map(entry => [entry.file, entry]));
const classifications = new Map();
for (const item of closure.classified) {
  const reasons = classifications.get(item.file) || new Set();
  reasons.add(item.reason);
  classifications.set(item.file, reasons);
}
function classify(file) {
  if (!tracked.has(file))
    return { outcome: 'removed', reason: 'Old source/output retired; migration owner retained from SR-001.' };
  if (!candidates.has(file))
    return {
      outcome: 'retained-without-candidates',
      reason: 'Committed file retained; original SR-001 signals no longer present.',
    };
  if (/package(?:-lock)?\.json$/.test(file))
    return {
      outcome: 'dependency-metadata-checked',
      reason: 'Structural manifest/lock scan: no forbidden runtime dependencies; exact owned pins.',
    };
  const reasons = classifications.get(file);
  assert.ok(reasons?.size, 'Unreconciled current candidate: ' + file);
  return { outcome: 'remaining-classified', reasons: [...reasons].sort(), lines: candidates.get(file).lines };
}
const entries = baseline.entries.map(entry => ({
  file: entry.file,
  originalClassification: entry.classification,
  migrationOwner: entry.migrationOwner,
  ...classify(entry.file),
}));
assert.equal(entries.length, 1261);
const counts = {};
for (const entry of entries) counts[entry.outcome] = (counts[entry.outcome] || 0) + 1;
const oldFiles = new Set(baseline.entries.map(entry => entry.file));
const newCandidates = current.entries
  .filter(entry => !oldFiles.has(entry.file))
  .map(entry => ({ file: entry.file, ...classify(entry.file) }));
console.log(
  JSON.stringify(
    {
      baseline: baseline.sourceCommit,
      sourceCommit: current.sourceCommit,
      method:
        'Rerun original SR-001 method; reconcile every baseline file against committed paths/candidates and successful AST/dependency closure. Removed/renamed source retains original migration owner. Historical names, finite conversions and explicit neutral parameter inputs are classified.',
      baselineFiles: entries.length,
      currentMatchedFiles: current.matchedFiles,
      executableViolations: closure.executableViolations,
      forbiddenDependencyEntries: closure.forbiddenDependencyEntries,
      counts,
      entries,
      newCandidates,
    },
    null,
    2
  )
);
