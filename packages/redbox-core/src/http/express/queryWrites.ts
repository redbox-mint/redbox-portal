import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import * as actions from '../actions/queryWrites';
import type { ReferenceRequest, ReferenceResult } from '../actions/reference';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { queryWriteRoutes as declarations } from '../mutationRoutes';
export const queryWriteRoutes = declarations;
export interface QueryWriteHttpInput extends actions.QueryWriteInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountQueryWriteRoutes(router: Router, input: QueryWriteHttpInput): void {
  const named: Readonly<
    Record<string, (req: ReferenceRequest, contract: Pick<ApiRouteDefinition, 'request'>) => Promise<ReferenceResult>>
  > = {
    createQuery: (req, contract) => actions.createQuery(input, req, contract),
    updateQuery: (req, contract) => actions.updateQuery(input, req, contract),
    deleteQuery: (req, contract) => actions.deleteQuery(input, req, contract),
    createConfig: (req, contract) => actions.createConfig(input, req, contract),
    updateConfig: (req, contract) => actions.updateConfig(input, req, contract),
    deleteConfig: (req, contract) => actions.deleteConfig(input, req, contract),
  };
  for (const route of queryWriteRoutes) {
    const browser = route.controller === 'ReportController';
    const action = Object.hasOwn(named, route.action) ? named[route.action] : undefined;
    if (!action) throw new Error('Unbound mutation action ' + route.action);
    router[route.method](
      route.path.replace(':key*', '*key'),
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      browser ? input.csrf.protect : input.csrf.apiProtect,
      httpAction((req, res) =>
        readAction(
          req,
          res,
          {},
          facts => action(facts, route),
          (facts, error) => actions.queryWriteFailure(input, facts, error, route.action.endsWith('Query'))
        )
      )
    );
  }
}
