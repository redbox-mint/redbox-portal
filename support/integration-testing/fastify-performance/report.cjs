'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { protocol: p, cells, summarize, aggregate, hash } = require('./protocol.cjs');
function hasLines(filename) {
  return fs.existsSync(filename) || fs.existsSync(filename + '.gz');
}
function lines(filename) {
  const gz = filename + '.gz';
  const text = fs.existsSync(gz) ? gunzipSync(fs.readFileSync(gz)).toString() : fs.readFileSync(filename, 'utf8');
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}
function band(values) {
  assert.equal(values.length, 5);
  assert(values.every(Number.isFinite));
  const sorted = [...values].sort((a, b) => a - b),
    median = sorted[2];
  return {
    values,
    median,
    min: sorted[0],
    max: sorted[4],
    variabilityPct: median ? ((sorted[4] - sorted[0]) / median) * 100 : null,
  };
}
function resource(result, directory) {
  const begin = result.epoch,
    end = begin + p.measureMs;
  const host = lines(path.join(directory, 'host.jsonl')).filter(
    row => row.monotonicMs >= begin && row.monotonicMs <= end
  );
  const node = lines(path.join(directory, 'node.jsonl')).filter(
    row => row.monotonicMs >= begin && row.monotonicMs <= end
  );
  assert(host.length >= 110 && node.length >= 110, 'one-second telemetry must cover the timed window');
  const first = host[0],
    last = host.at(-1),
    seconds = (last.monotonicMs - first.monotonicMs) / 1000;
  const providers = {};
  const ownPids = new Set();
  for (const family of Object.keys(first.families)) {
    const start = new Map(first.families[family].map(proc => [proc.pid, proc.cpuTicks]));
    let ticks = 0;
    for (const proc of last.families[family])
      ticks += Math.max(0, proc.cpuTicks - (start.get(proc.pid) || proc.cpuTicks));
    for (const row of host) for (const proc of row.families[family]) ownPids.add(proc.pid);
    providers[family] = {
      cpuPctOneCore: (ticks / 100 / seconds) * 100,
      rssHighWaterMiB:
        Math.max(...host.map(row => row.families[family].reduce((sum, proc) => sum + proc.rssKiB, 0))) / 1024,
    };
  }
  const startProcesses = new Map(first.processes.map(proc => [proc.pid, proc]));
  const other = last.processes
    .filter(proc => !ownPids.has(proc.pid))
    .map(proc => ({
      pid: proc.pid,
      comm: proc.comm,
      cpuPctOneCore: Math.max(0, proc.cpuTicks - (startProcesses.get(proc.pid)?.cpuTicks ?? proc.cpuTicks)) / seconds,
    }));
  const nfirst = node[0],
    nlast = node.at(-1);
  const nodeCpuPct =
    (nlast.cpu.user + nlast.cpu.system - (nfirst.cpu.user + nfirst.cpu.system)) /
    (nlast.monotonicMs - nfirst.monotonicMs) /
    10;
  return {
    hostSamples: host.length,
    nodeSamples: node.length,
    providers,
    nodeCpuPct,
    nodeRssHighWaterMiB: Math.max(...node.map(row => row.memory.rss)) / 1048576,
    nodeHeapHighWaterMiB: Math.max(...node.map(row => row.memory.heapUsed)) / 1048576,
    retainedRssMiB: result.afterMeasurement.memoryAtDrain.rss / 1048576,
    retainedHeapMiB: result.afterMeasurement.memoryAtDrain.heapUsed / 1048576,
    completionAndDrainMs: result.completionAndDrainMs,
    unrelatedCpuPctOneCore: other.reduce((sum, proc) => sum + proc.cpuPctOneCore, 0),
    unrelatedTop: other.sort((a, b) => b.cpuPctOneCore - a.cpuPctOneCore).slice(0, 8),
  };
}
function buildReport(root, { rawRoot = root, saveResources = false, verifyRaw = false } = {}) {
  const resourceFile = path.join(root, 'resource-summaries.json');
  const saved = fs.existsSync(resourceFile) ? JSON.parse(fs.readFileSync(resourceFile)) : {};
  const attempts = [];
  for (const name of fs.readdirSync(root).sort()) {
    const directory = path.join(root, name),
      file = path.join(directory, 'result.json');
    if (!fs.existsSync(file)) continue;
    const result = JSON.parse(fs.readFileSync(file));
    const attempt = {
      directory: name,
      cell: result.cell.id,
      smoke: result.smoke,
      valid: result.valid,
      completed: result.completed,
      startedUtc: result.startedUtc,
      finishedUtc: result.finishedUtc,
      error: result.error,
      metrics: result.metrics,
      resultSha256: hash(fs.readFileSync(file)),
    };
    const rawDirectory = path.join(rawRoot, name);
    if (!result.smoke && result.completed && hasLines(path.join(rawDirectory, 'requests.jsonl'))) {
      try {
        const requests = lines(path.join(rawDirectory, 'requests.jsonl'));
        const actual = summarize(requests);
        if (result.valid) {
          assert.deepEqual(actual, result.metrics, `raw summary mismatch ${name}`);
          assert(
            requests.every(row => row.cell === result.cell.id && row.status === 200 && !row.error),
            `raw error ${name}`
          );
        } else {
          // Errors are evidence, not a reason to discard an invalid attempt or abort the report.
          attempt.rawMetrics = actual;
        }
        attempt.rawVerification = 'verified';
      } catch (error) {
        if (result.valid) throw error;
        attempt.rawVerification = error.message;
      }
    } else {
      attempt.rawVerification = 'not read (archived, missing or incomplete)';
    }
    if (result.valid) {
      assert(!result.smoke && result.completed && result.metrics.valid, `invalid success claim ${name}`);
      if (verifyRaw) assert.equal(attempt.rawVerification, 'verified', `raw requests required: ${name}`);
      assert.equal(result.afterMeasurement.measuredCount, 1000);
      assert.equal(result.stop.persistence.pools, 0);
      assert.equal(result.unexpectedRefreshGets, 0);
    }
    if (!result.smoke && result.completed) {
      try {
        const rawResources =
          hasLines(path.join(rawDirectory, 'host.jsonl')) && hasLines(path.join(rawDirectory, 'node.jsonl'));
        if (rawResources) attempt.resource = resource(result, rawDirectory);
        else if (saved[name] || result.valid) {
          assert.equal(saved[name]?.resultSha256, attempt.resultSha256, `missing or stale resource summary: ${name}`);
          attempt.resource = saved[name].resource;
          assert(attempt.resource.hostSamples >= 110 && attempt.resource.nodeSamples >= 110);
        }
        if (verifyRaw && result.valid) assert(rawResources, `raw resources required: ${name}`);
        if (saveResources && attempt.resource)
          saved[name] = { resultSha256: attempt.resultSha256, resource: attempt.resource };
      } catch (error) {
        if (result.valid) throw error;
        attempt.resourceError = error.message;
      }
    }
    attempts.push(attempt);
  }
  const batches = {};
  for (const cell of cells) {
    const groups = {};
    for (const attempt of attempts.filter(item => !item.smoke && item.cell === cell.id)) {
      const batch = attempt.directory.slice(0, attempt.directory.indexOf(`-${cell.id}-`));
      (groups[batch] ||= []).push(attempt);
    }
    batches[cell.id] = Object.fromEntries(
      Object.entries(groups).map(([name, runs]) => {
        const complete = runs.length === 5 && runs.every(run => run.valid && run.completed);
        const entry = { attempts: runs.map(run => run.directory), complete };
        if (complete) {
          entry.metrics = aggregate(runs.map(run => run.metrics));
          entry.resources = Object.fromEntries(
            [
              'nodeCpuPct',
              'nodeRssHighWaterMiB',
              'nodeHeapHighWaterMiB',
              'retainedRssMiB',
              'retainedHeapMiB',
              'completionAndDrainMs',
            ].map(key => [key, band(runs.map(run => run.resource[key]))])
          );
          entry.noisyMetrics = Object.entries(entry.metrics)
            .filter(([, value]) => value.variabilityPct > 10)
            .map(([key]) => key);
          entry.noisyResources = Object.entries(entry.resources)
            .filter(([, value]) => value.variabilityPct > 10)
            .map(([key]) => key);
          entry.generatorSaturated = runs.some(run => run.resource.providers.generator.cpuPctOneCore >= 90);
          entry.proxySaturated = runs.some(run => run.resource.providers['fm007-proxy'].cpuPctOneCore >= 90);
          entry.unrelatedLoad = runs.some(run => run.resource.unrelatedCpuPctOneCore > 10);
          entry.stablePrimaryMetrics =
            !entry.noisyMetrics.length && !entry.generatorSaturated && !entry.proxySaturated && !entry.unrelatedLoad;
        }
        return [name, entry];
      })
    );
  }
  const report = { generatedUtc: new Date().toISOString(), attempts, batches };
  if (saveResources) fs.writeFileSync(resourceFile, JSON.stringify(saved, null, 2) + '\n');
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = path.resolve(
    args[0] && !args[0].startsWith('--') ? args.shift() : 'support/specs/fastify-migration/evidence/FM-007-data'
  );
  const options = {};
  while (args.length) {
    const flag = args.shift();
    if (flag === '--save-resources') options.saveResources = true;
    else if (flag === '--verify-raw') options.verifyRaw = true;
    else if (flag === '--raw-root') {
      assert(args[0], 'supply --raw-root DIRECTORY');
      options.rawRoot = path.resolve(args.shift());
    } else throw new Error(`unknown report option: ${flag}`);
  }
  const report = buildReport(root, options);
  fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        attempts: report.attempts.length,
        smoke: report.attempts.filter(run => run.smoke).length,
        baseline: report.attempts.filter(run => !run.smoke).length,
        batches: report.batches,
      },
      null,
      2
    )
  );
}
module.exports = { buildReport };
