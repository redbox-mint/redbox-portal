import _ from 'lodash';
import { lastValueFrom, single } from 'rxjs';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { ApiRequestInput, ApiRouteDefinition } from '../../api-routes/types';
import { validateApiRouteRequest } from '../../api-routes/validation';
import { recordSchemaDescribedByLink, recordSchemaImmutableUrl } from '../../api-routes/record-schema-response';
import type { RecordsService } from '../../RecordsService';
import type { StorageService } from '../../StorageService';
import type { RecordTypes } from '../../recordTypes';
import type { Services as Workflow } from '../../workflows/WorkflowSteps';
import type { Services as Schema } from '../../recordSchema/RecordSchema';
import type { RecordModel } from '../../model/storage/RecordModel';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { hasViewAccess } from '../../records/access';
import { filterRelationshipGraph, relationshipOptions } from '../../records/relationships';
import { userFromActor } from '../actors';
import type { HttpRequestContext } from '../context';
import {
  apiNoCacheHeaders,
  safeApiVersion as apiVersion,
  safeValidationApiVersion as validationApiVersion,
} from '../apiResponses';
import {
  recordRepresentationConcurrency,
  parsePublicRecordConcurrencyRequest,
  recordSaveResultHeaders,
} from '../../RecordHttpConcurrency';
import {
  createRecordSaveContext,
  readSaveRequestId,
  normalizeRecordValidationRequestFacts,
  parsePublicValidationOperation,
  recordSaveFailureStatus,
  recordSaveDisplayErrors,
  recordSaveProblem,
  isRecordConflictStatus,
} from '../../RecordSaveResponse';

export interface RecordMetadataInput {
  readonly records: Pick<
    RecordsService,
    'getMeta' | 'getDeletedRecordMeta' | 'updateMeta' | 'hasViewAccess' | 'hasEditAccess'
  >;
  readonly storage: Pick<StorageService, 'getMeta' | 'getRelatedRecords'>;
  readonly recordTypes: Pick<RecordTypes, 'get'>;
  readonly workflows: Pick<Workflow.WorkflowSteps, 'get'>;
  readonly schemas: Pick<Schema.RecordSchema, 'resolveUpdate'>;
  readonly rootContext?: string;
  readonly log: Pick<ILogger, 'warn' | 'error'>;
}
export interface RecordActionResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}
export interface RecordActionRequest extends ApiRequestInput {
  readonly context: HttpRequestContext;
}
class RecordActionError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
const response = (
  body: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {}
): RecordActionResponse => ({ status, headers: { ...apiNoCacheHeaders, ...headers }, body });
function errorResponse(
  request: ApiRequestInput,
  status: number,
  errors: readonly { title?: string; detail?: string; code?: string }[],
  version = apiVersion(request)
) {
  const only = errors[0] ?? {};
  return response(
    version === '2.0'
      ? { errors, meta: {} }
      : {
          message:
            errors.length === 1
              ? only.title || only.detail || 'An error occurred'
              : errors.map(error => error.detail || error.title || 'An error occurred').join(' | '),
          details: errors.length === 1 && only.title && only.detail ? only.detail : '',
        },
    status
  );
}
function invalid(request: ApiRequestInput, issues: readonly { path: string; message: string }[]) {
  return errorResponse(
    request,
    400,
    issues.map(issue => ({ title: issue.path, detail: issue.message })),
    validationApiVersion(request)
  );
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RecordActionError(400, 'Invalid record body');
  return value as Record<string, unknown>;
}
function scalar(value: unknown, fallback = ''): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > 4096 || [...value].some(c => c.charCodeAt(0) < 32))
    throw new RecordActionError(400, 'Invalid record parameter');
  return value;
}

/** Shared action, extracted from the production Express metadata read. No host or response object. */
export async function readRecordMetadata(
  input: Pick<RecordMetadataInput, 'storage' | 'schemas' | 'rootContext' | 'log'>,
  request: RecordActionRequest,
  route: Pick<ApiRouteDefinition, 'request'>
): Promise<RecordActionResponse> {
  try {
    const valid = validateApiRouteRequest(request, route);
    if (!valid.valid) return invalid(request, valid.issues);
    const query = valid.query;
    const text = (name: string, fallback = '') => {
      const value = request.params?.[name] ?? query[name] ?? fallback;
      if (typeof value !== 'string' || [...value].some(c => c.charCodeAt(0) < 32))
        throw new RecordActionError(400, 'Invalid parameter: ' + name);
      return value;
    };
    const { brand: snapshot, actor, portal } = request.context;
    if (!actor) return errorResponse(request, 401, [{ detail: 'Authentication required' }]);
    const brand = Object.assign(new BrandingModel(), snapshot),
      user = userFromActor(actor);
    const oid = text('oid');
    const record = await input.storage.getMeta(oid);
    if (!record || _.isEmpty(record) || record.metaMetadata?.brandId !== brand.id)
      throw new RecordActionError(404, 'Record not found');
    const view = async (value: Record<string, unknown>) => hasViewAccess(brand, user, user.roles, value);
    if (!(await view(record as unknown as Record<string, unknown>))) throw new RecordActionError(403, 'Access Denied');
    const representation = recordRepresentationConcurrency(record);
    const headers: Record<string, string> = { ...representation.headers };
    let data: unknown = record.metadata;
    if (text('include').split(',').includes('relationships') || text('includeRelationships') === 'true') {
      for (const key of ['relationshipDepth', 'relationshipIds', 'recordTypes', 'fields'])
        if (query[key] !== undefined) text(key);
      if (query.relationshipDepth !== undefined) {
        const value = query.relationshipDepth;
        if (
          value !== '' &&
          ((typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) ||
            !Number.isSafeInteger(Number(value)) ||
            Number(value) < 0)
        )
          throw new RecordActionError(400, 'Invalid pagination parameter.');
      }
      const graph = await input.storage.getRelatedRecords(oid, brand, relationshipOptions(query));
      data = {
        metadata: data,
        relationships: await filterRelationshipGraph(brand, user, graph, async (_brand, _user, value) => view(value)),
      };
    }
    try {
      const schema = await input.schemas.resolveUpdate({
        brand: brand.id,
        branding: brand.name,
        portal,
        oid,
        caller: { brand, user },
      });
      if (schema.kind === 'resolved' || schema.kind === 'partial')
        headers.Link = recordSchemaDescribedByLink(
          recordSchemaImmutableUrl(brand.name, portal, schema.digest, input.rootContext)
        );
    } catch {
      input.log.warn('Record schema metadata-read discovery could not be resolved.');
    }
    return response(
      apiVersion(request) === '2.0' ? { data, meta: { oid, ...representation.metadata } } : data,
      200,
      headers
    );
  } catch (error) {
    const status = error instanceof RecordActionError ? error.status : 500;
    if (status === 500) input.log.error('Record read failed');
    return errorResponse(request, status, [
      { detail: error instanceof RecordActionError ? error.message : 'Record read failed.' },
    ]);
  }
}

/** Existing actor/brand-role precedence, shared with native pre-validation. */
export function recordMetadataActorPrelude(request: RecordActionRequest): RecordActionResponse | undefined {
  const { brand, actor } = request.context;
  if (!actor) return errorResponse(request, 401, [{ detail: 'Authentication required' }]);
  if (!actor.roles.some(role => role.brandId === brand.id))
    return errorResponse(request, 403, [{ detail: 'Access Denied' }]);
}

/** Shared production API update action; domain writes, projection and envelopes have one owner. */
export async function updateRecordMetadata(
  input: Omit<RecordMetadataInput, 'storage' | 'schemas'>,
  request: RecordActionRequest,
  route: Pick<ApiRouteDefinition, 'request'>
): Promise<RecordActionResponse> {
  try {
    const { brand: snapshot, actor, portal } = request.context;
    const refusal = recordMetadataActorPrelude(request);
    if (refusal) return refusal;
    const brand = Object.assign(new BrandingModel(), snapshot),
      user = userFromActor(actor!);
    let body = object(request.body ?? {});
    const valid = validateApiRouteRequest(request, route);
    if (!valid.valid) return invalid(request, valid.issues);
    if (valid.body !== undefined) body = object(valid.body);
    const query = valid.query,
      oid = scalar(request.params?.oid),
      targetStep = scalar(request.params?.targetStep ?? query.targetStep);
    const operation = parsePublicValidationOperation(query.operation);
    if (!operation.valid) throw new RecordActionError(400, 'record-validation-operation-invalid');
    const concurrency = parsePublicRecordConcurrencyRequest(request.headers ?? {}, oid, { formBacked: false });
    if (!concurrency.valid)
      return response(
        apiVersion(request) === '1.0'
          ? { message: 'Invalid record concurrency request.' }
          : { errors: [{ code: concurrency.code, source: { header: concurrency.header } }], meta: {} },
        400
      );
    const schemaIfMatch = request.headers?.['x-redbox-record-schema-if-match'];
    if (schemaIfMatch !== undefined && typeof schemaIfMatch !== 'string')
      throw new RecordActionError(400, 'record-schema.invalid-request');
    const context = createRecordSaveContext({
      requestId: readSaveRequestId(request.headers ?? {}),
      routeFamily: 'api',
      operation: targetStep ? 'transition' : 'update',
      portal,
      targetStep: targetStep || undefined,
      validationOperation: operation.value,
      recordSchemaIfMatch: schemaIfMatch,
      concurrency: concurrency.context,
      validationRequestParameters: normalizeRecordValidationRequestFacts(request.params ?? {}, query),
    });
    const load = async (id: string, deleted = false): Promise<RecordModel | null> => {
      const value = deleted ? await input.records.getDeletedRecordMeta(id, brand) : await input.records.getMeta(id);
      return value && String(value.metaMetadata?.brandId ?? '') === brand.id ? value : null;
    };
    const current = await load(oid);
    if (!current)
      throw new RecordActionError(400, `Failed to update meta, cannot find existing record with oid: ${oid}.`);
    if (
      !input.records.hasEditAccess(
        brand,
        user,
        user.roles.map(role => ({ ...role })),
        current
      )
    )
      throw new RecordActionError(403, 'Access Denied');
    const type = await lastValueFrom(input.recordTypes.get(brand, current.metaMetadata.type).pipe(single()));
    if (!type) throw new RecordActionError(400, 'Record Type provided is not valid');
    const nextStep = targetStep ? await lastValueFrom(input.workflows.get(type, targetStep).pipe(single())) : undefined;
    const result = await input.records.updateMeta(
      brand,
      oid,
      current,
      { ...user },
      true,
      true,
      nextStep,
      { metadata: body, mode: query.merge === true || query.merge === 'true' ? 'merge' : 'replace' },
      context
    );
    if (
      result.outcome === 'not-saved' &&
      result.problems.some(p => p.kind === 'conflict' || p.kind === 'authorization')
    ) {
      result.setProjectedMetadata(null);
      const latest = (await load(oid)) ?? (await load(oid, true));
      if (
        !latest ||
        !input.records.hasViewAccess(
          brand,
          user,
          user.roles.map(role => ({ ...role })),
          latest
        )
      ) {
        result.concurrency = undefined;
        return response(
          apiVersion(request) === '1.0'
            ? { message: 'Not authorised.' }
            : { errors: [{ code: 'not-authorised' }], meta: {} },
          403
        );
      }
      if (
        !input.records.hasEditAccess(
          brand,
          user,
          user.roles.map(role => ({ ...role })),
          latest
        )
      )
        result.problems = [
          recordSaveProblem(
            'authorization',
            'response',
            '@record-save-record-validation-edit-unauthorized',
            'record-validation-edit-unauthorized'
          ),
        ];
      result.setProjectedMetadata(latest.metadata);
      result.oid = oid;
      result.setConcurrencyMetadata({ ...result.concurrency, ...recordRepresentationConcurrency(latest).metadata });
    }
    const headers: Record<string, string> = { ...recordSaveResultHeaders(result) };
    if (result.schemaOutcome)
      headers.Link = recordSchemaDescribedByLink(
        recordSchemaImmutableUrl(brand.name, portal, result.schemaOutcome.digest, input.rootContext)
      );
    const v1 = apiVersion(request) === '1.0';
    if (!result.wasPersisted()) {
      const status = recordSaveFailureStatus(result);
      const schemaStatus =
        status === 412 ||
        result.problems.some(
          p => p.kind === 'validation' && p.issues.some(i => i.code === 'record-schema.invalid-request')
        );
      return response(
        v1
          ? { message: 'Update Metadata failed' }
          : { errors: recordSaveDisplayErrors(result, 'Record save failed'), meta: { ...result } },
        v1 && !isRecordConflictStatus(status) && !schemaStatus ? 500 : status,
        headers
      );
    }
    const legacy = {
      success: result.success,
      oid: result.oid,
      message: result.message,
      data: result.data,
      metadata: result.metadata,
      details: result.details,
      totalItems: result.totalItems,
      items: result.items,
      ...(result.workspaceOid ? { workspaceOid: result.workspaceOid } : {}),
      ...(result.workspaceData !== undefined ? { workspaceData: result.workspaceData } : {}),
    };
    return response(v1 ? legacy : { data: result, meta: { ...result } }, 200, headers);
  } catch (error) {
    if (!(error instanceof RecordActionError)) input.log.error('Record mutation failed');
    return errorResponse(request, error instanceof RecordActionError ? error.status : 500, [
      { detail: error instanceof RecordActionError ? error.message : 'Record mutation failed' },
    ]);
  }
}
