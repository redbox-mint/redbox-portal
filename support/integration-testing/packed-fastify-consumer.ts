// Copied to the isolated consumer, compiled with strict=true/skipLibCheck=false.
// Every application import is an installed public entrypoint.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createHook } from 'node:async_hooks';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { MongoClient } from 'mongodb';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import {
  getBrandingRepository,
  getIdentityRepositories,
  getMigrationLedgerRepository,
} from '@researchdatabox/redbox-core';
import { HttpIdentity } from '@researchdatabox/redbox-core/authentication';
import {
  createPortalFastifyApplication,
  createPortalFastifyHost,
  prepareSelectedPersistenceIndexes,
  persistenceStatus,
  selectedAgendaMongoOptions,
} from '@researchdatabox/redbox-core/portal';
import { bindExtensionFactory } from '@researchdatabox/redbox-core/extensions';
import { bindControllerFactory, referenceReadDeclarations } from '@researchdatabox/redbox-core/http';
import * as hook from 'redbox-hook-fm039';
import { createPortalFastifyApplication as compatibilityApplication } from '@researchdatabox/redbox-core-types/portal';

const directory = path.resolve(__dirname, '..');
const signals = ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name));
const log = nothingLogger;
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const timers = new Map<number, { ref: WeakRef<NodeJS.Timeout>; origin?: Error }>();
const cleanupProbe = createHook({
  init(id, type, _trigger, resource: NodeJS.Timeout) {
    if (type === 'Timeout')
      timers.set(id, {
        ref: new WeakRef(resource),
        origin:
          Number((resource as unknown as { _idleTimeout: number })._idleTimeout) >= 1000 ? new Error() : undefined,
      });
  },
  destroy(id) {
    timers.delete(id);
  },
});
cleanupProbe.enable();
after(async () => {
  await delay(80);
  const handles = (
    process as unknown as {
      _getActiveHandles(): Array<{
        listening?: boolean;
        connecting?: boolean;
        remoteAddress?: string;
        localAddress?: string;
      }>;
    }
  )._getActiveHandles();
  const activeNetwork = handles
    .filter(handle => handle.listening || handle.connecting || handle.remoteAddress || handle.localAddress)
    .map(handle => ({
      listening: handle.listening,
      connecting: handle.connecting,
      remoteAddress: handle.remoteAddress,
      localAddress: handle.localAddress,
    }));
  const remaining = [...timers.values()].flatMap(timer => {
    const value = timer.ref.deref();
    return value && value.hasRef() && !(value as unknown as { _destroyed: boolean })._destroyed
      ? [{ stack: timer.origin?.stack ?? '<unexpected surviving short timer>' }]
      : [];
  });
  cleanupProbe.disable();
  assert.deepEqual(activeNetwork, [], 'Owned network handles must close before the exit harness');
  for (const timer of remaining) {
    const origin = timer.stack
      .split('\n')
      .find(line => line.trim().startsWith('at ') && !/node:|<anonymous>|verify\.js/.test(line));
    assert.match(
      origin ?? '',
      /node_modules\/(?:@agendajs\/|agenda\/)/,
      'Only attributed Agenda liveness timers may remain'
    );
  }
  console.log(JSON.stringify({ cleanup: true, activeNetwork: [], remainingVendorTimers: remaining }));
});
async function waitFor(operation: () => Promise<unknown>) {
  let failure: unknown;
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      await operation();
      return;
    } catch (error) {
      failure = error;
      await delay(500);
    }
  }
  throw failure;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
async function noListener(origin: string) {
  const url = new URL(origin);
  await assert.rejects(
    new Promise<void>((resolve, reject) => {
      const socket = connect(Number(url.port), url.hostname);
      socket.setTimeout(2000, () => socket.destroy(new Error('Connection probe timed out')));
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
    }),
    { code: 'ECONNREFUSED' }
  );
}

test(
  'clean packed Fastify consumer: generated routes, persisted restart, retained drain and stop',
  { timeout: 300000 },
  async () => {
    assert.equal(typeof compatibilityApplication, 'function');
    const origin = process.env.FM039_ORIGIN!;
    const uri = process.env.FM039_MONGO_URL!;
    assert.equal(new URL(uri).pathname, '/fm039_packed');
    assert(new URL(origin).hostname.endsWith('.ts.net'));
    const mongo = new MongoClient(uri, { serverSelectionTimeoutMS: 1000 });
    let portal: Awaited<ReturnType<typeof createPortalFastifyApplication>> | undefined;
    let host: Awaited<ReturnType<typeof createPortalFastifyHost>>['host'] | undefined;
    let release = deferred<void>();
    let started = deferred<void>();
    let example: InstanceType<typeof hook.Example> | undefined;
    let workCalls = 0;
    let failure: unknown;
    const auditPath = path.join(directory, 'audit.log');
    const files = { application: path.join(directory, 'application.cjs') };
    const workInput: hook.ExampleWorkInput = {
      ensureNamedQuery: async (name, value) => {
        workCalls++;
        // A concrete application-owned repository for the scaffold's work contract.
        await mongo.db().collection('packedQueries').updateOne({ name }, { $set: { value } }, { upsert: true });
      },
    };
    const sessionCookie = (response: Response) => {
      const value = response.headers.getSetCookie()[0];
      assert(value, 'Session cookie required');
      return value.split(';')[0]!;
    };
    const request = (url: string, init?: RequestInit) => fetch(origin + url, { redirect: 'manual', ...init });
    try {
      await waitFor(() => mongo.connect());
      assert.match((await mongo.db().admin().command({ buildInfo: 1 })).version, /^9\./);
      assert.equal((await mongo.db().listCollections().toArray()).length, 0, 'Disposable empty database required');
      await waitFor(async () =>
        assert.equal(
          (await fetch(`http://127.0.0.1:${process.env.FM039_SOLR_PORT}/solr/redbox/admin/ping`)).status,
          200
        )
      );
      for (const name of ['views', 'assets', 'locales/en'])
        await mkdir(path.join(directory, name), { recursive: true });
      await writeFile(path.join(directory, 'locales/en/translation.json'), '{}');
      await writeFile(
        files.application,
        'module.exports=' +
          JSON.stringify({
            server: {
              hostname: '0.0.0.0',
              port: Number(new URL(origin).port),
              publicUrl: origin,
              rootContext: '',
              trustProxy: false,
              stopDeadlineMs: 30000,
            },
            datastores: { mongodb: { url: uri, maxPoolSize: 4 }, redboxStorage: { url: uri, maxPoolSize: 4 } },
            agendaQueue: { options: { db: uri, processEvery: '0.05 seconds' } },
            redboxSession: { mongoUrl: uri, cookie: { secure: false, httpOnly: true, sameSite: 'lax' } },
            companion: { enabled: false },
            bootstrap: { bootstrapDataPath: path.join(directory, 'bootstrap') },
            brandingConfigurationDefaults: {
              auth: {
                active: ['local'],
                local: {
                  default: {
                    adminUser: 'packed-admin',
                    adminPw: 'packed-password',
                    email: 'packed@example.invalid',
                    token: 'packed-token',
                  },
                },
              },
            },
            auth: { roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }] },
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
                    port: Number(process.env.FM039_SOLR_PORT),
                    core: 'redbox',
                  },
                },
              },
            },
          })
      );
      const options: Parameters<typeof createPortalFastifyApplication>[0] = {
        appPath: directory,
        files,
        log,
        argv: [],
        localesDirectory: path.join(directory, 'locales'),
        env: { REDBOX_PUBLIC_URL: origin, REDBOX_SESSION_SECRET: 'fm039-synthetic-secret-at-least-32-characters' },
        bindings: {
          module: registration => {
            assert.equal(registration.declaration.name, hook.exampleModule.name);
            const create = bindExtensionFactory(hook.exampleModule, { auditPath, greeting: 'Packed greeting' });
            return () => (example = create());
          },
          work: registration => () =>
            registration.declaration.run === hook.migrateExample
              ? hook.migrateExample(workInput)
              : hook.bootstrapExample(workInput),
        },
        http: {
          declarations: referenceReadDeclarations,
          portals: ['rdmp'],
          bindings: () => [
            bindControllerFactory(hook.exampleController, {
              example: {
                greet: () => {
                  assert(example);
                  return example.greet();
                },
              },
            }),
            ...hook.bindGeneratedControllers({
              HeldController: {
                read: async () => {
                  started.resolve();
                  await release.promise;
                  assert(example, 'Module remains owned through an accepted request');
                  return { held: true };
                },
              },
            }),
          ],
        },
      };
      let migrationCount = 0;
      let cookie = '';
      for (const phase of ['fresh', 'restart']) {
        release = deferred<void>();
        started = deferred<void>();
        portal = await createPortalFastifyApplication(options);
        const current = portal;
        assert.equal(portal.config.server.publicUrl, origin);
        assert.equal(
          portal.installation.providers.find(p => p.name === 'redbox-hook-fm039')?.declaration.apiVersion,
          2
        );
        const plan = await createPortalFastifyHost(portal, {
          authentication: () => ({
            identity: new HttpIdentity(getIdentityRepositories(current.owner)),
            accounts: current.data.accounts.get(),
            config: { active: ['local'] },
            brand: () => current.data.reference.branding.get().getBrand('default'),
          }),
          login: {
            credentialFields: ['username', 'password'],
            validContext: (brand, selectedPortal) => brand === 'default' && selectedPortal === 'rdmp',
            brandId: () => current.data.reference.branding.get().getDefault().id,
            postLoginPath: () => '/default/rdmp/home',
            audit: async (action, actor) => {
              await current.data.users.get().addUserAuditEvent({ ...actor }, action, {
                brandId: current.data.reference.branding.get().getDefault().id,
              });
            },
            loginFailure: async () => {},
          },
          policies: {
            branding: { getBrand: name => getBrandingRepository(current.owner).getBrand(name) },
            pathRules: current.data.reference.pathRules,
            defaultUnauthenticatedRole: () => undefined,
            emitRequestFailure: async () => {},
          },
        });
        host = plan.host;
        assert.strictEqual(plan.resolved, portal.installation);
        assert.equal(host.address(), null, 'No early listener');
        await prepareSelectedPersistenceIndexes(portal.owner, 'ensure', {
          storage: portal.preflight,
          agenda: selectedAgendaMongoOptions(portal.config.agendaQueue),
          session: portal.config.redboxSession,
        });
        await host.initialize();
        console.log(JSON.stringify({ phase, stage: 'initialized' }));
        assert.equal((await request('/readyz')).status, 503);
        await host.activate();
        console.log(JSON.stringify({ phase, stage: 'activated' }));
        assert.equal((await request('/readyz')).status, 200);
        const status = await request('/hooks/fm039/status');
        assert.equal(status.status, 200);
        assert.deepEqual(await status.json(), { greeting: 'Packed greeting' });
        const target = '/default/rdmp/hooks/fm039/greet';
        assert.equal((await request(target, { method: 'POST' })).status, 401);
        if (phase === 'fresh') {
          const csrf = await request('/csrfToken');
          const anonymous = sessionCookie(csrf);
          const token = ((await csrf.json()) as { _csrf: string })._csrf;
          const login = await request('/user/login_local', {
            method: 'POST',
            headers: { Cookie: anonymous, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              username: 'packed-admin',
              password: 'packed-password',
              branding: 'default',
              portal: 'rdmp',
              _csrf: token,
            }),
          });
          assert.equal(login.status, 302, await login.text());
          cookie = sessionCookie(login);
        }
        // The first session is persisted in the installed native Mongo session store.
        const csrf = await request('/csrfToken', { headers: { Cookie: cookie } });
        const token = ((await csrf.json()) as { _csrf: string })._csrf;
        const headers = { Cookie: cookie, Origin: origin, 'X-CSRF-Token': token, 'Content-Type': 'application/json' };
        assert.equal(
          (await request(target, { method: 'POST', headers: { ...headers, 'X-CSRF-Token': '' }, body: '{}' })).status,
          403
        );
        assert.equal(
          (
            await request(target, {
              method: 'POST',
              headers: { ...headers, Origin: 'https://foreign.invalid' },
              body: '{}',
            })
          ).status,
          403
        );
        const allowed = await request(target, { method: 'POST', headers, body: '{}' });
        assert.equal(allowed.status, 200, await allowed.clone().text());
        assert.deepEqual(await allowed.json(), { greeting: 'Packed greeting' });
        console.log(JSON.stringify({ phase, stage: 'protected-route' }));
        const names = await getMigrationLedgerRepository(portal.owner).executedNames();
        assert(names.includes('20261023-fm039-named-query'));
        if (phase === 'fresh') migrationCount = names.length;
        else assert.equal(names.length, migrationCount, 'Migration ledger survives restart');
        assert.equal(await mongo.db().collection('packedQueries').countDocuments(), 2);
        const accepted = request('/hooks/fm039/hold');
        await Promise.race([
          started.promise,
          accepted.then(response => {
            throw new Error('Held route completed before its controller started: ' + response.status);
          }),
        ]);
        await assert.rejects(host.stop({ deadlineMs: 80 }), /deadline/i);
        assert.equal(host.status().stopped, false);
        assert(persistenceStatus(portal.owner).pools > 0, 'Retain dependencies until accepted work completes');
        release.resolve();
        const drained = await accepted;
        assert.equal(drained.status, 200);
        assert.deepEqual(await drained.json(), { held: true });
        console.log(JSON.stringify({ phase, stage: 'released' }));
        await host.stop();
        await host.stop();
        assert.equal(host.status().stopped, true);
        assert.equal(host.status().listening, false);
        assert.equal(host.address(), null);
        assert.equal(persistenceStatus(portal.owner).pools, 0);
        await noListener(origin);
        await assert.rejects(example!.greet(), /not accepting/);
        assert.deepEqual(
          ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)),
          signals
        );
        console.log(
          JSON.stringify({
            phase,
            public: 200,
            anonymous: 401,
            csrf: 403,
            protected: 200,
            persistedSession: true,
            migrationCount: names.length,
            drainDeadline: true,
            stopped: true,
            pools: 0,
          })
        );
      }
      assert.equal(workCalls, 3, 'One migration, two bootstrap runs');
      assert.equal((await readFile(auditPath, 'utf8')).trim().split('\n').length, 4);
      assert.equal(globalThis.hasOwnProperty('sails'), false);
      const ownRequire = createRequire(__filename);
      for (const file of Object.keys(ownRequire.cache))
        assert(file.startsWith(directory + path.sep), 'Source-tree module: ' + file);
    } catch (error) {
      failure = error;
      console.error('Packed consumer body failed:', error);
      throw error;
    } finally {
      release.resolve();
      try {
        await host?.stop();
        if (portal && !host) await portal.application.stop();
      } catch (error) {
        if (!failure) throw error;
        console.error('Packed consumer cleanup after failure:', error);
      } finally {
        try {
          await mongo.db().dropDatabase();
        } finally {
          await mongo.close();
        }
      }
    }
  }
);
