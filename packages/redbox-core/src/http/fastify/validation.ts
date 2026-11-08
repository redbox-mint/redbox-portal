import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiRouteDefinition } from '../../api-routes/types';
import {
  validateApiRequest,
  type ApiRouteValidationOptions,
  type ValidatedApiRouteRequest,
} from '../../api-routes/validation';
import { sendApiValidationErrors } from './responses';
import { extractApiRequest } from '../../api-routes/request-extraction';

/** Invoke at the action's FM-004 validation position, after any required domain
 * prelude. The parsed result is action-local; it never mutates request inputs. */
export async function validateRouteRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  route: Partial<ApiRouteDefinition>,
  options: ApiRouteValidationOptions = {}
): Promise<ValidatedApiRouteRequest | undefined> {
  const input = {
    params: request.params as Record<string, unknown>,
    query: request.query as Record<string, unknown>,
    body: request.body,
    headers: request.headers,
  };
  // Use the same validation/extraction primitives as validateApiRouteRequest.
  // Native browser declarations may supply request metadata without an API route.
  const validation = validateApiRequest(input, route.request, options);
  if (!validation.valid) {
    await sendApiValidationErrors(request, reply, validation.issues);
    return undefined;
  }
  const extracted = extractApiRequest(input, route.request);
  const result = {
    valid: true,
    params: extracted.params,
    query: extracted.query,
    headers: extracted.headers,
    body: extracted.body,
    files: options.files ?? extracted.files,
  };
  return result;
}
