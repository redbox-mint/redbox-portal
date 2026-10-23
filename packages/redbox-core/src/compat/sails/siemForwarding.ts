import { Services as Owned, siemForwardingExportedMethods } from '../../integrations/SiemForwarding';
import { getSiemRepository } from '../../persistence/siem/runtime';
export namespace Services {
  export class SiemForwardingService extends Owned.SiemForwardingService {
    constructor() {
      super({
        get repository() {
          return getSiemRepository();
        },
        configuration(id) {
          const brand = BrandingService.getBrandById(id) ?? BrandingService.getBrand(id);
          const configuration = brand ? AppConfigService.getAppConfigurationForBrand(brand.name) : {};
          return Reflect.get(configuration, 'siem') ?? {};
        },
        brandIds: () => BrandingService.getAvailable().map(name => String(BrandingService.getBrand(name).id)),
      });
    }
    private shutdownRegistered = false;
    async init(): Promise<void> {
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
          if (typeof method !== 'function') throw new Error('Missing SIEM operation');
          return [name, method.bind(this)];
        })
      );
    }
  }
}

const key = Symbol.for('@researchdatabox/redbox-core/comparison/siemForwarding');
export function sailsSiemForwardingExports(): Record<string, unknown> {
  return Object.fromEntries(
    siemForwardingExportedMethods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as Services.SiemForwardingService | undefined;
        if (!instance) {
          instance = new Services.SiemForwardingService();
          Object.defineProperty(sails, key, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
