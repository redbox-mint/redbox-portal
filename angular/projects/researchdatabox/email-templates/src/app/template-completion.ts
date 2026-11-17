import {
  completionEdit as sharedCompletionEdit,
  type CompletionItem,
  type CompletionQuery,
} from '@researchdatabox/portal-ng-common';
import { blockHelperScaffold } from './helper-usage';
export { completionItems, completionQuery } from '@researchdatabox/portal-ng-common';
export type {
  CompletionSource,
  CompletionItem,
  CompletionQuery,
  CompletionEdit,
} from '@researchdatabox/portal-ng-common';
export function completionEdit(text: string, query: CompletionQuery, item: CompletionItem) {
  return sharedCompletionEdit(text, query, item, blockHelperScaffold);
}
