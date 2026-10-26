// A freshly generated, compiled and packed hook in the production portal host.
// Run with --test --test-force-exit, as for the other production-host qualifiers:
// the accepted Companion provider cron has process lifetime after owned stop.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { MongoClient } = require('mongodb');
const { firstValueFrom } = require('rxjs');
const ts = require('typescript');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { generateHookArchetype } = require('../../../redbox-dev-tools/dist/templates/hook-archetype');
const { createPortalHost } = require('../../dist/application/portal/host');
const { prepareSelectedPersistenceIndexes } = require('../../dist/persistence/maintenance');
const runtime = require('../../dist/persistence/runtime');

test(
  'generated institution hook starts, persists work, serves HTTP, restarts and drains in the production host',
  { timeout: 120000 },
  async () => {
    assert.equal(process.version, 'v26.11.1');
    const url = process.env.SR_GENERATED_APP_MONGO_URL;
    assert(url, 'SR_GENERATED_APP_MONGO_URL is required');
    assert.equal(new URL(url).pathname, '/sr_p8_generated_institution');
    assert(process.env.SR_PORTAL_SOLR_PORT, 'SR_PORTAL_SOLR_PORT is required');
    const native = await new MongoClient(url).connect();
    const parent = path.resolve('.tmp/sails-retirement');
    await fs.mkdir(parent, { recursive: true });
    const directory = await fs.mkdtemp(path.join(parent, 'generated-institution-'));
    let portal;
    try {
      assert.equal((await native.db().listCollections().toArray()).length, 0, 'use an empty disposable database');
      const generated = path.join(directory, 'hook');
      generateHookArchetype({ cwd: generated, packageName: 'p8-institution' });
      // Pack a provider whose custom type declares its stages only through workflows.
      const entry = path.join(generated, 'src/index.ts');
      const declaration = await fs.readFile(entry, 'utf8');
      await fs.writeFile(
        entry,
        declaration.replace(
          'config: { custom:',
          `
        workflows: { reviewType: { draft: { starting: true, config: {
          workflow: { stage: 'draft', stageLabel: 'Review draft' },
          authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] }, form: 'generated-view-only'
        } } } },
        config: { recordtype: { reviewType: { packageType: 'reviewType', searchable: false } }, custom:`
        )
      );
      const config = ts.readConfigFile(path.join(generated, 'tsconfig.json'), ts.sys.readFile);
      assert.equal(config.error, undefined);
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, generated);
      const program = ts.createProgram(parsed.fileNames, parsed.options);
      const emitted = program.emit();
      const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics];
      assert.equal(
        diagnostics.length,
        0,
        diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n')
      );
      const packed = JSON.parse(
        execFileSync('npm', ['pack', '--json', '--ignore-scripts'], {
          cwd: generated,
          encoding: 'utf8',
        })
      )[0];
      const installed = path.join(directory, 'node_modules/redbox-hook-p8-institution');
      await fs.mkdir(installed, { recursive: true });
      execFileSync('tar', ['-xf', path.join(generated, packed.filename), '--strip-components=1', '-C', installed]);
      const dependencies = { 'redbox-hook-p8-institution': '1.0.0' };
      await fs.mkdir(path.join(directory, 'node_modules/@researchdatabox'), { recursive: true });
      for (const folder of ['sails-hook-redbox-storage-mongo', 'redbox-hook-dev']) {
        const root = path.resolve('packages', folder);
        const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
        dependencies[manifest.name] = manifest.version;
        await fs.symlink(root, path.join(directory, 'node_modules', manifest.name));
      }
      await fs.writeFile(
        path.join(directory, 'package.json'),
        JSON.stringify({
          name: 'sr-p8-generated-institution-app',
          version: '1.0.0',
          dependencies,
        })
      );
      for (const name of ['views', 'assets']) await fs.symlink(path.resolve(name), path.join(directory, name));
      const file = path.join(directory, 'application.cjs');
      const dbUrl = suffix => url.replace('/sr_p8_generated_institution', '/sr_p8_generated_institution' + suffix);
      await fs.writeFile(
        file,
        'module.exports = ' +
          JSON.stringify({
            server: { port: 18547, hostname: '127.0.0.1', publicUrl: 'http://127.0.0.1:18547' },
            datastores: { mongodb: { url }, redboxStorage: { url: dbUrl('_storage') } },
            agendaQueue: { options: { db: dbUrl('_agenda') } },
            redboxSession: { mongoUrl: dbUrl('_sessions') },
            storage: {
              disks: Object.fromEntries(
                ['staging', 'primary', 'figshare-staging'].map(name => [
                  name,
                  { driver: 'fs', config: { root: path.join(directory, name) } },
                ])
              ),
            },
            vocab: { bootstrapRvaImports: false, bootstrapFigshareImports: false },
            solr: {
              clientSleepTimeMillis: 0,
              cores: {
                default: {
                  options: {
                    host: '127.0.0.1',
                    port: Number(process.env.SR_PORTAL_SOLR_PORT),
                    core: 'redbox',
                  },
                },
              },
            },
            i18n: { next: { init: { debug: false } } },
          }) +
          ';'
      );
      let example;
      let workCalls = 0;
      const auditPath = path.join(directory, 'greetings.log');
      const options = {
        appPath: directory,
        log,
        files: { application: file },
        localesDirectory: path.resolve('language-defaults'),
        assetRoots: [path.resolve('.tmp/public')],
        env: { REDBOX_SESSION_SECRET: 'generated-institution-only-session-secret-at-least-32' },
        bindings: {
          module(registration, owner) {
            assert.equal(registration.declaration.name, 'ExampleP8Institution');
            return () =>
              (example = registration.declaration.create({
                auditPath,
                greeting: owner.config.custom['p8-institution'].greeting,
              }));
          },
          handler(registration) {
            assert.equal(registration.declaration.name, 'StatusP8Institution');
            return () => registration.declaration.create({ example });
          },
          work(registration, owner) {
            return () =>
              registration.declaration.run({
                async ensureNamedQuery(name, query) {
                  workCalls++;
                  // The fixture's concrete upsert establishes its real brand before
                  // migrations; ordinary core bootstrap later retains that brand.
                  const brand = await firstValueFrom(portal.data.reference.branding.get().bootstrap());
                  const queries = runtime.getReferenceRepositories(owner).namedQueries;
                  const key = brand.id + '_' + name;
                  const values = {
                    name,
                    key,
                    branding: brand.id,
                    collectionName: 'record',
                    mongoQuery: JSON.stringify(query),
                    queryParams: '{}',
                    resultObjectMapping: '{}',
                  };
                  if (await queries.findByKey(key)) await queries.reviseDefinition(key, values);
                  else await queries.createDefinition(values);
                },
              });
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
      let ledgerCount;
      for (const phase of ['fresh', 'restart']) {
        if (phase === 'restart') portal = await createPortalHost(options);
        await portal.host.initialize();
        const reviewType = await runtime
          .getReferenceRepositories(portal.owner)
          .recordTypes.findByName(portal.data.reference.branding.get().getDefault().id, 'reviewType');
        assert(reviewType, 'the packed extension record type is bootstrapped');
        const reviewStages = await runtime
          .getReferenceRepositories(portal.owner)
          .workflows.listForRecordType(reviewType.id);
        assert.equal(reviewStages.length, 1);
        assert.equal(reviewStages[0].name, 'draft');
        assert.equal(reviewStages[0].starting, true);
        assert.equal(reviewStages[0].config.workflow.stageLabel, 'Review draft');
        await portal.host.activate();
        assert.equal((await fetch('http://127.0.0.1:18547/readyz')).status, 200);
        const response = await fetch('http://127.0.0.1:18547/hooks/p8-institution/status');
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { greeting: 'P8Institution' });
        const queries = await runtime
          .getReferenceRepositories(portal.owner)
          .namedQueries.listForBrand(portal.data.reference.branding.get().getDefault().id);
        assert.deepEqual(
          queries
            .map(row => row.name)
            .filter(name => name.startsWith('p8-institution-'))
            .sort(),
          ['p8-institution-dashboard', 'p8-institution-records']
        );
        const names = await runtime.getMigrationLedgerRepository(portal.owner).executedNames();
        assert(names.includes('20261023-p8-institution-named-query'));
        if (phase === 'fresh') ledgerCount = names.length;
        else assert.equal(names.length, ledgerCount, 'restart must retain the migration ledger');
        await portal.host.stop();
        assert.equal(runtime.persistenceStatus(portal.owner).pools, 0);
      }
      assert.equal(workCalls, 3, 'one migration, bootstrap on each startup');
      assert.equal(await fs.readFile(auditPath, 'utf8'), 'P8Institution\nP8Institution\n');
      assert.equal(global.sails, undefined);
      assert(!Object.keys(require.cache).some(file => /[/\\]node_modules[/\\]sails[/\\]/.test(file)));
      console.log(
        JSON.stringify({
          generated: true,
          compiled: true,
          packed: true,
          productionHost: true,
          persistedQueries: 2,
          migrationRuns: 1,
          bootstrapRuns: 2,
          fresh: true,
          restart: true,
          pools: 0,
        })
      );
    } finally {
      await portal?.host.stop();
      for (const suffix of ['', '_storage', '_agenda', '_sessions'])
        await native.db('sr_p8_generated_institution' + suffix).dropDatabase();
      await native.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
);
