import { z } from '../zod-openapi';

import { apiRoute } from '../route-factory';
import { authorizationProblemResponse } from '../schemas/authorization';
import {
  arrayField,
  apiActionResponseSchema,
  createUserApiResponseSchema,
  idParams,
  integerField,
  linkAccountsPreviewSchema,
  linkOperationStateSchema,
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
          schema: objectField(
            {
              primaryUserId: stringField(),
              secondaryUserId: stringField(),
              reason: stringField('Link reason'),
              secondaryExpectedVersion: integerField(
                'Caller-observed secondary loginDisabledVersion for pair-bound CAS (required)'
              ),
              primaryExpectedVersion: integerField(
                'Caller-observed primary loginDisabledVersion for pair-bound CAS (required)'
              ),
              linkConfirmationToken: stringField(
                'Server-bound pair confirmation token from the link preview (required)'
              ),
              linkOperationId: stringField(
                'Stable idempotency key for the durable link operation (required, from preview)'
              ),
            },
            [
              'primaryUserId',
              'secondaryUserId',
              'primaryExpectedVersion',
              'secondaryExpectedVersion',
              'linkConfirmationToken',
              'linkOperationId',
            ]
          ),
        },
      },
    },
  },
  {
    tags: ['Users'],
    summary: 'Link accounts',
    responses: {
      200: responseField(userLinkResponseSchema, 'Linked accounts updated'),
      // AUTH-CAS-HTTP-001: error statuses use RFC 9457 Problem Details, not
      // the success schema.
      401: authorizationProblemResponse('Authentication is required'),
      403: authorizationProblemResponse('The active principal lacks account-link authorization'),
      404: authorizationProblemResponse('User or brand not found (opaque)'),
      409: authorizationProblemResponse('Link conflict: already linked, stale pair versions, or stale preview'),
      422: authorizationProblemResponse('Link request was invalid'),
      503: authorizationProblemResponse('Link storage capability unavailable'),
    },
  }
);

export const previewLinkAccountsRoute = apiRoute(
  'post',
  '/:branding/:portal/api/users/link/preview',
  'webservice/UserManagementController',
  'previewLinkAccounts',
  {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: objectField(
            {
              primaryUserId: stringField(),
              secondaryUserId: stringField(),
              reason: stringField('Link reason'),
            },
            ['primaryUserId', 'secondaryUserId']
          ),
        },
      },
    },
  },
  {
    tags: ['Users'],
    summary: 'Preview account link',
    responses: {
      200: responseField(linkAccountsPreviewSchema, 'Link preview with pair versions and confirmation token'),
      401: authorizationProblemResponse('Authentication is required'),
      403: authorizationProblemResponse('The active principal lacks account-link authorization'),
      404: authorizationProblemResponse('User or brand not found (opaque)'),
      422: authorizationProblemResponse('Link preview request was invalid'),
      503: authorizationProblemResponse('Link storage capability unavailable'),
    },
  }
);

export const getLinkOperationRoute = apiRoute(
  'get',
  '/:branding/:portal/api/users/link/operations/:operationId',
  'webservice/UserManagementController',
  'getLinkOperation',
  { params: objectField({ operationId: stringField() }, ['operationId']) },
  {
    tags: ['Users'],
    summary: 'Get link operation state',
    responses: {
      200: responseField(linkOperationStateSchema, 'Durable link operation state'),
      401: authorizationProblemResponse('Authentication is required'),
      403: authorizationProblemResponse('The active principal lacks account-link authorization'),
      404: authorizationProblemResponse('Link operation not found'),
      503: authorizationProblemResponse('Link storage capability unavailable'),
    },
  }
);

export const retryLinkOperationRoute = apiRoute(
  'post',
  '/:branding/:portal/api/users/link/operations/:operationId/retry',
  'webservice/UserManagementController',
  'retryLinkOperation',
  {
    params: objectField({ operationId: stringField() }, ['operationId']),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: objectField(
            {
              primaryUserId: stringField(),
              secondaryUserId: stringField(),
              reason: stringField('Link reason'),
              secondaryExpectedVersion: integerField(
                'Caller-observed secondary loginDisabledVersion for pair-bound CAS (required)'
              ),
              primaryExpectedVersion: integerField(
                'Caller-observed primary loginDisabledVersion for pair-bound CAS (required)'
              ),
              linkConfirmationToken: stringField(
                'Server-bound pair confirmation token from the link preview (required)'
              ),
            },
            [
              'primaryUserId',
              'secondaryUserId',
              'primaryExpectedVersion',
              'secondaryExpectedVersion',
              'linkConfirmationToken',
            ]
          ),
        },
      },
    },
  },
  {
    tags: ['Users'],
    summary: 'Retry link operation',
    responses: {
      200: responseField(userLinkResponseSchema, 'Link operation resumed'),
      401: authorizationProblemResponse('Authentication is required'),
      403: authorizationProblemResponse('The active principal lacks account-link authorization'),
      404: authorizationProblemResponse('Link operation not found'),
      409: authorizationProblemResponse('Link conflict on retry'),
      422: authorizationProblemResponse('Retry limit exceeded or request invalid'),
      503: authorizationProblemResponse('Link storage capability unavailable'),
    },
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
    responses: {
      201: responseField(createUserApiResponseSchema, 'User created'),
      401: authorizationProblemResponse('Authentication is required'),
      403: authorizationProblemResponse('The active principal lacks user authorization'),
      404: authorizationProblemResponse('Brand not found (opaque)'),
      409: authorizationProblemResponse('Username or email already exists'),
      422: authorizationProblemResponse('Requested roles are unknown in this brand'),
      503: authorizationProblemResponse('User storage capability unavailable'),
    },
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
              expectedVersion: integerField('Caller-observed loginDisabledVersion for compare-and-set (required)'),
            },
            // RB-ANGULAR-001: role-only updates (e.g. updateUserRoles) carry
            // just the id plus roles; the controller defaults the rest.
            // AUTH-P5-002: every profile mutation pins CAS.
            ['id', 'expectedVersion']
          ),
        },
      },
    },
  },
  {
    tags: ['Users'],
    summary: 'Update user',
    responses: {
      201: responseField(createUserApiResponseSchema, 'User updated'),
      401: authorizationProblemResponse('Authentication is required'),
      403: authorizationProblemResponse('The active principal lacks user authorization'),
      404: authorizationProblemResponse('User or brand not found (opaque)'),
      409: authorizationProblemResponse('Stale version or quorum conflict'),
      422: authorizationProblemResponse('Requested roles are unknown in this brand'),
      503: authorizationProblemResponse('User storage capability unavailable'),
    },
  }
);

export const disableUserRoute = apiRoute(
  'post',
  '/:branding/:portal/api/users/:id/disable',
  'webservice/UserManagementController',
  'disableUser',
  {
    params: idParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: objectField(
            {
              expectedVersion: integerField(
                'Caller-observed loginDisabledVersion for compare-and-set (required for versioned users)'
              ),
              reason: stringField('Disable reason'),
            },
            ['expectedVersion'],
            'Disable user payload',
            true
          ),
        },
      },
    },
  },
  {
    tags: ['Users'],
    summary: 'Disable user',
    responses: {
      200: responseField(statusMessageResponseSchema, 'User disabled'),
      401: authorizationProblemResponse('Authentication is required'),
      403: authorizationProblemResponse('The active principal lacks user authorization'),
      404: authorizationProblemResponse('User or brand not found (opaque)'),
      409: authorizationProblemResponse('Stale version or quorum conflict'),
      422: authorizationProblemResponse('Disable request was invalid'),
      503: authorizationProblemResponse('User storage capability unavailable'),
    },
  }
);

export const enableUserRoute = apiRoute(
  'post',
  '/:branding/:portal/api/users/:id/enable',
  'webservice/UserManagementController',
  'enableUser',
  {
    params: idParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: objectField(
            {
              expectedVersion: integerField(
                'Caller-observed loginDisabledVersion for compare-and-set (required for versioned users)'
              ),
              reason: stringField('Enable reason'),
            },
            ['expectedVersion'],
            'Enable user payload',
            true
          ),
        },
      },
    },
  },
  {
    tags: ['Users'],
    summary: 'Enable user',
    responses: {
      200: responseField(statusMessageResponseSchema, 'User enabled'),
      401: authorizationProblemResponse('Authentication is required'),
      403: authorizationProblemResponse('The active principal lacks user authorization'),
      404: authorizationProblemResponse('User or brand not found (opaque)'),
      409: authorizationProblemResponse('Stale version or quorum conflict'),
      422: authorizationProblemResponse('Enable request was invalid'),
      503: authorizationProblemResponse('User storage capability unavailable'),
    },
  }
);

export const generateAPITokenRoute = apiRoute(
  'post',
  '/:branding/:portal/api/users/token/generate',
  'webservice/UserManagementController',
  'generateAPIToken',
  {
    query: objectField(
      {
        id: stringField(),
        expectedVersion: integerField('Caller-observed loginDisabledVersion for compare-and-set (required)'),
      },
      ['id', 'expectedVersion']
    ),
  },
  {
    tags: ['Users'],
    summary: 'Generate API token',
    responses: {
      200: responseField(userApiTokenApiResponseSchema, 'API token generated'),
      400: authorizationProblemResponse('User id is required'),
      401: authorizationProblemResponse('Authentication is required'),
      403: authorizationProblemResponse('The active principal lacks user authorization'),
      404: authorizationProblemResponse('User or brand not found (opaque)'),
      409: authorizationProblemResponse('Stale version or quorum conflict'),
      422: authorizationProblemResponse('Missing or invalid expectedVersion'),
      503: authorizationProblemResponse('User storage capability unavailable'),
    },
  }
);

export const revokeAPITokenRoute = apiRoute(
  'post',
  '/:branding/:portal/api/users/token/revoke',
  'webservice/UserManagementController',
  'revokeAPIToken',
  {
    query: objectField(
      {
        id: stringField(),
        expectedVersion: integerField('Caller-observed loginDisabledVersion for compare-and-set (required)'),
      },
      ['id', 'expectedVersion']
    ),
  },
  {
    tags: ['Users'],
    summary: 'Revoke API token',
    responses: {
      200: responseField(userApiTokenApiResponseSchema, 'API token revoked'),
      400: authorizationProblemResponse('User id is required'),
      401: authorizationProblemResponse('Authentication is required'),
      403: authorizationProblemResponse('The active principal lacks user authorization'),
      404: authorizationProblemResponse('User or brand not found (opaque)'),
      409: authorizationProblemResponse('Stale version or quorum conflict'),
      422: authorizationProblemResponse('Missing or invalid expectedVersion'),
      503: authorizationProblemResponse('User storage capability unavailable'),
    },
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
  previewLinkAccountsRoute,
  linkAccountsRoute,
  getLinkOperationRoute,
  retryLinkOperationRoute,
  createUserRoute,
  updateUserRoute,
  disableUserRoute,
  enableUserRoute,
  generateAPITokenRoute,
  revokeAPITokenRoute,
  listSystemRolesRoute,
  createSystemRoleRoute,
];
