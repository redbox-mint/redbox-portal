import _ from 'lodash';
import { Services as Domain } from '../../vocabulary/RvaImport';
import { getVocabularyRepositories } from '../../persistence/vocabulary/runtime';
export class LegacyRvaImport extends Domain.RvaImport {
  public constructor() {
    super({
      get repository() {
        return getVocabularyRepositories();
      },
      get vocabulary() {
        return VocabularyService;
      },
      get log() {
        return sails.log;
      },
      baseUrl: () => String(_.get(sails.config, 'vocab.rva.baseUrl', 'https://vocabs.ardc.edu.au/registry')),
      defaultBrand: () => sails.config.auth?.defaultBrand ?? 'default',
    });
  }
  public exports(): Record<string, unknown> {
    return {
      searchRva: this.searchRva.bind(this),
      importRvaVocabulary: this.importRvaVocabulary.bind(this),
      syncRvaVocabulary: this.syncRvaVocabulary.bind(this),
    };
  }
}
const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/rvaImport');
export function sailsRvaImportExports(): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(new LegacyRvaImport().exports()).map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, instanceKey) as LegacyRvaImport | undefined;
        if (!instance) {
          instance = new LegacyRvaImport();
          Object.defineProperty(sails, instanceKey, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
