import type { FastifyRequest, FastifyReply } from 'fastify';
import { requestContext } from '../context';
import { defineController } from '../controllers';
import { executeProgressGrant, type ProgressGrantInput } from '../actions/progressGrant';
import { nativeActionReply } from '../fastify/actionReply';
export class ProgressController {
  constructor(private readonly input: ProgressGrantInput) {}
  async subscribe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    return executeProgressGrant(
      this.input,
      {
        params: request.params as Record<string, unknown>,
        query: request.query as Record<string, unknown>,
        headers: request.headers,
        sessionId: request.session?.sessionId,
        context: () => requestContext(request),
      },
      nativeActionReply(reply)
    );
  }
}
export const progressController = defineController({
  name: 'AsynchController',
  requires: ['portal-raw-http'],
  actions: ['subscribe'],
  create: (input: ProgressGrantInput) => new ProgressController(input),
});
