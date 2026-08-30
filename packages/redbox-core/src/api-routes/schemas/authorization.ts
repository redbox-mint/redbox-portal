import {
  AUTHORIZATION_AUDIT_ACTOR_TYPES,
  AUTHORIZATION_AUDIT_AUTH_METHODS,
  AUTHORIZATION_AUDIT_EVENT_TYPES,
  AUTHORIZATION_AUDIT_OUTCOMES,
  AUTHORIZATION_AUDIT_TARGET_TYPES,
  AUTHORIZATION_ADMIN_MAX_EXPORT_BYTES,
  AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS,
  AUTHORIZATION_ADMIN_MAX_BULK_BYTES,
  AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES,
  AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS,
  AUTHORIZATION_DECISION_REASON_CODES,
  ASSIGNMENT_EXPIRY_FILTERS,
  AUTHORIZATION_AUTH_METHODS,
  AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS,
  AUTHORIZATION_MAX_SCOPE_SET_SIZE,
  AUTHORIZATION_PRINCIPAL_CATEGORIES,
  AUTHORIZATION_RECORD_ACL_OUTCOMES,
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
const auditIdentifierField = z.string().trim().min(1).max(128);
const configurationIdentifierField = z.string().trim().min(1).max(128);
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

function utf8PayloadField(maxBytes: number, description: string) {
  return z
    .string()
    .min(1)
    .max(maxBytes)
    .refine(value => Buffer.byteLength(value, 'utf8') <= maxBytes, { error: 'authorization.bulk-invalid' })
    .openapi({ description: `${description}; maximum ${maxBytes} UTF-8 bytes` });
}

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

export const authorizationSensitiveExportHeadersSchema = authorizationApiVersionHeadersSchema.extend({
  'x-redbox-authorization-confirmation': confirmationTokenField.optional(),
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

export const authorizationAssignmentQuerySchema = z.object({
  cursor: identifierField.optional(),
  limit: z.coerce.number().int().min(1).max(AUTHORIZATION_API_MAX_PAGE_SIZE).optional(),
  userId: identifierField.optional(),
  roleKey: roleKeyField.optional(),
  source: z.enum(ROLE_ASSIGNMENT_SOURCES).optional(),
  status: z.enum(ROLE_ASSIGNMENT_STATUSES).optional(),
  sourcePresent: z.enum(['true', 'false']).optional(),
  expiry: z.enum(ASSIGNMENT_EXPIRY_FILTERS).optional(),
});

export const authorizationTemplateRevisionParamsSchema = z.object({
  key: templateKeyField,
  revision: z.coerce.number().int().min(1),
});

export const authorizationTemplateParamsSchema = z.object({ key: templateKeyField });
export const authorizationRoleParamsSchema = z.object({ key: roleKeyField });
export const authorizationAssignmentUserParamsSchema = z.object({
  roleKey: roleKeyField,
  userId: identifierField,
});
export const authorizationAssignmentParamsSchema = z.object({ assignmentId: identifierField });

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
    sourceKey: z.string().min(1).max(128),
    status: z.enum(ROLE_ASSIGNMENT_STATUSES),
    sourcePresent: z.boolean(),
    assignedBy: z.string().min(1).max(256),
    assignedAt: isoDateTimeField,
    expiresAt: isoDateTimeField.optional(),
    revokedBy: z.string().min(1).max(256).optional(),
    revokedAt: isoDateTimeField.optional(),
    suppressedBy: z.string().min(1).max(256).optional(),
    suppressedAt: isoDateTimeField.optional(),
    reason: z.string().min(1).max(AUTHORIZATION_API_MAX_REASON_LENGTH).optional(),
    version: positiveVersionField,
  })
  .strict()
  .openapi({ description: 'Sourced role assignment administration projection' });

export const authorizationAssignmentCatalogPageSchema = z
  .object({
    items: z.array(authorizationAssignmentSchema).max(AUTHORIZATION_API_MAX_PAGE_SIZE),
    nextCursor: identifierField.optional(),
  })
  .strict()
  .openapi({ description: 'Cursor-paginated active-brand and authorized system assignment catalog' });

export const authorizationAssignmentGrantBodySchema = z
  .object({
    expectedVersion: positiveVersionField.optional(),
    expiresAt: isoDateTimeField.optional(),
    reason: reasonField,
  })
  .strict();

export const authorizationAssignmentMutationBodySchema = z
  .object({
    expectedVersion: positiveVersionField,
    reason: reasonField,
  })
  .strict();

export const authorizationAuditSchema = z
  .object({
    eventId: auditIdentifierField,
    schemaVersion: positiveVersionField,
    eventType: z.enum(AUTHORIZATION_AUDIT_EVENT_TYPES),
    outcome: z.enum(AUTHORIZATION_AUDIT_OUTCOMES),
    actorType: z.enum(AUTHORIZATION_AUDIT_ACTOR_TYPES),
    actorId: auditIdentifierField,
    authMethod: z.enum(AUTHORIZATION_AUDIT_AUTH_METHODS),
    brandId: auditIdentifierField.optional(),
    targetType: z.enum(AUTHORIZATION_AUDIT_TARGET_TYPES),
    targetId: auditIdentifierField.optional(),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
    reasonCode: z.string().max(128).optional(),
    reason: z.string().max(AUTHORIZATION_API_MAX_REASON_LENGTH).optional(),
    requestId: z.string().max(128).optional(),
    batchId: z.string().max(128).optional(),
    occurredAt: isoDateTimeField,
  })
  .strict()
  .openapi({ description: 'Redacted append-only authorization audit event' });

export const authorizationAuditQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(1_024).optional(),
  limit: z.coerce.number().int().min(1).max(AUTHORIZATION_API_MAX_PAGE_SIZE).optional(),
  actorId: auditIdentifierField.optional(),
  brandId: auditIdentifierField.optional(),
  eventType: z.enum(AUTHORIZATION_AUDIT_EVENT_TYPES).optional(),
  outcome: z.enum(AUTHORIZATION_AUDIT_OUTCOMES).optional(),
  targetType: z.enum(AUTHORIZATION_AUDIT_TARGET_TYPES).optional(),
  targetId: auditIdentifierField.optional(),
});

export const authorizationAuditPageSchema = z
  .object({
    items: z.array(authorizationAuditSchema).max(AUTHORIZATION_API_MAX_PAGE_SIZE),
    nextCursor: z.string().max(1_024).optional(),
  })
  .strict()
  .openapi({ description: 'Cursor-paginated, redacted authorization audit events' });

const authorizationDecisionEvidenceSchema = z
  .object({
    requiredScopeActive: z.boolean(),
    principalActive: z.boolean(),
    principalHasRequiredScope: z.boolean(),
    brandKnown: z.boolean(),
    brandAuthorized: z.boolean(),
    tokenAllowsRequiredScope: z.boolean(),
    resourceFound: z.boolean(),
    resourceBrandMatches: z.boolean(),
    recordAclAllowsAction: z.boolean(),
  })
  .strict();

const authorizationDecisionSchema = z
  .object({
    allowed: z.boolean(),
    reasonCode: z.enum(AUTHORIZATION_DECISION_REASON_CODES),
    requiredScope: scopeKeyField.optional(),
    brandId: identifierField.optional(),
    evidence: authorizationDecisionEvidenceSchema.optional(),
  })
  .strict();

const authorizationExplanationPrincipalSchema = z
  .object({
    category: z.enum(AUTHORIZATION_PRINCIPAL_CATEGORIES),
    authMethod: z.enum(AUTHORIZATION_AUTH_METHODS),
    active: z.boolean(),
    userId: identifierField.optional(),
    username: z.string().max(256).optional(),
    operationId: identifierField.optional(),
  })
  .strict();

const authorizationExplanationBrandSchema = z
  .object({
    requestedIdentifier: identifierField.optional(),
    id: identifierField.optional(),
    name: z.string().max(256).optional(),
    exists: z.boolean(),
    authorized: z.boolean(),
  })
  .strict();

const authorizationExplanationRoleSchema = z
  .object({
    id: identifierField,
    key: roleKeyField,
    name: roleKeyField,
    displayName: z.string().max(256),
    contextType: z.enum(['brand', 'system']),
    brandId: identifierField.optional(),
    protectedKind: z.enum(PROTECTED_ROLE_KINDS),
    implicit: z.boolean(),
    assignmentCount: z.number().int().min(0),
    assignmentsTruncated: z.boolean(),
    assignments: z.array(authorizationAssignmentEvidenceSchema).max(AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS),
    effectiveScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    inactiveScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    missingScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
  })
  .strict();

const authorizationResolutionEvidenceSchema = z
  .object({
    expiredAssignmentIds: z.array(identifierField).max(AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS),
    ignoredAssignmentIds: z.array(identifierField).max(AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS),
    inactiveRoleIds: z.array(identifierField).max(AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS),
    ignoredRoleIds: z.array(identifierField).max(AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS),
    missingTemplateRevisionRoleIds: z.array(identifierField).max(AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS),
    inactiveScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    missingScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    rejectedScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
  })
  .strict();

export const authorizationExplainBodySchema = z
  .object({
    subjectId: identifierField,
    brandId: identifierField,
    scopeKey: scopeKeyField,
    resource: z
      .object({
        found: z.boolean().optional(),
        brandId: identifierField.optional(),
        recordAcl: z.enum(AUTHORIZATION_RECORD_ACL_OUTCOMES).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const authorizationExplainResultSchema = z
  .object({
    explained: z.literal(true),
    decision: authorizationDecisionSchema,
    projection: z
      .object({
        principal: authorizationExplanationPrincipalSchema,
        brand: authorizationExplanationBrandSchema.optional(),
        roles: z.array(authorizationExplanationRoleSchema).max(AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS),
        grantedScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
        effectiveScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
        tokenScopeCeiling: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE).optional(),
        scopeProvenance: z
          .array(
            z
              .object({
                scopeKey: scopeKeyField,
                roleIds: z.array(identifierField).max(AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS),
                roleKeys: z.array(roleKeyField).max(AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS),
              })
              .strict()
          )
          .max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
        resolutionEvidence: authorizationResolutionEvidenceSchema,
      })
      .strict(),
  })
  .strict()
  .openapi({ description: 'Privileged read-only authorization decision explanation' });

const authorizationReadinessFindingSchema = z
  .object({
    code: z.string().min(1).max(128),
    count: z.number().int().min(1),
    subjects: z.array(identifierField).max(100).optional(),
  })
  .strict();

export const authorizationReadinessSchema = z
  .object({
    generatedAt: isoDateTimeField,
    mode: z.enum(ROLLOUT_MODES),
    readyForEnforce: z.boolean(),
    registry: z
      .object({
        generation: z.string().min(1).max(128),
        declaredScopeCount: z.number().int().min(0),
        persistedScopeCount: z.number().int().min(0),
        orphanedScopeCount: z.number().int().min(0),
      })
      .strict(),
    routes: z.object({ routeCount: z.number().int().min(0), valid: z.boolean() }).strict(),
    migration: z
      .object({
        name: z.string().min(1).max(128),
        completed: z.boolean(),
        driftTruncated: z.boolean(),
        blockerCount: z.number().int().min(0),
        warningCount: z.number().int().min(0),
      })
      .strict(),
    transactions: z.union([
      z.object({ available: z.literal(true) }).strict(),
      z.object({ available: z.literal(false), code: z.literal('authorization.transaction-unavailable') }).strict(),
    ]),
    shadow: z.object({ unresolvedMismatchCount: z.number().int().min(0) }).strict(),
    administrators: z
      .object({
        brandCount: z.number().int().min(0),
        brandsWithoutAdministratorCount: z.number().int().min(0),
        brandsWithoutAdministrator: z.array(identifierField).max(100),
        systemAdministratorCount: z.number().int().min(0),
        requiredSystemAdministratorCount: z.literal(2),
      })
      .strict(),
    blockers: z.array(authorizationReadinessFindingSchema).max(100),
    warnings: z.array(authorizationReadinessFindingSchema).max(100),
  })
  .strict()
  .openapi({ description: 'Bounded system authorization rollout readiness evidence' });

const authorizationConfigurationRevisionSchema = z
  .object({
    revision: positiveVersionField,
    scopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    notes: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

function authorizationConfigurationTemplateSchema(maxRows: number) {
  return z
    .object({
      key: templateKeyField,
      displayName: displayNameField,
      description: z.string().trim().min(1).max(2_000),
      protectedKind: z.enum(PROTECTED_ROLE_KINDS),
      status: z.enum(AUTHORIZATION_ROLE_STATUSES),
      version: positiveVersionField,
      revisions: z.array(authorizationConfigurationRevisionSchema).min(1).max(maxRows),
    })
    .strict();
}

const authorizationConfigurationRoleSchema = z
  .object({
    brandId: configurationIdentifierField.optional(),
    key: roleKeyField,
    displayName: displayNameField,
    description: optionalTextField(2_000),
    protectedKind: z.enum(PROTECTED_ROLE_KINDS),
    status: z.enum(AUTHORIZATION_ROLE_STATUSES),
    templateKey: templateKeyField.optional(),
    templateRevision: positiveVersionField.optional(),
    effectiveScopeKeys: z.array(scopeKeyField).max(AUTHORIZATION_MAX_SCOPE_SET_SIZE),
    version: positiveVersionField,
  })
  .strict()
  .refine(role => (role.templateKey === undefined) === (role.templateRevision === undefined), {
    error: 'authorization.bulk-invalid',
  });

const authorizationConfigurationAssignmentSchema = z
  .object({
    principalId: configurationIdentifierField,
    brandId: configurationIdentifierField.optional(),
    roleKey: roleKeyField,
    source: z.enum(['manual', 'recovery']),
    sourceKey: identifierField,
    status: z.enum(['active', 'revoked']),
    sourcePresent: z.literal(true),
    expiresAt: isoDateTimeField.optional(),
    version: positiveVersionField,
  })
  .strict()
  .refine(assignment => assignment.source !== 'manual' || assignment.sourceKey === 'manual', {
    error: 'authorization.bulk-invalid',
  });

function configurationDocumentSchema(maxRows: number, maxBytes: number) {
  return z
    .object({
      schemaVersion: z.literal(1),
      generatedAt: isoDateTimeField.optional(),
      templates: z.array(authorizationConfigurationTemplateSchema(maxRows)).max(maxRows),
      roles: z.array(authorizationConfigurationRoleSchema).max(maxRows),
      assignments: z.array(authorizationConfigurationAssignmentSchema).max(maxRows).optional(),
    })
    .strict()
    .refine(
      document => {
        const rowCount =
          document.templates.length +
          document.templates.reduce((count, template) => count + template.revisions.length, 0) +
          document.roles.length +
          (document.assignments?.length ?? 0);
        return rowCount >= 1 && rowCount <= maxRows && Buffer.byteLength(JSON.stringify(document), 'utf8') <= maxBytes;
      },
      { error: 'authorization.bulk-invalid' }
    );
}

export const authorizationConfigurationDocumentSchema = configurationDocumentSchema(
  AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS,
  AUTHORIZATION_ADMIN_MAX_EXPORT_BYTES
).openapi({
  description: `Deterministic versioned authorization configuration export document; maximum ${AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS} combined rows and ${AUTHORIZATION_ADMIN_MAX_EXPORT_BYTES} UTF-8 bytes`,
});

const authorizationConfigurationImportDocumentSchema = configurationDocumentSchema(
  AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS,
  AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES
).openapi({
  description: `Bounded versioned authorization configuration import document; maximum ${AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS} combined rows and ${AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES} UTF-8 bytes`,
});

export const authorizationExportQuerySchema = z
  .object({
    includeAssignments: z.enum(['true', 'false']).optional(),
    includeSystemAssignments: z.enum(['true', 'false']).optional(),
  })
  .strict();

export const authorizationConfigurationExportPreviewSchema = z
  .object({
    operation: z.literal('config-export-sensitive'),
    includeAssignments: z.literal(true),
    includeSystemAssignments: z.boolean(),
    templateCount: z.number().int().min(0).max(AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS),
    roleCount: z.number().int().min(0).max(AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS),
    assignmentCount: z.number().int().min(0).max(AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS),
    documentHash: z.string().length(64),
    confirmationToken: confirmationTokenField,
  })
  .strict();

export const authorizationConfigurationExportResponseSchema: ApiSchemaField = z.union([
  authorizationConfigurationDocumentSchema,
  authorizationConfigurationExportPreviewSchema,
]);

const authorizationConfigurationDocumentInputSchema = z.union([
  authorizationConfigurationImportDocumentSchema,
  utf8PayloadField(AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES, 'JSON-encoded authorization configuration import document'),
]);

export const authorizationImportPreviewBodySchema = z
  .object({
    document: authorizationConfigurationDocumentInputSchema,
    reason: reasonField,
  })
  .strict();

export const authorizationImportApplyBodySchema = authorizationImportPreviewBodySchema
  .extend({ confirmationToken: confirmationTokenField })
  .strict();

export const authorizationConfigurationImportPreviewSchema = z
  .object({
    operation: z.literal('config-import'),
    documentHash: z.string().length(64),
    templateChanges: z.number().int().min(0).max(AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS),
    roleChanges: z.number().int().min(0).max(AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS),
    assignmentChanges: z.number().int().min(0).max(AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS),
    noOpCount: z.number().int().min(0).max(AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS),
    fatalErrors: z.array(z.string().min(1).max(256)).max(100),
    confirmationToken: confirmationTokenField.optional(),
  })
  .strict();

export const authorizationConfigurationImportMutationSchema = z
  .object({
    data: z
      .object({
        templateChanges: z.number().int().min(0).max(AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS),
        roleChanges: z.number().int().min(0).max(AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS),
        assignmentChanges: z.number().int().min(0).max(AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS),
        noOpCount: z.number().int().min(0).max(AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS),
        documentHash: z.string().length(64),
      })
      .strict(),
    version: z.literal(1),
    auditEventId: identifierField,
    requestId: identifierField,
    batchId: identifierField,
    changed: z.literal(true),
  })
  .strict();

export const authorizationExpectedVersionBodySchema = z
  .object({
    expectedVersion: positiveVersionField,
    confirmationToken: z.string().min(1).max(8_192).optional(),
    reason: optionalTextField(AUTHORIZATION_API_MAX_REASON_LENGTH),
  })
  .strict();

const authorizationBulkAssignmentRowBaseShape = {
  principalId: identifierField,
  roleKey: roleKeyField,
  sourceKey: optionalTextField(128),
  expectedVersion: positiveVersionField.optional(),
};

export const authorizationBulkAssignmentRowSchema = z.union([
  z
    .object({
      ...authorizationBulkAssignmentRowBaseShape,
      action: z.literal('grant'),
      expiresAt: isoDateTimeField.optional(),
    })
    .strict(),
  z
    .object({
      ...authorizationBulkAssignmentRowBaseShape,
      action: z.literal('revoke'),
    })
    .strict(),
]);

export const authorizationBulkRowsSchema = z.array(authorizationBulkAssignmentRowSchema).min(1).max(100);

const authorizationJsonBulkRequestShape = {
  format: z.literal('json').optional(),
  rows: z.union([
    authorizationBulkRowsSchema,
    utf8PayloadField(AUTHORIZATION_ADMIN_MAX_BULK_BYTES, 'JSON-encoded assignment rows'),
  ]),
  reason: optionalTextField(AUTHORIZATION_API_MAX_REASON_LENGTH),
};
const authorizationCsvBulkRequestShape = {
  format: z.literal('csv'),
  rows: utf8PayloadField(AUTHORIZATION_ADMIN_MAX_BULK_BYTES, 'CSV-encoded assignment rows'),
  reason: optionalTextField(AUTHORIZATION_API_MAX_REASON_LENGTH),
};

export const authorizationBulkPreviewBodySchema = z.union([
  z.object(authorizationJsonBulkRequestShape).strict(),
  z.object(authorizationCsvBulkRequestShape).strict(),
]);

export const authorizationBulkApplyBodySchema = z.union([
  z.object({ ...authorizationJsonBulkRequestShape, confirmationToken: confirmationTokenField }).strict(),
  z.object({ ...authorizationCsvBulkRequestShape, confirmationToken: confirmationTokenField }).strict(),
]);

export const authorizationBulkRequestSchema = z.union([
  authorizationBulkPreviewBodySchema,
  authorizationBulkApplyBodySchema,
]);

export const authorizationBulkAssignmentRowPreviewSchema = z
  .object({
    index: z.number().int().min(0).max(99),
    row: authorizationBulkAssignmentRowSchema,
    normalizedPrincipalId: identifierField.optional(),
    assignmentId: identifierField.optional(),
    assignmentVersion: positiveVersionField.optional(),
    outcome: z.enum(['grant', 'revoke', 'no-op', 'invalid']),
    errorCode: z.string().min(1).max(128).optional(),
  })
  .strict();

export const authorizationBulkAssignmentPreviewSchema = z
  .object({
    rows: z.array(authorizationBulkAssignmentRowPreviewSchema).min(1).max(100),
    grantCount: z.number().int().min(0).max(100),
    revokeCount: z.number().int().min(0).max(100),
    noOpCount: z.number().int().min(0).max(100),
    invalidCount: z.number().int().min(0).max(100),
    confirmationToken: confirmationTokenField.optional(),
  })
  .strict()
  .openapi({ description: 'Bounded manual assignment batch validation and impact preview' });

export const authorizationAssignmentMutationResultSchema = z
  .object({
    data: authorizationAssignmentSchema,
    version: positiveVersionField,
    auditEventId: identifierField,
    requestId: identifierField,
    changed: z.boolean(),
  })
  .strict()
  .openapi({ description: 'Versioned and audited sourced assignment mutation result' });

export const authorizationBulkAssignmentMutationSchema = z
  .object({
    data: z
      .object({
        appliedCount: z.number().int().min(0).max(100),
        noOpCount: z.number().int().min(0).max(100),
        rowResults: z.array(authorizationBulkAssignmentRowPreviewSchema).min(1).max(100),
      })
      .strict(),
    version: positiveVersionField,
    auditEventId: identifierField,
    requestId: identifierField,
    batchId: identifierField,
    changed: z.boolean(),
  })
  .strict()
  .openapi({ description: 'Atomic assignment batch result with per-row outcomes and batch audit identity' });

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
