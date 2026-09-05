/**
 * Exact compatibility contracts for the legacy role AJAX adapters.
 *
 * These fixtures pin the supported request/response shapes for
 * `GET /:branding/:portal/admin/roles/get` and
 * `POST /:branding/:portal/admin/roles/user` so compatibility tests fail if a
 * refactor changes the wire contract. They do not invent new behavior: Guest
 * assignment remains rejected, cross-brand targets remain opaque 404, and both
 * routes carry deprecation successor headers.
 *
 * Narrowed header contract (explicit exception, not a gap): every legacy role
 * AJAX success, failure, and missing-input response carries `Deprecation` and
 * `Link: rel="successor-version"` headers. The single exception is the opaque
 * cross-brand 404 produced by `sendOpaqueUserNotFound`, which carries only
 * no-cache headers (`Cache-control: no-cache, private`, `Pragma: no-cache`,
 * `Expires: 0`) and MUST NOT carry `Deprecation`/`Link`. The successor Link
 * embeds the request brand path, so emitting it on an opaque 404 would oracle
 * cross-brand existence and leak deprecation state across brands. The
 * controller test `maps cross-brand targets to opaque 404 ...` pins this
 * exception: status 404, the opaque body detail, no-cache headers present,
 * and `Deprecation`/`Link` absent.
 */

export interface LegacyRoleAjaxUserShape {
  readonly id: string;
  readonly username: string;
}

export interface LegacyRoleAjaxRoleShape {
  readonly id: string;
  readonly name: string;
  readonly key?: string;
  readonly branding: string;
  readonly users: readonly LegacyRoleAjaxUserShape[];
}

export const LEGACY_ROLES_GET_CONTRACT = Object.freeze({
  method: 'get',
  path: '/:branding/:portal/admin/roles/get',
  responseStatus: 200,
  responseBodyKind: 'array-of-roles-with-users',
  requiredHeaders: Object.freeze(['Deprecation', 'Link']),
  successorRel: 'successor-version',
  successorSuffix: '/api/authorization/roles',
});

export const LEGACY_ROLES_USER_CONTRACT = Object.freeze({
  method: 'post',
  path: '/:branding/:portal/admin/roles/user',
  requestBody: Object.freeze({ required: ['userid', 'roles'] as const }),
  successStatus: 200,
  successBody: Object.freeze({ status: true, message: 'Save OK.' }),
  failureBodyKind: 'status-false-with-message',
  missingInputMessage: 'Please provide userid and/or roles names.',
  requiredHeaders: Object.freeze(['Deprecation', 'Link']),
  successorRel: 'successor-version',
  successorSuffix: '/api/authorization/assignments',
});

export const LEGACY_ROLE_AJAX_SECURITY_CONTRACT = Object.freeze({
  guestAssignmentError: 'Guest cannot be assigned explicitly',
  crossBrandResult: 404 as const,
  crossBrandBodyDetail: 'Resource was not found.',
  emptyRolesError: 'Please assign at least one role',
  // Narrowed header exception for the opaque cross-brand 404: only no-cache
  // headers are emitted; Deprecation/Link successor headers are withheld so the
  // response cannot oracle cross-brand existence.
  crossBrandHeaders: Object.freeze(['Cache-control', 'Pragma', 'Expires']),
  crossBrandOmitsDeprecationHeaders: true as const,
});

export function legacyRolesGetFixtureBrandRoles(): readonly LegacyRoleAjaxRoleShape[] {
  return Object.freeze([
    Object.freeze({
      id: 'role-researcher-brand-1',
      name: 'Researcher',
      key: 'Researcher',
      branding: 'brand-1',
      users: Object.freeze([{ id: 'user-1', username: 'alice' }]),
    }),
    Object.freeze({
      id: 'role-guest-brand-1',
      name: 'Guest',
      key: 'Guest',
      branding: 'brand-1',
      users: Object.freeze([]),
    }),
  ]);
}

export function legacyRolesUserRequestFixture(): Readonly<{ userid: string; roles: readonly string[] }> {
  return Object.freeze({ userid: 'user-1', roles: Object.freeze(['Researcher']) });
}
