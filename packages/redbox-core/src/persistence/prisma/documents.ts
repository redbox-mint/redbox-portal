import type { MongoQueryPlan } from '@prisma/orm-mongo/query-ast';
import type { CorePrismaClient } from './client';

export type DocumentCollection = keyof CorePrismaClient['orm'];

/** Prisma runtime results are single command results; errors reach each domain's safe boundary. */
export async function prismaCommand<T>(client: CorePrismaClient, plan: MongoQueryPlan): Promise<T> {
  return (await (await client.runtime()).query(plan).toArray())[0] as T;
}
