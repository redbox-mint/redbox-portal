import { z } from '../../api-routes/zod-openapi';
import type {
  GraphqlNamedQueryOperation,
  NamedQueryDefinition,
  NamedQuerySource,
} from '@researchdatabox/sails-ng-common';

export class NamedQueryDefinitionError extends Error {
  readonly code = 'INVALID_NAMED_QUERY_DEFINITION';
  constructor(readonly field: string) {
    super(`Invalid named query definition at ${field}`);
  }
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const DATABASE_NAMED_QUERY_FIELDS = [
  'collectionName',
  'mongoQuery',
  'queryParams',
  'resultObjectMapping',
  'brandIdFieldPath',
  'sort',
  'expandRelations',
  'relatedRecordFilters',
] as const;

/** Missing source alone is legacy database. Null, empty and unknown values fail closed. */
export function namedQuerySource(value: unknown): NamedQuerySource {
  if (!object(value)) throw new NamedQueryDefinitionError('definition');
  if (value.source === undefined || value.source === 'database') return 'database';
  if (value.source === 'graphql') return 'graphql';
  throw new NamedQueryDefinitionError('source');
}

export function assertNamedQuerySourceFields(value: unknown): NamedQuerySource {
  const source = namedQuerySource(value);
  if (!object(value)) throw new NamedQueryDefinitionError('definition');
  const prohibited = source === 'database' ? ['graphql'] : DATABASE_NAMED_QUERY_FIELDS;
  for (const field of prohibited) {
    if (Object.hasOwn(value, field)) throw new NamedQueryDefinitionError(field);
  }
  return source;
}

const variableName = z.string().regex(/^[_A-Za-z][_0-9A-Za-z]*$/);
// Schema-aware validation and safe path resolution live in graphql-validation.ts.
const path = z.array(z.string().min(1));
// The API generator cannot serialize recursive z.json() component graphs. Keep
// OpenAPI's JSON value unconstrained while validating its actual contents here.
const jsonValue = z
  .unknown()
  .transform((value, context) => {
    const parsed = z.json().safeParse(value);
    if (!parsed.success) {
      context.addIssue({ code: 'custom', message: 'Expected a JSON value' });
      return z.NEVER;
    }
    return parsed.data;
  })
  .describe('JSON value; omission is distinct from an explicit null.');
const binding = z.discriminatedUnion('ownership', [
  z.object({ ownership: z.literal('fixed'), value: jsonValue }).strict(),
  z
    .object({
      ownership: z.literal('consumer'),
      parameter: z.string().min(1),
      inputType: z.string().min(1),
      required: z.boolean(),
      defaultValue: jsonValue.optional(),
    })
    .strict(),
  z.object({ ownership: z.literal('omitted') }).strict(),
]);

/** Structural only: no parsing/execution of documents or schema access during reads/imports. */
export const graphqlNamedQueryOperationSchema: z.ZodType<GraphqlNamedQueryOperation> = z
  .object({
    document: z.string().min(1),
    operationName: variableName.optional(),
    variables: z.record(variableName, binding),
    resultPath: path,
    mappings: z
      .object({
        oid: path.optional(),
        title: path.optional(),
        metadata: path.optional(),
        dateCreated: path.optional(),
        lastSaveDate: path.optional(),
      })
      .strict()
      .optional(),
    lookup: z
      .object({
        mode: z.literal('firstPage'),
        collectionPath: path,
        hasNextPagePath: path,
        endCursorPath: path.optional(),
        firstVariable: variableName,
        afterVariable: variableName,
        searchParameter: z.string().min(1),
      })
      .strict()
      .optional(),
    provenance: z
      .object({ explorerId: z.string().optional(), explorerRevision: z.number().int().positive().optional() })
      .strict()
      .optional(),
  })
  .strict();

export function assertNamedQueryDefinition(value: unknown): asserts value is NamedQueryDefinition {
  const source = assertNamedQuerySourceFields(value);
  if (!object(value)) throw new NamedQueryDefinitionError('definition');
  if (value.description !== undefined && typeof value.description !== 'string')
    throw new NamedQueryDefinitionError('description');
  if (source === 'graphql') {
    const result = graphqlNamedQueryOperationSchema.safeParse(value.graphql);
    if (!result.success)
      throw new NamedQueryDefinitionError(`graphql.${result.error.issues[0]?.path.join('.') || 'definition'}`);
  }
  // Preserve the established database validation/coercion rules and bootstrap array shapes.
}

/** Database-only adapters remain closed to GraphQL; T05 owns authenticated dispatch. */
export function requireDatabaseNamedQuery(value: unknown): void {
  if (assertNamedQuerySourceFields(value) === 'graphql') {
    throw new Error(
      'GraphQL named query execution is not available; database/report adapters do not support this source'
    );
  }
}
