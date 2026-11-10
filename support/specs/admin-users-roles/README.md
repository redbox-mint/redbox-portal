# Users and roles administration

Delivered on `admin-deferred/06-users-roles`, based on `admin-deferred/05-deleted-records`.

`User.lastLogin` is an existing optional datetime. The storage-facing TypeScript model no longer invents a creation-time value. Local, AAF, and OIDC (including named OIDC providers) record an ISO timestamp after Passport successfully establishes the session, before responding. Failed credentials, rejected logins, failed sessions, bearer tokens, and ordinary service/session requests do not update it. Linked external identities record the identity actually used to sign in, even though authorization resolves to the primary account. No backfill or migration runs.

`Role.description` is optional plain text, limited to 500 characters. There is no HTML rendering. An empty custom description uses the translated default for Admin, Librarians, Researcher, or Guest; custom roles have no generated description. MongoDB needs no data migration.

The role default is the brand's top-level `auth.defaultRole`, falling back to Guest when omitted. Provider-specific AAF/OIDC authenticated-role settings do not change this marker or the replacement role. A missing configured role blocks sole-role removal. Hidden roles remain hidden; populated role-user objects are omitted from the admin role response.

## Admin HTTP contracts

All paths below have the `/:branding/:portal` prefix. They use the existing Admin policies and brand authorization, retain CSRF protection, and are registered in `packages/redbox-core/src/api-routes/groups/admin-users.ts`. The generated OpenAPI and API Blueprint include these contracts. API v1 responses below are direct bodies; API v2 wraps successful bodies in `{data, meta}`.

| Route | Request | Response |
|---|---|---|
| `GET /admin/users/get` | Optional `includeDisabled=true` and `signIn=<method>` | User array including optional `lastLogin`; the sign-in predicate runs on stored `user.type` in the database before brand/disabled filtering |
| `GET /admin/users/options` | None | `{signInMethods: string[]}` from enabled supported brand `auth.active` methods, without provider configuration or credentials |
| `GET /admin/roles/get` | None | Array of `{id, name, description, descriptionKey, isDefault}`; built-in `descriptionKey` is translated in the UI when custom text is empty |
| `POST /admin/roles/:id/description` | `{description: string}` (0–500 characters) | `{status: true, message}`; trims text and scopes the write by role id **and** brand id |
| `POST /admin/roles/:id/users/:userId/remove` | Empty body | `{status: true, roles: [{id, name}]}` with the remaining brand roles |
| `POST /admin/roles/user` | `{userid, roles: string[]}` with at least one valid brand role name | Existing `{status, message}` shape; preserves memberships in other brands |

Malformed filters and description bodies return 400. Membership removal returns 400 for an unknown/cross-brand membership, a linked alias, a sole default role, an unavailable default, a stale membership, or the last active Admin. Unauthorized callers and missing CSRF tokens are denied by existing policies. The new role mutations also check the caller's brand Admin role in the controller.

Sole-role replacement updates the generated Waterline junction row with one guarded `updateOne`; it does not use `replaceCollection`, whose implementation deletes and reinserts associations. Other-role removal deletes only the selected membership. The general `UsersService.updateUserRoles` nonempty invariant remains and now checks last-active-Admin removal on the server. In a brand with several Admins, at least one other active, unlinked Admin must remain. The default-role substitution applies to the sole **brand** role and leaves other brands' roles untouched.

## Verification

Core tests mock all interactive strategy callbacks and bearer/session request handling. Service/controller tests cover database filtering, defaults, description limits and persistence, single-write replacement, missing/default roles, last Admin, cross-brand roles, linked aliases, and stale membership. Angular tests cover filter requests, last-login display, inline description save/cancel/error, default markers, replacement confirmation and blocked removal.

`test/integration/services/AdminUsersRolesDeferred.test.ts` adds HTTP and persistence checks, including CSRF rejection and default-role replacement. Run it in the normal integration test environment; this implementation task deliberately did not launch Docker integration suites. Development screenshots use throwaway users which are disabled afterwards; edited role descriptions are restored.
