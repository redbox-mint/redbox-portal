import type { GraphqlNamedQueryResult } from '@researchdatabox/sails-ng-common';
import type { BrandingModel } from '../../model/storage/BrandingModel';
import type { ReadCaller } from '../../record-graphql/read-record';
import { QUERY_LIMITS } from '../../record-graphql/schema';
import {
  boundedJsonBytes,
  NamedQueryAssistanceError,
  NamedQueryExecutionBudget,
} from '../../utilities/NamedQueryPreview';
import { GraphqlNamedQueryInputError } from './graphql-input';
import {
  bindGraphqlNamedQuery,
  graphqlPath,
  inspectGraphqlNamedQuery,
  GraphqlNamedQueryValidationError,
} from './graphql-validation';

export const GRAPHQL_NAMED_QUERY_ROWS = 25;
export type GraphqlNamedQueryRecord = Record<string, unknown>;

/** Only safe categories leave this boundary; never reflect engine errors or values. */
export class GraphqlNamedQueryExecutionError extends Error {
  constructor(
    readonly code: string,
    readonly status = 422
  ) {
    super('GraphQL named query could not be executed.');
  }
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function completeGraphqlCaller(caller: ReadCaller | undefined, brand: BrandingModel): caller is ReadCaller {
  return !!(
    brand?.id &&
    brand.name &&
    caller?.brand?.id &&
    caller.brand.name === brand.name &&
    String(caller.brand.id) === String(brand.id) &&
    typeof caller.portal === 'string' &&
    caller.portal.trim() &&
    object(caller.user) &&
    typeof caller.user.username === 'string' &&
    caller.user.username.trim() &&
    Array.isArray(caller.roles) &&
    caller.roles.every(object)
  );
}

/** Build only from policy-populated request state, never query/body/definition fields. */
export function namedQueryRequestCaller(req: Sails.Req, brand: BrandingModel): ReadCaller | undefined {
  const user = req.user;
  if (
    typeof req.isAuthenticated !== 'function' ||
    !req.isAuthenticated() ||
    typeof req.session.portal !== 'string' ||
    !object(user) ||
    !Array.isArray(user.roles) ||
    !user.roles.every(object)
  )
    return;
  const caller = { brand, portal: req.session.portal, user, roles: user.roles };
  return completeGraphqlCaller(caller, brand) ? caller : undefined;
}

export async function executeGraphqlNamedQuery(
  definition: unknown,
  parameters: Record<string, unknown>,
  brand: BrandingModel,
  start: number | undefined,
  rows: number | undefined,
  caller?: ReadCaller,
  budget = new NamedQueryExecutionBudget(QUERY_LIMITS.timeoutMs),
  transport = true,
  continuation?: { after: string | null; cursor: (value: string | null) => void }
): Promise<GraphqlNamedQueryResult<GraphqlNamedQueryRecord>> {
  if (!completeGraphqlCaller(caller, brand)) throw new GraphqlNamedQueryExecutionError('GRAPHQL_CONTEXT_REQUIRED', 401);
  // No offset traversal, fractional bounds or operation-default cursors are allowed.
  if (start !== undefined && start !== 0) throw new GraphqlNamedQueryExecutionError('GRAPHQL_OFFSET_UNSUPPORTED', 400);
  if (rows !== undefined && (!Number.isSafeInteger(rows) || rows < 1))
    throw new GraphqlNamedQueryExecutionError('GRAPHQL_PAGE_INVALID', 400);
  let first = rows === undefined ? GRAPHQL_NAMED_QUERY_ROWS : Math.min(rows, GRAPHQL_NAMED_QUERY_ROWS);
  // Public service callers can carry established transport controls in paramMap.
  // They cannot bypass offset/row checks by disagreeing with positional arguments.
  for (const key of ['start', 'rows'] as const) {
    if (!transport || !parameters || !Object.hasOwn(parameters, key)) continue;
    const raw = parameters[key];
    const value =
      typeof raw === 'number' ? raw : typeof raw === 'string' && /^(?:0|[1-9][0-9]*)$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(value) || (key === 'start' ? value !== 0 : value < 1))
      throw new GraphqlNamedQueryExecutionError(
        key === 'start' ? 'GRAPHQL_OFFSET_UNSUPPORTED' : 'GRAPHQL_PAGE_INVALID',
        400
      );
    if (key === 'rows') first = Math.min(first, value);
  }
  try {
    const inspected = await budget.wait(inspectGraphqlNamedQuery(definition, caller, String(brand.id)));
    if (!inspected.prepared) throw new GraphqlNamedQueryValidationError(inspected.validation.diagnostics);
    const prepared = inspected.prepared;
    // Bind first so explicit preview input errors remain actionable even for a
    // valid definition that cannot yet power a first-page consumer.
    const variables = budget.run(() => bindGraphqlNamedQuery(prepared, parameters, transport));
    const config = prepared.definition.graphql;
    const page = config.lookup;
    // Reports need bounded paging, while typeahead consumers also need search and label mappings.
    const reportCompatible =
      continuation &&
      !prepared.validation.capabilities?.diagnostics.some(
        item => item.code === 'LOOKUP_PAGE_REQUIRED' || item.code === 'LOOKUP_PAGE_SHAPE'
      );
    if (continuation && (!reportCompatible || !page?.endCursorPath))
      throw new GraphqlNamedQueryExecutionError('GRAPHQL_REPORT_PAGING_REQUIRED');
    if ((!prepared.validation.capabilities?.lookup && !reportCompatible) || !page)
      throw new GraphqlNamedQueryExecutionError('GRAPHQL_LOOKUP_UNSUPPORTED');
    variables[page.firstVariable] = first;
    variables[page.afterVariable] = continuation?.after ?? null;
    const body = { query: config.document, operationName: config.operationName, variables };
    if (boundedJsonBytes(body, QUERY_LIMITS.bytes) > QUERY_LIMITS.bytes)
      throw new GraphqlNamedQueryExecutionError('QUERY_LIMIT', 413);
    const response = await budget.wait(RecordGraphqlService.execute(caller, body, Date.now() + budget.remaining()));
    budget.remaining();
    // Yoga may return HTTP200 with errors and partial data. None is a success here.
    if (
      !Number.isInteger(response.status) ||
      response.status < 200 ||
      response.status >= 300 ||
      !object(response.data) ||
      Object.hasOwn(response.data, 'errors')
    ) {
      const errors = response.data?.errors;
      const code =
        Array.isArray(errors) && object(errors[0]) && object(errors[0].extensions)
          ? errors[0].extensions.code
          : undefined;
      if (response.status === 503 && (code === 'GRAPHQL_DISABLED' || code === 'UNAVAILABLE'))
        throw new GraphqlNamedQueryExecutionError(code, 503);
      const safe =
        typeof code === 'string' && ['QUERY_LIMIT', 'QUERY_TIMEOUT', 'COLLECTION_LIMIT'].includes(code)
          ? code
          : 'GRAPHQL_EXECUTION_FAILED';
      throw new GraphqlNamedQueryExecutionError(
        safe,
        safe === 'QUERY_TIMEOUT' ? 503 : safe === 'QUERY_LIMIT' ? 413 : 422
      );
    }
    if (boundedJsonBytes(response.data, QUERY_LIMITS.responseBytes) > QUERY_LIMITS.responseBytes)
      throw new GraphqlNamedQueryExecutionError('QUERY_LIMIT', 413);
    const data = response.data.data;
    const list = graphqlPath(data, config.resultPath);
    const hasNextPage = graphqlPath(data, page.hasNextPagePath);
    if (
      !Array.isArray(list) ||
      list.length > first ||
      typeof hasNextPage !== 'boolean' ||
      (hasNextPage && list.length !== first)
    )
      throw new GraphqlNamedQueryExecutionError('GRAPHQL_RESULT_INVALID');
    if (page.endCursorPath) {
      const cursor = graphqlPath(data, page.endCursorPath);
      if (hasNextPage ? typeof cursor !== 'string' || !cursor : cursor !== null)
        throw new GraphqlNamedQueryExecutionError('GRAPHQL_RESULT_INVALID');
    }
    if (continuation) {
      if (!page.endCursorPath) throw new GraphqlNamedQueryExecutionError('GRAPHQL_REPORT_PAGING_REQUIRED');
      continuation.cursor(graphqlPath(data, page.endCursorPath) as string | null);
    }
    const records = list.map(item => {
      if (!object(item)) throw new GraphqlNamedQueryExecutionError('GRAPHQL_ROW_INVALID');
      const mapped: Record<string, unknown> = {};
      for (const [target, path] of Object.entries(config.mappings ?? {})) {
        const value = graphqlPath(item, path);
        if (value !== undefined) mapped[target] = value;
      }
      if (continuation) return mapped;
      const oid = mapped.oid;
      if (
        !((typeof oid === 'string' && oid.trim()) || (typeof oid === 'number' && Number.isSafeInteger(oid))) ||
        typeof mapped.title !== 'string' ||
        !mapped.title.trim()
      )
        throw new GraphqlNamedQueryExecutionError('GRAPHQL_ROW_INVALID');
      const record: GraphqlNamedQueryRecord = { oid: String(oid), title: mapped.title };
      for (const key of ['metadata', 'dateCreated', 'lastSaveDate'] as const)
        if (Object.hasOwn(mapped, key)) record[key] = mapped[key];
      return record;
    });
    const result: GraphqlNamedQueryResult<GraphqlNamedQueryRecord> = {
      source: 'graphql',
      records,
      summary: { numFound: null, start: 0, page: 1 },
      pagination: { mode: 'firstPage', hasNextPage },
    };
    if (boundedJsonBytes(result, QUERY_LIMITS.responseBytes) > QUERY_LIMITS.responseBytes)
      throw new GraphqlNamedQueryExecutionError('QUERY_LIMIT', 413);
    budget.remaining();
    return result;
  } catch (error) {
    if (
      (error instanceof Error && 'code' in error && error.code === 'GRAPHQL_DISABLED') ||
      (error instanceof GraphqlNamedQueryValidationError &&
        error.diagnostics.some(diagnostic => diagnostic.code === 'GRAPHQL_DISABLED'))
    )
      throw new GraphqlNamedQueryExecutionError('GRAPHQL_DISABLED', 503);
    if (error instanceof NamedQueryAssistanceError && error.code === 'PREVIEW_TIMEOUT')
      throw new GraphqlNamedQueryExecutionError('QUERY_TIMEOUT', 503);
    if (
      error instanceof GraphqlNamedQueryExecutionError ||
      error instanceof GraphqlNamedQueryValidationError ||
      error instanceof GraphqlNamedQueryInputError
    )
      throw error;
    throw new GraphqlNamedQueryExecutionError('GRAPHQL_EXECUTION_FAILED');
  }
}
