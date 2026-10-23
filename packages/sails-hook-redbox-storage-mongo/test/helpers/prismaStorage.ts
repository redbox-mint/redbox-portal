import type { MongoClient } from 'mongodb';
import { PrismaStorage } from '../../src/persistence/PrismaStorage';
import { prismaRecordDocuments } from '../../src/persistence/PrismaRecordDocuments';
import { initializePersistence, prismaDatabase, cleanupPersistence } from '@researchdatabox/redbox-core';

/** Live tests borrow app-owned clients just like the deployed storage hook. */
export async function prismaStorage(
  client: MongoClient,
  database: string
): Promise<PrismaStorage & { testApp: Sails.Application; testClose(): Promise<void> }> {
  const url = new URL(
    client.options.srvHost
      ? `mongodb+srv://${client.options.srvHost}`
      : `mongodb://${client.options.hosts.map(host => host.toString()).join(',')}`
  );
  url.pathname = '/' + database;
  const app = {
    ...sails,
    config: { ...sails.config, datastores: { redboxStorage: { url: url.toString() } } },
  } as Sails.Application;
  await initializePersistence(app);
  const prisma = await prismaDatabase(app, 'redboxStorage');
  const service = new PrismaStorage(app);
  Reflect.set(service, 'client', prisma);
  service.recordCol = prismaRecordDocuments(prisma, 'record');
  service.deletedRecordCol = prismaRecordDocuments(prisma, 'deletedrecord');
  service.recordIdentityCol = prismaRecordDocuments(prisma, 'recordidentity');
  Reflect.set(service, '_requiredIndicesReady', true);
  return Object.assign(service, { testApp: app, testClose: () => cleanupPersistence(app) });
}
