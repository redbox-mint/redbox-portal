import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import * as actions from '../actions/identityLinks';
import { identityLinkRoutes as declarations } from '../identityRoutes';
export const identityLinkRoutes = declarations;
export interface IdentityLinksHttpInput extends actions.IdentityLinksInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
}
const operations = {
  listUsers: actions.listUsers,
  getUser: actions.getUser,
  getUsers: actions.getUsers,
  searchLinkCandidates: actions.searchLinkCandidates,
  getUserLinks: actions.getUserLinks,
  getUserAudit: actions.getUserAudit,
  linkAccounts: actions.linkAccounts,
};
export function mountIdentityLinkRoutes(router: Router, input: IdentityLinksHttpInput): void {
  for (const route of identityLinkRoutes) {
    const action = operations[route.action as keyof typeof operations];
    router[route.method](
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      ...(route.method === 'get' ? [] : [route.path.includes('/api/') ? input.csrf.apiProtect : input.csrf.protect]),
      httpAction((req, res) =>
        readAction(
          req,
          res,
          {},
          facts => action(input, facts, 'request' in route ? route : {}),
          (facts, error) => actions.identityLinkFailure(input, facts, error)
        )
      )
    );
  }
}
