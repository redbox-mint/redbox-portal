import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Audits } from '../../queries/IntegrationAudits';
import type { AgendaQueue } from '../../queues/AgendaQueue';
import type { FigshareLicense } from '../../services/figshare-v2/types';
import { makeClientLayer } from '../../services/figshare-v2/http';
import { Services as Figshare } from '../Figshare';
import { createFigshareConfiguration, type FigshareConfigurationInput } from './config';
import { createFigshareContext } from './context';
import { createFigshareBindings, type CrosswalkResolver } from './bindings';
import { createFigshareMetadata } from './metadata';
import { createFigshareAssets, type FigshareAssetsInput } from './assets';
import { createFigshareEmbargo } from './embargo';
import { createFigshareRuntime } from './runtime';
import { createFigshareManagedAssets } from './managed-assets';
import { createFigshareWorker } from './worker';
import { createFigshareAdministration } from './admin';
import { createFigshareAudit } from './audit';
import { FigshareWorkers } from './Workers';
import type { FigshareWorkerInput, FigshareAdminInput } from './worker-input';

export interface FigshareProviderInput extends Pick<
  FigshareWorkerInput,
  'records' | 'user' | 'recordType' | 'workflowStep' | 'eligible' | 'store'
> {
  readonly configuration: FigshareConfigurationInput;
  readonly datastream: FigshareAssetsInput['datastream'];
  readonly disks: FigshareAssetsInput['disks'];
  readonly crosswalk: CrosswalkResolver;
  readonly audit: Pick<Audits.IntegrationAuditService, 'startAudit' | 'completeAudit' | 'failAudit'>;
  readonly queue: Pick<AgendaQueue, 'now' | 'schedule'>;
  readonly administrator: FigshareAdminInput['administrator'];
  readonly log: ILogger;
  translate(key: string): string;
  runWork<T>(operation: () => Promise<T>): Promise<T>;
}

/** One selected provider owns its caches, work admission and all publishing paths. */
export function createFigshareProvider(input: FigshareProviderInput) {
  const workers = new FigshareWorkers(operation => input.runWork(operation));
  const licenses = new Map<string, FigshareLicense[]>();
  const configuration = createFigshareConfiguration(input.configuration);
  const context = createFigshareContext({
    brandName: configuration.getBrandName,
    branding: {
      getBrandById: id => input.configuration.brandById(id),
      getBrand: name => input.configuration.brandByName(name),
    },
  });
  const bindings = createFigshareBindings({ crosswalk: input.crosswalk, log: input.log });
  const mappingInput = {
    bindings,
    bindingContext: context.createBindingContext,
    licenseCache: licenses,
    log: input.log,
  };
  const mapping = createFigshareMetadata(mappingInput);
  const assets = createFigshareAssets({ disks: input.disks, datastream: () => input.datastream(), log: input.log });
  const embargo = createFigshareEmbargo(mappingInput);
  const runtime = createFigshareRuntime({
    metadata: mapping,
    brandName: configuration.getBrandName,
    clientLayer: (config, run) => makeClientLayer(config, run, input.log),
  });
  const shared = {
    records: input.records,
    user: (name: string) => input.user(name),
    brandById: (id: string) => input.configuration.brandById(id),
    queue: input.queue,
    configuration: configuration.resolveFigsharePublishingConfig,
    context: context.createRunContext,
    log: input.log,
    store: () => input.store(),
    work: <T>(operation: () => Promise<T>) => workers.work(operation),
  };
  const worker = createFigshareWorker({
    ...shared,
    recordType: (brand, name) => input.recordType(brand, name),
    workflowStep: (type, name) => input.workflowStep(type, name),
    eligible: (...args) => input.eligible(...args),
    assets: createFigshareManagedAssets(assets),
    embargo: embargo.syncEmbargoPhase,
    audit: createFigshareAudit(input.audit),
  });
  const administration = createFigshareAdministration({
    ...shared,
    administrator: roles => input.administrator(roles),
  });
  const service = new Figshare.FigshareService({
    ...shared,
    translate: key => input.translate(key),
    brandName: configuration.getBrandName,
    bindings,
    mapping,
    assets,
    embargo,
    runtime,
    worker,
    drain: () => workers.drain(),
    close: async () => {
      await workers.close();
      licenses.clear();
    },
  });
  return {
    service,
    administration,
    quiesce: () => workers.quiesce(),
    drain: () => service.drain(),
    close: () => service.close(),
  };
}
