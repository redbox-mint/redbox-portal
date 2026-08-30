import { scopeAuthorization } from '../../authorization';
import { apiRoute } from '../route-factory';
import {
  authorizationApiVersionHeadersSchema,
  authorizationAuditPageSchema,
  authorizationAuditQuerySchema,
  authorizationAssignmentCatalogPageSchema,
  authorizationAssignmentGrantBodySchema,
  authorizationAssignmentMutationBodySchema,
  authorizationAssignmentMutationResultSchema,
  authorizationAssignmentParamsSchema,
  authorizationAssignmentQuerySchema,
  authorizationAssignmentUserParamsSchema,
  authorizationBulkApplyBodySchema,
  authorizationBulkAssignmentMutationSchema,
  authorizationBulkAssignmentPreviewSchema,
  authorizationBulkPreviewBodySchema,
  authorizationBulkTemplateUpgradeApplyBodySchema,
  authorizationBulkTemplateUpgradeMutationSchema,
  authorizationBulkTemplateUpgradePreviewBodySchema,
  authorizationBulkTemplateUpgradePreviewSchema,
  authorizationCreateRoleBodySchema,
  authorizationConfigurationExportResponseSchema,
  authorizationConfigurationImportMutationSchema,
  authorizationConfigurationImportPreviewSchema,
  authorizationExplainBodySchema,
  authorizationExplainResultSchema,
  authorizationExportQuerySchema,
  authorizationImportApplyBodySchema,
  authorizationImportPreviewBodySchema,
  authorizationMeSchema,
  authorizationProblemResponses,
  authorizationReadinessSchema,
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
  authorizationSensitiveExportHeadersSchema,
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

export const listAuthorizationAssignmentsRoute = apiRoute(
  'get',
  `${BASE_PATH}/assignments`,
  CONTROLLER,
  'listAssignments',
  { headers: authorizationApiVersionHeadersSchema, query: authorizationAssignmentQuerySchema },
  {
    authorization: scopeAuthorization('authorization.assignment.read'),
    tags: ['Authorization'],
    summary: 'List assignments in the active authorization context',
    description:
      'Brand administrators see only active-brand assignments. A system administrator also sees the single protected global system-role assignment context.',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationAssignmentCatalogPageSchema, 'Cursor-paginated assignment catalog'),
    },
  }
);

export const grantAuthorizationAssignmentRoute = apiRoute(
  'put',
  `${BASE_PATH}/assignments/:roleKey/users/:userId`,
  CONTROLLER,
  'grantAssignment',
  {
    headers: authorizationApiVersionHeadersSchema,
    params: authorizationAssignmentUserParamsSchema,
    body: jsonBody(authorizationAssignmentGrantBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.assignment.manage'),
    tags: ['Authorization'],
    summary: 'Idempotently grant or reactivate one manual assignment',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationAssignmentMutationResultSchema, 'Manual assignment granted or unchanged'),
    },
  }
);

export const revokeAuthorizationAssignmentRoute = apiRoute(
  'delete',
  `${BASE_PATH}/assignments/:roleKey/users/:userId`,
  CONTROLLER,
  'revokeAssignment',
  {
    headers: authorizationApiVersionHeadersSchema,
    params: authorizationAssignmentUserParamsSchema,
    body: jsonBody(authorizationAssignmentMutationBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.assignment.manage'),
    tags: ['Authorization'],
    summary: 'Revoke only the exact manual assignment source',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationAssignmentMutationResultSchema, 'Manual assignment revoked or unchanged'),
    },
  }
);

export const suppressAuthorizationAssignmentRoute = apiRoute(
  'post',
  `${BASE_PATH}/assignments/:assignmentId/suppress`,
  CONTROLLER,
  'suppressAssignment',
  {
    headers: authorizationApiVersionHeadersSchema,
    params: authorizationAssignmentParamsSchema,
    body: jsonBody(authorizationAssignmentMutationBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.assignment.manage'),
    tags: ['Authorization'],
    summary: 'Locally suppress one external assignment source tuple',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationAssignmentMutationResultSchema, 'External assignment suppressed'),
    },
  }
);

export const unsuppressAuthorizationAssignmentRoute = apiRoute(
  'post',
  `${BASE_PATH}/assignments/:assignmentId/unsuppress`,
  CONTROLLER,
  'unsuppressAssignment',
  {
    headers: authorizationApiVersionHeadersSchema,
    params: authorizationAssignmentParamsSchema,
    body: jsonBody(authorizationAssignmentMutationBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.assignment.manage'),
    tags: ['Authorization'],
    summary: 'Remove local suppression from one external assignment source tuple',
    description:
      'The assignment becomes active only when the latest successful provider synchronization still requests it.',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationAssignmentMutationResultSchema, 'External assignment unsuppressed'),
    },
  }
);

export const previewAuthorizationBulkAssignmentsRoute = apiRoute(
  'post',
  `${BASE_PATH}/assignments/bulk-preview`,
  CONTROLLER,
  'previewBulkAssignments',
  { headers: authorizationApiVersionHeadersSchema, body: jsonBody(authorizationBulkPreviewBodySchema) },
  {
    authorization: scopeAuthorization('authorization.assignment.manage'),
    tags: ['Authorization'],
    summary: 'Validate and preview one bounded manual assignment batch',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationBulkAssignmentPreviewSchema, 'Assignment batch validation preview'),
    },
  }
);

export const applyAuthorizationBulkAssignmentsRoute = apiRoute(
  'post',
  `${BASE_PATH}/assignments/bulk-apply`,
  CONTROLLER,
  'applyBulkAssignments',
  { headers: authorizationApiVersionHeadersSchema, body: jsonBody(authorizationBulkApplyBodySchema) },
  {
    authorization: scopeAuthorization('authorization.assignment.manage'),
    tags: ['Authorization'],
    summary: 'Atomically apply one unchanged confirmed manual assignment batch',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationBulkAssignmentMutationSchema, 'Assignment batch applied transactionally'),
    },
  }
);

export const listAuthorizationAuditRoute = apiRoute(
  'get',
  `${BASE_PATH}/audit`,
  CONTROLLER,
  'listAudit',
  { headers: authorizationApiVersionHeadersSchema, query: authorizationAuditQuerySchema },
  {
    authorization: scopeAuthorization('authorization.audit.read'),
    tags: ['Authorization'],
    summary: 'List redacted authorization audit events',
    description:
      'Brand readers are forced to their active brand. System administrators may omit brandId to inspect all bounded contexts.',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationAuditPageSchema, 'Cursor-paginated redacted authorization audit'),
    },
  }
);

export const explainAuthorizationDecisionRoute = apiRoute(
  'post',
  `${BASE_PATH}/explain`,
  CONTROLLER,
  'explainDecision',
  { headers: authorizationApiVersionHeadersSchema, body: jsonBody(authorizationExplainBodySchema) },
  {
    authorization: scopeAuthorization('authorization.explain'),
    tags: ['Authorization'],
    summary: 'Explain one hypothetical authorization decision without mutation',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationExplainResultSchema, 'Privileged read-only authorization explanation'),
    },
  }
);

export const getAuthorizationReadinessRoute = apiRoute(
  'get',
  `${BASE_PATH}/rollout/readiness`,
  CONTROLLER,
  'getReadiness',
  { headers: authorizationApiVersionHeadersSchema },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    tags: ['Authorization'],
    summary: 'Get bounded deployment-wide authorization rollout readiness',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationReadinessSchema, 'Authorization rollout readiness evidence'),
    },
  }
);

export const exportAuthorizationConfigurationRoute = apiRoute(
  'get',
  `${BASE_PATH}/export`,
  CONTROLLER,
  'exportConfiguration',
  { headers: authorizationSensitiveExportHeadersSchema, query: authorizationExportQuerySchema },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    tags: ['Authorization'],
    summary: 'Export deterministic versioned authorization configuration',
    description:
      'Assignment export is excluded by default and uses a separately confirmed preview because it contains user identifiers. Send the token in X-ReDBox-Authorization-Confirmation; protected system assignments require an additional explicit flag.',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(
        authorizationConfigurationExportResponseSchema,
        'Configuration document or sensitive-export confirmation preview'
      ),
    },
  }
);

export const previewAuthorizationImportRoute = apiRoute(
  'post',
  `${BASE_PATH}/import-preview`,
  CONTROLLER,
  'previewImport',
  { headers: authorizationApiVersionHeadersSchema, body: jsonBody(authorizationImportPreviewBodySchema) },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    tags: ['Authorization'],
    summary: 'Validate and preview a bounded versioned authorization import',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationConfigurationImportPreviewSchema, 'Configuration import validation preview'),
    },
  }
);

export const applyAuthorizationImportRoute = apiRoute(
  'post',
  `${BASE_PATH}/import-apply`,
  CONTROLLER,
  'applyImport',
  { headers: authorizationApiVersionHeadersSchema, body: jsonBody(authorizationImportApplyBodySchema) },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    tags: ['Authorization'],
    summary: 'Atomically apply an unchanged confirmed authorization import',
    responses: {
      ...authorizationProblemResponses,
      200: jsonResponse(authorizationConfigurationImportMutationSchema, 'Configuration import applied transactionally'),
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
  listAuthorizationAssignmentsRoute,
  grantAuthorizationAssignmentRoute,
  revokeAuthorizationAssignmentRoute,
  suppressAuthorizationAssignmentRoute,
  unsuppressAuthorizationAssignmentRoute,
  previewAuthorizationBulkAssignmentsRoute,
  applyAuthorizationBulkAssignmentsRoute,
  listAuthorizationAuditRoute,
  explainAuthorizationDecisionRoute,
  getAuthorizationReadinessRoute,
  exportAuthorizationConfigurationRoute,
  previewAuthorizationImportRoute,
  applyAuthorizationImportRoute,
] as const;
