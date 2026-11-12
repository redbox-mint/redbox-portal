import { assertNamedQueryParameterSafe, NamedQueryParameterError } from '../../queries/namedQueryParameters';
import { ReportConfig } from '../../model/config/ReportConfig';
import type { Services as NamedQueries } from '../../queries/NamedQueries';
import { Services as Reports, type ReportConfigDto } from '../../queries/Reports';
import type { HarvestHistory } from '../../queries/HarvestHistory';
import type { SiemReads } from '../../queries/SiemReads';
import { AuditReadError, type RecordAuditViews } from '../../queries/RecordAuditViews';
import type { SolrReads } from '../../queries/SolrReads';
import type { RecordTypes } from '../../recordTypes';
import { UserModel } from '../../model/storage/UserModel';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { ListAPIResponse } from '../../model/ListAPIResponse';
import { IntegrationAuditParams } from '../../IntegrationAuditParams';
import { IntegrationAuditStatus } from '../../model/storage/IntegrationAuditModel';
import { normalizeSiemConfiguration } from '../../configmodels/SiemConfiguration';
import { normalizeSearchQuery } from '../../api-routes/groups/search-query';
import {
  referenceData,
  referenceErrors,
  referenceValue as singleHttpResult,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';
import type { ValidatedApiRouteRequest } from '../../api-routes/validation';
import { create as attachment } from 'content-disposition';
export interface QueryReadInput {
  readonly queries: Pick<
    NamedQueries.NamedQueryService,
    'list' | 'getSupportedCollections' | 'getNamedQueryConfig' | 'performNamedQueryFromConfig'
  >;
  readonly reports: Pick<
    Reports.Reports,
    'get' | 'getReportDto' | 'getResults' | 'getCSVResult' | 'listConfigs' | 'getConfig' | 'previewConfig'
  >;
  readonly harvest: Pick<HarvestHistory, 'listRuns' | 'getRun' | 'runExists' | 'listRunEvents'>;
  readonly siem: Pick<SiemReads, 'queryEvents' | 'getDeliveryStatus'>;
  readonly audit: Pick<
    RecordAuditViews,
    'audit' | 'permissions' | 'integrationAudit' | 'integrationStatus' | 'integrationLog'
  >;
  readonly search: Pick<SolrReads, 'searchFuzzy'>;
  readonly recordTypes: Pick<RecordTypes, 'get'>;
  readonly returnFields: string[];
  siemConfig(brandId: string): Promise<unknown>;
}
class QueryInputError extends Error {
  public readonly status = 400;
}
/** The retained adapter returns this request-level refusal before report failures. */
class QueryActorRequiredError extends Error {}
function requireQueryActor(request: ReferenceRequest) {
  const actor = request.context.actor;
  if (!actor) throw new QueryActorRequiredError();
  return actor;
}
/** Only domain-owned validation/refusal errors carry public diagnostics. */
function queryFailure(error: unknown): { status: number; message: string } {
  if (
    (error instanceof NamedQueryParameterError ||
      error instanceof QueryInputError ||
      error instanceof AuditReadError ||
      error instanceof Reports.ReportConfigServiceError) &&
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status < 500
  )
    return { status: error.status, message: error.message };
  return { status: 500, message: 'Internal server error' };
}
function integer(value: unknown, fallback: number, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined || value === '') return fallback;
  // API contract validation normalizes integer query strings before dispatch.
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value)))
    throw new QueryInputError('Invalid pagination parameter.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new QueryInputError('Invalid pagination parameter.');
  return parsed;
}
function date(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
    throw new QueryInputError('Invalid ' + field + ' parameter.');
  return new Date(value);
}

export function queryReadFailure(
  request: ReferenceRequest,
  error: unknown,
  browserReport = false,
  download = false
): ReferenceResult {
  if (error instanceof QueryActorRequiredError)
    return referenceErrors(request, 403, [{ detail: 'view-error-no-permissions' }]);
  if (browserReport) request.recordFailure?.();
  const { status, message } = queryFailure(error);
  return browserReport
    ? {
        ...referenceData(request, { status: false, message }),
        status: download && !(error instanceof NamedQueryParameterError) ? 200 : status,
      }
    : referenceErrors(request, status, [{ detail: message }]);
}
function prepare(request: ReferenceRequest, valid: ValidatedApiRouteRequest, preview = false, recordAudit = false) {
  const query = valid.query,
    body = valid.body;
  // Reject structured values before they reach query paths, dates, or report templates.
  const scalar = (name: string, fallback = '', predicate = false) => {
    // POST preview filters historically use path > body > query.
    const previewBody =
      preview && body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)[name]
        : undefined;
    const value = request.params[name] ?? previewBody ?? query[name] ?? fallback;
    if (predicate) assertNamedQueryParameterSafe(name, { type: 'string' }, value);
    if (typeof value !== 'string' || [...value].some(character => character.charCodeAt(0) < 32))
      throw new QueryInputError('Invalid parameter: ' + name);
    return value;
  };
  if (recordAudit) {
    for (const key of Object.keys(query)) scalar(key);
    integer(query.page, 1);
    integer(query.pageSize, 20);
  }
  const parameters = { param: (name: string) => scalar(name, '', true) || undefined };
  const { brand: snapshot, portal } = request.context;
  const actor = requireQueryActor(request);
  const brand = Object.assign(new BrandingModel(), snapshot);
  const user = Object.assign(new UserModel(), {
    ...actor,
    type: actor.type ?? '',
    name: actor.name ?? '',
    email: actor.email ?? '',
    roles: actor.roles.map(r => ({
      id: r.id,
      branding: Object.assign(new BrandingModel(), { id: r.brandId }),
      name: r.name ?? '',
      users: [],
    })),
  });

  return { query, body, scalar, parameters, brand, user, portal };
}

export async function listConfigs(
  input: Pick<QueryReadInput, 'reports'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { brand } = prepare(request, valid, false, false);
  let result: unknown;
  result = await input.reports.listConfigs(brand);

  return referenceData(request, result);
}

export async function getConfig(
  input: Pick<QueryReadInput, 'reports'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  browserReport = false
): Promise<ReferenceResult> {
  const { scalar, brand } = prepare(request, valid, false, false);
  let result: unknown;
  result = await input.reports.getConfig(brand, scalar('name'));
  if (!result) {
    if (browserReport)
      return { ...referenceData(request, { status: false, message: 'Report not found' }), status: 404 };
    else return referenceErrors(request, 404, [{ title: 'Report not found' }]);
  }

  return referenceData(request, result);
}

export async function previewConfig(
  input: Pick<QueryReadInput, 'reports'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { body, parameters, brand } = prepare(request, valid, true, false);
  let result: unknown;
  result = await input.reports.previewConfig(brand, body as ReportConfigDto, parameters);

  return referenceData(request, result);
}

export async function get(
  input: Pick<QueryReadInput, 'reports'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { scalar, brand } = prepare(request, valid, false, false);
  let result: unknown;

  const report = await input.reports.get(brand, scalar('name'));
  if (!report) {
    return referenceErrors(request, 404, [{ title: 'Report not found' }]);
  }
  result = input.reports.getReportDto(Object.assign(new ReportConfig(), report));

  return referenceData(request, result);
}

export async function getResults(
  input: Pick<QueryReadInput, 'reports'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { query, scalar, parameters, brand } = prepare(request, valid, false, false);
  let result: unknown;

  const start = integer(query.start, 0, 0),
    rows = integer(query.rows, 10);
  const chronicle = { addInfo: request.observe };
  chronicle?.addInfo?.({ reportName: scalar('name'), reportPagingStart: start, reportPagingRows: rows });
  try {
    const found = await input.reports.getResults(brand, scalar('name'), parameters, start, rows);
    result = found ? { ...found, success: true } : { status: false, message: null };
    if (found)
      chronicle?.addInfo?.({
        reportResultPage: {
          total: found.total,
          pageNum: found.pageNum,
          recordPerPage: found.recordsPerPage,
          recordCount: found.records?.length ?? 0,
          success: true,
        },
      });
  } catch (error) {
    if (error instanceof QueryInputError || error instanceof NamedQueryParameterError) throw error;
    request.recordFailure?.();
    result = { status: false, message: queryFailure(error).message };
  }

  return referenceData(request, result);
}

export async function downloadCSV(
  input: Pick<QueryReadInput, 'reports'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { body, scalar, parameters, brand } = prepare(request, valid, false, false);
  let result: unknown;

  request.observe?.({ reportName: scalar('name') });
  const csv = await input.reports.getCSVResult(brand, scalar('name'), parameters);
  return {
    kind: 'text',
    status: 200,
    headers: { 'Content-Disposition': attachment(scalar('name') + '.csv'), 'Content-Type': 'text/csv; charset=utf-8' },
    body: csv,
  };
}

export async function executeNamedQuery(
  input: Pick<QueryReadInput, 'queries'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { query, scalar, brand } = prepare(request, valid, false, false);
  let result: unknown;

  const config = await input.queries.getNamedQueryConfig(brand, scalar('queryName'));
  if (!config) {
    return referenceErrors(request, 400, [{ title: 'Named query not found' }]);
  }
  result = await input.queries.performNamedQueryFromConfig(
    config,
    { ...query },
    brand,
    integer(query.start, 0, 0),
    integer(query.rows, 10, 1, 100)
  );

  return referenceData(request, result);
}

export async function listQueries(
  input: Pick<QueryReadInput, 'queries'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { brand } = prepare(request, valid, false, false);
  let result: unknown;
  result = await input.queries.list(brand);

  return referenceData(request, result);
}

export async function getCollections(
  input: Pick<QueryReadInput, 'queries'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const {} = prepare(request, valid, false, false);
  let result: unknown;
  result = input.queries.getSupportedCollections();

  return referenceData(request, result);
}

export async function getQuery(
  input: Pick<QueryReadInput, 'queries'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { query, scalar, brand } = prepare(request, valid, false, false);
  let result: unknown;
  result = await input.queries.getNamedQueryConfig(brand, scalar('name'));
  if (!result) {
    return referenceErrors(request, 404, [{ detail: `Named query '${scalar('name')}' not found` }]);
  }

  return referenceData(request, result);
}

async function queryListRuns(
  input: Pick<QueryReadInput, 'harvest'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  events = false
): Promise<ReferenceResult> {
  const { query, scalar, brand } = prepare(request, valid, false, false);
  let result: unknown;

  const page = integer(query.page, 1);
  const pageSize = Math.min(integer(query.pageSize, 20), 100);
  const dateFrom = date(query.dateFrom, 'dateFrom');
  const dateTo = date(query.dateTo, 'dateTo');
  if (dateFrom && dateTo && dateFrom > dateTo) throw new QueryInputError('dateFrom must precede dateTo.');
  if (events && !(await input.harvest.runExists(brand, scalar('id')))) {
    return referenceErrors(request, 404, [{ detail: 'Harvest run not found.' }]);
  }
  const args = { ...query, page, pageSize, dateFrom, dateTo };
  const found = !events
    ? await input.harvest.listRuns(brand, args)
    : await input.harvest.listRunEvents(brand, scalar('id'), args);
  result = Object.assign(new ListAPIResponse(), {
    summary: { numFound: found.total, page, start: (page - 1) * pageSize },
    records: found.rows,
  });

  return referenceData(request, result);
}
export const listRuns = (
  input: Pick<QueryReadInput, 'harvest'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
) => queryListRuns(input, request, valid, false);
export const listRunEvents = (
  input: Pick<QueryReadInput, 'harvest'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
) => queryListRuns(input, request, valid, true);

export async function getRun(
  input: Pick<QueryReadInput, 'harvest'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { scalar, brand } = prepare(request, valid, false, false);
  let result: unknown;
  result = await input.harvest.getRun(brand, scalar('id'));
  if (!result) {
    return referenceErrors(request, 404, [{ detail: 'Harvest run not found.' }]);
  }

  return referenceData(request, result);
}

async function queryGetEvents(
  input: Pick<QueryReadInput, 'siem'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  delivery = false
): Promise<ReferenceResult> {
  const { query, scalar, brand } = prepare(request, valid, false, false);
  let result: unknown;

  const args: Record<string, unknown> = {
    brandId: brand.id,
    limit: integer(query.limit, 50, 1, 500),
    skip: integer(query.offset, 0, 0),
  };
  const fields = !delivery
    ? ['eventType', 'category', 'severity', 'deliveryState']
    : ['eventId', 'destinationId', 'status'];
  for (const field of fields) if (query[field] !== undefined) args[field] = scalar(field);
  const start = date(query.startDate, 'startDate');
  const end = date(query.endDate, 'endDate');
  if (start && end && start > end) throw new QueryInputError('startDate must precede endDate.');
  const dateField = !delivery ? 'occurredAt' : 'startedAt';
  if (start) args[dateField + 'Start'] = start.toISOString();
  if (end) args[dateField + 'End'] = end.toISOString();
  result = !delivery ? await input.siem.queryEvents(args) : await input.siem.getDeliveryStatus(args);

  return referenceData(request, result);
}
export const getEvents = (
  input: Pick<QueryReadInput, 'siem'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
) => queryGetEvents(input, request, valid, false);
export const getDeliveryStatus = (
  input: Pick<QueryReadInput, 'siem'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
) => queryGetEvents(input, request, valid, true);

export async function getAuditData(
  input: Pick<QueryReadInput, 'audit'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { query, scalar, brand, user, portal } = prepare(request, valid, false, true);
  let result: unknown;
  result = await input.audit.audit(
    brand,
    user,
    scalar('oid'),
    query,
    `/${brand.name}/${portal}/api/records/audit/${encodeURIComponent(scalar('oid'))}`
  );

  return referenceData(request, result);
}

export async function getPermissionsData(
  input: Pick<QueryReadInput, 'audit'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { scalar, brand, user } = prepare(request, valid, false, true);
  let result: unknown;
  result = await input.audit.permissions(brand, user, scalar('oid'));

  return referenceData(request, result);
}

export async function getIntegrationAuditData(
  input: Pick<QueryReadInput, 'audit'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { query, scalar, brand, user } = prepare(request, valid, false, true);
  let result: unknown;
  result = await input.audit.integrationAudit(brand, user, scalar('oid'), query);

  return referenceData(request, result);
}

export async function getIntegrationStatusData(
  input: Pick<QueryReadInput, 'audit'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { query, scalar, brand, user } = prepare(request, valid, false, true);
  let result: unknown;
  result = await input.audit.integrationStatus(brand, user, scalar('oid'), query);

  return referenceData(request, result);
}

export async function getAuditLog(
  input: Pick<QueryReadInput, 'audit'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { query, scalar, brand, user } = prepare(request, valid, false, false);
  let result: unknown;

  const params = Object.assign(new IntegrationAuditParams(), {
    oid: scalar('oid'),
    page: integer(query.page, 1),
    pageSize: integer(query.pageSize, 20),
    dateFrom: date(query.dateFrom, 'dateFrom'),
    dateTo: date(query.dateTo, 'dateTo'),
  });
  if (query.status !== undefined) {
    const status = scalar('status');
    if (!Object.values(IntegrationAuditStatus).includes(status as IntegrationAuditStatus))
      throw new QueryInputError('Invalid status parameter.');
    params.status = status as IntegrationAuditStatus;
  }
  if (params.dateFrom && params.dateTo && params.dateFrom > params.dateTo)
    throw new QueryInputError('dateFrom must precede dateTo.');
  const found = await input.audit.integrationLog(brand, user, scalar('oid'), params);
  result = Object.assign(new ListAPIResponse(), {
    summary: { numFound: found.total, page: params.page },
    records: found.rows,
  });

  return referenceData(request, result);
}

export async function search(
  input: Pick<QueryReadInput, 'recordTypes' | 'returnFields' | 'search'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { query, scalar, brand, user } = prepare(request, valid, false, false);
  let result: unknown;

  const type = scalar('type');
  const core = type
    ? (await singleHttpResult(input.recordTypes.get(brand, type)))?.searchCore
    : scalar('core', 'default');
  if (type && !core) throw new QueryInputError('Record Type provided is not valid');
  const normalized = normalizeSearchQuery(query);
  const entries = (name: string) =>
    Object.entries(normalized[name] as Record<string, unknown>).map(([name, value]) => {
      if (
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
        (value != null && typeof value !== 'string' && typeof value !== 'number')
      )
        throw new QueryInputError('Invalid search field');
      return { name, value: value as string | number | null };
    });
  result = await input.search.searchFuzzy(
    core,
    type,
    scalar('workflow'),
    scalar('searchStr'),
    entries('exactNames'),
    entries('facetNames'),
    brand,
    user,
    user.roles,
    input.returnFields
  );

  return referenceData(request, result);
}

export async function getSiemConfig(
  input: Pick<QueryReadInput, 'siemConfig'>,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { brand } = prepare(request, valid);
  return referenceData(request, normalizeSiemConfiguration((await input.siemConfig(brand.id)) ?? {}));
}
