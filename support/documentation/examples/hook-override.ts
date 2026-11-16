import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApplicationModule } from '@researchdatabox/redbox-core/application';
import type { RedboxExtensionV2 } from '@researchdatabox/redbox-core/extensions';
import { bindControllerFactory, defineController } from '@researchdatabox/redbox-core/http';

export class Example implements ApplicationModule {
  private ready = false;
  async initialize(): Promise<void> {
    this.ready = true;
  }
  async close(): Promise<void> {
    this.ready = false;
  }
  health(): boolean {
    return this.ready;
  }
}

export interface HealthInput {
  example: Pick<Example, 'health'>;
}
export class HealthController {
  constructor(private readonly input: HealthInput) {}
  async read(_request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    const result = { ready: this.input.example.health() };
    return reply.type('application/json; charset=utf-8').send(JSON.stringify(result));
  }
}
export const healthController = defineController({
  name: 'ExampleHealthController',
  requires: ['example'],
  actions: ['read'],
  create: (input: HealthInput) => new HealthController(input),
});
export function bindHealthController(example: HealthInput['example']) {
  return bindControllerFactory(healthController, { example });
}
export function registerRedboxExtension(): RedboxExtensionV2 {
  return {
    apiVersion: 2,
    modules: [{ name: 'example', create: () => new Example() }],
    controllers: [healthController],
    routes: [
      {
        name: 'example-health',
        method: 'get',
        path: '/example/health',
        controller: healthController.name,
        action: 'read',
        access: { kind: 'public' },
      },
    ],
  };
}
