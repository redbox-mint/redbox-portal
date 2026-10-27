const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('Express Mocha selection preserves explicit args, environment paths, defaults and coverage', t => {
  const root = path.resolve(__dirname, '../..');
  const fixture = mkdtempSync(path.join(root, '.tmp/mocha-runner-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(path.join(fixture, 'support/integration-testing'), { recursive: true });
  mkdirSync(path.join(fixture, 'bin'), { recursive: true });
  mkdirSync(path.join(fixture, 'node_modules/.bin'), { recursive: true });
  copyFileSync(
    path.join(root, 'support/integration-testing/run-mocha-express.sh'),
    path.join(fixture, 'support/integration-testing/run-mocha-express.sh')
  );
  writeFileSync(path.join(fixture, 'bin/node'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(
    path.join(fixture, 'node_modules/.bin/nyc'),
    `#!/bin/sh
    exec '${process.execPath}' -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' -- "$@"
  `,
    { mode: 0o755 }
  );
  for (const scenario of [
    { env: '', args: [], expected: ['test/integration/**/*.test.ts'] },
    { env: 'test/one.test.ts\n test/two.test.ts', args: [], expected: ['test/one.test.ts', 'test/two.test.ts'] },
    { env: 'test/ignored.test.ts', args: ['test/explicit.test.ts'], expected: ['test/explicit.test.ts'] },
  ]) {
    const coverage = path.join(fixture, 'coverage/mocha');
    const output = execFileSync('bash', ['support/integration-testing/run-mocha-express.sh', ...scenario.args], {
      cwd: fixture,
      env: {
        ...process.env,
        PATH: path.join(fixture, 'bin') + ':' + process.env.PATH,
        RBPORTAL_MOCHA_TEST_PATHS: scenario.env,
        RBPORTAL_COVERAGE_DIR: coverage,
        NYC_OUTPUT: path.join(fixture, 'nyc'),
      },
      encoding: 'utf8',
    });
    const args = JSON.parse(output);
    assert.deepEqual(args.slice(args.indexOf('test/express.bootstrap.test.cjs') + 1), scenario.expected);
    assert.equal(args[args.indexOf('--report-dir') + 1], coverage);
    assert.ok(args.includes('--reporter=lcov'));
  }
});
