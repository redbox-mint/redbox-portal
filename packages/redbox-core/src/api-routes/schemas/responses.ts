import 'zod-to-openapi';

import { z, type ZodTypeAny } from 'zod';

import { ApiSchemaField } from '../types';

function withOpenApi<T extends ZodTypeAny>(schema: T, metadata: Record<string, unknown>): T {
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
        headers: z.record(z.string()).optional(),
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

export const apiErrorResponseSchema = withOpenApi(messageDetailsSchema, {
    description: 'Legacy API error response with message and details fields',
});

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

export const storageServiceResponseSchema = withOpenApi(
    z.object({
        success: z.boolean(),
        oid: z.string(),
        message: z.string(),
        metadata: genericObjectSchema.nullable(),
        details: z.union([z.string(), genericObjectSchema]).optional(),
        totalItems: z.number().int(),
        items: z.array(genericObjectSchema),
    }),
    { description: 'Storage service response envelope' }
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
    z.object({
        id: z.string(),
        name: z.string(),
        branding: brandingReferenceSchema.optional(),
    }).passthrough(),
    { description: 'Role summary' }
);

export const brandingConfigSchema = withOpenApi(
    z.object({
        id: z.string(),
        name: z.string(),
        css: z.string(),
        variables: jsonObjectSchema.optional(),
        version: z.number().int().optional(),
        hash: z.string().optional(),
        logo: jsonObjectSchema.optional(),
        roles: z.array(roleSummarySchema).optional(),
        supportAgreementInformation: jsonObjectSchema.optional(),
    }).passthrough(),
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
    z.object({
        branding: brandingReferenceSchema,
        version: z.number().int(),
        hash: z.string(),
        css: z.string().optional(),
        variables: jsonObjectSchema.optional(),
        dateCreated: dateTimeSchema.optional(),
    }).passthrough(),
    { description: 'Branding history entry' }
);

export const userRecordSchema = withOpenApi(
    z.object({
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
    }).passthrough(),
    { description: 'User record response' }
);

export const searchFilterSchema = withOpenApi(
    z.object({
        name: z.string(),
        title: z.string(),
        type: z.string(),
        typeLabel: z.string(),
    }).passthrough(),
    { description: 'Record type search filter' }
);

export const relatedToSchema = withOpenApi(
    z.object({
        recordType: z.string(),
        foreignField: z.string(),
    }).passthrough(),
    { description: 'Record type relation mapping' }
);

export const recordTypeHookDeclarationSchema = withOpenApi(
    z.object({
        function: z.string(),
        options: jsonObjectSchema,
    }).passthrough(),
    { description: 'Record type hook declaration' }
);

export const recordTypeHookOnEventSchema = withOpenApi(
    z.object({
        pre: z.array(recordTypeHookDeclarationSchema),
        post: z.array(recordTypeHookDeclarationSchema),
        postSync: z.array(recordTypeHookDeclarationSchema),
    }).passthrough(),
    { description: 'Record type hook event handlers' }
);

export const recordTypeHooksSchema = withOpenApi(
    z.object({
        onCreate: recordTypeHookOnEventSchema,
        onUpdate: recordTypeHookOnEventSchema,
        onDelete: recordTypeHookOnEventSchema,
    }).passthrough(),
    { description: 'Record type hooks configuration' }
);

export const recordTypeSchema = withOpenApi(
    z.object({
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
    }).passthrough(),
    { description: 'Record type configuration' }
);

export const formSchema = withOpenApi(
    z.object({
        id: z.string().optional(),
        name: z.string(),
        branding: z.union([z.string(), z.number(), brandingConfigSchema]).optional(),
        configuration: jsonObjectSchema.optional(),
    }).passthrough(),
    { description: 'Form definition' }
);

export const vocabularyEntrySchema = withOpenApi(
    z.object({
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
    }).passthrough(),
    { description: 'Vocabulary entry' }
);

export const vocabularyTreeNodeSchema = withOpenApi(
    vocabularyEntrySchema.extend({
        children: z.array(vocabularyEntrySchema).optional(),
    }),
    { description: 'Vocabulary tree node' }
);

export const vocabularySchema = withOpenApi(
    z.object({
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
    }).passthrough(),
    { description: 'Vocabulary record' }
);

export const translationEntrySchema = withOpenApi(
    z.object({
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
    }).passthrough(),
    { description: 'Translation entry' }
);

export const translationBundleSchema = withOpenApi(
    z.object({
        id: z.string().optional(),
        branding: brandingReferenceSchema.optional(),
        data: jsonObjectSchema,
        displayName: z.string().optional(),
        enabled: z.boolean().optional(),
        entries: z.array(translationEntrySchema).optional(),
        locale: z.string(),
        namespace: z.string().optional(),
        uid: z.string().optional(),
    }).passthrough(),
    { description: 'Translation bundle' }
);

export const searchFacetValueSchema = withOpenApi(
    z.object({
        value: z.string(),
        count: z.number().int(),
    }).passthrough(),
    { description: 'Search facet value' }
);

export const searchFacetSchema = withOpenApi(
    z.object({
        name: z.string(),
        values: z.array(searchFacetValueSchema),
    }).passthrough(),
    { description: 'Search facet summary' }
);

export const searchRecordSchema = withOpenApi(
    z.object({
        hasEditAccess: z.boolean(),
    }).passthrough(),
    { description: 'Search result record' }
);

export const searchResultsSchema = withOpenApi(
    z.object({
        records: z.array(searchRecordSchema),
        facets: z.array(searchFacetSchema).optional(),
        totalItems: z.number().int(),
    }).passthrough(),
    { description: 'Search response payload' }
);

export const recordMetadataSchema = withOpenApi(
    z.object({}).passthrough(),
    { description: 'Record metadata payload' }
);

export const objectMetadataSchema = withOpenApi(
    z.object({}).passthrough(),
    { description: 'Object metadata payload' }
);

export const recordListItemSchema = withOpenApi(
    z.object({
        oid: z.string(),
        title: z.string().optional(),
        metadata: jsonObjectSchema,
        dateCreated: dateTimeSchema.optional(),
        dateModified: dateTimeSchema.optional(),
        hasEditAccess: z.boolean(),
    }).passthrough(),
    { description: 'Record list item' }
);

export const deletedRecordListItemSchema = withOpenApi(
    z.object({
        oid: z.string(),
        title: z.string().optional(),
        deletedRecord: jsonObjectSchema,
        dateCreated: dateTimeSchema.optional(),
        dateModified: dateTimeSchema.optional(),
        dateDeleted: dateTimeSchema.optional(),
    }).passthrough(),
    { description: 'Deleted record list item' }
);

export const datastreamSummarySchema = withOpenApi(
    z.object({
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
    }).passthrough(),
    { description: 'Record datastream summary' }
);

export const datastreamUploadFileSchema = withOpenApi(
    z.object({
        fileId: z.string(),
        metadata: jsonObjectSchema.optional(),
    }).passthrough(),
    { description: 'Uploaded datastream file reference' }
);

export const datastreamUploadResultSchema = withOpenApi(
    z.object({
        success: z.boolean(),
        message: z.string(),
        fileIds: z.array(datastreamUploadFileSchema).optional(),
    }).passthrough(),
    { description: 'Datastream upload result' }
);

export const datastreamUploadResponseSchema = withOpenApi(
    z.object({
        message: datastreamUploadResultSchema,
    }),
    { description: 'Datastream upload response' }
);

export const recordAuditEntrySchema = withOpenApi(
    z.object({}).passthrough(),
    { description: 'Record audit entry' }
);

export const namedQueryResponseRecordSchema = withOpenApi(
    z.object({
        oid: z.string(),
        title: z.string(),
        metadata: jsonObjectSchema,
        lastSaveDate: dateTimeSchema.nullable(),
        dateCreated: dateTimeSchema.nullable(),
    }).passthrough(),
    { description: 'Named query result record' }
);

export const appConfigValueSchema = withOpenApi(
    z.object({}).passthrough(),
    { description: 'Application configuration payload' }
);
