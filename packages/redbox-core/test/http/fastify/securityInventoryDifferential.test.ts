import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inventory, inventoryRegistration } from './inventory-fixture';
import { securityFixture, observation } from './securityFixture';
import { productionSecurityFixture } from './securityProductionFixture';

const ordering = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../support/specs/fastify-migration/evidence/FM-004.ordering.json'),
    'utf8'
  )
);
export function inventoryUrl(pattern: string) {
  return pattern
    .replace('{/:oid}', '')
    .replace('{*tail}', '')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, name =>
      name === ':branding' ? 'default' : name === ':portal' ? 'rdmp' : 'value'
    )
    .replace(/\*[A-Za-z_][A-Za-z0-9_]*/g, 'value');
}
// Page caching is a later task. Compare all security headers and exact body/status.
async function securityObservation(response: Response) {
  const value = await observation(response);
  delete (value.headers as any)['cache-control'];
  return value;
}
describe('FM-016 FM-002 inventory differential against production PortalHttp composition', function () {
  this.timeout(45000);
  let oracle: Awaited<ReturnType<typeof productionSecurityFixture>>;
  let oracleToken: { cookie: string; token: string };
  let openOracle: Awaited<ReturnType<typeof productionSecurityFixture>>;
  before(async () => {
    oracle = await productionSecurityFixture();
    openOracle = await productionSecurityFixture(undefined, true);
    const response = await fetch(openOracle.url + '/csrfToken');
    oracleToken = { cookie: response.headers.get('set-cookie')!.split(';')[0], token: (await response.json())._csrf };
  });
  after(async () => {
    await openOracle?.close();
    await oracle?.close();
  });
  it('asserts independent production denials for anonymous, invalid, foreign-brand and same-brand wrong-role actors', async () => {
    const statuses = [];
    for (const token of [undefined, 'invalid-token', 'foreign-token', 'wrong-role-token', 'pilot-api-token']) {
      const response = await fetch(oracle.url + '/default/rdmp/api/named-query', {
        headers: token ? { Authorization: 'Bearer ' + token } : undefined,
      });
      statuses.push(response.status);
      await response.text();
    }
    assert.deepEqual(statuses, [401, 401, 403, 403, 200]);
  });
  for (const path of ['/home', '/user/login'])
    it(`retains the real public-page foreign-brand action denial on ${path}`, async () => {
      const response = await fetch(openOracle.url + '/default/rdmp' + path, {
        headers: { Authorization: 'Bearer foreign-token' },
      });
      assert.equal(response.status, 403);
      assert.equal(await response.text(), '');
    });
  it('reaches the named-query action Admin check with open path rules', async () => {
    const before = openOracle.domainCalls.length;
    const response = await fetch(openOracle.url + '/default/rdmp/api/named-query/value', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer wrong-role-token' },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { message: 'Access Denied', details: '' });
    assert.equal(openOracle.domainCalls.length, before, 'Action denial must precede domain collaborators');
  });
  for (const [family, action, query, body] of [
    ['pages', 'view', '', undefined],
    ['pages', 'edit', '', undefined],
    ['recordReads', 'getMeta', '', undefined],
    ['datastreamReads', 'listDatastreams', '', undefined],
    ['datastreamWrites', 'addDataStreams', '', undefined],
    ['recordMutations', 'deleteRecord', '', undefined],
    ['pageAssets', 'getFormCompiledItems', '', undefined],
    ['configuredActions', 'callService', '', {}],
  ] as const)
    it(`retains ${family}/${action} object or configured authorization with open path rules`, async () => {
      const row = inventory.routes.find(
        row => row.implementation.file.endsWith('/' + family + '.ts') && row.action === action
      )!;
      assert(row, family + '/' + action);
      const native = await securityFixture(true, {
        routes: [inventoryRegistration(row)],
        mongo: true,
        productionRules: true,
        openPaths: true,
        action: openOracle.action(row),
      });
      try {
        const acquired = await fetch(native.url + '/csrfToken');
        const nativeToken = {
          cookie: acquired.headers.get('set-cookie')!.split(';')[0],
          token: (await acquired.json())._csrf,
        };
        for (const token of ['foreign-token', 'wrong-role-token']) {
          const responses = [];
          for (const [fixture, csrf] of [
            [openOracle, oracleToken],
            [native, nativeToken],
          ] as const) {
            const response = await fetch(fixture.url + inventoryUrl(row.original.path) + query, {
              method: row.method === 'all' ? 'GET' : row.method.toUpperCase(),
              redirect: 'manual',
              headers: {
                Authorization: 'Bearer ' + token,
                Cookie: csrf.cookie,
                'X-CSRF-Token': csrf.token,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
              },
              ...(body ? { body: JSON.stringify(body) } : {}),
            });
            responses.push(await securityObservation(response));
          }
          assert.equal(responses[0].status, 403);
          assert.deepEqual(responses[1], responses[0]);
        }
      } finally {
        await native.close();
      }
    });

  for (const openPaths of [false, true])
    for (const row of inventory.routes)
      it(`${openPaths ? 'unrestricted path rules' : 'Admin path rule'} ${row.name} ${row.method.toUpperCase()} ${row.path}`, async () => {
        const selectedOracle = openPaths ? openOracle : oracle;
        const registration = inventoryRegistration(row);
        const order = ordering.routes.find((route: any) => route.name === row.name);
        assert(order);
        assert.deepEqual(registration.effectivePolicies, order.policies);
        const native = await securityFixture(true, {
          routes: [registration],
          mongo: true,
          productionRules: true,
          openPaths,
          action: selectedOracle.action(row),
          defaults: order.beforePolicies !== 'None beyond shared prefix and route matching.',
        });
        try {
          const response = openPaths ? await fetch(native.url + '/csrfToken') : undefined;
          const nativeToken = response && {
            cookie: response.headers.get('set-cookie')!.split(';')[0],
            token: (await response.json())._csrf,
          };
          const oracleResponse = openPaths ? await fetch(selectedOracle.url + '/csrfToken') : undefined;
          const rowOracleToken = oracleResponse && {
            cookie: oracleResponse.headers.get('set-cookie')!.split(';')[0],
            token: (await oracleResponse.json())._csrf,
          };
          for (const token of [undefined, 'invalid-token', 'foreign-token', 'wrong-role-token', 'pilot-api-token']) {
            const request = {
              method: row.method === 'all' ? 'POST' : row.method.toUpperCase(),
              headers: token ? { Authorization: 'Bearer ' + token } : undefined,
              redirect: 'manual' as const,
            };
            const route = inventoryUrl(row.original.path);
            const credentials = (value: { cookie: string; token: string } | undefined) => ({
              ...request,
              headers: { ...request.headers, ...(value ? { Cookie: value.cookie, 'X-CSRF-Token': value.token } : {}) },
            });
            const callsBefore = selectedOracle.domainCalls.length;
            const expected = await securityObservation(
              await fetch(selectedOracle.url + route, credentials(rowOracleToken || undefined))
            );
            const actual = await securityObservation(
              await fetch(native.url + route, credentials(nativeToken || undefined))
            );
            const adminFamilies = [
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
            ];
            const family = row.implementation.file.split('/').at(-1)!.replace('.ts', '');
            if (
              openPaths &&
              token === 'wrong-role-token' &&
              (adminFamilies.includes(family) ||
                (family === 'identityAdministration' && row.controller !== 'UserController'))
            ) {
              assert.equal(expected.status, 403, 'Independent action-level Admin denial');
              assert.equal(
                selectedOracle.domainCalls.length,
                callsBefore,
                'Admin action denial must precede domain work'
              );
            }
            // Token entropy is not deterministic; retain the real save/origin check.
            if (row.path === '/csrfToken' && actual.status === 200 && expected.status === 200) {
              assert.match(JSON.parse(actual.text)._csrf, /^[a-f0-9]{64}$/);
              assert.match(JSON.parse(expected.text)._csrf, /^[a-f0-9]{64}$/);
              actual.text = expected.text;
            }
            assert.deepEqual(actual, expected, `${row.name}: ${token ?? 'anonymous'}`);
          }
        } finally {
          await native.close();
        }
      });

  for (const mutation of ['mount', 'policy'] as const)
    it(`rejects the ${mutation} negative control in a physical temporary production copy`, async () => {
      const altered = await productionSecurityFixture(mutation);
      try {
        const target = '/default/rdmp/api/named-query';
        const request = {
          redirect: 'manual' as const,
          headers: { Authorization: 'Bearer ' + (mutation === 'mount' ? 'pilot-api-token' : 'wrong-role-token') },
        };
        const baseline = await securityObservation(await fetch(oracle.url + target, request));
        const changed = await securityObservation(await fetch(altered.url + target, request));
        assert.equal(baseline.status, mutation === 'mount' ? 200 : 403);
        assert.notDeepEqual(changed, baseline, 'The inventory comparison must reject a changed production binding');
        assert.equal(changed.status, mutation === 'mount' ? 404 : 200);
      } finally {
        await altered.close();
      }
    });
});
