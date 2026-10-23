import { registerPersistenceResource } from '../../persistence/runtime';
import { Services as Domain } from '../../queries/Reports';
import { getReferenceRepositories } from '../../persistence/reference/runtime';
import type { SearchService } from '../../SearchService';
export class LegacyReports extends Domain.Reports {
  public constructor() {
    super({
      get reports() {
        return getReferenceRepositories().reports;
      },
      get namedQueries() {
        return NamedQueryService;
      },
      get config() {
        return sails.config;
      },
      get log() {
        return sails.log;
      },
      get search() {
        return sails.services[sails.config.search.serviceName] as unknown as SearchService;
      },
      portalUrl: parameters => BrandingService.getFullPath(parameters),
    });
  }
  protected _exportedMethods: string[] = [
    'bootstrapData',
    'create',
    'findAllReportsForBrand',
    'get',
    'getResults',
    'getCSVResult',
    'getReportDto',
    'listConfigs',
    'getConfig',
    'createConfig',
    'updateConfig',
    'deleteConfig',
    'previewConfig',
    'extractReportTemplates',
    //exported only for unit testing
    'getDataRows',
    'getCSVHeaderRow',
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

const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/reports');
export function sailsReportsExports(): Record<string, unknown> {
  // Loader generation may read the surface before the global application exists.
  const methods = Object.keys(new LegacyReports().exports());
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, instanceKey) as LegacyReports | undefined;
        if (!instance) {
          instance = new LegacyReports();
          Object.defineProperty(sails, instanceKey, { value: instance });
          registerPersistenceResource(sails, 'reports-domain', { close: async () => instance!.close() });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
