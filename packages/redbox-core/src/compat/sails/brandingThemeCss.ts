import { Services as Owned, brandingThemeCssExportedMethods } from '../../branding/BrandingThemeCss';
export * from '../../branding/BrandingThemeCss';
export namespace Services {
  export class BrandingThemeCss extends Owned.BrandingThemeCss {
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

const key = Symbol.for('@researchdatabox/redbox-core/comparison/BrandingThemeCss');
export function sailsBrandingThemeCssExports(): Record<string, unknown> {
  const methods = brandingThemeCssExportedMethods;
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as Services.BrandingThemeCss | undefined;
        if (!instance) {
          instance = new Services.BrandingThemeCss();
          Object.defineProperty(sails, key, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing branding operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
