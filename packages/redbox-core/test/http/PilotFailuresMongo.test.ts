import assert from 'node:assert/strict';
import { firstValueFrom } from 'rxjs';
import { get, request } from 'node:http';
import { readFileSync } from 'node:fs';
import sinon from 'sinon';
import MongoStore from 'connect-mongo';
import { recordTypeApiRoutes } from '../../src/api-routes/groups/recordtypes';
import { pilotPolicyChain } from '../../src/http/express';
import { persistenceStatus } from '../../src/persistence/runtime';
import { pilotFixture } from './pilotFixture';

describe('authenticated standalone pilot parity and failures on real MongoDB', function () {
  this.timeout(30_000);
  let f: Awaited<ReturnType<typeof pilotFixture>>;
  let release = () => {};
  afterEach(async () => {
    release();
    sinon.restore();
    await f?.close();
  });

  it('replays the 13 observed released-v5 API cases against the standalone host with the sanitized v5 definitions', async () => {
    const evidenceDirectory = '../../support/specs/sails-retirement/evidence/';
    const baseline: {
      sourceTag: string;
      cases: Array<{
        path: string;
        versionHeader: string | null;
        status: number;
        cacheControl: string;
        bodyKeys: string[];
        summary?: object;
        names?: string[];
        definition?: { name: string; packageType: string; searchable: boolean };
        error?: object;
      }>;
    } = JSON.parse(readFileSync(evidenceDirectory + 'released-v5-p4-results.json', 'utf8'));
    const fixture: {
      collections: Array<{
        collection: string;
        documents: Array<{ name: string; packageType: string; searchable: boolean }>;
      }>;
    } = JSON.parse(readFileSync(evidenceDirectory + 'released-v5-upgrade-fixture.json', 'utf8'));
    assert.equal(baseline.sourceTag, 'v5.0.4');
    assert.equal(baseline.cases.length, 13);
    f = await pilotFixture();
    await f.recordTypes.removeForBrand(f.brand.id);
    const definitions = fixture.collections.find(item => item.collection === 'recordtype')!.documents;
    assert.equal(definitions.length, 5);
    for (const definition of definitions)
      await f.recordTypes.createDefinition({
        name: definition.name,
        packageType: definition.packageType,
        searchable: definition.searchable,
        branding: f.brand.id,
      });
    for (const observed of baseline.cases) {
      const response = await fetch(f.url + observed.path, {
        headers: {
          ...f.headers,
          ...(observed.versionHeader ? { 'X-ReDBox-Api-Version': observed.versionHeader } : {}),
        },
      });
      assert.equal(response.status, observed.status, observed.path);
      assert.equal(response.headers.get('Cache-Control'), observed.cacheControl);
      const body = await response.json();
      const data = body.data ?? body;
      if (observed.summary) {
        assert.deepEqual(data.summary, observed.summary);
        assert.deepEqual(data.records.map((row: { name: string }) => row.name).sort(), observed.names);
      } else if (observed.definition) {
        assert.deepEqual(
          { name: data.name, packageType: data.packageType, searchable: data.searchable },
          observed.definition
        );
        assert.equal('data' in body, observed.bodyKeys.includes('data'));
      } else {
        assert.deepEqual(body, observed.error);
      }
    }
  });

  it('preserves header/query version negotiation for both success and legacy validation errors', async () => {
    f = await pilotFixture();
    for (const endpoint of ['recordtypes', 'recordtypes/get']) {
      for (const [query, header, v2] of [
        ['', undefined, false],
        ['&apiVersion=2.0', undefined, true],
        ['&apiversion=2.0', undefined, true],
        ['', ' 2.0 ', true],
        ['&apiVersion=1.0', '2.0', false],
        ['&apiVersion=2.0', '1.0', false],
        ['&apiVersion=unknown', undefined, false],
        ['', 'unknown', false],
      ] as const) {
        const response = await fetch(f.url + '/default/rdmp/api/' + endpoint + '?name=dataRecord' + query, {
          headers: { ...f.headers, ...(header ? { 'X-ReDBox-Api-Version': header } : {}) },
        });
        assert.equal(response.status, 200);
        assert.equal(Object.hasOwn((await response.json()) as object, 'data'), v2);
      }
    }
    for (const query of ['', '?name=a&name=b', '?name[x]=dataRecord']) {
      for (const header of ['1.0', '2.0']) {
        const response = await fetch(f.url + '/default/rdmp/api/recordtypes/get' + query, {
          headers: { ...f.headers, 'X-ReDBox-Api-Version': header },
        });
        assert.equal(response.status, 400);
        assert.equal(Object.hasOwn((await response.json()) as object, 'errors'), header === '2.0');
      }
    }
    const conflict = await fetch(f.url + '/default/rdmp/api/recordtypes/get?apiVersion=1.0', {
      headers: { ...f.headers, 'X-ReDBox-Api-Version': '2.0' },
    });
    assert.equal(conflict.status, 400);
    assert(Object.hasOwn((await conflict.json()) as object, 'errors'));
    // The declared string permits an empty name: a missing result, rather than invalid input.
    assert.equal((await fetch(f.url + '/default/rdmp/api/recordtypes/get?name=', { headers: f.headers })).status, 500);
  });

  it('runs authentication and brand authorization before validation/domain reads, rereading grants and memberships', async () => {
    f = await pilotFixture();
    const read = sinon.spy(f.recordTypes, 'findByName');
    const list = sinon.spy(f.recordTypes, 'listForBrand');
    for (const path of ['recordtypes', 'recordtypes/get']) {
      const url = f.url + '/default/rdmp/api/' + path;
      assert.equal((await fetch(url + '?user=admin&role=Admin&branding=default')).status, 401);
      assert.equal((await fetch(url, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
      assert.equal((await fetch(f.url + '/other/rdmp/api/' + path, { headers: f.headers })).status, 403);
      assert.equal((await fetch(f.url + '/default/evil/api/' + path, { headers: f.headers })).status, 404);
      assert.equal((await fetch(f.url + '/absent/rdmp/api/' + path, { headers: f.headers })).status, 404);
    }
    assert.equal(read.callCount + list.callCount, 0);
    await f.identities.replaceMemberships('user', String(f.user.id), [f.reader.id]);
    assert.equal((await fetch(f.url + '/default/rdmp/api/recordtypes/get', { headers: f.headers })).status, 403);
    assert.equal(read.callCount, 0);
    await f.identities.create('pathrule', {
      path: '/:branding/:portal/api/recordtypes',
      branding: f.brand.id,
      role: f.reader.id,
      can_read: true,
    });
    assert.equal((await fetch(f.url + '/default/rdmp/api/recordtypes', { headers: f.headers })).status, 200);
    assert.equal(
      (await fetch(f.url + '/default/rdmp/api/recordtypes/get?name=dataRecord', { headers: f.headers })).status,
      403
    );
    await f.identities.replaceMemberships('user', String(f.user.id), [f.role.id]);
    assert.equal((await fetch(f.url + '/default/rdmp/api/recordtypes/get', { headers: f.headers })).status, 400);
    await f.identities.update('user', { id: f.user.id }, { loginDisabled: true });
    assert.equal((await fetch(f.url + '/default/rdmp/api/recordtypes', { headers: f.headers })).status, 401);
  });

  it('uses current session identity and refuses an explicit invalid bearer even with a valid cookie', async () => {
    f = await pilotFixture();
    const login = await fetch(f.url + '/__test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
    });
    assert.equal(login.status, 200);
    await login.json();
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0] };
    const url = f.url + '/default/rdmp/api/recordtypes';
    assert.equal((await fetch(url, { headers })).status, 200);
    assert.equal((await fetch(url, { headers: { ...headers, Authorization: 'Bearer invalid' } })).status, 401);
    await f.identities.replaceMemberships('user', String(f.user.id), [f.reader.id]);
    assert.equal((await fetch(url, { headers })).status, 403);
  });

  it('handles Express 5 trailing slashes, HEAD/OPTIONS, encoded paths and malformed/oversize bodies explicitly', async () => {
    f = await pilotFixture();
    const base = f.url + '/default/rdmp/api/recordtypes';
    const head = await fetch(base, { method: 'HEAD', headers: f.headers });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal((await fetch(base, { method: 'HEAD' })).status, 401);
    const options = await fetch(base, { method: 'OPTIONS' });
    assert.equal(options.status, 200);
    assert.equal(options.headers.get('Allow'), 'GET, HEAD');
    assert.equal((await fetch(base + '/', { headers: f.headers })).status, 200);
    assert.equal((await fetch(base, { method: 'POST', headers: f.headers })).status, 404);
    for (const [path, expected] of [
      ['/def%2Fault/rdmp/api/recordtypes', 404],
      ['/def%ZZ/rdmp/api/recordtypes', 400],
    ])
      assert.equal((await fetch(f.url + path, { headers: f.headers })).status, expected);
    const read = sinon.spy(f.recordTypes, 'findByName');
    for (const [body, expected] of [
      ['{"secret-malformed"', 400],
      [JSON.stringify({ secret: 'x'.repeat(1_048_576) }), 413],
    ] as const) {
      const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const client = request(
          base + '/get?name=dataRecord',
          {
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          },
          response => {
            let text = '';
            response.on('data', chunk => {
              text += chunk;
            });
            response.on('end', () => resolve({ status: response.statusCode!, body: text }));
          }
        );
        client.on('error', reject);
        client.end(body);
      });
      assert.equal(response.status, expected);
      assert(!response.body.includes('secret'));
    }
    assert.equal(read.callCount, 0);
  });

  it('isolates same-named definitions by authenticated brand and observes persisted changes immediately', async () => {
    f = await pilotFixture();
    const otherRole = await f.identities.create('role', { name: 'Admin', branding: f.otherBrand.id });
    await f.identities.replaceMemberships('user', String(f.user.id), [f.role.id, otherRole.id]);
    await f.identities.create('pathrule', {
      path: '/:branding/:portal/api(/*)',
      branding: f.otherBrand.id,
      role: otherRole.id,
      can_read: true,
    });
    await firstValueFrom(f.domain.create(f.otherBrand, 'dataRecord', { packageType: 'private' }));
    for (const [brand, packageType] of [
      ['default', 'dataRecord'],
      ['other', 'private'],
    ]) {
      const response = await fetch(f.url + '/' + brand + '/rdmp/api/recordtypes/get?name=dataRecord&branding=other', {
        headers: f.headers,
      });
      assert.equal(response.status, 200);
      assert.equal(Reflect.get((await response.json()) as object, 'packageType'), packageType);
    }
    const row = await f.recordTypes.findByName(f.brand.id, 'dataRecord');
    await f.recordTypes.reviseDefinition(row!.id, { packageType: 'updated' });
    const response = await fetch(f.url + '/default/rdmp/api/recordtypes/get?name=dataRecord', { headers: f.headers });
    assert.equal(Reflect.get((await response.json()) as object, 'packageType'), 'updated');
  });

  it('sanitizes identity, branding, authorization and domain failures without fallback dispatch', async () => {
    f = await pilotFixture();
    const url = f.url + '/default/rdmp/api/recordtypes/get?name=dataRecord';
    const failures = [
      () => sinon.stub(f.identity, 'bearer').rejects(new Error('secret-identity-error')),
      () => sinon.stub(f.branding, 'getBrand').rejects(new Error('secret-brand-error')),
      () => sinon.stub(f.identities, 'list').rejects(new Error('secret-grants-error')),
      () => sinon.stub(f.recordTypes, 'findByName').rejects(new Error('secret-db-connection-string')),
    ];
    for (const fail of failures) {
      const stub = fail();
      for (const version of ['1.0', '2.0']) {
        const response = await fetch(url + '&apiVersion=' + version, { headers: f.headers });
        assert.equal(response.status, 500);
        assert.deepEqual(
          await response.json(),
          version === '2.0'
            ? { errors: [{ detail: 'Internal server error' }], meta: {} }
            : { message: 'Internal server error', details: '' }
        );
      }
      stub.restore();
    }
    sinon.stub(f.recordTypes, 'listForBrand').rejects(new Error('secret-list-error'));
    const response = await fetch(f.url + '/default/rdmp/api/recordtypes', { headers: f.headers });
    assert.equal(response.status, 500);
    assert(!(await response.text()).includes('secret'));
  });

  it('applies route policies before action overrides, failing closed on unsupported/missing bindings', async () => {
    const order: string[] = [];
    f = await pilotFixture({
      routes: recordTypeApiRoutes.map(route => ({ ...route, policy: 'recordroute' })),
      policyBindings: {
        recordroute: (_req, _res, next) => {
          order.push('route');
          next();
        },
      },
      policyConfiguration: {
        '*': false,
        'webservice/RecordTypeController': { '*': [...pilotPolicyChain], getRecordType: false },
      },
    });
    assert.equal((await fetch(f.url + '/default/rdmp/api/recordtypes', { headers: f.headers })).status, 200);
    assert.equal(
      (await fetch(f.url + '/default/rdmp/api/recordtypes/get?name=dataRecord', { headers: f.headers })).status,
      403
    );
    assert.deepEqual(order, ['route', 'route']);
    await assert.rejects(pilotFixture({ policyConfiguration: { '*': 'unbound' } }), /unbound/);
    await assert.rejects(pilotFixture({ routes: [] }), /both supported/);
    await assert.rejects(
      pilotFixture({ routes: recordTypeApiRoutes.map(route => ({ ...route, action: 'legacy' })) }),
      /dispatch/
    );
  });

  for (const failure of ['late-read', 'failed-session-save', 'delayed-session-save'] as const)
    it(`retains final adapter ownership through abort/stop: ${failure}`, async () => {
      const entered = Promise.withResolvers<void>(),
        held = Promise.withResolvers<void>();
      release = held.resolve;
      if (failure !== 'late-read') {
        const original = MongoStore.prototype.set;
        sinon.stub(MongoStore.prototype, 'set').callsFake(function (this: MongoStore, sid, value, callback) {
          entered.resolve();
          void held.promise.then(() =>
            failure === 'failed-session-save'
              ? callback?.(new Error('secret-save-error'))
              : original.call(this, sid, value, callback)
          );
        });
      }
      f = await pilotFixture({
        routes: recordTypeApiRoutes.map(route => ({ ...route, policy: 'writesession' })),
        policyBindings: {
          writesession: (req, _res, next) => {
            req.session.branding = 'untrusted';
            next();
          },
        },
      });
      if (failure === 'late-read') {
        const original = f.recordTypes.findByName.bind(f.recordTypes);
        sinon.stub(f.recordTypes, 'findByName').callsFake(async (...args) => {
          entered.resolve();
          await held.promise;
          return original(...args);
        });
      }
      const client = get(f.url + '/default/rdmp/api/recordtypes/get?name=dataRecord', { headers: f.headers });
      const closed = new Promise<void>(resolve => client.on('error', () => resolve()));
      await entered.promise;
      client.destroy();
      await closed;
      await assert.rejects(f.host.stop({ deadlineMs: 30 }), /deadline/);
      assert(persistenceStatus(f.owner).prismaClients > 0);
      assert(persistenceStatus(f.owner).pools > 0);
      held.resolve();
      await f.host.stop();
      assert.equal(persistenceStatus(f.owner).prismaClients, 0);
      assert.equal(persistenceStatus(f.owner).pools, 0);
      assert.equal(
        await f.native.db().collection('pilotSessions').countDocuments(),
        failure === 'failed-session-save' ? 0 : 1
      );
    });
});
