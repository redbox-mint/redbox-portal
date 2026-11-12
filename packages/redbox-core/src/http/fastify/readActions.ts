import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Readable } from 'node:stream';
import { executeReferenceRead, type ReferenceRequest, type ReferenceResult } from '../actions/reference';
import type { ValidatedApiRouteRequest } from '../../api-routes/validation';
import { validateApiRouteRequest } from '../../api-routes/validation';
import { requestContext } from '../context';
import { resolvedRequestContract } from './validation';
import { sendSerializedJson, sendLoginRedirect } from './responses';
import { invalidSchemaRead } from '../actions/recordSchemaReads';
import { sendReadStream } from './readStreams';
import { RequestChronicleHelper } from '../../utilities/RequestChronicle';
export function readRequest(request: FastifyRequest): ReferenceRequest {
  return {
    method: request.method,
    params: request.params as Record<string, unknown>,
    query: request.query as Record<string, unknown>,
    headers: request.headers,
    body: request.body,
    session: request.session,
    get context() {
      return requestContext(request);
    },
    observe: facts => RequestChronicleHelper.existing(request)?.addInfo(facts),
    recordFailure: () => request.log.error('HTTP_REQUEST_FAILED'),
  };
}
export async function readAction(
  request: FastifyRequest,
  reply: FastifyReply,
  action: (facts: ReferenceRequest, valid: ValidatedApiRouteRequest) => Promise<ReferenceResult>,
  failure?: (facts: ReferenceRequest, error: unknown) => ReferenceResult,
  actionValidation = false
) {
  const input = readRequest(request);
  const result = await executeReferenceRead(
    input,
    actionValidation ? {} : resolvedRequestContract(request),
    valid => action(input, valid),
    failure ? error => failure(input, error) : undefined
  );
  reply.headers(result.headers).code(result.status);
  if (result.kind === 'redirect') return sendLoginRedirect(request, reply, result.headers.Location);
  if (result.kind === 'stream') {
    try {
      await sendReadStream(reply, result.body as Readable);
    } catch {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.destroy();
    }
    return;
  }
  if (result.kind === 'empty') return reply.send();
  return sendSerializedJson(request, reply, result);
}
/** Schema validation keeps its problem media type before any extension action. */
export function schemaReadPrelude(request: FastifyRequest, reply: FastifyReply) {
  const input = readRequest(request);
  if (!validateApiRouteRequest(input, resolvedRequestContract(request)).valid) {
    const result = invalidSchemaRead({ ...input, path: request.url.split('?')[0] });
    return sendSerializedJson(request, reply, { ...result, json: JSON.stringify(result.body) });
  }
}
