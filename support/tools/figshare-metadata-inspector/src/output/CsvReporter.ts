import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FigshareMetadataModel } from '../normalisation/types';

const HEADERS = [
  'item_type_id',
  'item_type',
  'group_id',
  'field_id',
  'field_name',
  'display_name',
  'field_type',
  'required',
  'field_order',
  'field_source',
  'value_source',
  'value_id',
  'value',
  'value_label',
] as const;

function csvCell(value: unknown): string {
  const stringValue = value == null ? '' : String(value);
  const safeValue = /^[\t\r ]*[=+\-@]/.test(stringValue) ? `'${stringValue}` : stringValue;
  return /[",\r\n]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
}

export class CsvReporter {
  public async write(outputDirectory: string, model: FigshareMetadataModel): Promise<void> {
    const rows: unknown[][] = [Array.from(HEADERS)];
    for (const itemType of model.itemTypes) {
      for (const field of itemType.fields) {
        const values = field.values != null && field.values.length > 0 ? field.values : [undefined];
        for (const value of values) {
          rows.push([
            itemType.id,
            itemType.name,
            itemType.groupId,
            field.id,
            field.name,
            field.displayName,
            field.type,
            field.required,
            field.order,
            field.source,
            field.valueSource,
            value?.id,
            value?.value,
            value?.label ?? value?.value,
          ]);
        }
      }
    }
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      path.join(outputDirectory, 'figshare-schema.csv'),
      `${rows.map(row => row.map(csvCell).join(',')).join('\n')}\n`,
      'utf8'
    );
  }
}
