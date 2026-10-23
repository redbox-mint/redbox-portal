import { type VocabularyDependencies, Services as Domain } from '../../vocabulary/Vocabulary';
import { getVocabularyRepositories } from '../../persistence/runtime';
const methods = [
  'list',
  'getById',
  'getByIdOrSlug',
  'getEntries',
  'getChildren',
  'getEntryByNotation',
  'getAncestorChain',
  'expandPaths',
  'bootstrapData',
  'create',
  'update',
  'reorderEntries',
  'delete',
  'getTree',
  'normalizeEntry',
  'validateParent',
  'upsertEntries',
  'assertMutableVocabulary',
] as const;
export class LegacyVocabulary extends Domain.VocabularyService {
  public constructor() {
    super({
      get repository() {
        return getVocabularyRepositories();
      },
      get config() {
        return sails.config;
      },
      get log() {
        return sails.log;
      },
      getBrand: name => (typeof BrandingService === 'undefined' ? null : BrandingService.getBrand(name)),
      defaultBrand: () => sails.services.brandingservice.getDefault?.() ?? sails.config.auth?.defaultBrand ?? 'default',
      get rva() {
        return sails.services.rvaimportservice as unknown as VocabularyDependencies['rva'];
      },
    });
  }
  public exports(): Record<string, unknown> {
    return Object.fromEntries(methods.map(name => [name, this[name].bind(this)]));
  }
}
const key = Symbol.for('@researchdatabox/redbox-core/comparison/Vocabulary');
export function sailsVocabularyExports(): Record<string, unknown> {
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as LegacyVocabulary | undefined;
        if (!instance) {
          instance = new LegacyVocabulary();
          Object.defineProperty(sails, key, { value: instance });
        }
        return Reflect.apply(instance[name], instance, args);
      },
    ])
  );
}
