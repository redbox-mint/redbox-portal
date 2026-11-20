import path from 'node:path';
import { retainHttpRequestFollowup } from '../../middleware/requestLifetime';
import type { Observable } from 'rxjs';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import { ApplicationRuntime, type ApplicationModule, type ApplicationWork } from '../Application';
import { runApplicationMigrations } from '../migrations';
import { loadPortalConfiguration } from '../../configuration/portal';
import { ConfigModelRegistry, type ConfigModelInfo } from '../../configuration/ConfigModelRegistry';
import type { PersistenceOwner } from '../../persistence/owner';
import * as persistence from '../../persistence/runtime';
import { initializeCachePersistence } from '../../persistence/cache/runtime';
import { initializeStoragePersistence } from '../../persistence/storage/runtime';
import { prepareSelectedPersistenceIndexes, type StorageIndexPreparation } from '../../persistence/maintenance';
import { type ExtensionFactory, type ExtensionWork, type ResolvedRegistration } from '../../extensions';
import type { ResolvedExtensionData } from '../../extensions/resolution';
import type { AgendaJobHandler } from '../../queues/AgendaQueue';
import { ScheduledWork } from '../../queues/ScheduledWork';
import { selectedAgendaMongoOptions } from '../../queues/indexes';
import {
  convertQueuedRecordHookData,
  migrateQueuedRecordHooks,
  QUEUED_PAYLOAD_OPERATIONS_MIGRATION_NAME,
} from '../../queues/migrateRecordHooks';
import type { RecordModel } from '../../model/storage/RecordModel';
import { portalDataPlan } from './data';
import { portalProviderPlan } from './providers';
import { portalRecordOperations } from './recordOperations';
import { FormConfigExports as coreForms } from '../../form-config';
import { loadInstalledExtensionProvidersV2 } from '../../extensions/v2';
import { resolvePortalInstallation, type PortalFastifySelection } from './installation';
import type { ProductionExtensionLoadingOptions } from './compositionInputs';

export interface PortalApplicationContext {
  readonly models: ConfigModelRegistry;
  readonly owner: PersistenceOwner;
  readonly config: Readonly<import('../../configuration/portal').PortalConfiguration>;
  readonly data: ReturnType<typeof portalDataPlan>;
  readonly providers: ReturnType<typeof portalProviderPlan>;
  readonly log: ILogger;
}
type LifecycleResolution = {
  readonly raw?: import('./rawHttp').PortalRawHttp;
  readonly rawDeclaration?: ExtensionFactory;
  readonly pages?: import('./pageHttpPlan').PortalPages;
  readonly pageDeclaration?: ExtensionFactory;
} & Pick<ResolvedExtensionData, 'modules' | 'migrations' | 'bootstrap' | 'views' | 'assets'>;
type InstalledContributions = {
  readonly providers: readonly {
    readonly name: string;
    readonly declaration: Pick<
      import('../../extensions').ExtensionData,
      'forms' | 'configModels' | 'contributors' | 'config' | 'workflows' | 'jobs'
    >;
  }[];
  readonly entrypoints: ReadonlyMap<string, Record<string, unknown>>;
};

/** The optional PDF extension receives concrete selected ports, never an application locator. */
export interface PortalPdfInput {
  readonly config: { readonly appUrl: string; readonly loginPath: string };
  readonly log: ILogger;
  readonly datastreams: Pick<ReturnType<ReturnType<typeof portalDataPlan>['datastream']['get']>, 'addDatastream'>;
  readonly audit: Pick<
    ReturnType<ReturnType<typeof portalProviderPlan>['audits']['get']>,
    'startAudit' | 'completeAudit' | 'failAudit'
  >;
  runAcceptedWork<T>(operation: () => Promise<T>): Promise<T>;
  brandById(id: string): import('../../model/storage/BrandingModel').BrandingModel | undefined;
  optionsForBrand(name: string): Readonly<Record<string, unknown>>;
  stagingDisk(): ReturnType<ReturnType<ReturnType<typeof portalDataPlan>['disks']['get']>['stagingDisk']>;
}
export interface PortalPdfModule extends ApplicationModule {
  createPDF(oid: string, record: RecordModel, options: Record<string, unknown>, user: unknown): Observable<unknown>;
}

export interface PortalApplicationOptions {
  readonly appPath: string;
  readonly log: ILogger;
  readonly environment?: string;
  readonly files?: { readonly application?: string; readonly environment?: string; readonly local?: string };
  readonly env?: Readonly<NodeJS.ProcessEnv>;
  readonly argv?: readonly string[];
  readonly includeDevDependencies?: boolean;
  readonly localesDirectory?: string;
  /** Trusted deployment bindings for extension-specific contracts. Binding must stay offline. */
  readonly bindings?: {
    module?(registration: ResolvedRegistration<ExtensionFactory>, owner: PersistenceOwner): () => ApplicationModule;
    work?(registration: ResolvedRegistration<ExtensionWork>, owner: PersistenceOwner): () => Promise<void>;
    readonly recordOperations?: Readonly<Record<string, unknown>>;
    readonly accountOperations?: Readonly<Record<string, (...args: unknown[]) => unknown>>;
    readonly workspaceOperations?: Readonly<Record<string, (args: unknown) => Observable<unknown>>>;
    readonly emailOperations?: Readonly<Record<string, (...args: unknown[]) => unknown>>;
    readonly jobs?: Readonly<Record<string, AgendaJobHandler>>;
    readonly schedules?: Readonly<Record<string, () => Promise<void>>>;
    readonly contributors?: Readonly<Record<string, import('../../record-contract').RecordContractContributor>>;
    readonly vocabularyLookups?: Readonly<
      Record<string, ReturnType<Parameters<typeof portalDataPlan>[3]['resolveVocabularyLookup']>>
    >;
  };
  /** Additional owned host modules and startup checks are composed before acquisition. */
  readonly hostModules?: readonly { readonly name: string; create(): ApplicationModule }[];
  readonly postBootstrap?: readonly ApplicationWork[];
}

/** API2 production bootstrap. Discovery, data and HTTP resolution run offline once;
 * the same application lifecycle owns every selected non-HTTP contribution. */
export async function createPortalFastifyApplication(
  options: PortalApplicationOptions & { readonly http: PortalFastifySelection }
) {
  if (!Array.isArray(options.http?.declarations) || !options.http.declarations.length)
    throw new TypeError('Native portal assembly requires an explicit nonempty conversion scope.');
  const installed = await loadInstalledExtensionProvidersV2(options.appPath, {
    includeDevDependencies: options.includeDevDependencies ?? false,
    core: undefined, // Core modules/controllers are selected with the hydrated configuration below.
  } satisfies ProductionExtensionLoadingOptions);
  const portal = await buildPortalApplication(options, installed, context =>
    resolvePortalInstallation(installed, context, options.http, options.appPath)
  );
  return { ...portal, installation: portal.resolved };
}

async function buildPortalApplication<R extends LifecycleResolution>(
  options: PortalApplicationOptions,
  installed: InstalledContributions,
  select: (
    context: PortalApplicationContext & { readonly plans: readonly { readonly declaration: ExtensionFactory }[] }
  ) => R | Promise<R>
) {
  const config = await loadPortalConfiguration({
    extensions: installed,
    environment: options.environment,
    files: options.files,
    env: options.env ?? process.env,
    argv: options.argv,
  });
  const owner: PersistenceOwner = { config, log: options.log };
  const models = new ConfigModelRegistry();
  const forms: Record<string, unknown> = { ...coreForms };
  for (const provider of installed.providers) {
    Object.assign(forms, provider.declaration.forms);
    for (const item of provider.declaration.configModels ?? []) {
      const definition = item.definition;
      if (typeof definition.modelName !== 'string' || typeof definition.class !== 'function')
        throw new Error('Invalid extension configuration model declaration: ' + provider.name);
      // Structural validation at the erased extension boundary; model validation remains with its registry.
      models.register(item.name, definition as unknown as ConfigModelInfo);
    }
  }
  const pending = new Set<Promise<unknown>>();
  const retainFollowup = <T>(work: Promise<T>): Promise<T> => {
    pending.add(work);
    void work.then(
      () => pending.delete(work),
      () => pending.delete(work)
    );
    return work;
  };
  const lookup = <T>(registry: Readonly<Record<string, T>> | undefined, name: string, kind: string): T => {
    if (!registry || !Object.hasOwn(registry, name)) throw new Error('Unregistered ' + kind + ': ' + name);
    return registry[name]!;
  };
  const data = portalDataPlan(owner, config, options.log, {
    models,
    contributors: installed.providers.flatMap(provider =>
      (provider.declaration.contributors ?? []).map(item => ({
        contributor: lookup(options.bindings?.contributors, item.name, 'record contract contributor'),
        source: 'hook' as const,
        packageName: provider.name,
      }))
    ),
    forms,
    localesDirectory: options.localesDirectory ?? path.resolve(options.appPath, 'language-defaults'),
    resolveHook: name => resolveHook(name),
    resolveAccountHook: name => lookup(options.bindings?.accountOperations, name, 'account operation'),
    resolveWorkspaceOperation: name => lookup(options.bindings?.workspaceOperations, name, 'workspace operation'),
    resolveVocabularyLookup: (service, method) =>
      options.bindings?.vocabularyLookups?.[service + '.' + method] ??
      (service.toLowerCase() === 'doiservice' && method === 'lookupDataciteDois'
        ? request => providers.doi.get().lookupDataciteDois(request)
        : undefined),
    job: name => jobs[name],
    securityEvent: entry => providers.security.get().emitFromRecordAudit(entry),
    userAudit: (...args) => providers.security.get().emitFromUserAudit(...args),
    retainFollowup,
  });
  const providers = portalProviderPlan(owner, config, options.log, data, {
    env: options.env ?? process.env,
    retainFollowup,
    resolveEmailHook: name => {
      const callback = options.bindings?.emailOperations?.[name] ?? resolveHook(name);
      if (typeof callback !== 'function') throw new Error('Invalid email operation: ' + name);
      return (...args) => callback(...args);
    },
  });
  const operations = portalRecordOperations({
    triggers: () => data.triggers.get(),
    workflows: () => data.workflowTriggers.get(),
    records: () => data.records.get(),
    email: () => providers.email.get(),
    doi: () => providers.doi.get(),
    raid: () => providers.raid.get(),
    oni: () => providers.oni.get(),
    figshare: () => providers.figshare.get().service,
  });
  let pdf: PortalPdfModule | undefined;
  const recordOperations: Record<string, unknown> = {
    ...operations.operations,
    'pdf.create': (...args: Parameters<PortalPdfModule['createPDF']>) => {
      if (!pdf) throw new Error('The selected PDF extension is unavailable.');
      return pdf.createPDF(...args);
    },
    ...options.bindings?.recordOperations,
  };
  function resolveHook(name: string): unknown {
    return lookup(recordOperations, name, 'record operation');
  }
  const jobs: Record<string, AgendaJobHandler> = {
    'solrsearchservice.solrAddOrUpdate': async job => {
      await data.search
        .get()
        .solrAddOrUpdate(job as Parameters<ReturnType<typeof data.search.get>['solrAddOrUpdate']>[0]);
    },
    'solrsearchservice.solrDelete': async job => {
      await data.search.get().solrDelete(job as Parameters<ReturnType<typeof data.search.get>['solrDelete']>[0]);
    },
    'recordsservice.storeRecordAudit': job => data.records.get().storeRecordAudit({ attrs: job.attrs }),
    'recordsservice.reconcilePostCommitSave': job => data.records.get().reconcilePostCommitSave(job),
    'integrationauditservice.storeIntegrationAudit': job =>
      providers.audits.get().storeIntegrationAudit({ attrs: job.attrs }),
    'integrationnotificationservice.dispatch': job => providers.notifications.get().dispatch({ attrs: job.attrs }),
    'securityeventservice.storeSecurityEvent': job => providers.security.get().storeSecurityEvent(job),
    'siemforwardingservice.forwardSecurityEvents': job => providers.siem.get().forwardSecurityEvents(job),
    'siemforwardingservice.retryFailedDeliveries': job => providers.siem.get().retryFailedDeliveries(job),
    'raidservice.mintRetryJob': async job => {
      await providers.raid
        .get()
        .mintRetryJob(job as Parameters<ReturnType<typeof providers.raid.get>['mintRetryJob']>[0]);
    },
    'agendaqueueservice.moveCompletedJobsToHistory': job => data.queue.get().moveCompletedJobsToHistory(job),
    'figshareservice.syncRecordJob': async job => {
      await providers.figshare
        .get()
        .service.syncRecordJob(
          job as Parameters<ReturnType<typeof providers.figshare.get>['service']['syncRecordJob']>[0]
        );
    },
    'figshareservice.dispatchSyncJob': async () => {
      await providers.figshare.get().service.dispatchSyncJob();
    },
    'figshareservice.publishAfterUploadFilesJob': async job => {
      await providers.figshare
        .get()
        .service.publishAfterUploadFilesJob(
          job as Parameters<ReturnType<typeof providers.figshare.get>['service']['publishAfterUploadFilesJob']>[0]
        );
    },
    'figshareservice.deleteFilesFromRedbox': async job => {
      await providers.figshare
        .get()
        .service.deleteFilesFromRedbox(
          job as Parameters<ReturnType<typeof providers.figshare.get>['service']['deleteFilesFromRedbox']>[0]
        );
    },
    'brandingtypefaceservice.reconcileAssets': async () => {
      await data.reference.typeface.get().reconcileAssets();
    },
    'rdmpservice.queuedTriggerSubscriptionHandler': async job => {
      // External queues cannot be enumerated at startup. Convert each delivered
      // payload before dispatch; a failed delivery retains ordinary retry/ack semantics.
      const converted = convertQueuedRecordHookData(job.attrs.data, resolveHook);
      await data.triggers.get().queuedTriggerSubscriptionHandler({ attrs: { ...job.attrs, data: converted } });
    },
    ...options.bindings?.jobs,
  };
  for (const job of Object.values(config.agendaQueue.jobs))
    if (!Object.hasOwn(jobs, job.fnName)) throw new Error('Unregistered Agenda operation: ' + job.fnName);
  const plans = [...data.modules, ...providers.modules];
  const resolved = await select({ owner, config, data, providers, models, log: options.log, plans });
  const storage = resolved.modules.find(item => item.declaration.name === 'storage');
  if (!storage) throw new Error('Select an installed storage extension.');
  const storageExports = installed.entrypoints.get(storage.provider);
  if (
    !storageExports ||
    typeof storageExports.inspectPrismaStagedStorage !== 'function' ||
    typeof storageExports.ensurePrismaStagedStorageIndexes !== 'function'
  )
    throw new Error('Selected storage must export its explicit index preflight.');
  const preflight = storageExports as unknown as StorageIndexPreparation;
  const byName = new Map(plans.map(plan => [plan.declaration.name, plan]));
  const factories = resolved.modules.map(registration => {
    const plan = byName.get(registration.declaration.name);
    let create: () => ApplicationModule;
    if (plan) create = plan.bind(registration);
    else if (registration.declaration.name === 'portal-raw-http' && resolved.raw) {
      if (registration.declaration !== resolved.rawDeclaration)
        throw new Error('The qualified raw HTTP owner cannot be replaced.');
      create = () => resolved.raw!;
    } else if (registration.declaration.name === 'portal-pages' && resolved.pages) {
      if (registration.declaration !== resolved.pageDeclaration)
        throw new Error('The qualified page owner cannot be replaced.');
      create = () => resolved.pages!;
    } else if (registration.declaration.name === 'storage') create = data.bindStorage(registration);
    else if (registration.declaration.name === 'pdf')
      create = () => {
        const construct = registration.declaration.create as (input: PortalPdfInput) => PortalPdfModule;
        const module = construct({
          config: { appUrl: config.server.publicUrl, loginPath: config.auth.loginPath },
          log: options.log,
          runAcceptedWork: operation => persistence.runAcceptedPersistenceWork(owner, operation),
          datastreams: { addDatastream: (...args) => data.datastream.get().addDatastream(...args) },
          audit: {
            startAudit: (...args) => providers.audits.get().startAudit(...args),
            completeAudit: (...args) => providers.audits.get().completeAudit(...args),
            failAudit: (...args) => providers.audits.get().failAudit(...args),
          },
          brandById: id => data.reference.branding.get().getBrandById(id),
          optionsForBrand: name => {
            const value: unknown = Reflect.get(
              data.reference.appConfigs.get().getAppConfigurationForBrand(name),
              'pdfgen'
            );
            return value && typeof value === 'object' ? { ...config.pdfgen, ...value } : { ...config.pdfgen };
          },
          stagingDisk: () => data.disks.get().stagingDisk(),
        });
        if (typeof module?.createPDF !== 'function') throw new Error('Selected PDF module has no PDF contract.');
        pdf = module;
        return {
          initialize: () => module.initialize(),
          activate: () => module.activate?.() ?? Promise.resolve(),
          quiesce: () => module.quiesce?.(),
          drain: options => module.drain?.(options) ?? Promise.resolve(),
          close: async () => {
            await module.close();
            pdf = undefined;
          },
        };
      };
    else if (options.bindings?.module) create = options.bindings.module(registration, owner);
    else throw new Error('Bind the concrete extension module contract: ' + registration.declaration.name);
    return { name: registration.declaration.name, create };
  });
  const bindWork = (registration: ResolvedRegistration<ExtensionWork>): (() => Promise<void>) => {
    if (registration.provider === storage.provider) {
      const run = registration.declaration.run as (input: { owner: PersistenceOwner }) => Promise<void>;
      return () => run({ owner });
    }
    if (options.bindings?.work) return options.bindings.work(registration, owner);
    throw new Error('Bind the concrete extension work contract: ' + registration.declaration.name);
  };
  const migrations = [
    ...data.reference.migrations,
    {
      name: QUEUED_PAYLOAD_OPERATIONS_MIGRATION_NAME,
      source: 'core',
      up: async () => {
        const changed = await migrateQueuedRecordHooks(owner, config.agendaQueue, resolveHook);
        options.log.info(`Queued record hook operations: converted ${changed} jobs.`);
      },
    },
    ...resolved.migrations.map(item => ({ name: item.declaration.name, source: item.provider, up: bindWork(item) })),
  ];
  const extensionBootstrap = resolved.bootstrap.map(item => ({
    name: item.declaration.name,
    requires: item.declaration.requires,
    run: bindWork(item),
  }));
  const scheduleOperations = {
    'workspaces.loop': () => data.workspaceWorkers.get().loop(),
    ...options.bindings?.schedules,
  };
  const scheduled = new ScheduledWork(
    config.schedules.map(item => ({
      name: item.name,
      interval: item.interval,
      run: lookup(scheduleOperations, item.operation, 'scheduled operation'),
    })),
    options.log,
    owner
  );
  factories.push({ name: 'schedules', create: () => scheduled });
  factories.push({
    name: 'followups',
    create: () => ({
      initialize: async () => {},
      drain: async () => {
        while (pending.size) await Promise.allSettled(pending);
      },
      close: async () => {},
    }),
  });
  factories.push(...(options.hostModules ?? []));
  // Claims and persisted schedules start only after every selected provider and
  // host module has activated. Queue initialization still defines handlers early.
  factories.push({
    name: 'consumers',
    create: () => ({ initialize: async () => {}, activate: () => data.queue.get().activate(), close: async () => {} }),
  });
  const application = new ApplicationRuntime(owner, factories, {
    stopDeadlineMs: config.server.stopDeadlineMs,
    preparePersistence: async () => {
      const report = await prepareSelectedPersistenceIndexes(owner, 'inspect', {
        storage: preflight,
        agenda: selectedAgendaMongoOptions(config.agendaQueue),
        session: config.redboxSession,
      });
      if (!report.ready)
        throw new Error('Persistence indexes are not ready. Run explicit persistence:indexes maintenance.');
      for (const initialize of [
        initializeCachePersistence,
        persistence.initializeMigrationPersistence,
        persistence.initializeReferencePersistence,
        persistence.initializeConfigurationPersistence,
        persistence.initializeProgressPersistence,
        persistence.initializeHarvestPersistence,
        persistence.initializeSiemPersistence,
        persistence.initializeFigsharePersistence,
        (selectedOwner: PersistenceOwner) =>
          persistence.initializeIdentityPersistence(selectedOwner, {
            assignPendingAccess: user =>
              data.users.get().findAndAssignAccessToRecords(String(user.email), String(user.id)),
          }),
        persistence.initializeVocabularyPersistence,
        persistence.initializeBrandingPersistence,
        (selectedOwner: PersistenceOwner) =>
          initializeStoragePersistence(selectedOwner, {
            log: options.log,
            emitAccessEvent: entry => providers.security.get().emitFromAttachmentAudit({ ...entry }),
            retainFollowup: work => retainHttpRequestFollowup(owner, retainFollowup(work)),
          }),
      ])
        await initialize(owner);
    },
    migrations: () =>
      runApplicationMigrations(migrations, {
        ledger: persistence.getMigrationLedgerRepository(owner),
        context: {},
        log: options.log,
      }),
    coreBootstrap: data.reference.bootstrap,
    extensionBootstrap,
    postBootstrap: [
      ...data.reference.postBootstrap,
      { name: 'figshare-vocabulary', run: () => providers.figshareVocabulary.get().bootstrapData() },
      ...(options.postBootstrap ?? []),
    ],
  });
  return {
    application,
    owner,
    config,
    data,
    providers,
    models,
    resolved,
    jobs,
    resolveHook,
    preflight,
    log: options.log,
  };
}
