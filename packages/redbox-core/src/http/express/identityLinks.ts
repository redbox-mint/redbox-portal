import { UserAccountLinkError } from '../../identity/Users';
import type { UserAttributes } from '../../persistence/rows';
import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Users } from '../../identity/Users';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { userApiRoutes } from '../../api-routes/groups/users';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction, singleHttpResult } from './middleware';
import { sendApiData, sendApiErrors, validationApiVersion } from './responses';

const actions = new Set([
  'listUsers',
  'getUser',
  'searchLinkCandidates',
  'getUserLinks',
  'getUserAudit',
  'linkAccounts',
]);
const aliases = [
  ['get', '/admin/users/get', 'getUsers'],
  ['get', '/admin/users/link/candidates', 'searchLinkCandidates'],
  ['get', '/admin/users/:id/links', 'getUserLinks'],
  ['get', '/admin/users/:id/audit', 'getUserAudit'],
  ['post', '/admin/users/link', 'linkAccounts'],
] as const;
export const identityLinkRoutes = [
  ...userApiRoutes.filter(route => actions.has(route.action)),
  ...aliases.map(([method, path, action]) => ({
    method,
    path: '/:branding/:portal' + path,
    controller: 'AdminController',
    action,
  })),
];
export interface IdentityLinksHttpInput {
  readonly users: Pick<
    Users.Users,
    | 'getUsersForBrand'
    | 'enrichUsersWithLinkMetadata'
    | 'enrichUsersWithEffectiveDisabledState'
    | 'requireUserInBrand'
    | 'getLinkedAccounts'
    | 'getUserAudit'
    | 'searchLinkCandidates'
    | 'linkAccounts'
  >;
  readonly hiddenUsers?: readonly string[];
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly log: ILogger;
}
class IdentityLinkError extends Error {
  constructor(
    public readonly status: number,
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
export function mountIdentityLinkRoutes(router: Router, input: IdentityLinksHttpInput): void {
  const bindings = identityLinkRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings)
    router[route.method](
      route.path,
      ...policies,
      ...(route.method === 'get' ? [] : [route.path.includes('/api/') ? input.csrf.apiProtect : input.csrf.protect]),
      httpAction(async (req, res) => {
        try {
          const { brand, actor } = requestContext(req);
          if (!actor) throw new IdentityLinkError(401, 'Authentication required');
          if (!actor.roles.some(r => r.brandId === brand.id && r.name === 'Admin'))
            throw new IdentityLinkError(403, 'Access Denied');
          let query: Record<string, unknown> = req.query;
          let body: Record<string, unknown> = req.body ?? {};
          if ('request' in route) {
            const validated = validateApiRouteRequest(req, route);
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
            query = validated.query;
            body = (validated.body as Record<string, unknown>) ?? {};
          }
          if (!body || typeof body !== 'object' || Array.isArray(body))
            throw new IdentityLinkError(400, 'Invalid user payload');
          const requireTarget = async (id: string) => {
            if (!/^[a-f0-9]{24}$/.test(id)) throw new IdentityLinkError(400, 'Invalid user identifier');
            const user = await input.users.requireUserInBrand(id, brand.id);
            if (!user) throw new IdentityLinkError(404, 'User not found');
            return user;
          };
          const sanitize = (user: UserAttributes) => {
            const copy: Record<string, unknown> = { ...user };
            delete copy.password;
            delete copy.token;
            if (Array.isArray(copy.roles))
              copy.roles = copy.roles.filter(role => {
                if (!role || typeof role !== 'object') return false;
                const branding = Reflect.get(role, 'branding');
                return (
                  (typeof branding === 'object' && branding !== null ? Reflect.get(branding, 'id') : branding) ===
                  brand.id
                );
              });
            return copy;
          };
          let data: unknown;
          switch (route.action) {
            case 'linkAccounts': {
              const primary = text(body.primaryUserId),
                secondary = text(body.secondaryUserId);
              if (!/^[a-f0-9]{24}$/.test(secondary)) throw new IdentityLinkError(400, 'Invalid user identifier');
              if (primary === secondary) throw new IdentityLinkError(400, 'Cannot link a user account to itself');
              await requireTarget(primary);
              data = await singleHttpResult(input.users.linkAccounts(primary, secondary, actor.username, brand.id));
              break;
            }
            case 'searchLinkCandidates': {
              const primary = text(query.primaryUserId);
              await requireTarget(primary);
              data = await singleHttpResult(input.users.searchLinkCandidates(text(query.query), brand.id, primary));
              break;
            }
            case 'getUserLinks': {
              const id = text(req.params.id);
              await requireTarget(id);
              data = await singleHttpResult(input.users.getLinkedAccounts(id, brand.id));
              break;
            }
            case 'getUserAudit': {
              const id = text(req.params.id),
                user = await requireTarget(id);
              data = { user: sanitize(user), ...(await input.users.getUserAudit(id, brand.id)) };
              break;
            }
            default: {
              const allowedFields = new Set(['id', 'username', 'name', 'email', 'type']);
              const field = text(query.searchBy, route.action === 'getUser');
              const search = text(query.query, route.action === 'getUser');
              if (field && !allowedFields.has(field)) throw new IdentityLinkError(400, 'Invalid user search field');
              const all = await singleHttpResult(
                input.users.getUsersForBrand(Object.assign(new BrandingModel(), brand))
              );
              const enriched = await input.users.enrichUsersWithEffectiveDisabledState(
                await input.users.enrichUsersWithLinkMetadata(all, brand.id)
              );
              const users = enriched
                .filter(
                  u =>
                    !(input.hiddenUsers ?? []).includes(String(u.name)) &&
                    (query.includeDisabled === 'true' || u.effectiveLoginDisabled !== true) &&
                    (!field || String(Reflect.get(u, field) ?? '') === search)
                )
                .map(sanitize);
              if (route.action === 'getUser') {
                if (!users[0]) {
                  sendApiErrors(req, res, 404, [
                    { title: 'No user found with given criteria', detail: `Searchby: ${field} and Query: ${search}` },
                  ]);
                  return;
                }
                data = users[0];
              } else if (route.action === 'getUsers')
                data = users.map(u => ({ ...u, token: u.hasApiKey ? 'user-has-token-but-is-suppressed' : null }));
              else {
                const page = query.page === undefined ? 1 : Number(query.page),
                  size = query.pageSize === undefined ? 10 : Number(query.pageSize);
                if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || size > 1000)
                  throw new IdentityLinkError(400, 'Invalid pagination');
                data = {
                  summary: { numFound: users.length, page, start: 0 },
                  records: users.slice((page - 1) * size, page * size),
                };
              }
            }
          }
          sendApiData(req, res, data);
        } catch (error) {
          input.log.error('User administration request failed');
          sendApiErrors(
            req,
            res,
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
      })
    );
}
