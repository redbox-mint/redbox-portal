import {
  AUTHORIZATION_AUDIT_ACTOR_TYPES,
  AUTHORIZATION_AUDIT_AUTH_METHODS,
  AUTHORIZATION_AUDIT_EVENT_TYPES,
  AUTHORIZATION_AUDIT_OUTCOMES,
  AUTHORIZATION_AUDIT_TARGET_TYPES,
  AUTHORIZATION_AUTH_METHODS,
  AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS,
  AUTHORIZATION_MAX_SCOPE_SET_SIZE,
  AUTHORIZATION_PRINCIPAL_CATEGORIES,
  AUTHORIZATION_ROLE_STATUSES,
  AUTHORIZATION_SCOPE_RISKS,
  AUTHORIZATION_SCOPE_SOURCE_TYPES,
  AUTHORIZATION_SCOPE_STATUSES,
  AUTHORIZATION_TEMPLATE_REVISION_WINDOW_SIZE,
  NEW_ROLE_KEY_PATTERN,
  PROTECTED_ROLE_KINDS,
  ROLE_ASSIGNMENT_SOURCES,
  ROLE_ASSIGNMENT_STATUSES,
  ROLE_SCOPE_EFFECTS,
  ROLLOUT_MODES,
  SCOPE_KEY_MAX_LENGTH,
  SCOPE_KEY_PATTERN,
  isRoleKey,
} from '../../authorization';
import { z } from '../zod-openapi';
import type { ApiResponseDefinition, ApiSchemaField } from '../types';

export const AUTHORIZATION_API_DEFAULT_PAGE_SIZE = 50;
export const AUTHORIZATION_API_MAX_PAGE_SIZE = 100;
export const AUTHORIZATION_API_MAX_CURSOR_LENGTH = SCOPE_KEY_MAX_LENGTH;
export const AUTHORIZATION_API_MAX_NAMESPACE_LENGTH = 256;
export const AUTHORIZATION_API_MAX_SEARCH_LENGTH = 128;
export const AUTHORIZATION_API_MAX_REASON_LENGTH = 1_000;
export const AUTHORIZATION_PROBLEM_MEDIA_TYPE = 'application/problem+json' as const;
export const AUTHORIZATION_API_VERSIONS = ['1.0', '2.0'] as const;

const identifierField = z.string().trim().min(1).max(256);
const optionalTextField = (maxLength: number) => z.string().trim().min(1).max(maxLength).optional();
const displayNameField = z.string().trim().min(1).max(256);
const descriptionInputField = z.string().trim().max(2_000);
const descriptionOutputField = z.string().max(2_000);
const scopeKeyField = z
  .string()
  .max(SCOPE_KEY_MAX_LENGTH)
  .regex(SCOPE_KEY_PATTERN, { error: 'authorization.invalid-scope' });
const roleKeyField = z.string().max(256).refine(isRoleKey, { error: 'authorization.invalid-role' });
const newRoleKeyField = z.string().trim().max(64).regex(NEW_ROLE_KEY_PATTERN);
const templateKeyField = z.string().trim().max(64).regex(NEW_ROLE_KEY_PATTERN);
const positiveVersionField = z.number().int().min(1);
const isoDateTimeField = z.string().datetime({ offset: true });
const confirmationTokenField = z.string().min(1).max(8_192);
const reasonField = optionalTextField(AUTHORIZATION_API_MAX_REASON_LENGTH);
const authorizationSuccessMetaSchema = z.object({}).passthrough();

export function authorizationVersionedSuccessSchema(schema: ApiSchemaField): ApiSchemaField {
  return z.union([
    schema,
    z.object({
      data: schema,
      meta: authorizationSuccessMetaSchema,
    }),
  ]);
}

export const authorizationApiVersionHeadersSchema = z.object({
  'x-redbox-api-version': z.enum(AUTHORIZATION_API_VERSIONS).optional(),
});

export const authorizationProblemSchema = z
  .object({
    type: z.string().max(512),
    title: z.string().max(256),
    status: z.number().int().min(400).max(599),
    detail: z.string().max(1_000),
    instance: z.string().max(2_048),
    code: z.string().max(128),
    requestId: identifierField,
  })
  .strict()
  .openapi({ description: 'RFC 9457 Problem Details for an authorization contract request' });

export function authorizationProblemResponse(description: string): ApiResponseDefinition {
  return {
    description,
    content: {
      [AUTHORIZATION_PROBLEM_MEDIA_TYPE]: {
        schema: authorizationProblemSchema,
      },
    },
  };
}

export const authorizationProblemResponses = Object.freeze({
  400: authorizationProblemResponse('Authorization request is invalid'),
  401: authorizationProblemResponse('Authentication is required or the supplied credential is invalid'),
  403: authorizationProblemResponse('The active principal lacks the required authorization'),
  404: authorizationProblemResponse('The requested resource was not found in the active authorization context'),
  409: authorizationProblemResponse('Authorization state changed or a protected invariant rejected the request'),
  422: authorizationProblemResponse('The bounded bulk or import request contains semantic errors'),
  503: authorizationProblemResponse('The required transactional authorization guarantee is unavailable'),
  500: authorizationProblemResponse('The authorization contract request could not be completed'),
});

export const authorizationPageQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(AUTHORIZATION_API_MAX_CURSOR_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(AUTHORIZATION_API_MAX_PAGE_SIZE).optional(),
  search: z.string().trim().min(1).max(AUTHORIZATION_API_MAX_SEARCH_LENGTH).optional(),
});

export const authorizationScopeCatalogQuerySchema = authorizationPageQuerySchema.extend({
  namespace: z.string().trim().min(1).max(AUTHORIZATION_API_MAX_NAMESPACE_LENGTH).optional(),
  risk: z.enum(AUTHORIZATION_SCOPE_RISKS).optional(),
  sourceType: z.enum(AUTHORIZATION_SCOPE_SOURCE_TYPES).optional(),
  status: z.enum(AUTHORIZATION_SCOPE_STATUSES).optional(),
});

export const authorizationTemplateQuerySchema = authorizationPageQuerySchema.extend({
  protectedKind: z.enum(PROTECTED_ROLE_KINDS).optional(),
  status: z.enum(AUTHORIZATION_ROLE_STATUSES).optional(),
});

export const authorizationRoleQuerySchema = authorizationPageQuerySchema.extend({
  cursor: roleKeyField.optional(),
  protectedKind: z.enum(PROTECTED_ROLE_KINDS).optional(),
  status: z.enum(AUTHORIZATION_ROLE_STATUSES).optional(),
  templateKey: templateKeyField.optional(),
});

export const authorizationTemplateRevisionParamsSchema = z.object({
  key: templateKeyField,
  revision: z.coerce.number().int().min(1),
});

export const authorizationTemplateParamsSchema = z.object({ key: templateKeyField });
export const authorizationRoleParamsSchema = z.object({ key: roleKeyField });

export const authorizationScopeSchema = z
  .object({
    key: scopeKeyField,
    namespace: z.string(),
    label: z.string(),
    description: z.string(),
    risk: z.enum(AUTHORIZATION_SCOPE_RISKS),
    sourceType: z.enum(AUTHORIZATION_SCOPE_SOURCE_TYPES),
    sourcePackage: z.string(),
    sourceVersion: z.string(),
    status: z.enum(AUTHORIZATION_SCOPE_STATUSES),
    replacementKey: scopeKeyField.optional(),
    metadataVersion: positiveVersionField,
  })
  .openapi({ description: 'Persisted projection of one deployed authorization scope definition' });

export const authorizationScopeCatalogPageSchema = z
  .object({
    generation: z.string(),
    items: z.array(authorizationScopeSchema).max(AUTHORIZATION_API_MAX_PAGE_SIZE),
    nextCursor: z.string().max(AUTHORIZATION_API_MAX_CURSOR_LENGTH).optional(),
  })
  .openapi({ description: 'Cursor-paginated authorization scope catalog' });

export const authorizationTemplateRevisionSchema = z
  .object({
    revision: positiveVersionField,
    scopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    notes: z.string().optional(),
    publishedBy: z.string(),
    publishedAt: isoDateTimeField,
  })
  .openapi({ description: 'Immutable role template revision' });

export const authorizationTemplateRevisionSummarySchema = authorizationTemplateRevisionSchema
  .omit({ scopeKeys: true })
  .openapi({ description: 'Bounded immutable role template revision summary' });

export const authorizationTemplateRevisionDetailSchema = authorizationTemplateRevisionSchema
  .extend({ templateKey: templateKeyField })
  .openapi({ description: 'One immutable role template revision and its owning template key' });

export const authorizationTemplateSchema = z
  .object({
    key: templateKeyField,
    displayName: z.string(),
    description: z.string(),
    currentRevision: positiveVersionField,
    protectedKind: z.enum(PROTECTED_ROLE_KINDS),
    status: z.enum(AUTHORIZATION_ROLE_STATUSES),
    version: positiveVersionField,
    revisions: z.array(authorizationTemplateRevisionSummarySchema).max(AUTHORIZATION_TEMPLATE_REVISION_WINDOW_SIZE),
    revisionsTruncated: z.boolean(),
  })
  .openapi({ description: 'Global role template with immutable published revisions' });

export const authorizationTemplatePageSchema = z
  .object({
    items: z.array(authorizationTemplateSchema).max(AUTHORIZATION_API_MAX_PAGE_SIZE),
    nextCursor: z.string().max(AUTHORIZATION_API_MAX_CURSOR_LENGTH).optional(),
  })
  .openapi({ description: 'Cursor-paginated role template catalog' });

const authorizationAssignmentEvidenceSchema = z.object({
  assignmentId: identifierField,
  source: z.enum(ROLE_ASSIGNMENT_SOURCES),
  sourceKey: z.string(),
  expiresAt: isoDateTimeField.optional(),
});

export const authorizationEffectiveRoleSchema = z
  .object({
    id: identifierField,
    key: roleKeyField,
    displayName: z.string(),
    contextType: z.enum(['brand', 'system']),
    brandId: identifierField.optional(),
    protectedKind: z.enum(PROTECTED_ROLE_KINDS),
    implicit: z.boolean(),
    assignmentCount: z.number().int().min(0).optional(),
    assignmentsTruncated: z.boolean().optional(),
    assignments: z
      .array(authorizationAssignmentEvidenceSchema)
      .max(AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS)
      .optional(),
  })
  .openapi({ description: 'Caller-safe effective role summary' });

export const authorizationMeSchema = z
  .object({
    brand: z
      .object({
        id: identifierField,
        name: z.string(),
      })
      .optional(),
    rolloutMode: z.enum(ROLLOUT_MODES),
    principal: z.object({
      category: z.enum(AUTHORIZATION_PRINCIPAL_CATEGORIES),
      authMethod: z.enum(AUTHORIZATION_AUTH_METHODS),
      active: z.boolean(),
      userId: identifierField.optional(),
    }),
    roles: z.array(authorizationEffectiveRoleSchema),
    scopeKeys: z.array(scopeKeyField),
  })
  .openapi({ description: 'Caller-safe effective authorization projection for the active brand' });

export const authorizationTemplatePublishBodySchema = z
  .object({
    expectedVersion: positiveVersionField,
    scopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    displayName: optionalTextField(256),
    description: optionalTextField(2_000),
    notes: optionalTextField(2_000),
    reason: optionalTextField(AUTHORIZATION_API_MAX_REASON_LENGTH),
    confirmationToken: z.string().min(1).max(8_192).optional(),
  })
  .strict();

export const authorizationRoleScopeOverrideSchema = z
  .object({
    scopeKey: scopeKeyField,
    effect: z.enum(ROLE_SCOPE_EFFECTS),
  })
  .strict();

export const authorizationRoleCatalogItemSchema = z
  .object({
    id: identifierField,
    key: roleKeyField,
    displayName: z.string().max(256),
    description: descriptionOutputField.optional(),
    contextType: z.literal('brand'),
    brandId: identifierField,
    protectedKind: z.enum(PROTECTED_ROLE_KINDS),
    status: z.enum(AUTHORIZATION_ROLE_STATUSES),
    templateKey: templateKeyField.optional(),
    templateRevision: positiveVersionField.optional(),
    version: positiveVersionField,
  })
  .strict()
  .openapi({ description: 'Bounded current-brand role catalog item' });

export const authorizationRoleCatalogPageSchema = z
  .object({
    items: z.array(authorizationRoleCatalogItemSchema).max(AUTHORIZATION_API_MAX_PAGE_SIZE),
    nextCursor: roleKeyField.optional(),
  })
  .strict()
  .openapi({ description: 'Cursor-paginated current-brand role catalog' });

export const authorizationRoleSchema = z
  .object({
    id: identifierField,
    key: roleKeyField,
    displayName: z.string().max(256),
    description: descriptionOutputField.optional(),
    contextType: z.enum(['brand', 'system']),
    brandId: identifierField.optional(),
    protectedKind: z.enum(PROTECTED_ROLE_KINDS),
    status: z.enum(AUTHORIZATION_ROLE_STATUSES),
    templateKey: templateKeyField.optional(),
    templateRevision: positiveVersionField.optional(),
    baseScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    effectiveScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    overrides: z.array(authorizationRoleScopeOverrideSchema).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    version: positiveVersionField,
  })
  .strict()
  .openapi({ description: 'Brand or protected system role administration projection' });

const authorizationCreateRoleCommonShape = {
  key: newRoleKeyField,
  displayName: displayNameField,
  description: descriptionInputField.optional(),
  reason: reasonField,
};

export const authorizationCreateRoleBodySchema = z.union([
  z
    .object({
      ...authorizationCreateRoleCommonShape,
      scopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE).optional(),
    })
    .strict(),
  z
    .object({
      ...authorizationCreateRoleCommonShape,
      scopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE).optional(),
      templateKey: templateKeyField,
      templateRevision: positiveVersionField.optional(),
    })
    .strict(),
  z
    .object({
      ...authorizationCreateRoleCommonShape,
      cloneRoleKey: roleKeyField,
    })
    .strict(),
]);

const authorizationUpdateRoleCommonShape = {
  expectedVersion: positiveVersionField,
  reason: reasonField,
};

export const authorizationUpdateRoleBodySchema = z.union([
  z
    .object({
      ...authorizationUpdateRoleCommonShape,
      displayName: displayNameField,
      description: descriptionInputField.nullable().optional(),
    })
    .strict(),
  z
    .object({
      ...authorizationUpdateRoleCommonShape,
      displayName: displayNameField.optional(),
      description: descriptionInputField.nullable(),
    })
    .strict(),
]);

export const authorizationRoleScopePreviewBodySchema = z
  .object({
    expectedVersion: positiveVersionField,
    scopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    reason: reasonField,
  })
  .strict();

export const authorizationRoleScopeApplyBodySchema = authorizationRoleScopePreviewBodySchema
  .extend({ confirmationToken: confirmationTokenField })
  .strict();

export const authorizationRoleTemplateUpgradePreviewBodySchema = z
  .object({
    expectedVersion: positiveVersionField,
    targetRevision: positiveVersionField,
    reason: reasonField,
  })
  .strict();

export const authorizationRoleTemplateUpgradeApplyBodySchema = authorizationRoleTemplateUpgradePreviewBodySchema
  .extend({ confirmationToken: confirmationTokenField })
  .strict();

export const authorizationRoleLifecyclePreviewBodySchema = z
  .object({ expectedVersion: positiveVersionField, reason: reasonField })
  .strict();

export const authorizationRoleLifecycleApplyBodySchema = authorizationRoleLifecyclePreviewBodySchema
  .extend({ confirmationToken: confirmationTokenField })
  .strict();

export const authorizationRoleDeleteBodySchema = authorizationRoleLifecyclePreviewBodySchema
  .extend({ confirmationToken: confirmationTokenField.optional() })
  .strict();

const selectedRoleVersionSchema = z.object({ roleId: identifierField, expectedVersion: positiveVersionField }).strict();
const selectedRoleVersionsSchema = z
  .array(selectedRoleVersionSchema)
  .min(1)
  .max(100)
  .refine(rows => new Set(rows.map(row => row.roleId)).size === rows.length, {
    error: 'authorization.bulk-invalid',
  });

export const authorizationBulkTemplateUpgradePreviewBodySchema = z
  .object({
    templateKey: templateKeyField,
    targetRevision: positiveVersionField,
    roles: selectedRoleVersionsSchema,
    reason: reasonField,
  })
  .strict();

export const authorizationBulkTemplateUpgradeApplyBodySchema = authorizationBulkTemplateUpgradePreviewBodySchema
  .extend({ confirmationToken: confirmationTokenField })
  .strict();

export const authorizationAssignmentSchema = z
  .object({
    id: identifierField,
    principalId: identifierField,
    roleId: identifierField,
    roleKey: roleKeyField,
    brandId: identifierField.optional(),
    source: z.enum(ROLE_ASSIGNMENT_SOURCES),
    sourceKey: z.string(),
    status: z.enum(ROLE_ASSIGNMENT_STATUSES),
    sourcePresent: z.boolean(),
    assignedBy: z.string().optional(),
    assignedAt: isoDateTimeField.optional(),
    expiresAt: isoDateTimeField.optional(),
    revokedBy: z.string().optional(),
    revokedAt: isoDateTimeField.optional(),
    suppressedBy: z.string().optional(),
    suppressedAt: isoDateTimeField.optional(),
    version: positiveVersionField,
  })
  .openapi({ description: 'Sourced role assignment administration projection' });

export const authorizationAuditSchema = z
  .object({
    eventId: identifierField,
    schemaVersion: positiveVersionField,
    eventType: z.enum(AUTHORIZATION_AUDIT_EVENT_TYPES),
    outcome: z.enum(AUTHORIZATION_AUDIT_OUTCOMES),
    actorType: z.enum(AUTHORIZATION_AUDIT_ACTOR_TYPES),
    actorId: identifierField,
    authMethod: z.enum(AUTHORIZATION_AUDIT_AUTH_METHODS),
    brandId: identifierField.optional(),
    targetType: z.enum(AUTHORIZATION_AUDIT_TARGET_TYPES),
    targetId: identifierField.optional(),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
    reasonCode: z.string().optional(),
    reason: z.string().optional(),
    requestId: z.string().optional(),
    batchId: z.string().optional(),
    occurredAt: isoDateTimeField,
  })
  .openapi({ description: 'Redacted append-only authorization audit event' });

export const authorizationExpectedVersionBodySchema = z.object({
  expectedVersion: positiveVersionField,
  confirmationToken: z.string().min(1).max(8_192).optional(),
  reason: optionalTextField(AUTHORIZATION_API_MAX_REASON_LENGTH),
});

export const authorizationBulkRowsSchema = z
  .array(
    z.object({
      action: z.enum(['grant', 'revoke']),
      principalId: identifierField,
      roleKey: roleKeyField,
      sourceKey: optionalTextField(128),
      expiresAt: isoDateTimeField.optional(),
      expectedVersion: positiveVersionField.optional(),
    })
  )
  .max(100);

export const authorizationBulkRequestSchema = z.object({
  format: z.enum(['json', 'csv']).optional(),
  rows: z.union([authorizationBulkRowsSchema, z.string().max(256 * 1_024)]),
  confirmationToken: z.string().min(1).max(8_192).optional(),
  reason: optionalTextField(AUTHORIZATION_API_MAX_REASON_LENGTH),
});

export const authorizationPreviewSchema = z
  .object({
    operation: z.string(),
    current: z.unknown().optional(),
    proposed: z.unknown().optional(),
    addedScopeKeys: z.array(scopeKeyField).optional(),
    removedScopeKeys: z.array(scopeKeyField).optional(),
    affectedAssignments: z.number().int().min(0).optional(),
    warnings: z.array(z.string()).optional(),
    fatalErrors: z.array(z.string()).optional(),
    confirmationToken: z.string().optional(),
  })
  .passthrough()
  .openapi({ description: 'Server-authoritative bounded impact preview' });

export const authorizationMutationResultSchema = z
  .object({
    data: z.unknown(),
    version: positiveVersionField,
    auditEventId: identifierField,
    requestId: identifierField,
    batchId: identifierField.optional(),
    changed: z.boolean(),
  })
  .openapi({ description: 'Versioned, audited authorization mutation result' });

const authorizationRoleDependencySummarySchema = z
  .object({
    assignmentRows: z.number().int().min(0).max(1_001),
    legacyUserAssociations: z.number().int().min(0).max(1_001),
    activeRecords: z.number().int().min(0).max(1_000),
    deletedRecords: z.number().int().min(0).max(1_000),
    storedConfigReferences: z.number().int().min(0).max(4_000),
    runtimeConfigReferences: z.number().int().min(0).max(1_000),
    scanIncomplete: z.boolean(),
    templatePinned: z.boolean(),
  })
  .strict();

const authorizationPreviewWarningsSchema = z.array(z.string().max(128)).max(100);
const authorizationRolePreviewCommonShape = {
  current: authorizationRoleSchema,
  addedScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
  removedScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
  affectedAssignments: z.number().int().min(0).max(1_001),
  dependencies: authorizationRoleDependencySummarySchema.optional(),
  warnings: authorizationPreviewWarningsSchema,
  fatalErrors: authorizationPreviewWarningsSchema,
  confirmationToken: confirmationTokenField.optional(),
};

export const authorizationRoleScopePreviewSchema = z
  .object({
    operation: z.literal('role-scopes'),
    ...authorizationRolePreviewCommonShape,
    proposed: authorizationRoleSchema,
  })
  .strict()
  .openapi({ description: 'Server-authoritative preview of an effective role scope change' });

export const authorizationRoleTemplateUpgradePreviewSchema = z
  .object({
    operation: z.literal('template-upgrade'),
    ...authorizationRolePreviewCommonShape,
    proposed: authorizationRoleSchema,
  })
  .strict()
  .openapi({ description: 'Server-authoritative three-way role template upgrade preview' });

export const authorizationRoleInactivationPreviewSchema = z
  .object({
    operation: z.literal('role-inactivate'),
    ...authorizationRolePreviewCommonShape,
    proposed: authorizationRoleSchema,
  })
  .strict()
  .openapi({ description: 'Server-authoritative role inactivation impact preview' });

export const authorizationRoleDeletionPreviewSchema = z
  .object({
    operation: z.literal('role-delete'),
    ...authorizationRolePreviewCommonShape,
  })
  .strict()
  .openapi({ description: 'Server-authoritative dependency-free role deletion preview' });

export const authorizationRoleMutationResultSchema = z
  .object({
    data: authorizationRoleSchema,
    version: positiveVersionField,
    auditEventId: identifierField,
    requestId: identifierField,
    changed: z.boolean(),
  })
  .strict()
  .openapi({ description: 'Versioned and audited role mutation result' });

export const authorizationRoleDeleteResponseSchema: ApiSchemaField = z.union([
  authorizationRoleDeletionPreviewSchema,
  authorizationRoleMutationResultSchema,
]);

export const authorizationBulkTemplateUpgradeRolePreviewSchema = z
  .object({
    roleId: identifierField,
    roleKey: roleKeyField,
    brandId: identifierField,
    expectedVersion: positiveVersionField,
    currentRevision: positiveVersionField,
    targetRevision: positiveVersionField,
    addedScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    removedScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    changed: z.boolean(),
  })
  .strict();

export const authorizationBulkTemplateUpgradeRoleConflictSchema = z
  .object({
    roleId: identifierField,
    expectedVersion: positiveVersionField,
    targetRevision: positiveVersionField,
    conflict: z
      .object({
        code: z.string().min(1).max(128),
        status: z.number().int().min(400).max(499),
      })
      .strict(),
  })
  .strict();

export const authorizationBulkTemplateUpgradePreviewSchema = z
  .object({
    operation: z.literal('template-bulk-upgrade'),
    templateKey: templateKeyField,
    targetRevision: positiveVersionField,
    roles: z
      .array(
        z.union([authorizationBulkTemplateUpgradeRolePreviewSchema, authorizationBulkTemplateUpgradeRoleConflictSchema])
      )
      .min(1)
      .max(100),
    warnings: authorizationPreviewWarningsSchema,
    fatalErrors: authorizationPreviewWarningsSchema,
    confirmationToken: confirmationTokenField.optional(),
  })
  .strict()
  .openapi({ description: 'Bounded selected-role template upgrade preview' });

export const authorizationBulkTemplateUpgradeMutationSchema = z
  .object({
    data: z
      .object({
        appliedCount: z.number().int().min(0).max(100),
        noOpCount: z.number().int().min(0).max(100),
        targetRevision: positiveVersionField,
      })
      .strict(),
    version: positiveVersionField,
    auditEventId: identifierField,
    requestId: identifierField,
    batchId: identifierField,
    changed: z.boolean(),
  })
  .strict()
  .openapi({ description: 'Atomic selected-role template upgrade result' });

const authorizationTemplatePublicationStateSchema = z.object({
  templateKey: templateKeyField,
  revision: positiveVersionField,
  scopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
  displayName: z.string(),
  description: z.string(),
  notes: z.string().optional(),
  version: positiveVersionField,
});

export const authorizationTemplatePublishPreviewSchema = z
  .object({
    operation: z.literal('template-publish'),
    current: authorizationTemplatePublicationStateSchema,
    proposed: authorizationTemplatePublicationStateSchema,
    addedScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    removedScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    affectedAssignments: z.number().int().min(0),
    warnings: z.array(z.string()),
    fatalErrors: z.array(z.string()),
    confirmationToken: z.string().min(1).max(8_192),
  })
  .openapi({ description: 'Server-authoritative preview of one role template revision publication' });

export const authorizationTemplatePublishMutationSchema = z
  .object({
    data: z.object({
      templateKey: templateKeyField,
      revision: positiveVersionField,
      scopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    }),
    version: positiveVersionField,
    auditEventId: identifierField,
    requestId: identifierField,
    changed: z.literal(true),
  })
  .openapi({ description: 'Versioned and audited role template revision publication result' });

export const authorizationTemplatePublishResponseSchema: ApiSchemaField = z.union([
  authorizationTemplatePublishPreviewSchema,
  authorizationTemplatePublishMutationSchema,
]);
