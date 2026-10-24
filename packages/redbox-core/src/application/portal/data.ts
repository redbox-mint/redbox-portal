import { firstValueFrom } from 'rxjs';
import { get } from 'lodash';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { PortalConfiguration } from '../../configuration/portal';
import type { PersistenceOwner } from '../../persistence/owner';
import type { ApplicationModule } from '../Application';
import type { ExtensionFactory } from '../../extensions/contract';
import type { ResolvedRegistration } from '../../extensions/resolution';
import type { StorageService } from '../../StorageService';
import type { RecordTypes } from '../../recordTypes';
import type { Forms } from '../../forms/Forms';
import { ConfigModelRegistry } from '../../configuration/ConfigModelRegistry';
import { AuthenticationAccounts } from '../../authentication/Accounts';
import { Services as Users } from '../../identity/Users';
import { Services as Disks } from '../../storage/StorageManager';
import { Services as Datastreams } from '../../storage/StandardDatastream';
import { Services as Search } from '../../queries/Solr';
import { Services as Records, type RecordPipelineInput } from '../../records/Records';
import { Services as Workspaces } from '../../workspaces/Workspaces';
import { Services as WorkspaceWorkers } from '../../workspaces/WorkspaceAsync';
import { RecordTriggers } from '../../records/RecordTriggers';
import { Services as WorkflowTriggers } from '../../records/WorkflowTriggers';
import { Services as Rva } from '../../vocabulary/RvaImport';
import { Services as Progress } from '../../progress/Asynchs';
import { Services as Harvest } from '../../records/HarvestRuns';
import { Services as Lookups } from '../../vocabulary/FormVocabulary';
import { FigshareSourceIntents } from '../../records/FigshareSourceIntents';
import { AgendaQueue, type AgendaJobHandler } from '../../queues/AgendaQueue';
import { getStorageRepositories } from '../../persistence/storage/runtime';
import {
  getIdentityRepositories,
  getVocabularyRepositories,
  getProgressRepositories,
  getHarvestRepositories,
} from '../../persistence/runtime';
import { runAcceptedPersistenceWork } from '../../persistence/runtime';
import { drainHttpRequests, hasActiveHttpRequest } from '../../middleware/requestLifetime';
import { portalReferencePlan } from './reference';
import { portalDomain, noDomainResources, type PortalDomainPlan } from './domain';

export interface PortalStorageInput {
  readonly owner: PersistenceOwner;
  readonly collaborators: {
    readonly log: ILogger;
    readonly recordTypes: Pick<RecordTypes, 'get'>;
    readonly forms: Pick<Forms, 'getFormByName'>;
    readonly disks: Pick<Disks.StorageManager, 'disk' | 'stagingDisk'>;
    translate(key: string): string;
    exportMaxRecords(): number;
  };
}
export interface PortalStorageModule extends ApplicationModule {
  readonly storage: StorageService;
}

/** Production data graph. Every port is bound to the selected application instance. */
export function portalDataPlan(
  owner: PersistenceOwner,
  config: Readonly<PortalConfiguration>,
  log: ILogger,
  input: {
    readonly contributors?: readonly import('../../record-contract').RecordContractContributorRegistration[];
    readonly models: ConfigModelRegistry;
    readonly forms: Readonly<Record<string, unknown>>;
    readonly localesDirectory: string;
    resolveHook(name: string): unknown;
    resolveAccountHook(name: string): (...args: unknown[]) => unknown;
    resolveWorkspaceOperation(name: string): (args: unknown) => import('rxjs').Observable<unknown>;
    resolveVocabularyLookup: ConstructorParameters<typeof Lookups.FormVocabulary>[0]['resolveLookup'];
    job(name: string): AgendaJobHandler | undefined;
    securityEvent(entry: Record<string, unknown>): Promise<unknown>;
    userAudit(actor: Record<string, unknown>, action: string, context: Record<string, unknown>): Promise<unknown>;
    retainFollowup<T>(work: Promise<T>): Promise<T>;
  }
) {
  let storage: StorageService | undefined;
  const getStorage = (): StorageService => {
    if (!storage) throw new Error('Selected storage is unavailable before initialization.');
    return storage;
  };
  const reference: ReturnType<typeof portalReferencePlan> = portalReferencePlan(owner, config, log, {
    storage: getStorage,
    disks: () => disks.get(),
    records: () => records.get(),
    search: () => search.get(),
    rva: { importRvaVocabulary: (...args) => rva.get().importRvaVocabulary(...args) },
    contributors: input.contributors,
    models: input.models,
    formRegistry: input.forms,
    localesDirectory: input.localesDirectory,
  });
  const disks = portalDomain(
    'storageDisks',
    [],
    (input: ConstructorParameters<typeof Disks.StorageManager>[0]) => new Disks.StorageManager(input),
    value => ({ initialize: () => value.initialize(), close: async () => {} }),
    (value): value is Disks.StorageManager => value instanceof Disks.StorageManager,
    () => ({ owner, config: config.storage, log })
  );
  const queue = portalDomain(
    'queue',
    [],
    (input: ConstructorParameters<typeof AgendaQueue>[0]) => new AgendaQueue(input),
    value => ({
      initialize: () => value.initialize(),
      quiesce: () => value.quiesce(),
      drain: () => value.drain(),
      close: () => value.close(),
    }),
    (value): value is AgendaQueue => value instanceof AgendaQueue,
    () => ({
      owner,
      config: config.agendaQueue,
      log,
      handler: name => input.job(name),
      runAcceptedWork: operation => runAcceptedPersistenceWork(owner, operation),
      drainRequests: () => drainHttpRequests(owner),
      hasAcceptedRequest: () => hasActiveHttpRequest(owner),
    })
  );
  const accounts = portalDomain(
    'accounts',
    ['roles', 'appConfigs'],
    (input: ConstructorParameters<typeof AuthenticationAccounts>[0]) => new AuthenticationAccounts(input),
    noDomainResources,
    (value): value is AuthenticationAccounts => value instanceof AuthenticationAccounts,
    () => ({
      repository: getIdentityRepositories(owner),
      log,
      defaultBrand: () => reference.branding.get().getDefault(),
      getBrand: name => reference.branding.get().getBrand(name),
      authConfig: name => reference.appConfigs.get().getAppConfigurationForBrand(name).auth,
      defaultAuthenticatedRole: brand => reference.roles.get().getDefAuthenticatedRole(brand),
      nestedRoles: (name, roles) =>
        reference.roles
          .get()
          .getNestedRoles(name, roles)
          .filter(role => role !== undefined),
      authorizedEmails: name =>
        reference.appConfigs.get().getAppConfigurationForBrand(name).authorizedDomainsEmails ?? {},
      resolveHook: name => input.resolveAccountHook(name),
      event: (info, errors, level) => log[level ?? 'debug']({ ...info, errors }),
      postLogoutRedirect: config.auth.postLogoutRedir,
    })
  );
  const users = portalDomain(
    'users',
    ['accounts'],
    (input: ConstructorParameters<typeof Users.Users>[0]) => new Users.Users(input),
    noDomainResources,
    (value): value is Users.Users => value instanceof Users.Users,
    () => ({
      repository: getIdentityRepositories(owner),
      accounts: accounts.get(),
      log,
      defaultBrand: () => reference.branding.get().getDefault(),
      recordAccess: {
        storage: getStorageRepositories(owner),
        records: {
          mutateMetaInternal: (...args) => records.get().mutateMetaInternal(...args),
          provideUserAccessAndRemovePendingAccess: (...args) =>
            records.get().provideUserAccessAndRemovePendingAccess(...args),
        },
      },
      emitSecurityEvent: (...args) => input.userAudit(...args),
    })
  );
  const datastream = portalDomain(
    'datastream',
    ['storageDisks', 'forms'],
    (input: ConstructorParameters<typeof Datastreams.StandardDatastream>[0]) =>
      new Datastreams.StandardDatastream(input),
    noDomainResources,
    (value): value is Datastreams.StandardDatastream => value instanceof Datastreams.StandardDatastream,
    () => ({
      disks: disks.get(),
      forms: reference.forms.get(),
      log,
      attachments: getStorageRepositories(owner).attachments,
    })
  );
  const search = portalDomain(
    'search',
    ['queue'],
    (input: ConstructorParameters<typeof Search.SolrSearchService>[0]) => new Search.SolrSearchService(input),
    value => ({ initialize: () => value.initialize(), close: async () => {} }),
    (value): value is Search.SolrSearchService => value instanceof Search.SolrSearchService,
    () => ({ config: config.solr, queue: queue.get(), log, retainFollowup: work => input.retainFollowup(work) })
  );
  const intents = new FigshareSourceIntents({
    config: record => {
      const brand = reference.branding.get().getBrandById(String(get(record, 'metaMetadata.brandId', '')));
      return brand
        ? (reference.appConfigs.get().getAppConfigurationForBrand(brand.name).figsharePublishing ?? null)
        : null;
    },
    log,
  });
  const records: PortalDomainPlan<RecordPipelineInput, Records.Records> = portalDomain(
    'records',
    ['storage', 'datastream', 'search', 'users', 'recordSchema'],
    input => new Records.Records(input),
    value => ({ initialize: async () => {}, close: async () => value.close() }),
    (value): value is Records.Records => value instanceof Records.Records,
    () => ({
      config,
      log,
      storageService: getStorage(),
      datastreamService: datastream.get(),
      searchService: search.get(),
      queueService: queue.get(),
      repository: getStorageRepositories(owner),
      branding: reference.branding.get(),
      recordTypes: reference.types.get(),
      workflows: reference.workflows.get(),
      forms: reference.forms.get(),
      users: users.get(),
      roles: reference.roles.get(),
      schema: reference.schema.get(),
      validation: reference.validation.get(),
      translation: reference.translation.get(),
      attachments: getStorageRepositories(owner).attachments,
      stagingDisk: () => disks.get().stagingDisk(),
      resolveHook: name => input.resolveHook(name),
      prepareSourceIntent: intents.prepareSourceIntent.bind(intents),
      wakeFigshareRecord: oid => queue.get().now('Figshare-SyncRecord', { oid }),
      emitSecurityEvent: entry => input.securityEvent(entry),
    })
  );
  const workspaces = portalDomain(
    'workspaces',
    ['records'],
    (input: ConstructorParameters<typeof Workspaces.WorkspaceService>[0]) => new Workspaces.WorkspaceService(input),
    noDomainResources,
    (value): value is Workspaces.WorkspaceService => value instanceof Workspaces.WorkspaceService,
    () => ({ identities: getIdentityRepositories(owner), records: records.get(), log })
  );
  const workspaceWorkers = portalDomain(
    'workspaceAsync',
    [],
    (input: ConstructorParameters<typeof WorkspaceWorkers.WorkspaceAsyncService>[0]) =>
      new WorkspaceWorkers.WorkspaceAsyncService(input),
    value => value,
    (value): value is WorkspaceWorkers.WorkspaceAsyncService => value instanceof WorkspaceWorkers.WorkspaceAsyncService,
    () => ({
      repository: getProgressRepositories(owner).workspaces,
      log,
      resolveOperation: name => input.resolveWorkspaceOperation(name),
      runWork: operation => runAcceptedPersistenceWork(owner, operation),
    })
  );
  const triggers = portalDomain(
    'recordTriggers',
    ['workspaces', 'queue'],
    (input: ConstructorParameters<typeof RecordTriggers>[0]) => new RecordTriggers(input),
    noDomainResources,
    (value): value is RecordTriggers => value instanceof RecordTriggers,
    () => ({
      config: config.record,
      log,
      identities: getIdentityRepositories(owner),
      counters: getStorageRepositories(owner).counters,
      queue: queue.get(),
      workspaces: workspaces.get(),
      effectiveUser: user => firstValueFrom(accounts.get().getEffectiveUser(user)),
      translate: key => reference.translation.get().t(key),
      interpolate: (message, values) => reference.translation.get().tInter(message, values),
      resolveHook: name => input.resolveHook(name),
    })
  );
  const workflowTriggers = portalDomain(
    'workflowTriggers',
    ['records'],
    (input: ConstructorParameters<typeof WorkflowTriggers.Trigger>[0]) => new WorkflowTriggers.Trigger(input),
    noDomainResources,
    (value): value is WorkflowTriggers.Trigger => value instanceof WorkflowTriggers.Trigger,
    () => ({
      log,
      records: records.get(),
      translation: reference.translation.get(),
      brand: id => reference.branding.get().getBrandById(id) ?? reference.branding.get().getBrand(id),
      resolveHook: name => input.resolveHook(name),
    })
  );
  const rva = portalDomain(
    'rva',
    ['vocabulary'],
    (input: ConstructorParameters<typeof Rva.RvaImport>[0]) => new Rva.RvaImport(input),
    noDomainResources,
    (value): value is Rva.RvaImport => value instanceof Rva.RvaImport,
    () => ({
      repository: getVocabularyRepositories(owner),
      vocabulary: reference.vocabulary.get(),
      log,
      baseUrl: () => config.vocab.rva?.baseUrl ?? 'https://vocabs.ardc.edu.au/registry',
      defaultBrand: () => reference.branding.get().getDefault().id,
    })
  );
  const progress = portalDomain(
    'progress',
    [],
    (input: ConstructorParameters<typeof Progress.Asynchs>[0]) => new Progress.Asynchs(input),
    noDomainResources,
    (value): value is Progress.Asynchs => value instanceof Progress.Asynchs,
    () => getProgressRepositories(owner).progress
  );
  const harvest = portalDomain(
    'harvest',
    ['records'],
    (input: ConstructorParameters<typeof Harvest.HarvestRunService>[0]) => new Harvest.HarvestRunService(input),
    value => ({
      initialize: async () => {},
      quiesce: () => value.quiesce(),
      drain: () => value.drain(),
      close: () => value.drain(),
    }),
    (value): value is Harvest.HarvestRunService => value instanceof Harvest.HarvestRunService,
    () => ({
      records: records.get(),
      storage: getStorage(),
      workflows: reference.workflows.get(),
      repository: getHarvestRepositories(owner),
      config,
      log,
    })
  );
  const lookups = portalDomain(
    'formVocabulary',
    ['namedQueries', 'search'],
    (input: ConstructorParameters<typeof Lookups.FormVocabulary>[0]) => new Lookups.FormVocabulary(input),
    noDomainResources,
    (value): value is Lookups.FormVocabulary => value instanceof Lookups.FormVocabulary,
    () => ({
      config: config.vocab,
      log,
      queries: reference.queries.get(),
      search: search.get(),
      resolveLookup: input.resolveVocabularyLookup,
    })
  );
  const modules = [
    disks,
    queue,
    ...reference.modules,
    accounts,
    users,
    datastream,
    search,
    records,
    workspaces,
    workspaceWorkers,
    triggers,
    workflowTriggers,
    rva,
    progress,
    harvest,
    lookups,
  ];
  return {
    modules,
    reference,
    disks,
    queue,
    accounts,
    users,
    datastream,
    search,
    records,
    workspaces,
    workspaceWorkers,
    triggers,
    workflowTriggers,
    rva,
    progress,
    harvest,
    lookups,
    intents,
    storage: getStorage,
    /** Storage's public module shape predates the standard domain value wrapper. */
    bindStorage(registration: ResolvedRegistration<ExtensionFactory>): () => ApplicationModule {
      const create = registration.declaration.create as (input: PortalStorageInput) => PortalStorageModule;
      return () => {
        const module = create({
          owner,
          collaborators: {
            log,
            disks: {
              disk: (...args) => disks.get().disk(...args),
              stagingDisk: () => disks.get().stagingDisk(),
            },
            recordTypes: { get: (...args) => reference.types.get().get(...args) },
            forms: { getFormByName: (...args) => reference.forms.get().getFormByName(...args) },
            translate: key => reference.translation.get().t(key),
            exportMaxRecords: () => config.record.export.maxRecords,
          },
        });
        if (!module?.storage || typeof module.storage.getMeta !== 'function')
          throw new Error('Selected storage module has no storage contract.');
        storage = module.storage;
        return {
          initialize: () => module.initialize(),
          activate: () => module.activate?.() ?? Promise.resolve(),
          quiesce: () => module.quiesce?.(),
          drain: options => module.drain?.(options) ?? Promise.resolve(),
          close: async () => {
            await module.close();
            storage = undefined;
          },
        };
      };
    },
  };
}
