import { harvestExportedMethods } from '../../records/HarvestRuns';
import { Services as Owned } from '../../records/HarvestRuns';
import { getHarvestRepositories } from '../../persistence/harvest/runtime';
import type { StorageService } from '../../StorageService';
export namespace Services {
  export class HarvestRunService extends Owned.HarvestRunService {
    public constructor() {
      super({
        get records() {
          return RecordsService;
        },
        get storage() {
          return sails.services[
            sails.config.storage?.serviceName ?? 'RedboxJavaStorageService'
          ] as unknown as StorageService;
        },
        get workflows() {
          return WorkflowStepsService;
        },
        get repository() {
          return getHarvestRepositories();
        },
        get config() {
          return sails.config;
        },
        get log() {
          return sails.log;
        },
      });
    }
    private shutdownRegistered = false;
    public async init(): Promise<void> {
      if (this.shutdownRegistered) return;
      this.shutdownRegistered = true;
      const previous = sails.config.beforeShutdown;
      sails.config.beforeShutdown = callback => {
        void this.drain().then(() => {
          try {
            if (previous) previous(callback);
            else callback();
          } catch (error) {
            callback(error);
          }
        }, callback);
      };
    }

    public exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing harvest operation: ' + name);
          return [name, method.bind(this)];
        })
      );
    }
  }
}

const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/harvest');
export function sailsHarvestRunsExports(): Record<string, unknown> {
  const methods = harvestExportedMethods;
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, instanceKey) as Services.HarvestRunService | undefined;
        if (!instance) {
          instance = new Services.HarvestRunService();
          Object.defineProperty(sails, instanceKey, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
