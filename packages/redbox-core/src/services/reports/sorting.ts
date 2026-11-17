import type { ReportConfig } from '../../model/config/ReportConfig';
import type { NamedQueryConfig } from '../NamedQueryService';
import type { SolrCoreSchema } from '../../config/solr.config';

const safePath = (value: string) =>
  typeof value === 'string' &&
  /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(value) &&
  !value.split('.').some(part => ['__proto__', 'prototype', 'constructor'].includes(part));

/** Map report output columns to source fields; computed/template outputs are deliberately excluded. */
export function reportSortFields(
  report: ReportConfig,
  query?: NamedQueryConfig,
  schema?: SolrCoreSchema
): Map<string, string> {
  const fields = new Map<string, string>();
  for (const column of report.columns) {
    const property = column.property;
    if (column.hide || ('multivalue' in column && column.multivalue) || !safePath(property)) continue;
    if (report.reportSource === 'database') {
      if (!query) continue;
      const isUser = query.collectionName === 'user';
      const envelope: Record<string, string> = isUser
        ? { lastSaveDate: 'updatedAt', dateCreated: 'createdAt' }
        : query.collectionName === 'record'
          ? { oid: 'redboxOid', title: 'metadata.title', lastSaveDate: 'lastSaveDate', dateCreated: 'dateCreated' }
          : { lastSaveDate: 'lastSaveDate', dateCreated: 'dateCreated' };
      let source: string | undefined = envelope[property];
      if (property.startsWith('metadata.')) {
        const key = property.slice('metadata.'.length);
        const mapping = query.resultObjectMapping ?? {};
        const value = Object.prototype.hasOwnProperty.call(mapping, key) ? mapping[key] : undefined;
        if (typeof value === 'string') {
          const direct = value.match(/^(?:{{\s*record\.([\w.]+)\s*}}|record\.([\w.]+))$/);
          source = direct?.[1] ?? direct?.[2];
        } else if (Object.keys(mapping).length === 0) {
          source = isUser
            ? ['type', 'name', 'email', 'username', 'lastLogin'].includes(key)
              ? key
              : undefined
            : query.collectionName === 'record'
              ? `metadata.${key}`
              : key;
        }
      }
      if (source && safePath(source)) fields.set(property, source);
    } else {
      const definition =
        schema?.['add-field'].find(field => field.name === property) ??
        schema?.['add-dynamic-field']
          .filter(field => {
            const parts = field.name.split('*');
            return parts.length === 2 && property.startsWith(parts[0]) && property.endsWith(parts[1]);
          })
          .sort((a, b) => b.name.length - a.name.length)[0];
      if (
        definition &&
        !definition.multiValued &&
        (definition.indexed || definition.docValues) &&
        [
          'string',
          'pdate',
          'pint',
          'plong',
          'pfloat',
          'pdouble',
          'boolean',
          'int',
          'long',
          'float',
          'double',
          'date',
        ].includes(definition.type)
      ) {
        fields.set(property, property);
      }
    }
  }
  return fields;
}

/** Invalid or unsupported requests safely retain the report's default ordering. */
export function requestedReportSort(
  req: Sails.ReqParamProvider,
  fields: Map<string, string>
): { field: string; direction: 'asc' | 'desc' } | undefined {
  const property: unknown = req.param('sortField');
  const direction: unknown = req.param('sortDirection');
  if (typeof property !== 'string' || (direction !== 'asc' && direction !== 'desc')) return undefined;
  const field = fields.get(property);
  return field ? { field, direction } : undefined;
}
