import { requireAdministrator } from './actors';
import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { AppConfigs } from '../../configuration/AppConfigs';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { adminApiRoutes } from '../../api-routes/groups/admin';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import { sendApiData, sendApiErrors, sendApiValidationErrors } from './responses';
export const adminOperationRoutes = adminApiRoutes;
export interface AdminOperationsHttpInput {
  readonly settings: Pick<AppConfigs, 'createOrUpdateConfig' | 'getMaskedAppConfigurationForBrand'>;
  reloadTranslations(): Promise<unknown>;
  invalidateAssets(): void;
  audit(
    actor: { id: string; username: string },
    action: string,
    context: { brandId: string; configKey?: string }
  ): Promise<unknown>;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
  readonly log: ILogger;
}
export function mountAdminOperationRoutes(router: Router, input: AdminOperationsHttpInput): void {
  const bindings = adminOperationRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings)
    router[route.method](
      route.path,
      ...policies,
      ...(route.action === 'getAppConfig' ? [] : [input.csrf.apiProtect]),
      httpAction(async (req, res) => {
        if (req.method === 'HEAD') {
          res.set('Allow', 'GET').status(405).end();
          return;
        }
        const { actor, brand } = requestContext(req);
        if (!requireAdministrator(req, res, actor, brand.id)) return;
        const validated = validateApiRouteRequest(req, route);
        if (!validated.valid) {
          sendApiValidationErrors(req, res, validated.issues);
          return;
        }
        try {
          const key = validated.params.configKey as string | undefined;
          let data: unknown;
          if (route.action === 'getAppConfig')
            data = input.settings.getMaskedAppConfigurationForBrand(brand.name ?? '', key);
          else {
            if (route.action === 'refreshCachedResources') {
              await input.reloadTranslations();
              input.invalidateAssets();
            } else
              await input.settings.createOrUpdateConfig(
                Object.assign(new BrandingModel(), brand),
                key!,
                validated.body as Record<string, unknown>
              );
            await input.audit(
              actor,
              route.action === 'refreshCachedResources' ? 'refresh-cached-resources' : 'set-app-config',
              { brandId: brand.id, ...(key ? { configKey: key } : {}) }
            );
            data = {
              message:
                route.action === 'setAppConfig'
                  ? 'App configuration updated successfully'
                  : 'Request processed successfully',
              details: '',
            };
          }
          sendApiData(req, res, data);
        } catch (error) {
          input.log.error('Administration operation failed');
          const status = error && typeof error === 'object' && Reflect.get(error, 'status') === 410 ? 410 : 500;
          sendApiErrors(req, res, status, [
            { detail: 'Administration operation failed. Review current state before retrying.' },
          ]);
        }
      })
    );
}
