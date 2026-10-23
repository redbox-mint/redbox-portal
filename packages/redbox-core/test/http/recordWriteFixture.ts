import type { Router, RequestHandler } from 'express';
import { AuthenticationAccounts } from '../../src/authentication/Accounts';
import { Services as Users } from '../../src/identity/Users';
import { RoleModel } from '../../src/model/storage/RoleModel';
import { mountIdentityLinkRoutes } from '../../src/http/express/identityLinks';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { of } from 'rxjs';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { pilotFixture } from './pilotFixture';
import { prepareRecordReads } from './prepareRecordReads';
import { Services as Harvests } from '../../src/records/HarvestRuns';
import { ensureHarvestPersistenceIndexes } from '../../src/persistence/harvest/preflight';
import { getHarvestRepositories, initializeHarvestPersistence } from '../../src/persistence/harvest/runtime';
import { mountHarvestMutationRoutes } from '../../src/http/express/harvestMutations';
import { Services as Records } from '../../src/records/Records';
import { FigshareSourceIntents } from '../../src/records/FigshareSourceIntents';
import { Services as Disks } from '../../src/storage/StorageManager';
import { Services as Datastream } from '../../src/storage/StandardDatastream';
import { Services as Solr } from '../../src/queries/Solr';
import { RecordAuditReader } from '../../src/queries/RecordAuditReader';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { getStorageRepositories, initializeStoragePersistence } from '../../src/persistence/storage/runtime';
import { ensureStoragePersistenceIndexes } from '../../src/persistence/storage/preflight';
import { registerPersistenceResource } from '../../src/persistence/runtime';
import { AgendaQueue, prepareAgendaIndexes } from '../../src/queues';
import { record } from '../../src/config/record.config';
import { solr } from '../../src/config/solr.config';
import { jsonld } from '../../src/config/jsonld.config';
import { storage as diskConfig } from '../../src/config/storage.config';
import { ContextVariables } from '../../src/forms/ContextVariables';
import { mountRecordMutationRoutes } from '../../src/http/express/recordMutations';
import { createHttpCsrf, mountCsrfTokenRoute } from '../../src/http/express/csrf';
import { pilotPolicyChain } from '../../src/http/express/policies';
import type { StorageService } from '../../src/StorageService';
import type { PersistenceOwner } from '../../src/persistence/owner';
import type { RecordTypes } from '../../src/recordTypes';
import type { Forms } from '../../src/forms/Forms';
const {
  createMongoStorageModule,
  ensurePrismaStagedStorageIndexes,
}: {
  createMongoStorageModule(input: {
    owner: PersistenceOwner;
    collaborators: {
      log: typeof nothingLogger;
      recordTypes: Pick<RecordTypes, 'get'>;
      forms: Pick<Forms, 'getFormByName'>;
      disks: Pick<Disks.StorageManager, 'disk' | 'stagingDisk'>;
      translate(key: string): string;
      exportMaxRecords(): number;
    };
  }): { storage: StorageService; initialize(): Promise<void> };
  ensurePrismaStagedStorageIndexes(owner: PersistenceOwner): Promise<unknown>;
} = require('@researchdatabox/sails-hook-redbox-storage-mongo/extension');

export async function recordWriteFixture(
  prepareAdditional?: (
    router: Router,
    fixture: Parameters<NonNullable<NonNullable<Parameters<typeof pilotFixture>[0]>['prepareRoutes']>>[1],
    input: {
      accounts: AuthenticationAccounts;
      domains: Awaited<ReturnType<typeof prepareRecordReads>>;
      types: RecordTypes;
      writer: Records.Records;
      users: Users.Users;
      storage: StorageService;
      disks: Disks.StorageManager;
      datastream: Datastream.StandardDatastream;
      search: Solr.SolrSearchService;
      csrf: ReturnType<typeof createHttpCsrf>;
      policies: Readonly<Record<string, RequestHandler>>;
      policyConfiguration: { '*': string[] };
      realtime: Parameters<NonNullable<NonNullable<Parameters<typeof pilotFixture>[0]>['prepareRoutes']>>[4];
    }
  ) => Promise<void>,
  httpOptions: { parserExclusions?: readonly string[]; port?: number; trustProxy?: boolean } = {}
) {
  const directory = await mkdtemp(join(tmpdir(), 'sr-record-writes-'));
  let writer!: Records.Records;
  let users!: Users.Users;
  let failHarvestEvent = false;
  let storage!: StorageService;
  let disks!: Disks.StorageManager;
  let datastream!: Datastream.StandardDatastream;
  let search!: Solr.SolrSearchService;
  let queue!: AgendaQueue;
  let domains!: Awaited<ReturnType<typeof prepareRecordReads>>;
  const followups = new Set<Promise<unknown>>();
  const retainFollowup = async (work: Promise<unknown>) => {
    followups.add(work);
    try {
      return await work;
    } finally {
      followups.delete(work);
    }
  };
  try {
    const f = await pilotFixture({
      ...httpOptions,
      rootContext: '/portal',
      prepareRoutes: async (router, f, policies, types, realtime) => {
        await ensureStoragePersistenceIndexes(f.owner);
        await initializeStoragePersistence(f.owner);
        disks = new Disks.StorageManager({
          config: {
            ...diskConfig,
            disks: {
              staging: { driver: 'fs', config: { root: join(directory, 'staging') } },
              primary: {
                driver: 'gridfs',
                config: {
                  url: process.env.HTTP_PILOT_TEST_MONGO_URL!.replace('/sr_p4_http', '/' + f.native.db().databaseName),
                  bucketName: 'recordBytes',
                },
              },
            },
          },
          log: nothingLogger,
          owner: f.owner,
        });
        await disks.initialize();
        await ensurePrismaStagedStorageIndexes(f.owner);
        const module = createMongoStorageModule({
          owner: f.owner,
          collaborators: {
            log: nothingLogger,
            recordTypes: types,
            forms: { getFormByName: (...args) => (domains ? domains.forms.getFormByName(...args) : of(null!)) },
            disks,
            translate: key => key,
            exportMaxRecords: () => 1000,
          },
        });
        await module.initialize();
        storage = module.storage;
        const cfg = structuredClone(solr);
        cfg.cores.default.options = {
          host: '127.0.0.1',
          port: Number(process.env.HTTP_READ_SOLR_PORT),
          core: 'redbox',
        };
        cfg.clientSleepTimeMillis = 0;
        search = new Solr.SolrSearchService({ config: cfg, log: nothingLogger, retainFollowup });
        await search.initialize();
        const audit = new RecordAuditReader({
          storage,
          createAudit: data => storage.createRecordAudit!(data),
          log: nothingLogger,
          resolveUser: username => f.identities.one('user', { username }),
        });
        domains = await prepareRecordReads(router, f, types, storage, audit, search, policies);
        const brand = Object.assign(new BrandingModel(), f.brand);
        const queueConfig = {
          options: { processEvery: '0.05 seconds' },
          jobs: {
            [record.auditing.recordAuditJobName]: { fnName: 'recordAudit' },
          },
        };
        await prepareAgendaIndexes(f.owner, queueConfig.options, 'ensure');
        queue = new AgendaQueue({
          owner: f.owner,
          config: queueConfig,
          log: nothingLogger,
          handler: name =>
            name === 'recordAudit'
              ? async job => writer.storeRecordAudit({ attrs: { data: job.attrs.data } })
              : undefined,
        });
        registerPersistenceResource(f.owner, 'record-write-queue', queue);
        await queue.initialize();
        datastream = new Datastream.StandardDatastream({
          disks,
          forms: domains.forms,
          attachments: getStorageRepositories(f.owner).attachments,
          log: nothingLogger,
        });
        const intents = new FigshareSourceIntents({ config: () => null, log: nothingLogger });
        writer = new Records.Records({
          config: {
            record,
            recordSchema: domains.config,
            jsonld,
            storage: disks.getMergedStorageConfig(),
            auth: { defaultPortal: 'rdmp' },
          },
          log: nothingLogger,
          storageService: storage,
          datastreamService: datastream,
          searchService: search,
          queueService: queue,
          repository: getStorageRepositories(f.owner),
          branding: {
            getDefault: () => brand,
            getBrandById: id => (id === brand.id ? brand : undefined),
            getBrand: name => (name === brand.name ? brand : undefined),
          },
          recordTypes: types,
          workflows: domains.workflows,
          forms: domains.forms,
          users: { getUserWithUsername: () => of(null) },
          roles: {
            getRole: (_brand, name) =>
              name === f.role.name
                ? Object.assign({ users: [], branding: brand }, f.role)
                : Object.assign({ users: [], branding: brand }, f.reader),
          },
          schema: domains.schemas,
          validation: domains.validation,
          attachments: getStorageRepositories(f.owner).attachments,
          translation: { t: key => key },
          stagingDisk: () => disks.stagingDisk(),
          prepareSourceIntent: intents.prepareSourceIntent.bind(intents),
          resolveHook: name => {
            throw new Error('Unregistered hook: ' + name);
          },
          wakeFigshareRecord: async () => {
            throw new Error('No configured Figshare provider');
          },
        });
        registerPersistenceResource(f.owner, 'record-write-followups', {
          drain: async () => {
            while (followups.size) await Promise.allSettled(followups);
          },
          close: async () => writer.close(),
        });
        const csrf = createHttpCsrf({
          origins: [
            'http://127.0.0.1',
            'http://127.0.0.1:' + (realtime.server.address() as import('node:net').AddressInfo).port,
          ],
          authenticateBearer: token => f.identity.bearer(token),
        });
        const policyConfiguration = { '*': [...pilotPolicyChain] };
        mountCsrfTokenRoute(router, csrf);
        await ensureHarvestPersistenceIndexes(f.owner);
        await initializeHarvestPersistence(f.owner);
        const harvest = new Harvests.HarvestRunService({
          records: writer,
          storage,
          workflows: domains.workflows,
          repository: {
            ...getHarvestRepositories(f.owner),
            events: {
              ...getHarvestRepositories(f.owner).events,
              appendEvents: async events => {
                if (failHarvestEvent) {
                  failHarvestEvent = false;
                  throw new Error('Deliberate event failure');
                }
                await getHarvestRepositories(f.owner).events.appendEvents(events);
              },
            },
          },
          config: { recordSchema: domains.config },
          log: nothingLogger,
        });
        registerPersistenceResource(f.owner, 'write-harvest', {
          quiesce: () => harvest.quiesce(),
          drain: () => harvest.drain(),
          close: async () => {},
        });
        const reader = Object.assign(new RoleModel(), f.reader);
        const accounts = new AuthenticationAccounts({
          repository: f.identities,
          log: nothingLogger,
          defaultBrand: () => brand,
          getBrand: () => brand,
          authConfig: () => ({}),
          defaultAuthenticatedRole: () => reader,
          nestedRoles: () => [reader],
          authorizedEmails: () => ({ enabled: false }),
          resolveHook: () => {
            throw new Error('Unregistered account hook');
          },
          event: () => {},
        });
        users = new Users.Users({
          repository: f.identities,
          accounts,
          log: nothingLogger,
          defaultBrand: () => brand,
          recordAccess: { storage: getStorageRepositories(f.owner), records: writer },
        });
        mountIdentityLinkRoutes(router, { users, csrf, policies, policyConfiguration, log: nothingLogger });
        await prepareAdditional?.(router, f, {
          accounts,
          domains,
          types,
          writer,
          users,
          storage,
          disks,
          datastream,
          search,
          csrf,
          policies,
          policyConfiguration,
          realtime,
        });
        mountHarvestMutationRoutes(router, {
          harvest,
          recordTypes: types,
          csrf,
          policies,
          policyConfiguration,
          log: nothingLogger,
        });
        mountRecordMutationRoutes(router, {
          records: writer,
          recordTypes: types,
          workflows: domains.workflows,
          forms: domains.forms,
          contextVariables: new ContextVariables({}, nothingLogger),
          schemaEnabled: true,
          rootContext: '/portal',
          csrf,
          policies,
          policyConfiguration,
          log: nothingLogger,
        });
      },
    });
    await queue.activate();
    return {
      ...f,
      writer,
      users,
      failNextHarvestEvent: () => {
        failHarvestEvent = true;
      },
      storage,
      disks,
      datastream,
      search,
      domains,
      directory,
      close: async () => {
        await f.close();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
