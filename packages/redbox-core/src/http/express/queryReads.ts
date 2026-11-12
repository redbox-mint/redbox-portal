import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { ApiRouteDefinition } from '../../api-routes/types';
import * as actions from '../actions/queryReads';
import type { QueryReadInput } from '../actions/queryReads';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import { queryReadRoutes as declarations } from '../readRoutes';
export const queryReadRoutes = declarations;
import type { createHttpCsrf } from './csrf';
export interface QueryReadHttpInput extends QueryReadInput {
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
}
export function mountQueryReadRoutes(router: Router, input: QueryReadHttpInput): void {
  for (const route of queryReadRoutes) {
    const browser = route.controller === 'ReportController';
    const name = route.controller.includes('Siem') && route.action === 'getConfig' ? 'getSiemConfig' : route.action;
    const action = Object.hasOwn(actions, name) ? Reflect.get(actions, name) : undefined;
    if (typeof action !== 'function') throw new Error('Unbound read action: ' + route.action);
    router[route.method](
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      ...(route.method === 'post' ? [route.path.includes('/api/') ? input.csrf.apiProtect : input.csrf.protect] : []),
      httpAction(async (req, res) => {
        await readAction(
          req,
          res,
          route as Pick<ApiRouteDefinition, 'request'>,
          (facts, valid) =>
            action(
              input,
              facts,
              valid,
              ...(route.action === 'getConfig' && !route.controller.includes('Siem') ? [browser] : [])
            ),
          (facts, error) => actions.queryReadFailure(facts, error, browser, route.action === 'downloadCSV')
        );
      })
    );
  }
}
