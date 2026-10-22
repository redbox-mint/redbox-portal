import type { SecretLeaseRepository } from '../../src/persistence/configuration/ConfigurationRepositories';
import { PersistenceError } from '../../src/persistence/errors';

/** Private borrowed-manager/driver shape. Filters and BSON dates never reach services. */
export interface LockCollection {
  findOne(filter: object): Promise<{ owner?: string; expiresAt: Date; cacheToken?: string } | null>;
  updateOne(filter: object, update: object, options?: object): Promise<{ matchedCount: number }>;
}
export function secretLeaseRepository(collection: () => LockCollection): SecretLeaseRepository {
  return {
    async inspect(name, owner) {
      const row = await collection().findOne({ _id: name, ...(owner === undefined ? {} : { owner }) });
      if (!row) return null;
      if (
        !(row.expiresAt instanceof Date) ||
        !Number.isFinite(row.expiresAt.getTime()) ||
        (row.owner !== undefined && typeof row.owner !== 'string') ||
        (row.cacheToken !== undefined && typeof row.cacheToken !== 'string')
      )
        throw new PersistenceError(
          'secret-lease',
          'Invalid secret coordination metadata. Inspect the lease without rewriting it.'
        );
      return { owner: row.owner, expiresAt: row.expiresAt.getTime(), cacheToken: row.cacheToken };
    },
    async acquire(name, owner, now, expiresAt) {
      await collection().updateOne(
        { _id: name, expiresAt: { $lte: new Date(now) } },
        {
          $set: { owner, expiresAt: new Date(expiresAt) },
        },
        { upsert: true }
      );
    },
    async renew(name, owner, now, expiresAt) {
      return (
        (
          await collection().updateOne(
            { _id: name, owner, expiresAt: { $gt: new Date(now) } },
            {
              $max: { expiresAt: new Date(expiresAt) },
            }
          )
        ).matchedCount === 1
      );
    },
    async publishToken(name, owner, now, cacheToken) {
      return (
        (
          await collection().updateOne(
            { _id: name, owner, expiresAt: { $gt: new Date(now) } },
            {
              $set: { cacheToken },
            }
          )
        ).matchedCount === 1
      );
    },
    async release(name, owner) {
      return (
        (
          await collection().updateOne(
            { _id: name, owner },
            {
              $set: { expiresAt: new Date(0) },
              $unset: { owner: '' },
            }
          )
        ).matchedCount === 1
      );
    },
  };
}
