import { choiceValue } from '@researchdatabox/sails-ng-common';
import type { GridField, JsonValue } from './data-grid.model';

/** Display formatting never changes the value sent to filters, saves or JSON. */
export function fieldValue(
  field: Pick<GridField, 'choices'> | undefined,
  value: JsonValue | undefined
): JsonValue | undefined {
  return choiceValue(field?.choices, value) as JsonValue | undefined;
}

export { fieldGroups } from '@researchdatabox/portal-ng-common';

export function columnSize(id: string, type?: string): { flex: number; minWidth: number } {
  if (/(^|[:/.])title$/i.test(id)) return { flex: 3, minWidth: 320 };
  if (['number', 'boolean', 'datetime', 'choice'].includes(type ?? '') || id === 'record:workflowStep')
    return { flex: 1, minWidth: 130 };
  return { flex: 1.5, minWidth: 170 };
}
