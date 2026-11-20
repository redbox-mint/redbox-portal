import type { FastifyReply } from 'fastify';
import type { JsonOutput } from '../actions/jsonOutput';
/** Publish serialized JSON, including the qualified onSend replacement and
 * conditional-response handoffs, while the action's error guard is active. */
export function nativeJsonOutput(
  reply: FastifyReply,
  publish: (bytes: Buffer | undefined) => void = bytes => {
    reply.send(bytes);
  }
): JsonOutput {
  return {
    isCommitted: () => reply.raw.headersSent,
    publish(body, status, headers = {}) {
      reply.headers(headers);
      if (status !== undefined) reply.code(status);
      const json = JSON.stringify(body);
      reply.type('application/json; charset=utf-8');
      publish(json === undefined ? undefined : Buffer.from(json));
    },
  };
}
