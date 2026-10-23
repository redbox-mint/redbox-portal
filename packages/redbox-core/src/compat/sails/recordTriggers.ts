import { firstValueFrom } from 'rxjs';
import { RecordTriggers, rdmpExportedMethods } from '../../records/RecordTriggers';
import type { CounterRepository } from '../../persistence/storage/StorageRepositories';
import { getStorageRepositories } from '../../persistence/storage/runtime';
import { getIdentityRepositories } from '../../persistence/identity/runtime';
import type { QueueService } from '../../QueueService';
import { convertToType } from '../../utilities/convertToType';

/** The comparison boundary alone resolves legacy names and process globals. */
export namespace Services {
  export class RDMPS extends RecordTriggers {
    protected queueService?: QueueService;
    public constructor(counterRepository?: CounterRepository) {
      super({
        get config() {
          return sails.config.record;
        },
        get log() {
          return sails.log;
        },
        get identities() {
          return getIdentityRepositories();
        },
        get counters() {
          return counterRepository ?? getStorageRepositories().counters;
        },
        get queue() {
          return instance.queueService ?? (sails.services[sails.config.queue.serviceName] as unknown as QueueService);
        },
        effectiveUser: user => firstValueFrom(UsersService.getEffectiveUser(user)),
        translate: key => TranslationService.t(key),
        interpolate: (message, values) => TranslationService.tInter(message, values),
        resolveHook: name => eval(name),
        workspaces: {
          addWorkspaceToRecord: (...args) => WorkspaceService.addWorkspaceToRecord(...args),
          removeWorkspaceFromRecord: (...args) => WorkspaceService.removeWorkspaceFromRecord(...args),
        },
      });
      const instance = this;
    }
    public init(): void {
      if (typeof sails === 'undefined' || typeof sails.on !== 'function') return;
      sails.on('ready', () => {
        this.queueService = sails.services[sails.config.queue.serviceName] as unknown as QueueService;
      });
    }
    public convertToType = convertToType;
    public exports(): Record<string, unknown> {
      return Object.fromEntries(
        [...rdmpExportedMethods, 'convertToType'].map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing comparison trigger operation: ' + name);
          return [name, method.bind(this)];
        })
      );
    }
  }
}
