import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { createPortalFastifyApplication, createPortalFastifyHost } from '../../../src/application/portal';
import { prepareSelectedPersistenceIndexes } from '../../../src/persistence/maintenance';
import { selectedAgendaMongoOptions } from '../../../src/queues/indexes';
import { getIdentityRepositories } from '../../../src/persistence/identity/runtime';
import { getBrandingRepository } from '../../../src/persistence/branding/runtime';
import { HttpIdentity } from '../../../src/http/express/identity';
import { requestContext } from '../../../src/http/context';
import { persistenceStatus } from '../../../src/persistence/runtime';
import type { ApiRouteSource } from '../../../src/http/fastify/routes';

const execute = promisify(execFile);
const root = path.resolve(__dirname, '../../../../..');
const { migratedDeclarations } = require(
  path.join(root, 'support/specs/fastify-migration/evidence/reconcile-FM-028.cjs')
) as {
  migratedDeclarations: readonly ApiRouteSource[];
};

describe('FM-028 existing complete P3 Bruno API profiles on Fastify', function () {
  this.timeout(900000);
  it('runs reference, identity, mutation, schema and query profiles through the ordinary production modules', async () => {
    assert(process.env.HTTP_PILOT_TEST_MONGO_URL && process.env.HTTP_READ_SOLR_PORT);
    const directory = await mkdtemp(path.join(tmpdir(), 'fm028-bruno-'));
    const uri = new URL(process.env.HTTP_PILOT_TEST_MONGO_URL);
    assert.equal(uri.pathname, '/sr_p4_http');
    uri.pathname = '/fm028_bruno_' + process.pid;
    const client = await new MongoClient(uri.href).connect();
    let stop: (() => Promise<void>) | undefined;
    try {
      assert.match((await client.db().admin().command({ buildInfo: 1 })).version, /^9\./);
      assert.equal(
        await client
          .db()
          .collections()
          .then(rows => rows.length),
        0,
        'Disposable empty database required'
      );
      const tailscale = JSON.parse((await execute('tailscale', ['status', '--json'], { timeout: 10000 })).stdout);
      const dns = String(tailscale.Self.DNSName).replace(/\.$/, '');
      assert(dns);
      const publicUrl = 'http://' + dns + ':35028';
      const providers = ['@researchdatabox/sails-hook-redbox-storage-mongo', 'redbox-hook-dev'];
      await writeFile(
        path.join(directory, 'package.json'),
        JSON.stringify({
          name: 'fm028-bruno',
          version: '1.0.0',
          dependencies: Object.fromEntries(providers.map(name => [name, '1.0.0'])),
        })
      );
      for (const name of providers) {
        const location = path.join(directory, 'node_modules', name);
        await mkdir(location, { recursive: true });
        await writeFile(
          path.join(location, 'package.json'),
          JSON.stringify({
            name,
            version: '1.0.0',
            main: 'index.cjs',
            redbox: { extension: './index.cjs' },
          })
        );
        // Only the fixture registration envelope changes version. All actual
        // domains, forms, workflows and configuration still come from the package.
        // This is not bundled-hook migration/release qualification (FM-038).
        await writeFile(
          path.join(location, 'index.cjs'),
          'const original=require(' +
            JSON.stringify(require.resolve(name + '/extension')) +
            ');\n' +
            'Object.assign(exports,original);\n' +
            'exports.inspectPrismaStagedStorage=original.inspectPrismaStagedStorage;\n' +
            'exports.ensurePrismaStagedStorageIndexes=original.ensurePrismaStagedStorageIndexes;\n' +
            'exports.registerRedboxExtension=()=>({...original.registerRedboxExtension(),apiVersion:2});\n'
        );
      }
      for (const name of ['views', 'assets']) await symlink(path.join(root, name), path.join(directory, name));
      const config = path.join(directory, 'config.cjs');
      await writeFile(
        config,
        'module.exports=' +
          JSON.stringify({
            server: {
              hostname: '0.0.0.0',
              port: 35028,
              rootContext: '',
              publicUrl,
              trustProxy: false,
              stopDeadlineMs: 30000,
            },
            datastores: {
              mongodb: { url: uri.href, maxPoolSize: 4 },
              redboxStorage: { url: uri.href, maxPoolSize: 4 },
            },
            agendaQueue: { options: { db: uri.href, processEvery: '0.05 seconds' } },
            redboxSession: {
              mongoUrl: uri.href,
              cookie: { secure: false },
              secret: 'fm028-bruno-synthetic-secret-000000000000000000001',
            },
            storage: {
              disks: Object.fromEntries(
                ['staging', 'primary', 'figshare-staging'].map(name => [
                  name,
                  { driver: 'fs', config: { root: path.join(directory, name) } },
                ])
              ),
            },
            brandingConfigurationDefaults: {
              auth: {
                active: ['local'],
                local: {
                  default: {
                    adminUser: 'admin',
                    adminPw: 'fm028-password',
                    email: 'admin@redboxresearchdata.com.au',
                    token: 'fm028-api-token',
                  },
                },
              },
            },
            bootstrap: { bootstrapDataPath: path.join(root, 'bootstrap-data') },
            vocab: { bootstrapRvaImports: false, bootstrapFigshareImports: false },
            companion: { enabled: false },
            i18n: { next: { init: { debug: false } } },
            recordSchema: { enabled: true, unknownProperties: 'allow' },
            recordValidation: { mode: 'shadow' },
            recordtype: { dataPublication: { recordValidation: { mode: 'enforce' } } },
            solr: {
              clientSleepTimeMillis: 0,
              cores: {
                default: {
                  options: {
                    host: '127.0.0.1',
                    port: Number(process.env.HTTP_READ_SOLR_PORT),
                    core: 'redbox',
                  },
                },
              },
            },
          })
      );
      const portal = await createPortalFastifyApplication({
        appPath: directory,
        log: nothingLogger,
        files: { application: config },
        env: {},
        argv: [],
        localesDirectory: path.join(root, 'language-defaults'),
        http: { declarations: migratedDeclarations, portals: ['rdmp'] },
      });
      stop = () => portal.application.stop();
      await prepareSelectedPersistenceIndexes(portal.owner, 'ensure', {
        storage: portal.preflight,
        agenda: selectedAgendaMongoOptions(portal.config.agendaQueue),
        session: portal.config.redboxSession,
      });
      const brand = () => portal.data.reference.branding.get().getBrand('default');
      const { host } = await createPortalFastifyHost(portal, {
        prepare: undefined,
        authentication: () => ({
          identity: new HttpIdentity(getIdentityRepositories(portal.owner)),
          accounts: portal.data.accounts.get(),
          config: { active: ['local'] },
          brand,
        }),
        login: {
          credentialFields: ['username', 'password'],
          validContext: (b, p) => b === 'default' && p === 'rdmp',
          brandId: () => brand().id,
          postLoginPath: () => '/default/rdmp/home',
          audit: async (action, actor) => {
            await portal.data.users.get().addUserAuditEvent({ ...actor }, action, { brandId: brand().id });
          },
          loginFailure: async () => {},
        },
        policies: {
          branding: {
            getBrand: (key, withRoles) => getBrandingRepository(portal.owner).getBrand(key, withRoles),
          },
          pathRules: portal.data.reference.pathRules,
          defaultUnauthenticatedRole: () => undefined,
          emitRequestFailure: async (request, eventType, source) => {
            const context = requestContext(request);
            await portal.providers.security.get().emitSecurityEvent({
              brandId: context.brand.id,
              portalId: context.portal,
              eventType,
              source,
              category: 'authorization',
              requestContext: { method: request.method, path: request.url.split('?')[0] },
            });
          },
        },
      });
      stop = () => host.stop();
      await host.initialize();
      await host.activate();
      const collection = path.join(root, 'test/bruno');
      const selected: string[] = [];
      const folders = [
        '1 - Record Management',
        '2 - User Management',
        '4 - Form Management',
        '5 - Record Type Management',
        '6 - Administration',
        '7 - App Config',
        '9 - Harvesting',
        '10 - Translation',
        '12 - Dashboard Config',
        '13 - Named Query',
        '14 - Report Config',
        '15 - Record Schemas',
        '15 - SIEM',
        '16 - Record Schema Writes',
      ];
      for (const folder of folders) {
        const prefix = '1 - REST API/' + folder;
        const requests: { name: string; sequence: number }[] = [];
        for (const name of await readdir(path.join(collection, prefix))) {
          if (!name.endsWith('.bru')) continue;
          const contents = await readFile(path.join(collection, prefix, name), 'utf8');
          if (/url:.*\/api\/records\/datastreams\//.test(contents)) continue; // Three explicit P5 requests.
          const sequence = Number(/\bseq:\s*(\d+)/.exec(contents)?.[1]);
          assert(Number.isFinite(sequence), 'Request sequence required: ' + name);
          requests.push({ name, sequence });
        }
        requests.sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
        selected.push(...requests.map(request => prefix + '/' + request.name));
      }
      const environment = path.join(directory, 'environment.bru');
      await writeFile(environment, 'vars {\n host: ' + publicUrl + '\n token: fm028-api-token\n}\n');
      const reportPath = path.join(directory, 'bruno.json');
      const result = await execute(
        process.execPath,
        [
          path.join(collection, 'node_modules/@usebruno/cli/bin/bru.js'),
          'run',
          ...selected,
          '--sandbox',
          'developer',
          '--env-file',
          environment,
          '--reporter-json',
          reportPath,
          '--reporter-skip-all-headers',
        ],
        {
          cwd: collection,
          timeout: 600000,
          maxBuffer: 8 * 1024 * 1024,
          env: { ...process.env, NO_PROXY: dns, no_proxy: dns, REDBOX_PORTAL_APP_URL: publicUrl },
        }
      ).catch(error => ({ stdout: String(error.stdout), stderr: String(error.stderr), failure: error }));
      const raw = await readFile(reportPath, 'utf8');
      if (process.env.FM028_BRUNO_DIRECTORY) {
        await writeFile(path.join(process.env.FM028_BRUNO_DIRECTORY, 'P3-API.json'), raw);
        await writeFile(
          path.join(process.env.FM028_BRUNO_DIRECTORY, 'P3-API.log'),
          result.stdout + '\n' + result.stderr
        );
        await writeFile(
          path.join(process.env.FM028_BRUNO_DIRECTORY, 'P3-API-selection.json'),
          JSON.stringify(selected, null, 2)
        );
      }
      console.log(result.stdout);
      if ('failure' in result) throw result.failure;
      assert(
        !/\[WARN\]|did not succeed/i.test(result.stdout + result.stderr),
        'All selected API assertions must execute'
      );
      await host.stop();
      assert.equal(persistenceStatus(portal.owner).pools, 0);
    } finally {
      await stop?.();
      await client.db().dropDatabase();
      await client.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
