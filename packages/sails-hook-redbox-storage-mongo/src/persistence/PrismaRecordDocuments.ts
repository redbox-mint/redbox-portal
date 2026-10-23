import {
  prismaModelFilter,
  prismaRecordFieldOperations,
  prismaRecordValues,
  prismaRecordSnapshot,
} from '@researchdatabox/redbox-core/extensions/storage';
import type { StoragePrismaClient } from '@researchdatabox/redbox-core/extensions/storage';
import type { Document } from 'mongodb';
import type { RecordDocuments } from './RecordDocuments';

/** Record CRUD uses model APIs, including atomic returning updates.
 * The atomic removed snapshot uses a typed plan to preserve field presence.
 * The private operator-shaped port retains the existing lifecycle protocol;
 * no raw commands, driver calls or native update pipelines are executed here.
 */
export function prismaRecordDocuments(
  client: StoragePrismaClient,
  name: 'record' | 'deletedrecord' | 'recordidentity'
): RecordDocuments {
  const model = client.orm[name];
  const list: RecordDocuments['list'] = async <T = Document>(
    where: Document,
    options: Parameters<RecordDocuments['list']>[1] = {}
  ): Promise<T[]> => {
    const { sort: order, limit } = options;
    if (order && Object.keys(order).some(field => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field))) {
      // RC19's model orderBy accepts root fields only. Its model-aware
      // typed builder supports the same Json paths and literal quoted keys
      // (historically missing-field sorts) without raw.
      const sorted = client.query
        .from(name)
        .match(prismaModelFilter(where, ['_id']))
        .sort(order as Record<string, 1 | -1>);
      const skipped = options.skip ? sorted.skip(options.skip) : sorted;
      const bounded = limit ? skipped.limit(limit) : skipped;
      return (await (await client.runtime()).query(bounded.build()).toArray()) as T[];
    }
    let query = model.where(prismaModelFilter(where));
    if (order) query = query.orderBy(order as Record<string, 1 | -1>);
    if (options.skip) query = query.offset(options.skip);
    if (limit) query = query.limit(limit);
    // Only the declared model fields can be returned. T is private protocol
    // projection typing, never an alternative database representation.
    return (await query.all().toArray()) as T[];
  };
  return {
    list,
    findOne: where => model.where(prismaModelFilter(where)).first(),
    insertOne: values => model.create(prismaRecordValues(values)),
    findOneAndUpdate: (where, update) =>
      model.where(prismaModelFilter(where)).update(() => prismaRecordFieldOperations(update)),
    findOneAndDelete: where =>
      name === 'record' ? prismaRecordSnapshot(client, where, true) : model.where(prismaModelFilter(where)).delete(),
    async updateOne(where, update) {
      const row = await model.where(prismaModelFilter(where)).update(() => prismaRecordFieldOperations(update));
      return { matchedCount: row ? 1 : 0 };
    },
    async updateMany(where, update) {
      return {
        modifiedCount: await model
          .where(prismaModelFilter(where))
          .updateAndCount(() => prismaRecordFieldOperations(update)),
      };
    },
    deleteOne: where => model.where(prismaModelFilter(where)).delete(),
    async count(where) {
      const plan = client.query
        .from(name)
        .match(prismaModelFilter(where, ['_id']))
        .count('total')
        .build();
      return (await (await client.runtime()).query(plan).toArray())[0]?.total ?? 0;
    },
  };
}
