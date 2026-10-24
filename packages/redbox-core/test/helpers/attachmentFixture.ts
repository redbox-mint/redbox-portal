import { Services } from '../../src/persistence/storage/PrismaAttachmentRepository';
import { repositoryFixtures } from './repositoryFixtures';
import { PersistenceError } from '../../src/persistence/errors';
import { fixtureResult } from './serviceRepositories';
/** Inject plain physical operations into the real Prisma journal protocol.
 * Physical codecs and client behavior have separate live-database coverage. */
export function attachmentFixture(audit: import('../../src/persistence/storage/PrismaAttachments').AttachmentAuditInput = { log: console }) {
  const repository: any = new Services.PrismaAttachmentRepository({
    orm: {
      attachmentmetadata: {
        where: (where: any) => ({
          updateAndCount: (values: any) => {
            const q = repositoryFixtures.AttachmentMetadata.update(where);
            return fixtureResult(q.set(values));
          },
        }),
      },
    },
  } as any, audit);
  const metadata = () => repositoryFixtures.AttachmentMetadata;
  const translate = (v: any): any =>
    v?.toHexString
      ? v.toHexString()
      : Array.isArray(v)
        ? v.map(translate)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.entries(v).map(([k, val]) => [
                { _id: 'id', $in: 'in', $ne: '!=', $gt: '>', $gte: '>=', $lt: '<', $lte: '<=', $or: 'or', $and: 'and' }[
                  k
                ] ?? k,
                translate(val),
              ])
            )
          : v;
  repository.readMetadata = (where: object) => fixtureResult(metadata().findOne(translate(where)));
  repository.metadataRows = (where: object, order: Record<string, number> = {}, limit?: number) => {
    let result = metadata().find(translate(where));
    if (Object.keys(order).length && result?.sort)
      result = result.sort(
        Object.entries(order)
          .map(([key, dir]) => key + (dir === -1 ? ' DESC' : ' ASC'))
          .join(', ')
      );
    if (limit !== undefined && result?.limit) result = result.limit(limit);
    return fixtureResult(result);
  };
  repository.insertMetadata = (values: object) => {
    const q = metadata().create(values);
    return fixtureResult(q?.fetch ? q.fetch() : q);
  };
  repository.patchMetadata = (where: object, values: object) => {
    const q = metadata().updateOne(translate(where));
    return fixtureResult(q?.set ? q.set(values) : q);
  };
  repository.appendAccessAudit = (values: object) => {
    const q = repositoryFixtures.AttachmentAccessAudit.create(values);
    return fixtureResult(q?.fetch ? q.fetch() : q);
  };
  const recordAccess = repository.recordAccess.bind(repository);
  repository.recordAccess = (event: any) =>
    recordAccess(event).catch((error: unknown) => {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError('storage-unknown', 'Attachment operation failed with an unknown outcome.');
    });
  return repository as Services.PrismaAttachmentRepository;
}
