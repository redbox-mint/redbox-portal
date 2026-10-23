import { retiredDashboardOperation, sendDashboardError } from './dashboardResponses';
import type { RequestHandler, Router } from 'express';
import _ from 'lodash';
import type { RecordTypes } from '../../recordTypes';
import type { Services as WorkflowServices } from '../../workflows/WorkflowSteps';
import type { Services as WorkspaceServices } from '../../workspaces/WorkspaceTypes';
import type { Services as DashboardServices } from '../../dashboards/DashboardTypes';
import { Services as DashboardConfiguration } from '../../dashboards/DashboardConfig';
import type { I18nEntries } from '../../translations/I18nEntries';
import { RecordTypeResponseModel } from '../../model/RecordTypeResponseModel';
import { DashboardTypeResponseModel } from '../../model/DashboardTypeResponseModel';
import { DashboardViewResponseModel } from '../../model/DashboardViewResponseModel';
import { BrandingModel } from '../../model/storage/BrandingModel';
import type { RecordTypeModel } from '../../model/storage/RecordTypeModel';
import { normalizeRecordRelations } from '../../config/recordtype.config';
import { dashboardConfigApiRoutes } from '../../api-routes/groups/dashboard-config';
import type { ApiRouteDefinition } from '../../api-routes/types';
import type { PoliciesConfig } from '../../config/policies.config';
import { validateApiRouteRequest } from '../../api-routes/validation';
import { bindHttpPolicies, requestContext, resolveEffectivePolicies } from './policies';
import { httpAction, singleHttpResult } from './middleware';
import { apiNoCacheHeaders, sendApiData, sendApiErrors, validationApiVersion } from './responses';

const browserReads = [
  ['/record/type', 'RecordController', 'getAllTypes'],
  ['/record/type/:recordType', 'RecordController', 'getType'],
  ['/record/wfSteps/:recordType', 'RecordController', 'getWorkflowSteps'],
  ['/dashboard/type', 'RecordController', 'getAllDashboardTypes'],
  ['/dashboard/type/:dashboardType', 'RecordController', 'getDashboardType'],
  ['/dashboard/view/:dashboardView', 'RecordController', 'getDashboardView'],
  ['/dashboard/settings/workflow/:recordType', 'RecordController', 'getDashboardWorkflowSettings'],
  ['/dashboard/settings/view/:dashboardView', 'RecordController', 'getDashboardViewSettings'],
  ['/workspaces/types', 'WorkspaceTypesController', 'get'],
  ['/workspaces/types/:name', 'WorkspaceTypesController', 'getOne'],
  ['/locales', 'TranslationController', 'getLanguages'],
  ['/locales/:lng/translation.json', 'TranslationController', 'getNamespace'],
  ['/locales/:lng/:ns.json', 'TranslationController', 'getNamespace'],
  ['/app/i18n/entries', 'TranslationController', 'listEntriesApp'],
  ['/app/i18n/bundles/:locale/:namespace', 'TranslationController', 'getBundleApp'],
] as const;

const dashboardReads = dashboardConfigApiRoutes.filter(route => route.method === 'get');
export const metadataReadRoutes = [
  ...browserReads.map(([path, controller, action]) => ({
    method: 'get' as const,
    path: '/:branding/:portal' + path,
    controller,
    action,
  })),
  ...dashboardReads,
  ...dashboardReads
    .filter(route => route.action !== 'retiredOperation' && route.action !== 'migrationPreflight')
    .map(route => ({
      ...route,
      path: route.path.replace('/api/', '/admin/'),
      controller: 'DashboardConfigController',
    })),
];

export interface MetadataReadHttpInput {
  readonly recordTypes: Pick<RecordTypes, 'get' | 'getAll'>;
  readonly workflowSteps: Pick<WorkflowServices.WorkflowSteps, 'getAllForRecordType'>;
  readonly workspaceTypes: Pick<WorkspaceServices.WorkspaceTypes, 'get' | 'getOne'>;
  readonly dashboardTypes: Pick<
    DashboardServices.DashboardTypes,
    'get' | 'getAll' | 'getDashboardTableConfig' | 'getDashboardView'
  >;
  readonly dashboardConfig: Pick<
    DashboardConfiguration.DashboardConfig,
    | 'getDashboardContext'
    | 'getRuntimeSettings'
    | 'getTargetCatalogue'
    | 'getTargetSettings'
    | 'getFieldCatalogue'
    | 'preflightLegacyMigration'
  >;
  readonly translations: Pick<I18nEntries, 'getNamespace' | 'listLanguages' | 'listEntries' | 'getBundle'>;
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
}

class MetadataParameterError extends Error {}

function recordTypeResponse(type: (RecordTypeModel & { name?: string; id?: string }) | null): RecordTypeResponseModel {
  return new RecordTypeResponseModel(
    type?.name,
    type?.packageType,
    type?.searchFilters ?? [],
    type?.searchable,
    normalizeRecordRelations(type?.name ?? type?.id ?? '', type?.relatedTo),
    type?.concurrentModification
  );
}

/** Metadata only: rendering and protected writes have separate acceptance gates. */
export function mountMetadataReadRoutes(router: Router, input: MetadataReadHttpInput): void {
  const bindings = metadataReadRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings) {
    router.get(
      route.path,
      ...policies,
      httpAction(async (req, res) => {
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
        }
        const scalar = (name: string, fallback = ''): string => {
          const value = req.params[name] ?? req.query[name] ?? fallback;
          if (typeof value !== 'string' || !value.trim() || [...value].some(character => character.charCodeAt(0) < 32))
            throw new MetadataParameterError('Invalid metadata parameter: ' + name);
          return value.trim();
        };
        const { brand: snapshot, actor, portal } = requestContext(req);
        const brand = Object.assign(new BrandingModel(), snapshot);
        const target = () =>
          route.action.includes('Workflow')
            ? { kind: 'workflow' as const, recordType: scalar('recordType'), stage: scalar('stage') }
            : { kind: 'view' as const, view: scalar('view'), step: scalar('step') };
        const options: DashboardConfiguration.DashboardCallerOptions = actor
          ? {
              caller: {
                brand,
                user: {
                  ...actor,
                  type: actor.type ?? '',
                  name: actor.name ?? '',
                  email: actor.email ?? '',
                  roles: actor.roles.map(role => ({ ...role, name: role.name ?? '' })),
                },
              },
              portal,
            }
          : {};
        const dashboardTypeResponse = async (name: string) => {
          const type = await singleHttpResult(input.dashboardTypes.get(brand, name));
          return new DashboardTypeResponseModel({
            name,
            description: type?.description,
            formatRules: { ...(await input.dashboardConfig.getDashboardContext(brand, name)) },
            searchable: type?.searchable,
            system: type?.system,
          });
        };
        try {
          let result: unknown;
          switch (route.action) {
            case 'getType':
              result = recordTypeResponse(await singleHttpResult(input.recordTypes.get(brand, scalar('recordType'))));
              break;
            case 'getAllTypes':
              result = (await singleHttpResult(input.recordTypes.getAll(brand))).map(recordTypeResponse);
              break;
            case 'getWorkflowSteps': {
              const name = scalar('recordType');
              const type = await singleHttpResult(input.recordTypes.get(brand, name));
              if (!type) {
                sendApiErrors(req, res, 400, [{ detail: 'Record Type provided is not valid' }]);
                return;
              }
              const steps = _.cloneDeep(await singleHttpResult(input.workflowSteps.getAllForRecordType(type)));
              for (const step of steps) {
                const stage = String(_.get(step, 'config.workflow.stage', step.name));
                const table = await input.dashboardTypes.getDashboardTableConfig(brand, name, stage);
                if (table != null) _.set(step, 'config.dashboard.table', table);
              }
              result = steps;
              break;
            }
            case 'get':
            case 'getOne':
              try {
                result =
                  route.action === 'get'
                    ? { status: true, workspaceTypes: await singleHttpResult(input.workspaceTypes.get(brand)) }
                    : {
                        status: true,
                        workspaceType: await singleHttpResult(input.workspaceTypes.getOne(brand, scalar('name'))),
                      };
              } catch {
                result = 'Cannot get workspace types';
              }
              break;
            case 'getAllDashboardTypes': {
              const types = await singleHttpResult(input.dashboardTypes.getAll(brand));
              const models = [];
              for (const type of types) models.push(await dashboardTypeResponse(type.name));
              result = { dashboardTypes: models };
              break;
            }
            case 'getDashboardType':
              result = await dashboardTypeResponse(scalar('dashboardType'));
              break;
            case 'getDashboardWorkflowSettings':
              result = await input.dashboardConfig.getRuntimeSettings(brand, 'workflow', scalar('recordType'));
              break;
            case 'getDashboardViewSettings':
            case 'getDashboardView': {
              const view = input.dashboardTypes.getDashboardView(scalar('dashboardView'));
              if (
                !view?.name ||
                !view.titleLabelKey ||
                !view.dashboardType ||
                !view.sourceRecordType ||
                !view.steps?.length ||
                view.steps.some(
                  step =>
                    !step.name ||
                    !step.sourceRecordType ||
                    !['allForRecordType', 'workflowStage'].includes(step.fetchMode)
                )
              ) {
                sendApiErrors(req, res, 404, [{ detail: 'Dashboard view provided is not valid' }]);
                return;
              }
              result =
                route.action === 'getDashboardView'
                  ? new DashboardViewResponseModel(view)
                  : await input.dashboardConfig.getRuntimeSettings(brand, 'view', scalar('dashboardView'));
              break;
            }
            case 'getNamespace': {
              const data = await input.translations.getNamespace(brand, scalar('lng'), scalar('ns', 'translation'));
              if (data === null) res.status(404).json({ message: 'Namespace not found' });
              else res.set(apiNoCacheHeaders).json(data);
              return;
            }
            case 'getLanguages':
              res.set(apiNoCacheHeaders).json(await input.translations.listLanguages(brand));
              return;
            case 'listEntriesApp': {
              const prefix = req.query.keyPrefix;
              if (prefix !== undefined && typeof prefix !== 'string') {
                sendApiErrors(req, res, 400, [{ detail: 'Invalid keyPrefix' }]);
                return;
              }
              res
                .set(apiNoCacheHeaders)
                .json(
                  await input.translations.listEntries(
                    brand,
                    scalar('locale'),
                    scalar('namespace', 'translation'),
                    prefix
                  )
                );
              return;
            }
            case 'getBundleApp': {
              const bundle = await input.translations.getBundle(
                brand,
                scalar('locale'),
                scalar('namespace', 'translation')
              );
              if (!bundle) res.status(404).json({ message: 'Bundle not found' });
              else res.set(apiNoCacheHeaders).json(bundle);
              return;
            }
            case 'listTargets': {
              const catalogue = await input.dashboardConfig.getTargetCatalogue(brand);
              result = { targets: catalogue.targets, catalogueFingerprint: catalogue.fingerprint };
              break;
            }
            case 'getWorkflowTarget':
            case 'getViewTarget':
              result = await input.dashboardConfig.getTargetSettings(brand, target());
              break;
            case 'getWorkflowFields':
            case 'getViewFields':
              result = await input.dashboardConfig.getFieldCatalogue(brand, target(), options);
              break;
            case 'migrationPreflight':
              result = { reports: await input.dashboardConfig.preflightLegacyMigration(brand) };
              break;
            case 'retiredOperation':
              retiredDashboardOperation();
            default:
              throw new Error('Unbound metadata read.');
          }
          sendApiData(req, res, result);
        } catch (error) {
          if (error instanceof MetadataParameterError) {
            sendApiErrors(req, res, 400, [{ detail: error.message }]);
            return;
          }
          sendDashboardError(req, res, error);
        }
      })
    );
  }
}
