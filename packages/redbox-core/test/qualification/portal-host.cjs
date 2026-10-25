// Exercises the production application composition, not a test-domain replacement.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, writeFile, symlink, mkdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { MongoClient } = require('mongodb');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { createPortalHost } = require('../../dist/application/portal/host');
const { prepareSelectedPersistenceIndexes } = require('../../dist/persistence/maintenance');
const runtime = require('../../dist/persistence/runtime');
const { Readable } = require('node:stream');
const { Datastream } = require('../../dist/extensions/storage');
const { Project } = require('ts-morph');
const { updateRoutes } = require('../../../redbox-dev-tools/dist/utils/config-helper');

test(
  'production Express host serves existing pages and authenticated APIs and stops without Sails',
  { timeout: 120000 },
  async () => {
    assert.equal(process.version, 'v26.11.1');
    const rootContext = process.env.SR_PORTAL_ROOT_CONTEXT ?? '';
    assert(['', '/research'].includes(rootContext));
    const url = process.env.SR_PORTAL_MONGO_URL;
    assert(url, 'SR_PORTAL_MONGO_URL is required');
    assert.equal(new URL(url).pathname, '/sr_p7_portal_http');
    assert(process.env.SR_PORTAL_SOLR_PORT, 'SR_PORTAL_SOLR_PORT is required');
    const storageUrl = process.env.SR_PORTAL_STORAGE_URL ?? url;
    assert.equal(new URL(storageUrl).pathname, '/sr_p7_portal_http');
    const native = await new MongoClient(url).connect();
    const bytes = await new MongoClient(storageUrl).connect();
    const directory = await mkdtemp(join(tmpdir(), 'sr-p7-portal-'));
    let portal;
    let releaseWork;
    const elections = [];
    const metadata = [];
    try {
      assert.equal((await native.db().listCollections().toArray()).length, 0, 'use a disposable empty database');
      if (process.env.SR_MATRIX_VERSION) {
        assert.notEqual(new URL(url).host, new URL(storageUrl).host);
        for (const client of [native, bytes]) {
          const hello = await client.db().command({ hello: 1 });
          const build = await client.db().command({ buildInfo: 1 });
          const fcv = await client.db('admin').command({ getParameter: 1, featureCompatibilityVersion: 1 });
          assert.equal(build.version, process.env.SR_MATRIX_VERSION);
          assert.equal(fcv.featureCompatibilityVersion.version, process.env.SR_MATRIX_FCV);
          if (process.env.SR_MATRIX_REPLICA === 'true') assert.equal(hello.hosts.length, 3);
          metadata.push({ version: build.version, fcv: fcv.featureCompatibilityVersion.version, hosts: hello.hosts });
        }
      }
      const dependencies = {
        '@researchdatabox/sails-hook-redbox-storage-mongo': 'sails-hook-redbox-storage-mongo',
        '@researchdatabox/sails-hook-redbox-pdfgen': 'sails-hook-redbox-pdfgen',
        'redbox-hook-dev': 'redbox-hook-dev',
      };
      await mkdir(join(directory, 'node_modules', '@researchdatabox'), { recursive: true });
      for (const [name, folder] of Object.entries(dependencies))
        await symlink(resolve('packages', folder), join(directory, 'node_modules', name));
      // Mount the actual controller generator's declaration in the production host.
      const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { module: 1 } });
      for (const route of [
        'post /:branding/:portal/generated-write',
        'get /:branding/:portal/generated-write',
        'get /:branding/:portal/generated-alias',
      ]) await updateRoutes({
        project,
        paths: { coreTypes: '/generated/core' },
        root: '/generated',
        route,
        controllerName: 'GeneratedController',
        action: 'save',
        webservice: true,
        dryRun: false,
      });
      const emitted = project.getSourceFiles()[0].getEmitOutput().getOutputFiles()[0].getText();
      const output = { exports: {} };
      new Function('exports', emitted)(output.exports);
      const generatedRoot = join(directory, 'node_modules/redbox-hook-generated-controller');
      await mkdir(generatedRoot);
      await writeFile(join(generatedRoot, 'package.json'), JSON.stringify({
        name: 'redbox-hook-generated-controller', main: 'index.cjs', redbox: { extension: '.' },
      }));
      await writeFile(join(generatedRoot, 'index.cjs'), `
        exports.registerRedboxExtension = () => ({ apiVersion: 1,
          routes: ${JSON.stringify(output.exports.routes)},
          handlers: [{ name: 'api-GeneratedController-save', create: () =>
            (_req, res) => res.json({ generated: true }) }]
        });
      `);
      dependencies['redbox-hook-generated-controller'] = 'redbox-hook-generated-controller';
      await writeFile(
        join(directory, 'package.json'),
        JSON.stringify({
          name: 'sr-p7-portal-qualification',
          version: '1.0.0',
          dependencies: Object.fromEntries(Object.keys(dependencies).map(name => [name, '1.0.0'])),
        })
      );
      for (const name of ['views', 'assets']) await symlink(resolve(name), join(directory, name));
      const applicationFile = join(directory, 'application.cjs');
      await writeFile(
        applicationFile,
        'module.exports = ' +
          JSON.stringify({
            server: { port: 18517, hostname: '127.0.0.1', rootContext, publicUrl: 'http://127.0.0.1:18517' + rootContext },
            i18n: { next: { init: { debug: false } } },
            figshareDev: { enabled: true, mode: 'fixture', fixtures: { article: { id: 'fixture-123' } } },
            datastores: {
              mongodb: { url },
              redboxStorage: { url: storageUrl.replace('/sr_p7_portal_http', '/sr_p7_portal_http_storage') },
            },
            agendaQueue: { options: { db: url.replace('/sr_p7_portal_http', '/sr_p7_portal_http_agenda') } },
            redboxSession: {
              mongoUrl: url.replace('/sr_p7_portal_http', '/sr_p7_portal_http_sessions'),
              cookie: { secure: false },
            },
            storage: {
              disks: {
                staging: { driver: 'fs', config: { root: join(directory, 'staging') } },
                primary: { driver: 'fs', config: { root: join(directory, 'primary') } },
                'figshare-staging': { driver: 'fs', config: { root: join(directory, 'figshare') } },
              },
            },
            vocab: { bootstrapRvaImports: false },
            recordSchema: { enabled: true, unknownProperties: 'allow' },
            recordtype: {
              rdmp: { concurrentModification: { mode: 'strict' } },
              dataPublication: { recordValidation: { mode: 'enforce' } },
            },
            solr: {
              clientSleepTimeMillis: 0,
              cores: {
                default: {
                  options: { host: '127.0.0.1', port: Number(process.env.SR_PORTAL_SOLR_PORT), core: 'redbox' },
                },
              },
            },
          }) +
          ';'
      );
      const options = {
        appPath: directory,
        assetRoots: [resolve('.tmp/public')],
        log,
        files: { application: applicationFile },
        localesDirectory: resolve('language-defaults'),
        env: {
          REDBOX_SESSION_SECRET: 'portal-qualification-only-at-least-32-characters',
          REDBOX_ADMIN_TOKEN: 'portal-host-qualification-token',
          REDBOX_ADMIN_PASSWORD: 'portal-host-qualification-password',
        },
        bindings: {
          handler(registration) {
            assert.equal(registration.declaration.name, 'api-GeneratedController-save');
            return () => registration.declaration.create({});
          },
        },
      };
      portal = await createPortalHost(options);
      const maintenance = { config: portal.config, log };
      try {
        assert.equal(
          (
            await prepareSelectedPersistenceIndexes(maintenance, 'ensure', {
              storage: portal.preflight,
              agenda: portal.config.agendaQueue.options,
              session: portal.config.redboxSession,
            })
          ).ready,
          true
        );
      } finally {
        await runtime.cleanupPersistence(maintenance);
      }
      const pdfFactory = portal.resolved.modules.find(item => item.declaration.name === 'pdf').declaration;
      const constructPdf = pdfFactory.create;
      let pdfUrl;
      pdfFactory.create = input => { pdfUrl = input.config.appUrl; return constructPdf(input); };
      const figshareFactory = portal.resolved.modules.find(item => item.declaration.name === 'figshare').declaration;
      const constructFigshare = figshareFactory.create;
      let figshareDevelopment;
      figshareFactory.create = input => {
        figshareDevelopment = input.configuration.development;
        return constructFigshare(input);
      };
      await portal.host.initialize();
      assert.equal(pdfUrl, 'http://127.0.0.1:18517' + rootContext);
      assert.deepEqual(figshareDevelopment, portal.config.figshareDev);
      const origin = 'http://127.0.0.1:18517';
      const readyBefore = await fetch(origin + '/readyz');
      assert.equal(readyBefore.status, 503);
      assert.equal((await fetch(origin + '/healthz')).status, 200);
      await portal.host.activate();
      assert.equal((await fetch(origin + '/readyz')).status, 200);
      const request = async (path, options = {}, expectedStatus = 200) => {
        const response = await fetch(origin + rootContext + path, { redirect: 'manual', ...options });
        const text = await response.text();
        assert.equal(response.status, expectedStatus, path + ': ' + text.slice(0, 500));
        return { response, text };
      };
      const home = await request('/default/rdmp/home');
      assert(home.text.includes(`href="${rootContext}/default/rdmp/styles/style.min.css"`));
      if (rootContext) assert(!home.text.includes(rootContext + rootContext));
      assert(home.text.includes(`rootContext="${rootContext}"`));
      const client = JSON.parse((await request('/default/rdmp/dynamic/apiClientConfig.json')).text);
      assert.equal(client.baseUrl, origin);
      // HttpClientService receives the page root independently through APP_BASE_HREF.
      const angularApi = `${client.baseUrl}${rootContext}/${client.branding}/${client.portal}/api/recordtypes`;
      assert.equal(angularApi, origin + rootContext + '/default/rdmp/api/recordtypes');
      await request('/default/rdmp/styles/style.min.css');
      const namespace = await request('/default/rdmp/locales/en/translation.json', {
        headers: { Authorization: 'Bearer portal-host-qualification-token' },
      });
      assert(Object.keys(JSON.parse(namespace.text)).length > 0);
      const headers = {
        Authorization: 'Bearer portal-host-qualification-token',
        Accept: 'application/json',
        'X-Source': 'jsclient',
      };
      const angularResponse = await fetch(angularApi, { headers });
      assert.equal(angularResponse.status, 200);
      await angularResponse.text();
      for (const path of ['/default/rdmp/generated-write', '/default/rdmp/generated-alias']) {
        await request(path, {}, 401);
        assert.deepEqual(JSON.parse((await request(path, { headers })).text), { generated: true });
      }
      const generatedPath = '/default/rdmp/generated-write';
      await request(generatedPath, { method: 'POST' }, 401);
      assert.deepEqual(JSON.parse((await request(generatedPath, { method: 'POST', headers })).text), {
        generated: true,
      });
      const initialCsrf = await request('/csrfToken');
      const initialCookie = initialCsrf.response.headers.get('set-cookie').split(';')[0];
      const login = await request('/user/login_local', {
        method: 'POST',
        headers: {
          Cookie: initialCookie, 'Content-Type': 'application/json', 'X-Source': 'jsclient',
          'X-CSRF-Token': JSON.parse(initialCsrf.text)._csrf,
        },
        body: JSON.stringify({ username: 'admin', password: 'portal-host-qualification-password' }),
      });
      assert.equal(JSON.parse(login.text).message, 'Login OK');
      const cookie = login.response.headers.get('set-cookie').split(';')[0];
      await request(generatedPath, { method: 'POST', headers: { Cookie: cookie } }, 403);
      const browserCsrf = JSON.parse((await request('/csrfToken', { headers: { Cookie: cookie } })).text)._csrf;
      assert.deepEqual(JSON.parse((await request(generatedPath, {
        method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': browserCsrf },
      })).text), { generated: true });
      await request('/default/rdmp/admin/vocabulary/manager', { headers });
      for (const path of ['/api/recordtypes', '/api/forms', '/api/forms/get?name=dataPublication-1.0-draft'])
        await request('/default/rdmp' + path, { headers });
      const created = await request(
        '/default/rdmp/api/records/metadata/rdmp',
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Production Express write qualification', authorization: [] }),
        },
        201
      );
      const saved = JSON.parse(created.text);
      const oid = saved.data?.oid ?? saved.oid;
      assert(oid, JSON.stringify(saved));
      assert(created.response.headers.get('etag'), 'record create returns its persisted concurrency tag');
      if (process.env.SR_MATRIX_REPLICA === 'true') {
        for (const client of [native, bytes]) {
          const before = await client.db().command({ hello: 1 });
          const status = await client.db('admin').command({ replSetGetStatus: 1 });
          assert.equal(status.members.length, 3);
          assert(status.members.every(member => member.health === 1 && [1, 2].includes(member.state)));
          try {
            await client.db('admin').command({ replSetStepDown: 15, force: true });
          } catch (error) {
            assert(/network|connection|stepped down|not primary/i.test(String(error)), String(error));
          }
          const deadline = Date.now() + 45000;
          let after;
          while (Date.now() < deadline) {
            try {
              after = await client.db().command({ hello: 1 });
              if (after.isWritablePrimary && after.me !== before.me) break;
            } catch {
              /* Temporary election failure must recover within the deadline. */
            }
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          assert(after?.isWritablePrimary && after.me !== before.me, 'A different member must become primary');
          elections.push({ set: before.setName, before: before.me, after: after.me });
        }
      }
      await request('/default/rdmp/api/records/metadata/' + oid, { headers });
      const write = {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json', 'If-Match': created.response.headers.get('etag') },
        body: JSON.stringify({ title: 'Updated by production Express' }),
      };
      await request('/default/rdmp/api/records/metadata/' + oid, write);
      await request('/default/rdmp/api/records/metadata/' + oid, write, 412);
      await request(
        '/default/rdmp/api/records/metadata/dataPublication',
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', 'X-ReDBox-Api-Version': '2.0' },
          body: JSON.stringify({ title: 'Production enforce-mode qualification' }),
        },
        201
      );
      const denied = await fetch(origin + rootContext + '/default/rdmp/api/recordtypes', {
        redirect: 'manual',
        headers: { Accept: 'application/json' },
      });
      assert.equal(denied.status, 401);
      const storage = portal.data.storage();
      await storage.addDatastream(oid, new Datastream({ fileId: 'matrix.txt', mimeType: 'text/plain' }), {
        getStream: async () => Readable.from(Buffer.from('production portal after election')),
      });
      const download = await storage.getDatastream(oid, 'matrix.txt');
      const chunks = [];
      for await (const chunk of download.readstream) chunks.push(chunk);
      assert.equal(Buffer.concat(chunks).toString(), 'production portal after election');
      const storageDb = bytes.db('sr_p7_portal_http_storage');
      assert.equal(await native.db().collection('record').countDocuments(), 0);
      assert((await storageDb.collection('record').countDocuments()) > 0);
      assert.equal(await storageDb.collection('recordtype').countDocuments(), 0);
      const entered = Promise.withResolvers(),
        release = Promise.withResolvers();
      releaseWork = release.resolve;
      const accepted = runtime.runAcceptedPersistenceWork(portal.owner, async () => {
        entered.resolve();
        await release.promise;
        assert.equal((await storage.getMeta(oid)).metadata.title, 'Updated by production Express');
      });
      await entered.promise;
      await assert.rejects(portal.host.stop({ deadlineMs: 30 }), /deadline|drain/i);
      assert(runtime.persistenceStatus(portal.owner).pools > 0);
      release.resolve();
      await accepted;
      await portal.host.stop({ deadlineMs: 10000 });
      assert.equal(runtime.persistenceStatus(portal.owner).pools, 0);
      assert.equal(runtime.persistenceStatus(portal.owner).prismaClients, 0);
      await assert.rejects(storage.getMeta(oid), /unavailable|drain/i);
      portal = await createPortalHost(options);
      await portal.host.initialize();
      await portal.host.activate();
      await request('/default/rdmp/api/records/metadata/' + oid, { headers });
      await portal.host.stop();
      assert.equal(runtime.persistenceStatus(portal.owner).pools, 0);
      assert.equal(global.sails, undefined);
      assert(
        !Object.keys(require.cache).some(file => /[/\\](CoreBase|CoreService|services[/\\]index)\.js$/.test(file)),
        'production graph must not load comparison modules'
      );
      console.log(
        JSON.stringify({
          productionHost: true,
          metadata,
          elections,
          separatePlacement: new URL(url).host !== new URL(storageUrl).host,
          restart: true,
          gridfs: true,
          drainDeadlineRetry: true,
          authenticatedApis: 10,
          assets: 1,
          translationNamespaces: 1,
          pages: 1,
          health: 200,
          readyBefore: 503,
          readyAfter: 200,
          anonymousApi: 401,
          generatedRoute: { anonymous: 401, bearer: 200, browserWithoutCsrf: 403, browserWithCsrf: 200 },
          figshareFactoryConfiguration: true,
          stopped: true,
          pools: 0,
        })
      );
    } finally {
      releaseWork?.();
      await portal?.host.stop();
      for (const suffix of ['', '_storage', '_agenda', '_sessions'])
        await native.db('sr_p7_portal_http' + suffix).dropDatabase();
      await bytes.db('sr_p7_portal_http_storage').dropDatabase();
      await bytes.close();
      await native.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
);
