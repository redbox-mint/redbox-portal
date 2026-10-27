import type { RequestHandler, Router } from 'express';
import type { AppConfigs } from '../../configuration/AppConfigs';
import type { I18nEntries } from '../../translations/I18nEntries';
import type { Forms } from '../../forms/Forms';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { ListAPIResponse } from '../../model/ListAPIResponse';
import { getAppConfigByIdRoute } from '../../api-routes/groups/appconfig';
import { listEntriesRoute, getEntryRoute, getBundleRoute } from '../../api-routes/groups/translation';
import { formApiRoutes } from '../../api-routes/groups/forms';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { PoliciesConfig } from '../../config/policies.config';
import { bindHttpPolicies, requestContext, resolveEffectivePolicies } from './policies';
import { httpAction, singleHttpResult } from './middleware';
import { sendApiData, sendApiErrors, sendApiValidationErrors } from './responses';

export const appConfigFormReadRoute = {
  method: 'get' as const,
  path: '/:branding/:portal/appconfig/form/:appConfigId',
  controller: 'AppConfigController',
  action: 'getAppConfigForm',
};

export const configurationReadRoutes = [
  getAppConfigByIdRoute,
  listEntriesRoute,
  getEntryRoute,
  getBundleRoute,
  ...formApiRoutes,
];

export interface ConfigurationReadHttpInput {
  readonly appConfigs: Pick<AppConfigs, 'getAppConfigByBrandAndKey' | 'hasConfigOverride' | 'getAppConfigForm'>;
  readonly translations: Pick<I18nEntries, 'listEntries' | 'getEntry' | 'getBundle'>;
  readonly forms: Pick<Forms, 'listForms' | 'getFormByName' | 'toPublicForm' | 'discoverValidationOperations'>;
  readonly loadRecord: import('../../forms/RecordValidation').RecordValidationServiceDependencies['loadRecord'];
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
}

/** Read contracts only. Protected configuration writes are gated on SR-039. */
export function mountConfigurationReadRoutes(router: Router, input: ConfigurationReadHttpInput): void {
  const formPolicies = bindHttpPolicies(
    resolveEffectivePolicies(appConfigFormReadRoute, input.policyConfiguration),
    input.policies
  );
  router.get(
    appConfigFormReadRoute.path,
    ...formPolicies,
    httpAction(async (req, res) => {
      const { brand: snapshot } = requestContext(req);
      const brand = Object.assign(new BrandingModel(), snapshot);
      const id = req.params.appConfigId;
      if (typeof id !== 'string' || !id.trim()) {
        sendApiErrors(req, res, 400, [{ detail: 'appConfigId is required' }]);
        return;
      }
      res.json(await input.appConfigs.getAppConfigForm(brand, id));
    })
  );
  const bindings = configurationReadRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings) {
    // Express 5 names wildcard captures and returns decoded segments as an array.
    const path = route.path.replace(':key*', '*key');
    router.get(
      path,
      ...policies,
      httpAction(async (req, res) => {
        if (Array.isArray(req.params.key)) req.params.key = req.params.key.join('/');
        const validated = validateApiRouteRequest(req, route);
        if (!validated.valid) {
          sendApiValidationErrors(req, res, validated.issues);
          return;
        }
        const { brand: snapshot, actor } = requestContext(req);
        const brand = Object.assign(new BrandingModel(), snapshot);
        const { params, query } = validated;
        switch (route.action) {
          case 'getAppConfig': {
            const key = String(params.appConfigId);
            const value = await input.appConfigs.getAppConfigByBrandAndKey(brand.id, key);
            const overridden = await input.appConfigs.hasConfigOverride(brand.id, key);
            res.set('X-ReDBox-Config-Source', overridden ? 'override' : 'default');
            sendApiData(req, res, value);
            return;
          }
          case 'listEntries':
            sendApiData(
              req,
              res,
              await input.translations.listEntries(
                brand,
                query.locale as string,
                (query.namespace as string) || 'translation',
                query.keyPrefix as string | undefined
              )
            );
            return;
          case 'getEntry':
          case 'getBundle': {
            const value =
              route.action === 'getEntry'
                ? await input.translations.getEntry(
                    brand,
                    String(params.locale),
                    String(params.namespace) || 'translation',
                    String(params.key)
                  )
                : await input.translations.getBundle(
                    brand,
                    String(params.locale),
                    String(params.namespace) || 'translation'
                  );
            if (!value)
              sendApiErrors(req, res, 404, [
                { title: route.action === 'getEntry' ? 'Entry not found' : 'Bundle not found' },
              ]);
            else sendApiData(req, res, value);
            return;
          }
          case 'listForms': {
            const forms = await singleHttpResult(input.forms.listForms(brand.id));
            const result = new ListAPIResponse();
            result.summary.numFound = forms.length;
            result.records = forms.map(form => input.forms.toPublicForm(form));
            sendApiData(req, res, result);
            return;
          }
          case 'getForm': {
            const editable = query.editable !== 'false';
            const form = await singleHttpResult(input.forms.getFormByName(String(query.name), editable, brand.id));
            if (!form) {
              sendApiErrors(req, res, 404, [{ title: 'Form not found' }]);
              return;
            }
            const oid = typeof query.oid === 'string' ? query.oid.trim() : '';
            let record: Awaited<ReturnType<typeof input.loadRecord>> = null;
            let resolved = !oid;
            if (oid) {
              try {
                const loaded = await input.loadRecord(oid);
                if (
                  String((loaded?.metaMetadata as Record<string, unknown> | undefined)?.brandId ?? '').trim() ===
                  brand.id
                ) {
                  record = loaded;
                  resolved = true;
                }
              } catch {
                /* Legacy discovery fails closed when record context cannot be loaded. */
              }
            }
            const operations = resolved
              ? await input.forms.discoverValidationOperations({
                  brand,
                  form,
                  recordType: record
                    ? String((record.metaMetadata as Record<string, unknown> | undefined)?.type ?? '')
                    : String(query.recordType || form.configuration?.type || '').trim(),
                  record,
                  user: actor ? { ...actor, roles: [...actor.roles] } : undefined,
                  editable,
                  targetStep: typeof query.targetStep === 'string' ? query.targetStep.trim() : undefined,
                })
              : [];
            sendApiData(req, res, input.forms.toPublicForm(form, operations));
            return;
          }
          default:
            throw new Error('Unbound configuration read contract.');
        }
      })
    );
  }
}
