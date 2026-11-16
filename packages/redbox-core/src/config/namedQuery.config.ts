/**
 * Named Query Config Interface and Default Values
 *
 * NamedQueryService.bootstrapData() seeds JSON files from `bootstrap-data/namedqueries/`
 * first, then hook/deployment definitions from `namedQuery.queries`. Existing
 * brand/name entries are never overwritten; file seeds take precedence.
 * Both sources require collectionName. This config also carries `supportedCollections`,
 * which the named-query editor surfaces as the Collection field's allowed values.
 */

import type { NamedQueryDefinition } from '@researchdatabox/sails-ng-common';
export type {
  NamedQueryDefinition,
  DatabaseNamedQueryDefinition,
  GraphqlNamedQueryDefinition,
  NamedQueryParam,
  RelatedRecordFilterDefinition,
} from '@researchdatabox/sails-ng-common';

export interface NamedQueryDefinitions {
  [queryName: string]: NamedQueryDefinition;
}

export interface NamedQueryConfig {
  /**
   * Collections that may be selected when defining a named query. Surfaced to the
   * named-query editor so the Collection field can be a strict dropdown of valid,
   * brand-scoped values.
   */
  supportedCollections: string[];
  queries?: NamedQueryDefinitions;
}

export const namedQuery: NamedQueryConfig = {
  supportedCollections: ['record', 'user'],
};
