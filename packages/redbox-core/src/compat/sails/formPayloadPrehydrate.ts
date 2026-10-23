import { Services as Domain } from '../../forms/FormPayloadPrehydrate';
const methods = ['build', 'extractTargets', 'resolveVocabTrees'] as const;
export class LegacyFormPayloadPrehydrate extends Domain.FormPayloadPrehydrateService {
  public constructor() {
    super({
      get config() {
        return sails.config;
      },
      get log() {
        return sails.log;
      },
      get vocabulary() {
        return VocabularyService;
      },
    });
  }
  public exports(): Record<string, unknown> {
    return Object.fromEntries(methods.map(name => [name, this[name].bind(this)]));
  }
}
const key = Symbol.for('@researchdatabox/redbox-core/comparison/FormPayloadPrehydrate');
export function sailsFormPayloadPrehydrateExports(): Record<string, unknown> {
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as LegacyFormPayloadPrehydrate | undefined;
        if (!instance) {
          instance = new LegacyFormPayloadPrehydrate();
          Object.defineProperty(sails, key, { value: instance });
        }
        return Reflect.apply(instance[name], instance, args);
      },
    ])
  );
}
