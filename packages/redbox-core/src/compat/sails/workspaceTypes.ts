import { Services as Domain } from '../../workspaces/WorkspaceTypes';
import { getReferenceRepositories } from '../../persistence/runtime';

const methods = ['bootstrap', 'create', 'get', 'getOne'] as const;

export class LegacyWorkspaceTypes extends Domain.WorkspaceTypes {
  public constructor() {
    super({
      get references() {
        return getReferenceRepositories();
      },
      get config() {
        return sails.config;
      },
      get log() {
        return sails.log;
      },
      get bootstrapProviders() {
        return (sails.config.workspacetype_services ?? []).map(name => () => {
          const provider = sails.services[name] as { bootstrap(): import('rxjs').Observable<unknown> };
          return provider.bootstrap();
        });
      },
    });
  }
  protected _exportedMethods: string[] = [...methods];
  public exports(): Record<string, unknown> {
    return Object.fromEntries(
      this._exportedMethods.map(name => {
        const method: unknown = Reflect.get(this, name);
        if (typeof method !== 'function') throw new Error('Missing WorkspaceTypes comparison operation: ' + name);
        return [name, method.bind(this)];
      })
    );
  }
}

const key = Symbol.for('@researchdatabox/redbox-core/comparison/WorkspaceTypes');
export function sailsWorkspaceTypesExports(): Record<string, unknown> {
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as LegacyWorkspaceTypes | undefined;
        if (!instance) {
          instance = new LegacyWorkspaceTypes();
          Object.defineProperty(sails, key, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
