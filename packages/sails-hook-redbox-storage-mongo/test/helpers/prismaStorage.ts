import type { MongoClient } from 'mongodb';
import type { PersistenceOwner } from '@researchdatabox/redbox-core';
import { storageFixture } from './storageFixture';
import { PrismaStorage } from '../../src/persistence/PrismaStorage';
import { prismaRecordDocuments } from '../../src/persistence/PrismaRecordDocuments';
import { initializePersistence, prismaDatabase, cleanupPersistence } from '@researchdatabox/redbox-core';

/** Live tests borrow app-owned clients just like the deployed storage hook. */
export async function prismaStorage(
  client: MongoClient,
  database: string,
  exportMaxRecords = 10
): Promise<PrismaStorage & { testApp: PersistenceOwner; testClose(): Promise<void> }> {
  const url = new URL(
    client.options.srvHost
      ? `mongodb+srv://${client.options.srvHost}`
      : `mongodb://${client.options.hosts.map(host => host.toString()).join(',')}`
  );
  url.pathname = '/' + database;
  const input = storageFixture(exportMaxRecords);
  const app: PersistenceOwner = { config: { datastores: { redboxStorage: { url: url.toString() } } }, log: input.log };
  await initializePersistence(app);
  const prisma = await prismaDatabase(app, 'redboxStorage');
  const service = new PrismaStorage(app, input);
  Reflect.set(service, 'client', prisma);
  service.recordCol = prismaRecordDocuments(prisma, 'record');
  service.deletedRecordCol = prismaRecordDocuments(prisma, 'deletedrecord');
  service.recordIdentityCol = prismaRecordDocuments(prisma, 'recordidentity');
  Reflect.set(service, '_requiredIndicesReady', true);
  return Object.assign(service, { testApp: app, testClose: () => cleanupPersistence(app) });
}
