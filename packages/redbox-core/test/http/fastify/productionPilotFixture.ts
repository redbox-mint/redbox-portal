import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { createPortalFastifyApplication, createPortalFastifyHost } from '../../../src/application/portal';
import { getMetaRoute, updateMetaRoute, addDataStreamsRoute } from '../../../src/api-routes/groups/records';
import { prepareSelectedPersistenceIndexes } from '../../../src/persistence/maintenance';
import { selectedAgendaMongoOptions } from '../../../src/queues/indexes';
import { initializeBrandingPersistence, getBrandingRepository } from '../../../src/persistence/branding/runtime';
import { initializeIdentityPersistence, getIdentityRepositories } from '../../../src/persistence/identity/runtime';
import { initializeReferencePersistence, getReferenceRepositories } from '../../../src/persistence/reference/runtime';
import { HttpIdentity } from '../../../src/http/express/identity';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import type { AuthBrandConfig } from '../../../src/authentication/Accounts';
import type { PoliciesConfig } from '../../../src/config/policies.config';
import type { RecordControllerInput, DatastreamControllerInput, BoundControllerFactory } from '../../../src/http';
import type { ApplicationModule } from '../../../src/application';

type Config = Awaited<ReturnType<typeof createPortalFastifyApplication>>['config'];
export interface ProductionPilotOptions {
  readonly policyConfiguration?: PoliciesConfig;
  readonly server?: Partial<Config['server']>;
  readonly session?: Partial<Config['redboxSession']>;
  readonly auth?: Partial<Config['auth']>;
  readonly portals?: readonly string[];
  readonly providerConfiguration?: AuthBrandConfig;
  readonly companion?: Omit<Partial<Config['companion']>, 'server'> & {
    readonly server?: Partial<Config['companion']['server']>;
  };
  readonly raw?: {
    prepare(portal: Awaited<ReturnType<typeof createPortalFastifyApplication>>): Promise<void>;
    beforeActivate(host: Awaited<ReturnType<typeof createPortalFastifyHost>>['host']): Promise<void>;
  };
}
export interface PilotExtension {
  bindPilot(
    record: RecordControllerInput & { institution: { name(): string } },
    input: { catalogue: { publish(actor: string): Promise<string> } }
  ): readonly BoundControllerFactory[];
  createPilotModule(): ApplicationModule;
  bindOrder(): readonly BoundControllerFactory[];
  bindRaw(input: DatastreamControllerInput & { institution: { name(): string } }): readonly BoundControllerFactory[];
  pilotModuleInitialized(): boolean;
}
let counter = 0;
/** Real production bootstrap and lifecycle. Tests seed a disposable database;
 * no application, domain service, provider list or portal is assembled here. */
export async function productionPilotFixture(
  appPath: string,
  extension: PilotExtension,
  options: ProductionPilotOptions = {}
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm019-production-'));
  const database = `sr_p4_http_native_${process.pid}_${counter++}`;
  const uri = new URL(process.env.HTTP_PILOT_TEST_MONGO_URL!);
  assert.equal(uri.pathname, '/sr_p4_http');
  uri.pathname = '/' + database;
  const native = await new MongoClient(uri.href).connect();
  const version = (await native.db().admin().command({ buildInfo: 1 })).version;
  assert.match(version, /^(9\.(?:[1-9]\d*\.\d+|0\.(?:[4-9]|[1-9]\d+))|[1-9]\d\.)/);
  const rootContext = options.server?.rootContext ?? '/portal';
  const providerConfiguration = options.providerConfiguration ?? { active: ['local'] };
  const session = {
    name: 'redbox.v6.sid',
    adapter: 'mongo',
    collection: 'pilotSessions',
    secret: 'fm019-native-root-secret-000000000000000001',
    cookie: { secure: false, httpOnly: true, sameSite: 'lax' },
    ...options.session,
    mongoUrl: options.session?.mongoUrl || uri.href,
  };
  const file = path.join(directory, 'config.cjs');
  await mkdir(path.join(directory, 'locales'));
  await writeFile(
    file,
    'module.exports=' +
      JSON.stringify({
        server: {
          rootContext,
          hostname: '127.0.0.1',
          port: 0,
          trustProxy: false,
          stopDeadlineMs: 30000,
          publicUrl: 'https://portal.example.invalid',
          ...options.server,
        },
        datastores: { mongodb: { url: uri.href, maxPoolSize: 4 }, redboxStorage: { url: uri.href, maxPoolSize: 4 } },
        redboxSession: session,
        ...(options.companion ? { companion: options.companion } : {}),
        storage: {
          disks: {
            staging: { driver: 'fs', config: { root: path.join(directory, 'staging') } },
            'figshare-staging': { driver: 'fs', config: { root: path.join(directory, 'figshare') } },
            primary: { driver: 'gridfs', config: { url: uri.href, bucketName: 'recordBytes' } },
          },
        },
        auth: {
          roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }],
          rules: [{ path: '/:branding/:portal/api(/*)', role: 'Admin', can_update: true }],
          ...options.auth,
        },
        brandingConfigurationDefaults: {
          auth: {
            ...providerConfiguration,
            local: {
              ...providerConfiguration.local,
              default: {
                adminUser:
                  providerConfiguration.local?.usernameField === 'email' ? 'synthetic@example.invalid' : 'pilot-admin',
                adminPw: 'pilot-password',
                email: 'synthetic@example.invalid',
                token: 'pilot-api-token',
              },
            },
          },
        },
        solr: {
          cores: {
            default: { options: { host: '127.0.0.1', port: Number(process.env.HTTP_READ_SOLR_PORT), core: 'redbox' } },
          },
          clientSleepTimeMillis: 0,
        },
        agendaQueue: { options: { processEvery: '0.05 seconds' } },
        bootstrap: { bootstrapDataPath: path.join(directory, 'bootstrap') },
        vocab: { bootstrapRvaImports: false, bootstrapFigshareImports: false },
        recordtype: { dataRecord: { packageType: 'dataRecord', searchable: true } },
        recordSchema: { enabled: true },
      })
  );
  let portal: Awaited<ReturnType<typeof createPortalFastifyApplication>> | undefined;
  let nativePlan: Awaited<ReturnType<typeof createPortalFastifyHost>> | undefined;
  try {
    portal = await createPortalFastifyApplication({
      appPath,
      files: { application: file },
      env: {},
      argv: [],
      log: nothingLogger,
      localesDirectory: path.join(directory, 'locales'),
      bindings: {
        module: registration => {
          assert.equal(registration.declaration.name, 'PilotModule');
          return () => extension.createPilotModule();
        },
      },
      http: {
        declarations: [getMetaRoute, updateMetaRoute, ...(options.raw ? [addDataStreamsRoute] : [])],
        progress: !!options.raw,
        policyConfiguration: options.policyConfiguration,
        portals: options.portals,
        bindings: context => [
          ...extension.bindOrder(),
          ...extension
            .bindPilot(
              {
                get records() {
                  return context.data.records.get();
                },
                get storage() {
                  return context.data.storage();
                },
                get recordTypes() {
                  return context.data.reference.types.get();
                },
                get workflows() {
                  return context.data.reference.workflows.get();
                },
                get schemas() {
                  return context.data.reference.schema.get();
                },
                log: nothingLogger,
                rootContext,
                institution: { name: () => 'Installed institution' },
              },
              {
                catalogue: {
                  publish: async actor => {
                    await native.db().collection('institutionPublication').insertOne({ actor, title: 'Published' });
                    return actor;
                  },
                },
              }
            )
            .filter(binding => !options.raw || binding.factory.name !== 'webservice/RecordController'),
          ...(options.raw
            ? extension.bindRaw({
                get records() {
                  return context.data.records.get();
                },
                get storage() {
                  return context.data.storage();
                },
                get recordTypes() {
                  return context.data.reference.types.get();
                },
                get workflows() {
                  return context.data.reference.workflows.get();
                },
                get schemas() {
                  return context.data.reference.schema.get();
                },
                get datastream() {
                  return context.data.datastream.get();
                },
                get multipart() {
                  return portal!.installation.raw!.multipart;
                },
                log: nothingLogger,
                rootContext,
                institution: { name: () => 'Installed institution' },
              })
            : []),
        ],
      },
    });
    const { owner, data } = portal;
    await prepareSelectedPersistenceIndexes(owner, 'ensure', {
      storage: portal.preflight,
      agenda: selectedAgendaMongoOptions(portal.config.agendaQueue),
      session: portal.config.redboxSession,
    });
    await initializeBrandingPersistence(owner);
    await initializeIdentityPersistence(owner);
    await initializeReferencePersistence(owner);
    const branding = getBrandingRepository(owner),
      identities = getIdentityRepositories(owner),
      refs = getReferenceRepositories(owner);
    const brand = await branding.createBrand({ name: 'default', id: '000000000000000000000011' });
    const otherBrand = await branding.createBrand({ name: 'other', id: '000000000000000000000012' });
    const role = await identities.create('role', { id: '000000000000000000000013', name: 'Admin', branding: brand.id });
    const reader = await identities.create('role', {
      id: '000000000000000000000014',
      name: 'Researcher',
      branding: brand.id,
    });
    const user = await identities.create('user', {
      id: '000000000000000000000015',
      username: 'pilot-admin',
      name: 'Synthetic Admin',
      type: 'local',
      email: 'synthetic@example.invalid',
      password: 'pilot-password',
      token: createHash('sha256').update('pilot-api-token').digest('base64'),
      roles: [role.id],
    });
    await refs.recordTypes.createDefinition({
      name: 'dataRecord',
      branding: brand.id,
      packageType: 'dataRecord',
      searchable: true,
      concurrentModification: { mode: 'strict' },
    });
    const type = await refs.recordTypes.findByName(brand.id, 'dataRecord');
    await refs.workflows.createDefinition({
      name: 'draft',
      recordType: type!.id,
      starting: true,
      hidden: false,
      config: { form: 'dataRecord', authorization: { editRoles: ['Admin'], transitionRoles: ['Admin'] } },
    });
    await refs.forms.createDefinition({
      name: 'dataRecord',
      branding: brand.id,
      configuration: {
        name: 'dataRecord',
        type: 'dataRecord',
        componentDefinitions: [
          {
            name: 'title',
            component: { class: 'SimpleInputComponent', config: { type: 'text' } },
            model: { class: 'SimpleInputModel', config: { defaultValue: 'Default title' } },
          },
        ],
        enabledValidationGroups: ['base'],
        validationGroups: { base: { description: 'base', initialMembership: 'all' } },
        validationOperations: { draft: { label: 'Save draft', enabledValidationGroups: ['base'], roles: ['Admin'] } },
      },
    });
    const identity = new HttpIdentity(identities);
    nativePlan = await createPortalFastifyHost(portal, {
      prepare: options.raw ? () => options.raw!.prepare(portal!) : undefined,
      authentication: () => ({
        identity,
        accounts: data.accounts.get(),
        config: providerConfiguration,
        brand: () => data.reference.branding.get().getBrand('default'),
      }),
      login: {
        credentialFields: [
          providerConfiguration.local?.usernameField ?? 'username',
          providerConfiguration.local?.passwordField ?? 'password',
        ],
        validContext: (b, p) =>
          b === (options.auth?.defaultBrand ?? 'default') && p === (options.auth?.defaultPortal ?? 'rdmp'),
        brandId: name => (name === 'other' ? otherBrand.id : brand.id),
        postLoginPath: () =>
          rootContext +
          '/' +
          (options.auth?.defaultBrand ?? 'default') +
          '/' +
          (options.auth?.defaultPortal ?? 'rdmp') +
          '/home',
        audit: async (action, actor) => {
          await data.users.get().addUserAuditEvent({ ...actor }, action, { brandId: brand.id });
        },
        loginFailure: async () => {},
      },
      policies: {
        branding,
        pathRules: data.reference.pathRules,
        defaultUnauthenticatedRole: () => undefined,
        emitRequestFailure: async () => {},
      },
    });
    assert.strictEqual(nativePlan.resolved, portal.installation);
    await nativePlan.host.initialize();
    await options.raw?.beforeActivate(nativePlan.host);
    await nativePlan.host.activate();
    await data.storage().create(
      Object.assign(new BrandingModel(), brand),
      {
        redboxOid: 'fm019-record',
        revision: 1,
        metadata: { title: 'Original', retained: true },
        metaMetadata: { brandId: brand.id, type: 'dataRecord', form: 'dataRecord' },
        authorization: { edit: ['pilot-admin'], view: ['pilot-admin'], editRoles: [], viewRoles: [] },
      },
      'dataRecord'
    );
    const address = nativePlan.host.address()!;
    return {
      portal,
      nativePlan,
      host: nativePlan.host,
      application: portal.application,
      owner,
      native,
      brand,
      otherBrand,
      role,
      reader,
      user,
      branding,
      identities,
      identity,
      recordTypes: refs.recordTypes,
      writer: data.records.get(),
      storage: data.storage(),
      users: data.users.get(),
      search: data.search.get(),
      disks: data.disks.get(),
      datastream: data.datastream.get(),
      accounts: data.accounts.get(),
      domains: {
        forms: data.reference.forms.get(),
        validation: data.reference.validation.get(),
        workflows: data.reference.workflows.get(),
        schemas: data.reference.schema.get(),
        config: portal.config.recordSchema,
      },
      directory,
      url: 'http://127.0.0.1:' + address.port + rootContext,
      close: async () => {
        await nativePlan!.host.stop();
        await native.db().dropDatabase();
        if (options.session?.dbName) await native.db(options.session.dbName).dropDatabase();
        await native.close();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await nativePlan?.host.stop();
    await portal?.application.stop();
    await native.db().dropDatabase();
    await native.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
