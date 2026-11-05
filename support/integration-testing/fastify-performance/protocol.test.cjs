'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertDisposableState } = require('./state.cjs');
const { buildReport } = require('./report.cjs');
const {
  protocol,
  cells,
  metadata,
  patch,
  attachment,
  hash,
  nearestRank,
  summarize,
  aggregate,
} = require('./protocol.cjs');
test('FM-005 cells independently cover both transports and every payload/concurrency', () => {
  assert.equal(cells.length, 20);
  assert.equal(new Set(cells.map(cell => cell.id)).size, 20);
  for (const profile of ['direct', 'proxy']) {
    const selected = cells.filter(cell => cell.profile === profile);
    for (const workload of ['W1', 'W2', 'W3'])
      assert.equal(selected.filter(cell => cell.workload === workload).length, 2);
    for (const size of [1048576, 33554432])
      assert.deepEqual(
        selected.filter(cell => cell.size === size).map(cell => cell.concurrency),
        [1, 4]
      );
  }
  assert.equal(protocol.repetitions, 5);
  assert.equal(protocol.warmupMs, 30000);
  assert.equal(protocol.measureMs, 120000);
});
test('seed and alternating patches have exact UTF-8 lengths and independent identities', () => {
  for (let index = 0; index < 1000; index++) assert.equal(Buffer.byteLength(JSON.stringify(metadata(index))), 8192);
  assert.notDeepEqual(metadata(0), metadata(0, true));
  assert.equal(Buffer.byteLength(patch(0)), 1024);
  assert.equal(Buffer.byteLength(patch(1)), 1024);
  assert.notEqual(patch(0), patch(1));
  assert.equal(attachment(1048576).length, 1048576);
  assert.equal(hash(attachment(1048576)), hash(attachment(1048576)));
});
test('boundary completions count once and late/errors never improve timed throughput', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({
    startMs: i,
    firstByteMs: i + 1,
    endMs: i + 2,
    bytes: 8192,
    error: null,
  }));
  rows.push({ startMs: 119999, firstByteMs: 120001, endMs: 120003, bytes: 33554432, error: null });
  const result = summarize(rows);
  assert.equal(result.completed, 100);
  assert.equal(result.late, 1);
  assert.equal(result.bytesPerSecond, 819200 / 120);
  assert.equal(result.lateBytes, 33554432);
  assert.equal(result.lateP95Ms, 4);
  assert.equal(result.valid, true);
  rows.push({ startMs: 100, firstByteMs: 30100, endMs: 30100, bytes: 0, error: 'timeout' });
  const rejected = summarize(rows);
  assert.equal(rejected.valid, false);
  assert.equal(rejected.timeouts, 1);
  assert.equal(rejected.completed, 100);
  assert.equal(summarize([]).valid, false);
  assert.equal(summarize(rows.slice(0, 99)).valid, false);
  const tail = summarize([
    ...rows.slice(0, 100),
    ...Array.from({ length: 6 }, () => ({
      startMs: 119999,
      firstByteMs: 120000,
      endMs: 121999,
      bytes: 1,
      error: null,
    })),
  ]);
  assert.equal(tail.p95Ms, 2000, 'slow boundary completions remain in latency quantiles');
});
test('nearest-rank p95, median, full range and variability retain every attempt', () => {
  assert.equal(nearestRank(Array.from({ length: 100 }, (_, i) => i + 1)), 95);
  const runs = [90, 95, 100, 105, 110].map(value => ({
    valid: true,
    p95Ms: value,
    ttfbP95Ms: value,
    completedPerSecond: value,
    bytesPerSecond: value,
  }));
  const result = aggregate(runs);
  assert.equal(result.p95Ms.median, 100);
  assert.equal(result.p95Ms.variabilityPct, 20);
  assert.deepEqual(result.p95Ms.values, [90, 95, 100, 105, 110]);
  assert.throws(() => aggregate(runs.slice(1)));
  assert.throws(() => aggregate([...runs.slice(0, 4), { ...runs[4], valid: false }]));
});

test('state guard rejects unsafe, unmarked and symlinked paths before cleanup or acquisition', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fm007-guard-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const unsafe = path.join(temporary, 'production');
  fs.mkdirSync(path.join(unsafe, 'app'), { recursive: true });
  const sentinel = path.join(unsafe, 'app', 'keep.txt');
  fs.writeFileSync(sentinel, 'preserve production');
  assert.throws(() => assertDisposableState('/srv/production'), /unsafe FM007_STATE/);
  for (const action of ['clean', 'all', 'start', 'run']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'run.cjs'), action], {
      env: { ...process.env, FM007_STATE: unsafe, PATH: '' },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unsafe FM007_STATE/);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve production');
  }
  const state = path.join(temporary, 'fm007-state');
  assert.equal(assertDisposableState(state, { create: true }), state);
  assert.equal(assertDisposableState(state), state);
  const unmarked = path.join(temporary, 'fm007-state-unmarked');
  fs.mkdirSync(unmarked);
  assert.throws(() => assertDisposableState(unmarked, { create: true }), /unsafe FM007_STATE/);
  const linked = path.join(temporary, 'fm007-state-linked');
  fs.symlinkSync(state, linked);
  assert.throws(() => assertDisposableState(linked), /unsafe FM007_STATE/);
  fs.unlinkSync(path.join(state, '.fm007-disposable-state'));
  fs.symlinkSync(sentinel, path.join(state, '.fm007-disposable-state'));
  assert.throws(() => assertDisposableState(state), /unsafe FM007_STATE/);
});

test('report preserves completed timeout attempts, excludes their batch and works without raw logs', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fm007-report-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const cell = cells[0];
  const goodRows = Array.from({ length: 100 }, (_, index) => ({
    cell: cell.id,
    startMs: index,
    firstByteMs: index + 1,
    endMs: index + 2,
    bytes: 8192,
    status: 200,
    error: null,
  }));
  const badRows = [
    ...goodRows,
    {
      cell: cell.id,
      startMs: 100,
      firstByteMs: 30100,
      endMs: 30100,
      bytes: 0,
      status: null,
      error: 'timeout',
    },
  ];
  const resource = {
    hostSamples: 119,
    nodeSamples: 119,
    nodeCpuPct: 10,
    nodeRssHighWaterMiB: 100,
    nodeHeapHighWaterMiB: 50,
    retainedRssMiB: 100,
    retainedHeapMiB: 50,
    completionAndDrainMs: 10,
    unrelatedCpuPctOneCore: 1,
    providers: { generator: { cpuPctOneCore: 5 }, 'fm007-proxy': { cpuPctOneCore: 2 } },
  };
  const saved = {};
  for (const repetition of [1, 2, 3, 4, 5]) {
    const directory = `test-${cell.id}-${repetition}`;
    fs.mkdirSync(path.join(temporary, directory));
    const result = {
      cell,
      smoke: false,
      completed: true,
      valid: repetition !== 5,
      metrics: summarize(repetition === 5 ? badRows : goodRows),
      afterMeasurement: { measuredCount: 1000 },
      stop: { persistence: { pools: 0 } },
      unexpectedRefreshGets: 0,
    };
    const body = JSON.stringify(result);
    fs.writeFileSync(path.join(temporary, directory, 'result.json'), body);
    saved[directory] = { resultSha256: hash(body), resource };
  }
  fs.writeFileSync(path.join(temporary, 'resource-summaries.json'), JSON.stringify(saved));
  const badDirectory = `test-${cell.id}-5`;
  const raw = path.join(temporary, badDirectory, 'requests.jsonl');
  fs.writeFileSync(raw, badRows.map(row => JSON.stringify(row)).join('\n') + '\n');
  const report = buildReport(temporary);
  assert.equal(report.attempts.length, 5);
  const failed = report.attempts.find(attempt => attempt.directory === badDirectory);
  assert.equal(failed.valid, false);
  assert.equal(failed.completed, true);
  assert.equal(failed.rawMetrics.errors, 1);
  assert.equal(failed.rawMetrics.timeouts, 1);
  assert.equal(failed.rawMetrics.completed, 100);
  assert.equal(failed.resource.nodeCpuPct, 10, 'invalid completed telemetry remains visible');
  assert.equal(report.batches[cell.id].test.complete, false);
  assert.equal(report.batches[cell.id].test.metrics, undefined);
  fs.unlinkSync(raw);
  assert.equal(buildReport(temporary).attempts.find(attempt => !attempt.valid).metrics.timeouts, 1);
  fs.writeFileSync(raw, '{truncated');
  assert.equal(buildReport(temporary).attempts.length, 5);
  const badResult = path.join(temporary, badDirectory, 'result.json');
  const bad = JSON.parse(fs.readFileSync(badResult));
  bad.valid = true;
  fs.writeFileSync(badResult, JSON.stringify(bad));
  fs.writeFileSync(raw, badRows.map(row => JSON.stringify(row)).join('\n') + '\n');
  assert.throws(() => buildReport(temporary), /raw error/);
});
