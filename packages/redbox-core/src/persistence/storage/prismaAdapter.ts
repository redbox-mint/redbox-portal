import type { StoragePrismaClient } from '../prisma/client';

/** Lazy first-party adapter seam; importing core never loads the Prisma engine. @internal */
export function prismaModelFilter(...args: Parameters<typeof import('../prisma/modelFilter').prismaModelFilter>) {
  return (require('../prisma/modelFilter') as typeof import('../prisma/modelFilter')).prismaModelFilter(...args);
}
/** Catalog inspection is acquired only after persistence initialization. @internal */
export function persistenceCollections(...args: Parameters<typeof import('../prisma/catalog').persistenceCollections>) {
  return (require('../prisma/catalog') as typeof import('../prisma/catalog')).persistenceCollections(...args);
}
/** Scoped index inspection for concrete hook adapters. @internal */
export function persistenceCollectionIndexes(
  ...args: Parameters<typeof import('../prisma/catalog').persistenceCollectionIndexes>
) {
  return (require('../prisma/catalog') as typeof import('../prisma/catalog')).persistenceCollectionIndexes(...args);
}
/** Wrapper-only maintenance factory; does not acquire clients on import. @internal */
export function prismaRecordRevisionBatches(client: StoragePrismaClient) {
  return (
    require('./PrismaRecordRevisionMaintenance') as typeof import('./PrismaRecordRevisionMaintenance')
  ).prismaRecordRevisionBatches(client);
}

/** Model field operations for the first-party record protocol; no native pipeline support. @internal */
export function prismaRecordFieldOperations(
  ...args: Parameters<typeof import('../prisma/recordOperations').prismaRecordFieldOperations>
) {
  return (
    require('../prisma/recordOperations') as typeof import('../prisma/recordOperations')
  ).prismaRecordFieldOperations(...args);
}

/** Preserve native serialization for supplied record values. @internal */
export function prismaRecordValues(
  ...args: Parameters<typeof import('../prisma/recordOperations').prismaRecordValues>
) {
  return (require('../prisma/recordOperations') as typeof import('../prisma/recordOperations')).prismaRecordValues(
    ...args
  );
}

/** Presence-preserving lifecycle read/removal through public typed Prisma plans. @internal */
export function prismaRecordSnapshot(
  ...args: Parameters<typeof import('../prisma/recordOperations').prismaRecordSnapshot>
) {
  return (require('../prisma/recordOperations') as typeof import('../prisma/recordOperations')).prismaRecordSnapshot(
    ...args
  );
}
