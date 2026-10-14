import { SearchFilter } from './storage/RecordTypeModel';
import { NormalizedRecordRelation } from '../config/recordtype.config';
import {
  coerceRecordConcurrentModificationConfig,
  type RecordConcurrentModificationConfig,
} from '@researchdatabox/sails-ng-common';

export class RecordTypeResponseModel {
  name: string;
  packageType: string;
  searchFilters: SearchFilter[];
  searchable: boolean;
  relatedTo?: NormalizedRecordRelation[];
  /**
   * Advertised so a client knows whether to send a precondition.  A stored
   * policy that cannot be parsed is reported as the compatibility default
   * rather than failing the discovery response: it cannot loosen anything,
   * because the mutation boundary resolves policy again and fails closed.
   */
  concurrentModification: RecordConcurrentModificationConfig;

  constructor(
    name: string | undefined,
    packageType: string | undefined,
    searchFilters: SearchFilter[],
    searchable: boolean = true,
    relatedTo?: NormalizedRecordRelation[],
    concurrentModification?: unknown
  ) {
    this.name = name ?? '';
    this.packageType = packageType ?? '';
    this.searchFilters = searchFilters;
    this.searchable = searchable;
    this.relatedTo = relatedTo;
    this.concurrentModification = coerceRecordConcurrentModificationConfig(concurrentModification);
  }
}

export { SearchFilter } from './storage/RecordTypeModel';
