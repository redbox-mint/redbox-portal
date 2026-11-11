import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ValidatedApiRouteRequest } from '../../api-routes/validation';
import { requestContext } from '../context';
import { executeReferenceRead, type ReferenceRequest, type ReferenceResult } from '../actions/reference';
import { resolvedRequestContract } from './validation';
import { sendSerializedJson } from './responses';

/** Native adaptation only. Bytes have already been serialized by the shared guard. */
export async function referenceRead(
  request: FastifyRequest,
  reply: FastifyReply,
  action: (request: ReferenceRequest, valid: ValidatedApiRouteRequest) => Promise<ReferenceResult>,
  failure?: (request: ReferenceRequest, error: unknown) => ReferenceResult
) {
  const facts: ReferenceRequest = {
    params: request.params as Record<string, unknown>,
    query: request.query as Record<string, unknown>,
    headers: request.headers,
    body: request.body,
    session: request.session,
    context: requestContext(request),
    recordFailure: () => reply.log.error('HTTP_REQUEST_FAILED'),
  };
  const result = await executeReferenceRead(
    facts,
    resolvedRequestContract(request),
    valid => action(facts, valid),
    failure ? error => failure(facts, error) : undefined
  );
  return sendSerializedJson(request, reply, result);
}
