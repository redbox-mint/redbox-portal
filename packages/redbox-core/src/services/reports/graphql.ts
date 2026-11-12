import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Kind, getOperationAST, parse, type SelectionSetNode } from 'graphql';
import type {
  GraphqlNamedQueryDefinition,
  NamedQueryDefinition,
  ReportNamedQueryDescription,
  ContextSchemaField,
} from '@researchdatabox/sails-ng-common';
import { reportDisplayTemplateFields, reportCsvTemplateFields } from '@researchdatabox/sails-ng-common';
import type { BrandingModel } from '../../model/storage/BrandingModel';
import type { ReportConfig } from '../../model/config/ReportConfig';
import type { ReadCaller } from '../../record-graphql/read-record';
import type { FormRecordAccessContext } from '../FormsService';
import { recordGraphql } from '../../config/recordGraphql.config';
import { GRID_LIMITS } from '../../record-graphql/grid-types';
import { QUERY_LIMITS } from '../../record-graphql/schema';
import {
  NamedQueryExecutionBudget,
  boundedJsonBytes,
  NamedQueryAssistanceError,
} from '../../utilities/NamedQueryPreview';
import { completeGraphqlCaller, executeGraphqlNamedQuery } from '../named-query/graphql-execution';
import { inspectGraphqlNamedQuery } from '../named-query/graphql-validation';

export class GraphqlReportError extends Error {
  constructor(
    readonly code: string,
    readonly status = 422
  ) {
    super(code);
  }
}
const DOMAIN = 'redbox-report-cursor/1';
const CURSOR_BYTES = 16384;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .flatMap(key => {
          const item = Reflect.get(value, key);
          return item === undefined ? [] : [[key, canonical(item)]];
        })
    );
  return value;
}
const digest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
/** Version execution and report bindings, excluding descriptions and source links.
 * Keep this projection in sync with execution fields added to the named-query contract.
 */
export const graphqlQueryVersion = (query: GraphqlNamedQueryDefinition & { branding?: string }): string =>
  'v2:' +
  digest({
    source: query.source,
    name: query.name,
    branding: query.branding,
    graphql: {
      document: query.graphql.document,
      operationName: query.graphql.operationName,
      variables: query.graphql.variables,
      resultPath: query.graphql.resultPath,
      mappings: query.graphql.mappings,
      lookup: query.graphql.lookup,
    },
  });
/** Pre-v2 reports remain bound to the exact full definition they reviewed. */
export function graphqlQueryVersionMatches(
  query: GraphqlNamedQueryDefinition & { branding?: string },
  version: string | undefined
): boolean {
  return version === graphqlQueryVersion(query) || version === digest(query);
}
export function assertReportQueryVersion(
  report: { databaseQuery?: { queryVersion?: string } | null },
  query: NamedQueryDefinition & { branding?: string }
): void {
  if (query.source !== 'graphql' || !graphqlQueryVersionMatches(query, report.databaseQuery?.queryVersion))
    throw new GraphqlReportError('REPORT_QUERY_CHANGED', 409);
}
export function graphqlReportLimits() {
  const limits = sails.config.recordGraphql?.reportExport ?? recordGraphql.reportExport!;
  const ceilings = { maxRows: 100000, maxPages: 4000, timeoutMs: 120000, maxBytes: 67108864 };
  for (const key of Object.keys(ceilings) as Array<keyof typeof ceilings>)
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > ceilings[key])
      throw new GraphqlReportError('REPORT_LIMIT_CONFIG_INVALID', 503);
  return limits;
}
function key(): Buffer {
  const secret = sails.config.recordGraphql?.cursorSecret;
  if (typeof secret !== 'string' || secret.length < 32) throw new GraphqlReportError('REPORT_CURSOR_UNAVAILABLE', 503);
  return createHash('sha256').update(DOMAIN).update('\0').update(secret).digest();
}
function encode(after: string, start: number, scope: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(DOMAIN));
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify({ after, start, scope, expires: Date.now() + GRID_LIMITS.cursorAgeMs })),
    cipher.final(),
  ]);
  const token = Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64url');
  if (token.length > CURSOR_BYTES) throw new GraphqlReportError('REPORT_CURSOR_INVALID', 400);
  return token;
}
function decode(value: unknown, scope: string): { after: string | null; start: number } {
  if (value === undefined || value === null || value === '') return { after: null, start: 0 };
  const cursorKey = key();
  try {
    if (typeof value !== 'string' || value.length > CURSOR_BYTES || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error();
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length < 29 || bytes.toString('base64url') !== value) throw Error();
    const decipher = createDecipheriv('aes-256-gcm', cursorKey, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(DOMAIN));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const token: unknown = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString()
    );
    if (
      !token ||
      typeof token !== 'object' ||
      Reflect.get(token, 'scope') !== scope ||
      typeof Reflect.get(token, 'expires') !== 'number' ||
      Reflect.get(token, 'expires') <= Date.now() ||
      typeof Reflect.get(token, 'after') !== 'string' ||
      !Reflect.get(token, 'after') ||
      Reflect.get(token, 'after').length > GRID_LIMITS.cursorBytes ||
      !Number.isSafeInteger(Reflect.get(token, 'start')) ||
      Reflect.get(token, 'start') < 1
    )
      throw Error();
    return { after: Reflect.get(token, 'after'), start: Reflect.get(token, 'start') };
  } catch {
    throw new GraphqlReportError('REPORT_CURSOR_INVALID', 400);
  }
}
function callerRequired(brand: BrandingModel, caller?: ReadCaller): asserts caller is ReadCaller {
  if (!completeGraphqlCaller(caller, brand)) throw new GraphqlReportError('GRAPHQL_CONTEXT_REQUIRED', 401);
}
/** Adapt server-owned collection controls without changing the saved definition or
 * requiring an unrelated lookup search binding. Schema validation remains mandatory. */
export function reportExecutionQuery(query: GraphqlNamedQueryDefinition): GraphqlNamedQueryDefinition {
  if (query.graphql.lookup?.endCursorPath) return query;
  const ast = parse(query.graphql.document, { maxTokens: QUERY_LIMITS.tokens });
  const operation = getOperationAST(ast, query.graphql.operationName);
  const fragments = new Map(
    ast.definitions.flatMap(node =>
      node.kind === Kind.FRAGMENT_DEFINITION ? [[node.name.value, node.selectionSet] as const] : []
    )
  );
  let work = 0;
  const fields = (
    set: SelectionSetNode,
    seen = new Set<string>()
  ): Array<Extract<SelectionSetNode['selections'][number], { kind: 'Field' }>> =>
    set.selections.flatMap(node => {
      if (++work > 2000) throw new GraphqlReportError('GRAPHQL_REPORT_PAGING_REQUIRED');
      if (node.kind === Kind.FIELD) return [node];
      if (node.kind === Kind.INLINE_FRAGMENT) return fields(node.selectionSet, seen);
      const fragment = fragments.get(node.name.value);
      return fragment && !seen.has(node.name.value) ? fields(fragment, new Set([...seen, node.name.value])) : [];
    });
  const collection =
    operation &&
    fields(operation.selectionSet).find(
      node => (node.alias?.value ?? node.name.value) === query.graphql.resultPath[0] && node.name.value === 'records'
    );
  const selected = collection?.selectionSet ? fields(collection.selectionSet) : [];
  const first = collection?.arguments?.find(arg => arg.name.value === 'first')?.value;
  const after = collection?.arguments?.find(arg => arg.name.value === 'after')?.value;
  const hasNext = selected.find(node => node.name.value === 'hasNextPage');
  const end = selected.find(node => node.name.value === 'endCursor');
  if (
    query.graphql.resultPath.length !== 2 ||
    !collection ||
    first?.kind !== Kind.VARIABLE ||
    after?.kind !== Kind.VARIABLE ||
    !hasNext ||
    !end
  )
    throw new GraphqlReportError('GRAPHQL_REPORT_PAGING_REQUIRED');
  const adapted = structuredClone(query);
  delete adapted.graphql.variables[first.name.value];
  delete adapted.graphql.variables[after.name.value];
  const collectionPath = [collection.alias?.value ?? collection.name.value];
  adapted.graphql.lookup = {
    mode: 'firstPage',
    collectionPath,
    firstVariable: first.name.value,
    afterVariable: after.name.value,
    hasNextPagePath: [...collectionPath, hasNext.alias?.value ?? hasNext.name.value],
    endCursorPath: [...collectionPath, end.alias?.value ?? end.name.value],
    searchParameter: '__report_search_unused',
  };
  return adapted;
}

export async function graphqlReportPage(
  brand: BrandingModel,
  report: Pick<ReportConfig, 'databaseQuery'> & { name?: string },
  query: GraphqlNamedQueryDefinition,
  parameters: Record<string, unknown>,
  token: unknown,
  rows: number,
  caller?: ReadCaller,
  budget = new NamedQueryExecutionBudget(QUERY_LIMITS.timeoutMs)
) {
  callerRequired(brand, caller);
  assertReportQueryVersion(report, query);
  if (!Number.isSafeInteger(rows) || rows < 1) throw new GraphqlReportError('REPORT_PAGE_INVALID', 400);
  const first = Math.min(rows, 25);
  // No raw query/parameters/record data enter a token's visible representation.
  const scope = digest({
    report,
    version: graphqlQueryVersion(query),
    parameters,
    first,
    brand: brand.id,
    portal: caller.portal,
    user: caller.user.username,
    id: caller.user.id,
    roles: caller.roles.map(role => canonical(role)).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    brandRoles: brand.roles,
  });
  const position = decode(token, scope);
  let endCursor: string | null = null;
  const result = await executeGraphqlNamedQuery(
    query.source === 'graphql' ? reportExecutionQuery(query) : query,
    parameters,
    brand,
    0,
    first,
    caller,
    budget,
    false,
    {
      after: position.after,
      cursor: value => {
        endCursor = value;
      },
    }
  );
  if (result.pagination.hasNextPage && (!endCursor || endCursor === position.after))
    throw new GraphqlReportError('REPORT_CURSOR_INVALID', 400);
  return {
    ...result,
    valid: true,
    diagnostics: [],
    truncated: result.pagination.hasNextPage,
    truncationReasons: result.pagination.hasNextPage ? ['rows' as const] : [],
    pagination: {
      mode: 'cursor' as const,
      start: position.start,
      hasNextPage: result.pagination.hasNextPage,
      nextCursor: endCursor ? encode(endCursor, position.start + result.records.length, scope) : null,
    },
  };
}

/** No attachment is returned until traversal and final version/deadline checks succeed. */
export async function graphqlReportCsv(
  brand: BrandingModel,
  report: ReportConfig,
  query: GraphqlNamedQueryDefinition,
  parameters: Record<string, unknown>,
  caller: ReadCaller | undefined,
  render: (records: Array<Record<string, unknown>>) => string
): Promise<string> {
  callerRequired(brand, caller);
  assertReportQueryVersion(report, query);
  const limits = graphqlReportLimits(),
    budget = new NamedQueryExecutionBudget(limits.timeoutMs);
  const records: Array<Record<string, unknown>> = [];
  const seenCursors = new Set<string>();
  let bytes = 0,
    after: string | null = null;
  const currentVersion = async () => {
    const current = await budget.wait(NamedQueryService.getNamedQueryConfig(brand, report.databaseQuery!.queryName));
    if (!current || current.source !== 'graphql' || graphqlQueryVersion(current) !== graphqlQueryVersion(query))
      throw new GraphqlReportError('REPORT_QUERY_CHANGED', 409);
  };
  try {
    for (let page = 0; page < limits.maxPages; page++) {
      budget.remaining();
      await currentVersion();
      let next: string | null = null;
      const result = await executeGraphqlNamedQuery(
        query.source === 'graphql' ? reportExecutionQuery(query) : query,
        parameters,
        brand,
        0,
        25,
        caller,
        budget,
        false,
        {
          after,
          cursor: value => {
            next = value;
          },
        }
      );
      if (records.length + result.records.length > limits.maxRows)
        throw new GraphqlReportError('REPORT_EXPORT_ROW_LIMIT', 413);
      for (const row of result.records) {
        bytes += boundedJsonBytes(row, limits.maxBytes);
        if (bytes > limits.maxBytes) throw new GraphqlReportError('REPORT_EXPORT_BYTE_LIMIT', 413);
        records.push({ ...row });
      }
      if (!result.pagination.hasNextPage) {
        await currentVersion();
        const csv = budget.run(() => render(records));
        if (Buffer.byteLength(csv) > limits.maxBytes) throw new GraphqlReportError('REPORT_EXPORT_BYTE_LIMIT', 413);
        budget.remaining();
        return csv;
      }
      if (records.length >= limits.maxRows) throw new GraphqlReportError('REPORT_EXPORT_ROW_LIMIT', 413);
      if (!next || seenCursors.has(next) || next === after) throw new GraphqlReportError('REPORT_CURSOR_INVALID', 400);
      seenCursors.add(next);
      after = next;
    }
    throw new GraphqlReportError('REPORT_EXPORT_PAGE_LIMIT', 413);
  } catch (error) {
    if (
      (error instanceof NamedQueryAssistanceError && error.code === 'PREVIEW_TIMEOUT') ||
      (error instanceof Error && 'code' in error && error.code === 'QUERY_TIMEOUT')
    )
      throw new GraphqlReportError('REPORT_EXPORT_TIMEOUT', 408);
    throw error;
  }
}

export async function describeGraphqlReport(
  brand: BrandingModel,
  portal: string,
  caller: FormRecordAccessContext,
  query: GraphqlNamedQueryDefinition,
  property = '',
  multivalue = false
): Promise<ReportNamedQueryDescription> {
  const context: ReadCaller = { brand, portal, user: caller.user, roles: caller.user.roles };
  callerRequired(brand, context);
  const adapted = reportExecutionQuery(query);
  const inspected = await inspectGraphqlNamedQuery(adapted, context, String(brand.id));
  const fields: ContextSchemaField[] = [];
  const ast = parse(query.graphql.document, { maxTokens: QUERY_LIMITS.tokens });
  const fragments = new Map(
    ast.definitions.flatMap(node => (node.kind === Kind.FRAGMENT_DEFINITION ? [[node.name.value, node] as const] : []))
  );
  let work = 0;
  function walk(set: SelectionSetNode, path: string[], names: string[], seen: Set<string>): void {
    if (++work > 2000 || path.length > QUERY_LIMITS.depth) return;
    for (const node of set.selections) {
      if (node.kind === Kind.INLINE_FRAGMENT) {
        walk(node.selectionSet, path, names, seen);
        continue;
      }
      if (node.kind === Kind.FRAGMENT_SPREAD) {
        if (!seen.has(node.name.value) && fragments.has(node.name.value))
          walk(fragments.get(node.name.value)!.selectionSet, path, names, new Set([...seen, node.name.value]));
        continue;
      }
      if (node.name.value === '__typename') continue;
      const next = [...path, node.alias?.value ?? node.name.value],
        nextNames = [...names, node.name.value];
      const relative = next.slice(query.graphql.resultPath.length);
      if (query.graphql.resultPath.every((part, i) => next[i] === part) && relative.length) {
        const mappings = query.graphql.mappings ?? {};
        for (const [target, mapping] of Object.entries(mappings) as Array<[string, string[]]>) {
          if (!mapping.every((part, i) => relative[i] === part)) continue;
          const parts = [target, ...relative.slice(mapping.length)];
          const label = node.name.value.startsWith('rb_')
            ? Buffer.from(node.name.value.slice(3), 'hex').toString('utf16le')
            : node.name.value;
          const fieldPath = parts
            .map((part, i) =>
              /^[A-Za-z_][A-Za-z0-9_]*$/.test(part) ? (i ? '.' : '') + part : '[' + JSON.stringify(part) + ']'
            )
            .join('');
          fields.push({
            path: fieldPath,
            title: label
              .replace(/([a-z])([A-Z])/g, '$1 $2')
              .replace(/[_-]+/g, ' ')
              .replace(/^./, c => c.toUpperCase()),
            type: node.selectionSet ? 'object' : 'string',
            required: false,
            isArray: false,
            source: 'runtime',
          });
        }
      }
      if (node.selectionSet) walk(node.selectionSet, next, nextNames, seen);
    }
  }
  const operation = getOperationAST(ast, query.graphql.operationName);
  if (operation) walk(operation.selectionSet, [], [], new Set());
  const result = {
    recordType: '',
    stage: '',
    precision: 'none' as const,
    completeness: 'partial' as const,
    fields: fields.filter((field, i, all) => all.findIndex(item => item.path === field.path) === i),
  };
  const paginationReady =
    !inspected.validation.capabilities?.diagnostics.some(
      item => item.code === 'LOOKUP_PAGE_REQUIRED' || item.code === 'LOOKUP_PAGE_SHAPE'
    ) && !!adapted.graphql.lookup?.endCursorPath;
  const diagnostics = [
    ...inspected.validation.diagnostics.map(item => ({ ...item, reason: 'nq-ux-diagnostic-' + item.code })),
    ...(paginationReady
      ? []
      : [
          {
            code: 'GRAPHQL_REPORT_PAGING_REQUIRED',
            field: 'databaseQuery.queryName',
            reason: 'report-graphql-paging-required',
            severity: 'error' as const,
            line: 0,
            column: 0,
          },
        ]),
  ];
  return {
    ...inspected.validation,
    source: 'graphql',
    valid: inspected.validation.valid && !!paginationReady,
    diagnostics,
    collectionName: 'record',
    name: query.name,
    queryVersion: graphqlQueryVersion(query),
    parameters: Object.entries(query.graphql.variables).flatMap(([variable, binding]) =>
      binding.ownership === 'consumer'
        ? [
            {
              key: binding.parameter,
              path: variable,
              type: binding.inputType,
              required: binding.required ?? false,
              defaultValue: binding.defaultValue,
            },
          ]
        : []
    ),
    result,
    templateContexts: {
      display: { ...result, fields: reportDisplayTemplateFields(result.fields, property, multivalue) },
      csv: { ...result, fields: reportCsvTemplateFields(result.fields, property, multivalue) },
    },
  };
}
