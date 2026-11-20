import { ApplicationRuntime } from '../../../src/application';
import { FastifyHost } from '../../../src/http/fastify/FastifyHost';
import { prepareNativeSessions } from '../../../src/http/fastify/session';
import { prepareNativeAuthentication } from '../../../src/http/fastify/authentication';
import assert from 'node:assert/strict';

import { installedPilot } from './installedPilot';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { HttpIdentity } from '../../../src/authentication/HttpIdentity';
import { initializeIdentityPersistence, getIdentityRepositories } from '../../../src/persistence/identity/runtime';

import { persistenceStatus } from '../../../src/persistence/runtime';

import type { ProductionPilotOptions } from './productionPilotFixture';

if (!process.env.HTTP_PILOT_TEST_MONGO_URL || !process.env.HTTP_READ_SOLR_PORT)
  throw new Error('FM-019 needs disposable real Mongo (/sr_p4_http) and Solr');
const canonical = 'https://portal.example.invalid';
export const target = '/default/rdmp/api/records/metadata/fm019-record';
export const rootSecret = 'fm019-native-root-secret-000000000000000001';
export const rollbackSecret = 'fm019-rollback-root-secret-0000000000000002';
export const cookie = (response: Response, previous = '') =>
  response.headers.get('set-cookie')?.split(';')[0] || previous;
export let packed: Awaited<ReturnType<typeof installedPilot>>;
export async function fixture(native: boolean, options: ProductionPilotOptions = {}) {
  return packed.nativeProductionFixture(packed.application, packed.module, options);
}

export async function token(url: string, credential = '') {
  const response = await fetch(url + '/csrfToken', { headers: { Cookie: credential } });
  assert.equal(response.status, 200);
  return { token: (await response.json())._csrf as string, cookie: cookie(response, credential) };
}
export async function login(f: Awaited<ReturnType<typeof fixture>>, native: boolean) {
  const csrf = await token(f.url);
  const response = await fetch(f.url + '/user/login_local', {
    method: 'POST',
    headers: {
      Cookie: csrf.cookie,
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf.token,
      'X-Source': 'jsclient',
    },
    body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
    redirect: 'manual',
  });
  assert.equal(response.status, 200, await response.clone().text());
  const credential = cookie(response, csrf.cookie);
  return token(f.url, credential);
}
export async function observe(f: Awaited<ReturnType<typeof fixture>>, path = target, init: RequestInit = {}) {
  const response = await fetch(f.url + path, {
    ...init,
    redirect: 'manual',
    headers: { 'X-ReDBox-Api-Version': '2.0', ...init.headers },
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: Object.fromEntries(
      [
        'content-type',
        'content-length',
        'content-encoding',
        'content-security-policy',
        'cache-control',
        'pragma',
        'expires',
        'etag',
        'link',
        'vary',
        'allow',
        'www-authenticate',
      ].map(name => [name, response.headers.get(name)])
    ),
    body: text ? JSON.parse(text) : null,
  };
}
export function normalize(value: unknown, f: Awaited<ReturnType<typeof fixture>>): unknown {
  // Only per-run identities/timestamps differ. ETags, revisions, all response
  // fields and persisted metadata are compared without omission.
  return JSON.parse(
    JSON.stringify(value, (key, item) => {
      if (
        [
          'timestamp',
          'dateCreated',
          'lastSaveDate',
          'dateModified',
          'requestId',
          'startedAt',
          'completedAt',
          'saveRequestId',
        ].includes(key)
      )
        return '<volatile>';
      if (typeof item === 'string')
        return item.replaceAll(f.brand.id, '<brand>').replaceAll(f.user.id, '<user>').replaceAll(f.role.id, '<role>');
      return item;
    })
  );
}
export async function preparePilot() {
  packed = await installedPilot();
  console.log('FM019 package SHA256 ' + JSON.stringify(packed.hashes));
}
/** Positive control against the destination DB with the preceding host's verifier.
 * The assertion covers signature, stored session, user and role hydration together. */
export async function verifyCookies(
  f: Awaited<ReturnType<typeof fixture>>,
  native: boolean,
  secret: string,
  credentials: readonly string[]
) {
  const owner = { config: f.owner.config, log: f.owner.log };
  const application = new ApplicationRuntime(owner, [
    {
      name: 'identity',
      create: () => ({ initialize: () => initializeIdentityPersistence(owner), close: async () => {} }),
    },
  ]);
  const session = {
    adapter: 'mongo' as const,
    mongoUrl: String(
      (
        owner.config as {
          datastores: {
            mongodb: {
              url: string;
            };
          };
        }
      ).datastores.mongodb.url
    ),
    name: 'redbox.v6.sid',
    collection: 'pilotSessions',
    secret,
    cookie: { secure: false },
  };
  const identity = () => new HttpIdentity(getIdentityRepositories(owner));
  const host = new FastifyHost(application, {
    owner,
    hostname: '127.0.0.1',
    port: 0,
    prepare: async app => {
      await prepareNativeSessions(app, owner, session);
      const auth = await prepareNativeAuthentication(app, {
        identity: identity(),
        accounts: f.accounts,
        config: { active: [] },
        brand: () => Object.assign(new BrandingModel(), f.brand),
      });
      app.get('/actor', async (request, reply) => {
        const actor = await auth.authenticate(request);
        return reply.code(actor ? 200 : 401).send(actor || {});
      });
    },
  });
  try {
    await host.initialize();
    await host.activate();
    for (const credential of credentials) {
      const result = await fetch('http://127.0.0.1:' + host.address()!.port + '/actor', {
        headers: { Cookie: credential },
      });
      const body = await result.json();
      assert.equal(result.status, 200, JSON.stringify(body));
      assert.equal(body.id, f.user.id);
      assert(
        body.roles.some((role: { id: string; brandId: string }) => role.id === f.role.id && role.brandId === f.brand.id)
      );
    }
  } finally {
    await host.stop();
    assert.equal(persistenceStatus(owner).pools, 0);
  }
}
