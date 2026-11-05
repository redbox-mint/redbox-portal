'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

// FM-005 is the controlling specification. Changes invalidate both sides of a comparison.
const protocol = Object.freeze({
  version: 1,
  warmupMs: 30000,
  measureMs: 120000,
  requestTimeoutMs: 30000,
  drainMs: 60000,
  outerSeconds: 600,
  repetitions: 5,
  records: 1000,
  warmRecords: 100,
  metadataBytes: 8192,
  patchBytes: 1024,
  minCompletions: 100,
  mutationRecordsPerWorker: 1,
  seedRevision: 0,
  portalPort: 18570,
  controlPort: 18574,
  proxyPort: 18572,
  tlsPort: 18573,
  mongoPort: 19570,
  solrPort: 19571,
});
const cells = ['direct', 'proxy']
  .flatMap(profile => [
    ...['W1', 'W3'].flatMap(workload => [1, 8].map(concurrency => ({ profile, workload, concurrency }))),
    ...[1, 4].map(concurrency => ({ profile, workload: 'W2', concurrency })),
    ...[1048576, 33554432].flatMap(size => [1, 4].map(concurrency => ({ profile, workload: 'W4', concurrency, size }))),
  ])
  .map(cell => ({ ...cell, id: `${cell.profile}-${cell.workload}-${cell.size || 0}-c${cell.concurrency}` }));
function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}
function metadata(index, warm = false) {
  const value = { title: `FM007 ${warm ? 'warm' : 'measured'} ${String(index).padStart(4, '0')}`, padding: '' };
  value.padding = 's'.repeat(protocol.metadataBytes - Buffer.byteLength(JSON.stringify(value)));
  assert.equal(Buffer.byteLength(JSON.stringify(value)), protocol.metadataBytes);
  return value;
}
function patch(alternative) {
  const value = { title: `FM007 mutation ${alternative % 2}`, padding: '' };
  value.padding = String(alternative % 2).repeat(protocol.patchBytes - Buffer.byteLength(JSON.stringify(value)));
  const body = JSON.stringify(value);
  assert.equal(Buffer.byteLength(body), protocol.patchBytes);
  return body;
}
function attachment(size) {
  const block = Buffer.alloc(65536);
  for (let i = 0; i < block.length; i++) block[i] = (i * 31 + 17) % 251;
  return Buffer.concat(
    Array.from({ length: Math.ceil(size / block.length) }, () => block),
    size
  );
}
function nearestRank(values, fraction = 0.95) {
  assert(values.length > 0 && values.every(Number.isFinite));
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}
function summarize(rows, durationMs = protocol.measureMs) {
  const completed = rows.filter(row => !row.error && row.endMs <= durationMs);
  const late = rows.filter(row => !row.error && row.endMs > durationMs);
  const successful = [...completed, ...late];
  const errors = rows.filter(row => row.error);
  const reasons = [];
  if (completed.length < protocol.minCompletions) reasons.push('fewer-than-100-completions');
  if (errors.length) reasons.push('unexpected-errors');
  return {
    offered: rows.length,
    completed: completed.length,
    late: late.length,
    errors: errors.length,
    timeouts: errors.filter(row => row.error === 'timeout').length,
    p95Ms: successful.length ? nearestRank(successful.map(row => row.endMs - row.startMs)) : null,
    ttfbP95Ms: successful.length ? nearestRank(successful.map(row => row.firstByteMs - row.startMs)) : null,
    lateP95Ms: late.length ? nearestRank(late.map(row => row.endMs - row.startMs)) : null,
    completedPerSecond: completed.length / (durationMs / 1000),
    bytesPerSecond: completed.reduce((sum, row) => sum + row.bytes, 0) / (durationMs / 1000),
    lateBytes: late.reduce((sum, row) => sum + row.bytes, 0),
    valid: !reasons.length,
    reasons,
  };
}
function aggregate(runs) {
  assert.equal(runs.length, protocol.repetitions, 'exactly five attempts are required');
  assert(
    runs.every(run => run.valid),
    'an invalid attempt cannot be selected away'
  );
  return Object.fromEntries(
    ['p95Ms', 'ttfbP95Ms', 'completedPerSecond', 'bytesPerSecond'].map(key => {
      const values = runs.map(run => run[key]);
      assert(values.every(value => Number.isFinite(value) && value > 0));
      const sorted = [...values].sort((a, b) => a - b),
        median = sorted[2];
      return [
        key,
        { values, median, min: sorted[0], max: sorted[4], variabilityPct: ((sorted[4] - sorted[0]) / median) * 100 },
      ];
    })
  );
}
module.exports = { protocol, cells, metadata, patch, attachment, hash, nearestRank, summarize, aggregate };
