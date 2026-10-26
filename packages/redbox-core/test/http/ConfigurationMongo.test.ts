import { Passport } from 'passport';
import {
  installLocalAuthentication,
  installAafAuthentication,
  installOidcAuthentication,
} from '../../src/http/express/identityProviders';
import type { AuthBrandConfig } from '../../src/authentication/Accounts';
import { mountConfigurationWriteRoutes } from '../../src/http/express/configurationWrites';
import { createHttpCsrf, mountCsrfTokenRoute } from '../../src/http/express/csrf';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';
import { Services as VocabularyDomain } from '../../src/vocabulary/Vocabulary';
import { Services as SanitizerDomain } from '../../src/forms/DomSanitizer';
import { Services as PrehydrateDomain } from '../../src/forms/FormPayloadPrehydrate';
import { ContextVariables } from '../../src/forms/ContextVariables';
import { resolveRecordFormFingerprint } from '../../src/RecordFormFingerprint';
import { mountFormDeliveryRoutes } from '../../src/http/express/formDelivery';
import { ensureVocabularyPersistenceIndexes } from '../../src/persistence/vocabulary/preflight';
import { initializeVocabularyPersistence, getVocabularyRepositories } from '../../src/persistence/vocabulary/runtime';
import { dompurify } from '../../src/config/dompurify.config';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Services as TranslationRuntime } from '../../src/translations/Translation';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { firstValueFrom } from 'rxjs';
import { Services as WorkflowServices } from '../../src/workflows/WorkflowSteps';
import { Services as WorkspaceServices } from '../../src/workspaces/WorkspaceTypes';
import { Services as DashboardServices } from '../../src/dashboards/DashboardTypes';
import { Services as DashboardConfiguration } from '../../src/dashboards/DashboardConfig';
import { Services as SchemaServices } from '../../src/recordSchema/RecordSchema';
import { recordSchema } from '../../src/config/recordSchema.config';
import { createCoreRecordContractContributors, RecordContractContributorRegistry } from '../../src/record-contract';
import { mountMetadataReadRoutes } from '../../src/http/express/metadata';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { AppConfigs, APP_CONFIG_SECRET_MASK, type AppConfigsInput } from '../../src/configuration/AppConfigs';
import { resolveExtensions } from '../../src/extensions/resolution';
import { bindExtensionFactory } from '../../src/extensions/composition';
import { ConfigModelRegistry } from '../../src/configuration/ConfigModelRegistry';
import { I18nEntries } from '../../src/translations/I18nEntries';
import { Forms } from '../../src/forms/Forms';
import { RecordValidation, type RecordValidationServiceDependencies } from '../../src/forms/RecordValidation';
import { hasViewAccess, hasEditAccess, hasTransitionRoleAuthorization } from '../../src/records/access';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import type { RecordModel } from '../../src/model/storage/RecordModel';
import { ensureConfigurationPersistenceIndexes } from '../../src/persistence/configuration/preflight';
import {
  initializeConfigurationPersistence,
  getConfigurationRepositories,
} from '../../src/persistence/configuration/runtime';
import { getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { mountConfigurationReadRoutes } from '../../src/http/express/configuration';
import { pilotPolicyChain } from '../../src/http/express/policies';
import { pilotFixture } from './pilotFixture';
import { registerPersistenceResource } from '../../src/persistence/runtime';

async function configurationFixture() {
  let appConfigs!: AppConfigs;
  let translations!: I18nEntries;
  let translationRuntime!: TranslationRuntime.Translation;
  let forms!: Forms;
  let dashboardConfig!: DashboardConfiguration.DashboardConfig;
  let failReads = false;
  let failWrites = false;
  let overrideWrites = 0;
  let delayedWrite:
    | {
        entered: ReturnType<typeof Promise.withResolvers<void>>;
        release: ReturnType<typeof Promise.withResolvers<void>>;
      }
    | undefined;
  let overrideReads = 0;
  let delayedRead:
    | {
        entered: ReturnType<typeof Promise.withResolvers<void>>;
        release: ReturnType<typeof Promise.withResolvers<void>>;
      }
    | undefined;
  const f = await pilotFixture({
    rootContext: '/portal',
    prepareRoutes: async (router, f, policies, recordTypes) => {
      await ensureConfigurationPersistenceIndexes(f.owner);
      await initializeConfigurationPersistence(f.owner);
      const repository = getConfigurationRepositories(f.owner);
      const references = getReferenceRepositories(f.owner);
      const brands = [f.brand, f.otherBrand].map(row => Object.assign(new BrandingModel(), row));
      const appConfigInput: AppConfigsInput = {
        repository,
        models: new ConfigModelRegistry(),
        config: {},
        log: nothingLogger,
        availableBrands: () => brands.map(brand => brand.name),
        getBrand: name => brands.find(brand => brand.name === name)!,
      };
      const core = {
        name: 'appConfigs',
        create: (_input: AppConfigsInput): AppConfigs => {
          throw new Error('Replaced core factory must not construct');
        },
      };
      class HookAppConfigs extends AppConfigs {
        public override async createOrUpdateConfig(...args: Parameters<AppConfigs['createOrUpdateConfig']>) {
          overrideWrites++;
          if (failWrites) throw new Error('private write credentials');
          if (delayedWrite) {
            delayedWrite.entered.resolve();
            await delayedWrite.release.promise;
          }
          return super.createOrUpdateConfig(...args);
        }
        public override async getAppConfigByBrandAndKey(brand: string, key: string): Promise<unknown> {
          overrideReads++;
          if (failReads) throw new Error('private backend credentials');
          if (delayedRead) {
            delayedRead.entered.resolve();
            await delayedRead.release.promise;
          }
          return super.getAppConfigByBrandAndKey(brand, key);
        }
      }
      const hook = {
        name: 'appConfigs',
        replaces: true as const,
        create: (input: AppConfigsInput) => new HookAppConfigs(input),
      };
      const resolved = resolveExtensions([
        { name: 'core', root: process.cwd(), declaration: { apiVersion: 1, modules: [core] } },
        { name: 'fixture-hook', root: process.cwd(), declaration: { apiVersion: 1, modules: [hook] } },
      ]);
      assert.equal(resolved.modules.length, 1);
      assert.equal(resolved.modules[0].declaration, hook);
      appConfigs = bindExtensionFactory(hook, appConfigInput)();
      registerPersistenceResource(f.owner, 'configuration-domain', { close: () => appConfigs.close() });
      await appConfigs.bootstrap();
      const localeDirectory = await mkdtemp(path.join(tmpdir(), 'redbox-metadata-locales-'));
      registerPersistenceResource(f.owner, 'fixture-locales', {
        close: () => rm(localeDirectory, { recursive: true, force: true }),
      });
      await mkdir(path.join(localeDirectory, 'fr'));
      await writeFile(
        path.join(localeDirectory, 'fr', 'fallback.json'),
        JSON.stringify({ greeting: 'Bonjour', _meta: { source: 'packaged' } })
      );
      translationRuntime = new TranslationRuntime.Translation({
        repository,
        log: nothingLogger,
        config: { i18n: { next: { init: { supportedLngs: ['en'] } } } },
        getBrand: name => brands.find(brand => brand.name === name || brand.id === name)!,
        availableBrands: () => brands.map(brand => brand.name),
      });
      registerPersistenceResource(f.owner, 'translation-runtime', { close: () => translationRuntime.close() });
      translations = new I18nEntries({
        repository,
        localesDirectory: localeDirectory,
        log: nothingLogger,
        getBrand: name => brands.find(brand => brand.name === name) ?? null,
        getBrandById: id => brands.find(brand => brand.id === id) ?? null,
        supportedLanguages: ['en'],
        reloadResources: id => translationRuntime.reloadResources(id),
      });
      const loadRecord = async (oid: string) =>
        f.native
          .db()
          .collection<RecordModel>('metadataFixtureRecords')
          .findOne({ redboxOid: oid }, { projection: { _id: 0 } });
      const workflowSteps = new WorkflowServices.WorkflowSteps({
        references,
        config: { appmode: {}, workflow: {} },
        log: nothingLogger,
        initialiseDashboardSettings: async () => {},
      });
      await ensureVocabularyPersistenceIndexes(f.owner);
      await initializeVocabularyPersistence(f.owner);
      const vocabulary = new VocabularyDomain.VocabularyService({
        repository: getVocabularyRepositories(f.owner),
        config: {},
        log: nothingLogger,
        getBrand: name => brands.find(brand => brand.name === name || brand.id === name) ?? null,
        defaultBrand: () => 'default',
      });
      await vocabulary.create({
        name: 'Fixture tree',
        slug: 'fixture-tree',
        branding: f.brand.id,
        type: 'tree',
        entries: [{ label: 'Alpha', value: 'A', identifier: 'A' }],
      });
      const sanitizer = new SanitizerDomain.DomSanitizer({ config: { dompurify }, log: nothingLogger });
      registerPersistenceResource(f.owner, 'form-sanitizer', { close: () => sanitizer.close() });
      assert(!sanitizer.sanitizeWithProfile('<p>Safe</p><script>alert(1)</script>', 'html').includes('<script'));
      const prehydrate = new PrehydrateDomain.FormPayloadPrehydrateService({
        config: {},
        log: nothingLogger,
        vocabulary,
      });
      const readers: RecordValidationServiceDependencies = {
        loadRecord,
        loadRecordType: (brand, name) => references.recordTypes.findByName(brand, name),
        loadStartingWorkflowStep: async type =>
          (await references.workflows.findStarting(type.id ?? '')) as Awaited<
            ReturnType<RecordValidationServiceDependencies['loadStartingWorkflowStep']>
          >,
        loadWorkflowStep: async (type, step) =>
          (await references.workflows.findByName(type.id ?? '', step)) as Awaited<
            ReturnType<RecordValidationServiceDependencies['loadWorkflowStep']>
          >,
        loadWorkflowSteps: async type =>
          (await references.workflows.listForRecordType(type.id ?? '', false)) as Awaited<
            ReturnType<RecordValidationServiceDependencies['loadWorkflowSteps']>
          >,
        loadForm: async (name, brand) =>
          (await references.forms.findByName(name, brand)) as Awaited<
            ReturnType<RecordValidationServiceDependencies['loadForm']>
          >,
        // Production construction is used; this explicit field is not passed as an override below.
        constructForm: async () => {
          throw new Error('Unexpected fixture override');
        },
      };
      const validation = new RecordValidation({
        readers,
        config: { recordSchema },
        log: nothingLogger,
        html: {
          sanitizeWithProfile: (value, profile) => sanitizer.sanitizeWithProfile(value, profile),
          htmlSanitizationMode: () => 'sanitize',
        },
      });
      forms = new Forms({
        repository: references,
        config: { appmode: {} },
        log: nothingLogger,
        formRegistry: () => ({}),
        defaultBrand: () => brands[0],
        recordTypes,
        workflowSteps,
        validation,
        records: {
          hasViewAccess,
          hasEditAccess,
          hasTransitionRoleAuthorization,
          getMeta: async oid => {
            const record = await loadRecord(oid);
            if (!record) throw new Error('Missing record');
            return record;
          },
        },
        vocabulary: {
          defaultBrand: () => 'default',
          getEntries: (...args) => vocabulary.getEntries(...args),
        },
      });
      await references.forms.createDefinition({
        name: 'default-1.0-draft',
        branding: f.brand.id,
        configuration: {
          name: 'default-1.0-draft',
          type: 'dataRecord',
          componentDefinitions: [
            {
              name: 'title',
              component: { class: 'SimpleInputComponent', config: { type: 'text' } },
              model: { class: 'SimpleInputModel', config: {} },
            },
            {
              name: 'choice',
              component: { class: 'DropdownInputComponent', config: { vocabRef: 'fixture-tree', inlineVocab: true } },
              model: { class: 'DropdownInputModel', config: {} },
            },
            {
              name: 'codes',
              component: { class: 'CheckboxTreeComponent', config: { vocabRef: 'fixture-tree' } },
              model: { class: 'CheckboxTreeModel', config: {} },
            },
          ],
          enabledValidationGroups: ['base'],
          validationGroups: { base: { description: 'base', initialMembership: 'all' } },
          validationOperations: { draft: { label: 'Save draft', enabledValidationGroups: ['base'], roles: ['Admin'] } },
        },
      });
      const type = await references.recordTypes.findByName(f.brand.id, 'dataRecord');
      assert(type);
      await references.workflows.createDefinition({
        name: 'draft',
        recordType: type.id,
        starting: true,
        hidden: false,
        config: { form: 'default-1.0-draft', authorization: { transitionRoles: ['Admin'] } },
      });
      const access = {
        edit: ['pilot-admin'],
        view: [],
        editRoles: [],
        viewRoles: [],
        editPending: [],
        viewPending: [],
      };
      for (const [oid, brandId] of [
        ['owned-record', f.brand.id],
        ['other-record', f.otherBrand.id],
      ]) {
        await f.native
          .db()
          .collection<RecordModel>('metadataFixtureRecords')
          .insertOne({
            id: oid,
            redboxOid: oid,
            harvestId: '',
            metadata: { title: 'Stored title', codes: [{ notation: 'A' }] },
            revision: 3,
            metaMetadata: {
              brandId,
              createdBy: 'pilot-admin',
              type: 'dataRecord',
              form: 'default-1.0-draft',
              searchCore: 'redbox',
              attachmentFields: [],
            },
            workflow: { stage: 'draft', stageLabel: 'Draft' },
            authorization: { ...access, stored: access },
            dateCreated: new Date().toISOString(),
            lastSaveDate: new Date().toISOString(),
          });
      }
      await references.forms.createDefinition({
        name: 'private-other',
        branding: f.otherBrand.id,
        configuration: { componentDefinitions: [] },
      });
      await appConfigs.createOrUpdateConfig(brands[0], 'doiPublishing', {
        connection: { password: 'synthetic-doi-password' },
      });
      await translations.setEntry(brands[0], 'en', 'translation', 'heading/with/slashes', 'First value');
      await translations.setEntry(brands[1], 'en', 'translation', 'private', 'Other brand');
      await translationRuntime.bootstrap();
      const workspaceTypes = new WorkspaceServices.WorkspaceTypes({
        references,
        config: { workspacetype: {} },
        log: nothingLogger,
        bootstrapProviders: [],
      });
      await firstValueFrom(workspaceTypes.create(brands[0], { name: 'dataRecord', label: 'Research data' }));
      await firstValueFrom(workspaceTypes.create(brands[1], { name: 'private', label: 'Private other workspace' }));
      const registry = new RecordContractContributorRegistry(
        createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' }))
      );
      const schema = new SchemaServices.RecordSchema({
        getConfig: () => recordSchema,
        getStorageProvider: () => undefined,
        getContributorRegistry: () => registry,
        getContributorRegistrationIssues: () => [],
        getContributorComponentTypes: () =>
          registry
            .registrations()
            .flatMap(item => (item.contributor.kind === 'component' ? [item.contributor.componentType] : [])),
        getConfiguredFormCandidates: () => forms.listConfiguredRecordContractForms(),
        resolveContractContext: request => validation.resolveContractContext(request),
        buildContractFormConfig: (context, access) => forms.buildContractFormConfig(context, access),
        authorizeCreate: async (context, caller) =>
          caller.brand.id === context.publicContext.brand && caller.user.roles.some(role => role.name === 'Admin'),
        authorizeUpdate: async () => false,
        clock: Date.now,
        telemetryLogger: nothingLogger,
      });
      schema.init();
      const dashboardview = {
        consolidated: {
          name: 'consolidated',
          titleLabelKey: 'All records',
          dashboardType: 'standard',
          sourceRecordType: 'dataRecord',
          steps: [
            {
              name: 'all',
              sourceRecordType: 'dataRecord',
              fetchMode: 'allForRecordType' as const,
              dashboardTable: { rowConfig: [] },
            },
          ],
        },
      };
      dashboardConfig = new DashboardConfiguration.DashboardConfig({
        references,
        configuration: repository,
        brands: f.branding,
        migrations: { isExecuted: async () => true },
        config: { dashboardview },
        log: nothingLogger,
        recordTypes,
        workflowSteps,
        schema,
        availableBrands: () => brands.map(brand => brand.name),
        getBrand: name => brands.find(brand => brand.name === name)!,
      });
      await dashboardConfig.migrateLegacyConfiguration();
      await dashboardConfig.initialiseAfterBootstrap();
      registerPersistenceResource(f.owner, 'dashboardDomain', { close: () => dashboardConfig.close() });
      registerPersistenceResource(f.owner, 'schemaDomain', { close: () => schema.close() });
      const dashboardTypes = new DashboardServices.DashboardTypes({
        references,
        configuration: repository,
        log: nothingLogger,
        config: { appmode: {}, dashboardtype: {}, recordtype: {}, workflow: {}, dashboardview },
        recordTypes,
        dashboardConfig,
      });
      await dashboardTypes.createDashboardType(brands[0], {
        name: 'standard',
        formatRules: {},
        tableConfig: { rowConfig: [] },
      });
      await f.identities.create('pathrule', {
        path: '/:branding/:portal/admin/dashboard-config(/*)',
        role: f.role.id,
        branding: f.brand.id,
        can_update: true,
      });
      mountMetadataReadRoutes(router, {
        recordTypes,
        workflowSteps,
        workspaceTypes,
        dashboardTypes,
        dashboardConfig,
        translations,
        policies,
        policyConfiguration: {
          '*': [...pilotPolicyChain],
          TranslationController: { getNamespace: ['noCache', 'brandingAndPortal'] },
        },
      });
      mountFormDeliveryRoutes(router, {
        delivery: {
          forms,
          recordTypes,
          workflowSteps,
          prehydrate,
          loadRecord,
          canView: async (brand, user, record) =>
            !!user && hasViewAccess(brand, user, user.roles, record as unknown as Record<string, unknown>),
          canEdit: async (brand, user, record) =>
            !!user &&
            hasEditAccess(
              brand,
              user,
              user.roles.map(role => ({ ...role })),
              record as unknown as Record<string, unknown>
            ),
          fingerprint: (record, type, form) =>
            resolveRecordFormFingerprint(
              {
                loadForm: (name, brand) => firstValueFrom(forms.getFormByName(name, true, brand)),
                loadWorkflowSteps: type => references.workflows.listForRecordType(String(type.id), false),
              },
              record,
              type,
              form
            ),
        },
        contextVariables: new ContextVariables({ title: { source: 'metadata', field: 'title' } }, nothingLogger),
        policies,
        policyConfiguration: { '*': [...pilotPolicyChain] },
      });
      for (const path of ['/:branding/:portal/appconfig(/*)', '/:branding/:portal/app/i18n(/*)'])
        await f.identities.create('pathrule', { path, role: f.role.id, branding: f.brand.id, can_update: true });
      const csrf = createHttpCsrf({
        origins: ['http://127.0.0.1'],
        authenticateBearer: token => f.identity.bearer(token),
      });
      mountCsrfTokenRoute(router, csrf);
      mountConfigurationWriteRoutes(router, {
        appConfigs,
        translations,
        dashboardConfig,
        csrf,
        policies,
        reloadTranslations: id => translationRuntime.reloadResources(id),
        policyConfiguration: { '*': [...pilotPolicyChain] },
      });
      mountConfigurationReadRoutes(router, {
        appConfigs,
        translations,
        forms,
        loadRecord,
        policies,
        policyConfiguration: { '*': [...pilotPolicyChain] },
      });
    },
  });
  await f.pathRules.loadRules();
  return {
    ...f,
    appConfigs,
    translations,
    translationRuntime,
    forms,
    dashboardConfig,
    failReads: (value: boolean) => {
      failReads = value;
    },
    overrideReads: () => overrideReads,
    overrideWrites: () => overrideWrites,
    failWrites: (value: boolean) => {
      failWrites = value;
    },
    delayWrite: () =>
      (delayedWrite = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }),
    delayRead: () => (delayedRead = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }),
    close: f.close,
  };
}

describe('configuration, translations and forms on standalone Mongo HTTP', function () {
  this.timeout(45_000);
  let f: Awaited<ReturnType<typeof configurationFixture>>;
  before(async () => {
    f = await configurationFixture();
  });
  after(async () => {
    await f?.close();
  });
  const base = '/default/rdmp/api/';
  async function read(route: string, headers = f.headers) {
    const response = await fetch(f.url + route, { headers, signal: AbortSignal.timeout(5000) });
    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) : null;
    return { response, body };
  }
  it('preserves defaults, override headers, masking and live persisted changes', async () => {
    const initial = await read(base + 'appconfig/systemMessage');
    assert.equal(initial.response.status, 200);
    assert.equal(initial.response.headers.get('x-redbox-config-source'), 'default');
    assert.equal(Reflect.get(initial.body as object, 'enabled'), false);
    const secret = await read(base + 'appconfig/doiPublishing');
    assert.equal(secret.response.headers.get('x-redbox-config-source'), 'override');
    assert(JSON.stringify(secret.body).includes(APP_CONFIG_SECRET_MASK));
    assert(!JSON.stringify(secret.body).includes('synthetic-doi-password'));
    await f.appConfigs.createOrUpdateConfig(Object.assign(new BrandingModel(), f.brand), 'systemMessage', {
      enabled: true,
      title: 'Dynamic change',
    });
    const changed = await read(base + 'appconfig/systemMessage');
    assert.equal(Reflect.get(changed.body as object, 'title'), 'Dynamic change');
    assert.equal(changed.response.headers.get('x-redbox-config-source'), 'override');
  });
  it('preserves decoded slash keys, prefix filtering, bundles and missing-result errors', async () => {
    for (const key of ['heading/with/slashes', 'heading%2Fwith%2Fslashes']) {
      const value = await read(base + 'i18n/entries/en/translation/' + key);
      assert.equal(value.response.status, 200);
      assert.equal(Reflect.get(value.body as object, 'value'), 'First value');
    }
    const list = await read(base + 'i18n/entries?locale=en&keyPrefix=heading/');
    assert(Array.isArray(list.body));
    assert.equal(list.body.length, 1);
    const bundle = await read(base + 'i18n/bundles/en/translation');
    assert.equal(bundle.response.status, 200);
    assert.equal((await read(base + 'i18n/entries/en/translation/missing')).response.status, 404);
    assert.equal((await read(base + 'i18n/bundles/zz/translation')).response.status, 404);
  });
  it('preserves form lists, strips server operation policy and handles editable coercion/missing form', async () => {
    const list = await read(base + 'forms');
    assert.equal(list.response.status, 200);
    assert.equal((list.body as { records: unknown[] }).records.length, 1);
    assert(!JSON.stringify(list.body).includes('private-other'));
    assert(!JSON.stringify(list.body).includes('Save draft'));
    const form = await read(base + 'forms/get?name=default-1.0-draft&editable=false');
    assert.equal(form.response.status, 200);
    assert.deepEqual((form.body as { validationOperations: unknown[] }).validationOperations, []);
    assert.equal((await read(base + 'forms/get?name=missing')).response.status, 404);
    assert.equal((await read(base + 'forms/get')).response.status, 400);
    assert.equal((await read(base + 'forms/get?name[a]=invalid')).response.status, 400);
  });
  it('rejects missing credentials, wrong brand and wrong role for every read contract', async () => {
    const routes = [
      'appconfig/systemMessage',
      'forms',
      'forms/get?name=default-1.0-draft',
      'i18n/entries?locale=en',
      'i18n/entries/en/translation/heading/with/slashes',
      'i18n/bundles/en/translation',
    ];
    for (const route of routes) {
      assert.equal((await read(base + route, {} as typeof f.headers)).response.status, 401);
      assert.equal((await read('/other/rdmp/api/' + route)).response.status, 403);
    }
    await f.identities.replaceMemberships('user', String(f.user.id), [f.reader.id]);
    try {
      for (const route of routes) assert.equal((await read(base + route)).response.status, 403);
    } finally {
      await f.identities.replaceMemberships('user', String(f.user.id), [f.role.id]);
    }
  });
  it('discovers only actor-authorized operations and fails closed on unresolved record context', async () => {
    const form = await read(base + 'forms/get?name=default-1.0-draft');
    const operations = (form.body as { validationOperations: { name: string }[] }).validationOperations;
    assert(
      operations.some(operation => operation.name === 'draft'),
      JSON.stringify(form.body)
    );
    assert(!JSON.stringify(operations).includes('roles'));
    assert(!JSON.stringify(operations).includes('enabledValidationGroups'));
    const unresolved = await read(base + 'forms/get?name=default-1.0-draft&oid=missing-record');
    assert.deepEqual((unresolved.body as { validationOperations: unknown[] }).validationOperations, []);
    const owned = await read(base + 'forms/get?name=default-1.0-draft&oid=owned-record');
    assert(
      (owned.body as { validationOperations: { name: string }[] }).validationOperations.some(
        operation => operation.name === 'draft'
      )
    );
    const crossBrand = await read(base + 'forms/get?name=default-1.0-draft&oid=other-record');
    assert.deepEqual((crossBrand.body as { validationOperations: unknown[] }).validationOperations, []);
    await f.identities.create('pathrule', {
      path: '/:branding/:portal/api(/*)',
      role: f.reader.id,
      branding: f.brand.id,
      can_update: true,
    });
    await f.pathRules.loadRules();
    await f.identities.replaceMemberships('user', String(f.user.id), [f.reader.id]);
    try {
      const denied = await read(base + 'forms/get?name=default-1.0-draft');
      assert.equal(denied.response.status, 200);
      assert.deepEqual((denied.body as { validationOperations: unknown[] }).validationOperations, []);
    } finally {
      await f.identities.replaceMemberships('user', String(f.user.id), [f.role.id]);
    }
  });
  it('rejects malformed URI input and preserves API versions, HEAD, OPTIONS and no-cache headers', async () => {
    const malformed = await fetch(f.url + base + 'i18n/entries/en/translation/%ZZ', { headers: f.headers });
    assert.equal(malformed.status, 400);
    await malformed.text();
    const result = await read(base + 'forms?apiVersion=2.0');
    assert.deepEqual(Object.keys(result.body as object), ['data', 'meta']);
    assert.equal(result.response.headers.get('cache-control'), 'no-cache, private');
    const head = await fetch(f.url + base + 'forms', { method: 'HEAD', headers: f.headers });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const options = await fetch(f.url + base + 'forms', { method: 'OPTIONS', headers: f.headers });
    assert.equal(options.status, 200);
    assert(options.headers.get('allow')?.includes('GET'));
    await options.text();
  });
  it('uses the selected hook operation and sanitizes a failed backend without falling back', async () => {
    assert(f.overrideReads() > 0);
    f.failReads(true);
    try {
      const failed = await read(base + 'appconfig/systemMessage');
      assert.equal(failed.response.status, 500);
      assert.equal((failed.body as { message: string }).message, 'Internal server error');
      assert(!JSON.stringify(failed.body).includes('private backend credentials'));
    } finally {
      f.failReads(false);
    }
    assert.equal((await read(base + 'appconfig/systemMessage')).response.status, 200);
  });
  it('keeps model registrations and dynamic settings isolated between application instances', async () => {
    const other = await configurationFixture();
    try {
      const response = await fetch(other.url + base + 'appconfig/systemMessage', { headers: other.headers });
      assert.equal(response.headers.get('x-redbox-config-source'), 'default');
      assert.equal((await response.json()).enabled, false);
      const registry = new ConfigModelRegistry();
      assert.equal(registry.getModelInfo('fixtureOnly'), undefined);
      registry.register('fixtureOnly', { modelName: 'FixtureOnly', class: class {}, schema: { type: 'object' } });
      assert.equal(new ConfigModelRegistry().getModelInfo('fixtureOnly'), undefined);
    } finally {
      await other.close();
    }
  });
  it('serves browser record/workspace metadata without leaking another brand or server-owned form policy', async () => {
    const types = await read('/default/rdmp/record/type');
    assert.equal(types.response.status, 200);
    assert.equal((types.body as Array<{ name: string }>)[0].name, 'dataRecord');
    assert(!JSON.stringify(types.body).includes('validationOperations'));
    const workspace = await read('/default/rdmp/workspaces/types');
    assert.equal(workspace.response.status, 200);
    assert.equal((workspace.body as { workspaceTypes: unknown[] }).workspaceTypes.length, 1);
    assert(!JSON.stringify(workspace.body).includes('Private other'));
    assert.equal((await read('/default/rdmp/workspaces/types/missing')).response.status, 200);
    assert.equal((await read('/default/rdmp/record/wfSteps/missing')).response.status, 400);
  });
  it('uses persisted independent dashboard settings in workflow and runtime reads', async () => {
    const target = { kind: 'workflow' as const, recordType: 'dataRecord', stage: 'draft' };
    const brand = Object.assign(new BrandingModel(), f.brand);
    const current = await f.dashboardConfig.getTargetSettings(brand, target);
    const settings = structuredClone(current.settings);
    settings.tableConfig.rowConfig = [
      { title: 'Dynamic column', variable: 'metadata.title', template: '{{metadata.title}}' },
    ];
    const validation = await f.dashboardConfig.validateTargetSettings(brand, target, current.revision, settings);
    await f.dashboardConfig.saveTargetSettings(brand, target, {
      expectedRevision: current.revision,
      settings,
      validationFingerprint: validation.validationFingerprint,
      acknowledgedWarningIds: validation.warnings.map(warning => warning.id),
    });
    const steps = await read('/default/rdmp/record/wfSteps/dataRecord');
    assert.equal(steps.response.status, 200);
    assert(JSON.stringify(steps.body).includes('Dynamic column'));
    const runtime = await read('/default/rdmp/dashboard/settings/workflow/dataRecord');
    assert.equal(runtime.response.status, 200);
    assert(JSON.stringify(runtime.body).includes('Dynamic column'));
    const targets = await read(base + 'dashboard-config/targets');
    assert.equal(targets.response.status, 200);
    assert(JSON.stringify(targets.body).includes('draft'));
    const fields = await read(base + 'dashboard-config/workflows/dataRecord/draft/fields');
    assert.equal(fields.response.status, 200);
    assert.notEqual((fields.body as { status: string }).status, 'unavailable', JSON.stringify(fields.body));
    assert.equal((await read(base + 'dashboard-config/workflows/dataRecord/missing')).response.status, 404);
    assert.equal((await read(base + 'dashboard-config/defaults')).response.status, 410);
    assert.equal((await read('/default/rdmp/admin/dashboard-config/targets')).response.status, 200);
  });
  it('serves raw locale namespaces, languages and app aliases with public namespace access', async () => {
    const namespace = await read('/default/rdmp/locales/en/translation.json', {} as typeof f.headers);
    assert.equal(namespace.response.status, 200);
    assert(JSON.stringify(namespace.body).includes('First value'));
    assert(!JSON.stringify(namespace.body).includes('_meta'));
    assert.equal((await read('/default/rdmp/locales/zz/translation.json')).response.status, 404);
    assert.deepEqual((await read('/default/rdmp/locales/fr/fallback.json')).body, {
      greeting: 'Bonjour',
      _meta: { source: 'packaged' },
    });
    const languages = await read('/default/rdmp/locales');
    assert.equal(languages.response.status, 200);
    assert.equal((languages.body as Array<{ code: string }>)[0].code, 'en');
    assert.equal((await read('/default/rdmp/app/i18n/entries?locale=en')).response.status, 200);
    assert.equal((await read('/default/rdmp/app/i18n/entries?locale[a]=en')).response.status, 400);
    assert.equal((await read('/default/rdmp/app/i18n/bundles/en/translation')).response.status, 200);
    assert.equal((await read('/default/rdmp/locales/en/%2e%2e%2fprivate.json')).response.status, 404);
  });
  it('covers dashboard view/settings, authoring aliases, preflight and every retired read', async () => {
    for (const route of [
      '/dashboard/type',
      '/dashboard/type/standard',
      '/dashboard/view/consolidated',
      '/dashboard/settings/view/consolidated',
      '/api/dashboard-config/views/consolidated/all',
      '/api/dashboard-config/views/consolidated/all/fields',
      '/admin/dashboard-config/views/consolidated/all',
      '/admin/dashboard-config/views/consolidated/all/fields',
      '/admin/dashboard-config/workflows/dataRecord/draft',
      '/admin/dashboard-config/workflows/dataRecord/draft/fields',
      '/api/dashboard-config/migration/preflight',
    ]) {
      const result = await read('/default/rdmp' + route);
      assert.equal(result.response.status, 200, route + ': ' + JSON.stringify(result.body));
    }
    for (const route of [
      'info',
      'defaults',
      'overrides',
      'merged/dataRecord/draft',
      'merged-view/consolidated/all',
      'merged-type/standard',
    ]) {
      const result = await read(base + 'dashboard-config/' + route);
      assert.equal(result.response.status, 410);
      assert(JSON.stringify(result.body).includes('retired'));
    }
    assert.equal((await read('/default/rdmp/dashboard/view/missing')).response.status, 404);
    assert.equal((await read('/default/rdmp/dashboard/settings/view/missing')).response.status, 404);
    assert.equal((await read('/default/rdmp/app/i18n/entries?locale=en&namespace[a]=x')).response.status, 400);
    assert.equal((await read('/default/rdmp/record/type?apiVersion=2.0')).response.status, 200);
  });
  it('delivers authoritative browser forms with fingerprints, metadata, versions and object access', async () => {
    const created = await read('/default/rdmp/record/form/dataRecord?edit=true&apiVersion=2.0');
    assert.equal(created.response.status, 200, JSON.stringify(created.body));
    const payload = created.body as {
      data: { name: string };
      meta: { oid: unknown; formName: string; formFingerprint: string };
    };
    assert.equal(payload.meta.oid, null);
    assert.equal(payload.meta.formName, 'default-1.0-draft');
    assert.equal(typeof payload.meta.formFingerprint, 'string');
    assert(payload.meta.formFingerprint.length > 16);
    const edit = await read('/default/rdmp/record/form/dataRecord/owned-record?edit=true&apiVersion=2.0');
    assert.equal(edit.response.status, 200, JSON.stringify(edit.body));
    assert.equal((edit.body as typeof payload).meta.formFingerprint, payload.meta.formFingerprint);
    assert.equal(edit.response.headers.get('etag'), formatRecordEntityTag('owned-record', 3));
    assert(JSON.stringify(edit.body).includes('Stored title'));
    assert(JSON.stringify(created.body).includes('Alpha'));
    const hydrated = edit.body as { prehydrate?: { vocabTrees: Record<string, { selectedNotations: string[] }> } };
    assert.deepEqual(hydrated.prehydrate?.vocabTrees['fixture-tree'].selectedNotations, ['A']);
    assert.equal((await read('/default/rdmp/record/form/dataRecord/owned-record?edit=false')).response.status, 200);
    const stale = await read('/default/rdmp/record/form/dataRecord/owned-record?formName=private-other&apiVersion=2.0');
    assert.equal(stale.response.status, 409);
    assert(JSON.stringify(stale.body).includes('form-definition-changed'));
    assert.equal((await read('/default/rdmp/record/form/dataRecord/missing')).response.status, 404);
    assert.equal((await read('/default/rdmp/record/form/dataRecord/other-record')).response.status, 500);
    assert.equal((await read('/default/rdmp/record/form/dataRecord?edit[a]=true')).response.status, 400);
    assert.equal((await read('/default/rdmp/record/form/dataRecord', {} as typeof f.headers)).response.status, 401);
    const v1 = await read('/default/rdmp/record/form/dataRecord');
    assert.equal(v1.response.status, 200);
    assert(!Object.hasOwn(v1.body as object, 'data'));
    assert.equal((await read('/other/rdmp/record/form/dataRecord')).response.status, 403);
  });
  it('serves the AppConfig form contract with masked secrets and rejects unknown definitions safely', async () => {
    const form = await read('/default/rdmp/appconfig/form/doiPublishing');
    assert.equal(form.response.status, 200);
    assert.deepEqual(Object.keys(form.body as object).sort(), ['fieldOrder', 'model', 'schema']);
    assert(!JSON.stringify(form.body).includes('synthetic-doi-password'));
    assert(JSON.stringify(form.body).includes(APP_CONFIG_SECRET_MASK));
    assert.equal((await read('/default/rdmp/appconfig/form/missing')).response.status, 500);
    assert.equal((await read('/other/rdmp/appconfig/form/doiPublishing')).response.status, 403);
    assert.equal(
      (await read('/default/rdmp/appconfig/form/doiPublishing', {} as typeof f.headers)).response.status,
      401
    );
  });
  it('reloads the owned translation runtime after awaited persisted changes', async () => {
    const brand = Object.assign(new BrandingModel(), f.brand);
    await f.translations.setEntry(brand, 'en', 'translation', 'runtime-cache', 'Runtime first');
    assert.equal(f.translationRuntime.t('runtime-cache', undefined, 'en', 'default'), 'Runtime first');
    await f.translations.setEntry(brand, 'en', 'translation', 'runtime-cache', 'Runtime second');
    assert.equal(f.translationRuntime.t('runtime-cache', undefined, 'en', 'default'), 'Runtime second');
  });
  it('requires authentication, brand membership and applicable role for the added protected metadata routes', async () => {
    const routes = [
      '/record/type',
      '/record/form/dataRecord',
      '/workspaces/types',
      '/api/dashboard-config/targets',
      '/api/dashboard-config/workflows/dataRecord/draft/fields',
      '/admin/dashboard-config/targets',
      '/locales',
      '/app/i18n/bundles/en/translation',
    ];
    for (const route of routes) {
      assert.equal((await read('/default/rdmp' + route, {} as typeof f.headers)).response.status, 401);
      assert.equal((await read('/other/rdmp' + route)).response.status, 403);
    }
    await f.identities.replaceMemberships('user', String(f.user.id), [f.reader.id]);
    try {
      assert.equal((await read('/default/rdmp/admin/dashboard-config/targets')).response.status, 403);
    } finally {
      await f.identities.replaceMemberships('user', String(f.user.id), [f.role.id]);
    }
  });
  it('serves the group without loading Sails, controllers, compatibility or the core barrel', () => {
    assert.equal(Reflect.get(globalThis, 'sails'), undefined);
    const forbidden =
      /\/redbox-core\/src\/(?:compat\/|controllers\/|(?:index|CoreService|CoreController)\.ts$)|\/node_modules\/sails\//;
    assert.deepEqual(
      Object.keys(require.cache).filter(filename => forbidden.test(filename)),
      []
    );
  });
  it('retains an admitted configuration read and its cache after client abort until shutdown drains it', async () => {
    const slow = await configurationFixture();
    const gate = slow.delayRead();
    const abort = new AbortController();
    const request = fetch(slow.url + base + 'appconfig/systemMessage', {
      headers: slow.headers,
      signal: abort.signal,
    }).catch(() => undefined);
    try {
      await gate.entered.promise;
      abort.abort();
      await request;
      let stopped = false;
      const stopping = slow.host.stop().then(() => {
        stopped = true;
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(stopped, false);
      assert(Object.keys(slow.appConfigs.brandingAppConfigMap).length > 0);
      gate.release.resolve();
      await stopping;
      assert.deepEqual(slow.appConfigs.brandingAppConfigMap, {});
    } finally {
      gate.release.resolve();
      abort.abort();
      await request;
      await slow.close();
    }
  });
  for (const method of ['local', 'aaf', 'oidc', 'oidc-named'])
    it(`hydrates persisted ${method} authentication settings into real provider installation`, async () => {
      const oidc = {
        ...(method === 'oidc-named' ? { identifier: 'institution' } : {}),
        opts: {
          issuer: {
            issuer: 'https://identity.example.invalid',
            authorization_endpoint: 'https://identity.example.invalid/authorize',
            token_endpoint: 'https://identity.example.invalid/token',
            jwks_uri: 'https://identity.example.invalid/jwks',
          },
          client: { client_id: 'db-provider' },
        },
      };
      const config = {
        active: method === 'aaf' ? ['aaf'] : method.startsWith('oidc') ? ['oidc'] : [],
        local: { usernameField: 'dbUser', passwordField: 'dbPassword', postLoginRedir: 'db/welcome' },
        aaf: { opts: { secretOrKey: 'synthetic-db-aaf-secret' } },
        oidc: method === 'oidc-named' ? [oidc] : oidc,
      };
      const brand = Object.assign(new BrandingModel(), f.brand);
      try {
        await f.appConfigs.createOrUpdateConfig(brand, 'auth', config);
        // Explicit repository reload, rather than trusting the published save cache.
        const hydrated = (await f.appConfigs.loadAppConfigurationModel(brand.id)).auth;
        assert.deepEqual(hydrated.active, config.active);
        assert.equal(hydrated.local.postLoginRedir, 'db/welcome');
        const passport = new Passport();
        const input = { passport, config: hydrated as AuthBrandConfig, accounts: {} as never, brand: () => brand };
        installLocalAuthentication(input);
        installAafAuthentication(input);
        await installOidcAuthentication(input);
        const strategy = (name: string) => Reflect.get(passport, '_strategy').call(passport, name);
        assert.equal(strategy('local')._usernameField, 'dbUser');
        assert.equal(strategy('local')._passwordField, 'dbPassword');
        assert.equal(!!strategy('aaf-jwt'), method === 'aaf');
        assert.equal(!!strategy(method === 'oidc-named' ? 'oidc-institution' : 'oidc'), method.startsWith('oidc'));
      } finally {
        await getConfigurationRepositories(f.owner).appConfigs.removeForBrandAndKey(brand.id, 'auth');
        await f.appConfigs.bootstrap();
      }
    });
  it('executes the existing released-v5-selected Bruno form requests', async () => {
    const collection = path.resolve('../../test/bruno');
    const result = await promisify(execFile)(
      process.execPath,
      [
        path.join(collection, 'node_modules/@usebruno/cli/bin/bru.js'),
        'run',
        '1 - REST API/4 - Form Management/List Forms.bru',
        '1 - REST API/4 - Form Management/Get Form.bru',
        '1 - REST API/10 - Translation/List Languages.bru',
        '1 - REST API/10 - Translation/Get Namespace (translation).bru',
        '--env',
        'int-test',
        '--env-var',
        'host=' + f.url,
        '--env-var',
        'token=pilot-api-token',
        '--reporter-skip-all-headers',
      ],
      { cwd: collection, timeout: 30_000, maxBuffer: 1024 * 1024 }
    );
    console.log(result.stdout);
  });
});

describe('protected metadata writes on standalone Mongo HTTP', function () {
  this.timeout(45000);
  let f: Awaited<ReturnType<typeof configurationFixture>>;
  let cookie = '',
    token = '';
  const base = '/default/rdmp';
  before(async () => {
    f = await configurationFixture();
    const login = await fetch(f.url + '/__test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
    });
    assert.equal(login.status, 200);
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    await login.text();
    const response = await fetch(f.url + '/csrfToken', { headers: { Cookie: cookie } });
    token = ((await response.json()) as { _csrf: string })._csrf;
  });
  after(async () => {
    await f?.close();
  });
  async function write(path: string, body: unknown = {}, method = 'POST', headers: Record<string, string> = f.headers) {
    const response = await fetch(f.url + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    return { response, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
  }
  const session = () => ({ Cookie: cookie, 'X-CSRF-Token': token });
  it('saves and resets API and form config through the chosen override, publishing persisted cache updates', async () => {
    const count = f.overrideWrites();
    const submitted = { enabled: true, message: 'Owned HTTP value' };
    const api = await write(base + '/api/appconfig/systemMessage', submitted);
    assert.equal(api.response.status, 200);
    assert.deepEqual(api.body, submitted);
    const form = await write(base + '/appconfig/form/systemMessage', { ...submitted, _csrf: token }, 'POST', {
      Cookie: cookie,
    });
    assert.equal(form.response.status, 200);
    assert.equal(f.overrideWrites(), count + 2);
    assert(!JSON.stringify(form.body).includes('_csrf'));
    const stored = await f.appConfigs.getAppConfigByBrandAndKey(f.brand.id, 'systemMessage');
    assert(JSON.stringify(stored).includes('Owned HTTP value'));
    assert(!JSON.stringify(stored).includes('_csrf'));
    const reset = await write(base + '/api/appconfig/systemMessage', {}, 'DELETE');
    assert.equal(reset.response.status, 200);
    assert.equal(reset.response.headers.get('x-redbox-config-source'), 'default');
    assert.equal(reset.body.enabled, false);
    assert.equal((await write(base + '/api/appconfig/systemMessage', {}, 'DELETE')).response.status, 200);
  });
  it('persists slash-tail translation keys once, sanitizes html and invalidates the live translation cache', async () => {
    const path = base + '/api/i18n/entries/en/translation/owned%2Fkey/tail';
    const saved = await write(path, { value: 'API value' });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.key, 'owned/key/tail');
    const browser = await write(
      base + '/app/i18n/entries/en/translation/browser/value',
      { value: '<p>Safe</p><script>evil()</script>', contentFormat: 'html' },
      'POST',
      session()
    );
    assert.equal(browser.response.status, 200);
    assert(!JSON.stringify(browser.body).includes('<script'));
    assert.equal(f.translationRuntime.t('owned/key/tail', undefined, 'en', 'default'), 'API value');
    const deleted = await write(path, {}, 'DELETE');
    assert.equal(deleted.response.status, 200);
    assert.deepEqual(deleted.body, { message: 'Deleted', details: '' });
    assert.equal((await write(path, {}, 'DELETE')).response.status, 404);
    assert.notEqual(f.translationRuntime.t('owned/key/tail', undefined, 'en', 'default'), 'API value');
  });
  it('imports API bundles with coerced flags and browser bundles/enabled without persisting the CSRF field', async () => {
    const api = await write(base + '/api/i18n/bundles/en/writeapi?splitToEntries=false&overwriteEntries=false', {
      data: { nested: { value: 'Bundle' } },
    });
    assert.equal(api.response.status, 200);
    assert.deepEqual(
      await f.translations.listEntries(Object.assign(new BrandingModel(), f.brand), 'en', 'writeapi'),
      []
    );
    const browser = await write(
      base + '/app/i18n/bundles/en/writeapp',
      { value: 'Browser bundle', _csrf: token },
      'POST',
      { Cookie: cookie }
    );
    assert.equal(browser.response.status, 200);
    assert(!JSON.stringify(browser.body).includes('_csrf'));
    const enabled = await write(
      base + '/app/i18n/bundles/en/writeapp/enabled',
      { enabled: 'false' },
      'POST',
      session()
    );
    assert.equal(enabled.response.status, 200);
    assert.equal(enabled.body.enabled, false);
    assert.equal(
      (await write(base + '/app/i18n/bundles/en/writeapp/enabled?enabled=true', {}, 'POST', session())).body.enabled,
      true
    );
  });
  for (const enabled of [true, false])
    it(`accepts query-only translation enabled=${enabled} with no body`, async () => {
      const namespace = 'query-only-' + enabled;
      assert.equal(
        (await write(base + '/app/i18n/bundles/en/' + namespace, { value: 'Query toggle' }, 'POST', session())).response
          .status,
        200
      );
      const response = await fetch(f.url + base + '/app/i18n/bundles/en/' + namespace + '/enabled?enabled=' + enabled, {
        method: 'POST',
        headers: session(),
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(((await response.json()) as { enabled: boolean }).enabled, enabled);
      const stored = await f.translations.getBundle(Object.assign(new BrandingModel(), f.brand), 'en', namespace);
      assert.equal(stored?.enabled, enabled);
    });
  for (const operation of ['toggle-with-malformed-body', 'save-without-body'])
    it(`retains body validation: ${operation}`, async () => {
      const response = await fetch(
        f.url +
          base +
          '/app/i18n/bundles/en/translation' +
          (operation === 'toggle-with-malformed-body' ? '/enabled?enabled=true' : ''),
        {
          method: 'POST',
          headers: {
            ...session(),
            ...(operation === 'toggle-with-malformed-body' ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(operation === 'toggle-with-malformed-body' ? { body: '[]' } : {}),
          signal: AbortSignal.timeout(5000),
        }
      );
      assert.equal(response.status, 400);
      assert.match(await response.text(), /Request body must be an object/);
    });
  it('executes both dashboard aliases for validation, revision-checked workflow/view saves and preview/apply copy', async () => {
    const brand = Object.assign(new BrandingModel(), f.brand);
    const source = { kind: 'workflow' as const, recordType: 'dataRecord', stage: 'draft' };
    const destination = { kind: 'view' as const, view: 'consolidated', step: 'all' };
    for (const mount of ['/api/', '/admin/']) {
      const headers = mount === '/api/' ? f.headers : session();
      const root = base + mount + 'dashboard-config';
      for (const [target, path] of [
        [source, '/workflows/dataRecord/draft'],
        [destination, '/views/consolidated/all'],
      ] as const) {
        const current = await f.dashboardConfig.getTargetSettings(brand, target);
        const validated = await write(
          root + '/validate',
          { target, expectedRevision: current.revision, settings: current.settings },
          'POST',
          headers
        );
        assert.equal(validated.response.status, 200, JSON.stringify(validated.body));
        const payload = {
          expectedRevision: current.revision,
          settings: current.settings,
          validationFingerprint: validated.body.validationFingerprint,
          acknowledgedWarningIds: (validated.body.warnings as Array<{ id: string }>).map(x => x.id),
        };
        const saved = await write(root + path, payload, 'PUT', headers);
        assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
        assert.equal((await write(root + path, payload, 'PUT', headers)).response.status, 409);
      }
      const preview = await write(
        root + '/copy/preview',
        { source, destinations: [destination], groups: ['all'] },
        'POST',
        headers
      );
      assert.equal(preview.response.status, 200, JSON.stringify(preview.body));
      const warnings = (preview.body.warnings ?? []) as Array<{ id: string }>;
      const applied = await write(
        root + '/copy/apply',
        {
          source,
          destinations: [destination],
          groups: ['all'],
          expectedRevision: preview.body.expectedRevision,
          previewFingerprint: preview.body.previewFingerprint,
          acknowledgedWarningIds: warnings.map(x => x.id),
        },
        'POST',
        headers
      );
      assert.equal(applied.response.status, 200, JSON.stringify(applied.body));
    }
  });
  it('preserves all retired PUT denials after authentication and sanitizes backend failures', async () => {
    for (const path of ['/merged-view/consolidated/all', '/merged/dataRecord/draft', '/overrides']) {
      const response = await write(base + '/api/dashboard-config' + path, {}, 'PUT');
      assert.equal(response.response.status, 410);
      assert.equal(response.body.message, 'legacy-operation-retired');
    }
    f.failWrites(true);
    try {
      const failed = await write(base + '/api/appconfig/systemMessage', { enabled: true });
      assert.equal(failed.response.status, 500);
      assert(!JSON.stringify(failed.body).includes('private'));
    } finally {
      f.failWrites(false);
    }
  });
  it('refuses anonymous, other-brand, wrong-role, forged bearer, missing/invalid browser tokens and malformed writes before overrides', async () => {
    const path = base + '/appconfig/form/systemMessage';
    const count = f.overrideWrites();
    assert.equal((await write(path, {}, 'POST', {})).response.status, 401);
    assert.equal((await write('/other/rdmp/appconfig/form/systemMessage', {}, 'POST', session())).response.status, 403);
    assert.equal((await write(path, {}, 'POST', { Cookie: cookie })).response.status, 403);
    assert.equal((await write(path, {}, 'POST', { Cookie: cookie, 'X-CSRF-Token': 'invalid' })).response.status, 403);
    assert.equal((await write(path, {}, 'POST', f.headers)).response.status, 403);
    assert.equal(
      (await write(base + '/api/appconfig/systemMessage', {}, 'POST', { Cookie: cookie })).response.status,
      403
    );
    assert.equal(
      (await write(base + '/api/appconfig/systemMessage', {}, 'POST', { ...session(), Authorization: 'Bearer forged' }))
        .response.status,
      401
    );
    await f.identities.replaceMemberships('user', String(f.user.id), [f.reader.id]);
    try {
      for (const route of [
        path,
        base + '/api/appconfig/systemMessage',
        base + '/admin/dashboard-config/validate',
        base + '/app/i18n/entries/en/translation/no',
      ])
        assert.equal((await write(route, {}, 'POST', session())).response.status, 403);
    } finally {
      await f.identities.replaceMemberships('user', String(f.user.id), [f.role.id]);
    }
    assert.equal(f.overrideWrites(), count);
    assert.equal((await write(base + '/api/appconfig/systemMessage', [])).response.status, 400);
    assert.equal((await write(base + '/api/i18n/entries/en/translation/no', { value: {} })).response.status, 400);
    assert.equal(
      (await write(base + '/app/i18n/bundles/en/writeapp/enabled', { enabled: {} }, 'POST', session())).response.status,
      400
    );
    assert.equal((await write(base + '/api/dashboard-config/validate', {})).response.status, 400);
  });
  it('keeps an admitted write owned through abort and failed stop, then persists before cleanup', async () => {
    const slow = await configurationFixture();
    const gate = slow.delayWrite();
    const abort = new AbortController();
    const request = fetch(slow.url + base + '/api/appconfig/systemMessage', {
      method: 'POST',
      headers: { ...slow.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, message: 'Survived abort' }),
      signal: abort.signal,
    }).catch(() => undefined);
    try {
      await gate.entered.promise;
      abort.abort();
      await request;
      await assert.rejects(slow.host.stop({ deadlineMs: 30 }));
      assert.equal(slow.host.status().stopFailed, true);
      gate.release.resolve();
      await slow.host.stop();
      assert.equal(
        (await slow.native.db().collection('appconfig').findOne({ configKey: 'systemMessage' }))?.configData?.message,
        'Survived abort'
      );
    } finally {
      gate.release.resolve();
      abort.abort();
      await request;
      await slow.close();
    }
  });
  it('runs real Bruno metadata writes and observes their persisted result', async () => {
    const collection = path.resolve('test/http/fixtures/bruno-metadata-writes');
    const result = await promisify(execFile)(
      process.execPath,
      [
        path.resolve('../../test/bruno/node_modules/@usebruno/cli/bin/bru.js'),
        'run',
        '--env-var',
        'host=' + f.url,
        '--env-var',
        'token=pilot-api-token',
        '--reporter-skip-all-headers',
      ],
      { cwd: collection, timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    console.log(result.stdout);
    assert.equal(
      (await f.translations.getEntry(Object.assign(new BrandingModel(), f.brand), 'en', 'translation', 'bruno-write'))
        ?.value,
      'Bruno persisted'
    );
  });
});
