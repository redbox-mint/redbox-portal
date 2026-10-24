'use strict';
// Serialized integration fixtures bind the actual selected production domains.
// No framework or service globals are installed.
const path = require('node:path');
const assert = require('node:assert/strict');
const { createPortalHost, persistenceStatus } = require('@researchdatabox/redbox-core/portal');
const { portalFixture: fixture } = require('./helpers/portalFixture.cjs');
const chai = require('chai');
Object.assign(global, {
  chai,
  expect: chai.expect,
  should: chai.should(),
  _: require('lodash'),
  DateTime: require('luxon').DateTime,
});
let portal;
let fixtureConfig;
before(async function () {
  this.timeout(300000);
  const log = Object.fromEntries(
    ['info', 'warn', 'error', 'fatal', 'debug', 'trace', 'verbose', 'silly', 'crit', 'log', 'blank', 'silent'].map(
      name => [
        name,
        (...args) => {
          if (['warn', 'error', 'fatal'].includes(name)) console.error(name, ...args);
        },
      ]
    )
  );
  const { REDBOX_APPLICATION_CONFIG, REDBOX_ENVIRONMENT_CONFIG, REDBOX_LOCAL_CONFIG, ...env } = process.env;
  portal = await createPortalHost({
    appPath: process.cwd(),
    environment: 'integrationtest',
    includeDevDependencies: true,
    env,
    files: {
      application: REDBOX_APPLICATION_CONFIG,
      environment: REDBOX_ENVIRONMENT_CONFIG,
      local: REDBOX_LOCAL_CONFIG,
    },
    log,
    requestLogging: () => fixtureConfig?.log?.requestChronicle,
    localesDirectory: path.resolve('language-defaults'),
  });
  await portal.host.initialize();
  await portal.host.activate();
  const data = portal.data,
    ref = data.reference,
    providers = portal.providers;
  const names = {
    BrandingService: ref.branding.get(),
    BrandingTypefaceService: ref.typeface.get(),
    BrandingThemeCssService: ref.theme,
    AppConfigService: ref.appConfigs.get(),
    RecordTypesService: ref.types.get(),
    WorkflowStepsService: ref.workflows.get(),
    FormsService: ref.forms.get(),
    RecordValidationService: ref.validation.get(),
    RecordSchemaService: ref.schema.get(),
    DomSanitizerService: ref.sanitizer.get(),
    VocabularyService: ref.vocabulary.get(),
    RolesService: ref.roles.get(),
    DashboardConfigService: ref.dashboardConfig.get(),
    DashboardTypesService: ref.dashboards.get(),
    WorkspaceTypesService: ref.workspaceTypes.get(),
    TranslationService: ref.translation.get(),
    I18nEntriesService: ref.entries.get(),
    NamedQueryService: ref.queries.get(),
    ReportsService: ref.reports.get(),
    PathRulesService: ref.pathRules,
    StorageManagerService: data.disks.get(),
    AgendaQueueService: data.queue.get(),
    UsersService: data.users.get(),
    StandardDatastreamService: data.datastream.get(),
    SolrSearchService: data.search.get(),
    RecordsService: data.records.get(),
    WorkspaceService: data.workspaces.get(),
    WorkspaceAsyncService: data.workspaceWorkers.get(),
    RDMPService: data.triggers.get(),
    TriggerService: data.workflowTriggers.get(),
    RvaImportService: data.rva.get(),
    AsynchsService: data.progress.get(),
    HarvestRunService: data.harvest.get(),
    FormVocabularyService: data.lookups.get(),
    MongoStorageService: data.storage(),
    EmailService: providers.email.get(),
    NotificationService: providers.notifications.get(),
    IntegrationAuditService: providers.audits.get(),
    SecurityEventService: providers.security.get(),
    SiemForwardingService: providers.siem.get(),
    DoiService: providers.doi.get(),
    DOIService: providers.doi.get(),
    FigshareVocabularyService: providers.figshareVocabulary.get(),
    FigshareService: providers.figshare.get(),
  };
  // Existing integration cases exercise mutable fixture configuration and legacy
  // helper APIs. Rebind only their test inputs; production configuration stays frozen.
  fixtureConfig = require('lodash').cloneDeep(portal.config);
  const configClones = new WeakMap();
  const pairConfig = (original, fixture) => {
    if (!original || typeof original !== 'object' || !fixture || typeof fixture !== 'object') return;
    configClones.set(original, fixture);
    for (const key of Object.keys(original)) pairConfig(original[key], fixture[key]);
  };
  pairConfig(portal.config, fixtureConfig);
  Object.assign(fixtureConfig, {
    port: portal.host.address().port,
    appPath: process.cwd(),
    rootContext: portal.config.server.rootContext.replace(/^\//, ''),
    appUrl: portal.config.server.publicUrl,
    security: { csrf: true },
    http: { rootContext: portal.config.server.rootContext.replace(/^\//, '') },
  });
  for (const value of Object.values(names)) {
    for (const field of ['input', 'dependencies']) {
      const ports = value && Reflect.get(value, field);
      if (ports && typeof ports === 'object' && 'config' in ports)
        ports.config = require('lodash').cloneDeepWith(ports.config, value =>
          value && typeof value === 'object' ? configClones.get(value) : undefined
        );
    }
  }
  const coreRoot = path.dirname(require.resolve('@researchdatabox/redbox-core'));
  fixtureConfig.validators = require(path.join(coreRoot, 'config/validators.config.js')).validators;
  fixtureConfig.log = { ...require(path.join(coreRoot, 'config/log.config.js')).log };
  fixtureConfig.lognamespace = {};
  fixtureConfig.brandingAware = name => names.AppConfigService.getAppConfigurationForBrand(name);
  fixtureConfig.recordContractContributorState = {
    registrations: names.RecordSchemaService.dependencies.getContributorRegistry().registrations(),
  };
  // Existing tests replace these collaborators and primitive bootstrap settings.
  // Accessors keep that explicit test injection on the production domain instances.
  Object.defineProperty(names.DashboardTypesService.input, 'dashboardConfig', {
    get: () => fixture.services.DashboardConfigService,
  });
  for (const [key, read] of Object.entries({
    bootstrapDataPath: () => fixtureConfig.bootstrap.bootstrapDataPath,
    bootstrapFigshareImports: () => fixtureConfig.vocab.bootstrapFigshareImports,
  }))
    Object.defineProperty(names.FigshareVocabularyService.input, key, { get: read });
  const { createFigshareConfiguration } = require(path.join(coreRoot, 'integrations/figshare/config.js'));
  const figshareConfiguration = createFigshareConfiguration({
    configuration: name => names.AppConfigService.getAppConfigurationForBrand(name),
    brandById: id => names.BrandingService.getBrandById(id),
    brandByName: name => names.BrandingService.getBrand(name),
    get development() {
      return fixtureConfig.figshareDev ?? { enabled: false, mode: 'live' };
    },
    environment: 'integrationtest',
    log,
  });
  names.FigshareVocabularyService.input.configuration = figshareConfiguration.resolveFigshareVocabularyConfig;
  names.RecordSchemaService.dependencies.getConfig = () => fixtureConfig.recordSchema;
  portal.owner.config = fixtureConfig;
  const { getCacheEntryRepository, getBrandingRepository, getStorageRepositories, mongoDatabase } = require('@researchdatabox/redbox-core');
  const { Services: Cache } = require(path.join(coreRoot, 'services/CacheService.js'));
  names.CacheService = new Cache.Cache({ entries: () => getCacheEntryRepository(portal.owner), config: fixtureConfig, log });
  const { Services: Logos } = require(path.join(coreRoot, 'branding/BrandingLogo.js'));
  names.BrandingLogoService = new Logos.BrandingLogo({
    repository: getBrandingRepository(portal.owner), disk: () => data.disks.get().primaryDisk(),
    legacyDatabase: () => mongoDatabase(portal.owner, 'mongodb'),
    sanitize: ref.sanitizer.get().sanitize.bind(ref.sanitizer.get()), config: fixtureConfig.branding, log,
  });
  const { Services: Contrast } = require(path.join(coreRoot, 'services/ContrastService.js'));
  names.ContrastService = new Contrast.Contrast(log);
  const { Services: Templates } = require(path.join(coreRoot, 'pages/Templates.js'));
  names.TemplateService = new Templates.Template(log);
  const { Services: AttachmentMetadata } = require(path.join(coreRoot, 'services/AttachmentMetadataService.js'));
  names.AttachmentMetadataService = new AttachmentMetadata.AttachmentMetadataService(getStorageRepositories(portal.owner).attachments);
  const { FormProjection } = require(path.join(coreRoot, 'forms/FormProjection.js'));
  Object.assign(fixture, {
    services: names, owner: portal.owner, config: fixtureConfig, log,
    projection: new FormProjection(log), server: Reflect.get(portal.host, 'server'),
  });
  await names.CacheService.bootstrap();
  const router = Reflect.get(portal.host, 'router');
  const dynamic = require('express').Router();
  router.use(dynamic);
  const layer = router.stack.pop();
  router.stack.splice(
    router.stack.findIndex(layer => layer.route),
    0,
    layer
  );
  fixture.routes = {
    bind: (path, handler) => dynamic.all(path, handler),
    unbind: path => {
      dynamic.stack = dynamic.stack.filter(layer => layer.route?.path !== path);
    },
  };
  const address = portal.host.address();
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/readyz`)).status, 200);
  console.log('Existing integration suites bound to selected Express host:', JSON.stringify(address));
});
after(async function () {
  this.timeout(120000);
  if (fixture.services?.BrandingLogoService) await fixture.services.BrandingLogoService.close();
  fixture.services?.CacheService?.cache?.close();
  if (portal) {
    await portal.host.stop();
    assert.equal(persistenceStatus(portal.owner).pools, 0);
    console.log('Express integration owner drained:', JSON.stringify(persistenceStatus(portal.owner)));
  }
  for (const key of Object.keys(fixture)) delete fixture[key];
});
