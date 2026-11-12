import { normalizeRedboxCanonicalJsonV1 } from '../../record-contract/canonical-json';
import type { Services as Schemas } from '../../recordSchema/RecordSchema';
import { recordSchemaApiRoutes } from '../../api-routes/groups/record-schemas';
import { validateApiRouteRequest } from '../../api-routes/validation';
import {
  buildRecordSchemaInvalidRequestProblem,
  RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
  RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_VARY,
  recordSchemaImmutableUrl,
} from '../../api-routes/record-schema-response';
import {
  schemaProblem,
  createSchemaFailure,
  updateSchemaFailure,
  immutableSchemaFailure,
  schemaResponseHeaders,
} from '../../api-routes/schemaDelivery';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { UserModel } from '../../model/storage/UserModel';
import { jsonResult, type ReferenceRequest, type ReferenceResult } from './reference';
import type { ApiRouteDefinition } from '../../api-routes/types';
export interface RecordSchemaReadInput {
  readonly schemas: Pick<Schemas.RecordSchema, 'resolveCreate' | 'resolveUpdate' | 'resolveImmutable'>;
  readonly rootContext?: string;
}
function schemaDocument(value: unknown) {
  const document = normalizeRedboxCanonicalJsonV1(value);
  if (!document || typeof document !== 'object' || Array.isArray(document))
    throw new TypeError('Schema delivery requires a JSON object.');
  return document;
}

export interface SchemaReadRequest extends ReferenceRequest {
  readonly path: string;
}
function header(request: ReferenceRequest, key: string): string | undefined {
  const value = request.headers?.[key];
  return typeof value === 'string' ? value : undefined;
}
export function invalidSchemaRead(request: SchemaReadRequest): ReferenceResult {
  const body = buildRecordSchemaInvalidRequestProblem(request.path);
  return jsonResult(body, body.status, {
    'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
    Vary: RECORD_SCHEMA_RESPONSE_VARY,
    'Content-Type': RECORD_SCHEMA_PROBLEM_MEDIA_TYPE + '; charset=utf-8',
  });
}
async function resolve(
  input: RecordSchemaReadInput,
  request: SchemaReadRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  kind: 'create' | 'update' | 'immutable'
): Promise<ReferenceResult> {
  const problem = (body: ReturnType<typeof schemaProblem>) =>
    jsonResult(body, body.status, {
      'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
      Vary: RECORD_SCHEMA_RESPONSE_VARY,
      'Content-Type': RECORD_SCHEMA_PROBLEM_MEDIA_TYPE + '; charset=utf-8',
    });
  const instance = request.path;
  const validated = validateApiRouteRequest(request, contract);
  if (!validated.valid) {
    return problem(buildRecordSchemaInvalidRequestProblem(instance));
  }
  const { brand: snapshot, actor, portal } = request.context;
  if (!actor) {
    return problem(schemaProblem('authentication-required', instance));
  }
  const brand = Object.assign(new BrandingModel(), snapshot);
  const user = Object.assign(new UserModel(), actor, {
    roles: actor.roles.map(role => ({
      id: role.id,
      name: role.name ?? '',
      users: [],
      branding: Object.assign(new BrandingModel(), { id: role.brandId }),
    })),
  });
  const base = { brand: brand.id, branding: brand.name, portal, caller: { brand, user } };
  try {
    if (kind === 'immutable') {
      const result = await input.schemas.resolveImmutable({
        ...base,
        digest: validated.params.digest as string,
        ifNoneMatch: header(request, 'if-none-match'),
      });
      if (result.kind !== 'resolved' && result.kind !== 'not-modified') {
        return problem(immutableSchemaFailure(instance, result));
      }
      const etag = `"sha256:${result.artifact.digest}"` as const;
      const document = result.kind === 'not-modified' ? undefined : schemaDocument(result.artifact.document);
      return result.kind === 'not-modified'
        ? { kind: 'empty', status: 304, headers: schemaResponseHeaders(etag), body: undefined }
        : jsonResult(document, 200, {
            ...schemaResponseHeaders(etag),
            'Content-Type': RECORD_SCHEMA_RESPONSE_MEDIA_TYPE + '; charset=utf-8',
          });
    } else {
      const operation = typeof validated.query.operation === 'string' ? validated.query.operation.trim() : undefined;
      const result =
        kind === 'create'
          ? await input.schemas.resolveCreate({
              ...base,
              recordType: (validated.params.recordType as string).trim(),
              operation,
            })
          : await input.schemas.resolveUpdate({ ...base, oid: (validated.params.oid as string).trim(), operation });
      if (result.kind !== 'resolved' && result.kind !== 'partial') {
        const body =
          kind === 'create'
            ? createSchemaFailure(
                instance,
                result as Exclude<
                  Awaited<ReturnType<Schemas.RecordSchema['resolveCreate']>>,
                  { kind: 'resolved' | 'partial' }
                >
              )
            : updateSchemaFailure(instance, result);
        return problem(body);
      }
      const document = schemaDocument(result.document);
      const canonical = recordSchemaImmutableUrl(brand.name, portal, result.digest, input.rootContext);
      return header(request, 'if-none-match')?.trim() === result.metadata.etag
        ? {
            kind: 'empty',
            status: 304,
            headers: schemaResponseHeaders(result.metadata.etag, canonical),
            body: undefined,
          }
        : jsonResult(document, 200, {
            ...schemaResponseHeaders(result.metadata.etag, canonical),
            'Content-Type': RECORD_SCHEMA_RESPONSE_MEDIA_TYPE + '; charset=utf-8',
          });
    }
  } catch {
    return problem(schemaProblem('unavailable', instance));
  }
}
export const create = (
  input: RecordSchemaReadInput,
  request: SchemaReadRequest,
  contract: Pick<ApiRouteDefinition, 'request'>
) => resolve(input, request, contract, 'create');
export const update = (
  input: RecordSchemaReadInput,
  request: SchemaReadRequest,
  contract: Pick<ApiRouteDefinition, 'request'>
) => resolve(input, request, contract, 'update');
export const immutable = (
  input: RecordSchemaReadInput,
  request: SchemaReadRequest,
  contract: Pick<ApiRouteDefinition, 'request'>
) => resolve(input, request, contract, 'immutable');
