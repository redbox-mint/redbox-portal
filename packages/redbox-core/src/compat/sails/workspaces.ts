import { Services as Owned } from '../../workspaces/Workspaces';
import { getIdentityRepositories } from '../../persistence/identity/runtime';

export namespace Services {
  export class WorkspaceService extends Owned.WorkspaceService {
    constructor() {
      super({
        get identities() {
          return getIdentityRepositories();
        },
        get records() {
          return RecordsService;
        },
        get log() {
          return sails.log;
        },
      });
    }
    exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing comparison workspace operation.');
          return [name, method.bind(this)];
        })
      );
    }
  }
}
