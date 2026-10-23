import { datastreamExportedMethods } from '../../storage/StandardDatastream';
import { Services as Owned } from '../../storage/StandardDatastream';
import type { AttachmentMetadataServiceContract } from '../../persistence/storage/StorageRepositories';
export namespace Services {
  export class StandardDatastream extends Owned.StandardDatastream {
    public constructor() {
      super({
        get disks() {
          return StorageManagerService;
        },
        get forms() {
          return FormsService;
        },
        get attachments() {
          return sails.services.attachmentmetadataservice as unknown as AttachmentMetadataServiceContract | undefined;
        },
        get log() {
          return sails.log;
        },
      });
    }
    public exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing datastream operation: ' + name);
          return [name, method.bind(this)];
        })
      );
    }
  }
}

const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/datastream');
export function sailsStandardDatastreamExports(): Record<string, unknown> {
  const methods = datastreamExportedMethods;
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, instanceKey) as Services.StandardDatastream | undefined;
        if (!instance) {
          instance = new Services.StandardDatastream();
          Object.defineProperty(sails, instanceKey, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
