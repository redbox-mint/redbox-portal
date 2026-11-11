import { z } from 'zod';
import {
  createMongoStorageModule,
  recordRevisionMaintenance,
  inspectPrismaStagedStorage,
  ensurePrismaStagedStorageIndexes,
} from '@researchdatabox/sails-hook-redbox-storage-mongo/extension';
export { inspectPrismaStagedStorage, ensurePrismaStagedStorageIndexes };
let initialized = false;
export const pilotModuleInitialized = () => initialized;
export function createPilotModule() {
  return {
    initialize: async () => {
      initialized = true;
    },
    close: async () => {
      initialized = false;
    },
  };
}

import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  RecordController,
  DatastreamController,
  recordController,
  defineController,
  bindControllerFactory,
  requestContext,
  type RecordControllerInput,
  type DatastreamControllerInput,
  type BoundControllerFactory,
} from '@researchdatabox/redbox-core/http';
import type { PersistenceOwner } from '@researchdatabox/redbox-core/extensions/storage';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { RedboxExtensionV2 } from '@researchdatabox/redbox-core/extensions';
export interface ReplacementInput extends RecordControllerInput {
  readonly institution: { name(): string };
}
export class InstitutionRecordController extends RecordController {
  constructor(private readonly institutionInput: ReplacementInput) {
    super(institutionInput);
  }
  override async getMeta(request: Parameters<RecordController['getMeta']>[0], reply: FastifyReply): Promise<unknown> {
    reply.header('X-Institution', this.institutionInput.institution.name());
    return super.getMeta(request, reply);
  }
}
export interface NewInput {
  readonly catalogue: { publish(actor: string): Promise<string> };
}
export class CatalogueController {
  constructor(private readonly input: NewInput) {}
  async publish(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    if (!initialized) throw new Error('PilotModule is not initialized');
    const actor = requestContext(request).actor;
    if (!actor) throw new Error('Protected controller requires an actor');
    return reply.send({ published: await this.input.catalogue.publish(actor.username) });
  }
}
export const replacement = defineController({
  name: recordController.name,
  actions: ['getMeta', 'updateMeta'],
  replaces: true,
  create: (input: ReplacementInput) => new InstitutionRecordController(input),
});
// The combined pilot replaces the complete selected controller. Inherited raw
// actions remain explicit; replacing the metadata-only factory would omit them.
export interface RawReplacementInput extends DatastreamControllerInput {
  readonly institution: { name(): string };
}
class InstitutionDatastreamController extends DatastreamController {
  constructor(private readonly institutionInput: RawReplacementInput) {
    super(institutionInput);
  }
  override async getMeta(request: Parameters<RecordController['getMeta']>[0], reply: FastifyReply): Promise<unknown> {
    reply.header('X-Institution', this.institutionInput.institution.name());
    return super.getMeta(request, reply);
  }
}
const rawReplacement = defineController({
  name: recordController.name,
  actions: ['getMeta', 'updateMeta', 'addDataStreams'],
  requires: ['portal-raw-http'],
  replaces: true,
  create: (input: RawReplacementInput) => new InstitutionDatastreamController(input),
});
export const bindRaw = (input: RawReplacementInput): readonly BoundControllerFactory[] => [
  bindControllerFactory(rawReplacement, input),
];
export function registerIntegrated(): RedboxExtensionV2 {
  return { ...registerRedboxExtension(), controllers: [rawReplacement, catalogue, probe] };
}
export const catalogue = defineController({
  name: 'CatalogueController',
  requires: ['PilotModule'],
  actions: ['publish'],
  create: (input: NewInput) => new CatalogueController(input),
});
export function bindPilot(record: ReplacementInput, input: NewInput): readonly BoundControllerFactory[] {
  return [
    bindControllerFactory(replacement, record),
    bindControllerFactory(catalogue, input),
    bindControllerFactory(probe, undefined),
  ];
}
const publishApi = {
  method: 'post' as const,
  path: '/:branding/:portal/institution/publish',
  controller: catalogue.name,
  action: 'publish',
  policy: ['nocache', 'brandingandportal', 'iswebserviceauthenticated', 'brandactor', 'checkauth'],
  csrf: true,
  request: {
    body: { required: true, content: { 'application/json': { schema: z.object({ title: z.string().min(1) }) } } },
  },
  responses: {},
};
const probe = defineController({
  name: 'ProbeController',
  actions: ['read'],
  create: () => ({ read: async (_request: FastifyRequest, reply: FastifyReply) => reply.send({ reached: true }) }),
});
const probeApi = {
  method: 'get' as const,
  path: '/installed-probe',
  controller: probe.name,
  action: 'read',
  policy: ['nocache'],
  responses: {},
};
export function registerRedboxExtension(): RedboxExtensionV2 {
  return {
    apiVersion: 2,
    modules: [
      { name: 'storage', create: createMongoStorageModule },
      { name: 'PilotModule', create: createPilotModule },
    ],
    migrations: [
      {
        name: 'fm019-installed-storage-revisions',
        requires: ['storage'],
        run: async (input: { owner: PersistenceOwner & { log: ILogger } }) => {
          await recordRevisionMaintenance(input.owner).backfill();
        },
      },
    ],
    controllers: [replacement, catalogue, probe],
    routes: [
      {
        name: 'installation.probe',
        method: 'get',
        path: probeApi.path,
        controller: probe.name,
        action: 'read',
        api: probeApi,
        access: { kind: 'policies', names: ['nocache'] },
      },
      {
        name: 'institution.publish',
        method: 'post',
        path: '/:branding/:portal/institution/publish',
        controller: catalogue.name,
        action: 'publish',
        api: publishApi,
        access: {
          kind: 'policies',
          names: ['nocache', 'brandingandportal', 'iswebserviceauthenticated', 'brandactor', 'checkauth'],
        },
        csrf: true,
      },
    ],
    hooks: [
      {
        name: 'installation.probe-hook',
        stage: 'beforeAction',
        scope: { kind: 'routes', names: ['installation.probe', 'installation.fallback'] },
        run: async (_request, reply) => {
          reply.header('X-Installation-Hook', 'selected');
        },
      },
      {
        name: 'institution.guarded',
        stage: 'beforeAction',
        scope: { kind: 'routes', names: ['institution.publish'] },
        run: async (_request, reply) => {
          reply.header('X-Pilot-Guarded', 'true');
        },
      },
    ],
    fallbacks: [
      {
        name: 'installation.fallback',
        prefix: '/installed-fallback',
        controller: probe.name,
        action: 'read',
        access: { kind: 'public' },
      },
    ],
  };
}

const orderedBase = defineController({
  name: 'OrderedController',
  actions: ['read'],
  create: () => ({ read: async (_request: FastifyRequest, reply: FastifyReply) => reply.send({ provider: 'z-base' }) }),
});
const orderedReplacement = defineController({
  name: 'OrderedController',
  actions: ['read'],
  requires: ['PilotModule'],
  replaces: true,
  create: () => ({
    read: async (_request: FastifyRequest, reply: FastifyReply) =>
      reply.send({ provider: 'a-replacement', initialized }),
  }),
});
export const bindOrder = () => [
  bindControllerFactory(orderedBase, undefined),
  bindControllerFactory(orderedReplacement, undefined),
];
export function registerBase(): RedboxExtensionV2 {
  return {
    apiVersion: 2,
    config: { custom: { installationOrder: 'z-base' } },
    controllers: [orderedBase],
    routes: [
      {
        name: 'installation.order',
        method: 'get',
        path: '/installation-order',
        controller: orderedBase.name,
        action: 'read',
        access: { kind: 'public' },
      },
    ],
  };
}
export function registerReplacement(): RedboxExtensionV2 {
  return {
    apiVersion: 2,
    config: { custom: { installationOrder: 'a-replacement' } },
    controllers: [orderedReplacement],
  };
}
