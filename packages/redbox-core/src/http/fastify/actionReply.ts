import type { FastifyReply } from 'fastify';
import type { ActionReply } from '../actions/actionReply';
/** Serialize once while the shared action guard owns reconciliation headers/errors. */
export function nativeActionReply(
  reply: FastifyReply,
  publish: (bytes: Buffer | undefined) => void = bytes => {
    reply.send(bytes);
  }
): ActionReply {
  const output: ActionReply = {
    get headersSent() {
      return reply.raw.headersSent;
    },
    set(headers) {
      reply.headers(headers);
      return output;
    },
    status(status) {
      reply.code(status);
      return output;
    },
    json(body) {
      const json = JSON.stringify(body);
      reply.type('application/json; charset=utf-8');
      publish(json === undefined ? undefined : Buffer.from(json));
    },
  };
  return output;
}
