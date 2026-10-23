// Disposable released-v5 checkpoint rehearsal. This is not a portal composition.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { MongoClient, BSON, GridFSBucket } = require('mongodb');
const bcrypt = require('bcryptjs');

async function main() {
  assert.equal(process.env.SR_REHEARSAL_DISPOSABLE, 'true');
  const urls = [process.env.SR_REHEARSAL_CORE_URL, process.env.SR_REHEARSAL_STORAGE_URL];
  const names = ['redbox-portal', 'redbox-storage'];
  urls.forEach((url, index) => {
    const parsed = new URL(url);
    assert.equal(parsed.host, ['127.0.0.1:28031', '127.0.0.1:28032'][index]);
    assert.equal(parsed.pathname, '/' + names[index]);
  });
  const clients = [];
  try {
    for (const url of urls) clients.push(await new MongoClient(url).connect());
    const databases = clients.map(client => client.db());
    const mode = process.argv[2];
    if (mode === 'probe') {
      const base = 'http://127.0.0.1:18507';
      const headers = {
        Authorization: 'Bearer d077835a-696b-4728-85cf-3ffd57152b1e',
        Accept: 'application/json',
      };
      assert.equal((await fetch(base + '/default/rdmp/home')).status, 200);
      const login = await fetch(base + '/user/login_local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Source': 'jsclient' },
        redirect: 'manual',
        body: JSON.stringify({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' }),
      });
      assert.equal(login.status, 200);
      assert.equal((await login.json()).user.username, 'admin');
      const times = [];
      for (let index = 0; index < 20; index++) {
        const started = performance.now();
        const response = await fetch(base + '/default/rdmp/api/forms', { headers });
        assert.equal(response.status, 200);
        await response.json();
        times.push(performance.now() - started);
      }
      times.sort((a, b) => a - b);
      console.log(
        JSON.stringify({
          mode,
          home: 200,
          localLogin: 200,
          formsRequests: times.length,
          formsLatencyMs: { p50: times[9], p95: times[18], max: times[19] },
        })
      );
    } else if (mode === 'seed') {
      const fixture = BSON.EJSON.parse(await fs.readFile(process.argv[3], 'utf8'));
      assert.equal(fixture.sourceCommit, 'c1dda53999f3b026347008731f33dba834e06c27');
      for (const database of databases) assert.equal((await database.listCollections().toArray()).length, 0);
      let documents = 0;
      for (const collection of fixture.collections) {
        assert.equal(collection.documents.length, collection.count);
        const index = names.indexOf(collection.database);
        assert(index >= 0);
        await databases[index].collection(collection.collection).insertMany(collection.documents);
        documents += collection.count;
      }
      assert.equal(documents, 123);
      // The committed fixture intentionally has no credentials. Only this
      // disposable rehearsal receives the repository's synthetic test credentials.
      await databases[0].collection('user').updateOne(
        { username: 'admin' },
        {
          $set: {
            password: await bcrypt.hash('rbadmin', 10),
            token: createHash('sha256').update('d077835a-696b-4728-85cf-3ffd57152b1e').digest('base64'),
          },
        }
      );
      await pipeline(
        Readable.from(Buffer.from('checkpoint GridFS bytes')),
        new GridFSBucket(databases[1], {
          bucketName: 'rehearsal',
        }).openUploadStream('checkpoint.txt')
      );
      console.log(
        JSON.stringify({ mode, fixtureDocuments: documents, fixtureCollections: fixture.collections.length })
      );
    } else if (mode === 'snapshot' || mode === 'verify') {
      const snapshot = [];
      for (const database of databases) {
        for (const { name } of (await database.listCollections().toArray()).sort((a, b) =>
          a.name.localeCompare(b.name)
        )) {
          const collection = database.collection(name);
          const documents = await collection.find().sort({ _id: 1 }).toArray();
          const indexes = (await collection.listIndexes().toArray()).sort((a, b) => a.name.localeCompare(b.name));
          const checksum = createHash('sha256')
            .update(BSON.EJSON.stringify({ documents, indexes }, { relaxed: false }))
            .digest('hex');
          snapshot.push({ database: database.databaseName, collection: name, count: documents.length, checksum });
        }
      }
      if (mode === 'snapshot') await fs.writeFile(process.argv[3], JSON.stringify(snapshot, null, 2) + '\n');
      else assert.deepEqual(snapshot, JSON.parse(await fs.readFile(process.argv[3], 'utf8')));
      const chunks = [];
      for await (const chunk of new GridFSBucket(databases[1], { bucketName: 'rehearsal' }).openDownloadStreamByName(
        'checkpoint.txt'
      ))
        chunks.push(chunk);
      assert.equal(Buffer.concat(chunks).toString(), 'checkpoint GridFS bytes');
      console.log(
        JSON.stringify({
          mode,
          collections: snapshot.length,
          documents: snapshot.reduce((sum, row) => sum + row.count, 0),
          gridfs: true,
        })
      );
    } else if (mode === 'review-source-index') {
      // Explicit, fixture-specific operator action, outside the maintenance CLI.
      // A v5 nonunique OID index must not silently satisfy v6 uniqueness.
      const report = JSON.parse(await fs.readFile(process.argv[3], 'utf8'));
      const conflicts = report.groups.filter(row => row.index === 'conflicting' || row.duplicateKeyGroups > 0);
      assert.equal(conflicts.length, 1);
      assert.equal(conflicts[0].datastore, 'redboxStorage');
      assert.equal(conflicts[0].collection, 'record');
      assert.equal(conflicts[0].name, 'redboxOid_1');
      assert.equal(conflicts[0].duplicateKeyGroups, 0);
      const collection = databases[1].collection('record');
      const index = (await collection.indexes()).find(value => value.name === 'redboxOid_1');
      assert.deepEqual(index.key, { redboxOid: 1 });
      assert.notEqual(index.unique, true);
      assert(!index.sparse && !index.partialFilterExpression && !index.hidden);
      assert.equal(index.expireAfterSeconds, undefined);
      assert(!index.collation || index.collation.locale === 'simple');
      const documents = await collection.countDocuments();
      assert.equal(documents, 2);
      assert.equal(
        await collection.countDocuments({
          $expr: { $and: [{ $eq: [{ $type: '$redboxOid' }, 'string'] }, { $ne: ['$redboxOid', ''] }] },
        }),
        documents
      );
      assert.equal(
        (
          await collection
            .aggregate([{ $group: { _id: '$redboxOid', count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }])
            .toArray()
        ).length,
        0
      );
      await collection.dropIndex('redboxOid_1');
      assert.equal(await collection.countDocuments(), documents);
      console.log(
        JSON.stringify({
          mode,
          collection: 'record',
          index: index.name,
          oldUnique: false,
          duplicateGroups: 0,
          preservedDocuments: documents,
          action: 'Reviewed removal of this exact nonunique v5 index; explicit ensure creates v6 uniqueness.',
        })
      );
    } else if (mode === 'upgrade-components') {
      const runtime = require('../../dist/extensions/storage');
      const { runApplicationMigrations } = require('../../dist/application/migrations');
      const hook = require('@researchdatabox/sails-hook-redbox-storage-mongo/extension');
      const owner = {
        config: { datastores: { mongodb: { url: urls[0] }, redboxStorage: { url: urls[1] } } },
        log: console,
      };
      try {
        await runtime.initializePersistence(owner);
        await runtime.initializeMigrationPersistence(owner);
        const definitions = hook.registerRedboxExtension().migrations.map(declaration => ({
          name: declaration.name,
          up: () => declaration.run({ owner }),
        }));
        const input = { ledger: runtime.getMigrationLedgerRepository(owner), context: {}, log: console };
        await runApplicationMigrations(definitions, input);
        const completed = await input.ledger.executedNames();
        assert(definitions.every(definition => completed.includes(definition.name)));
        await runApplicationMigrations(definitions, input);
        assert.deepEqual(await input.ledger.executedNames(), completed);
        assert.equal(await databases[1].collection('record').countDocuments({ revision: { $gte: 0 } }), 2);
        await runtime.initializeIdentityPersistence(owner);
        const identities = runtime.getIdentityRepositories(owner);
        const user = await identities.one('user', { username: 'admin' }, { populate: ['roles'] });
        assert(await identities.verifyPassword(user.id, 'rbadmin'));
        assert.equal(user.roles.length, 4);
        // A failed body can leave writes in either datastore. A ledger entry
        // must not turn such partial work into a claimed successful migration.
        await assert.rejects(
          runApplicationMigrations(
            [
              {
                name: 'sr-p7-interrupted',
                up: async () => {
                  await databases[0].collection('recovery_partial').insertOne({ phase: 'core-written' });
                  await databases[1].collection('record').updateOne({}, { $set: { 'metadata.recoveryPartial': true } });
                  throw Error('deliberate rehearsal interruption');
                },
              },
            ],
            input
          ),
          /deliberate rehearsal interruption/
        );
        assert.equal(await databases[0].collection('recovery_partial').countDocuments(), 1);
        assert.equal(await databases[1].collection('record').countDocuments({ 'metadata.recoveryPartial': true }), 1);
        assert.equal(await databases[0].collection('migration').countDocuments({ name: 'sr-p7-interrupted' }), 0);
        console.log(
          JSON.stringify({
            mode,
            migrations: definitions.length,
            secondRun: 0,
            preservedRoles: user.roles.length,
            localPassword: true,
            partialFailure: true,
            limitation: 'Component upgrade only; no production Express portal composition is available.',
          })
        );
      } finally {
        await runtime.cleanupPersistence(owner);
        assert.equal(runtime.persistenceStatus(owner).pools, 0);
      }
    } else if (mode === 'destroy-disposable') {
      for (const database of databases) await database.dropDatabase();
      console.log(JSON.stringify({ mode, dropped: names }));
    } else throw Error('Unknown rehearsal operation');
  } finally {
    for (const client of clients) await client.close();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
