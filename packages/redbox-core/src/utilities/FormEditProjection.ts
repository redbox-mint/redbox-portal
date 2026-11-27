/** Legacy group rows can store the editable name under value. */
export function hydratedName(row: Record<string, unknown>): unknown {
  if (typeof row.name === 'string' || row.name === null) return row.name;
  return typeof row.value === 'string' && row.value.length > 0 ? row.value : row.name;
}

export function selectionPropertyNames(row: Record<string, unknown>, properties: string[]): string[] {
  return typeof row.label === 'string' && typeof row.value === 'string' ? [...properties, 'label', 'value'] : properties;
}
