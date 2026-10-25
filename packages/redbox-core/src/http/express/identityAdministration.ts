import { RequestChronicleHelper } from '../../utilities/RequestChronicle';
import { randomUUID } from 'node:crypto';
import type { RequestHandler, Router } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import { hasForeignBrandRoles, type Services as Users } from '../../identity/Users';
import type { Services as Roles } from '../../identity/Roles';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { userApiRoutes } from '../../api-routes/groups/users';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { ApiRouteDefinition } from '../../api-routes/types';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, requestContext, resolveEffectivePolicies } from './policies';
import { httpAction, singleHttpResult, recordHttpFailure } from './middleware';
import { sendApiData, sendApiErrors, validationApiVersion } from './responses';

// Account linking and audit disclosure retain explicit dependencies; do not mount incomplete slices.
const actions = new Set([
  'createUser',
  'updateUser',
  'disableUser',
  'enableUser',
  'generateAPIToken',
  'revokeAPIToken',
  'listSystemRoles',
  'createSystemRole',
]);
const aliases = [
  ['post', '/admin/users/:id/disable', 'AdminController', 'disableUser'],
  ['post', '/admin/users/:id/enable', 'AdminController', 'enableUser'],
  ['post', '/admin/users/genKey', 'AdminController', 'generateUserKey'],
  ['post', '/admin/users/revokeKey', 'AdminController', 'revokeUserKey'],
  ['post', '/admin/users/newUser', 'AdminController', 'addLocalUser'],
  ['post', '/admin/users/update', 'AdminController', 'updateUserDetails'],
  ['post', '/admin/roles/user', 'AdminController', 'updateUserRoles'],
  ['get', '/admin/roles/get', 'AdminController', 'getBrandRoles'],
  ['post', '/user/genKey', 'UserController', 'generateUserKey'],
  ['post', '/user/revokeKey', 'UserController', 'revokeUserKey'],
  ['post', '/user/update', 'UserController', 'update'],
] as const;
export const identityAdministrationRoutes = [
  ...userApiRoutes.filter(route => actions.has(route.action)),
  ...aliases.map(([method, path, controller, action]) => ({
    method,
    path: '/:branding/:portal' + path,
    controller,
    action,
  })),
];
export interface IdentityAdministrationHttpInput {
  readonly users: Pick<
    Users.Users,
    | 'getUserWithUsername'
    | 'requireUserInBrand'
    | 'addLocalUser'
    | 'updateUserDetails'
    | 'updateUserRoles'
    | 'disableUser'
    | 'enableUser'
    | 'setUserKey'
    | 'addUserAuditEvent'
  >;
  readonly roles: Pick<Roles.Roles, 'getRolesWithBrand' | 'createRoleWithBrand'>;
  readonly hiddenRoles?: readonly string[];
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly log: ILogger;
}
class IdentityAdministrationError extends Error {
  public constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new IdentityAdministrationError(400, 'Request body must be an object');
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '_csrf'));
}
function text(value: unknown, required = true): string {
  if (value === undefined && !required) return '';
  if (
    typeof value !== 'string' ||
    (required && !value.trim()) ||
    value.length > 4096 ||
    [...value].some(c => c.charCodeAt(0) < 32)
  )
    throw new IdentityAdministrationError(400, 'Invalid user parameter');
  return value;
}
/** Account administration over the selected owned modules. No controller or global service dispatch. */
export function mountIdentityAdministrationRoutes(router: Router, input: IdentityAdministrationHttpInput): void {
  for (const route of identityAdministrationRoutes) {
    const action =
      (
        {
          generateUserKey: 'generateAPIToken',
          revokeUserKey: 'revokeAPIToken',
          addLocalUser: 'createUser',
          updateUserDetails: 'updateUser',
          getBrandRoles: 'listSystemRoles',
          update: 'updateUser',
        } as Record<string, string>
      )[route.action] ?? route.action;
    const browser = !route.path.includes('/api/');
    router[route.method](
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      ...(route.method === 'get' ? [] : [browser ? input.csrf.protect : input.csrf.apiProtect]),
      httpAction(async (req, res) => {
        try {
          const { brand: snapshot, actor } = requestContext(req);
          if (!actor) {
            sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
            return;
          }
          if (!actor.roles.some(role => role.brandId === snapshot.id))
            throw new IdentityAdministrationError(403, 'Access Denied');
          const self = route.controller === 'UserController';
          if (!self && !actor.roles.some(role => role.brandId === snapshot.id && role.name === 'Admin'))
            throw new IdentityAdministrationError(403, 'Access Denied');
          const brand = Object.assign(new BrandingModel(), snapshot);
          let body = object(req.body ?? {});
          let query: Record<string, unknown> = req.query;
          if ('request' in route) {
            const validated = validateApiRouteRequest(req, route as ApiRouteDefinition);
            if (!validated.valid) {
              sendApiErrors(
                req,
                res,
                400,
                validated.issues.map(i => ({ title: i.path, detail: i.message })),
                validationApiVersion(req)
              );
              return;
            }
            if (validated.body !== undefined) body = object(validated.body);
            query = validated.query;
          }
          const roles = await singleHttpResult(input.roles.getRolesWithBrand(brand));
          const roleIds = (value: unknown) => {
            if (!Array.isArray(value) || value.length > 100)
              throw new IdentityAdministrationError(400, 'Invalid roles');
            const names = value.map(role => text(typeof role === 'string' ? role : object(role).name));
            const resolved = names.map(name => roles.find(role => role.name === name));
            if (resolved.some(role => !role)) throw new IdentityAdministrationError(400, 'Unknown role for brand');
            return resolved.map(role => role!.id);
          };
          const send = (data: unknown, status = 200) => sendApiData(req, res, data, status);
          if (action === 'listSystemRoles') {
            const visible = browser ? roles.filter(role => !input.hiddenRoles?.includes(role.name)) : roles;
            send(browser ? visible : { summary: { numFound: visible.length, page: 1, start: 0 }, records: visible });
            return;
          }
          if (action === 'createSystemRole') {
            const name = text(body.roleName ?? query.roleName ?? req.params.roleName);
            if (name.length > 100) throw new IdentityAdministrationError(400, 'Invalid role name');
            await input.roles.createRoleWithBrand(brand, name);
            await input.users.addUserAuditEvent(actor, 'create-role', { brandId: brand.id, roleName: name });
            send({ message: name + ' create call success', details: name + ' create call success' });
            return;
          }
          const details = browser && (action === 'createUser' || action === 'updateUser') ? object(body.details) : body;
          let userId = self
            ? actor.id
            : action === 'createUser'
              ? ''
              : text(req.params.id ?? (browser ? body.userid : action === 'updateUser' ? body.id : query.id));
          const existing =
            action === 'createUser'
              ? await singleHttpResult(input.users.getUserWithUsername(text(body.username)))
              : null;
          if (existing) userId = String(existing.id);
          if (existing && browser) {
            send({ status: false, message: 'Username already exists' });
            return;
          }
          if (userId && !/^[a-f0-9]{24}$/i.test(userId))
            throw new IdentityAdministrationError(400, 'Invalid user identifier');
          const target = userId ? await input.users.requireUserInBrand(userId, brand.id) : null;
          if (userId && !target) throw new IdentityAdministrationError(403, 'Unauthorized cross-brand access');
          if (
            target &&
            userId !== actor.id &&
            ['updateUser', 'disableUser', 'enableUser', 'generateAPIToken', 'revokeAPIToken'].includes(action) &&
            hasForeignBrandRoles(target, brand.id)
          )
            throw new IdentityAdministrationError(403, 'Shared account changes require the account owner');
          if (action === 'disableUser' || action === 'enableUser') {
            if (action === 'disableUser' && userId === actor.id)
              throw new IdentityAdministrationError(400, 'You cannot disable your own account');
            if (target!.accountLinkState === 'linked-alias')
              throw new IdentityAdministrationError(400, 'Manage the primary account instead');
            await input.users[action](userId, actor.username, brand.id);
            send({
              status: true,
              message: action === 'disableUser' ? 'User disabled successfully' : 'User enabled successfully',
            });
            return;
          }
          if (action === 'generateAPIToken' || action === 'revokeAPIToken') {
            const token = action === 'generateAPIToken' ? randomUUID() : '';
            await singleHttpResult(input.users.setUserKey(userId, token));
            await input.users.addUserAuditEvent(
              actor,
              action === 'generateAPIToken' ? 'generate-api-token' : 'revoke-api-token',
              { brandId: brand.id, userId }
            );
            send(
              browser
                ? { status: true, message: token || 'UUID revoked successfully' }
                : { id: userId, username: target!.username, token }
            );
            return;
          }
          if (self && details.roles !== undefined)
            throw new IdentityAdministrationError(400, 'Profile updates cannot change roles');
          const selected = details.roles === undefined ? undefined : roleIds(details.roles);
          if (action === 'updateUserRoles') {
            const selectedIds = roleIds(body.roles);
            await singleHttpResult(input.users.updateUserRoles(userId, selectedIds, brand.id));
            await input.users.addUserAuditEvent(actor, 'update-user-roles', { brandId: brand.id, userId });
            send({ status: true, message: 'Save OK.' });
            return;
          }
          if (self && browser && (typeof details.name !== 'string' || !details.name.trim())) {
            RequestChronicleHelper.existing(req)?.addInfo({ userDetailsUpdateSuccess: false });
            send({ status: false, message: 'Error: name must not be null' });
            return;
          }
          const name = text(details.name);
          const email = text(details.email, false);
          const password = text(details.password, action === 'createUser' && !existing);
          const user =
            action === 'createUser'
              ? (existing ??
                (await singleHttpResult(input.users.addLocalUser(text(body.username), name, email, password))))
              : (await singleHttpResult(input.users.updateUserDetails(userId, name, email, password)))[0];
          if (!user) throw new IdentityAdministrationError(404, 'User not found');
          try {
            if (selected) await singleHttpResult(input.users.updateUserRoles(user.id, selected, brand.id));
          } catch (error) {
            // Legacy API create acknowledges its committed account even when role assignment fails.
            await input.users.addUserAuditEvent(actor, 'user-role-assignment-failed', {
              brandId: brand.id,
              userId: user.id,
            });
            if (action !== 'createUser' || browser) throw error;
            input.log.warn('Created user but role assignment failed.');
          }
          await input.users.addUserAuditEvent(actor, action === 'createUser' ? 'create-user' : 'update-user', {
            brandId: brand.id,
            userId: user.id,
          });
          if (self) RequestChronicleHelper.existing(req)?.addInfo({ userDetailsUpdateSuccess: true });
          send(
            browser
              ? {
                  status: true,
                  message: self
                    ? 'Profile updated successfully.'
                    : action === 'createUser'
                      ? 'User created successfully'
                      : details.roles
                        ? 'User updated successfully'
                        : 'Save OK.',
                }
              : {
                  id: user.id,
                  username: user.username,
                  name: user.name,
                  email: user.email,
                  type: user.type,
                  lastLogin: user.lastLogin,
                },
            browser ? 200 : 201
          );
        } catch (error) {
          recordHttpFailure(
            req,
            input.log,
            'User administration failed',
            route.controller === 'UserController' && route.action === 'update'
              ? { userDetailsUpdateSuccess: false }
              : {}
          );
          sendApiErrors(req, res, error instanceof IdentityAdministrationError ? error.status : 500, [
            { detail: error instanceof IdentityAdministrationError ? error.message : 'User administration failed.' },
          ]);
        }
      })
    );
  }
}
