import { PersistenceError } from '../../persistence/errors';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as NamedQueries } from '../../queries/NamedQueries';
import { Services as Reports } from '../../queries/Reports';
import type { NamedQueryDefinition } from '../../config/namedQuery.config';
import type { ReportConfigDto } from '../../queries/Reports';
import { validateApiRouteRequest } from '../../api-routes/validation';
import { BrandingModel } from '../../model/storage/BrandingModel';
import {
  referenceData,
  referenceErrors,
  referenceValidationErrors,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';
import { administratorRefusal } from '../actors';
import type { ApiRouteDefinition } from '../../api-routes/types';

export interface QueryWriteInput {
  readonly queries: Pick<NamedQueries.NamedQueryService, 'create' | 'update' | 'delete'>;
  readonly reports: Pick<Reports.Reports, 'createConfig' | 'updateConfig' | 'deleteConfig'>;
  audit(
    actor: { id: string; username: string },
    action: string,
    context: { brandId: string; name: string }
  ): Promise<unknown>;
  readonly log: ILogger;
}
export function queryWritePrelude(req: ReferenceRequest): ReferenceResult | undefined {
  const refusal = administratorRefusal(req.context.actor, req.context.brand.id);
  if (refusal) return referenceErrors(req, refusal.status, [{ detail: refusal.detail }]);
}
export function queryWriteFailure(
  input: Pick<QueryWriteInput, 'log'>,
  req: ReferenceRequest,
  error: unknown,
  named: boolean
): ReferenceResult {
  const name =
    req.params.name ?? (req.body && typeof req.body === 'object' ? Reflect.get(req.body, 'name') : undefined);
  input.log.error('Definition mutation failed');
  const message = error instanceof Error ? error.message : '';
  const invalidTarget = named && error instanceof PersistenceError && error.code === 'named-query-compatibility';
  const status = invalidTarget
    ? 400
    : error instanceof Reports.ReportConfigServiceError
      ? error.status
      : named && message === `Named query '${name}' not found`
        ? 404
        : named && message === `Named query '${name}' already exists`
          ? 409
          : 500;
  return referenceErrors(req, status, [
    {
      detail: invalidTarget
        ? 'Unsupported named-query collection or expression.'
        : error instanceof Reports.ReportConfigServiceError || status !== 500
          ? message
          : 'Definition mutation failed.',
    },
  ]);
}
async function write(
  input: QueryWriteInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  named: boolean,
  create: boolean,
  run: (brand: BrandingModel, name: string, body: Record<string, unknown> | undefined) => Promise<unknown>
): Promise<ReferenceResult> {
  const { actor, brand: snapshot } = req.context;
  const refusal = queryWritePrelude(req);
  if (refusal) return refusal;
  const validated = validateApiRouteRequest(req, contract);
  if (!validated.valid) {
    return referenceValidationErrors(req, validated.issues);
  }
  const brand = Object.assign(new BrandingModel(), snapshot);
  const body = validated.body as Record<string, unknown> | undefined;

  const name = (validated.params.name ?? body?.name) as string | undefined;
  if (
    typeof name !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(name) ||
    (named && name === 'collections') ||
    (named && body?.name !== undefined && body.name !== name)
  ) {
    return referenceErrors(req, 400, [{ detail: 'Invalid or reserved definition name' }]);
  }
  const result = await run(brand, name, body);
  await input.audit(
    actor!,
    named
      ? create
        ? 'createQuery'
        : req.method === 'DELETE'
          ? 'deleteQuery'
          : 'updateQuery'
      : create
        ? 'createConfig'
        : req.method === 'DELETE'
          ? 'deleteConfig'
          : 'updateConfig',
    { brandId: brand.id, name }
  );
  return { ...referenceData(req, result), status: create ? 201 : 200 };
}
export function createQuery(
  input: QueryWriteInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>
) {
  return write(input, req, contract, true, true, async (brand, name, body) => {
    await input.queries.create(brand, name, body as unknown as NamedQueryDefinition);
    return { name };
  });
}
export function updateQuery(
  input: QueryWriteInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>
) {
  return write(input, req, contract, true, false, async (brand, name, body) => {
    await input.queries.update(brand, name, body as unknown as NamedQueryDefinition);
    return { name };
  });
}
export function deleteQuery(
  input: QueryWriteInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>
) {
  return write(input, req, contract, true, false, async (brand, name) => {
    await input.queries.delete(brand, name);
    return { name };
  });
}
export function createConfig(
  input: QueryWriteInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>
) {
  return write(input, req, contract, false, true, (brand, _name, body) =>
    input.reports.createConfig(brand, body as unknown as ReportConfigDto)
  );
}
export function updateConfig(
  input: QueryWriteInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>
) {
  return write(input, req, contract, false, false, (brand, name, body) =>
    input.reports.updateConfig(brand, name, body as unknown as ReportConfigDto)
  );
}
export function deleteConfig(
  input: QueryWriteInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>
) {
  return write(input, req, contract, false, false, (brand, name) => input.reports.deleteConfig(brand, name));
}
