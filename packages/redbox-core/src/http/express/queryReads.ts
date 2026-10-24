import { ReportConfig } from '../../model/config/ReportConfig';
import type { RequestHandler, Router } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { Services as NamedQueries } from '../../queries/NamedQueries';
import type { Services as Reports, ReportConfigDto } from '../../queries/Reports';
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
import { reportsApiRoutes, executeNamedQueryRoute } from '../../api-routes/groups/reports';
import { namedQueryApiRoutes } from '../../api-routes/groups/named-query';
import { harvestRunApiRoutes } from '../../api-routes/groups/harvest-runs';
import { siemApiRoutes } from '../../api-routes/groups/siem';
import { searchRecordsRoute } from '../../api-routes/groups/search';
import { integrationAuditApiRoutes } from '../../api-routes/groups/integration-audit';
import { normalizeSearchQuery } from '../../api-routes/groups/search-query';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { bindHttpPolicies, requestContext, resolveEffectivePolicies } from './policies';
import { httpAction, singleHttpResult } from './middleware';
import { sendApiData, sendApiErrors, validationApiVersion } from './responses';
import type { createHttpCsrf } from './csrf';

const reportReads = reportsApiRoutes.filter(
  r => r.action !== 'executeNamedQuery' && (r.method === 'get' || r.action === 'previewConfig')
);
export const queryReadRoutes = [
  executeNamedQueryRoute,
  ...reportReads,
  ...reportReads.map(r => ({ ...r, path: r.path.replace('/api/', '/admin/'), controller: 'ReportController' })),
  ...namedQueryApiRoutes.filter(r => r.method === 'get'),
  ...harvestRunApiRoutes,
  ...siemApiRoutes.filter(r => r.method === 'get'),
  searchRecordsRoute,
  ...integrationAuditApiRoutes,
  ...[
    ['/admin/getReport', 'ReportController', 'get'],
    ['/admin/getReportResults', 'ReportController', 'getResults'],
    ['/admin/downloadReportCSV', 'ReportController', 'downloadCSV'],
    ['/record/viewAudit/:oid/audit', 'RecordAuditController', 'audit'],
    ['/record/viewAudit/:oid/permissions', 'RecordAuditController', 'permissions'],
    ['/record/viewAudit/:oid/integration-audit', 'RecordAuditController', 'integrationAudit'],
    ['/record/integrationStatus/:oid', 'RecordAuditController', 'integrationStatus'],
  ].map(([path, controller, action]) => ({
    method: 'get' as const,
    path: '/:branding/:portal' + path,
    controller,
    action:
      (
        {
          audit: 'getAuditData',
          permissions: 'getPermissionsData',
          integrationAudit: 'getIntegrationAuditData',
          integrationStatus: 'getIntegrationStatusData',
        } as Record<string, string>
      )[action] ?? action,
  })),
];
export interface QueryReadHttpInput {
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
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
class QueryInputError extends Error {
  public readonly status = 400;
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
/** Routes invoke neutral read operations directly; no controller or comparison runtime is acquired. */
export function mountQueryReadRoutes(router: Router, input: QueryReadHttpInput): void {
  for (const route of queryReadRoutes) {
    const policies = bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies);
    router[route.method](
      route.path,
      ...policies,
      ...(route.method === 'post' ? [route.path.includes('/api/') ? input.csrf.apiProtect : input.csrf.protect] : []),
      httpAction(async (req, res) => {
        const browserReport = route.controller === 'ReportController';
        try {
          let query: Record<string, unknown> = req.query;
          let body: unknown = req.body;
          if ('request' in route) {
            const validated = validateApiRouteRequest(req, route as ApiRouteDefinition);
            if (!validated.valid) {
              sendApiErrors(
                req,
                res,
                400,
                validated.issues.map(issue => ({ title: issue.path, detail: issue.message })),
                validationApiVersion(req)
              );
              return;
            }
            query = validated.query;
            body = validated.body;
          }
          // Reject structured values before they reach query paths, dates, or report templates.
          const scalar = (name: string, fallback = '') => {
            const value = req.params[name] ?? query[name] ?? fallback;
            if (typeof value !== 'string' || [...value].some(character => character.charCodeAt(0) < 32))
              throw new QueryInputError('Invalid parameter: ' + name);
            return value;
          };
          if (route.controller.includes('RecordAudit')) {
            for (const key of Object.keys(query)) scalar(key);
            integer(query.page, 1);
            integer(query.pageSize, 20);
          }
          const parameters = { param: (name: string) => scalar(name) || undefined };
          const { brand: snapshot, actor, portal } = requestContext(req);
          if (!actor) {
            sendApiErrors(req, res, 403, [{ detail: 'view-error-no-permissions' }]);
            return;
          }
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
          let result: unknown;
          switch (route.action) {
            case 'listConfigs':
              result = await input.reports.listConfigs(brand);
              break;
            case 'getConfig':
              if (route.controller.includes('Siem')) {
                result = normalizeSiemConfiguration((await input.siemConfig(brand.id)) ?? {});
                break;
              }
              result = await input.reports.getConfig(brand, scalar('name'));
              if (!result) {
                if (browserReport) sendApiData(req, res, { status: false, message: 'Report not found' }, 404);
                else sendApiErrors(req, res, 404, [{ title: 'Report not found' }]);
                return;
              }
              break;
            case 'previewConfig':
              result = await input.reports.previewConfig(brand, body as ReportConfigDto, parameters);
              break;
            case 'get': {
              const report = await input.reports.get(brand, scalar('name'));
              if (!report) {
                sendApiErrors(req, res, 404, [{ title: 'Report not found' }]);
                return;
              }
              result = input.reports.getReportDto(Object.assign(new ReportConfig(), report));
              break;
            }
            case 'getResults':
              try {
                result = {
                  ...(await input.reports.getResults(
                    brand,
                    scalar('name'),
                    parameters,
                    integer(query.start, 0, 0),
                    integer(query.rows, 10)
                  )),
                  success: true,
                };
              } catch (error) {
                if (error instanceof QueryInputError) throw error;
                result = { status: false, message: error instanceof Error ? error.message : String(error) };
              }
              break;
            case 'downloadCSV': {
              const csv = await input.reports.getCSVResult(brand, scalar('name'), parameters);
              res
                .attachment(scalar('name') + '.csv')
                .type('text/csv')
                .send(csv);
              return;
            }
            case 'executeNamedQuery': {
              const config = await input.queries.getNamedQueryConfig(brand, scalar('queryName'));
              if (!config) {
                sendApiErrors(req, res, 400, [{ title: 'Named query not found' }]);
                return;
              }
              result = await input.queries.performNamedQueryFromConfig(
                config,
                { ...query },
                brand,
                integer(query.start, 0, 0),
                integer(query.rows, 10, 1, 100)
              );
              break;
            }
            case 'listQueries':
              result = await input.queries.list(brand);
              break;
            case 'getCollections':
              result = input.queries.getSupportedCollections();
              break;
            case 'getQuery':
              result = await input.queries.getNamedQueryConfig(brand, scalar('name'));
              if (!result) {
                sendApiErrors(req, res, 404, [{ detail: `Named query '${scalar('name')}' not found` }]);
                return;
              }
              break;
            case 'listRuns':
            case 'listRunEvents': {
              const page = integer(query.page, 1);
              const pageSize = Math.min(integer(query.pageSize, 20), 100);
              const dateFrom = date(query.dateFrom, 'dateFrom');
              const dateTo = date(query.dateTo, 'dateTo');
              if (dateFrom && dateTo && dateFrom > dateTo) throw new QueryInputError('dateFrom must precede dateTo.');
              if (route.action === 'listRunEvents' && !(await input.harvest.runExists(brand, scalar('id')))) {
                sendApiErrors(req, res, 404, [{ detail: 'Harvest run not found.' }]);
                return;
              }
              const args = { ...query, page, pageSize, dateFrom, dateTo };
              const found =
                route.action === 'listRuns'
                  ? await input.harvest.listRuns(brand, args)
                  : await input.harvest.listRunEvents(brand, scalar('id'), args);
              result = Object.assign(new ListAPIResponse(), {
                summary: { numFound: found.total, page, start: (page - 1) * pageSize },
                records: found.rows,
              });
              break;
            }
            case 'getRun':
              result = await input.harvest.getRun(brand, scalar('id'));
              if (!result) {
                sendApiErrors(req, res, 404, [{ detail: 'Harvest run not found.' }]);
                return;
              }
              break;
            case 'getEvents':
            case 'getDeliveryStatus': {
              const args: Record<string, unknown> = {
                brandId: brand.id,
                limit: integer(query.limit, 50, 1, 500),
                skip: integer(query.offset, 0, 0),
              };
              const fields =
                route.action === 'getEvents'
                  ? ['eventType', 'category', 'severity', 'deliveryState']
                  : ['eventId', 'destinationId', 'status'];
              for (const field of fields) if (query[field] !== undefined) args[field] = scalar(field);
              const start = date(query.startDate, 'startDate');
              const end = date(query.endDate, 'endDate');
              if (start && end && start > end) throw new QueryInputError('startDate must precede endDate.');
              const dateField = route.action === 'getEvents' ? 'occurredAt' : 'startedAt';
              if (start) args[dateField + 'Start'] = start.toISOString();
              if (end) args[dateField + 'End'] = end.toISOString();
              result =
                route.action === 'getEvents'
                  ? await input.siem.queryEvents(args)
                  : await input.siem.getDeliveryStatus(args);
              break;
            }
            case 'getAuditData':
              result = await input.audit.audit(
                brand,
                user,
                scalar('oid'),
                query,
                `/${brand.name}/${portal}/api/records/audit/${encodeURIComponent(scalar('oid'))}`
              );
              break;
            case 'getPermissionsData':
              result = await input.audit.permissions(brand, user, scalar('oid'));
              break;
            case 'getIntegrationAuditData':
              result = await input.audit.integrationAudit(brand, user, scalar('oid'), query);
              break;
            case 'getIntegrationStatusData':
              result = await input.audit.integrationStatus(brand, user, scalar('oid'), query);
              break;
            case 'getAuditLog': {
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
              break;
            }
            case 'search': {
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
              break;
            }
            default:
              throw new Error('Unbound query read: ' + route.action);
          }
          // The SIEM controller shares getConfig's name with report configuration.
          sendApiData(req, res, result);
        } catch (error) {
          const status =
            error instanceof AuditReadError
              ? error.status
              : error && typeof error === 'object' && typeof Reflect.get(error, 'status') === 'number'
                ? Number(Reflect.get(error, 'status'))
                : 500;
          const message = error instanceof Error ? error.message : String(error);
          if (browserReport)
            sendApiData(req, res, { status: false, message }, route.action === 'downloadCSV' ? 200 : status);
          else sendApiErrors(req, res, status, [{ detail: message }]);
        }
      })
    );
  }
}
