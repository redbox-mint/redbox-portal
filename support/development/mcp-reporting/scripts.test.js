'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

// Run isolated script copies. Every command capable of changing host services
// is a stub, including sudo, so these tests never touch Docker or Tailscale.
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reporting-script-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bin = path.join(directory, 'bin');
  fs.mkdirSync(bin);
  for (const name of ['run.sh', 'stop.sh']) fs.copyFileSync(path.join(__dirname, name), path.join(directory, name));
  fs.copyFileSync(
    path.join(__dirname, '../../integration-testing/run-reporting-compose.sh'),
    path.join(directory, 'run-reporting-compose.sh')
  );
  fs.writeFileSync(
    path.join(directory, 'prepare.js'),
    `
    const fs = require('node:fs');
    fs.appendFileSync(process.env.TEST_CALLS, 'prepare\\n');
    fs.mkdirSync(__dirname + '/.dev', { recursive: true });
    fs.writeFileSync(__dirname + '/.dev/demo.env', 'REDBOX_DEMO_URL=' + process.argv[2] + '\\n');
  `
  );
  const calls = path.join(directory, 'calls');
  fs.writeFileSync(calls, '');
  for (const name of ['docker', 'tailscale', 'iptables', 'sudo']) {
    fs.writeFileSync(
      path.join(bin, name),
      `#!${process.execPath}
      const fs = require('node:fs');
      const args = process.argv.slice(2);
      fs.appendFileSync(process.env.TEST_CALLS, JSON.stringify([${JSON.stringify(name)}, ...args]) + '\\n');
      if (${JSON.stringify(name)} === 'tailscale' && args[0] === 'status')
        console.log(JSON.stringify({ Self: { DNSName: 'demo.example.' } }));
      if (${JSON.stringify(name)} === 'docker' && args[0] === 'network')
        console.log(args.join(' ').includes('Subnet') ? '172.30.0.0/16' : '1234567890123456');
    `,
      { mode: 0o755 }
    );
  }
  return {
    directory,
    calls: () => fs.readFileSync(calls, 'utf8'),
    run: (script, args = [], extraEnv = {}) =>
      spawnSync('bash', [path.join(directory, script), ...args], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_CALLS: calls, RBPORTAL_IMAGE: '', ...extraEnv },
      }),
    save: url => {
      fs.mkdirSync(path.join(directory, '.dev'), { recursive: true });
      fs.writeFileSync(path.join(directory, '.dev/demo.env'), `REDBOX_DEMO_URL=${url}\n`);
    },
  };
}

const invalidOrigins = [
  'https://demo.example',
  'https://demo.example:443',
  'https://demo.example:0443',
  'https://demo.example:0',
  'http://demo.example:8443',
  'https://user:password@demo.example:8443',
  'https://demo.example:8443/path',
  'https://demo.example:8443/?query=yes',
  'https://demo.example:8443/#fragment',
  'not-a-url',
  '',
];
for (const url of invalidOrigins) {
  if (url)
    test(`startup rejects ${url} before preparation or host commands`, t => {
      const f = fixture(t);
      f.save('https://demo.example:8443');
      const before = fs.readFileSync(path.join(f.directory, '.dev/demo.env'), 'utf8');
      assert.notEqual(f.run('run.sh', [url]).status, 0);
      assert.equal(f.calls(), '');
      assert.equal(fs.readFileSync(path.join(f.directory, '.dev/demo.env'), 'utf8'), before);
    });
  test(`shutdown rejects saved origin ${JSON.stringify(url)} before host commands`, t => {
    const f = fixture(t);
    f.save(url);
    assert.notEqual(f.run('stop.sh').status, 0);
    assert.equal(f.calls(), '');
  });
}

test('rejected startup leaves a fresh demo unprepared', t => {
  const f = fixture(t);
  assert.notEqual(f.run('run.sh', ['https://demo.example:443']).status, 0);
  assert.equal(fs.existsSync(path.join(f.directory, '.dev')), false);
  assert.equal(f.calls(), '');
});

for (const args of [[], ['https://demo.example:9443']]) {
  test(`dedicated-port startup and shutdown work with stubs: ${JSON.stringify(args)}`, t => {
    const f = fixture(t);
    const port = args.length ? '9443' : '8443';
    const start = f.run('run.sh', args);
    assert.equal(start.status, 0, start.stderr);
    assert.match(f.calls(), /prepare\n/);
    assert.match(f.calls(), new RegExp(`"--https=${port}"`));
    const stop = f.run('stop.sh');
    assert.equal(stop.status, 0, stop.stderr);
    assert.ok(f.calls().includes(`"--https=${port}","off"`));
    assert.match(f.calls(), /"down"/);
    assert.doesNotMatch(f.calls(), /"--https=443"/);
  });
}

test('reporting runner rejects an unspecified image without Docker calls, including cleanup', t => {
  const f = fixture(t);
  assert.notEqual(f.run('run-reporting-compose.sh').status, 0);
  assert.equal(f.calls(), '');
});

test('reporting runner accepts the CI checkout-built image', t => {
  const f = fixture(t);
  const result = f.run('run-reporting-compose.sh', [], { RBPORTAL_IMAGE: 'redbox-portal:test' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.calls(), /"up"/);
  assert.match(f.calls(), /"down"/);
});
