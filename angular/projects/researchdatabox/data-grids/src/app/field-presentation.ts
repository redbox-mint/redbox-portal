import type { GridField, JsonValue } from './data-grid.model';

/** Display formatting never changes the value sent to filters, saves or JSON. */
export function fieldValue(
  field: Pick<GridField, 'choices'> | undefined,
  value: JsonValue | undefined
): JsonValue | undefined {
  if (Array.isArray(value)) return value.map(item => fieldValue(field, item) as JsonValue);
  if (value === null || typeof value === 'object' || value === undefined) return value;
  return field?.choices?.find(choice => choice.value === String(value))?.label ?? value;
}

export function fieldGroups(fields: GridField[]): { label: string; fields: GridField[] }[] {
  const groups = new Map<string, GridField[]>();
  for (const field of fields) {
    const label = field.groupPath?.join(' / ') || field.group || '';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(field);
  }
  return [...groups]
    .map(([label, fields]) => ({ label, fields }))
    .sort(
      (a, b) =>
        Number(b.fields.some(f => f.id.startsWith('record:'))) -
          Number(a.fields.some(f => f.id.startsWith('record:'))) || a.label.localeCompare(b.label)
    );
}

export function columnSize(id: string, type?: string): { flex: number; minWidth: number } {
  if (/(^|[:/.])title$/i.test(id)) return { flex: 3, minWidth: 320 };
  if (['number', 'boolean', 'datetime', 'choice'].includes(type ?? '') || id === 'record:workflowStep')
    return { flex: 1, minWidth: 130 };
  return { flex: 1.5, minWidth: 170 };
}
