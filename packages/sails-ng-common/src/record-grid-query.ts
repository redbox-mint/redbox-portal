import type { NamedQueryJson } from './named-query.model';

export interface RecordGridSelection {
  selection: string;
  responsePath: string[];
}

/** Build only from current trusted discovery selections. User values stay in variables.
 * Shared by visual explorer execution and detached named-query preparation. */
export function recordGridRequest(input: {
  recordType: string;
  workflowStage?: string;
  selections: RecordGridSelection[];
  filters: NamedQueryJson[];
  sort: NamedQueryJson[];
  first: number;
  after: string | null;
}): {
  query: string;
  variables: {
    type: string;
    stages?: string[];
    filters: NamedQueryJson[];
    sort: NamedQueryJson[];
    first: number;
    after: string | null;
  };
} {
  const fragments = [
    ...new Set(input.selections.filter(item => item.responsePath[0] === 'metadata').map(item => item.selection)),
  ];
  const envelope = [
    ...new Set([
      'oid',
      ...input.selections.filter(item => item.responsePath[0] !== 'metadata').map(item => item.selection),
    ]),
  ];
  return {
    query: `query GridPage($type: String!, $stages: [String!], $filters: [RecordFilterInput!], $sort: [RecordSortInput!], $first: Int, $after: String) {
      records(recordType: $type, workflowStages: $stages, filters: $filters, sort: $sort, first: $first, after: $after) {
        nodes { ${envelope.join('\n')} metadata { __typename ${fragments.join('\n')} } }
        hasNextPage endCursor
      }
    }`,
    variables: {
      type: input.recordType,
      ...(input.workflowStage ? { stages: [input.workflowStage] } : {}),
      filters: input.filters,
      sort: input.sort,
      first: input.first,
      after: input.after,
    },
  };
}
