import type { ApiRequestDefinition } from '../types';
import { defineApiRoute } from '../define';
import { z } from '../zod-openapi';
import { apiErrorResponseSchema, responseField } from '../schemas/common';

const role = z.object({ id: z.string(), name: z.string() });
const summary = role.extend({ description: z.string(), descriptionKey: z.string().nullable(), isDefault: z.boolean() });
const result = z.object({ status: z.boolean(), message: z.string().optional() });
const id = z.string().trim().min(1).max(128);
export const roleDescriptionBody = z
  .object({
    description: z
      .string()
      .max(500)
      .regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/),
  })
  .strict();

function route(
  method: 'get' | 'post',
  path: string,
  action: string,
  request: ApiRequestDefinition,
  response: z.ZodType,
  summary: string,
  description: string
) {
  return defineApiRoute({
    method,
    path: '/:branding/:portal/admin/' + path,
    controller: 'AdminController',
    action,
    csrf: true,
    request,
    extensions: { 'x-redbox-roles': ['Admin'] },
    tags: ['Users'],
    summary,
    description,
    responses: {
      200: responseField(
        z.union([response, z.object({ data: response, meta: z.object({}).passthrough() })]),
        'Admin response'
      ),
      400: responseField(apiErrorResponseSchema, 'Invalid input or protected membership'),
      403: responseField(apiErrorResponseSchema, 'Brand Admin permission and CSRF required'),
    },
  });
}
// Pagination is opt-in: legacy consumers continue to receive an array.
export const adminUserListQuery = z.object({
  includeDisabled: z.enum(['true', 'false']).optional(),
  signIn: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).max(1000000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  query: z.string().trim().max(200).optional(),
  role: z.string().max(128).optional(),
  excludeRole: z.string().max(128).optional(),
  candidates: z.enum(['true', 'false']).optional(),
  sort: z.enum(['name', 'username', 'email', 'type', 'lastLogin']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});
const adminUser = z.object({ id: z.string(), lastLogin: z.union([z.string(), z.null()]).optional(), type: z.string() }).passthrough();
const userPage = z.object({
  records: z.array(adminUser),
  summary: z.object({ numFound: z.number(), page: z.number(), start: z.number() }),
  roleCounts: z.record(z.string(), z.object({ active: z.number(), disabled: z.number(), removableActive: z.number() })),
});
export const adminUsersApiRoutes = [
  route(
    'get',
    'users/get',
    'getUsers',
    {
      query: adminUserListQuery,
    },
    z.union([z.array(adminUser), userPage]),
    'List brand users for administration',
    'signIn filters stored user.type in the database and must be enabled in the brand auth.active configuration. Empty means all methods. lastLogin is absent/empty for users who have never signed in; no backfill. Optional page or pageSize returns records, summary (numFound/page/start) and brand roleCounts. Defaults: 25 rows, name ascending, id tie-break. query searches name/username/email literally, role includes members, excludeRole excludes members, candidates excludes disabled/linked aliases. Filters and sorting run before slicing on the server. Counts describe the filtered results; roleCounts describe all visible brand members including disabled. Without pagination the response remains an array.'
  ),
  route(
    'get',
    'users/options',
    'getUserOptions',
    {},
    z.object({ signInMethods: z.array(z.string()) }),
    'List enabled sign-in methods',
    'Returns the supported interactive auth methods enabled for this brand. No provider secrets are returned.'
  ),
  route(
    'get',
    'roles/get',
    'getBrandRoles',
    {},
    z.array(summary),
    'List brand roles for administration',
    'description is custom plain text, at most 500 characters; descriptionKey supplies a translated built-in fallback when empty. isDefault marks auth.defaultRole (Guest when absent), independent of provider-specific authenticated defaults. Hidden roles are omitted. Populated user objects are not returned.'
  ),
  route(
    'post',
    'roles/:id/description',
    'updateRoleDescription',
    {
      params: z.object({ id }),
      body: { required: true, content: { 'application/json': { schema: roleDescriptionBody } } },
    },
    result,
    'Update a role description',
    'Brand Admin only, session CSRF protected. Trims plain text. Empty restores the translated built-in fallback. Rejects cross-brand role ids.'
  ),
  route(
    'post',
    'roles/:id/users/:userId/remove',
    'removeRoleMember',
    { params: z.object({ id, userId: id }) },
    result.extend({ roles: z.array(role) }),
    'Remove a role membership',
    'Brand Admin only, CSRF protected. If this is the only brand role, atomically changes that membership to auth.defaultRole in one database update. Rejects removal of the sole default role, unavailable defaults, linked aliases, cross-brand memberships and the last active Admin. Returns the resulting brand roles.'
  ),
  route(
    'post',
    'roles/user',
    'updateUserRoles',
    {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({ userid: id, roles: z.array(z.string().min(1).max(128)).min(1).max(100) }).strict(),
          },
        },
      },
    },
    result,
    'Update brand user roles',
    'Accepts role names for this brand. Preserves roles belonging to other brands. Empty sets and last active Admin removal are rejected.'
  ),
];
