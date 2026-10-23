const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, rm, readdir, readFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const { MongoClient } = require('mongodb');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { Services: Oni } = require('../../dist/integrations/Oni');
const { Services: Disks } = require('../../dist/storage/StorageManager');
const { Services: Audits } = require('../../dist/queries/IntegrationAudits');
const { makeOniAuditService } = require('../../dist/integrations/oni/audit');
const { createOniRepository } = require('../../dist/integrations/oni/repository');
const { runPublishDatasetProgram } = require('../../dist/integrations/oni/runtime');
const { OniPublishing } = require('../../dist/configmodels/OniPublishing');
const { IntegrationAuditAction, IntegrationAuditName } = require('../../dist/model/storage/IntegrationAuditModel');
const { ApplicationRuntime } = require('../../dist/application');
const runtime = require('../../dist/persistence/runtime');
const storageHook = require('@researchdatabox/sails-hook-redbox-storage-mongo/extension');

for (const keyEncoding of [undefined, 'raw']) {
  test(
    `owned Oni writes actual ${keyEncoding ?? 'default encoded'} OCFL files and retains admitted publication through drain`,
    { timeout: 45000 },
    async () => {
      assert.equal(process.version, 'v26.11.1');
      assert.equal(global.sails, undefined);
      const url = process.env.SR_ONI_MONGO_URL;
      assert(url, 'SR_ONI_MONGO_URL is required; qualification cannot skip');
      assert.equal(new URL(url).pathname, '/sr_p7_oni');
      const native = await new MongoClient(url).connect();
      const directory = await mkdtemp(join(tmpdir(), 'sr-p7-oni-'));
      const owner = { config: { datastores: { mongodb: { url }, redboxStorage: { url } } }, log };
      const entered = Promise.withResolvers(),
        release = Promise.withResolvers();
      let app;
      try {
        assert.equal((await native.db().listCollections().toArray()).length, 0);
        await runtime.initializePersistence(owner);
        await storageHook.ensurePrismaStagedStorageIndexes(owner);
        const unexpected = () => {
          throw new Error('Unexpected unused collaborator');
        };
        const storage = storageHook.createMongoStorageModule({
          owner,
          collaborators: {
            log,
            recordTypes: { get: unexpected },
            forms: { getFormByName: unexpected },
            disks: {},
            translate: key => key,
            exportMaxRecords: () => 100,
          },
        });
        await storage.initialize();
        const disks = new Disks.StorageManager({
          owner,
          log,
          config: {
            stagingDisk: 'oni',
            primaryDisk: 'oni',
            disks: { oni: { driver: 'fs', config: { root: directory } } },
          },
        });
        await disks.initialize();
        const config = new OniPublishing();
        config.defaultSite = 'qualified';
        config.sites = {
          qualified: {
            enabled: true,
            label: 'Qualified',
            publicUrl: 'https://data.example.invalid',
            useCleanUrl: true,
            storage: {
              driver: 'flydrive',
              diskName: 'oni',
              prefix: 'ocfl',
              rootPath: '/objects',
              workspacePath: '/workspace',
              tempDir: join(directory, 'temp'),
              ...(keyEncoding ? { keyEncoding } : {}),
            },
          },
        };
        const bytes = Buffer.from('actual selected attachment bytes\n');
        const datastream = {
          getDatastream: async (oid, fileId) => {
            assert.equal(oid, 'qualified-data');
            assert.equal(fileId, 'selected');
            return { readstream: Readable.from([bytes]) };
          },
        };
        const actual = createOniRepository({ storageManager: disks, log }, config, config.sites.qualified, datastream);
        const audits = new Audits.IntegrationAuditService({
          storage: storage.storage,
          log,
          environment: 'integrationtest',
          enqueue: async () => {},
        });
        const audit = makeOniAuditService(audits);
        const oni = new Oni.OniService({
          log,
          configuration: () => config,
          brand: () => ({ id: 'qualified-brand', name: 'qualified' }),
          brandName: () => 'qualified',
          creator: unexpected,
          records: { updateMetaInternal: unexpected },
          audit,
          createRepository: () => ({
            ensureStorageRoot: () => actual.ensureStorageRoot(),
            ensureRootCollection: (...args) => actual.ensureRootCollection(...args),
            writeDatasetObject: async (...args) => {
              entered.resolve();
              await release.promise;
              return actual.writeDatasetObject(...args);
            },
          }),
          runWork: operation => runtime.runAcceptedPersistenceWork(owner, operation),
          publish: (...args) => runPublishDatasetProgram(log, ...args),
        });
        app = new ApplicationRuntime(owner, [
          {
            name: 'audits',
            create: () => ({ initialize: async () => {}, drain: () => audits.drain(), close: () => audits.close() }),
          },
          {
            name: 'oni',
            create: () => ({ initialize: async () => {}, drain: () => oni.drain(), close: () => oni.close() }),
          },
        ]);
        await app.initialize();
        await app.activate();
        const record = {
          metadata: {
            title: 'Qualified dataset',
            description: 'Qualified description',
            finalKeywords: [],
            citation_doi: '',
            dataRecord: { oid: 'qualified-data' },
            creators: [{ email: 'creator@example.invalid', text_full_name: 'Qualified Creator' }],
            dataLocations: [{ type: 'attachment', selected: true, fileId: 'selected', name: 'data.csv' }],
          },
          metaMetadata: { brandId: 'qualified-brand', createdBy: 'creator', createdOn: '2026-10-24T00:00:00.000Z' },
        };
        const context = {
          recordOid: 'qualified-publication',
          brandId: 'qualified-brand',
          brandName: 'qualified',
          siteName: 'qualified',
          correlationId: 'qualification',
          triggerSource: 'qualification',
        };
        const parent = audits.startAudit('qualified-publication', IntegrationAuditAction.publishOniDataset, {
          integrationName: IntegrationAuditName.oni,
          brandId: 'qualified-brand',
        });
        const publishing = runtime.runAcceptedPersistenceWork(owner, async () => {
          const result = await oni.runPublishDataset(
            {
              oid: 'qualified-publication',
              record,
              options: {},
              user: { email: 'approver@example.invalid' },
              creator: { email: 'creator@example.invalid' },
            },
            config,
            context,
            oni.createRepository(config, config.sites.qualified),
            parent
          );
          await audits.completeAudit(parent, { message: 'Qualified OCFL completed' });
          return result;
        });
        // Ensure failed provider work cannot strand the gate if OCFL initialization fails.
        const outcome = await Promise.race([entered.promise.then(() => 'entered'), publishing.then(() => 'finished')]);
        assert.equal(outcome, 'entered');
        let stopped = false;
        const stopping = app.stop().then(() => {
          stopped = true;
        });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(stopped, false);
        release.resolve();
        const result = await publishing;
        await stopping;
        assert.equal(result.attachments.length, 1);
        const files = [];
        for (const relative of await readdir(directory, { recursive: true })) {
          const path = join(directory, relative);
          try {
            files.push({ relative, bytes: await readFile(path) });
          } catch (error) {
            if (error.code !== 'EISDIR') throw error;
          }
        }
        assert(
          files.some(file => file.bytes.equals(bytes)),
          'actual OCFL content must contain the selected bytes'
        );
        assert(
          files.some(
            file => file.bytes.toString().includes('Qualified dataset') && file.bytes.toString().includes(result.rootId)
          )
        );
        assert(files.some(file => file.relative.endsWith('inventory.json')));
        assert(
          files.some(file => file.relative === (keyEncoding === 'raw' ? 'ocfl/0=ocfl_1.1' : 'ocfl/0%3Docfl_1.1')),
          'retain the encoded OCFL storage layout'
        );
        const auditRows = await native.db().collection('integrationaudit').countDocuments();
        assert.equal(auditRows, 6);
        assert.equal(app.status().persistence.ready, false);
        assert.equal(global.sails, undefined);
        assert(
          !Object.keys(require.cache).some(file => /[/\\](CoreBase|CoreService|compat[/\\]sails[/\\])/.test(file))
        );
        console.log(
          JSON.stringify({ ocflFiles: files.length, selectedBytes: bytes.length, auditRows, drainWaited: true })
        );
      } finally {
        release.resolve();
        await app?.stop();
        await runtime.cleanupPersistence(owner);
        await native.db().dropDatabase();
        await native.close();
        await rm(directory, { recursive: true, force: true });
      }
    }
  );
}
