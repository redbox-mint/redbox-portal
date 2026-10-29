import type { ContextSchemaField } from './schema-assist.model';
import { pathSegments, templateSegment } from './template-path';

const field = (path: string, type: string): ContextSchemaField => ({
  path,
  type,
  required: false,
  isArray: type === 'array',
  source: 'runtime',
});
const prefix = (fields: ContextSchemaField[], root: string): ContextSchemaField[] => [
  field(root, 'object'),
  ...fields.map(f => ({ ...f, path: `${root}.${f.path}` })),
];
const unique = (fields: ContextSchemaField[]): ContextSchemaField[] => [
  ...new Map(fields.map(f => [f.path, f])).values(),
];

/** Schema paths are metadata-relative. These are stored-record paths, never email's curated record. */
export function storedRecordFields(metadata: ContextSchemaField[]): ContextSchemaField[] {
  return [
    ...prefix(metadata, 'metadata'),
    field('redboxOid', 'string'),
    field('dateCreated', 'string'),
    field('lastSaveDate', 'string'),
    field('metaMetadata', 'object'),
    field('metaMetadata.type', 'string'),
  ];
}

/** Mongo predicates, parameters and sort traverse arrays implicitly; colon names are literal keys. */
export function storedRecordPath(presentationPath: string): string | null {
  const parts = pathSegments(presentationPath);
  // Literal dots/dollar keys need Mongo expressions, not ordinary predicate/sort paths.
  if (!parts.length || parts.some(part => part.name.includes('.') || part.name.startsWith('$'))) return null;
  return parts.map(part => part.name).join('.');
}

/** Native dotted paths for a plain Mongo path input/autocomplete, without template segment quoting. */
export function storedRecordPathFields(metadata: ContextSchemaField[]): ContextSchemaField[] {
  return storedRecordFields(metadata).flatMap(field => {
    const path = storedRecordPath(field.path);
    return path === null ? [] : [{ ...field, path }];
  });
}

/** Direct named-query lookups and report column properties use lodash syntax, not Handlebars literals. */
export function lookupPath(presentationPath: string): string | null {
  if (presentationPath.includes('[]')) return null; // Direct lookups cannot iterate array item paths.
  const parts = pathSegments(presentationPath);
  if (!parts.length || parts.some(part => !templateSegment(part.name))) return null;
  return parts
    .map((part, index) =>
      /^[A-Za-z_$][\w$-]*$/.test(part.name) ? (index ? '.' : '') + part.name : '[' + JSON.stringify(part.name) + ']'
    )
    .join('');
}

/** NamedQueryService.runTemplate receives { record: storedRecord }. Direct lookups use lodash paths. */
export function namedQueryMappingFields(stored: ContextSchemaField[]): ContextSchemaField[] {
  return prefix(stored, 'record');
}

/** NamedQueryResponseRecord always wraps mapped values under metadata. Never reuse record fields for users. */
export function queryResultFields(
  collectionName: string,
  sourceMetadata: ContextSchemaField[],
  mapping: Record<string, string> = {}
): ContextSchemaField[] {
  const envelope = [
    field('oid', 'string'),
    field('title', 'string'),
    field('dateCreated', 'string | null'),
    field('lastSaveDate', 'string | null'),
  ];
  if (!Object.keys(mapping).length)
    return [...envelope, ...prefix(collectionName === 'record' ? sourceMetadata : [], 'metadata')];
  const sources = namedQueryMappingFields(collectionName === 'record' ? storedRecordFields(sourceMetadata) : []);
  const output: ContextSchemaField[] = [field('metadata', 'object')];
  for (const [alias, expression] of Object.entries(mapping)) {
    // NamedQueryService starts with a clone containing each alias, so lodash.set treats
    // even dotted aliases as existing literal keys (it does not create nested paths).
    const segment = templateSegment(alias);
    if (!segment) continue;
    const path = 'metadata.' + segment;
    const source = sources.find(
      f => !f.path.includes('[]') && (lookupPath(f.path) === expression || storedRecordPath(f.path) === expression)
    );
    const rendered = expression.includes('{{');
    // Rendered templates produce strings. An unknown direct expression remains unknown.
    output.push(source ? { ...source, path, required: false } : field(path, rendered ? 'string' : 'unknown'));
    if (source) {
      for (const child of sources.filter(
        f => f.path.startsWith(source.path + '.') || f.path.startsWith(source.path + '[]')
      ))
        output.push({ ...child, path: path + child.path.slice(source.path.length), required: false });
    }
  }
  return unique([...envelope, ...output]);
}

function reportContextFields(
  rows: ContextSchemaField[],
  property: string,
  multivalue: boolean,
  scalarValue: boolean
): ContextSchemaField[] {
  const col = ['property', 'label', 'template', 'exportTemplate'].map(key =>
    field('recordTableMeta.col.' + key, 'string')
  );
  const selected = rows.find(f => f.path === property || lookupPath(f.path) === property);
  const value = multivalue
    ? field('', selected?.itemType ?? 'unknown')
    : scalarValue && selected
      ? selected
      : field('', scalarValue ? 'unknown' : 'undefined');
  const prefix = (selected?.path ?? property) + (multivalue ? '[]' : '');
  const children =
    multivalue || scalarValue
      ? rows
          .filter(f => f.path.startsWith(prefix + '.'))
          .map(f => ({ ...f, path: 'recordTableMeta.val' + f.path.slice(prefix.length), required: false }))
      : [];
  return [
    ...rows,
    field('recordTableMeta', 'object'),
    field('recordTableMeta.col', 'object'),
    ...col,
    field('recordTableMeta.col.multivalue', 'boolean'),
    { ...value, path: 'recordTableMeta.val', required: false },
    ...children,
    field('optTemplateData', 'object'),
    field('optTemplateData.brandingAndPortalUrl', 'string'),
  ];
}

/** RecordTableComponent only supplies val when iterating a multivalue column; scalar val is undefined. */
export function reportDisplayTemplateFields(
  rows: ContextSchemaField[],
  property: string,
  multivalue: boolean
): ContextSchemaField[] {
  return reportContextFields(rows, property, multivalue, false);
}

/** ReportsService supplies the scalar value, or each item, and chooses exportTemplate then template. */
export function reportCsvTemplateFields(
  rows: ContextSchemaField[],
  property: string,
  multivalue: boolean
): ContextSchemaField[] {
  return reportContextFields(rows, property, multivalue, true);
}
