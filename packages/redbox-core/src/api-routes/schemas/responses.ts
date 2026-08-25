import { z } from '../zod-openapi';
import type { ZodType } from 'zod';

import { ApiSchemaField } from '../types';
import {
  RECORD_CONCURRENCY_RESOLUTIONS,
  RECORD_CONCURRENT_MODIFICATION_MODES,
  RECORD_ENTITY_TAG_MAX_LENGTH,
  RECORD_ENTITY_TAG_PATTERN,
  RECORD_FORM_FINGERPRINT_MAX_LENGTH,
  RECORD_REVISION_MAX,
  RECORD_SAVE_EXPECTED_JSON_TYPES,
  RECORD_SAVE_LINEAGE_LIMITS,
  RECORD_SAVE_MESSAGE_MAX_LENGTH,
  RECORD_SAVE_PROBLEM_KINDS,
  RECORD_SAVE_PUBLIC_FIELD_LIMITS,
  RECORD_SAVE_PUBLIC_IDENTIFIER_PATTERN,
  RECORD_SAVE_REQUEST_ID_PATTERN,
  RECORD_SAVE_VALIDATOR_CLASS_MAX_LENGTH,
  isRecordSaveJsonPointer,
  RECORD_VALIDATION_REFERENCE_PATTERN,
  VALIDATION_OPERATION_DESCRIPTION_MAX_LENGTH,
  VALIDATION_OPERATION_LABEL_MAX_LENGTH,
  VALIDATION_OPERATION_NAME_MAX_LENGTH,
  VALIDATION_OPERATION_NAME_PATTERN,
} from '@researchdatabox/sails-ng-common';

function withOpenApi<T extends ZodType>(schema: T, metadata: Record<string, unknown>): T {
  return (schema as unknown as { openapi: (metadata: Record<string, unknown>) => T }).openapi(metadata);
}

const metaResponseItemV2Schema = withOpenApi(z.object({}).passthrough(), {
  description: 'Non-standard response metadata',
});

export const errorResponseItemV2Schema = withOpenApi(
  z.object({
    id: z.string().optional(),
    status: z.string().optional(),
    code: z.string().optional(),
    title: z.string().optional(),
    detail: z.string().optional(),
    source: z
      .object({
        pointer: z.string().optional(),
        parameter: z.string().optional(),
        header: z.string().optional(),
      })
      .partial()
      .optional(),
    links: z
      .object({
        about: z.string().optional(),
        type: z.string().optional(),
      })
      .partial()
      .optional(),
    meta: metaResponseItemV2Schema.optional(),
  }),
  { description: 'JSON:API error item used for validation and display errors' }
);

export const errorResponseV2Schema = withOpenApi(
  z.object({
    errors: z.array(errorResponseItemV2Schema),
    meta: metaResponseItemV2Schema,
  }),
  { description: 'JSON:API error response envelope' }
);

export const dataResponseV2Schema = withOpenApi(
  z.object({
    data: z.unknown(),
    meta: metaResponseItemV2Schema,
  }),
  { description: 'JSON:API success response envelope' }
);

export const buildResponseTypeSchema = withOpenApi(
  z.object({
    format: z.literal('json').optional(),
    data: z.unknown().optional(),
    status: z.number().int().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    errors: z.array(z.object({}).passthrough()).optional(),
    displayErrors: z.array(errorResponseItemV2Schema).optional(),
    meta: metaResponseItemV2Schema.optional(),
    v1: z.unknown().optional(),
  }),
  { description: 'Internal response envelope used by CoreController.sendResp' }
);

const messageDetailsSchema = z.object({
  message: z.string(),
  details: z.string(),
});

export const apiErrorResponseSchema = withOpenApi(
  messageDetailsSchema.extend({
    details: z.string().optional(),
  }),
  {
    description: 'Legacy API error response with a message and optional details',
  }
);

export const apiActionResponseSchema = withOpenApi(messageDetailsSchema, {
  description: 'Legacy API action response with message and details fields',
});

export const apiObjectActionResponseSchema = withOpenApi(
  messageDetailsSchema.extend({
    oid: z.string(),
  }),
  { description: 'Legacy API object action response with oid, message, and details fields' }
);

export const apiHarvestResponseSchema = withOpenApi(
  z.object({
    harvestId: z.string(),
    oid: z.string(),
    message: z.string(),
    details: z.string(),
    status: z.boolean(),
  }),
  { description: 'Legacy harvest response envelope' }
);

export const harvestRunSummarySchema = withOpenApi(
  z.object({
    id: z.string().optional(),
    sourceRunId: z.string(),
    brandId: z.string().optional(),
    recordType: z.string(),
    sourceName: z.string(),
    sourceUri: z.string().optional(),
    status: z.string(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    startedBy: z.string().optional(),
    lastChunkAt: z.string().optional(),
    totalProcessed: z.number().int(),
    created: z.number().int(),
    updated: z.number().int(),
    deleted: z.number().int(),
    unchanged: z.number().int(),
    failed: z.number().int(),
    chunksProcessed: z.number().int(),
    duplicateChunks: z.number().int(),
  }),
  { description: 'Harvest run summary' }
);

export const harvestRunChunkSummarySchema = withOpenApi(
  z.object({
    id: z.string().optional(),
    runId: z.string().optional(),
    brandId: z.string().optional(),
    recordType: z.string().optional(),
    sourceRunId: z.string().optional(),
    contentHash: z.string(),
    attempt: z.number().int().optional(),
    chunkIndex: z.number().int().optional(),
    chunkLabel: z.string().optional(),
    totalExpected: z.number().int().optional(),
    status: z.string(),
    recordCount: z.number().int(),
    totalProcessed: z.number().int(),
    created: z.number().int(),
    updated: z.number().int(),
    deleted: z.number().int(),
    unchanged: z.number().int(),
    failed: z.number().int(),
    duplicate: z.boolean(),
    submittedAt: z.string().optional(),
    completedAt: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
  { description: 'Harvest run chunk summary' }
);

export const harvestRunEventSchema = withOpenApi(
  z.object({
    id: z.string().optional(),
    runId: z.string().optional(),
    chunkId: z.string().optional(),
    brandId: z.string().optional(),
    recordType: z.string().optional(),
    sourceRunId: z.string().optional(),
    harvestId: z.string(),
    oid: z.string().optional(),
    operation: z.string(),
    outcome: z.string(),
    status: z.boolean(),
    message: z.string().optional(),
    details: z.string().optional(),
    errorCode: z.string().optional(),
    createdAt: z.string(),
  }),
  { description: 'Harvest run event row' }
);

export const harvestRunAggregateCountsSchema = withOpenApi(
  z.object({
    totalProcessed: z.number().int(),
    created: z.number().int(),
    updated: z.number().int(),
    deleted: z.number().int(),
    unchanged: z.number().int(),
    failed: z.number().int(),
    chunksProcessed: z.number().int(),
    duplicateChunks: z.number().int(),
  }),
  { description: 'Harvest run aggregate counters' }
);

export const harvestChunkRecordResponseSchema = withOpenApi(
  z.object({
    harvestId: z.string(),
    oid: z.string(),
    operation: z.string(),
    outcome: z.string(),
    status: z.boolean(),
    message: z.string(),
    details: z.string(),
  }),
  { description: 'Tracked harvest record response row' }
);

export const enhancedHarvestChunkResponseSchema = withOpenApi(
  z.object({
    run: harvestRunSummarySchema,
    chunk: harvestRunChunkSummarySchema,
    records: z.array(harvestChunkRecordResponseSchema).optional(),
  }),
  { description: 'Tracked harvest chunk response envelope' }
);

export const harvestRunDetailResponseSchema = withOpenApi(
  z.object({
    run: harvestRunSummarySchema,
    chunks: z.array(harvestRunChunkSummarySchema),
    events: z.array(harvestRunEventSchema),
    aggregateCounts: harvestRunAggregateCountsSchema,
  }),
  { description: 'Harvest run detail response' }
);

export const harvestRouteResponseSchema = withOpenApi(
  z.union([z.array(apiHarvestResponseSchema), enhancedHarvestChunkResponseSchema]),
  { description: 'Harvest response for legacy and tracked payloads' }
);

export const listApiSummarySchema = withOpenApi(
  z.object({
    numFound: z.number().int(),
    page: z.number().int(),
    start: z.number().int(),
  }),
  { description: 'Legacy list response summary' }
);

export function listApiResponseSchema(recordSchema: ApiSchemaField): ApiSchemaField {
  return withOpenApi(
    z.object({
      summary: listApiSummarySchema,
      records: z.array(recordSchema),
    }),
    { description: 'Legacy list response envelope' }
  );
}

export const createUserApiResponseSchema = withOpenApi(
  z.object({
    id: z.string(),
    username: z.string(),
    name: z.string(),
    email: z.string(),
    type: z.string(),
    lastLogin: z.string().nullable(),
  }),
  { description: 'User response returned by create and update actions' }
);

export const userApiTokenApiResponseSchema = withOpenApi(
  z.object({
    id: z.string(),
    username: z.string(),
    token: z.string(),
  }),
  { description: 'API token response returned by token generation actions' }
);

export const genericObjectSchema = withOpenApi(z.object({}).passthrough(), {
  description: 'Arbitrary object payload',
});

export const recordAuthorizationSchema = withOpenApi(
  z.object({
    edit: z.array(z.string()).optional(),
    view: z.array(z.string()).optional(),
    editPending: z.array(z.string()).optional(),
    viewPending: z.array(z.string()).optional(),
    editRoles: z.array(z.string()).optional(),
    viewRoles: z.array(z.string()).optional(),
  }),
  { description: 'Record authorization payload' }
);

const recordSaveLineageSegmentSchema = z.union([
  z.string().max(RECORD_SAVE_LINEAGE_LIMITS.maxSegmentLength),
  z.number().int().nonnegative(),
]);

const recordSaveLineagePathSchema = z.array(recordSaveLineageSegmentSchema).max(RECORD_SAVE_LINEAGE_LIMITS.maxSegments);

const recordSaveTargetFieldSchema = z.object({
  formConfig: recordSaveLineagePathSchema.optional(),
  dataModel: recordSaveLineagePathSchema.optional(),
  angularComponents: recordSaveLineagePathSchema.optional(),
  layout: recordSaveLineagePathSchema.optional(),
});

const recordSaveLineagePathsSchema = recordSaveTargetFieldSchema.extend({
  angularComponentsJsonPointer: z.string().max(RECORD_SAVE_LINEAGE_LIMITS.maxPointerLength).optional(),
  layoutJsonPointer: z.string().max(RECORD_SAVE_LINEAGE_LIMITS.maxPointerLength).optional(),
});

const recordSaveValidatorParametersSchema = z
  .object({
    requiredThreshold: z.number().finite().optional(),
    actualLength: z.number().finite().optional(),
    requiredLength: z.number().finite().optional(),
    required: z.boolean().optional(),
    controlCount: z.number().finite().optional(),
    valueCount: z.number().finite().optional(),
    multiSelect: z.boolean().optional(),
    sourceType: z.enum(['static', 'vocabulary', 'query', 'service']).optional(),
  })
  .strict();

export const recordSaveIssueSchema = withOpenApi(
  z
    .object({
      code: z
        .string()
        .max(RECORD_SAVE_PUBLIC_FIELD_LIMITS.maxCodeLength)
        .regex(RECORD_SAVE_PUBLIC_IDENTIFIER_PATTERN)
        .optional(),
      message: z.string().max(RECORD_SAVE_MESSAGE_MAX_LENGTH),
      field: z
        .string()
        .max(RECORD_SAVE_PUBLIC_FIELD_LIMITS.maxFieldLength)
        .regex(RECORD_SAVE_PUBLIC_IDENTIFIER_PATTERN)
        .optional(),
      pointer: z
        .string()
        .max(RECORD_SAVE_PUBLIC_FIELD_LIMITS.maxPointerLength)
        .refine(isRecordSaveJsonPointer)
        .optional(),
      expected: z
        .object({
          type: z.enum(RECORD_SAVE_EXPECTED_JSON_TYPES),
        })
        .strict()
        .optional(),
      attachmentId: z
        .string()
        .max(RECORD_SAVE_PUBLIC_FIELD_LIMITS.maxAttachmentIdLength)
        .regex(RECORD_SAVE_PUBLIC_IDENTIFIER_PATTERN)
        .optional(),
      class: z
        .string()
        .max(RECORD_SAVE_VALIDATOR_CLASS_MAX_LENGTH)
        .regex(RECORD_SAVE_PUBLIC_IDENTIFIER_PATTERN)
        .optional(),
      params: recordSaveValidatorParametersSchema.optional(),
      targetField: recordSaveTargetFieldSchema.optional(),
      lineagePaths: recordSaveLineagePathsSchema.optional(),
    })
    .strict(),
  { description: 'Safe, field-addressable save issue with bounded validator metadata' }
);

const recordSaveProblemSchema = withOpenApi(
  z.union([
    z
      .object({
        kind: z.enum(RECORD_SAVE_PROBLEM_KINDS),
        source: z.literal('schema'),
        phase: z.literal('schema'),
        issues: z.array(recordSaveIssueSchema),
      })
      .strict(),
    z
      .object({
        kind: z.enum(RECORD_SAVE_PROBLEM_KINDS),
        phase: z.enum(['pre-save', 'persistence', 'attachments', 'post-save', 'response', 'transport']),
        issues: z.array(recordSaveIssueSchema),
      })
      .strict(),
  ]),
  { description: 'A save phase problem and its safe display issues' }
);

export const recordRevisionSchema = withOpenApi(z.number().int().min(0).max(RECORD_REVISION_MAX), {
  description: 'Server-owned monotonic aggregate record revision',
  example: 7,
});

export const recordEntityTagSchema = withOpenApi(
  z.string().max(RECORD_ENTITY_TAG_MAX_LENGTH).regex(RECORD_ENTITY_TAG_PATTERN),
  {
    description: 'Opaque strong entity tag for one record lifecycle representation',
    example: '"rb-record-v1.7.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
  }
);

export const recordFormFingerprintSchema = withOpenApi(
  z.string().max(RECORD_FORM_FINGERPRINT_MAX_LENGTH).regex(RECORD_SAVE_PUBLIC_IDENTIFIER_PATTERN),
  { description: 'Opaque fingerprint of the authoritative generated browser-form contract' }
);

export const recordConcurrentModificationConfigSchema = withOpenApi(
  z
    .object({
      mode: z.enum(RECORD_CONCURRENT_MODIFICATION_MODES),
    })
    .strict(),
  { description: 'Record-type optimistic concurrency policy' }
);

export const recordConcurrencyMetadataSchema = withOpenApi(
  z
    .object({
      mode: z.enum(RECORD_CONCURRENT_MODIFICATION_MODES).optional(),
      revision: recordRevisionSchema.optional(),
      expectedRevision: recordRevisionSchema.optional(),
      currentRevision: recordRevisionSchema.optional(),
      entityTag: recordEntityTagSchema.optional(),
      formFingerprint: recordFormFingerprintSchema.optional(),
      resolution: z.enum(RECORD_CONCURRENCY_RESOLUTIONS).optional(),
      resolutionOfRequestId: z.string().regex(RECORD_SAVE_REQUEST_ID_PATTERN).optional(),
    })
    .strict(),
  { description: 'Bounded diagnostic concurrency facts; resolution labels are never authority' }
);

const recordAttachmentCompletionItemSchema = withOpenApi(
  z.object({
    field: z.string(),
    attachmentId: z.string(),
    fileId: z.string().optional(),
    operation: z.enum(['add', 'finalize', 'delete']),
    status: z.enum(['completed', 'incomplete', 'unknown']),
    code: z.string().optional(),
  }),
  { description: 'Per-attachment completion fact' }
);

const recordSaveCompletionSchema = withOpenApi(
  z.object({
    attachments: z.object({
      status: z.enum(['not-required', 'completed', 'incomplete', 'unknown']),
      items: z.array(recordAttachmentCompletionItemSchema),
    }),
  }),
  { description: 'Item-specific completion details for a record save' }
);

export const storageServiceResponseSchema = withOpenApi(
  z.object({
    success: z.boolean(),
    oid: z.string(),
    message: z.string(),
    data: z.unknown().optional(),
    metadata: genericObjectSchema.nullable(),
    details: z.union([z.string(), genericObjectSchema]).optional(),
    totalItems: z.number().int(),
    items: z.array(genericObjectSchema),
    outcome: z.enum(['saved', 'saved-with-warnings', 'not-saved', 'unknown']).optional(),
    problems: z.array(recordSaveProblemSchema).optional(),
    completion: recordSaveCompletionSchema.optional(),
    requestId: z.string().uuid().optional(),
    concurrency: recordConcurrencyMetadataSchema.optional(),
  }),
  { description: 'Storage service response envelope' }
);

export const recordSaveSuccessResponseSchema = withOpenApi(
  z.union([
    storageServiceResponseSchema,
    z.object({ data: storageServiceResponseSchema, meta: storageServiceResponseSchema }),
  ]),
  { description: 'Legacy v1 record-save response or the v2 {data, meta} envelope' }
);

export const recordSaveFailureResponseSchema = withOpenApi(
  z.union([
    apiErrorResponseSchema,
    z.object({
      errors: z.array(errorResponseItemV2Schema),
      meta: z.union([storageServiceResponseSchema, z.object({}).strict()]),
    }),
  ]),
  {
    description:
      'Legacy v1 error or v2 {errors, meta}; early policy failures may use empty meta while save-boundary failures retain typed result metadata',
  }
);

export const recordPermissionSaveResponseSchema = withOpenApi(
  z.union([
    recordAuthorizationSchema.nullable(),
    z.object({ data: recordAuthorizationSchema.nullable(), meta: storageServiceResponseSchema }),
  ]),
  {
    description:
      'Legacy v1 authorization body or v2 authorization data with the authoritative typed save result in meta; data is null when the successful mutation removes current view access',
  }
);

export const linkedUserSummarySchema = withOpenApi(
  z.object({
    id: z.string(),
    username: z.string(),
    name: z.string(),
    email: z.string(),
    type: z.string(),
    accountLinkState: z.string(),
    linkedAt: z.string().optional(),
  }),
  { description: 'Linked user summary' }
);

export const userLinkResponseSchema = withOpenApi(
  z.object({
    primary: linkedUserSummarySchema,
    linkedAccounts: z.array(linkedUserSummarySchema),
    impact: z
      .object({
        recordsRewritten: z.number().int(),
        rolesMerged: z.number().int(),
      })
      .optional(),
  }),
  { description: 'Linked accounts response' }
);

export const userAuditActorSchema = withOpenApi(
  z.object({
    username: z.string(),
    name: z.string().optional(),
    email: z.string().optional(),
  }),
  { description: 'Audit actor summary' }
);

export const userAuditRecordSchema = withOpenApi(
  z.object({
    id: z.string(),
    timestamp: z.string().nullable(),
    action: z.string(),
    actor: userAuditActorSchema,
    details: z.string(),
    parsedAdditionalContext: genericObjectSchema,
    rawAdditionalContext: z.string().nullable(),
    parseError: z.boolean(),
  }),
  { description: 'User audit record' }
);

export const userAuditSummarySchema = withOpenApi(
  z.object({
    returnedCount: z.number().int(),
    truncated: z.boolean(),
  }),
  { description: 'User audit summary' }
);

export const userAuditResponseSchema = withOpenApi(
  z.object({
    user: genericObjectSchema.nullable(),
    records: z.array(userAuditRecordSchema),
    summary: userAuditSummarySchema,
  }),
  { description: 'User audit response' }
);

export const statusMessageResponseSchema = withOpenApi(
  z.object({
    status: z.boolean(),
    message: z.string(),
  }),
  { description: 'Status and message response' }
);

const dateTimeSchema = withOpenApi(z.string(), {
  description: 'ISO 8601 date-time string',
  format: 'date-time',
});

const jsonObjectSchema = withOpenApi(z.object({}).passthrough(), {
  description: 'Arbitrary JSON object',
});

const brandingReferenceSchema = withOpenApi(z.union([z.string(), z.number()]), {
  description: 'Branding identifier',
});

const jsonValueSchema = withOpenApi(z.unknown(), {
  description: 'Any JSON value',
  type: 'object',
  nullable: true,
});

export const supportAgreementYearSchema = withOpenApi(
  z.object({
    agreedSupportDays: z.number(),
    usedSupportDays: z.number(),
  }),
  { description: 'Annual support agreement usage' }
);

export const roleSummarySchema = withOpenApi(
  z
    .object({
      id: z.string(),
      name: z.string(),
      branding: brandingReferenceSchema.optional(),
    })
    .passthrough(),
  { description: 'Role summary' }
);

export const brandingConfigSchema = withOpenApi(
  z
    .object({
      id: z.string(),
      name: z.string(),
      css: z.string(),
      variables: jsonObjectSchema.optional(),
      version: z.number().int().optional(),
      hash: z.string().optional(),
      logo: jsonObjectSchema.optional(),
      roles: z.array(roleSummarySchema).optional(),
      supportAgreementInformation: jsonObjectSchema.optional(),
    })
    .passthrough(),
  { description: 'Branding configuration record' }
);

export const brandingDraftResponseSchema = withOpenApi(
  z.object({
    branding: brandingConfigSchema,
  }),
  { description: 'Saved branding draft response' }
);

export const brandingPreviewResponseSchema = withOpenApi(
  z.object({
    token: z.string(),
    url: z.string(),
    hash: z.string(),
    previewToken: z.string(),
    previewUrl: z.string(),
    branding: brandingConfigSchema.optional(),
  }),
  { description: 'Branding preview response' }
);

export const brandingPublishResponseSchema = withOpenApi(
  z.object({
    version: z.number().int(),
    hash: z.string(),
    idempotent: z.boolean().optional(),
  }),
  { description: 'Branding publish response' }
);

export const brandingRollbackResponseSchema = withOpenApi(
  z.object({
    version: z.number().int(),
    hash: z.string(),
    branding: brandingConfigSchema.nullable(),
  }),
  { description: 'Branding rollback response' }
);

export const brandingLogoResponseSchema = withOpenApi(
  z.object({
    hash: z.string(),
  }),
  { description: 'Branding logo upload response' }
);

export const brandingHistoryRecordSchema = withOpenApi(
  z
    .object({
      branding: brandingReferenceSchema,
      version: z.number().int(),
      hash: z.string(),
      css: z.string().optional(),
      variables: jsonObjectSchema.optional(),
      dateCreated: dateTimeSchema.optional(),
    })
    .passthrough(),
  { description: 'Branding history entry' }
);

export const userRecordSchema = withOpenApi(
  z
    .object({
      id: z.string(),
      username: z.string(),
      type: z.string(),
      name: z.string(),
      email: z.string(),
      lastLogin: dateTimeSchema.nullable().optional(),
      additionalAttributes: jsonObjectSchema.optional(),
      linkedPrimaryUserId: z.string().optional(),
      accountLinkState: z.string().optional(),
      effectivePrimaryUsername: z.string().optional(),
      linkedAccountCount: z.number().int().optional(),
      loginDisabled: z.boolean().optional(),
      effectiveLoginDisabled: z.boolean().optional(),
      disabledByPrimaryUserId: z.string().optional(),
      disabledByPrimaryUsername: z.string().optional(),
      workspaceApps: z.array(jsonObjectSchema).optional(),
      roles: z.array(roleSummarySchema).optional(),
    })
    .passthrough(),
  { description: 'User record response' }
);

export const searchFilterSchema = withOpenApi(
  z
    .object({
      name: z.string(),
      title: z.string(),
      type: z.string(),
      typeLabel: z.string(),
    })
    .passthrough(),
  { description: 'Record type search filter' }
);

export const relatedToSchema = withOpenApi(
  z
    .object({
      recordType: z.string(),
      foreignField: z.string(),
    })
    .passthrough(),
  { description: 'Record type relation mapping' }
);

export const recordTypeHookDeclarationSchema = withOpenApi(
  z
    .object({
      function: z.string(),
      options: jsonObjectSchema,
    })
    .passthrough(),
  { description: 'Record type hook declaration' }
);

export const recordTypeHookOnEventSchema = withOpenApi(
  z
    .object({
      pre: z.array(recordTypeHookDeclarationSchema),
      post: z.array(recordTypeHookDeclarationSchema),
      postSync: z.array(recordTypeHookDeclarationSchema),
    })
    .passthrough(),
  { description: 'Record type hook event handlers' }
);

export const recordTypeHooksSchema = withOpenApi(
  z
    .object({
      onCreate: recordTypeHookOnEventSchema,
      onUpdate: recordTypeHookOnEventSchema,
      onDelete: recordTypeHookOnEventSchema,
    })
    .passthrough(),
  { description: 'Record type hooks configuration' }
);

export const recordTypeSchema = withOpenApi(
  z
    .object({
      key: z.string().optional(),
      name: z.string(),
      branding: z.union([z.string(), z.number(), brandingConfigSchema]).optional(),
      packageType: z.string().optional(),
      searchCore: z.string().optional(),
      workflowSteps: z.array(jsonObjectSchema).optional(),
      searchFilters: z.array(searchFilterSchema).optional(),
      searchable: z.boolean().optional(),
      transferResponsibility: jsonObjectSchema.optional(),
      relatedTo: z.array(relatedToSchema).optional(),
      hooks: recordTypeHooksSchema.optional(),
      dashboard: jsonObjectSchema.optional(),
      concurrentModification: recordConcurrentModificationConfigSchema.optional(),
    })
    .passthrough(),
  { description: 'Record type configuration' }
);

export const validationOperationDiscoverySchema = withOpenApi(
  z
    .object({
      name: z.string().max(VALIDATION_OPERATION_NAME_MAX_LENGTH).regex(VALIDATION_OPERATION_NAME_PATTERN),
      label: z.string().max(VALIDATION_OPERATION_LABEL_MAX_LENGTH).optional(),
      description: z.string().max(VALIDATION_OPERATION_DESCRIPTION_MAX_LENGTH).optional(),
      allowedTargetSteps: z.array(z.string().max(128).regex(RECORD_VALIDATION_REFERENCE_PATTERN)).optional(),
    })
    .strict(),
  {
    description:
      'Caller-authorized validation operation metadata. allowedTargetSteps are actor-authorized transition ' +
      'targets applicable to the operation; unrestricted policies include every actor-authorized target.',
  }
);

export const formSchema = withOpenApi(
  z
    .object({
      id: z.string().optional(),
      name: z.string(),
      branding: z.union([z.string(), z.number(), brandingConfigSchema]).optional(),
      configuration: jsonObjectSchema.optional(),
      validationOperations: z.array(validationOperationDiscoverySchema).optional(),
    })
    .passthrough(),
  { description: 'Form definition' }
);

export const vocabularyEntrySchema = withOpenApi(
  z
    .object({
      id: z.string().optional(),
      vocabulary: brandingReferenceSchema.optional(),
      label: z.string(),
      labelLower: z.string().optional(),
      value: z.string(),
      valueLower: z.string().optional(),
      parent: brandingReferenceSchema.nullable().optional(),
      identifier: z.string().optional(),
      order: z.number().int().optional(),
      historical: z.boolean().optional(),
    })
    .passthrough(),
  { description: 'Vocabulary entry' }
);

export const vocabularyTreeNodeSchema = withOpenApi(
  vocabularyEntrySchema.extend({
    children: z.array(vocabularyEntrySchema).optional(),
  }),
  { description: 'Vocabulary tree node' }
);

export const vocabularySchema = withOpenApi(
  z
    .object({
      id: z.string().optional(),
      branding: z.union([z.string(), z.number(), brandingConfigSchema]).optional(),
      description: z.string().optional(),
      entries: z.array(vocabularyEntrySchema).optional(),
      lastSyncedAt: dateTimeSchema.optional(),
      name: z.string(),
      owner: z.string().optional(),
      rvaSourceKey: z.string().nullable().optional(),
      slug: z.string(),
      source: z.string().optional(),
      sourceId: z.string().optional(),
      sourceVersionId: z.string().optional(),
      type: z.string().optional(),
    })
    .passthrough(),
  { description: 'Vocabulary record' }
);

export const translationEntrySchema = withOpenApi(
  z
    .object({
      id: z.string().optional(),
      branding: brandingReferenceSchema.optional(),
      bundle: brandingReferenceSchema.optional(),
      category: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      key: z.string(),
      locale: z.string(),
      namespace: z.string().optional(),
      uid: z.string().optional(),
      value: jsonValueSchema,
    })
    .passthrough(),
  { description: 'Translation entry' }
);

export const translationBundleSchema = withOpenApi(
  z
    .object({
      id: z.string().optional(),
      branding: brandingReferenceSchema.optional(),
      data: jsonObjectSchema,
      displayName: z.string().optional(),
      enabled: z.boolean().optional(),
      entries: z.array(translationEntrySchema).optional(),
      locale: z.string(),
      namespace: z.string().optional(),
      uid: z.string().optional(),
    })
    .passthrough(),
  { description: 'Translation bundle' }
);

export const searchFacetValueSchema = withOpenApi(
  z
    .object({
      value: z.string(),
      count: z.number().int(),
    })
    .passthrough(),
  { description: 'Search facet value' }
);

export const searchFacetSchema = withOpenApi(
  z
    .object({
      name: z.string(),
      values: z.array(searchFacetValueSchema),
    })
    .passthrough(),
  { description: 'Search facet summary' }
);

export const searchRecordSchema = withOpenApi(
  z
    .object({
      hasEditAccess: z.boolean(),
    })
    .passthrough(),
  { description: 'Search result record' }
);

export const searchResultsSchema = withOpenApi(
  z
    .object({
      records: z.array(searchRecordSchema),
      facets: z.array(searchFacetSchema).optional(),
      totalItems: z.number().int(),
    })
    .passthrough(),
  { description: 'Search response payload' }
);

export const recordMetadataSchema = withOpenApi(z.object({}).passthrough(), { description: 'Record metadata payload' });

export const objectMetadataSchema = withOpenApi(z.object({}).passthrough(), { description: 'Object metadata payload' });

export const recordReadMetadataSchema = withOpenApi(
  z.object({
    oid: z.string(),
    revision: recordRevisionSchema,
    entityTag: recordEntityTagSchema,
  }),
  { description: 'Typed identity and revision metadata for an individual record representation' }
);

export const recordMetadataReadResponseSchema = withOpenApi(
  z.union([
    recordMetadataSchema,
    z.object({ data: recordMetadataSchema, meta: recordReadMetadataSchema.passthrough() }),
  ]),
  { description: 'Legacy v1 record metadata or v2 data with typed revision metadata' }
);

export const objectMetadataReadResponseSchema = withOpenApi(
  z.union([
    objectMetadataSchema,
    z.object({ data: objectMetadataSchema, meta: recordReadMetadataSchema.passthrough() }),
  ]),
  { description: 'Legacy v1 object metadata or v2 data with typed revision metadata' }
);

export const recordPermissionsReadResponseSchema = withOpenApi(
  z.union([
    recordAuthorizationSchema,
    z.object({ data: recordAuthorizationSchema, meta: recordReadMetadataSchema.passthrough() }),
  ]),
  { description: 'Legacy v1 permissions or v2 permissions with typed revision metadata' }
);

export const recordListItemSchema = withOpenApi(
  z
    .object({
      oid: z.string(),
      revision: recordRevisionSchema,
      title: z.string().optional(),
      metadata: jsonObjectSchema,
      dateCreated: dateTimeSchema.optional(),
      dateModified: dateTimeSchema.optional(),
      hasEditAccess: z.boolean(),
    })
    .passthrough(),
  { description: 'Record list item' }
);

export const deletedRecordListItemSchema = withOpenApi(
  z
    .object({
      oid: z.string(),
      revision: recordRevisionSchema,
      lifecycleState: z.enum(['delete-pending', 'deleted', 'restore-pending', 'purge-pending', 'recovery-required']),
      lifecycle: z
        .object({
          kind: z.enum(['delete', 'restore', 'purge']),
          attempts: z.number().int().nonnegative(),
          startedAt: dateTimeSchema,
          updatedAt: dateTimeSchema,
          errorCode: z
            .string()
            .max(64)
            .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
            .optional(),
        })
        .optional(),
      title: z.string().optional(),
      deletedRecord: jsonObjectSchema,
      dateCreated: dateTimeSchema.optional(),
      dateModified: dateTimeSchema.optional(),
      dateDeleted: dateTimeSchema.optional(),
    })
    .passthrough(),
  { description: 'Deleted record list item' }
);

export const datastreamSummarySchema = withOpenApi(
  z
    .object({
      dateUpdated: dateTimeSchema.optional(),
      label: z.string().optional(),
      contentType: z.string().optional(),
      filename: z.string().optional(),
      contentLength: z.number().optional(),
      lastModified: dateTimeSchema.optional(),
      etag: z.string().optional(),
      fileId: z.string().optional(),
      name: z.string().optional(),
      mimeType: z.string().optional(),
      size: z.number().optional(),
    })
    .passthrough(),
  { description: 'Record datastream summary' }
);

export const datastreamUploadFileSchema = withOpenApi(
  z
    .object({
      fileId: z.string(),
      metadata: jsonObjectSchema.optional(),
    })
    .passthrough(),
  { description: 'Uploaded datastream file reference' }
);

export const datastreamUploadResultSchema = withOpenApi(
  z
    .object({
      success: z.boolean(),
      message: z.string(),
      fileIds: z.array(datastreamUploadFileSchema).optional(),
    })
    .passthrough(),
  { description: 'Datastream upload result' }
);

export const datastreamUploadResponseSchema = withOpenApi(
  z.object({
    message: datastreamUploadResultSchema,
  }),
  { description: 'Datastream upload response' }
);

export const recordAuditEntrySchema = withOpenApi(z.object({}).passthrough(), { description: 'Record audit entry' });

export const namedQueryResponseRecordSchema = withOpenApi(
  z
    .object({
      oid: z.string(),
      title: z.string(),
      metadata: jsonObjectSchema,
      lastSaveDate: dateTimeSchema.nullable(),
      dateCreated: dateTimeSchema.nullable(),
    })
    .passthrough(),
  { description: 'Named query result record' }
);

export const appConfigValueSchema = withOpenApi(z.object({}).passthrough(), {
  description: 'Application configuration payload',
});
