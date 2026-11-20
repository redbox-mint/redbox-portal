'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createGzip } = require('node:zlib');
const { finished, pipeline } = require('node:stream/promises');
const { MongoClient } = require('mongodb');
const { protocol: p, cells, summarize } = require('./protocol.cjs');
const { assertDisposableState } = require('./state.cjs');
const { control, controls, workload } = require('./client.cjs');
const cell = cells.find(item => item.id === process.argv[2]);
assert(cell, 'supply one protocol cell ID');
const output = path.resolve(process.argv[3]);
const smoke = process.argv.includes('--smoke');
const image = process.env.FM007_IMAGE;
assert(image && image.startsWith('sha256:'), 'use an immutable local image ID');
const state = path.resolve(process.env.FM007_STATE);
const name = 'fm007-portal';
let sampling,
  raw,
  gzip,
  hostFile,
  started = false,
  phase = 'setup';
const attempts = { cell, smoke, startedUtc: new Date().toISOString(), image, protocol: p, valid: false };
function docker(args, timeout = 30000) {
  const result = spawnSync('timeout', [String(timeout / 1000), 'docker', ...args], {
    encoding: 'utf8',
    timeout: timeout + 2000,
  });
  assert.equal(result.status, 0, `${args.slice(0, 4).join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}
async function proc(pid) {
  try {
    const [stat, status, cgroup] = await Promise.all([
      fsp.readFile(`/proc/${pid}/stat`, 'utf8'),
      fsp.readFile(`/proc/${pid}/status`, 'utf8'),
      fsp.readFile(`/proc/${pid}/cgroup`, 'utf8'),
    ]);
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const rssKiB = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0);
    const entry = {
      pid: Number(pid),
      parent: Number(fields[1]),
      cpuTicks: Number(fields[11]) + Number(fields[12]),
      rssKiB,
      comm: stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')')),
    };
    const cg = cgroup.match(/^0::(.+)$/m)?.[1];
    if (cg) {
      entry.cgroupCpu = await fsp.readFile(`/sys/fs/cgroup${cg}/cpu.stat`, 'utf8').catch(() => null);
      entry.cgroupMemory = await fsp.readFile(`/sys/fs/cgroup${cg}/memory.current`, 'utf8').catch(() => null);
    }
    return entry;
  } catch {
    return null;
  }
}
async function startSampler() {
  hostFile = fs.createWriteStream(path.join(output, 'host.jsonl'));
  const rootPids = Object.fromEntries(
    ['fm007-portal', 'fm007-mongo', 'fm007-solr', 'fm007-proxy'].map(container => [
      container,
      Number(docker(['inspect', '-f', '{{.State.Pid}}', container])),
    ])
  );
  rootPids.generator = process.pid;
  let inFlight = Promise.resolve();
  async function tick() {
    const all = [];
    for (const entry of await fsp.readdir('/proc'))
      if (/^\d+$/.test(entry)) {
        const info = await proc(entry);
        if (info) all.push(info);
      }
    const families = {};
    for (const [name, pid] of Object.entries(rootPids)) {
      const children = new Set([pid]);
      // Nginx's worker and Solr's JVM can be children of their entrypoints.
      let changed = true;
      while (changed) {
        changed = false;
        for (const info of all) {
          if (children.has(info.parent) && !children.has(info.pid)) {
            children.add(info.pid);
            changed = true;
          }
        }
      }
      families[name] = all.filter(info => children.has(info.pid));
    }
    const cpu = await fsp.readFile('/proc/stat', 'utf8');
    hostFile.write(
      JSON.stringify({
        utc: new Date().toISOString(),
        monotonicMs: Number(process.hrtime.bigint()) / 1e6,
        phase,
        families,
        processes: all.map(({ pid, cpuTicks, rssKiB, comm }) => ({ pid, cpuTicks, rssKiB, comm })),
        hostCpu: cpu.split('\n')[0],
        load: (await fsp.readFile('/proc/loadavg', 'utf8')).trim(),
        memory: await fsp.readFile('/proc/meminfo', 'utf8'),
        pressure: await fsp.readFile('/proc/pressure/cpu', 'utf8'),
      }) + '\n'
    );
  }
  await tick();
  const timer = setInterval(() => {
    inFlight = inFlight.then(tick);
  }, 1000);
  sampling = async () => {
    clearInterval(timer);
    await inFlight;
    await tick();
    hostFile.end();
    await finished(hostFile);
  };
}
async function reset() {
  assertDisposableState(state);
  const info = await fsp.statfs(state);
  assert(info.bavail * info.bsize >= 20 * 1024 ** 3, 'staging filesystem must have >=20 GiB free');
  const mongo = await new MongoClient(`mongodb://127.0.0.1:${p.mongoPort}`).connect();
  try {
    for (const database of ['fm007_core', 'fm007_storage', 'fm007_sessions', 'fm007_agenda'])
      await mongo.db(database).dropDatabase();
  } finally {
    await mongo.close();
  }
  for (const disk of ['staging', 'primary', 'figshare-staging']) {
    assertDisposableState(state);
    await fsp.rm(path.join(state, disk), { force: true, recursive: true });
    await fsp.mkdir(path.join(state, disk), { recursive: true });
  }
  const response = await fetch(`http://127.0.0.1:${p.solrPort}/solr/redbox/update?commit=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"delete":{"query":"*:*"}}',
  });
  assert(response.ok, await response.text());
}
async function main() {
  assertDisposableState(state);
  await fsp.mkdir(output, { recursive: true });
  assert.equal(docker(['ps', '-q', '--filter', 'name=^fm007-portal$']), '', 'never overlap owner processes');
  await reset();
  docker([
    'run',
    '-d',
    '--pull=never',
    '--no-healthcheck',
    '--name',
    name,
    '--network',
    'host',
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '--cpus',
    '1',
    '--memory',
    '2g',
    '--ulimit',
    'nofile=64000:64000',
    '-e',
    'NODE_ENV=production',
    '-e',
    'NODE_OPTIONS=--max-old-space-size=1024',
    '-e',
    `FM007_PROFILE=${cell.profile}`,
    ...(process.env.FM007_TLS === 'true' ? ['-e', 'FM007_TLS=true'] : []),
    '-v',
    `${state}:/fm007-state`,
    '-v',
    `${output}:/fm007-output`,
    image,
  ]);
  started = true;
  const deadline = Date.now() + 90000;
  let readinessPolls = 0;
  while (true) {
    try {
      await control('phase', { phase: 'seed' });
      break;
    } catch (error) {
      if (++readinessPolls % 4 === 0)
        assert.equal(docker(['inspect', '-f', '{{.State.Running}}', name]), 'true', 'portal exited during readiness');
      if (Date.now() > deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  await startSampler();
  const seed = await control('seed');
  console.log(JSON.stringify({ event: 'seed-ready', cell: cell.id, utc: new Date().toISOString() }));
  await fsp.writeFile(path.join(output, 'seed.json'), JSON.stringify(seed, null, 2) + '\n');
  attempts.controls = await controls(cell, seed);
  phase = 'warmup';
  await control('phase', { phase });
  console.log(JSON.stringify({ event: phase, cell: cell.id, utc: new Date().toISOString() }));
  const warm = await workload(cell, { ...seed, namespace: 'warm' }, smoke ? 1000 : p.warmupMs);
  assert(warm.rows.length && warm.rows.every(row => !row.error), JSON.stringify(warm.rows.find(row => row.error)));
  attempts.warmup = { operations: warm.rows.length, preparationGets: warm.preparationGets };
  phase = 'warmup-drain';
  await control('phase', { phase });
  attempts.beforeMeasurement = await control('inspect', { clearWarm: true });
  assert.equal(attempts.beforeMeasurement.measuredCount, 1000);
  phase = 'preparation';
  await control('phase', { phase });
  raw = fs.createWriteStream(path.join(output, 'requests.jsonl.gz'));
  gzip = createGzip({ level: 1 });
  gzip.pipe(raw);
  const measured = await workload(
    cell,
    seed,
    smoke ? 2000 : p.measureMs,
    row => gzip.write(JSON.stringify(row) + '\n'),
    async () => {
      phase = 'measurement';
      await control('phase', { phase });
      console.log(JSON.stringify({ event: phase, cell: cell.id, utc: new Date().toISOString() }));
    }
  );
  gzip.end();
  await finished(raw);
  attempts.metrics = summarize(measured.rows, smoke ? 2000 : p.measureMs);
  attempts.preparationGets = measured.preparationGets;
  attempts.unexpectedRefreshGets = measured.unexpectedRefreshGets;
  attempts.epoch = measured.epoch;
  attempts.lastCompletionMonotonicMs = measured.finishedMonotonicMs;
  assert(measured.finishedMonotonicMs - measured.epoch <= (smoke ? 2000 : p.measureMs) + p.drainMs);
  phase = 'drain';
  await control('phase', { phase });
  const completionOverhangMs = Math.max(
    0,
    measured.finishedMonotonicMs - measured.epoch - (smoke ? 2000 : p.measureMs)
  );
  attempts.afterMeasurement = await control('inspect', {
    expected: measured.expected,
    budgetMs: p.drainMs - completionOverhangMs,
  });
  attempts.completionAndDrainMs = completionOverhangMs + attempts.afterMeasurement.drained.durationMs;
  assert(attempts.completionAndDrainMs <= p.drainMs);
  attempts.expected = measured.expected;
  phase = 'post-drain';
  await control('phase', { phase });
  await new Promise(resolve => setTimeout(resolve, 1100));
  attempts.stop = await control('stop');
  assert.equal(attempts.stop.persistence.pools, 0);
  attempts.valid = !smoke && attempts.metrics.valid;
  attempts.completed = true;
}
main()
  .catch(error => {
    attempts.error = error.stack;
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    phase = 'cleanup';
    if (sampling) await sampling();
    if (started) {
      if (!attempts.stop)
        try {
          attempts.failureStop = await control('stop');
        } catch {}
      const result = spawnSync('timeout', ['10', 'docker', 'logs', name], { encoding: 'utf8' });
      await fsp.writeFile(path.join(output, 'portal.log'), result.stdout + result.stderr);
      try {
        const inspected = JSON.parse(docker(['inspect', name]))[0];
        attempts.containerState = inspected.State;
        attempts.containerConfiguration = {
          config: inspected.Config,
          host: inspected.HostConfig,
          mounts: inspected.Mounts,
        };
      } catch {}
      spawnSync('timeout', ['65', 'docker', 'stop', '-t', '60', name], { encoding: 'utf8' });
      spawnSync('timeout', ['30', 'docker', 'rm', '-fv', name], { encoding: 'utf8' });
    }
    attempts.finishedUtc = new Date().toISOString();
    for (const filename of ['host.jsonl', 'node.jsonl', 'seed.json', 'portal.log']) {
      const original = path.join(output, filename);
      if (fs.existsSync(original)) {
        await pipeline(fs.createReadStream(original), createGzip({ level: 1 }), fs.createWriteStream(original + '.gz'));
        await fsp.unlink(original);
      }
    }
    await fsp.mkdir(output, { recursive: true });
    await fsp.writeFile(path.join(output, 'result.json'), JSON.stringify(attempts, null, 2) + '\n');
    console.log(
      JSON.stringify({ cell: cell.id, smoke, valid: attempts.valid, metrics: attempts.metrics, error: attempts.error })
    );
  });
