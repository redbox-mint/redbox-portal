import { z } from '../zod-openapi';
import { DATABASE_NAMED_QUERY_FIELDS, graphqlNamedQueryOperationSchema } from '../../services/named-query/definition';
import { listApiSummarySchema, namedQueryResponseRecordSchema } from './responses';

/** Database field values retain their existing service-level validation/coercion. */
const databaseDefinition = z
  .object({
    source: z.literal('database').optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    collectionName: z.string(),
    mongoQuery: z.unknown().optional(),
    queryParams: z.unknown().optional(),
    resultObjectMapping: z.unknown().optional(),
    brandIdFieldPath: z.string().optional(),
    sort: z.unknown().optional(),
    expandRelations: z.boolean().optional(),
    relatedRecordFilters: z.unknown().optional(),
    graphql: z.never().meta({ type: 'object', not: {} }).optional(),
  })
  .passthrough();
const prohibitedDatabaseFields = Object.fromEntries(
  DATABASE_NAMED_QUERY_FIELDS.map(field => [field, z.never().meta({ type: 'object', not: {} }).optional()])
);
const graphqlDefinition = z
  .object({
    ...prohibitedDatabaseFields,
    source: z.literal('graphql'),
    name: z.string().optional(),
    description: z.string().optional(),
    graphql: graphqlNamedQueryOperationSchema,
  })
  .passthrough();
export const namedQueryDefinitionSchema = z.union([databaseDefinition, graphqlDefinition]);

/** Drafts can be incomplete: structural diagnostics belong to validation/description. */
export const namedQueryDraftSchema = z
  .object({
    definition: z.unknown(),
    guidance: z.unknown().optional(),
    relatedGuidance: z.unknown().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const namedQueryExecutionResultSchema = z.union([
  z.object({
    source: z.literal('database').optional(),
    summary: listApiSummarySchema,
    records: z.array(namedQueryResponseRecordSchema),
  }),
  z.object({
    source: z.literal('graphql'),
    records: z.array(
      z.object({
        oid: z.string().optional(),
        title: z.string().optional(),
        metadata: z.unknown().optional(),
        // GraphQL mappings preserve selected values; these wrapper names do not coerce dates.
        dateCreated: z.unknown().optional().describe('Optional mapped value preserved without date coercion.'),
        lastSaveDate: z.unknown().optional().describe('Optional mapped value preserved without date coercion.'),
      })
    ),
    summary: z.object({ numFound: z.null(), start: z.literal(0), page: z.literal(1) }),
    pagination: z.object({ mode: z.literal('firstPage'), hasNextPage: z.boolean() }),
  }),
]);
