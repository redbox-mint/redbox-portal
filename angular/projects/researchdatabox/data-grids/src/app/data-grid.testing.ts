import { emptyGrid, GridDefinition, GridScope } from './data-grid.model';

export const scope: GridScope = {
  id: 'plans-draft',
  label: 'Plans / Draft',
  recordType: 'plan',
  workflowStage: 'draft',
  fields: [
    {
      id: 'title',
      label: 'Title',
      type: 'text',
      selectable: true,
      operators: ['contains', 'eq', 'in', 'exists'],
      sortable: true,
    },
    { id: 'budget', label: 'Budget', type: 'number', selectable: true, operators: ['eq', 'between'], sortable: true },
    { id: 'start', label: 'Start date', type: 'datetime', selectable: true, operators: ['between'], sortable: true },
    { id: 'active', label: 'Active', type: 'boolean', selectable: true, operators: ['eq'], sortable: false },
    {
      id: 'status',
      label: 'Status',
      type: 'choice',
      selectable: true,
      operators: ['eq'],
      sortable: false,
      choices: [{ value: 'draft', label: 'Draft' }],
    },
    { id: 'people', label: 'People', type: 'text', selectable: false, repeating: true, operators: [], sortable: false },
  ],
};
export function validGrid(): GridDefinition {
  return { ...emptyGrid(), name: 'My plans', recordType: 'plan', workflowStage: 'draft', columns: ['title'] };
}

export const testSdl = `type Query { records(recordType: String!, first: Int, after: String): Page! }
type Page { nodes: [Record!]!, hasNextPage: Boolean!, endCursor: String }
type Record { oid: ID!, title: String, workflowStep: String, recordType: String }`;
