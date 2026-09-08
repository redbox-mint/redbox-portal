# Legacy Bearer Token Migration

The current opaque UUID bearer credential remains a supported authentication
mechanism for at least the documented compatibility window. It is an **opaque
legacy bearer token** stored in `User.token`; it is not a JWT, an OAuth access
token, or any other structured credential, and no OAuth authorization server is
part of this delivery.

## Behavior under the authorization model

- A valid legacy bearer resolves the same canonical user and current local
  authority as a browser session for the same brand, bounded by any credential
  scope ceiling.
- All route scopes, brand constraints, entity-ownership checks, and record ACLs
  apply to bearer requests exactly as to sessions. There is no API-specific
  admin shortcut.
- Disabling the effective user or revoking/replacing `User.token` takes effect
  on the next request.
- A supplied invalid credential returns `401` with an
  `authorization.invalid-credential` Problem Details body; it never falls
  through to anonymous Guest access, even on otherwise public routes.
- No `Authorization` header keeps the existing anonymous/session behavior.
- Mixed credentials follow the explicit rule: a supplied bearer is
  authoritative for the request; an invalid supplied bearer is rejected even
  when a valid session cookie is also present.
- Bearer-authenticated mutation requests are exempt from browser CSRF
  requirements; session-authenticated requests are not.
- Raw token values never appear in logs, audit events, shadow evidence,
  exports, URLs, or Problem Details bodies; sentinel coverage enforces this.

A credential scope ceiling is a restriction, never a grant. An **absent** ceiling
preserves normal current local grants; an explicit **empty** ceiling (`[]`)
denies every scoped action; a **restricted** ceiling permits only the intersection
of its keys and the user's current effective scopes. Ceilings restrict scoped
routes in `legacy`, `shadow`, and `enforce`, even if legacy path rules would allow
the action. Public/pre-auth declarations retain their semantics, and a ceiling
never bypasses credential, brand, entity or record checks. Role/scope reductions
apply on the next request. The effective projection lets integrators inspect
this intersection; it is not a promise that a resource ACL will allow access.

## What integrators must do

All examples below include the branding and portal prefix; `/default/rdmp` is
the concrete example, replaced with the installation's actual values.

1. Enumerate the scopes your integration requires using the
   [scope catalog](Authorization-Scope-Catalog.md) and
   [contract API guide](Authorization-Contract-API.md).
   `GET /:branding/:portal/api/authorization/me`, for example
   `GET /default/rdmp/api/authorization/me`, returns the effective principal and
   scope keys for your credential. Test both grants and denials.
2. Read `GET /default/rdmp/api/authorization/scopes` and confirm the credential's
   user holds the required scopes in the target brand. Exercise actual route
   and resource denials using the [rollout guide](Authorization-Migration-and-Rollout.md);
   representative integrator evidence remains an external release gate.
3. Expect `401` for invalid credentials, `403` for missing scopes or in-brand
   resource denial, `404` for cross-brand or absent resources, and `409` for
   version conflicts. Transaction-dependent writes can return `503` when
   transactions are unavailable; do not work around that failure with direct writes.
4. Migrate the deprecated compatibility AJAX routes
   `GET /default/rdmp/admin/roles/get` and
   `POST /default/rdmp/admin/roles/user` to the contract API. They emit
   `Deprecation: true` and a `Link` header with `rel="successor-version"`,
   not a header named `successor-version`. For example, the roles catalog emits
   `Link: </default/rdmp/api/authorization/roles>; rel="successor-version"`;
   the user-role adapter points to `/default/rdmp/api/authorization/assignments`.

## Compatibility window and next phase

The token format, expiry, hashing, rotation, and multiple credentials per user
are part of a later authentication-hardening decision. A future token validator
must produce the same `AuthorizationContext` (principal, auth method, brand
context, and optional token scope ceiling). Integrators will receive migration
documentation and a test window before any compatibility removal; removal is
evidence-based, never calendar-based. A viable replacement must exist before
retirement, followed by at least one full compatibility release with telemetry,
warnings, migration instructions and a dated cutoff. See the
[retirement rules](Authorization-Migration-and-Rollout.md#compatibility-retirement).
