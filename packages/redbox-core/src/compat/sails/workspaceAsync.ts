import type { Observable } from 'rxjs';
import { Services as Owned } from '../../workspaces/WorkspaceAsync';
import { getProgressRepositories } from '../../persistence/progress/runtime';

export namespace Services {
  export class WorkspaceAsyncService extends Owned.WorkspaceAsyncService {
    constructor() {
      super({
        get repository() {
          return getProgressRepositories().workspaces;
        },
        get log() {
          return sails.log;
        },
        runWork: operation => operation(),
        resolveOperation: name => args => {
          const [service, method] = name.split('.');
          return sails.services[service][method](args) as Observable<unknown>;
        },
      });
    }
    private shutdownRegistered = false;
    override async init(): Promise<void> {
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
    exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing comparison workspace worker operation.');
          return [name, method.bind(this)];
        })
      );
    }
  }
}
