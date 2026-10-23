import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { ApplicationRuntime } from '../../src/application';
import { initializePersistence } from '../../src/persistence/runtime';
import type { PersistenceOwner } from '../../src/persistence/owner';
import { initializeBrandingPersistence, getBrandingRepository } from '../../src/persistence/branding/runtime';
import { ensureBrandingPersistenceIndexes } from '../../src/persistence/branding/preflight';
import { initializeIdentityPersistence, getIdentityRepositories } from '../../src/persistence/identity/runtime';
import { initializeReferencePersistence, getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { referenceIndexes } from '../../src/persistence/reference/preflight';
import { HttpIdentity } from '../../src/http/express/identity';

let counter = 0;
export async function mongoFixture() {
  assert.equal(Reflect.get(globalThis, 'sails'), undefined, 'Run standalone without legacy setup');
  assert(process.env.HTTP_PILOT_TEST_MONGO_URL, 'HTTP_PILOT_TEST_MONGO_URL is required, never skipped');
  const base = new URL(process.env.HTTP_PILOT_TEST_MONGO_URL);
  assert.equal(base.pathname, '/sr_p4_http');
  const database = `sr_p4_http_${process.pid}_${counter++}`;
  base.pathname = '/' + database;
  const native = await new MongoClient(base.toString()).connect();
  const owner: PersistenceOwner = {
    config: {
      datastores: {
        mongodb: { url: base.toString(), maxPoolSize: 4 },
        redboxStorage: { url: base.toString(), maxPoolSize: 4 },
      },
    },
    log: { warn() {} },
  };
  const application = new ApplicationRuntime(owner, [
    {
      name: 'pilotPersistence',
      create: () => ({
        initialize: async () => {
          await initializeBrandingPersistence(owner);
          await initializeIdentityPersistence(owner);
          await initializeReferencePersistence(owner);
        },
        close: async () => {},
      }),
    },
  ]);
  try {
    for (const index of referenceIndexes)
      await native
        .db()
        .collection(index.collection)
        .createIndex(index.keys, { name: index.name, unique: index.unique });
    await initializePersistence(owner);
    await ensureBrandingPersistenceIndexes(owner);
    await application.initialize();
    const branding = getBrandingRepository(owner);
    const identities = getIdentityRepositories(owner);
    const brand = await branding.createBrand({ name: 'default' });
    const otherBrand = await branding.createBrand({ name: 'other' });
    const role = await identities.create('role', { name: 'Admin', branding: brand.id });
    const reader = await identities.create('role', { name: 'Researcher', branding: brand.id });
    await identities.create('pathrule', {
      path: '/:branding/:portal/api(/*)',
      role: role.id,
      branding: brand.id,
      can_update: true,
    });
    const user = await identities.create('user', {
      username: 'pilot-admin',
      name: 'Synthetic Admin',
      type: 'local',
      email: 'synthetic@example.invalid',
      password: 'pilot-password',
      token: createHash('sha256').update('pilot-api-token').digest('base64'),
      roles: [role.id],
    });
    return {
      owner,
      application,
      native,
      brand,
      otherBrand,
      branding,
      identities,
      user,
      role,
      reader,
      identity: new HttpIdentity(identities),
      recordTypes: getReferenceRepositories(owner).recordTypes,
      async close() {
        await application.stop();
        await native.db().dropDatabase();
        await native.close();
      },
    };
  } catch (error) {
    await application.stop();
    await native.db().dropDatabase();
    await native.close();
    throw error;
  }
}
