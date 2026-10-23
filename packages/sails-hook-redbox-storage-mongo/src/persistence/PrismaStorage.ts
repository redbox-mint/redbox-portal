import { PrismaStorage as OwnedPrismaStorage } from './StorageProtocol';
import { legacyStorageCollaborators } from '../compat/collaborators';
import { guardPrismaStorage } from './guardPrismaStorage';
export { guardPrismaStorage } from './guardPrismaStorage';

/** Temporary Sails constructor/events; neutral extensions import StorageProtocol. */
export class PrismaStorage extends OwnedPrismaStorage {
  constructor(app: Sails.Application = sails) {
    super(app, legacyStorageCollaborators(app));
    this.app = app;
  }
  private readonly app: Sails.Application;
  public override async init(): Promise<void> {
    await super.init();
    this.app.emit('hook:redbox:storage:ready');
    this.app.emit('hook:redbox:datastream:ready');
  }
}
export async function createPrismaStorage(app: Sails.Application): Promise<PrismaStorage> {
  const repository = new PrismaStorage(app);
  await repository.init();
  return guardPrismaStorage(app, repository);
}
