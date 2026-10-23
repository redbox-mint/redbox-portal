import { storageManagerExportedMethods } from '../../storage/StorageManager';
import { Services as Owned } from '../../storage/StorageManager';
export namespace Services {
  export class StorageManager extends Owned.StorageManager {
    public constructor() {
      super({
        get config() {
          return sails.config?.storage ?? {};
        },
        get log() {
          return sails.log;
        },
        get owner() {
          return sails;
        },
      });
      void this.processDynamicImports();
    }
    private _initRegistered = false;
    protected registerSailsHook(_method: 'after', event: string, callback: () => Promise<void>): void {
      if (typeof sails !== 'undefined' && typeof sails.after === 'function') sails.after(event, callback);
    }
    public init(): void {
      if (this._initRegistered) {
        return;
      }

      this._initRegistered = true;
      this.registerSailsHook('after', 'ready', async () => {
        try {
          await this.bootstrap();
        } catch (err) {
          this.logger.error(`${this.logHeader} Failed during bootstrap from init():`, err);
        }
      });
    }

    public exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing storage manager operation: ' + name);
          return [name, method.bind(this)];
        })
      );
    }
  }
}

const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/disks');
export function sailsStorageManagerExports(): Record<string, unknown> {
  const methods = storageManagerExportedMethods;
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, instanceKey) as Services.StorageManager | undefined;
        if (!instance) {
          instance = new Services.StorageManager();
          Object.defineProperty(sails, instanceKey, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
