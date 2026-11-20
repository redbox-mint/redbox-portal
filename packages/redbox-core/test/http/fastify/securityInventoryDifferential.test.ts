import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assertGolden, golden, goldenControls } from './goldenContracts';
import { inventory, inventoryRegistration } from './inventory-fixture';
import { observation } from './securityFixture';
import { stableInventoryBody } from './securityInventoryWire';
import { referenceProductionFixture } from './referenceProductionFixture';
import { withoutSideEffects } from './noSideEffects';
import { referenceReadDeclarations } from '../../../src/http/referenceRoutes';
import { recordQueryReadDeclarations } from '../../../src/http/readRoutes';
import { datastreamReadRoutes } from '../../../src/http/datastreamRoutes';
import { uploadDeclarations } from '../../../src/http/uploadRoutes';
import { identityAdministrationDeclarations } from '../../../src/http/identityRoutes';
import { mutationDeclarations } from '../../../src/http/mutationRoutes';
import { integrationDeclarations } from '../../../src/http/integrationRoutes';
import { progressOperationRoutes } from '../../../src/http/progressRoutes';
import { addDataStreamsRoute, getMetaRoute } from '../../../src/api-routes/groups/records';

const declarations = [
  ...new Set([
    ...referenceReadDeclarations,
    ...recordQueryReadDeclarations,
    ...datastreamReadRoutes,
    ...uploadDeclarations,
    ...identityAdministrationDeclarations,
    ...mutationDeclarations,
    ...integrationDeclarations,
    ...progressOperationRoutes,
    getMetaRoute,
    addDataStreamsRoute,
  ]),
];
const ordering = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../support/specs/fastify-migration/evidence/FM-004.ordering.json'),
    'utf8'
  )
);
const tokens = [undefined, 'invalid-token', 'foreign-token', 'reader-token', 'pilot-api-token'] as const;
const familyOf = (row: (typeof inventory.routes)[number]) => path.basename(row.implementation.file, '.ts');
const adminFamilies = new Set([
  'adminOperations',
  'brandingOperations',
  'brandingUploads',
  'figshareAdministration',
  'identityLinks',
  'queryWrites',
  'siemWrites',
  'vocabularyAdministration',
  'vocabularyIntegrations',
  'integrationOperations',
]);

function inventoryUrl(pattern: string) {
  return pattern
    .replace('{/:oid}', '')
    .replace('{*tail}', '')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, name =>
      name === ':branding' ? 'default' : name === ':portal' ? 'rdmp' : 'value'
    )
    .replace(/\*[A-Za-z_][A-Za-z0-9_]*/g, 'value');
}

async function production(openPaths: boolean, missingMount = false) {
  return referenceProductionFixture(true, undefined, undefined, {
    declarations: missingMount
      ? declarations.filter(route => !(route.method === 'get' && route.path === '/:branding/:portal/api/named-query'))
      : declarations,
    pages: {},
    configuration: {
      auth: {
        roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }],
        rules: openPaths ? [] : [{ path: '/:branding/:portal(/*)', role: 'Admin', can_read: true }],
      },
    },
    actions: {
      value: {
        authorize: async context => context.actor.username === 'pilot-admin',
        execute: async () => ({ ok: true }),
      },
    },
  });
}
type Fixture = Awaited<ReturnType<typeof production>>;
async function credentials(fixture: Fixture) {
  const acquired = await fetch(fixture.url + '/csrfToken');
  assert.equal(acquired.status, 200);
  const token = (await acquired.json())._csrf;
  assert.match(token, /^[a-f0-9]{64}$/);
  const cookie = acquired.headers.get('set-cookie')!.split(';')[0];
  assert.match(cookie, /^fm023\.sid=/);
  return { Cookie: cookie, 'X-CSRF-Token': token };
}
async function observe(
  fixture: Fixture,
  route: string,
  method: string,
  token?: string,
  headers: Record<string, string> = {},
  body?: object
) {
  const response = await fetch(fixture.url + route, {
    method,
    redirect: 'manual',
    headers: {
      ...headers,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await observation(response);
  // Preserve the original inventory's header selection and charset handling.
  // Page caching is qualified by the full page and asset contracts.
  delete (value.headers as Record<string, unknown>)['cache-control'];
  if (route === '/csrfToken' && value.status === 200) {
    const parsed = JSON.parse(value.text);
    assert.match(parsed._csrf, /^[a-f0-9]{64}$/);
    value.text = JSON.stringify({ ...parsed, _csrf: '<csrf>' });
  }
  if (value.headers['content-type'] === 'text/html')
    value.text = value.text.replace(/nonce="[^"]+"/g, 'nonce="<nonce>"').replace(/[a-f0-9]{64}/g, '<csrf>');
  value.text = stableInventoryBody(route, value.headers['content-type'], value.text);
  return value;
}

const businessCollections = [
  'record',
  'deletedrecord',
  'vocabulary',
  'namedquery',
  'branding',
  'brandingconfig',
  'recordtype',
  'role',
  'user',
  'serviceaccount',
  'useraudit',
  'recordaudit',
];
async function resetBearerCredentials(fixture: Fixture) {
  // The inventory includes self-service key generation/revocation routes.
  // Each row starts with the same three real accounts and credentials.
  const users = fixture.client.db().collection('user');
  for (const [username, token] of [
    ['foreign', 'foreign-token'],
    ['reader', 'reader-token'],
    ['pilot-admin', 'pilot-api-token'],
  ])
    assert.equal(
      (await users.updateOne({ username }, { $set: { token: createHash('sha256').update(token).digest('base64') } }))
        .matchedCount,
      1
    );
}
async function domainState(fixture: Fixture) {
  return Object.fromEntries(
    await Promise.all(
      businessCollections.map(async name => [
        name,
        await fixture.client.db().collection(name).find({}).sort({ _id: 1 }).toArray(),
      ])
    )
  );
}

describe('FM-016 FM-002 inventory differential against production PortalHttp composition', function () {
  this.timeout(120000);
  let restricted: Fixture, open: Fixture;
  before(async () => {
    restricted = await production(false);
    open = await production(true);
    assert.equal(inventory.routes.length, 335);
  });
  after(async () => {
    await open?.close();
    await restricted?.close();
  });
  const namedQuery = '/default/rdmp/api/named-query';
  it('asserts independent production denials for anonymous, invalid, foreign-brand and same-brand wrong-role actors', async () => {
    const wire = [];
    for (const token of tokens) wire.push(await observe(restricted, namedQuery, 'GET', token));
    assert.deepEqual(
      wire.map(value => value.status),
      [401, 401, 403, 403, 200]
    );
    assertGolden('securityInventory', 'credential-control', wire);
  });
  for (const route of ['/home', '/user/login'])
    it(`retains the real public-page foreign-brand action denial on ${route}`, async () => {
      const wire = await observe(open, '/default/rdmp' + route, 'GET', 'foreign-token');
      assert.equal(wire.status, 403);
      assert.equal(wire.text, '');
      assertGolden('securityInventory', 'foreign-page ' + route, wire);
    });
  it('reaches the named-query action Admin check with open path rules', async () => {
    const wire = await withoutSideEffects(open, () => observe(open, namedQuery + '/value', 'DELETE', 'reader-token'), {
      collections: businessCollections,
    });
    assert.equal(wire.status, 403);
    assert.deepEqual(JSON.parse(wire.text), { message: 'Access Denied', details: '' });
    assertGolden('securityInventory', 'named-query-action', wire);
  });
  for (const [family, action, body] of [
    ['pages', 'view'],
    ['pages', 'edit'],
    ['recordReads', 'getMeta'],
    ['datastreamReads', 'listDatastreams'],
    ['datastreamWrites', 'addDataStreams'],
    ['recordMutations', 'deleteRecord'],
    ['pageAssets', 'getFormCompiledItems'],
    ['configuredActions', 'callService', {}],
  ] as const)
    it(`retains ${family}/${action} object or configured authorization with open path rules`, async () => {
      const row = inventory.routes.find(row => familyOf(row) === family && row.action === action);
      assert(row, family + '/' + action);
      const csrf = await credentials(open);
      const before = await domainState(open);
      const wire = [];
      const method = row.method === 'all' ? 'GET' : row.method.toUpperCase();
      for (const token of ['foreign-token', 'reader-token']) {
        const send = () =>
          observe(
            open,
            inventoryUrl(
              family === 'pageAssets' ? row.original.path : row.original.path.replace(/:oid\b/g, 'reference-record')
            ),
            method,
            token,
            csrf,
            body
          );
        wire.push(
          ['GET', 'HEAD', 'OPTIONS'].includes(method)
            ? await send()
            : await withoutSideEffects(open, send, { collections: businessCollections })
        );
      }
      assert.deepEqual(
        wire.map(value => value.status),
        [403, 403]
      );
      assert.deepEqual(await domainState(open), before);
      assertGolden('securityInventory', 'action ' + family + '/' + action, wire);
    });

  for (const openPaths of [false, true])
    for (const row of inventory.routes) {
      const key = `${openPaths ? 'unrestricted path rules' : 'Admin path rule'} ${row.name} ${row.method.toUpperCase()} ${row.path}`;
      it(key, async () => {
        const fixture = openPaths ? open : restricted;
        await resetBearerCredentials(fixture);
        const registration = inventoryRegistration(row);
        const order = ordering.routes.find((route: { name: string }) => route.name === row.name);
        assert(order);
        assert.deepEqual(registration.effectivePolicies, order.policies);
        const csrf = openPaths ? await credentials(fixture) : {};
        const wire = [];
        const archived = golden('securityInventory', key) as Array<{ wire: { status: number } }>;
        assert.equal(archived.length, tokens.length);
        for (const [index, token] of tokens.entries()) {
          const checkAction =
            openPaths &&
            token === 'reader-token' &&
            (adminFamilies.has(familyOf(row)) ||
              (familyOf(row) === 'identityAdministration' && row.controller !== 'UserController'));
          const method = row.method === 'all' ? 'POST' : row.method.toUpperCase();
          const status = archived[index].wire.status;
          // The historical ALL browser rendering aliases remain read-only.
          const canWrite =
            (familyOf(row) !== 'pages' && !['GET', 'HEAD', 'OPTIONS'].includes(method)) ||
            (row.controller?.endsWith('RecordSchemaController') && (row.action === 'create' || row.action === 'update'));
          const mutatingDenial = canWrite && status >= 400;
          const send = () => observe(fixture, inventoryUrl(row.original.path), method, token, csrf);
          const result =
            checkAction || mutatingDenial
              ? await withoutSideEffects(fixture, send, { collections: businessCollections })
              : await send();
          if (checkAction) {
            assert.equal(result.status, 403, 'Independent action-level Admin denial');
          }
          wire.push({ credential: token ?? 'anonymous', wire: result });
        }
        assertGolden('securityInventory', key, wire);
      });
    }
  for (const mutation of ['mount', 'policy'] as const)
    it(`rejects the ${mutation} negative control against the production bootstrap`, async () => {
      const altered = await production(mutation === 'policy', mutation === 'mount');
      try {
        const token = mutation === 'mount' ? 'pilot-api-token' : 'reader-token';
        const baseline = await observe(restricted, namedQuery, 'GET', token);
        const changed = await observe(altered, namedQuery, 'GET', token);
        assertGolden('securityInventory', mutation + '-control', baseline);
        assert.equal(baseline.status, mutation === 'mount' ? 200 : 403);
        assert.throws(() => assertGolden('securityInventory', mutation + '-control', changed), assert.AssertionError);
        // An unselected converted route is blocked by the reserved-route owner.
        assert.equal(changed.status, mutation === 'mount' ? 501 : 200);
      } finally {
        await altered.close();
      }
    });
});
goldenControls('securityInventory');
