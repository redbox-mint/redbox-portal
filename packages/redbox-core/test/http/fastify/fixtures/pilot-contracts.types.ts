// Compiled by installedPilot against packed public entrypoints, without author sources.
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  defineController,
  bindControllerFactory,
  requestContext,
  resolveLanguage,
  type ControllerAction,
  type HttpRouteDeclaration,
  type HttpHookContribution,
  type HttpFallbackContribution,
  type HttpObservationRequest,
  type SafeHttpError,
} from '@researchdatabox/redbox-core/http';
import type { RedboxExtensionV2 } from '@researchdatabox/redbox-core/extensions';
import type {
  ProductionControllerHostOptions,
  ProductionExtensionResolutionOptions,
} from '@researchdatabox/redbox-core/portal';

interface Input {
  readonly catalogue: { read(actor: string): Promise<string> };
}
class Catalogue {
  constructor(private readonly input: Input) {}
  async read(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    const context = requestContext(request);
    return reply.send({
      value: await this.input.catalogue.read(context.actor?.username ?? ''),
      language: await resolveLanguage({ languages: async () => [] }),
    });
  }
}
export const controller = defineController({
  name: 'ExampleCatalogue',
  actions: ['read'],
  create: (input: Input) => new Catalogue(input),
});
export const bind = (input: Input) => bindControllerFactory(controller, input);
const signature: ControllerAction = (request, reply) =>
  new Catalogue({ catalogue: { read: async () => 'example' } }).read(request, reply);
const route: HttpRouteDeclaration = {
  name: 'example.read',
  method: 'get',
  path: '/:branding/:portal/example',
  controller: controller.name,
  action: 'read',
  access: { kind: 'policies', names: ['brandingandportal', 'iswebserviceauthenticated', 'brandactor'] },
};
const observe = async (_request: HttpObservationRequest): Promise<void> => {};
const failure = async (_request: HttpObservationRequest, _error: SafeHttpError): Promise<void> => {};
const hooks: readonly HttpHookContribution[] = [
  {
    name: 'example.auth',
    stage: 'afterAuthentication',
    scope: { kind: 'routes', names: [route.name] },
    run: async () => {},
  },
  {
    name: 'example.before',
    stage: 'beforeAction',
    scope: { kind: 'routes', names: [route.name] },
    run: async (_request, reply) => {
      reply.header('X-Example', 'guarded');
    },
  },
  { name: 'example.response', stage: 'onResponse', scope: { kind: 'application' }, observe },
  { name: 'example.error', stage: 'onError', scope: { kind: 'application' }, observe: failure },
];
const fallback: HttpFallbackContribution = {
  name: 'example.fallback',
  prefix: '/example-missing',
  controller: controller.name,
  action: 'read',
  context: { branding: 'default', portal: 'rdmp' },
  access: route.access,
};
export const declaration: RedboxExtensionV2 = {
  apiVersion: 2,
  controllers: [controller],
  routes: [route],
  hooks,
  fallbacks: [fallback],
};
// The frozen production contracts retain explicit policy/order/module/proxy selections.
export function productionSelections(
  resolution: ProductionExtensionResolutionOptions,
  host: ProductionControllerHostOptions
) {
  return [resolution.apiConfiguration, resolution.hookLoadPriority, host.moduleNames, host.trustProxy, signature];
}
