import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { RecordsService } from '../../RecordsService';
import type { DatastreamService } from '../../DatastreamService';
import { RECORD_SCHEMA_WRITE_PRECONDITION_HEADER } from '../../api-routes/schemas/common';
import Datastream from '../../Datastream';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { addDataStreamsRoute } from '../../api-routes/groups/records';
import { validateApiRouteFiles, validateApiRouteRequest } from '../../api-routes/validation';
import { parsePublicRecordConcurrencyRequest, recordSaveResultHeaders } from '../../RecordHttpConcurrency';
import { createRecordSaveContext, readSaveRequestId, recordSaveFailureStatus } from '../../RecordSaveResponse';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import { apiVersion, apiNoCacheHeaders, sendApiErrors } from './responses';
import { StreamingMultipart, MultipartError } from './multipart';
export const datastreamWriteRoutes = [addDataStreamsRoute];
export interface DatastreamWritesHttpInput {
  readonly records: Pick<RecordsService, 'getMeta' | 'hasEditAccess' | 'updateMeta'>;
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
          const result = await input.datastream.addDatastreams(oid, files);
          Object.assign(result, { fileIds: files });
          if (!result.isSuccessful()) {
            result.message = 'Attachment finalization failed. Review current attachments before retrying.';
            saved.addProblem({
              kind: 'processing',
              phase: 'attachments',
              issues: [{ code: 'datastream-finalization-failed', message: '@datastream-finalization-failed' }],
            });
          }
          return { saved, result };
        });
        if (response.failure) {
          sendApiErrors(req, res, recordSaveFailureStatus(response.failure), [{ detail: response.failure.message }]);
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
