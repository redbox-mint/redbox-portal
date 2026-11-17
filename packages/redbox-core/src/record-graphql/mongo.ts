import type { Document } from 'mongodb';
import { recordRoleNames } from '../reporting/authorization';
import { buildCatalogue, gridError } from './catalogue';
import { queryPlan } from './collection';
import {
  GRID_LIMITS,
  type GridStorageRequest,
  type GridStoragePage,
  type GridScalar,
  type GridKey,
} from './grid-types';
import { isObject } from './renderer';

/** Minimal driver boundary also supports storage hooks using another pinned driver version. */
export interface CollectionMongoSource {
  aggregate(
    pipeline: Document[],
    options: { maxTimeMS: number; allowDiskUse: boolean; collation: { locale: 'simple' } }
  ): { toArray(): Promise<Document[]> };
}
const literal = (value: unknown): Document => ({ $literal: value });
/** Exact object keys, never Mongo's implicit traversal/flattening through stored arrays. */
function storedValue(tokens: readonly string[]): unknown {
  return tokens.reduce<unknown>(
    (input, field) => ({
      $let: {
        vars: { parent: input },
        in: {
          $cond: [
            { $eq: [{ $type: '$$parent' }, 'object'] },
            { $getField: { input: '$$parent', field: literal(field) } },
            null,
          ],
        },
      },
    }),
    '$$ROOT'
  );
}
function normalizedValue(input: unknown, type: GridScalar): Document {
  const ref = '$$value';
  let expression: Document;
  if (type === 'DATETIME') {
    // Stored calendar dates and legacy local timestamps are UTC. Numeric epochs,
    // arbitrary strings, invalid components and arrays are never coerced into dates.
    const pattern =
      '^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])(?:T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,3})?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)?)?\\z';
    const date = {
      $switch: {
        branches: [
          { case: { $eq: [{ $type: ref }, 'date'] }, then: ref },
          {
            case: { $eq: [{ $type: ref }, 'string'] },
            then: {
              $cond: [
                { $regexMatch: { input: ref, regex: pattern } },
                { $convert: { input: ref, to: 'date', onError: null, onNull: null } },
                null,
              ],
            },
          },
        ],
        default: null,
      },
    };
    expression = {
      $let: {
        vars: { date },
        in: {
          $cond: [
            {
              $and: [
                { $ne: ['$$date', null] },
                { $gte: ['$$date', new Date('0001-01-01T00:00:00Z')] },
                { $lte: ['$$date', new Date('9999-12-31T23:59:59.999Z')] },
              ],
            },
            { $convert: { input: '$$date', to: 'double', onError: null, onNull: null } },
            null,
          ],
        },
      },
    };
  } else {
    const numeric = {
      $and: [
        {
          $or: [
            { $in: [{ $type: ref }, ['double', 'int']] },
            {
              $and: [
                { $eq: [{ $type: ref }, 'long'] },
                { $gte: [ref, Number.MIN_SAFE_INTEGER] },
                { $lte: [ref, Number.MAX_SAFE_INTEGER] },
              ],
            },
          ],
        },
        { $gte: [ref, -Number.MAX_VALUE] },
        { $lte: [ref, Number.MAX_VALUE] },
      ],
    };
    const valid =
      type === 'INTEGER'
        ? {
            $cond: [
              numeric,
              {
                $and: [
                  { $gte: [ref, Number.MIN_SAFE_INTEGER] },
                  { $lte: [ref, Number.MAX_SAFE_INTEGER] },
                  { $eq: [ref, { $trunc: ref }] },
                ],
              },
              false,
            ],
          }
        : type === 'NUMBER'
          ? numeric
          : { $eq: [{ $type: ref }, type === 'BOOLEAN' ? 'bool' : 'string'] };
    expression = {
      $cond: [
        valid,
        ['NUMBER', 'INTEGER'].includes(type)
          ? { $convert: { input: ref, to: 'double', onError: null, onNull: null } }
          : ref,
        null,
      ],
    };
  }
  return { $let: { vars: { value: input }, in: expression } };
}
function permissions(request: GridStorageRequest): Document {
  const { caller } = request;
  if (
    !caller?.brand?.id ||
    typeof caller.user?.username !== 'string' ||
    !caller.user.username ||
    !Array.isArray(caller.roles) ||
    !Array.isArray(caller.brand.roles)
  )
    gridError('UNAUTHENTICATED', 'Authenticated record collection context is required.');
  const roles = caller.roles.flatMap(role => (isObject(role) && role.id != null ? [{ id: String(role.id) }] : []));
  const names = recordRoleNames(caller.brand, roles);
  // recordHasAccess resolves role names with String(value). Invert that mapping
  // for JSON scalars so Mongo numeric formatting cannot change JS name semantics.
  const roleValues = names.flatMap<string | number | boolean>(name => {
    const numeric = Number(name);
    return [
      name,
      ...(Number.isFinite(numeric) && String(numeric) === name ? [numeric] : []),
      ...(name === 'true' ? [true] : name === 'false' ? [false] : []),
    ];
  });
  const clauses = ['edit', 'view', 'editRoles', 'viewRoles'].map(name => {
    const roleGrant = name.endsWith('Roles');
    const raw = {
      $cond: [
        {
          $in: [{ $type: '$authorization' }, ['missing', 'null', 'string', 'int', 'long', 'double', 'decimal', 'bool']],
        },
        storedValue([`authorization_${name}`]),
        storedValue(['authorization', name]),
      ],
    };
    return {
      $let: {
        vars: { acl: raw },
        in: {
          $gt: [
            {
              $size: {
                $setIntersection: [
                  {
                    $filter: {
                      input: { $cond: [{ $isArray: '$$acl' }, '$$acl', [{ $ifNull: ['$$acl', null] }]] },
                      as: 'grant',
                      cond: roleGrant
                        ? {
                            $or: [
                              { $in: [{ $type: '$$grant' }, ['string', 'bool', 'int', 'double']] },
                              {
                                $and: [
                                  { $eq: [{ $type: '$$grant' }, 'long'] },
                                  { $gte: ['$$grant', Number.MIN_SAFE_INTEGER] },
                                  { $lte: ['$$grant', Number.MAX_SAFE_INTEGER] },
                                ],
                              },
                            ],
                          }
                        : { $eq: [{ $type: '$$grant' }, 'string'] },
                    },
                  },
                  literal(roleGrant ? roleValues : [caller.user.username]),
                ],
              },
            },
            0,
          ],
        },
      },
    };
  });
  // Admin and public/Guest are ordinary canonical role grants, as in hasViewAccess.
  return { $expr: { $or: clauses } };
}
/** Rebuild capabilities from trusted read contracts and revalidate the DSL for direct storage callers. */
export function compileCollectionPipeline(request: GridStorageRequest): Document[] {
  const { query, caller } = request;
  if (
    !isObject(query) ||
    Object.keys(query).some(key => !['recordType', 'workflowStages', 'filters', 'sort', 'first', 'after'].includes(key))
  )
    gridError('INVALID_SCOPE', 'Invalid collection query.');
  const auth = permissions(request);
  if (
    request.contracts.some(
      contract => contract.context.brand !== caller.brand.name || contract.context.portal !== caller.portal
    )
  )
    gridError('INVALID_SCOPE', 'Read contracts do not belong to the authenticated scope.');
  const snapshot = buildCatalogue(request.contracts, query.recordType, query.workflowStages ?? []);
  const plan = queryPlan(query, snapshot);
  if (
    query.first !== undefined &&
    (!Number.isInteger(query.first) || query.first < 1 || query.first > GRID_LIMITS.pageSize)
  )
    gridError('INVALID_PAGE_SIZE', 'Page size must be between 1 and 50.');
  const usesMetadata = [...plan.filters, ...plan.sort].some(item => item.field.startsWith('metadata:'));
  const scope: Document[] = [
    auth,
    { 'metaMetadata.brandId': String(caller.brand.id), 'metaMetadata.type': query.recordType },
    { 'workflow.stage': { $in: [...new Set(snapshot.catalogue.variants.map(variant => variant.workflowStage))] } },
    { $expr: { $eq: [{ $type: '$redboxOid' }, 'string'] } },
  ];
  if (usesMetadata)
    scope.push({
      $or: snapshot.catalogue.variants.map(variant => ({
        'workflow.stage': variant.workflowStage,
        'metaMetadata.form': variant.form,
      })),
    });
  const used = [...new Set([...plan.filters, ...plan.sort].map(item => item.field))];
  const project: Document = { _id: 0, oid: '$redboxOid' };
  const references = new Map<string, string>();
  for (const [index, id] of used.entries()) {
    const binding = snapshot.bindings.get(id) ?? gridError('UNKNOWN_FIELD', 'Field is unavailable.');
    const input =
      id === 'record:createdOn'
        ? { $ifNull: ['$metaMetadata.createdOn', '$dateCreated'] }
        : storedValue(binding.tokens);
    project[`v${index}`] = normalizedValue(input, binding.type);
    references.set(id, `$v${index}`);
  }
  const pipeline: Document[] = [{ $match: { $and: scope } }, { $project: project }];
  const matches: Document[] = plan.filters.map(filter => {
    const ref = references.get(filter.field);
    const [value, to] = filter.values;
    if (filter.operation === 'exists') return { [value ? '$ne' : '$eq']: [ref, null] };
    let comparison: Document;
    if (filter.operation === 'contains' || filter.operation === 'iprefix') {
      // ASCII-only folding in the pattern preserves non-ASCII case exactly.
      let pattern = String(value)
        .split('')
        .map(char =>
          char === '\0'
            ? '\\x00'
            : /[A-Za-z]/.test(char) && filter.operation === 'iprefix'
              ? `[${char.toLowerCase()}${char.toUpperCase()}]`
              : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        )
        .join('');
      if (filter.operation === 'iprefix') pattern = '^' + pattern;
      comparison = { $regexMatch: { input: { $ifNull: [ref, ''] }, regex: literal(pattern) } };
    } else if (filter.operation === 'in') comparison = { $in: [ref, literal(filter.values)] };
    else if (filter.operation === 'between')
      comparison = { $and: [{ $gte: [ref, literal(value)] }, { $lte: [ref, literal(to)] }] };
    else {
      const operators: Record<string, string> = { eq: '$eq', gt: '$gt', lt: '$lt' };
      comparison = { [operators[filter.operation]]: [ref, literal(value)] };
    }
    return { $and: [{ $ne: [ref, null] }, comparison] };
  });
  const sort: Document = {};
  const keys = plan.sort.map(item => references.get(item.field));
  for (const item of plan.sort) sort[references.get(item.field)!.slice(1)] = item.direction;
  if (request.after) {
    const values = request.after.keys;
    if (
      !Array.isArray(values) ||
      values.length !== keys.length ||
      values.some((value, index) => {
        const type = snapshot.bindings.get(plan.sort[index].field)!.type;
        if (value === null) return plan.sort[index].field === 'record:oid';
        if (type === 'STRING') return typeof value !== 'string' || Buffer.byteLength(value) > GRID_LIMITS.cursorBytes;
        if (type === 'BOOLEAN') return typeof value !== 'boolean';
        return (
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          (['INTEGER', 'DATETIME'].includes(type) && !Number.isSafeInteger(value))
        );
      })
    )
      gridError('INVALID_CURSOR', 'Cursor keys do not match the current sort.');
    matches.push({
      $or: keys.map((key, index) => ({
        $and: [
          ...keys.slice(0, index).map((previous, before) => ({ $eq: [previous, literal(values[before])] })),
          { [plan.sort[index].direction === 1 ? '$gt' : '$lt']: [key, literal(values[index])] },
        ],
      })),
    });
  }
  if (matches.length) pipeline.push({ $match: { $expr: { $and: matches } } });
  const oversized = keys.map(key => ({
    $cond: [{ $eq: [{ $type: key }, 'string'] }, { $gt: [{ $strLenBytes: key }, GRID_LIMITS.cursorBytes / 2] }, false],
  }));
  pipeline.push(
    { $sort: sort },
    { $limit: GRID_LIMITS.batchSize },
    {
      $project: {
        oid: { $substrCP: ['$oid', 0, 257] },
        overflow: { $or: oversized },
        keys: keys.map((key, index) => ({ $cond: [oversized[index], null, key] })),
      },
    }
  );
  return pipeline;
}
export class MongoRecordCollectionProvider {
  constructor(private readonly collection: CollectionMongoSource) {}
  async executeRecordCollection(request: GridStorageRequest): Promise<GridStoragePage> {
    if (!Number.isFinite(request.deadline) || Date.now() >= request.deadline)
      gridError('QUERY_TIMEOUT', 'Collection query timed out.');
    const pipeline = compileCollectionPipeline(request);
    if (Date.now() >= request.deadline) gridError('QUERY_TIMEOUT', 'Collection query timed out.');
    const results = await this.collection
      .aggregate(pipeline, {
        maxTimeMS: Math.max(1, Math.min(GRID_LIMITS.storageTimeoutMs, request.deadline - Date.now())),
        allowDiskUse: false,
        collation: { locale: 'simple' },
      })
      .toArray();
    if (results.length > GRID_LIMITS.batchSize || Buffer.byteLength(JSON.stringify(results)) > GRID_LIMITS.storageBytes)
      gridError('COLLECTION_LIMIT', 'Storage page exceeds its resource bound.');
    const candidates = results.map(row => {
      if (row.overflow) gridError('COLLECTION_LIMIT', 'A stored sort key exceeds the continuation bound.');
      if (
        typeof row.oid !== 'string' ||
        !row.oid ||
        row.oid.length > 256 ||
        !Array.isArray(row.keys) ||
        row.keys.some((key: unknown) => key !== null && !['string', 'number', 'boolean'].includes(typeof key))
      )
        gridError('STORAGE_UNAVAILABLE', 'Invalid stored collection key.');
      return { oid: row.oid, keys: row.keys as GridKey[] };
    });
    return { candidates, exhausted: candidates.length < GRID_LIMITS.batchSize };
  }
}
