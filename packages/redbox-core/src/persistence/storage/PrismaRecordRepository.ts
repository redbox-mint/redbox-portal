import type { StoragePrismaClient } from '../prisma/client';
import { prismaModelFilter } from '../prisma/modelFilter';
import type { RecordRepository } from './StorageRepositories';

export function prismaRecordRepository(client: StoragePrismaClient): RecordRepository {
  return {
    async find(where, options = {}) {
      if (options.sort && Object.keys(options.sort).some(field => field.includes('.'))) {
        const sorted = client.query
          .from('record')
          .match(prismaModelFilter(where, ['_id']))
          .sort(options.sort);
        const skipped = options.skip ? sorted.skip(options.skip) : sorted;
        const bounded = options.limit ? skipped.limit(options.limit) : skipped;
        return (await (await client.runtime()).query(bounded.build()).toArray()).map(({ _id, ...row }) => ({
          ...row,
          id: _id,
        }));
      }
      let query = client.orm.record.where(prismaModelFilter(where));
      if (options.sort) query = query.orderBy(options.sort);
      if (options.skip) query = query.offset(options.skip);
      if (options.limit) query = query.limit(options.limit);
      return (await query.all().toArray()).map(({ _id, ...row }) => ({ ...row, id: _id }));
    },
    async count(where) {
      const plan = client.query
        .from('record')
        .match(prismaModelFilter(where, ['_id']))
        .count('total')
        .build();
      return (await (await client.runtime()).query(plan).toArray())[0]?.total ?? 0;
    },
  };
}
