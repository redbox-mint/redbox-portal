import { resolvedRequestContract } from '../../fastify/validation';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { RecordController, recordController, type RecordControllerInput } from './RecordController';
import { requestContext } from '../../context';
import { defineController } from '../../controllers';
import {
  datastreamUploadActorPrelude,
  prepareDatastreamUpload,
  executePreparedDatastreamUpload,
  rejectDatastreamUpload,
  type DatastreamUploadInput,
} from '../../actions/datastreamUpload';
import { getRequestValue } from '../../../api-routes/request-extraction';
import { validatedDatastreamUpload } from '../../fastify/datastreamUploads';
import { nativeJsonOutput } from '../../fastify/jsonOutput';
import { httpReplySubmitted } from '../../fastify/errorBoundary';
import type { StreamingMultipart } from '../../integrations/multipart';
export interface DatastreamControllerInput extends RecordControllerInput {
  readonly datastream: DatastreamUploadInput['datastream'];
  readonly multipart: StreamingMultipart;
}
export class DatastreamController extends RecordController {
  constructor(private readonly uploads: DatastreamControllerInput) {
    super(uploads);
  }
  async addDataStreams(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const upload = validatedDatastreamUpload(request);
    const req = {
        params: request.params as Record<string, unknown>,
        query: request.query as Record<string, unknown>,
        body: request.body,
        headers: request.headers,
        context: () => requestContext(request),
      },
      res = nativeJsonOutput(reply);
    try {
      const identity = datastreamUploadActorPrelude(req, res);
      if (!identity) return;
      // The host already ran each declaration extractor/validator once over
      // complete staging. Re-read domain inputs after hooks, without rerunning
      // those declaration callbacks or retaining a pre-hook prepared request.
      const route = resolvedRequestContract(request);
      const prepared = await prepareDatastreamUpload(this.uploads, req, res, identity, {
        params: { oid: getRequestValue(req, route.request, 'params', 'oid') },
      });
      if (!prepared) return;
      await executePreparedDatastreamUpload(this.uploads, req, res, prepared, async consume => {
        try {
          return await consume(upload.received);
        } finally {
          await upload.close();
        }
      });
    } catch (error) {
      rejectDatastreamUpload(this.uploads, req, res, error);
    } finally {
      try {
        await upload.close();
      } catch (error) {
        if (!httpReplySubmitted(reply)) rejectDatastreamUpload(this.uploads, req, res, error);
      }
    }
  }
}
export const datastreamController = defineController({
  name: recordController.name,
  requires: ['portal-raw-http'],
  actions: ['getMeta', 'updateMeta', 'addDataStreams'],
  create: (input: DatastreamControllerInput) => new DatastreamController(input),
});
