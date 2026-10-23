const methods = [
  'bootstrap',
  'getAllConfigurationForBrand',
  'loadAppConfigurationModel',
  'getAppConfigurationForBrand',
  'getMaskedAppConfigurationForBrand',
  'createOrUpdateConfig',
  'getAppConfigForm',
  'getAppConfigByBrandAndKey',
  'hasConfigOverride',
  'resetConfigOverride',
  'createConfig',
  'registerConfigModel',
] as const;
import { registerPersistenceResource } from '../../persistence/runtime';
import { AppConfigs } from '../../configuration/AppConfigs';
import { ConfigModels } from '../../configmodels/ConfigModels';
import { getConfigurationRepositories } from '../../persistence/runtime';
/** All global discovery stays at the comparison boundary. */
export class LegacyAppConfigs extends AppConfigs {
  public constructor() {
    super({
      get repository() {
        return getConfigurationRepositories();
      },
      models: ConfigModels,
      get config() {
        return sails.config;
      },
      get log() {
        return sails.log;
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
        if (typeof method !== 'function') throw new Error('Missing AppConfig comparison operation: ' + name);
        return [name, method.bind(this)];
      })
    );
  }
}

const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/appConfigs');
/** The comparison application owns its converted instance; shim generation is offline. */
export function sailsAppConfigsExports(): Record<string, unknown> {
  const resolve = (): LegacyAppConfigs => {
    const app = sails;
    let instance = Reflect.get(app, instanceKey) as LegacyAppConfigs | undefined;
    if (!instance) {
      instance = new LegacyAppConfigs();
      Object.defineProperty(app, instanceKey, { value: instance });
      registerPersistenceResource(app, 'appConfigs', { close: () => instance!.close() });
    }
    return instance;
  };
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        const instance = resolve();
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
