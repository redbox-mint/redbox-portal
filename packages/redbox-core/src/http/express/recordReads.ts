import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { ApiRouteDefinition } from '../../api-routes/types';
import * as actions from '../actions/recordReads';
import type { RecordReadInput } from '../actions/recordReads';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import { recordReadRoutes as declarations } from '../readRoutes';
export const recordReadRoutes = declarations;
import { mountRecordSchemaReadRoutes } from './recordSchemaReads';
import { readRecordMetadata } from '../actions/recordMetadata';
export interface RecordReadHttpInput extends RecordReadInput {
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountRecordReadRoutes(router: Router, input: RecordReadHttpInput): void {
  if (!Number.isSafeInteger(input.maxRows) || input.maxRows < 1)
    throw new TypeError('Record reads require an explicit maximum row count.');
  if (!Number.isSafeInteger(input.maxSearchRows ?? input.maxRows) || (input.maxSearchRows ?? input.maxRows) < 1)
    throw new TypeError('Record search requires a positive maximum row count.');
  mountRecordSchemaReadRoutes(router, input);
  for (const route of recordReadRoutes.filter(route => !route.path.includes('/schemas/'))) {
    const browser = route.controller === 'RecordController';
    const action = Object.hasOwn(actions, route.action) ? Reflect.get(actions, route.action) : undefined;
    if (typeof action !== 'function') throw new Error('Unbound read action: ' + route.action);
    router[route.method](
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      httpAction(async (req, res) => {
        if (route.controller === 'webservice/RecordController' && route.action === 'getMeta') {
          await readAction(
            req,
            res,
            {},
            facts => readRecordMetadata(input, facts, route as ApiRouteDefinition),
            (facts, error) => actions.recordReadFailure(input, facts, error)
          );
          return;
        }
        await readAction(
          req,
          res,
          route as Pick<ApiRouteDefinition, 'request'>,
          (facts, valid) => action(input, facts, valid, browser, false),
          (facts, error) => actions.recordReadFailure(input, facts, error)
        );
      })
    );
  }
}
