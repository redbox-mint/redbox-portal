import { randomUUID } from 'node:crypto';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import { hasForeignBrandRoles, type Services as Users } from '../../identity/Users';
import type { Services as Roles } from '../../identity/Roles';
import { BrandingModel } from '../../model/storage/BrandingModel';
import type { RoleModel } from '../../model/storage/RoleModel';
import type { AuthenticatedActor } from '../context';
import { administratorRefusal } from '../actors';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { ApiRouteDefinition } from '../../api-routes/types';
import {
  referenceData,
  referenceErrors,
  referenceValidationErrors,
  referenceValue,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';

export interface IdentityAdministrationInput {
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
  readonly log: ILogger;
}
class IdentityAdministrationError extends Error {
  constructor(
    readonly status: number,
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
/** Same early actor and body guards on both hosts, before declared validation. */
export function identityAdministrationPrelude(request: ReferenceRequest, self = false): ReferenceResult | undefined {
  const { brand, actor } = request.context;
  const refusal = self
    ? !actor
      ? { status: 401, detail: 'Authentication required' }
      : !actor.roles.some(role => role.brandId === brand.id)
        ? { status: 403, detail: 'Access Denied' }
        : undefined
    : administratorRefusal(actor, brand.id);
  if (refusal) return referenceErrors(request, refusal.status, [{ detail: refusal.detail }]);
  object(request.body ?? {});
}
export function identityAdministrationFailure(
  input: { readonly log: Pick<ILogger, 'error'> },
  request: ReferenceRequest,
  error: unknown,
  profile = false
): ReferenceResult {
  request.recordFailure?.();
  if (profile) request.observe?.({ userDetailsUpdateSuccess: false });
  input.log.error('User administration failed');
  return referenceErrors(request, error instanceof IdentityAdministrationError ? error.status : 500, [
    { detail: error instanceof IdentityAdministrationError ? error.message : 'User administration failed.' },
  ]);
}
interface AdministrationContext {
  request: ReferenceRequest;
  input: IdentityAdministrationInput;
  actor: AuthenticatedActor;
  brand: BrandingModel;
  body: Record<string, unknown>;
  query: Record<string, unknown>;
  roles: RoleModel[];
  browser: boolean;
  self: boolean;
}
type Contract = Pick<ApiRouteDefinition, 'request'>;
async function administer(
  input: IdentityAdministrationInput,
  request: ReferenceRequest,
  contract: Contract,
  browser: boolean,
  self: boolean,
  action: (context: AdministrationContext) => Promise<ReferenceResult>
): Promise<ReferenceResult> {
  const refusal = identityAdministrationPrelude(request, self);
  if (refusal) return refusal;
  let body = object(request.body ?? {});
  const valid = validateApiRouteRequest(request, contract);
  if (!valid.valid) return referenceValidationErrors(request, valid.issues);
  if (valid.body !== undefined) body = object(valid.body);
  const brand = Object.assign(new BrandingModel(), request.context.brand);
  return action({
    input,
    request,
    actor: request.context.actor!,
    brand,
    body,
    query: valid.query,
    roles: await referenceValue(input.roles.getRolesWithBrand(brand)),
    browser,
    self,
  });
}
function roleIds(context: AdministrationContext, value: unknown) {
  if (!Array.isArray(value) || value.length > 100) throw new IdentityAdministrationError(400, 'Invalid roles');
  const names = value.map(role => text(typeof role === 'string' ? role : object(role).name));
  const resolved = names.map(name => context.roles.find(role => role.name === name));
  if (resolved.some(role => !role)) throw new IdentityAdministrationError(400, 'Unknown role for brand');
  return resolved.map(role => role!.id);
}
async function target(context: AdministrationContext, protectShared = true) {
  const { self, actor, request, body, browser, query } = context;
  const id = self ? actor.id : text(request.params.id ?? (browser ? body.userid : query.id));
  return targetById(context, id, protectShared);
}
async function targetById({ input, brand, actor }: AdministrationContext, id: string, protectShared: boolean) {
  if (id && !/^[a-f0-9]{24}$/i.test(id)) throw new IdentityAdministrationError(400, 'Invalid user identifier');
  const user = id ? await input.users.requireUserInBrand(id, brand.id) : null;
  if (id && !user) throw new IdentityAdministrationError(403, 'Unauthorized cross-brand access');
  if (user && id !== actor.id && protectShared && hasForeignBrandRoles(user, brand.id))
    throw new IdentityAdministrationError(403, 'Shared account changes require the account owner');
  return { id, user };
}
export function listSystemRoles(
  input: IdentityAdministrationInput,
  request: ReferenceRequest,
  contract: Contract,
  browser = false
) {
  return administer(input, request, contract, browser, false, async context => {
    const visible = browser ? context.roles.filter(role => !input.hiddenRoles?.includes(role.name)) : context.roles;
    return referenceData(
      request,
      browser ? visible : { summary: { numFound: visible.length, page: 1, start: 0 }, records: visible }
    );
  });
}
export function createSystemRole(input: IdentityAdministrationInput, request: ReferenceRequest, contract: Contract) {
  return administer(input, request, contract, false, false, async ({ brand, actor, body, query }) => {
    const name = text(body.roleName ?? query.roleName ?? request.params.roleName);
    if (name.length > 100) throw new IdentityAdministrationError(400, 'Invalid role name');
    await input.roles.createRoleWithBrand(brand, name);
    await input.users.addUserAuditEvent(actor, 'create-role', { brandId: brand.id, roleName: name });
    return referenceData(request, { message: name + ' create call success', details: name + ' create call success' });
  });
}
async function setDisabled(context: AdministrationContext, disabled: boolean) {
  const { input, actor, brand, request } = context,
    { id, user } = await target(context);
  if (disabled && id === actor.id) throw new IdentityAdministrationError(400, 'You cannot disable your own account');
  if (user!.accountLinkState === 'linked-alias')
    throw new IdentityAdministrationError(400, 'Manage the primary account instead');
  if (disabled) await input.users.disableUser(id, actor.username, brand.id);
  else await input.users.enableUser(id, actor.username, brand.id);
  return referenceData(request, {
    status: true,
    message: disabled ? 'User disabled successfully' : 'User enabled successfully',
  });
}
export const disableUser = (
  input: IdentityAdministrationInput,
  request: ReferenceRequest,
  contract: Contract,
  browser = false
) => administer(input, request, contract, browser, false, context => setDisabled(context, true));
export const enableUser = (
  input: IdentityAdministrationInput,
  request: ReferenceRequest,
  contract: Contract,
  browser = false
) => administer(input, request, contract, browser, false, context => setDisabled(context, false));
async function setToken(context: AdministrationContext, generate: boolean) {
  const { input, actor, brand, request, browser } = context,
    { id, user } = await target(context);
  const token = generate ? randomUUID() : '';
  await referenceValue(input.users.setUserKey(id, token));
  await input.users.addUserAuditEvent(actor, generate ? 'generate-api-token' : 'revoke-api-token', {
    brandId: brand.id,
    userId: id,
  });
  return referenceData(
    request,
    browser ? { status: true, message: token || 'UUID revoked successfully' } : { id, username: user!.username, token }
  );
}
export const generateAPIToken = (
  input: IdentityAdministrationInput,
  request: ReferenceRequest,
  contract: Contract,
  browser = false,
  self = false
) => administer(input, request, contract, browser, self, context => setToken(context, true));
export const revokeAPIToken = (
  input: IdentityAdministrationInput,
  request: ReferenceRequest,
  contract: Contract,
  browser = false,
  self = false
) => administer(input, request, contract, browser, self, context => setToken(context, false));
async function saveUser(context: AdministrationContext, create: boolean) {
  const { input, request, actor, brand, body, browser, self } = context;
  const details = browser ? object(body.details) : body;
  let userId = self ? actor.id : create ? '' : text(request.params.id ?? (browser ? body.userid : body.id));
  const existing = create ? await referenceValue(input.users.getUserWithUsername(text(body.username))) : null;
  if (existing) userId = String(existing.id);
  if (existing && browser) return referenceData(request, { status: false, message: 'Username already exists' });
  await targetById(context, userId, !create);
  if (self && details.roles !== undefined)
    throw new IdentityAdministrationError(400, 'Profile updates cannot change roles');
  const selected = details.roles === undefined ? undefined : roleIds(context, details.roles);
  if (self && browser && (typeof details.name !== 'string' || !details.name.trim())) {
    request.observe?.({ userDetailsUpdateSuccess: false });
    return referenceData(request, { status: false, message: 'Error: name must not be null' });
  }
  const name = text(details.name),
    email = text(details.email, false),
    password = text(details.password, create && !existing);
  const user = create
    ? (existing ?? (await referenceValue(input.users.addLocalUser(text(body.username), name, email, password))))
    : (await referenceValue(input.users.updateUserDetails(userId, name, email, password)))[0];
  if (!user) throw new IdentityAdministrationError(404, 'User not found');
  try {
    if (selected) await referenceValue(input.users.updateUserRoles(user.id, selected, brand.id));
  } catch (error) {
    await input.users.addUserAuditEvent(actor, 'user-role-assignment-failed', { brandId: brand.id, userId: user.id });
    if (!create || browser) throw error;
    input.log.warn('Created user but role assignment failed.');
  }
  await input.users.addUserAuditEvent(actor, create ? 'create-user' : 'update-user', {
    brandId: brand.id,
    userId: user.id,
  });
  if (self) request.observe?.({ userDetailsUpdateSuccess: true });
  return {
    ...referenceData(
      request,
      browser
        ? {
            status: true,
            message: self
              ? 'Profile updated successfully.'
              : create
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
          }
    ),
    status: browser ? 200 : 201,
  };
}
export const createUser = (
  input: IdentityAdministrationInput,
  request: ReferenceRequest,
  contract: Contract,
  browser = false
) => administer(input, request, contract, browser, false, context => saveUser(context, true));
export const updateUser = (
  input: IdentityAdministrationInput,
  request: ReferenceRequest,
  contract: Contract,
  browser = false,
  self = false
) => administer(input, request, contract, browser, self, context => saveUser(context, false));
export function updateUserRoles(input: IdentityAdministrationInput, request: ReferenceRequest, contract: Contract) {
  return administer(input, request, contract, true, false, async context => {
    const { id } = await target(context, false);
    const selected = roleIds(context, context.body.roles);
    await referenceValue(input.users.updateUserRoles(id, selected, context.brand.id));
    await input.users.addUserAuditEvent(context.actor, 'update-user-roles', { brandId: context.brand.id, userId: id });
    return referenceData(request, { status: true, message: 'Save OK.' });
  });
}
