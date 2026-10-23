import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import { PageArtifacts } from '../../pages/Artifacts';
import { pageLocals } from '../../pages/locals';
import { pageCsp, type CspConfig } from '../../pages/csp';
import { Services as Navigation } from '../../navigation/Navigation';
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
export interface PagesHttpInput {
  artifacts: PageArtifacts;
  rootContext: string;
  origin: string;
  environment: string;
  csp: CspConfig;
  log: ILogger;
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
  settings(brand: {
    id: string;
    name?: string;
  }): Promise<
    import('../../navigation/Navigation').NavigationInput['configuration'] &
      Record<string, unknown> & { webAnalytics?: { enabled?: boolean; provider?: string; trackingId?: string } }
  >;
  languages(brand: { id: string; name?: string }): Promise<{ code: string; displayName: string }[]>;
  translate(brand: string, language: string, key: string, context?: Record<string, unknown>): string;
  typeface(brand: string): { regularUrl: string } | null;
  readonly templateConfig: Record<string, unknown> & { appmode?: Record<string, unknown> };
  readonly loginView?: string;
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
          { brand, portal, actor } = context;
        if (actor && !actor.roles.some(role => role.brandId === brand.id)) {
          res.status(403).end();
          return;
        }
        if (Object.values(req.query).some(value => typeof value !== 'string')) {
          res.status(400).end();
          return;
        }
        req.session.branding = brand.name;
        req.session.portal = portal;
        const settings = await input.settings(brand);
        const languages = await input.languages(brand);
        const language =
          ([req.query.lng, Reflect.get(req.session, 'langCode'), languages[0]?.code, 'en'].find(
            value => typeof value === 'string' && languages.some(l => l.code === value)
          ) as string) || 'en';
        Reflect.set(req.session, 'langCode', language);
        const t = (key: string, values?: Record<string, unknown>) =>
          input.translate(brand.name!, language, key, values);
        const hasRole = (name: string) =>
          actor?.roles.some(role => role.brandId === brand.id && role.name === name) === true;
        const param = (name: string) => req.params[name] ?? req.body?.[name] ?? req.query[name];
        const initialLocals = {
          branding: brand.name,
          portal,
          lang: language,
          req: {
            query: req.query,
            url: req.url,
            originalUrl: req.originalUrl,
            session: req.session,
            user: actor,
            isAuthenticated: () => !!actor,
          },
          data: {},
          ng2_apps: [],
          availableLanguages: languages,
          _csrf: input.csrf.generateToken(req),
          isAdmin: hasRole('Admin'),
          oid: req.params.oid ?? '',
          rdmp: req.query.rdmp ?? '',
          formName: '',
          recordType: String(req.params.recordType ?? ''),
        } as Record<string, unknown> & { formName: string; recordType: string };
        const csp = pageCsp({
          configuration: input.csp,
          pathname: req.path,
          appUrl: input.origin,
          environment: input.environment,
          analytics: settings.webAnalytics,
        });
        if (csp) {
          res.set(csp.headerName, csp.headerValue);
          initialLocals.contentSecurityPolicyNonce = csp.nonce;
        }
        const locals = Object.assign(
          initialLocals,
          pageLocals(
            {
              root: input.rootContext,
              origin: input.origin,
              brand,
              portal,
              settings,
              config: input.templateConfig,
              t,
              param,
              typeface: input.typeface(brand.name!),
              faviconUrl: input.rootContext + '/' + brand.name + '/' + portal + '/images/favicon',
              bundleHash: input.artifacts.bundleHash.bind(input.artifacts),
              hasRole,
            },
            initialLocals
          )
        );
        const navigation = new Navigation.Navigation({
          context: {
            isAuthenticated: !!actor,
            user: actor,
            brand: Object.assign(new BrandingModel(), brand),
            brandPortalPath: locals.page.base,
            currentPath: req.originalUrl.split('?')[0],
          },
          configuration: settings,
          appmode: input.templateConfig.appmode ?? {},
          log: input.log,
          translate: t,
          hasRole: (_user, _brand, name) => hasRole(name),
        });
        [locals.menu, locals.homePanels, locals.adminSidebar] = await Promise.all([
          navigation.resolveMenu(),
          navigation.resolveHomePanels(),
          navigation.resolveAdminSidebar(),
        ]);
        const view: string = route.action === 'login' ? (input.loginView ?? route.view) : route.view;
        let title = route.title ? t(route.title) : '';
        const modelBrand = Object.assign(new BrandingModel(), brand);
        if (route.action === 'redirectLegacyConsolidatedDashboard') {
          res.redirect(locals.page.base + '/dashboard-view/consolidated');
          return;
        }
        if (req.params.oid) {
          const record = await input.loadRecord(String(req.params.oid));
          if (!record || record.metaMetadata?.brandId !== brand.id) {
            res.status(404).end();
            return;
          }
          const roles = actor!.roles.map(r => ({ id: r.id, name: r.name, branding: { id: r.brandId } }));
          const user = { ...actor, roles };
          if (!(route.action === 'edit' ? hasEditAccess : hasViewAccess)(modelBrand, user, roles, record)) {
            res.status(403).end();
            return;
          }
          locals.recordType = record.metaMetadata.type;
          title = String(record.metadata?.title ?? '').trim() || t(locals.recordType + '-title-label');
          if (route.action === 'edit') {
            locals.formName = route.path.includes('/finalise/') ? 'default-1.0-draft' : '';
            if (
              !(await singleHttpResult(
                input.forms.getFormByName(locals.formName || record.metaMetadata.form, true, brand.id)
              ))
            ) {
              res.status(404).end();
              return;
            }
          }
        } else if (route.action === 'edit') {
          if (!(await input.canCreate(context, locals.recordType))) {
            res.status(403).end();
            return;
          }
          if (
            !(await singleHttpResult(input.forms.getFormByStartingWorkflowStep(modelBrand, locals.recordType, true)))
          ) {
            res.status(404).end();
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
                !step.name || !step.sourceRecordType || !['allForRecordType', 'workflowStage'].includes(step.fetchMode)
            )
          ) {
            res.status(404).end();
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
            res.status(404).end();
            return;
          }
          Object.assign(locals, { configKey: req.params.appConfigId, formTitle: model.title });
        }
        if (route.controller === 'ReportsController')
          locals.reports = await singleHttpResult(input.reports.findAllReportsForBrand(modelBrand));
        const site = t('default-title') || 'Site';
        locals.title = title && title !== site ? title + ' | ' + site : site;
        const render = (name: string, extra: Record<string, unknown> = {}): string => {
          const file =
            name === 'layout'
              ? input.artifacts.layout(brand.name!, portal)
              : input.artifacts.view(name.replace(/^\/+/, ''), brand.name!, portal);
          if (!file) throw new Error('Required page artifact missing.');
          return input.artifacts.render(file, { ...locals, ...extra });
        };
        locals.superPartial = (name: string) => render(name);
        locals.partial = (name: string, extra?: Record<string, unknown>) => render(name, extra);
        const body = render(view);
        res.type('html').send(route.view === 'admin/api-docs' ? body : render('layout', { body }));
      })
    );
}
