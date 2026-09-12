const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-playwright-lifecycle-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const scripts = path.join(root, 'support/integration-testing');
  await fs.mkdir(scripts, { recursive: true });
  await fs.mkdir(path.join(root, 'bin'));
  await fs.copyFile('support/integration-testing/playwright.sh', path.join(scripts, 'playwright.sh'));
  await fs.writeFile(path.join(scripts, 'check-playwright-coverage.cjs'), '');
  await fs.writeFile(path.join(scripts, 'playwright-build-state.cjs'), 'if (process.argv[2] === "check" && process.env.PROBE_STALE) process.exit(1);');
  await fs.writeFile(path.join(root, 'bin/git'), '#!/bin/sh\nprintf "candidate-revision\\n"\n', { mode: 0o755 });
  await fs.writeFile(path.join(root, 'bin/docker'), `#!${process.execPath}
const fs=require('node:fs');const args=process.argv.slice(2);
fs.appendFileSync(process.env.PROBE_LOG, JSON.stringify(args)+'\\n');
if(args[0]==='inspect') console.log(args.includes('{{.State.Health.Status}}')?'healthy':'sha256:test-image');
else if(args.includes('ps')) console.log('owned-portal-id');
else if(args.includes('logs')) console.log('preserved diagnostic log');
else if(args.includes('up') && process.env.PROBE_FAIL_UP) process.exit(23);
else if(args.includes('run')) {
  if(process.env.PROBE_HOLD) setInterval(()=>{},1000);
  else process.exit(Number(process.env.PROBE_RUN_EXIT||0));
}
`, { mode: 0o755 });
  const log = path.join(root, 'calls.jsonl');
  const run = (args, extra = {}, processOptions = {}) => {
    const child = spawn('bash', [path.join(scripts, 'playwright.sh'), ...args], {
      cwd: os.tmpdir(), detached: true,
      ...processOptions,
      env: { ...process.env, COMPOSE_PROJECT_NAME: 'redbox-playwright-probe', PATH: `${root}/bin:${process.env.PATH}`, PROBE_LOG: log, ...extra },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
    return { child, result: new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', (code, signal) => resolve({ code, signal, output })); }) };
  };
  const calls = async () => (await fs.readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  return { root, run, calls };
}

test('selected arguments and failure status survive lifecycle cleanup from another working directory', async t => {
  const { root, run, calls } = await setup(t);
  const result = await run(['mount', 'test/playwright/forms/behaviours.spec.ts', '--grep', 'logical row A|B'], { PROBE_RUN_EXIT: '7' }).result;
  assert.equal(result.code, 7, result.output);
  const history = await calls();
  const runner = history.find(args => args.includes('run'));
  assert.deepEqual(runner.slice(-4), ['playwright-mount', 'test/playwright/forms/behaviours.spec.ts', '--grep', 'logical row A|B']);
  assert.equal(history.filter(args => args.includes('down')).length, 2);
  assert.match(await fs.readFile(path.join(root, '.tmp/playwright/logs/portal.log'), 'utf8'), /preserved diagnostic log/);
  await assert.rejects(fs.access(path.join(root, '.tmp/playwright/attachments')));
});
test('unhealthy startup cleans up without launching tests', async t => {
  const { run, calls } = await setup(t);
  const result = await run(['ci'], { PROBE_FAIL_UP: '1' }).result;
  assert.equal(result.code, 23, result.output);
  assert.equal((await calls()).some(args => args.includes('run')), false);
  assert.equal((await calls()).filter(args => args.includes('down')).length, 2);
});
test('a later host run replaces metadata left read-only by the container runner', async t => {
  const { root, run, calls } = await setup(t);
  // The harness itself runs as root in Docker. Exercise the host wrapper as
  // an ordinary user so root cannot bypass the previous artifact's mode.
  const ordinaryUser = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {};
  await fs.chmod(root, 0o777);
  const first = await run(['ci'], {}, ordinaryUser).result;
  assert.equal(first.code, 0, first.output);
  const metadataPath = path.join(root, '.tmp/playwright/logs/run-metadata.json');
  await fs.chmod(metadataPath, 0o444);
  const second = await run(['ci'], {}, ordinaryUser).result;
  assert.equal(second.code, 0, second.output);
  assert.equal((await calls()).filter(args => args.includes('run')).length, 2);
  assert.equal(JSON.parse(await fs.readFile(metadataPath, 'utf8')).mode, 'image');
});
test('persistent reuse rejects stale builds and failed cleanup without destroying a prepared stack', async t => {
  const { root, run, calls } = await setup(t);
  assert.equal((await run(['up', '--detach']).result).code, 0);
  const stale = await run(['persistent'], { PROBE_STALE: '1' }).result;
  assert.equal(stale.code, 1);
  await fs.writeFile(path.join(root, '.tmp/playwright/cleanup-failed.json'), '{}');
  const failedCleanup = await run(['persistent']).result;
  assert.equal(failedCleanup.code, 1);
  assert.match(failedCleanup.output, /cleanup failed/);
  assert.equal((await calls()).some(args => args.includes('run') || args.includes('down')), false);
  assert.equal((await run(['clean']).result).code, 0);
  await assert.rejects(fs.access(path.join(root, '.tmp/playwright/cleanup-failed.json')));
});
test('an interrupted run preserves logs and removes its disposable stack', { timeout: 15000 }, async t => {
  const { root, run, calls } = await setup(t);
  const { child, result } = run(['mount'], { PROBE_HOLD: '1' });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const history = await calls().catch(() => []);
    if (history.some(args => args.includes('run'))) break;
    await new Promise(resolve => setImmediate(resolve));
  }
  process.kill(-child.pid, 'SIGINT');
  const interrupted = await result;
  assert.equal(interrupted.code, 130, interrupted.output);
  assert.equal((await calls()).filter(args => args.includes('down')).length, 2);
  assert.match(await fs.readFile(path.join(root, '.tmp/playwright/logs/portal.log'), 'utf8'), /preserved diagnostic log/);
});
