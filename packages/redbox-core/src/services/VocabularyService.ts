import { Services as Domain } from '../vocabulary/Vocabulary';
import { LegacyVocabulary } from '../compat/sails/vocabulary';
export namespace Services {
  export import VocabularyEntryInput = Domain.VocabularyEntryInput;
  export import VocabularyInput = Domain.VocabularyInput;
  export import VocabularyListOptions = Domain.VocabularyListOptions;
  export import VocabularyTreeNode = Domain.VocabularyTreeNode;
  export import VocabularyEntriesOptions = Domain.VocabularyEntriesOptions;
  export import VocabularyEntriesResponse = Domain.VocabularyEntriesResponse;
  export import VocabularyChildrenNode = Domain.VocabularyChildrenNode;
  export import VocabularyChildrenResponse = Domain.VocabularyChildrenResponse;
  export import VocabularyExpandPathResponse = Domain.VocabularyExpandPathResponse;
  export import ExternallyManagedVocabularyError = Domain.ExternallyManagedVocabularyError;
  export import InvalidParentIdError = Domain.InvalidParentIdError;
  export class VocabularyService extends LegacyVocabulary {}
}
declare global {
  let VocabularyService: Services.VocabularyService;
}
