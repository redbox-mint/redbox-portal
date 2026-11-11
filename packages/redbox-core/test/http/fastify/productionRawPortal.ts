import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import {
  createPortalFastifyApplication,
  createPortalFastifyHost,
  createPortalHost,
  type PortalApplicationOptions,
} from '../../../src/application/portal';
import { addDataStreamsRoute, getMetaRoute, updateMetaRoute } from '../../../src/api-routes/groups/records';
import { prepareSelectedPersistenceIndexes } from '../../../src/persistence/maintenance';
import { selectedAgendaMongoOptions } from '../../../src/queues/indexes';
import { initializeBrandingPersistence, getBrandingRepository } from '../../../src/persistence/branding/runtime';
import { initializeIdentityPersistence, getIdentityRepositories } from '../../../src/persistence/identity/runtime';
import { initializeReferencePersistence, getReferenceRepositories } from '../../../src/persistence/reference/runtime';
import { HttpIdentity } from '../../../src/http/express/identity';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import type { AuthBrandConfig } from '../../../src/authentication/Accounts';
import type { ApiRouteDefinition } from '../../../src/api-routes/types';

export interface RawPortalOptions {
  readonly companion?: Partial<import('../../../src/config/companionDefaults').CompanionConfig>;
  readonly policyConfiguration?: import('../../../src/config/policies.config').PoliciesConfig;
  readonly declarations?: readonly ApiRouteDefinition[];
  readonly progress?: boolean;
  beforeActivate?(host: Awaited<ReturnType<typeof createPortalFastifyHost>>['host']): Promise<void>;
  prepare(portal: Awaited<ReturnType<typeof createPortalFastifyApplication>>): Promise<void>;
}
let counter = 0;
/** Real production bootstrap and lifecycle. Tests seed a disposable database;
 * no application, domain service, provider list or portal is assembled here. */
export async function productionRawPortal(nativeHost: boolean, appPath: string, options: RawPortalOptions) {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm020-production-'));
  const database = `sr_p4_http_native_${process.pid}_${counter++}`;
  const uri = new URL(process.env.HTTP_PILOT_TEST_MONGO_URL!);
  assert.equal(uri.pathname, '/sr_p4_http');
  uri.pathname = '/' + database;
  const native = await new MongoClient(uri.href).connect();
  const version = (await native.db().admin().command({ buildInfo: 1 })).version;
  assert.match(version, /^(9\.(?:[1-9]\d*\.\d+|0\.(?:[4-9]|[1-9]\d+))|[1-9]\d\.)/);
  const rootContext = '/portal';
  const providerConfiguration: AuthBrandConfig = { active: ['local'] };
  const session = {
    name: 'redbox.v6.sid',
    adapter: 'mongo',
    collection: 'pilotSessions',
    secret: 'fm020-native-root-secret-000000000000000001',
    cookie: { secure: false, httpOnly: true, sameSite: 'lax' },
    mongoUrl: uri.href,
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
        },
        datastores: { mongodb: { url: uri.href, maxPoolSize: 4 }, redboxStorage: { url: uri.href, maxPoolSize: 4 } },
        redboxSession: session,
        companion: { enabled: false, ...options.companion },
        storage: {
          disks: {
            staging: { driver: 'fs', config: { root: path.join(directory, 'staging') } },
            'figshare-staging': { driver: 'fs', config: { root: path.join(directory, 'figshare') } },
            primary: { driver: 'gridfs', config: { url: uri.href, bucketName: 'recordBytes' } },
          },
        },
        auth: {
          roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }],
          rules: [
            { path: '/:branding/:portal/api(/*)', role: 'Admin', can_update: true },
            { path: '/:branding/:portal/asynch(/*)', role: 'Admin', can_update: true },
            { path: '/imports(/*)', role: 'Admin', can_update: true },
          ],
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
  let portal:
    | Awaited<ReturnType<typeof createPortalFastifyApplication>>
    | Awaited<ReturnType<typeof createPortalHost>>
    | undefined;
  let nativePlan: Awaited<ReturnType<typeof createPortalFastifyHost>> | undefined;
  try {
    const bindings: NonNullable<PortalApplicationOptions['bindings']> = {
      handler: registration => () => registration.declaration.create(undefined as never),
    };
    const common = {
      bindings,
      appPath,
      files: { application: file },
      env: {},
      argv: [],
      log: nothingLogger,
      localesDirectory: path.join(directory, 'locales'),
    };
    portal = nativeHost
      ? await createPortalFastifyApplication({
          ...common,
          http: {
            declarations: options.declarations ?? [getMetaRoute, updateMetaRoute, addDataStreamsRoute],
            progress: options.progress ?? true,
            policyConfiguration: options.policyConfiguration ?? {
              '*': ['nocache', 'brandingandportal', 'iswebserviceauthenticated', 'brandactor', 'checkauth'],
            },
            bindings: context => require(path.join(appPath, 'node_modules/fm020-storage')).bindings(context),
          },
        })
      : await createPortalHost({
          ...common,
          policyConfiguration: options.policyConfiguration ?? {
            '*': ['nocache', 'brandingandportal', 'iswebserviceauthenticated', 'brandactor', 'checkauth'],
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
      concurrentModification: { mode: 'observe' },
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
    if ('installation' in portal) {
      const selected = portal;
      nativePlan = await createPortalFastifyHost(selected, {
        prepare: () => options.prepare(selected),
        authentication: () => ({
          identity,
          accounts: data.accounts.get(),
          config: providerConfiguration,
          brand: () => Object.assign(new BrandingModel(), brand),
        }),
        login: {
          credentialFields: [
            providerConfiguration.local?.usernameField ?? 'username',
            providerConfiguration.local?.passwordField ?? 'password',
          ],
          validContext: (b, p) => b === 'default' && p === 'rdmp',
          brandId: name => (name === 'other' ? otherBrand.id : brand.id),
          postLoginPath: () => rootContext + '/' + 'default' + '/' + 'rdmp' + '/home',
          audit: async () => {},
          loginFailure: async () => {},
        },
        policies: {
          branding,
          pathRules: data.reference.pathRules,
          defaultUnauthenticatedRole: () => undefined,
          emitRequestFailure: async () => {},
        },
      });
    }
    const host = nativePlan?.host ?? ('host' in portal ? portal.host : undefined)!;
    if ('installation' in portal) assert.strictEqual(nativePlan!.resolved, portal.installation);
    await host.initialize();
    if (nativePlan) await options.beforeActivate?.(nativePlan.host);
    await host.activate();
    await data.storage().create(
      Object.assign(new BrandingModel(), brand),
      {
        redboxOid: 'fm020-record',
        revision: 1,
        metadata: { title: 'Original', retained: true },
        metaMetadata: { brandId: brand.id, type: 'dataRecord', form: 'dataRecord' },
        authorization: { edit: ['pilot-admin'], view: ['pilot-admin'], editRoles: [], viewRoles: [] },
      },
      'dataRecord'
    );
    const address = host.address()!;
    return {
      portal,
      nativePlan,
      host,
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
        await host.stop();
        await native.db().dropDatabase();
        await native.close();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await nativePlan?.host.stop();
    if (portal && 'host' in portal) await portal.host.stop();
    await portal?.application.stop();
    await native.db().dropDatabase();
    await native.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
