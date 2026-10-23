import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { HarvestRunService } from '../../HarvestRunService';
import { HarvestRunServiceError } from '../../HarvestRunService';
import type { RecordTypes } from '../../recordTypes/RecordTypes';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { UserModel } from '../../model/storage/UserModel';
import {
  createRecordSaveContext,
  readSaveRequestId,
  normalizeRecordValidationRequestFacts,
} from '../../RecordSaveResponse';
import { recordApiRoutes } from '../../api-routes/groups/records';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction, singleHttpResult } from './middleware';
import { sendApiData, sendApiErrors, validationApiVersion } from './responses';
export const harvestMutationRoutes = recordApiRoutes.filter(route =>
  ['harvest', 'legacyHarvest'].includes(route.action)
);
export interface HarvestMutationHttpInput {
  readonly harvest: Pick<HarvestRunService, 'submitChunk' | 'submitCompatibilityRecords' | 'submitLegacyRecords'>;
  readonly recordTypes: Pick<RecordTypes, 'get'>;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
  readonly log: ILogger;
}
export function mountHarvestMutationRoutes(router: Router, input: HarvestMutationHttpInput): void {
  const bindings = harvestMutationRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings)
    router[route.method](
      route.path,
      ...policies,
      input.csrf.apiProtect,
      httpAction(async (req, res) => {
        try {
          const { brand: snapshot, actor, portal } = requestContext(req);
          if (!actor) {
            sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
            return;
          }
          if (!actor.roles.some(r => r.brandId === snapshot.id)) {
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
          const brand = Object.assign(new BrandingModel(), snapshot);
          const user = Object.assign(new UserModel(), {
            id: actor.id,
            username: actor.username,
            name: actor.name ?? '',
            email: actor.email ?? '',
            type: actor.type ?? '',
            roles: actor.roles.map(r => ({
              id: r.id,
              name: r.name ?? '',
              users: [],
              branding: Object.assign(new BrandingModel(), { id: r.brandId }),
            })),
          });
          const type = await singleHttpResult(input.recordTypes.get(brand, String(validated.params.recordType)));
          if (!type) {
            sendApiErrors(req, res, 400, [{ detail: 'Record Type provided is not valid' }]);
            return;
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
          if (route.action === 'legacyHarvest')
            result = await input.harvest.submitLegacyRecords(
              brand,
              type,
              body,
              validated.query.merge === true,
              user,
              context
            );
          else if (body.sourceRunId) {
            if (validated.query.updateMode !== undefined) {
              sendApiErrors(req, res, 400, [{ detail: 'updateMode is not supported for tracked harvest requests.' }]);
              return;
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
          sendApiData(req, res, result);
        } catch (error) {
          const status = error instanceof HarvestRunServiceError ? error.statusCode : 500;
          input.log.error('Harvest request failed');
          sendApiErrors(req, res, status, [
            { detail: error instanceof HarvestRunServiceError ? error.message : 'Failed to process harvest request' },
          ]);
        }
      })
    );
}
