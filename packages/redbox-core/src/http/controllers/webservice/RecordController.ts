import type { FastifyReply, FastifyRequest } from 'fastify';
import { requestContext } from '../../context';
import { defineController } from '../../controllers';
import {
  readRecordMetadata,
  recordMetadataActorPrelude,
  updateRecordMetadata,
  type RecordMetadataInput,
  type RecordActionResponse,
} from '../../actions/recordMetadata';
import { sendApiErrors } from '../../fastify/responses';
import { resolvedRequestContract } from '../../fastify/validation';

/** Selected production domain ports. Constructors borrow; they acquire nothing. */
export interface RecordControllerInput extends RecordMetadataInput {}
type MetadataRequest = FastifyRequest<{ Params: { oid: string }; Querystring: Record<string, unknown> }>;
const fresh: (request: Record<string, unknown>, response: Record<string, unknown>) => boolean = require('fresh');

/** Express res.json applies HTTP freshness and HEAD handling after the action.
 * Apply the same fresh@2 semantics; no domain option or envelope lives here. */
function send(request: MetadataRequest, reply: FastifyReply, result: RecordActionResponse) {
  reply.headers(result.headers).code(result.status);
  // Express serializes before freshness and HEAD handling, within its action guard.
  // Send those exact bytes so a stateful toJSON is never evaluated a second time.
  const json = JSON.stringify(result.body);
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    result.status >= 200 &&
    result.status < 300 &&
    fresh(
      request.headers,
      Object.fromEntries(Object.entries(result.headers).map(([name, value]) => [name.toLowerCase(), value]))
    )
  ) {
    reply.removeHeader('Content-Type').removeHeader('Content-Length').removeHeader('Transfer-Encoding');
    return reply.code(304).send();
  }
  return reply.type('application/json; charset=utf-8').send(json === undefined ? undefined : Buffer.from(json));
}
/** Existing validation position: policies and CSRF precede the envelope check. */
export function recordMetadataBodyPrelude(request: FastifyRequest, reply: FastifyReply) {
  const refusal = recordMetadataActorPrelude({
    headers: request.headers,
    query: request.query as Record<string, unknown>,
    context: requestContext(request),
  });
  if (refusal) return send(request as MetadataRequest, reply, refusal);
  const body = request.body ?? {};
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return sendApiErrors(request, reply, 400, [{ detail: 'Invalid record body' }]);
}
/** Only native request/response adaptation. Both hosts execute the same actions. */
export class RecordController {
  constructor(protected readonly input: RecordControllerInput) {}
  private async execute(request: MetadataRequest, reply: FastifyReply, mutation: boolean): Promise<unknown> {
    try {
      const action = mutation ? updateRecordMetadata : readRecordMetadata;
      return send(
        request,
        reply,
        await action(
          this.input,
          {
            params: request.params,
            query: request.query,
            body: request.body,
            headers: request.headers,
            context: requestContext(request),
          },
          resolvedRequestContract(request)
        )
      );
    } catch {
      this.input.log.error(mutation ? 'Record mutation failed' : 'Record read failed');
      return sendApiErrors(request, reply, 500, [
        { detail: mutation ? 'Record mutation failed' : 'Record read failed.' },
      ]);
    }
  }
  async getMeta(request: MetadataRequest, reply: FastifyReply): Promise<unknown> {
    return this.execute(request, reply, false);
  }
  async updateMeta(request: MetadataRequest, reply: FastifyReply): Promise<unknown> {
    return this.execute(request, reply, true);
  }
}
export const recordController = defineController({
  name: 'webservice/RecordController',
  actions: ['getMeta', 'updateMeta'],
  create: (input: RecordControllerInput) => new RecordController(input),
});
