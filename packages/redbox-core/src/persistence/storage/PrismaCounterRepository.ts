import type { CorePrismaClient } from '../prisma/client';
import { MongoParamRef } from '@prisma/orm-mongo/value';
import type { CounterRepository } from './StorageRepositories';
import { PersistenceError } from '../errors';

export function prismaCounterRepository(client: CorePrismaClient): CounterRepository {
  return {
    async incrementGlobal(name, branding) {
      if (!name) throw new PersistenceError('storage-validation', 'Counter name is required.');
      const now = new Date().toISOString();
      const counter = client.orm.counter.where({ name, branding });
      // RC19 omits .inc() from nullable numeric accessors; its public model
      // FieldOperation is the same atomic increment without a type cast.
      let row;
      try {
        row = await counter.upsert({
          create: { name, branding, createdAt: now },
          update: u => [{ operator: '$inc', field: 'value', value: new MongoParamRef(1) }, u.updatedAt.set(now)],
        });
      } catch (error) {
        // Two first users can both attempt insertion. A duplicate-key fact
        // certifies this upsert did not increment; update only that same owner.
        // A name already owned by another brand retains its existing rejection.
        if (!error || typeof error !== 'object' || Reflect.get(error, 'code') !== 11000) throw error;
        row = await counter.update(u => [
          { operator: '$inc', field: 'value', value: new MongoParamRef(1) },
          u.updatedAt.set(now),
        ]);
        if (!row) throw error;
      }
      if (typeof row.value !== 'number' || !Number.isFinite(row.value))
        throw new PersistenceError(
          'storage-unknown',
          'Counter allocation returned an invalid value. Reconcile before retrying.'
        );
      return row.value;
    },
  };
}
