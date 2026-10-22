import { MongoAndExpr } from '@prisma/orm-mongo/query-ast';
import type { UpdateResult } from '@prisma/orm-mongo/query-ast';
import type { CorePrismaClient } from '../prisma/client';
import { prismaCommand } from '../prisma/documents';
import { PersistenceError } from '../errors';
import type { SecretLeaseRepository } from './ConfigurationRepositories';

/** Typed Prisma conditional single-document updates, with unchanged BSON dates and fencing. */
export function prismaSecretLeases(client: CorePrismaClient): SecretLeaseRepository {
  const leases = client.query.from('appconfigsecretlocks');
  return {
    async inspect(name, owner) {
      const row = await client.orm.appconfigsecretlocks
        .where({ _id: name, ...(owner === undefined ? {} : { owner }) })
        .first();
      if (!row) return null;
      if (
        !(row.expiresAt instanceof Date) ||
        !Number.isFinite(row.expiresAt.getTime()) ||
        (row.owner != null && typeof row.owner !== 'string') ||
        (row.cacheToken != null && typeof row.cacheToken !== 'string')
      )
        throw new PersistenceError(
          'secret-lease',
          'Invalid secret coordination metadata. Inspect the lease without rewriting it.'
        );
      return {
        owner: row.owner ?? undefined,
        expiresAt: row.expiresAt.getTime(),
        cacheToken: row.cacheToken ?? undefined,
      };
    },
    async acquire(name, owner, now, expiresAt) {
      await prismaCommand(
        client,
        leases
          .match(f => MongoAndExpr.of([f._id.eq(name), f.expiresAt.lte(new Date(now))]))
          .upsertOne(f => [f.owner.set(owner), f.expiresAt.set(new Date(expiresAt))])
      );
    },
    async renew(name, owner, now, expiresAt) {
      const result = await prismaCommand<UpdateResult>(
        client,
        leases
          .match(f => MongoAndExpr.of([f._id.eq(name), f.owner.eq(owner), f.expiresAt.gt(new Date(now))]))
          .updateOne(f => [f.expiresAt.max(new Date(expiresAt))])
      );
      return result.matchedCount === 1;
    },
    async publishToken(name, owner, now, token) {
      const result = await prismaCommand<UpdateResult>(
        client,
        leases
          .match(f => MongoAndExpr.of([f._id.eq(name), f.owner.eq(owner), f.expiresAt.gt(new Date(now))]))
          .updateOne(f => [f.cacheToken.set(token)])
      );
      return result.matchedCount === 1;
    },
    async release(name, owner) {
      const result = await prismaCommand<UpdateResult>(
        client,
        leases
          .match(f => MongoAndExpr.of([f._id.eq(name), f.owner.eq(owner)]))
          .updateOne(f => [f.expiresAt.set(new Date(0)), f.owner.unset()])
      );
      return result.matchedCount === 1;
    },
  };
}
