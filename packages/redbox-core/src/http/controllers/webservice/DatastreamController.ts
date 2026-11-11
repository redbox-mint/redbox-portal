import type { FastifyRequest, FastifyReply } from 'fastify';
import { RecordController, recordController, type RecordControllerInput } from './RecordController';
import { requestContext } from '../../context';
import { defineController } from '../../controllers';
import { executePreparedDatastreamUpload, type DatastreamUploadInput } from '../../actions/datastreamUpload';
import { validatedDatastreamUpload } from '../../fastify/datastreamUploads';
import { nativeActionReply } from '../../fastify/actionReply';
import type { StreamingMultipart } from '../../express/multipart';
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
    return executePreparedDatastreamUpload(
      this.uploads,
      {
        params: request.params as Record<string, unknown>,
        query: request.query as Record<string, unknown>,
        headers: request.headers,
        context: () => requestContext(request),
      },
      nativeActionReply(reply),
      upload.prepared,
      async consume => {
        try {
          return await consume(upload.received);
        } finally {
          await upload.close();
        }
      }
    );
  }
}
export const datastreamController = defineController({
  name: recordController.name,
  requires: ['portal-raw-http'],
  actions: ['getMeta', 'updateMeta', 'addDataStreams'],
  create: (input: DatastreamControllerInput) => new DatastreamController(input),
});
