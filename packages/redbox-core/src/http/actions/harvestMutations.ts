import { recordMetadataActorPrelude } from './recordMetadata';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { HarvestRunService } from '../../HarvestRunService';
import { HarvestRunServiceError } from '../../HarvestRunService';
import type { RecordTypes } from '../../recordTypes/RecordTypes';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { userFromActor } from '../actors';
import {
  createRecordSaveContext,
  readSaveRequestId,
  normalizeRecordValidationRequestFacts,
} from '../../RecordSaveResponse';
import { validateApiRouteRequest } from '../../api-routes/validation';
import {
  referenceValue as singleHttpResult,
  referenceData,
  referenceErrors,
  referenceValidationErrors,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';
import type { ApiRouteDefinition } from '../../api-routes/types';
export interface HarvestMutationInput {
  readonly harvest: Pick<HarvestRunService, 'submitChunk' | 'submitCompatibilityRecords' | 'submitLegacyRecords'>;
  readonly recordTypes: Pick<RecordTypes, 'get'>;
  readonly log: ILogger;
}
export const harvestMutationPrelude = recordMetadataActorPrelude;
export function harvestMutationFailure(
  input: Pick<HarvestMutationInput, 'log'>,
  req: ReferenceRequest,
  error: unknown
): ReferenceResult {
  const status = error instanceof HarvestRunServiceError ? error.statusCode : 500;
  input.log.error('Harvest request failed');
  return referenceErrors(req, status, [
    { detail: error instanceof HarvestRunServiceError ? error.message : 'Failed to process harvest request' },
  ]);
}
async function submit(
  input: HarvestMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  legacy: boolean
): Promise<ReferenceResult> {
  const { brand: snapshot, actor, portal } = req.context;
  const refusal = harvestMutationPrelude(req);
  if (refusal) return refusal;
  const validated = validateApiRouteRequest(req, contract);
  if (!validated.valid) {
    return referenceValidationErrors(req, validated.issues);
  }
  const brand = Object.assign(new BrandingModel(), snapshot);
  const user = userFromActor(actor!);
  const type = await singleHttpResult(input.recordTypes.get(brand, String(validated.params.recordType)));
  if (!type) {
    return referenceErrors(req, 400, [{ detail: 'Record Type provided is not valid' }]);
  }
  const body = validated.body as Record<string, unknown>;
  const context = createRecordSaveContext({
    requestId: readSaveRequestId(req.headers),
    routeFamily: 'api',
    operation: 'create',
    portal,
    validationRequestParameters: normalizeRecordValidationRequestFacts(validated.params, validated.query),
  });
  let result: unknown;
  if (legacy)
    result = await input.harvest.submitLegacyRecords(brand, type, body, validated.query.merge === true, user, context);
  else if (body.sourceRunId) {
    if (validated.query.updateMode !== undefined) {
      return referenceErrors(req, 400, [{ detail: 'updateMode is not supported for tracked harvest requests.' }]);
    }
    result = await input.harvest.submitChunk(brand, type, body, user, context);
  } else
    result = await input.harvest.submitCompatibilityRecords(
      brand,
      type,
      body,
      String(validated.query.updateMode ?? 'override'),
      user,
      context
    );
  return { ...referenceData(req, result), status: 200 };
}
export function harvest(
  input: HarvestMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>
) {
  return submit(input, req, contract, false);
}
export function legacyHarvest(
  input: HarvestMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>
) {
  return submit(input, req, contract, true);
}
