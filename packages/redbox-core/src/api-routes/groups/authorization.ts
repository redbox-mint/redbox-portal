import { scopeAuthorization } from '../../authorization';
import { apiRoute } from '../route-factory';
import {
  authorizationApiVersionHeadersSchema,
  authorizationBulkTemplateUpgradeApplyBodySchema,
  authorizationBulkTemplateUpgradeMutationSchema,
  authorizationBulkTemplateUpgradePreviewBodySchema,
  authorizationBulkTemplateUpgradePreviewSchema,
  authorizationCreateRoleBodySchema,
  authorizationMeSchema,
  authorizationProblemResponses,
  authorizationRoleCatalogPageSchema,
  authorizationRoleDeleteBodySchema,
  authorizationRoleDeleteResponseSchema,
  authorizationRoleInactivationPreviewSchema,
  authorizationRoleLifecycleApplyBodySchema,
  authorizationRoleLifecyclePreviewBodySchema,
  authorizationRoleMutationResultSchema,
  authorizationRoleParamsSchema,
  authorizationRoleQuerySchema,
  authorizationRoleScopeApplyBodySchema,
  authorizationRoleScopePreviewBodySchema,
  authorizationRoleScopePreviewSchema,
  authorizationRoleSchema,
  authorizationRoleTemplateUpgradeApplyBodySchema,
  authorizationRoleTemplateUpgradePreviewBodySchema,
  authorizationRoleTemplateUpgradePreviewSchema,
  authorizationScopeCatalogPageSchema,
  authorizationScopeCatalogQuerySchema,
  authorizationTemplatePageSchema,
  authorizationTemplatePublishBodySchema,
  authorizationTemplatePublishResponseSchema,
  authorizationTemplateQuerySchema,
  authorizationTemplateRevisionParamsSchema,
  authorizationTemplateRevisionDetailSchema,
  authorizationTemplateParamsSchema,
  authorizationUpdateRoleBodySchema,
  authorizationVersionedSuccessSchema,
} from '../schemas/authorization';
import type { ApiResponseDefinition, ApiSchemaField } from '../types';

const CONTROLLER = 'webservice/AuthorizationController';

/**
 * Single source of truth for the authorization contract path prefix. The policy builder
 * uses this to decide which unsafe routes receive the conditional CSRF policy, so the
 * prefix must never be restated as a literal elsewhere.
 */
export const AUTHORIZATION_API_BASE_PATH = '/:branding/:portal/api/authorization';
const BASE_PATH = AUTHORIZATION_API_BASE_PATH;

function jsonResponse(schema: ApiSchemaField, description: string): ApiResponseDefinition {
  return {
    description: `${description}. API v1 returns the body directly; API v2 returns { data, meta }`,
    content: {
      'application/json': { schema: authorizationVersionedSuccessSchema(schema) },
    },
  };
}

function jsonBody(schema: ApiSchemaField) {
  return {
    required: true,
    content: {
      'application/json': { schema },
    },
  } as const;
}

export const getAuthorizationMeRoute = apiRoute(
  'get',
  `${BASE_PATH}/me`,
  CONTROLLER,
  'getMe',
  { headers: authorizationApiVersionHeadersSchema },
  {
    authorization: scopeAuthorization('authorization.self.read'),
    tags: ['Authorization'],
    summary: 'Get the caller effective authorization projection',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationMeSchema, 'Caller-safe effective principal projection'),
    },
  }
);

export const listAuthorizationScopesRoute = apiRoute(
  'get',
  `${BASE_PATH}/scopes`,
  CONTROLLER,
  'listScopes',
  { headers: authorizationApiVersionHeadersSchema, query: authorizationScopeCatalogQuerySchema },
  {
    authorization: scopeAuthorization('authorization.scope.read'),
    tags: ['Authorization'],
    summary: 'List the deployed authorization scope catalog',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationScopeCatalogPageSchema, 'Cursor-paginated scope catalog'),
    },
  }
);

export const listAuthorizationTemplatesRoute = apiRoute(
  'get',
  `${BASE_PATH}/templates`,
  CONTROLLER,
  'listTemplates',
  { headers: authorizationApiVersionHeadersSchema, query: authorizationTemplateQuerySchema },
  {
    authorization: scopeAuthorization('authorization.role.read'),
    tags: ['Authorization'],
    summary: 'List role templates and their immutable revisions',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationTemplatePageSchema, 'Cursor-paginated role template catalog'),
    },
  }
);

export const getAuthorizationTemplateRevisionRoute = apiRoute(
  'get',
  `${BASE_PATH}/templates/:key/revisions/:revision`,
  CONTROLLER,
  'getTemplateRevision',
  { headers: authorizationApiVersionHeadersSchema, params: authorizationTemplateRevisionParamsSchema },
  {
    authorization: scopeAuthorization('authorization.role.read'),
    tags: ['Authorization'],
    summary: 'Read one immutable role template revision',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationTemplateRevisionDetailSchema, 'Immutable role template revision'),
    },
  }
);

export const publishAuthorizationTemplateRevisionRoute = apiRoute(
  'post',
  `${BASE_PATH}/templates/:key/revisions`,
  CONTROLLER,
  'publishTemplateRevision',
  {
    params: authorizationTemplateParamsSchema,
    headers: authorizationApiVersionHeadersSchema,
    body: {
      required: true,
      content: {
        'application/json': { schema: authorizationTemplatePublishBodySchema },
      },
    },
  },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    tags: ['Authorization'],
    summary: 'Preview or publish the next immutable role template revision',
    description:
      'Omit confirmationToken to receive a server-authoritative preview, then repeat the unchanged request with that token to publish.',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationTemplatePublishResponseSchema, 'Template publication preview'),
      201: jsonResponse(authorizationTemplatePublishResponseSchema, 'Template revision published'),
    },
  }
);

export const listAuthorizationRolesRoute = apiRoute(
  'get',
  `${BASE_PATH}/roles`,
  CONTROLLER,
  'listRoles',
  { headers: authorizationApiVersionHeadersSchema, query: authorizationRoleQuerySchema },
  {
    authorization: scopeAuthorization('authorization.role.read'),
    tags: ['Authorization'],
    summary: 'List roles in the active brand',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationRoleCatalogPageSchema, 'Cursor-paginated current-brand role catalog'),
    },
  }
);

export const createAuthorizationRoleRoute = apiRoute(
  'post',
  `${BASE_PATH}/roles`,
  CONTROLLER,
  'createRole',
  { headers: authorizationApiVersionHeadersSchema, body: jsonBody(authorizationCreateRoleBodySchema) },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    tags: ['Authorization'],
    summary: 'Create a custom, template-based, or same-brand cloned role',
    responses: {
      ...authorizationProblemResponses,
      201: jsonResponse(authorizationRoleMutationResultSchema, 'Role created transactionally'),
    },
  }
);

export const getAuthorizationRoleRoute = apiRoute(
  'get',
  `${BASE_PATH}/roles/:key`,
  CONTROLLER,
  'getRole',
  { headers: authorizationApiVersionHeadersSchema, params: authorizationRoleParamsSchema },
  {
    authorization: scopeAuthorization('authorization.role.read'),
    tags: ['Authorization'],
    summary: 'Read one role in the active brand',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationRoleSchema, 'Current role base, overrides, effective scopes, and version'),
    },
  }
);

export const updateAuthorizationRoleRoute = apiRoute(
  'patch',
  `${BASE_PATH}/roles/:key`,
  CONTROLLER,
  'updateRole',
  {
    headers: authorizationApiVersionHeadersSchema,
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationUpdateRoleBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    tags: ['Authorization'],
    summary: 'Update a role label or description with optimistic concurrency',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationRoleMutationResultSchema, 'Role metadata updated transactionally'),
    },
  }
);

export const previewAuthorizationRoleScopesRoute = apiRoute(
  'post',
  `${BASE_PATH}/roles/:key/scope-preview`,
  CONTROLLER,
  'previewRoleScopes',
  {
    headers: authorizationApiVersionHeadersSchema,
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleScopePreviewBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    tags: ['Authorization'],
    summary: 'Preview a desired effective role scope set',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationRoleScopePreviewSchema, 'Role scope impact preview'),
    },
  }
);

export const applyAuthorizationRoleScopesRoute = apiRoute(
  'put',
  `${BASE_PATH}/roles/:key/scopes`,
  CONTROLLER,
  'applyRoleScopes',
  {
    headers: authorizationApiVersionHeadersSchema,
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleScopeApplyBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    tags: ['Authorization'],
    summary: 'Apply a confirmed desired effective role scope set',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationRoleMutationResultSchema, 'Role scopes updated transactionally'),
    },
  }
);

export const previewAuthorizationRoleTemplateUpgradeRoute = apiRoute(
  'post',
  `${BASE_PATH}/roles/:key/template-upgrade-preview`,
  CONTROLLER,
  'previewRoleTemplateUpgrade',
  {
    headers: authorizationApiVersionHeadersSchema,
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleTemplateUpgradePreviewBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    tags: ['Authorization'],
    summary: 'Preview a three-way role template revision upgrade',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationRoleTemplateUpgradePreviewSchema, 'Role template upgrade preview'),
    },
  }
);

export const applyAuthorizationRoleTemplateUpgradeRoute = apiRoute(
  'post',
  `${BASE_PATH}/roles/:key/template-upgrade`,
  CONTROLLER,
  'applyRoleTemplateUpgrade',
  {
    headers: authorizationApiVersionHeadersSchema,
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleTemplateUpgradeApplyBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    tags: ['Authorization'],
    summary: 'Apply a confirmed role template revision upgrade',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationRoleMutationResultSchema, 'Role template revision upgraded transactionally'),
    },
  }
);

export const previewAuthorizationBulkTemplateUpgradeRoute = apiRoute(
  'post',
  `${BASE_PATH}/template-upgrades/bulk-preview`,
  CONTROLLER,
  'previewBulkTemplateUpgrade',
  { headers: authorizationApiVersionHeadersSchema, body: jsonBody(authorizationBulkTemplateUpgradePreviewBodySchema) },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    tags: ['Authorization'],
    summary: 'Preview one template revision for explicitly selected brand roles',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationBulkTemplateUpgradePreviewSchema, 'Selected-role template upgrade preview'),
    },
  }
);

export const applyAuthorizationBulkTemplateUpgradeRoute = apiRoute(
  'post',
  `${BASE_PATH}/template-upgrades/bulk-apply`,
  CONTROLLER,
  'applyBulkTemplateUpgrade',
  { headers: authorizationApiVersionHeadersSchema, body: jsonBody(authorizationBulkTemplateUpgradeApplyBodySchema) },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    tags: ['Authorization'],
    summary: 'Atomically apply a confirmed selected-role template upgrade',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationBulkTemplateUpgradeMutationSchema, 'Selected roles upgraded transactionally'),
    },
  }
);

export const previewAuthorizationRoleInactivationRoute = apiRoute(
  'post',
  `${BASE_PATH}/roles/:key/inactivation-preview`,
  CONTROLLER,
  'previewRoleInactivation',
  {
    headers: authorizationApiVersionHeadersSchema,
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleLifecyclePreviewBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    tags: ['Authorization'],
    summary: 'Preview role inactivation impact',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationRoleInactivationPreviewSchema, 'Role inactivation impact preview'),
    },
  }
);

export const inactivateAuthorizationRoleRoute = apiRoute(
  'post',
  `${BASE_PATH}/roles/:key/inactivate`,
  CONTROLLER,
  'inactivateRole',
  {
    headers: authorizationApiVersionHeadersSchema,
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleLifecycleApplyBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    tags: ['Authorization'],
    summary: 'Inactivate an eligible role after confirmed impact review',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationRoleMutationResultSchema, 'Role inactivated transactionally'),
    },
  }
);

export const deleteAuthorizationRoleRoute = apiRoute(
  'delete',
  `${BASE_PATH}/roles/:key`,
  CONTROLLER,
  'deleteRole',
  {
    headers: authorizationApiVersionHeadersSchema,
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleDeleteBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    tags: ['Authorization'],
    summary: 'Preview or apply dependency-free role deletion',
    description:
      'Omit confirmationToken to receive the server dependency preview, then repeat the unchanged DELETE body with that token to apply.',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationRoleDeleteResponseSchema, 'Role deletion preview or transactional result'),
    },
  }
);

export const authorizationApiRoutes = [
  getAuthorizationMeRoute,
  listAuthorizationScopesRoute,
  listAuthorizationTemplatesRoute,
  getAuthorizationTemplateRevisionRoute,
  publishAuthorizationTemplateRevisionRoute,
  listAuthorizationRolesRoute,
  createAuthorizationRoleRoute,
  getAuthorizationRoleRoute,
  updateAuthorizationRoleRoute,
  previewAuthorizationRoleScopesRoute,
  applyAuthorizationRoleScopesRoute,
  previewAuthorizationRoleTemplateUpgradeRoute,
  applyAuthorizationRoleTemplateUpgradeRoute,
  previewAuthorizationBulkTemplateUpgradeRoute,
  applyAuthorizationBulkTemplateUpgradeRoute,
  previewAuthorizationRoleInactivationRoute,
  inactivateAuthorizationRoleRoute,
  deleteAuthorizationRoleRoute,
] as const;
