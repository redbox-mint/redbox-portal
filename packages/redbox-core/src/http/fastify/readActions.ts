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
import { inheritRequestPreparation } from '../actions/requestPreparation';
import { RequestChronicleHelper } from '../../utilities/RequestChronicle';
import { requestPathname } from './router';
/** Derive action facts from the live request; hook replacements must remain visible. */
export function readRequest(request: FastifyRequest): ReferenceRequest {
  const facts: ReferenceRequest = {
    method: request.method,
    protocol: request.protocol,
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
  inheritRequestPreparation(request, facts);
  return facts;
}
/** Publish prepared inputs for host validation and live action adaptation. */
export function applyPreparedReadRequest(request: FastifyRequest, facts: ReferenceRequest): void {
  request.body = facts.body;
  request.params = facts.params;
  request.query = facts.query;
  inheritRequestPreparation(facts, request);
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
    const result = invalidSchemaRead({ ...input, path: requestPathname(request.raw.url ?? request.url)! });
    return sendSerializedJson(request, reply, { ...result, json: JSON.stringify(result.body) });
  }
}
