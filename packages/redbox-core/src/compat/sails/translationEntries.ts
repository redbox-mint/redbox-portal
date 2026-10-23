import path from 'node:path';
import { I18nEntries } from '../../translations/I18nEntries';
import { getConfigurationRepositories } from '../../persistence/runtime';
const methods = Object.getOwnPropertyNames(I18nEntries.prototype).filter(
  name => name !== 'constructor' && name !== 'logger'
);
export class LegacyTranslationEntries extends I18nEntries {
  public constructor() {
    super({
      get repository() {
        return getConfigurationRepositories();
      },
      get log() {
        return sails.log;
      },
      get localesDirectory() {
        return path.join(sails.config.appPath, 'language-defaults');
      },
      get namespaces() {
        return sails.config.i18n?.next?.init?.ns;
      },
      get supportedLanguages() {
        return sails.config.i18n?.next?.init?.supportedLngs;
      },
      get allowedClasses() {
        return sails.config.i18n?.editor?.allowedClasses;
      },
      getBrand: name => BrandingService.getBrand(name),
      getBrandById: id => BrandingService.getBrandById(id),
      reloadResources: id =>
        typeof TranslationService === 'undefined' ? undefined : TranslationService.reloadResources(id),
    });
  }
  public exports(): Record<string, unknown> {
    return Object.fromEntries(
      Object.getOwnPropertyNames(I18nEntries.prototype)
        .filter(name => name !== 'constructor' && typeof Reflect.get(this, name) === 'function')
        .map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing translation comparison operation: ' + name);
          return [name, method.bind(this)];
        })
    );
  }
}

const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/translationEntries');
/** The comparison application owns its converted instance; shim generation is offline. */
export function sailsTranslationEntriesExports(): Record<string, unknown> {
  const resolve = (): LegacyTranslationEntries => {
    const app = sails;
    let instance = Reflect.get(app, instanceKey) as LegacyTranslationEntries | undefined;
    if (!instance) {
      instance = new LegacyTranslationEntries();
      Object.defineProperty(app, instanceKey, { value: instance });
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
