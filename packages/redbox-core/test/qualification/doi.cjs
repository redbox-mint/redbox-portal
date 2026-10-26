const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { MongoClient } = require('mongodb');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { Services: Doi } = require('../../dist/integrations/Doi');
const { Services: Audits } = require('../../dist/queries/IntegrationAudits');
const { doiAudit } = require('../../dist/integrations/doi/audit');
const configResolution = require('../../dist/integrations/doi/config');
const programs = require('../../dist/integrations/doi/runtime');
const { makeClientLayer } = require('../../dist/services/doi-v2/http');
const { brandingConfigurationDefaults } = require('../../dist/config/brandingConfigurationDefaults.config');
const { createDefaultBinding: binding } = require('../../dist/configmodels/DoiPublishing');
const storageHook = require('@researchdatabox/sails-hook-redbox-storage-mongo/extension');
const runtime = require('../../dist/persistence/runtime');

test('owned DOI sends actual HTTP and awaits durable nested audit completion', { timeout: 30000 }, async () => {
  assert.equal(process.version, 'v26.11.1');
  assert.equal(global.sails, undefined);
  const url = process.env.SR_DOI_MONGO_URL;
  assert(url, 'SR_DOI_MONGO_URL is required; qualification cannot skip');
  assert.equal(new URL(url).pathname, '/sr_p7_doi');
  const native = await new MongoClient(url).connect();
  const owner = { config: { datastores: { mongodb: { url }, redboxStorage: { url } } }, log };
  const requested = Promise.withResolvers();
  const releaseHttp = Promise.withResolvers();
  const notified = Promise.withResolvers();
  const releaseNotification = Promise.withResolvers();
  const requests = [],
    notifications = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ method: req.method, path: req.url, data: JSON.parse(Buffer.concat(chunks).toString()) });
    requested.resolve();
    await releaseHttp.promise;
    res.writeHead(requests.length === 1 ? 201 : 422, { 'Content-Type': 'application/vnd.api+json' });
    res.end(
      JSON.stringify(
        requests.length === 1 ? { data: { id: '10.1234/qualified' } } : { errors: [{ title: 'Rejected fixture' }] }
      )
    );
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    assert.equal((await native.db().listCollections().toArray()).length, 0);
    await runtime.initializePersistence(owner);
    await storageHook.ensurePrismaStagedStorageIndexes(owner);
    const unexpected = () => {
      throw new Error('Unused provider collaborator invoked');
    };
    const module = storageHook.createMongoStorageModule({
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
    await module.initialize();
    const audits = new Audits.IntegrationAuditService({
      storage: module.storage,
      log,
      environment: 'integrationtest',
      enqueue: async (name, entry) => {
        notifications.push({ name, entry });
        notified.resolve();
        await releaseNotification.promise;
      },
    });
    const audit = doiAudit(audits);
    const config = structuredClone(brandingConfigurationDefaults.doiPublishing);
    config.enabled = true;
    config.defaultProfile = 'qualified';
    config.connection = {
      ...config.connection,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      username: 'local',
      password: '$QUALIFIED_DOI_PASSWORD',
      timeoutMs: 10000,
      retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, retryOnStatusCodes: [], retryOnMethods: [] },
    };
    config.profiles = {
      qualified: {
        enabled: true,
        label: 'Qualified',
        metadata: {
          prefix: binding('', '10.1234'),
          url: binding('', 'https://example.invalid/qualified'),
          publicationYear: binding('', '2026'),
          publisher: binding('', 'Qualified'),
          creators: [],
          titles: [{ title: binding('', 'Qualified record') }],
          types: { resourceTypeGeneral: binding('', 'Dataset') },
        },
        writeBack: {
          citationUrlPath: 'metadata.citation_url',
          citationDoiPath: 'metadata.citation_doi',
          generatedCitationPath: 'metadata.citation_generated',
          citationString: binding('', 'Qualified citation'),
        },
        validation: {
          requireUrl: true,
          requirePublisher: true,
          requirePublicationYear: true,
          requireCreators: false,
          requireTitles: true,
        },
      },
    };
    const configurationInput = {
      configuration: name => (name === 'qualified' ? config : undefined),
      brandById: id => (id === 'qualified-brand' ? { id, name: 'qualified' } : undefined),
      env: { QUALIFIED_DOI_PASSWORD: 'qualification-only' },
    };
    const execution = { log, audit, clientLayer: makeClientLayer };
    const doi = new Doi.Doi({
      log,
      translate: key => key,
      audit,
      configuration: {
        record: record => configResolution.resolveDoiPublishingConfig(configurationInput, record),
        brand: brand => configResolution.resolveDoiPublishingConfigForBrand(configurationInput, brand),
      },
      records: { updateMetaInternal: unexpected },
      programs: {
        create: (...args) => programs.runCreateDoiProgram(execution, ...args),
        update: (...args) => programs.runUpdateDoiProgram(execution, ...args),
        delete: (...args) => programs.runDeleteDoiProgram(execution, ...args),
        changeState: (...args) => programs.runChangeDoiStateProgram(execution, ...args),
      },
    });
    const record = { redboxOid: 'qualified-record', metaMetadata: { brandId: 'qualified-brand' }, metadata: {} };
    const publishing = doi.publishDoi('qualified-record', record);
    let finished = false;
    void publishing.then(() => {
      finished = true;
    });
    await requested.promise;
    assert.equal(finished, false, 'provider I/O must be awaited');
    releaseHttp.resolve();
    await notified.promise;
    assert.equal(finished, false, 'audit notification submission must be awaited');
    let drained = false;
    const draining = audits.drain().then(() => {
      drained = true;
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(drained, false);
    releaseNotification.resolve();
    assert.equal(await publishing, '10.1234/qualified');
    await draining;
    await audits.drain();
    const rows = await native.db().collection('integrationaudit').find().toArray();
    assert.equal(rows.length, 4);
    assert.equal(rows.filter(row => row.status === 'success').length, 2);
    assert.equal(new Set(rows.map(row => row.traceId)).size, 1);
    assert.equal(new Set(rows.map(row => row.spanId)).size, 2);
    assert(rows.some(row => row.parentSpanId));
    assert(rows.every(row => row.brandId === 'qualified-brand'));
    assert.equal(requests[0].data.data.attributes.event, 'publish');
    await assert.rejects(doi.publishDoi('qualified-record', record), /doi-error-creating/);
    await audits.close();
    const failed = await native.db().collection('integrationaudit').countDocuments({ status: 'failed' });
    assert.equal(failed, 2);
    assert.equal(notifications.length, 4);
    assert(
      !JSON.stringify(await native.db().collection('integrationaudit').find().toArray()).includes('qualification-only')
    );
    assert.equal(config.connection.password, '$QUALIFIED_DOI_PASSWORD', 'resolution must not mutate config');
    assert.equal(global.sails, undefined);
    assert(!Object.keys(require.cache).some(file => /[/\\](CoreBase|CoreService|compat[/\\]sails[/\\])/.test(file)));
    console.log(
      JSON.stringify({
        httpRequests: requests.length,
        persistedSuccessAuditRows: rows.length,
        failedRows: failed,
        notifications: notifications.length,
        drainWaited: true,
      })
    );
  } finally {
    releaseHttp.resolve();
    releaseNotification.resolve();
    await runtime.cleanupPersistence(owner);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await native.db().dropDatabase();
    await native.close();
  }
});
