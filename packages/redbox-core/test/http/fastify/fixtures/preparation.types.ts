// Core preparation is a closed capability, distinct from extension declarations.
import type { FastifyPreparation } from '../../../../dist/http/fastify/preparation';
declare const preparation: FastifyPreparation;
// @ts-expect-error Unqualified compiler APIs are absent from core preparation.
preparation.setSchemaController({});
// @ts-expect-error Fluent results cannot expose a raw Fastify instance.
preparation.get('/typed', async () => 'ok').listen();
// @ts-expect-error listen() does not own completion of onListen promises.
preparation.addHook('onListen', async () => {});
// @ts-expect-error Mutating route hooks cannot replace owned callbacks.
preparation.addHook('onRoute', () => {});
// @ts-expect-error Route-local compilers are also excluded.
preparation.route({ method: 'GET', url: '/unsafe', handler: async () => 'ok', validatorCompiler: () => () => true });
preparation.register(async app => {
  // @ts-expect-error Nested core plugins receive the same limited facade.
  app.decorateReply('send', () => {});
});
preparation.addHook('onClose', async app => {
  // @ts-expect-error Transport lifecycle callbacks also receive the sealed capability.
  await app.close();
});
