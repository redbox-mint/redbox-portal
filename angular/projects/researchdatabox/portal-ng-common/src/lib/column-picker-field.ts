/** Presentation-only contract: no explorer query or grid dependency. */
export interface ColumnPickerField {
  id: string;
  label: string;
  path?: string;
  type: string;
  selectable: boolean;
  listed?: boolean;
  repeatingSubfield?: boolean;
  group?: string;
  groupPath?: string[];
}
export function fieldGroups<T extends ColumnPickerField>(fields: T[]): { label: string; fields: T[] }[] {
  const groups = new Map<string, T[]>();
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
