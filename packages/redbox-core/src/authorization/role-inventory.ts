/**
 * Maintained Phase 0 role reader/writer/dependency inventory.
 *
 * This module is the code-backed companion to
 * `support/wiki/Authorization-Role-Inventory.md`. It classifies every
 * supported role mutation path so reviewers can prove that all maintained
 * writers go through `RoleAdministrationService` and that direct legacy
 * association writes are either removed or explicitly marked unsupported.
 */

export type RoleWriterClassification =
  | 'supported-service'
  | 'compatibility-adapter'
  | 'internal-bootstrap'
  | 'unsupported-direct-write';

export interface RoleWriterInventoryRow {
  readonly location: string;
  readonly operation: string;
  readonly classification: RoleWriterClassification;
  readonly notes: string;
}

export interface RoleReaderInventoryRow {
  readonly location: string;
  readonly operation: string;
  readonly notes: string;
}

export interface RoleDependencyInventoryRow {
  readonly location: string;
  readonly dependency: string;
  readonly notes: string;
}

export const ROLE_WRITER_INVENTORY: readonly RoleWriterInventoryRow[] = Object.freeze([
  {
    location: 'packages/redbox-core/src/services/RoleAdministrationService.ts',
    operation:
      'createRole / updateRole / previewRoleScopes / applyRoleScopes / previewTemplateRevision / publishTemplateRevision / previewRoleTemplateUpgrade / applyRoleTemplateUpgrade / previewRoleInactivation / inactivateRole / previewRoleDeletion / deleteRole / grantAssignment / revokeAssignment / suppressAssignment / unsuppressAssignment / replaceExternalAssignments / previewBulkAssignments / applyBulkAssignments / previewScopeAdoption / applyScopeAdoption / previewBulkTemplateUpgrade / applyBulkTemplateUpgrade / previewConfigurationImport / applyConfigurationImport / setUserAccess / linkUserAccounts / applyUserRoleSet',
    classification: 'supported-service',
    notes:
      'Only supported role/template/assignment writer. Dual-writes the legacy user-role projection transactionally with audit.',
  },
  {
    location: 'packages/redbox-core/src/services/AuthorizationConfigurationService.ts:projectLegacyAuthority',
    operation: 'projectLegacyAuthority (legacy user-role projection add/remove)',
    classification: 'supported-service',
    notes:
      'Projection helper owned by the assignment service path; applies User.addToCollection/removeFromCollection on roles and is never called directly by controllers.',
  },
  {
    location: 'packages/redbox-core/src/services/UsersService.ts:applyUserRoleAssignments',
    operation: 'updateUserRoles -> applyUserRoleSet per brand (one transaction/audit/CAS/quorum)',
    classification: 'compatibility-adapter',
    notes:
      'Compatibility adapter. Same-brand role set applies through one atomic batch writer; foreign-brand assignments are preserved untouched. AUTH-P5-002: expectedVersion is mandatory and pinned against the user row before any brand loop delegates to the per-tuple CAS writer.',
  },
  {
    location: 'packages/redbox-core/src/controllers/AdminController.ts:updateUserRoles',
    operation: 'POST /:branding/:portal/admin/roles/user',
    classification: 'compatibility-adapter',
    notes:
      'Translates role names to same-brand IDs, merges foreign-brand IDs for preservation, requires a mandatory request expectedVersion (422 when omitted), and delegates to UsersService.updateUserRoles with brandId plus expectedVersion.',
  },
  {
    location: 'packages/redbox-core/src/controllers/AdminController.ts:addLocalUser',
    operation: 'POST /:branding/:portal/admin/users/newUser with details.roles',
    classification: 'compatibility-adapter',
    notes:
      'Maintained call site of UsersService.updateUserRoles. Translates requested role names via RolesService.getRoleIds and delegates with brandId plus the just-created row observed version as CAS; no direct association write.',
  },
  {
    location: 'packages/redbox-core/src/controllers/AdminController.ts:updateUserDetails',
    operation: 'POST /:branding/:portal/admin/users/update with details.roles',
    classification: 'compatibility-adapter',
    notes:
      'Maintained call site of UsersService.updateUserRoles. Merges foreign-brand IDs via mergeBrandRoleIds before delegating with brandId plus the post-profile observed version as CAS (fail-closed partial state when unreadable); no direct association write.',
  },
  {
    location: 'packages/redbox-core/src/controllers/webservice/UserManagementController.ts:createUser',
    operation:
      'UsersService.updateUserRoles(response.id, mergedRoleIds, { brandId }) on user create with requested roles',
    classification: 'compatibility-adapter',
    notes:
      'Production call site (UserManagementController.createUser). Converts requested role names to same-brand IDs, merges foreign-brand IDs, delegates with brandId plus the in-request observed user version as CAS. Never writes associations directly.',
  },
  {
    location: 'packages/redbox-core/src/controllers/webservice/UserManagementController.ts:updateUser',
    operation: 'UsersService.updateUserRoles(user.id, mergedRoleIds, { brandId }) on user update with requested roles',
    classification: 'compatibility-adapter',
    notes:
      'Production call site (UserManagementController.updateUser). Converts requested role names to same-brand IDs via RolesService.getRoleIds, merges foreign-brand IDs, delegates with brandId plus the post-profile observed version as CAS (fail-closed partial state when unreadable). Never writes associations directly.',
  },
  {
    location: 'packages/redbox-core/src/controllers/webservice/UserManagementController.ts:createSystemRole',
    operation: 'POST /:branding/:portal/api/roles/:roleName',
    classification: 'compatibility-adapter',
    notes:
      'Routes through RoleAdministrationService.createRole with the request actor and brand. The legacy RolesService bypass is removed from exports.',
  },
  {
    location: 'packages/redbox-core/src/services/RoleAdministrationService.ts:projectLegacyAuthority',
    operation: 'projectLegacyAuthority (legacy user-role projection add/remove)',
    classification: 'supported-service',
    notes:
      'Legacy user-role projection helper (User.addToCollection/removeFromCollection on roles) invoked transactionally by grant/revoke/suppress/unsuppress/replace/external/bulk writers; never called directly by controllers.',
  },
  {
    location: 'packages/redbox-core/src/services/RoleAdministrationService.ts:inactivateRole',
    operation: "Role.replaceCollection(roleId, 'users') projection clear on inactivation",
    classification: 'supported-service',
    notes:
      'Supported inactivation path clears the legacy role-users projection inside the same guarded transaction and audit event.',
  },
  {
    location: 'packages/redbox-core/src/services/RoleAdministrationService.ts:deleteRole',
    operation: "Role.replaceCollection(roleId, 'users') projection clear on deletion",
    classification: 'supported-service',
    notes:
      'Supported deletion path clears the legacy role-users projection inside the same guarded transaction and audit event.',
  },
  {
    location: 'packages/redbox-core/src/services/UsersService.ts:initDefAdmin',
    operation: 'bootstrap User.addToCollection/Role.addToCollection on roles/users',
    classification: 'internal-bootstrap',
    notes:
      'Bootstrap seeding of the default admin user and its role links only; never user authority on request paths.',
  },
  {
    location: 'packages/redbox-core/src/services/UsersService.ts:linkAccounts',
    operation: 'linkAccounts -> RoleAdministrationService.linkUserAccounts (guarded account-link delegation)',
    classification: 'compatibility-adapter',
    notes:
      'Delegates account linking to the guarded RoleAdministrationService.linkUserAccounts writer; never writes role collections directly.',
  },
  {
    location: 'packages/redbox-core/src/services/RolesService.ts:createRoleWithBrand',
    operation: 'BrandingConfig.addToCollection(brand.id, roles) brand-to-role link in deprecated writer',
    classification: 'unsupported-direct-write',
    notes:
      'Deprecated legacy role writer removed from service exports (pinned by contract test); supported role creation routes through RoleAdministrationService.createRole.',
  },
  {
    location: 'packages/redbox-core/src/services/RolesService.ts:bootstrap',
    operation: 'BrandingConfig.addToCollection(brand.id, roles) seed brand roles',
    classification: 'internal-bootstrap',
    notes: 'Bootstrap seeding of brand-to-role links only; never user authority.',
  },
  {
    location: 'direct Waterline User.addToCollection/replaceCollection on roles outside the rows above',
    operation: 'any other direct legacy association write',
    classification: 'unsupported-direct-write',
    notes: 'Not a supported compatibility contract. Reported as drift by rollout readiness checks.',
  },
]);

export const ROLE_READER_INVENTORY: readonly RoleReaderInventoryRow[] = Object.freeze([
  {
    location: 'packages/redbox-core/src/controllers/AdminController.ts:getBrandRoles',
    operation: 'GET /:branding/:portal/admin/roles/get',
    notes:
      'Reads Role.find({branding}) with users populated; filters sails.config.auth.hiddenRoles; legacy shape preserved with deprecation headers.',
  },
  {
    location: 'packages/redbox-core/src/services/RolesService.ts:getRolesWithBrand/getRoleIds/getRoleWithName',
    operation: 'role resolution helpers',
    notes: 'Read-only resolution of same-brand roles by name. getNestedRoles is deprecated and removed from exports.',
  },
  {
    location: 'packages/redbox-core/src/services/UsersService.ts:getUserForBrand/getUsersForBrand/requireUserInBrand',
    operation: 'brand-scoped user reads',
    notes: 'Controllers resolve targets through brand-constrained reads so cross-brand IDs return opaque 404.',
  },
  {
    location:
      'packages/redbox-core/src/services/RecordsService.ts, RecordSchemaService.ts, FormsService.ts, search/Solr, export, visitors',
    operation: 'record ACL role reads',
    notes:
      'Compare persisted ACL strings against immutable role.key ?? role.name; broad scopes bypass only the ACL gate within the active brand.',
  },
  {
    location: 'menu/home-panel/admin-sidebar/form/hook configuration (requiredRoles)',
    operation: 'configuration role reads',
    notes: 'Legacy requiredRoles remain readable during compatibility; new configuration writes requiredScope.',
  },
]);

export const ROLE_DEPENDENCY_INVENTORY: readonly RoleDependencyInventoryRow[] = Object.freeze([
  {
    location: 'sails.config.auth.roles / sails.config.auth.rules',
    dependency: 'bootstrap roles and PathRule rows',
    notes: 'Seed data only. Runtime authority comes from assignments plus the Guest baseline.',
  },
  {
    location: 'Role.name / role.key',
    dependency: 'immutable compatibility key in record ACLs and Solr',
    notes: 'Existing name values become immutable keys; phase 1 never rewrites ACL strings.',
  },
  {
    location: 'BrandingConfig.roles association',
    dependency: 'brand-to-role link',
    notes: 'Maintained by migration/bootstrap and RoleAdministrationService; not user authority by itself.',
  },
  {
    location: 'sails.config.auth.hiddenRoles / hiddenUsers',
    dependency: 'legacy UI filtering',
    notes: 'Display filtering only; never an authorization decision input.',
  },
  {
    location: 'User.token',
    dependency: 'legacy bearer credential',
    notes: 'Opaque credential only. Invalid supplied values return 401 before Guest evaluation.',
  },
]);
