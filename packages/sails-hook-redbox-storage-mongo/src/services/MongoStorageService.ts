import { PersistenceError, registerPersistenceResource } from '@researchdatabox/redbox-core';
import { Services as services } from '@researchdatabox/redbox-core';
import type { StoragePersistence } from '../persistence/StoragePersistence';
import { storageOperations } from '../persistence/StoragePersistence';

export namespace Services {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- The constructor binds every StoragePersistence operation synchronously.
  export interface MongoStorageService extends StoragePersistence {}
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- See the operation binding in the constructor.
  export class MongoStorageService extends services.Core.Service implements StoragePersistence {
    protected _exportedMethods = [...storageOperations];
    constructor() {
      super();
      for (const name of storageOperations.filter(name => name !== 'init'))
        Object.defineProperty(this, name, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: (...args: unknown[]) => {
            const owner = this.owner(name);
            return Reflect.apply(owner[name], owner, args);
          },
        });
    }
    private staged?: StoragePersistence;
    private registered = false;
    private starting?: Promise<void>;
    public override async init(): Promise<void> {
      if (this.starting) return this.starting;
      this.starting = this.initialize();
      try {
        await this.starting;
      } finally {
        this.starting = undefined;
      }
    }
    private async initialize(): Promise<void> {
      if (!this.registered) {
        registerPersistenceResource(sails, 'storage-mongo-staged', {
          drain: async () => {
            try {
              await this.starting;
            } catch {
              /* preserve startup failure */
            }
          },
          close: async () => {
            this.staged = undefined;
            this.registered = false;
          },
        });
        this.registered = true;
      }
      if (!this.staged) {
        const { createPrismaStorage } = await import('../persistence/PrismaStorage.js');
        this.staged = await createPrismaStorage(sails);
      }
    }
    private owner(name: string): StoragePersistence {
      if (!this.staged) throw new PersistenceError('not-initialized', `Await storage readiness before using ${name}.`);
      return this.staged;
    }
  }
}
