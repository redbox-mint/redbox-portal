import { Services as Owned, formVocabularyExportedMethods } from '../../vocabulary/FormVocabulary';
import type { SearchService } from '../../SearchService';
export namespace Services {
  export class FormVocabulary extends Owned.FormVocabulary {
    constructor() {
      super({
        get config() {
          return sails.config.vocab;
        },
        get log() {
          return sails.log;
        },
        get queries() {
          return NamedQueryService;
        },
        get search() {
          return sails.services[sails.config.search.serviceName] as unknown as SearchService;
        },
        resolveLookup(service, method) {
          const registry = sails.services as Record<string, Record<string, unknown>>;
          const target =
            registry[service] ??
            Object.entries(registry).find(([name]) => name.toLowerCase() === service.toLowerCase())?.[1];
          const operation = target?.[method];
          return typeof operation === 'function' ? request => Reflect.apply(operation, target, [request]) : undefined;
        },
      });
    }
    exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing form vocabulary operation');
          return [name, method.bind(this)];
        })
      );
    }
  }
}

const key = Symbol.for('@researchdatabox/redbox-core/comparison/formVocabulary');
export function sailsFormVocabularyExports(): Record<string, unknown> {
  return Object.fromEntries(
    formVocabularyExportedMethods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as Services.FormVocabulary | undefined;
        if (!instance) {
          instance = new Services.FormVocabulary();
          Object.defineProperty(sails, key, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
