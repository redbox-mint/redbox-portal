import type { RawDefinition } from './data-grid.model';
export function rawDefinition(name = ''): RawDefinition {
  return {
    version: 1,
    mode: 'graphql',
    name,
    document:
      'query Explore($type: String!, $first: Int, $after: String) {\n  records(recordType: $type, first: $first, after: $after) {\n    nodes { oid recordType workflowStep }\n    hasNextPage endCursor\n  }\n}',
    variables: { type: '', first: 25, after: null },
    resultPath: ['records', 'nodes'],
  };
}
