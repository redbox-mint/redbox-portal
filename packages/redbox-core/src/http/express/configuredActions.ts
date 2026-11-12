import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import * as actions from '../actions/configuredActions';
import { configuredActionRoutes as declarations } from '../mutationRoutes';
export const configuredActionRoutes = declarations;
export type { ConfiguredAction, ConfiguredActionContext } from '../actions/configuredActions';
export interface ConfiguredActionHttpInput extends actions.ConfiguredActionInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountConfiguredActionRoutes(router: Router, input: ConfiguredActionHttpInput): void {
  const route = configuredActionRoutes[0]!;
  router.post(
    route.path,
    ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
    input.csrf.protect,
    httpAction((req, res) =>
      readAction(
        req,
        res,
        {},
        facts => actions.callService(input, facts),
        facts => actions.configuredActionFailure(input, facts)
      )
    )
  );
}
