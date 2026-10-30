const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { workflowReport } = require('./ci-performance.cjs');

test('measurement streams output, records sizes/cache operations/memory, and preserves failures', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-ci-timing-'));
  const helper = path.join(__dirname, 'ci-performance.cjs');
  try {
    const artifact = path.join(directory, 'image.tar');
    fs.writeFileSync(artifact, '12345');
    const result = spawnSync(process.execPath, [helper, 'run', 'sample', '--artifact', artifact, '--', process.execPath, '-e',
      'console.log("#1 CACHED\\n#1 CACHED\\n#2 DONE 0.5s"); console.error("failure diagnostic"); process.exit(23)'],
    { cwd: directory, encoding: 'utf8', env: { ...process.env, CI_RESOURCE_CLASS: 'large', CIRCLE_SHA1: 'pipeline-revision' } });
    assert.equal(result.status, 23);
    assert.ok(result.stdout.includes('#1 CACHED'));
    assert.ok(result.stderr.includes('failure diagnostic'));
    const report = JSON.parse(fs.readFileSync(path.join(directory, '.tmp/ci-performance/sample.json')));
    assert.equal(report.exit_code, 23);
    assert.equal(report.artifact_bytes, 5);
    assert.equal(report.buildkit_cached_operations, 1);
    assert.equal(report.buildkit_completed_operations, 1);
    assert.equal(report.executor.resource_class, 'large');
    assert.equal(report.pipeline_revision, 'pipeline-revision');
    assert.ok(report.duration_seconds > 0);
    assert.equal(report.remote_docker_peak_rss_kib, null);
    assert.equal(report.credits, null);
    const success = spawnSync(process.execPath, [helper, 'run', 'success', '--', process.execPath, '-e', 'process.exit(0)'], { cwd: directory });
    assert.equal(success.status, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, '.tmp/ci-performance/success.json'))).artifact_bytes, null);
    const missing = spawnSync(process.execPath, [helper, 'run', 'missing', '--', '/nonexistent/redbox-command'], { cwd: directory });
    assert.equal(missing.status, 127);
    const signal = spawnSync(process.execPath, [helper, 'run', 'signal', '--', process.execPath, '-e', 'process.kill(process.pid,"SIGTERM")'], { cwd: directory });
    assert.equal(signal.status, 143);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('canceling the wrapper reaches the measured command', { skip: process.platform === 'win32', timeout: 6000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-ci-cancel-'));
  const marker = path.join(directory, 'terminated');
  const pidFile = path.join(directory, 'pid');
  const helper = path.join(__dirname, 'ci-performance.cjs');
  const script = `const fs = require('fs');
    fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    process.on('SIGTERM', () => { fs.writeFileSync(${JSON.stringify(marker)}, 'terminated'); process.exit(0); });
    console.log('ready'); setTimeout(() => process.exit(0), 4000);`;
  const child = spawn(process.execPath, [helper, 'run', 'cancel', '--', process.execPath, '-e', script],
    { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => { if (chunk.toString().includes('ready')) resolve(); });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`wrapper exited before command was ready: ${code}`)));
    });
    const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
    child.kill('SIGTERM');
    const result = await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('cancellation did not reach command')), 2000))]);
    assert.equal(result.code, 143);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'terminated');
  } finally {
    if (fs.existsSync(pidFile)) {
      try { process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('cancellation remains a failure when the command handles the signal', { skip: process.platform === 'win32', timeout: 6000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-ci-int-'));
  const helper = path.join(__dirname, 'ci-performance.cjs');
  const script = "process.on('SIGINT', () => process.exit(0)); console.log('ready'); setInterval(() => {}, 1000);";
  const child = spawn(process.execPath, [helper, 'run', 'interrupt', '--', process.execPath, '-e', script],
    { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => { if (chunk.toString().includes('ready')) resolve(); });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`wrapper exited before ready: ${code}`)));
    });
    const closed = new Promise(resolve => child.once('close', code => resolve(code)));
    child.kill('SIGINT');
    assert.equal(await closed, 130);
    const report = JSON.parse(fs.readFileSync(path.join(directory, '.tmp/ci-performance/interrupt.json')));
    assert.equal(report.exit_code, 130);
    assert.equal(report.cancellation_signal, 'SIGINT');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('cancellation allows a measured command to finish asynchronous signal handling', { skip: process.platform === 'win32', timeout: 6000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-ci-grace-'));
  const helper = path.join(__dirname, 'ci-performance.cjs');
  const marker = path.join(directory, 'handled');
  const script = `process.on('SIGTERM', () => setTimeout(() => { require('fs').writeFileSync(${JSON.stringify(marker)}, 'handled'); process.exit(0); }, 200)); console.log('ready'); setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, [helper, 'run', 'grace', '--', process.execPath, '-e', script],
    { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => { if (chunk.toString().includes('ready')) resolve(); });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`wrapper exited before ready: ${code}`)));
    });
    const closed = new Promise(resolve => child.once('close', code => resolve(code)));
    child.kill('SIGTERM');
    assert.equal(await closed, 143);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'handled');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('cancellation escalates when the measured command ignores SIGTERM', { skip: process.platform === 'win32', timeout: 6000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-ci-stubborn-'));
  const helper = path.join(__dirname, 'ci-performance.cjs');
  const script = "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000);";
  const child = spawn(process.execPath, [helper, 'run', 'stubborn', '--', process.execPath, '-e', script],
    { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => { if (chunk.toString().includes('ready')) resolve(); });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`wrapper exited before ready: ${code}`)));
    });
    const closed = new Promise(resolve => child.once('close', code => resolve(code)));
    child.kill('SIGTERM');
    assert.equal(await closed, 143);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, '.tmp/ci-performance/stubborn.json'))).cancellation_signal, 'SIGTERM');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('signaled command cannot leave a detached-stdio worker running', { skip: process.platform === 'win32', timeout: 6000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-ci-descendant-'));
  const marker = path.join(directory, 'orphan');
  const helper = path.join(__dirname, 'ci-performance.cjs');
  const worker = `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 1200)`;
  const script = `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(worker)}], { stdio: 'ignore' });
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 150);`;
  try {
    const result = spawnSync(process.execPath, [helper, 'run', 'descendant', '--', process.execPath, '-e', script], { cwd: directory, timeout: 4000 });
    assert.equal(result.status, 143);
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert.equal(fs.existsSync(marker), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('signaled parent cannot leave inherited output pipes open', { skip: process.platform === 'win32', timeout: 6000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-ci-inherited-'));
  const helper = path.join(__dirname, 'ci-performance.cjs');
  const script = "require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' }); setTimeout(() => process.kill(process.pid, 'SIGTERM'), 150);";
  try {
    const result = spawnSync(process.execPath, [helper, 'run', 'inherited', '--', process.execPath, '-e', script], { cwd: directory, timeout: 3000 });
    assert.equal(result.status, 143);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, '.tmp/ci-performance/inherited.json'))).exit_code, 143);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('closed output pipe stops the command and records the failure', { skip: process.platform === 'win32', timeout: 6000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-ci-epipe-'));
  const helper = path.join(__dirname, 'ci-performance.cjs');
  const marker = path.join(directory, 'orphan');
  const script = `setInterval(() => console.log('x'.repeat(65536)), 10); setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 3000);`;
  const child = spawn(process.execPath, [helper, 'run', 'broken-pipe', '--', process.execPath, '-e', script],
    { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    child.stdout.once('data', () => child.stdout.destroy());
    const code = await new Promise((resolve, reject) => {
      child.once('close', resolve);
      child.once('error', reject);
    });
    assert.equal(code, 1);
    const report = JSON.parse(fs.readFileSync(path.join(directory, '.tmp/ci-performance/broken-pipe.json')));
    assert.equal(report.error, 'EPIPE');
    assert.equal(report.exit_code, 1);
    assert.equal(fs.existsSync(marker), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('counts a final BuildKit line without a newline', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-ci-tail-'));
  const helper = path.join(__dirname, 'ci-performance.cjs');
  try {
    const result = spawnSync(process.execPath, [helper, 'run', 'tail', '--', process.execPath, '-e', "process.stdout.write('#2 DONE 0.1s')"], { cwd: directory });
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, '.tmp/ci-performance/tail.json'))).buildkit_completed_operations, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('read-only report paginates jobs/tests and separates scheduling from execution without exposing API secrets', async () => {
  const id = '00000000-0000-0000-0000-000000000000';
  const created = '2026-10-31T00:00:00Z';
  const calls = [];
  const get = async endpoint => {
    calls.push(endpoint);
    if (endpoint === `v2/workflow/${id}`) return { status: 'success', created_at: created, stopped_at: '2026-10-31T00:01:00Z', project_slug: 'gh/org/repo' };
    if (endpoint === `v2/workflow/${id}/job`) return { items: [{ id: 'a', name: 'build', status: 'success', job_number: 1, started_at: '2026-10-31T00:00:05Z', stopped_at: '2026-10-31T00:00:20Z' }], next_page_token: 'next' };
    if (endpoint === `v2/workflow/${id}/job?page-token=next`) return { items: [{ id: 'b', name: 'test-playwright', status: 'success', dependencies: ['a'], job_number: 2, started_at: '2026-10-31T00:00:25Z', stopped_at: '2026-10-31T00:00:55Z' }] };
    if (endpoint.startsWith('v1.1/')) return { vcs_revision: 'source', secret: 'PRIVATE', steps: [{ name: 'Restore cache', actions: [{ status: 'success', run_time_millis: 500, output_url: 'SIGNED-SECRET' }] }] };
    if (endpoint.startsWith('v2/project/gh/org/repo/job/')) return { executor: { resource_class: 'large', type: 'machine' } };
    if (endpoint.endsWith('/tests')) return { items: [{ result: 'success' }], next_page_token: 'tests-next' };
    if (endpoint.endsWith('/tests?page-token=tests-next')) return { items: [{ result: 'skipped' }] };
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };
  const report = await workflowReport(id, get);
  assert.equal(report.full_seconds, 60);
  assert.equal(report.all_checks_seconds, 55);
  assert.equal(report.jobs[1].ready_to_start_seconds, 5);
  assert.equal(report.jobs[1].execution_seconds, 30);
  assert.equal(report.jobs[1].pipeline_revision, 'source');
  assert.deepEqual(report.jobs[1].executor, { resource_class: 'large', executor_type: 'machine' });
  assert.deepEqual(report.jobs[1].test_counts, { success: 1, skipped: 1 });
  assert.equal(report.jobs[1].steps[0].actions[0].duration_seconds, 0.5);
  assert.ok(calls.some(call => call === 'v1.1/project/github/org/repo/1'));
  assert.ok(!JSON.stringify(report).includes('SECRET'));
  const failed = await workflowReport(id, async endpoint => {
    const response = await get(endpoint);
    if (endpoint.includes('/job?page-token=')) response.items[0].status = 'failed';
    return response;
  });
  assert.equal(failed.all_checks_seconds, null);
});

test('live reports retain jobs that have not started without fetching unavailable details', async () => {
  const id = '00000000-0000-0000-0000-000000000000';
  const get = async endpoint => {
    if (endpoint === `v2/workflow/${id}`) return { status: 'running', created_at: '2026-10-31T00:00:00Z', project_slug: 'gh/org/repo' };
    if (endpoint === `v2/workflow/${id}/job`) return { items: [{ name: 'test-mocha', status: 'blocked', job_number: 123, started_at: null }] };
    throw new Error(`Unexpected detail request: ${endpoint}`);
  };
  const report = await workflowReport(id, get);
  assert.equal(report.status, 'running');
  assert.equal(report.jobs[0].status, 'blocked');
  assert.equal(report.jobs[0].job_number, 123);
  assert.equal(report.jobs[0].test_counts, null);
  assert.equal(report.all_checks_seconds, null);
});
