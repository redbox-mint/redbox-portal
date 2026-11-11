import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { RecordsService } from '../../RecordsService';
import type { DatastreamService } from '../../DatastreamService';
import { RECORD_SCHEMA_WRITE_PRECONDITION_HEADER } from '../../api-routes/schemas/common';
import Datastream from '../../Datastream';
import { BrandingModel } from '../../model/storage/BrandingModel';
import type { ApiRouteDefinition } from '../../api-routes/types';
import {
  validateApiRequest,
  validateApiRouteRequest,
  type ValidatedApiRouteRequest,
} from '../../api-routes/validation';
import {
  parsePublicRecordConcurrencyRequest,
  recordRepresentationConcurrency,
  recordSaveResultHeaders,
} from '../../RecordHttpConcurrency';
import {
  createRecordSaveContext,
  isRecordConflictStatus,
  readSaveRequestId,
  recordSaveDisplayErrors,
  recordSaveFailureStatus,
  recordSaveProblem,
} from '../../RecordSaveResponse';
import { MultipartError, type MultipartResult } from '../express/multipart';
import { apiVersion, apiNoCacheHeaders } from '../apiResponses';
import { actionApiErrors, type ActionReply, type ActionRequest } from './actionReply';
export interface DatastreamUploadInput {
  readonly records: Pick<
    RecordsService,
    'getMeta' | 'getDeletedRecordMeta' | 'hasViewAccess' | 'hasEditAccess' | 'updateMeta'
  >;
  readonly datastream: Pick<DatastreamService, 'addDatastreams'>;
  readonly log: Pick<ILogger, 'error'>;
}
/** Shared guards and domain operations. Native transport owns when these run. */
export function datastreamUploadActorPrelude(req: ActionRequest, res: ActionReply) {
  const { actor, brand: snapshot, portal } = req.context();
  if (!actor) {
    actionApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
    return;
  }
  if (!actor.roles.some(r => r.brandId === snapshot.id)) {
    actionApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
    return;
  }
  return { actor, snapshot, portal };
}
export function datastreamUploadPreludeContract(route: Pick<ApiRouteDefinition, 'request'>) {
  const request = route.request;
  return {
    request: request && {
      params: request.params,
      query: request.query,
      headers: request.headers,
      queryExtractor: request.queryExtractor,
      legacyParamFallbacks: request.legacyParamFallbacks,
    },
  };
}
export async function prepareDatastreamUpload(
  input: DatastreamUploadInput,
  req: ActionRequest,
  res: ActionReply,
  identity: NonNullable<ReturnType<typeof datastreamUploadActorPrelude>>,
  validated: ValidatedApiRouteRequest
) {
  const { actor, snapshot, portal } = identity;
  const oid = String(validated.params.oid),
    brand = Object.assign(new BrandingModel(), snapshot);
  const user = {
    ...actor,
    roles: actor.roles.map(r => ({ id: r.id, name: r.name, branding: { id: r.brandId } })),
  };
  const parsed = parsePublicRecordConcurrencyRequest(req.headers, oid);
  if (!parsed.valid) {
    actionApiErrors(req, res, 400, [{ detail: parsed.code }]);
    return;
  }
  const schemaIfMatch = req.headers[RECORD_SCHEMA_WRITE_PRECONDITION_HEADER.toLowerCase()];
  if (schemaIfMatch !== undefined && typeof schemaIfMatch !== 'string')
    throw new MultipartError(400, 'Invalid schema precondition');
  const context = createRecordSaveContext({
    recordSchemaIfMatch: schemaIfMatch,
    requestId: readSaveRequestId(req.headers),
    routeFamily: 'api',
    operation: 'update',
    portal,
    concurrency: parsed.context,
  });
  const permittedRecord = async () => {
    const record = await input.records.getMeta(oid);
    if (!record || record.metaMetadata?.brandId !== snapshot.id) throw new MultipartError(404, 'Record not found');
    if (!input.records.hasEditAccess(brand, user, user.roles, record)) throw new MultipartError(403, 'Access Denied');
    return record;
  };
  await permittedRecord();
  return { ...identity, validated, oid, brand, user, context, permittedRecord };
}
export type PreparedDatastreamUpload = NonNullable<Awaited<ReturnType<typeof prepareDatastreamUpload>>>;

/** Complete multipart fields and metadata only; callers own staging and cleanup. */
export function validateDatastreamUploadBody(
  req: ActionRequest,
  route: Pick<ApiRouteDefinition, 'request'>,
  received: MultipartResult
): void {
  // receive joins all staging writes before this callback. Extract once
  // from the complete multipart fields and metadata, then validate only
  // body/files once. Rejections remain inside receive's staging cleanup.
  const filesByField: Record<string, unknown[]> = Object.create(null);
  for (const f of received.files)
    (filesByField[f.field] ??= []).push({
      fd: f.key,
      filename: f.filename,
      type: f.mimeType,
      size: f.size,
    });
  const complete = { ...req, body: received.fields, files: filesByField };
  const body = route.request?.extractor ? route.request.extractor(complete) : received.fields;
  const validation = validateApiRequest(
    { ...complete, body },
    route.request && {
      body: route.request.body,
      files: route.request.files,
      legacyParamFallbacks: route.request.legacyParamFallbacks,
    },
    { files: filesByField }
  );
  if (
    validation.issues.some(
      issue => issue.path === 'body' || issue.path.startsWith('body.') || issue.path.startsWith('body[')
    )
  )
    throw new MultipartError(400, 'Invalid multipart fields');
  if (route.request?.files && received.files.some(f => !Object.hasOwn(route.request!.files!, f.field)))
    throw new MultipartError(400, 'Unexpected file field');
  if (!validation.valid) throw new MultipartError(400, 'Invalid datastream files');
}
async function writeDatastreamUpload(
  input: DatastreamUploadInput,
  prepared: PreparedDatastreamUpload,
  received: MultipartResult
) {
  const { actor, oid, brand, user, context, permittedRecord } = prepared;
  const record = await permittedRecord();
  const saved = await input.records.updateMeta(
    brand,
    oid,
    record,
    user,
    false,
    false,
    {},
    { metadata: {}, mode: 'merge' },
    context
  );
  if (!saved.wasPersisted()) return { failure: saved };
  const files = received.files.map(
    f =>
      new Datastream({
        fileId: f.key,
        name: f.filename,
        mimeType: f.mimeType,
        size: f.size,
        uploadedBy: actor.username,
      })
  );
  try {
    const result = await input.datastream.addDatastreams(oid, files);
    if (!result.isSuccessful()) throw new Error('Datastream finalization failed');
    Object.assign(result, { fileIds: files });
    return { saved, result };
  } catch {
    input.log.error('Datastream finalization failed');
    saved.addProblem({
      kind: 'processing',
      phase: 'attachments',
      issues: [{ code: 'datastream-finalization-failed', message: '@datastream-finalization-failed' }],
    });
    return { saved, finalizationFailed: true };
  }
}
type UploadResponse = Awaited<ReturnType<typeof writeDatastreamUpload>>;
async function respondDatastreamUpload(
  input: DatastreamUploadInput,
  req: ActionRequest,
  res: ActionReply,
  prepared: PreparedDatastreamUpload,
  response: UploadResponse
): Promise<void> {
  const { oid, snapshot, brand, user } = prepared;
  if (response.failure) {
    const failure = response.failure;
    // A certified non-write can expose only a freshly authorized snapshot,
    // never the candidate carried back by a losing save.
    if (
      failure.outcome === 'not-saved' &&
      failure.problems.some(problem => problem.kind === 'conflict' || problem.kind === 'authorization')
    ) {
      failure.setProjectedMetadata(null);
      const active = await input.records.getMeta(oid);
      let latest = active?.metaMetadata?.brandId === snapshot.id ? active : null;
      if (!latest)
        try {
          const deleted = await input.records.getDeletedRecordMeta(oid, brand);
          if (deleted?.metaMetadata?.brandId === snapshot.id) latest = deleted;
        } catch {
          /* Missing/deleted objects remain private on a failed recovery read. */
        }
      if (!latest || !input.records.hasViewAccess(brand, user, user.roles, latest)) {
        actionApiErrors(req, res, 403, [{ code: 'not-authorised', detail: 'Not authorised.' }]);
        return;
      }
      if (!input.records.hasEditAccess(brand, user, user.roles, latest))
        failure.problems = [
          recordSaveProblem(
            'authorization',
            'response',
            '@record-save-record-validation-edit-unauthorized',
            'record-validation-edit-unauthorized'
          ),
        ];
      failure.setProjectedMetadata(latest.metadata);
      failure.setConcurrencyMetadata({
        ...failure.concurrency,
        ...recordRepresentationConcurrency(latest).metadata,
      });
    }
    const detail = 'Error sending datastreams upstream.';
    const status = recordSaveFailureStatus(failure);
    res.set(apiNoCacheHeaders).set(recordSaveResultHeaders(failure));
    if (apiVersion(req) === '2.0')
      res.status(status).json({ errors: recordSaveDisplayErrors(failure, detail), meta: { ...failure } });
    else {
      const schemaMalformed = failure.problems.some(
        problem =>
          problem.kind === 'validation' && problem.issues.some(issue => issue.code === 'record-schema.invalid-request')
      );
      res.status(status === 412 || isRecordConflictStatus(status) ? status : schemaMalformed ? 400 : 500).json({
        message: detail,
      });
    }
    return;
  }
  if (response.finalizationFailed) {
    const detail = 'Attachment finalization failed. Review current attachments before retrying.';
    res.set(recordSaveResultHeaders(response.saved));
    if (apiVersion(req) === '2.0')
      res
        .set(apiNoCacheHeaders)
        .status(500)
        .json({ errors: [{ detail }], meta: { ...response.saved } });
    else actionApiErrors(req, res, 500, [{ detail }]);
    return;
  }
  res
    .set({ ...apiNoCacheHeaders, ...recordSaveResultHeaders(response.saved) })
    .json(
      apiVersion(req) === '2.0'
        ? { data: { message: response.result }, meta: { ...response.saved } }
        : { message: response.result }
    );
}
export function rejectDatastreamUpload(
  input: Pick<DatastreamUploadInput, 'log'>,
  req: ActionRequest,
  res: ActionReply,
  error: unknown
): void {
  input.log.error('Datastream upload failed');
  if (!res.headersSent)
    actionApiErrors(req, res, error instanceof MultipartError ? error.status : 500, [
      {
        detail:
          error instanceof MultipartError
            ? error.message
            : 'Datastream upload failed. Review record and attachments before retrying.',
      },
    ]);
}
/** No route validation or parsing lives in the replaceable native action. */
export async function executePreparedDatastreamUpload(
  input: DatastreamUploadInput,
  req: ActionRequest,
  res: ActionReply,
  prepared: PreparedDatastreamUpload,
  receive: <T>(consume: (result: MultipartResult) => Promise<T>) => Promise<T>
): Promise<void> {
  try {
    const response = await receive(received => writeDatastreamUpload(input, prepared, received));
    await respondDatastreamUpload(input, req, res, prepared, response);
  } catch (error) {
    rejectDatastreamUpload(input, req, res, error);
  }
}
/** Express keeps its original transport ordering around the same shared logic. */
export async function executeDatastreamUpload(
  input: DatastreamUploadInput,
  req: ActionRequest,
  res: ActionReply,
  route: Pick<ApiRouteDefinition, 'request'>,
  receive: <T>(consume: (result: MultipartResult) => Promise<T>) => Promise<T>
): Promise<void> {
  try {
    const identity = datastreamUploadActorPrelude(req, res);
    if (!identity) return;
    const validated = validateApiRouteRequest(req, datastreamUploadPreludeContract(route));
    if (!validated.valid) {
      actionApiErrors(
        req,
        res,
        400,
        validated.issues.map(i => ({ title: i.path, detail: i.message }))
      );
      return;
    }
    const prepared = await prepareDatastreamUpload(input, req, res, identity, validated);
    if (!prepared) return;
    await executePreparedDatastreamUpload(input, req, res, prepared, consume =>
      receive(async received => {
        validateDatastreamUploadBody(req, route, received);
        return consume(received);
      })
    );
  } catch (error) {
    rejectDatastreamUpload(input, req, res, error);
  }
}
