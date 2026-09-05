# Authorization Role Inventory

This is the maintained Phase 0 role reader/writer/dependency inventory. Its
code-backed source is
`packages/redbox-core/src/authorization/role-inventory.ts`; this page is the
human-readable companion. The fixture source for the legacy compatibility
contracts is
`packages/redbox-core/test/fixtures/legacy-role-ajax.fixtures.ts`, owned by
`packages/redbox-core/test/authorization/legacy-role-ajax-contracts.test.ts`.

## Writers

Every supported role/template/assignment write goes through
`RoleAdministrationService`, which dual-writes the legacy user-role projection
transactionally with audit. Compatibility adapters translate legacy inputs and
delegate to that service; they never mutate associations directly.

| Location | Operation | Classification |
| --- | --- | --- |
| `RoleAdministrationService` grant/revoke/suppress/unsuppress/replace/bulk | all assignment mutations | supported-service |
| `AuthorizationConfigurationService.projectLegacyAuthority` | projection helper | supported-service |
| `UsersService.applyUserRoleAssignments` | `updateUserRoles` per-brand grant/revoke/suppress | compatibility-adapter |
| `AdminController.updateUserRoles` | `POST /:branding/:portal/admin/roles/user` | compatibility-adapter |
| `AdminController.addLocalUser` | `POST /:branding/:portal/admin/users/newUser` with `details.roles` → `UsersService.updateUserRoles` | compatibility-adapter |
| `AdminController.updateUserDetails` | `POST /:branding/:portal/admin/users/update` with `details.roles` → `UsersService.updateUserRoles` (foreign-brand merge) | compatibility-adapter |
| `UserManagementController.createUser` | user create role array → `UsersService.updateUserRoles` | compatibility-adapter |
| `UserManagementController.updateUser` | user update role array → `UsersService.updateUserRoles` | compatibility-adapter |
| `UserManagementController.createSystemRole` | `POST /:branding/:portal/api/roles/:roleName` | compatibility-adapter |
| `UsersService` bootstrap/link internals | init admin, alias cleanup | internal-bootstrap |
| `RolesService.bootstrap` | brand-to-role link seeding | internal-bootstrap |
| `RolesService.createRoleWithBrand` | deprecated brand-to-role link writer | unsupported-direct-write |
| any other direct `User.addToCollection`/`replaceCollection` on `roles` | direct database usage | unsupported-direct-write |

A deterministic source-to-inventory reconciliation test
(`legacy-role-ajax-contracts.test.ts`) enumerates one row per production
`UsersService.updateUserRoles` call site (grouped locations are rejected),
maps every roles/users association-write file to an inventory row, and checks
every mutation named by the supported-service row against
`RoleAdministrationService` sources.

`RolesService.createRoleWithBrand` is deprecated and removed from exported
methods; the `POST /api/roles/:roleName` route goes through
`RoleAdministrationService.createRole` with the request actor and brand.
`RolesService.getNestedRoles` is deprecated and removed from exports. Direct
database writes are reported as drift by rollout readiness checks.

## Readers

| Location | Operation |
| --- | --- |
| `AdminController.getBrandRoles` | `GET /:branding/:portal/admin/roles/get` (same-brand `Role.find` with users, hidden-role filtering) |
| `RolesService` resolution helpers | same-brand role lookup by name |
| `UsersService.getUserForBrand` family | brand-constrained user reads; cross-brand IDs yield opaque 404 |
| record/search/Solr/export/visitor code | ACL reads against `role.key ?? role.name`; broad scopes bypass only the ACL gate |
| menu/home-panel/admin-sidebar/form/hook config | `requiredRoles` readable during compatibility; new writes use `requiredScope` |

## Legacy compatibility contracts

`GET /:branding/:portal/admin/roles/get` returns `200` with a bare JSON array
of brand roles (each with populated `users`), filtered by
`sails.config.auth.hiddenRoles`, with `Deprecation: true` and a
`Link: <.../api/authorization/roles>; rel="successor-version"` header.

`POST /:branding/:portal/admin/roles/user` accepts `{ userid, roles: [names] }`,
resolves names to same-brand IDs, merges foreign-brand IDs for preservation,
and delegates to `UsersService.updateUserRoles` with the request brand.
Success returns `200 { status: true, message: "Save OK." }` with
`Deprecation: true` and a successor link to `/api/authorization/assignments`;
failures return `{ status: false, message }`. Empty role sets, explicit Guest
(`Guest cannot be assigned explicitly`), and unknown roles are rejected;
cross-brand targets return opaque `404`. The empty-role rule preserves the
documented legacy requirement that a user holds at least one role.

Header exception (narrowed contract): every legacy role AJAX success, failure,
and missing-input response carries `Deprecation`/`Link`, except the opaque
cross-brand `404`, which carries only no-cache headers. The successor `Link`
embeds the request brand path, so emitting it on an opaque `404` would oracle
cross-brand existence; the controller test pins status `404`, the opaque body,
no-cache headers present, and `Deprecation`/`Link` absent.
