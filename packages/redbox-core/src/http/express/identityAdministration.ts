import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import * as actions from '../actions/identityAdministration';
import { identityAdministrationRoutes as declarations } from '../identityRoutes';
export const identityAdministrationRoutes = declarations;
export interface IdentityAdministrationHttpInput extends actions.IdentityAdministrationInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
}
const operations = {
  createUser: actions.createUser,
  updateUser: actions.updateUser,
  disableUser: actions.disableUser,
  enableUser: actions.enableUser,
  generateAPIToken: actions.generateAPIToken,
  revokeAPIToken: actions.revokeAPIToken,
  listSystemRoles: actions.listSystemRoles,
  createSystemRole: actions.createSystemRole,
  generateUserKey: actions.generateAPIToken,
  revokeUserKey: actions.revokeAPIToken,
  addLocalUser: actions.createUser,
  updateUserDetails: actions.updateUser,
  getBrandRoles: actions.listSystemRoles,
  update: actions.updateUser,
  updateUserRoles: actions.updateUserRoles,
};
export function mountIdentityAdministrationRoutes(router: Router, input: IdentityAdministrationHttpInput): void {
  for (const route of identityAdministrationRoutes) {
    const browser = !route.path.includes('/api/'),
      self = route.controller === 'UserController';
    const action = operations[route.action as keyof typeof operations];
    router[route.method](
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      ...(route.method === 'get' ? [] : [browser ? input.csrf.protect : input.csrf.apiProtect]),
      httpAction((req, res) =>
        readAction(
          req,
          res,
          {},
          facts => action(input, facts, 'request' in route ? route : {}, browser, self),
          (facts, error) =>
            actions.identityAdministrationFailure(input, facts, error, self && route.action === 'update')
        )
      )
    );
  }
}
