import { searchFieldRows as sharedSearch, type FieldNode } from '@researchdatabox/portal-ng-common';
export { buildFieldTree, fieldInsertion, visibleFieldRows } from '@researchdatabox/portal-ng-common';
export type { FieldNode, FieldRow } from '@researchdatabox/portal-ng-common';
export function searchFieldRows(nodes: FieldNode[], query: string, limit = 100) {
  return sharedSearch(nodes, query, limit, ['imports']);
}
