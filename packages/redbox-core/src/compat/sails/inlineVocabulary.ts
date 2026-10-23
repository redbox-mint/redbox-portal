import { VocabInlineFormConfigVisitor as InlineVocabulary } from '../../forms/VocabInlineFormConfigVisitor';
import type { ILogger } from '@researchdatabox/sails-ng-common';
export class LegacyInlineVocabulary extends InlineVocabulary {
  constructor(log: ILogger) {
    super(log, {
      getEntries: (...args) => VocabularyService.getEntries(...args),
      defaultBrand: () => sails.config.auth?.defaultBrand ?? '',
    });
  }
}
