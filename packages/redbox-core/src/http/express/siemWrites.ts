import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Forwarding } from '../../integrations/SiemForwarding';
import {
  assertTestDestinationAllowed,
  resolveMaskedTestDestinationSecrets,
} from '../../integrations/SiemDestinationTests';
import { sanitizeSiemTestResponse } from '../../services/siem/SiemConfigSecrets';
import {
  normalizeSiemConfiguration,
  normalizeSiemDestination,
  normalizeSiemRedaction,
} from '../../configmodels/SiemConfiguration';
import type { AppConfigs } from '../../configuration/AppConfigs';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { siemApiRoutes } from '../../api-routes/groups/siem';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import { sendApiData, sendApiErrors, validationApiVersion } from './responses';
export const siemWriteRoutes = siemApiRoutes.filter(r => ['saveConfig', 'testDestination'].includes(r.action));
export interface SiemWritesHttpInput {
  readonly forwarding: Pick<Forwarding.SiemForwardingService, 'testDestination'>;
  readonly settings: Pick<
    AppConfigs,
    'createOrUpdateConfig' | 'getAppConfigByBrandAndKey' | 'getAppConfigurationForBrand'
  >;
  audit(actor: { id: string; username: string }, action: string, context: { brandId: string }): Promise<unknown>;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
  readonly log: ILogger;
}
export function mountSiemWriteRoutes(router: Router, input: SiemWritesHttpInput): void {
  const bindings = siemWriteRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings)
    router[route.method](
      route.path,
      ...policies,
      input.csrf.apiProtect,
      httpAction(async (req, res) => {
        const { actor, brand } = requestContext(req);
        if (!actor) {
          sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
          return;
        }
        if (!actor.roles.some(r => r.brandId === brand.id && r.name === 'Admin')) {
          sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
          return;
        }
        const validated = validateApiRouteRequest(req, route);
        if (!validated.valid) {
          sendApiErrors(
            req,
            res,
            400,
            validated.issues.map(i => ({ title: i.path, detail: i.message })),
            validationApiVersion(req)
          );
          return;
        }
        try {
          let result: unknown;
          if (route.action === 'saveConfig') {
            await input.settings.createOrUpdateConfig(Object.assign(new BrandingModel(), brand), 'siem', {
              ...normalizeSiemConfiguration(validated.body),
            });
            result = normalizeSiemConfiguration(
              (await input.settings.getAppConfigByBrandAndKey(brand.id, 'siem')) ?? {}
            );
          } else {
            const body = validated.body as Record<string, unknown>;
            const configuration = normalizeSiemConfiguration(
              (await input.settings.getAppConfigByBrandAndKey(brand.id, 'siem')) ?? {}
            );
            const destination = normalizeSiemDestination(body.destination);
            assertTestDestinationAllowed(destination, configuration);
            const resolved = resolveMaskedTestDestinationSecrets(
              { destination, redaction: normalizeSiemRedaction(body.redaction ?? {}) },
              normalizeSiemConfiguration(
                Reflect.get(input.settings.getAppConfigurationForBrand(brand.name ?? ''), 'siem') ?? {}
              )
            );
            result = sanitizeSiemTestResponse(await input.forwarding.testDestination(resolved), resolved.destination);
          }
          await input.audit(actor, route.action === 'saveConfig' ? 'siem-config' : 'siem-test', { brandId: brand.id });
          sendApiData(req, res, result);
        } catch (_error) {
          input.log.error('SIEM administration request failed');
          sendApiErrors(req, res, 400, [
            { detail: 'SIEM operation failed. Review configuration and delivery state before retrying.' },
          ]);
        }
      })
    );
}
