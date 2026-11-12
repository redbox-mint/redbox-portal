import type { AppConfigs } from '../../configuration/AppConfigs';
import type { I18nEntries } from '../../translations/I18nEntries';
import { Services as Dashboard } from '../../dashboards/DashboardConfig';
import { SiemConfigurationError } from '../../configmodels/SiemConfiguration';
import { BrandingModel } from '../../model/storage/BrandingModel';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { validateApiRouteRequest } from '../../api-routes/validation';
import { apiNoCacheHeaders } from '../apiResponses';
import {
  jsonResult,
  referenceData,
  referenceErrors,
  referenceValidationErrors,
  dashboardReadError,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';

export interface ConfigurationWriteInput {
  readonly appConfigs: Pick<AppConfigs, 'createOrUpdateConfig' | 'resetConfigOverride'>;
  readonly translations: Pick<I18nEntries, 'setEntry' | 'deleteEntry' | 'setBundle' | 'updateBundleEnabled'>;
  readonly dashboardConfig: Pick<
    Dashboard.DashboardConfig,
    'saveTargetSettings' | 'validateTargetSettings' | 'previewCopy' | 'applyCopy'
  >;
  reloadTranslations(brandId: string): Promise<void>;
}
class ConfigurationInputError extends Error {}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ConfigurationInputError('Request body must be an object');
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '_csrf'));
}
export function retiredOperation(): never {
  throw new Dashboard.DashboardConfigError(
    'legacy-operation-retired',
    'This dashboard configuration operation has been retired. Dashboard profiles, defaults and overrides were replaced by independent settings for each workflow stage and dashboard-view step. Use GET /api/dashboard-config/targets, GET|PUT /api/dashboard-config/workflows/:recordType/:stage, GET|PUT /api/dashboard-config/views/:view/:step and the /api/dashboard-config/copy operations.',
    { replacement: '/api/dashboard-config/targets' }
  );
}
/** The preceding configuration actions validate the envelope before Zod, and
 * retired routes fail before inspecting their body or actor. No new actor policy. */
export function configurationWritePrelude(req: ReferenceRequest, action: string): void {
  if (Array.isArray(req.params.key)) req.params.key = req.params.key.join('/');
  if (action === 'retiredOperation') retiredOperation();
  if (req.method !== 'DELETE' && !(action === 'updateBundleEnabled' && req.body === undefined)) object(req.body);
}
export function configurationWriteFailure(
  req: ReferenceRequest,
  error: unknown,
  dashboard: boolean,
  browser: boolean,
  action: string,
  translation = false
): ReferenceResult {
  if (translation) {
    req.observe?.({ [action === 'setEntryApp' ? 'translationSetEntryFailed' : 'translationSetBundleFailed']: true });
    req.recordFailure?.();
  }
  if (error instanceof ConfigurationInputError || error instanceof SiemConfigurationError)
    return referenceErrors(req, 400, [{ detail: error.message }]);
  if (dashboard) return dashboardReadError(req, error);
  if (browser && error instanceof Error && Reflect.get(error, 'status') === 410)
    return jsonResult({ message: error.message }, 410);
  throw error;
}
type Contract = Pick<ApiRouteDefinition, 'request'>;
type Ready = {
  body: Record<string, unknown>;
  query: Record<string, unknown>;
  brand: BrandingModel;
  scalar: (name: string) => string;
  options: Dashboard.DashboardCallerOptions;
};
function prepare(req: ReferenceRequest, contract: Contract, action: string): { refusal: ReferenceResult } | Ready {
  configurationWritePrelude(req, action);
  let body =
    req.method === 'DELETE' || (action === 'updateBundleEnabled' && req.body === undefined) ? {} : object(req.body);
  const valid = validateApiRouteRequest(req, contract);
  if (!valid.valid) return { refusal: referenceValidationErrors(req, valid.issues) };
  if (valid.body !== undefined) body = object(valid.body);
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string) => {
    const raw = req.params[name];
    const value = name === 'key' && Array.isArray(raw) ? raw.join('/') : raw;
    if (typeof value !== 'string' || !value.trim() || [...value].some(c => c.charCodeAt(0) < 32))
      throw new ConfigurationInputError('Invalid parameter: ' + name);
    return value;
  };
  const { actor, portal } = req.context;
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
  return { body, query: valid.query, brand, scalar, options };
}
async function write(
  req: ReferenceRequest,
  contract: Contract,
  action: string,
  browser: boolean,
  dashboard: boolean,
  run: (facts: Ready) => Promise<unknown>,
  headers = {}
): Promise<ReferenceResult> {
  const facts = prepare(req, contract, action);
  if ('refusal' in facts) return facts.refusal;
  const result = await run(facts);
  return browser && !dashboard && action !== 'updateBundleEnabled'
    ? jsonResult(result, 200, { ...apiNoCacheHeaders, ...headers })
    : referenceData(req, result, headers);
}
export function saveAppConfig(
  input: Pick<ConfigurationWriteInput, 'appConfigs'>,
  req: ReferenceRequest,
  contract: Contract,
  browser = false
) {
  return write(req, contract, 'saveAppConfig', browser, false, async ({ brand, scalar, body }) => {
    const saved = await input.appConfigs.createOrUpdateConfig(brand, scalar('appConfigId'), body);
    return browser ? saved : body;
  });
}
export function resetAppConfig(
  input: Pick<ConfigurationWriteInput, 'appConfigs'>,
  req: ReferenceRequest,
  contract: Contract
) {
  return write(
    req,
    contract,
    'resetAppConfig',
    false,
    false,
    ({ brand, scalar }) => input.appConfigs.resetConfigOverride(brand, scalar('appConfigId')),
    { 'X-ReDBox-Config-Source': 'default' }
  );
}
export function setEntry(
  input: Pick<ConfigurationWriteInput, 'translations' | 'reloadTranslations'>,
  req: ReferenceRequest,
  contract: Contract,
  browser = false
) {
  return write(req, contract, browser ? 'setEntryApp' : 'setEntry', browser, false, ({ brand, scalar, body }) => {
    if (
      typeof body.value !== 'string' ||
      ['category', 'description'].some(key => body[key] !== undefined && typeof body[key] !== 'string')
    )
      throw new ConfigurationInputError('Invalid translation entry');
    return input.translations.setEntry(brand, scalar('locale'), scalar('namespace'), scalar('key'), body.value, {
      category: body.category as string | undefined,
      description: body.description as string | undefined,
      contentFormat: body.contentFormat,
    });
  });
}
export async function deleteEntry(
  input: Pick<ConfigurationWriteInput, 'translations' | 'reloadTranslations'>,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  const facts = prepare(req, contract, 'deleteEntry');
  if ('refusal' in facts) return facts.refusal;
  const { brand, scalar } = facts;
  if (!(await input.translations.deleteEntry(brand, scalar('locale'), scalar('namespace'), scalar('key'))))
    return referenceErrors(req, 404, [{ title: 'Entry not found' }]);
  await input.reloadTranslations(brand.id).catch(() => {});
  return referenceData(req, { message: 'Deleted', details: '' });
}
export function setBundle(
  input: Pick<ConfigurationWriteInput, 'translations' | 'reloadTranslations'>,
  req: ReferenceRequest,
  contract: Contract,
  browser = false
) {
  return write(
    req,
    contract,
    browser ? 'setBundleApp' : 'setBundle',
    browser,
    false,
    ({ brand, scalar, body, query }) => {
      if (body.displayName !== undefined && typeof body.displayName !== 'string')
        throw new ConfigurationInputError('Invalid displayName');
      return input.translations.setBundle(
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
                body.overwriteEntries != null ? body.overwriteEntries === true : query.overwriteEntries !== false,
            }
      );
    }
  );
}
export function updateBundleEnabled(
  input: Pick<ConfigurationWriteInput, 'translations' | 'reloadTranslations'>,
  req: ReferenceRequest,
  contract: Contract
) {
  return write(req, contract, 'updateBundleEnabled', true, false, async ({ brand, scalar, body, query }) => {
    if (body.enabled !== undefined && ![true, false, 'true', 'false'].includes(body.enabled as boolean | string))
      throw new ConfigurationInputError('Invalid enabled');
    if (query.enabled !== undefined && query.enabled !== 'true' && query.enabled !== 'false')
      throw new ConfigurationInputError('Invalid enabled');
    const result = await input.translations.updateBundleEnabled(
      brand,
      scalar('locale'),
      scalar('namespace'),
      query.enabled === 'true' || body.enabled === true || body.enabled === 'true'
    );
    await input.reloadTranslations(brand.id).catch(() => {});
    return result;
  });
}
function saveTarget(
  input: Pick<ConfigurationWriteInput, 'dashboardConfig'>,
  req: ReferenceRequest,
  contract: Contract,
  workflow: boolean
) {
  return write(
    req,
    contract,
    workflow ? 'saveWorkflowTarget' : 'saveViewTarget',
    false,
    true,
    ({ brand, scalar, body, options }) =>
      input.dashboardConfig.saveTargetSettings(
        brand,
        workflow
          ? { kind: 'workflow', recordType: scalar('recordType'), stage: scalar('stage') }
          : { kind: 'view', view: scalar('view'), step: scalar('step') },
        {
          expectedRevision: body.expectedRevision as number,
          settings: body.settings,
          validationFingerprint: body.validationFingerprint as string | undefined,
          acknowledgedWarningIds: body.acknowledgedWarningIds as string[] | undefined,
        },
        options
      )
  );
}
export function saveWorkflowTarget(
  input: Pick<ConfigurationWriteInput, 'dashboardConfig'>,
  req: ReferenceRequest,
  contract: Contract
) {
  return saveTarget(input, req, contract, true);
}
export function saveViewTarget(
  input: Pick<ConfigurationWriteInput, 'dashboardConfig'>,
  req: ReferenceRequest,
  contract: Contract
) {
  return saveTarget(input, req, contract, false);
}
export function validateSettings(
  input: Pick<ConfigurationWriteInput, 'dashboardConfig'>,
  req: ReferenceRequest,
  contract: Contract
) {
  return write(req, contract, 'validateSettings', false, true, ({ brand, body, options }) =>
    input.dashboardConfig.validateTargetSettings(brand, body.target, body.expectedRevision, body.settings, options)
  );
}
export function previewCopy(
  input: Pick<ConfigurationWriteInput, 'dashboardConfig'>,
  req: ReferenceRequest,
  contract: Contract
) {
  return write(req, contract, 'previewCopy', false, true, ({ brand, body, options }) =>
    input.dashboardConfig.previewCopy(
      brand,
      { source: body.source, destinations: body.destinations, groups: body.groups },
      options
    )
  );
}
export function applyCopy(
  input: Pick<ConfigurationWriteInput, 'dashboardConfig'>,
  req: ReferenceRequest,
  contract: Contract
) {
  return write(req, contract, 'applyCopy', false, true, ({ brand, body, options }) =>
    input.dashboardConfig.applyCopy(
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
    )
  );
}
