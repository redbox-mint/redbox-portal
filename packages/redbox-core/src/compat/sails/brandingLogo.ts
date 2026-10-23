import { Services as Owned, brandingLogoExportedMethods } from '../../branding/BrandingLogo';
import { getBrandingRepository, mongoDatabase, registerPersistenceResource } from '../../persistence/runtime';
export namespace Services {
  export class BrandingLogo extends Owned.BrandingLogo {
    constructor() {
      let registered = false;
      super({
        get repository() {
          return getBrandingRepository();
        },
        disk: () => StorageManagerService.primaryDisk(),
        legacyDatabase: async () => {
          if (!sails.config?.datastores?.mongodb) return null;
          if (!registered) {
            registerPersistenceResource(sails, 'legacy-logo-gridfs', {
              drain: () => this.drain(),
              close: () => this.close(),
            });
            registered = true;
          }
          return mongoDatabase(sails, 'mongodb');
        },
        sanitize: svg => DomSanitizerService.sanitize(svg),
        get config() {
          return sails.config.branding ?? {};
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
          if (typeof method !== 'function') throw new Error('Missing logo method');
          return [name, method.bind(this)];
        })
      );
    }
  }
}
const key = Symbol.for('@researchdatabox/redbox-core/comparison/brandingLogo');
export function sailsBrandingLogoExports(): Record<string, unknown> {
  return Object.fromEntries(
    brandingLogoExportedMethods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as Services.BrandingLogo | undefined;
        if (!instance) {
          instance = new Services.BrandingLogo();
          Object.defineProperty(sails, key, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing logo method');
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
