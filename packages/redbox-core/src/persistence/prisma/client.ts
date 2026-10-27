import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mongo from '@prisma/orm-mongo/runtime';
import { contractFromJson } from '@prisma/orm-mongo/static';
import type { MongoClient } from 'mongodb';
import type { Contract } from './generated/contract';
import type { Contract as StorageContract } from './storage-generated/contract';

/** Offline construction over a borrowed pool. The application runtime owns its lifetime. */
export function createCorePrismaClient(client: MongoClient, dbName: string) {
  const contractJson: unknown = JSON.parse(readFileSync(join(__dirname, 'generated/contract.json'), 'utf8'));
  return mongo({ contract: contractFromJson<Contract>(contractJson), mongoClient: client, dbName });
}
export function createStoragePrismaClient(
  client: MongoClient,
  dbName: string
) {
  const contractJson: unknown = JSON.parse(readFileSync(join(__dirname, 'storage-generated/contract.json'), 'utf8'));
  return mongo({ contract: contractFromJson<StorageContract>(contractJson), mongoClient: client, dbName });
}
export type CorePrismaClient = ReturnType<typeof createCorePrismaClient>;
export type StoragePrismaClient = ReturnType<typeof createStoragePrismaClient>;

