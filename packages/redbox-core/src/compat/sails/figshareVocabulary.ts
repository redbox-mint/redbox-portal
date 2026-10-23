import { Services as Owned, figshareVocabularyExportedMethods } from '../../vocabulary/FigshareVocabulary';
import { getVocabularyRepositories } from '../../persistence/runtime';
import { resolveFigshareVocabularyConfig } from '../../services/figshare-v2/config';
export * from '../../vocabulary/FigshareVocabulary';
export namespace Services {
  export type ActorContext = Owned.ActorContext;
  export class FigshareVocabularyService extends Owned.FigshareVocabularyService {
    constructor() {
      super({
        get repository() {
          return getVocabularyRepositories();
        },
        get log() {
          return sails.log;
        },
        brandName: id =>
          typeof BrandingService === 'undefined' ? id : String(BrandingService.getBrandById(id)?.name ?? id),
        defaultBrandId: () => String(Reflect.get(sails.services?.brandingservice?.getDefault?.() ?? {}, 'id') ?? ''),
        configuration: resolveFigshareVocabularyConfig,
        appConfiguration: name => {
          const value = sails.services?.appconfigservice?.getAppConfigurationForBrand(name);
          return value && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : undefined;
        },
        get bootstrapDataPath() {
          return sails.config.bootstrap.bootstrapDataPath;
        },
        get bootstrapFigshareImports() {
          return sails.config.vocab.bootstrapFigshareImports;
        },
      });
    }
    exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing Figshare vocabulary method: ' + name);
          return [name, method.bind(this)];
        })
      );
    }
  }
}
const key = Symbol.for('@researchdatabox/redbox-core/comparison/figshare-vocabulary');
export function sailsFigshareVocabularyExports(): Record<string, unknown> {
  return Object.fromEntries(
    figshareVocabularyExportedMethods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as Services.FigshareVocabularyService | undefined;
        if (!instance) {
          instance = new Services.FigshareVocabularyService();
          Object.defineProperty(sails, key, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing Figshare method: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
