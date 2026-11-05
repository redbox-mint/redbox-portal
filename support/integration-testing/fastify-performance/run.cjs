'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { protocol: p, cells, aggregate, hash } = require('./protocol.cjs');
const { assertDisposableState } = require('./state.cjs');
const output = path.resolve(process.env.FM007_OUTPUT || 'support/specs/fastify-migration/evidence/FM-007-data');
const state = path.resolve(process.env.FM007_STATE || '/home/ubuntu/work/fm007-state');
const mongo = 'mongo@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8';
const solr = 'solr@sha256:b866a82ef3a0a16ed25005731dd0c5d87541b70783a14a2392ecfa12810541cb';
const proxy = 'nginx@sha256:b3c656d55d7ad751196f21b7fd2e8d4da9cb430e32f646adcf92441b72f82b14';
function command(args, seconds = 30) {
  const result = spawnSync('timeout', [String(seconds), ...args], { encoding: 'utf8', timeout: seconds * 1000 + 2000 });
  assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}
function clean() {
  assertDisposableState(state);
  for (const name of ['fm007-portal', 'fm007-proxy', 'fm007-solr', 'fm007-mongo'])
    spawnSync('timeout', ['30', 'docker', 'rm', '-fv', name], { encoding: 'utf8' });
  for (const part of ['app', 'staging', 'primary', 'figshare-staging']) {
    assertDisposableState(state);
    fs.rmSync(path.join(state, part), { force: true, recursive: true });
  }
}
async function start() {
  assertDisposableState(state, { create: true });
  assert.equal(command(['docker', 'ps', '-q']), '', 'only benchmark services may run on this host');
  fs.mkdirSync(state, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  const tls = path.join(state, 'tls');
  fs.mkdirSync(tls, { recursive: true });
  if (!fs.existsSync(path.join(tls, 'cert.pem')))
    command([
      'openssl',
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      path.join(tls, 'key.pem'),
      '-out',
      path.join(tls, 'cert.pem'),
      '-days',
      '3650',
      '-subj',
      '/CN=FM007-disposable-loopback',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ]);
  command([
    'docker',
    'run',
    '-d',
    '--pull=never',
    '--name',
    'fm007-mongo',
    '--network',
    'host',
    '--cpus',
    '0.5',
    '--memory',
    '1536m',
    '--ulimit',
    'nofile=64000:64000',
    mongo,
    'mongod',
    '--bind_ip',
    '127.0.0.1',
    '--port',
    String(p.mongoPort),
    '--wiredTigerCacheSizeGB',
    '0.25',
    '--setParameter',
    'diagnosticDataCollectionEnabled=false',
  ]);
  command([
    'docker',
    'run',
    '-d',
    '--pull=never',
    '--name',
    'fm007-solr',
    '--network',
    'host',
    '--cpus',
    '0.5',
    '--memory',
    '1536m',
    '-e',
    'SOLR_JAVA_MEM=-Xms512m -Xmx512m',
    solr,
    'bash',
    '-c',
    `precreate-core redbox && exec solr-fg --user-managed -p ${p.solrPort}`,
  ]);
  command([
    'docker',
    'run',
    '-d',
    '--pull=never',
    '--name',
    'fm007-proxy',
    '--network',
    'host',
    '--memory',
    '256m',
    '-v',
    `${path.join(__dirname, 'nginx.conf')}:/etc/nginx/nginx.conf:ro`,
    '-v',
    `${path.join(state, 'tls')}:/fm007-tls:ro`,
    proxy,
  ]);
  const deadline = Date.now() + 90000;
  while (true) {
    try {
      const response = await fetch(`http://127.0.0.1:${p.solrPort}/solr/redbox/admin/ping`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) break;
    } catch {}
    assert(Date.now() < deadline, 'Solr readiness timeout');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  fs.writeFileSync(
    path.join(output, 'services.json'),
    command(['docker', 'inspect', 'fm007-mongo', 'fm007-solr', 'fm007-proxy']) + '\n'
  );
}
async function run() {
  assertDisposableState(state);
  assert.equal(process.version, 'v26.12.1');
  assert(!process.env.FM007_CHECKOUT, 'baseline cannot use live source');
  assert(!process.env.FM007_TLS, 'the frozen timing comparison uses HTTP; TLS is a separate control');
  const artifact = JSON.parse(fs.readFileSync(path.join(output, 'artifact.json')));
  assert.equal(process.env.FM007_IMAGE, artifact.image, 'selected image must match the captured artifact');
  const reviewPath = path.join(output, 'harness-review.json');
  const review = fs.existsSync(reviewPath) ? JSON.parse(fs.readFileSync(reviewPath)) : null;
  let expectedHarness = artifact.harness;
  if (review?.measuredImage === artifact.image) {
    assert.deepEqual(review.measuredHarness, artifact.harness, 'review must identify the original measured harness');
    expectedHarness = review.reviewedHarness;
  }
  for (const [name, digest] of Object.entries(expectedHarness))
    assert.equal(hash(fs.readFileSync(path.join(__dirname, name))), digest, `frozen harness changed: ${name}`);
  const selected = cells.filter(
    cell => !process.env.FM007_CELLS || process.env.FM007_CELLS.split(',').includes(cell.id)
  );
  assert(selected.length);
  fs.mkdirSync(output, { recursive: true });
  const batch = process.env.FM007_BATCH || new Date().toISOString().replace(/[:.]/g, '-');
  const manifest = path.join(output, 'attempts.jsonl');
  for (const cell of selected) {
    const results = [];
    for (let repetition = 1; repetition <= p.repetitions; repetition++) {
      const directory = path.join(output, `${batch}-${cell.id}-${repetition}`);
      assert(!fs.existsSync(directory), 'never overwrite an attempt');
      const entry = {
        batch,
        cell: cell.id,
        repetition,
        directory: path.basename(directory),
        startedUtc: new Date().toISOString(),
      };
      fs.appendFileSync(manifest, JSON.stringify({ ...entry, state: 'started' }) + '\n');
      console.log(JSON.stringify({ event: 'start', ...entry }));
      const status = await new Promise(resolve => {
        const child = spawn(
          'timeout',
          [String(p.outerSeconds), process.execPath, path.join(__dirname, 'sample.cjs'), cell.id, directory],
          { stdio: 'inherit', env: { ...process.env, FM007_STATE: state } }
        );
        child.on('exit', (code, signal) => resolve({ code, signal }));
      });
      const resultPath = path.join(directory, 'result.json');
      const result = fs.existsSync(resultPath)
        ? JSON.parse(fs.readFileSync(resultPath))
        : { valid: false, error: 'outer timeout or abnormal termination; no result written' };
      fs.appendFileSync(
        manifest,
        JSON.stringify({
          ...entry,
          state: 'finished',
          ...status,
          valid: result.valid,
          error: result.error,
          finishedUtc: new Date().toISOString(),
          resultSha256: fs.existsSync(resultPath) ? hash(fs.readFileSync(resultPath)) : null,
        }) + '\n'
      );
      results.push({ ...result.metrics, valid: result.valid });
      assert.equal(status.code, 0, 'attempt failed; retain evidence and investigate before restarting');
      assert(result.valid, 'invalid sample retained; cannot close G0');
    }
    const stats = aggregate(results);
    fs.writeFileSync(path.join(output, `${batch}-${cell.id}-aggregate.json`), JSON.stringify(stats, null, 2) + '\n');
    console.log(JSON.stringify({ event: 'cell-complete', cell: cell.id, stats }));
  }
}
const action = process.argv[2] || 'run';
if (action === 'clean') clean();
else
  (async () => {
    try {
      if (action === 'all' || action === 'start') await start();
      if (action === 'all' || action === 'run') await run();
    } finally {
      if (action === 'all') clean();
    }
  })().catch(error => {
    console.error(error.stack);
    process.exitCode = 1;
  });
