const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const Module = require('node:module');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  assert.notEqual(name, 'sails');
  assert.notEqual(name, 'rc');
  assert.notEqual(name, '@researchdatabox/redbox-core');
  return originalLoad.call(this, name, ...args);
};
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = () => {
  throw Error('Maintenance opened a listener');
};
const signals = ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name));
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = () => {
  throw Error('Maintenance import connected');
};
const { runIndexMaintenance } = require('@researchdatabox/redbox-core/maintenance');
const { portalDefaults } = require('@researchdatabox/redbox-core/configuration');
const runtime = require('@researchdatabox/redbox-core/extensions/storage');
assert.equal(typeof runIndexMaintenance, 'function');
net.Socket.prototype.connect = originalConnect;
const { createRequire } = require('node:module');
const coreRequire = createRequire(require.resolve('@researchdatabox/redbox-core/package.json'));
const { MongoClient } = coreRequire('mongodb');
(async () => {
  assert(process.env.LIFECYCLE_TEST_MONGO_URL, 'Real Mongo input is required; no skip');
  const base = new URL(process.env.LIFECYCLE_TEST_MONGO_URL);
  assert.equal(base.pathname, '/sr_p3_lifecycle');
  const names = ['core', 'storage', 'queue'].map(scope => `sr_p3_maintenance_${process.pid}_${scope}`);
  const urls = names.map(name => {
    const value = new URL(base);
    value.pathname = '/' + name;
    return value.href;
  });
  const client = await new MongoClient(base.href).connect();
  const databases = names.map(name => client.db(name));
  const guard = path.join(__dirname, 'guard.cjs');
  fs.writeFileSync(
    guard,
    `
const assert = require('node:assert/strict');
const Module = require('node:module');
const net = require('node:net');
const load = Module._load;
const before = ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name));
Module._load = function(name, ...args) {
  assert(!['sails', 'rc', '@researchdatabox/redbox-core'].includes(name), 'Forbidden maintenance import');
  return load.call(this, name, ...args);
};
net.Server.prototype.listen = () => { throw Error('Maintenance opened a listener'); };
process.on('beforeExit', () => {
  assert.equal(global.sails, undefined);
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)), before);
  for (const file of Object.keys(require.cache)) {
    assert(file.startsWith(__dirname), 'Source-tree shortcut');
    assert(!/\\/redbox-core\\/dist\\/(?:index|CoreBase|CoreService)\\.js$|\\/compat\\//.test(file), 'Legacy graph');
  }
});
`
  );
  const config = path.join(__dirname, 'deployment.mjs');
  fs.writeFileSync(
    config,
    `await Promise.resolve();\nexport default ${JSON.stringify({ datastores: { mongodb: { url: urls[0] }, redboxStorage: { url: urls[1] } }, agendaQueue: { options: { db: urls[2] } } })};\n`
  );
  const command = path.join(
    path.dirname(require.resolve('@researchdatabox/redbox-core/package.json')),
    'bin/persistence-indexes.cjs'
  );
  const env = { ...process.env, REDBOX_AGENDA_COLLECTION: 'qualifiedJobs', NODE_PATH: '' };
  async function cli(args, expected, selectedConfig = config) {
    let result;
    try {
      result = {
        ...(await execute(
          process.execPath,
          ['--require', guard, command, '--app', __dirname, '--config', selectedConfig, ...args],
          { cwd: __dirname, env, timeout: 30000, maxBuffer: 1024 * 1024 }
        )),
        code: 0,
      };
    } catch (error) {
      result = error;
    }
    assert.equal(result.code, expected, result.stderr);
    assert(!result.stdout.includes('mongodb://'), 'Report exposed deployment connections');
    if (expected === 1) return result;
    const report = JSON.parse(result.stdout.trim());
    assert.equal(report.persistence.pools, 0);
    assert.equal(report.persistence.prismaClients, 0);
    assert.equal(report.persistence.operations, 0);
    assert.deepEqual(report.persistence.resources, []);
    return report;
  }
  try {
    const first = await cli(['--inspect'], 2);
    assert.equal(first.ready, false);
    for (const db of databases) assert.deepEqual(await db.listCollections().toArray(), [], 'Inspect performed DDL');
    await databases[0].collection('cacheentry').insertMany([
      { name: 'duplicate', value: 1 },
      { name: 'duplicate', value: 2 },
    ]);
    const duplicates = await cli(['--ensure'], 2);
    assert(duplicates.groups.some(report => report.duplicateKeyGroups > 0));
    assert.deepEqual(
      (await databases[0].listCollections().toArray()).map(row => row.name),
      ['cacheentry']
    );
    assert.deepEqual(await databases[1].listCollections().toArray(), []);
    assert.deepEqual(await databases[2].listCollections().toArray(), []);
    await databases[0].collection('cacheentry').deleteMany({});
    await databases[0]
      .collection('namedquery')
      .createIndex({ key: 1 }, { name: 'namedquery_key_unique', unique: true, sparse: true });
    const conflict = await cli(['--ensure'], 2);
    assert(conflict.groups.some(report => report.index === 'conflicting'));
    assert.deepEqual(await databases[1].listCollections().toArray(), []);
    assert.deepEqual(await databases[2].listCollections().toArray(), []);
    await databases[0].collection('namedquery').dropIndex('namedquery_key_unique');
    const ensured = await cli(['--ensure'], 0);
    assert.equal(ensured.ready, true);
    assert.equal(ensured.groups.filter(report => report.group === 'agenda').length, 3);
    const inspected = await cli([], 0);
    assert.deepEqual(inspected.groups, ensured.groups);
    const sqsConfig = path.join(__dirname, 'sqs-config.cjs');
    fs.writeFileSync(
      sqsConfig,
      `module.exports = ${JSON.stringify({
        datastores: { mongodb: { url: urls[0] }, redboxStorage: { url: urls[1] } },
        agendaQueue: { options: { backend: 'sqs', db: urls[2] } },
      })};`
    );
    const sqs = await cli([], 0, sqsConfig);
    assert.equal(sqs.groups.filter(report => report.group === 'agenda').length, 3);
    const sqsOnlyConfig = path.join(__dirname, 'sqs-only-config.cjs');
    fs.writeFileSync(
      sqsOnlyConfig,
      `module.exports = ${JSON.stringify({
        datastores: { mongodb: { url: urls[0] }, redboxStorage: { url: urls[1] } },
        agendaQueue: {
          options: { backend: 'sqs', db: 'mongodb://127.0.0.1:1/must-not-connect' },
          jobs: Object.fromEntries(
            Object.keys(portalDefaults().values.agendaQueue.jobs).map(name => [name, { backend: 'sqs' }])
          ),
        },
      })};`
    );
    const sqsOnly = await cli([], 0, sqsOnlyConfig);
    assert.equal(sqsOnly.groups.filter(report => report.group === 'agenda').length, 0);
    // This failure occurs after real pools are acquired. The subprocess must
    // close them and exit naturally, without jobs, listeners or signal handlers.
    await databases[2].collection('qualifiedJobs').drop();
    await databases[2].createCollection('qualifiedJobs', { collation: { locale: 'en' } });
    const failedInspection = await cli(['--ensure'], 1);
    assert(!failedInspection.stderr.includes('mongodb://'));
    assert.equal(await databases[0].collection('migration').countDocuments(), 0);
    assert.equal(await databases[2].collection('qualifiedJobs').countDocuments(), 0);
    assert.equal(await databases[2].listCollections({ name: 'agenda_logs' }).hasNext(), false);
    const bad = path.join(__dirname, 'bad-config.cjs');
    fs.writeFileSync(bad, `module.exports = { orm: { secret: 'fixture-secret-must-not-print' } };`);
    // A duplicate mode is a usage failure before imports; a typed unknown key is redacted config failure.
    await assert.rejects(
      execute(process.execPath, [command, '--inspect', '--ensure'], { cwd: __dirname, env }),
      error => error.code === 2
    );
    await assert.rejects(
      execute(process.execPath, ['--require', guard, command, '--app', __dirname, '--config', bad], {
        cwd: __dirname,
        env,
        timeout: 30000,
      }),
      error => error.code === 1 && !error.stderr.includes('fixture-secret')
    );
    // The existing explicit maintenance API is neutral too. Index maintenance above never invokes it.
    await databases[1].collection('record').insertOne({ redboxOid: 'legacy', metadata: { title: 'fixture' } });
    const hook = await import('@researchdatabox/sails-hook-redbox-storage-mongo/extension');
    const owner = {
      config: { datastores: { mongodb: { url: urls[0] }, redboxStorage: { url: urls[1] } } },
      log: { warn() {}, info() {}, error() {} },
    };
    await runtime.initializePersistence(owner);
    try {
      const maintenance = hook.recordRevisionMaintenance(owner);
      const one = await maintenance.backfill();
      const two = await maintenance.backfill();
      assert.equal(one.activeUpdated, 1);
      assert.equal(two.activeUpdated, 0);
    } finally {
      await runtime.cleanupPersistence(owner);
    }
    assert.equal(runtime.persistenceStatus(owner).pools, 0);
    assert.equal(await databases[0].collection('migration').countDocuments(), 0);
    assert.equal(await databases[2].collection('qualifiedJobs').countDocuments(), 0);
    for (const file of Object.keys(require.cache)) assert(file.startsWith(__dirname), 'Source-tree shortcut');
    assert.deepEqual(
      ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)),
      signals
    );
    console.log(
      JSON.stringify({
        scopes: ensured.groups.length,
        agendaScopes: 3,
        commands: 10,
        pending: 0,
        failures: 0,
        explicitBackfill: '1 then 0',
        poolCount: 0,
      })
    );
  } finally {
    for (const db of databases) await db.dropDatabase();
    await client.close();
    net.Server.prototype.listen = originalListen;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
