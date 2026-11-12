import { UserAccountLinkError, type Services as Users } from '../../identity/Users';
import type { UserAttributes } from '../../persistence/rows';
import { BrandingModel } from '../../model/storage/BrandingModel';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { validateApiRouteRequest } from '../../api-routes/validation';
import { administratorRefusal } from '../actors';
import {
  referenceData,
  referenceErrors,
  referenceValidationErrors,
  referenceValue,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';
export interface IdentityLinksInput {
  readonly users: Pick<
    Users.Users,
    | 'getUsersForBrand'
    | 'findUsersWithQuery'
    | 'enrichUsersWithLinkMetadata'
    | 'enrichUsersWithEffectiveDisabledState'
    | 'requireUserInBrand'
    | 'getLinkedAccounts'
    | 'getUserAudit'
    | 'searchLinkCandidates'
    | 'linkAccounts'
  >;
  readonly hiddenUsers?: readonly string[];
  readonly log: ILogger;
}
class IdentityLinkError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
function text(value: unknown, required = true): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > 4096)
    throw new IdentityLinkError(400, 'Invalid user parameter');
  return value;
}
export function identityLinkPrelude(request: ReferenceRequest): ReferenceResult | undefined {
  const refusal = administratorRefusal(request.context.actor, request.context.brand.id);
  if (refusal) return referenceErrors(request, refusal.status, [{ detail: refusal.detail }]);
}
export function identityLinkFailure(
  input: Pick<IdentityLinksInput, 'log'>,
  request: ReferenceRequest,
  error: unknown
): ReferenceResult {
  input.log.error('User administration request failed');
  return referenceErrors(
    request,
    error instanceof IdentityLinkError ? error.status : error instanceof UserAccountLinkError ? 400 : 500,
    [
      {
        detail:
          error instanceof IdentityLinkError || error instanceof UserAccountLinkError
            ? error.message
            : 'Failed to process user request',
      },
    ]
  );
}
type Contract = Pick<ApiRouteDefinition, 'request'>;
interface LinkContext {
  query: Record<string, unknown>;
  body: Record<string, unknown>;
}
async function links(
  input: IdentityLinksInput,
  request: ReferenceRequest,
  contract: Contract,
  action: (context: LinkContext) => Promise<ReferenceResult>
): Promise<ReferenceResult> {
  const refusal = identityLinkPrelude(request);
  if (refusal) return refusal;
  const valid = validateApiRouteRequest(request, contract);
  if (!valid.valid) return referenceValidationErrors(request, valid.issues);
  const body = valid.body ?? {};
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new IdentityLinkError(400, 'Invalid user payload');
  return action({ query: valid.query, body: body as Record<string, unknown> });
}
async function requireTarget(input: IdentityLinksInput, request: ReferenceRequest, id: string) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new IdentityLinkError(400, 'Invalid user identifier');
  const user = await input.users.requireUserInBrand(id, request.context.brand.id);
  if (!user) throw new IdentityLinkError(404, 'User not found');
  return user;
}
function sanitize(user: UserAttributes, brandId: string) {
  const copy: Record<string, unknown> = { ...user };
  delete copy.password;
  delete copy.token;
  if (Array.isArray(copy.roles))
    copy.roles = copy.roles.filter(role => {
      if (!role || typeof role !== 'object') return false;
      const branding = Reflect.get(role, 'branding');
      return (typeof branding === 'object' && branding !== null ? Reflect.get(branding, 'id') : branding) === brandId;
    });
  return copy;
}
export function linkAccounts(input: IdentityLinksInput, request: ReferenceRequest, contract: Contract) {
  return links(input, request, contract, async ({ body }) => {
    const primary = text(body.primaryUserId),
      secondary = text(body.secondaryUserId);
    if (!/^[a-f0-9]{24}$/.test(secondary)) throw new IdentityLinkError(400, 'Invalid user identifier');
    if (primary === secondary) throw new IdentityLinkError(400, 'Cannot link a user account to itself');
    await requireTarget(input, request, primary);
    return referenceData(
      request,
      await referenceValue(
        input.users.linkAccounts(primary, secondary, request.context.actor!.username, request.context.brand.id)
      )
    );
  });
}
export function searchLinkCandidates(input: IdentityLinksInput, request: ReferenceRequest, contract: Contract) {
  return links(input, request, contract, async ({ query }) => {
    const primary = text(query.primaryUserId);
    await requireTarget(input, request, primary);
    return referenceData(
      request,
      await referenceValue(input.users.searchLinkCandidates(text(query.query), request.context.brand.id, primary))
    );
  });
}
export function getUserLinks(input: IdentityLinksInput, request: ReferenceRequest, contract: Contract) {
  return links(input, request, contract, async () => {
    const id = text(request.params.id);
    await requireTarget(input, request, id);
    return referenceData(request, await referenceValue(input.users.getLinkedAccounts(id, request.context.brand.id)));
  });
}
export function getUserAudit(input: IdentityLinksInput, request: ReferenceRequest, contract: Contract) {
  return links(input, request, contract, async () => {
    const id = text(request.params.id),
      user = await requireTarget(input, request, id);
    return referenceData(request, {
      user: sanitize(user, request.context.brand.id),
      ...(await input.users.getUserAudit(id, request.context.brand.id)),
    });
  });
}
async function readUsers(
  input: IdentityLinksInput,
  request: ReferenceRequest,
  contract: Contract,
  mode: 'list' | 'find' | 'browser'
) {
  return links(input, request, contract, async ({ query }) => {
    const { brand } = request.context,
      find = mode === 'find';
    const field = text(query.searchBy, find),
      search = text(query.query, find);
    if (field && !new Set(['id', 'username', 'name', 'email', 'type']).has(field))
      throw new IdentityLinkError(400, 'Invalid user search field');
    let all: UserAttributes[];
    if (find) {
      const candidates = await referenceValue(input.users.findUsersWithQuery({ [field]: search }, null));
      all = [];
      for (const candidate of candidates) {
        const user = await input.users.requireUserInBrand(String(candidate.id), brand.id);
        if (user) {
          all.push(user);
          break;
        }
      }
    } else all = await referenceValue(input.users.getUsersForBrand(Object.assign(new BrandingModel(), brand)));
    const enriched = await input.users.enrichUsersWithEffectiveDisabledState(
      await input.users.enrichUsersWithLinkMetadata(all, brand.id)
    );
    const users = enriched
      .filter(
        u =>
          (mode !== 'browser' || !(input.hiddenUsers ?? []).includes(String(u.name))) &&
          (find || query.includeDisabled === 'true' || u.effectiveLoginDisabled !== true) &&
          (!field || String(Reflect.get(u, field) ?? '') === search)
      )
      .map(u => sanitize(u, brand.id));
    if (find)
      return users[0]
        ? referenceData(request, users[0])
        : referenceErrors(request, 404, [
            { title: 'No user found with given criteria', detail: `Searchby: ${field} and Query: ${search}` },
          ]);
    if (mode === 'browser')
      return referenceData(
        request,
        users.map(u => ({ ...u, token: u.hasApiKey ? 'user-has-token-but-is-suppressed' : null }))
      );
    const page = query.page === undefined ? 1 : Number(query.page),
      size = query.pageSize === undefined ? 10 : Number(query.pageSize);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || size > 1000)
      throw new IdentityLinkError(400, 'Invalid pagination');
    return referenceData(request, {
      summary: { numFound: users.length, page, start: 0 },
      records: users.slice((page - 1) * size, page * size),
    });
  });
}
export const listUsers = (input: IdentityLinksInput, request: ReferenceRequest, contract: Contract) =>
  readUsers(input, request, contract, 'list');
export const getUser = (input: IdentityLinksInput, request: ReferenceRequest, contract: Contract) =>
  readUsers(input, request, contract, 'find');
export const getUsers = (input: IdentityLinksInput, request: ReferenceRequest, contract: Contract) =>
  readUsers(input, request, contract, 'browser');
