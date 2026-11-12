import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { AppConfigs } from '../../configuration/AppConfigs';
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
  SiemConfigurationError,
} from '../../configmodels/SiemConfiguration';
import { BrandingModel } from '../../model/storage/BrandingModel';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { validateApiRouteRequest, type ValidatedApiRouteRequest } from '../../api-routes/validation';
import { administratorRefusal } from '../actors';
import {
  referenceData,
  referenceErrors,
  referenceValidationErrors,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';
interface AdministrationAuditInput {
  audit(
    actor: { id: string; username: string },
    action: string,
    context: { brandId: string; configKey?: string }
  ): Promise<unknown>;
  readonly log: ILogger;
}
export interface AdminOperationsInput extends AdministrationAuditInput {
  readonly settings: Pick<AppConfigs, 'createOrUpdateConfig' | 'getMaskedAppConfigurationForBrand'>;
  reloadTranslations(): Promise<unknown>;
  invalidateAssets(): void;
}
export interface SiemWritesInput extends AdministrationAuditInput {
  readonly forwarding: Pick<Forwarding.SiemForwardingService, 'testDestination'>;
  readonly settings: Pick<
    AppConfigs,
    'createOrUpdateConfig' | 'getAppConfigByBrandAndKey' | 'getAppConfigurationForBrand'
  >;
}
/** HEAD denial intentionally precedes actor/context validation for the three admin GET declarations. */
export function administrationPrelude(request: ReferenceRequest, admin = false): ReferenceResult | undefined {
  if (admin && request.method === 'HEAD')
    return { kind: 'empty', status: 405, headers: { Allow: 'GET' }, body: undefined };
  const refusal = administratorRefusal(request.context.actor, request.context.brand.id);
  if (refusal) return referenceErrors(request, refusal.status, [{ detail: refusal.detail }]);
}
type Contract = Pick<ApiRouteDefinition, 'request'>;
async function administer(
  request: ReferenceRequest,
  contract: Contract,
  admin: boolean,
  action: (valid: ValidatedApiRouteRequest) => Promise<ReferenceResult>
) {
  const refusal = administrationPrelude(request, admin);
  if (refusal) return refusal;
  const valid = validateApiRouteRequest(request, contract);
  if (!valid.valid) return referenceValidationErrors(request, valid.issues);
  return action(valid);
}
export function adminOperationFailure(
  input: Pick<AdminOperationsInput, 'log'>,
  request: ReferenceRequest,
  error: unknown
) {
  input.log.error('Administration operation failed');
  const status = error && typeof error === 'object' && Reflect.get(error, 'status') === 410 ? 410 : 500;
  return referenceErrors(request, status, [
    { detail: 'Administration operation failed. Review current state before retrying.' },
  ]);
}
export function getAppConfig(input: AdminOperationsInput, request: ReferenceRequest, contract: Contract) {
  return administer(request, contract, true, async valid =>
    referenceData(
      request,
      input.settings.getMaskedAppConfigurationForBrand(
        request.context.brand.name ?? '',
        valid.params.configKey as string | undefined
      )
    )
  );
}
export function refreshCachedResources(input: AdminOperationsInput, request: ReferenceRequest, contract: Contract) {
  return administer(request, contract, true, async () => {
    await input.reloadTranslations();
    input.invalidateAssets();
    await input.audit(request.context.actor!, 'refresh-cached-resources', { brandId: request.context.brand.id });
    return referenceData(request, { message: 'Request processed successfully', details: '' });
  });
}
export function setAppConfig(input: AdminOperationsInput, request: ReferenceRequest, contract: Contract) {
  return administer(request, contract, true, async valid => {
    const key = valid.params.configKey as string;
    await input.settings.createOrUpdateConfig(
      Object.assign(new BrandingModel(), request.context.brand),
      key,
      valid.body as Record<string, unknown>
    );
    await input.audit(request.context.actor!, 'set-app-config', {
      brandId: request.context.brand.id,
      ...(key ? { configKey: key } : {}),
    });
    return referenceData(request, { message: 'App configuration updated successfully', details: '' });
  });
}
export function siemWriteFailure(
  input: Pick<SiemWritesInput, 'log'>,
  request: ReferenceRequest,
  error: unknown,
  test = false
) {
  input.log.error('SIEM administration request failed');
  const status = test || error instanceof SiemConfigurationError ? 400 : 500;
  return referenceErrors(request, status, [
    {
      detail:
        status === 500
          ? 'Internal server error'
          : error instanceof SiemConfigurationError
            ? error.message
            : 'SIEM operation failed. Review configuration and delivery state before retrying.',
    },
  ]);
}
export function saveConfig(input: SiemWritesInput, request: ReferenceRequest, contract: Contract) {
  return administer(request, contract, false, async valid => {
    const { brand, actor } = request.context;
    await input.settings.createOrUpdateConfig(Object.assign(new BrandingModel(), brand), 'siem', {
      ...normalizeSiemConfiguration(valid.body),
    });
    const result = normalizeSiemConfiguration((await input.settings.getAppConfigByBrandAndKey(brand.id, 'siem')) ?? {});
    await input.audit(actor!, 'siem-config', { brandId: brand.id });
    return referenceData(request, result);
  });
}
export function testDestination(input: SiemWritesInput, request: ReferenceRequest, contract: Contract) {
  return administer(request, contract, false, async valid => {
    const { brand, actor } = request.context,
      body = valid.body as Record<string, unknown>;
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
    const result = sanitizeSiemTestResponse(await input.forwarding.testDestination(resolved), resolved.destination);
    await input.audit(actor!, 'siem-test', { brandId: brand.id });
    return referenceData(request, result);
  });
}
