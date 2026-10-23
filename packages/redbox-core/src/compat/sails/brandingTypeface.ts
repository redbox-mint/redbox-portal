import { Services as Owned, brandingTypefaceExportedMethods } from '../../branding/BrandingTypeface';
import { getBrandingRepository } from '../../persistence/runtime';
import { getBrandingPositiveInt } from '../../config/branding.config';
export * from '../../branding/BrandingTypeface';
export namespace Services {
  export class BrandingTypeface extends Owned.BrandingTypeface {
    constructor() {
      super({
        get repository() {
          return getBrandingRepository();
        },
        disk: () => StorageManagerService.primaryDisk(),
        get log() {
          return sails.log;
        },
        get rootContext() {
          return sails.config.http.rootContext;
        },
        positiveInt: getBrandingPositiveInt,
      });
    }
    exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing branding operation: ' + name);
          return [name, method.bind(this)];
        })
      );
    }
  }
}

const key = Symbol.for('@researchdatabox/redbox-core/comparison/BrandingTypeface');
export function sailsBrandingTypefaceExports(): Record<string, unknown> {
  const methods = brandingTypefaceExportedMethods;
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as Services.BrandingTypeface | undefined;
        if (!instance) {
          instance = new Services.BrandingTypeface();
          Object.defineProperty(sails, key, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing branding operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
