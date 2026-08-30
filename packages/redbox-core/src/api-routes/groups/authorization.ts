import { scopeAuthorization } from '../../authorization';
import { apiRoute, type ApiRouteMetadata } from '../route-factory';
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
  authorizationScopeAdoptionApplyBodySchema,
  authorizationScopeAdoptionPreviewBodySchema,
  authorizationScopeAdoptionPreviewSchema,
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
import type { ApiRequestDefinition, ApiResponseDefinition, ApiSchemaField, HttpMethod } from '../types';

const CONTROLLER = 'webservice/AuthorizationController';

/**
 * Single source of truth for the authorization contract path prefix. The policy builder
 * uses this to decide which unsafe routes receive the conditional CSRF policy, so the
 * prefix must never be restated as a literal elsewhere.
 */
export const AUTHORIZATION_API_BASE_PATH = '/:branding/:portal/api/authorization';

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

type AuthorizationRouteMetadata = Omit<ApiRouteMetadata, 'responses' | 'tags'> & {
  readonly responses?: Record<number, ApiResponseDefinition>;
};

function authorizationRoute(
  method: HttpMethod,
  path: string,
  action: string,
  request: ApiRequestDefinition | undefined,
  metadata: AuthorizationRouteMetadata
) {
  return apiRoute(
    method,
    `${AUTHORIZATION_API_BASE_PATH}${path}`,
    CONTROLLER,
    action,
    { headers: authorizationApiVersionHeadersSchema, ...(request ?? {}) },
    {
      ...metadata,
      tags: ['Authorization'],
      responses: { ...authorizationProblemResponses, ...metadata.responses },
    }
  );
}

export const getAuthorizationMeRoute = authorizationRoute(
  'get',
  `/me`,
  'getMe',
  {},
  {
    authorization: scopeAuthorization('authorization.self.read'),
    summary: 'Get the caller effective authorization projection',
    responses: {
      200: jsonResponse(authorizationMeSchema, 'Caller-safe effective principal projection'),
    },
  }
);

export const listAuthorizationScopesRoute = authorizationRoute(
  'get',
  `/scopes`,
  'listScopes',
  { query: authorizationScopeCatalogQuerySchema },
  {
    authorization: scopeAuthorization('authorization.scope.read'),
    summary: 'List the deployed authorization scope catalog',
    responses: {
      200: jsonResponse(authorizationScopeCatalogPageSchema, 'Cursor-paginated scope catalog'),
    },
  }
);

export const listAuthorizationTemplatesRoute = authorizationRoute(
  'get',
  `/templates`,
  'listTemplates',
  { query: authorizationTemplateQuerySchema },
  {
    authorization: scopeAuthorization('authorization.role.read'),
    summary: 'List role templates and their immutable revisions',
    responses: {
      200: jsonResponse(authorizationTemplatePageSchema, 'Cursor-paginated role template catalog'),
    },
  }
);

export const getAuthorizationTemplateRevisionRoute = authorizationRoute(
  'get',
  `/templates/:key/revisions/:revision`,
  'getTemplateRevision',
  { params: authorizationTemplateRevisionParamsSchema },
  {
    authorization: scopeAuthorization('authorization.role.read'),
    summary: 'Read one immutable role template revision',
    responses: {
      200: jsonResponse(authorizationTemplateRevisionDetailSchema, 'Immutable role template revision'),
    },
  }
);

export const publishAuthorizationTemplateRevisionRoute = authorizationRoute(
  'post',
  `/templates/:key/revisions`,
  'publishTemplateRevision',
  {
    params: authorizationTemplateParamsSchema,
    body: {
      required: true,
      content: {
        'application/json': { schema: authorizationTemplatePublishBodySchema },
      },
    },
  },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    summary: 'Preview or publish the next immutable role template revision',
    description:
      'Omit confirmationToken to receive a server-authoritative preview, then repeat the unchanged request with that token to publish.',
    responses: {
      200: jsonResponse(authorizationTemplatePublishResponseSchema, 'Template publication preview'),
      201: jsonResponse(authorizationTemplatePublishResponseSchema, 'Template revision published'),
    },
  }
);

export const listAuthorizationRolesRoute = authorizationRoute(
  'get',
  `/roles`,
  'listRoles',
  { query: authorizationRoleQuerySchema },
  {
    authorization: scopeAuthorization('authorization.role.read'),
    summary: 'List roles in the active brand',
    responses: {
      200: jsonResponse(authorizationRoleCatalogPageSchema, 'Cursor-paginated current-brand role catalog'),
    },
  }
);

export const createAuthorizationRoleRoute = authorizationRoute(
  'post',
  `/roles`,
  'createRole',
  { body: jsonBody(authorizationCreateRoleBodySchema) },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    summary: 'Create a custom, template-based, or same-brand cloned role',
    responses: {
      201: jsonResponse(authorizationRoleMutationResultSchema, 'Role created transactionally'),
    },
  }
);

export const getAuthorizationRoleRoute = authorizationRoute(
  'get',
  `/roles/:key`,
  'getRole',
  { params: authorizationRoleParamsSchema },
  {
    authorization: scopeAuthorization('authorization.role.read'),
    summary: 'Read one role in the active brand',
    responses: {
      200: jsonResponse(authorizationRoleSchema, 'Current role base, overrides, effective scopes, and version'),
    },
  }
);

export const updateAuthorizationRoleRoute = authorizationRoute(
  'patch',
  `/roles/:key`,
  'updateRole',
  {
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationUpdateRoleBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    summary: 'Update a role label or description with optimistic concurrency',
    responses: {
      200: jsonResponse(authorizationRoleMutationResultSchema, 'Role metadata updated transactionally'),
    },
  }
);

export const previewAuthorizationRoleScopesRoute = authorizationRoute(
  'post',
  `/roles/:key/scope-preview`,
  'previewRoleScopes',
  {
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleScopePreviewBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    summary: 'Preview a desired effective role scope set',
    responses: {
      200: jsonResponse(authorizationRoleScopePreviewSchema, 'Role scope impact preview'),
    },
  }
);

export const applyAuthorizationRoleScopesRoute = authorizationRoute(
  'put',
  `/roles/:key/scopes`,
  'applyRoleScopes',
  {
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleScopeApplyBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    summary: 'Apply a confirmed desired effective role scope set',
    responses: {
      200: jsonResponse(authorizationRoleMutationResultSchema, 'Role scopes updated transactionally'),
    },
  }
);

export const previewAuthorizationScopeAdoptionRoute = authorizationRoute(
  'post',
  `/roles/:key/scope-adoption-preview`,
  'previewScopeAdoption',
  {
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationScopeAdoptionPreviewBodySchema),
  },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    summary: 'Preview adoption of one deployed scope into the protected system role',
    responses: {
      200: jsonResponse(authorizationScopeAdoptionPreviewSchema, 'Protected system-scope adoption preview'),
    },
  }
);

export const applyAuthorizationScopeAdoptionRoute = authorizationRoute(
  'post',
  `/roles/:key/scope-adoption`,
  'applyScopeAdoption',
  {
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationScopeAdoptionApplyBodySchema),
  },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    summary: 'Apply an unchanged confirmed protected system-scope adoption',
    responses: {
      200: jsonResponse(authorizationRoleMutationResultSchema, 'Protected system scope adopted transactionally'),
    },
  }
);

export const previewAuthorizationRoleTemplateUpgradeRoute = authorizationRoute(
  'post',
  `/roles/:key/template-upgrade-preview`,
  'previewRoleTemplateUpgrade',
  {
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleTemplateUpgradePreviewBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    summary: 'Preview a three-way role template revision upgrade',
    responses: {
      200: jsonResponse(authorizationRoleTemplateUpgradePreviewSchema, 'Role template upgrade preview'),
    },
  }
);

export const applyAuthorizationRoleTemplateUpgradeRoute = authorizationRoute(
  'post',
  `/roles/:key/template-upgrade`,
  'applyRoleTemplateUpgrade',
  {
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleTemplateUpgradeApplyBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    summary: 'Apply a confirmed role template revision upgrade',
    responses: {
      200: jsonResponse(authorizationRoleMutationResultSchema, 'Role template revision upgraded transactionally'),
    },
  }
);

export const previewAuthorizationBulkTemplateUpgradeRoute = authorizationRoute(
  'post',
  `/template-upgrades/bulk-preview`,
  'previewBulkTemplateUpgrade',
  { body: jsonBody(authorizationBulkTemplateUpgradePreviewBodySchema) },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    summary: 'Preview one template revision for explicitly selected brand roles',
    responses: {
      200: jsonResponse(authorizationBulkTemplateUpgradePreviewSchema, 'Selected-role template upgrade preview'),
    },
  }
);

export const applyAuthorizationBulkTemplateUpgradeRoute = authorizationRoute(
  'post',
  `/template-upgrades/bulk-apply`,
  'applyBulkTemplateUpgrade',
  { body: jsonBody(authorizationBulkTemplateUpgradeApplyBodySchema) },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    summary: 'Atomically apply a confirmed selected-role template upgrade',
    responses: {
      200: jsonResponse(authorizationBulkTemplateUpgradeMutationSchema, 'Selected roles upgraded transactionally'),
    },
  }
);

export const previewAuthorizationRoleInactivationRoute = authorizationRoute(
  'post',
  `/roles/:key/inactivation-preview`,
  'previewRoleInactivation',
  {
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleLifecyclePreviewBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    summary: 'Preview role inactivation impact',
    responses: {
      200: jsonResponse(authorizationRoleInactivationPreviewSchema, 'Role inactivation impact preview'),
    },
  }
);

export const inactivateAuthorizationRoleRoute = authorizationRoute(
  'post',
  `/roles/:key/inactivate`,
  'inactivateRole',
  {
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleLifecycleApplyBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    summary: 'Inactivate an eligible role after confirmed impact review',
    responses: {
      200: jsonResponse(authorizationRoleMutationResultSchema, 'Role inactivated transactionally'),
    },
  }
);

export const deleteAuthorizationRoleRoute = authorizationRoute(
  'delete',
  `/roles/:key`,
  'deleteRole',
  {
    params: authorizationRoleParamsSchema,
    body: jsonBody(authorizationRoleDeleteBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.role.manage'),
    summary: 'Preview or apply dependency-free role deletion',
    description:
      'Omit confirmationToken to receive the server dependency preview, then repeat the unchanged DELETE body with that token to apply.',
    responses: {
      200: jsonResponse(authorizationRoleDeleteResponseSchema, 'Role deletion preview or transactional result'),
    },
  }
);

export const listAuthorizationAssignmentsRoute = authorizationRoute(
  'get',
  `/assignments`,
  'listAssignments',
  { query: authorizationAssignmentQuerySchema },
  {
    authorization: scopeAuthorization('authorization.assignment.read'),
    summary: 'List assignments in the active authorization context',
    description:
      'Brand administrators see only active-brand assignments. A system administrator also sees the single protected global system-role assignment context.',
    responses: {
      200: jsonResponse(authorizationAssignmentCatalogPageSchema, 'Cursor-paginated assignment catalog'),
    },
  }
);

export const grantAuthorizationAssignmentRoute = authorizationRoute(
  'put',
  `/assignments/:roleKey/users/:userId`,
  'grantAssignment',
  {
    params: authorizationAssignmentUserParamsSchema,
    body: jsonBody(authorizationAssignmentGrantBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.assignment.manage'),
    summary: 'Idempotently grant or reactivate one manual assignment',
    responses: {
      200: jsonResponse(authorizationAssignmentMutationResultSchema, 'Manual assignment granted or unchanged'),
    },
  }
);

export const revokeAuthorizationAssignmentRoute = authorizationRoute(
  'delete',
  `/assignments/:roleKey/users/:userId`,
  'revokeAssignment',
  {
    params: authorizationAssignmentUserParamsSchema,
    body: jsonBody(authorizationAssignmentMutationBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.assignment.manage'),
    summary: 'Revoke only the exact manual assignment source',
    responses: {
      200: jsonResponse(authorizationAssignmentMutationResultSchema, 'Manual assignment revoked or unchanged'),
    },
  }
);

export const suppressAuthorizationAssignmentRoute = authorizationRoute(
  'post',
  `/assignments/:assignmentId/suppress`,
  'suppressAssignment',
  {
    params: authorizationAssignmentParamsSchema,
    body: jsonBody(authorizationAssignmentMutationBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.assignment.manage'),
    summary: 'Locally suppress one external assignment source tuple',
    responses: {
      200: jsonResponse(authorizationAssignmentMutationResultSchema, 'External assignment suppressed'),
    },
  }
);

export const unsuppressAuthorizationAssignmentRoute = authorizationRoute(
  'post',
  `/assignments/:assignmentId/unsuppress`,
  'unsuppressAssignment',
  {
    params: authorizationAssignmentParamsSchema,
    body: jsonBody(authorizationAssignmentMutationBodySchema),
  },
  {
    authorization: scopeAuthorization('authorization.assignment.manage'),
    summary: 'Remove local suppression from one external assignment source tuple',
    description:
      'The assignment becomes active only when the latest successful provider synchronization still requests it.',
    responses: {
      200: jsonResponse(authorizationAssignmentMutationResultSchema, 'External assignment unsuppressed'),
    },
  }
);

export const previewAuthorizationBulkAssignmentsRoute = authorizationRoute(
  'post',
  `/assignments/bulk-preview`,
  'previewBulkAssignments',
  { body: jsonBody(authorizationBulkPreviewBodySchema) },
  {
    authorization: scopeAuthorization('authorization.assignment.manage'),
    summary: 'Validate and preview one bounded manual assignment batch',
    responses: {
      200: jsonResponse(authorizationBulkAssignmentPreviewSchema, 'Assignment batch validation preview'),
    },
  }
);

export const applyAuthorizationBulkAssignmentsRoute = authorizationRoute(
  'post',
  `/assignments/bulk-apply`,
  'applyBulkAssignments',
  { body: jsonBody(authorizationBulkApplyBodySchema) },
  {
    authorization: scopeAuthorization('authorization.assignment.manage'),
    summary: 'Atomically apply one unchanged confirmed manual assignment batch',
    responses: {
      200: jsonResponse(authorizationBulkAssignmentMutationSchema, 'Assignment batch applied transactionally'),
    },
  }
);

export const listAuthorizationAuditRoute = authorizationRoute(
  'get',
  `/audit`,
  'listAudit',
  { query: authorizationAuditQuerySchema },
  {
    authorization: scopeAuthorization('authorization.audit.read'),
    summary: 'List redacted authorization audit events',
    description:
      'Brand readers are forced to their active brand. System administrators may omit brandId to inspect all bounded contexts.',
    responses: {
      200: jsonResponse(authorizationAuditPageSchema, 'Cursor-paginated redacted authorization audit'),
    },
  }
);

export const explainAuthorizationDecisionRoute = authorizationRoute(
  'post',
  `/explain`,
  'explainDecision',
  { body: jsonBody(authorizationExplainBodySchema) },
  {
    authorization: scopeAuthorization('authorization.explain'),
    summary: 'Explain one hypothetical authorization decision without mutation',
    responses: {
      200: jsonResponse(authorizationExplainResultSchema, 'Privileged read-only authorization explanation'),
    },
  }
);

export const getAuthorizationReadinessRoute = authorizationRoute(
  'get',
  `/rollout/readiness`,
  'getReadiness',
  {},
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    summary: 'Get bounded deployment-wide authorization rollout readiness',
    responses: {
      200: jsonResponse(authorizationReadinessSchema, 'Authorization rollout readiness evidence'),
    },
  }
);

export const exportAuthorizationConfigurationRoute = authorizationRoute(
  'get',
  `/export`,
  'exportConfiguration',
  { headers: authorizationSensitiveExportHeadersSchema, query: authorizationExportQuerySchema },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    summary: 'Export deterministic versioned authorization configuration',
    description:
      'Assignment export is excluded by default and uses a separately confirmed preview because it contains user identifiers. Send the token in X-ReDBox-Authorization-Confirmation; protected system assignments require an additional explicit flag.',
    responses: {
      200: jsonResponse(
        authorizationConfigurationExportResponseSchema,
        'Configuration document or sensitive-export confirmation preview'
      ),
    },
  }
);

export const previewAuthorizationImportRoute = authorizationRoute(
  'post',
  `/import-preview`,
  'previewImport',
  { body: jsonBody(authorizationImportPreviewBodySchema) },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    summary: 'Validate and preview a bounded versioned authorization import',
    responses: {
      200: jsonResponse(authorizationConfigurationImportPreviewSchema, 'Configuration import validation preview'),
    },
  }
);

export const applyAuthorizationImportRoute = authorizationRoute(
  'post',
  `/import-apply`,
  'applyImport',
  { body: jsonBody(authorizationImportApplyBodySchema) },
  {
    authorization: scopeAuthorization('system.authorization.manage'),
    summary: 'Atomically apply an unchanged confirmed authorization import',
    responses: {
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
  previewAuthorizationScopeAdoptionRoute,
  applyAuthorizationScopeAdoptionRoute,
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
