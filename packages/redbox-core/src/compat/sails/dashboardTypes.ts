import { registerPersistenceResource } from '../../persistence/runtime';
import { Services as Domain } from '../../dashboards/DashboardTypes';
import { getReferenceRepositories, getConfigurationRepositories } from '../../persistence/runtime';

const methods = [
  'bootstrap',
  'create',
  'createDashboardType',
  'get',
  'getAll',
  'getAllDashboardTypeDefinitions',
  'getDashboardTypeDefinition',
  'updateDashboardType',
  'deleteDashboardType',
  'getDashboardTableConfig',
  'getRecordTypeDashboardConfig',
  'extractDashboardTemplates',
  'getDashboardView',
  'getDashboardViewStep',
  'extractDashboardViewTemplates',
  'buildDashboardTemplateKeyPrefix',
] as const;

export class LegacyDashboardTypes extends Domain.DashboardTypes {
  public constructor() {
    super({
      get references() {
        return getReferenceRepositories();
      },
      get configuration() {
        return getConfigurationRepositories();
      },
      get config() {
        return sails.config;
      },
      get log() {
        return sails.log;
      },
      get recordTypes() {
        return RecordTypesService;
      },
      get dashboardConfig() {
        return DashboardConfigService;
      },
    });
  }
  protected _exportedMethods: string[] = [...methods];
  public exports(): Record<string, unknown> {
    return Object.fromEntries(
      this._exportedMethods.map(name => {
        const method: unknown = Reflect.get(this, name);
        if (typeof method !== 'function') throw new Error('Missing DashboardTypes comparison operation: ' + name);
        return [name, method.bind(this)];
      })
    );
  }
}

const key = Symbol.for('@researchdatabox/redbox-core/comparison/DashboardTypes');
export function sailsDashboardTypesExports(): Record<string, unknown> {
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as LegacyDashboardTypes | undefined;
        if (!instance) {
          instance = new LegacyDashboardTypes();
          Object.defineProperty(sails, key, { value: instance });
          registerPersistenceResource(sails, 'DashboardTypes', { close: () => instance!.close() });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
