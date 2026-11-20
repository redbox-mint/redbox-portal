import { preparePageRendering, renderPageShell, type PageRenderingInput, type PageRenderingFacts } from './rendering';
import type { Forms } from '../forms/Forms';
import type { Services as Dashboards } from '../dashboards/DashboardTypes';
import type { Services as Reports } from '../queries/Reports';
import type { RecordModel } from '../model/storage/RecordModel';
import { BrandingModel } from '../model/storage/BrandingModel';
import { hasViewAccess, hasEditAccess } from '../records/access';
import { referenceValue as singleHttpResult } from '../http/actions/reference';
import { recordServiceChronicle } from '../utilities/serviceChronicle';
import { HttpFailure } from '../http/fastify/errorBoundary';
import type { pageRoutes } from '../http/pageRoutes';

export interface BrowserPageInput extends PageRenderingInput {
  forms: Pick<Forms, 'getFormByStartingWorkflowStep' | 'getFormByName'>;
  dashboards: Pick<Dashboards.DashboardTypes, 'getDashboardView' | 'getRecordTypeDashboardConfig'>;
  reports: Pick<Reports.Reports, 'findAllReportsForBrand'>;
  loadRecord(oid: string): Promise<RecordModel | null>;
  canCreate(context: PageRenderingFacts['context'], recordType: string): Promise<boolean>;
  configModel(key: string): Promise<{ title: string } | undefined>;
}
type Page = Awaited<ReturnType<typeof preparePageRendering>>;
type Route = (typeof pageRoutes)[number];
type State = {
  request: PageRenderingFacts;
  input: BrowserPageInput;
  page: Page;
  route: Route;
  title: string;
  oid?: string;
  record?: RecordModel;
};
export type BrowserPageOperation = (state: State) => Promise<ReturnType<Page['error']> | void>;
export const shellPage: BrowserPageOperation = async () => {};
export const editPage: BrowserPageOperation = async state => {
  const { input, request, page, route, oid, record } = state;
  const { brand } = request.context;
  if (oid) {
    page.locals.formName = route.path.includes('/finalise/') ? 'default-1.0-draft' : '';
    if (
      !(await singleHttpResult(
        input.forms.getFormByName(page.locals.formName || record!.metaMetadata.form, true, brand.id)
      ))
    )
      return page.error(404);
  } else {
    if (!(await input.canCreate(request.context, page.locals.recordType))) return page.error(403);
    if (
      !(await singleHttpResult(
        input.forms.getFormByStartingWorkflowStep(
          Object.assign(new BrandingModel(), brand),
          page.locals.recordType,
          true
        )
      ))
    )
      return page.error(404);
    state.title = 'Create ' + page.t(page.locals.recordType + '-title-label');
  }
};
export const dashboardViewPage: BrowserPageOperation = async ({ input, request, page }) => {
  const definition = input.dashboards.getDashboardView(String(request.routeParameters.dashboardView));
  if (
    !definition?.name ||
    !definition.titleLabelKey ||
    !definition.dashboardType ||
    !definition.sourceRecordType ||
    !definition.steps?.length ||
    definition.steps.some(
      step => !step.name || !step.sourceRecordType || !['allForRecordType', 'workflowStage'].includes(step.fetchMode)
    )
  )
    return page.error(404);
  Object.assign(page.locals, {
    dashboardView: definition.name,
    recordType: definition.sourceRecordType,
    dashboardType: definition.dashboardType,
    packageType: '',
    titleLabel: page.t(definition.titleLabelKey || definition.name),
    showAdminSideBar: definition.showAdminSideBar === true,
  });
};
export const dashboardPage: BrowserPageOperation = async ({ input, request, page }) => {
  const config = await input.dashboards.getRecordTypeDashboardConfig(
    Object.assign(new BrandingModel(), request.context.brand),
    page.locals.recordType
  );
  Object.assign(page.locals, {
    packageType: request.queryValues.packageType ?? (page.locals.recordType === 'workspace' ? 'workspace' : ''),
    dashboardType:
      page.locals.recordType === 'workspace' ? 'workspace' : (request.queryValues.dashboardType ?? 'standard'),
    dashboardView: '',
    showAdminSideBar: config?.showAdminSideBar === true,
    titleLabel: request.queryValues.titleLabel
      ? page.t(String(request.queryValues.titleLabel))
      : page.t('edit-dashboard') + ' ' + page.t(page.locals.recordType + '-title-label'),
  });
};
export const appConfigPage: BrowserPageOperation = async ({ input, request, page }) => {
  const model = await input.configModel(String(request.routeParameters.appConfigId));
  if (!model) return page.error(404);
  Object.assign(page.locals, { configKey: request.routeParameters.appConfigId, formTitle: model.title });
};
export const reportsPage: BrowserPageOperation = async ({ input, request, page }) => {
  page.locals.reports = await singleHttpResult(
    input.reports.findAllReportsForBrand(Object.assign(new BrandingModel(), request.context.brand))
  );
};

/** The guarded browser action uses rendering facts. Request facts are supplied
 * after hooks; domain guards precede the legacy rendering failure mapping. */
export async function browserPage(
  request: PageRenderingFacts,
  input: BrowserPageInput,
  route: Route,
  operation: BrowserPageOperation,
  applyHeaders: (headers: Readonly<Record<string, string>>) => void,
  mode: 'shell' | 'edit' | 'dashboard' | 'legacy' = 'shell'
) {
  const { brand, actor } = request.context;
  if (actor && !actor.roles.some(role => role.brandId === brand.id)) return { status: 403, headers: {} };
  if (Object.values(request.queryValues).some(value => typeof value !== 'string')) return { status: 400, headers: {} };
  const selected = request.routeParameters.oid ?? (mode === 'edit' ? request.queryValues.oid : undefined);
  const oid = typeof selected === 'string' ? selected.trim() : undefined;
  if (request.routeParameters.oid !== undefined && !oid) return { status: 400, headers: {} };
  // Reduced policies must never turn a missing actor into a caught TypeError/500.
  if (oid && !actor) return { status: 403, headers: {} };
  const page = await preparePageRendering(request, input, applyHeaders);
  if (mode === 'edit') page.locals.oid = oid ?? '';
  try {
    if (mode === 'legacy')
      return { status: 302, headers: { Location: page.locals.page.base + '/dashboard-view/consolidated' } };
    const state: State = { request, input, page, route, oid, title: route.title ? page.t(route.title) : '' };
    if (oid) {
      const record = await input.loadRecord(oid);
      if (!record || record.metaMetadata?.brandId !== brand.id) return page.error(404);
      state.record = record;
      const roles = actor!.roles.map(r => ({ id: r.id, name: r.name, branding: { id: r.brandId } }));
      if (
        !(mode === 'edit' ? hasEditAccess : hasViewAccess)(
          Object.assign(new BrandingModel(), brand),
          { ...actor!, roles },
          roles,
          record
        )
      )
        return page.error(403);
      page.locals.recordType = String(record.metaMetadata.type ?? '');
      state.title =
        String(record.metadata?.title ?? '').trim() ||
        (page.locals.recordType ? page.t(page.locals.recordType + '-title-label') : oid);
    }
    const refusal = await operation(state);
    if (refusal) return refusal;
    const view =
      route.action === 'login'
        ? (input.loginView ?? route.view)
        : route.view === 'record/view-orig' && !input.artifacts.view(route.view, brand.name!, request.context.portal)
          ? 'record/view'
          : route.view;
    return renderPageShell(
      page,
      view,
      mode === 'dashboard' ? String(page.locals.titleLabel) : state.title,
      route.view === 'admin/api-docs'
    );
  } catch (failure) {
    if (failure instanceof HttpFailure) throw failure;
    recordServiceChronicle(
      input.log,
      {
        pageController: route.controller,
        pageAction: route.action,
        pageView: route.view,
        pageFailureCategory:
          failure instanceof SyntaxError ? 'syntax' : failure instanceof TypeError ? 'type' : 'backend-or-template',
      },
      [new Error('Page rendering failed')]
    );
    return page.error(500);
  }
}
/** Retained adapter selects its operation once from the executable declaration. */
export function pageOperation(route: Route): {
  operation: BrowserPageOperation;
  mode: 'shell' | 'edit' | 'dashboard' | 'legacy';
} {
  if (route.action === 'edit') return { operation: editPage, mode: 'edit' };
  if (route.action === 'renderDashboardView') return { operation: dashboardViewPage, mode: 'dashboard' };
  if (route.action === 'redirectLegacyConsolidatedDashboard') return { operation: shellPage, mode: 'legacy' };
  if (route.view === 'dashboard') return { operation: dashboardPage, mode: 'dashboard' };
  if (route.action === 'editAppConfig') return { operation: appConfigPage, mode: 'shell' };
  if (route.controller === 'ReportsController') return { operation: reportsPage, mode: 'shell' };
  return { operation: shellPage, mode: 'shell' };
}
