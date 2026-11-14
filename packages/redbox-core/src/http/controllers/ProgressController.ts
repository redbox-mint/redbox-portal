import type { FastifyRequest, FastifyReply } from 'fastify';
import { requestContext } from '../context';
import { defineController } from '../controllers';
import { executeProgressGrant } from '../actions/progressGrant';
import { executeProgressOperation, type ProgressOperationInput } from '../actions/progressOperations';
import { nativeActionReply } from '../fastify/actionReply';
export class ProgressController {
  constructor(private readonly input: ProgressOperationInput) {}
  async subscribe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (
      (
        request.routeOptions.config as { redboxRoute?: { route: { declaration: { path: string } } } }
      ).redboxRoute?.route.declaration.path.includes(':roomId')
    )
      return this.operation('subscribe', request, reply);
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
  start(request: FastifyRequest, reply: FastifyReply) {
    return this.operation('start', request, reply);
  }
  update(request: FastifyRequest, reply: FastifyReply) {
    return this.operation('update', request, reply);
  }
  stop(request: FastifyRequest, reply: FastifyReply) {
    return this.operation('stop', request, reply);
  }
  progress(request: FastifyRequest, reply: FastifyReply) {
    return this.operation('progress', request, reply);
  }
  unsubscribe(request: FastifyRequest, reply: FastifyReply) {
    return this.operation('unsubscribe', request, reply);
  }
  private operation(
    operation: Parameters<typeof executeProgressOperation>[1],
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    return executeProgressOperation(
      this.input,
      operation,
      {
        params: request.params as Record<string, unknown>,
        query: request.query as Record<string, unknown>,
        body: request.body,
        headers: request.headers,
        context: () => requestContext(request),
      },
      nativeActionReply(reply)
    );
  }
}
export const progressController = defineController({
  name: 'AsynchController',
  requires: ['portal-raw-http'],
  actions: ['start', 'update', 'stop', 'progress', 'subscribe', 'unsubscribe'],
  create: (input: ProgressOperationInput) => new ProgressController(input),
});
