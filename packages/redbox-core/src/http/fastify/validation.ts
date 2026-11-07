import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiRouteDefinition } from '../../api-routes/types';
import {
  validateApiRouteRequest,
  type ApiRouteValidationOptions,
  type ValidatedApiRouteRequest,
} from '../../api-routes/validation';
import { sendApiValidationErrors } from './responses';

/** Invoke at the action's FM-004 validation position, after any required domain
 * prelude. The parsed result is action-local; it never mutates request inputs. */
export async function validateRouteRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  route: ApiRouteDefinition,
  options?: ApiRouteValidationOptions
): Promise<ValidatedApiRouteRequest | undefined> {
  const result = validateApiRouteRequest(
    {
      params: request.params as Record<string, unknown>,
      query: request.query as Record<string, unknown>,
      body: request.body,
      headers: request.headers,
    },
    route,
    options
  );
  if (result.valid) return result;
  await sendApiValidationErrors(request, reply, result.issues);
  return undefined;
}
