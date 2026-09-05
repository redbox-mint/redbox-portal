# Legacy Bearer Token Migration

The current opaque UUID bearer credential remains a supported authentication
mechanism for at least the documented compatibility window. It is an **opaque
legacy bearer token** stored in `User.token`; it is not a JWT, an OAuth access
token, or any other structured credential, and no OAuth authorization server is
part of this delivery.

## Behavior under the authorization model

- A valid legacy bearer resolves the same canonical user and effective
  roles/scopes as a browser session for the same brand.
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

## What integrators must do

1. Enumerate the scopes your integration requires. `GET
   /:branding/:portal/api/authorization/me` with your credential returns the
   effective principal projection, including effective scope keys, so you can
   test grants and denials before enforcement.
2. Verify each integration flow against the scope catalog
   (`GET /api/authorization/scopes`) and confirm the credentials' user holds the
   required scopes in the target brand.
3. Expect `401` for invalid credentials, `403` for missing scopes or in-brand
   resource denial, `404` for cross-brand or absent resources, and `409` for
   version conflicts.
4. Treat the compatibility AJAX routes (`/admin/roles/get`,
   `/admin/roles/user`) as deprecated; they emit `Deprecation` and
   `successor-version` headers pointing at the contract API.

## Compatibility window and next phase

The token format, expiry, hashing, rotation, and multiple credentials per user
are part of a later authentication-hardening decision. A future token validator
must produce the same `AuthorizationContext` (principal, auth method, brand
context, and optional token scope ceiling). Integrators will receive migration
documentation and a test window before any compatibility removal; removal is
evidence-based, never calendar-based.
