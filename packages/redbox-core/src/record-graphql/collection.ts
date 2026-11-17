import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { DateTime } from 'luxon';
import { GraphQLError } from 'graphql';
import type { RecordModel } from '../model/storage/RecordModel';
import type { ReadCaller } from './read-record';
import { hash, isObject } from './renderer';
import { buildCatalogue, gridError, scopedContracts, type CatalogueSnapshot } from './catalogue';
import {
  COLLECTION_ROW,
  GRID_LIMITS,
  type GridEnvironment,
  type GridQuery,
  type GridOperator,
  type GridPosition,
  type GridKey,
} from './grid-types';
import type { RecordContract } from '../record-contract';

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
const CURSOR_DOMAIN = 'redbox-record-grid-mongo-cursor/1';
function cursorKey(secret: string | undefined): Buffer {
  if (typeof secret !== 'string' || secret.length < 32)
    gridError(
      'COLLECTION_UNAVAILABLE',
      'A shared recordGraphql.cursorSecret of at least 32 characters is required for collection pagination.'
    );
  return createHash('sha256').update(CURSOR_DOMAIN).update('\0').update(secret).digest();
}
function encodeCursor(position: GridPosition, scope: string, secret: string | undefined): string {
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
function decodeCursor(value: string | undefined, scope: string, secret: string | undefined): GridPosition | undefined {
  const key = cursorKey(secret);
  if (value === undefined || value === null) return undefined;
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
      !Array.isArray(token.keys) ||
      token.keys.length < 1 ||
      token.keys.length > GRID_LIMITS.sorts + 1 ||
      token.keys.some(
        key =>
          key !== null &&
          typeof key !== 'string' &&
          typeof key !== 'boolean' &&
          (typeof key !== 'number' || !Number.isFinite(key))
      )
    )
      throw new Error();
    return { keys: token.keys as GridKey[] };
  } catch {
    return gridError(
      'INVALID_CURSOR',
      'Cursor is invalid, expired, or belongs to a different query, caller, or configuration.'
    );
  }
}
function checkedString(value: unknown): string {
  if (typeof value !== 'string' || !value.isWellFormed() || Buffer.byteLength(value) > GRID_LIMITS.valueBytes)
    gridError('INVALID_FILTER_VALUE', 'Text values must be strings of at most 256 bytes.');
  return value;
}
function typedValue(value: unknown, type: string): GridKey {
  if (!isObject(value) || Object.keys(value).length !== 1)
    gridError('INVALID_FILTER_VALUE', 'Supply exactly one typed value.');
  if (type === 'STRING') return checkedString(value.text);
  if (type === 'BOOLEAN') {
    if (typeof value.boolean !== 'boolean') gridError('INVALID_FILTER_VALUE', 'A boolean value is required.');
    return value.boolean;
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
    return date.toMillis();
  }
  const number = value.number;
  if (typeof number !== 'number' || !Number.isFinite(number) || (type === 'INTEGER' && !Number.isSafeInteger(number)))
    gridError('INVALID_FILTER_VALUE', 'A finite number (a safe integer for INTEGER fields) is required.');
  return number;
}
export interface CollectionPlan {
  filters: Array<{ field: string; operation: string; values: GridKey[] }>;
  sort: Array<{ field: string; direction: 1 | -1 }>;
}
/** Validate the public DSL against the readable catalogue before any storage work. */
export function queryPlan(query: GridQuery, snapshot: CatalogueSnapshot): CollectionPlan {
  const filters = query.filters ?? [];
  const sorts = query.sort ?? [];
  if (!Array.isArray(filters) || filters.length > GRID_LIMITS.filters)
    gridError('INVALID_FILTER', 'At most 10 AND filters are supported.');
  if (!Array.isArray(sorts) || sorts.length > GRID_LIMITS.sorts)
    gridError('INVALID_SORT', 'At most 3 sort fields are supported.');
  const plan: CollectionPlan = { filters: [], sort: [] };
  const fields = new Map(snapshot.catalogue.fields.map(field => [field.id, field]));
  for (const filter of filters) {
    if (!isObject(filter) || typeof filter.field !== 'string')
      gridError('INVALID_FILTER', 'Each filter must specify a stable field identifier.');
    const field = fields.get(filter.field);
    if (!field) gridError('UNKNOWN_FIELD', `Unknown or stale field identifier: ${filter.field}`);
    const operations = Object.keys(filter).filter(key => key !== 'field');
    if (operations.length !== 1) gridError('INVALID_FILTER', 'Each filter must specify exactly one operator.');
    const operation = operations[0];
    if (!snapshot.bindings.has(field.id) || !field.operators.includes(operation.toUpperCase() as GridOperator))
      gridError('UNSUPPORTED_FILTER', `Operator ${operation.toUpperCase()} is not supported for ${field.id}.`);
    const value = (input: unknown) => typedValue(input, field.scalarType);
    let values: GridKey[];
    if (operation === 'contains' || operation === 'iprefix') {
      const text = checkedString(filter[operation]);
      if (!text.length) gridError('INVALID_FILTER_VALUE', 'Supply a nonempty literal string.');
      values = [text];
    } else if (operation === 'in') {
      if (!Array.isArray(filter.in) || !filter.in.length || filter.in.length > GRID_LIMITS.values)
        gridError('INVALID_FILTER_VALUE', 'IN requires 1 to 20 typed values.');
      values = filter.in.map(value);
    } else if (operation === 'exists') {
      if (typeof filter.exists !== 'boolean') gridError('INVALID_FILTER_VALUE', 'EXISTS requires a boolean.');
      values = [filter.exists];
    } else if (operation === 'between') {
      if (!isObject(filter.between) || Object.keys(filter.between).length !== 2)
        gridError('INVALID_FILTER_VALUE', 'BETWEEN requires from and to typed values.');
      values = [value(filter.between.from), value(filter.between.to)];
      if (Number(values[0]) > Number(values[1]))
        gridError('INVALID_FILTER_VALUE', 'Range lower bound exceeds its upper bound.');
    } else values = [value(filter[operation])];
    plan.filters.push({ field: field.id, operation, values });
  }
  const seen = new Set<string>();
  for (const item of sorts) {
    if (
      !isObject(item) ||
      Object.keys(item).some(key => !['field', 'direction'].includes(key)) ||
      typeof item.field !== 'string' ||
      !['ASC', 'DESC'].includes(item.direction)
    )
      gridError('INVALID_SORT', 'Sort fields require ASC or DESC.');
    const field = fields.get(item.field);
    if (!field) gridError('UNKNOWN_FIELD', `Unknown or stale field identifier: ${item.field}`);
    if (!field.sortable || seen.has(item.field))
      gridError('UNSUPPORTED_SORT', `Sorting is not supported or is repeated for ${item.field}.`);
    seen.add(item.field);
    plan.sort.push({ field: item.field, direction: item.direction === 'ASC' ? 1 : -1 });
  }
  // OID is unique in active storage. Append it ascending unless explicitly ordered.
  if (!seen.has('record:oid')) plan.sort.push({ field: 'record:oid', direction: 1 });
  return plan;
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
  const plan = queryPlan(query, snapshot);
  // Historical forms must not turn undeclared/private stored paths into
  // filter or sorting oracles. Recheck hydrated scope after candidate selection.
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
      brandRoles: context.caller.brand.roles.map(role => [role.id, role.name]),
      brand: context.caller.brand.id,
      portal: context.caller.portal,
      backend: CURSOR_DOMAIN,
      revision: snapshot.catalogue.revision,
      plan,
      recordType: query.recordType,
      stages: [...readableStages].sort(),
      first,
    })
  );
  let position = decodeCursor(query.after, scope, environment.cursorSecret);
  const nodes: RecordModel[] = [];
  const seen = new Set<string>();
  let consumed = 0;
  let end: GridPosition | undefined;
  for (let batch = 0; batch < GRID_LIMITS.candidates / GRID_LIMITS.batchSize; batch++) {
    context.consumeUnits(1);
    if (Date.now() >= context.deadline) gridError('QUERY_TIMEOUT', 'Collection query timed out.');
    let page;
    try {
      page = await environment.execute({
        caller: context.caller,
        contracts,
        query,
        after: position,
        deadline: context.deadline,
      });
    } catch (error) {
      if (
        error instanceof GraphQLError &&
        ['COLLECTION_LIMIT', 'QUERY_TIMEOUT'].includes(String(error.extensions.code))
      )
        throw error;
      return gridError('STORAGE_UNAVAILABLE', 'Record storage could not complete this bounded page.');
    }
    if (!Array.isArray(page.candidates) || page.candidates.length > GRID_LIMITS.batchSize)
      gridError('STORAGE_UNAVAILABLE', 'Record storage returned an invalid page.');
    for (const candidate of page.candidates) {
      context.consumeUnits(1);
      consumed++;
      if (consumed > GRID_LIMITS.candidates)
        gridError('COLLECTION_LIMIT', 'Collection could not be completed within its work bound; narrow the query.');
      const { oid } = candidate;
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
        String(record.metaMetadata.brandId).trim() !== String(context.caller.brand.id).trim() ||
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
      end = { keys: candidate.keys };
    }
    if (page.exhausted) return { nodes, hasNextPage: false, endCursor: null };
    const last = page.candidates.at(-1);
    if (!last || JSON.stringify(last.keys) === JSON.stringify(position?.keys))
      gridError('STORAGE_UNAVAILABLE', 'Storage continuation did not advance.');
    position = { keys: last.keys };
  }
  return gridError('COLLECTION_LIMIT', 'Collection could not be completed within its work bound; narrow the query.');
}
