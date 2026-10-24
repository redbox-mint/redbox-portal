import { readFileSync } from 'node:fs';
import { registerPersistenceResource } from '../../persistence/runtime';
import { Services as Domain } from '../../dashboards/DashboardConfig';
import {
  getReferenceRepositories,
  getConfigurationRepositories,
  getBrandingRepository,
  getMigrationLedgerRepository,
} from '../../persistence/runtime';

const methods = [
  'bootstrap',
  'isReady',
  'initialiseAfterBootstrap',
  'initialiseMissingTargets',
  'getTargetCatalogue',
  'getTargetSettings',
  'validateTargetSettings',
  'saveTargetSettings',
  'previewCopy',
  'applyCopy',
  'getRuntimeSettings',
  'getRuntimeTargetSettings',
  'getDashboardContext',
  'captureLegacyInput',
  'preflightLegacyMigration',
  'migrateLegacyConfiguration',
  'isReservedAppConfigKey',
  'getFieldCatalogue',
] as const;

export class LegacyDashboardConfig extends Domain.DashboardConfig {
  public constructor() {
    super({
      get references() {
        return getReferenceRepositories();
      },
      get configuration() {
        return getConfigurationRepositories();
      },
      get brands() {
        return getBrandingRepository();
      },
      get migrations() {
        return getMigrationLedgerRepository();
      },
      get config() {
        const file = process.env.REDBOX_DASHBOARD_MIGRATION_RESOLUTIONS;
        return {
          ...sails.config,
          ...(file ? { dashboardMigrationResolutions: JSON.parse(readFileSync(file, 'utf8')) } : {}),
        };
      },
      get log() {
        return sails.log;
      },
      get recordTypes() {
        return RecordTypesService;
      },
      get workflowSteps() {
        return WorkflowStepsService;
      },
      schema: {
        describeStage: request => {
          const schema = sails.services.recordschemaservice as {
            describeStage(
              request: import('../../services/RecordSchemaService').DescribeRecordStageSchemaRequest
            ): Promise<import('../../services/RecordSchemaService').DescribeRecordStageSchemaResult>;
          };
          return schema.describeStage(request);
        },
      },
      availableBrands: () => BrandingService.getAvailable(),
      getBrand: name => BrandingService.getBrand(name),
    });
  }
  protected _exportedMethods: string[] = [...methods];
  public exports(): Record<string, unknown> {
    return Object.fromEntries(
      this._exportedMethods.map(name => {
        const method: unknown = Reflect.get(this, name);
        if (typeof method !== 'function') throw new Error('Missing DashboardConfig comparison operation: ' + name);
        return [name, method.bind(this)];
      })
    );
  }
}

const key = Symbol.for('@researchdatabox/redbox-core/comparison/DashboardConfig');
export function sailsDashboardConfigExports(): Record<string, unknown> {
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as LegacyDashboardConfig | undefined;
        if (!instance) {
          instance = new LegacyDashboardConfig();
          Object.defineProperty(sails, key, { value: instance });
          registerPersistenceResource(sails, 'DashboardConfig', { close: () => instance!.close() });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
