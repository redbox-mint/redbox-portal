import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import {
  createPortalHost,
  createPortalFastifyApplication,
  createPortalFastifyHost,
} from '../../../src/application/portal';
import { prepareSelectedPersistenceIndexes } from '../../../src/persistence/maintenance';
import { selectedAgendaMongoOptions } from '../../../src/queues/indexes';
import { initializeBrandingPersistence, getBrandingRepository } from '../../../src/persistence/branding/runtime';
import { initializeIdentityPersistence, getIdentityRepositories } from '../../../src/persistence/identity/runtime';
import { initializeReferencePersistence, getReferenceRepositories } from '../../../src/persistence/reference/runtime';
import { HttpIdentity } from '../../../src/http/express/identity';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { referenceReadDeclarations } from '../../../src/http/referenceRoutes';
import { persistenceStatus } from '../../../src/persistence/runtime';
import type { PoliciesConfig } from '../../../src/config/policies.config';

let counter = 0;
export const referenceOrigin = 'https://portal.example.invalid';
/** Real production application, resolved installation and host. Only disposable
 * configuration and persisted data are supplied by this fixture. */
export async function referenceProductionFixture(
  nativeHost: boolean,
  policyConfiguration?: PoliciesConfig,
  beforePrepare?: () => () => void,
  scope?: {
    readonly declarations: readonly import('../../../src/http/fastify/routes').ApiRouteSource[];
    readonly configuration?: Record<string, unknown>;
    readonly log?: typeof nothingLogger;
  }
) {
  assert(
    process.env.HTTP_PILOT_TEST_MONGO_URL && process.env.HTTP_READ_SOLR_PORT,
    'Disposable Mongo and Solr required'
  );
  const directory = await mkdtemp(path.join(tmpdir(), 'fm023-production-'));
  const uri = new URL(process.env.HTTP_PILOT_TEST_MONGO_URL);
  assert.equal(uri.pathname, '/sr_p4_http');
  uri.pathname = `/fm023_${process.pid}_${counter++}`;
  const client = await new MongoClient(uri.href).connect();
  let stop: (() => Promise<void>) | undefined;
  try {
    assert.match((await client.db().admin().command({ buildInfo: 1 })).version, /^9\./);
    await mkdir(path.join(directory, 'locales', 'en'), { recursive: true });
    await writeFile(
      path.join(directory, 'locales', 'en', 'translation.json'),
      JSON.stringify({ greeting: 'Hello', nested: { key: 'Nested' } })
    );
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'fm023-consumer', version: '1.0.0', dependencies: { 'fm023-storage': '1.0.0' } })
    );
    const providerDirectory = path.join(directory, 'node_modules', 'fm023-storage');
    await mkdir(providerDirectory, { recursive: true });
    await writeFile(
      path.join(providerDirectory, 'package.json'),
      JSON.stringify({
        name: 'fm023-storage',
        version: '1.0.0',
        main: 'index.cjs',
        redbox: { extension: './index.cjs' },
      })
    );
    const storageEntry = require.resolve('@researchdatabox/sails-hook-redbox-storage-mongo/extension');
    // The same real storage module/migrations/preflight as G2; this fixture's
    // installed provider declares the appropriate extension API version only.
    await writeFile(
      path.join(providerDirectory, 'index.cjs'),
      'const storage=require(' +
        JSON.stringify(storageEntry) +
        ');\nexports.inspectPrismaStagedStorage=storage.inspectPrismaStagedStorage; exports.ensurePrismaStagedStorageIndexes=storage.ensurePrismaStagedStorageIndexes;\nexports.registerRedboxExtension=()=>({...storage.registerRedboxExtension(),apiVersion:' +
        (nativeHost ? '2' : '1') +
        '});'
    );
    for (const name of ['views', 'assets', '.tmp/public']) await mkdir(path.join(directory, name), { recursive: true });
    const configFile = path.join(directory, 'config.cjs');
    await writeFile(
      configFile,
      'module.exports=' +
        JSON.stringify({
          server: {
            rootContext: '/portal',
            hostname: '127.0.0.1',
            port: 0,
            trustProxy: true,
            stopDeadlineMs: 30000,
            publicUrl: referenceOrigin,
          },
          datastores: { mongodb: { url: uri.href, maxPoolSize: 4 }, redboxStorage: { url: uri.href, maxPoolSize: 4 } },
          redboxSession: {
            name: 'fm023.sid',
            adapter: 'mongo',
            collection: 'referenceSessions',
            mongoUrl: uri.href,
            secret: 'fm023-root-secret-000000000000000000000001',
            cookie: { secure: false, httpOnly: true, sameSite: 'lax' },
          },
          companion: { enabled: false },
          storage: {
            disks: {
              staging: { driver: 'fs', config: { root: path.join(directory, 'staging') } },
              'figshare-staging': { driver: 'fs', config: { root: path.join(directory, 'figshare') } },
              primary: { driver: 'gridfs', config: { url: uri.href, bucketName: 'recordBytes' } },
            },
          },
          auth: {
            roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }],
            rules: [{ path: '/:branding/:portal(/*)', role: 'Admin', can_update: true }],
          },
          brandingConfigurationDefaults: {
            auth: {
              active: ['local'],
              local: {
                default: {
                  adminUser: 'pilot-admin',
                  adminPw: 'pilot-password',
                  email: 'synthetic@example.invalid',
                  token: 'pilot-api-token',
                },
              },
            },
          },
          solr: {
            cores: {
              default: {
                options: { host: '127.0.0.1', port: Number(process.env.HTTP_READ_SOLR_PORT), core: 'redbox' },
              },
            },
            clientSleepTimeMillis: 0,
          },
          agendaQueue: { options: { processEvery: '0.05 seconds' } },
          bootstrap: { bootstrapDataPath: path.join(directory, 'bootstrap') },
          vocab: { bootstrapRvaImports: false, bootstrapFigshareImports: false },
          recordtype: { dataRecord: { packageType: 'dataRecord', searchable: true } },
          recordSchema: { enabled: true },
          record: {
            contextVariables: { requestHeader: { source: 'request', type: 'header', field: 'x-fixture-context' } },
          },
          ...scope?.configuration,
          dashboardview: {
            referenceView: {
              name: 'referenceView',
              titleLabelKey: 'Reference',
              dashboardType: 'dataRecord',
              sourceRecordType: 'dataRecord',
              steps: [
                { name: 'draft', sourceRecordType: 'dataRecord', fetchMode: 'workflowStage', workflowStage: 'draft' },
              ],
            },
          },
        })
    );
    const options = {
      appPath: directory,
      files: { application: configFile },
      env: {},
      argv: [],
      log: scope?.log ?? nothingLogger,
      localesDirectory: path.join(directory, 'locales'),
    };
    const portal = nativeHost
      ? await createPortalFastifyApplication({
          ...options,
          http: {
            declarations: scope?.declarations ?? referenceReadDeclarations,
            policyConfiguration,
            portals: ['rdmp'],
          },
        })
      : await createPortalHost({ ...options, policyConfiguration, portals: ['rdmp'] });
    const { owner, data } = portal;
    stop = () => portal.application.stop();
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
    const foreignRole = await identities.create('role', {
      id: '000000000000000000000016',
      name: 'Admin',
      branding: otherBrand.id,
    });
    for (const [id, username, token, roles] of [
      ['000000000000000000000015', 'pilot-admin', 'pilot-api-token', [role.id]],
      ['000000000000000000000017', 'reader', 'reader-token', [reader.id]],
      ['000000000000000000000018', 'foreign', 'foreign-token', [foreignRole.id]],
    ] as const)
      await identities.create('user', {
        id,
        username,
        name: username,
        email: username + '@example.invalid',
        type: 'local',
        password: 'pilot-password',
        token: createHash('sha256').update(token).digest('base64'),
        roles: [...roles],
      });
    await refs.recordTypes.createDefinition({
      id: '000000000000000000000021',
      name: 'dataRecord',
      branding: brand.id,
      packageType: 'dataRecord',
      searchable: true,
    });
    await refs.workflows.createDefinition({
      id: '000000000000000000000022',
      name: 'draft',
      recordType: '000000000000000000000021',
      starting: true,
      hidden: false,
      config: { form: 'dataRecord', authorization: { editRoles: ['Admin'], transitionRoles: ['Admin'] } },
    });
    await refs.forms.createDefinition({
      id: '000000000000000000000023',
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
      },
    });
    let host;
    if (nativeHost) {
      const identity = new HttpIdentity(identities);
      const plan = await createPortalFastifyHost(portal as Awaited<ReturnType<typeof createPortalFastifyApplication>>, {
        prepare: undefined,
        authentication: () => ({
          identity,
          accounts: data.accounts.get(),
          config: { active: ['local'] },
          brand: () => data.reference.branding.get().getBrand('default'),
        }),
        login: {
          credentialFields: ['username', 'password'],
          validContext: (b, p) => b === 'default' && p === 'rdmp',
          brandId: name => (name === 'other' ? otherBrand.id : brand.id),
          postLoginPath: () => '/portal/default/rdmp/home',
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
      assert.strictEqual(
        plan.resolved,
        (portal as Awaited<ReturnType<typeof createPortalFastifyApplication>>).installation
      );
      host = plan.host;
    } else host = (portal as Awaited<ReturnType<typeof createPortalHost>>).host;
    stop = () => host.stop();
    const restore = beforePrepare?.();
    try {
      await host.initialize();
    } finally {
      restore?.();
    }
    await host.activate();
    await data.storage().create(
      Object.assign(new BrandingModel(), brand),
      {
        redboxOid: 'reference-record',
        revision: 1,
        metadata: { title: 'Reference' },
        metaMetadata: { brandId: brand.id, type: 'dataRecord', form: 'dataRecord', workflow: { stage: 'draft' } },
        authorization: { view: ['pilot-admin'], edit: ['pilot-admin'], viewRoles: [], editRoles: [] },
      },
      'dataRecord'
    );
    // A foreign record is a real persisted object, not a fixture authorization response.
    await data.storage().create(
      Object.assign(new BrandingModel(), otherBrand),
      {
        redboxOid: 'foreign-record',
        revision: 1,
        metadata: {},
        metaMetadata: { brandId: otherBrand.id, type: 'dataRecord' },
        authorization: { view: ['pilot-admin'], edit: ['pilot-admin'] },
      },
      'dataRecord'
    );
    return {
      portal,
      host,
      owner,
      client,
      data,
      brand,
      otherBrand,
      url: 'http://127.0.0.1:' + host.address()!.port + '/portal',
      close: async () => {
        await host.stop();
        assert.equal(persistenceStatus(owner).pools, 0);
        await client.db().dropDatabase();
        await client.close();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await stop?.();
    await client.db().dropDatabase();
    await client.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
