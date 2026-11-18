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

/** Structural boundary for hooks with different drivers. Requires cursor lifetime
 * timeouts and AbortSignal support (Sails is pinned to MongoDB driver 6.21.0).
 */
export interface CollectionMongoSource {
  aggregate(
    pipeline: Document[],
    options: {
      maxTimeMS: number;
      timeoutMS: number;
      timeoutMode: 'cursorLifetime';
      signal: AbortSignal;
      allowDiskUse: boolean;
      collation: { locale: 'simple' };
    }
  ): { toArray(): Promise<Document[]>; close(): Promise<void> };
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
/** Valid elements of a stored array, each normalized exactly as a scalar of the
 * declared type. Missing, null and non-array values have no elements; invalid
 * and null elements (including nested arrays and objects) are dropped rather
 * than coerced. Elements are never flattened and the array is never truncated. */
function normalizedList(input: unknown, type: GridScalar): Document {
  return {
    $let: {
      vars: { list: input },
      in: {
        $cond: [
          { $isArray: '$$list' },
          {
            $filter: {
              input: { $map: { input: '$$list', as: 'item', in: normalizedValue('$$item', type) } },
              as: 'element',
              cond: { $ne: ['$$element', null] },
            },
          },
          [],
        ],
      },
    },
  };
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
    Object.keys(query).some(
      key => !['recordType', 'revision', 'workflowStages', 'filters', 'sort', 'first', 'after'].includes(key)
    )
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
  // These are necessary raw predicates, not replacements for scalar validation.
  // Query matching can also admit arrays; the exact normalized checks below do not.
  for (const filter of plan.filters) {
    if (filter.field !== 'record:oid') continue;
    if (filter.operation === 'eq') scope.push({ redboxOid: { $eq: filter.values[0] } });
    if (filter.operation === 'in') scope.push({ redboxOid: { $in: filter.values } });
  }
  const oidSort = plan.sort.length === 1 && plan.sort[0].field === 'record:oid';
  const used = [...new Set([...plan.filters, ...plan.sort].map(item => item.field))];
  const project: Document = { _id: 0, oid: '$redboxOid' };
  // Scalar fields project one normalized value (v). Lists project their valid
  // elements (l) for predicates, plus one scalar sort key (v) when sorted.
  const references = new Map<string, string>();
  const lists = new Map<string, string>();
  const listKeys: Document = {};
  for (const [index, id] of used.entries()) {
    const binding = snapshot.bindings.get(id) ?? gridError('UNKNOWN_FIELD', 'Field is unavailable.');
    const input =
      id === 'record:createdOn'
        ? { $ifNull: ['$metaMetadata.createdOn', '$dateCreated'] }
        : storedValue(binding.tokens);
    if (binding.cardinality === 'LIST') {
      project[`l${index}`] = normalizedList(input, binding.type);
      lists.set(id, `$l${index}`);
      const sorted = plan.sort.find(item => item.field === id);
      // ASC orders by the smallest valid element and DESC by the largest,
      // independently of filters. No valid element is null, as for scalars.
      if (sorted) listKeys[`v${index}`] = { [sorted.direction === 1 ? '$min' : '$max']: `$l${index}` };
    } else project[`v${index}`] = normalizedValue(input, binding.type);
    references.set(id, `$v${index}`);
  }
  const pipeline: Document[] = [{ $match: { $and: scope } }];
  const matches: Document[] = plan.filters.map(filter => {
    const list = lists.get(filter.field);
    const ref = list ? '$$element' : references.get(filter.field);
    const [value, to] = filter.values;
    if (filter.operation === 'exists')
      return list ? { [value ? '$gt' : '$eq']: [{ $size: list }, 0] } : { [value ? '$ne' : '$eq']: [ref, null] };
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
    // Each list predicate, including both BETWEEN bounds, is evaluated on one
    // element. Separate filters are independent and may match different elements.
    if (list) return { $anyElementTrue: [{ $map: { input: list, as: 'element', in: comparison } }] };
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
    // The initial scalar-string guard makes raw OID order/comparison identical
    // to normalization. Compound tuples still need their normalized keyset.
    if (oidSort) scope.push({ redboxOid: { [plan.sort[0].direction === 1 ? '$gt' : '$lt']: values[0] } });
    else
      matches.push({
        $or: keys.map((key, index) => ({
          $and: [
            ...keys.slice(0, index).map((previous, before) => ({ $eq: [previous, literal(values[before])] })),
            { [plan.sort[index].direction === 1 ? '$gt' : '$lt']: [key, literal(values[index])] },
          ],
        })),
      });
  }
  // Sort the raw, string-validated OID before computing metadata. This allows
  // the existing redboxOid index to supply order and continuation range bounds.
  if (oidSort) pipeline.push({ $sort: { redboxOid: plan.sort[0].direction } });
  pipeline.push({ $project: project });
  if (Object.keys(listKeys).length) pipeline.push({ $addFields: listKeys });
  if (matches.length) pipeline.push({ $match: { $expr: { $and: matches } } });
  // Sort only scalar keys: working element arrays never reach the blocking sort.
  if (lists.size) pipeline.push({ $project: Object.fromEntries([...lists.values()].map(list => [list.slice(1), 0])) });
  const oversized = keys.map(key => ({
    $cond: [{ $eq: [{ $type: key }, 'string'] }, { $gt: [{ $strLenBytes: key }, GRID_LIMITS.cursorBytes / 2] }, false],
  }));
  if (!oidSort) pipeline.push({ $sort: sort });
  pipeline.push(
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
    const timeoutMS = Math.max(1, Math.min(GRID_LIMITS.storageTimeoutMs, request.deadline - Date.now()));
    const controller = new AbortController();
    let cursor: ReturnType<CollectionMongoSource['aggregate']> | undefined;
    // Cleanup must never delay the response or cause an unhandled rejection.
    // Also close after late settlement: an adapter may finish opening its cursor
    // after cancellation was requested.
    const close = () => {
      try {
        void cursor?.close().catch(() => {});
      } catch {
        // Preserve the operation's result even if an adapter throws during close.
      }
    };
    let timer: ReturnType<typeof setTimeout>;
    let timedOut = false;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        const error = new Error('Collection query timed out.');
        reject(error);
        controller.abort(error);
      }, timeoutMS);
    });
    let results: Document[];
    try {
      cursor = this.collection.aggregate(pipeline, {
        maxTimeMS: timeoutMS,
        timeoutMS,
        timeoutMode: 'cursorLifetime',
        signal: controller.signal,
        allowDiskUse: false,
        collation: { locale: 'simple' },
      });
      const operation = cursor.toArray();
      const closeLate = () => {
        if (timedOut) close();
      };
      void operation.then(closeLate, closeLate);
      results = await Promise.race([operation, timeout]);
    } catch (error) {
      // Names/codes cross driver package boundaries; instanceof does not.
      if (
        controller.signal.aborted ||
        Date.now() >= request.deadline ||
        (isObject(error) && (error.name === 'MongoOperationTimeoutError' || error.code === 50))
      )
        gridError('QUERY_TIMEOUT', 'Collection query timed out.');
      throw error;
    } finally {
      clearTimeout(timer!);
      close();
    }
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
