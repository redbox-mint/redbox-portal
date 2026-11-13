import { preparePageRendering, renderPageShell, type PageRenderingInput } from '../../pages/rendering';
import { recordServiceChronicle } from '../../utilities/serviceChronicle';
import type { Router, RequestHandler, Request, Response } from 'express';
import type { Forms } from '../../forms/Forms';
import type { RecordTypes } from '../../recordTypes';
import type { Services as Dashboards } from '../../dashboards/DashboardTypes';
import type { Services as Reports } from '../../queries/Reports';
import type { RecordModel } from '../../model/storage/RecordModel';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { hasViewAccess, hasEditAccess } from '../../records/access';
import type { createHttpCsrf } from './csrf';
import type { PoliciesConfig } from '../../config/policies.config';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction, singleHttpResult } from './middleware';

const definitions = [
  ['/home', 'RenderViewController', 'render', 'homepage', 'welcome-title', 'public'],
  ['/user/login', 'UserController', 'login', 'user/login', '', 'public'],
  ['/researcher/home', 'RenderViewController', 'render', 'researcher/home', 'welcome-title'],
  ['/record/search', 'RenderViewController', 'render', 'record/search', 'record-search-heading'],
  ['/availableServicesList', 'RenderViewController', 'render', 'availableServicesList', 'List of available services'],
  ['/getAdvice', 'RenderViewController', 'render', 'getAdvice', 'Get advice'],
  ['/user/profile', 'UserController', 'profile', 'user/profile'],
  ['/admin', 'RenderViewController', 'render', 'admin/home'],
  ['/admin/harvest-runs', 'AdminController', 'harvestRunsIndex', 'admin/harvest-runs'],
  ['/admin/roles', 'AdminController', 'rolesIndex', 'admin/roles'],
  ['/admin/siem', 'RenderViewController', 'render', 'admin/siem', 'menu-siemconfiguration'],
  ['/admin/translation', 'RenderViewController', 'render', 'admin/translation'],
  ['/admin/users', 'AdminController', 'usersIndex', 'admin/users'],
  ['/admin/api-docs', 'RenderViewController', 'render', 'admin/api-docs'],
  ['/admin/branding', 'RenderViewController', 'render', 'admin/branding'],
  ['/admin/dashboard-config', 'DashboardConfigController', 'editor', 'admin/dashboard-config'],
  ['/admin/deletedRecords', 'RecordController', 'renderDeletedRecords', 'admin/deletedRecords'],
  ['/admin/export', 'ExportController', 'index', 'export/index'],
  [
    '/admin/integrations/figshare/vocabularies',
    'RenderViewController',
    'render',
    'admin/integrations/figshare/vocabularies',
    'figshare-vocab-title',
  ],
  ['/admin/named-query', 'NamedQueryController', 'editor', 'admin/named-query'],
  ['/admin/report/:name', 'ReportController', 'render', 'admin/report'],
  ['/admin/reports', 'ReportsController', 'render', 'admin/reports'],
  ['/admin/vocabulary/manager', 'VocabularyController', 'manager', 'admin/vocabulary'],
  ['/admin/appconfig/edit/:appConfigId', 'AppConfigController', 'editAppConfig', 'admin/appconfig'],
  ['/export', 'ExportController', 'index', 'export/index'],
  ['/record/:recordType/edit', 'RecordController', 'edit', 'record/edit'],
  ['/record/edit/:oid', 'RecordController', 'edit', 'record/edit'],
  ['/record/finalise/:recordType/edit/:oid', 'RecordController', 'edit', 'record/edit'],
  ['/record/view/:oid', 'RecordController', 'view', 'record/view'],
  ['/record/view-orig/:oid', 'RecordController', 'view', 'record/view-orig'],
  ['/record/viewAudit/:oid', 'RecordAuditController', 'render', 'record/viewAudit'],
  // This literal must precede the parameterized dashboard URL.
  ['/dashboard/consolidated', 'RecordController', 'redirectLegacyConsolidatedDashboard', 'dashboard'],
  ['/dashboard-view/:dashboardView', 'RecordController', 'renderDashboardView', 'dashboard'],
  ['/dashboard/:recordType', 'RecordController', 'render', 'dashboard'],
] as const;
const allPaths = new Set([
  '/home',
  '/researcher/home',
  '/record/search',
  '/availableServicesList',
  '/getAdvice',
  '/user/profile',
  '/admin',
  '/admin/harvest-runs',
  '/admin/roles',
  '/admin/siem',
  '/admin/translation',
  '/admin/users',
  '/record/view/:oid',
  '/record/view-orig/:oid',
]);
export const pageRoutes = definitions.map(([path, controller, action, view, title, access]) => ({
  method: allPaths.has(path) ? ('all' as const) : ('get' as const),
  path: '/:branding/:portal' + path,
  controller,
  action,
  view,
  title,
  access,
}));
export interface PagesHttpInput extends PageRenderingInput {
  csrf: Pick<ReturnType<typeof createHttpCsrf>, 'generateToken' | 'protect'>;
  policies: Readonly<Record<string, RequestHandler>>;
  policyConfiguration: PoliciesConfig;
  forms: Pick<Forms, 'getFormByStartingWorkflowStep' | 'getFormByName'>;
  recordTypes: Pick<RecordTypes, 'get'>;
  dashboards: Pick<Dashboards.DashboardTypes, 'getDashboardView' | 'getRecordTypeDashboardConfig'>;
  reports: Pick<Reports.Reports, 'findAllReportsForBrand'>;
  loadRecord(oid: string): Promise<RecordModel | null>;
  /** Current create permission, resolved from the selected form/workflow operation. */
  canCreate(context: ReturnType<typeof requestContext>, recordType: string): Promise<boolean>;
  configModel(key: string): Promise<{ title: string } | undefined>;
}

export const pageRootRoute = { method: 'all' as const, path: '/' };
export function mountPageRoot(router: Router, rootContext: string, target: string): void {
  if (!/^\/[A-Za-z0-9_/-]+$/.test(target) || target.startsWith('//') || target.includes('..'))
    throw new TypeError('Page root requires a local deployment redirect.');
  router.all(pageRootRoute.path, (_req, res) =>
    res
      .set({ 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache', Expires: '0' })
      .redirect(rootContext + target)
  );
}

export function mountPageRoutes(router: Router, input: PagesHttpInput): void {
  const bindings = pageRoutes.map(route => {
    const mandatory = [
      'nocache',
      'brandingandportal',
      'browseractor',
      ...(route.access === 'public' ? [] : ['browserauthenticated', 'brandactor']),
      'checkauth',
    ];
    return {
      route,
      policies: bindHttpPolicies(
        [...new Set([...mandatory, ...resolveEffectivePolicies(route, input.policyConfiguration)])],
        input.policies
      ),
    };
  });
  for (const { route, policies } of bindings)
    router[route.method](
      route.path,
      ...policies,
      (req, res, next) =>
        ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : input.csrf.protect(req, res, next),
      httpAction(async (req, res) => {
        const context = requestContext(req),
          { brand, actor } = context;
        if (actor && !actor.roles.some(role => role.brandId === brand.id)) {
          res.status(403).end();
          return;
        }
        if (Object.values(req.query).some(value => typeof value !== 'string')) {
          res.status(400).end();
          return;
        }
        const selectedOid = req.params.oid ?? (route.action === 'edit' ? req.query.oid : undefined);
        const oid = typeof selectedOid === 'string' ? selectedOid.trim() : undefined;
        if (req.params.oid !== undefined && !oid) {
          res.status(400).end();
          return;
        }
        const page = await preparePage(req, res, input);
        const { locals, t, error } = page;
        if (route.action === 'edit') locals.oid = oid ?? '';
        try {
          const view: string =
            route.action === 'login'
              ? (input.loginView ?? route.view)
              : route.view === 'record/view-orig' && !input.artifacts.view(route.view, brand.name!, context.portal)
                ? 'record/view'
                : route.view;
          let title = route.title ? t(route.title) : '';
          const modelBrand = Object.assign(new BrandingModel(), brand);
          if (route.action === 'redirectLegacyConsolidatedDashboard') {
            res.redirect(locals.page.base + '/dashboard-view/consolidated');
            return;
          }
          if (oid) {
            const record = await input.loadRecord(oid!);
            if (!record || record.metaMetadata?.brandId !== brand.id) {
              error(404);
              return;
            }
            const roles = actor!.roles.map(r => ({ id: r.id, name: r.name, branding: { id: r.brandId } }));
            const user = { ...actor, roles };
            if (!(route.action === 'edit' ? hasEditAccess : hasViewAccess)(modelBrand, user, roles, record)) {
              error(403);
              return;
            }
            locals.recordType = String(record.metaMetadata.type ?? '');
            title =
              String(record.metadata?.title ?? '').trim() ||
              (locals.recordType ? t(locals.recordType + '-title-label') : oid!);
            if (route.action === 'edit') {
              locals.formName = route.path.includes('/finalise/') ? 'default-1.0-draft' : '';
              if (
                !(await singleHttpResult(
                  input.forms.getFormByName(locals.formName || record.metaMetadata.form, true, brand.id)
                ))
              ) {
                error(404);
                return;
              }
            }
          } else if (route.action === 'edit') {
            if (!(await input.canCreate(context, locals.recordType))) {
              error(403);
              return;
            }
            if (
              !(await singleHttpResult(input.forms.getFormByStartingWorkflowStep(modelBrand, locals.recordType, true)))
            ) {
              error(404);
              return;
            }
            title = 'Create ' + t(locals.recordType + '-title-label');
          }
          if (route.action === 'renderDashboardView') {
            const definition = input.dashboards.getDashboardView(String(req.params.dashboardView));
            if (
              !definition?.name ||
              !definition.titleLabelKey ||
              !definition.dashboardType ||
              !definition.sourceRecordType ||
              !definition.steps?.length ||
              definition.steps.some(
                step =>
                  !step.name ||
                  !step.sourceRecordType ||
                  !['allForRecordType', 'workflowStage'].includes(step.fetchMode)
              )
            ) {
              error(404);
              return;
            }
            Object.assign(locals, {
              dashboardView: definition.name,
              recordType: definition.sourceRecordType,
              dashboardType: definition.dashboardType,
              packageType: '',
              titleLabel: t(definition.titleLabelKey || definition.name),
              showAdminSideBar: definition.showAdminSideBar === true,
            });
            title = String(locals.titleLabel);
          } else if (route.view === 'dashboard') {
            const config = await input.dashboards.getRecordTypeDashboardConfig(modelBrand, locals.recordType);
            Object.assign(locals, {
              packageType: req.query.packageType ?? (locals.recordType === 'workspace' ? 'workspace' : ''),
              dashboardType: locals.recordType === 'workspace' ? 'workspace' : (req.query.dashboardType ?? 'standard'),
              dashboardView: '',
              showAdminSideBar: config?.showAdminSideBar === true,
              titleLabel: req.query.titleLabel
                ? t(String(req.query.titleLabel))
                : t('edit-dashboard') + ' ' + t(locals.recordType + '-title-label'),
            });
            title = String(locals.titleLabel);
          }
          if (route.action === 'editAppConfig') {
            const model = await input.configModel(String(req.params.appConfigId));
            if (!model) {
              error(404);
              return;
            }
            Object.assign(locals, { configKey: req.params.appConfigId, formTitle: model.title });
          }
          if (route.controller === 'ReportsController')
            locals.reports = await singleHttpResult(input.reports.findAllReportsForBrand(modelBrand));
          const result = renderPageShell(page, view, title, route.view === 'admin/api-docs');
          res.set(result.headers).send(result.body);
        } catch (failure) {
          recordServiceChronicle(
            input.log,
            {
              pageController: route.controller,
              pageAction: route.action,
              pageView: route.view,
              pageFailureCategory:
                failure instanceof SyntaxError
                  ? 'syntax'
                  : failure instanceof TypeError
                    ? 'type'
                    : 'backend-or-template',
            },
            [new Error('Page rendering failed')]
          );
          error(500);
        }
      })
    );
}

/** Express transport boundary for the shared page renderer. */
export async function preparePage(req: Request, res: Response, input: PagesHttpInput) {
  const page = await preparePageRendering(
    {
      context: requestContext(req),
      params: req.params,
      query: req.query,
      body: req.body,
      session: req.session as unknown as Record<string, unknown>,
      url: req.url,
      originalUrl: req.originalUrl,
      path: req.path,
      csrfToken: () => input.csrf.generateToken(req),
      acceptsHtml: () => req.accepts(['html', 'json']) === 'html',
    },
    input,
    headers => res.set(headers)
  );
  return {
    ...page,
    error(status: 403 | 404 | 500, data?: { message: string; detailedMessage: string }): void {
      if (res.headersSent || res.writableEnded) {
        res.destroy();
        return;
      }
      const result = page.error(status, data);
      res.status(result.status).set(result.headers);
      if (result.body === undefined) res.json();
      else res.type(result.headers['Content-Type'].split(';')[0]).send(result.body);
    },
  };
}

/** Mount after dynamic and static delivery so only unmatched branded pages reach it. */
export function mountPageNotFound(router: Router, input: PagesHttpInput): void {
  router.all(
    '/:branding/:portal{/*pageNotFound}',
    // Leave OPTIONS to Express's accumulated method response before page policies
    // or rendering can turn an otherwise matched API path into a 404/redirect.
    (req, _res, next) => next(req.method === 'OPTIONS' ? 'route' : undefined),
    ...bindHttpPolicies(['nocache', 'brandingandportal', 'browseractor', 'checkauth'], input.policies),
    (req, res, next) => (['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : input.csrf.protect(req, res, next)),
    httpAction(async (req, res) => {
      const { brand, actor } = requestContext(req);
      if (actor && !actor.roles.some(role => role.brandId === brand.id)) {
        res.status(403).end();
        return;
      }
      if (Object.values(req.query).some(value => typeof value !== 'string')) {
        res.status(400).end();
        return;
      }
      (await preparePage(req, res, input)).error(404);
    })
  );
}

/** Authentication callbacks use the same branded, CSP-protected error artifacts as pages. */
export async function sendPageAuthenticationFailure(
  req: Request,
  res: Response,
  input: PagesHttpInput,
  reason: 'authorized-email-denied' | 'authentication-rejected'
): Promise<void> {
  (await preparePage(req, res, input)).error(403, {
    message: 'error-auth',
    detailedMessage:
      reason === 'authorized-email-denied'
        ? reason
        : 'There was an issue with your user credentials, please try again.',
  });
}
