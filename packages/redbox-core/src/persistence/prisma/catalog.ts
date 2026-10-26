import type { PersistenceOwner } from '../owner';
import type { IndexDescriptionInfo } from 'mongodb';
import { MongoInspectionExecutor } from '@prisma/orm-mongo/adapter/control';
import { ListCollectionsCommand, ListIndexesCommand } from '@prisma/orm-mongo/query-ast/control';
import { mongoDatabase } from '../runtime';

/** Catalog metadata is outside model CRUD; use Prisma's supported control API. */
export async function persistenceCollections(
  app: PersistenceOwner,
  datastore: 'mongodb' | 'redboxStorage' = 'mongodb'
) {
  return new MongoInspectionExecutor(await mongoDatabase(app, datastore)).listCollections(new ListCollectionsCommand());
}

/** First-party scoped index metadata inspection; DDL remains explicit. @internal */
export async function persistenceCollectionIndexes(
  app: PersistenceOwner,
  datastore: 'mongodb' | 'redboxStorage',
  collection: string
) {
  return (await new MongoInspectionExecutor(await mongoDatabase(app, datastore)).listIndexes(
    new ListIndexesCommand(collection)
  )) as IndexDescriptionInfo[];
}
