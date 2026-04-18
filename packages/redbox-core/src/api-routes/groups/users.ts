import { z } from 'zod';

import { apiRoute } from '../route-factory';
import {
  arrayField,
  apiActionResponseSchema,
  createUserApiResponseSchema,
  idParams,
  listApiResponseSchema,
  roleSummarySchema,
  userRecordSchema,
  objectField,
  responseField,
  linkedUserSummarySchema,
  statusMessageResponseSchema,
  stringField,
  userApiTokenApiResponseSchema,
  userAuditResponseSchema,
  userLinkResponseSchema,
  userSearchQuery,
} from '../schemas/common';

const userRoleSelectionSchema = z.union([
  stringField('Role name'),
  objectField({ name: stringField('Role name') }, ['name'], 'Role reference', true),
]);

export const listUsersRoute = apiRoute(
  'get',
  '/:branding/:portal/api/users',
  'webservice/UserManagementController',
  'listUsers',
  { query: userSearchQuery },
  {
    tags: ['Users'],
    summary: 'List users',
    responses: { 200: responseField(listApiResponseSchema(userRecordSchema), 'List of users') },
  }
);

export const findUserRoute = apiRoute(
  'get',
  '/:branding/:portal/api/users/find',
  'webservice/UserManagementController',
  'getUser',
  { query: objectField({ searchBy: stringField(), query: stringField() }, ['searchBy', 'query']) },
  {
    tags: ['Users'],
    summary: 'Find user',
    responses: { 200: responseField(userRecordSchema, 'User details') },
  }
);

export const getUserRoute = apiRoute(
  'get',
  '/:branding/:portal/api/users/get',
  'webservice/UserManagementController',
  'getUser',
  { query: objectField({ searchBy: stringField(), query: stringField() }, ['searchBy', 'query']) },
  {
    tags: ['Users'],
    summary: 'Get user',
    responses: { 200: responseField(userRecordSchema, 'User details') },
  }
);

export const searchLinkCandidatesRoute = apiRoute(
  'get',
  '/:branding/:portal/api/users/link/candidates',
  'webservice/UserManagementController',
  'searchLinkCandidates',
  { query: objectField({ query: stringField(), primaryUserId: stringField() }, ['query', 'primaryUserId']) },
  {
    tags: ['Users'],
    summary: 'Search user link candidates',
    responses: { 200: responseField(arrayField(linkedUserSummarySchema), 'Link candidates') },
  }
);

export const getUserLinksRoute = apiRoute(
  'get',
  '/:branding/:portal/api/users/:id/links',
  'webservice/UserManagementController',
  'getUserLinks',
  { params: idParams },
  {
    tags: ['Users'],
    summary: 'Get linked accounts',
    responses: { 200: responseField(userLinkResponseSchema, 'Linked accounts') },
  }
);

export const getUserAuditRoute = apiRoute(
  'get',
  '/:branding/:portal/api/users/:id/audit',
  'webservice/UserManagementController',
  'getUserAudit',
  { params: idParams },
  {
    tags: ['Users'],
    summary: 'Get user audit',
    responses: { 200: responseField(userAuditResponseSchema, 'User audit') },
  }
);

export const linkAccountsRoute = apiRoute(
  'post',
  '/:branding/:portal/api/users/link',
  'webservice/UserManagementController',
  'linkAccounts',
  {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: objectField({ primaryUserId: stringField(), secondaryUserId: stringField() }, [
            'primaryUserId',
            'secondaryUserId',
          ]),
        },
      },
    },
  },
  {
    tags: ['Users'],
    summary: 'Link accounts',
    responses: { 200: responseField(userLinkResponseSchema, 'Linked accounts updated') },
  }
);

export const createUserRoute = apiRoute(
  'put',
  '/:branding/:portal/api/users',
  'webservice/UserManagementController',
  'createUser',
  {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: objectField(
            {
              username: stringField(),
              name: stringField(),
              email: stringField(),
              password: stringField(),
              roles: arrayField(userRoleSelectionSchema),
            },
            ['username', 'name', 'password']
          ),
        },
      },
    },
  },
  {
    tags: ['Users'],
    summary: 'Create user',
    responses: { 201: responseField(createUserApiResponseSchema, 'User created') },
  }
);

export const updateUserRoute = apiRoute(
  'post',
  '/:branding/:portal/api/users',
  'webservice/UserManagementController',
  'updateUser',
  {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: objectField(
            {
              id: stringField(),
              username: stringField(),
              name: stringField(),
              email: stringField(),
              password: stringField(),
              roles: arrayField(userRoleSelectionSchema),
            },
            ['id', 'name', 'email', 'password']
          ),
        },
      },
    },
  },
  {
    tags: ['Users'],
    summary: 'Update user',
    responses: { 201: responseField(createUserApiResponseSchema, 'User updated') },
  }
);

export const disableUserRoute = apiRoute(
  'post',
  '/:branding/:portal/api/users/:id/disable',
  'webservice/UserManagementController',
  'disableUser',
  { params: idParams },
  {
    tags: ['Users'],
    summary: 'Disable user',
    responses: { 200: responseField(statusMessageResponseSchema, 'User disabled') },
  }
);

export const enableUserRoute = apiRoute(
  'post',
  '/:branding/:portal/api/users/:id/enable',
  'webservice/UserManagementController',
  'enableUser',
  { params: idParams },
  {
    tags: ['Users'],
    summary: 'Enable user',
    responses: { 200: responseField(statusMessageResponseSchema, 'User enabled') },
  }
);

export const generateAPITokenRoute = apiRoute(
  'get',
  '/:branding/:portal/api/users/token/generate',
  'webservice/UserManagementController',
  'generateAPIToken',
  { query: objectField({ id: stringField() }, ['id']) },
  {
    tags: ['Users'],
    summary: 'Generate API token',
    responses: { 200: responseField(userApiTokenApiResponseSchema, 'API token generated') },
  }
);

export const revokeAPITokenRoute = apiRoute(
  'get',
  '/:branding/:portal/api/users/token/revoke',
  'webservice/UserManagementController',
  'revokeAPIToken',
  { query: objectField({ id: stringField() }, ['id']) },
  {
    tags: ['Users'],
    summary: 'Revoke API token',
    responses: { 200: responseField(userApiTokenApiResponseSchema, 'API token revoked') },
  }
);

export const listSystemRolesRoute = apiRoute(
  'get',
  '/:branding/:portal/api/roles',
  'webservice/UserManagementController',
  'listSystemRoles',
  {},
  {
    tags: ['Users'],
    summary: 'List roles',
    responses: { 200: responseField(listApiResponseSchema(roleSummarySchema), 'Role list') },
  }
);

export const createSystemRoleRoute = apiRoute(
  'post',
  '/:branding/:portal/api/roles/:roleName',
  'webservice/UserManagementController',
  'createSystemRole',
  {
    params: objectField({ roleName: stringField() }, ['roleName']),
    body: { required: true, content: { 'application/json': { schema: objectField({}, [], 'Role payload', true) } } },
  },
  {
    tags: ['Users'],
    summary: 'Create system role',
    responses: { 200: responseField(apiActionResponseSchema, 'Role created') },
  }
);

export const userApiRoutes = [
  listUsersRoute,
  findUserRoute,
  getUserRoute,
  searchLinkCandidatesRoute,
  getUserLinksRoute,
  getUserAuditRoute,
  linkAccountsRoute,
  createUserRoute,
  updateUserRoute,
  disableUserRoute,
  enableUserRoute,
  generateAPITokenRoute,
  revokeAPITokenRoute,
  listSystemRolesRoute,
  createSystemRoleRoute,
];
