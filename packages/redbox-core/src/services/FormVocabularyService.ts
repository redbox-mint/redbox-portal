import { Services as Comparison } from '../compat/sails/formVocabulary';
export namespace Services {
  export class FormVocabulary extends Comparison.FormVocabulary {}
}
declare global {
  let FormVocabularyService: Services.FormVocabulary;
}
