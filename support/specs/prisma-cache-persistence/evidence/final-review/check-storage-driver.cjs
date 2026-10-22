// Review-only real-driver check. Owns a disposable MongoDB container and uses
// the existing storage concurrency suite without altering its assertions.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../../../..');
const storage = path.join(root, 'packages/sails-hook-redbox-storage-mongo');
const storageRequire = createRequire(path.join(storage, 'package.json'));
assert.equal(storageRequire('mongodb/package.json').version, '7.2.0');
async function main() {
  let container;
  try {
    container = execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--label',
        'redbox.task=final-review-storage',
        '-p',
        '127.0.0.1::27017',
        'mongo:8.0.34@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907',
      ],
      { encoding: 'utf8' }
    ).trim();
    const address = execFileSync('docker', ['port', container, '27017/tcp'], { encoding: 'utf8' }).trim();
    const { MongoClient } = storageRequire('mongodb');
    const readiness = new MongoClient(`mongodb://${address}`, { serverSelectionTimeoutMS: 30_000 });
    try {
      await readiness.connect();
      assert.equal((await readiness.db().command({ buildInfo: 1 })).version, '8.0.34');
    } finally {
      await readiness.close();
    }
    execFileSync(
      process.execPath,
      [
        '--no-experimental-strip-types',
        path.join(root, 'node_modules/mocha/bin/mocha.js'),
        '--no-config',
        '--require',
        'ts-node/register',
        '--require',
        'test/setup.ts',
        '--timeout',
        '30000',
        'test/integration/MongoStorageConcurrency.integration.test.ts',
      ],
      {
        cwd: storage,
        stdio: 'inherit',
        timeout: 120_000,
        env: {
          ...process.env,
          TS_NODE_PROJECT: 'test/tsconfig.json',
          TS_NODE_TRANSPILE_ONLY: 'true',
          MONGO_CONCURRENCY_TEST_URL: `mongodb://${address}`,
        },
      }
    );
    console.log(`PASS storage concurrency with mongodb@7.2.0, MongoDB 8.0.34, ${process.version}`);
  } finally {
    if (container) execFileSync('docker', ['rm', '-fv', container], { stdio: 'ignore' });
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
