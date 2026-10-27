const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { mkdtemp, rm, readdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { FigsharePublishing } = require('../../dist/configmodels/FigsharePublishing');
const { createFigshareConfiguration } = require('../../dist/integrations/figshare/config');
const { createFigshareContext } = require('../../dist/integrations/figshare/context');
const { createFigshareBindings } = require('../../dist/integrations/figshare/bindings');
const { createFigshareMetadata } = require('../../dist/integrations/figshare/metadata');
const { createFigshareAssets } = require('../../dist/integrations/figshare/assets');
const { createFigshareEmbargo } = require('../../dist/integrations/figshare/embargo');
const { makeLiveClient } = require('../../dist/services/figshare-v2/http');
const { Services: Disks } = require('../../dist/storage/StorageManager');

test(
  'owned Figshare mappings, isolated license caches and streamed filesystem upload use real HTTP',
  { timeout: 30000 },
  async () => {
    assert.equal(process.version, 'v26.12.1');
    assert.equal(global.sails, undefined);
    const directory = await mkdtemp(join(tmpdir(), 'sr-p7-figshare-helpers-'));
    const bytes = Buffer.from('qualified streamed Figshare attachment\n');
    const entered = Promise.withResolvers(),
      release = Promise.withResolvers();
    let baseUrl,
      licenseRequests = 0,
      completed = false,
      uploadRequests = 0,
      metadataWrites = 0,
      embargoWrites = 0;
    let article = { id: 51, is_embargoed: false },
      uploaded;
    const server = createServer(async (req, res) => {
      try {
        const path = new URL(req.url, baseUrl).pathname;
        assert.equal(req.headers.authorization, path.startsWith('/upload/') ? undefined : 'token qualification-only');
        const chunks = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = Buffer.concat(chunks);
        const send = (value, status = 200) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(value));
        };
        if (path === '/account/licenses') {
          licenseRequests++;
          return send([{ value: 1, name: 'CC-BY', url: 'https://license.invalid' }]);
        }
        if (path === '/account/articles' && req.method === 'POST') {
          metadataWrites++;
          article = { ...article, ...JSON.parse(body) };
          return send({ entity_id: 51 }, 201);
        }
        if (path === '/account/articles/51') return send(article);
        if (path === '/account/articles/51/files' && req.method === 'GET')
          return send(completed ? [{ id: 101, name: 'data.csv', status: 'available', size: bytes.length }] : []);
        if (path === '/account/articles/51/files' && req.method === 'POST') {
          assert.equal(JSON.parse(body).size, bytes.length);
          return send({ location: baseUrl + '/account/articles/51/files/101' }, 201);
        }
        if (path === '/account/articles/51/files/101' && req.method === 'GET')
          return send({ id: 101, upload_url: baseUrl + '/upload/101', status: completed ? 'available' : 'created' });
        if (path === '/upload/101')
          return send({ parts: [{ partNo: 1, startOffset: 0, endOffset: bytes.length - 1 }] });
        if (path === '/upload/101/1' && req.method === 'PUT') {
          uploadRequests++;
          uploaded = body;
          entered.resolve();
          await release.promise;
          return send({});
        }
        if (path === '/account/articles/51/files/101' && req.method === 'POST') {
          completed = true;
          return send({ id: 101, status: 'available' });
        }
        if (path === '/account/articles/51/embargo' && req.method === 'PUT') {
          embargoWrites++;
          Object.assign(article, JSON.parse(body));
          return send(article);
        }
        throw new Error('Unexpected qualification HTTP route: ' + path);
      } catch (error) {
        res.writeHead(500);
        res.end(String(error));
      }
    });
    try {
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      baseUrl = 'http://127.0.0.1:' + server.address().port;
      const settings = new FigsharePublishing();
      settings.enabled = true;
      settings.connection.baseUrl = baseUrl;
      settings.connection.token = 'qualification-only';
      settings.metadata.license.matchBy = 'valueExact';
      settings.article.publishMode = 'manual';
      const brand = { id: 'qualified-brand', name: 'qualified' };
      const configuration = createFigshareConfiguration({
        configuration: name => {
          assert.equal(name, 'qualified');
          return { figsharePublishing: settings };
        },
        brandById: id => (id === brand.id ? brand : undefined),
        brandByName: name => (name === brand.name ? brand : undefined),
        development: { enabled: false, mode: 'live' },
        environment: 'production',
        log,
      });
      const context = createFigshareContext({
        brandName: configuration.getBrandName,
        branding: {
          getBrandById: id => (id === brand.id ? brand : undefined),
          getBrand: name => (name === brand.name ? brand : undefined),
        },
      });
      const bindings = createFigshareBindings({ crosswalk: {}, log });
      const record = {
        redboxOid: 'qualified',
        metaMetadata: { brandId: brand.id },
        metadata: {
          title: 'Qualified title',
          description: 'Qualified description',
          finalKeywords: ['qualified'],
          license: '1',
          dataLocations: [{ type: 'attachment', fileId: 'selected', name: 'data.csv', selected: true }],
        },
      };
      const config = configuration.resolveFigsharePublishingConfig(record);
      const client = makeLiveClient(config, context.createRunContext(record, config), log);
      const newMapping = () =>
        createFigshareMetadata({
          bindings,
          bindingContext: context.createBindingContext,
          licenseCache: new Map(),
          log,
        });
      const mapping = newMapping();
      const payload = await mapping.buildMetadataPayload(config, record, client);
      assert.equal(payload.license, 1);
      await mapping.buildMetadataPayload(config, record, client);
      assert.equal(licenseRequests, 1);
      await newMapping().buildMetadataPayload(config, record, client);
      assert.equal(licenseRequests, 2, 'another instance owns a fresh cache');
      await mapping.syncMetadataPhase(client, config, record, {
        action: 'create',
        syncState: { status: 'idle' },
        sameJob: false,
      });
      assert.equal(metadataWrites, 1);
      assert.equal(article.title, record.metadata.title);
      const disks = new Disks.StorageManager({
        config: {
          stagingDisk: 'figshare-staging',
          primaryDisk: 'figshare-staging',
          disks: { 'figshare-staging': { driver: 'fs', config: { root: directory } } },
        },
        log,
      });
      await disks.initialize();
      const assets = createFigshareAssets({
        disks,
        log,
        datastream: () => ({
          getDatastream: async (oid, fileId) => {
            assert.equal(oid, 'qualified');
            assert.equal(fileId, 'selected');
            return { readstream: Readable.from([bytes]), size: bytes.length };
          },
        }),
      });
      const work = assets.syncAssetsPhase(client, config, record, article, { status: 'idle' }, log);
      assert.equal(await Promise.race([entered.promise.then(() => 'entered'), work.then(() => 'finished')]), 'entered');
      let finished = false;
      void work.then(() => {
        finished = true;
      });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(finished, false);
      assert((await readdir(directory, { recursive: true })).some(name => name.endsWith('/data.csv')));
      release.resolve();
      const result = await work;
      assert.equal(result.uploadedAttachments.length, 1);
      assert.equal(result.uploadsComplete, true);
      assert.equal(uploadRequests, 1);
      assert(uploaded.equals(bytes));
      assert(!(await readdir(directory, { recursive: true })).some(name => name.endsWith('/data.csv')));
      Object.assign(record.metadata, {
        accessRights: 'embargo',
        embargoType: 'article',
        embargoUntil: '2030-01-01',
        embargoReason: 'Qualified reason',
      });
      const embargo = createFigshareEmbargo({ bindings, bindingContext: context.createBindingContext });
      await embargo.syncEmbargoPhase(client, config, record, '51');
      await embargo.syncEmbargoPhase(client, config, record, '51');
      assert.equal(embargoWrites, 1, 'unchanged remote embargo is idempotent');
      assert.equal(global.sails, undefined);
      assert(!Object.keys(require.cache).some(file => /[/\\](CoreBase|CoreService|compat[/\\]sails[/\\])/.test(file)));
      console.log(
        JSON.stringify({
          licenseRequests,
          metadataWrites,
          uploadRequests,
          selectedBytes: uploaded.length,
          embargoWrites,
          awaitedUpload: true,
        })
      );
    } finally {
      release.resolve();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    }
  }
);
