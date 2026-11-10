import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { DateTime } from 'luxon';
import { GraphQLError } from 'graphql';
import type { RecordModel } from '../model/storage/RecordModel';
import type { ReadCaller } from './read-record';
import { hash, isObject } from './renderer';
import { buildCatalogue, gridError, indexClass, scopedContracts, type CatalogueSnapshot } from './catalogue';
import { COLLECTION_ROW, GRID_LIMITS, type GridEnvironment, type GridQuery, type GridOperator } from './grid-types';
import type { RecordContract } from '../record-contract';

interface Position {
  mark: string;
  skip: number;
}
export interface GridPage {
  nodes: RecordModel[];
  hasNextPage: boolean;
  endCursor: string | null;
}
export interface GridRequestContext {
  caller: ReadCaller;
  deadline: number;
  consumeUnits: (count: number) => void;
  readRecord: (oid: string) => Promise<RecordModel>;
}
const CURSOR_DOMAIN = 'redbox-record-grid-cursor/1';
function cursorKey(secret: string | undefined): Buffer {
  if (typeof secret !== 'string' || secret.length < 32)
    gridError(
      'COLLECTION_UNAVAILABLE',
      'A shared recordGraphql.cursorSecret of at least 32 characters is required for collection pagination.'
    );
  return createHash('sha256').update(CURSOR_DOMAIN).update('\0').update(secret).digest();
}
function encodeCursor(position: Position, scope: string, secret: string | undefined): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cursorKey(secret), iv);
  cipher.setAAD(Buffer.from(CURSOR_DOMAIN));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ ...position, scope, version: 1, expires: Date.now() + GRID_LIMITS.cursorAgeMs })),
    cipher.final(),
  ]);
  const result = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  if (Buffer.byteLength(result) > GRID_LIMITS.cursorBytes)
    gridError('COLLECTION_LIMIT', 'Continuation cursor exceeds its size bound.');
  return result;
}
function decodeCursor(value: string | undefined, scope: string, secret: string | undefined): Position {
  const key = cursorKey(secret);
  if (value === undefined || value === null) return { mark: '*', skip: 0 };
  try {
    if (
      typeof value !== 'string' ||
      !value ||
      value.length > GRID_LIMITS.cursorBytes ||
      !/^[A-Za-z0-9_-]+$/.test(value)
    )
      throw new Error();
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length < 29 || bytes.toString('base64url') !== value) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(CURSOR_DOMAIN));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const token: unknown = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString()
    );
    if (
      !isObject(token) ||
      token.version !== 1 ||
      token.scope !== scope ||
      typeof token.expires !== 'number' ||
      token.expires < Date.now() ||
      typeof token.mark !== 'string' ||
      !token.mark ||
      token.mark.length > GRID_LIMITS.cursorBytes ||
      !Number.isSafeInteger(token.skip) ||
      Number(token.skip) < 0 ||
      Number(token.skip) >= GRID_LIMITS.batchSize
    )
      throw new Error();
    return { mark: token.mark, skip: Number(token.skip) };
  } catch {
    return gridError(
      'INVALID_CURSOR',
      'Cursor is invalid, expired, or belongs to a different query, caller, or configuration.'
    );
  }
}
function checkedString(value: unknown): string {
  if (typeof value !== 'string' || Buffer.byteLength(value) > GRID_LIMITS.valueBytes)
    gridError('INVALID_FILTER_VALUE', 'Text values must be strings of at most 256 bytes.');
  return value;
}
function typedValue(value: unknown, type: string, indexKind: string): string {
  if (!isObject(value) || Object.keys(value).length !== 1)
    gridError('INVALID_FILTER_VALUE', 'Supply exactly one typed value.');
  if (type === 'STRING') return checkedString(value.text);
  if (type === 'BOOLEAN') {
    if (typeof value.boolean !== 'boolean') gridError('INVALID_FILTER_VALUE', 'A boolean value is required.');
    return String(value.boolean);
  }
  if (type === 'DATETIME') {
    const text = checkedString(value.dateTime);
    // Luxon accepts ISO 24:00 and normalizes oversized numeric offsets.
    // Validate RFC 3339 component ranges before asking it to validate the calendar.
    const timestamp =
      /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
        text
      );
    if (!timestamp || timestamp[0] !== text)
      gridError(
        'INVALID_FILTER_VALUE',
        'Dates require an RFC 3339 timestamp with seconds, timezone, and at most millisecond precision.'
      );
    const date = DateTime.fromISO(text, { setZone: true });
    if (!date.isValid || date.toUTC().year < 1 || date.toUTC().year > 9999)
      gridError('INVALID_FILTER_VALUE', 'Date/time value is invalid.');
    return date.toUTC().toISO() ?? gridError('INVALID_FILTER_VALUE', 'Date/time value is invalid.');
  }
  const number = value.number;
  if (
    typeof number !== 'number' ||
    !Number.isFinite(number) ||
    (type === 'INTEGER' && !Number.isSafeInteger(number)) ||
    (['IntPointField', 'LongPointField'].includes(indexKind) && !Number.isSafeInteger(number)) ||
    (indexKind === 'IntPointField' && (number < -2147483648 || number > 2147483647)) ||
    (indexKind === 'FloatPointField' && Math.abs(number) > 3.4028234663852886e38)
  )
    gridError('INVALID_FILTER_VALUE', 'A finite number in the indexed field range is required.');
  return String(number);
}
export function queryPlan(
  query: GridQuery,
  snapshot: CatalogueSnapshot,
  environment: GridEnvironment,
  brandId: string
): URLSearchParams {
  const filters = query.filters ?? [];
  const sorts = query.sort ?? [];
  if (!Array.isArray(filters) || filters.length > GRID_LIMITS.filters)
    gridError('INVALID_FILTER', 'At most 10 AND filters are supported.');
  if (!Array.isArray(sorts) || sorts.length > GRID_LIMITS.sorts)
    gridError('INVALID_SORT', 'At most 3 sort fields are supported.');
  const params = new URLSearchParams({
    q: '*:*',
    defType: 'lucene',
    wt: 'json',
    fl: 'redbox_grid_oid',
    rows: String(GRID_LIMITS.batchSize),
  });
  let counter = 0;
  const literal = (field: string, value: string, parser = 'field'): string => {
    const parameter = `rbGridValue${counter++}`;
    params.set(parameter, value);
    return `{!${parser} f=${field} v=$${parameter}}`;
  };
  params.append('fq', literal('redbox_acl2_brand', brandId));
  params.append('fq', literal('redbox_grid_version', '1'));
  params.append('fq', literal('redbox_grid_type', query.recordType));
  const stages = [...new Set(snapshot.catalogue.variants.map(variant => variant.workflowStage))].sort();
  params.append(
    'fq',
    '(' + stages.map(stage => `_query_:${JSON.stringify(literal('redbox_grid_stage', stage))}`).join(' OR ') + ')'
  );
  const fields = new Map(snapshot.catalogue.fields.map(field => [field.id, field]));
  for (const filter of filters) {
    if (!isObject(filter) || typeof filter.field !== 'string')
      gridError('INVALID_FILTER', 'Each filter must specify a stable field identifier.');
    const field = fields.get(filter.field);
    if (!field) gridError('UNKNOWN_FIELD', `Unknown or stale field identifier: ${filter.field}`);
    const indexed = snapshot.bindings.get(field.id);
    const operations = Object.keys(filter).filter(key => key !== 'field');
    if (operations.length !== 1) gridError('INVALID_FILTER', 'Each filter must specify exactly one operator.');
    const operation = operations[0];
    const operator = operation === 'between' ? 'BETWEEN' : operation.toUpperCase();
    if (!indexed || !field.operators.includes(operator as GridOperator))
      gridError('UNSUPPORTED_FILTER', `Operator ${operator} is not supported for ${field.id}.`);
    const kind = indexClass(environment, indexed);
    const value = (input: unknown) => typedValue(input, field.scalarType, kind);
    if (operation === 'eq') params.append('fq', literal(indexed.name, value(filter.eq)));
    else if (operation === 'contains') {
      const text = checkedString(filter.contains);
      if (!text.length) gridError('INVALID_FILTER_VALUE', 'Contains requires a nonempty literal string.');
      // Only StrField is advertised. Escape every Lucene metacharacter before
      // adding the two server-owned wildcards, so input cannot supply syntax.
      const escaped = text.replace(/([+\-!(){}[\]^"~*?:\\/|&\s])/g, '\\$1');
      params.append('fq', `${indexed.name}:*${escaped}*`);
    } else if (operation === 'in') {
      if (!Array.isArray(filter.in) || !filter.in.length || filter.in.length > GRID_LIMITS.values)
        gridError('INVALID_FILTER_VALUE', 'IN requires 1 to 20 typed values.');
      params.append(
        'fq',
        '(' + filter.in.map(item => `_query_:${JSON.stringify(literal(indexed.name, value(item)))}`).join(' OR ') + ')'
      );
    } else if (operation === 'exists') {
      if (typeof filter.exists !== 'boolean') gridError('INVALID_FILTER_VALUE', 'EXISTS requires a boolean.');
      const exists = `${indexed.name}:[* TO *]`;
      params.append('fq', filter.exists ? exists : `(*:* AND -${exists})`);
    } else if (operation === 'gt' || operation === 'lt') {
      const item = value(operation === 'gt' ? filter.gt : filter.lt);
      params.append(
        'fq',
        operation === 'gt'
          ? `${indexed.name}:{${JSON.stringify(item)} TO *]`
          : `${indexed.name}:[* TO ${JSON.stringify(item)}}`
      );
    } else if (operation === 'between') {
      if (!isObject(filter.between) || Object.keys(filter.between).length !== 2)
        gridError('INVALID_FILTER_VALUE', 'BETWEEN requires from and to typed values.');
      const from = value(filter.between.from);
      const to = value(filter.between.to);
      if (field.scalarType === 'DATETIME' ? from > to : Number(from) > Number(to))
        gridError('INVALID_FILTER_VALUE', 'Range lower bound exceeds its upper bound.');
      params.append('fq', `${indexed.name}:[${JSON.stringify(from)} TO ${JSON.stringify(to)}]`);
    } else gridError('UNSUPPORTED_FILTER', 'Filter operator is unsupported.');
  }
  const sort = [];
  const seen = new Set<string>();
  for (const item of sorts) {
    if (!isObject(item) || typeof item.field !== 'string' || !['ASC', 'DESC'].includes(item.direction))
      gridError('INVALID_SORT', 'Sort fields require ASC or DESC.');
    const field = fields.get(item.field);
    if (!field) gridError('UNKNOWN_FIELD', `Unknown or stale field identifier: ${item.field}`);
    const indexed = snapshot.bindings.get(field.id);
    if (!field.sortable || !indexed || seen.has(item.field))
      gridError('UNSUPPORTED_SORT', `Sorting is not supported or is repeated for ${item.field}.`);
    seen.add(item.field);
    sort.push(`${indexed.name} ${item.direction.toLowerCase()}`);
  }
  if (!sort.length) sort.push('redbox_grid_oid asc');
  if (!sort.some(value => value.split(' ')[0] === environment.schema.uniqueKey))
    sort.push(`${environment.schema.uniqueKey} asc`);
  params.set('sort', sort.join(','));
  return params;
}

export async function readCollection(
  contracts: readonly RecordContract[],
  query: GridQuery,
  environment: GridEnvironment,
  context: GridRequestContext
): Promise<GridPage> {
  scopedContracts(contracts, query.recordType, query.workflowStages ?? []);
  const first = query.first ?? GRID_LIMITS.defaultPageSize;
  if (!Number.isInteger(first) || first < 1 || first > GRID_LIMITS.pageSize)
    gridError('INVALID_PAGE_SIZE', 'Page size must be between 1 and 50.');
  const snapshot = buildCatalogue(contracts, query.recordType, query.workflowStages ?? [], environment);
  const params = queryPlan(query, snapshot, environment, context.caller.brand.id);
  // A stale index or historical form must not turn an undeclared/private
  // stored path into a filter or sorting oracle. Indexed ACLs cannot prove this.
  const usesMetadata = [...(query.filters ?? []), ...(query.sort ?? [])].some(item =>
    item.field.startsWith('metadata:')
  );
  const readableStages = new Set(snapshot.catalogue.variants.map(variant => variant.workflowStage));
  const readableVariants = new Set(
    snapshot.catalogue.variants.map(variant => JSON.stringify([variant.workflowStage, variant.form]))
  );
  const scope = hash(
    JSON.stringify({
      actor: context.caller.user.id ?? context.caller.user.username,
      username: context.caller.user.username,
      roles: context.caller.roles.map(role => (isObject(role) ? [role.id, role.name] : [])).sort(),
      brandRoles: context.caller.brand.roles.map(role => [role.id, role.name]).sort(),
      brand: context.caller.brand.id,
      portal: context.caller.portal,
      core: environment.coreId,
      revision: snapshot.catalogue.revision,
      params: [...params],
      first,
    })
  );
  let position = decodeCursor(query.after, scope, environment.cursorSecret);
  const nodes: RecordModel[] = [];
  const seen = new Set<string>();
  let consumed = 0;
  let end: Position | undefined;
  for (let batch = 0; batch < GRID_LIMITS.candidates / GRID_LIMITS.batchSize; batch++) {
    context.consumeUnits(1);
    if (Date.now() >= context.deadline) gridError('QUERY_TIMEOUT', 'Collection query timed out.');
    params.set('cursorMark', position.mark);
    let page;
    try {
      page = await environment.search(params, context.deadline);
    } catch {
      return gridError('SEARCH_UNAVAILABLE', 'The search backend could not complete this bounded page.');
    }
    if (page.oids.length > GRID_LIMITS.batchSize || page.oids.length < position.skip)
      gridError('INVALID_CURSOR', 'Index changes invalidated this continuation position; restart the query.');
    for (let index = position.skip; index < page.oids.length; index++) {
      context.consumeUnits(1);
      consumed++;
      if (consumed > GRID_LIMITS.candidates)
        gridError('COLLECTION_LIMIT', 'Collection could not be completed within its work bound; narrow the query.');
      const oid = page.oids[index];
      if (seen.has(oid)) continue;
      seen.add(oid);
      let record;
      try {
        record = await context.readRecord(oid);
      } catch (error) {
        if (error instanceof GraphQLError && ['NOT_FOUND', 'FORBIDDEN'].includes(String(error.extensions.code)))
          continue;
        throw error;
      }
      if (
        record.metaMetadata.type !== query.recordType ||
        !readableStages.has(record.workflow?.stage) ||
        (usesMetadata && !readableVariants.has(JSON.stringify([record.workflow?.stage, record.metaMetadata.form])))
      )
        continue;
      if (nodes.length === first)
        return {
          nodes,
          hasNextPage: true,
          endCursor: encodeCursor(
            end ?? gridError('COLLECTION_UNAVAILABLE', 'Collection continuation is unavailable.'),
            scope,
            environment.cursorSecret
          ),
        };
      nodes.push({ ...record, [COLLECTION_ROW]: true });
      end =
        index + 1 === page.oids.length ? { mark: page.nextCursor, skip: 0 } : { mark: position.mark, skip: index + 1 };
    }
    if (page.exhausted) return { nodes, hasNextPage: false, endCursor: null };
    if (!page.oids.length || page.nextCursor === position.mark)
      gridError('SEARCH_UNAVAILABLE', 'Search continuation did not advance.');
    position = { mark: page.nextCursor, skip: 0 };
  }
  return gridError('COLLECTION_LIMIT', 'Collection could not be completed within its work bound; narrow the query.');
}
