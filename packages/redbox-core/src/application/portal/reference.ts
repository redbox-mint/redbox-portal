import { validators } from '../../config/validators.config';
import path from 'node:path';
import { firstValueFrom } from 'rxjs';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { PortalConfiguration } from '../../configuration/portal';
import type { PersistenceOwner } from '../../persistence/owner';
import {
  getReferenceRepositories,
  getConfigurationRepositories,
  getBrandingRepository,
  getIdentityRepositories,
  getVocabularyRepositories,
  getMigrationLedgerRepository,
} from '../../persistence/runtime';
import type { StorageService } from '../../StorageService';
import { getCacheEntryRepository } from '../../persistence/cache/runtime';
import type { RecordsService } from '../../RecordsService';
import type { Services as Disks } from '../../storage/StorageManager';
import type { Services as Solr } from '../../queries/Solr';
import {
  RecordTypes,
  migrateRecordHooks,
  RECORD_HOOK_OPERATIONS_MIGRATION_NAME,
  QUEUED_RECORD_HOOK_OPERATIONS_MIGRATION_NAME,
} from '../../recordTypes';
import { Services as Branding } from '../../branding/Branding';
import { Services as Typeface } from '../../branding/BrandingTypeface';
import { Services as Theme } from '../../branding/BrandingThemeCss';
import { Services as Roles } from '../../identity/Roles';
import { Services as Workflows } from '../../workflows/WorkflowSteps';
import { Services as Workspaces } from '../../workspaces/WorkspaceTypes';
import { Services as Dashboards } from '../../dashboards/DashboardTypes';
import { Services as DashboardConfig } from '../../dashboards/DashboardConfig';
import { Services as Translation } from '../../translations/Translation';
import { I18nEntries } from '../../translations/I18nEntries';
import { Services as Vocabulary } from '../../vocabulary/Vocabulary';
import type { VocabularyDependencies } from '../../vocabulary/Vocabulary';
import { Services as Queries } from '../../queries/NamedQueries';
import { Services as Reports } from '../../queries/Reports';
import { namedQueryTarget, executeNamedQuery } from '../../persistence/reference/NamedQueryExecution';
import { Forms } from '../../forms/Forms';
import { RecordValidation } from '../../forms/RecordValidation';
import { Services as Sanitizer } from '../../forms/DomSanitizer';
import { Services as Schema } from '../../recordSchema/RecordSchema';
import { RecordContractContributorRegistry, createCoreRecordContractContributors } from '../../record-contract';
import { hasViewAccess, hasEditAccess, hasTransitionRoleAuthorization } from '../../records/access';
import { ConfigModelRegistry } from '../../configuration/ConfigModelRegistry';
import { AppConfigs } from '../../configuration/AppConfigs';
import { bootstrapDefaultAdministrator, bootstrapPathRules } from '../../identity/bootstrap';
import { PathRules } from '../../authorization/PathRules';
import { portalDomain, noDomainResources, type PortalDomainPlan } from './domain';
import type { ApplicationWork } from '../Application';
import type { ApplicationMigration } from '../migrations';
import { BRANDING_TYPEFACE_MIGRATION_NAME, migrateBrandingTypefaces } from '../../branding/typefaceMigration';
import { DASHBOARD_CONFIGURATION_MIGRATION_NAME } from '../../dashboards/DashboardConfig';

/** Internal composition ports; individual factories below receive only their concrete input. */
export interface PortalReferencePorts {
  storage(): StorageService;
  disks(): Disks.StorageManager;
  records(): Pick<RecordsService, 'hasCreateAccess' | 'getRelatedRecords'>;
  search(): Solr.SolrSearchService;
  readonly rva: VocabularyDependencies['rva'];
  readonly localesDirectory: string;
  readonly formRegistry: Readonly<Record<string, unknown>>;
  readonly models: ConfigModelRegistry;
  readonly contributors?: readonly import('../../record-contract').RecordContractContributorRegistration[];
}

/** Bind real persisted reference domains and bootstrap. No synthetic seed records or startup DDL. */
export function portalReferencePlan(
  owner: PersistenceOwner,
  config: Readonly<PortalConfiguration>,
  log: ILogger,
  ports: PortalReferencePorts
) {
  const refs = () => getReferenceRepositories(owner);
  const brands = () => getBrandingRepository(owner);
  const rootContext = config.server.rootContext.replace(/^\//, '');
  const positiveInt = (key: keyof typeof config.branding, fallback: number): number => {
    const value = config.branding[key];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
    log.warn(`Invalid branding config '${key}', falling back to default ${fallback}`);
    return fallback;
  };
  const typeface = portalDomain(
    'brandingTypeface',
    ['storageDisks'],
    (input: ConstructorParameters<typeof Typeface.BrandingTypeface>[0]) => new Typeface.BrandingTypeface(input),
    noDomainResources,
    (value): value is Typeface.BrandingTypeface => value instanceof Typeface.BrandingTypeface,
    () => ({
      repository: brands(),
      disk: () => ports.disks().primaryDisk(),
      log,
      rootContext,
      positiveInt,
    })
  );
  const theme = new Theme.BrandingThemeCss();
  const branding = portalDomain(
    'branding',
    ['brandingTypeface'],
    (input: ConstructorParameters<typeof Branding.Branding>[0]) => new Branding.Branding(input),
    noDomainResources,
    (value): value is Branding.Branding => value instanceof Branding.Branding,
    () => ({
      repository: brands(),
      cacheEntries: () => getCacheEntryRepository(owner),
      log,
      theme,
      typeface: typeface.get(),
      rootContext,
      positiveInt,
    })
  );
  const appConfigs = portalDomain(
    'appConfigs',
    ['branding'],
    (input: ConstructorParameters<typeof AppConfigs>[0]) => new AppConfigs(input),
    value => ({ initialize: async () => {}, close: () => value.close() }),
    (value): value is AppConfigs => value instanceof AppConfigs,
    () => ({
      repository: getConfigurationRepositories(owner),
      models: ports.models,
      config,
      log,
      availableBrands: () => branding.get().getAvailable(),
      getBrand: name => branding.get().getBrand(name),
    })
  );
  const roles = portalDomain(
    'roles',
    ['branding', 'appConfigs'],
    (input: ConstructorParameters<typeof Roles.Roles>[0]) => new Roles.Roles(input),
    noDomainResources,
    (value): value is Roles.Roles => value instanceof Roles.Roles,
    () => ({
      repository: getIdentityRepositories(owner),
      log,
      auth: name =>
        appConfigs.get().getAppConfigurationForBrand(name).auth ?? config.brandingConfigurationDefaults.auth,
      roles: () => config.auth.roles,
      defaultBrand: () => branding.get().getDefault(),
      refreshBrand: id => branding.get().refreshBrandingCache(id),
      loadBrands: () => branding.get().loadAvailableBrands(null),
    })
  );
  const types = portalDomain(
    'recordTypes',
    ['storage'],
    (input: ConstructorParameters<typeof RecordTypes>[0]) => new RecordTypes(input),
    value => ({ initialize: async () => {}, close: () => value.close() }),
    (value): value is RecordTypes => value instanceof RecordTypes,
    () => ({ repository: refs().recordTypes, config, log, storageCapability: () => ports.storage() })
  );
  const workflows: PortalDomainPlan<ConstructorParameters<typeof Workflows.WorkflowSteps>[0], Workflows.WorkflowSteps> =
    portalDomain(
      'workflowSteps',
      ['recordTypes'],
      (input: ConstructorParameters<typeof Workflows.WorkflowSteps>[0]) => new Workflows.WorkflowSteps(input),
      noDomainResources,
      (value): value is Workflows.WorkflowSteps => value instanceof Workflows.WorkflowSteps,
      () => ({
        references: refs(),
        config,
        log,
        initialiseDashboardSettings: async type => {
          const brandId = typeof type.branding === 'string' ? type.branding : type.branding?.id;
          const brand = brandId ? branding.get().getBrandById(brandId) : undefined;
          if (!brand) throw new Error('Workflow dashboard initialization requires the record type brand.');
          await dashboardConfig.get().initialiseMissingTargets(brand);
        },
      })
    );
  const sanitizer = portalDomain(
    'domSanitizer',
    [],
    (input: ConstructorParameters<typeof Sanitizer.DomSanitizer>[0]) => new Sanitizer.DomSanitizer(input),
    value => ({ initialize: async () => {}, close: () => value.close() }),
    (value): value is Sanitizer.DomSanitizer => value instanceof Sanitizer.DomSanitizer,
    () => ({ config, log })
  );
  const vocabulary = portalDomain(
    'vocabulary',
    ['branding'],
    (input: ConstructorParameters<typeof Vocabulary.VocabularyService>[0]) => new Vocabulary.VocabularyService(input),
    noDomainResources,
    (value): value is Vocabulary.VocabularyService => value instanceof Vocabulary.VocabularyService,
    () => ({
      repository: getVocabularyRepositories(owner),
      config,
      log,
      getBrand: name => branding.get().getBrand(name),
      defaultBrand: () => branding.get().getDefault(),
      rva: ports.rva,
    })
  );
  const validation: PortalDomainPlan<ConstructorParameters<typeof RecordValidation>[0], RecordValidation> =
    portalDomain(
      'recordValidation',
      ['domSanitizer'],
      (input: ConstructorParameters<typeof RecordValidation>[0]) => new RecordValidation(input),
      noDomainResources,
      (value): value is RecordValidation => value instanceof RecordValidation,
      () => ({
        config: { ...config, validators },
        log,
        readers: {
          loadRecord: oid => ports.storage().getMeta(oid),
          loadRecordType: (brand, name) => refs().recordTypes.findByName(brand, name),
          loadStartingWorkflowStep: type => firstValueFrom(workflows.get().getFirst(type)),
          loadWorkflowStep: (type, step) => firstValueFrom(workflows.get().get(type, step)),
          loadWorkflowSteps: type => refs().workflows.listForRecordType(type.id ?? '', false),
          loadForm: (name, brand) => firstValueFrom(forms.get().getFormByName(name, true, brand)),
        },
        html: {
          sanitizeWithProfile: (html, profile) => sanitizer.get().sanitizeWithProfile(html, profile),
          htmlSanitizationMode: () => config.record.form?.htmlSanitizationMode ?? 'sanitize',
        },
      })
    );
  const forms: PortalDomainPlan<ConstructorParameters<typeof Forms>[0], Forms> = portalDomain(
    'forms',
    ['recordTypes', 'workflowSteps', 'recordValidation', 'vocabulary'],
    (input: ConstructorParameters<typeof Forms>[0]) => new Forms(input),
    noDomainResources,
    (value): value is Forms => value instanceof Forms,
    () => ({
      repository: refs(),
      log,
      config,
      recordTypes: types.get(),
      workflowSteps: workflows.get(),
      validation: validation.get(),
      records: {
        getMeta: oid => ports.storage().getMeta(oid),
        hasViewAccess,
        hasEditAccess,
        hasTransitionRoleAuthorization,
      },
      vocabulary: {
        getEntries: (...args) => vocabulary.get().getEntries(...args),
        defaultBrand: () => branding.get().getDefault().name,
      },
      formRegistry: () => ({ ...ports.formRegistry }),
      defaultBrand: () => branding.get().getDefault(),
      translate: (key, brand) => translation.get().t(key, undefined, 'en', brand),
    })
  );
  const registry = new RecordContractContributorRegistry([
    ...createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' as const })),
    ...(ports.contributors ?? []),
  ]);
  const schema = portalDomain(
    'recordSchema',
    ['forms', 'recordValidation', 'storage'],
    (input: ConstructorParameters<typeof Schema.RecordSchema>[0]) => new Schema.RecordSchema(input),
    value => ({
      initialize: async () => {
        value.init();
      },
      close: () => value.close(),
    }),
    (value): value is Schema.RecordSchema => value instanceof Schema.RecordSchema,
    () => ({
      getConfig: () => config.recordSchema,
      getStorageProvider: () => ports.storage(),
      getContributorRegistry: () => registry,
      getContributorRegistrationIssues: () => [],
      getContributorComponentTypes: () =>
        registry
          .registrations()
          .flatMap(r => (r.contributor.kind === 'component' ? [r.contributor.componentType] : [])),
      getConfiguredFormCandidates: () => forms.get().listConfiguredRecordContractForms(),
      resolveContractContext: request => validation.get().resolveContractContext(request),
      buildContractFormConfig: (context, caller) => forms.get().buildContractFormConfig(context, caller),
      authorizeCreate: async (context, caller) =>
        caller.brand.id === context.publicContext.brand &&
        context.resolution.actor.authenticated &&
        ports.records().hasCreateAccess(
          caller.brand,
          caller.user,
          caller.user.roles.map(role => ({ ...role })),
          context.publicContext.recordType,
          context.publicContext.workflowStep
        ),
      authorizeUpdate: async (context, caller) =>
        caller.brand.id === context.publicContext.brand &&
        context.resolution.actor.authenticated &&
        hasEditAccess(
          caller.brand,
          caller.user,
          caller.user.roles.map(role => ({ ...role })),
          context.resolution.existingRecord
        ),
      clock: Date.now,
      telemetryLogger: log,
    })
  );
  const dashboardConfig: PortalDomainPlan<
    ConstructorParameters<typeof DashboardConfig.DashboardConfig>[0],
    DashboardConfig.DashboardConfig
  > = portalDomain(
    'dashboardConfig',
    ['recordTypes', 'workflowSteps', 'recordSchema'],
    (input: ConstructorParameters<typeof DashboardConfig.DashboardConfig>[0]) =>
      new DashboardConfig.DashboardConfig(input),
    value => ({ initialize: async () => {}, close: () => value.close() }),
    (value): value is DashboardConfig.DashboardConfig => value instanceof DashboardConfig.DashboardConfig,
    () => ({
      references: refs(),
      configuration: getConfigurationRepositories(owner),
      brands: brands(),
      migrations: getMigrationLedgerRepository(owner),
      config,
      log,
      recordTypes: types.get(),
      workflowSteps: workflows.get(),
      schema: schema.get(),
      availableBrands: () => branding.get().getAvailable(),
      getBrand: name => branding.get().getBrand(name),
    })
  );
  const dashboards = portalDomain(
    'dashboardTypes',
    ['recordTypes', 'dashboardConfig'],
    (input: ConstructorParameters<typeof Dashboards.DashboardTypes>[0]) => new Dashboards.DashboardTypes(input),
    value => ({ initialize: async () => {}, close: () => value.close() }),
    (value): value is Dashboards.DashboardTypes => value instanceof Dashboards.DashboardTypes,
    () => ({
      references: refs(),
      configuration: getConfigurationRepositories(owner),
      config,
      log,
      recordTypes: types.get(),
      dashboardConfig: dashboardConfig.get(),
    })
  );
  const workspaceTypes = portalDomain(
    'workspaceTypes',
    [],
    (input: ConstructorParameters<typeof Workspaces.WorkspaceTypes>[0]) => new Workspaces.WorkspaceTypes(input),
    noDomainResources,
    (value): value is Workspaces.WorkspaceTypes => value instanceof Workspaces.WorkspaceTypes,
    () => ({ references: refs(), config, log, bootstrapProviders: [] })
  );
  const translation = portalDomain(
    'translation',
    ['branding'],
    (input: ConstructorParameters<typeof Translation.Translation>[0]) => new Translation.Translation(input),
    value => ({ initialize: async () => {}, close: () => value.close() }),
    (value): value is Translation.Translation => value instanceof Translation.Translation,
    () => ({
      repository: getConfigurationRepositories(owner),
      log,
      config,
      getBrand: name => branding.get().getBrand(name),
      availableBrands: () => branding.get().getAvailable(),
    })
  );
  const entries = portalDomain(
    'i18nEntries',
    ['translation'],
    (input: ConstructorParameters<typeof I18nEntries>[0]) => new I18nEntries(input),
    noDomainResources,
    (value): value is I18nEntries => value instanceof I18nEntries,
    () => ({
      repository: getConfigurationRepositories(owner),
      log,
      localesDirectory: path.resolve(ports.localesDirectory),
      namespaces: config.i18n.next.init.ns,
      supportedLanguages: config.i18n.next.init.supportedLngs,
      allowedClasses: config.i18n.editor?.allowedClasses,
      getBrand: name => branding.get().getBrand(name),
      getBrandById: id => branding.get().getBrandById(id) ?? null,
      reloadResources: id => translation.get().reloadResources(id),
    })
  );
  const queries = portalDomain(
    'namedQueries',
    [],
    (input: ConstructorParameters<typeof Queries.NamedQueryService>[0]) => new Queries.NamedQueryService(input),
    noDomainResources,
    (value): value is Queries.NamedQueryService => value instanceof Queries.NamedQueryService,
    () => ({
      queries: refs().namedQueries,
      log,
      config,
      target: name => namedQueryTarget(owner, name),
      execute: (request, count) => executeNamedQuery(owner, request, count),
      records: { getRelatedRecords: (...args) => ports.records().getRelatedRecords(...args) },
    })
  );
  const reports = portalDomain(
    'reports',
    ['namedQueries', 'search'],
    (input: ConstructorParameters<typeof Reports.Reports>[0]) => new Reports.Reports(input),
    value => ({ initialize: async () => {}, close: () => value.close() }),
    (value): value is Reports.Reports => value instanceof Reports.Reports,
    () => ({
      reports: refs().reports,
      namedQueries: queries.get(),
      search: ports.search(),
      config,
      log,
      portalUrl: params =>
        config.server.rootContext +
        '/' +
        (params.param('branding') ?? config.auth.defaultBrand) +
        '/' +
        (params.param('portal') ?? config.auth.defaultPortal),
    })
  );
  const pathRules = new PathRules(() =>
    getIdentityRepositories(owner).list('pathrule', {}, { populate: ['role', 'branding'] })
  );
  const modules = [
    typeface,
    branding,
    appConfigs,
    roles,
    types,
    workflows,
    sanitizer,
    vocabulary,
    validation,
    forms,
    schema,
    dashboardConfig,
    dashboards,
    workspaceTypes,
    translation,
    entries,
    queries,
    reports,
  ];
  const bootstrap: ApplicationWork[] = [
    {
      name: 'branding',
      run: async () => {
        await firstValueFrom(branding.get().bootstrap());
      },
    },
    {
      name: 'roles',
      run: async () => {
        await firstValueFrom(roles.get().bootstrap(branding.get().getDefault()));
      },
    },
    {
      name: 'administrator-and-policies',
      run: async () => {
        const brand = branding.get().getDefault();
        const defRoles = await firstValueFrom(roles.get().getRolesWithBrand(brand));
        const administrator = roles.get().getAdminFromRoles(defRoles);
        if (!administrator) throw new Error('Default administrator role is unavailable.');
        await bootstrapDefaultAdministrator({
          repository: getIdentityRepositories(owner),
          auth: config.brandingConfigurationDefaults.auth,
          roles: defRoles,
          administrator,
        });
        await bootstrapPathRules({
          repository: getIdentityRepositories(owner),
          brandId: brand.id,
          rules: config.auth.rules,
          readRules: () => getIdentityRepositories(owner).list('pathrule'),
          roleId: name => roles.get().getRole(brand, name)?.id,
        });
        await pathRules.loadRules();
      },
    },
    { name: 'record-types', run: () => types.get().initialize(branding.get().getDefault()) },
    {
      name: 'dashboard-types',
      run: async () => {
        await dashboards.get().bootstrap(branding.get().getDefault());
      },
    },
    {
      name: 'workflows-and-forms',
      run: async () => {
        const allTypes = await refs().recordTypes.listForBrand(branding.get().getDefault().id);
        const stages = await workflows.get().bootstrap(allTypes);
        // Require the stored form binding for every stage, including hidden ones.
        for (const type of allTypes)
          for (const step of await refs().workflows.listForRecordType(type.id)) {
            if (typeof step.config.form !== 'string' || !step.config.form)
              throw new Error('Persisted workflow stage has no form binding.');
            await forms
              .get()
              .bootstrap(
                { id: step.id, starting: step.starting, config: { form: step.config.form } },
                branding.get().getDefault().id
              );
          }
        log.debug(`Workflow bootstrap completed (${stages.length} result groups).`);
      },
    },
    { name: 'vocabulary', run: () => vocabulary.get().bootstrapData() },
    { name: 'reports', run: () => reports.get().bootstrapData(branding.get().getDefault()) },
    { name: 'named-queries', run: () => queries.get().bootstrapData(branding.get().getDefault()) },
    {
      name: 'translations',
      run: async () => {
        await entries.get().bootstrap();
        await translation.get().bootstrap();
      },
    },
    { name: 'app-configuration', run: () => appConfigs.get().bootstrap() },
    {
      name: 'workspace-types',
      run: async () => {
        await firstValueFrom(workspaceTypes.get().bootstrap(branding.get().getDefault()));
      },
    },
  ];
  const postBootstrap: ApplicationWork[] = [
    { name: 'record-schema', run: () => schema.get().bootstrap() },
    {
      name: 'dashboard-settings',
      run: async () => {
        await dashboardConfig.get().initialiseAfterBootstrap();
      },
    },
  ];
  const migrations: ApplicationMigration[] = [
    {
      name: RECORD_HOOK_OPERATIONS_MIGRATION_NAME,
      source: 'core',
      up: async () => {
        const result = await migrateRecordHooks({ brands: brands(), types: refs().recordTypes });
        log.info(`Record hook operations: inspected ${result.inspected}, converted ${result.changed} record types.`);
      },
    },
    {
      name: QUEUED_RECORD_HOOK_OPERATIONS_MIGRATION_NAME,
      source: 'core',
      up: async () => {
        const result = await migrateRecordHooks({ brands: brands(), types: refs().recordTypes });
        log.info(`Record hook operations: inspected ${result.inspected}, converted ${result.changed} record types.`);
      },
    },
    {
      name: BRANDING_TYPEFACE_MIGRATION_NAME,
      source: 'core',
      up: () =>
        migrateBrandingTypefaces({ repository: brands(), historyMaxVersions: config.branding.historyMaxVersions, log }),
    },
    {
      name: DASHBOARD_CONFIGURATION_MIGRATION_NAME,
      source: 'core',
      up: () => dashboardConfig.get().migrateLegacyConfiguration(),
    },
    {
      name: '20261014T000000-admin-sidebar-text-color',
      source: 'core',
      up: async () => {
        const updated = await brands().migrateAdminSidebarTextColor();
        log.info(`Admin sidebar text colour: migrated ${updated} branding and history settings.`);
      },
    },
  ];
  return {
    modules,
    bootstrap,
    postBootstrap,
    migrations,
    branding,
    typeface,
    theme,
    roles,
    appConfigs,
    types,
    workflows,
    forms,
    validation,
    sanitizer,
    vocabulary,
    schema,
    dashboardConfig,
    dashboards,
    workspaceTypes,
    translation,
    entries,
    queries,
    reports,
    pathRules,
  };
}
