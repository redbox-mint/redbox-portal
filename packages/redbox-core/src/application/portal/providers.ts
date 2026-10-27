import { hasActiveHttpRequest, drainHttpRequests } from '../../middleware/requestLifetime';
import { firstValueFrom } from 'rxjs';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { PortalConfiguration } from '../../configuration/portal';
import type { PersistenceOwner } from '../../persistence/owner';
import { getCacheEntryRepository } from '../../persistence/cache/runtime';
import {
  getVocabularyRepositories,
  getFigshareSyncRepository,
  getSiemRepository,
  runAcceptedPersistenceWork,
  hasActivePersistenceWork,
  drainAcceptedPersistenceWork,
} from '../../persistence/runtime';
import { Services as Email } from '../../integrations/Email';
import { Services as Notifications } from '../../integrations/IntegrationNotifications';
import { integrationNotificationState } from '../../integrations/IntegrationNotificationState';
import { Services as Audits } from '../../queries/IntegrationAudits';
import { Services as Security } from '../../integrations/SecurityEvents';
import { Services as Siem } from '../../integrations/SiemForwarding';
import { Services as Doi } from '../../integrations/Doi';
import { Services as Raid } from '../../integrations/Raid';
import { Services as Oni } from '../../integrations/Oni';
import { Services as Orcid } from '../../integrations/Orcid';
import { Services as Figshare } from '../../integrations/Figshare';
import { Services as FigshareVocabulary } from '../../vocabulary/FigshareVocabulary';
import { createFigshareProvider } from '../../integrations/figshare/provider';
import { createFigshareConfiguration } from '../../integrations/figshare/config';
import { doiAudit } from '../../integrations/doi/audit';
import * as doiConfiguration from '../../integrations/doi/config';
import * as doiRuntime from '../../integrations/doi/runtime';
import { makeClientLayer } from '../../services/doi-v2/http';
import * as oniConfiguration from '../../integrations/oni/config';
import { createOniRepository } from '../../integrations/oni/repository';
import { runPublishDatasetProgram } from '../../integrations/oni/runtime';
import { makeOniAuditService } from '../../integrations/oni/audit';
import { RaidPublishing } from '../../configmodels/RaidPublishing';
import { portalDomain, noDomainResources } from './domain';
import type { portalDataPlan } from './data';

function dictionary(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Actual selected integrations, with per-instance caches and complete worker lifetimes. */
export function portalProviderPlan(
  owner: PersistenceOwner,
  config: Readonly<PortalConfiguration>,
  log: ILogger,
  data: ReturnType<typeof portalDataPlan>,
  input: {
    readonly env: Readonly<NodeJS.ProcessEnv>;
    resolveEmailHook: ConstructorParameters<typeof Email.Email>[0]['resolveHook'];
    retainFollowup<T>(work: Promise<T>): Promise<T>;
  }
) {
  const ref = data.reference;
  const appConfig = (name: string) => ref.appConfigs.get().getAppConfigurationForBrand(name);
  const email = portalDomain(
    'email',
    [],
    (input: ConstructorParameters<typeof Email.Email>[0]) => new Email.Email(input),
    noDomainResources,
    (value): value is Email.Email => value instanceof Email.Email,
    () => ({
      config: config.emailnotification,
      log,
      templateContext: config,
      resolveHook: input.resolveEmailHook,
      runAcceptedWork: operation => runAcceptedPersistenceWork(owner, operation),
      retainFollowup: work => {
        void input.retainFollowup(work);
      },
    })
  );
  const notifications = portalDomain(
    'integrationNotifications',
    ['email', 'appConfigs'],
    (input: ConstructorParameters<typeof Notifications.IntegrationNotificationService>[0]) =>
      new Notifications.IntegrationNotificationService(input),
    noDomainResources,
    (value): value is Notifications.IntegrationNotificationService =>
      value instanceof Notifications.IntegrationNotificationService,
    () => ({
      log,
      email: email.get(),
      configuration: async id => {
        const brand = id ? ref.branding.get().getBrandById(id) : ref.branding.get().getDefault();
        if (!brand) throw new Error('Notification brand is unavailable.');
        const value = await ref.appConfigs.get().getAppConfigByBrandAndKey(brand.id, 'integrationNotification');
        return dictionary(value) ? value : null;
      },
      state: integrationNotificationState(getCacheEntryRepository(owner), cacheExpiry()),
    })
  );
  const audits = portalDomain(
    'integrationAudits',
    ['storage', 'queue'],
    (input: ConstructorParameters<typeof Audits.IntegrationAuditService>[0]) =>
      new Audits.IntegrationAuditService(input),
    value => ({ initialize: async () => {}, drain: () => value.drain(), close: () => value.close() }),
    (value): value is Audits.IntegrationAuditService => value instanceof Audits.IntegrationAuditService,
    () => ({
      storage: data.storage(),
      log,
      environment: config.environment,
      enqueue: (name, entry) => input.retainFollowup(data.queue.get().now(name, entry)),
      emitSecurityEvent: entry => security.get().emitFromIntegrationAudit(entry),
    })
  );
  const security = portalDomain(
    'securityEvents',
    ['queue', 'appConfigs'],
    (input: ConstructorParameters<typeof Security.SecurityEventService>[0]) => new Security.SecurityEventService(input),
    value => ({
      initialize: async () => {},
      quiesce: () => value.quiesce(),
      drain: () => value.drain(),
      close: () => value.close(),
    }),
    (value): value is Security.SecurityEventService => value instanceof Security.SecurityEventService,
    () => ({
      repository: getSiemRepository(owner),
      log,
      brand: value => ref.branding.get().getBrandById(value) ?? ref.branding.get().getBrand(value),
      configuration: name => Reflect.get(appConfig(name), 'siem'),
      enqueue: (name, entry) => data.queue.get().now(name, entry),
      hasAcceptedWork: () => hasActivePersistenceWork(owner) || hasActiveHttpRequest(owner),
      drainAcceptedWork: async () => {
        await drainHttpRequests(owner);
        await drainAcceptedPersistenceWork(owner);
      },
      record: oid => data.records.get().getMeta(oid),
    })
  );
  const siem = portalDomain(
    'siemForwarding',
    ['appConfigs'],
    (input: ConstructorParameters<typeof Siem.SiemForwardingService>[0]) => new Siem.SiemForwardingService(input),
    value => ({
      initialize: () => value.bootstrap(),
      quiesce: () => value.quiesce(),
      drain: () => value.drain(),
      close: () => value.drain(),
    }),
    (value): value is Siem.SiemForwardingService => value instanceof Siem.SiemForwardingService,
    () => ({
      repository: getSiemRepository(owner),
      configuration: id => {
        const brand = ref.branding.get().getBrandById(id);
        return brand ? Reflect.get(appConfig(brand.name), 'siem') : undefined;
      },
      brandIds: () =>
        ref.branding
          .get()
          .getAvailable()
          .map(name => ref.branding.get().getBrand(name).id),
    })
  );
  const doi = portalDomain(
    'doi',
    ['integrationAudits', 'records', 'appConfigs'],
    (input: ConstructorParameters<typeof Doi.Doi>[0]) => new Doi.Doi(input),
    noDomainResources,
    (value): value is Doi.Doi => value instanceof Doi.Doi,
    () => {
      const configuration: doiConfiguration.DoiConfigurationInput = {
        configuration: name => appConfig(name).doiPublishing,
        brandById: id => ref.branding.get().getBrandById(id),
        env: input.env,
      };
      const audit = doiAudit(audits.get());
      const runtime = { log, audit, clientLayer: makeClientLayer };
      return {
        log,
        translate: key => ref.translation.get().t(key),
        configuration: {
          record: record => doiConfiguration.resolveDoiPublishingConfig(configuration, record),
          brand: brand => doiConfiguration.resolveDoiPublishingConfigForBrand(configuration, brand),
        },
        audit,
        records: data.records.get(),
        programs: {
          create: (...args) => doiRuntime.runCreateDoiProgram(runtime, ...args),
          update: (...args) => doiRuntime.runUpdateDoiProgram(runtime, ...args),
          delete: (...args) => doiRuntime.runDeleteDoiProgram(runtime, ...args),
          changeState: (...args) => doiRuntime.runChangeDoiStateProgram(runtime, ...args),
        },
      };
    }
  );
  const raid = portalDomain(
    'raid',
    ['integrationAudits', 'records', 'appConfigs'],
    (input: ConstructorParameters<typeof Raid.Raid>[0]) => new Raid.Raid(input),
    value => ({ initialize: async () => {}, close: async () => value.close() }),
    (value): value is Raid.Raid => value instanceof Raid.Raid,
    () => ({
      log,
      brand: value => ref.branding.get().getBrandById(value) ?? ref.branding.get().getBrand(value),
      configuration: name => appConfig(name).raidPublishing,
      defaultConfiguration: () => config.brandingConfigurationDefaults.raidPublishing ?? new RaidPublishing(),
      records: data.records.get(),
      queue: data.queue.get(),
      audit: audits.get(),
    })
  );
  const oni = portalDomain(
    'oni',
    ['integrationAudits', 'records', 'appConfigs'],
    (input: ConstructorParameters<typeof Oni.OniService>[0]) => new Oni.OniService(input),
    value => ({ initialize: async () => {}, drain: () => value.drain(), close: () => value.close() }),
    (value): value is Oni.OniService => value instanceof Oni.OniService,
    () => {
      const configuration: oniConfiguration.OniConfigurationInput = {
        configuration: appConfig,
        brandById: id => ref.branding.get().getBrandById(id),
        brandByName: name => ref.branding.get().getBrand(name),
        warn: message => log.warn(message),
      };
      return {
        log,
        configuration: record => oniConfiguration.resolveOniPublishingConfig(configuration, record),
        brand: record => oniConfiguration.getBrand(configuration, record),
        brandName: record => oniConfiguration.getBrandName(configuration, record),
        creator: name => firstValueFrom(data.users.get().getUserWithUsername(name)),
        records: data.records.get(),
        audit: makeOniAuditService(audits.get()),
        createRepository: (config, site) =>
          createOniRepository({ storageManager: data.disks.get(), log }, config, site, data.datastream.get()),
        runWork: operation => runAcceptedPersistenceWork(owner, operation),
        publish: (...args) => runPublishDatasetProgram(log, ...args),
      };
    }
  );
  const figshareConfiguration = {
    configuration: appConfig,
    brandById: (id: string) => ref.branding.get().getBrandById(id),
    brandByName: (name: string) => ref.branding.get().getBrand(name),
    development: config.figshareDev,
    environment: config.environment,
    log,
  };
  const vocabularyConfig = createFigshareConfiguration(figshareConfiguration);
  const figshareVocabulary = portalDomain(
    'figshareVocabulary',
    ['vocabulary', 'appConfigs'],
    (input: ConstructorParameters<typeof FigshareVocabulary.FigshareVocabularyService>[0]) =>
      new FigshareVocabulary.FigshareVocabularyService(input),
    value => ({ initialize: async () => {}, drain: () => value.drain(), close: () => value.close() }),
    (value): value is FigshareVocabulary.FigshareVocabularyService =>
      value instanceof FigshareVocabulary.FigshareVocabularyService,
    () => ({
      runAcceptedWork: operation => runAcceptedPersistenceWork(owner, operation),
      repository: getVocabularyRepositories(owner),
      log,
      brandName: id => {
        const brand = ref.branding.get().getBrandById(id);
        if (!brand) throw new Error('Unknown Figshare vocabulary brand.');
        return brand.name;
      },
      defaultBrandId: () => ref.branding.get().getDefault().id,
      configuration: name => vocabularyConfig.resolveFigshareVocabularyConfig(name),
      appConfiguration: name => ({ ...appConfig(name) }),
      bootstrapDataPath: config.bootstrap.bootstrapDataPath,
      bootstrapFigshareImports: config.vocab.bootstrapFigshareImports,
    })
  );
  const figshare = portalDomain(
    'figshare',
    ['records', 'integrationAudits', 'figshareVocabulary'],
    createFigshareProvider,
    value => ({
      initialize: async () => {},
      quiesce: () => value.quiesce(),
      drain: () => value.drain(),
      close: () => value.close(),
    }),
    (value): value is ReturnType<typeof createFigshareProvider> =>
      dictionary(value) && value.service instanceof Figshare.FigshareService,
    () => ({
      configuration: figshareConfiguration,
      records: data.records.get(),
      user: name => firstValueFrom(data.users.get().getUserWithUsername(name)),
      recordType: (brand, name) => firstValueFrom(ref.types.get().get(brand, name)),
      workflowStep: (type, name) => firstValueFrom(ref.workflows.get().get(type, name)),
      eligible: (...args) => data.intents.currentExecutionEligible(...args),
      store: () => getFigshareSyncRepository(owner),
      datastream: () => data.datastream.get(),
      disks: data.disks.get(),
      crosswalk: figshareVocabulary.get(),
      audit: audits.get(),
      queue: data.queue.get(),
      administrator: roles => ref.roles.get().getAdminFromRoles(roles),
      log,
      translate: key => ref.translation.get().t(key),
      runWork: operation => runAcceptedPersistenceWork(owner, operation),
    })
  );
  const orcid = portalDomain(
    'orcid',
    [],
    (input: ConstructorParameters<typeof Orcid.Orcids>[0]) => new Orcid.Orcids(input),
    noDomainResources,
    (value): value is Orcid.Orcids => value instanceof Orcid.Orcids,
    () => ({ url: String(config.orcid.url), method: config.record.api.search.method })
  );
  return {
    modules: [email, notifications, audits, security, siem, doi, raid, oni, figshareVocabulary, figshare, orcid],
    email,
    notifications,
    audits,
    security,
    siem,
    doi,
    raid,
    oni,
    figshareVocabulary,
    figshare,
    orcid,
  };

  function cacheExpiry(): number {
    const value = config.custom_cache.cacheExpiry;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
      throw new Error('Notification cache expiry must be a positive number.');
    return value;
  }
}
