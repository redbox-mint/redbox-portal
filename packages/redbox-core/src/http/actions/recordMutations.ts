import { recordMetadataActorPrelude } from './recordMetadata';
import _ from 'lodash';
import type { ILogger, ReusableFormDefinitions } from '@researchdatabox/sails-ng-common';
import type { RecordsService, RecordMetadataSubmission } from '../../RecordsService';
import type { RecordTypes } from '../../recordTypes/RecordTypes';
import type { Services as Workflow } from '../../workflows/WorkflowSteps';
import type { Forms } from '../../forms/Forms';
import type { ContextVariables } from '../../forms/ContextVariables';
import { FormProjection } from '../../forms/FormProjection';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { userFromActor } from '../actors';
import type { RecordModel } from '../../model/storage/RecordModel';
import { RECORD_SCHEMA_WRITE_PRECONDITION_HEADER } from '../../api-routes/schemas/common';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { recordSchemaImmutableUrl, recordSchemaDescribedByLink } from '../../api-routes/record-schema-response';
import {
  parsePublicRecordConcurrencyRequest,
  recordSaveResultHeaders,
  recordRepresentationConcurrency,
} from '../../RecordHttpConcurrency';
import {
  createRecordSaveContext,
  readSaveRequestId,
  normalizeRecordValidationRequestFacts,
  parsePublicValidationOperation,
  recordSaveFailureStatus,
  isRecordConflictStatus,
  recordSaveDisplayErrors,
  recordSaveProblem,
  type RecordSaveResponse,
  type RecordSaveOperation,
} from '../../RecordSaveResponse';
import {
  referenceValue as singleHttpResult,
  jsonResult,
  referenceErrors,
  referenceValidationErrors,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';
import { safeApiVersion as apiVersion, apiNoCacheHeaders } from '../apiResponses';

export interface RecordMutationInput {
  readonly records: Pick<
    RecordsService,
    | 'create'
    | 'updateMeta'
    | 'delete'
    | 'restoreRecord'
    | 'destroyDeletedRecord'
    | 'getMeta'
    | 'getDeletedRecordMeta'
    | 'hasEditAccess'
    | 'hasViewAccess'
  >;
  readonly recordTypes: Pick<RecordTypes, 'get'>;
  readonly workflows: Pick<Workflow.WorkflowSteps, 'get'>;
  readonly forms: Pick<Forms, 'getFormByName' | 'buildClientFormConfig'>;
  readonly contextVariables: Pick<ContextVariables, 'evaluateContextVariables'>;
  readonly reusableFormDefinitions?: ReusableFormDefinitions;
  readonly returnMetadataOnSave?: boolean;
  readonly schemaEnabled: boolean;
  readonly rootContext?: string;
  /** Canonical public base URL, including the deployment root context. */
  readonly publicUrl?: string;
  readonly log: ILogger;
}
class RecordMutationError extends Error {
  public constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RecordMutationError(400, 'Invalid record body');
  return value as Record<string, unknown>;
}
function scalar(value: unknown, fallback = ''): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > 4096 || [...value].some(c => c.charCodeAt(0) < 32))
    throw new RecordMutationError(400, 'Invalid record parameter');
  return value;
}
function legacySaveBody(result: RecordSaveResponse): Record<string, unknown> {
  return {
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
}
export function recordMutationPrelude(req: ReferenceRequest): ReferenceResult | undefined {
  const refusal = recordMetadataActorPrelude(req);
  if (refusal) return refusal;
  object(req.body ?? {});
}
export function recordMutationFailure(
  input: { readonly log: Pick<ILogger, 'error'> },
  req: ReferenceRequest,
  error: unknown
): ReferenceResult {
  if (!(error instanceof RecordMutationError)) input.log.error('Record mutation failed');
  return referenceErrors(req, error instanceof RecordMutationError ? error.status : 500, [
    { detail: error instanceof RecordMutationError ? error.message : 'Record mutation failed' },
  ]);
}
function requestHeader(req: ReferenceRequest, name: string): string | undefined {
  const value = req.headers?.[name.toLowerCase()];
  return typeof value === 'string' ? value : undefined;
}

/** The application save pipeline owns persistence, revisions, hooks, indexing and jobs. */
async function mutate(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  action: string,
  browser: boolean
): Promise<ReferenceResult> {
  const projection = new FormProjection(input.log);
  const { brand: snapshot, actor, portal } = req.context;
  const refusal = recordMutationPrelude(req);
  if (refusal) return refusal;
  const brand = Object.assign(new BrandingModel(), snapshot);
  const user = userFromActor(actor!);
  let body = object(req.body ?? {});
  let query: Record<string, unknown> = req.query;
  if (contract.request) {
    const valid = validateApiRouteRequest(req, contract);
    if (!valid.valid) {
      return referenceValidationErrors(req, valid.issues);
    }
    if (valid.body !== undefined) body = object(valid.body);
    query = valid.query;
  }
  // Browser token is a transport field, never persisted as metadata.
  if (browser) body = Object.fromEntries(Object.entries(body).filter(([key]) => key !== '_csrf'));
  const oid = scalar(req.params.oid);
  const targetStep = scalar(
    req.params.targetStep ?? query.targetStep ?? (action === 'create' && !browser ? body.workflowStage : undefined)
  );
  const operation = parsePublicValidationOperation(query.operation);
  if (!operation.valid) throw new RecordMutationError(400, 'record-validation-operation-invalid');
  const permanent = !browser && query.permanent === 'true';
  const saveOperation: RecordSaveOperation =
    action === 'create'
      ? targetStep
        ? 'transition'
        : 'create'
      : action === 'transitionWorkflow' || targetStep
        ? 'transition'
        : action === 'deleteRecord'
          ? permanent
            ? 'purge'
            : 'delete'
          : action === 'restoreRecord'
            ? 'restore'
            : action === 'destroyDeletedRecord'
              ? 'purge'
              : 'update';
  const concurrency = parsePublicRecordConcurrencyRequest(req.headers, action === 'create' ? undefined : oid, {
    formBacked: browser && ['create', 'updateMeta', 'transitionWorkflow'].includes(action),
  });
  if (!concurrency.valid) {
    return jsonResult(
      apiVersion(req) === '1.0'
        ? { message: 'Invalid record concurrency request.' }
        : { errors: [{ code: concurrency.code, source: { header: concurrency.header } }], meta: {} },
      400,
      { ...apiNoCacheHeaders }
    );
  }
  const schemaIfMatch = req.headers?.[RECORD_SCHEMA_WRITE_PRECONDITION_HEADER.toLowerCase()];
  if (schemaIfMatch !== undefined && typeof schemaIfMatch !== 'string')
    throw new RecordMutationError(400, 'record-schema.invalid-request');
  const context = createRecordSaveContext({
    requestId: readSaveRequestId(req.headers),
    routeFamily: browser ? 'browser' : 'api',
    operation: saveOperation,
    portal,
    targetStep: targetStep || undefined,
    validationOperation: operation.value,
    recordSchemaIfMatch: schemaIfMatch,
    concurrency: concurrency.context,
    validationRequestParameters: normalizeRecordValidationRequestFacts(req.params, query),
  });
  const load = async (id: string, deleted = false): Promise<RecordModel | null> => {
    const record = deleted ? await input.records.getDeletedRecordMeta(id, brand) : await input.records.getMeta(id);
    return record && String(record.metaMetadata?.brandId ?? '') === brand.id ? record : null;
  };
  const browserMetadata = async (record: RecordModel): Promise<Record<string, unknown> | null> => {
    if (!record.metaMetadata.form) return null;
    const edit = input.records.hasEditAccess(
      brand,
      user,
      user.roles.map(r => ({ ...r })),
      record
    );
    const mode = edit ? 'edit' : 'view';
    const form = await singleHttpResult(input.forms.getFormByName(record.metaMetadata.form, edit, brand.id));
    if (!form?.configuration) return null;
    const client = await input.forms.buildClientFormConfig(
      form.configuration,
      mode,
      user.roles.map(r => r.name).filter(Boolean),
      record.metadata,
      input.reusableFormDefinitions,
      brand.name,
      input.contextVariables.evaluateContextVariables(
        {
          user,
          session: req.session,
          headers: req.headers,
          param: name => req.params[name] ?? req.query[name],
          get: name => requestHeader(req, name),
        },
        record
      ),
      { user, brand }
    );
    return projection.projectMetadataClientFormConfig(record.metadata, client, mode, input.reusableFormDefinitions);
  };
  let current: RecordModel | null = null;
  const lifecycle = ['deleteRecord', 'restoreRecord', 'destroyDeletedRecord'].includes(action);
  const permission = /^(add|remove)(User|Role)(View|Edit)$/.test(action);
  let result: RecordSaveResponse;
  if (action === 'create') {
    const type = await singleHttpResult(input.recordTypes.get(brand, scalar(req.params.recordType)));
    if (!type) throw new RecordMutationError(400, 'Record Type provided is not valid');
    const raw = _.cloneDeep(browser ? body : body.metadata == null ? body : object(body.metadata));
    if (!browser && body.metadata == null && !input.schemaEnabled) raw.authorization = [];
    // Raw v5 metadata may contain an empty authorization field; only
    // an object ACL (or an explicit metadata envelope) supplies permissions.
    const legacyAuthorization =
      body.metadata == null && Array.isArray(body.authorization) && body.authorization.length === 0;
    const authorization =
      !browser && body.authorization != null && !legacyAuthorization
        ? object(body.authorization)
        : { edit: [user.username], view: [user.username] };
    result = await input.records.create(
      brand,
      { metadata: raw, authorization },
      type,
      { ...user },
      true,
      true,
      targetStep || undefined,
      context
    );
  } else {
    current = await load(oid, action === 'restoreRecord' || action === 'destroyDeletedRecord');
    if (!current)
      throw new RecordMutationError(
        !browser && action === 'updateMeta' ? 400 : 404,
        !browser && action === 'updateMeta'
          ? `Failed to update meta, cannot find existing record with oid: ${oid}.`
          : 'Record not found'
      );
    if (
      !input.records.hasEditAccess(
        brand,
        user,
        user.roles.map(role => ({ ...role })),
        current
      )
    )
      throw new RecordMutationError(403, 'Access Denied');
    const type = await singleHttpResult(input.recordTypes.get(brand, current.metaMetadata.type));
    if (!type) throw new RecordMutationError(400, 'Record Type provided is not valid');
    if (action === 'deleteRecord')
      result = await input.records.delete(oid, permanent, current, type, { ...user }, context);
    else if (action === 'restoreRecord') result = await input.records.restoreRecord(oid, { ...user }, brand, context);
    else if (action === 'destroyDeletedRecord')
      result = await input.records.destroyDeletedRecord(oid, { ...user }, brand, context);
    else {
      let submission: RecordMetadataSubmission | undefined;
      if (permission) {
        const field = /Edit$/.test(action) ? 'edit' : 'view';
        const roles = action.includes('Role');
        const change = (key: string, value: unknown) => {
          if (value === undefined) return;
          if (!Array.isArray(value) || value.length > 1000 || value.some(v => typeof v !== 'string' || !v.trim()))
            throw new RecordMutationError(400, 'Invalid permission subjects');
          const authorization = current!.authorization as unknown as Record<string, unknown>;
          const existing = authorization[key];
          authorization[key] = action.startsWith('add')
            ? _.union(Array.isArray(existing) ? existing : [], value)
            : _.difference(Array.isArray(existing) ? existing : [], value);
        };
        change(roles ? field + 'Roles' : field, body[roles ? 'roles' : 'users']);
        if (!roles) change(field + 'Pending', body.pendingUsers);
      } else if (action === 'updateObjectMeta') current.metaMetadata = body as unknown as RecordModel['metaMetadata'];
      else if (action !== 'transitionWorkflow' || browser)
        submission = {
          metadata: body,
          mode: query.merge === true || query.merge === 'true' ? 'merge' : 'replace',
          ...(browser ? { arrayMergeMode: 'replace' as const } : {}),
        };
      const nextStep = targetStep ? await singleHttpResult(input.workflows.get(type, targetStep)) : undefined;
      result = await input.records.updateMeta(
        brand,
        oid,
        current,
        { ...user },
        true,
        true,
        nextStep,
        submission,
        context
      );
    }
  }
  // Re-project certified refusals from current authority before returning state to a racing caller.
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
      return jsonResult(
        apiVersion(req) === '1.0' ? { message: 'Not authorised.' } : { errors: [{ code: 'not-authorised' }], meta: {} },
        403,
        { ...apiNoCacheHeaders }
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
    if (browser) {
      try {
        result.setProjectedMetadata(await browserMetadata(latest));
      } catch {
        input.log.error('Failed to project current record metadata');
      }
    } else result.setProjectedMetadata(latest.metadata);
    result.oid = oid;
    result.setConcurrencyMetadata({
      ...result.concurrency,
      ...recordRepresentationConcurrency(latest).metadata,
    });
  }
  const headers = { ...recordSaveResultHeaders(result) } as Record<string, string>;
  if (result.schemaOutcome)
    headers.Link = recordSchemaDescribedByLink(
      recordSchemaImmutableUrl(brand.name, portal, result.schemaOutcome.digest, input.rootContext)
    );
  const v1 = apiVersion(req) === '1.0';
  if (!result.wasPersisted()) {
    const status = recordSaveFailureStatus(result);
    const schemaStatus =
      status === 412 ||
      result.problems.some(
        p => p.kind === 'validation' && p.issues.some(i => i.code === 'record-schema.invalid-request')
      );
    // Legacy transition refusal keeps its historical 200, except explicit concurrency/schema failures.
    if (!browser && action === 'transitionWorkflow' && v1 && !isRecordConflictStatus(status) && !schemaStatus) {
      return jsonResult(legacySaveBody(result), 200, { ...apiNoCacheHeaders, ...headers });
    }
    return jsonResult(
      v1
        ? action === 'transitionWorkflow'
          ? legacySaveBody(result)
          : {
              message: browser
                ? action === 'create'
                  ? result.message
                  : action === 'transitionWorkflow'
                    ? 'Error updating meta'
                    : 'Failed to get record data'
                : permission
                  ? `Failed to update record with oid ${oid}.`
                  : action === 'updateMeta'
                    ? 'Update Metadata failed'
                    : action === 'updateObjectMeta'
                      ? 'Update Object Metadata failed'
                      : 'Record save failed',
            }
        : { errors: recordSaveDisplayErrors(result, 'Record save failed'), meta: { ...result } },
      v1 && !isRecordConflictStatus(status) && !schemaStatus ? 500 : status,
      { ...apiNoCacheHeaders, ...headers }
    );
  }
  let data: unknown = lifecycle ? (result.data ?? result) : result;
  let legacy: unknown = legacySaveBody(result);
  if (permission) {
    const saved = await load(result.oid);
    data =
      saved &&
      input.records.hasViewAccess(
        brand,
        user,
        user.roles.map(role => ({ ...role })),
        saved
      )
        ? saved.authorization
        : null;
    legacy = data;
  } else if (browser && action !== 'transitionWorkflow' && !lifecycle) {
    data = null;
    try {
      const saved = await load(result.oid);
      data = saved;
      if (saved && !targetStep && input.returnMetadataOnSave !== false && saved.metaMetadata.form)
        result.setProjectedMetadata(await browserMetadata(saved));
    } catch {
      result.setProjectedMetadata(null);
      result.addProblem(
        recordSaveProblem('system', 'response', '@record-save-response-projection-failed', 'response-projection-failed')
      );
      input.log.error('Failed to project post-save record metadata');
    }
    legacy = legacySaveBody(result);
  }
  const status = action === 'create' && !browser ? 201 : 200;
  if (status === 201)
    headers.Location =
      (input.publicUrl?.replace(/\/$/, '') ??
        req.protocol + '://' + requestHeader(req, 'host') + (input.rootContext ?? '')) +
      '/' +
      brand.name +
      '/' +
      portal +
      '/api/records/metadata/' +
      encodeURIComponent(result.oid);
  return jsonResult(v1 ? legacy : { data, meta: { ...result } }, status, { ...apiNoCacheHeaders, ...headers });
}
export function create(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'create', browser);
}
export function updateObjectMeta(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'updateObjectMeta', browser);
}
export function deleteRecord(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'deleteRecord', browser);
}
export function restoreRecord(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'restoreRecord', browser);
}
export function destroyDeletedRecord(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'destroyDeletedRecord', browser);
}
export function transitionWorkflow(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'transitionWorkflow', browser);
}
export function addUserEdit(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'addUserEdit', browser);
}
export function removeUserEdit(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'removeUserEdit', browser);
}
export function addUserView(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'addUserView', browser);
}
export function removeUserView(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'removeUserView', browser);
}
export function addRoleEdit(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'addRoleEdit', browser);
}
export function removeRoleEdit(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'removeRoleEdit', browser);
}
export function addRoleView(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'addRoleView', browser);
}
export function removeRoleView(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  browser = false
) {
  return mutate(input, req, contract, 'removeRoleView', browser);
}
export function update(
  input: RecordMutationInput,
  req: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>
) {
  return mutate(input, req, contract, 'updateMeta', true);
}
