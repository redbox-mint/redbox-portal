import { createHash } from 'node:crypto';
import type { GraphqlNamedQueryDefinition, DatabaseNamedQueryDefinition } from '@researchdatabox/sails-ng-common';

export const lifecycleOid = 'named-query-cold-lifecycle-record';
export const lifecycleTitle = 'Persisted cold bootstrap title';

export function lifecycleDefinitions() {
  // The fragment must exist BEFORE the import. An envelope-only query could
  // validate against an empty catalogue and conceal an incorrect bootstrap order.
  const suffix = createHash('sha256')
    .update(JSON.stringify(['default', 'rdmp', 'dataPublication', 'draft', 'dataPublication-1.0-draft']), 'utf16le')
    .digest('hex');
  const graphql: GraphqlNamedQueryDefinition = {
    name: 'coldGraphql',
    source: 'graphql',
    description: 'Imported GraphQL definition',
    graphql: {
      document: `query ColdLookup($search: String!, $first: Int, $after: String) {
        matches: records(recordType: "dataPublication", workflowStages: ["draft"],
          filters: [{field: "record:oid", contains: $search}], first: $first, after: $after) {
          items: nodes { id: oid details: metadata {
            ... on M_dataPublication_draft_${suffix} { label: title }
          } }
          more: hasNextPage cursor: endCursor
        }
      }`,
      variables: { search: { ownership: 'consumer', parameter: 'search', inputType: 'String!', required: true } },
      resultPath: ['matches', 'items'],
      mappings: { oid: ['id'], title: ['details', 'label'] },
      lookup: {
        mode: 'firstPage',
        collectionPath: ['matches'],
        hasNextPagePath: ['matches', 'more'],
        endCursorPath: ['matches', 'cursor'],
        firstVariable: 'first',
        afterVariable: 'after',
        searchParameter: 'search',
      },
    },
  };
  const legacy: DatabaseNamedQueryDefinition = {
    name: 'coldLegacy',
    description: 'Imported legacy definition',
    collectionName: 'record',
    brandIdFieldPath: 'metaMetadata.brandId',
    mongoQuery: { redboxOid: lifecycleOid },
    queryParams: {},
    resultObjectMapping: {},
  };
  return {
    aInvalid: { ...graphql, name: 'aInvalid', graphql: { ...graphql.graphql, document: '{ removedPrivateField }' } },
    coldGraphql: graphql,
    coldLegacy: legacy,
  };
}
