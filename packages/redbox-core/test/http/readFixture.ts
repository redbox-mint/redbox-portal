import { prepareRecordReads } from './prepareRecordReads';
import { nothingLogger, diffRecordValues } from '@researchdatabox/sails-ng-common';
import { of } from 'rxjs';
import { pilotFixture } from './pilotFixture';
import { pilotPolicyChain } from '../../src/http/express/policies';
import { createHttpCsrf, mountCsrfTokenRoute } from '../../src/http/express/csrf';
import { mountQueryReadRoutes } from '../../src/http/express/queryReads';
import { Services as Queries } from '../../src/queries/NamedQueries';
import { Services as Reports } from '../../src/queries/Reports';
import { Services as Integrations } from '../../src/queries/IntegrationAudits';
import { HarvestHistory } from '../../src/queries/HarvestHistory';
import { SiemReads } from '../../src/queries/SiemReads';
import { RecordAuditReader } from '../../src/queries/RecordAuditReader';
import { RecordAuditViews } from '../../src/queries/RecordAuditViews';
import { SolrReads } from '../../src/queries/SolrReads';
import { hasViewAccess, hasEditAccess } from '../../src/records/access';
import { getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { executeNamedQuery, namedQueryTarget } from '../../src/persistence/reference/NamedQueryExecution';
import { ensureHarvestPersistenceIndexes } from '../../src/persistence/harvest/preflight';
import { initializeHarvestPersistence, getHarvestRepositories } from '../../src/persistence/harvest/runtime';
import { ensureSiemPersistenceIndexes } from '../../src/persistence/siem/preflight';
import { initializeSiemPersistence, getSiemRepository } from '../../src/persistence/siem/runtime';
import { initializeStoragePersistence } from '../../src/persistence/storage/runtime';
import { ensureStoragePersistenceIndexes } from '../../src/persistence/storage/preflight';
import { registerPersistenceResource } from '../../src/persistence/runtime';
import type {
  PersistenceOwner,
  StorageDisks,
  StorageFormReader,
  StorageService,
  RecordTypes,
} from '../../src/extensions/storage';
const {
  createMongoStorageModule,
  ensurePrismaStagedStorageIndexes,
}: {
  createMongoStorageModule(input: {
    owner: PersistenceOwner;
    collaborators: {
      log: typeof nothingLogger;
      recordTypes: Pick<RecordTypes, 'get'>;
      forms: StorageFormReader;
      disks: StorageDisks;
      translate(key: string): string;
      exportMaxRecords(): number;
    };
  }): { storage: StorageService; initialize(): Promise<void> };
  ensurePrismaStagedStorageIndexes(owner: PersistenceOwner): Promise<unknown>;
} = require('@researchdatabox/sails-hook-redbox-storage-mongo/extension');
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { solr } from '../../src/config/solr.config';

export async function readFixture(options: { records?: boolean } = {}) {
  let recordDomains: Awaited<ReturnType<typeof prepareRecordReads>> | undefined;
  let storage!: ReturnType<typeof createMongoStorageModule>['storage'];
  let reports!: Reports.Reports;
  let queries!: Queries.NamedQueryService;
  let audit!: RecordAuditViews;
  let search!: SolrReads;
  let failReads = false;
  let runId = '';
  let delayed:
    | {
        entered: ReturnType<typeof Promise.withResolvers<void>>;
        release: ReturnType<typeof Promise.withResolvers<void>>;
      }
    | undefined;
  const f = await pilotFixture({
    prepareRoutes: async (router, f, policies, types) => {
      await ensurePrismaStagedStorageIndexes(f.owner);
      const module = createMongoStorageModule({
        owner: f.owner,
        collaborators: {
          log: nothingLogger,
          recordTypes: types,
          forms: { getFormByName: () => of(null!) },
          disks: {
            disk() {
              throw new Error('No attachment disk in read fixture');
            },
            stagingDisk() {
              throw new Error('No attachment disk in read fixture');
            },
          },
          translate: key => key,
          exportMaxRecords: () => 10000,
        },
      });
      await module.initialize!();
      storage = module.storage;
      await ensureStoragePersistenceIndexes(f.owner);
      await initializeStoragePersistence(f.owner);
      await ensureHarvestPersistenceIndexes(f.owner);
      await initializeHarvestPersistence(f.owner);
      await ensureSiemPersistenceIndexes(f.owner);
      await initializeSiemPersistence(f.owner);
      const refs = getReferenceRepositories(f.owner);
      const brand = Object.assign(new BrandingModel(), f.brand);
      const definition = await refs.recordTypes.findByKey(brand.id + '_dataRecord');
      await refs.recordTypes.reviseDefinition(String(definition!.id), { searchCore: 'default' });
      queries = new Queries.NamedQueryService({
        queries: refs.namedQueries,
        log: nothingLogger,
        config: { namedQuery: { supportedCollections: ['record', 'user'] } },
        target: name => namedQueryTarget(f.owner, name),
        execute: (request, count) => executeNamedQuery(f.owner, request, count),
      });
      const searchConfig = structuredClone(solr);
      searchConfig.cores.default.options = {
        host: '127.0.0.1',
        port: Number(process.env.HTTP_READ_SOLR_PORT),
        core: 'redbox',
      };
      search = new SolrReads({ config: searchConfig, log: nothingLogger, hasEditAccess });
      reports = new Reports.Reports({
        reports: refs.reports,
        namedQueries: queries,
        search,
        config: {},
        log: nothingLogger,
        portalUrl: () => '/default/rdmp',
      });
      registerPersistenceResource(f.owner, 'read-reports', { close: async () => reports.close() });
      await queries.create(brand, 'records', {
        collectionName: 'record',
        mongoQuery: {},
        queryParams: {},
        resultObjectMapping: { oid: 'redboxOid', title: 'metadata.title' },
      });
      await reports.createConfig(brand, {
        name: 'records',
        title: 'Records',
        reportSource: 'database',
        databaseQuery: { queryName: 'records' },
        filter: [],
        columns: [{ label: 'Title', property: 'title' }],
        solrQuery: null,
        readOnly: false,
        canEdit: true,
        canDelete: true,
        canPreview: true,
      });
      for (const [oid, brandId, view] of [
        ['read-record', f.brand.id, ['pilot-admin']],
        ['private-record', f.brand.id, ['someone-else']],
        ['other-record', f.otherBrand.id, ['pilot-admin']],
      ] as const) {
        const result = await storage.create(
          brand,
          {
            redboxOid: oid,
            metadata: { title: oid },
            metaMetadata: { brandId, type: 'dataRecord', form: 'dataRecord' },
            authorization: {
              view: [...view],
              edit: oid === 'read-record' ? ['pilot-admin'] : [],
              viewRoles: [],
              editRoles: [],
            },
            workflow: { stage: 'draft', stageLabel: 'Draft' },
          },
          'dataRecord'
        );
        if (!result.success) throw new Error(result.message);
      }
      await storage.createRecordAudit!({
        redboxOid: 'read-record',
        action: 'created' as never,
        user: { username: 'pilot-admin' },
        record: { metadata: { title: 'Old' } },
        occurredAt: '2026-01-01T00:00:00Z',
      });
      await storage.createRecordAudit!({
        redboxOid: 'read-record',
        action: 'updated' as never,
        user: { username: 'pilot-admin' },
        record: { metadata: { title: 'New' } },
        occurredAt: '2026-01-02T00:00:00Z',
      });
      const reader = new RecordAuditReader({
        storage,
        log: nothingLogger,
        resolveUser: username => f.identities.one('user', { username }),
      });
      const integrations = new Integrations.IntegrationAuditService({
        storage,
        log: nothingLogger,
        environment: 'test',
        enqueue() {
          throw new Error('Read routes cannot queue');
        },
      });
      audit = new RecordAuditViews({
        records: {
          getMeta: storage.getMeta.bind(storage),
          getRecordAudit: reader.getRecordAudit.bind(reader),
          getResolvedPermissionsSummary: reader.getResolvedPermissionsSummary.bind(reader),
        },
        forms: { getFormByName: () => of(null!) },
        compareRecords: diffRecordValues,
        integrations,
        configuration: () => ({}),
        figshareStatus: async () => null,
        canView: async (brand, user, record) => hasViewAccess(brand, user, user.roles as object[], record),
      });
      const harvest = getHarvestRepositories(f.owner);
      const run = await harvest.runs.createRun({
        brandId: f.brand.id,
        sourceRunId: 'source-1',
        recordType: 'dataRecord',
        sourceName: 'fixture',
        status: 'completed',
        startedAt: '2026-01-01T00:00:00Z',
      });
      runId = String(run.id);
      const siem = getSiemRepository(f.owner);
      for (const brandId of [f.brand.id, f.otherBrand.id])
        await siem.capture({
          eventId: 'event-' + brandId,
          brandId,
          eventType: 'fixture',
          category: 'test',
          severity: 'info',
          occurredAt: '2026-01-01T00:00:00Z',
          source: 'fixture',
          deliveryState: 'pending',
        });
      const csrf = createHttpCsrf({
        origins: ['http://127.0.0.1'],
        authenticateBearer: token => f.identity.bearer(token),
      });
      mountCsrfTokenRoute(router, csrf);
      await f.identities.create('pathrule', {
        path: '/:branding/:portal/admin(/*)',
        role: f.role.id,
        branding: f.brand.id,
        can_update: true,
      });
      await f.identities.create('pathrule', {
        path: '/:branding/:portal/record(/*)',
        role: f.role.id,
        branding: f.brand.id,
        can_update: true,
      });
      if (options.records)
        recordDomains = await prepareRecordReads(router, f, types, storage, reader, search, policies);
      mountQueryReadRoutes(router, {
        queries,
        reports: {
          ...reports,
          get: reports.get.bind(reports),
          getReportDto: reports.getReportDto.bind(reports),
          getResults: reports.getResults.bind(reports),
          getCSVResult: reports.getCSVResult.bind(reports),
          listConfigs: async brand => {
            if (failReads) throw new Error('synthetic backend failure');
            if (delayed) {
              delayed.entered.resolve();
              await delayed.release.promise;
            }
            return reports.listConfigs(brand);
          },
          getConfig: reports.getConfig.bind(reports),
          previewConfig: reports.previewConfig.bind(reports),
        },
        harvest: new HarvestHistory(harvest),
        siem: new SiemReads(siem),
        audit,
        search,
        recordTypes: types,
        returnFields: ['id', 'metaMetadata_brandId'],
        siemConfig: async () => ({}),
        csrf,
        policies,
        policyConfiguration: { '*': [...pilotPolicyChain] },
      });
    },
  });
  await f.pathRules.loadRules();
  return {
    ...f,
    storage,
    recordDomains,
    reports,
    queries,
    audit,
    search,
    runId,
    failReads: (value: boolean) => {
      failReads = value;
    },
    delayRead: () => (delayed = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }),
  };
}
