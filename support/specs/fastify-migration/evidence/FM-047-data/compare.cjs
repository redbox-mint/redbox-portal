'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const performance = path.resolve(__dirname, '../../../../integration-testing/fastify-performance');
const { buildReport } = require(path.join(performance, 'report.cjs'));
const { cells, protocol } = require(path.join(performance, 'protocol.cjs'));

const rawRoot = path.resolve(process.argv[2]);
const candidateBatch = process.argv[3];
assert(candidateBatch, 'supply the regular candidate batch name');
const historical = require('../FM-007-data/baseline.json');
assert.equal(historical.selection.baselineBatch, 'express-02');
const report = buildReport(rawRoot, { verifyRaw: true });

function counts(runs) {
  const total = { offered: 0, completed: 0, late: 0, errors: 0, timeouts: 0, unaccounted: 0 };
  let unknown = 0;
  for (const { metrics } of runs) {
    if (!metrics) {
      unknown++;
      continue;
    }
    for (const key of Object.keys(total)) {
      if (key !== 'unaccounted') total[key] += metrics[key];
    }
    const unaccounted = metrics.offered - metrics.completed - metrics.late - metrics.errors;
    assert(unaccounted >= 0);
    total.unaccounted += unaccounted;
  }
  return { ...total, attemptsWithUnknownCounts: unknown };
}

const comparison = {};
for (const cell of cells) {
  const baseline = historical.cells[cell.id];
  assert(baseline.complete && baseline.attempts.length === protocol.repetitions);
  const baselineRuns = baseline.attempts.map(attempt => require(`../FM-007-data/${attempt}/result.json`));
  const expressCounts = counts(baselineRuns);
  const prefix = `${candidateBatch}-${cell.id}-`;
  const runs = report.attempts.filter(attempt => attempt.directory.startsWith(prefix));
  assert(runs.every(run => run.cell === cell.id && !run.smoke));
  const fastifyCounts = counts(runs);
  const candidate = report.batches[cell.id][candidateBatch];
  const row = {
    baseline: { ...baseline, counts: expressCounts },
    candidate: { ...candidate, counts: fastifyCounts, validAttempts: runs.filter(run => run.valid).length },
  };
  if (candidate?.complete) {
    assert.equal(expressCounts.errors + expressCounts.timeouts + expressCounts.unaccounted, 0);
    assert.equal(fastifyCounts.errors + fastifyCounts.timeouts + fastifyCounts.unaccounted, 0);
    const express = baseline.metrics;
    const fastify = candidate.metrics;
    const p95Pct = (fastify.p95Ms.median / express.p95Ms.median - 1) * 100;
    const throughputPct = (1 - fastify.completedPerSecond.median / express.completedPerSecond.median) * 100;
    row.deterioration = { p95Pct, throughputPct, exceeded: p95Pct > 10 || throughputPct > 10 };
  }
  comparison[cell.id] = row;
}

const attempts = report.attempts.map(attempt => ({
  ...attempt,
  counts: counts([attempt]),
}));
console.log(JSON.stringify({ candidateBatch, comparison, attempts }, null, 2));
