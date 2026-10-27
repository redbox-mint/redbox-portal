import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { RecordsService } from '../../RecordsService';
import type { DatastreamService } from '../../DatastreamService';
import { RECORD_SCHEMA_WRITE_PRECONDITION_HEADER } from '../../api-routes/schemas/common';
import Datastream from '../../Datastream';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { addDataStreamsRoute } from '../../api-routes/groups/records';
import { validateApiRouteFiles, validateApiRouteRequest } from '../../api-routes/validation';
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
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import { apiVersion, apiNoCacheHeaders, sendApiErrors } from './responses';
import { StreamingMultipart, MultipartError } from './multipart';
export const datastreamWriteRoutes = [addDataStreamsRoute];
export interface DatastreamWritesHttpInput {
  readonly records: Pick<
    RecordsService,
    'getMeta' | 'getDeletedRecordMeta' | 'hasViewAccess' | 'hasEditAccess' | 'updateMeta'
  >;
  readonly datastream: Pick<DatastreamService, 'addDatastreams'>;
  readonly multipart: StreamingMultipart;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
  readonly log: ILogger;
}
export function mountDatastreamWriteRoutes(router: Router, input: DatastreamWritesHttpInput): void {
  const route = addDataStreamsRoute;
  router.post(
    route.path,
    ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
    input.csrf.apiProtect,
    httpAction(async (req, res) => {
      try {
        const { actor, brand: snapshot, portal } = requestContext(req);
        if (!actor) {
          sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
          return;
        }
        if (!actor.roles.some(r => r.brandId === snapshot.id)) {
          sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
          return;
        }
        const validated = validateApiRouteRequest({ ...req, body: {} }, route);
        if (!validated.valid) {
          sendApiErrors(
            req,
            res,
            400,
            validated.issues.map(i => ({ title: i.path, detail: i.message }))
          );
          return;
        }
        const oid = String(validated.params.oid),
          brand = Object.assign(new BrandingModel(), snapshot);
        const user = {
          ...actor,
          roles: actor.roles.map(r => ({ id: r.id, name: r.name, branding: { id: r.brandId } })),
        };
        const parsed = parsePublicRecordConcurrencyRequest(req.headers, oid);
        if (!parsed.valid) {
          sendApiErrors(req, res, 400, [{ detail: parsed.code }]);
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
          if (!record || record.metaMetadata?.brandId !== snapshot.id)
            throw new MultipartError(404, 'Record not found');
          if (!input.records.hasEditAccess(brand, user, user.roles, record))
            throw new MultipartError(403, 'Access Denied');
          return record;
        };
        await permittedRecord();
        const response = await input.multipart.receive(req, async received => {
          if (received.files.some(f => f.field !== 'attachmentFields'))
            throw new MultipartError(400, 'Unexpected file field');
          const validation = validateApiRouteFiles(route, {
            attachmentFields: received.files.map(f => ({
              fd: f.key,
              filename: f.filename,
              type: f.mimeType,
              size: f.size,
            })),
          });
          if (!validation.valid) throw new MultipartError(400, 'Invalid datastream files');
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
        });
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
              sendApiErrors(req, res, 403, [{ code: 'not-authorised', detail: 'Not authorised.' }]);
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
                problem.kind === 'validation' &&
                problem.issues.some(issue => issue.code === 'record-schema.invalid-request')
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
          else sendApiErrors(req, res, 500, [{ detail }]);
          return;
        }
        res
          .set({ ...apiNoCacheHeaders, ...recordSaveResultHeaders(response.saved) })
          .json(
            apiVersion(req) === '2.0'
              ? { data: { message: response.result }, meta: { ...response.saved } }
              : { message: response.result }
          );
      } catch (error) {
        input.log.error('Datastream upload failed');
        if (!res.headersSent)
          sendApiErrors(req, res, error instanceof MultipartError ? error.status : 500, [
            {
              detail:
                error instanceof MultipartError
                  ? error.message
                  : 'Datastream upload failed. Review record and attachments before retrying.',
            },
          ]);
      }
    })
  );
}
