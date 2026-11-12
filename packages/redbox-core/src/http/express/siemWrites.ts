import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import * as actions from '../actions/administration';
import { siemWriteRoutes as declarations } from '../identityRoutes';
export const siemWriteRoutes = declarations;
export interface SiemWritesHttpInput extends actions.SiemWritesInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
const operations = { saveConfig: actions.saveConfig, testDestination: actions.testDestination };
export function mountSiemWriteRoutes(router: Router, input: SiemWritesHttpInput): void {
  for (const route of siemWriteRoutes) {
    const action = operations[route.action as keyof typeof operations];
    router[route.method](
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      ...[input.csrf.apiProtect],
      httpAction((req, res) =>
        readAction(
          req,
          res,
          {},
          facts => action(input, facts, route),
          (facts, error) => actions.siemWriteFailure(input, facts, error, route.action === 'testDestination')
        )
      )
    );
  }
}
