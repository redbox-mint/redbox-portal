import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import * as actions from '../actions/administration';
import { adminOperationRoutes as declarations } from '../identityRoutes';
export const adminOperationRoutes = declarations;
export interface AdminOperationsHttpInput extends actions.AdminOperationsInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
const operations = {
  getAppConfig: actions.getAppConfig,
  refreshCachedResources: actions.refreshCachedResources,
  setAppConfig: actions.setAppConfig,
};
export function mountAdminOperationRoutes(router: Router, input: AdminOperationsHttpInput): void {
  for (const route of adminOperationRoutes) {
    const action = operations[route.action as keyof typeof operations];
    router[route.method](
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      ...(route.action === 'getAppConfig' ? [] : [input.csrf.apiProtect]),
      httpAction((req, res) =>
        readAction(
          req,
          res,
          {},
          facts => action(input, facts, route),
          (facts, error) => actions.adminOperationFailure(input, facts, error)
        )
      )
    );
  }
}
