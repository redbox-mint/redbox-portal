import { MongoParamRef } from '@prisma/orm-mongo/value';
import { MONGO_OBJECTID_CODEC_ID } from '@prisma/orm-mongo/target/codec-ids';
import { MongoAndExpr } from '@prisma/orm-mongo/query-ast';
import { MongoAggFieldRef as Ref, MongoAggLiteral as Lit, MongoAggOperator as Op } from '@prisma/orm-mongo/query-ast';
import type { UpdateResult } from '@prisma/orm-mongo/query-ast';
import type { StoragePrismaClient } from '../prisma/client';
import { prismaModelFilter } from '../prisma/modelFilter';
import { INITIAL_RECORD_REVISION } from '../../RecordStorageConcurrency';

/** Bounded, wrapper-only maintenance; record persistence uses the same Prisma owner. @internal */
export function prismaRecordRevisionBatches(client: StoragePrismaClient) {
  return async (kind: 'active' | 'tombstone', batchSize: number): Promise<{ updated: number; batches: number }> => {
    const tombstone = kind === 'tombstone';
    const model = tombstone ? client.orm.deletedrecord : client.orm.record;
    const pending = tombstone ? { $or: [{ revision: null }, { lifecycleState: null }] } : { revision: null };
    let updated = 0,
      batches = 0;
    for (;;) {
      const rows = await model.where(prismaModelFilter(pending)).select('_id').limit(batchSize).all().toArray();
      if (!rows.length) break;
      let changed = 0;
      for (const row of rows) {
        // One conditional document write coalesces sibling fields at apply time.
        // The typed builder supplies the pipeline semantics the ordinary patch API lacks.
        const query = client.query.from(tombstone ? 'deletedrecord' : 'record');
        const plan = query
          .match(f =>
            MongoAndExpr.of([
              f._id.eq(new MongoParamRef(row._id, { codecId: MONGO_OBJECTID_CODEC_ID })),
              prismaModelFilter(pending),
            ])
          )
          .updateOne(f => [
            f.stage.set({
              revision: Op.of('$ifNull', [Ref.of('revision'), Lit.of(INITIAL_RECORD_REVISION)]),
              ...(tombstone ? { lifecycleState: Op.of('$ifNull', [Ref.of('lifecycleState'), Lit.of('deleted')]) } : {}),
            }),
          ]);
        const result = (await (await client.runtime()).query(plan).toArray())[0] as UpdateResult;
        changed += result.modifiedCount;
      }
      updated += changed;
      batches++;
      if (
        !changed &&
        (await model
          .where(prismaModelFilter({ $and: [{ _id: { $in: rows.map(row => row._id) } }, pending] }))
          .select('_id')
          .first())
      )
        throw new Error('record-revision-backfill-no-progress');
    }
    return { updated, batches };
  };
}
