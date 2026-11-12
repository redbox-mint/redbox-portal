import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import * as actions from '../actions/harvestMutations';
import type { ReferenceRequest, ReferenceResult } from '../actions/reference';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { harvestMutationRoutes as declarations } from '../mutationRoutes';
export const harvestMutationRoutes = declarations;
export interface HarvestMutationHttpInput extends actions.HarvestMutationInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountHarvestMutationRoutes(router: Router, input: HarvestMutationHttpInput): void {
  const named: Readonly<
    Record<string, (req: ReferenceRequest, contract: Pick<ApiRouteDefinition, 'request'>) => Promise<ReferenceResult>>
  > = {
    harvest: (req, contract) => actions.harvest(input, req, contract),
    legacyHarvest: (req, contract) => actions.legacyHarvest(input, req, contract),
  };
  for (const route of harvestMutationRoutes) {
    const action = Object.hasOwn(named, route.action) ? named[route.action] : undefined;
    if (!action) throw new Error('Unbound mutation action ' + route.action);
    router[route.method](
      route.path.replace(':key*', '*key'),
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      input.csrf.apiProtect,
      httpAction((req, res) =>
        readAction(
          req,
          res,
          {},
          facts => action(facts, route),
          (facts, error) => actions.harvestMutationFailure(input, facts, error)
        )
      )
    );
  }
}
