import { userApiRoutes } from '../api-routes/groups/users';
import { adminApiRoutes } from '../api-routes/groups/admin';
import { siemApiRoutes } from '../api-routes/groups/siem';
// Account linking and audit disclosure retain explicit dependencies; do not mount incomplete slices.
const administrationActions = new Set([
  'createUser',
  'updateUser',
  'disableUser',
  'enableUser',
  'generateAPIToken',
  'revokeAPIToken',
  'listSystemRoles',
  'createSystemRole',
]);
const administrationAliases = [
  ['post', '/admin/users/:id/disable', 'AdminController', 'disableUser'],
  ['post', '/admin/users/:id/enable', 'AdminController', 'enableUser'],
  ['post', '/admin/users/genKey', 'AdminController', 'generateUserKey'],
  ['post', '/admin/users/revokeKey', 'AdminController', 'revokeUserKey'],
  ['post', '/admin/users/newUser', 'AdminController', 'addLocalUser'],
  ['post', '/admin/users/update', 'AdminController', 'updateUserDetails'],
  ['post', '/admin/roles/user', 'AdminController', 'updateUserRoles'],
  ['get', '/admin/roles/get', 'AdminController', 'getBrandRoles'],
  ['post', '/user/genKey', 'UserController', 'generateUserKey'],
  ['post', '/user/revokeKey', 'UserController', 'revokeUserKey'],
  ['post', '/user/update', 'UserController', 'update'],
] as const;
export const identityAdministrationRoutes = [
  ...userApiRoutes.filter(route => administrationActions.has(route.action)),
  ...administrationAliases.map(([method, path, controller, action]) => ({
    method,
    path: '/:branding/:portal' + path,
    controller,
    action,
  })),
];

const linkActions = new Set([
  'listUsers',
  'getUser',
  'searchLinkCandidates',
  'getUserLinks',
  'getUserAudit',
  'linkAccounts',
]);
const linkAliases = [
  ['get', '/admin/users/get', 'getUsers'],
  ['get', '/admin/users/link/candidates', 'searchLinkCandidates'],
  ['get', '/admin/users/:id/links', 'getUserLinks'],
  ['get', '/admin/users/:id/audit', 'getUserAudit'],
  ['post', '/admin/users/link', 'linkAccounts'],
] as const;
export const identityLinkRoutes = [
  ...userApiRoutes.filter(route => linkActions.has(route.action)),
  ...linkAliases.map(([method, path, action]) => ({
    method,
    path: '/:branding/:portal' + path,
    controller: 'AdminController',
    action,
  })),
];

export const adminOperationRoutes = adminApiRoutes;

export const siemWriteRoutes = siemApiRoutes.filter(r => ['saveConfig', 'testDestination'].includes(r.action));

/** FM-025 only: existing read families and FM-026 mutations stay outside this selection. */
export const identityAdministrationDeclarations = [
  ...identityAdministrationRoutes,
  ...identityLinkRoutes,
  ...siemWriteRoutes,
  ...adminOperationRoutes,
];
