// Explicit retained Express adapter cases, removed with FM-043.
import type { PersistenceOwner } from '../../src/persistence/owner';
import assert from 'node:assert/strict';
import { GridFSBucket, MongoClient, ObjectId, type FindCursor } from 'mongodb';
import * as runtime from '../../src/persistence/runtime';
import * as storageRuntime from '../../src/persistence/storage/runtime';
const persistence = { ...runtime, ...storageRuntime };
import { ensureCachePersistenceIndex } from '../../src/persistence/cache/preflight';
import { initializeCachePersistence, getCacheEntryRepository } from '../../src/persistence/cache/runtime';
import { inspectPersistenceIndex, ensurePersistenceIndex } from '../../src/persistence/indexes';
import { composeHttpSession } from '../../src/http/express/session';
import { createSinonStubLogger } from '../logger.test';
import express from 'express';
import { createServer } from 'node:http';
import * as sinon from 'sinon';
import { GridFSDriver } from '../../src/storage/GridFSDriver';
import { Services as LogoServices } from '../../src/services/BrandingLogoService';
import { executeNamedQuery } from '../../src/persistence/reference/NamedQueryExecution';
import { executeStorageQuery } from '../../src/persistence/storage/NamedQueryTargets';

const url = process.env.PERSISTENCE_TEST_MONGO_URL;
(url ? describe : describe.skip)('Prisma persistence regression contracts', function () {
  this.timeout(30_000);
  let app: PersistenceOwner, native: MongoClient;
  const names = [
    'Migration',
    'Reference',
    'Configuration',
    'Progress',
    'Harvest',
    'Siem',
    'Figshare',
    'Vocabulary',
    'Branding',
    'Identity',
    'Storage',
  ];
  const brand = new ObjectId().toHexString();
  before(async () => {
    native = await new MongoClient(url!).connect();
    app = {
      config: {
        datastores: { mongodb: { url }, redboxStorage: { url: url!.replace(/\/([^/?]+)(\?|$)/, '/$1_storage$2') } },
      },
      log: { warn() {} },
    } as any;
    await persistence.initializePersistence(app);
    await ensureCachePersistenceIndex(app);
    await persistence.ensureMigrationPersistenceIndex(app);
    await require('../../src/persistence/progress/preflight').ensureProgressPersistenceIndexes(app);
    for (const name of names.filter(name => !['Migration', 'Progress'].includes(name)))
      await (persistence as any)['ensure' + name + 'PersistenceIndexes'](app);
    await initializeCachePersistence(app);
    for (const name of names) await (persistence as any)['initialize' + name + 'Persistence'](app);
  });
  after(async () => {
    if (!native) return;
    await persistence.cleanupPersistence(app);
    await native.db().dropDatabase();
    const storage = new URL(url!);
    storage.pathname += '_storage';
    await native.db(storage.pathname.slice(1)).dropDatabase();
    await native.close();
  });

  it('shares session transport with the app runtime and closes it only after the store', async () => {
    const web = express();
    const sessions = composeHttpSession({ adapter: 'mongo', mongoUrl: url, secret: 'fixture-secret', cookie: { secure: false } }, app);
    await sessions.ready;
    web.use(sessions.middleware);
    web.get('/', (req, res) => {
      (req.session as any).fixture = true;
      res.end('ok');
    });
    const server = createServer(web);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/`);
      assert.equal(await response.text(), 'ok');
      assert.equal(
        (await persistence.mongoSessionDatabase(app, { mongoUrl: url })).client,
        (await persistence.mongoDatabase(app, 'mongodb')).client
      );
      assert.equal(await native.db().collection('sessions').countDocuments(), 1);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await sessions.drain();
    }
  });
  
});
