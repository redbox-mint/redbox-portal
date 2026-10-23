import { Services as Domain } from '../../queries/NamedQueries';
import { getReferenceRepositories } from '../../persistence/reference/runtime';
import { executeNamedQuery, namedQueryTarget } from '../../persistence/reference/NamedQueryExecution';
import type { RecordsService } from '../../RecordsService';
export class LegacyNamedQueryService extends Domain.NamedQueryService {
  public constructor() {
    super({
      get queries() {
        return getReferenceRepositories().namedQueries;
      },
      get config() {
        return sails.config;
      },
      get log() {
        return sails.log;
      },
      get records() {
        return sails.services.recordsservice as unknown as Pick<RecordsService, 'getRelatedRecords'> | undefined;
      },
      target: name => namedQueryTarget(sails, name),
      execute: (request, count) => executeNamedQuery(sails, request, count),
    });
  }
  protected _exportedMethods: string[] = [
    'bootstrapData',
    'getNamedQueryConfig',
    'getSupportedCollections',
    'performNamedQuery',
    'performNamedQueryFromConfig',
    'performNamedQueryFromConfigResults',
    'create',
    'list',
    'update',
    'delete',
  ];
  public exports(): Record<string, unknown> {
    return Object.fromEntries(
      this._exportedMethods.map(name => {
        const method: unknown = Reflect.get(this, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return [name, method.bind(this)];
      })
    );
  }
}

const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/namedQueries');
export function sailsNamedQueryServiceExports(): Record<string, unknown> {
  // Loader generation may read the surface before the global application exists.
  const methods = Object.keys(new LegacyNamedQueryService().exports());
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, instanceKey) as LegacyNamedQueryService | undefined;
        if (!instance) {
          instance = new LegacyNamedQueryService();
          Object.defineProperty(sails, instanceKey, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
