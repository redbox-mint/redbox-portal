import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import type { ReferenceRequest } from '../actions/reference';
import * as actions from '../actions/integrationOperations';
import { integrationOperationRoutes } from '../integrationRoutes';
export { integrationOperationRoutes } from '../integrationRoutes';
export interface IntegrationOperationsHttpInput extends actions.IntegrationOperationsInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountIntegrationOperationRoutes(router: Router, input: IntegrationOperationsHttpInput): void {
  const bindings = integrationOperationRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings) {
    const operations = {
      index: (facts: ReferenceRequest) => actions.index(input, facts, route),
      indexAll: (facts: ReferenceRequest) => actions.indexAll(input, facts, route),
      removeAll: (facts: ReferenceRequest) => actions.removeAll(input, facts, route),
      sendNotification: (facts: ReferenceRequest) => actions.sendNotification(input, facts, route),
    };
    const action = Object.hasOwn(operations, route.action)
      ? operations[route.action as keyof typeof operations]
      : undefined;
    if (!action) throw new Error('Missing declared integration action: ' + route.action);
    router[route.method](
      route.path,
      ...policies,
      ...(route.method === 'get' ? [] : [input.csrf.apiProtect]),
      httpAction((req, res) =>
        readAction(
          req,
          res,
          {},
          facts => action(facts),
          facts => actions.integrationOperationFailure(input, facts)
        )
      )
    );
  }
}
