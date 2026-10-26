import type { RequestHandler, Router } from 'express';
import type { AppConfigs } from '../../configuration/AppConfigs';
import type { I18nEntries } from '../../translations/I18nEntries';
import type { Services as Dashboard } from '../../dashboards/DashboardConfig';
import { SiemConfigurationError } from '../../configmodels/SiemConfiguration';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { appConfigApiRoutes } from '../../api-routes/groups/appconfig';
import { translationApiRoutes } from '../../api-routes/groups/translation';
import { dashboardConfigApiRoutes } from '../../api-routes/groups/dashboard-config';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { ApiRouteDefinition } from '../../api-routes/types';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, requestContext, resolveEffectivePolicies } from './policies';
import { httpAction, recordHttpFailure } from './middleware';
import { sendApiData, sendApiErrors, sendApiValidationErrors, apiNoCacheHeaders } from './responses';
import { retiredDashboardOperation, sendDashboardError } from './dashboardResponses';

const dashboardWrites = dashboardConfigApiRoutes.filter(route => route.method !== 'get');
export const configurationWriteRoutes = [
  ...appConfigApiRoutes.filter(route => route.method !== 'get'),
  ...translationApiRoutes.filter(route => route.method !== 'get'),
  ...dashboardWrites,
  ...dashboardWrites
    .filter(route => route.action !== 'retiredOperation')
    .map(route => ({
      ...route,
      path: route.path.replace('/api/', '/admin/'),
      controller: 'DashboardConfigController',
    })),
  ...[
    ['/appconfig/form/:appConfigId', 'AppConfigController', 'saveAppConfig'],
    ['/app/i18n/entries/:locale/:namespace/:key*', 'TranslationController', 'setEntryApp'],
    ['/app/i18n/bundles/:locale/:namespace', 'TranslationController', 'setBundleApp'],
    ['/app/i18n/bundles/:locale/:namespace/enabled', 'webservice/TranslationController', 'updateBundleEnabled'],
  ].map(([path, controller, action]) => ({
    method: 'post' as const,
    path: '/:branding/:portal' + path,
    controller,
    action,
  })),
];
export interface ConfigurationWriteHttpInput {
  readonly appConfigs: Pick<AppConfigs, 'createOrUpdateConfig' | 'resetConfigOverride'>;
  readonly translations: Pick<I18nEntries, 'setEntry' | 'deleteEntry' | 'setBundle' | 'updateBundleEnabled'>;
  readonly dashboardConfig: Pick<
    Dashboard.DashboardConfig,
    'saveTargetSettings' | 'validateTargetSettings' | 'previewCopy' | 'applyCopy'
  >;
  reloadTranslations(brandId: string): Promise<void>;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
}
class ConfigurationInputError extends Error {}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ConfigurationInputError('Request body must be an object');
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '_csrf'));
}
/** Explicit writes only. Policies and CSRF precede validation, overrides and persisted work. */
export function mountConfigurationWriteRoutes(router: Router, input: ConfigurationWriteHttpInput): void {
  const bindings = configurationWriteRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings) {
    const browser = !route.path.includes('/api/');
    router[route.method](
      route.path.replace(':key*', '*key'),
      ...policies,
      browser ? input.csrf.protect : input.csrf.apiProtect,
      httpAction(async (req, res) => {
        if (Array.isArray(req.params.key)) req.params.key = req.params.key.join('/');
        const dashboard = route.path.includes('/dashboard-config/');
        try {
          if (route.action === 'retiredOperation') retiredDashboardOperation();
          let body =
            req.method === 'DELETE' || (route.action === 'updateBundleEnabled' && req.body === undefined)
              ? {}
              : object(req.body);
          let query: Record<string, unknown> = req.query;
          if ('request' in route) {
            const validated = validateApiRouteRequest(req, route as ApiRouteDefinition);
            if (!validated.valid) {
              sendApiValidationErrors(req, res, validated.issues);
              return;
            }
            if (validated.body !== undefined) body = object(validated.body);
            query = validated.query;
          }
          const scalar = (name: string) => {
            const value = req.params[name];
            if (
              typeof value !== 'string' ||
              !value.trim() ||
              [...value].some(character => character.charCodeAt(0) < 32)
            )
              throw new ConfigurationInputError('Invalid parameter: ' + name);
            return value;
          };
          const { brand: snapshot, actor, portal } = requestContext(req);
          const brand = Object.assign(new BrandingModel(), snapshot);
          const options: Dashboard.DashboardCallerOptions = actor
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
          const target = () =>
            route.action.includes('Workflow')
              ? { kind: 'workflow' as const, recordType: scalar('recordType'), stage: scalar('stage') }
              : { kind: 'view' as const, view: scalar('view'), step: scalar('step') };
          let result: unknown;
          switch (route.action) {
            case 'saveAppConfig': {
              const saved = await input.appConfigs.createOrUpdateConfig(brand, scalar('appConfigId'), body);
              result = browser ? saved : body;
              break;
            }
            case 'resetAppConfig':
              result = await input.appConfigs.resetConfigOverride(brand, scalar('appConfigId'));
              res.set('X-ReDBox-Config-Source', 'default');
              break;
            case 'setEntry':
            case 'setEntryApp':
              if (
                typeof body.value !== 'string' ||
                ['category', 'description'].some(key => body[key] !== undefined && typeof body[key] !== 'string')
              )
                throw new ConfigurationInputError('Invalid translation entry');
              result = await input.translations.setEntry(
                brand,
                scalar('locale'),
                scalar('namespace'),
                scalar('key'),
                body.value,
                {
                  category: body.category as string | undefined,
                  description: body.description as string | undefined,
                  contentFormat: body.contentFormat,
                }
              );
              break;
            case 'deleteEntry':
              if (
                !(await input.translations.deleteEntry(brand, scalar('locale'), scalar('namespace'), scalar('key')))
              ) {
                sendApiErrors(req, res, 404, [{ title: 'Entry not found' }]);
                return;
              }
              await input.reloadTranslations(brand.id).catch(() => {});
              result = { message: 'Deleted', details: '' };
              break;
            case 'setBundle':
            case 'setBundleApp':
              if (body.displayName !== undefined && typeof body.displayName !== 'string')
                throw new ConfigurationInputError('Invalid displayName');
              result = await input.translations.setBundle(
                brand,
                scalar('locale'),
                scalar('namespace'),
                object(body.data || body),
                browser ? (body.displayName as string | undefined) : undefined,
                browser
                  ? undefined
                  : {
                      splitToEntries:
                        body.splitToEntries != null ? body.splitToEntries === true : query.splitToEntries !== false,
                      overwriteEntries:
                        body.overwriteEntries != null
                          ? body.overwriteEntries === true
                          : query.overwriteEntries !== false,
                    }
              );
              break;
            case 'updateBundleEnabled':
              if (
                body.enabled !== undefined &&
                ![true, false, 'true', 'false'].includes(body.enabled as boolean | string)
              )
                throw new ConfigurationInputError('Invalid enabled');
              if (query.enabled !== undefined && query.enabled !== 'true' && query.enabled !== 'false')
                throw new ConfigurationInputError('Invalid enabled');
              result = await input.translations.updateBundleEnabled(
                brand,
                scalar('locale'),
                scalar('namespace'),
                query.enabled === 'true' || body.enabled === true || body.enabled === 'true'
              );
              // This operation, like deleteEntry and unlike setEntry/setBundle, has no domain reload.
              await input.reloadTranslations(brand.id).catch(() => {});
              break;
            case 'saveWorkflowTarget':
            case 'saveViewTarget':
              result = await input.dashboardConfig.saveTargetSettings(
                brand,
                target(),
                {
                  expectedRevision: body.expectedRevision as number,
                  settings: body.settings,
                  validationFingerprint: body.validationFingerprint as string | undefined,
                  acknowledgedWarningIds: body.acknowledgedWarningIds as string[] | undefined,
                },
                options
              );
              break;
            case 'validateSettings':
              result = await input.dashboardConfig.validateTargetSettings(
                brand,
                body.target,
                body.expectedRevision,
                body.settings,
                options
              );
              break;
            case 'previewCopy':
              result = await input.dashboardConfig.previewCopy(
                brand,
                { source: body.source, destinations: body.destinations, groups: body.groups },
                options
              );
              break;
            case 'applyCopy':
              result = await input.dashboardConfig.applyCopy(
                brand,
                {
                  source: body.source,
                  destinations: body.destinations,
                  groups: body.groups,
                  expectedRevision: body.expectedRevision as number,
                  previewFingerprint: body.previewFingerprint as string,
                  acknowledgedWarningIds: body.acknowledgedWarningIds as string[] | undefined,
                },
                options
              );
              break;
            case 'retiredOperation':
              retiredDashboardOperation();
            default:
              throw new Error('Unbound configuration write');
          }
          if (browser && !dashboard && route.action !== 'updateBundleEnabled') res.set(apiNoCacheHeaders).json(result);
          else sendApiData(req, res, result);
        } catch (error) {
          if (route.controller === 'TranslationController')
            recordHttpFailure(req, undefined, 'Translation write failed', {
              [route.action === 'setEntryApp' ? 'translationSetEntryFailed' : 'translationSetBundleFailed']: true,
            });
          if (error instanceof ConfigurationInputError || error instanceof SiemConfigurationError) {
            sendApiErrors(req, res, 400, [{ detail: error.message }]);
            return;
          }
          if (dashboard) {
            sendDashboardError(req, res, error);
            return;
          }
          if (browser && error instanceof Error && Reflect.get(error, 'status') === 410) {
            res.status(410).json({ message: error.message });
            return;
          }
          throw error;
        }
      })
    );
  }
}
