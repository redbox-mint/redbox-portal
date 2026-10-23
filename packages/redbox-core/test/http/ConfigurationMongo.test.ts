import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { from } from 'rxjs';
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
  let forms!: Forms;
  let failReads = false;
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
      translations = new I18nEntries({
        repository,
        localesDirectory: '/fixture/absent-locales',
        log: nothingLogger,
        getBrand: name => brands.find(brand => brand.name === name) ?? null,
        getBrandById: id => brands.find(brand => brand.id === id) ?? null,
        reloadResources: async () => {},
      });
      const loadRecord = async (oid: string) =>
        f.native
          .db()
          .collection<RecordModel>('metadataFixtureRecords')
          .findOne({ redboxOid: oid }, { projection: { _id: 0 } });
      const workflowSteps = {
        getAllForRecordType: (type: { id?: string } | null | undefined) =>
          from(references.workflows.listForRecordType(type?.id ?? '', false)),
      };
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
        config: {},
        log: nothingLogger,
        html: {
          sanitizeWithProfile: () => {
            throw new Error('Fixture has no HTML fields');
          },
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
          getEntries: async () => {
            throw new Error('Fixture has no vocabulary fields');
          },
        },
      });
      await references.forms.createDefinition({
        name: 'default-1.0-draft',
        branding: f.brand.id,
        configuration: {
          name: 'default-1.0-draft',
          type: 'dataRecord',
          componentDefinitions: [],
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
            metadata: {},
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
      await repository.appConfigs.createConfiguration({
        branding: f.brand.id,
        configKey: 'doiPublishing',
        configData: { connection: { password: 'synthetic-doi-password' } },
      });
      await translations.setEntry(brands[0], 'en', 'translation', 'heading/with/slashes', 'First value');
      await translations.setEntry(brands[1], 'en', 'translation', 'private', 'Other brand');
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
  return {
    ...f,
    appConfigs,
    translations,
    forms,
    failReads: (value: boolean) => {
      failReads = value;
    },
    overrideReads: () => overrideReads,
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
  it('executes the existing released-v5-selected Bruno form requests', async () => {
    const collection = path.resolve('../../test/bruno');
    const result = await promisify(execFile)(
      process.execPath,
      [
        path.join(collection, 'node_modules/@usebruno/cli/bin/bru.js'),
        'run',
        '1 - REST API/4 - Form Management/List Forms.bru',
        '1 - REST API/4 - Form Management/Get Form.bru',
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
